/**
 * Shared CRM outreach: CAN-SPAM email, consent-gated SMS, Vapi AI calls.
 * Cold SMS / AI voice are blocked unless the number already opted in or staff
 * confirms prior consent on a selected row.
 */
const pool = require('../db');
const { sanitizeEmail } = require('./email-valid');
const { sendBrandedEmail } = require('./mailer');
const { buildTemplate } = require('./email-templates');
const { isPhoneOptedOut, phoneTail, logSmsMessage, OUR_NUMBER } = require('./sms-inbox');
const { isWithinTcpaHours } = require('./us-timezones');
const desk = require('./crm-ai-desk');

const EMAIL_CAP = 15;
const SMS_CAP = 10;
const VAPI_CAP = 5;

async function ensureSmsOptInColumn() {
  await pool.query(
    `ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT FALSE`
  ).catch(() => {});
}

async function hasSmsConsent(phone, lead) {
  if (lead && (lead.sms_opt_in === true || lead.sms_opt_in === 't')) return true;
  const tail = phoneTail(phone);
  if (!tail || tail.length < 10) return false;
  try {
    const dispatch = await pool.query(
      `SELECT id FROM ai_dispatch_carriers
       WHERE sms_consent = TRUE
         AND right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = $1
       LIMIT 1`,
      [tail]
    );
    if (dispatch.rows.length) return true;
    const crm = await pool.query(
      `SELECT id FROM crm_leads
       WHERE sms_opt_in = TRUE
         AND right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = $1
       LIMIT 1`,
      [tail]
    );
    return crm.rows.length > 0;
  } catch {
    return false;
  }
}

async function recordPriorConsent(leadId) {
  if (!leadId) return;
  await ensureSmsOptInColumn();
  await pool.query(`UPDATE crm_leads SET sms_opt_in = TRUE WHERE id = $1`, [leadId]).catch(() => {});
}

function usablePhone(phone) {
  const tail = phoneTail(phone);
  return tail && tail.length >= 10 && String(phone).toLowerCase() !== 'unknown' ? tail : '';
}

async function sendLeadEmail(lead, user, templateKey) {
  const to = sanitizeEmail(lead.email);
  if (!to) return { ok: false, reason: 'No valid email on this row' };
  const tpl = buildTemplate(templateKey || 'dedicated_manager', {
    ownerName: lead.owner_name || 'there',
    companyName: lead.company_name,
    recipientEmail: to
  });
  const result = await sendBrandedEmail({
    to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    leadId: lead.id,
    sentBy: user && user.id,
    emailType: 'crm_outreach',
    templateKey: templateKey || 'dedicated_manager'
  });
  if (result && result.skipped) return { ok: false, reason: 'Unsubscribed' };
  await pool.query(
    `UPDATE crm_leads SET last_contacted_at = now(),
       status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
     WHERE id = $1`,
    [lead.id]
  ).catch(() => {});
  const loggedOnly = result && result.status === 'logged_no_resend_key';
  return {
    ok: true,
    logged_only: !!loggedOnly,
    message: loggedOnly
      ? `Email logged (RESEND_API_KEY missing) for ${to}`
      : `Email sent to ${to}`
  };
}

async function sendLeadSms(lead, user, opts = {}) {
  const phone = lead.phone;
  if (!usablePhone(phone)) return { ok: false, reason: 'No usable phone' };
  if (await isPhoneOptedOut(phone)) return { ok: false, reason: 'STOP on file' };
  const consented = (await hasSmsConsent(phone, lead)) || opts.consentConfirmed === true;
  if (!consented) {
    return {
      ok: false,
      reason: 'No SMS consent. Check “they already agreed” on selected rows, or email first and wait for YES.'
    };
  }
  const tcpa = isWithinTcpaHours(phone, lead.phy_state || lead.target_lanes || lead.state);
  if (!tcpa.allowed) {
    return { ok: false, reason: tcpa.reason || 'Outside 9am–5pm local hours' };
  }
  if (opts.consentConfirmed === true) await recordPriorConsent(lead.id);

  const owner = lead.owner_name || 'there';
  const company = lead.company_name || 'your fleet';
  const body = String(opts.customMessage || '').trim()
    || `Hi ${owner}, Shipping Wish LLC emailed a one-pager about a named ops manager for ${company}. Reply YES if useful, STOP to opt out.`;

  const { sendTwilioSms } = require('../routes/voip');
  const smsRes = await sendTwilioSms(phone, body);
  if (smsRes && smsRes.status === 'opted_out') return { ok: false, reason: 'STOP on file' };
  await logSmsMessage({
    direction: 'outbound',
    from_number: OUR_NUMBER,
    to_number: phone,
    body: smsRes.body || body,
    lead_id: lead.id,
    sent_by: user && user.id,
    twilio_sid: smsRes.sid,
    disposition: smsRes.status,
    is_read: true
  }).catch(() => {});
  await pool.query(
    `UPDATE crm_leads SET last_contacted_at = now(),
       status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
     WHERE id = $1`,
    [lead.id]
  ).catch(() => {});
  const sent = smsRes && (smsRes.status === 'sent' || smsRes.status === 'logged');
  return {
    ok: !!sent,
    logged_only: smsRes && smsRes.status === 'logged',
    reason: sent ? null : (smsRes && smsRes.status) || 'SMS failed',
    message: smsRes && smsRes.status === 'sent'
      ? `SMS sent to ${phone}`
      : smsRes && smsRes.status === 'logged'
        ? `SMS logged (Twilio not configured) for ${phone}`
        : `SMS ${smsRes && smsRes.status}`
  };
}

async function sendLeadVapi(lead, user, opts = {}) {
  const phone = lead.phone;
  if (!usablePhone(phone)) return { ok: false, reason: 'No usable phone' };
  if (opts.consentConfirmed !== true && !(await hasSmsConsent(phone, lead))) {
    return {
      ok: false,
      reason: 'AI call needs prior consent. Check “they already agreed” on the selected row.'
    };
  }
  const state = String(lead.phy_state || lead.target_lanes || lead.state || 'US').slice(0, 2).toUpperCase();
  const tcpa = isWithinTcpaHours(phone, state);
  if (!tcpa.allowed) {
    return { ok: false, reason: tcpa.reason || 'Outside 9am–5pm local hours' };
  }
  if (opts.consentConfirmed === true) await recordPriorConsent(lead.id);

  const vapiApiKey = String(process.env.VAPI_API_KEY || '').trim();
  const vapiPhoneId = String(process.env.VAPI_PHONE_NUMBER_ID || '').trim();
  const company = lead.company_name || 'your fleet';
  const name = lead.owner_name || 'Fleet Manager';

  if (!vapiApiKey) {
    return {
      ok: true,
      logged_only: true,
      provider: 'standby',
      message: `VAPI_API_KEY is not set. Call payload ready for ${name} (${phone}). Add the key to place the live AI call.`
    };
  }

  const assistant = desk.vapiAssistant(lead);
  const vapiPayload = {
    name: `CRM AI Call to ${name} (${company})`,
    phoneNumberId: vapiPhoneId || undefined,
    customer: { number: phone, name },
    assistant
  };

  const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vapiApiKey}`
    },
    body: JSON.stringify(vapiPayload)
  });
  const vapiData = await vapiRes.json().catch(() => ({}));
  if (!vapiRes.ok) {
    return { ok: false, reason: vapiData.message || `Vapi error ${vapiRes.status}` };
  }

  await pool.query(
    `INSERT INTO ai_dispatch_calls (
      call_sid, driver_name, driver_phone, carrier_name, trigger_type, call_status, audio_hash
    ) VALUES ($1, $2, $3, $4, $5, 'INITIATED', $6)
    ON CONFLICT (call_sid) DO NOTHING`,
    [
      vapiData.id || `vapi-${Date.now()}`,
      name,
      phone,
      company,
      'AI_OUTBOUND_CRM',
      `vapi-crm-${Date.now()}`
    ]
  ).catch(() => {});

  await pool.query(
    `UPDATE crm_leads SET last_contacted_at = now(),
       status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
     WHERE id = $1`,
    [lead.id]
  ).catch(() => {});

  return {
    ok: true,
    provider: 'vapi',
    call_id: vapiData.id,
    message: `Vapi call started to ${name} (${phone})`
  };
}

async function sendLeadVoip(lead, user) {
  const phone = lead.phone;
  if (!usablePhone(phone)) return { ok: false, reason: 'No usable phone' };
  const voipProvider = process.env.VOIP_PROVIDER || 'OpenPhone';
  await pool.query(
    `INSERT INTO voip_call_logs (
      lead_id, sales_rep_id, voip_provider, call_type, to_number, disposition, notes
    ) VALUES ($1, $2, $3, 'outbound_call', $4, 'initiated', $5)`,
    [lead.id, user && user.id, voipProvider, phone, `Click-to-call by ${(user && user.name) || 'staff'}`]
  ).catch(() => {});
  const callUrl = String(voipProvider).toLowerCase().includes('mighty')
    ? `mightycall://call?number=${encodeURIComponent(phone)}`
    : `openphone://call?number=${encodeURIComponent(phone)}`;
  const tel = 'tel:' + String(phone).replace(/[^\d+]/g, '');
  return { ok: true, call_url: callUrl, tel, message: `Open ${voipProvider} or dial ${phone}` };
}

async function sendLeadPacket(lead, user) {
  const to = sanitizeEmail(lead.email);
  if (!to) return { ok: false, reason: 'No valid email on this row' };
  const tpl = buildTemplate('onboarding', {
    ownerName: lead.owner_name || 'there',
    companyName: lead.company_name,
    recipientEmail: to
  });
  const fs = require('fs');
  const path = require('path');
  const attachments = [];
  const packetPath = path.join(__dirname, '../public/downloads/Shipping-Wish-Carrier-Onboarding-Packet.pdf');
  if (fs.existsSync(packetPath)) {
    attachments.push({
      filename: 'Shipping-Wish-Carrier-Onboarding-Packet.pdf',
      content: fs.readFileSync(packetPath)
    });
  }
  const result = await sendBrandedEmail({
    to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    leadId: lead.id,
    sentBy: user && user.id,
    emailType: 'crm_packet',
    templateKey: 'onboarding',
    attachments
  });
  if (result && result.skipped) return { ok: false, reason: 'Unsubscribed' };
  await pool.query(
    `UPDATE crm_leads SET last_contacted_at = now(),
       status = CASE WHEN status = 'new' THEN 'packet_sent' ELSE status END
     WHERE id = $1`,
    [lead.id]
  ).catch(() => {});
  return { ok: true, message: `Onboarding packet emailed to ${to}` };
}

async function loadLeadsByIds(ids, user) {
  const clean = [...new Set((ids || []).map(Number).filter(Boolean))].slice(0, 50);
  if (!clean.length) return [];
  await ensureSmsOptInColumn();
  const params = [clean];
  let extra = '';
  if (user && user.role === 'sales_rep') {
    params.push(user.id);
    extra = ` AND (l.sales_rep_id = $2 OR l.sales_rep_id IS NULL)`;
  }
  const result = await pool.query(
    `SELECT l.* FROM crm_leads l WHERE l.id = ANY($1::int[])${extra}`,
    params
  );
  const byId = new Map(result.rows.map((r) => [Number(r.id), r]));
  return clean.map((id) => byId.get(id)).filter(Boolean);
}

async function bulkOutreach({ leadIds, channel, user, consentConfirmed, customMessage, templateKey }) {
  const leads = await loadLeadsByIds(leadIds, user);
  if (!leads.length) return { ok: false, error: 'Select at least one lead.' };
  const cap = channel === 'email' || channel === 'packet' ? EMAIL_CAP
    : channel === 'sms' ? SMS_CAP
      : channel === 'vapi' ? VAPI_CAP
        : 1;
  const slice = leads.slice(0, cap);
  const sent = [];
  const skipped = [];
  for (const lead of slice) {
    try {
      let result;
      if (channel === 'email') result = await sendLeadEmail(lead, user, templateKey);
      else if (channel === 'sms') result = await sendLeadSms(lead, user, { consentConfirmed, customMessage });
      else if (channel === 'vapi') result = await sendLeadVapi(lead, user, { consentConfirmed });
      else if (channel === 'voip') result = await sendLeadVoip(lead, user);
      else if (channel === 'packet') result = await sendLeadPacket(lead, user);
      else return { ok: false, error: 'Unknown channel' };
      if (result.ok) sent.push({ id: lead.id, company: lead.company_name, ...result });
      else skipped.push({ id: lead.id, company: lead.company_name, reason: result.reason || 'Skipped' });
    } catch (err) {
      skipped.push({ id: lead.id, company: lead.company_name, reason: err.message });
    }
  }
  return {
    ok: true,
    channel,
    sent: sent.length,
    skipped,
    results: sent,
    remaining: Math.max(0, leads.length - cap),
    note: channel === 'sms' || channel === 'vapi'
      ? 'SMS and Vapi only go to numbers with prior consent, or rows you marked as already agreed.'
      : 'CAN-SPAM email. Daily batch is capped so bounces stay visible.'
  };
}

module.exports = {
  EMAIL_CAP,
  SMS_CAP,
  VAPI_CAP,
  ensureSmsOptInColumn,
  hasSmsConsent,
  recordPriorConsent,
  sendLeadEmail,
  sendLeadSms,
  sendLeadVapi,
  sendLeadVoip,
  sendLeadPacket,
  loadLeadsByIds,
  bulkOutreach
};
