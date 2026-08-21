const express = require('express');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const PUBLIC_INVOICE_DIR = path.join(__dirname, '..', 'public', 'invoices');
if (!fs.existsSync(PUBLIC_INVOICE_DIR)) fs.mkdirSync(PUBLIC_INVOICE_DIR, { recursive: true });

function generateInvoiceHtml({ invoiceNumber, clientName, clientEmail, clientPhone, clientAddress, description, amount, status, issueDate, dueDate, memo }) {
  const isPaid = status === 'paid';
  const paidBadge = isPaid ? '<div class="paid-stamp">PAID IN FULL</div>' : '<div class="paid-stamp" style="background:#d97706;">PAYMENT DUE</div>';
  const amountPaidStr = isPaid ? `-$${parseFloat(amount).toFixed(2)}` : '$0.00';
  const amountRemainingStr = isPaid ? '$0.00' : `$${parseFloat(amount).toFixed(2)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice ${invoiceNumber} | Shipping Wish LLC</title>
<style>
  @media print { .no-print { display: none !important; } body { background: #fff !important; padding: 0 !important; } .invoice-card { box-shadow: none !important; border: none !important; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; line-height: 1.5; padding: 40px 20px; }
  .action-bar { max-width: 800px; margin: 0 auto 20px; display: flex; justify-content: space-between; align-items: center; }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #059669; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; }
  .btn:hover { background: #047857; }
  .btn-outline { background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; }
  .btn-outline:hover { background: #f8fafc; }
  .invoice-card { max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08); overflow: hidden; }
  .invoice-header { background: #0f172a; color: #ffffff; padding: 32px 40px; display: flex; justify-content: space-between; align-items: flex-start; }
  .brand-name { font-size: 24px; font-weight: 800; color: #f59e0b; letter-spacing: -0.5px; }
  .brand-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .brand-contact { font-size: 11px; color: #cbd5e1; margin-top: 8px; }
  .paid-stamp { background: #059669; color: #ffffff; padding: 8px 18px; border-radius: 6px; font-weight: 800; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; }
  .invoice-body { padding: 40px; }
  .invoice-title-row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px; }
  .invoice-title { font-size: 22px; font-weight: 800; color: #0f172a; }
  .invoice-meta { font-size: 13px; color: #64748b; text-align: right; }
  .cols-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 28px; }
  .col-box h4 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; }
  .col-box p { font-size: 13px; color: #334155; line-height: 1.6; }
  .col-box p.comp-name { font-weight: 700; color: #0f172a; font-size: 14px; }
  .meta-grid { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
  .meta-item .lbl { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .meta-item .val { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  .items-table th { background: #0f172a; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 16px; text-align: left; }
  .items-table td { padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .totals-section { display: flex; justify-content: flex-end; margin-bottom: 32px; }
  .totals-table { width: 320px; border-collapse: collapse; }
  .totals-table td { padding: 8px 0; font-size: 13px; color: #475569; }
  .totals-table tr.grand-total td { border-top: 2px solid #e2e8f0; border-bottom: 2px solid #059669; padding: 12px 0; font-size: 16px; font-weight: 800; color: #0f172a; }
  .memo-box { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px 20px; margin-bottom: 32px; }
  .memo-box h5 { font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 6px; }
  .memo-box p { font-size: 12px; color: #334155; }
  .invoice-footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
<div class="action-bar no-print">
  <a href="/invoices/Invoice_${invoiceNumber}.pdf" class="btn" download>📥 Download Vector PDF File</a>
  <button class="btn btn-outline" onclick="window.print()">🖨️ Print / Save PDF</button>
</div>
<div class="invoice-card">
  <div class="invoice-header">
    <div>
      <div class="brand-name">SHIPPING WISH LLC</div>
      <div class="brand-sub">Premier US Freight Dispatch &amp; Enterprise Logistics Conglomerate</div>
      <div class="brand-contact">19266 Coastal Hwy, Rehoboth, DE 19971, USA | +1 917 737 0021 | billing@shippingwish.com | www.shippingwish.com</div>
    </div>
    ${paidBadge}
  </div>
  <div class="invoice-body">
    <div class="invoice-title-row">
      <div>
        <div class="invoice-title">INVOICE SUMMARY</div>
        <span style="font-size:13px;color:#64748b;">Official Shipping Wish LLC Corporate Invoice</span>
      </div>
      <div class="invoice-meta">
        <strong>Invoice Number:</strong> ${invoiceNumber}<br>
        <strong>Issue Date:</strong> ${issueDate}<br>
        <strong>Due Date:</strong> ${dueDate}
      </div>
    </div>
    <div class="cols-grid">
      <div class="col-box">
        <h4>ISSUED BY (SERVICE PROVIDER)</h4>
        <p class="comp-name">Shipping Wish LLC</p>
        <p>19266 Coastal Hwy<br>Rehoboth, DE 19971, USA<br>Phone: +1 917 737 0021<br>Email: billing@shippingwish.com<br>Web: www.shippingwish.com</p>
      </div>
      <div class="col-box">
        <h4>BILLED TO (CLIENT)</h4>
        <p class="comp-name" style="color:#2563eb;">${clientName}</p>
        <p>${clientAddress || ''}<br>Phone: ${clientPhone || 'N/A'}<br>Email: ${clientEmail || 'N/A'}</p>
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><div class="lbl">Currency</div><div class="val">USD - US Dollar</div></div>
      <div class="meta-item"><div class="lbl">Billing Method</div><div class="val">Send invoice</div></div>
      <div class="meta-item"><div class="lbl">Tax Calculation</div><div class="val" style="color:#059669;">No tax rate applied (Tax Exempt)</div></div>
    </div>
    <table class="items-table">
      <thead><tr><th>Description</th><th class="text-center">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Amount</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>${description || 'Dispatch fee'}</strong><br><span style="font-size:12px;color:#64748b;">US Freight Dispatching &amp; Carrier Support Services</span></td>
          <td class="text-center">1</td>
          <td class="text-right">$${parseFloat(amount).toFixed(2)}</td>
          <td class="text-right"><strong>$${parseFloat(amount).toFixed(2)}</strong></td>
        </tr>
      </tbody>
    </table>
    <div class="totals-section">
      <table class="totals-table">
        <tr><td>Subtotal:</td><td class="text-right">$${parseFloat(amount).toFixed(2)}</td></tr>
        <tr><td>Total excluding tax:</td><td class="text-right">$${parseFloat(amount).toFixed(2)}</td></tr>
        <tr><td>Customer is tax exempt:</td><td class="text-right">-</td></tr>
        <tr style="border-top:1px solid #e2e8f0;font-weight:700;color:#0f172a;"><td>Total:</td><td class="text-right">$${parseFloat(amount).toFixed(2)}</td></tr>
        <tr style="color:#059669;font-weight:700;"><td>Amount Paid:</td><td class="text-right">${amountPaidStr}</td></tr>
        <tr class="grand-total"><td>Amount Remaining:</td><td class="text-right" style="color:#059669;">${amountRemainingStr}</td></tr>
      </table>
    </div>
    <div class="memo-box">
      <h5>Memo &amp; Payment Notes</h5>
      <p>${memo || 'Bank transfer payments are accepted using the details provided below.'}</p>
      <p style="margin-top:4px;">If you have any questions regarding this invoice, please contact us at billing@shippingwish.com or +1 917 737 0021.</p>
    </div>
    <div class="invoice-footer">
      <strong>Shipping Wish LLC — Corporate Accounts Receivable &amp; Verification Department</strong><br>
      Official Verification Document | Registered Address: 19266 Coastal Hwy, Rehoboth, DE 19971 US
    </div>
  </div>
</div>
</body>
</html>`;
}

function generateInvoicePdf({ invoiceNumber, clientName, clientEmail, clientPhone, clientAddress, description, amount, status, issueDate, dueDate, memo }) {
  return new Promise((resolve, reject) => {
    const filename = `Invoice_${invoiceNumber}.pdf`;
    const filepath = path.join(PUBLIC_INVOICE_DIR, filename);
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const isPaid = status === 'paid';
    const numAmount = parseFloat(amount || 0);

    // Header Banner
    doc.rect(0, 0, 612, 110).fill('#0f172a');
    doc.fillColor('#f59e0b').font('Helvetica-Bold').fontSize(24).text('SHIPPING WISH LLC', 40, 30);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(10).text('Premier US Freight Dispatch & Enterprise Logistics Conglomerate', 40, 58);
    doc.fillColor('#ffffff').fontSize(9).text('www.shippingwish.com | billing@shippingwish.com | +1 917 737 0021', 40, 74);

    // Badge
    doc.save();
    doc.roundedRect(440, 30, 132, 36, 6).fill(isPaid ? '#059669' : '#d97706');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13).text(isPaid ? 'PAID IN FULL' : 'PAYMENT DUE', 450, 41, { width: 112, align: 'center' });
    doc.restore();

    // Title
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text('INVOICE', 40, 130);
    doc.fillColor('#64748b').font('Helvetica').fontSize(10).text(`Invoice Number: ${invoiceNumber}`, 40, 152);
    doc.text(`Issue Date: ${issueDate} | Due Date: ${dueDate}`, 40, 166);

    doc.moveTo(40, 185).lineTo(572, 185).strokeColor('#e2e8f0').lineWidth(1).stroke();

    const colY = 200;

    // Seller
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('ISSUED BY:', 40, colY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Shipping Wish LLC', 40, colY + 16);
    doc.font('Helvetica').fontSize(9).fillColor('#475569')
       .text('19266 Coastal Hwy', 40, colY + 30)
       .text('Rehoboth, DE 19971, USA', 40, colY + 42)
       .text('Phone: +1 917 737 0021', 40, colY + 54)
       .text('Email: billing@shippingwish.com', 40, colY + 66)
       .text('Web: www.shippingwish.com', 40, colY + 78);

    // Customer
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('BILLED TO:', 320, colY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#2563eb').text(clientName || 'Valued Client', 320, colY + 16);
    doc.font('Helvetica').fontSize(9).fillColor('#475569')
       .text(clientAddress || 'USA', 320, colY + 30)
       .text(`Phone: ${clientPhone || 'N/A'}`, 320, colY + 42)
       .text(`Email: ${clientEmail || 'N/A'}`, 320, colY + 54);

    // Meta Grid Box
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

    // Table Header
    const tableY = colY + 165;
    doc.rect(40, tableY, 532, 26).fill('#0f172a');

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
       .text('DESCRIPTION', 52, tableY + 8)
       .text('QTY', 340, tableY + 8, { width: 50, align: 'center' })
       .text('UNIT PRICE', 400, tableY + 8, { width: 70, align: 'right' })
       .text('AMOUNT', 485, tableY + 8, { width: 75, align: 'right' });

    // Table Row
    const rowY = tableY + 26;
    doc.rect(40, rowY, 532, 32).fill('#ffffff');
    doc.rect(40, rowY, 532, 32).stroke('#e2e8f0');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
       .text(description || 'Dispatch fee', 52, rowY + 10);
    doc.font('Helvetica').fontSize(9).fillColor('#475569')
       .text('1', 340, rowY + 10, { width: 50, align: 'center' })
       .text(`$${numAmount.toFixed(2)}`, 400, rowY + 10, { width: 70, align: 'right' })
       .font('Helvetica-Bold').fillColor('#0f172a')
       .text(`$${numAmount.toFixed(2)}`, 485, rowY + 10, { width: 75, align: 'right' });

    // Totals
    const totalY = rowY + 45;
    const labelX = 360;
    const valueX = 485;

    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Subtotal:', labelX, totalY);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text(`$${numAmount.toFixed(2)}`, valueX, totalY, { width: 75, align: 'right' });

    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Total excluding tax:', labelX, totalY + 16);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text(`$${numAmount.toFixed(2)}`, valueX, totalY + 16, { width: 75, align: 'right' });

    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Customer is tax exempt:', labelX, totalY + 32);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text('-', valueX, totalY + 32, { width: 75, align: 'right' });

    doc.moveTo(labelX, totalY + 48).lineTo(572, totalY + 48).strokeColor('#e2e8f0').lineWidth(1).stroke();

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Total:', labelX, totalY + 54);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(`$${numAmount.toFixed(2)}`, valueX, totalY + 54, { width: 75, align: 'right' });

    doc.font('Helvetica').fontSize(10).fillColor('#059669').text('Amount Paid:', labelX, totalY + 72);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#059669').text(isPaid ? `-$${numAmount.toFixed(2)}` : '$0.00', valueX, totalY + 72, { width: 75, align: 'right' });

    doc.moveTo(labelX, totalY + 88).lineTo(572, totalY + 88).strokeColor('#059669').lineWidth(1.5).stroke();

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Amount Remaining:', labelX, totalY + 94);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#059669').text(isPaid ? '$0.00' : `$${numAmount.toFixed(2)}`, valueX, totalY + 94, { width: 75, align: 'right' });

    // Memo
    const memoY = totalY + 125;
    doc.rect(40, memoY, 532, 55).fill('#f1f5f9');
    doc.rect(40, memoY, 532, 55).stroke('#cbd5e1');

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('MEMO & PAYMENT NOTES', 52, memoY + 10);
    doc.font('Helvetica').fontSize(8.5).fillColor('#334155')
       .text(memo || 'Bank transfer payments are accepted using the details provided below.', 52, memoY + 24)
       .text('If you have any questions regarding this invoice, please contact us at billing@shippingwish.com or +1 917 737 0021.', 52, memoY + 36);

    // Footer Signature
    const footY = memoY + 75;
    doc.moveTo(40, footY).lineTo(572, footY).strokeColor('#e2e8f0').lineWidth(1).stroke();

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('Shipping Wish LLC — Accounts Receivable & Verification Department', 40, footY + 10);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text('Official Verification Document | Registered Corporate Address: 19266 Coastal Hwy, Rehoboth, DE 19971 US', 40, footY + 22);

    doc.end();
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}

// Generate invoice for a load — dispatcher, admin, super_admin
router.post('/', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { loadId, factoringStatus } = req.body;
  if (!loadId) return res.status(400).json({ error: 'loadId is required.' });

  try {
    const loadResult = await pool.query(
      `SELECT l.*,
              u.name AS carrier_name, u.company_name AS carrier_company, u.phone AS carrier_phone, u.mc_number,
              dr.name AS driver_name, t.truck_number
       FROM loads l
       JOIN users u ON u.id = l.carrier_id
       LEFT JOIN drivers dr ON dr.id = l.driver_id
       LEFT JOIN trucks t ON t.id = l.truck_id
       WHERE l.id = $1`,
      [loadId]
    );
    if (!loadResult.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadResult.rows[0];

    const existing = await pool.query('SELECT id FROM invoices WHERE load_id = $1', [loadId]);
    if (existing.rows.length) return res.status(409).json({ error: 'An invoice already exists for this load.' });

    // Fetch approved accessorials
    const accResult = await pool.query('SELECT * FROM load_accessorials WHERE load_id = $1 AND approved = true', [loadId]);
    const accessorials = accResult.rows;

    const freightAmount = parseFloat(load.rate || 0);
    const accessorialAmount = accessorials.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
    const totalAmount = freightAmount + accessorialAmount;

    const invoiceNumber = `INV-${load.load_number}`;
    const issueDate = new Date().toISOString().slice(0, 10);
    const dueDate = issueDate;
    const factOpt = factoringStatus || 'direct_pay';

    const htmlContent = generateInvoiceHtml({
      invoiceNumber,
      clientName: load.carrier_company || load.carrier_name,
      clientEmail: load.carrier_email || 'billing@shippingwish.com',
      clientPhone: load.carrier_phone || 'N/A',
      clientAddress: `${load.pickup_location || ''} ➔ ${load.delivery_location || ''}`,
      description: `Dispatch fee for Load #${load.load_number}`,
      amount: totalAmount,
      status: 'unpaid',
      issueDate,
      dueDate,
      memo: `Freight Dispatch Services for Load #${load.load_number}.`
    });
    fs.writeFileSync(path.join(PUBLIC_INVOICE_DIR, `${invoiceNumber}.html`), htmlContent);

    const pdfFilename = await generateInvoicePdf({
      invoiceNumber,
      clientName: load.carrier_company || load.carrier_name,
      clientEmail: load.carrier_email || 'billing@shippingwish.com',
      clientPhone: load.carrier_phone || 'N/A',
      clientAddress: `${load.pickup_location || ''} ➔ ${load.delivery_location || ''}`,
      description: `Dispatch fee for Load #${load.load_number}`,
      amount: totalAmount,
      status: 'unpaid',
      issueDate,
      dueDate,
      memo: `Freight Dispatch Services for Load #${load.load_number}.`
    });

    const insert = await pool.query(
      `INSERT INTO invoices (load_id, invoice_number, amount, freight_amount, accessorial_amount, total_amount, status, factoring_status, issued_date, pdf_filename)
       VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', $7, $8, $9) RETURNING id`,
      [loadId, invoiceNumber, totalAmount, freightAmount, accessorialAmount, totalAmount, factOpt, issueDate, pdfFilename]
    );

    await pool.query(`UPDATE loads SET status = 'invoiced', updated_at = now() WHERE id = $1`, [loadId]);
    await pool.query(
      `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'invoiced', $2, 'Freight invoice generated')`,
      [loadId, req.user.id]
    );

    res.json({ ok: true, id: insert.rows[0].id, invoiceNumber, totalAmount });
  } catch (err) {
    console.error('Generate invoice error:', err);
    res.status(500).json({ error: 'Could not generate invoice.' });
  }
});

// List invoices
router.get('/', requireAuth, async (req, res) => {
  try {
    let query, params;
    const { status, carrierId } = req.query;

    if (req.user.role === 'carrier') {
      params = [req.user.id];
      query = `
        SELECT i.*, l.load_number, l.pickup_location, l.delivery_location, l.broker_name
        FROM invoices i
        JOIN loads l ON l.id = i.load_id
        WHERE l.carrier_id = $1 ${status ? 'AND i.status = $2' : ''}
        ORDER BY i.created_at DESC`;
      if (status) params.push(status);
    } else {
      params = [];
      query = `
        SELECT i.*, l.load_number, l.pickup_location, l.delivery_location, l.broker_name,
               u.name AS carrier_name, u.company_name AS carrier_company
        FROM invoices i
        JOIN loads l ON l.id = i.load_id
        JOIN users u ON u.id = l.carrier_id
        WHERE 1=1`;
      
      if (status) {
        params.push(status);
        query += ` AND i.status = $${params.length}`;
      }
      if (carrierId) {
        params.push(carrierId);
        query += ` AND l.carrier_id = $${params.length}`;
      }
      query += ` ORDER BY i.created_at DESC`;
    }

    const result = await pool.query(query, params);
    res.json({ invoices: result.rows });
  } catch (err) {
    console.error('List invoices error:', err);
    res.status(500).json({ error: 'Could not load invoices.' });
  }
});

// Update paid / pending status — dispatcher, admin, super_admin
router.patch('/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { status } = req.body; // 'paid' or 'unpaid'
  if (!['paid', 'unpaid', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  try {
    const paidDate = status === 'paid' ? new Date().toISOString().slice(0, 10) : null;
    const result = await pool.query(
      'UPDATE invoices SET status = $1, paid_date = $2 WHERE id = $3 RETURNING load_id',
      [status, paidDate, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found.' });

    if (status === 'paid') {
      await pool.query(`UPDATE loads SET status = 'paid', updated_at = now() WHERE id = $1`, [result.rows[0].load_id]);
      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'paid', $2, 'Invoice marked paid')`,
        [result.rows[0].load_id, req.user.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Update invoice error:', err);
    res.status(500).json({ error: 'Could not update invoice.' });
  }
});

// Download PDF
router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, l.carrier_id FROM invoices i JOIN loads l ON l.id = i.load_id WHERE i.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found.' });
    const inv = result.rows[0];

    if (req.user.role === 'carrier' && inv.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this invoice.' });
    }

    const filepath = path.join(PDF_DIR, inv.pdf_filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'PDF file not found.' });

    res.download(filepath, inv.pdf_filename);
  } catch (err) {
    console.error('Download invoice error:', err);
    res.status(500).json({ error: 'Could not download invoice.' });
  }
});

// STRIPE INTEGRATION: Send Official Stripe Invoice to Customer Email
router.post('/:id/send-stripe', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { recipientEmail } = req.body;
  try {
    const invRes = await pool.query(
      `SELECT i.*, l.load_number, l.pickup_location, l.delivery_location, l.broker_name,
              u.name AS carrier_name, u.company_name AS carrier_company, u.email AS carrier_email
       FROM invoices i
       JOIN loads l ON l.id = i.load_id
       JOIN users u ON u.id = l.carrier_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice not found.' });
    const inv = invRes.rows[0];

    const targetEmail = recipientEmail || inv.carrier_email || 'billing@shippingwish.com';

    // If Stripe Secret Key is present, trigger real Stripe API Call
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      
      // 1. Create or retrieve Stripe Customer
      let customer;
      const customers = await stripe.customers.list({ email: targetEmail, limit: 1 });
      if (customers.data.length) {
        customer = customers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: targetEmail,
          name: inv.carrier_company || inv.carrier_name,
          description: `Customer for Freight Load ${inv.load_number}`
        });
      }

      // 2. Create Stripe Invoice Item
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: Math.round(parseFloat(inv.total_amount) * 100), // convert to cents
        currency: 'usd',
        description: `Shipping Wish Freight Invoice #${inv.invoice_number} (Load ${inv.load_number}: ${inv.pickup_location} ➔ ${inv.delivery_location})`
      });

      // 3. Create & Send Stripe Invoice
      const stripeInv = await stripe.invoices.create({
        customer: customer.id,
        auto_advance: true,
        collection_method: 'send_invoice',
        days_until_due: 7,
        description: `Freight Invoice for Load #${inv.load_number}`
      });

      const finalizedInv = await stripe.invoices.finalizeInvoice(stripeInv.id);
      await stripe.invoices.sendInvoice(finalizedInv.id);

      await pool.query(
        'UPDATE invoices SET stripe_invoice_id = $1, stripe_hosted_url = $2 WHERE id = $3',
        [finalizedInv.id, finalizedInv.hosted_invoice_url, req.params.id]
      );

      return res.json({
        ok: true,
        message: `Official Stripe Invoice sent directly to ${targetEmail}!`,
        stripe_invoice_id: finalizedInv.id,
        hosted_url: finalizedInv.hosted_invoice_url
      });
    }

    // Fallback simulation when STRIPE_SECRET_KEY is not yet set in .env
    const mockStripeId = `in_stripe_${Date.now()}`;
    const mockHostedUrl = `https://invoice.stripe.com/i/acct_simulated/${mockStripeId}`;
    await pool.query(
      'UPDATE invoices SET stripe_invoice_id = $1, stripe_hosted_url = $2 WHERE id = $3',
      [mockStripeId, mockHostedUrl, req.params.id]
    );

    res.json({
      ok: true,
      simulated: true,
      message: `Stripe Integration ready! Invoice #${inv.invoice_number} prepared for ${targetEmail}. Add STRIPE_SECRET_KEY in .env to send real emails via Stripe API.`,
      stripe_invoice_id: mockStripeId,
      hosted_url: mockHostedUrl
    });
  } catch (err) {
    console.error('Stripe send error:', err);
    res.status(500).json({ error: 'Could not send Stripe invoice.' });
  }
});

// STRIPE WEBHOOK: Auto-mark paid on Stripe Invoice Payment
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = req.body;
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const stripeInvId = invoice.id;
      const invRes = await pool.query('SELECT id, load_id FROM invoices WHERE stripe_invoice_id = $1', [stripeInvId]);
      if (invRes.rows.length) {
        const inv = invRes.rows[0];
        const paidDate = new Date().toISOString().slice(0, 10);
        await pool.query('UPDATE invoices SET status = \'paid\', paid_date = $1 WHERE id = $2', [paidDate, inv.id]);
        await pool.query('UPDATE loads SET status = \'paid\', updated_at = now() WHERE id = $1', [inv.load_id]);
      }
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
// Custom Invoice Generation Endpoint for Admins & Dispatchers
router.post('/create-custom', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { clientName, clientEmail, clientPhone, clientAddress, description, amount, status, memo, dueDate } = req.body;

  if (!clientName || !amount) {
    return res.status(400).json({ error: 'Client Name and Amount are required.' });
  }

  const invoiceNumber = `SW-${Math.floor(100000 + Math.random() * 900000)}`;
  const issueDate = new Date().toISOString().slice(0, 10);
  const due = dueDate || issueDate;
  const currentStatus = status || 'unpaid';

  try {
    const htmlContent = generateInvoiceHtml({
      invoiceNumber, clientName, clientEmail, clientPhone, clientAddress, description, amount, status: currentStatus, issueDate, dueDate: due, memo
    });
    fs.writeFileSync(path.join(PUBLIC_INVOICE_DIR, `${invoiceNumber}.html`), htmlContent);

    const pdfFilename = await generateInvoicePdf({
      invoiceNumber, clientName, clientEmail, clientPhone, clientAddress, description, amount, status: currentStatus, issueDate, dueDate: due, memo
    });

    res.json({
      ok: true,
      invoiceNumber,
      amount: parseFloat(amount).toFixed(2),
      htmlUrl: `/invoices/${invoiceNumber}.html`,
      pdfUrl: `/invoices/${pdfFilename}`
    });
  } catch (err) {
    console.error('Custom invoice error:', err);
    res.status(500).json({ error: 'Failed to generate custom invoice.' });
  }
});

module.exports = router;
