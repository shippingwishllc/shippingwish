// utils/broker-credit.js
// Live Broker Credit Telemetry, Days-To-Pay (DTP) & $75,000 BMC-84 Bond Grading Engine
// Auto-recalculates broker credit grades (A+, A, B, C, D) from real Shipping Wish TMS
// settled invoices & factoring payment records (pure PostgreSQL, zero extra dependencies).

const pool = require('../db');

let creditSchemaReady = false;

async function ensureBrokerCreditSchema() {
  if (creditSchemaReady) return;
  await pool.query(`
    ALTER TABLE brokers ADD COLUMN IF NOT EXISTS credit_grade TEXT DEFAULT 'UNRATED';
    ALTER TABLE brokers ADD COLUMN IF NOT EXISTS days_to_pay_avg NUMERIC(5,1);
    ALTER TABLE brokers ADD COLUMN IF NOT EXISTS bond_status_active BOOLEAN DEFAULT TRUE;
    ALTER TABLE brokers ADD COLUMN IF NOT EXISTS bond_amount_usd INTEGER DEFAULT 75000;
    ALTER TABLE brokers ADD COLUMN IF NOT EXISTS factoring_approved BOOLEAN DEFAULT TRUE;
    ALTER TABLE brokers ADD COLUMN IF NOT EXISTS credit_last_updated_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS broker_payment_records (
      id SERIAL PRIMARY KEY,
      broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
      broker_mc TEXT,
      broker_name TEXT,
      load_id INTEGER,
      load_reference_id TEXT,
      invoice_id INTEGER,
      invoice_amount NUMERIC(12,2) DEFAULT 0,
      invoiced_at TIMESTAMPTZ NOT NULL,
      paid_at TIMESTAMPTZ NOT NULL,
      days_taken INTEGER NOT NULL,
      verified_source TEXT NOT NULL DEFAULT 'SHIPPING_WISH_TMS',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_broker_payment_records_broker ON broker_payment_records (broker_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_payment_records_invoice_uniq
      ON broker_payment_records (invoice_id) WHERE invoice_id IS NOT NULL;
  `);
  creditSchemaReady = true;
}

function computeCreditGrade(avgDtp, bondStatusActive = true) {
  if (bondStatusActive === false) return 'D';
  if (avgDtp === null || avgDtp === undefined || Number.isNaN(Number(avgDtp))) return 'UNRATED';
  const d = Number(avgDtp);
  if (d <= 15) return 'A+';
  if (d <= 22) return 'A';
  if (d <= 32) return 'B';
  if (d <= 45) return 'C';
  return 'D';
}

async function recalculateBrokerCredit(brokerId) {
  if (!brokerId) return null;
  await ensureBrokerCreditSchema();

  const bRes = await pool.query(
    `SELECT id, company_name, mc_number, dot_number, days_to_pay_avg, bond_status_active, bond_amount_usd
     FROM brokers WHERE id = $1 LIMIT 1`,
    [Number(brokerId)]
  );
  if (!bRes.rows.length) return null;
  const broker = bRes.rows[0];

  const statsRes = await pool.query(
    `SELECT AVG(days_taken)::numeric(5,1) AS avg_dtp, COUNT(*)::int AS sample_count
     FROM broker_payment_records
     WHERE broker_id = $1`,
    [broker.id]
  );

  const sampleCount = Number(statsRes.rows[0]?.sample_count || 0);
  const avgDtp = sampleCount > 0
    ? Number(statsRes.rows[0].avg_dtp)
    : (broker.days_to_pay_avg != null ? Number(broker.days_to_pay_avg) : null);

  const bondActive = broker.bond_status_active !== false;
  const grade = computeCreditGrade(avgDtp, bondActive);
  const factoringApproved = bondActive && ['A+', 'A', 'B'].includes(grade);

  const upd = await pool.query(
    `UPDATE brokers
     SET days_to_pay_avg = $2,
         credit_grade = $3,
         factoring_approved = $4,
         credit_last_updated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, company_name, mc_number, dot_number, credit_grade, days_to_pay_avg,
               bond_status_active, bond_amount_usd, factoring_approved, credit_last_updated_at`,
    [broker.id, avgDtp, grade, factoringApproved]
  );

  return { ...upd.rows[0], payment_samples: sampleCount };
}

async function findBrokerRow({ brokerId, brokerMc, brokerName }) {
  await ensureBrokerCreditSchema();
  if (brokerId) {
    const r = await pool.query(`SELECT id, company_name, mc_number FROM brokers WHERE id = $1 LIMIT 1`, [Number(brokerId)]);
    if (r.rows.length) return r.rows[0];
  }
  const mcDigits = String(brokerMc || '').replace(/\D/g, '');
  if (mcDigits.length >= 4) {
    const r = await pool.query(
      `SELECT id, company_name, mc_number FROM brokers
       WHERE regexp_replace(COALESCE(mc_number, ''), '[^0-9]', '', 'g') = $1
       LIMIT 1`,
      [mcDigits]
    );
    if (r.rows.length) return r.rows[0];
  }
  if (brokerName && String(brokerName).trim().length >= 3) {
    const r = await pool.query(
      `SELECT id, company_name, mc_number FROM brokers
       WHERE LOWER(company_name) = LOWER($1)
       LIMIT 1`,
      [String(brokerName).trim()]
    );
    if (r.rows.length) return r.rows[0];
  }
  return null;
}

async function recordBrokerPayment({
  brokerId,
  brokerMc,
  brokerName,
  loadId = null,
  loadReferenceId = null,
  invoiceId = null,
  invoiceAmount = 0,
  invoicedAt,
  paidAt,
  verifiedSource = 'SHIPPING_WISH_TMS'
}) {
  await ensureBrokerCreditSchema();
  const broker = await findBrokerRow({ brokerId, brokerMc, brokerName });
  if (!broker) return { ok: false, reason: 'Broker not found in directory' };

  const invDate = new Date(invoicedAt || Date.now());
  const payDate = new Date(paidAt || Date.now());
  if (isNaN(invDate.getTime()) || isNaN(payDate.getTime())) {
    return { ok: false, reason: 'Invalid invoice or payment date' };
  }

  const rawDays = Math.round((payDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysTaken = Math.max(1, Math.min(365, rawDays));

  await pool.query(
    `INSERT INTO broker_payment_records (
       broker_id, broker_mc, broker_name, load_id, load_reference_id, invoice_id,
       invoice_amount, invoiced_at, paid_at, days_taken, verified_source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET
       paid_at = EXCLUDED.paid_at,
       days_taken = EXCLUDED.days_taken`,
    [
      broker.id,
      broker.mc_number || brokerMc || null,
      broker.company_name || brokerName || null,
      loadId || null,
      loadReferenceId || null,
      invoiceId || null,
      Number(invoiceAmount || 0),
      invDate.toISOString(),
      payDate.toISOString(),
      daysTaken,
      String(verifiedSource || 'SHIPPING_WISH_TMS').slice(0, 60)
    ]
  );

  const updatedBroker = await recalculateBrokerCredit(broker.id);
  return { ok: true, days_taken: daysTaken, broker: updatedBroker };
}

async function recordBrokerPaymentFromInvoice(invoiceId) {
  if (!invoiceId) return null;
  try {
    const res = await pool.query(
      `SELECT i.id AS invoice_id, i.load_id, i.total_amount, i.created_at, i.issue_date, i.paid_date,
              l.load_number, l.broker_name, l.broker_mc
       FROM invoices i
       LEFT JOIN loads l ON l.id = i.load_id
       WHERE i.id = $1 LIMIT 1`,
      [Number(invoiceId)]
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    if (!row.broker_mc && !row.broker_name) return null;

    return await recordBrokerPayment({
      brokerMc: row.broker_mc,
      brokerName: row.broker_name,
      loadId: row.load_id,
      loadReferenceId: row.load_number || null,
      invoiceId: row.invoice_id,
      invoiceAmount: Number(row.total_amount || 0),
      invoicedAt: row.issue_date || row.created_at || new Date(),
      paidAt: row.paid_date || new Date(),
      verifiedSource: 'SHIPPING_WISH_TMS'
    });
  } catch (_) {
    return null;
  }
}

async function getBrokerCreditTelemetry(mcOrId) {
  await ensureBrokerCreditSchema();
  const raw = String(mcOrId || '').trim();
  const isNumericId = /^\d{1,6}$/.test(raw) && !raw.toUpperCase().startsWith('MC');
  const mcDigits = raw.replace(/\D/g, '');

  let bRes;
  if (isNumericId) {
    bRes = await pool.query(
      `SELECT id, company_name, mc_number, dot_number, email, phone,
              credit_grade, days_to_pay_avg, bond_status_active, bond_amount_usd,
              factoring_approved, credit_last_updated_at
       FROM brokers
       WHERE id = $1 OR regexp_replace(COALESCE(mc_number, ''), '[^0-9]', '', 'g') = $2
       LIMIT 1`,
      [Number(raw), mcDigits]
    );
  } else {
    bRes = await pool.query(
      `SELECT id, company_name, mc_number, dot_number, email, phone,
              credit_grade, days_to_pay_avg, bond_status_active, bond_amount_usd,
              factoring_approved, credit_last_updated_at
       FROM brokers
       WHERE regexp_replace(COALESCE(mc_number, ''), '[^0-9]', '', 'g') = $1
          OR LOWER(company_name) = LOWER($2)
       LIMIT 1`,
      [mcDigits || '__none__', raw]
    );
  }

  if (!bRes.rows.length) return null;
  const b = bRes.rows[0];

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS samples FROM broker_payment_records WHERE broker_id = $1`,
    [b.id]
  ).catch(() => ({ rows: [{ samples: 0 }] }));

  return {
    id: b.id,
    company_name: b.company_name,
    mc_number: b.mc_number,
    dot_number: b.dot_number,
    credit_grade: b.credit_grade || 'UNRATED',
    days_to_pay_avg: b.days_to_pay_avg != null ? Number(b.days_to_pay_avg) : null,
    bond_status_active: b.bond_status_active !== false,
    bond_amount_usd: Number(b.bond_amount_usd || 75000),
    factoring_approved: b.factoring_approved !== false,
    payment_samples: Number(countRes.rows[0]?.samples || 0),
    credit_last_updated_at: b.credit_last_updated_at
  };
}

module.exports = {
  ensureBrokerCreditSchema,
  computeCreditGrade,
  recalculateBrokerCredit,
  recordBrokerPayment,
  recordBrokerPaymentFromInvoice,
  getBrokerCreditTelemetry
};
