const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendBrandedEmail, isUnsubscribed } = require('../utils/mailer');
const { buildTemplate, verifyUnsubscribeToken, COMPANY } = require('../utils/email-templates');
const { notifyAdmins, createNotification } = require('../utils/notifications');

async function markLeadContacted(leadId, statusIfNew) {
  if (!leadId) return;
  await pool.query(
    `UPDATE crm_leads
     SET status = CASE WHEN status = 'new' THEN $2 ELSE status END,
         last_contacted_at = now()
     WHERE id = $1`,
    [leadId, statusIfNew || 'contacted']
  );
}

async function handleSendOutreach(req, res) {
  try {
    const {
      lead_id,
      recipient_email,
      owner_name,
      company_name,
      email_type,
      template_key,
      billing_url,
      load_summary,
      also_sms
    } = req.body;

    if (!recipient_email) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    if (await isUnsubscribed(recipient_email)) {
      return res.status(400).json({ error: 'This address is unsubscribed. Do not email them.' });
    }

    let lead = { owner_name, company_name, phone: null, email: recipient_email };
    if (lead_id) {
      const lr = await pool.query('SELECT * FROM crm_leads WHERE id = $1', [lead_id]);
      if (lr.rows.length) lead = { ...lr.rows[0], ...lead };
    }

    const key = template_key || email_type || 'dedicated_manager';
    const tpl = buildTemplate(key, {
      ownerName: owner_name || lead.owner_name,
      companyName: company_name || lead.company_name,
      recipientEmail: recipient_email,
      billingUrl: billing_url,
      loadSummary: load_summary
    });

    const result = await sendBrandedEmail({
      to: recipient_email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      leadId: lead_id,
      sentBy: req.user.id,
      emailType: key,
      templateKey: key
    });

    const isPacket = key === 'onboarding_packet' || key === 'onboarding';
    await markLeadContacted(lead_id, isPacket ? 'packet_sent' : 'contacted');

    let sms = null;
    if (also_sms && lead.phone) {
      try {
        const voip = require('./voip');
        if (typeof voip.sendTemplatedSms === 'function') {
          sms = await voip.sendTemplatedSms({
            lead_id,
            to_number: lead.phone,
            template_key: key,
            company_name: lead.company_name,
            user: req.user,
            load_summary
          });
        }
      } catch (smsErr) {
        sms = { error: smsErr.message };
      }
    }

    res.json({
      ok: true,
      message: result.skipped
        ? `Skipped: ${result.reason}`
        : `Email sent to ${recipient_email}`,
      email: result,
      sms
    });
  } catch (err) {
    console.error('Error sending outreach email:', err);
    res.status(500).json({ error: err.message || 'Failed to send outreach email' });
  }
}

router.post('/send-outreach', requireAuth, handleSendOutreach);

router.post('/onboarding-packet', requireAuth, (req, res) => {
  req.body.template_key = req.body.template_key || 'onboarding';
  req.body.lead_id = req.body.lead_id || req.body.leadId;
  req.body.recipient_email = req.body.recipient_email || req.body.email;
  return handleSendOutreach(req, res);
});

// GET /api/email/logs
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.name as sender_name
       FROM email_logs e
       LEFT JOIN users u ON e.sent_by = u.id
       ORDER BY e.sent_at DESC
       LIMIT 100`
    );
    res.json({ email_logs: result.rows });
  } catch (err) {
    console.error('Error fetching email logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/email/inbox — inbound replies for admin / sales
router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const unreadOnly = req.query.unread === '1';
    const result = await pool.query(
      `SELECT i.*, l.company_name, l.owner_name, l.phone, l.mc_number, l.sales_rep_id,
              u.name AS sales_rep_name
       FROM email_inbound i
       LEFT JOIN crm_leads l ON l.id = i.lead_id
       LEFT JOIN users u ON u.id = l.sales_rep_id
       ${unreadOnly ? 'WHERE i.is_read = FALSE' : ''}
       ORDER BY i.created_at DESC
       LIMIT 150`
    );
    const unread = await pool.query(`SELECT COUNT(*) FROM email_inbound WHERE is_read = FALSE`);
    res.json({ messages: result.rows, unread: parseInt(unread.rows[0].count, 10) });
  } catch (err) {
    console.error('Inbox fetch error:', err);
    res.status(500).json({ error: 'Could not load inbox. Apply v3 growth schema first.' });
  }
});

router.post('/inbox/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE email_inbound SET is_read = TRUE WHERE id = $1', [req.params.id]);
    const row = await pool.query('SELECT lead_id FROM email_inbound WHERE id = $1', [req.params.id]);
    if (row.rows[0] && row.rows[0].lead_id) {
      await pool.query(
        `UPDATE crm_leads SET unread_replies = GREATEST(COALESCE(unread_replies,0) - 1, 0) WHERE id = $1`,
        [row.rows[0].lead_id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not mark read' });
  }
});

function extractLeadIdFromAddress(toEmail) {
  const m = String(toEmail || '').match(/replies\+(\d+)@/i);
  return m ? parseInt(m[1], 10) : null;
}

async function ingestInbound({ fromEmail, toEmail, subject, bodyText, bodyHtml, resendId }) {
  const from = String(fromEmail || '').trim().toLowerCase();
  if (!from) return { ok: false, error: 'missing from' };

  let leadId = extractLeadIdFromAddress(toEmail);
  if (!leadId) {
    const match = await pool.query(
      `SELECT id, sales_rep_id, company_name FROM crm_leads WHERE lower(email) = $1 ORDER BY last_contacted_at DESC NULLS LAST LIMIT 1`,
      [from]
    );
    if (match.rows.length) leadId = match.rows[0].id;
  }

  const ins = await pool.query(
    `INSERT INTO email_inbound (lead_id, from_email, to_email, subject, body_text, body_html, resend_email_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [leadId, from, toEmail || '', subject || '(no subject)', bodyText || '', bodyHtml || '', resendId || null]
  );

  if (leadId) {
    await pool.query(
      `UPDATE crm_leads
       SET last_reply_at = now(),
           unread_replies = COALESCE(unread_replies,0) + 1,
           status = CASE WHEN status IN ('new','contacted','packet_sent') THEN 'interested' ELSE status END
       WHERE id = $1`,
      [leadId]
    );
    const lead = (await pool.query('SELECT company_name, sales_rep_id FROM crm_leads WHERE id = $1', [leadId])).rows[0];
    const title = `Carrier replied: ${lead ? lead.company_name : from}`;
    const msg = `${from} — ${(subject || '').slice(0, 120)}`;
    await notifyAdmins(title, msg, 'success', '/inbox.html');
    if (lead && lead.sales_rep_id) {
      await createNotification(lead.sales_rep_id, title, msg, 'success', '/inbox.html');
    }
    try {
      await pool.query(`UPDATE email_logs SET reply_received = TRUE WHERE lead_id = $1`, [leadId]);
    } catch {
      // column may not exist yet
    }
  } else {
    await notifyAdmins(`Unmatched inbound email from ${from}`, (subject || '').slice(0, 140), 'warning', '/inbox.html');
  }

  return { ok: true, inbound: ins.rows[0], lead_id: leadId };
}

// POST /api/email/inbound — Resend inbound / generic webhook (no auth; verify secret)
router.post('/inbound', async (req, res) => {
  const secret = process.env.RESEND_INBOUND_SECRET || process.env.INBOUND_WEBHOOK_SECRET;
  if (secret) {
    const hdr = req.headers['x-inbound-secret'] || req.headers['x-webhook-secret'] || req.query.secret;
    if (hdr !== secret) return res.status(401).json({ error: 'Invalid inbound secret' });
  }

  try {
    const data = req.body.data || req.body;
    const fromEmail = data.from || data.from_email || (data.from && data.from.address) ||
      (Array.isArray(data.from) ? data.from[0] : null) ||
      (data.email && data.email.from);
    const toEmail = data.to || data.to_email || (Array.isArray(data.to) ? data.to[0] : '') || '';
    const subject = data.subject || '';
    const bodyText = data.text || data.body_text || data.text_body || '';
    const bodyHtml = data.html || data.body_html || data.html_body || '';
    const resendId = data.email_id || data.id || null;

    const fromStr = typeof fromEmail === 'object' ? (fromEmail.address || fromEmail.email || '') : fromEmail;
    const toStr = typeof toEmail === 'object' ? (toEmail.address || toEmail.email || '') : toEmail;

    const result = await ingestInbound({
      fromEmail: fromStr,
      toEmail: toStr,
      subject,
      bodyText,
      bodyHtml,
      resendId
    });
    res.json(result);
  } catch (err) {
    console.error('Inbound email error:', err);
    res.status(500).json({ error: 'Failed to ingest inbound email' });
  }
});

// Public unsubscribe
router.get('/unsubscribe', async (req, res) => {
  const token = req.query.t || req.query.token;
  const email = verifyUnsubscribeToken(token) || (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Invalid unsubscribe link' });
  try {
    await pool.query(
      `INSERT INTO unsubscribes (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email]
    );
    res.json({ ok: true, email, message: 'You have been unsubscribed.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not unsubscribe' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const token = req.body.t || req.body.token || req.query.t;
  const email = verifyUnsubscribeToken(token) || (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Invalid unsubscribe' });
  try {
    await pool.query(
      `INSERT INTO unsubscribes (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      [email, req.body.reason || 'one-click']
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not unsubscribe' });
  }
});

module.exports = router;
module.exports.ingestInbound = ingestInbound;
