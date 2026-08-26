/**
 * Builds the printable sales workshop PDF (images + scripts).
 * Run: node scripts/generate-sales-playbook-pdf.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'sales-workshop');
const img = (name) => path.join(outDir, 'images', name);
const outFile = path.join(outDir, 'Shipping-Wish-Sales-Playbook.pdf');

const NAVY = '#0f172a';
const AMBER = '#f59e0b';
const SLATE = '#334155';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const GREEN = '#047857';
const RED = '#b91c1c';

const doc = new PDFDocument({
  size: 'LETTER',
  bufferPages: true,
  margins: { top: 48, bottom: 56, left: 50, right: 50 },
  info: {
    Title: 'Sales Workshop Playbook — Shipping Wish LLC',
    Author: 'Shipping Wish LLC',
    Subject: 'Sales CRM & Carrier Acquisition training'
  }
});

fs.mkdirSync(outDir, { recursive: true });
const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

function stampFooters() {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - 32;
    doc.save();
    doc.rect(0, y - 6, doc.page.width, 38).fill(NAVY);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
    doc.text(
      `Shipping Wish LLC  ·  Internal sales playbook  ·  +1 (917) 737-0021  ·  Page ${i + 1} of ${range.count}`,
      50,
      y,
      { width: doc.page.width - 100, align: 'center', lineBreak: false }
    );
    doc.restore();
  }
}

function h2(text) {
  doc.moveDown(0.4);
  doc.fillColor(NAVY).font('Times-Bold').fontSize(18).text(text);
  doc.moveTo(50, doc.y + 4).lineTo(562, doc.y + 4).strokeColor(AMBER).lineWidth(2).stroke();
  doc.moveDown(0.6);
}

function body(text) {
  doc.fillColor(SLATE).font('Times-Roman').fontSize(11).text(text, { lineGap: 2 });
  doc.moveDown(0.35);
}

function label(text) {
  doc.fillColor(AMBER).font('Helvetica-Bold').fontSize(9).text(text.toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.2);
}

function scriptBox(text) {
  const width = 512;
  const x = 50;
  const pad = 10;
  const h = doc.heightOfString(text, { width: width - pad * 2, lineGap: 2 }) + pad * 2;
  if (doc.y + h > doc.page.height - 70) doc.addPage();
  const y = doc.y;
  doc.save();
  doc.rect(x, y, width, h).fill(NAVY);
  doc.fillColor('#e2e8f0').font('Times-Roman').fontSize(10.5)
    .text(text, x + pad, y + pad, { width: width - pad * 2, lineGap: 2 });
  doc.restore();
  doc.y = y + h + 10;
}

function noteBox(text, kind) {
  const width = 512;
  const x = 50;
  const pad = 10;
  const h = doc.heightOfString(text, { width: width - pad * 2, lineGap: 2 }) + pad * 2;
  if (doc.y + h > doc.page.height - 70) doc.addPage();
  const y = doc.y;
  const bg = kind === 'no' ? '#fef2f2' : kind === 'urdu' ? '#fffbeb' : '#f0fdf4';
  const bar = kind === 'no' ? RED : kind === 'urdu' ? AMBER : GREEN;
  doc.save();
  doc.rect(x, y, width, h).fill(bg);
  doc.rect(x, y, 5, h).fill(bar);
  doc.fillColor(SLATE).font(kind === 'urdu' ? 'Helvetica' : 'Times-Roman').fontSize(10)
    .text(text, x + pad + 6, y + pad, { width: width - pad * 2 - 6, lineGap: 2 });
  doc.restore();
  doc.y = y + h + 10;
}

function photo(file, caption) {
  if (!fs.existsSync(file)) return;
  const maxW = 512;
  const maxH = 210;
  if (doc.y + maxH + 36 > doc.page.height - 60) doc.addPage();
  const y = doc.y;
  doc.image(file, 50, y, { fit: [maxW, maxH], align: 'center' });
  doc.y = y + maxH + 6;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(caption || '', 50, doc.y, { width: maxW });
  doc.moveDown(0.6);
}

function simpleTable(headers, rows) {
  const colW = 512 / headers.length;
  const startX = 50;
  if (doc.y + 80 > doc.page.height - 60) doc.addPage();
  let y = doc.y;
  doc.save();
  doc.rect(startX, y, 512, 18).fill(NAVY);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
  headers.forEach((h, i) => {
    doc.text(h, startX + 4 + i * colW, y + 5, { width: colW - 8 });
  });
  y += 18;
  rows.forEach((row, ri) => {
    const heights = row.map((cell) => doc.heightOfString(String(cell), { width: colW - 8 }) + 8);
    const rowH = Math.max(22, ...heights);
    if (y + rowH > doc.page.height - 60) {
      doc.restore();
      doc.addPage();
      doc.save();
      y = 48;
      doc.rect(startX, y, 512, 18).fill(NAVY);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
      headers.forEach((h, i) => doc.text(h, startX + 4 + i * colW, y + 5, { width: colW - 8 }));
      y += 18;
    }
    if (ri % 2 === 0) doc.rect(startX, y, 512, rowH).fill('#f8fafc');
    doc.strokeColor(LINE).lineWidth(0.5).rect(startX, y, 512, rowH).stroke();
    doc.fillColor(SLATE).font('Helvetica').fontSize(8);
    row.forEach((cell, i) => {
      doc.text(String(cell), startX + 4 + i * colW, y + 4, { width: colW - 8 });
    });
    y += rowH;
  });
  doc.restore();
  doc.y = y + 10;
}

// Cover
doc.rect(0, 0, 612, 792).fill(NAVY);
if (fs.existsSync(img('cover.jpg'))) {
  doc.image(img('cover.jpg'), 0, 90, { width: 612, height: 344 });
}
doc.fillColor(AMBER).font('Helvetica-Bold').fontSize(11)
  .text('INTERNAL TRAINING  ·  SALES CRM & CARRIER ACQUISITION', 50, 460);
doc.fillColor('#fff').font('Times-Bold').fontSize(28)
  .text('How we win carriers, keep them, and start work', 50, 486, { width: 512 });
doc.fillColor('#cbd5e1').font('Times-Roman').fontSize(12)
  .text('Shipping Wish LLC  ·  Dedicated Fleet Operations Manager  ·  Weekly Stripe retainer  ·  They keep 100% of freight pay', 50, 580, { width: 512 });
doc.fillColor(AMBER).font('Helvetica').fontSize(10)
  .text('Workshop playbook for sales people', 50, 640);

doc.addPage();

h2('1. What we sell (memorize this)');
body('We are Shipping Wish LLC. We place a Dedicated Fleet Operations Manager with small U.S. motor carriers. They keep 100% of freight pay from the broker. We invoice a small weekly Stripe retainer. We are not a “dispatch company” and we do not take a percent of the load.');
noteBox('Asan baat: Hum carrier ke trucks ke liye ek dedicated operations manager dete hain. Load ka paisa unka. Humara weekly fee Stripe se. “Dispatch 10%” kabhi mat bolo.', 'urdu');

simpleTable(['Plan', 'Trucks', 'Weekly', 'Trial'], [
  ['Owner Operator — Dedicated Fleet Manager', '1 truck', '$149', '7 days · $0 today'],
  ['Small Fleet — Dedicated Operations Desk', '2–5 trucks', '$350', '7 days · $0 today'],
  ['Fleet Command — Company Operations Team', '6+ trucks', '$500', '7 days · $0 today']
]);
body('Always true: first charge next week. Cancel before first charge = $0. They invoice the broker or factor — not us.');

h2('2. Words that kill the call');
photo(img('sales-call.jpg'), 'Calm. Short. Not a boiler room. You are offering a manager, not dumping loads.');
noteBox('NEVER SAY: “We are a dispatch company.”  “10% of the load.”  “I have a hot load right now.”  “Guaranteed $X per mile.”  Delaware / “US based company” as a pitch.', 'no');
noteBox('ALWAYS SAY: Dedicated Operations Manager. Weekly Stripe invoice. You keep 100% of freight pay. Named person, not a call center. 7-day trial, $0 today. If you already have this in-house, I will hang up.', 'yes');

doc.addPage();
h2('3. How a client enters our software');
body('Three doors. Sales works Door 1 and Door 2. Operations owns Door 3 after checkout.');
simpleTable(['How they arrived', 'Where you look', 'Status', 'Your job'], [
  ['You found them (FMCSA / Add Lead) or Contact form', 'Sales CRM & Leads → lead table', 'New', 'Call → Email → Packet → Stripe link'],
  ['They started trial on the website', 'CRM top table “Website Stripe checkouts” + filter Active', 'Active', 'Call today. Collect MC, COI, trucks, lanes. Assign desk.'],
  ['They created a portal login at /signup', 'Admin → Carriers (Registered Carrier Fleets)', 'User account', 'Match to a CRM lead. Start onboarding.'],
  ['They replied to your email', 'Carrier Replies inbox', 'Interested', 'Answer same day. Send weekly Stripe link.']
]);
noteBox('Yaad rakho: Website se Stripe checkout = turant kaam start. Woh Active hain. Nayi inquiry New hai — pehle baat karo, paisa baad mein.', 'urdu');

h2('4. Your daily loop');
body('1. Login → Sales CRM & Leads.\n2. Check Website Stripe checkouts. Anyone new = call in 15 minutes.\n3. Open Carrier Replies. Answer every unread email.\n4. Filter New. Call 20. Did they want a manager or not?\n5. Maybe → Email (Dedicated Manager letter).\n6. Yes → Packet then Weekly Stripe. Stay on the phone until they open the email.\n7. SMS only if they asked, replied YES, or they are a trial/paying client. Cold SMS can get the company fined.');

simpleTable(['Button', 'What it does'], [
  ['Email', 'Sends the Dedicated Operations Manager letter via Resend. Status → Contacted.'],
  ['SMS', 'Short Twilio text with STOP / HELP footer. Use after consent.'],
  ['Weekly Stripe', 'Creates $149 / $350 / $500 checkout and emails it.'],
  ['Packet', 'Setup email: MC, COI, trucks, who approves loads.'],
  ['FMCSA Finder', 'Search MC / DOT / state. Import. FMCSA often has no email — find email first.']
]);

doc.addPage();
h2('5. How to talk to a carrier');
photo(img('carrier-owner.jpg'), 'He is busy, suspicious, and tired of “dispatch” calls. Respect that in the first 20 seconds.');
label('English — 20 second open');
scriptBox('“Hi, this is [your name] with Shipping Wish LLC. I’m not calling to dump loads on you. We place a Dedicated Operations Manager with small fleets — one named person on your trucks. Weekly Stripe invoice. You keep 100% of the freight pay. Do you already have that person in-house, or is that still you at night?”');
label('Roman Urdu — same meaning');
noteBox('“Salam, meri naam [name] hai, Shipping Wish LLC se. Load dump nahi kar raha. Hum chhote fleet ko Dedicated Operations Manager dete hain — ek named person aap ke trucks pe. Weekly Stripe bill. Freight ka 100% paisa aapka. Kya yeh kaam already ghar pe koi karta hai, ya raat ko aap khud karte ho?”', 'urdu');
label('If they pause');
scriptBox('“Small weekly amount. 7-day trial, nothing due today. We find and book. You approve. Useful, or are you covered?”');
label('If they got burned');
scriptBox('“Understood. This is a named manager, not a call center, and not a cut of your load. I can email a one-pager. No pressure.”');
label('If they say yes');
body('Ask trucks, equipment, home time, MC/DOT. Send Packet + Weekly Stripe while still on the phone. Stay until they open the email. “$0 today. First charge after 7 days if you keep us.” Introduce that an operations manager will call today or tomorrow morning.');
noteBox('Close line: “Link email mein hai. 7 din free. Cancel kar diya to $0. Agar rakhoge to weekly $149 / $350 / $500. Manager kal se trucks dekhna shuru karega.”', 'urdu');

doc.addPage();
h2('6. How you keep them satisfied');
photo(img('ops-desk.jpg'), 'Satisfaction is a named human who answers, books, and does not disappear.');
body('Sales closes. Operations keeps. Sales is responsible for a clean handoff. If you sell a dream and ops gets an empty folder, they cancel in week one.');
label('First 24 hours after Active / Stripe');
body('Call. Introduce the manager by name. Collect MC, USDOT, COI, W-9, factoring, truck/trailer, preferred lanes, who approves loads, ELD. Put files in Document Vault. Put trucks in Fleet. Send one email: manager name, portal login, what you send when a load is booked.');
label('First 7 days (trial)');
body('At least one serious load option they can accept or decline. Never book without approval. If freight is ugly that week, say so. Answer phone/SMS the same hour on active freight. No surprise extra fees. Weekly Stripe is the only operations bill from us.');
photo(img('handshake.jpg'), 'They stay when they feel staffed — not sold.');
noteBox('Promise you MAY make: a named manager, load finding and booking they approve, paperwork follow-up, TMS, they keep broker pay, they can cancel before the first charge.', 'yes');
noteBox('Promise you may NOT make: a dollar-per-mile number, “always loaded,” “we pay you,” “we are your broker,” “no deadhead ever.”', 'no');

doc.addPage();
h2('7. Email + SMS');
photo(img('email-phone.jpg'), 'Letters look like a company writing to a company. Not a blast. Not a coupon.');
body('Outreach = Dedicated Operations Manager letter. Follow-up = Reply YES. Packet = setup + Stripe. After checkout = trial agreement email ($0 today, weekly amount, what we do this week). That service email is written to land in Gmail Primary, not Promotions. Replies go to operations@ (Google) and to Carrier Replies if inbound is on.');
label('SMS example (footer is added automatically)');
scriptBox('Shipping Wish LLC: Dedicated ops manager for [company]? Weekly fee, you keep freight pay. Reply YES or call +1 (917) 737-0021.\n\nMsg & data rates may apply. Reply STOP to opt out, HELP for help. Shipping Wish LLC');
body('If they text STOP, the system blocks more SMS. Do not argue. Call or email instead. Cold SMS without consent is a TCPA risk.');

h2('8. Other marketing (besides CRM calling)');
simpleTable(['Channel', 'Do this', 'Do not'], [
  ['Website /pricing', 'Send this link after the call. Let Stripe take the card.', 'Invent a different price on the phone.'],
  ['Google Business Profile', 'Phone, Rehoboth address, real photos. Ask happy carriers for reviews.', 'Fake reviews. “Best dispatcher” stuffing.'],
  ['Google search ads', 'truck dispatch service, dedicated dispatcher owner operator → /pricing', 'Ads that say 10% dispatch.'],
  ['Referrals', 'Ask every Active carrier who else books their own freight at 11pm.', 'Cash kickbacks the owner did not approve.'],
  ['LinkedIn / FB groups', 'Helpful posts, then a personal DM.', 'Spam the same pitch in groups.'],
  ['Insurance / factoring agents', 'They already talk to small fleets. Leave a one-pager.', 'Promise them a cut unless the owner signed it.'],
  ['Truck stops / yards', 'One-page card: weekly prices, phone, QR to /pricing.', 'Fake “we have a load for you” flyers.'],
  ['YouTube / shorts', '60 seconds: we do not take a % of your load. Show three prices.', 'Random stock trucks and loud music.']
]);

doc.addPage();
h2('9. Owner setup — Resend + Twilio');
body('Resend SENDS mail. It is not Gmail. Two-way works like this: send with Resend; receive replies in Google Workspace (operations@) and optionally in our CRM Inbox via Resend inbound. Keep MX on Google. Do not send from onboarding@resend.dev.');
body('Resend: API key → Vercel RESEND_API_KEY. Add shippingwish.com domain. DNS SPF + DKIM. DMARC: v=DMARC1; p=quarantine; rua=mailto:operations@shippingwish.com. MAIL_FROM and MAIL_REPLY_TO = operations@shippingwish.com. Optional inbound webhook: https://www.shippingwish.com/api/email/inbound?secret=YOUR_SECRET');
body('Nobody can promise Gmail Primary forever. Authenticated domain + real Reply-To + letter-style service emails + people actually replying is how you stay out of spam. Blast 500 cold emails in an hour and you land in Promotions or junk. Trial and load emails are service messages.');
body('Twilio: Account SID + Auth Token + From number on Vercel. Register A2P 10DLC in Trust Hub or US carriers filter you. Number webhook “A message comes in”: https://www.shippingwish.com/api/voip/twilio-inbound. STOP / HELP footer is automatic.');

h2('10. Workshop drill (30 minutes)');
body('1. Pair up. Person A is the tired owner-operator. Person B uses the 20-second open. Switch.\n2. Person A says “I got burned by a dispatcher.” Person B uses the burned script. No arguing.\n3. Open CRM. Add a lead. Click Email. Show Inbox.\n4. Show /pricing on a phone.\n5. Quiz: Stripe checkout finished — where do you look? Answer: CRM → Website Stripe checkouts / Active. Call in 15 minutes.');
doc.moveDown(0.8);
doc.fillColor(NAVY).font('Times-Bold').fontSize(13)
  .text('If you remember only four lines: dedicated manager · weekly Stripe · they keep freight pay · never say dispatch commission.');

stampFooters();
doc.end();

stream.on('finish', () => {
  const mb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(1);
  console.log('Wrote', outFile, mb, 'MB');
});
