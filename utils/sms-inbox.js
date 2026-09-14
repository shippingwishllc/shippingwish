const pool = require('../db');
const { normalizePhone } = require('./sms');

const OUR_NUMBER = process.env.TWILIO_FROM_NUMBER || '+16094696004';

const SMS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sms_messages (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  twilio_sid TEXT,
  disposition TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created ON sms_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_from ON sms_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_sms_messages_to ON sms_messages(to_number);
`;

let tableReady = false;
let backfillDone = false;

async function ensureSmsMessagesTable() {
  if (tableReady) return;
  const statements = SMS_TABLE_SQL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_optouts (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});
  const check = await pool.query(`SELECT to_regclass('public.sms_messages') AS t`);
  if (!check.rows[0]?.t) {
    throw new Error('sms_messages table missing after ensure');
  }
  tableReady = true;
}

/** One-time import from voip_call_logs for SMS sent before sms_messages existed. */
async function backfillFromVoipLogs() {
  if (backfillDone) return;
  backfillDone = true;
  try {
    await ensureSmsMessagesTable();
    const existing = await pool.query('SELECT COUNT(*)::int AS c FROM sms_messages');
    if ((existing.rows[0]?.c || 0) > 0) return;

    const logs = await pool.query(`
      SELECT id, lead_id, sales_rep_id, call_type, from_number, to_number, disposition, notes, created_at
      FROM voip_call_logs
      WHERE call_type IN ('sms', 'inbound_sms')
      ORDER BY created_at ASC
      LIMIT 500
    `);
    for (const row of logs.rows) {
      if (row.call_type === 'inbound_sms') {
        await logSmsMessage({
          direction: 'inbound',
          from_number: row.from_number,
          to_number: row.to_number || OUR_NUMBER,
          body: String(row.notes || '').slice(0, 1600),
          lead_id: row.lead_id,
          disposition: row.disposition,
          is_read: false
        });
      } else if (row.call_type === 'sms' && row.to_number) {
        let body = String(row.notes || '');
        if (body.startsWith('SMS: ')) {
          body = body.split(' | Twilio SID:')[0].slice(5);
        }
        await logSmsMessage({
          direction: 'outbound',
          from_number: OUR_NUMBER,
          to_number: row.to_number,
          body: body.slice(0, 1600),
          lead_id: row.lead_id,
          sent_by: row.sales_rep_id,
          disposition: row.disposition,
          is_read: true
        });
      }
    }
    if (logs.rows.length) {
      console.log(`[SMS_INBOX] Backfilled ${logs.rows.length} SMS from voip_call_logs`);
    }
  } catch (err) {
    console.warn('[SMS_INBOX] backfill skipped:', err.message);
    backfillDone = false;
  }
}

function phoneTail(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

async function findLeadByPhone(phone) {
  const tail = phoneTail(phone);
  if (!tail) return null;
  const r = await pool.query(
    `SELECT id, company_name, owner_name, phone, sales_rep_id, status
     FROM crm_leads
     WHERE regexp_replace(phone, '\\D', '', 'g') LIKE '%' || $1
     ORDER BY last_contacted_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [tail]
  );
  return r.rows[0] || null;
}

async function isPhoneOptedOut(phone) {
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

async function logSmsMessage({
  direction,
  from_number,
  to_number,
  body,
  lead_id,
  sent_by,
  twilio_sid,
  disposition,
  is_read
}) {
  try {
    await ensureSmsMessagesTable();
    let lid = lead_id || null;
    if (!lid) {
      const peer = direction === 'inbound' ? from_number : to_number;
      const lead = await findLeadByPhone(peer);
      lid = lead?.id || null;
    }
    const readFlag = typeof is_read === 'boolean' ? is_read : direction === 'outbound';
    const r = await pool.query(
      `INSERT INTO sms_messages (
        lead_id, direction, from_number, to_number, body, twilio_sid, disposition, is_read, sent_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        lid,
        direction,
        normalizePhone(from_number) || from_number,
        normalizePhone(to_number) || to_number,
        String(body || '').slice(0, 1600),
        twilio_sid || null,
        disposition || null,
        readFlag,
        sent_by || null
      ]
    );
    return r.rows[0];
  } catch (err) {
    console.warn('[SMS_INBOX] log failed:', err.message);
    return null;
  }
}

function peerFromRow(row) {
  return row.direction === 'inbound' ? row.from_number : row.to_number;
}

module.exports = {
  OUR_NUMBER,
  ensureSmsMessagesTable,
  backfillFromVoipLogs,
  findLeadByPhone,
  isPhoneOptedOut,
  logSmsMessage,
  peerFromRow,
  phoneTail
};
