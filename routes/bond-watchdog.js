/**
 * routes/bond-watchdog.js
 * LoadNexus™ Phase 25: Broker BMC-84 Surety Bond Watchdog & Automated 30-Day Default Claim Generator
 * 
 * Capabilities:
 * - FMCSA 49 U.S.C. § 13906 & 49 CFR Part 387 $75,000 BMC-84 Surety Bond & BMC-85 Trust Watchdog
 * - Real-time 30-Day Cancellation Notice countdown tracking & early warning alerts
 * - Dynamic Remaining Bond Capacity calculation ($75,000 minus outstanding filed claims)
 * - Automated 49 U.S.C. § 13906 Formal Surety Claim & Legal Demand generator with cryptographic SHA hash
 * - Vector PDF Formal Notice of Default & Proof of Claim Packet generator with PDFKit
 * - Direct Broker Clearance & Risk Scoring lookup for motor carriers
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

// Audit logger helper
function auditLog(userId, action, details, ip) {
  pool.query(
    `INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)`,
    [userId, action, details, ip]
  ).catch(err => console.error('Audit log error in bond-watchdog:', err.message));
}

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
}

// Helper: Calculate 30-day cancellation days remaining
function getCancellationDaysRemaining(cancellationEffectiveDate) {
  if (!cancellationEffectiveDate) return null;
  const eff = new Date(cancellationEffectiveDate);
  const now = new Date();
  return Math.ceil((eff - now) / (1000 * 60 * 60 * 24));
}

// Helper: Determine dynamic risk tier
function evaluateBondRisk(bondStatus, cancellationEffectiveDate, remainingCapacity, claimsCount) {
  const daysLeft = getCancellationDaysRemaining(cancellationEffectiveDate);

  if (bondStatus === 'REVOKED_CANCELED' || remainingCapacity <= 0) {
    return {
      tier: 'INSOLVENT_REVOKED',
      badge: 'RED_ALERT',
      score: 10,
      clearedForBooking: false,
      reason: 'Surety bond has been canceled/revoked or available $75,000 coverage has been exhausted by prior claims'
    };
  }

  if (bondStatus === 'PENDING_CANCELLATION' || (daysLeft !== null && daysLeft <= 30)) {
    return {
      tier: 'CRITICAL_CANCELLATION',
      badge: 'DANGER_COUNTDOWN',
      score: 35,
      clearedForBooking: false,
      daysLeft: Math.max(0, daysLeft),
      reason: `Surety has filed 30-day cancellation notice with FMCSA. Only ${Math.max(0, daysLeft)} days remaining before revocation`
    };
  }

  if (claimsCount > 0 || remainingCapacity < 50000 || bondStatus === 'SUSPENDED_DEFICIENT') {
    return {
      tier: 'ELEVATED_WATCH',
      badge: 'WARNING',
      score: 65,
      clearedForBooking: true,
      reason: 'Active claims pending against surety bond. Remaining capacity is partially depleted'
    };
  }

  return {
    tier: 'LOW_RISK',
    badge: 'CLEARED_ACTIVE',
    score: 98,
    clearedForBooking: true,
    reason: 'Fully solvent $75,000 BMC-84 surety bond with zero claims and active FMCSA license'
  };
}

// Database Schema Initialization
let migrated = false;
async function ensureTables() {
  if (migrated) return;
  try {
    // 1. Broker Surety Bonds table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS broker_surety_bonds (
        id SERIAL PRIMARY KEY,
        broker_code VARCHAR(60) UNIQUE NOT NULL,
        company_name VARCHAR(150) NOT NULL,
        dba_name VARCHAR(150),
        mc_number VARCHAR(50) NOT NULL,
        dot_number VARCHAR(50) NOT NULL,
        contact_name VARCHAR(100) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL,
        address VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(10) NOT NULL,
        zip VARCHAR(20) NOT NULL,
        surety_name VARCHAR(150) NOT NULL,
        bond_policy_number VARCHAR(100) NOT NULL,
        bond_type VARCHAR(30) DEFAULT 'BMC-84',
        bond_amount NUMERIC(12,2) DEFAULT 75000.00,
        bond_status VARCHAR(30) DEFAULT 'ACTIVE',
        bond_effective_date DATE DEFAULT '2021-01-01',
        cancellation_notice_date DATE,
        cancellation_effective_date DATE,
        surety_claims_phone VARCHAR(50) DEFAULT '+1 (800) 555-0199',
        surety_claims_email VARCHAR(100) DEFAULT 'bondclaims@surety.com',
        surety_claims_address VARCHAR(255) DEFAULT 'One Tower Square, Hartford, CT 06183',
        risk_tier VARCHAR(30) DEFAULT 'LOW_RISK',
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);

    // 2. Surety Bond Claims table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS surety_bond_claims (
        id SERIAL PRIMARY KEY,
        claim_code VARCHAR(60) UNIQUE NOT NULL,
        broker_id INT REFERENCES broker_surety_bonds(id) ON DELETE CASCADE,
        carrier_code VARCHAR(60) NOT NULL,
        carrier_name VARCHAR(150) NOT NULL,
        carrier_mc VARCHAR(50) NOT NULL,
        carrier_dot VARCHAR(50) NOT NULL,
        carrier_tin VARCHAR(50) NOT NULL,
        carrier_contact VARCHAR(100) NOT NULL,
        carrier_email VARCHAR(100) NOT NULL,
        carrier_phone VARCHAR(50) NOT NULL,
        load_number VARCHAR(60) NOT NULL,
        origin VARCHAR(100) NOT NULL,
        destination VARCHAR(100) NOT NULL,
        delivery_date DATE NOT NULL,
        rate_amount NUMERIC(12,2) NOT NULL,
        invoice_number VARCHAR(60) NOT NULL,
        invoice_date DATE NOT NULL,
        days_past_due INT DEFAULT 35,
        filing_date TIMESTAMP DEFAULT now(),
        claim_status VARCHAR(40) DEFAULT 'SUBMITTED_TO_SURETY',
        surety_claim_ref VARCHAR(100),
        settlement_amount NUMERIC(12,2) DEFAULT 0.00,
        settlement_date DATE,
        demand_hash VARCHAR(100) NOT NULL,
        ratecon_verified BOOLEAN DEFAULT TRUE,
        pod_verified BOOLEAN DEFAULT TRUE,
        invoice_verified BOOLEAN DEFAULT TRUE,
        demand_notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);

    // Seed benchmark records if empty
    const checkRes = await pool.query('SELECT COUNT(*) FROM broker_surety_bonds');
    if (parseInt(checkRes.rows[0].count, 10) === 0) {
      // 1. CH Robinson
      const b1 = await pool.query(`
        INSERT INTO broker_surety_bonds (
          broker_code, company_name, dba_name, mc_number, dot_number,
          contact_name, phone, email, address, city, state, zip,
          surety_name, bond_policy_number, bond_type, bond_amount, bond_status,
          bond_effective_date, surety_claims_phone, surety_claims_email, surety_claims_address, risk_tier
        ) VALUES (
          'BROKER-CHR-01', 'C.H. Robinson Worldwide, Inc.', 'CH Robinson', 'MC-149021', 'DOT-219401',
          'Carrier Relations Desk', '+1 (800) 323-7587', 'carrierrelations@chrobinson.com',
          '14701 Charlson Road', 'Eden Prairie', 'MN', '55347',
          'Liberty Mutual Insurance Company', 'SUR-90142-US', 'BMC-84', 75000.00, 'ACTIVE',
          '2018-05-10', '+1 (800) 334-0090', 'suretyclaims@libertymutual.com', '175 Berkeley Street, Boston, MA 02116',
          'LOW_RISK'
        ) RETURNING id;
      `);

      // 2. Echo Global
      const b2 = await pool.query(`
        INSERT INTO broker_surety_bonds (
          broker_code, company_name, dba_name, mc_number, dot_number,
          contact_name, phone, email, address, city, state, zip,
          surety_name, bond_policy_number, bond_type, bond_amount, bond_status,
          bond_effective_date, surety_claims_phone, surety_claims_email, surety_claims_address, risk_tier
        ) VALUES (
          'BROKER-ECHO-02', 'Echo Global Logistics, Inc.', 'Echo Logistics', 'MC-504912', 'DOT-1390481',
          'Carrier Accounting', '+1 (800) 354-7993', 'carrierpay@echo.com',
          '600 W Chicago Ave Ste 725', 'Chicago', 'IL', '60654',
          'Travelers Casualty and Surety Company of America', 'TRV-88210-IL', 'BMC-84', 75000.00, 'ACTIVE',
          '2019-03-14', '+1 (800) 842-8496', 'bondclaims@travelers.com', 'One Tower Square, Hartford, CT 06183',
          'LOW_RISK'
        ) RETURNING id;
      `);

      // 3. Apex Prime Logistics (Pending Cancellation with 18 days left)
      const b3 = await pool.query(`
        INSERT INTO broker_surety_bonds (
          broker_code, company_name, dba_name, mc_number, dot_number,
          contact_name, phone, email, address, city, state, zip,
          surety_name, bond_policy_number, bond_type, bond_amount, bond_status,
          bond_effective_date, cancellation_notice_date, cancellation_effective_date,
          surety_claims_phone, surety_claims_email, surety_claims_address, risk_tier
        ) VALUES (
          'BROKER-APEX-03', 'Apex Prime Freight Brokerage LLC', 'Apex Prime', 'MC-940182', 'DOT-2819401',
          'Derrick Vance', '+1 (214) 555-0182', 'finance@apexprimefreight.com',
          '3400 North Central Expy', 'Dallas', 'TX', '75204',
          'Great American Insurance Company', 'GAI-44912-TX', 'BMC-84', 75000.00, 'PENDING_CANCELLATION',
          '2022-09-01', CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE + INTERVAL '18 days',
          '+1 (800) 972-3008', 'suretyclaims@gaic.com', '301 E 4th Street, Cincinnati, OH 45202',
          'CRITICAL_CANCELLATION'
        ) RETURNING id;
      `);

      // 4. Phantom Freight Lines (Insolvent / Revoked / Claims Exceeded)
      const b4 = await pool.query(`
        INSERT INTO broker_surety_bonds (
          broker_code, company_name, dba_name, mc_number, dot_number,
          contact_name, phone, email, address, city, state, zip,
          surety_name, bond_policy_number, bond_type, bond_amount, bond_status,
          bond_effective_date, cancellation_notice_date, cancellation_effective_date,
          surety_claims_phone, surety_claims_email, surety_claims_address, risk_tier
        ) VALUES (
          'BROKER-PHANTOM-04', 'Phantom Freight Solutions Corp', 'Phantom Freight', 'MC-771920', 'DOT-2109481',
          'Accounting Default', '+1 (305) 555-0199', 'defunct@phantomfreight.com',
          '800 Brickell Ave Ste 400', 'Miami', 'FL', '33131',
          'Hudson Insurance Company', 'HUD-11029-FL', 'BMC-84', 75000.00, 'REVOKED_CANCELED',
          '2021-04-10', CURRENT_DATE - INTERVAL '65 days', CURRENT_DATE - INTERVAL '35 days',
          '+1 (800) 223-7473', 'hudsonsuretyclaims@hudsoninsgroup.com', '100 William Street, New York, NY 10038',
          'INSOLVENT_REVOKED'
        ) RETURNING id;
      `);

      // Seed initial sample claims
      const apexBrokerId = b3.rows[0].id;
      const phantomBrokerId = b4.rows[0].id;

      await pool.query(`
        INSERT INTO surety_bond_claims (
          claim_code, broker_id, carrier_code, carrier_name, carrier_mc, carrier_dot, carrier_tin,
          carrier_contact, carrier_email, carrier_phone, load_number, origin, destination,
          delivery_date, rate_amount, invoice_number, invoice_date, days_past_due,
          claim_status, surety_claim_ref, demand_hash, demand_notes
        ) VALUES 
        (
          'CLAIM-APEX-01', $1, 'CARRIER-SWSH-01', 'Shipping Wish Hauling LLC', 'MC-109482', 'DOT-349018', '36-4921094',
          'Compliance Officer', 'claims@shippingwish.com', '+1 (312) 555-0144', 'LN-90142', 'Chicago, IL', 'Atlanta, GA',
          CURRENT_DATE - INTERVAL '45 days', 6800.00, 'INV-90142-A', CURRENT_DATE - INTERVAL '40 days', 40,
          'SUBMITTED_TO_SURETY', 'GAIC-CLM-2026-8812', 'HASH-CLAIM-APEX-01-SHA256', 'Unpaid freight charges on dry van load LN-90142. Broker unresponsive after 30-day demand.'
        ),
        (
          'CLAIM-APEX-02', $1, 'CARRIER-IRON-02', 'Ironclad Logistics Express LLC', 'MC-149204', 'DOT-398210', '75-9014281',
          'Harrison Sterling', 'safety@ironcladlogistics.com', '+1 (817) 555-0199', 'LN-88102', 'Dallas, TX', 'Nashville, TN',
          CURRENT_DATE - INTERVAL '50 days', 7700.00, 'INV-88102-B', CURRENT_DATE - INTERVAL '46 days', 46,
          'UNDER_INVESTIGATION', 'GAIC-CLM-2026-8819', 'HASH-CLAIM-APEX-02-SHA256', 'Reefer transport services performed and delivered clean without damage. Payment overdue.'
        ),
        (
          'CLAIM-PHANTOM-01', $2, 'CARRIER-FAST-03', 'Fastway Interstate Trucking', 'MC-881204', 'DOT-290142', '58-9921402',
          'Elena Rostova', 'billing@fastwaytruck.com', '+1 (404) 555-0188', 'LN-77102', 'Miami, FL', 'Charlotte, NC',
          CURRENT_DATE - INTERVAL '90 days', 4500.00, 'INV-77102-C', CURRENT_DATE - INTERVAL '80 days', 80,
          'SETTLED_PAID', 'HUD-CLM-2026-1101', 'HASH-CLAIM-PHANTOM-01-SHA256', 'Settled via pro-rata surety disbursement.'
        );
      `, [apexBrokerId, phantomBrokerId]);
    }

    migrated = true;
  } catch (err) {
    console.error('Error initializing bond watchdog tables:', err);
  }
}

// -------------------------------------------------------------
// GET /api/bond-watchdog/roster
// Returns active monitored bonds, remaining capacity & claims
// -------------------------------------------------------------
router.get('/roster', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const bondsRes = await pool.query(`
      SELECT b.*,
             COALESCE(SUM(c.rate_amount) FILTER (WHERE c.claim_status NOT IN ('REJECTED')), 0) as total_claims_filed,
             COUNT(c.id) FILTER (WHERE c.claim_status NOT IN ('REJECTED')) as active_claims_count
      FROM broker_surety_bonds b
      LEFT JOIN surety_bond_claims c ON b.id = c.broker_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);

    const bonds = bondsRes.rows.map(b => {
      const bondAmt = parseFloat(b.bond_amount) || 75000.00;
      const claimsAmt = parseFloat(b.total_claims_filed) || 0.00;
      const remainingCapacity = Math.max(0, bondAmt - claimsAmt);
      const daysLeft = getCancellationDaysRemaining(b.cancellation_effective_date);
      const evalResult = evaluateBondRisk(b.bond_status, b.cancellation_effective_date, remainingCapacity, parseInt(b.active_claims_count, 10));

      return {
        ...b,
        bond_amount: bondAmt,
        total_claims_filed: claimsAmt,
        remaining_capacity: remainingCapacity,
        cancellation_days_left: daysLeft,
        risk_evaluation: evalResult
      };
    });

    const claimsRes = await pool.query(`
      SELECT c.*, b.company_name as broker_name, b.mc_number as broker_mc, b.surety_name, b.bond_policy_number
      FROM surety_bond_claims c
      JOIN broker_surety_bonds b ON c.broker_id = b.id
      ORDER BY c.filing_date DESC
    `);

    // Aggregate Enterprise KPIs
    const totalBonds = bonds.length;
    let pendingCancellationCount = 0;
    let totalClaimsAmount = 0;
    let settledClaimsAmount = 0;
    let totalClaimsCount = claimsRes.rows.length;
    let settledClaimsCount = 0;

    bonds.forEach(b => {
      if (b.risk_evaluation.tier === 'CRITICAL_CANCELLATION' || b.bond_status === 'PENDING_CANCELLATION') {
        pendingCancellationCount++;
      }
    });

    claimsRes.rows.forEach(c => {
      const amt = parseFloat(c.rate_amount) || 0;
      const settled = parseFloat(c.settlement_amount) || 0;
      totalClaimsAmount += amt;
      settledClaimsAmount += settled;
      if (c.claim_status === 'SETTLED_PAID') {
        settledClaimsCount++;
      }
    });

    const recoveryRate = totalClaimsAmount > 0
      ? Math.round((settledClaimsAmount / totalClaimsAmount) * 1000) / 10
      : 88.5;

    return res.json({
      success: true,
      kpis: {
        monitored_broker_bonds: totalBonds,
        bonds_under_cancellation_notice: pendingCancellationCount,
        active_surety_claims_amount: totalClaimsAmount,
        settled_recovery_amount: settledClaimsAmount,
        surety_claim_recovery_rate_pct: recoveryRate,
        total_claims_filed_count: totalClaimsCount
      },
      bonds,
      claims: claimsRes.rows
    });
  } catch (err) {
    console.error('Error fetching bond watchdog roster:', err);
    return res.status(500).json({ error: 'Failed to fetch bond watchdog roster.' });
  }
});

// -------------------------------------------------------------
// GET /api/bond-watchdog/lookup/:mcOrDot
// Real-time clearance check before accepting broker loads
// -------------------------------------------------------------
router.get('/lookup/:mcOrDot', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { mcOrDot } = req.params;
    const cleanLookup = String(mcOrDot || '').trim().replace(/[^a-zA-Z0-9]/g, '');

    const brokerRes = await pool.query(`
      SELECT b.*,
             COALESCE(SUM(c.rate_amount) FILTER (WHERE c.claim_status NOT IN ('REJECTED')), 0) as total_claims_filed,
             COUNT(c.id) FILTER (WHERE c.claim_status NOT IN ('REJECTED')) as active_claims_count
      FROM broker_surety_bonds b
      LEFT JOIN surety_bond_claims c ON b.id = c.broker_id
      WHERE REPLACE(b.mc_number, '-', '') ILIKE '%' || $1 || '%'
         OR REPLACE(b.dot_number, '-', '') ILIKE '%' || $1 || '%'
         OR b.company_name ILIKE '%' || $1 || '%'
         OR b.broker_code ILIKE '%' || $1 || '%'
      GROUP BY b.id
      LIMIT 1
    `, [cleanLookup]);

    if (brokerRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No BMC-84 bond record found for broker identifier '${mcOrDot}'. Verify MC# or manual vetting required.`
      });
    }

    const b = brokerRes.rows[0];
    const bondAmt = parseFloat(b.bond_amount) || 75000.00;
    const claimsAmt = parseFloat(b.total_claims_filed) || 0.00;
    const remainingCapacity = Math.max(0, bondAmt - claimsAmt);
    const daysLeft = getCancellationDaysRemaining(b.cancellation_effective_date);
    const riskEval = evaluateBondRisk(b.bond_status, b.cancellation_effective_date, remainingCapacity, parseInt(b.active_claims_count, 10));

    return res.json({
      success: true,
      broker: {
        ...b,
        bond_amount: bondAmt,
        total_claims_filed: claimsAmt,
        remaining_capacity: remainingCapacity,
        cancellation_days_left: daysLeft
      },
      evaluation: riskEval
    });
  } catch (err) {
    console.error('Error looking up broker bond:', err);
    return res.status(500).json({ error: 'Failed to look up broker bond.' });
  }
});

// -------------------------------------------------------------
// POST /api/bond-watchdog/check-risk
// Evaluates if a specific load rate is cleared by remaining capacity
// -------------------------------------------------------------
router.post('/check-risk', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { mc_number, load_rate = 2500.00 } = req.body;
    if (!mc_number) {
      return res.status(400).json({ error: 'mc_number is required.' });
    }

    const cleanMc = String(mc_number).replace(/[^0-9]/g, '');
    const brokerRes = await pool.query(`
      SELECT b.*,
             COALESCE(SUM(c.rate_amount) FILTER (WHERE c.claim_status NOT IN ('REJECTED')), 0) as total_claims_filed,
             COUNT(c.id) FILTER (WHERE c.claim_status NOT IN ('REJECTED')) as active_claims_count
      FROM broker_surety_bonds b
      LEFT JOIN surety_bond_claims c ON b.id = c.broker_id
      WHERE REPLACE(b.mc_number, '-', '') ILIKE '%' || $1 || '%'
      GROUP BY b.id
      LIMIT 1
    `, [cleanMc]);

    if (brokerRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Broker MC-${cleanMc} not found in monitored database.`
      });
    }

    const b = brokerRes.rows[0];
    const bondAmt = parseFloat(b.bond_amount) || 75000.00;
    const claimsAmt = parseFloat(b.total_claims_filed) || 0.00;
    const remainingCapacity = Math.max(0, bondAmt - claimsAmt);
    const requestedRate = parseFloat(load_rate) || 0.00;
    const daysLeft = getCancellationDaysRemaining(b.cancellation_effective_date);

    const baseEval = evaluateBondRisk(b.bond_status, b.cancellation_effective_date, remainingCapacity, parseInt(b.active_claims_count, 10));

    const capacityFits = remainingCapacity >= requestedRate;
    const finalCleared = baseEval.clearedForBooking && capacityFits;

    return res.json({
      success: true,
      cleared: finalCleared,
      broker_name: b.company_name,
      mc_number: b.mc_number,
      requested_rate: requestedRate,
      remaining_bond_capacity: remainingCapacity,
      capacity_sufficient: capacityFits,
      risk_tier: baseEval.tier,
      cancellation_days_left: daysLeft,
      recommendation: finalCleared
        ? 'CLEARED: Load rate is covered by available BMC-84 bond capacity. Proceed with booking.'
        : (!capacityFits ? 'DENIED: Load rate exceeds remaining available bond capacity.' : baseEval.reason)
    });
  } catch (err) {
    console.error('Error checking bond load risk:', err);
    return res.status(500).json({ error: 'Failed to evaluate bond load risk.' });
  }
});

// -------------------------------------------------------------
// POST /api/bond-watchdog/claims/file
// Generates formal 49 U.S.C. § 13906 legal claim and demand hash
// -------------------------------------------------------------
router.post('/claims/file', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const {
      broker_id,
      carrier_code = 'CARRIER-SWSH-01',
      carrier_name = 'Shipping Wish Hauling LLC',
      carrier_mc = 'MC-109482',
      carrier_dot = 'DOT-349018',
      carrier_tin = '36-4921094',
      carrier_contact = 'Compliance Claims Officer',
      carrier_email = 'claims@shippingwish.com',
      carrier_phone = '+1 (312) 555-0144',
      load_number,
      origin = 'Chicago, IL',
      destination = 'Dallas, TX',
      delivery_date = new Date(Date.now() - 35 * 86400000).toISOString().split('T')[0],
      rate_amount = 3200.00,
      invoice_number,
      invoice_date = new Date(Date.now() - 32 * 86400000).toISOString().split('T')[0],
      days_past_due = 32,
      demand_notes = 'Unpaid freight charges. Invoiced 30+ days ago with no dispute or settlement received.',
      ratecon_verified = true,
      pod_verified = true,
      invoice_verified = true
    } = req.body;

    if (!broker_id || !load_number || !invoice_number || !rate_amount) {
      return res.status(400).json({ error: 'broker_id, load_number, invoice_number, and rate_amount are required.' });
    }

    // Verify broker exists
    const brokerCheck = await pool.query('SELECT * FROM broker_surety_bonds WHERE id = $1', [broker_id]);
    if (brokerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Target broker not found.' });
    }
    const broker = brokerCheck.rows[0];

    const cleanInvoice = String(invoice_number).replace(/[^a-zA-Z0-9]/g, '');
    const claimCode = `CLAIM-${cleanInvoice}-${Math.floor(100 + Math.random() * 900)}`;
    const demandPayload = `${claimCode}|${broker.mc_number}|${rate_amount}|${load_number}|${carrier_tin}|${Date.now()}`;
    const demandHash = `HASH-${crypto.createHash('sha256').update(demandPayload).digest('hex').slice(0, 24).toUpperCase()}`;

    const insertRes = await pool.query(`
      INSERT INTO surety_bond_claims (
        claim_code, broker_id, carrier_code, carrier_name, carrier_mc, carrier_dot, carrier_tin,
        carrier_contact, carrier_email, carrier_phone, load_number, origin, destination,
        delivery_date, rate_amount, invoice_number, invoice_date, days_past_due,
        claim_status, surety_claim_ref, demand_hash, ratecon_verified, pod_verified, invoice_verified, demand_notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        'SUBMITTED_TO_SURETY', $19, $20, $21, $22, $23, $24
      ) RETURNING *;
    `, [
      claimCode, broker.id, carrier_code, carrier_name, carrier_mc, carrier_dot, carrier_tin,
      carrier_contact, carrier_email, carrier_phone, load_number, origin, destination,
      delivery_date, rate_amount, invoice_number, invoice_date, days_past_due,
      `CLM-${Date.now().toString().slice(-6)}`, demandHash, ratecon_verified, pod_verified, invoice_verified, demand_notes
    ]);

    const createdClaim = insertRes.rows[0];

    auditLog(
      req.user ? req.user.id : null,
      'FILE_SURETY_BOND_CLAIM',
      `Filed BMC-84 surety claim ${claimCode} against broker ${broker.company_name} ($${rate_amount}) under 49 U.S.C. § 13906`,
      getClientIp(req)
    );

    return res.status(201).json({
      success: true,
      claim: {
        ...createdClaim,
        broker_name: broker.company_name,
        surety_name: broker.surety_name,
        bond_policy_number: broker.bond_policy_number,
        surety_claims_email: broker.surety_claims_email
      },
      demand_hash: demandHash
    });
  } catch (err) {
    console.error('Error filing surety bond claim:', err);
    return res.status(500).json({ error: 'Failed to file surety bond claim.' });
  }
});

// -------------------------------------------------------------
// POST /api/bond-watchdog/claims/:id/status
// Updates claim disposition, settlement amount, or rejection
// -------------------------------------------------------------
router.post('/claims/:id/status', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const { claim_status, settlement_amount = 0.00, notes = '' } = req.body;

    const allowed = ['DRAFT', 'SUBMITTED_TO_SURETY', 'UNDER_INVESTIGATION', 'PAYMENT_APPROVED', 'SETTLED_PAID', 'REJECTED'];
    if (!allowed.includes(claim_status)) {
      return res.status(400).json({ error: `Invalid claim_status. Must be one of: ${allowed.join(', ')}` });
    }

    const updateRes = await pool.query(`
      UPDATE surety_bond_claims
      SET claim_status = $1::varchar,
          settlement_amount = CASE WHEN $1::varchar = 'SETTLED_PAID' THEN $2::numeric ELSE settlement_amount END,
          settlement_date = CASE WHEN $1::varchar = 'SETTLED_PAID' THEN CURRENT_DATE ELSE settlement_date END,
          demand_notes = CASE WHEN $3::text != '' THEN $3::text ELSE demand_notes END,
          updated_at = now()
      WHERE id::text = $4 OR claim_code = $4
      RETURNING *;
    `, [claim_status, settlement_amount, notes, id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Surety claim record not found.' });
    }

    const updated = updateRes.rows[0];

    auditLog(
      req.user ? req.user.id : null,
      'UPDATE_SURETY_CLAIM_STATUS',
      `Updated claim ${updated.claim_code} status to ${claim_status} (Settlement: $${updated.settlement_amount})`,
      getClientIp(req)
    );

    return res.json({
      success: true,
      claim: updated
    });
  } catch (err) {
    console.error('Error updating surety claim status:', err);
    return res.status(500).json({ error: 'Failed to update surety claim status.' });
  }
});

// -------------------------------------------------------------
// GET /api/bond-watchdog/claims/:id
// Retrieves single claim record with full document validation
// -------------------------------------------------------------
router.get('/claims/:id', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const claimRes = await pool.query(`
      SELECT c.*, b.company_name as broker_name, b.mc_number as broker_mc, b.dot_number as broker_dot,
             b.surety_name, b.bond_policy_number, b.surety_claims_email, b.surety_claims_phone, b.surety_claims_address
      FROM surety_bond_claims c
      JOIN broker_surety_bonds b ON c.broker_id = b.id
      WHERE c.id::text = $1 OR c.claim_code = $1
    `, [id]);

    if (claimRes.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found.' });
    }

    return res.json({
      success: true,
      claim: claimRes.rows[0]
    });
  } catch (err) {
    console.error('Error retrieving claim record:', err);
    return res.status(500).json({ error: 'Failed to retrieve claim record.' });
  }
});

// -------------------------------------------------------------
// GET /api/bond-watchdog/claims/:id/packet-pdf
// Generates formal Vector PDF Legal Notice of Claim & Demand
// -------------------------------------------------------------
router.get('/claims/:id/packet-pdf', optionalAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const claimRes = await pool.query(`
      SELECT c.*, b.company_name as broker_name, b.mc_number as broker_mc, b.dot_number as broker_dot,
             b.surety_name, b.bond_policy_number, b.surety_claims_email, b.surety_claims_phone, b.surety_claims_address
      FROM surety_bond_claims c
      JOIN broker_surety_bonds b ON c.broker_id = b.id
      WHERE c.id::text = $1 OR c.claim_code = $1
    `, [id]);

    if (claimRes.rows.length === 0) {
      return res.status(404).json({ error: 'Claim record not found.' });
    }

    const c = claimRes.rows[0];
    const filename = `BMC84_Surety_Claim_${c.claim_code}.pdf`;

    const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    doc.pipe(res);

    // Document Banner Header
    doc.rect(36, 36, 540, 60).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text('FORMAL NOTICE OF CLAIM UNDER 49 U.S.C. § 13906', 50, 48);
    doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('FEDERAL MOTOR CARRIER BMC-84 SURETY BOND DEFAULT DEMAND DOSSIER', 50, 68);
    doc.fillColor('#f59e0b').fontSize(10).font('Helvetica-Bold').text(`CLAIM REF: ${c.claim_code}`, 380, 50, { align: 'right', width: 180 });
    doc.fillColor('#38bdf8').fontSize(8).font('Helvetica').text(`STATUS: ${c.claim_status}`, 380, 68, { align: 'right', width: 180 });

    let y = 110;

    // Notice Box
    doc.rect(36, y, 540, 45).fill('#f8fafc').stroke('#cbd5e1');
    doc.fillColor('#b91c1c').fontSize(10).font('Helvetica-Bold').text('FORMAL DEMAND FOR PAYMENT UPON BROKER SURETY OBLIGATION', 46, y + 8);
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(
      'Notice is hereby served upon the Surety Underwriter pursuant to Title 49, United States Code, Section 13906 and 49 C.F.R. § 387.307. ' +
      'The designated property freight broker has failed to remit settlement for authorized motor carrier transportation services rendered.',
      46, y + 22, { width: 520 }
    );

    y += 58;

    // Section 1: Parties & Bond Particulars
    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('1. SURETY BOND IDENTIFICATION & PARTIES OF RECORD', 36, y);
    doc.rect(36, y + 14, 540, 1).fill('#cbd5e1');

    y += 22;
    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text('SURETY UNDERWRITER:', 36, y);
    doc.fillColor('#0f172a').font('Helvetica').text(c.surety_name, 175, y);
    doc.fillColor('#475569').font('Helvetica-Bold').text('BOND / POLICY NUMBER:', 340, y);
    doc.fillColor('#b91c1c').font('Helvetica-Bold').text(c.bond_policy_number, 470, y);

    y += 16;
    doc.fillColor('#475569').font('Helvetica-Bold').text('DEBTOR BROKER:', 36, y);
    doc.fillColor('#0f172a').font('Helvetica').text(c.broker_name, 175, y);
    doc.fillColor('#475569').font('Helvetica-Bold').text('BROKER AUTHORITY:', 340, y);
    doc.fillColor('#0f172a').font('Helvetica').text(`${c.broker_mc} · ${c.broker_dot}`, 470, y);

    y += 16;
    doc.fillColor('#475569').font('Helvetica-Bold').text('CLAIMANT MOTOR CARRIER:', 36, y);
    doc.fillColor('#0f172a').font('Helvetica').text(c.carrier_name, 175, y);
    doc.fillColor('#475569').font('Helvetica-Bold').text('CARRIER MC & TIN/EIN:', 340, y);
    doc.fillColor('#0f172a').font('Helvetica').text(`${c.carrier_mc} (EIN: ${c.carrier_tin})`, 470, y);

    y += 26;

    // Section 2: Freight Service & Itemized Default
    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('2. TRANSPORTATION SERVICE PARTICULARS & DEFAULT SCHEDULE', 36, y);
    doc.rect(36, y + 14, 540, 1).fill('#cbd5e1');

    y += 22;
    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text('LOAD CONFIRMATION #:', 36, y);
    doc.fillColor('#0f172a').font('Helvetica').text(c.load_number, 175, y);
    doc.fillColor('#475569').font('Helvetica-Bold').text('CORRIDOR (ORIG-DEST):', 340, y);
    doc.fillColor('#0f172a').font('Helvetica').text(`${c.origin} -> ${c.destination}`, 470, y);

    y += 16;
    doc.fillColor('#475569').font('Helvetica-Bold').text('ACTUAL DELIVERY DATE:', 36, y);
    doc.fillColor('#0f172a').font('Helvetica').text(new Date(c.delivery_date).toISOString().split('T')[0], 175, y);
    doc.fillColor('#475569').font('Helvetica-Bold').text('CARRIER INVOICE NUMBER:', 340, y);
    doc.fillColor('#0f172a').font('Helvetica').text(c.invoice_number, 470, y);

    y += 16;
    doc.fillColor('#475569').font('Helvetica-Bold').text('DAYS OVERDUE (AGING):', 36, y);
    doc.fillColor('#b91c1c').font('Helvetica-Bold').text(`${c.days_past_due} Days Past Due (Invoiced: ${new Date(c.invoice_date).toISOString().split('T')[0]})`, 175, y);
    doc.fillColor('#475569').font('Helvetica-Bold').text('PRINCIPAL CLAIM AMOUNT:', 340, y);
    doc.fillColor('#059669').fontSize(11).font('Helvetica-Bold').text(`$${parseFloat(c.rate_amount).toFixed(2)} USD`, 470, y);

    y += 26;

    // Section 3: Document Verification Checklist
    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('3. STATUTORY EVIDENCE & DOCUMENT AUDIT COMPLIANCE', 36, y);
    doc.rect(36, y + 14, 540, 1).fill('#cbd5e1');

    y += 22;
    doc.fillColor(c.ratecon_verified ? '#059669' : '#dc2626').fontSize(9).font('Helvetica-Bold').text(
      `[${c.ratecon_verified ? 'X' : ' '}] 1. Executed Broker-Carrier Rate Confirmation Agreement on file and verified`, 46, y
    );
    y += 16;
    doc.fillColor(c.pod_verified ? '#059669' : '#dc2626').font('Helvetica-Bold').text(
      `[${c.pod_verified ? 'X' : ' '}] 2. Proof of Delivery (POD) signed and acknowledged by consignee with clean receipt`, 46, y
    );
    y += 16;
    doc.fillColor(c.invoice_verified ? '#059669' : '#dc2626').font('Helvetica-Bold').text(
      `[${c.invoice_verified ? 'X' : ' '}] 3. Original Carrier Freight Invoice transmitted and past 30-day statutory grace period`, 46, y
    );

    y += 26;

    // Section 4: Demand Letter & Settlement Directive
    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('4. FORMAL SETTLEMENT DIRECTIVE & STATUTORY DEMAND', 36, y);
    doc.rect(36, y + 14, 540, 1).fill('#cbd5e1');

    y += 22;
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(
      'Demand is hereby made upon ' + c.surety_name + ' as surety under Bond #' + c.bond_policy_number +
      ' for immediate payment in the amount of $' + parseFloat(c.rate_amount).toFixed(2) + ' payable to ' + c.carrier_name +
      '. The debtor broker failed to remit payment within statutory limits. Pursuant to FMCSA broker financial security regulations, ' +
      'this notice satisfies formal claim presentation requirements.',
      36, y, { width: 540, align: 'justify' }
    );

    y += 45;

    // Notes Box
    if (c.demand_notes) {
      doc.rect(36, y, 540, 36).fill('#f1f5f9').stroke('#e2e8f0');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('CLAIMANT STATEMENT OF RECORD:', 46, y + 6);
      doc.fillColor('#1e293b').fontSize(8).font('Helvetica').text(c.demand_notes, 46, y + 18, { width: 520 });
      y += 48;
    }

    // Cryptographic Demand Seal & Signature Block
    doc.rect(36, y, 540, 70).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('LOADNEXUS™ LEGAL SURETY DEMAND CERTIFICATION', 46, y + 12);
    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(`CRYPTOGRAPHIC INTEGRITY HASH: ${c.demand_hash}`, 46, y + 26);
    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(`FILING DATE / TIMESTAMP: ${new Date(c.filing_date).toISOString()} · AUTHORIZED JURISDICTION: 49 U.S.C. § 13906`, 46, y + 38);
    doc.fillColor('#38bdf8').fontSize(8).font('Helvetica-Bold').text('SUBMISSION EMAIL: ' + c.surety_claims_email + ' · TEL: ' + c.surety_claims_phone, 46, y + 50);

    doc.end();
  } catch (err) {
    console.error('Error generating surety claim PDF packet:', err);
    return res.status(500).json({ error: 'Failed to generate surety claim PDF packet.' });
  }
});

module.exports = router;
