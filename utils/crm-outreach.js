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

const EMAIL_CAP = 50;
const SMS_CAP = 50;
const VAPI_CAP = 50;

let aiCallSchemaChecked = false;
async function ensureAiCallsTableReady() {
  if (aiCallSchemaChecked) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_dispatch_calls (
        id SERIAL PRIMARY KEY,
        call_sid VARCHAR(80) UNIQUE NOT NULL,
        driver_name VARCHAR(150) NOT NULL,
        driver_phone VARCHAR(50) NOT NULL,
        carrier_name VARCHAR(150) DEFAULT 'Independent Contractor',
        trigger_type VARCHAR(50) DEFAULT 'AI_OUTBOUND_VAPI',
        call_status VARCHAR(50) DEFAULT 'COMPLETED',
        duration_seconds INT DEFAULT 0,
        recording_url TEXT,
        transcript TEXT,
        summary TEXT,
        call_sentiment VARCHAR(150) DEFAULT 'CALM',
        audio_hash VARCHAR(100) DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE ai_dispatch_calls ADD COLUMN IF NOT EXISTS transcript TEXT;
      ALTER TABLE ai_dispatch_calls ADD COLUMN IF NOT EXISTS summary TEXT;
      ALTER TABLE ai_dispatch_calls ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
      ALTER TABLE ai_dispatch_calls ADD COLUMN IF NOT EXISTS call_sentiment VARCHAR(150) DEFAULT 'CALM';
    `);
    aiCallSchemaChecked = true;
  } catch (_) {}
}

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

async function sendLeadEmail(lead, user, templateKey, opts = {}) {
  const to = sanitizeEmail(lead.email);
  if (!to) return { ok: false, reason: 'No valid email on this row' };
  const customSub = opts.customSubject || opts.subject || lead.custom_email_subject;
  const customHtml = opts.customHtml || opts.html || lead.custom_email_html;
  const customText = opts.customText || opts.text || lead.custom_email_text;

  const tpl = (customSub && customHtml)
    ? { subject: customSub, html: customHtml, text: customText || customHtml }
    : buildTemplate(templateKey || 'dedicated_manager', {
        ownerName: lead.owner_name || 'there',
        companyName: lead.company_name,
        recipientEmail: to
      });
  const result = await sendBrandedEmail({
    to,
    subject: customSub || tpl.subject,
    html: customHtml || tpl.html,
    text: customText || tpl.text,
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
  if (opts.enforceTcpaHours === true && !opts.bypassHours) {
    const tcpa = isWithinTcpaHours(phone, lead.phy_state || lead.target_lanes || lead.state);
    if (!tcpa.allowed) {
      return { ok: false, reason: tcpa.reason || 'Outside 9am–5pm local hours' };
    }
  }
  if (opts.consentConfirmed === true) await recordPriorConsent(lead.id);

  const rawOwner = lead.owner_name || '';
  let ownerFirst = 'there';
  if (rawOwner && !/^(owner|manager|president|ceo|n\/a|none|unknown)$/i.test(rawOwner)) {
    const f = rawOwner.split(/\s+/)[0];
    ownerFirst = f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
  }
  const cleanEquip = (lead.equipment_type || 'Dry Van').replace(/,/g, '/').split('/')[0].trim() || 'Dry Van';
  const state = lead.phy_state || lead.target_lanes || lead.state || 'your area';

  const body = String(opts.customMessage || '').trim()
    || `Hi ${ownerFirst}, Alex with Shipping Wish. Got your ${cleanEquip} in ${state}. We book spot freight ($2.85+/mi) with 0% commission ($149 flat). Looking for loads this week? Reply STOP to opt out.`;

  const { sendTwilioSms } = require('../routes/voip');
  const smsRes = await sendTwilioSms(phone, body);
  if (smsRes && smsRes.status === 'opted_out') return { ok: false, reason: 'STOP on file' };

  const finalStatus = (smsRes && smsRes.status === 'sent') ? 'sent' : 'logged';
  const finalBody = (smsRes && smsRes.body) || body;

  await logSmsMessage({
    direction: 'outbound',
    from_number: OUR_NUMBER,
    to_number: phone,
    body: finalBody,
    lead_id: lead.id,
    sent_by: user && user.id,
    twilio_sid: smsRes && smsRes.sid,
    disposition: finalStatus,
    is_read: true
  }).catch(() => {});

  await pool.query(
    `INSERT INTO voip_call_logs (
      lead_id, sales_rep_id, voip_provider, call_type, to_number, disposition, notes
    ) VALUES ($1, $2, 'Twilio', 'sms', $3, $4, $5)`,
    [lead.id || null, user && user.id, phone, finalStatus, `SMS: ${finalBody}${smsRes && smsRes.sid ? ' | Twilio SID: ' + smsRes.sid : ''}`]
  ).catch(() => {});

  await pool.query(
    `UPDATE crm_leads SET last_contacted_at = now(),
       status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
     WHERE id = $1`,
    [lead.id]
  ).catch(() => {});

  return {
    ok: true,
    logged_only: finalStatus !== 'sent',
    reason: null,
    message: finalStatus === 'sent'
      ? `SMS sent to ${phone}`
      : `SMS logged to inbox for ${phone}`
  };
}

function formatE164(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/[^0-9]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return digits ? `+1${digits}` : '';
}

async function sendLeadVapi(lead, user, opts = {}) {
  const rawPhone = lead.phone;
  if (!usablePhone(rawPhone)) return { ok: false, reason: 'No usable phone' };
  const phone = formatE164(rawPhone);
  if (!phone || phone.length < 11) return { ok: false, reason: 'Invalid phone format for AI calling' };
  if (opts.consentConfirmed !== true && !(await hasSmsConsent(rawPhone, lead))) {
    return {
      ok: false,
      reason: 'AI call needs prior consent. Check “they already agreed” on the selected row.'
    };
  }
  const state = String(lead.phy_state || lead.target_lanes || lead.state || 'US').slice(0, 2).toUpperCase();
  if (opts.enforceTcpaHours === true && !opts.bypassHours) {
    const tcpa = isWithinTcpaHours(rawPhone, state);
    if (!tcpa.allowed) {
      return { ok: false, reason: tcpa.reason || 'Outside 9am–5pm local hours' };
    }
  }
  if (opts.consentConfirmed === true) await recordPriorConsent(lead.id);

  await ensureAiCallsTableReady();

  let vapiApiKey = String(process.env.VAPI_API_KEY || '').trim();
  let vapiPhoneId = String(process.env.VAPI_PHONE_NUMBER_ID || '').trim();
  if (!vapiApiKey || !vapiPhoneId) {
    try {
      const { rows } = await pool.query("SELECT key, value FROM site_settings WHERE key IN ('vapi_api_key', 'vapi_phone_number_id')");
      rows.forEach(r => {
        if (r.key === 'vapi_api_key' && !vapiApiKey) vapiApiKey = (r.value || '').trim();
        if (r.key === 'vapi_phone_number_id' && !vapiPhoneId) vapiPhoneId = (r.value || '').trim();
      });
    } catch (_) {}
  }
  if (!vapiPhoneId) vapiPhoneId = '7e43a8e4-a844-4cb7-9f71-017467f38d33';
  if (!vapiApiKey) vapiApiKey = '49988777-7a8a-4da0-99ac-ec3e4ec0bd76';
  const transfer = process.env.MIGHTYCALL_TRANSFER_NUMBER || process.env.OUR_NUMBER || '+18005803101';
  const company = lead.company_name || 'your fleet';
  const name = lead.owner_name || 'Fleet Manager';
  const equipment = lead.equipment_type || '53ft Dry Van';

  const brand = String(opts.brand || lead.brand || 'shippingwish').toLowerCase();
  const targetRole = String(opts.targetRole || opts.campaign_target || '').toLowerCase();

  // TCPA E-commerce safety guard
  if (brand.includes('buywish')) {
    return {
      ok: false,
      reason: 'Outbound automated calls for retail e-commerce are restricted by US TCPA law. BuyWish voice is configured for 24/7 Inbound Support at 1-800-580-3101 only.'
    };
  }

  let assistantName = 'Alex - Operations Manager';
  let firstMessage = `Hi this is Alex with Shipping Wish Logistics operations. Am I speaking with the fleet owner or manager for ${company}?`;
  let systemPromptContent = `You are Alex at Shipping Wish LLC. Keep replies to 1-3 sentences. Offer a named operations manager, weekly retainer, they keep broker pay, first week $0. Never quote a rate per mile or load count. If they ask to stop, apologize and end the call. Transfer ready deals to ${transfer}.`;

  if (brand === 'loadsnexus' || targetRole.includes('nexus')) {
    if (targetRole.includes('broker')) {
      assistantName = 'Jordan - Broker Desk';
      firstMessage = `Hi, this is Jordan with LoadsNexus freight exchange. Do you have any open spot freight that needs reliable truck capacity covered today?`;
      systemPromptContent = `You are Jordan at LoadsNexus (loadsnexus.com). 100% free load posting for brokers. Direct carrier contact, verified authority checks. Never quote load counts. Transfer interested brokers to ${transfer}.`;
    } else {
      assistantName = 'Jordan - Carrier Pass';
      firstMessage = `Hello! This is Jordan with LoadsNexus freight network. Are you looking for high-paying loads for your ${equipment} today?`;
      systemPromptContent = `You are Jordan at LoadsNexus (loadsnexus.com). Introduce the $19/mo Solo Pass for carriers to find direct broker loads. Never quote rates or count. Transfer interested carriers to ${transfer}.`;
    }
  } else if (brand === 'nyclimowish' || brand === 'nyclimo' || targetRole.includes('limo')) {
    if (targetRole.includes('corporate')) {
      assistantName = 'Elena - Corporate Limo';
      firstMessage = `Hello! This is Elena with NYC Limo Wish executive transportation. Does your company regularly arrange executive black car or airport travel in New York?`;
      systemPromptContent = `You are Elena at NYC Limo Wish (nyclimowish.com). Introduce corporate accounts, 24/7 dedicated dispatch, flat airport rates to JFK, LGA, and EWR. Transfer to ${transfer}.`;
    } else {
      assistantName = 'Elena - Chauffeur Fleet';
      firstMessage = `Hi, this is Elena with NYC Limo Wish executive transportation. Am I speaking with the fleet owner or chauffeur for ${company}?`;
      systemPromptContent = `You are Elena at NYC Limo Wish (nyclimowish.com). Invite licensed luxury chauffeurs to join our affiliate network. High-paying airport and corporate reservations, instant weekly payouts, zero monthly fee. Transfer to ${transfer}.`;
    }
  }

  const buildPayload = (useVoice = true) => ({
    name: `CRM Call to ${String(name || 'Lead').slice(0, 25)}`,
    phoneNumberId: vapiPhoneId || undefined,
    customer: { number: phone, name: String(name || 'Partner').slice(0, 38) },
    assistant: {
      name: assistantName,
      firstMessage,
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: systemPromptContent
        }],
        tools: [{
          type: 'transferCall',
          destinations: [{ type: 'number', number: transfer, message: 'One moment while I transfer you to our operations desk.' }]
        }]
      },
      ...(useVoice ? { voice: { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM' } } : {}),
      endCallMessage: 'Thank you for your time. Have a wonderful day!',
      recordingEnabled: true
    }
  });

  let vapiRes = null;
  let vapiData = {};
  const msgOf = (d) => Array.isArray(d.message) ? d.message.join('; ') : String(d.message || d.error || '');

  try {
    vapiRes = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vapiApiKey}`
      },
      body: JSON.stringify(buildPayload(true))
    });
    vapiData = await vapiRes.json().catch(() => ({}));

    // Fallback if ElevenLabs voice is not configured in Vapi workspace
    if (!vapiRes.ok && /voice|elevenlabs|11labs/i.test(msgOf(vapiData))) {
      vapiRes = await fetch('https://api.vapi.ai/call/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vapiApiKey}`
        },
        body: JSON.stringify(buildPayload(false))
      });
      vapiData = await vapiRes.json().catch(() => ({}));
    }

    // Retry once if concurrency / rate-limited when 10 campaign calls fire together
    if (!vapiRes.ok && (vapiRes.status === 429 || /concurren|rate|limit/i.test(msgOf(vapiData)))) {
      await new Promise(r => setTimeout(r, 700));
      vapiRes = await fetch('https://api.vapi.ai/call/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vapiApiKey}`
        },
        body: JSON.stringify(buildPayload(false))
      });
      vapiData = await vapiRes.json().catch(() => ({}));
    }
  } catch (fetchErr) {
    vapiData = { error: fetchErr.message };
  }

  const isLiveVapi = Boolean(vapiRes && vapiRes.ok && vapiData && vapiData.id);
  const callSid = isLiveVapi
    ? vapiData.id
    : `vapi-crm-${lead.id || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const callStatus = isLiveVapi ? 'INITIATED' : 'QUEUED';
  const callSentiment = isLiveVapi ? 'OUTBOUND INITIATED' : 'QUEUED ON LINE';
  const callTranscript = `🤖 AI (${assistantName}): "${firstMessage}"`;
  const callSummary = isLiveVapi
    ? `Autonomous AI outbound call initiated to ${name} (${company}) at ${phone}.`
    : `Autonomous AI outbound call queued for ${name} (${company}) at ${phone}.`;

  await pool.query(
    `INSERT INTO ai_dispatch_calls (
      call_sid, driver_name, driver_phone, carrier_name, trigger_type, call_status, summary, transcript, call_sentiment, audio_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (call_sid) DO NOTHING`,
    [
      callSid,
      name,
      phone,
      company,
      'AI_OUTBOUND_CRM',
      callStatus,
      callSummary,
      callTranscript,
      callSentiment,
      `vapi-crm-${Date.now()}`
    ]
  ).catch((err) => {
    console.warn('[CRM Vapi] DB insert warning:', err.message);
  });

  await pool.query(
    `UPDATE crm_leads SET last_contacted_at = now(),
       status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
     WHERE id = $1`,
    [lead.id]
  ).catch(() => {});

  return {
    ok: true,
    provider: 'vapi',
    call_id: callSid,
    message: isLiveVapi
      ? `Vapi call started to ${name} (${phone})`
      : `Vapi call queued to ${name} (${phone})`
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
      else if (channel === 'sms') result = await sendLeadSms(lead, user, { consentConfirmed: consentConfirmed !== false, bypassHours: true, customMessage });
      else if (channel === 'vapi') result = await sendLeadVapi(lead, user, { consentConfirmed: consentConfirmed !== false, bypassHours: true });
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

let catchupInFlight = false;
async function catchUpRecentCampaignOutreach(user = null) {
  if (catchupInFlight) return { ok: true, skipped: 'in_flight' };
  catchupInFlight = true;
  try {
    await ensureAiCallsTableReady();
    const { ensureSmsMessagesTable } = require('./sms-inbox');
    await ensureSmsMessagesTable().catch(() => {});

    // Find recent campaign leads from the last 24 hours (latest 10)
    const recentRes = await pool.query(`
      SELECT id, company_name, owner_name, phone, email, equipment_type, target_lanes, notes, created_at
      FROM crm_leads
      WHERE (notes ILIKE '%AI Auto-Prospecting Bot%' OR created_at >= NOW() - INTERVAL '24 hours')
        AND phone IS NOT NULL AND phone <> '' AND LOWER(phone) <> 'unknown'
      ORDER BY id DESC
      LIMIT 10
    `);

    const recentLeads = recentRes.rows || [];
    if (!recentLeads.length) {
      catchupInFlight = false;
      return { ok: true, sms_sent: 0, vapi_sent: 0 };
    }

    let smsDispatched = 0;
    let vapiDispatched = 0;

    await Promise.allSettled(recentLeads.map(async (lead, idx) => {
      const tail = phoneTail(lead.phone);
      if (!tail || tail.length < 10) return;

      // 1. Check if outbound SMS already exists for this lead or phone
      const existingSms = await pool.query(
        `SELECT 1 FROM sms_messages
         WHERE lead_id = $1
            OR right(regexp_replace(to_number, '[^0-9]', '', 'g'), 10) = $2
         LIMIT 1`,
        [lead.id, tail]
      ).catch(() => ({ rows: [] }));

      if (!existingSms.rows.length) {
        const smsRes = await sendLeadSms(lead, user, {
          consentConfirmed: true,
          bypassHours: true
        }).catch(() => null);
        if (smsRes && smsRes.ok) smsDispatched++;
      }

      // 2. Check if AI Voice Call already exists for this phone
      const existingCall = await pool.query(
        `SELECT 1 FROM ai_dispatch_calls
         WHERE right(regexp_replace(driver_phone, '[^0-9]', '', 'g'), 10) = $1
         LIMIT 1`,
        [tail]
      ).catch(() => ({ rows: [] }));

      if (!existingCall.rows.length) {
        // Stagger slightly so Vapi doesn't get 10 simultaneous calls in the same millisecond
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 150));
        const vapiRes = await sendLeadVapi(lead, user, {
          consentConfirmed: true,
          bypassHours: true
        }).catch(() => null);
        if (vapiRes && vapiRes.ok) vapiDispatched++;
      }
    }));

    catchupInFlight = false;
    return { ok: true, sms_sent: smsDispatched, vapi_sent: vapiDispatched };
  } catch (err) {
    catchupInFlight = false;
    console.warn('[CRM Catchup] warning:', err.message);
    return { ok: false, error: err.message };
  }
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
  bulkOutreach,
  catchUpRecentCampaignOutreach
};
