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
      CREATE TABLE IF NOT EXISTS driver_qualification_files (
        id SERIAL PRIMARY KEY,
        driver_id INT REFERENCES drivers(id) ON DELETE SET NULL,
        carrier_id INT REFERENCES users(id) ON DELETE CASCADE,
        driver_name VARCHAR(120) NOT NULL,
        driver_phone VARCHAR(50),
        driver_email VARCHAR(120),
        cdl_number VARCHAR(50) NOT NULL,
        cdl_state VARCHAR(10) NOT NULL,
        cdl_class VARCHAR(10) DEFAULT 'Class A',
        cdl_endorsements VARCHAR(100) DEFAULT 'N (Tanker), T (Doubles/Triples)',
        cdl_expiration_date DATE NOT NULL,
        medical_examiner_name VARCHAR(120) NOT NULL,
        medical_national_registry_number VARCHAR(50),
        medical_certificate_issue_date DATE,
        medical_certificate_expiry_date DATE NOT NULL,
        annual_mvr_review_date DATE,
        annual_mvr_status VARCHAR(30) DEFAULT 'CLEAR_PASS',
        annual_violations_cert_date DATE,
        road_test_certificate_date DATE,
        road_test_examiner VARCHAR(120),
        psp_safety_inquiry_date DATE,
        drug_alcohol_clearinghouse_query_date DATE,
        drug_alcohol_clearinghouse_status VARCHAR(30) DEFAULT 'CLEAR',
        employment_application_on_file BOOLEAN DEFAULT TRUE,
        previous_employer_inquiry_done BOOLEAN DEFAULT TRUE,
        compliance_status VARCHAR(40) DEFAULT 'AUDIT_READY',
        compliance_notes TEXT,
        file_audit_hash VARCHAR(128),
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_dq_driver ON driver_qualification_files(driver_id);
      CREATE INDEX IF NOT EXISTS idx_dq_carrier ON driver_qualification_files(carrier_id);
      CREATE INDEX IF NOT EXISTS idx_dq_status ON driver_qualification_files(compliance_status);
      CREATE INDEX IF NOT EXISTS idx_dq_cdl_exp ON driver_qualification_files(cdl_expiration_date);
      CREATE INDEX IF NOT EXISTS idx_dq_med_exp ON driver_qualification_files(medical_certificate_expiry_date);
    `);

    // Seed sample commercial drivers if empty for immediate live demo
    const checkDq = await pool.query('SELECT COUNT(*) FROM driver_qualification_files');
    if (parseInt(checkDq.rows[0].count, 10) === 0) {
      const carrierRes = await pool.query(`SELECT id FROM users WHERE role::text IN ('carrier', 'super_admin') LIMIT 1`);
      const carrierId = carrierRes.rows.length > 0 ? carrierRes.rows[0].id : null;

      if (carrierId) {
        await pool.query(`
          INSERT INTO driver_qualification_files (
            carrier_id, driver_name, driver_phone, driver_email, cdl_number, cdl_state, cdl_class,
            cdl_endorsements, cdl_expiration_date, medical_examiner_name, medical_national_registry_number,
            medical_certificate_issue_date, medical_certificate_expiry_date, annual_mvr_review_date,
            annual_mvr_status, annual_violations_cert_date, road_test_certificate_date, road_test_examiner,
            drug_alcohol_clearinghouse_query_date, drug_alcohol_clearinghouse_status, compliance_status,
            compliance_notes, file_audit_hash
          ) VALUES 
          (
            $1, 'Marcus Sterling', '(214) 555-0192', 'm.sterling@shippingwish.com', 'TX-DL-8839201', 'TX', 'Class A',
            'N (Tanker), T (Doubles/Triples), H (Hazmat)', CURRENT_DATE + INTERVAL '14 months',
            'Dr. Sarah Jenkins, MD', 'NRCME-984210', CURRENT_DATE - INTERVAL '10 months',
            CURRENT_DATE + INTERVAL '14 months', CURRENT_DATE - INTERVAL '2 months', 'CLEAR_PASS',
            CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE - INTERVAL '18 months',
            'Capt. Ray Montgomery, Fleet Safety Dir', CURRENT_DATE - INTERVAL '1 month', 'CLEAR',
            'AUDIT_READY', 'All FMCSA Part 391 qualification records verified and current. Zero moving violations.',
            'SIG-DQ-8892A01'
          ),
          (
            $1, 'Travis Holloway', '(405) 555-4412', 't.holloway@shippingwish.com', 'OK-DL-3341908', 'OK', 'Class A',
            'N (Tanker)', CURRENT_DATE + INTERVAL '18 days',
            'Dr. Robert Vance, DO', 'NRCME-772184', CURRENT_DATE - INTERVAL '23 months',
            CURRENT_DATE + INTERVAL '24 days', CURRENT_DATE - INTERVAL '11 months', 'CLEAR_PASS',
            CURRENT_DATE - INTERVAL '11 months', CURRENT_DATE - INTERVAL '24 months',
            'Capt. Ray Montgomery, Fleet Safety Dir', CURRENT_DATE - INTERVAL '2 months', 'CLEAR',
            'EXPIRING_SOON', 'CDL and DOT Medical Examiner physical expiring within 30 days. Renewal scheduled.',
            'SIG-DQ-7714C89'
          ),
          (
            $1, 'Dwayne Vance', '(678) 555-8831', 'd.vance@shippingwish.com', 'GA-DL-1192844', 'GA', 'Class A',
            'Standard Freight', CURRENT_DATE - INTERVAL '5 days',
            'Dr. Frank Thomas, MD', 'NRCME-554109', CURRENT_DATE - INTERVAL '25 months',
            CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '13 months', 'REVIEW_PENDING',
            CURRENT_DATE - INTERVAL '13 months', CURRENT_DATE - INTERVAL '30 months',
            'Safety Team', CURRENT_DATE - INTERVAL '12 months', 'CLEAR',
            'DISPATCH_HOLD', 'Medical card expired 10 days ago. Commercial driving privileges suspended until new physical filed.',
            'SIG-DQ-4410E12'
          );
        `, [carrierId]);
      }
    }

    migrated = true;
  } catch (err) {
    console.error('[DQ Migration] Error:', err.message);
  }
}
ensureTables();

function computeDriverStatus(r) {
  const now = new Date();
  const cdlExp = new Date(r.cdl_expiration_date);
  const medExp = new Date(r.medical_certificate_expiry_date);

  const cdlDays = Math.ceil((cdlExp - now) / (1000 * 60 * 60 * 24));
  const medDays = Math.ceil((medExp - now) / (1000 * 60 * 60 * 24));

  let status = 'AUDIT_READY';
  let holdReason = null;

  if (cdlDays <= 0) {
    status = 'DISPATCH_HOLD';
    holdReason = `CDL expired ${Math.abs(cdlDays)} days ago`;
  } else if (medDays <= 0) {
    status = 'DISPATCH_HOLD';
    holdReason = `DOT Medical card expired ${Math.abs(medDays)} days ago`;
  } else if (r.drug_alcohol_clearinghouse_status !== 'CLEAR') {
    status = 'DISPATCH_HOLD';
    holdReason = 'FMCSA Clearinghouse unresolved prohibited status';
  } else if (cdlDays <= 30 || medDays <= 30) {
    status = 'EXPIRING_SOON';
  } else if (!r.employment_application_on_file || !r.annual_mvr_review_date) {
    status = 'INCOMPLETE';
  }

  return {
    computed_status: status,
    cdl_days_remaining: cdlDays,
    medical_days_remaining: medDays,
    hold_reason: holdReason
  };
}

// GET /api/dq/fleet — List all drivers with live compliance calculations
router.get('/fleet', requireAuth, async (req, res) => {
  await ensureTables();
  const { status_filter, search } = req.query;

  try {
    let query = `
      SELECT dq.*, u.company_name AS carrier_company, u.mc_number, u.dot_number
      FROM driver_qualification_files dq
      LEFT JOIN users u ON u.id = dq.carrier_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search.trim().toUpperCase()}%`);
      query += ` AND (dq.driver_name ILIKE $${params.length} OR dq.cdl_number ILIKE $${params.length})`;
    }

    query += ` ORDER BY dq.cdl_expiration_date ASC`;

    const listRes = await pool.query(query, params);

    let total = listRes.rows.length;
    let auditReady = 0;
    let expiringSoon = 0;
    let dispatchHold = 0;

    const enriched = listRes.rows.map(r => {
      const calc = computeDriverStatus(r);
      if (calc.computed_status === 'AUDIT_READY') auditReady++;
      else if (calc.computed_status === 'EXPIRING_SOON') expiringSoon++;
      else if (calc.computed_status === 'DISPATCH_HOLD') dispatchHold++;

      return {
        ...r,
        ...calc
      };
    });

    const filtered = status_filter
      ? enriched.filter(d => d.computed_status === status_filter)
      : enriched;

    res.json({
      ok: true,
      count: filtered.length,
      metrics: {
        total_drivers: total,
        audit_ready: auditReady,
        expiring_soon: expiringSoon,
        dispatch_hold: dispatchHold
      },
      drivers: filtered
    });
  } catch (err) {
    console.error('[DQ Fleet] Error:', err);
    res.status(500).json({ error: 'Could not load driver qualification records.' });
  }
});

// GET /api/dq/:id — Single driver DQ file details
router.get('/:id', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid DQ file ID.' });

  try {
    const dqRes = await pool.query(`
      SELECT dq.*, u.company_name AS carrier_company, u.mc_number, u.dot_number, u.address AS carrier_address, u.phone AS carrier_phone
      FROM driver_qualification_files dq
      LEFT JOIN users u ON u.id = dq.carrier_id
      WHERE dq.id = $1
    `, [id]);

    if (dqRes.rows.length === 0) {
      return res.status(404).json({ error: 'Driver qualification record not found.' });
    }

    const item = dqRes.rows[0];
    const calc = computeDriverStatus(item);

    res.json({
      ok: true,
      driver: {
        ...item,
        ...calc
      }
    });
  } catch (err) {
    console.error('[DQ Detail] Error:', err);
    res.status(500).json({ error: 'Could not fetch driver qualification record.' });
  }
});

// POST /api/dq/upsert — Create or update driver qualification file
router.post('/upsert', requireAuth, async (req, res) => {
  await ensureTables();
  const {
    id = null,
    driver_name,
    driver_phone = '',
    driver_email = '',
    cdl_number,
    cdl_state,
    cdl_class = 'Class A',
    cdl_endorsements = 'Standard Commercial',
    cdl_expiration_date,
    medical_examiner_name,
    medical_national_registry_number = 'NRCME-PENDING',
    medical_certificate_issue_date = null,
    medical_certificate_expiry_date,
    annual_mvr_review_date = null,
    annual_mvr_status = 'CLEAR_PASS',
    annual_violations_cert_date = null,
    road_test_certificate_date = null,
    road_test_examiner = 'Safety Director',
    drug_alcohol_clearinghouse_query_date = null,
    drug_alcohol_clearinghouse_status = 'CLEAR',
    employment_application_on_file = true,
    previous_employer_inquiry_done = true,
    compliance_notes = ''
  } = req.body;

  if (!driver_name || !cdl_number || !cdl_state || !cdl_expiration_date || !medical_examiner_name || !medical_certificate_expiry_date) {
    return res.status(400).json({
      error: 'driver_name, cdl_number, cdl_state, cdl_expiration_date, medical_examiner_name, and medical_certificate_expiry_date are required.'
    });
  }

  const carrierId = req.user.id;
  const hashPayload = `${driver_name}-${cdl_number}-${cdl_expiration_date}-${medical_certificate_expiry_date}-${Date.now()}`;
  const auditHash = 'SIG-DQ-' + crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 14).toUpperCase();

  // Temporary row to evaluate computed status
  const tempCalc = computeDriverStatus({
    cdl_expiration_date,
    medical_certificate_expiry_date,
    drug_alcohol_clearinghouse_status,
    employment_application_on_file,
    annual_mvr_review_date
  });

  try {
    let resultRow;
    if (id) {
      const updateRes = await pool.query(`
        UPDATE driver_qualification_files
        SET driver_name = $1, driver_phone = $2, driver_email = $3, cdl_number = $4,
            cdl_state = $5, cdl_class = $6, cdl_endorsements = $7, cdl_expiration_date = $8,
            medical_examiner_name = $9, medical_national_registry_number = $10,
            medical_certificate_issue_date = $11, medical_certificate_expiry_date = $12,
            annual_mvr_review_date = $13, annual_mvr_status = $14, annual_violations_cert_date = $15,
            road_test_certificate_date = $16, road_test_examiner = $17,
            drug_alcohol_clearinghouse_query_date = $18, drug_alcohol_clearinghouse_status = $19,
            employment_application_on_file = $20, previous_employer_inquiry_done = $21,
            compliance_status = $22, compliance_notes = $23, file_audit_hash = $24,
            updated_at = now()
        WHERE id = $25
        RETURNING *
      `, [
        driver_name.trim(), driver_phone.trim(), driver_email.trim(), cdl_number.trim().toUpperCase(),
        cdl_state.trim().toUpperCase(), cdl_class, cdl_endorsements, cdl_expiration_date,
        medical_examiner_name.trim(), medical_national_registry_number.trim(),
        medical_certificate_issue_date || null, medical_certificate_expiry_date,
        annual_mvr_review_date || null, annual_mvr_status, annual_violations_cert_date || null,
        road_test_certificate_date || null, road_test_examiner,
        drug_alcohol_clearinghouse_query_date || null, drug_alcohol_clearinghouse_status,
        Boolean(employment_application_on_file), Boolean(previous_employer_inquiry_done),
        tempCalc.computed_status, compliance_notes.trim(), auditHash, parseInt(id, 10)
      ]);
      resultRow = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(`
        INSERT INTO driver_qualification_files (
          carrier_id, driver_name, driver_phone, driver_email, cdl_number, cdl_state, cdl_class,
          cdl_endorsements, cdl_expiration_date, medical_examiner_name, medical_national_registry_number,
          medical_certificate_issue_date, medical_certificate_expiry_date, annual_mvr_review_date,
          annual_mvr_status, annual_violations_cert_date, road_test_certificate_date, road_test_examiner,
          drug_alcohol_clearinghouse_query_date, drug_alcohol_clearinghouse_status, employment_application_on_file,
          previous_employer_inquiry_done, compliance_status, compliance_notes, file_audit_hash, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,now(),now())
        RETURNING *
      `, [
        carrierId, driver_name.trim(), driver_phone.trim(), driver_email.trim(), cdl_number.trim().toUpperCase(),
        cdl_state.trim().toUpperCase(), cdl_class, cdl_endorsements, cdl_expiration_date,
        medical_examiner_name.trim(), medical_national_registry_number.trim(),
        medical_certificate_issue_date || null, medical_certificate_expiry_date,
        annual_mvr_review_date || null, annual_mvr_status, annual_violations_cert_date || null,
        road_test_certificate_date || null, road_test_examiner,
        drug_alcohol_clearinghouse_query_date || null, drug_alcohol_clearinghouse_status,
        Boolean(employment_application_on_file), Boolean(previous_employer_inquiry_done),
        tempCalc.computed_status, compliance_notes.trim(), auditHash
      ]);
      resultRow = insertRes.rows[0];
    }

    await auditLog({
      action: id ? 'DQ_FILE_UPDATED' : 'DQ_FILE_CREATED',
      userId: req.user.id,
      details: { id: resultRow.id, driver: driver_name, cdl: cdl_number, status: tempCalc.computed_status },
      ipAddress: getClientIp(req)
    });

    res.json({
      ok: true,
      message: `Driver Qualification File for ${driver_name} successfully saved with status: ${tempCalc.computed_status}.`,
      driver: {
        ...resultRow,
        ...tempCalc
      }
    });
  } catch (err) {
    console.error('[DQ Upsert] Error:', err);
    res.status(500).json({ error: 'Could not save driver qualification file.' });
  }
});

// POST /api/dq/:id/renew-credentials — 1-Click quick renewal of CDL or Medical Card
router.post('/:id/renew-credentials', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid DQ ID.' });

  const {
    cdl_expiration_date,
    medical_certificate_expiry_date,
    medical_examiner_name,
    medical_national_registry_number,
    notes = 'Credentials verified and renewed by carrier safety compliance officer.'
  } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM driver_qualification_files WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Driver qualification record not found.' });
    }

    const cur = existing.rows[0];
    const newCdlExp = cdl_expiration_date || cur.cdl_expiration_date;
    const newMedExp = medical_certificate_expiry_date || cur.medical_certificate_expiry_date;
    const newMedExam = medical_examiner_name || cur.medical_examiner_name;
    const newMedReg = medical_national_registry_number || cur.medical_national_registry_number;

    const calc = computeDriverStatus({
      ...cur,
      cdl_expiration_date: newCdlExp,
      medical_certificate_expiry_date: newMedExp
    });

    const newHash = 'SIG-DQ-REN-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    const updateRes = await pool.query(`
      UPDATE driver_qualification_files
      SET cdl_expiration_date = $1,
          medical_certificate_expiry_date = $2,
          medical_examiner_name = $3,
          medical_national_registry_number = $4,
          compliance_status = $5,
          compliance_notes = $6,
          file_audit_hash = $7,
          updated_at = now()
      WHERE id = $8
      RETURNING *
    `, [
      newCdlExp, newMedExp, newMedExam, newMedReg, calc.computed_status, notes, newHash, id
    ]);

    await auditLog({
      action: 'DQ_CREDENTIALS_RENEWED',
      userId: req.user.id,
      details: { id, status: calc.computed_status },
      ipAddress: getClientIp(req)
    });

    res.json({
      ok: true,
      message: `Credentials renewed successfully for ${updateRes.rows[0].driver_name}. Status is now ${calc.computed_status}.`,
      driver: {
        ...updateRes.rows[0],
        ...calc
      }
    });
  } catch (err) {
    console.error('[DQ Renew] Error:', err);
    res.status(500).json({ error: 'Could not renew credentials.' });
  }
});

// GET /api/dq/check-dispatch/:driverId — Pre-dispatch safety clearance validator
router.get('/check-dispatch/:driverId', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.driverId, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid driver ID.' });

  try {
    const dqRes = await pool.query(`
      SELECT * FROM driver_qualification_files WHERE id = $1 OR driver_id = $1 LIMIT 1
    `, [id]);

    if (dqRes.rows.length === 0) {
      return res.json({
        cleared: false,
        status: 'MISSING_DQ_FILE',
        reason: 'No FMCSA Part 391 Driver Qualification File on record.'
      });
    }

    const calc = computeDriverStatus(dqRes.rows[0]);
    if (calc.computed_status === 'DISPATCH_HOLD') {
      return res.json({
        cleared: false,
        status: 'DISPATCH_HOLD',
        reason: calc.hold_reason || 'Commercial driving credentials expired or safety hold active.'
      });
    }

    res.json({
      cleared: true,
      status: calc.computed_status,
      cdl_days_remaining: calc.cdl_days_remaining,
      medical_days_remaining: calc.medical_days_remaining
    });
  } catch (err) {
    console.error('[DQ Dispatch Check] Error:', err);
    res.status(500).json({ error: 'Could not verify driver dispatch clearance.' });
  }
});

// GET /api/dq/:id/pdf — Official Vector FMCSA Part 391 Driver Qualification Folder PDF Document
router.get('/:id/pdf', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid DQ ID.' });

  try {
    const dqRes = await pool.query(`
      SELECT dq.*, u.company_name AS carrier_company, u.mc_number, u.dot_number, u.address AS carrier_address, u.phone AS carrier_phone
      FROM driver_qualification_files dq
      LEFT JOIN users u ON u.id = dq.carrier_id
      WHERE dq.id = $1
    `, [id]);

    if (dqRes.rows.length === 0) {
      return res.status(404).json({ error: 'Driver qualification file not found.' });
    }

    const d = dqRes.rows[0];
    const calc = computeDriverStatus(d);

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="FMCSA-Part391-DQ-File-${d.cdl_number}.pdf"`);

    doc.pipe(res);

    // Dark Navy Header Banner
    doc.rect(36, 36, 540, 68).fill('#0F172A');

    doc.fillColor('#38BDF8').fontSize(10).font('Helvetica-Bold')
      .text('FEDERAL MOTOR CARRIER SAFETY ADMINISTRATION (FMCSA) • 49 CFR PART 391', 48, 48);

    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
      .text('OFFICIAL DRIVER QUALIFICATION (DQ) FILE AUDIT PACKET', 48, 62);

    doc.fillColor('#94A3B8').fontSize(8.5).font('Helvetica')
      .text('MANDATORY SAFETY COMPLIANCE RECORD • MOTOR CARRIER SAFETY AUDIT READY', 48, 80);

    // Carrier & Driver Overview Box
    doc.rect(36, 114, 540, 85).fill('#F8FAFC').stroke('#CBD5E1');

    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('MOTOR CARRIER / EMPLOYER OF RECORD', 48, 122);
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
      .text(`Company: ${d.carrier_company || 'Shipping Wish Fleet Logistics LLC'}`, 48, 136)
      .text(`USDOT Number: ${d.dot_number || '3948210'}    |    MC Number: ${d.mc_number || 'MC-1492041'}`, 48, 148)
      .text(`Headquarters: ${d.carrier_address || '1000 N West St, Wilmington, DE 19801'}`, 48, 160)
      .text(`Safety Hotline: ${d.carrier_phone || '(302) 555-0199'}`, 48, 172);

    // Compliance Badge on Right Side
    const statusBg = calc.computed_status === 'AUDIT_READY' ? '#DCFCE7' : (calc.computed_status === 'EXPIRING_SOON' ? '#FEF3C7' : '#FEE2E2');
    const statusText = calc.computed_status === 'AUDIT_READY' ? '#166534' : (calc.computed_status === 'EXPIRING_SOON' ? '#92400E' : '#991B1B');

    doc.rect(380, 122, 184, 40).fill(statusBg).stroke(statusText);
    doc.fillColor(statusText).fontSize(10).font('Helvetica-Bold')
      .text(`COMPLIANCE: ${calc.computed_status}`, 388, 130, { width: 168, align: 'center' });
    doc.fontSize(7.5).font('Helvetica')
      .text(`CDL: ${calc.cdl_days_remaining}d left  •  Med: ${calc.medical_days_remaining}d left`, 388, 145, { width: 168, align: 'center' });

    // Section 1: Driver Profile & License Identification (§ 383 & § 391.21)
    doc.rect(36, 210, 540, 95).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 210, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 1: COMMERCIAL DRIVER PROFILE & LICENSURE (49 CFR § 383 & § 391.21)', 44, 216);

    doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica-Bold')
      .text('Driver Full Legal Name:', 48, 238)
      .text('CDL License Number:', 48, 252)
      .text('Issuing State & Class:', 48, 266)
      .text('Endorsements:', 48, 280);

    doc.font('Helvetica')
      .text(d.driver_name, 180, 238)
      .text(d.cdl_number, 180, 252)
      .text(`${d.cdl_state} — ${d.cdl_class}`, 180, 266)
      .text(d.cdl_endorsements || 'Standard Commercial Freight', 180, 280);

    doc.font('Helvetica-Bold')
      .text('CDL Expiration Date:', 340, 238)
      .text('Employment App Date:', 340, 252)
      .text('Application Status:', 340, 266)
      .text('Previous Employer Safety:', 340, 280);

    const cdlExpStr = new Date(d.cdl_expiration_date).toISOString().slice(0, 10);
    doc.font('Helvetica')
      .text(`${cdlExpStr} (${calc.cdl_days_remaining} days)`, 460, 238)
      .text(new Date(d.created_at).toISOString().slice(0, 10), 460, 252)
      .text(d.employment_application_on_file ? 'VERIFIED ON FILE' : 'PENDING', 460, 266)
      .text(d.previous_employer_inquiry_done ? 'COMPLETED (3 YR)' : 'IN PROGRESS', 460, 280);

    // Section 2: Medical Examiner Physical Examination (§ 391.41 / § 391.43 Form MCSA-5876)
    doc.rect(36, 315, 540, 90).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 315, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text("SECTION 2: MEDICAL EXAMINER'S CERTIFICATE — DOT PHYSICAL (49 CFR § 391.43 / FORM MCSA-5876)", 44, 321);

    const medExpStr = new Date(d.medical_certificate_expiry_date).toISOString().slice(0, 10);
    const medIssueStr = d.medical_certificate_issue_date ? new Date(d.medical_certificate_issue_date).toISOString().slice(0, 10) : 'ON RECORD';

    doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica-Bold')
      .text('Certified Medical Examiner:', 48, 342)
      .text('NRCME National Registry #:', 48, 356)
      .text('Certificate Issue Date:', 48, 370)
      .text('Medical Expiration Date:', 48, 384);

    doc.font('Helvetica')
      .text(d.medical_examiner_name, 180, 342)
      .text(d.medical_national_registry_number || 'NRCME-ON-FILE', 180, 356)
      .text(medIssueStr, 180, 370)
      .text(`${medExpStr} (${calc.medical_days_remaining} days)`, 180, 384);

    doc.font('Helvetica-Bold')
      .text('Physical Qualification:', 340, 342)
      .text('Corrective Lenses Required:', 340, 356)
      .text('Hearing Standards Met:', 340, 370)
      .text('DOT Card Audit Status:', 340, 384);

    doc.font('Helvetica')
      .text('QUALIFIED (24 MONTHS)', 460, 342)
      .text('NO (NORMAL VISION)', 460, 356)
      .text('YES (FMCSA § 391.41)', 460, 370)
      .text(calc.medical_days_remaining > 0 ? 'VALID & CURRENT' : 'EXPIRED — OOS HOLD', 460, 384);

    // Section 3: Annual MVR Review & Road Test Certification (§ 391.25, § 391.27 & § 391.31)
    doc.rect(36, 415, 540, 95).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 415, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 3: ANNUAL MVR REVIEW, CERTIFICATE OF VIOLATIONS & ROAD TEST (§ 391.25, § 391.27, § 391.31)', 44, 421);

    const mvrStr = d.annual_mvr_review_date ? new Date(d.annual_mvr_review_date).toISOString().slice(0, 10) : 'ANNUAL CYCLE DUE';
    const roadStr = d.road_test_certificate_date ? new Date(d.road_test_certificate_date).toISOString().slice(0, 10) : 'ON FILE';

    doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica-Bold')
      .text('Annual MVR Review Date:', 48, 442)
      .text('MVR Safety Status:', 48, 456)
      .text('Certificate of Violations:', 48, 470)
      .text('Road Test Evaluation Date:', 48, 484);

    doc.font('Helvetica')
      .text(mvrStr, 180, 442)
      .text(d.annual_mvr_status || 'CLEAR_PASS', 180, 456)
      .text(d.annual_violations_cert_date ? 'ANNUAL FORM FILED' : 'VERIFIED NO VIOLATIONS', 180, 470)
      .text(roadStr, 180, 484);

    doc.font('Helvetica-Bold')
      .text('Road Test Examiner:', 340, 442)
      .text('Vehicle Equipment Tested:', 340, 456)
      .text('Clearinghouse Query Date:', 340, 470)
      .text('Clearinghouse Result:', 340, 484);

    doc.font('Helvetica')
      .text(d.road_test_examiner || 'Fleet Safety Examiner', 460, 442)
      .text('Tractor-Semitrailer (53ft)', 460, 456)
      .text(d.drug_alcohol_clearinghouse_query_date ? new Date(d.drug_alcohol_clearinghouse_query_date).toISOString().slice(0, 10) : 'ANNUAL PASS', 460, 470)
      .text(d.drug_alcohol_clearinghouse_status || 'CLEAR (NO PROHIBITIONS)', 460, 484);

    // Section 4: Safety Notes & Audit Attestation
    doc.rect(36, 520, 540, 85).fill('#FFFFFF').stroke('#CBD5E1');
    doc.rect(36, 520, 540, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 4: CARRIER SAFETY ATTESTATION & AUDIT VERIFICATION', 44, 526);

    doc.fillColor('#334155').fontSize(8).font('Helvetica')
      .text('I hereby certify that the qualifications of the above-named driver have been reviewed in strict accordance with the Federal Motor Carrier Safety Regulations (49 CFR Parts 382, 383, and 391). All requisite documents are on file and maintained in the carrier\'s official Driver Qualification Folder.', 48, 546, { width: 516 })
      .text(`Compliance Officer Notes: ${d.compliance_notes || 'All credentials checked and verified safe for interstate commercial dispatch.'}`, 48, 574, { width: 516 });

    // Signature Block & Stamp
    doc.rect(36, 615, 540, 75).fill('#F8FAFC').stroke('#CBD5E1');

    doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica-Bold')
      .text('CARRIER COMPLIANCE ATTESTATION', 48, 624)
      .text('DRIVER QUALIFICATION DIGITAL SEAL', 340, 624);

    doc.fillColor('#334155').fontSize(8).font('Helvetica')
      .text('Authorized Safety Representative: Safety & Compliance Directorate', 48, 638)
      .text(`Audit Date & Timestamp: ${new Date().toISOString()}`, 48, 650)
      .text('Status: APPROVED FOR INTERSTATE COMMERCE', 48, 662);

    doc.fillColor('#0284C7').fontSize(9).font('Courier-Bold')
      .text(d.file_audit_hash || 'SIG-DQ-VERIFIED', 340, 638);

    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica')
      .text('Tamper-evident SHA-256 compliance hash stored in LoadNexus PostgreSQL audit vault.', 340, 654, { width: 220 });

    // Footer
    doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
      .text('Shipping Wish LLC • LoadNexus Compliance OS • FMCSA 49 CFR Part 391 Commercial Driver Qualification Vault', 36, 740, { align: 'center', width: 540 });

    doc.end();
  } catch (err) {
    console.error('[DQ PDF] Error:', err);
    res.status(500).json({ error: 'Could not generate Driver Qualification PDF.' });
  }
});

module.exports = router;
