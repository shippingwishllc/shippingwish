const PDFDocument = require('pdfkit');

const TERMS = [
  ['1. Appointment and limited power of attorney',
    'Carrier appoints Shipping Wish LLC as its agent to contact brokers and shippers, secure freight tenders, negotiate spot rates, execute rate confirmations in the carrier\'s name, and process check calls. Shipping Wish LLC does not purchase or broker freight.'],
  ['2. Carrier settlement and payment',
    'The carrier bills and collects freight charges from brokers or shippers, or through the carrier\'s factor. Shipping Wish LLC is paid only the agreed flat weekly operations fee. Broker freight pay stays with the carrier.'],
  ['3. Safety and FMCSA compliance',
    'The carrier warrants that it keeps active FMCSA operating authority and the required liability and cargo insurance. Drivers keep sole discretion over safe driving hours and vehicle safety.'],
  ['4. Term and termination',
    'Either party may cancel this agreement with written notice at any time. There is no long-term penalty for cancellation.']
];

function line(value) {
  const text = String(value || '').trim();
  return text || '—';
}

function buildCarrierSetupPdf(packet) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#0b1f3a').font('Helvetica-Bold').fontSize(16)
      .text('Shipping Wish LLC', { continued: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(9)
      .text('Carrier setup confirmation and dispatch agreement');
    doc.moveDown(0.4);
    doc.fillColor('#0b1f3a').font('Helvetica-Bold').fontSize(12)
      .text('Signed carrier details');
    doc.moveDown(0.3);
    doc.fillColor('#1e293b').font('Helvetica').fontSize(10);
    const rows = [
      ['Company', packet.companyName],
      ['DBA', packet.dba],
      ['Owner', packet.ownerName],
      ['Phone', packet.phone],
      ['Email', packet.email],
      ['Address', [packet.address, packet.city, packet.state, packet.zip].filter(Boolean).join(', ')],
      ['MC number', packet.mcNumber],
      ['USDOT', packet.dotNumber],
      ['Equipment', packet.equipmentTypes],
      ['Trucks / drivers', `${packet.numTrucks || 1} trucks, ${packet.numDrivers || 1} drivers`],
      ['Preferred lanes', packet.preferredLanes],
      ['Excluded states', packet.excludedStates],
      ['Minimum RPM', packet.minRpm],
      ['Factoring', packet.factoringCompany],
      ['ELD', packet.eldProvider],
      ['Signer', `${line(packet.signerName)} (${line(packet.signerTitle)})`],
      ['Signed at', packet.signedAt],
      ['IP address', packet.ipAddress]
    ];
    rows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(line(value));
    });

    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0b1f3a').text('Signature');
    doc.moveDown(0.2);
    if (packet.signatureBuffer && packet.signatureBuffer.length) {
      try {
        doc.image(packet.signatureBuffer, { fit: [220, 70] });
      } catch (err) {
        doc.font('Helvetica-Oblique').fontSize(14).text(line(packet.signerName));
      }
    } else {
      doc.font('Helvetica-Oblique').fontSize(16).fillColor('#0b1f3a').text(line(packet.typedSignature || packet.signerName));
    }
    doc.moveDown(0.8);
    doc.fillColor('#0b1f3a').font('Helvetica-Bold').fontSize(12)
      .text('Carrier dispatch agreement');
    doc.moveDown(0.3);
    doc.fillColor('#334155').font('Helvetica').fontSize(9)
      .text('These are the same four terms shown on the carrier setup form. The signer agreed to them before this packet was created.');
    TERMS.forEach(([title, body]) => {
      doc.moveDown(0.45);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0b1f3a').text(title);
      doc.font('Helvetica').fontSize(9).fillColor('#334155').text(body, { align: 'left' });
    });
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(8).fillColor('#64748b')
      .text('Shipping Wish LLC · 19266 Coastal Hwy, Rehoboth Beach, DE 19971 · operations@shippingwish.com · +1 (917) 737-0021');
    doc.end();
  });
}

function welcomeSms({ companyName, mcNumber }) {
  const name = String(companyName || 'your company').trim();
  const mc = mcNumber ? ` MC ${mcNumber}` : '';
  return `Shipping Wish LLC: ${name}, we received your carrier setup${mc}. Your welcome packet is in your email. A manager will contact you.`;
}

module.exports = { buildCarrierSetupPdf, welcomeSms, TERMS };
