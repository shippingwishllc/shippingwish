const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const staffOnly = requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep');
const { SMS_TEMPLATES } = require('../utils/email-templates');
const {
  normalizePhone,
  appendLegalFooter,
  isStopKeyword,
  isStartKeyword,
  isHelpKeyword,
  helpReply,
  stopConfirmReply,
  startConfirmReply
} = require('../utils/sms');
const { notifyAdmins, createNotification } = require('../utils/notifications');
const { logSmsMessage, findLeadByPhone, OUR_NUMBER } = require('../utils/sms-inbox');

async function isSmsOptedOut(phone) {
  const n = normalizePhone(phone);
  if (!n) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM sms_optouts WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g') LIMIT 1`,
      [n]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function addSmsOptOut(phone, reason) {
  const n = normalizePhone(phone);
  if (!n) return;
  await pool.query(
    `INSERT INTO sms_optouts (phone, reason) VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET reason = EXCLUDED.reason`,
    [n, reason || 'STOP']
  );
}

async function removeSmsOptOut(phone) {
  const n = normalizePhone(phone);
  if (!n) return;
  await pool.query(`DELETE FROM sms_optouts WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')`, [n]);
}

async function sendTwilioSms(toNumber, message) {
  const to = normalizePhone(toNumber) || toNumber;
  if (await isSmsOptedOut(to)) {
    return { status: 'opted_out', sid: null };
  }
  const body = appendLegalFooter(message);
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return { status: 'logged', sid: null, body };
  }
  const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const payload = {
    to,
    body
  };
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  } else {
    payload.from = process.env.TWILIO_FROM_NUMBER || '+16094696004';
  }
  const twilioMsg = await twilio.messages.create(payload);
  return { status: 'sent', sid: twilioMsg.sid, body };
}

async function sendTemplatedSms({ lead_id, to_number, template_key, company_name, user, load_summary }) {
  const key = template_key || 'dedicated_manager';
  const builder = SMS_TEMPLATES[key] || SMS_TEMPLATES.dedicated_manager;
  const message = builder({ companyName: company_name, loadSummary: load_summary });
  let smsStatus = 'logged';
  let twilioSid = null;
  let bodySent = message;
  try {
    const sent = await sendTwilioSms(to_number, message);
    smsStatus = sent.status;
    twilioSid = sent.sid;
    bodySent = sent.body || message;

    if (smsStatus === 'sent' || smsStatus === 'logged') {
      await logSmsMessage({
        direction: 'outbound',
        from_number: OUR_NUMBER,
        to_number,
        body: bodySent,
        lead_id: lead_id || null,
        sent_by: user && user.id,
        twilio_sid: twilioSid,
        disposition: smsStatus,
        is_read: true
      });
    }
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
     `SMS: ${bodySent}${twilioSid ? ' | Twilio SID: ' + twilioSid : ''}`]
  );

  try {
    await pool.query(
      `INSERT INTO outreach_sends (lead_id, channel, template_key, recipient, subject, body_preview, provider_id, status, sent_by)
       VALUES ($1, 'sms', $2, $3, $4, $5, $6, $7, $8)`,
      [lead_id || null, key, to_number, 'SMS', (bodySent || message).slice(0, 280), twilioSid, smsStatus, user && user.id]
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
    message: smsStatus === 'sent'
      ? `SMS sent via Twilio to ${to_number}`
      : smsStatus === 'opted_out'
        ? 'This number replied STOP. Do not text them.'
        : `SMS logged (${smsStatus})`,
    status: smsStatus,
    twilio_sid: twilioSid,
    sms_log: result.rows[0],
    body: bodySent
  };
}

// POST /api/voip/click-to-call - Trigger 1-Click OpenPhone / MightyCall Call
router.post('/click-to-call', requireAuth, staffOnly, async (req, res) => {
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
router.post('/send-sms', requireAuth, staffOnly, async (req, res) => {
  try {
    const { lead_id, to_number, message, provider } = req.body;

    if (!to_number || !message) {
      return res.status(400).json({ error: 'Target phone number and SMS text are required' });
    }

    const voipProvider = provider || 'Twilio';
    let smsStatus = 'logged';
    let twilioSid = null;
    let bodySent = message;

    try {
      const sent = await sendTwilioSms(to_number, message);
      smsStatus = sent.status;
      twilioSid = sent.sid;
      bodySent = sent.body || message;
      if (smsStatus === 'sent' || smsStatus === 'logged') {
        await logSmsMessage({
          direction: 'outbound',
          from_number: OUR_NUMBER,
          to_number,
          body: bodySent,
          lead_id: lead_id || null,
          sent_by: req.user.id,
          twilio_sid: twilioSid,
          disposition: smsStatus,
          is_read: true
        });
      }
      if (smsStatus === 'logged') {
        console.log('[DEV] Twilio not configured — SMS logged only:', { to_number, body: bodySent });
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
       `SMS: ${bodySent}${twilioSid ? ' | Twilio SID: ' + twilioSid : ''}`]
    );

    const statusMessage = smsStatus === 'sent'
      ? `SMS sent via Twilio to ${to_number}`
      : smsStatus === 'opted_out'
        ? 'This number replied STOP. Do not text them.'
        : `SMS logged (Twilio not configured)`;

    res.json({
      message: statusMessage,
      status: smsStatus,
      twilio_sid: twilioSid,
      sms_log: result.rows[0],
      body: bodySent
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

router.post('/send-template-sms', requireAuth, staffOnly, async (req, res) => {
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

function twiml(message) {
  const safe = String(message || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

// ALL /api/voip/twilio-inbound — Twilio "A message comes in" webhook (handles both POST form-encoded and GET)
router.all('/twilio-inbound', async (req, res) => {
  try {
    const from = req.body?.From || req.body?.from || req.query?.From || req.query?.from || '';
    const body = req.body?.Body || req.body?.body || req.query?.Body || req.query?.body || '';
    const to = req.body?.To || req.body?.to || req.query?.To || req.query?.to || '';
    if (!from) return res.status(400).type('text/plain').send('Missing From');

    let reply = helpReply();
    let disposition = 'inbound';

    if (isStopKeyword(body)) {
      await addSmsOptOut(from, 'STOP');
      disposition = 'opt_out';
      reply = stopConfirmReply();
    } else if (isStartKeyword(body)) {
      await removeSmsOptOut(from);
      disposition = 'opt_in';
      reply = startConfirmReply();
      try {
        await pool.query(
          `UPDATE crm_leads SET sms_opt_in = TRUE,
             status = CASE WHEN status IN ('new','contacted','packet_sent') THEN 'interested' ELSE status END
           WHERE regexp_replace(phone, '\\D', '', 'g') LIKE '%' || right(regexp_replace($1, '\\D', '', 'g'), 10)`,
          [from]
        );
      } catch { /* ignore */ }
    } else if (isHelpKeyword(body)) {
      disposition = 'help';
      reply = helpReply();
    } else {
      const textBody = String(body).trim();
      const yesMatch = textBody.match(/^(yes|ok|accept)\s*(\d+)?$/i);
      let offerApproved = null;

      if (yesMatch) {
        const offerId = yesMatch[2] ? parseInt(yesMatch[2], 10) : null;
        try {
          let offerRes;
          if (offerId) {
            offerRes = await pool.query('SELECT * FROM load_offers WHERE id = $1 AND driver_approval_status = \'pending\'', [offerId]);
          } else {
            // Find most recent pending offer for this phone / carrier
            offerRes = await pool.query(
              `SELECT o.* FROM load_offers o
               JOIN users u ON u.id = o.carrier_id
               WHERE regexp_replace(u.phone, '\\D', '', 'g') LIKE '%' || right(regexp_replace($1, '\\D', '', 'g'), 10)
                 AND o.driver_approval_status = 'pending'
               ORDER BY o.created_at DESC LIMIT 1`,
              [from]
            );
          }

          if (offerRes.rows.length) {
            offerApproved = offerRes.rows[0];
            const offer = offerApproved;
            await pool.query(
              `UPDATE load_offers SET status = 'accepted', driver_approval_status = 'approved', broker_negotiation_status = 'bidding' WHERE id = $1`,
              [offer.id]
            );

            await pool.query(
              `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
               VALUES ($1, 'driver_approved', 'driver', $2, $3, $4)`,
              [offer.id, `Driver approved offer #${offer.id} via SMS reply: "${textBody}"`, offer.rate, offer.rpm]
            );

            // Trigger AI broker bidding email
            const targetBid = (parseFloat(offer.rate) + 150).toFixed(2);
            await pool.query(
              `UPDATE load_offers SET initial_bid_rate = $1 WHERE id = $2`,
              [targetBid, offer.id]
            );

            const { sendBrandedEmail } = require('../utils/mailer');
            const carrierRes = await pool.query('SELECT * FROM users WHERE id = $1', [offer.carrier_id]);
            const carrier = carrierRes.rows[0] || {};
            const carrierCompany = carrier.company_name || carrier.name || 'Motor Carrier';
            const carrierMc = carrier.mc_number || '149201';

            const emailSubject = `Rate Inquiry & Load Booking: ${offer.pickup_location} ➔ ${offer.delivery_location} (${offer.equipment_type}) — MC# ${carrierMc}`;
            const emailBodyText = `Hi ${offer.broker_name} Dispatch,\n\n` +
              `Shipping Wish LLC is bidding on behalf of ${carrierCompany} (MC# ${carrierMc}).\n\n` +
              `Load Details:\n` +
              `• Lane: ${offer.pickup_location} ➔ ${offer.delivery_location}\n` +
              `• Equipment: ${offer.equipment_type}\n` +
              `• Distance: ${offer.miles} miles\n` +
              `• Requested Rate: $${targetBid} ($${(targetBid / offer.miles).toFixed(2)}/mile)\n\n` +
              `Our truck is empty and ready for immediate dispatch. Please confirm rate and send Rate Confirmation to dispatch@shippingwish.com.\n\n` +
              `Best regards,\nShipping Wish Autonomous Dispatch Engine\nhttps://www.shippingwish.com`;

            try {
              await sendBrandedEmail({
                to: offer.broker_email || 'dispatch@broker.com',
                subject: emailSubject,
                text: emailBodyText,
                html: `<pre style="font-family:sans-serif;font-size:14px;">${emailBodyText}</pre>`,
                emailType: 'broker_bid'
              });
            } catch (e) {
              console.warn('Inbound SMS broker bid email notice:', e.message);
            }

            await pool.query(
              `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
               VALUES ($1, 'broker_bid_sent', 'ai_bot', $2, $3, $4)`,
              [offer.id, `AI dispatched official rate inquiry email to ${offer.broker_name} (${offer.broker_email}) requesting $${targetBid}`, targetBid, (targetBid / offer.miles).toFixed(2)]
            );

            reply = `${COMPANY.name}: Load offer #${offer.id} (${offer.pickup_location} ➔ ${offer.delivery_location}) APPROVED! AI has emailed ${offer.broker_name} requesting $${targetBid}. We will notify you once deal is locked!`;
            disposition = 'driver_load_approval';
          }
        } catch (err) {
          console.warn('Driver SMS approval processing error:', err.message);
        }
      }

      if (!offerApproved) {
        disposition = 'inbound_reply';
        reply = helpReply();
      }

      const lead = await findLeadByPhone(from);
      if (lead) {
        const title = `SMS from ${lead.company_name || from}`;
        const msg = String(body).slice(0, 180);
        await notifyAdmins(title, msg, 'success', '/sms-inbox?phone=' + encodeURIComponent(from));
        if (lead.sales_rep_id) {
          await createNotification(lead.sales_rep_id, title, msg, 'success', '/sms-inbox?phone=' + encodeURIComponent(from));
        }
      } else {
        await notifyAdmins(`SMS from ${from}`, String(body).slice(0, 180), 'success', '/sms-inbox');
      }
    }

    const leadForLog = await findLeadByPhone(from);
    await logSmsMessage({
      direction: 'inbound',
      from_number: from,
      to_number: to || OUR_NUMBER,
      body: String(body).slice(0, 1600),
      lead_id: leadForLog?.id || null,
      disposition,
      is_read: false
    });

    await pool.query(
      `INSERT INTO voip_call_logs (
        voip_provider, call_type, from_number, to_number, disposition, notes
      ) VALUES ('Twilio', 'inbound_sms', $1, $2, $3, $4)`,
      [from, to, disposition, String(body).slice(0, 500)]
    );

    res.type('text/xml').send(twiml(reply));
  } catch (err) {
    console.error('Twilio inbound error:', err);
    res.status(500).type('text/plain').send('error');
  }
});

module.exports = router;
module.exports.sendTemplatedSms = sendTemplatedSms;
module.exports.sendTwilioSms = sendTwilioSms;
