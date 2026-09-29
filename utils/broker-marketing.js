const pool = require('../db');
const { censusQuery } = require('./fmcsa');
const { US_STATES } = require('./fmcsa-equipment');
const { buildBrokerCensusWhere, pickUnseenBrokers } = require('./fmcsa-brokers');
const { sanitizeEmail } = require('./email-valid');
const { sendBrandedEmail } = require('./mailer');
const { buildTemplate, SMS_TEMPLATES } = require('./email-templates');
const { isPhoneOptedOut, phoneTail, logSmsMessage, OUR_NUMBER } = require('./sms-inbox');
const { isWithinTcpaHours } = require('./us-timezones');
const { hasSmsConsent } = require('./crm-outreach');
const desk = require('./crm-ai-desk');

const PAGE_SIZE = 10;
const FETCH_SIZE = 40;
const MAX_PAGES = 8;

let migrated = false;

async function ensureBrokerMarketingTables() {
  if (migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broker_marketing_contacts (
      id SERIAL PRIMARY KEY,
      dot_number VARCHAR(20) NOT NULL,
      mc_number VARCHAR(20),
      email VARCHAR(200),
      phone VARCHAR(40),
      company_name VARCHAR(200),
      phy_state VARCHAR(4),
      classdef TEXT,
      carship VARCHAR(40),
      status VARCHAR(20) NOT NULL DEFAULT 'shown',
      batch_key VARCHAR(80),
      row_json JSONB DEFAULT '{}'::jsonb,
      created_by INT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS broker_mkt_dot_uidx
      ON broker_marketing_contacts (dot_number);
    CREATE INDEX IF NOT EXISTS broker_mkt_status_idx ON broker_marketing_contacts (status);
    CREATE INDEX IF NOT EXISTS broker_mkt_state_idx ON broker_marketing_contacts (phy_state);

    CREATE TABLE IF NOT EXISTS broker_marketing_cursors (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      filter_key VARCHAR(120) NOT NULL,
      soda_offset INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE (user_id, filter_key)
    );
  `);
  migrated = true;
}

function filterKey(filters) {
  const state = String(filters.state || '').toUpperCase();
  return [
    state || 'ALL',
    filters.hasEmail ? 'email' : 'anymail',
    filters.hasPhone ? 'phone' : 'anyphone',
    filters.brokerOnly ? 'brokeronly' : 'anybroker',
    filters.activeOnly === false ? 'allstatus' : 'active'
  ].join('|');
}

async function excludedDots() {
  await ensureBrokerMarketingTables();
  const { rows } = await pool.query(`SELECT dot_number FROM broker_marketing_contacts`);
  return new Set(rows.map((r) => String(r.dot_number || '').trim()).filter(Boolean));
}

async function markShown(brokers, userId, batchKey) {
  await ensureBrokerMarketingTables();
  for (const b of brokers) {
    if (!b.dot_number) continue;
    await pool.query(`
      INSERT INTO broker_marketing_contacts (
        dot_number, mc_number, email, phone, company_name, phy_state, classdef, carship,
        status, batch_key, row_json, created_by, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'shown',$9,$10::jsonb,$11, now())
      ON CONFLICT (dot_number) DO UPDATE SET
        company_name = COALESCE(EXCLUDED.company_name, broker_marketing_contacts.company_name),
        email = COALESCE(EXCLUDED.email, broker_marketing_contacts.email),
        phone = COALESCE(EXCLUDED.phone, broker_marketing_contacts.phone),
        updated_at = now()
    `, [
      b.dot_number,
      b.mc_number || null,
      b.email || null,
      b.phone || null,
      b.company_name || null,
      b.phy_state || null,
      b.classdef || null,
      b.carship || null,
      batchKey || null,
      JSON.stringify(b),
      userId || null
    ]);
  }
}

async function markContacted(dotNumber, channel) {
  const status = channel === 'sms' ? 'sms' : channel === 'vapi' ? 'vapi' : 'emailed';
  await pool.query(
    `UPDATE broker_marketing_contacts
     SET status = $2, updated_at = now()
     WHERE dot_number = $1`,
    [String(dotNumber), status]
  );
}

async function getCursor(userId, key) {
  await ensureBrokerMarketingTables();
  const { rows } = await pool.query(
    `SELECT soda_offset FROM broker_marketing_cursors WHERE user_id = $1 AND filter_key = $2`,
    [userId, key]
  );
  return rows[0] ? Number(rows[0].soda_offset) || 0 : 0;
}

async function setCursor(userId, key, offset) {
  await ensureBrokerMarketingTables();
  await pool.query(`
    INSERT INTO broker_marketing_cursors (user_id, filter_key, soda_offset, updated_at)
    VALUES ($1,$2,$3, now())
    ON CONFLICT (user_id, filter_key) DO UPDATE SET soda_offset = EXCLUDED.soda_offset, updated_at = now()
  `, [userId, key, offset]);
}

async function resetShownKeepContacted() {
  await ensureBrokerMarketingTables();
  const { rowCount } = await pool.query(
    `DELETE FROM broker_marketing_contacts WHERE status = 'shown'`
  );
  await pool.query(`UPDATE broker_marketing_cursors SET soda_offset = 0, updated_at = now()`);
  return rowCount;
}

async function stats() {
  await ensureBrokerMarketingTables();
  const { rows } = await pool.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'shown')::int AS shown,
      count(*) FILTER (WHERE status = 'emailed')::int AS emailed,
      count(*) FILTER (WHERE status = 'sms')::int AS sms,
      count(*) FILTER (WHERE status = 'vapi')::int AS vapi
    FROM broker_marketing_contacts
  `);
  return rows[0] || { total: 0, shown: 0, emailed: 0, sms: 0, vapi: 0 };
}

async function nextBrokers(filters, userId) {
  await ensureBrokerMarketingTables();
  const where = buildBrokerCensusWhere(filters);
  const key = filterKey(filters);
  let offset = filters.resetCursor ? 0 : await getCursor(userId, key);
  const exclude = await excludedDots();
  const out = [];
  let exhausted = false;
  let pages = 0;
  while (out.length < PAGE_SIZE && pages < MAX_PAGES) {
    const rows = await censusQuery({
      $where: where,
      $order: 'dot_number ASC',
      $limit: String(FETCH_SIZE),
      $offset: String(offset)
    });
    pages += 1;
    if (!rows.length) {
      exhausted = true;
      break;
    }
    offset += rows.length;
    const picked = pickUnseenBrokers(rows, exclude, PAGE_SIZE - out.length);
    out.push(...picked);
  }
  await setCursor(userId, key, offset);
  const batchKey = `${key}:${Date.now()}`;
  await markShown(out, userId, batchKey);
  return {
    brokers: out,
    page_size: PAGE_SIZE,
    soda_offset: offset,
    exhausted,
    where,
    filter_key: key,
    skipped_already_listed: true
  };
}

function normalizeFilters(src) {
  const state = String(src.state || '').trim().toUpperCase();
  return {
    state: US_STATES.includes(state) ? state : '',
    hasEmail: src.hasEmail !== false && src.has_email !== false,
    hasPhone: src.hasPhone === true || src.has_phone === true,
    brokerOnly: src.brokerOnly === true || src.broker_only === true,
    activeOnly: src.activeOnly !== false,
    excludePassengers: src.excludePassengers !== false,
    resetCursor: src.resetCursor === true
  };
}

const EMAIL_CAP = 15;
const SMS_CAP = 10;
const VAPI_CAP = 5;

function usablePhone(phone) {
  const tail = phoneTail(phone);
  return tail && tail.length >= 10 && String(phone).toLowerCase() !== 'unknown' ? tail : '';
}

async function loadBrokersByDots(dots) {
  await ensureBrokerMarketingTables();
  const clean = [...new Set((dots || []).map((d) => String(d || '').trim()).filter(Boolean))].slice(0, 50);
  if (!clean.length) return [];
  const { rows } = await pool.query(
    `SELECT * FROM broker_marketing_contacts WHERE dot_number = ANY($1::text[])`,
    [clean]
  );
  const byDot = new Map(rows.map((r) => [String(r.dot_number), r]));
  return clean.map((dot) => {
    const row = byDot.get(dot);
    if (!row) return null;
    const json = row.row_json && typeof row.row_json === 'object' ? row.row_json : {};
    return {
      ...json,
      company_name: json.company_name || row.company_name,
      owner_name: json.owner_name || '',
      email: json.email || row.email,
      phone: json.phone || row.phone,
      mc_number: json.mc_number || row.mc_number,
      dot_number: row.dot_number,
      phy_state: json.phy_state || row.phy_state,
      phy_city: json.phy_city || '',
      classdef: json.classdef || row.classdef,
      carship: json.carship || row.carship
    };
  }).filter(Boolean);
}

async function sendBrokerEmail(broker, user) {
  const to = sanitizeEmail(broker.email);
  if (!to) return { ok: false, reason: 'No valid email on this row' };
  const tpl = buildTemplate('broker_capacity', {
    ownerName: broker.owner_name || 'there',
    companyName: broker.company_name,
    recipientEmail: to
  });
  const result = await sendBrandedEmail({
    to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    sentBy: user && user.id,
    emailType: 'broker_marketing',
    templateKey: 'broker_capacity'
  });
  if (result && result.skipped) return { ok: false, reason: 'Unsubscribed' };
  await markContacted(broker.dot_number, 'email');
  const loggedOnly = result && result.status === 'logged_no_resend_key';
  return {
    ok: true,
    logged_only: !!loggedOnly,
    message: loggedOnly
      ? `Email logged (RESEND_API_KEY missing) for ${to}`
      : `Email sent to ${to}`
  };
}

async function sendBrokerSms(broker, user, opts = {}) {
  const phone = broker.phone;
  if (!usablePhone(phone)) return { ok: false, reason: 'No usable phone' };
  if (await isPhoneOptedOut(phone)) return { ok: false, reason: 'STOP on file' };
  const consented = (await hasSmsConsent(phone, broker)) || opts.consentConfirmed === true;
  if (!consented) {
    return {
      ok: false,
      reason: 'No SMS consent. Check “they already agreed” on selected rows, or email first and wait for YES.'
    };
  }
  const tcpa = isWithinTcpaHours(phone, broker.phy_state);
  if (!tcpa.allowed) {
    return { ok: false, reason: tcpa.reason || 'Outside 9am–5pm local hours' };
  }
  const body = String(opts.customMessage || '').trim()
    || SMS_TEMPLATES.broker_capacity({ companyName: broker.company_name });
  const { sendTwilioSms } = require('../routes/voip');
  const smsRes = await sendTwilioSms(phone, body);
  if (smsRes && smsRes.status === 'opted_out') return { ok: false, reason: 'STOP on file' };
  await logSmsMessage({
    direction: 'outbound',
    from_number: OUR_NUMBER,
    to_number: phone,
    body: smsRes.body || body,
    sent_by: user && user.id,
    twilio_sid: smsRes.sid,
    disposition: smsRes.status,
    is_read: true
  }).catch(() => {});
  const sent = smsRes && (smsRes.status === 'sent' || smsRes.status === 'logged');
  if (sent) await markContacted(broker.dot_number, 'sms');
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

async function sendBrokerVapi(broker, user, opts = {}) {
  const phone = broker.phone;
  if (!usablePhone(phone)) return { ok: false, reason: 'No usable phone' };
  if (opts.consentConfirmed !== true && !(await hasSmsConsent(phone, broker))) {
    return {
      ok: false,
      reason: 'AI call needs prior consent. Check “they already agreed” on the selected row.'
    };
  }
  const state = String(broker.phy_state || 'US').slice(0, 2).toUpperCase();
  const tcpa = isWithinTcpaHours(phone, state);
  if (!tcpa.allowed) {
    return { ok: false, reason: tcpa.reason || 'Outside 9am–5pm local hours' };
  }

  const vapiApiKey = String(process.env.VAPI_API_KEY || '').trim();
  const vapiPhoneId = String(process.env.VAPI_PHONE_NUMBER_ID || '').trim();
  const company = broker.company_name || 'brokerage';
  const name = broker.owner_name || 'Broker';

  if (!vapiApiKey) {
    await markContacted(broker.dot_number, 'vapi');
    return {
      ok: true,
      logged_only: true,
      provider: 'standby',
      message: `VAPI_API_KEY is not set. Call payload ready for ${name} (${phone}). Add the key to place the live AI call.`
    };
  }

  const assistant = desk.brokerVapiAssistant(broker);
  const vapiPayload = {
    name: `Broker marketing call to ${name} (${company})`,
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
      'AI_OUTBOUND_BROKER_MKT',
      `vapi-broker-${Date.now()}`
    ]
  ).catch(() => {});
  await markContacted(broker.dot_number, 'vapi');
  return {
    ok: true,
    provider: 'vapi',
    call_id: vapiData.id,
    message: `Vapi call started to ${name} (${phone})`
  };
}

async function outreachBrokers({ dots, channel, user, consentConfirmed, customMessage }) {
  const brokers = await loadBrokersByDots(dots);
  if (!brokers.length) return { ok: false, error: 'Select at least one broker on this page.' };
  const cap = channel === 'email' ? EMAIL_CAP
    : channel === 'sms' ? SMS_CAP
      : channel === 'vapi' ? VAPI_CAP
        : 0;
  if (!cap) return { ok: false, error: 'Unknown channel' };
  const slice = brokers.slice(0, cap);
  const sent = [];
  const skipped = [];
  for (const broker of slice) {
    try {
      let result;
      if (channel === 'email') result = await sendBrokerEmail(broker, user);
      else if (channel === 'sms') result = await sendBrokerSms(broker, user, { consentConfirmed, customMessage });
      else result = await sendBrokerVapi(broker, user, { consentConfirmed });
      if (result.ok) sent.push({ dot: broker.dot_number, company: broker.company_name, ...result });
      else skipped.push({ dot: broker.dot_number, company: broker.company_name, reason: result.reason || 'Skipped' });
    } catch (err) {
      skipped.push({ dot: broker.dot_number, company: broker.company_name, reason: err.message });
    }
  }
  return {
    ok: true,
    channel,
    sent: sent.length,
    skipped,
    results: sent,
    remaining: Math.max(0, brokers.length - cap),
    note: channel === 'sms' || channel === 'vapi'
      ? 'SMS and Vapi only go to numbers with prior consent, or rows you marked as already agreed. Cold email is allowed.'
      : 'CAN-SPAM email. Daily batch is capped so bounces stay visible. Next page skips these companies.'
  };
}

module.exports = {
  PAGE_SIZE,
  EMAIL_CAP,
  SMS_CAP,
  VAPI_CAP,
  ensureBrokerMarketingTables,
  filterKey,
  excludedDots,
  markShown,
  markContacted,
  resetShownKeepContacted,
  stats,
  nextBrokers,
  normalizeFilters,
  loadBrokersByDots,
  sendBrokerEmail,
  sendBrokerSms,
  sendBrokerVapi,
  outreachBrokers
};
