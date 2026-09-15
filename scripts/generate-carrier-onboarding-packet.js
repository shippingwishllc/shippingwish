/**
 * Builds the official printable Shipping Wish Carrier Onboarding Packet & Checklist PDF.
 * Run: node scripts/generate-carrier-onboarding-packet.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'downloads');
const outFile = path.join(outDir, 'Shipping-Wish-Carrier-Onboarding-Packet.pdf');

const NAVY = '#0f172a';
const AMBER = '#f59e0b';
const SLATE = '#334155';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

const doc = new PDFDocument({
  size: 'LETTER',
  bufferPages: true,
  margins: { top: 44, bottom: 50, left: 50, right: 50 },
  info: {
    Title: 'Carrier Onboarding Packet & Checklist — Shipping Wish LLC',
    Author: 'Shipping Wish LLC',
    Subject: 'Carrier Dispatch Agreement & Document Checklist'
  }
});

fs.mkdirSync(outDir, { recursive: true });
const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

function stampFooters() {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - 30;
    doc.save();
    doc.rect(0, y - 6, doc.page.width, 36).fill(NAVY);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
    doc.text(
      `Shipping Wish LLC  ·  19266 Coastal Hwy, Rehoboth Beach, DE 19971  ·  operations@shippingwish.com  ·  Page ${i + 1} of ${range.count}`,
      50,
      y,
      { width: doc.page.width - 100, align: 'center', lineBreak: false }
    );
    doc.restore();
  }
}

function header(title, subtitle) {
  doc.save();
  doc.rect(50, doc.y, 512, 4).fill(AMBER);
  doc.restore();
  doc.moveDown(0.4);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text(title);
  if (subtitle) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(subtitle);
  }
  doc.moveDown(0.8);
}

function sectionTitle(text) {
  doc.moveDown(0.5);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(text);
  doc.moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).strokeColor(AMBER).lineWidth(1.5).stroke();
  doc.moveDown(0.5);
}

// ================= PAGE 1: COVER & WELCOME =================
header('SHIPPING WISH LLC', 'Freight Dispatch Operations & Fleet Fulfillment Desk');

doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text('CARRIER ONBOARDING PACKET & CHECKLIST');
doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('Complete setup guide, document checklist, carrier profile, and limited power of attorney.');
doc.moveDown(1);

doc.rect(50, doc.y, 512, 60).fillAndStroke('#f8fafc', LINE);
doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('Company & Operations Contact', 65, doc.y - 50);
doc.fillColor(SLATE).font('Helvetica').fontSize(9.5).text(
  'Headquarters: 19266 Coastal Hwy, Rehoboth Beach, DE 19971\n' +
  'Operations Desk Email: operations@shippingwish.com  ·  Direct Dispatch: dispatch@shippingwish.com\n' +
  'Phone: +1 (917) 737-0021  ·  24/7 Dispatch Line: +1 (609) 469-6004  ·  Web: https://www.shippingwish.com',
  65, doc.y + 3
);
doc.moveDown(2);

sectionTitle('1. WELCOME & DISPATCH PARTNER OVERVIEW');
doc.fillColor(SLATE).font('Helvetica').fontSize(10).text(
  'Thank you for partnering with Shipping Wish LLC. Our dedicated operations desk acts as your extended office — sourcing top-paying freight, negotiating aggressive rates with certified brokers, planning high-RPM reloads, handling all rate confirmations, broker setup packets, and tracking 24/7.\n\n' +
  'Key Principles of Our Dispatch Fulfillment:\n' +
  '• 100% Direct Pay: You or your factoring company invoice and collect 100% of the freight revenue directly from the broker. Shipping Wish never touches your load money.\n' +
  '• Carrier Retains Full Authority: All loads are booked strictly under your MC/USDOT authority.\n' +
  '• Dedicated Desk: An assigned operations manager plans your lanes, deadhead reduction, and backhauls.\n' +
  '• Rapid Setup: Once this packet and the checklist items are submitted, your fleet is active within 2 hours.'
);

doc.moveDown(1);
sectionTitle('2. MANDATORY CARRIER ONBOARDING CHECKLIST');
doc.fillColor(SLATE).font('Helvetica').fontSize(9.5).text(
  'Please submit the following required documents to operations@shippingwish.com to activate your account:'
);
doc.moveDown(0.5);

const checklistItems = [
  ['[  ] 1. FMCSA Operating Authority Certificate', 'Copy of your active MC/FF/MX Certificate of Registration issued by the FMCSA.'],
  ['[  ] 2. Certificate of Insurance (COI)', 'Minimum $1,000,000 Auto Liability & $100,000 Cargo Liability. List Shipping Wish LLC as Certificate Holder.'],
  ['[  ] 3. Signed Form W-9', 'Current year W-9 Form signed and dated with your Federal Taxpayer ID (EIN / SSN).'],
  ['[  ] 4. Notice of Assignment (NOA) / Factoring Setup', 'Letter from your factoring company (if applicable). If not factoring, provide a voided check for direct broker ACH.'],
  ['[  ] 5. Completed Carrier Profile Sheet (Page 2)', 'Equipment count, trailer specs, max payload, preferred states/lanes, and driver emergency contacts.'],
  ['[  ] 6. Signed Limited Power of Attorney (Page 3)', 'Authorizes Shipping Wish LLC to request broker packets, negotiate rates, and sign rate confirmations on your behalf.']
];

checklistItems.forEach(([title, desc]) => {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(title);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(desc, { indent: 15 });
  doc.moveDown(0.3);
});

// ================= PAGE 2: CARRIER PROFILE & EQUIPMENT =================
doc.addPage();
header('CARRIER INFORMATION & FLEET PROFILE', 'Shipping Wish LLC Dispatch Fulfillment');

sectionTitle('COMPANY & MOTOR CARRIER DETAILS');
doc.fillColor(SLATE).font('Helvetica').fontSize(9.5);

const formFields = [
  'Legal Company Name: __________________________________________________  DBA (if any): ___________________',
  'MC / FF Number: ________________________   USDOT Number: _____________________  Federal EIN: _________________',
  'Physical Address: ____________________________________________________  City/ST/Zip: ____________________',
  'Billing Address: _____________________________________________________  City/ST/Zip: ____________________',
  'Primary Contact / Owner Name: _________________________________________  Title: __________________________',
  'Phone Number: ___________________________  Emergency / After-Hours Phone: ______________________________',
  'Dispatch Email: _________________________________  Accounting Email: ___________________________________'
];
formFields.forEach(f => {
  doc.text(f);
  doc.moveDown(0.4);
});

sectionTitle('EQUIPMENT & OPERATIONAL SPECIFICATIONS');
const equipFields = [
  'Number of Active Power Units (Tractors): _______   Number of Drivers: _______   ELD Provider: __________________',
  'Equipment Types Available (Check all that apply):',
  '  [  ] 53ft Dry Van           [  ] 53ft Reefer (Temp Controlled)      [  ] 48ft/53ft Flatbed',
  '  [  ] Step Deck / Drop Deck  [  ] Box Truck (Liftgate: Y/N)          [  ] Power Only',
  'Trailer Specifications (Length/Door Type/E-Track): ______________________________________________________________',
  'Maximum Cargo Weight Capacity (lbs): __________________  TWIC Certified: [ ] Yes [ ] No  HAZMAT: [ ] Yes [ ] No'
];
equipFields.forEach(f => {
  doc.text(f);
  doc.moveDown(0.4);
});

sectionTitle('PREFERRED LANES, REGIONS & RATE THRESHOLDS');
const laneFields = [
  'Preferred Operating Regions: [ ] All 48 States  [ ] Midwest  [ ] Southeast  [ ] Northeast  [ ] Texas/South  [ ] West Coast',
  'States / Major Cities to Avoid (if any): ____________________________________________________________________',
  'Target Minimum Rate-Per-Mile (RPM): $________ / mile   Target Weekly Gross Revenue per Truck: $_________________',
  'Preferred Home Time Schedule: [ ] Weekly  [ ] Bi-Weekly  [ ] Over-The-Road (OTR 3+ weeks)'
];
laneFields.forEach(f => {
  doc.text(f);
  doc.moveDown(0.4);
});

sectionTitle('FACTORING & INVOICING INFORMATION');
const factorFields = [
  'Do you utilize a Factoring Company? [ ] Yes  [ ] No (Direct Pay)',
  'Factoring Company Name: __________________________________  Contact Person: ____________________________',
  'Factoring Phone: ____________________________  Factoring Remittance Email: _______________________________'
];
factorFields.forEach(f => {
  doc.text(f);
  doc.moveDown(0.4);
});

// ================= PAGE 3: LIMITED POWER OF ATTORNEY (POA) =================
doc.addPage();
header('LIMITED POWER OF ATTORNEY (POA)', 'For Freight Load Booking & Broker Administration Only');

doc.fillColor(SLATE).font('Helvetica').fontSize(9.5).text(
  'KNOW ALL MEN BY THESE PRESENTS that the undersigned Motor Carrier ("Carrier") hereby appoints Shipping Wish LLC ("Dispatcher"), located at 19266 Coastal Hwy, Rehoboth Beach, DE 19971, as Carrier’s lawful and limited Attorney-in-Fact, granting limited Power of Attorney strictly for the following administrative purposes:\n\n' +
  '1. Load Finding & Rate Negotiation: To search, identify, and negotiate freight rates with licensed freight brokers, freight forwarders, and shippers on Carrier\'s behalf.\n' +
  '2. Carrier Setup Packets: To request, fill out, and execute standard broker-carrier agreements, profile packets, and billing setup forms in Carrier\'s name.\n' +
  '3. Rate Confirmations: To verify, execute, and sign Rate Confirmations and load booking tenders under Carrier\'s MC/USDOT authority in accordance with Carrier\'s pre-approved minimum rate guidelines.\n' +
  '4. Dispatch Coordination: To exchange check calls, tracking updates, dispatch instructions, and delivery notifications with brokers, shippers, and receivers.\n' +
  '5. Shipping Documents: To transmit Bills of Lading (BOL), Proof of Delivery (POD), and accessorial receipts (lumper, detention) to brokers and factoring companies for timely settlement.\n\n' +
  'RESTRICTIONS & LIMITATIONS:\n' +
  '• This Limited Power of Attorney does NOT grant Dispatcher any authority to receive, endorse, or collect freight payments or negotiable checks made payable to Carrier.\n' +
  '• Dispatcher shall NOT obligate Carrier to any load without Carrier\'s verbal, digital, or written consent.\n' +
  '• This Power of Attorney shall remain in effect until revoked in writing by either party.'
);

doc.moveDown(1.5);
sectionTitle('CARRIER SIGNATURE & AUTHORIZATION');

doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('CARRIER (MOTOR CARRIER COMPANY):');
doc.moveDown(0.5);
doc.fillColor(SLATE).font('Helvetica').fontSize(9.5);
doc.text('Company Legal Name: _______________________________________________________________________________');
doc.moveDown(0.5);
doc.text('Authorized Representative Name: _____________________________________ Title: ___________________________');
doc.moveDown(0.5);
doc.text('Signature: __________________________________________________________ Date: ___________________________');
doc.moveDown(1.5);

doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('ACCEPTED & ACKNOWLEDGED BY DISPATCHER:');
doc.moveDown(0.5);
doc.fillColor(SLATE).font('Helvetica').fontSize(9.5);
doc.text('Company: Shipping Wish LLC (Delaware Registered LLC)');
doc.moveDown(0.3);
doc.text('Authorized Representative: Operations Desk / Dispatch Manager');
doc.moveDown(0.3);
doc.text('Date: ________________________   Signature: ___________________________________________________');

// Stamp footers on all pages
stampFooters();
doc.end();

stream.on('finish', () => {
  console.log(`[OK] Carrier Onboarding Packet PDF created at: ${outFile}`);
});
