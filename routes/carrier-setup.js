const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { sendBrandedEmail } = require('../utils/mailer');
const { notifyAdmins } = require('../utils/notifications');
const { isValidEmail } = require('../utils/email-valid');

// Ensure upload directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads/carrier_onboarding');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Ensure onboarding_submissions table exists
async function ensureOnboardingTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS onboarding_submissions (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
        company_name TEXT NOT NULL,
        dba TEXT,
        owner_name TEXT,
        title TEXT,
        phone TEXT NOT NULL,
        emergency_phone TEXT,
        email TEXT NOT NULL,
        billing_email TEXT,
        phy_address TEXT,
        phy_city TEXT,
        phy_state TEXT,
        phy_zip TEXT,
        mc_number TEXT,
        dot_number TEXT,
        equipment_types TEXT,
        num_trucks INTEGER DEFAULT 1,
        num_drivers INTEGER DEFAULT 1,
        max_payload TEXT,
        eld_provider TEXT,
        factoring_company TEXT,
        preferred_lanes TEXT,
        excluded_states TEXT,
        min_rpm TEXT,
        mc_cert_path TEXT,
        coi_path TEXT,
        w9_path TEXT,
        noa_path TEXT,
        signature_path TEXT,
        signature_type TEXT,
        signer_name TEXT,
        signer_title TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_onboarding_mc ON onboarding_submissions(mc_number);
      CREATE INDEX IF NOT EXISTS idx_onboarding_email ON onboarding_submissions(email);
    `);
  } catch (err) {
    console.warn('[ONBOARDING_TABLE_WARN]', err.message);
  }
}
ensureOnboardingTable();

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}-${cleanName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max per file
});

const uploadFields = upload.fields([
  { name: 'mc_cert', maxCount: 1 },
  { name: 'coi', maxCount: 1 },
  { name: 'w9', maxCount: 1 },
  { name: 'noa', maxCount: 1 }
]);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * POST /api/carrier-setup/submit
 * Handles multi-step digital carrier onboarding submission
 */
router.post('/submit', uploadFields, async (req, res) => {
  try {
    const body = req.body || {};

    const companyName = String(body.company_name || '').trim();
    const dba = String(body.dba || '').trim();
    const ownerName = String(body.owner_name || body.contact_name || '').trim();
    const title = String(body.title || 'Owner / Authorized Representative').trim();
    const phone = String(body.phone || '').trim();
    const emergencyPhone = String(body.emergency_phone || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const billingEmail = String(body.billing_email || '').trim().toLowerCase();
    const address = String(body.address || '').trim();
    const city = String(body.city || '').trim();
    const state = String(body.state || '').trim().toUpperCase();
    const zip = String(body.zip || '').trim();

    const mcNumber = String(body.mc_number || '').trim().replace(/^MC-?/i, '');
    const dotNumber = String(body.dot_number || '').trim().replace(/^DOT-?/i, '');
    const equipmentTypes = Array.isArray(body.equipment_types)
      ? body.equipment_types.join(', ')
      : String(body.equipment_types || '53ft Dry Van').trim();
    const numTrucks = parseInt(body.num_trucks, 10) || 1;
    const numDrivers = parseInt(body.num_drivers, 10) || 1;
    const maxPayload = String(body.max_payload || '45,000 lbs').trim();
    const eldProvider = String(body.eld_provider || '').trim();
    const factoringCompany = String(body.factoring_company || '').trim();
    const preferredLanes = String(body.preferred_lanes || '').trim();
    const excludedStates = String(body.excluded_states || '').trim();
    const minRpm = String(body.min_rpm || '').trim();

    const signerName = String(body.signer_name || ownerName).trim();
    const signerTitle = String(body.signer_title || title).trim();
    const signatureType = String(body.signature_type || 'draw').trim();
    const rawSignatureData = String(body.signature_data || '').trim();

    // Validation
    if (!companyName) {
      return res.status(400).json({ error: 'Company Legal Name is required' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Valid contact phone number is required' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    if (!mcNumber && !dotNumber) {
      return res.status(400).json({ error: 'MC# or USDOT# is required' });
    }
    if (!signerName) {
      return res.status(400).json({ error: 'Signer legal full name is required' });
    }

    // Process file paths
    const files = req.files || {};
    const mcCertFile = files.mc_cert ? files.mc_cert[0] : null;
    const coiFile = files.coi ? files.coi[0] : null;
    const w9File = files.w9 ? files.w9[0] : null;
    const noaFile = files.noa ? files.noa[0] : null;

    const mcCertPath = mcCertFile ? mcCertFile.path : null;
    const coiPath = coiFile ? coiFile.path : null;
    const w9Path = w9File ? w9File.path : null;
    const noaPath = noaFile ? noaFile.path : null;

    // Process digital signature if base64 data URL
    let signaturePath = null;
    if (rawSignatureData && rawSignatureData.startsWith('data:image')) {
      try {
        const matches = rawSignatureData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] || 'png';
          const base64Data = matches[2];
          const sigFileName = `signature-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
          signaturePath = path.join(UPLOADS_DIR, sigFileName);
          fs.writeFileSync(signaturePath, Buffer.from(base64Data, 'base64'));
        }
      } catch (sigErr) {
        console.warn('[SIGNATURE_SAVE_WARN]', sigErr.message);
      }
    }

    const ipAddress = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    // 1. Check or Upsert in crm_leads
    let leadId = null;
    const existing = await pool.query(
      `SELECT id, status, notes FROM crm_leads
       WHERE ($1 <> '' AND mc_number = $1)
          OR ($2 <> '' AND phone = $2)
          OR ($3 <> '' AND lower(email) = lower($3))
          OR ($4 <> '' AND dot_number = $4)
       LIMIT 1`,
      [mcNumber, phone, email, dotNumber]
    );

    const onboardingNotes = `[DIGITAL ONBOARDING PORTAL SUBMISSION]
Date: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST
DBA: ${dba || 'N/A'}
Signer: ${signerName} (${signerTitle})
Equipment: ${equipmentTypes} | Trucks: ${numTrucks} | Drivers: ${numDrivers} | Max Payload: ${maxPayload}
ELD: ${eldProvider || 'N/A'} | Factoring: ${factoringCompany || 'None / QuickPay'}
Target Lanes: ${preferredLanes || 'All 48 states'} | Excluded: ${excludedStates || 'None'} | Min RPM: ${minRpm ? '$' + minRpm : 'Market best'}
Documents Uploaded:
- MC Certificate: ${mcCertFile ? mcCertFile.originalname : 'Pending'}
- Insurance COI: ${coiFile ? coiFile.originalname : 'Pending'}
- Form W-9: ${w9File ? w9File.originalname : 'Pending'}
- Factoring NOA: ${noaFile ? noaFile.originalname : 'None provided'}
IP Address: ${ipAddress}
`;

    if (existing.rows.length > 0) {
      leadId = existing.rows[0].id;
      await pool.query(
        `UPDATE crm_leads
         SET company_name = COALESCE(NULLIF($1, ''), company_name),
             owner_name = COALESCE(NULLIF($2, ''), owner_name),
             phone = COALESCE(NULLIF($3, ''), phone),
             email = COALESCE(NULLIF($4, ''), email),
             mc_number = COALESCE(NULLIF($5, ''), mc_number),
             dot_number = COALESCE(NULLIF($6, ''), dot_number),
             equipment_type = COALESCE(NULLIF($7, ''), equipment_type),
             num_trucks = GREATEST(num_trucks, $8),
             num_drivers = GREATEST(num_drivers, $9),
             phy_address = COALESCE(NULLIF($10, ''), phy_address),
             phy_city = COALESCE(NULLIF($11, ''), phy_city),
             phy_state = COALESCE(NULLIF($12, ''), phy_state),
             phy_zip = COALESCE(NULLIF($13, ''), phy_zip),
             target_lanes = COALESCE(NULLIF($14, ''), target_lanes),
             status = 'packet_sent',
             insurance_onfile = $15,
             notes = $16 || E'\n\n' || COALESCE(notes, ''),
             last_contacted_at = now()
         WHERE id = $17`,
        [
          companyName,
          ownerName,
          phone,
          email,
          mcNumber,
          dotNumber,
          equipmentTypes,
          numTrucks,
          numDrivers,
          address,
          city,
          state,
          zip,
          preferredLanes,
          Boolean(coiFile),
          onboardingNotes,
          leadId
        ]
      );
    } else {
      const insRes = await pool.query(
        `INSERT INTO crm_leads (
           company_name, owner_name, phone, email, mc_number, dot_number,
           equipment_type, num_trucks, num_drivers, phy_address, phy_city,
           phy_state, phy_zip, target_lanes, status, insurance_onfile, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'packet_sent', $15, $16)
         RETURNING id`,
        [
          companyName,
          ownerName,
          phone,
          email,
          mcNumber,
          dotNumber,
          equipmentTypes,
          numTrucks,
          numDrivers,
          address,
          city,
          state,
          zip,
          preferredLanes,
          Boolean(coiFile),
          onboardingNotes
        ]
      );
      leadId = insRes.rows[0].id;
    }

    // 2. Insert into onboarding_submissions
    await pool.query(
      `INSERT INTO onboarding_submissions (
         lead_id, company_name, dba, owner_name, title, phone, emergency_phone,
         email, billing_email, phy_address, phy_city, phy_state, phy_zip,
         mc_number, dot_number, equipment_types, num_trucks, num_drivers,
         max_payload, eld_provider, factoring_company, preferred_lanes,
         excluded_states, min_rpm, mc_cert_path, coi_path, w9_path, noa_path,
         signature_path, signature_type, signer_name, signer_title, ip_address
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
         $29, $30, $31, $32, $33
       )`,
      [
        leadId,
        companyName,
        dba || null,
        ownerName,
        title,
        phone,
        emergencyPhone || null,
        email,
        billingEmail || null,
        address,
        city,
        state,
        zip,
        mcNumber,
        dotNumber,
        equipmentTypes,
        numTrucks,
        numDrivers,
        maxPayload,
        eldProvider || null,
        factoringCompany || null,
        preferredLanes || null,
        excludedStates || null,
        minRpm || null,
        mcCertPath,
        coiPath,
        w9Path,
        noaPath,
        signaturePath,
        signatureType,
        signerName,
        signerTitle,
        ipAddress
      ]
    );

    // 3. Automated Confirmation Email with Official Onboarding Packet Attached
    const packetPdfPath = path.join(__dirname, '../public/downloads/Shipping-Wish-Carrier-Onboarding-Packet.pdf');
    const attachments = [];
    if (fs.existsSync(packetPdfPath)) {
      attachments.push({
        filename: 'Shipping-Wish-Carrier-Onboarding-Packet.pdf',
        content: fs.readFileSync(packetPdfPath)
      });
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 620px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #0a192f; padding: 28px 32px; text-align: center; }
    .logo-badge { display: inline-block; background: #eab308; color: #0a192f; font-weight: 800; font-size: 16px; padding: 6px 14px; border-radius: 6px; letter-spacing: 0.5px; margin-bottom: 8px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; }
    .header p { color: #94a3b8; margin: 6px 0 0; font-size: 14px; }
    .content { padding: 32px; }
    .welcome-text { font-size: 16px; line-height: 1.6; color: #334155; margin-bottom: 20px; }
    .info-box { background: #f1f5f9; border-left: 4px solid #0284c7; padding: 18px 20px; border-radius: 6px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #64748b; font-weight: 600; }
    .info-value { color: #0f172a; font-weight: 700; text-align: right; }
    .steps-card { background: #fdfbf7; border: 1px solid #fef3c7; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .step-item { display: flex; align-items: flex-start; margin-bottom: 12px; }
    .step-item:last-child { margin-bottom: 0; }
    .step-num { background: #0a192f; color: #ffffff; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; margin-right: 12px; flex-shrink: 0; margin-top: 2px; }
    .step-desc { font-size: 14px; line-height: 1.5; color: #475569; }
    .contacts-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    .contacts-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
    .footer { background: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-badge">SHIPPING WISH LLC</div>
      <h1>Carrier Onboarding Received & Confirmed</h1>
      <p>Dedicated Fleet Operations & 24/7 Dispatch Services</p>
    </div>
    <div class="content">
      <div class="welcome-text">
        Dear <strong>${escapeHtml(ownerName || companyName)}</strong>,<br><br>
        Thank you for submitting your carrier onboarding packet with <strong>Shipping Wish LLC</strong>. Your digital submission and dispatch authorization have been successfully received and placed in priority review.
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Carrier Legal Name:</span>
          <span class="info-value">${escapeHtml(companyName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Operating Authority:</span>
          <span class="info-value">MC# ${escapeHtml(mcNumber || 'Pending')} ${dotNumber ? '· DOT# ' + escapeHtml(dotNumber) : ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Equipment Registered:</span>
          <span class="info-value">${escapeHtml(equipmentTypes)} (${numTrucks} Truck${numTrucks > 1 ? 's' : ''})</span>
        </div>
        <div class="info-row">
          <span class="info-label">Signer / Authorized Officer:</span>
          <span class="info-value">${escapeHtml(signerName)} (${escapeHtml(signerTitle)})</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value" style="color:#059669;">✓ Packet Signed & Verified</span>
        </div>
      </div>

      <div class="steps-card">
        <div style="font-weight:700;color:#92400e;margin-bottom:12px;font-size:15px;">Next Immediate Steps (SLA: Within 2 Hours)</div>
        <div class="step-item">
          <div class="step-num">1</div>
          <div class="step-desc"><strong>Safety & Authority Check:</strong> Our compliance team verifies your active MC authority and COI coverage.</div>
        </div>
        <div class="step-item">
          <div class="step-num">2</div>
          <div class="step-desc"><strong>Dedicated Dispatcher Assigned:</strong> A dedicated operations manager will contact your dispatch line (<strong>${escapeHtml(phone)}</strong>) to confirm target lanes and rate preferences.</div>
        </div>
        <div class="step-item">
          <div class="step-num">3</div>
          <div class="step-desc"><strong>Live Load Booking:</strong> We begin screening top-paying spot freight and contract lanes tailored strictly to your fleet's RPM minimums.</div>
        </div>
      </div>

      <p style="font-size:14px;color:#475569;line-height:1.6;">
        Attached to this email is a copy of your completed <strong>Shipping-Wish-Carrier-Onboarding-Packet.pdf</strong> containing the signed Limited Power of Attorney (POA), Carrier Profile, and payment terms for your corporate files.
      </p>

      <table class="contacts-table">
        <tr>
          <td><strong>24/7 Dispatch Desk:</strong></td>
          <td><a href="tel:+15514006300" style="color:#0284c7;text-decoration:none;font-weight:600;">+1 (551) 400-6300</a></td>
        </tr>
        <tr>
          <td><strong>Operations & Booking:</strong></td>
          <td><a href="mailto:operations@shippingwish.com" style="color:#0284c7;text-decoration:none;">operations@shippingwish.com</a></td>
        </tr>
        <tr>
          <td><strong>Main Headquarters:</strong></td>
          <td>+1 (917) 737-0021</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <strong>Shipping Wish LLC</strong> · 19266 Coastal Hwy, Rehoboth Beach, DE 19971<br>
      Independent Fleet Operations Management & TMS Solutions<br>
      You keep 100% of broker freight pay. We work exclusively as your dedicated staff.
    </div>
  </div>
</body>
</html>
`;

    try {
      await sendBrandedEmail({
        to: email,
        subject: `Carrier Setup & Onboarding Packet Confirmed — ${companyName} [MC# ${mcNumber || 'Authority'}]`,
        html: emailHtml,
        text: `Welcome to Shipping Wish LLC! Your carrier onboarding packet for ${companyName} (MC# ${mcNumber}) has been confirmed. A dedicated dispatcher will reach out to ${phone} within 2 hours. 24/7 Operations Line: +1 (551) 400-6300.`,
        leadId,
        transactional: true,
        templateKey: 'onboarding',
        from: 'Shipping Wish Operations <operations@shippingwish.com>',
        attachments
      });
    } catch (mailErr) {
      console.warn('[ONBOARDING_EMAIL_WARN] Could not send auto-reply email:', mailErr.message);
    }

    // 4. Notify Admins
    try {
      await notifyAdmins(
        `New Carrier Setup: ${companyName}`,
        `${ownerName || companyName} registered MC# ${mcNumber || 'N/A'} with ${numTrucks} truck(s) (${equipmentTypes}). Contact: ${phone}.`,
        'success',
        '/crm-sales.html'
      );
    } catch (notifErr) {
      console.warn('[ADMIN_NOTIFY_WARN]', notifErr.message);
    }

    return res.json({
      ok: true,
      lead_id: leadId,
      company_name: companyName,
      mc_number: mcNumber,
      message: 'Carrier onboarding packet submitted successfully! Confirmation email dispatched.',
      download_packet_url: '/downloads/Shipping-Wish-Carrier-Onboarding-Packet.pdf'
    });
  } catch (err) {
    console.error('Carrier setup submission error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error while processing carrier setup' });
  }
});

module.exports = router;
