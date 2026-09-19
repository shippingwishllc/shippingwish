const express = require('express');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

let migrated = false;
async function ensureTables() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS carrier_freight_audits (
        id SERIAL PRIMARY KEY,
        audit_number VARCHAR(50) UNIQUE NOT NULL,
        load_id INT REFERENCES loads(id) ON DELETE SET NULL,
        carrier_id INT REFERENCES users(id) ON DELETE CASCADE,
        invoice_number VARCHAR(100) NOT NULL,
        invoice_date DATE NOT NULL,
        ratecon_linehaul NUMERIC(10,2) NOT NULL DEFAULT 0,
        ratecon_authorized_accessorials NUMERIC(10,2) NOT NULL DEFAULT 0,
        ratecon_total_authorized NUMERIC(10,2) NOT NULL DEFAULT 0,
        billed_linehaul NUMERIC(10,2) NOT NULL DEFAULT 0,
        billed_detention NUMERIC(10,2) NOT NULL DEFAULT 0,
        billed_lumper NUMERIC(10,2) NOT NULL DEFAULT 0,
        billed_fuel_surcharge NUMERIC(10,2) NOT NULL DEFAULT 0,
        billed_total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        variance_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        variance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        clean_pod_verified BOOLEAN DEFAULT TRUE,
        lumper_receipt_verified BOOLEAN DEFAULT TRUE,
        gps_detention_verified BOOLEAN DEFAULT TRUE,
        audit_disposition VARCHAR(50) NOT NULL DEFAULT 'PENDING_AUDIT',
        cleared_payment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        deductions_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        deduction_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
        audit_notes TEXT,
        audit_hash VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_num ON carrier_freight_audits(audit_number);
      CREATE INDEX IF NOT EXISTS idx_audit_carrier ON carrier_freight_audits(carrier_id);
      CREATE INDEX IF NOT EXISTS idx_audit_disposition ON carrier_freight_audits(audit_disposition);
      CREATE INDEX IF NOT EXISTS idx_audit_load ON carrier_freight_audits(load_id);
    `);

    // Seed sample audit records if table is empty
    const checkRes = await pool.query('SELECT COUNT(*) FROM carrier_freight_audits');
    if (parseInt(checkRes.rows[0].count, 10) === 0) {
      const carrierRes = await pool.query(`SELECT id FROM users WHERE role::text IN ('carrier', 'super_admin') LIMIT 1`);
      const carrierId = carrierRes.rows.length > 0 ? carrierRes.rows[0].id : null;

      if (carrierId) {
        await pool.query(`
          INSERT INTO carrier_freight_audits (
            audit_number, carrier_id, invoice_number, invoice_date,
            ratecon_linehaul, ratecon_authorized_accessorials, ratecon_total_authorized,
            billed_linehaul, billed_detention, billed_lumper, billed_fuel_surcharge, billed_total_amount,
            variance_amount, variance_pct,
            clean_pod_verified, lumper_receipt_verified, gps_detention_verified,
            audit_disposition, cleared_payment_amount, deductions_amount, deduction_reasons,
            audit_notes, audit_hash
          ) VALUES 
          (
            'AUD-2026-0819', $1, 'INV-CAR-9910', CURRENT_DATE - INTERVAL '5 days',
            1850.00, 100.00, 1950.00,
            1850.00, 0.00, 100.00, 0.00, 1950.00,
            0.00, 0.00,
            TRUE, TRUE, TRUE,
            'PERFECT_MATCH', 1950.00, 0.00, '[]'::jsonb,
            '3-way match clean. Linehaul and lumper receipt match rate confirmation. Cleared for standard payment.',
            'HASH-AUD-2026-0819-9A82B1'
          ),
          (
            'AUD-2026-0924', $1, 'INV-CAR-4402', CURRENT_DATE - INTERVAL '2 days',
            2100.00, 0.00, 2100.00,
            2350.00, 250.00, 120.00, 0.00, 2720.00,
            620.00, 29.52,
            TRUE, FALSE, FALSE,
            'OVERBILLING_DETECTED', 0.00, 0.00, 
            '[{"item":"Linehaul Markup","amount":250.00,"reason":"RateCon linehaul agreed was $2,100, billed $2,350"},{"item":"Unverified Detention","amount":250.00,"reason":"GPS telematics confirms dock dwell was 1 hr 45 min, within 2 hr free time"},{"item":"Missing Lumper Receipt","amount":120.00,"reason":"Lumper fee claimed without required stamped third-party lumper receipt"}]'::jsonb,
            'Discrepancies flagged: $250 linehaul markup, $250 detention without GPS backup, $120 unreceipted lumper.',
            'HASH-AUD-2026-0924-4C21D8'
          );
        `, [carrierId]);
      }
    }

    migrated = true;
  } catch (err) {
    console.error('Error ensuring carrier_freight_audits table:', err);
  }
}

// Utility: Evaluate 3-Way Match Discrepancies
function evaluate3WayMatch(params) {
  const rateconLinehaul = parseFloat(params.ratecon_linehaul) || 0;
  const rateconAccessorials = parseFloat(params.ratecon_authorized_accessorials) || 0;
  const totalAuthorized = rateconLinehaul + rateconAccessorials;

  const billedLinehaul = parseFloat(params.billed_linehaul) || 0;
  const billedDetention = parseFloat(params.billed_detention) || 0;
  const billedLumper = parseFloat(params.billed_lumper) || 0;
  const billedFuel = parseFloat(params.billed_fuel_surcharge) || 0;
  const billedTotal = billedLinehaul + billedDetention + billedLumper + billedFuel;

  const variance = Math.round((billedTotal - totalAuthorized) * 100) / 100;
  const variancePct = totalAuthorized > 0 
    ? Math.round((variance / totalAuthorized) * 10000) / 100 
    : 0;

  const cleanPod = params.clean_pod_verified !== false && params.clean_pod_verified !== 'false';
  const lumperVerified = params.lumper_receipt_verified !== false && params.lumper_receipt_verified !== 'false';
  const gpsDetentionVerified = params.gps_detention_verified !== false && params.gps_detention_verified !== 'false';

  const discrepancies = [];

  // 1. Linehaul Check
  if (billedLinehaul > rateconLinehaul) {
    discrepancies.push({
      item: 'Linehaul Markup',
      amount: Math.round((billedLinehaul - rateconLinehaul) * 100) / 100,
      reason: `Billed linehaul ($${billedLinehaul}) exceeds RateCon authorized linehaul ($${rateconLinehaul}).`
    });
  }

  // 2. Detention Check
  if (billedDetention > 0 && !gpsDetentionVerified) {
    discrepancies.push({
      item: 'Unverified Detention',
      amount: billedDetention,
      reason: 'Detention claimed without verified GPS geofence arrival/departure exceeding standard 2-hour free time.'
    });
  }

  // 3. Lumper Check
  if (billedLumper > 0 && !lumperVerified) {
    discrepancies.push({
      item: 'Unsupported Lumper Fee',
      amount: billedLumper,
      reason: 'Lumper reimbursement claimed without attached stamped third-party unloading receipt.'
    });
  }

  // 4. Fuel Surcharge Check
  if (billedFuel > 0 && rateconAccessorials === 0) {
    discrepancies.push({
      item: 'Unauthorized Fuel Surcharge',
      amount: billedFuel,
      reason: 'Fuel surcharge was not authorized on the signed Rate Confirmation.'
    });
  }

  let disposition = 'PERFECT_MATCH';
  if (variance === 0 && discrepancies.length === 0 && cleanPod) {
    disposition = 'PERFECT_MATCH';
  } else if (variance > 0 && variance <= 15.00 && cleanPod) {
    disposition = 'TOLERANCE_CLEARED';
  } else if (!cleanPod || (!lumperVerified && billedLumper > 0)) {
    disposition = 'MISSING_RECEIPTS';
  } else if (variance > 15.00 || discrepancies.length > 0) {
    disposition = 'OVERBILLING_DETECTED';
  }

  return {
    ratecon_linehaul: rateconLinehaul,
    ratecon_authorized_accessorials: rateconAccessorials,
    ratecon_total_authorized: totalAuthorized,
    billed_linehaul: billedLinehaul,
    billed_detention: billedDetention,
    billed_lumper: billedLumper,
    billed_fuel_surcharge: billedFuel,
    billed_total_amount: billedTotal,
    variance_amount: variance,
    variance_pct: variancePct,
    clean_pod_verified: cleanPod,
    lumper_receipt_verified: lumperVerified,
    gps_detention_verified: gpsDetentionVerified,
    audit_disposition: disposition,
    discrepancies: discrepancies
  };
}

// -------------------------------------------------------------
// GET /api/freight-audit/roster
// Fetch audit roster and accounts payable KPI metrics
// -------------------------------------------------------------
router.get('/roster', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const auditsRes = await pool.query(`
      SELECT a.*, u.name as carrier_name, u.company_name as carrier_company, u.mc_number,
             l.load_number, l.pickup_location, l.delivery_location
      FROM carrier_freight_audits a
      LEFT JOIN users u ON u.id = a.carrier_id
      LEFT JOIN loads l ON l.id = a.load_id
      ORDER BY a.created_at DESC
    `);

    const audits = auditsRes.rows;

    let totalAudited = audits.length;
    let perfectMatches = 0;
    let overbillingTotal = 0;
    let shortPayRecoveries = 0;

    for (const a of audits) {
      if (a.audit_disposition === 'PERFECT_MATCH' || a.audit_disposition === 'TOLERANCE_CLEARED') {
        perfectMatches++;
      }
      if (a.audit_disposition === 'OVERBILLING_DETECTED' && parseFloat(a.variance_amount) > 0) {
        overbillingTotal += parseFloat(a.variance_amount);
      }
      if (a.audit_disposition === 'SHORT_PAID' && parseFloat(a.deductions_amount) > 0) {
        shortPayRecoveries += parseFloat(a.deductions_amount);
      }
    }

    return res.json({
      success: true,
      kpis: {
        total_audited: totalAudited,
        perfect_matches: perfectMatches,
        overbilling_total: Math.round(overbillingTotal * 100) / 100,
        short_pay_recoveries: Math.round(shortPayRecoveries * 100) / 100
      },
      audits
    });
  } catch (err) {
    console.error('Error fetching freight audit roster:', err);
    return res.status(500).json({ error: 'Failed to fetch freight audit roster.' });
  }
});

// -------------------------------------------------------------
// POST /api/freight-audit/submit
// Submit carrier invoice for instant 3-way matching evaluation
// -------------------------------------------------------------
router.post('/submit', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const {
      load_id,
      carrier_id,
      invoice_number,
      invoice_date = new Date().toISOString().slice(0, 10),
      ratecon_linehaul = 2000,
      ratecon_authorized_accessorials = 0,
      billed_linehaul = 2000,
      billed_detention = 0,
      billed_lumper = 0,
      billed_fuel_surcharge = 0,
      clean_pod_verified = true,
      lumper_receipt_verified = true,
      gps_detention_verified = true,
      audit_notes = ''
    } = req.body;

    if (!invoice_number) {
      return res.status(400).json({ error: 'Carrier invoice number is required.' });
    }

    const evaluation = evaluate3WayMatch({
      ratecon_linehaul,
      ratecon_authorized_accessorials,
      billed_linehaul,
      billed_detention,
      billed_lumper,
      billed_fuel_surcharge,
      clean_pod_verified,
      lumper_receipt_verified,
      gps_detention_verified
    });

    const auditNumber = 'AUD-2026-' + Math.floor(1000 + Math.random() * 9000);
    const hash = 'HASH-' + auditNumber + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const targetCarrierId = carrier_id || (req.user ? req.user.id : null);

    const insertRes = await pool.query(`
      INSERT INTO carrier_freight_audits (
        audit_number, load_id, carrier_id, invoice_number, invoice_date,
        ratecon_linehaul, ratecon_authorized_accessorials, ratecon_total_authorized,
        billed_linehaul, billed_detention, billed_lumper, billed_fuel_surcharge, billed_total_amount,
        variance_amount, variance_pct,
        clean_pod_verified, lumper_receipt_verified, gps_detention_verified,
        audit_disposition, cleared_payment_amount, deductions_amount, deduction_reasons,
        audit_notes, audit_hash
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15,
        $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24
      ) RETURNING *
    `, [
      auditNumber, load_id || null, targetCarrierId, invoice_number, invoice_date,
      evaluation.ratecon_linehaul, evaluation.ratecon_authorized_accessorials, evaluation.ratecon_total_authorized,
      evaluation.billed_linehaul, evaluation.billed_detention, evaluation.billed_lumper, evaluation.billed_fuel_surcharge, evaluation.billed_total_amount,
      evaluation.variance_amount, evaluation.variance_pct,
      evaluation.clean_pod_verified, evaluation.lumper_receipt_verified, evaluation.gps_detention_verified,
      evaluation.audit_disposition, 
      evaluation.audit_disposition === 'PERFECT_MATCH' ? evaluation.billed_total_amount : 0,
      0, JSON.stringify(evaluation.discrepancies),
      audit_notes, hash
    ]);

    const created = insertRes.rows[0];

    auditLog(
      req.user ? req.user.id : null,
      'SUBMIT_FREIGHT_AUDIT',
      `Submitted carrier invoice ${invoice_number} for 3-way audit. Disposition: ${evaluation.audit_disposition} (Variance: $${evaluation.variance_amount})`,
      getClientIp(req)
    );

    return res.json({
      success: true,
      message: `Audit ${auditNumber} executed with disposition ${evaluation.audit_disposition}.`,
      audit: created,
      discrepancies: evaluation.discrepancies
    });
  } catch (err) {
    console.error('Error submitting invoice for freight audit:', err);
    return res.status(500).json({ error: 'Failed to submit invoice for audit.' });
  }
});

// -------------------------------------------------------------
// GET /api/freight-audit/:id
// Retrieve audit details
// -------------------------------------------------------------
router.get('/:id', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const auditRes = await pool.query(`
      SELECT a.*, u.name as carrier_name, u.company_name as carrier_company, u.mc_number, u.phone as carrier_phone,
             l.load_number, l.pickup_location, l.delivery_location
      FROM carrier_freight_audits a
      LEFT JOIN users u ON u.id = a.carrier_id
      LEFT JOIN loads l ON l.id = a.load_id
      WHERE a.id::text = $1 OR a.audit_number = $1
    `, [id]);

    if (auditRes.rows.length === 0) {
      return res.status(404).json({ error: 'Freight audit record not found.' });
    }

    return res.json({ success: true, audit: auditRes.rows[0] });
  } catch (err) {
    console.error('Error retrieving audit record:', err);
    return res.status(500).json({ error: 'Failed to retrieve audit record.' });
  }
});

// -------------------------------------------------------------
// POST /api/freight-audit/:id/approve
// Approve full payment when discrepancies are resolved or waived
// -------------------------------------------------------------
router.post('/:id/approve', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;

    const auditRes = await pool.query(`
      SELECT * FROM carrier_freight_audits WHERE id::text = $1 OR audit_number = $1
    `, [id]);

    if (auditRes.rows.length === 0) {
      return res.status(404).json({ error: 'Audit record not found.' });
    }

    const a = auditRes.rows[0];
    const updateRes = await pool.query(`
      UPDATE carrier_freight_audits
      SET audit_disposition = 'APPROVED_FULL_PAY',
          cleared_payment_amount = billed_total_amount,
          deductions_amount = 0,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [a.id]);

    auditLog(
      req.user ? req.user.id : null,
      'APPROVE_FREIGHT_AUDIT',
      `Approved full pay for invoice ${a.invoice_number} ($${a.billed_total_amount})`,
      getClientIp(req)
    );

    return res.json({ success: true, audit: updateRes.rows[0] });
  } catch (err) {
    console.error('Error approving freight audit:', err);
    return res.status(500).json({ error: 'Failed to approve freight audit.' });
  }
});

// -------------------------------------------------------------
// POST /api/freight-audit/:id/short-pay
// Execute Short-Pay deduction and generate deduction notice
// -------------------------------------------------------------
router.post('/:id/short-pay', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const { deductions_amount, deduction_reasons = [], resolution_notes = '' } = req.body;

    const auditRes = await pool.query(`
      SELECT * FROM carrier_freight_audits WHERE id::text = $1 OR audit_number = $1
    `, [id]);

    if (auditRes.rows.length === 0) {
      return res.status(404).json({ error: 'Audit record not found.' });
    }

    const a = auditRes.rows[0];
    const billedTotal = parseFloat(a.billed_total_amount) || 0;
    const deduct = parseFloat(deductions_amount) || parseFloat(a.variance_amount) || 0;
    const netCleared = Math.max(0, billedTotal - deduct);

    const reasons = Array.isArray(deduction_reasons) && deduction_reasons.length > 0 
      ? deduction_reasons 
      : (Array.isArray(a.deduction_reasons) ? a.deduction_reasons : JSON.parse(a.deduction_reasons || '[]'));

    const updateRes = await pool.query(`
      UPDATE carrier_freight_audits
      SET audit_disposition = 'SHORT_PAID',
          deductions_amount = $1,
          cleared_payment_amount = $2,
          deduction_reasons = $3,
          audit_notes = COALESCE($4, audit_notes),
          updated_at = now()
      WHERE id = $5
      RETURNING *
    `, [deduct, netCleared, JSON.stringify(reasons), resolution_notes, a.id]);

    auditLog(
      req.user ? req.user.id : null,
      'EXECUTE_SHORT_PAY',
      `Executed short-pay for invoice ${a.invoice_number}. Deducted $${deduct}, net cleared $${netCleared}`,
      getClientIp(req)
    );

    return res.json({
      success: true,
      message: `Short-Pay executed. Deducted $${deduct.toFixed(2)}, cleared payment $${netCleared.toFixed(2)}.`,
      audit: updateRes.rows[0]
    });
  } catch (err) {
    console.error('Error executing short pay:', err);
    return res.status(500).json({ error: 'Failed to execute short pay.' });
  }
});

// -------------------------------------------------------------
// GET /api/freight-audit/:id/short-pay-pdf
// Generate Official Vector Short-Pay Remittance & Deduction Notice PDF
// -------------------------------------------------------------
router.get('/:id/short-pay-pdf', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const auditRes = await pool.query(`
      SELECT a.*, u.name as carrier_name, u.company_name as carrier_company, u.mc_number, u.phone as carrier_phone,
             l.load_number, l.pickup_location, l.delivery_location
      FROM carrier_freight_audits a
      LEFT JOIN users u ON u.id = a.carrier_id
      LEFT JOIN loads l ON l.id = a.load_id
      WHERE a.id::text = $1 OR a.audit_number = $1
    `, [id]);

    if (auditRes.rows.length === 0) {
      return res.status(404).json({ error: 'Audit record not found.' });
    }

    const a = auditRes.rows[0];
    const reasons = Array.isArray(a.deduction_reasons) ? a.deduction_reasons : JSON.parse(a.deduction_reasons || '[]');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Short-Pay-Notice-${a.audit_number}.pdf"`);

    doc.pipe(res);

    // Deep Amber/Slate Header Banner
    doc.rect(36, 36, 540, 68).fill('#78350F');

    doc.fillColor('#FDE68A').fontSize(9.5).font('Helvetica-Bold')
      .text('LOADNEXUS™ FREIGHT AUDIT & ACCOUNTS PAYABLE DISBURSEMENT DESK', 48, 48);

    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
      .text('FORMAL SHORT-PAY REMITTANCE & DEDUCTION NOTICE', 48, 62);

    doc.fillColor('#FCD34D').fontSize(8.5).font('Helvetica')
      .text(`AUDIT ID: ${a.audit_number} • CARRIER INVOICE: ${a.invoice_number}`, 48, 80);

    // Overview Meta Box
    doc.rect(36, 114, 540, 80).fill('#FFFBEB').stroke('#FDE68A');

    doc.fillColor('#92400E').fontSize(9).font('Helvetica-Bold')
      .text('CARRIER OF RECORD & INVOICE IDENTIFICATION', 48, 122);
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
      .text(`Carrier Company: ${a.carrier_company || a.carrier_name || 'Motor Carrier LLC'}`, 48, 136)
      .text(`MC / DOT Number: ${a.mc_number || 'MC-ON-FILE'}    |    Phone: ${a.carrier_phone || 'N/A'}`, 48, 148)
      .text(`Invoice Date: ${new Date(a.invoice_date).toISOString().slice(0, 10)}    |    Load Ref #: ${a.load_number || 'SW-SPOT-DIRECT'}`, 48, 160)
      .text(`Lane Corridor: ${a.pickup_location || 'Origin Terminal'} ➔ ${a.delivery_location || 'Destination Consignee'}`, 48, 172);

    // Status Badge Box
    const isShortPaid = a.audit_disposition === 'SHORT_PAID';
    doc.rect(385, 122, 179, 45).fill(isShortPaid ? '#FEE2E2' : '#EFF6FF').stroke(isShortPaid ? '#EF4444' : '#3B82F6');
    doc.fillColor(isShortPaid ? '#991B1B' : '#1D4ED8').fontSize(9.5).font('Helvetica-Bold')
      .text(`STATUS: ${a.audit_disposition}`, 390, 130, { width: 169, align: 'center' });
    doc.fontSize(8).font('Helvetica')
      .text(`Variance: +$${parseFloat(a.variance_amount).toFixed(2)} (${a.variance_pct}%)`, 390, 146, { width: 169, align: 'center' });

    // Section 1: 3-Way Match Verification Checklist
    const sec1Y = 204;
    doc.rect(36, sec1Y, 540, 20).fill('#92400E');
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
      .text('SECTION 1: 3-WAY MATCH COMPLIANCE VERIFICATION CHECKLIST', 44, sec1Y + 6);

    const chkY = sec1Y + 24;
    doc.rect(36, chkY, 540, 48).fill('#FFFFFF').stroke('#E2E8F0');

    // 3 verification items
    const chkW = 180;
    // 1. Clean POD
    doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold').text('1. PROOF OF DELIVERY (POD):', 44, chkY + 8);
    doc.fillColor(a.clean_pod_verified ? '#166534' : '#991B1B').fontSize(7.5).font('Helvetica')
      .text(a.clean_pod_verified ? '✅ Clean Signed POD Verified' : '❌ Missing / Discrepant POD', 44, chkY + 22);

    // 2. Lumper Receipt
    doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold').text('2. LUMPER RECEIPT:', 44 + chkW, chkY + 8);
    doc.fillColor(a.lumper_receipt_verified ? '#166534' : '#991B1B').fontSize(7.5).font('Helvetica')
      .text(a.lumper_receipt_verified ? '✅ Stamped Receipt Matched' : '❌ No Official Stamped Receipt', 44 + chkW, chkY + 22);

    // 3. GPS Detention
    doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold').text('3. GPS TELEMATICS DWELL:', 44 + chkW * 2, chkY + 8);
    doc.fillColor(a.gps_detention_verified ? '#166534' : '#991B1B').fontSize(7.5).font('Helvetica')
      .text(a.gps_detention_verified ? '✅ Verified > 2h Free Time' : '❌ In/Out Dwell < 2h Free Time', 44 + chkW * 2, chkY + 22);

    // Section 2: Financial Reconciliation Table
    const sec2Y = chkY + 58;
    doc.rect(36, sec2Y, 540, 20).fill('#92400E');
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
      .text('SECTION 2: FINANCIAL RECONCILIATION & SHORT-PAY CALCULATION', 44, sec2Y + 6);

    const recY = sec2Y + 24;
    doc.rect(36, recY, 540, 80).fill('#FFFFFF').stroke('#E2E8F0');

    doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica-Bold')
      .text('RateCon Authorized Linehaul:', 48, recY + 8)
      .text('RateCon Authorized Accessorials:', 48, recY + 22)
      .text('Total Agreed Authorized Pay:', 48, recY + 36)
      .text('Carrier Total Invoiced Amount:', 48, recY + 50)
      .text('Total Disallowed Deductions:', 48, recY + 64);

    doc.font('Helvetica')
      .text(`$${parseFloat(a.ratecon_linehaul).toFixed(2)}`, 230, recY + 8)
      .text(`$${parseFloat(a.ratecon_authorized_accessorials).toFixed(2)}`, 230, recY + 22)
      .text(`$${parseFloat(a.ratecon_total_authorized).toFixed(2)}`, 230, recY + 36)
      .text(`$${parseFloat(a.billed_total_amount).toFixed(2)}`, 230, recY + 50)
      .text(`-$${parseFloat(a.deductions_amount).toFixed(2)}`, 230, recY + 64);

    // Net Cleared Remittance Box
    doc.rect(360, recY + 8, 204, 64).fill('#ECFDF5').stroke('#10B981');
    doc.fillColor('#065F46').fontSize(8).font('Helvetica-Bold')
      .text('NET APPROVED ACH REMITTANCE', 365, recY + 16, { width: 194, align: 'center' });
    doc.fillColor('#047857').fontSize(16).font('Helvetica-Bold')
      .text(`$${parseFloat(a.cleared_payment_amount).toFixed(2)}`, 365, recY + 32, { width: 194, align: 'center' });
    doc.fillColor('#065F46').fontSize(7.5).font('Helvetica')
      .text('Scheduled for payment release', 365, recY + 54, { width: 194, align: 'center' });

    // Section 3: Itemized Discrepancy & Deduction Schedule
    const sec3Y = recY + 90;
    doc.rect(36, sec3Y, 540, 20).fill('#92400E');
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
      .text('SECTION 3: ITEMIZED DISCREPANCY AUDIT & DEDUCTION SCHEDULE', 44, sec3Y + 6);

    let decY = sec3Y + 24;
    if (reasons.length === 0) {
      doc.rect(36, decY, 540, 30).fill('#F8FAFC').stroke('#CBD5E1');
      doc.fillColor('#64748B').fontSize(8).font('Helvetica').text('No deductions applied. Invoice cleared for full payment.', 48, decY + 10);
      decY += 36;
    } else {
      reasons.forEach((r, idx) => {
        doc.rect(36, decY, 540, 32).fill(idx % 2 === 0 ? '#FFFFFF' : '#FFFBEB').stroke('#E2E8F0');
        doc.fillColor('#991B1B').fontSize(8).font('Helvetica-Bold')
          .text(`-${parseFloat(r.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}: ${r.item}`, 44, decY + 6);
        doc.fillColor('#475569').fontSize(7.5).font('Helvetica')
          .text(r.reason || 'Deduction per Rate Confirmation contract terms.', 44, decY + 18, { width: 520 });
        decY += 36;
      });
    }

    // Carrier Dispute Rights Notice & Cryptographic Seal
    const footerY = Math.max(decY + 10, 680);
    doc.rect(36, footerY, 540, 62).fill('#F8FAFC').stroke('#94A3B8');

    doc.fillColor('#0F172A').fontSize(7.5).font('Helvetica-Bold')
      .text('CARRIER DISPUTE POLICY & 30-DAY STATUTORY RECONCILIATION NOTICE', 44, footerY + 8);

    doc.fillColor('#475569').fontSize(6.8).font('Helvetica')
      .text(
        'Pursuant to 49 CFR Part 371 and agreed Rate Confirmation terms, unauthorized line-item markups and accessorials lacking third-party receipts ' +
        'are disallowed. If you have documentation (signed receiver in/out stamps or stamped receipts) to dispute any deduction, ' +
        'submit an appeal within 30 calendar days to ap@shippingwish.com with Audit ID ' + a.audit_number + '.',
        44, footerY + 18, { width: 524 }
      );

    doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold')
      .text(`SECURE AUDIT HASH: ${a.audit_hash}`, 44, footerY + 47)
      .text(`GENERATED: ${new Date().toISOString()}`, 380, footerY + 47);

    doc.end();
  } catch (err) {
    console.error('Error generating short pay PDF:', err);
    return res.status(500).json({ error: 'Failed to generate short pay PDF.' });
  }
});

module.exports = router;
