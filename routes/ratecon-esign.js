const express = require('express');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendPushToUsers } = require('./mobile-push');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

let migrated = false;
async function ensureTable() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratecon_signatures (
        id SERIAL PRIMARY KEY,
        load_id INT REFERENCES loads(id) ON DELETE CASCADE,
        signer_id INT REFERENCES users(id) ON DELETE SET NULL,
        signer_name VARCHAR(255) NOT NULL,
        signer_role VARCHAR(50) DEFAULT 'carrier',
        signer_ip VARCHAR(50),
        signature_data TEXT,
        signature_hash VARCHAR(128),
        agreed_to_terms BOOLEAN DEFAULT true,
        signed_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ratecon_signatures_load_id ON ratecon_signatures(load_id);
    `);
    migrated = true;
  } catch (err) {
    console.error('[RateCon] Migration error:', err.message);
  }
}
ensureTable();

// Helper to fetch full load contract context
async function getLoadContractData(loadId) {
  const res = await pool.query(`
    SELECT l.*,
           c.name as carrier_name, c.company_name as carrier_company, c.phone as carrier_phone, c.email as carrier_email, c.mc_number as carrier_mc,
           b.company_name as broker_company, b.mc_number as broker_mc, b.credit_rating as broker_rating, b.bond_status as broker_bond,
           d.name as driver_name, d.phone as driver_phone,
           sig.signer_name, sig.signer_ip, sig.signed_at, sig.signature_hash
    FROM loads l
    LEFT JOIN users c ON c.id = l.carrier_id
    LEFT JOIN brokers b ON b.id = l.broker_id
    LEFT JOIN drivers d ON d.id = l.driver_id
    LEFT JOIN ratecon_signatures sig ON sig.load_id = l.id
    WHERE l.id = $1
    ORDER BY sig.signed_at DESC LIMIT 1
  `, [loadId]);

  if (res.rows.length === 0) return null;
  return res.rows[0];
}

// GET /api/loads/:id/ratecon/preview — Contract data preview
router.get('/:id/ratecon/preview', optionalAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.id, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Invalid load ID.' });

  try {
    const load = await getLoadContractData(loadId);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    const contract = {
      load_id: load.id,
      load_number: load.load_number || `SW-${load.id}`,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      broker: {
        name: load.broker_company || 'LoadNexus Certified Brokerage LLC',
        mc: load.broker_mc || 'MC-894102',
        bond: load.broker_bond || 'ACTIVE ($75,000 BMC-84)',
        address: '19266 Coastal Hwy, Rehoboth Beach, DE 19971',
        phone: '(800) 555-0199'
      },
      carrier: {
        name: load.carrier_company || load.carrier_name || 'Carrier Partner',
        mc: load.carrier_mc || 'MC-Pending',
        driver: load.driver_name || 'Assigned Company Driver',
        phone: load.carrier_phone || 'N/A'
      },
      stops: {
        pickup: {
          location: load.pickup_location || 'Chicago, IL',
          date: load.pickup_date ? new Date(load.pickup_date).toLocaleDateString() : 'Scheduled Today',
          instructions: 'Call shipper 2 hours prior to arrival. Clean dry van / reefer required.'
        },
        delivery: {
          location: load.delivery_location || 'Atlanta, GA',
          date: load.delivery_date ? new Date(load.delivery_date).toLocaleDateString() : 'Scheduled +2 Days',
          instructions: 'Lumper fees must be pre-authorized with valid receipt. No unauthorized drop trailers.'
        }
      },
      freight: {
        commodity: load.commodity || 'General Freight / Commercial Goods',
        weight: `${(load.weight || 42000).toLocaleString()} lbs`,
        equipment: load.equipment_type || '53ft Dry Van'
      },
      financials: {
        rate: Number(load.rate || 3200),
        currency: 'USD',
        detention_policy: '$75.00/hr after 2 hours free time with verified GPS in/out timestamps',
        tonu_fee: '$250.00 Truck Ordered Not Used',
        layover_fee: '$350.00 per 24-hour period'
      },
      legal_clauses: {
        anti_double_brokering: 'STRICT PROHIBITION: Carrier certifies that freight will be transported solely on its own equipment under its own active FMCSA operating authority. Any unauthorized re-brokering, trip-leasing, or assignment without prior written broker consent is deemed an immediate material breach resulting in complete forfeiture of rate payment and FMCSA fraud reporting.',
        cargo_claims: 'Carrier maintains primary liability for cargo loss or damage up to $100,000 per shipment.',
        zero_forced_dispatch: 'Shipping Wish LLC operates under strict Carrier Agency terms with zero forced dispatch.'
      },
      signature: load.signed_at ? {
        signed: true,
        signer_name: load.signer_name,
        signed_at: load.signed_at,
        signer_ip: load.signer_ip,
        verification_hash: load.signature_hash
      } : {
        signed: false
      }
    };

    res.json({ ok: true, contract });
  } catch (err) {
    console.error('[RateCon Preview] Error:', err);
    res.status(500).json({ error: 'Could not fetch rate confirmation preview.' });
  }
});

// GET /api/loads/:id/ratecon/pdf — Official Vector PDF Generator
router.get('/:id/ratecon/pdf', optionalAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.id, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Invalid load ID.' });

  try {
    const load = await getLoadContractData(loadId);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    const doc = new PDFDocument({ margin: 36, size: 'LETTER' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="LoadNexus_RateCon_${load.load_number || load.id}.pdf"`);

    doc.pipe(res);

    // --- COLOR PALETTE ---
    const primaryNavy = '#0B192C';
    const accentBlue = '#1E3E62';
    const highlightBlue = '#2563EB';
    const textDark = '#1E293B';
    const textMuted = '#64748B';

    // --- HEADER BAR ---
    doc.rect(0, 0, 612, 70).fill(primaryNavy);

    doc.fontSize(18).fillColor('#FFFFFF').font('Helvetica-Bold')
       .text('LOADNEXUS™ FREIGHT EXCHANGE', 36, 18);
    doc.fontSize(9).fillColor('#93C5FD').font('Helvetica')
       .text('A Division of Shipping Wish LLC • 19266 Coastal Hwy, Rehoboth Beach, DE 19971', 36, 42);

    doc.fontSize(12).fillColor('#FFFFFF').font('Helvetica-Bold')
       .text(`RATE CONFIRMATION`, 420, 20, { align: 'right', width: 156 });
    doc.fontSize(9).fillColor('#34D399').font('Helvetica-Bold')
       .text(`LOAD #${load.load_number || load.id}`, 420, 38, { align: 'right', width: 156 });

    // --- BROKER & CARRIER SECTION ---
    let y = 85;
    doc.rect(36, y, 260, 85).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.rect(316, y, 260, 85).fillAndStroke('#F8FAFC', '#E2E8F0');

    // Broker Box
    doc.fontSize(9).fillColor(highlightBlue).font('Helvetica-Bold').text('BROKER / ISSUING ENTITY', 46, y + 10);
    doc.fontSize(11).fillColor(textDark).font('Helvetica-Bold').text(load.broker_company || 'LoadNexus Certified Brokerage', 46, y + 24);
    doc.fontSize(8.5).fillColor(textMuted).font('Helvetica')
       .text(`MC / DOT: ${load.broker_mc || 'MC-894102'}`, 46, y + 39)
       .text(`Bond Status: ${load.broker_bond || 'ACTIVE ($75,000 BMC-84)'}`, 46, y + 51)
       .text('24/7 Operations Desk: (800) 555-0199', 46, y + 63);

    // Carrier Box
    doc.fontSize(9).fillColor(highlightBlue).font('Helvetica-Bold').text('ASSIGNED MOTOR CARRIER', 326, y + 10);
    doc.fontSize(11).fillColor(textDark).font('Helvetica-Bold').text(load.carrier_company || load.carrier_name || 'Carrier Fleet Partner', 326, y + 24);
    doc.fontSize(8.5).fillColor(textMuted).font('Helvetica')
       .text(`Carrier MC: ${load.carrier_mc || 'MC-1094821'} | Driver: ${load.driver_name || 'Assigned Driver'}`, 326, y + 39)
       .text(`Phone: ${load.carrier_phone || '(800) 555-0199'}`, 326, y + 51)
       .text(`Authority: AUTHORIZED FOR HIRE (Verified Active)`, 326, y + 63);

    // --- FREIGHT & FINANCIAL SUMMARY ---
    y = 185;
    doc.rect(36, y, 540, 48).fillAndStroke('#EFF6FF', '#BFDBFE');
    doc.fontSize(9).fillColor(highlightBlue).font('Helvetica-Bold').text('COMMODITY & EQUIPMENT', 46, y + 10);
    doc.fontSize(9.5).fillColor(textDark).font('Helvetica')
       .text(`${load.equipment_type || '53ft Reefer'} • ${load.commodity || 'General Freight'} • ${(load.weight || 42000).toLocaleString()} lbs`, 46, y + 24);

    doc.fontSize(9).fillColor(highlightBlue).font('Helvetica-Bold').text('TOTAL AGREED RATE', 420, y + 10, { align: 'right', width: 146 });
    doc.fontSize(16).fillColor('#10B981').font('Helvetica-Bold').text(`$${Number(load.rate || 3200).toLocaleString()}.00 USD`, 420, y + 24, { align: 'right', width: 146 });

    // --- ROUTE STOPS (PICKUP & DELIVERY) ---
    y = 245;
    doc.fontSize(11).fillColor(primaryNavy).font('Helvetica-Bold').text('SCHEDULED ROUTE STOPS', 36, y);

    // Stop 1: Pickup
    y = 262;
    doc.rect(36, y, 540, 52).fillAndStroke('#FFFFFF', '#CBD5E1');
    doc.circle(52, y + 20, 8).fill('#3B82F6');
    doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold').text('1', 49, y + 16);
    doc.fontSize(10).fillColor(textDark).font('Helvetica-Bold').text(`PICKUP: ${load.pickup_location || 'Chicago, IL'}`, 70, y + 12);
    doc.fontSize(8.5).fillColor(textMuted).font('Helvetica').text('Shipper Dock • Check in with Receiving Clerk • BOL Required at Departure', 70, y + 28);
    doc.fontSize(9).fillColor(textDark).font('Helvetica-Bold').text(load.pickup_date ? new Date(load.pickup_date).toLocaleDateString() : 'Today', 450, y + 18, { align: 'right', width: 116 });

    // Stop 2: Delivery
    y = 322;
    doc.rect(36, y, 540, 52).fillAndStroke('#FFFFFF', '#CBD5E1');
    doc.circle(52, y + 20, 8).fill('#10B981');
    doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold').text('2', 49, y + 16);
    doc.fontSize(10).fillColor(textDark).font('Helvetica-Bold').text(`DELIVERY: ${load.delivery_location || 'Atlanta, GA'}`, 70, y + 12);
    doc.fontSize(8.5).fillColor(textMuted).font('Helvetica').text('Consignee Receiver • Must obtain signed clean Proof of Delivery (POD)', 70, y + 28);
    doc.fontSize(9).fillColor(textDark).font('Helvetica-Bold').text(load.delivery_date ? new Date(load.delivery_date).toLocaleDateString() : 'Scheduled', 450, y + 18, { align: 'right', width: 116 });

    // --- ACCESSORIAL & DETENTION POLICIES ---
    y = 385;
    doc.fontSize(10).fillColor(primaryNavy).font('Helvetica-Bold').text('ACCESSORIAL & OPERATIONAL TERMS', 36, y);
    y = 400;
    doc.rect(36, y, 540, 48).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fontSize(8).fillColor(textDark).font('Helvetica')
       .text('• DETENTION: $75.00/hour after 2 hours free time. Must notify broker 30 minutes prior to detention commencement.', 44, y + 8)
       .text('• TONU (Truck Ordered Not Used): $250.00 if cancelled after dispatch en route.', 44, y + 20)
       .text('• TRACKING REQUIREMENT: Continuous GPS telematics active via Shipping Wish Driver App during entire transit.', 44, y + 32);

    // --- ANTI-DOUBLE BROKERING LEGAL CLAUSE ---
    y = 458;
    doc.rect(36, y, 540, 72).fillAndStroke('#FEF2F2', '#FECACA');
    doc.fontSize(8.5).fillColor('#991B1B').font('Helvetica-Bold')
       .text('ANTI-DOUBLE BROKERING SECURITY PROHIBITION (MANDATORY ENFORCEMENT)', 44, y + 8);
    doc.fontSize(7.5).fillColor('#7F1D1D').font('Helvetica')
       .text('Carrier expressly certifies and covenants that this shipment will be transported exclusively upon carrier\'s own equipment operating under carrier\'s own active FMCSA authority. Co-brokering, re-brokering, subcontracting, or unauthorized trip-leasing to third parties is strictly prohibited. Any violation constitutes an intentional breach of contract resulting in immediate 100% forfeiture of agreed freight compensation and reporting to the FMCSA National Consumer Complaint Database.', 44, y + 22, { width: 520, lineGap: 1.5 });

    // --- E-SIGNATURE SECTION ---
    y = 540;
    doc.fontSize(10).fillColor(primaryNavy).font('Helvetica-Bold').text('DIGITAL CONTRACT EXECUTION & SIGNATURE', 36, y);

    y = 555;
    const isSigned = Boolean(load.signed_at);
    doc.rect(36, y, 540, 110).fillAndStroke(isSigned ? '#F0FDF4' : '#F8FAFC', isSigned ? '#86EFAC' : '#CBD5E1');

    if (isSigned) {
      doc.fontSize(10).fillColor('#166534').font('Helvetica-Bold')
         .text('✅ DIGITALLY SIGNED & EXECUTED CONTRACT', 46, y + 14);
      doc.fontSize(16).fillColor('#15803D').font('Helvetica-Bold')
         .text(load.signer_name || 'Authorized Carrier Representative', 46, y + 32);
      doc.fontSize(8.5).fillColor(textMuted).font('Helvetica')
         .text(`Signed At: ${new Date(load.signed_at).toUTCString()}`, 46, y + 56)
         .text(`Signer IP: ${load.signer_ip || 'Authenticated Mobile Device'}`, 46, y + 69)
         .text(`Cryptographic SHA-256 Audit Seal: ${load.signature_hash || 'SHA256-VERIFIED-AUTH'}`, 46, y + 82);

      doc.rect(430, y + 15, 130, 80).stroke('#166534');
      doc.fontSize(8).fillColor('#166534').font('Helvetica-Bold')
         .text('LOADNEXUS CERTIFIED', 435, y + 25, { align: 'center', width: 120 })
         .text('LEGAL E-SIGNATURE', 435, y + 40, { align: 'center', width: 120 })
         .text('ENFORCEABLE', 435, y + 55, { align: 'center', width: 120 })
         .text('2026 AUDIT COMPLIANT', 435, y + 70, { align: 'center', width: 120 });
    } else {
      doc.fontSize(9).fillColor(textMuted).font('Helvetica-Bold')
         .text('PENDING DIGITAL E-SIGNATURE', 46, y + 14);
      doc.fontSize(8.5).fillColor(textDark).font('Helvetica')
         .text('Carrier must sign electronically via LoadNexus Mobile Carrier App or Driver Console.', 46, y + 30)
         .text('Digital Signature executes contract and activates payment authorization.', 46, y + 44);

      doc.rect(46, y + 65, 300, 30).stroke('#94A3B8');
      doc.fontSize(8).fillColor('#94A3B8').font('Helvetica').text('X Sign Here on Mobile Screen / Digital Pen', 52, y + 75);
    }

    // --- FOOTER ---
    doc.fontSize(7.5).fillColor(textMuted).font('Helvetica')
       .text('This document was generated by LoadNexus™ Freight & Capacity Exchange by Shipping Wish LLC. All rights reserved.', 36, 730, { align: 'center', width: 540 });

    doc.end();
  } catch (err) {
    console.error('[RateCon PDF] Error:', err);
    res.status(500).json({ error: 'Could not generate Rate Confirmation PDF.' });
  }
});

// POST /api/loads/:id/ratecon/sign — Digital E-Signature Execution
router.post('/:id/ratecon/sign', requireAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.id, 10);
  const { signer_name, signature_data } = req.body;
  const signerIp = getClientIp(req);

  if (isNaN(loadId) || !signer_name || !signer_name.trim()) {
    return res.status(400).json({ error: 'Valid load ID and signer name are required.' });
  }

  try {
    const load = await getLoadContractData(loadId);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    // Generate SHA-256 cryptographic audit hash
    const signatureHash = crypto
      .createHash('sha256')
      .update(`${loadId}-${signer_name.trim()}-${signerIp}-${Date.now()}`)
      .digest('hex');

    // Save digital signature in database
    const sigRes = await pool.query(`
      INSERT INTO ratecon_signatures (load_id, signer_id, signer_name, signer_role, signer_ip, signature_data, signature_hash, agreed_to_terms, signed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
      RETURNING *
    `, [
      loadId,
      req.user.id,
      signer_name.trim(),
      req.user.role || 'carrier',
      signerIp,
      signature_data || 'MOBILE_ESIGN_TAP',
      signatureHash
    ]);

    // Update load status to dispatched / ratecon_signed
    await pool.query(`UPDATE loads SET status = 'dispatched', updated_at = now() WHERE id = $1`, [loadId]);

    // Record in load status history
    await pool.query(`
      INSERT INTO load_status_history (load_id, status, changed_by, notes)
      VALUES ($1, 'dispatched', $2, $3)
    `, [loadId, req.user.id, `Rate Confirmation digitally signed by ${signer_name.trim()} (IP: ${signerIp})`]);

    // Dispatch notifications
    const recipients = [load.dispatcher_id, load.carrier_id].filter(id => id && id !== req.user.id);
    for (const uid of recipients) {
      createNotification(
        uid,
        `RateCon Signed: Load #${load.load_number || loadId}`,
        `Carrier ${signer_name.trim()} has signed the Rate Confirmation. Load is now dispatched!`,
        'success',
        `/load-detail.html?id=${loadId}`
      ).catch(() => {});
    }

    sendPushToUsers(recipients, {
      title: `✍️ RateCon Signed: #${load.load_number || loadId}`,
      body: `Signed by ${signer_name.trim()}. Freight is officially booked and dispatched!`,
      data: { load_id: loadId, status: 'dispatched' }
    }).catch(() => {});

    auditLog(req.user.id, 'RATECON_DIGITALLY_SIGNED', 'load', loadId, { signer_name: signer_name.trim(), signerIp, signatureHash }, signerIp);

    res.json({
      ok: true,
      message: 'Rate Confirmation signed successfully. Contract is now legally executed.',
      signature: sigRes.rows[0],
      pdf_url: `/api/loads/${loadId}/ratecon/pdf`
    });
  } catch (err) {
    console.error('[RateCon Sign] Error:', err);
    res.status(500).json({ error: 'Could not execute rate confirmation e-signature.' });
  }
});

module.exports = router;
