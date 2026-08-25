const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { SMS_TEMPLATES } = require('../utils/email-templates');

async function sendTwilioSms(toNumber, message) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return { status: 'logged', sid: null };
  }
  const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const twilioMsg = await twilio.messages.create({
    from: process.env.TWILIO_FROM_NUMBER || '+19177370021',
    to: toNumber,
    body: message
  });
  return { status: 'sent', sid: twilioMsg.sid };
}

async function sendTemplatedSms({ lead_id, to_number, template_key, company_name, user, load_summary }) {
  const key = template_key || 'dedicated_manager';
  const builder = SMS_TEMPLATES[key] || SMS_TEMPLATES.dedicated_manager;
  const message = builder({ companyName: company_name, loadSummary: load_summary });
  let smsStatus = 'logged';
  let twilioSid = null;
  try {
    const sent = await sendTwilioSms(to_number, message);
    smsStatus = sent.status;
    twilioSid = sent.sid;
  } catch (twilioErr) {
    console.error('Twilio SMS error:', twilioErr.message);
    smsStatus = 'twilio_error';
  }

  const result = await pool.query(
    `INSERT INTO voip_call_logs (
      lead_id, sales_rep_id, voip_provider, call_type, to_number, disposition, notes
    ) VALUES ($1, $2, 'Twilio', 'sms', $3, $4, $5)
    RETURNING *`,
    [lead_id || null, user && user.id, to_number, smsStatus,
     `SMS: ${message}${twilioSid ? ' | Twilio SID: ' + twilioSid : ''}`]
  );

  try {
    await pool.query(
      `INSERT INTO outreach_sends (lead_id, channel, template_key, recipient, subject, body_preview, provider_id, status, sent_by)
       VALUES ($1, 'sms', $2, $3, $4, $5, $6, $7, $8)`,
      [lead_id || null, key, to_number, 'SMS', message.slice(0, 280), twilioSid, smsStatus, user && user.id]
    );
  } catch {
    // schema may not be applied yet
  }

  if (lead_id) {
    await pool.query(
      `UPDATE crm_leads SET last_contacted_at = now(), status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END WHERE id = $1`,
      [lead_id]
    );
  }

  return {
    message: smsStatus === 'sent' ? `SMS sent via Twilio to ${to_number}` : `SMS logged (${smsStatus})`,
    status: smsStatus,
    twilio_sid: twilioSid,
    sms_log: result.rows[0],
    body: message
  };
}

// POST /api/voip/click-to-call - Trigger 1-Click OpenPhone / MightyCall Call
router.post('/click-to-call', requireAuth, async (req, res) => {
  try {
    const { lead_id, to_number, provider } = req.body;

    if (!to_number) {
      return res.status(400).json({ error: 'Target phone number is required' });
    }

    const voipProvider = provider || process.env.VOIP_PROVIDER || 'OpenPhone';

    // Log call attempt in DB
    const result = await pool.query(
      `INSERT INTO voip_call_logs (
        lead_id, sales_rep_id, voip_provider, call_type, to_number, disposition, notes
      ) VALUES ($1, $2, $3, 'outbound_call', $4, 'initiated', $5)
      RETURNING *`,
      [lead_id || null, req.user.id, voipProvider, to_number, `Outbound call initiated by ${req.user.name}`]
    );

    // Update lead last_contacted_at
    if (lead_id) {
      await pool.query(
        `UPDATE crm_leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, last_contacted_at = now() WHERE id = $1`,
        [lead_id]
      );
    }

    // OpenPhone / MightyCall deep link protocol
    const callUrl = voipProvider.toLowerCase().includes('mighty')
      ? `mightycall://call?number=${encodeURIComponent(to_number)}`
      : `openphone://call?number=${encodeURIComponent(to_number)}`;

    res.json({
      message: `Call initiated via ${voipProvider}`,
      call_url: callUrl,
      call_log: result.rows[0]
    });
  } catch (err) {
    console.error('Error initiating VOIP call:', err);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// POST /api/voip/send-sms - Trigger 1-Click SMS (via Twilio when configured, else log only)
router.post('/send-sms', requireAuth, async (req, res) => {
  try {
    const { lead_id, to_number, message, provider } = req.body;

    if (!to_number || !message) {
      return res.status(400).json({ error: 'Target phone number and SMS text are required' });
    }

    const voipProvider = provider || 'Twilio';
    let smsStatus = 'logged';
    let twilioSid = null;

    try {
      const sent = await sendTwilioSms(to_number, message);
      smsStatus = sent.status;
      twilioSid = sent.sid;
      if (smsStatus === 'logged') {
        console.log('[DEV] Twilio not configured — SMS logged only:', { to_number, message });
      }
    } catch (twilioErr) {
      console.error('Twilio SMS error:', twilioErr.message);
      smsStatus = 'twilio_error';
    }

    const result = await pool.query(
      `INSERT INTO voip_call_logs (
        lead_id, sales_rep_id, voip_provider, call_type, to_number, disposition, notes
      ) VALUES ($1, $2, $3, 'sms', $4, $5, $6)
      RETURNING *`,
      [lead_id || null, req.user.id, voipProvider, to_number, smsStatus,
       `SMS: ${message}${twilioSid ? ' | Twilio SID: ' + twilioSid : ''}`]
    );

    res.json({
      message: smsStatus === 'sent' ? `SMS sent via Twilio to ${to_number}` : `SMS logged (Twilio not configured)`,
      status: smsStatus,
      twilio_sid: twilioSid,
      sms_log: result.rows[0]
    });
  } catch (err) {
    console.error('Error sending SMS:', err);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// POST /api/voip/webhook - Receive OpenPhone / MightyCall Webhook Events
router.post('/webhook', async (req, res) => {
  try {
    const { event, call_id, from, to, duration, recording_url } = req.body;
    console.log('VOIP Webhook event received:', event, req.body);

    if (to) {
      await pool.query(
        `INSERT INTO voip_call_logs (
          voip_provider, call_type, from_number, to_number, duration_seconds, recording_url, disposition
        ) VALUES ('Webhook', 'incoming_webhook', $1, $2, $3, $4, 'completed')`,
        [from || '', to, duration || 0, recording_url || '']
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error processing VOIP webhook:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// GET /api/voip/logs - Get VOIP Call History
router.get('/logs', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT v.*, u.name as sales_rep_name, l.company_name
      FROM voip_call_logs v
      LEFT JOIN users u ON v.sales_rep_id = u.id
      LEFT JOIN crm_leads l ON v.lead_id = l.id
    `;
    const params = [];

    if (req.user.role === 'sales_rep') {
      query += ` WHERE v.sales_rep_id = $1`;
      params.push(req.user.id);
    }

    query += ` ORDER BY v.created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);
    res.json({ call_logs: result.rows });
  } catch (err) {
    console.error('Error fetching VOIP logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/send-template-sms', requireAuth, async (req, res) => {
  try {
    const { lead_id, to_number, template_key, company_name, load_summary } = req.body;
    if (!to_number) return res.status(400).json({ error: 'Phone number is required' });
    const result = await sendTemplatedSms({
      lead_id,
      to_number,
      template_key,
      company_name,
      load_summary,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    console.error('Template SMS error:', err);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

module.exports = router;
module.exports.sendTemplatedSms = sendTemplatedSms;
