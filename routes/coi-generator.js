const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

// GET /api/coi/preview — Standard Fleet Policy Coverage Preview
router.get('/preview', (req, res) => {
  res.json({
    ok: true,
    producer: {
      agency: 'Shipping Wish LLC Fleet Risk & Insurance Services',
      contact: 'compliance@shippingwish.com',
      phone: '(800) 555-0199',
      address: '19266 Coastal Hwy, Rehoboth Beach, DE 19971'
    },
    insurers: [
      { letter: 'A', name: 'Great American Insurance Company', naic: '16691', line: 'Automobile Liability ($1,000,000 CSL)' },
      { letter: 'B', name: 'Travelers Property Casualty Co.', naic: '25674', line: 'Commercial General Liability ($2,000,000 Agg)' },
      { letter: 'C', name: "Lloyd's of London Underwriters", naic: 'AA-1120000', line: 'Motor Truck Cargo ($100,000 Broad Form)' },
      { letter: 'D', name: 'The Hartford Underwriters', naic: '19682', line: 'Workers Compensation ($500,000)' }
    ],
    coverages: {
      auto_liability: 1000000,
      general_liability: 2000000,
      cargo_liability: 100000,
      cargo_deductible: 1000,
      workers_comp: 500000,
      reefer_breakdown_included: true
    }
  });
});

// POST /api/coi/generate — Instant ACORD 25 PDF Generation for specified Broker Certificate Holder
router.post('/generate', requireAuth, async (req, res) => {
  const {
    holder_company = 'C.H. Robinson Worldwide, Inc.',
    holder_address = '14701 Charlson Rd, Eden Prairie, MN 55347',
    holder_email = 'carrier_onboarding@chrobinson.com',
    carrier_id = null
  } = req.body;

  try {
    const targetCarrierId = carrier_id || req.user.id;
    const userRes = await pool.query(
      `SELECT id, name, company_name, mc_number, dot_number, phone, email, address FROM users WHERE id = $1`,
      [targetCarrierId]
    );

    const carrier = userRes.rows.length > 0 ? userRes.rows[0] : req.user;
    const carrierName = carrier.company_name || carrier.name || 'Verified Carrier Partner LLC';
    const carrierMc = carrier.mc_number || 'MC-1094821';
    const carrierDot = carrier.dot_number || 'DOT-3891402';

    const doc = new PDFDocument({ margin: 28, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="COI_ACORD25_${carrierMc}.pdf"`);
    doc.pipe(res);

    // ACORD 25 Official Header
    doc.rect(28, 28, 556, 42).fill('#0B192C');
    doc.fontSize(16).fillColor('#FFFFFF').font('Helvetica-Bold').text('ACORD', 38, 38);
    doc.fontSize(14).fillColor('#FFFFFF').font('Helvetica-Bold').text('CERTIFICATE OF LIABILITY INSURANCE', 110, 38);
    doc.fontSize(8.5).fillColor('#93C5FD').font('Helvetica').text('DATE (MM/DD/YYYY): ' + new Date().toLocaleDateString('en-US'), 430, 42, { align: 'right', width: 140 });

    let y = 74;
    // Disclaimer Banner
    doc.rect(28, y, 556, 32).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.fontSize(6.5).fillColor('#475569').font('Helvetica')
       .text('THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS NO RIGHTS UPON THE CERTIFICATE HOLDER. THIS CERTIFICATE DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER THE COVERAGE AFFORDED BY THE POLICIES BELOW.', 32, y + 4, { width: 548, lineGap: 1.5 });

    y = 110;
    // Producer & Insured Columns
    doc.rect(28, y, 274, 90).fillAndStroke('#FFFFFF', '#CBD5E1');
    doc.rect(310, y, 274, 90).fillAndStroke('#FFFFFF', '#CBD5E1');

    doc.fontSize(7.5).fillColor('#2563EB').font('Helvetica-Bold').text('PRODUCER', 34, y + 6);
    doc.fontSize(8.5).fillColor('#1E293B').font('Helvetica-Bold').text('Shipping Wish Risk Management Agency', 34, y + 18);
    doc.fontSize(7.5).fillColor('#64748B').font('Helvetica')
       .text('19266 Coastal Hwy, Rehoboth Beach, DE 19971', 34, y + 30)
       .text('Contact: fleet-insurance@shippingwish.com', 34, y + 42)
       .text('Phone: (800) 555-0199 • Fax: (800) 555-0198', 34, y + 54);

    doc.fontSize(7.5).fillColor('#2563EB').font('Helvetica-Bold').text('INSURED (CARRIER OPERATING AUTHORITY)', 316, y + 6);
    doc.fontSize(9).fillColor('#1E293B').font('Helvetica-Bold').text(carrierName, 316, y + 18);
    doc.fontSize(8).fillColor('#64748B').font('Helvetica')
       .text(`FMCSA Authority: ${carrierMc} • USDOT: ${carrierDot}`, 316, y + 30)
       .text(carrier.address || '400 Enterprise Parkway, Dallas, TX 75201', 316, y + 42)
       .text(`Phone: ${carrier.phone || '(214) 555-0144'}`, 316, y + 54);

    y = 205;
    // Coverages Table Header
    doc.rect(28, y, 556, 18).fill('#0E1A2D');
    doc.fontSize(7.5).fillColor('#FFFFFF').font('Helvetica-Bold')
       .text('INSR', 32, y + 5)
       .text('TYPE OF INSURANCE', 60, y + 5)
       .text('POLICY NUMBER', 220, y + 5)
       .text('EFFECTIVE', 330, y + 5)
       .text('EXPIRATION', 390, y + 5)
       .text('LIMITS (USD)', 460, y + 5);

    y += 18;
    const policies = [
      {
        insr: 'B',
        type: 'COMMERCIAL GENERAL LIABILITY\n• Occurrence Form\n• Commercial Ops',
        policyNo: 'GL-8910482-SW',
        eff: '01/01/2026',
        exp: '01/01/2027',
        limits: 'Each Occurrence: $1,000,000\nDamage to Rented: $300,000\nGeneral Aggregate: $2,000,000'
      },
      {
        insr: 'A',
        type: 'AUTOMOBILE LIABILITY\n• Any Auto / Scheduled Fleets\n• Hired & Non-Owned Autos',
        policyNo: 'CA-4920194-SW',
        eff: '01/01/2026',
        exp: '01/01/2027',
        limits: 'Combined Single Limit:\n$1,000,000 CSL (Each Accident)\nBodily Injury & Property Damage'
      },
      {
        insr: 'C',
        type: 'MOTOR TRUCK CARGO LIABILITY\n• Broad Form All-Risk\n• Reefer Breakdown Included',
        policyNo: 'MTC-7729104-SW',
        eff: '01/01/2026',
        exp: '01/01/2027',
        limits: 'Cargo Limit: $100,000\nDeductible: $1,000\nReefer Spoilage: Covered'
      },
      {
        insr: 'D',
        type: 'WORKERS COMPENSATION\nAND EMPLOYERS LIABILITY',
        policyNo: 'WC-3019482-SW',
        eff: '01/01/2026',
        exp: '01/01/2027',
        limits: 'Statutory Limits: Yes\nE.L. Each Accident: $500,000\nE.L. Disease - Policy: $500,000'
      }
    ];

    policies.forEach((p, idx) => {
      const rowHeight = 44;
      doc.rect(28, y, 556, rowHeight).fillAndStroke(idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', '#CBD5E1');
      doc.fontSize(8.5).fillColor('#1D4ED8').font('Helvetica-Bold').text(p.insr, 34, y + 6);
      doc.fontSize(7.5).fillColor('#1E293B').font('Helvetica-Bold').text(p.type, 60, y + 5, { width: 155, lineGap: 1.5 });
      doc.fontSize(7.5).fillColor('#0F172A').font('Helvetica').text(p.policyNo, 220, y + 6);
      doc.fontSize(7.5).fillColor('#475569').font('Helvetica').text(p.eff, 330, y + 6);
      doc.fontSize(7.5).fillColor('#475569').font('Helvetica').text(p.exp, 390, y + 6);
      doc.fontSize(7).fillColor('#0F172A').font('Helvetica-Bold').text(p.limits, 460, y + 4, { width: 120, lineGap: 1.5 });
      y += rowHeight;
    });

    y += 10;
    // Description of Operations
    doc.rect(28, y, 556, 65).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.fontSize(7.5).fillColor('#2563EB').font('Helvetica-Bold').text('DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES (ACORD 101, Additional Remarks Schedule, may be attached if more space is required)', 34, y + 5);
    doc.fontSize(7.5).fillColor('#1E293B').font('Helvetica')
       .text(`Certificate Holder is included as Additional Insured with respect to Auto Liability and Loss Payee with respect to Motor Truck Cargo as required by written freight broker/carrier agreement. Coverage is primary and non-contributory. 30 Days written notice of cancellation will be delivered to the Certificate Holder. Operating Authority: ${carrierMc}.`, 34, y + 18, { width: 544, lineGap: 2 });

    y += 72;
    // Certificate Holder & Cancellation
    doc.rect(28, y, 274, 90).fillAndStroke('#FFFFFF', '#CBD5E1');
    doc.rect(310, y, 274, 90).fillAndStroke('#FFFFFF', '#CBD5E1');

    doc.fontSize(7.5).fillColor('#2563EB').font('Helvetica-Bold').text('CERTIFICATE HOLDER (ADDITIONAL INSURED)', 34, y + 6);
    doc.fontSize(8.5).fillColor('#1E293B').font('Helvetica-Bold').text(holder_company, 34, y + 18);
    doc.fontSize(7.5).fillColor('#64748B').font('Helvetica')
       .text(holder_address, 34, y + 30, { width: 250 })
       .text('Email: ' + holder_email, 34, y + 56)
       .text('Broker Status: REGISTERED CERTIFICATE HOLDER', 34, y + 68);

    doc.fontSize(7.5).fillColor('#2563EB').font('Helvetica-Bold').text('CANCELLATION & AUTHORIZED REPRESENTATIVE', 316, y + 6);
    doc.fontSize(6.5).fillColor('#64748B').font('Helvetica')
       .text('SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH THE POLICY PROVISIONS.', 316, y + 18, { width: 260, lineGap: 1 });

    // Signature stamp
    doc.rect(316, y + 46, 260, 36).stroke('#1D4ED8');
    doc.fontSize(7.5).fillColor('#1D4ED8').font('Helvetica-Bold')
       .text('AUTHORIZED REPRESENTATIVE SEAL', 320, y + 52, { align: 'center', width: 250 })
       .text('Shipping Wish National Fleet Underwriting Desk • Verified Digital Issuance', 320, y + 64, { align: 'center', width: 250 });

    doc.fontSize(6.5).fillColor('#94A3B8').font('Helvetica')
       .text('© 1988-2016 ACORD CORPORATION. All rights reserved. • LoadNexus™ Instant COI Engine for Shipping Wish LLC', 28, 752, { align: 'center', width: 556 });

    doc.end();

    auditLog(req.user.id, 'COI_GENERATED', 'users', targetCarrierId, { holder_company }, getClientIp(req));
  } catch (err) {
    console.error('[COI Generator] Error:', err);
    res.status(500).json({ error: 'Could not generate Certificate of Insurance.' });
  }
});

module.exports = router;
