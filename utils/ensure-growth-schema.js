const fs = require('fs');
const path = require('path');
const pool = require('../db');

let ran = false;

/** Core CRM tables — production DBs often never ran full schema.sql */
const CRM_CORE_SQL = `
CREATE TABLE IF NOT EXISTS crm_leads (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  mc_number TEXT,
  dot_number TEXT,
  equipment_type TEXT DEFAULT '53ft Dry Van',
  num_trucks INTEGER DEFAULT 1,
  target_lanes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_tasks (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE CASCADE,
  task_title TEXT NOT NULL,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  email_type TEXT DEFAULT 'outreach',
  status TEXT DEFAULT 'sent',
  resend_id TEXT,
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voip_call_logs (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voip_provider TEXT NOT NULL DEFAULT 'OpenPhone',
  call_type TEXT DEFAULT 'outbound_call',
  from_number TEXT,
  to_number TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  disposition TEXT DEFAULT 'completed',
  recording_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_sales_rep ON crm_leads(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON lead_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON lead_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_email_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_voip_lead ON voip_call_logs(lead_id);
`;

async function runStatements(sql, label) {
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
  let ok = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt.endsWith(';') ? stmt : stmt + ';');
      ok += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[${label}] statement skipped:`, err.message);
    }
  }
  return { ok, failed };
}

async function ensureCrmCoreTables() {
  const { ok, failed } = await runStatements(CRM_CORE_SQL, 'CRM');
  console.log(`[CRM] Core tables ensured (${ok} ok, ${failed} skipped)`);
}

async function ensureGrowthSchema() {
  if (ran) return;
  ran = true;
  try {
    await ensureCrmCoreTables();
  } catch (err) {
    console.warn('[CRM] Core ensure failed:', err.message);
  }

  const file = path.join(__dirname, '..', 'sql', 'migrations', 'v3_growth_engine.sql');
  try {
    const sql = fs.readFileSync(file, 'utf8');
    const { ok, failed } = await runStatements(sql, 'GROWTH');
    console.log(`[GROWTH] Schema v3 applied (${ok} ok, ${failed} skipped)`);
  } catch (err) {
    console.warn('[GROWTH] Schema apply skipped:', err.message);
  }

  const fileV4 = path.join(__dirname, '..', 'sql', 'migrations', 'v4_signup_otp_trial.sql');
  try {
    const sqlV4 = fs.readFileSync(fileV4, 'utf8');
    const { ok, failed } = await runStatements(sqlV4, 'OTP_TRIAL');
    console.log(`[OTP_TRIAL] Schema v4 applied (${ok} ok, ${failed} skipped)`);
  } catch (err) {
    console.warn('[OTP_TRIAL] Schema apply skipped:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signup_pending (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        otp_hash TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        company_name TEXT,
        phone TEXT,
        mc_number TEXT,
        dot_number TEXT,
        address TEXT,
        signup_ip TEXT,
        user_agent TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_signup_pending_email ON signup_pending(lower(email))'
    ).catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ');
  } catch (err) {
    console.warn('[OTP_TRIAL] direct ensure skipped:', err.message);
  }

  const fileV5 = path.join(__dirname, '..', 'sql', 'migrations', 'v5_soft_delete.sql');
  try {
    const sqlV5 = fs.readFileSync(fileV5, 'utf8');
    const { ok, failed } = await runStatements(sqlV5, 'SOFT_DELETE');
    console.log(`[SOFT_DELETE] Schema v5 applied (${ok} ok, ${failed} skipped)`);
  } catch (err) {
    console.warn('[SOFT_DELETE] Schema apply skipped:', err.message);
  }

  try {
    await pool.query('ALTER TABLE loads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE loads ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
  } catch (err) {
    console.warn('[SOFT_DELETE] direct ensure skipped:', err.message);
  }
}

/** Call from CRM import if table still missing (serverless race / cold start). */
async function ensureCrmLeadsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_leads (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      owner_name TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      mc_number TEXT,
      dot_number TEXT,
      equipment_type TEXT DEFAULT '53ft Dry Van',
      num_trucks INTEGER DEFAULT 1,
      target_lanes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      last_contacted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_tasks (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES crm_leads(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES users(id) ON DELETE CASCADE,
      task_title TEXT NOT NULL,
      due_date DATE NOT NULL DEFAULT CURRENT_DATE,
      is_completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});
}

module.exports = { ensureGrowthSchema, ensureCrmCoreTables, ensureCrmLeadsTable };
