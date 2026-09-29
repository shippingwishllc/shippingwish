/**
 * CRM AI desk — named outreach, follow-ups, and replies.
 * Facts only: no invented RPM, load counts, or income.
 */
const pool = require('../db');
const { sanitizeEmail } = require('./email-valid');
const { sendBrandedEmail, isUnsubscribed } = require('./mailer');
const { buildTemplate } = require('./email-templates');
const { phoneTail, isPhoneOptedOut, logSmsMessage, OUR_NUMBER, findLeadByPhone } = require('./sms-inbox');
const { isWithinTcpaHours } = require('./us-timezones');

const TRANSFER = process.env.MIGHTYCALL_TRANSFER_NUMBER || process.env.OUR_NUMBER || '+18005803101';
const DESK_PHONE = process.env.COMPANY_PHONE || '+1 (917) 737-0021';
const SITE = 'https://www.shippingwish.com';

const FACTS = `You work for Shipping Wish LLC (${SITE}, desk ${DESK_PHONE}, transfer ${TRANSFER}).
We place a named Dedicated Fleet Operations Manager with small motor carriers.
The carrier keeps 100% of broker freight pay. We invoice a flat weekly retainer: $149/week for 1 truck, $350/week for 2–5 trucks, $500/week for 6 or more. First week is $0 if they want to try it.
The manager looks for freight in the lower 48 from where the truck is empty to where the owner wants to go. The owner approves every load.
Equipment we handle: 53ft dry van, reefer, flatbed, 26ft box truck, sprinters, hotshots.
Never quote a rate per mile, weekly income, a number of loads, DAT, or a harvest count. If a fact is not in this list, say a live manager will follow up the same business day.
If they ask to stop, confirm they will not be contacted again and end.`;

function companyOf(lead) {
  return String((lead && (lead.company_name || lead.companyName)) || 'your fleet').trim() || 'your fleet';
}

function ownerOf(lead) {
  const n = String((lead && (lead.owner_name || lead.ownerName)) || '').trim();
  if (!n || /^n\/?a$/i.test(n) || /^owner$/i.test(n) || /^fleet manager$/i.test(n)) return 'there';
  return n.split(/\s+/)[0];
}

function voiceSystemPrompt(lead) {
  const company = companyOf(lead);
  const equipment = (lead && lead.equipment_type) || 'their equipment';
  return `${FACTS}

This live call is with ${ownerOf(lead)} at ${company}, running ${equipment}.
Use their company name. Answer every question completely from the facts — 2 to 6 spoken sentences for a real question (price, what you do, lanes, trial, cancellation). Keep hellos to one short sentence.
If they want to start or speak to a person, use transferCall to ${TRANSFER}.`;
}

function firstVoiceMessage(lead) {
  return `Hi this is Alex with Shipping Wish operations. Am I speaking with the fleet owner or manager for ${companyOf(lead)}?`;
}

const BROKER_FACTS = `You work for Shipping Wish LLC (${SITE}, desk ${DESK_PHONE}, transfer ${TRANSFER}).
We are a motor carrier. Licensed property brokers post freight; we offer our trucks on those loads when they match.
A named operations manager books the truck after the owner approves. We haul as the carrier. We do not co-broker and we do not take a cut of the broker's margin.
After booking, tracking is available through SW Track or official partner APIs the broker already uses (MacroPoint, FourKites, Trucker Tools) when those accounts exist.
Never quote a rate per mile, a truck count, DAT, or a harvest count. Do not say we are FMCSA-certified ELD hardware. If a fact is not in this list, say a live manager will follow up the same business day.
If they ask to stop, confirm they will not be contacted again and end.`;

function brokerCompanyOf(lead) {
  return String((lead && (lead.company_name || lead.companyName)) || 'your brokerage').trim() || 'your brokerage';
}

function brokerVoiceSystemPrompt(lead) {
  const company = brokerCompanyOf(lead);
  const loc = [lead && lead.phy_city, lead && lead.phy_state].filter(Boolean).join(', ') || 'their listed office';
  return `${BROKER_FACTS}

This live call is with ${ownerOf(lead)} at ${company}, listed in ${loc}.
Use their company name. Answer every question completely from the facts — 2 to 6 spoken sentences. Keep hellos to one short sentence.
If they want to book a lane or speak to a person, use transferCall to ${TRANSFER}.`;
}

function brokerFirstVoiceMessage(lead) {
  return `Hi this is Alex with Shipping Wish, a motor carrier. Am I speaking with someone who books freight at ${brokerCompanyOf(lead)}?`;
}

function brokerVapiAssistant(lead) {
  const company = brokerCompanyOf(lead);
  const name = (lead && (lead.owner_name || lead.ownerName)) || 'Broker';
  const serverUrl = String(process.env.APP_URL || SITE).replace(/\/$/, '') + '/api/ai-calling/webhook';
  return {
    name: `Alex — broker ${company}`,
    firstMessage: brokerFirstVoiceMessage(lead),
    model: {
      provider: 'openai',
      model: process.env.OUTREACH_AI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: brokerVoiceSystemPrompt(lead) }],
      tools: [{
        type: 'transferCall',
        destinations: [{
          type: 'number',
          number: TRANSFER,
          message: 'One moment while I transfer you to our operations desk.'
        }]
      }]
    },
    voice: { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM' },
    endCallMessage: 'Thank you for your time.',
    recordingEnabled: true,
    serverUrl
  };
}

function vapiAssistant(lead) {
  const company = companyOf(lead);
  const name = (lead && (lead.owner_name || lead.ownerName)) || 'Fleet Manager';
  const serverUrl = String(process.env.APP_URL || SITE).replace(/\/$/, '') + '/api/ai-calling/webhook';
  return {
    name: `Alex — ${company}`,
    firstMessage: firstVoiceMessage(lead),
    model: {
      provider: 'openai',
      model: process.env.OUTREACH_AI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: voiceSystemPrompt(lead) }],
      tools: [{
        type: 'transferCall',
        destinations: [{
          type: 'number',
          number: TRANSFER,
          message: 'One moment while I transfer you to our operations desk.'
        }]
      }]
    },
    voice: { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM' },
    endCallMessage: 'Thank you for your time. Have a safe drive.',
    recordingEnabled: true,
    serverUrl
  };
}

async function callOpenAi(messages, maxTokens) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OUTREACH_AI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
}

function looksStop(text) {
  return /^\s*(stop|unsubscribe|remove|quit)\b/i.test(text)
    || /\b(stop (emailing|texting|calling)|do not (email|text|call|contact)|take me off)\b/i.test(text);
}

function looksAuto(subject, text) {
  return /(out of (the )?office|automatic reply|auto-?reply|undeliverable|vacation)/i.test(`${subject} ${String(text || '').slice(0, 300)}`);
}

async function ensureFollowupTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_followups (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
      step INTEGER NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      template_key TEXT NOT NULL DEFAULT 'follow_up',
      scheduled_for TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      skip_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_crm_followups_due ON crm_followups (status, scheduled_for)`).catch(() => {});
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS last_auto_reply_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS auto_replies INTEGER DEFAULT 0`).catch(() => {});
}

async function enqueueFollowups(leadId) {
  if (!leadId) return { scheduled: 0 };
  await ensureFollowupTable();
  await pool.query(`DELETE FROM crm_followups WHERE lead_id = $1 AND status = 'pending'`, [leadId]).catch(() => {});
  await pool.query(
    `INSERT INTO crm_followups (lead_id, step, channel, template_key, scheduled_for)
     VALUES
       ($1, 2, 'email', 'follow_up', now() + interval '3 days'),
       ($1, 3, 'email', 'follow_up', now() + interval '7 days')`,
    [leadId]
  );
  return { scheduled: 2 };
}

async function cancelFollowups(leadId, reason) {
  if (!leadId) return;
  await ensureFollowupTable();
  await pool.query(
    `UPDATE crm_followups SET status = 'cancelled', skip_reason = $2
     WHERE lead_id = $1 AND status = 'pending'`,
    [leadId, reason || 'replied']
  ).catch(() => {});
}

async function processFollowups(limit) {
  await ensureFollowupTable();
  const cap = Math.min(10, Math.max(1, parseInt(limit, 10) || 8));
  const { rows } = await pool.query(
    `SELECT f.*, l.company_name, l.owner_name, l.email, l.phone, l.status AS lead_status, l.sms_opt_in
     FROM crm_followups f
     JOIN crm_leads l ON l.id = f.lead_id
     WHERE f.status = 'pending' AND f.scheduled_for <= now()
     ORDER BY f.scheduled_for ASC
     LIMIT $1`,
    [cap]
  );
  const results = [];
  for (const row of rows) {
    try {
      if (['interested', 'active', 'dead'].includes(row.lead_status)) {
        await pool.query(`UPDATE crm_followups SET status = 'cancelled', skip_reason = $2 WHERE id = $1`, [row.id, 'lead ' + row.lead_status]);
        results.push({ id: row.id, skipped: row.lead_status });
        continue;
      }
      if (row.channel === 'email') {
        const to = sanitizeEmail(row.email);
        if (!to || await isUnsubscribed(to)) {
          await pool.query(`UPDATE crm_followups SET status = 'skipped', skip_reason = $2 WHERE id = $1`, [row.id, 'no email or unsubscribed']);
          results.push({ id: row.id, skipped: 'email' });
          continue;
        }
        const tpl = buildTemplate(row.template_key || 'follow_up', {
          ownerName: row.owner_name,
          companyName: row.company_name,
          recipientEmail: to
        });
        await sendBrandedEmail({
          to,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          leadId: row.lead_id,
          emailType: 'crm_followup',
          templateKey: row.template_key || 'follow_up'
        });
      } else if (row.channel === 'sms') {
        if (!row.sms_opt_in) {
          await pool.query(`UPDATE crm_followups SET status = 'skipped', skip_reason = $2 WHERE id = $1`, [row.id, 'no SMS consent']);
          results.push({ id: row.id, skipped: 'no_consent' });
          continue;
        }
        if (await isPhoneOptedOut(row.phone) || !isWithinTcpaHours(row.phone).allowed) {
          await pool.query(`UPDATE crm_followups SET status = 'skipped', skip_reason = $2 WHERE id = $1`, [row.id, 'STOP or TCPA hours']);
          continue;
        }
        const { sendTwilioSms } = require('../routes/voip');
        const body = `Hi ${companyOf(row)}: checking in from Shipping Wish on a named ops manager. Reply YES if useful, STOP to opt out.`;
        const sms = await sendTwilioSms(row.phone, body);
        await logSmsMessage({
          direction: 'outbound',
          from_number: OUR_NUMBER,
          to_number: row.phone,
          body: sms.body || body,
          lead_id: row.lead_id,
          twilio_sid: sms.sid,
          disposition: sms.status,
          is_read: true
        }).catch(() => {});
      }
      await pool.query(`UPDATE crm_followups SET status = 'sent', sent_at = now() WHERE id = $1`, [row.id]);
      results.push({ id: row.id, company: row.company_name, sent: true });
    } catch (err) {
      await pool.query(`UPDATE crm_followups SET skip_reason = $2 WHERE id = $1`, [row.id, err.message]).catch(() => {});
      results.push({ id: row.id, error: err.message });
    }
  }
  return { ok: true, processed: results.length, results };
}

async function loadLead(leadId) {
  if (!leadId) return null;
  const { rows } = await pool.query('SELECT * FROM crm_leads WHERE id = $1', [leadId]);
  return rows[0] || null;
}

async function replySms({ from, body, lead }) {
  const text = String(body || '').trim();
  if (looksStop(text)) return null;
  const leadRow = lead || await findLeadByPhone(from);
  const ai = await callOpenAi([
    {
      role: 'system',
      content: `${FACTS}\nReply as a text to ${companyOf(leadRow)}. Answer their question from the facts. Max 240 characters. No invented rates. Do not add STOP.`
    },
    { role: 'user', content: text.slice(0, 500) }
  ], 120);
  if (ai) return ai.replace(/reply stop to opt out/gi, '').trim().slice(0, 240);
  return `Shipping Wish LLC: named ops manager, weekly retainer, you keep broker pay, first week $0. Reply with trucks + lanes or call ${DESK_PHONE}.`;
}

async function handleInboundEmail({ leadId, fromEmail, subject, bodyText }) {
  await ensureFollowupTable();
  const lead = await loadLead(leadId);
  if (!lead) return { action: 'no_lead' };
  const text = String(bodyText || '').replace(/https?:\/\/\S+/gi, '').slice(0, 4000);
  if (looksStop(text)) {
    await pool.query(`INSERT INTO unsubscribes (email, reason) VALUES ($1, 'replied stop') ON CONFLICT (email) DO NOTHING`, [fromEmail]).catch(() => {});
    await cancelFollowups(leadId, 'stop');
    return { action: 'unsubscribed' };
  }
  await cancelFollowups(leadId, 'replied');
  if (looksAuto(subject, text)) return { action: 'auto_ignored' };
  const replies = Number(lead.auto_replies || 0);
  if (replies >= 4) return { action: 'left_for_staff' };
  if (lead.last_auto_reply_at && Date.now() - new Date(lead.last_auto_reply_at).getTime() < 6 * 3600 * 1000) {
    return { action: 'cooldown' };
  }
  const to = sanitizeEmail(lead.email || fromEmail);
  if (!to || await isUnsubscribed(to)) return { action: 'unsubscribed' };

  const ai = await callOpenAi([
    {
      role: 'system',
      content: `${FACTS}\nWrite a complete email reply to ${ownerOf(lead)} at ${companyOf(lead)}. Answer every question they asked. Plain text, under 180 words, signed Shipping Wish Operations. No invented rates. No card or bank requests.`
    },
    { role: 'user', content: `Subject: ${String(subject || '').slice(0, 200)}\n\n${text}` }
  ], 500);
  const reply = (ai || `Hello ${ownerOf(lead)},\n\nThanks for writing about ${companyOf(lead)}. We place a named operations manager with small fleets. You keep broker pay. Weekly retainer: $149 / $350 / $500. First week $0 if you want to try it. Reply with equipment, truck count, and lanes, or call ${DESK_PHONE}.\n\nShipping Wish Operations`).trim();

  const subj = /^re:/i.test(subject || '') ? subject : `Re: ${subject || companyOf(lead)}`;
  await sendBrandedEmail({
    to,
    subject: subj,
    text: reply,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#0f172a;white-space:pre-wrap;">${reply.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>`,
    leadId,
    emailType: 'crm_ai_reply',
    templateKey: 'crm_ai_reply'
  });
  await pool.query(
    `UPDATE crm_leads SET auto_replies = COALESCE(auto_replies,0) + 1, last_auto_reply_at = now() WHERE id = $1`,
    [leadId]
  ).catch(() => {});
  return { action: 'ai_replied', company: companyOf(lead) };
}

async function followupStats() {
  await ensureFollowupTable();
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM crm_followups GROUP BY status`
  );
  const map = {};
  for (const r of rows) map[r.status] = r.n;
  return map;
}

module.exports = {
  FACTS,
  BROKER_FACTS,
  TRANSFER,
  companyOf,
  ownerOf,
  voiceSystemPrompt,
  firstVoiceMessage,
  brokerVapiAssistant,
  vapiAssistant,
  enqueueFollowups,
  cancelFollowups,
  processFollowups,
  followupStats,
  replySms,
  handleInboundEmail,
  loadLead,
  ensureFollowupTable,
  phoneTail
};
