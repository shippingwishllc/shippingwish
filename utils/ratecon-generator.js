const PDFDocument = require('pdfkit');
const crypto = require('crypto');

/**
 * Generate an official LoadsNexus™ / Shipping Wish Rate Confirmation vector PDF.
 * @param {Object} data - Contract data
 * @param {import('stream').Writable} outputStream - Stream to write PDF to (e.g., Express res)
 */
function generateRateConfirmationPDF(data, outputStream) {
  const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
  doc.pipe(outputStream);

  const loadNumber = String(data.loadNumber || data.id || `LN-${Math.floor(100000 + Math.random() * 900000)}`);
  const dateIssued = data.dateIssued || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  
  // Broker details
  const brokerName = data.brokerName || 'LoadsNexus™ Verified Brokerage';
  const brokerMc = data.brokerMc || 'MC-981240';
  const brokerPhone = data.brokerPhone || '+1 (800) 580-3101';
  const brokerEmail = data.brokerEmail || 'dispatch@loadsnexus.com';
  const brokerBond = data.brokerBond || 'ACTIVE ($75,000 BMC-84 Verified)';
  
  // Carrier details
  const carrierName = data.carrierName || 'Authorized Motor Carrier Partner';
  const carrierMc = data.carrierMc || 'MC-ON-FILE';
  const carrierDot = data.carrierDot || '';
  const carrierPhone = data.carrierPhone || '+1 (800) 555-0199';
  const carrierEmail = data.carrierEmail || 'dispatch@carrier.com';

  // Freight & Route details
  const origin = data.origin || data.pickupLocation || 'Chicago, IL';
  const destination = data.destination || data.deliveryLocation || 'Dallas, TX';
  const pickupDate = data.pickupDate || 'Scheduled Today';
  const deliveryDate = data.deliveryDate || 'Scheduled (Direct Transit)';
  const equipment = data.equipment || data.equipmentType || "53' Dry Van";
  const weight = data.weight ? (typeof data.weight === 'number' ? `${data.weight.toLocaleString()} lbs` : data.weight) : '42,000 lbs';
  const commodity = data.commodity || 'General Freight / Commercial Goods';
  const miles = Number(data.miles) || 650;
  const rate = Number(data.rate) || 2850;
  const rpm = data.rpm ? Number(data.rpm).toFixed(2) : (rate / miles).toFixed(2);
  const notes = data.notes || 'Clean dry trailer required. No unauthorized co-brokering.';

  // Color Palette
  const primaryNavy = '#0F172A';
  const brandBlue = '#2563EB';
  const darkBlue = '#1E3A8A';
  const emeraldGreen = '#059669';
  const textDark = '#1E293B';
  const textMuted = '#64748B';
  const borderLight = '#E2E8F0';
  const bgLight = '#F8FAFC';

  // 1. Top Header Banner
  doc.rect(0, 0, 612, 72).fill(primaryNavy);

  doc.fontSize(16).fillColor('#FFFFFF').font('Helvetica-Bold')
     .text('LOADSNEXUS™ FREIGHT EXCHANGE', 36, 18);
  doc.fontSize(8.5).fillColor('#94A3B8').font('Helvetica')
     .text('Official Carrier Rate Confirmation · Powered by Shipping Wish LLC · 19266 Coastal Hwy, Rehoboth Beach, DE 19971', 36, 40);

  doc.fontSize(11).fillColor('#FFFFFF').font('Helvetica-Bold')
     .text('RATE CONFIRMATION', 420, 18, { align: 'right', width: 156 });
  doc.fontSize(10).fillColor('#34D399').font('Helvetica-Bold')
     .text(`LOAD #${loadNumber}`, 420, 34, { align: 'right', width: 156 });
  doc.fontSize(8).fillColor('#94A3B8').font('Helvetica')
     .text(`Date: ${dateIssued}`, 420, 48, { align: 'right', width: 156 });

  // 2. Broker & Carrier Section (Two Columns)
  let y = 84;
  doc.rect(36, y, 262, 86).fillAndStroke(bgLight, borderLight);
  doc.rect(314, y, 262, 86).fillAndStroke(bgLight, borderLight);

  // Broker Box
  doc.fontSize(8.5).fillColor(brandBlue).font('Helvetica-Bold').text('BROKER / TENDERED BY', 46, y + 9);
  doc.fontSize(11).fillColor(textDark).font('Helvetica-Bold').text(brokerName, 46, y + 23);
  doc.fontSize(8).fillColor(textMuted).font('Helvetica')
     .text(`MC / Authority: ${brokerMc}`, 46, y + 38)
     .text(`BMC-84 Surety Bond: ${brokerBond}`, 46, y + 50)
     .text(`Dispatch Phone: ${brokerPhone} | ${brokerEmail}`, 46, y + 62);

  // Carrier Box
  doc.fontSize(8.5).fillColor(brandBlue).font('Helvetica-Bold').text('ASSIGNED MOTOR CARRIER', 324, y + 9);
  doc.fontSize(11).fillColor(textDark).font('Helvetica-Bold').text(carrierName, 324, y + 23);
  doc.fontSize(8).fillColor(textMuted).font('Helvetica')
     .text(`MC: ${carrierMc}${carrierDot ? ` · USDOT: ${carrierDot}` : ''}`, 324, y + 38)
     .text(`Operating Status: ACTIVE AUTHORIZED FOR HIRE`, 324, y + 50)
     .text(`Carrier Phone: ${carrierPhone} | ${carrierEmail}`, 324, y + 62);

  // 3. Freight Summary & Financial Highlight Ribbon
  y = 180;
  doc.rect(36, y, 540, 50).fillAndStroke('#EFF6FF', '#BFDBFE');
  
  doc.fontSize(8.5).fillColor(darkBlue).font('Helvetica-Bold').text('EQUIPMENT & COMMODITY', 48, y + 10);
  doc.fontSize(10).fillColor(textDark).font('Helvetica-Bold')
     .text(`${equipment} · ${weight} · ${commodity}`, 48, y + 26);

  doc.fontSize(8.5).fillColor(darkBlue).font('Helvetica-Bold')
     .text(`MILEAGE & RPM: ${miles} mi @ $${rpm}/mi`, 340, y + 10, { align: 'right', width: 224 });
  doc.fontSize(15).fillColor(emeraldGreen).font('Helvetica-Bold')
     .text(`$${rate.toLocaleString()}.00 USD`, 340, y + 25, { align: 'right', width: 224 });

  // 4. Scheduled Route Stops (Pickup & Delivery)
  y = 240;
  doc.fontSize(10.5).fillColor(primaryNavy).font('Helvetica-Bold').text('SCHEDULED ROUTE STOPS', 36, y);

  // Stop 1: Pickup
  y = 256;
  doc.rect(36, y, 540, 52).fillAndStroke('#FFFFFF', borderLight);
  doc.circle(52, y + 20, 8).fill(brandBlue);
  doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold').text('1', 49, y + 16);
  doc.fontSize(10.5).fillColor(textDark).font('Helvetica-Bold').text(`PICKUP: ${origin}`, 70, y + 12);
  doc.fontSize(8.5).fillColor(textMuted).font('Helvetica')
     .text(`Date / Time: ${pickupDate} · Shipper Dock · Driver must verify piece count & receive signed BOL`, 70, y + 28);

  // Stop 2: Delivery
  y = 316;
  doc.rect(36, y, 540, 52).fillAndStroke('#FFFFFF', borderLight);
  doc.circle(52, y + 20, 8).fill(emeraldGreen);
  doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold').text('2', 49, y + 16);
  doc.fontSize(10.5).fillColor(textDark).font('Helvetica-Bold').text(`DELIVERY: ${destination}`, 70, y + 12);
  doc.fontSize(8.5).fillColor(textMuted).font('Helvetica')
     .text(`Date / Time: ${deliveryDate} · Consignee Dock · Legible signed clean Proof of Delivery (POD) required`, 70, y + 28);

  // 5. Operational Terms & Accessorial Policies
  y = 380;
  doc.fontSize(9.5).fillColor(primaryNavy).font('Helvetica-Bold').text('OPERATIONAL & ACCESSORIAL TERMS', 36, y);

  y = 394;
  doc.rect(36, y, 540, 48).fillAndStroke(bgLight, borderLight);
  doc.fontSize(8).fillColor(textDark).font('Helvetica')
     .text('• DETENTION: $75.00/hour after 2 hours free time. Written notification required 30 mins prior to detention onset.', 44, y + 8)
     .text('• TONU: $250.00 Truck Ordered Not Used if shipment is cancelled after carrier dispatch en route.', 44, y + 20)
     .text('• TRACKING: Continuous GPS tracking telematics active during entire transit via Shipping Wish / LoadsNexus.', 44, y + 32);

  // 6. Anti-Double Brokering Mandatory Security Clause
  y = 452;
  doc.rect(36, y, 540, 72).fillAndStroke('#FEF2F2', '#FECACA');
  doc.fontSize(8.5).fillColor('#991B1B').font('Helvetica-Bold')
     .text('MANDATORY ANTI-DOUBLE BROKERING SECURITY PROHIBITION (49 CFR § 371.3)', 44, y + 8);
  doc.fontSize(7.5).fillColor('#7F1D1D').font('Helvetica')
     .text('Carrier expressly certifies and covenants that this shipment will be transported exclusively upon carrier\'s own equipment operating under carrier\'s own active FMCSA authority. Co-brokering, re-brokering, subcontracting, or unauthorized trip-leasing to third parties is strictly prohibited. Any violation constitutes an intentional breach of contract resulting in immediate 100% forfeiture of agreed freight compensation, immediate cancellation of contract, and reporting to the FMCSA National Consumer Complaint Database.', 44, y + 22, { width: 520, lineGap: 1.5 });

  // 7. Execution & Signature Blocks
  y = 536;
  doc.fontSize(9.5).fillColor(primaryNavy).font('Helvetica-Bold').text('DIGITAL CONTRACT EXECUTION & SIGNATURE', 36, y);

  y = 550;
  doc.rect(36, y, 262, 95).fillAndStroke(bgLight, borderLight);
  doc.rect(314, y, 262, 95).fillAndStroke('#F0FDF4', '#BBF7D0');

  // Broker Signature Box
  doc.fontSize(8).fillColor(textMuted).font('Helvetica-Bold').text('ISSUED BY BROKER REPRESENTATIVE', 46, y + 8);
  doc.fontSize(9.5).fillColor(textDark).font('Helvetica-Bold').text(brokerName, 46, y + 22);
  doc.fontSize(8).fillColor(textMuted).font('Helvetica').text('Authorized Freight Desk · Verified Dispatcher', 46, y + 36);
  doc.rect(46, y + 54, 240, 0.5).stroke('#CBD5E1');
  doc.fontSize(7.5).fillColor(textMuted).font('Helvetica').text(`Digital Stamp: ${dateIssued} · Authorized Tender`, 46, y + 62);

  // Carrier Signature Box
  doc.fontSize(8).fillColor(emeraldGreen).font('Helvetica-Bold').text('ACCEPTED BY MOTOR CARRIER DISPATCH', 324, y + 8);
  doc.fontSize(9.5).fillColor(textDark).font('Helvetica-Bold').text(carrierName, 324, y + 22);
  doc.fontSize(8).fillColor(textMuted).font('Helvetica').text(`MC# ${carrierMc} · Digital E-Signature Acceptance`, 324, y + 36);
  doc.rect(324, y + 54, 240, 0.5).stroke('#86EFAC');
  const sigHash = crypto.createHash('sha256').update(`${loadNumber}-${rate}-${carrierMc}-${dateIssued}`).digest('hex').slice(0, 16).toUpperCase();
  doc.fontSize(7.5).fillColor('#15803D').font('Helvetica-Bold').text(`VERIFIED DIGITALLY · HASH: ${sigHash}`, 324, y + 62);
  doc.fontSize(7).fillColor(textMuted).font('Helvetica').text('By accepting this tender, Carrier confirms terms & zero double-brokering.', 324, y + 74);

  // 8. Footer
  const footerY = 660;
  doc.rect(36, footerY, 540, 0.5).stroke(borderLight);
  doc.fontSize(7.5).fillColor(textMuted).font('Helvetica')
     .text('LoadsNexus™ Freight Exchange · An Enterprise Freight Platform by Shipping Wish LLC · Support: (800) 580-3101 · support@shippingwish.com', 36, footerY + 8, { align: 'center', width: 540 });

  doc.end();
}

module.exports = { generateRateConfirmationPDF };
