const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../public/downloads');
const outFile = path.join(outDir, 'Shipping-Wish-Carrier-Onboarding-Packet.pdf');

fs.mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({
  size: 'LETTER',
  bufferPages: true,
  autoFirstPage: true,
  margins: { top: 32, bottom: 20, left: 44, right: 44 }
});

const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

const NAVY = '#0f172a';
const AMBER = '#f59e0b';
const SLATE = '#334155';
const MUTED = '#64748b';
const BORDER = '#cbd5e1';
const BG_BOX = '#f8fafc';
const CW = 524; // Content width: 612 - 88 = 524

function drawTopHeader(title, subtitle) {
  doc.save();
  // Amber top accent bar
  doc.rect(44, 30, CW, 3.5).fill(AMBER);
  
  // Brand Header
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text('SHIPPING WISH LLC', 44, 38, { width: CW });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('Freight Dispatch Operations & Fleet Fulfillment Desk', 44, 56, { width: CW });
  
  // Title badge box
  doc.rect(44, 70, CW, 24).fillAndStroke(BG_BOX, BORDER);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(title, 54, 76);
  if (subtitle) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(subtitle, 300, 77, { width: 258, align: 'right' });
  }
  doc.restore();
}

function drawSectionHeader(text, y) {
  doc.save();
  doc.rect(44, y, CW, 18).fill('#f1f5f9');
  doc.rect(44, y, 4, 18).fill(AMBER);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(text, 54, y + 4.5);
  doc.restore();
  return y + 22;
}

// ==========================================
// PAGE 1: COVER & MANDATORY CHECKLIST
// ==========================================
drawTopHeader('CARRIER ONBOARDING PACKET & CHECKLIST', 'Setup Guide & Document Checklist');

// Contact Box
let y = 100;
doc.save();
doc.rect(44, y, CW, 62).fillAndStroke(BG_BOX, BORDER);
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text('OFFICIAL OPERATIONS & DISPATCH CONTACT DIRECTORY', 54, y + 7);

doc.font('Helvetica').fontSize(8).fillColor(SLATE);
doc.text('Corporate Address: 19266 Coastal Hwy, Rehoboth Beach, DE 19971  ·  Website: https://www.shippingwish.com', 54, y + 20);
doc.text('Operations Desk: operations@shippingwish.com  ·  General Inquiries: info@shippingwish.com', 54, y + 33);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY);
doc.text('Main Operations: ', 54, y + 46, { continued: true });
doc.font('Helvetica').fillColor(SLATE).text('+1 (917) 737-0021      ', { continued: true });
doc.font('Helvetica-Bold').fillColor('#b45309').text('24/7 Dedicated Dispatch Line: ', { continued: true });
doc.font('Helvetica-Bold').fillColor(NAVY).text('+1 (551) 400-6300');
doc.restore();

// Section 1: Overview
y = 170;
y = drawSectionHeader('1. DISPATCH FULFILLMENT & SERVICE PRINCIPLES', y);

doc.save();
doc.font('Helvetica').fontSize(8).fillColor(SLATE);
doc.text(
  'Shipping Wish LLC serves as your dedicated, non-asset operations desk. We partner with licensed motor carriers to secure high-RPM freight, eliminate deadhead miles, handle broker negotiations, and provide 24/7 backend dispatch administration.',
  44, y, { width: CW, lineGap: 1.5 }
);
y += 24;

const principles = [
  ['100% Direct Freight Pay', 'Brokers and shippers remit payments directly to your factoring company or your bank via direct ACH. Shipping Wish LLC never touches your freight revenue.'],
  ['Carrier Authority Retained', 'All freight is tendered and dispatched strictly under your active MC/USDOT operating authority. You maintain full operational independence.'],
  ['Dedicated Dispatch Manager', 'You are assigned a dedicated operations manager who learns your preferred lanes, equipment specs, and rate targets to plan profitable reloads.'],
  ['Fast-Track 2-Hour Setup', 'Once your packet and 6 compliance items are received, your carrier profile is cleared and activated in our TMS within 2 hours.']
];

principles.forEach(([h, d]) => {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text('•  ' + h + ': ', 50, y, { continued: true });
  doc.fillColor(SLATE).font('Helvetica').fontSize(8).text(d, { width: CW - 10, lineGap: 1 });
  y += 17;
});
doc.restore();

// Section 2: Checklist
y += 6;
y = drawSectionHeader('2. MANDATORY CARRIER COMPLIANCE CHECKLIST (6 ITEMS)', y);

doc.save();
doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
  'Please compile and email the following 6 mandatory compliance items to operations@shippingwish.com before first load tender:',
  44, y, { width: CW }
);
y += 14;

const checklist = [
  ['[  ] 1. FMCSA Operating Authority (MC Certificate)', 'Copy of active MC/FF/MX Certificate of Registration issued by FMCSA verifying active authority.'],
  ['[  ] 2. Certificate of Insurance (COI)', 'Must reflect minimum $1,000,000 Auto Liability and $100,000 Cargo Liability. Certificate Holder: Shipping Wish LLC, 19266 Coastal Hwy, Rehoboth Beach, DE 19971.'],
  ['[  ] 3. Signed Form W-9', 'Current year Form W-9 signed and dated with correct legal entity name and Federal Taxpayer ID (EIN / SSN).'],
  ['[  ] 4. Notice of Assignment (NOA) / Factoring Setup', 'Factoring company Notice of Assignment letter for direct broker billing. If not factoring, provide a voided check for direct carrier ACH.'],
  ['[  ] 5. Completed Carrier Profile Sheet', 'Page 2 of this packet completed detailing equipment count, trailer specifications, maximum payload, and preferred operating regions.'],
  ['[  ] 6. Signed Limited Power of Attorney (POA)', 'Page 3 of this packet signed authorizing Shipping Wish LLC to contact brokers, negotiate rates, and execute load rate confirmations on your behalf.']
];

checklist.forEach(([title, detail]) => {
  doc.rect(44, y, CW, 29).fillAndStroke('#ffffff', '#e2e8f0');
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.2).text(title, 52, y + 4.5);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(detail, 52, y + 16, { width: CW - 16 });
  y += 33;
});

// Fast-Track Callout Banner at bottom of page 1
doc.rect(44, y, CW, 28).fillAndStroke('#fffbeb', '#fde68a');
doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(8.5).text('FAST-TRACK SUBMISSION: operations@shippingwish.com', 54, y + 5.5);
doc.fillColor(SLATE).font('Helvetica').fontSize(7.5).text('For immediate account activation or questions, contact our 24/7 Dispatch Desk at +1 (551) 400-6300.', 54, y + 16.5);
doc.restore();

// ==========================================
// PAGE 2: CARRIER & EQUIPMENT PROFILE
// ==========================================
doc.addPage();
drawTopHeader('CARRIER PROFILE & FLEET SPECIFICATIONS', 'Intake & Equipment Profile Sheet');

y = 100;
y = drawSectionHeader('1. MOTOR CARRIER COMPANY INFORMATION', y);

doc.save();
function drawFieldRow(label1, val1, label2, val2, curY, h) {
  h = h || 20;
  const colW = (CW - 8) / 2;
  // Col 1
  doc.rect(44, curY, colW, h).fillAndStroke('#ffffff', BORDER);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(label1, 50, curY + 3);
  doc.fillColor(NAVY).font('Helvetica').fontSize(8).text(val1 || '________________________________________________', 50, curY + 11);

  // Col 2
  doc.rect(44 + colW + 8, curY, colW, h).fillAndStroke('#ffffff', BORDER);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(label2, 44 + colW + 14, curY + 3);
  doc.fillColor(NAVY).font('Helvetica').fontSize(8).text(val2 || '________________________________________________', 44 + colW + 14, curY + 11);
  return curY + h + 3.5;
}

y = drawFieldRow('LEGAL COMPANY NAME', '', 'DBA (DOING BUSINESS AS)', '', y);
y = drawFieldRow('MC / FF / MX NUMBER', '', 'USDOT NUMBER', '', y);
y = drawFieldRow('FEDERAL TAXPAYER ID (EIN / SSN)', '', 'SAFETY RATING (Satisfactory / None / Conditional)', '', y);
y = drawFieldRow('PHYSICAL BUSINESS ADDRESS', '', 'CITY, STATE, ZIP CODE', '', y);
y = drawFieldRow('MAILING / BILLING ADDRESS', '', 'BILLING CITY, STATE, ZIP CODE', '', y);
y = drawFieldRow('PRIMARY CONTACT / OWNER NAME', '', 'TITLE / POSITION', '', y);
y = drawFieldRow('PRIMARY PHONE NUMBER', '', '24/7 AFTER-HOURS / EMERGENCY PHONE', '', y);
y = drawFieldRow('DISPATCH CONTACT EMAIL', '', 'FACTORING / ACCOUNTING EMAIL', '', y);
doc.restore();

y += 3;
y = drawSectionHeader('2. FLEET & EQUIPMENT SPECIFICATIONS', y);

doc.save();
y = drawFieldRow('ACTIVE POWER UNITS (TRACTORS)', 'Count: _______', 'ACTIVE DRIVERS (CDL-A)', 'Count: _______', y);
y = drawFieldRow('ELD PROVIDER (e.g. Motive, Samsara, Garmin)', '', 'TRAILER TRACKING / GPS PROVIDER', '', y);

// Equipment Checkboxes Box
doc.rect(44, y, CW, 42).fillAndStroke('#ffffff', BORDER);
doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5).text('EQUIPMENT TYPES AVAILABLE (Check all that apply):', 50, y + 4);

doc.fillColor(SLATE).font('Helvetica').fontSize(8);
doc.text('[  ] 53ft Dry Van (Air-Ride)              [  ] 53ft Refrigerated / Reefer             [  ] 48ft / 53ft Flatbed', 50, y + 15);
doc.text('[  ] Step Deck / Drop Deck              [  ] Power Only / Tow-Away                  [  ] 26ft Box Truck (Liftgate: Y / N)', 50, y + 27);
y += 45;

y = drawFieldRow('MAXIMUM PAYLOAD WEIGHT CAPACITY (LBS)', 'e.g. 45,000 lbs', 'TRAILER DOOR SPECIFICATIONS', 'e.g. Swing Doors / Roll Doors / E-Track / Vents', y);
y = drawFieldRow('TWIC CERTIFIED DRIVERS', '[  ] Yes   [  ] No', 'HAZMAT ENDORSED DRIVERS', '[  ] Yes   [  ] No', y);
doc.restore();

y += 3;
y = drawSectionHeader('3. PREFERRED LANES, REGIONS & RATE THRESHOLDS', y);

doc.save();
doc.rect(44, y, CW, 35).fillAndStroke('#ffffff', BORDER);
doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5).text('PREFERRED OPERATING REGIONS (Check all that apply):', 50, y + 4);
doc.fillColor(SLATE).font('Helvetica').fontSize(8);
doc.text('[  ] All 48 Lower States     [  ] Midwest     [  ] Southeast     [  ] Northeast     [  ] Texas / South     [  ] West Coast', 50, y + 15);
doc.text('Specific Preferred Lanes / Origin Markets: ____________________________________________________________________', 50, y + 25);
y += 39;

y = drawFieldRow('EXCLUDED STATES / CITIES (TO AVOID)', 'e.g. NYC Burroughs, CO mountains', 'PREFERRED HOME TIME FREQUENCY', 'e.g. Weekly / Bi-Weekly / OTR 2+ weeks', y);
y = drawFieldRow('TARGET MINIMUM RATE-PER-MILE (RPM)', '$___________ / mile minimum', 'TARGET WEEKLY GROSS REVENUE PER TRUCK', '$___________ / week target', y);
doc.restore();

y += 3;
y = drawSectionHeader('4. FACTORING & SETTLEMENT DETAILS', y);

doc.save();
y = drawFieldRow('FACTORING COMPANY NAME', '', 'FACTORING CONTACT PERSON', '', y);
y = drawFieldRow('FACTORING TELEPHONE NUMBER', '', 'FACTORING REMITTANCE / NOA EMAIL', '', y);
doc.restore();

// ==========================================
// PAGE 3: LIMITED POWER OF ATTORNEY (POA)
// ==========================================
doc.addPage();
drawTopHeader('LIMITED POWER OF ATTORNEY (POA)', 'Authorization for Load Booking & Broker Administration');

y = 100;
y = drawSectionHeader('1. GRANT OF LIMITED ADMINISTRATIVE POWER OF ATTORNEY', y);

doc.save();
doc.font('Helvetica').fontSize(7.8).fillColor(SLATE);
doc.text(
  'KNOW ALL MEN BY THESE PRESENTS that the motor carrier identified on Page 2 ("Carrier") hereby makes, constitutes, and appoints SHIPPING WISH LLC, a Delaware Limited Liability Company having its principal office at 19266 Coastal Hwy, Rehoboth Beach, DE 19971 ("Dispatcher"), as Carrier’s true, lawful, and limited Attorney-in-Fact, granting Dispatcher limited authority to act in Carrier’s name, place, and stead strictly for the following freight dispatch and administrative operations:',
  44, y, { width: CW, lineGap: 1.2 }
);
y += 36;

const poaClauses = [
  ['1. Sourcing Freight & Rate Negotiation', 'To search load boards, contact licensed freight brokers, forwarders, and direct shippers, and negotiate freight rates, fuel surcharges, and accessorial terms on Carrier\'s behalf according to Carrier\'s pre-approved minimum rate guidelines.'],
  ['2. Carrier Setup Packets & Compliance', 'To request, receive, complete, and submit standard broker-carrier onboarding packets, profile forms, and certificates of insurance necessary to establish Carrier as an approved motor carrier with licensed freight intermediaries.'],
  ['3. Execution of Load Confirmations', 'To execute, acknowledge, and sign Load Confirmations, Rate Confirmations, and Dispatch Agreements under Carrier\'s active MC/USDOT authority for loads explicitly verbally or digitally approved by Carrier.'],
  ['4. Dispatch Tracking & Check Calls', 'To provide check calls, status updates, appointment scheduling, and electronic shipment tracking to shippers, receivers, and freight brokers throughout the transit of dispatched freight.'],
  ['5. Invoicing & Billing Document Transmittal', 'To transmit Bills of Lading (BOL), Proof of Delivery (POD), rate confirmations, and accessorial receipts (detention, layover, lumper) to Carrier\'s designated factoring company or direct billing department for prompt remittance.']
];

poaClauses.forEach(([cTitle, cDesc]) => {
  doc.rect(44, y, CW, 25).fillAndStroke('#ffffff', '#e2e8f0');
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.8).text(cTitle, 52, y + 4);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.1).text(cDesc, 52, y + 13.5, { width: CW - 16, lineGap: 1 });
  y += 28;
});

// Explicit Safeguards Box (cleanly calculated, 50pt height, 2 distinct paragraphs)
y += 2;
doc.rect(44, y, CW, 50).fillAndStroke('#fffbeb', '#fde68a');
doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(7.8).text('IMPORTANT LEGAL RESTRICTIONS & CARRIER SAFEGUARDS:', 52, y + 5);
doc.fillColor('#78350f').font('Helvetica').fontSize(7.1);
doc.text('• NO FINANCIAL CUSTODY: This Limited Power of Attorney does NOT authorize Dispatcher to receive, cash, endorse, or deposit freight payments. 100% of freight revenues are billed and paid directly to Carrier or Carrier\'s designated factoring company.', 52, y + 17, { width: CW - 16, lineGap: 1 });
doc.text('• NO UNAUTHORIZED BOOKINGS: Dispatcher shall not execute any rate confirmation without prior affirmative consent from Carrier or Carrier\'s authorized fleet representative.', 52, y + 34, { width: CW - 16, lineGap: 1 });
y += 56;
doc.restore();

// Section 2: Signature Blocks
y = drawSectionHeader('2. EXECUTION, ACCEPTANCE & SIGNATURES', y);

doc.save();
const sigBoxH = 88;
const halfW = (CW - 10) / 2;

// Carrier Signature Block
doc.rect(44, y, halfW, sigBoxH).fillAndStroke('#ffffff', BORDER);
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.2).text('CARRIER AUTHORIZATION (MOTOR CARRIER):', 52, y + 6);
doc.fillColor(MUTED).font('Helvetica').fontSize(7.3);
doc.text('Company Legal Name: ________________________________', 52, y + 20);
doc.text('Authorized Signer Name: ____________________________', 52, y + 36);
doc.text('Title: _____________________________________________', 52, y + 52);
doc.text('Signature: ______________________  Date: ____________', 52, y + 68);

// Shipping Wish Acceptance Block
doc.rect(44 + halfW + 10, y, halfW, sigBoxH).fillAndStroke('#ffffff', BORDER);
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.2).text('ACCEPTED BY DISPATCHER (SHIPPING WISH LLC):', 44 + halfW + 18, y + 6);
doc.fillColor(MUTED).font('Helvetica').fontSize(7.3);
doc.text('Entity: Shipping Wish LLC (Delaware Registered)', 44 + halfW + 18, y + 20);
doc.text('Operations Desk: Operations Manager / Dispatch Lead', 44 + halfW + 18, y + 36);
doc.text('Phone: +1 (551) 400-6300  ·  Web: shippingwish.com', 44 + halfW + 18, y + 52);
doc.text('Date: ______________________  Signature: ___________', 44 + halfW + 18, y + 68);

doc.restore();

// ==========================================
// FOOTERS (ALL PAGES) — NO PAGE OVERFLOW
// ==========================================
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i += 1) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0; // Prevent auto page generation
  const footerY = 752;
  doc.save();
  doc.rect(0, footerY, doc.page.width, 40).fill(NAVY);
  doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(7.2);
  doc.text(
    `SHIPPING WISH LLC  ·  19266 Coastal Hwy, Rehoboth Beach, DE 19971  ·  24/7 Dispatch: +1 (551) 400-6300  ·  operations@shippingwish.com`,
    44, footerY + 7, { width: CW, align: 'center', lineBreak: false }
  );
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.8);
  doc.text(
    `Official Carrier Onboarding & Limited Power of Attorney Document  ·  Page ${i + 1} of ${totalPages}`,
    44, footerY + 19, { width: CW, align: 'center', lineBreak: false }
  );
  doc.restore();
}

doc.end();

stream.on('finish', () => {
  console.log(`[SUCCESS] PDF generated at ${outFile}`);
});
