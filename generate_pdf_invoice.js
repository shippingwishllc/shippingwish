const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'public', 'invoices');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const pdfPath = path.join(outputDir, 'Invoice_XU3CXGZL-0006.pdf');
const doc = new PDFDocument({ margin: 40, size: 'LETTER' });

const stream = fs.createWriteStream(pdfPath);
doc.pipe(stream);

// --- Header / Brand Banner ---
doc.rect(0, 0, 612, 110).fill('#0f172a');

doc.fillColor('#f59e0b').font('Helvetica-Bold').fontSize(24).text('SHIPPING WISH LLC', 40, 30);
doc.fillColor('#94a3b8').font('Helvetica').fontSize(10).text('Premier US Freight Dispatch & Enterprise Logistics Conglomerate', 40, 58);
doc.fillColor('#ffffff').fontSize(9).text('www.shippingwish.com | dispatch@shippingwish.com | +1 917 737 0021', 40, 74);

// PAID Watermark Badge top right
doc.save();
doc.roundedRect(440, 30, 132, 36, 6).fill('#059669');
doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('PAID IN FULL', 450, 41, { width: 112, align: 'center' });
doc.restore();

// --- Document Title & Meta Bar ---
doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text('INVOICE', 40, 130);
doc.fillColor('#64748b').font('Helvetica').fontSize(10).text(`Invoice Number: XU3CXGZL-0006`, 40, 152);
doc.text(`Issue Date: August 12, 2026 | Due Date: August 12, 2026`, 40, 166);

doc.moveTo(40, 185).lineTo(572, 185).strokeColor('#e2e8f0').lineWidth(1).stroke();

// --- Billing Columns: From vs Billed To ---
const colY = 200;

// Seller (Left)
doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('ISSUED BY:', 40, colY);
doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Shipping Wish LLC', 40, colY + 16);
doc.font('Helvetica').fontSize(9).fillColor('#475569')
   .text('19266 Coastal Hwy', 40, colY + 30)
   .text('Rehoboth, DE 19971, USA', 40, colY + 42)
   .text('Phone: +1 917 737 0021', 40, colY + 54)
   .text('Email: dispatch@shippingwish.com', 40, colY + 66)
   .text('Web: www.shippingwish.com', 40, colY + 78);

// Customer (Right)
doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('BILLED TO:', 320, colY);
doc.font('Helvetica-Bold').fontSize(10).fillColor('#2563eb').text('Halak Logistics', 320, colY + 16);
doc.font('Helvetica').fontSize(9).fillColor('#475569')
   .text('15311 GUNDRY AVE 30', 320, colY + 30)
   .text('PARAMOUNT, CA 90723 US', 320, colY + 42)
   .text('Phone: (323) 338-6186', 320, colY + 54)
   .text('Email: halaklogistics@gmail.com', 320, colY + 66);

// Summary Meta Grid Box
doc.rect(40, colY + 100, 532, 45).fill('#f8fafc');
doc.rect(40, colY + 100, 532, 45).stroke('#e2e8f0');

doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b')
   .text('CURRENCY', 55, colY + 108)
   .text('BILLING METHOD', 185, colY + 108)
   .text('TAX CALCULATION', 345, colY + 108);

doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
   .text('USD - US Dollar', 55, colY + 122)
   .text('Send invoice', 185, colY + 122)
   .text('No tax rate applied (Tax Exempt)', 345, colY + 122);

// --- Table Header ---
const tableY = colY + 165;
doc.rect(40, tableY, 532, 26).fill('#0f172a');

doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
   .text('DESCRIPTION', 52, tableY + 8)
   .text('QTY', 340, tableY + 8, { width: 50, align: 'center' })
   .text('UNIT PRICE', 400, tableY + 8, { width: 70, align: 'right' })
   .text('AMOUNT', 485, tableY + 8, { width: 75, align: 'right' });

// Table Row 1
const rowY = tableY + 26;
doc.rect(40, rowY, 532, 32).fill('#ffffff');
doc.rect(40, rowY, 532, 32).stroke('#e2e8f0');

doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
   .text('Dispatch fee', 52, rowY + 10);
doc.font('Helvetica').fontSize(9).fillColor('#475569')
   .text('1', 340, rowY + 10, { width: 50, align: 'center' })
   .text('$135.00', 400, rowY + 10, { width: 70, align: 'right' })
   .font('Helvetica-Bold').fillColor('#0f172a')
   .text('$135.00', 485, rowY + 10, { width: 75, align: 'right' });

// --- Totals Section ---
const totalY = rowY + 45;

const labelX = 360;
const valueX = 485;

doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Subtotal:', labelX, totalY);
doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text('$135.00', valueX, totalY, { width: 75, align: 'right' });

doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Total excluding tax:', labelX, totalY + 16);
doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text('$135.00', valueX, totalY + 16, { width: 75, align: 'right' });

doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Customer is tax exempt:', labelX, totalY + 32);
doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text('-', valueX, totalY + 32, { width: 75, align: 'right' });

doc.moveTo(labelX, totalY + 48).lineTo(572, totalY + 48).strokeColor('#e2e8f0').lineWidth(1).stroke();

doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Total:', labelX, totalY + 54);
doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('$135.00', valueX, totalY + 54, { width: 75, align: 'right' });

doc.font('Helvetica').fontSize(10).fillColor('#059669').text('Amount Paid:', labelX, totalY + 72);
doc.font('Helvetica-Bold').fontSize(10).fillColor('#059669').text('-$135.00', valueX, totalY + 72, { width: 75, align: 'right' });

doc.moveTo(labelX, totalY + 88).lineTo(572, totalY + 88).strokeColor('#059669').lineWidth(1.5).stroke();

doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Amount Remaining:', labelX, totalY + 94);
doc.font('Helvetica-Bold').fontSize(12).fillColor('#059669').text('$0.00', valueX, totalY + 94, { width: 75, align: 'right' });

// --- Memo & Notes ---
const memoY = totalY + 125;
doc.rect(40, memoY, 532, 55).fill('#f1f5f9');
doc.rect(40, memoY, 532, 55).stroke('#cbd5e1');

doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('MEMO & PAYMENT NOTES', 52, memoY + 10);
doc.font('Helvetica').fontSize(8.5).fillColor('#334155')
   .text('Bank transfer payments are accepted using the details provided below.', 52, memoY + 24)
   .text('If you have any questions regarding this invoice, please contact us at dispatch@shippingwish.com or +1 (917) 737-0021.', 52, memoY + 36);

// --- Footer Signature Line ---
const footY = memoY + 75;
doc.moveTo(40, footY).lineTo(572, footY).strokeColor('#e2e8f0').lineWidth(1).stroke();

doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('Shipping Wish LLC — Accounts Receivable & Verification Department', 40, footY + 10);
doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text('Official Payoneer & Stripe Verification Document | Registered Corporate Address: 19266 Coastal Hwy, Rehoboth, DE 19971 US', 40, footY + 22);

doc.end();

stream.on('finish', () => {
  console.log('PDF Invoice generated successfully at: ' + pdfPath);
});
