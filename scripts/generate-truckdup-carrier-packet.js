const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../public/downloads');
const outFile = path.join(outDir, 'Shipping-Wish-Truckd-Up-Carrier-Onboarding-Packet.pdf');

fs.mkdirSync(outDir, { recursive: true });

// Letter size: 612 x 792 pt
const doc = new PDFDocument({
  size: 'LETTER',
  bufferPages: true,
  autoFirstPage: true,
  margins: { top: 28, bottom: 0, left: 40, right: 40 }
});

const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

// Color Palette - Enterprise Fortune 500
const NAVY = '#0f172a';
const NAVY_LIGHT = '#1e293b';
const AMBER = '#d97706';
const AMBER_LIGHT = '#f59e0b';
const SLATE = '#334155';
const MUTED = '#64748b';
const BORDER = '#cbd5e1';
const BORDER_LIGHT = '#e2e8f0';
const BG_SUBTLE = '#f8fafc';
const CW = 532; // 612 - 80 = 532
const LEFT_X = 40;

// Top Header for Truck'd Up Partner Packet
function drawTopHeader(title, subtitle) {
  doc.save();
  // Gold accent bar
  doc.rect(LEFT_X, 26, CW, 3).fill(AMBER_LIGHT);

  // Brand Name & Subtitle
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14).text("SHIPPING WISH LLC  x  TRUCK'D UP", LEFT_X, 34);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Dedicated Partner Dispatch Fulfillment & Carrier Operations Program', LEFT_X, 51);

  // Right Side Registration Badge
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text("TRUCK'D UP SOURCED CARRIER PROGRAM", LEFT_X, 36, { width: CW, align: 'right' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('Fulfillment by Shipping Wish LLC · 24/7 Dispatch Desk', LEFT_X, 48, { width: CW, align: 'right' });

  // Title Box
  doc.rect(LEFT_X, 64, CW, 24).fillAndStroke(BG_SUBTLE, BORDER);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.8).text(title, LEFT_X + 12, 70);
  if (subtitle) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.8).text(subtitle, LEFT_X, 71.5, { width: CW - 12, align: 'right' });
  }
  doc.restore();
}

// Reusable Section Header
function drawSectionHeader(title, y) {
  doc.save();
  doc.rect(LEFT_X, y, CW, 18).fill('#f1f5f9');
  doc.rect(LEFT_X, y, 4, 18).fill(AMBER);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.8).text(title, LEFT_X + 12, y + 4.5);
  doc.restore();
  return y + 24;
}

// Reusable 2-Column Form Row
function drawFormRow(label1, val1, label2, val2, curY, h = 20) {
  const colW = (CW - 8) / 2;
  doc.save();
  // Col 1
  doc.rect(LEFT_X, curY, colW, h).fillAndStroke('#ffffff', BORDER_LIGHT);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(6.8).text(label1, LEFT_X + 6, curY + 3);
  doc.fillColor(NAVY).font('Helvetica').fontSize(7.8).text(val1 || '________________________________________________', LEFT_X + 6, curY + 11);

  // Col 2
  doc.rect(LEFT_X + colW + 8, curY, colW, h).fillAndStroke('#ffffff', BORDER_LIGHT);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(6.8).text(label2, LEFT_X + colW + 14, curY + 3);
  doc.fillColor(NAVY).font('Helvetica').fontSize(7.8).text(val2 || '________________________________________________', LEFT_X + colW + 14, curY + 11);
  doc.restore();
  return curY + h + 3;
}

// ==========================================
// PAGE 1: COVER & COMPLIANCE CHECKLIST
// ==========================================
drawTopHeader("CARRIER ONBOARDING PACKET (TRUCK'D UP PARTNER)", 'Setup Guide, Service Terms & Document Checklist');

// Contact Box
let y = 94;
doc.save();
doc.rect(LEFT_X, y, CW, 54).fillAndStroke(BG_SUBTLE, BORDER);
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text("OPERATIONS & PARTNER DISPATCH DIRECTORY", LEFT_X + 10, y + 6);

doc.font('Helvetica').fontSize(7.8).fillColor(SLATE);
doc.text("Commercial Partner: Truck'd Up (Tarell Spencer: +1 215 669 3038 · truckdup.operations@gmail.com)", LEFT_X + 10, y + 18);
doc.text("Dispatch Fulfillment: Shipping Wish LLC · 19266 Coastal Hwy, Rehoboth Beach, DE 19971", LEFT_X + 10, y + 29);

doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY);
doc.text('Operations Desk: ', LEFT_X + 10, y + 40, { continued: true });
doc.font('Helvetica').fillColor(SLATE).text('operations@shippingwish.com          ', { continued: true });
doc.font('Helvetica-Bold').fillColor(AMBER).text('24/7 Dedicated Dispatch Line: ', { continued: true });
doc.font('Helvetica-Bold').fillColor(NAVY).text('+1 (551) 400-6300');
doc.restore();

// Section 1: Dispatch Fulfillment & Service Principles
y = 155;
y = drawSectionHeader('1. DISPATCH FULFILLMENT & PARTNER SERVICE PRINCIPLES', y);

doc.save();
doc.font('Helvetica').fontSize(7.8).fillColor(SLATE);
doc.text(
  "This packet governs Truck'd Up-sourced carrier accounts. Shipping Wish LLC provides dedicated backend dispatch fulfillment and 24/7 load booking under your authority, while Truck'd Up maintains your primary carrier-facing commercial relationship.",
  LEFT_X, y, { width: CW, lineGap: 1.5 }
);
y += 24;

// 4 Styled Principle Cards (2x2 Grid)
const pColW = (CW - 8) / 2;
const pH = 44;
const pCards = [
  {
    title: '100% Direct Freight Pay',
    desc: 'Brokers remit payments directly to your factoring company or bank. Neither Truck’d Up nor Shipping Wish touches your gross freight pay.'
  },
  {
    title: 'Unified 7% Dispatch Fee (Single Payee)',
    desc: 'The total dispatch/service fee is 7% of gross freight revenue, payable to Truck’d Up. The carrier owes no separate dispatch fee to Shipping Wish.'
  },
  {
    title: 'Dispatch Fulfillment & Commercial Roles',
    desc: 'Shipping Wish provides the dispatch fulfillment while Truck’d Up maintains the carrier-facing commercial relationship.'
  },
  {
    title: 'Carrier Authority & Fast 2-Hr Activation',
    desc: 'All loads run strictly under your active MC/USDOT authority. Account cleared and load booking begins within 2 hours of document receipt.'
  }
];

pCards.forEach((c, idx) => {
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  const curX = LEFT_X + col * (pColW + 8);
  const curY = y + row * (pH + 5);

  doc.rect(curX, curY, pColW, pH).fillAndStroke('#ffffff', BORDER_LIGHT);
  doc.rect(curX, curY, 3, pH).fill(AMBER);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.8).text(c.title, curX + 8, curY + 5);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.2).text(c.desc, curX + 8, curY + 16, { width: pColW - 14, lineGap: 1 });
});
y += 2 * (pH + 5) + 4;
doc.restore();

// Section 2: Mandatory Checklist (6 Items)
y = drawSectionHeader('2. MANDATORY CARRIER COMPLIANCE CHECKLIST (6 ITEMS)', y);

doc.save();
doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(
  "Please submit the following 6 mandatory compliance items to truckdup.operations@gmail.com and operations@shippingwish.com:",
  LEFT_X, y, { width: CW }
);
y += 12;

const checklist = [
  ['[  ] 1. FMCSA Operating Authority (MC Certificate)', 'Copy of active MC/FF/MX Certificate of Registration issued by the FMCSA verifying active authority.'],
  ['[  ] 2. Certificate of Insurance (COI)', 'Minimum $1,000,000 Auto Liability and $100,000 Cargo Liability. Certificate Holder: Shipping Wish LLC, 19266 Coastal Hwy, Rehoboth Beach, DE 19971.'],
  ['[  ] 3. Signed Form W-9', 'Current year Form W-9 signed and dated with matching legal entity name and Federal Taxpayer ID (EIN / SSN).'],
  ['[  ] 4. Notice of Assignment (NOA) / Factoring Setup', 'Factoring company Notice of Assignment letter for direct broker remittance, or voided check for ACH direct pay.'],
  ['[  ] 5. Completed Carrier Profile Sheet', 'Page 2 of this packet completed detailing equipment count, trailer specifications, maximum payload, and preferred operating lanes.'],
  ['[  ] 6. Signed Limited Power of Attorney (POA)', "Page 3 of this packet signed authorizing partner dispatch fulfillment under the agreed Truck'd Up 7% fee structure."]
];

checklist.forEach(([title, detail]) => {
  doc.rect(LEFT_X, y, CW, 27).fillAndStroke('#ffffff', BORDER_LIGHT);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.8).text(title, LEFT_X + 8, y + 4);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.1).text(detail, LEFT_X + 8, y + 14.5, { width: CW - 16, lineGap: 1 });
  y += 30;
});

// Fast-Track Callout Card (High-End Corporate Theme)
y += 2;
doc.rect(LEFT_X, y, CW, 34).fillAndStroke('#f0fdf4', '#86efac');
doc.rect(LEFT_X, y, 4, 34).fill('#16a34a');
doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(8.5).text("TRUCK'D UP FAST-TRACK SUBMISSION DESK", LEFT_X + 12, y + 5.5);
doc.fillColor(SLATE).font('Helvetica').fontSize(7.5).text(
  "Submit completed packet to truckdup.operations@gmail.com & operations@shippingwish.com",
  LEFT_X + 12, y + 16
);
doc.fillColor(MUTED).font('Helvetica').fontSize(7.2).text(
  "Truck'd Up: +1 (215) 669-3038  ·  Shipping Wish 24/7 Dispatch Desk: +1 (551) 400-6300  ·  Activation SLA: 2 hours.",
  LEFT_X + 12, y + 25
);
doc.restore();

// ==========================================
// PAGE 2: CARRIER & EQUIPMENT PROFILE
// ==========================================
doc.addPage();
drawTopHeader("CARRIER PROFILE & FLEET SPECIFICATIONS", "Truck'd Up Partner Intake & Equipment Profile");

y = 94;
y = drawSectionHeader("1. MOTOR CARRIER COMPANY INFORMATION (TRUCK'D UP SOURCED)", y);

y = drawFormRow('LEGAL COMPANY NAME', '', 'DBA (DOING BUSINESS AS)', '', y);
y = drawFormRow('MC / FF / MX NUMBER', '', 'USDOT NUMBER', '', y);
y = drawFormRow('FEDERAL TAXPAYER ID (EIN / SSN)', '', 'SAFETY RATING (Satisfactory / None / Conditional)', '', y);
y = drawFormRow('PHYSICAL BUSINESS ADDRESS', '', 'CITY, STATE, ZIP CODE', '', y);
y = drawFormRow('MAILING / BILLING ADDRESS', '', 'BILLING CITY, STATE, ZIP CODE', '', y);
y = drawFormRow('PRIMARY CONTACT / OWNER NAME', '', 'TITLE / POSITION', '', y);
y = drawFormRow('PRIMARY PHONE NUMBER', '', '24/7 AFTER-HOURS / EMERGENCY PHONE', '', y);
y = drawFormRow('DISPATCH CONTACT EMAIL', '', 'FACTORING / ACCOUNTING EMAIL', '', y);

y += 2;
y = drawSectionHeader('2. FLEET & EQUIPMENT SPECIFICATIONS', y);

y = drawFormRow('ACTIVE POWER UNITS (TRACTORS)', 'Count: _______', 'ACTIVE DRIVERS (CDL-A)', 'Count: _______', y);
y = drawFormRow('ELD PROVIDER (e.g. Motive, Samsara, Garmin)', '', 'TRAILER TRACKING / GPS PROVIDER', '', y);

// Equipment Checkboxes Box
doc.save();
doc.rect(LEFT_X, y, CW, 38).fillAndStroke('#ffffff', BORDER_LIGHT);
doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.2).text('EQUIPMENT TYPES OPERATED (Check all that apply):', LEFT_X + 6, y + 4);

doc.fillColor(SLATE).font('Helvetica').fontSize(7.5);
doc.text('[  ] 53ft Dry Van (Air-Ride)              [  ] 53ft Refrigerated / Reefer             [  ] 48ft / 53ft Flatbed', LEFT_X + 8, y + 14);
doc.text('[  ] Step Deck / Drop Deck              [  ] Power Only / Tow-Away                  [  ] 26ft Box Truck (Liftgate: Y / N)', LEFT_X + 8, y + 25);
y += 41;

y = drawFormRow('MAXIMUM PAYLOAD WEIGHT CAPACITY (LBS)', 'e.g. 45,000 lbs', 'TRAILER SPECIFICATIONS', 'e.g. Swing Doors / Roll / E-Track / Vents', y);
y = drawFormRow('TWIC CERTIFIED DRIVERS', '[  ] Yes   [  ] No', 'HAZMAT ENDORSED DRIVERS', '[  ] Yes   [  ] No', y);
doc.restore();

y += 2;
y = drawSectionHeader('3. PREFERRED LANES, REGIONS & RATE THRESHOLDS', y);

doc.save();
doc.rect(LEFT_X, y, CW, 33).fillAndStroke('#ffffff', BORDER_LIGHT);
doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.2).text('PREFERRED OPERATING REGIONS (Check all that apply):', LEFT_X + 6, y + 4);
doc.fillColor(SLATE).font('Helvetica').fontSize(7.5);
doc.text('[  ] All 48 Lower States     [  ] Midwest     [  ] Southeast     [  ] Northeast     [  ] Texas / South     [  ] West Coast', LEFT_X + 8, y + 13.5);
doc.text('Specific Preferred Lanes / Origin Markets: ____________________________________________________________________', LEFT_X + 8, y + 23);
y += 36;

y = drawFormRow('EXCLUDED STATES / CITIES (TO AVOID)', 'e.g. NYC Burroughs, CO mountains', 'PREFERRED HOME TIME FREQUENCY', 'e.g. Weekly / Bi-Weekly / OTR 2+ weeks', y);
y = drawFormRow('TARGET MINIMUM RATE-PER-MILE (RPM)', '$___________ / mile minimum', 'TARGET WEEKLY GROSS REVENUE PER TRUCK', '$___________ / week target', y);
doc.restore();

y += 2;
y = drawSectionHeader('4. FACTORING & SETTLEMENT DETAILS', y);

y = drawFormRow('FACTORING COMPANY NAME', '', 'FACTORING CONTACT PERSON', '', y);
y = drawFormRow('FACTORING TELEPHONE NUMBER', '', 'FACTORING REMITTANCE / NOA EMAIL', '', y);

// ==========================================
// PAGE 3: LIMITED POWER OF ATTORNEY (POA) & PARTNER TERMS
// ==========================================
doc.addPage();
drawTopHeader("LIMITED POWER OF ATTORNEY & PARTNER TERMS", "Authorization for Load Booking & Partner Dispatch Fulfillment");

y = 94;
y = drawSectionHeader("1. GRANT OF LIMITED ADMINISTRATIVE POWER OF ATTORNEY", y);

doc.save();
doc.font('Helvetica').fontSize(7.5).fillColor(SLATE);
const preambleText = 'KNOW ALL MEN BY THESE PRESENTS that the motor carrier identified on Page 2 ("Carrier"), an account sourced via commercial partner TRUCK\'D UP, hereby appoints SHIPPING WISH LLC ("Dispatcher") as Carrier’s true, lawful, and limited Attorney-in-Fact, granting Dispatcher limited authority to act in Carrier’s name, place, and stead strictly for the following freight dispatch operations:';
const preambleH = doc.heightOfString(preambleText, { width: CW, lineGap: 1.2 });
doc.text(preambleText, LEFT_X, y, { width: CW, lineGap: 1.2 });
y += preambleH + 8;

const poaClauses = [
  ['1. Sourcing Freight & Rate Negotiation', 'To search load boards, contact licensed freight brokers, forwarders, and direct shippers, and negotiate freight rates, fuel surcharges, and accessorial terms on Carrier\'s behalf according to Carrier\'s pre-approved minimum rate guidelines.'],
  ['2. Carrier Setup Packets & Compliance', 'To request, receive, complete, and submit standard broker-carrier onboarding packets, profile forms, and certificates of insurance necessary to establish Carrier as an approved motor carrier with licensed freight intermediaries.'],
  ['3. Execution of Load Confirmations', 'To execute, acknowledge, and sign Load Confirmations, Rate Confirmations, and Dispatch Agreements under Carrier\'s active MC/USDOT authority for loads explicitly approved by Carrier.'],
  ['4. Dispatch Tracking & Check Calls', 'To provide check calls, status updates, appointment scheduling, and electronic shipment tracking to shippers, receivers, and freight brokers throughout the transit of dispatched freight.'],
  ['5. Invoicing & Billing Document Transmittal', 'To transmit Bills of Lading (BOL), Proof of Delivery (POD), rate confirmations, and accessorial receipts (detention, layover, lumper) to Carrier\'s designated factoring company or direct billing department for prompt remittance.']
];

// Draw 5 clause boxes with generous 34pt height
const clauseBoxH = 34;
poaClauses.forEach(([cTitle, cDesc]) => {
  doc.rect(LEFT_X, y, CW, clauseBoxH).fillAndStroke('#ffffff', BORDER_LIGHT);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.6).text(cTitle, LEFT_X + 10, y + 4);
  doc.fillColor(MUTED).font('Helvetica').fontSize(6.8).text(cDesc, LEFT_X + 10, y + 14.5, { width: CW - 20, lineGap: 1 });
  y += clauseBoxH + 4;
});

// IMPORTANT TRUCK'D UP PARTNER TERMS & SAFEGUARDS BOX
y += 3;
const safeStartY = y;
const safeW = CW - 24;

doc.font('Helvetica-Bold').fontSize(7.8);
const safeTitleH = doc.heightOfString("TRUCK'D UP PARTNER FEE STRUCTURE & COMMERCIAL TERMS:", { width: safeW });

doc.font('Helvetica').fontSize(7.2);
const termPartnerText = "• PARTNER DISPATCH TERMS & COMMERCIAL RELATIONSHIP: The total dispatch/service fee should be listed as 7% of gross freight revenue, payable to Truck’d Up. The carrier owes no separate dispatch fee to Shipping Wish. Shipping Wish provides the dispatch fulfillment while Truck’d Up maintains the carrier-facing commercial relationship.";
const termPartnerH = doc.heightOfString(termPartnerText, { width: safeW, lineGap: 1.3 });

const termCustodyText = "• 100% DIRECT FREIGHT REMITTANCE: This agreement does NOT authorize Dispatcher or Partner to collect, deposit, or endorse freight pay. 100% of freight revenues are billed and paid directly to Carrier or Carrier's factoring company.";
const termCustodyH = doc.heightOfString(termCustodyText, { width: safeW, lineGap: 1.3 });

const totalSafeBoxH = 8 + safeTitleH + 6 + termPartnerH + 6 + termCustodyH + 8;

// Draw container box
doc.rect(LEFT_X, safeStartY, CW, totalSafeBoxH).fillAndStroke('#fef3c7', '#fde68a');
doc.rect(LEFT_X, safeStartY, 4, totalSafeBoxH).fill(AMBER);

// Render text sequentially with proper spacing
let textCursorY = safeStartY + 8;
doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(7.8).text("TRUCK'D UP PARTNER FEE STRUCTURE & COMMERCIAL TERMS:", LEFT_X + 12, textCursorY);
textCursorY += safeTitleH + 6;

doc.fillColor('#78350f').font('Helvetica').fontSize(7.2);
doc.text(termPartnerText, LEFT_X + 12, textCursorY, { width: safeW, lineGap: 1.3 });
textCursorY += termPartnerH + 6;

doc.text(termCustodyText, LEFT_X + 12, textCursorY, { width: safeW, lineGap: 1.3 });

y = safeStartY + totalSafeBoxH + 8;
doc.restore();

// Section 2: Signature Blocks
y = drawSectionHeader('2. EXECUTION, ACCEPTANCE & SIGNATURES', y);

doc.save();
const sigBoxH = 96;
const halfW = (CW - 10) / 2;

// Carrier Signature Block
doc.rect(LEFT_X, y, halfW, sigBoxH).fillAndStroke('#ffffff', BORDER_LIGHT);
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text('CARRIER AUTHORIZATION (MOTOR CARRIER):', LEFT_X + 10, y + 7);
doc.fillColor(MUTED).font('Helvetica').fontSize(7.2);
doc.text('Company Legal Name: ________________________________', LEFT_X + 10, y + 24);
doc.text('Authorized Signer Name: ____________________________', LEFT_X + 10, y + 42);
doc.text('Title / Position: ___________________________________', LEFT_X + 10, y + 60);
doc.text('Signature: ______________________  Date: ____________', LEFT_X + 10, y + 78);

// Partner / Dispatcher Acceptance Block
doc.rect(LEFT_X + halfW + 10, y, halfW, sigBoxH).fillAndStroke('#ffffff', BORDER_LIGHT);
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text("ACCEPTED (SHIPPING WISH LLC & TRUCK'D UP):", LEFT_X + halfW + 18, y + 7);
doc.fillColor(MUTED).font('Helvetica').fontSize(7.2);
doc.text("Fulfillment: Shipping Wish LLC  ·  Partner: Truck'd Up", LEFT_X + halfW + 18, y + 24);
doc.text('Tarell Spencer: +1 215 669 3038  ·  truckdup.operations@gmail.com', LEFT_X + halfW + 18, y + 42);
doc.text('24/7 Dispatch Line: +1 (551) 400-6300  ·  shippingwish.com', LEFT_X + halfW + 18, y + 60);
doc.text('Date: Execution Date  ·  Signature: Partner Dispatch Desk', LEFT_X + halfW + 18, y + 78);
doc.restore();

// ==========================================
// FOOTERS (ALL PAGES) — GUARANTEED STRICT 3 PAGES
// ==========================================
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i += 1) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0; // Prevent auto page break
  const footerY = 752;
  doc.save();
  doc.rect(0, footerY, doc.page.width, 40).fill(NAVY);
  doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(7);
  doc.text(
    "SHIPPING WISH LLC & TRUCK'D UP  ·  24/7 Dispatch Desk: +1 (551) 400-6300  ·  truckdup.operations@gmail.com  ·  operations@shippingwish.com",
    LEFT_X, footerY + 7, { width: CW, align: 'center', lineBreak: false }
  );
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5);
  doc.text(
    `Official Partner Carrier Onboarding & Limited Power of Attorney Document  ·  Page ${i + 1} of ${totalPages}`,
    LEFT_X, footerY + 19, { width: CW, align: 'center', lineBreak: false }
  );
  doc.restore();
}

doc.end();

stream.on('finish', () => {
  console.log(`[SUCCESS] Truck'd Up Custom Carrier Onboarding PDF generated cleanly at ${outFile}`);
});
