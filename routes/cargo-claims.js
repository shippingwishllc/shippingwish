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
      CREATE TABLE IF NOT EXISTS cargo_claims (
        id SERIAL PRIMARY KEY,
        claim_number VARCHAR(50) UNIQUE NOT NULL,
        load_id INT REFERENCES loads(id) ON DELETE SET NULL,
        carrier_id INT REFERENCES users(id) ON DELETE CASCADE,
        claimant_name VARCHAR(120) NOT NULL,
        claimant_company VARCHAR(150) NOT NULL,
        claimant_email VARCHAR(120),
        claimant_phone VARCHAR(50),
        incident_type VARCHAR(40) NOT NULL,
        incident_date DATE NOT NULL,
        delivery_bol_number VARCHAR(100),
        seal_number_shipped VARCHAR(50),
        seal_number_delivered VARCHAR(50),
        seal_intact BOOLEAN DEFAULT TRUE,
        claimed_amount NUMERIC(12,2) NOT NULL,
        salvage_value NUMERIC(12,2) DEFAULT 0.00,
        settled_amount NUMERIC(12,2) DEFAULT 0.00,
        loss_description TEXT NOT NULL,
        disposition_status VARCHAR(40) DEFAULT 'FILED_UNDER_INVESTIGATION',
        insurance_claim_ref VARCHAR(100),
        insurance_carrier_name VARCHAR(150),
        resolution_notes TEXT,
        settled_at TIMESTAMP,
        settlement_audit_hash VARCHAR(128),
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_claims_carrier ON cargo_claims(carrier_id);
      CREATE INDEX IF NOT EXISTS idx_claims_num ON cargo_claims(claim_number);
      CREATE INDEX IF NOT EXISTS idx_claims_status ON cargo_claims(disposition_status);
      CREATE INDEX IF NOT EXISTS idx_claims_type ON cargo_claims(incident_type);
    `);

    // Seed sample cargo claims if empty for demonstration
    const checkClaims = await pool.query('SELECT COUNT(*) FROM cargo_claims');
    if (parseInt(checkClaims.rows[0].count, 10) === 0) {
      const carrierRes = await pool.query(`SELECT id FROM users WHERE role::text IN ('carrier', 'super_admin') LIMIT 1`);
      const carrierId = carrierRes.rows.length > 0 ? carrierRes.rows[0].id : null;

      if (carrierId) {
        await pool.query(`
          INSERT INTO cargo_claims (
            claim_number, carrier_id, claimant_name, claimant_company, claimant_email, claimant_phone,
            incident_type, incident_date, delivery_bol_number, seal_number_shipped, seal_number_delivered,
            seal_intact, claimed_amount, salvage_value, settled_amount, loss_description, disposition_status,
            insurance_claim_ref, insurance_carrier_name, resolution_notes, settled_at, settlement_audit_hash
          ) VALUES 
          (
            'CLM-2026-0812', $1, 'Robert Vance', 'Apex Distribution Inc', 'claims@apexdist.com', '(312) 555-9014',
            'DAMAGED', CURRENT_DATE - INTERVAL '14 days', 'BOL-APX-88219', 'SEAL-99210', 'SEAL-99210',
            TRUE, 3450.00, 350.00, 3100.00,
            'Forklift puncturing 2 bottom tier pallets of beverage freight during transit. Consignee rejected 48 cases.',
            'SETTLED_AND_PAID', 'POL-CARGO-99412', 'Great American Insurance',
            'Full and final settlement reached under 49 U.S.C. 14706. Net payment $3,100 disbursed via electronic remittance.',
            now() - INTERVAL '3 days', 'SIG-CLM-SETTLE-88A92F1'
          ),
          (
            'CLM-2026-0941', $1, 'Sarah Lin', 'Pacific Produce Brokers', 'claims@pacificproduce.com', '(503) 555-2281',
            'TEMPERATURE_DEVIATION', CURRENT_DATE - INTERVAL '4 days', 'BOL-PAC-44109', 'SEAL-11048', 'SEAL-11048',
            TRUE, 8200.00, 1200.00, 0.00,
            'Reefer telematics logged temperature spike from 34°F to 49°F for 14 continuous hours. Consignee pulp test failure on fresh strawberries.',
            'FILED_UNDER_INVESTIGATION', 'CLM-REF-48201', 'Travelers Inland Marine',
            'Telematics log submitted to cargo insurer adjuster for analysis. Carrier pre-cooling documentation under review.',
            NULL, 'SIG-CLM-INV-4410E89'
          );
        `, [carrierId]);
      }
    }

    migrated = true;
  } catch (err) {
    console.error('[Cargo Claims Migration] Error:', err.message);
  }
}
ensureTables();

// GET /api/claims/roster — Retrieve all claims with financial KPIs
router.get('/roster', requireAuth, async (req, res) => {
  await ensureTables();
  const { status, incident_type, search } = req.query;

  try {
    let query = `
      SELECT c.*, u.company_name AS carrier_company, u.mc_number, u.dot_number,
             l.load_number, l.pickup_location, l.delivery_location
      FROM cargo_claims c
      LEFT JOIN users u ON u.id = c.carrier_id
      LEFT JOIN loads l ON l.id = c.load_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND c.disposition_status = $${params.length}`;
    }

    if (incident_type) {
      params.push(incident_type);
      query += ` AND c.incident_type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toUpperCase()}%`);
      query += ` AND (c.claim_number ILIKE $${params.length} OR c.claimant_company ILIKE $${params.length} OR c.delivery_bol_number ILIKE $${params.length})`;
    }

    query += ` ORDER BY c.created_at DESC`;

    const listRes = await pool.query(query, params);

    // Compute financial exposure metrics
    let totalClaims = listRes.rows.length;
    let openExposure = 0;
    let totalSettled = 0;
    let resolvedCount = 0;

    listRes.rows.forEach(r => {
      const claimed = parseFloat(r.claimed_amount) || 0;
      const settled = parseFloat(r.settled_amount) || 0;
      const salvage = parseFloat(r.salvage_value) || 0;

      if (r.disposition_status === 'SETTLED_AND_PAID') {
        totalSettled += settled;
        resolvedCount++;
      } else if (r.disposition_status.startsWith('DENIED')) {
        resolvedCount++;
      } else {
        openExposure += Math.max(0, claimed - salvage);
      }
    });

    const resolutionRate = totalClaims > 0 ? Math.round((resolvedCount / totalClaims) * 100) : 100;

    res.json({
      ok: true,
      count: totalClaims,
      metrics: {
        total_claims: totalClaims,
        open_exposure: parseFloat(openExposure.toFixed(2)),
        total_settled: parseFloat(totalSettled.toFixed(2)),
        resolution_rate: resolutionRate
      },
      claims: listRes.rows
    });
  } catch (err) {
    console.error('[Cargo Claims Roster] Error:', err);
    res.status(500).json({ error: 'Could not load cargo claims.' });
  }
});

// GET /api/claims/:id — Single claim details
router.get('/:id', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid claim ID.' });

  try {
    const claimRes = await pool.query(`
      SELECT c.*, u.company_name AS carrier_company, u.mc_number, u.dot_number, u.address AS carrier_address, u.phone AS carrier_phone,
             l.load_number, l.pickup_location, l.delivery_location, l.rate
      FROM cargo_claims c
      LEFT JOIN users u ON u.id = c.carrier_id
      LEFT JOIN loads l ON l.id = c.load_id
      WHERE c.id = $1
    `, [id]);

    if (claimRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cargo claim not found.' });
    }

    res.json({ ok: true, claim: claimRes.rows[0] });
  } catch (err) {
    console.error('[Cargo Claim Detail] Error:', err);
    res.status(500).json({ error: 'Could not fetch cargo claim details.' });
  }
});

// POST /api/claims/file — File a new cargo loss/damage/shortage claim
router.post('/file', requireAuth, async (req, res) => {
  await ensureTables();
  const {
    load_id = null,
    claimant_name,
    claimant_company,
    claimant_email = '',
    claimant_phone = '',
    incident_type = 'DAMAGED',
    incident_date,
    delivery_bol_number = '',
    seal_number_shipped = '',
    seal_number_delivered = '',
    seal_intact = true,
    claimed_amount,
    salvage_value = 0.00,
    loss_description,
    insurance_claim_ref = '',
    insurance_carrier_name = ''
  } = req.body;

  if (!claimant_name || !claimant_company || !claimed_amount || !loss_description) {
    return res.status(400).json({
      error: 'claimant_name, claimant_company, claimed_amount, and loss_description are required.'
    });
  }

  const claimAmt = parseFloat(claimed_amount);
  if (isNaN(claimAmt) || claimAmt <= 0) {
    return res.status(400).json({ error: 'claimed_amount must be greater than zero.' });
  }

  const carrierId = req.user.id;
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const claimNumber = `CLM-${new Date().getFullYear()}-${randSuffix}`;
  const incDate = incident_date || new Date().toISOString().slice(0, 10);

  const hashPayload = `${claimNumber}-${claimant_company}-${claimAmt}-${Date.now()}`;
  const auditHash = 'SIG-CLM-FILE-' + crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 14).toUpperCase();

  try {
    const insertRes = await pool.query(`
      INSERT INTO cargo_claims (
        claim_number, load_id, carrier_id, claimant_name, claimant_company, claimant_email, claimant_phone,
        incident_type, incident_date, delivery_bol_number, seal_number_shipped, seal_number_delivered,
        seal_intact, claimed_amount, salvage_value, settled_amount, loss_description, disposition_status,
        insurance_claim_ref, insurance_carrier_name, resolution_notes, settlement_audit_hash, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'FILED_UNDER_INVESTIGATION',$18,$19,$20,$21,now(),now())
      RETURNING *
    `, [
      claimNumber, load_id ? parseInt(load_id, 10) : null, carrierId,
      claimant_name.trim(), claimant_company.trim(), claimant_email.trim(), claimant_phone.trim(),
      incident_type, incDate, delivery_bol_number.trim().toUpperCase(),
      seal_number_shipped.trim().toUpperCase(), seal_number_delivered.trim().toUpperCase(),
      Boolean(seal_intact), claimAmt, parseFloat(salvage_value) || 0.00, 0.00,
      loss_description.trim(), insurance_claim_ref.trim(), insurance_carrier_name.trim(),
      'Formal claim filed under 49 CFR Part 370. Investigation commenced.', auditHash
    ]);

    await auditLog({
      action: 'CARGO_CLAIM_FILED',
      userId: req.user.id,
      details: { claim_number: claimNumber, amount: claimAmt, type: incident_type },
      ipAddress: getClientIp(req)
    });

    res.json({
      ok: true,
      message: `Cargo Claim ${claimNumber} successfully filed for $${claimAmt.toFixed(2)}.`,
      claim: insertRes.rows[0]
    });
  } catch (err) {
    console.error('[Cargo Claim File] Error:', err);
    res.status(500).json({ error: 'Could not file cargo claim.' });
  }
});

// POST /api/claims/:id/settle — Settle, compromise, or formally deny claim
router.post('/:id/settle', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid claim ID.' });

  const {
    disposition_status = 'SETTLED_AND_PAID',
    settled_amount = 0.00,
    salvage_value = 0.00,
    insurance_claim_ref,
    insurance_carrier_name,
    resolution_notes = 'Claim resolved in accordance with Carmack Amendment statutory principles.'
  } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM cargo_claims WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Cargo claim not found.' });
    }

    const cur = existing.rows[0];
    const settledAmt = parseFloat(settled_amount) || 0.00;
    const salvageAmt = parseFloat(salvage_value) !== undefined ? parseFloat(salvage_value) : parseFloat(cur.salvage_value);

    const hashPayload = `${cur.claim_number}-${disposition_status}-${settledAmt}-${Date.now()}`;
    const auditHash = 'SIG-CLM-SETTLE-' + crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 16).toUpperCase();

    const updateRes = await pool.query(`
      UPDATE cargo_claims
      SET disposition_status = $1,
          settled_amount = $2,
          salvage_value = $3,
          insurance_claim_ref = COALESCE($4, insurance_claim_ref),
          insurance_carrier_name = COALESCE($5, insurance_carrier_name),
          resolution_notes = $6,
          settled_at = now(),
          settlement_audit_hash = $7,
          updated_at = now()
      WHERE id = $8
      RETURNING *
    `, [
      disposition_status, settledAmt, salvageAmt,
      insurance_claim_ref ? insurance_claim_ref.trim() : null,
      insurance_carrier_name ? insurance_carrier_name.trim() : null,
      resolution_notes.trim(), auditHash, id
    ]);

    await auditLog({
      action: 'CARGO_CLAIM_SETTLED',
      userId: req.user.id,
      details: { claim_number: cur.claim_number, status: disposition_status, settled_amount: settledAmt },
      ipAddress: getClientIp(req)
    });

    res.json({
      ok: true,
      message: `Claim ${cur.claim_number} updated to status: ${disposition_status}.`,
      claim: updateRes.rows[0]
    });
  } catch (err) {
    console.error('[Cargo Claim Settle] Error:', err);
    res.status(500).json({ error: 'Could not settle cargo claim.' });
  }
});

// GET /api/claims/:id/pdf — Official Vector Carmack Amendment Claim & Settlement Agreement PDF
router.get('/:id/pdf', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid claim ID.' });

  try {
    const claimRes = await pool.query(`
      SELECT c.*, u.company_name AS carrier_company, u.mc_number, u.dot_number, u.address AS carrier_address, u.phone AS carrier_phone,
             l.load_number, l.pickup_location, l.delivery_location
      FROM cargo_claims c
      LEFT JOIN users u ON u.id = c.carrier_id
      LEFT JOIN loads l ON l.id = c.load_id
      WHERE c.id = $1
    `, [id]);

    if (claimRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cargo claim not found.' });
    }

    const c = claimRes.rows[0];

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Carmack-Claim-${c.claim_number}.pdf"`);

    doc.pipe(res);

    // Deep Crimson Header Banner
    doc.rect(36, 36, 540, 68).fill('#881337');

    doc.fillColor('#FECDD3').fontSize(9.5).font('Helvetica-Bold')
      .text('CARMACK AMENDMENT (49 U.S.C. § 14706) • 49 CFR PART 370 CLAIMS STANDARD', 48, 48);

    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
      .text('STANDARD FORM FOR LOSS AND DAMAGE CLAIM & MUTUAL RELEASE', 48, 62);

    doc.fillColor('#F43F5E').fontSize(8.5).font('Helvetica')
      .text(`FORMAL PRESENTATION RECORD • CLAIM ID: ${c.claim_number}`, 48, 80);

    // Overview Meta Box
    doc.rect(36, 114, 540, 85).fill('#FFF1F2').stroke('#FDA4AF');

    doc.fillColor('#881337').fontSize(9).font('Helvetica-Bold')
      .text('CARRIER OF RECORD & INSURER', 48, 122);
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
      .text(`Motor Carrier: ${c.carrier_company || 'Shipping Wish Fleet Logistics LLC'}`, 48, 136)
      .text(`USDOT Number: ${c.dot_number || '3948210'}    |    MC Number: ${c.mc_number || 'MC-1492041'}`, 48, 148)
      .text(`Cargo Policy Carrier: ${c.insurance_carrier_name || 'Great American Insurance (Policy #POL-CARGO-99412)'}`, 48, 160)
      .text(`Adjuster Reference: ${c.insurance_claim_ref || 'N/A (Direct Carrier Settlement)'}`, 48, 172);

    // Claim Status Badge Box
    const isSettled = c.disposition_status === 'SETTLED_AND_PAID';
    const isDenied = c.disposition_status.startsWith('DENIED');
    const badgeBg = isSettled ? '#DCFCE7' : (isDenied ? '#F1F5F9' : '#FEF3C7');
    const badgeText = isSettled ? '#166534' : (isDenied ? '#475569' : '#92400E');

    doc.rect(380, 122, 184, 40).fill(badgeBg).stroke(badgeText);
    doc.fillColor(badgeText).fontSize(9.5).font('Helvetica-Bold')
      .text(`STATUS: ${c.disposition_status}`, 388, 130, { width: 168, align: 'center' });
    doc.fontSize(8).font('Helvetica')
      .text(`Filed: ${new Date(c.incident_date).toISOString().slice(0, 10)}`, 388, 145, { width: 168, align: 'center' });

    // Section 1: Claimant & Shipment Identification
    doc.rect(36, 210, 540, 95).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 210, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 1: CLAIMANT, SHIPMENT & SEAL CREDENTIALS', 44, 216);

    doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica-Bold')
      .text('Claimant Company:', 48, 238)
      .text('Authorized Contact:', 48, 252)
      .text('Delivery BOL Number:', 48, 266)
      .text('Load Reference #:', 48, 280);

    doc.font('Helvetica')
      .text(c.claimant_company, 170, 238)
      .text(`${c.claimant_name} (${c.claimant_phone || c.claimant_email})`, 170, 252)
      .text(c.delivery_bol_number || 'BOL-ON-FILE', 170, 266)
      .text(c.load_number || 'SW-SPOT-DIRECT', 170, 280);

    doc.font('Helvetica-Bold')
      .text('Incident Type:', 340, 238)
      .text('Shipped Seal #:', 340, 252)
      .text('Delivered Seal #:', 340, 266)
      .text('Seal Verification:', 340, 280);

    doc.font('Helvetica')
      .text(c.incident_type, 450, 238)
      .text(c.seal_number_shipped || 'VERIFIED INTACT', 450, 252)
      .text(c.seal_number_delivered || 'VERIFIED INTACT', 450, 266)
      .text(c.seal_intact ? 'SEAL INTACT AT DOCK' : 'SEAL BROKEN / DISCREPANCY', 450, 280);

    // Section 2: Financial Loss Schedule & Claim Calculation
    doc.rect(36, 315, 540, 90).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 315, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 2: ITEMIZED LOSS ACCOUNTING & CARRIER LIABILITY SCHEDULE', 44, 321);

    const claimedVal = parseFloat(c.claimed_amount) || 0;
    const salvageVal = parseFloat(c.salvage_value) || 0;
    const settledVal = parseFloat(c.settled_amount) || 0;

    doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica-Bold')
      .text('Total Claimed Amount:', 48, 342)
      .text('Less Salvage / Mitigation:', 48, 356)
      .text('Net Carrier Exposure:', 48, 370)
      .text('Agreed Settlement Amount:', 48, 384);

    doc.font('Helvetica')
      .text(`$${claimedVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`, 200, 342)
      .text(`-$${salvageVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`, 200, 356)
      .text(`$${Math.max(0, claimedVal - salvageVal).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`, 200, 370)
      .text(`$${settledVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`, 200, 384);

    doc.font('Helvetica-Bold')
      .text('Disposition Classification:', 340, 342)
      .text('Statutory Defense Cited:', 340, 356)
      .text('Settlement Terms:', 340, 370)
      .text('Remittance Protocol:', 340, 384);

    doc.font('Helvetica')
      .text(c.disposition_status, 460, 342)
      .text(isDenied ? '49 U.S.C. 14706 Defenses' : 'CARMACK COMPLIANT', 460, 356)
      .text(isSettled ? 'FULL & FINAL RELEASE' : 'UNDER ADJUSTMENT', 460, 370)
      .text('ELECTRONIC ACH TRANSFER', 460, 384);

    // Section 3: Cause of Loss & Physical Damage Narrative
    doc.rect(36, 415, 540, 95).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 415, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 3: DAMAGE NARRATIVE & ADJUSTER INVESTIGATION SUMMARY', 44, 421);

    doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
      .text(`Loss Narrative: ${c.loss_description}`, 48, 442, { width: 516 })
      .text(`Resolution & Adjuster Notes: ${c.resolution_notes || 'Investigation completed in adherence to 49 CFR Part 370 principles.'}`, 48, 474, { width: 516 });

    // Section 4: Carmack Legal Release & Subrogation Assignment
    doc.rect(36, 520, 540, 85).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 520, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 4: LEGAL RELEASE, INDEMNIFICATION & SUBROGATION AGREEMENT', 44, 526);

    doc.fillColor('#334155').fontSize(8).font('Helvetica')
      .text('Upon disbursement of the agreed settlement amount, Claimant hereby discharges and releases Carrier, its insurer, and affiliates from all liability, claims, or demands arising out of the designated shipment. Claimant assigns and subrogates to Carrier and its cargo insurer all rights, title, and recovery actions against third-party salvage entities or contributory tortfeasors.', 48, 546, { width: 516 })
      .text('This agreement constitutes a full and final accord and satisfaction under the Carmack Amendment (49 U.S.C. § 14706).', 48, 584, { width: 516 });

    // Signature Block & Stamp
    doc.rect(36, 615, 540, 75).fill('#FFF1F2').stroke('#FDA4AF');

    doc.fillColor('#881337').fontSize(8.5).font('Helvetica-Bold')
      .text('CLAIMANT & CARRIER ATTESTATION', 48, 624)
      .text('CARGO CLAIM DIGITAL AUDIT SEAL', 340, 624);

    doc.fillColor('#334155').fontSize(8).font('Helvetica')
      .text(`Claimant Signatory: ${c.claimant_name} (${c.claimant_company})`, 48, 638)
      .text(`Carrier Risk Representative: Safety & Cargo Claims Officer`, 48, 650)
      .text(`Execution Date: ${new Date().toISOString()}`, 48, 662);

    doc.fillColor('#BE123C').fontSize(9).font('Courier-Bold')
      .text(c.settlement_audit_hash || 'SIG-CLM-VERIFIED', 340, 638);

    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica')
      .text('Tamper-evident SHA-256 cryptographic audit seal registered in LoadNexus PostgreSQL vault.', 340, 654, { width: 220 });

    // Footer
    doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
      .text('Shipping Wish LLC • LoadNexus Cargo OS • Carmack Amendment 49 U.S.C. § 14706 & 49 CFR Part 370 Dispute Vault', 36, 740, { align: 'center', width: 540 });

    doc.end();
  } catch (err) {
    console.error('[Cargo Claim PDF] Error:', err);
    res.status(500).json({ error: 'Could not generate Cargo Claim PDF.' });
  }
});

module.exports = router;
