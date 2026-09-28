/**
 * utils/ai-safe-drip-engine.js
 * Retired queue. It texted and AI-called FMCSA leads who had not agreed to it.
 * Cold outreach is email only in utils/outreach-engine.js.
 */

const pool = require('../db');

const RETIRED_MESSAGE = 'This queue sent texts and AI calls to people who never agreed to them. Cold outreach now runs as email only from AI Dispatch → FMCSA outreach. Texts and AI calls go only to people who signed up or asked us to contact them.';

async function ensureDripQueueTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_outreach_queue (
      id SERIAL PRIMARY KEY,
      brand TEXT DEFAULT 'shippingwish',
      channel TEXT NOT NULL,
      target_role TEXT DEFAULT 'carrier',
      recipient_name TEXT,
      recipient_phone TEXT,
      recipient_email TEXT,
      equipment_type TEXT,
      state_code TEXT,
      custom_data JSONB DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      scheduled_for TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      disposition TEXT,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch((e) => console.warn('Drip queue table ensure notice:', e.message));
}

async function enqueueLeads() {
  throw new Error(RETIRED_MESSAGE);
}

async function processDripQueueTick() {
  await ensureDripQueueTable();
  const retired = await pool.query(
    `UPDATE ai_outreach_queue SET status = 'retired', disposition = 'Retired: no consent on file for cold texts or AI calls'
     WHERE status = 'pending' RETURNING id`
  ).catch(() => ({ rows: [] }));
  return { processed: false, retired: retired.rows.length, reason: RETIRED_MESSAGE };
}

async function getDripQueueStats() {
  await ensureDripQueueTable();
  const [countsRes, recentRes] = await Promise.all([
    pool.query('SELECT status, channel, COUNT(*) as count FROM ai_outreach_queue GROUP BY status, channel'),
    pool.query(
      `SELECT id, brand, channel, recipient_name, recipient_phone, recipient_email, status, scheduled_for, sent_at, disposition
       FROM ai_outreach_queue ORDER BY id DESC LIMIT 25`
    )
  ]);
  return {
    is_active: false,
    retired: true,
    message: RETIRED_MESSAGE,
    summary: countsRes.rows,
    recent: recentRes.rows
  };
}

module.exports = {
  ensureDripQueueTable,
  enqueueLeads,
  processDripQueueTick,
  getDripQueueStats,
  setDripEngineActive: () => {}
};
