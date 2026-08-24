const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const PUBLIC_INVOICE_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'invoices') : path.join(__dirname, '..', 'public', 'invoices');
try {
  if (!fs.existsSync(PUBLIC_INVOICE_DIR)) fs.mkdirSync(PUBLIC_INVOICE_DIR, { recursive: true });
} catch (e) {
  console.warn('[WARN] Could not create invoices directory:', e.message);
}

// ============================================================
// BATCH WEEKLY INVOICE GENERATOR - HTML
// Carrier pays US a commission % on TOTAL of all loads in period
// ============================================================
function generateBatchInvoiceHtml({ invoiceNumber, periodLabel, carrierName, carrierCompany, carrierPhone, carrierEmail, carrierMc, loads, feePercent, status, issueDate, dueDate, billingNotes, equipLabel }) {
  const isPaid     = status === 'paid';
  const grossTotal = loads.reduce((s, l) => s + parseFloat(l.rate || 0), 0);
  const commAmt    = parseFloat(((grossTotal * feePercent) / 100).toFixed(2));
  const carrierPay = parseFloat((grossTotal - commAmt).toFixed(2));
  const badge      = isPaid ? '<div class="badge paid">&#x2713; PAID IN FULL</div>' : '<div class="badge due">&#x26A1; PAYMENT DUE</div>';
  const loadRows   = loads.map((l, i) => `<tr class="${i%2===0?'row-even':'row-odd'}"><td><strong>${l.load_number}</strong></td><td>${(l.pickup_date||'').toString().slice(0,10)}</td><td>${l.pickup_location||'-'}</td><td>${l.delivery_location||'-'}</td><td>${l.broker_name||'-'}</td><td>${l.equipment_type||'-'}</td><td class="amt">$${parseFloat(l.rate||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Invoice ${invoiceNumber} | Shipping Wish LLC</title>
<style>
@media print{.no-print{display:none!important}body{background:#fff!important;padding:0!important}.card{box-shadow:none!important}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#0f172a;padding:32px 16px}
.topbar{max-width:880px;margin:0 auto 16px;display:flex;gap:10px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:#059669;color:#fff;font-weight:700;font-size:13px;border:none;border-radius:6px;cursor:pointer;text-decoration:none}
.btn:hover{background:#047857}.btn-out{background:#fff;color:#0f172a;border:1px solid #cbd5e1}.btn-out:hover{background:#f8fafc}
.card{max-width:880px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(15,23,42,.1);overflow:hidden}
.inv-header{background:#0f172a;padding:28px 40px;display:flex;justify-content:space-between;align-items:flex-start}
.brand{color:#f59e0b;font-size:22px;font-weight:800}.brand-sub{color:#94a3b8;font-size:11px;margin-top:4px}.brand-contact{color:#cbd5e1;font-size:10px;margin-top:8px;line-height:1.7}
.badge{padding:9px 20px;border-radius:8px;font-weight:800;font-size:13px;letter-spacing:.5px}.badge.paid{background:#059669;color:#fff}.badge.due{background:#f59e0b;color:#0f172a}
.body{padding:36px 40px}
.title-row{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #f1f5f9;padding-bottom:18px;margin-bottom:24px}
.inv-title{font-size:20px;font-weight:800}.inv-subtitle{color:#64748b;font-size:12px;margin-top:3px}
.period-badge{display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;margin-top:8px}
.inv-meta{text-align:right;font-size:12px;color:#475569;line-height:2}.inv-meta strong{color:#0f172a}
.bill-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
.bill-box h4{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:8px}
.bill-box .name{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:4px}.bill-box .bname{color:#2563eb}
.bill-box p{font-size:12px;color:#475569;line-height:1.8}
.mc-badge{display:inline-block;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;margin-top:2px}
.meta-bar{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:28px}
.meta-cell{padding:12px 16px;border-right:1px solid #e2e8f0}.meta-cell:last-child{border-right:none}
.meta-cell .lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:3px}
.meta-cell .val{font-size:12px;font-weight:700;color:#0f172a}
.section-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:10px}
.loads-table{width:100%;border-collapse:collapse;margin-bottom:0;font-size:12px}
.loads-table thead tr{background:#0f172a}.loads-table thead th{padding:10px 12px;color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;text-align:left}
.loads-table th.amt,.loads-table td.amt{text-align:right}
.row-even{background:#fff}.row-odd{background:#f8fafc}
.loads-table tbody td{padding:11px 12px;border-bottom:1px solid #e2e8f0;color:#334155}
.loads-table tbody tr:last-child td{border-bottom:none}
.totals-wrap{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-top:0}
.tot-table{width:100%;border-collapse:collapse}
.tot-table td{padding:12px 20px;font-size:13px;border-bottom:1px solid #e2e8f0;color:#475569}
.tot-table td:last-child{text-align:right;font-weight:700;color:#0f172a}
.tot-table .comm td{background:#fffbeb;color:#92400e;border-color:#fde68a}.tot-table .comm td:last-child{color:#b45309;font-size:15px}
.tot-table .cpay td{background:#f0fdf4;color:#166534;border-color:#bbf7d0}.tot-table .cpay td:last-child{color:#15803d}
.tot-table .grand td{background:#0f172a;color:#fff;font-size:15px;font-weight:800;border:none}.tot-table .grand td:last-child{color:#f59e0b;font-size:18px}
.memo{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px 20px;margin-top:24px}
.memo h5{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:6px}.memo p{font-size:12px;color:#334155;line-height:1.7}
.inv-footer{border-top:1px solid #e2e8f0;margin-top:24px;padding-top:16px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.8}.inv-footer strong{color:#475569}
</style></head><body>
<div class="topbar no-print">
  <a href="/invoices/Invoice_${invoiceNumber}.pdf" class="btn" download>&#x1F4E5; Download PDF</a>
  <button class="btn btn-out" onclick="window.print()">&#x1F5A8;&#xFE0F; Print Invoice</button>
</div>
<div class="card">
  <div class="inv-header">
    <div>
      <div class="brand">SHIPPING WISH LLC</div>
      <div class="brand-sub">Premier US Freight Dispatch &amp; Enterprise Logistics</div>
      <div class="brand-contact">19266 Coastal Hwy, Rehoboth, DE 19971, USA | +1 (917) 737-0021 | dispatch@shippingwish.com | www.shippingwish.com</div>
    </div>
    ${badge}
  </div>
  <div class="body">
    <div class="title-row">
      <div>
        <div class="inv-title">DISPATCH COMMISSION INVOICE</div>
        <div class="inv-subtitle">Official Shipping Wish LLC Billing Statement</div>
        <div class="period-badge">&#x1F4C5; Period: ${periodLabel}</div>
      </div>
      <div class="inv-meta">
        <strong>Invoice #:</strong> ${invoiceNumber}<br>
        <strong>Issue Date:</strong> ${issueDate}<br>
        <strong>Due Date:</strong> ${dueDate}
      </div>
    </div>
    <div class="bill-grid">
      <div class="bill-box">
        <h4>Issued By (Service Provider)</h4>
        <div class="name">Shipping Wish LLC</div>
        <p>19266 Coastal Hwy, Rehoboth, DE 19971<br>USA | LLC Registered, Delaware<br>Phone: +1 (917) 737-0021<br>Email: dispatch@shippingwish.com</p>
      </div>
      <div class="bill-box">
        <h4>Billed To (Carrier / Client)</h4>
        <div class="name bname">${carrierCompany || carrierName}</div>
        <p>Owner/Operator: ${carrierName}<br>Phone: ${carrierPhone || 'N/A'}<br>Email: ${carrierEmail || 'N/A'}<br>${carrierMc ? `<span class="mc-badge">MC# ${carrierMc}</span>` : ''}</p>
      </div>
    </div>
    <div class="meta-bar">
      <div class="meta-cell"><div class="lbl">Currency</div><div class="val">USD</div></div>
      <div class="meta-cell"><div class="lbl">Equipment</div><div class="val">${equipLabel}</div></div>
      <div class="meta-cell"><div class="lbl">Commission Rate</div><div class="val" style="color:#b45309">${feePercent}%</div></div>
      <div class="meta-cell"><div class="lbl">Tax</div><div class="val" style="color:#059669">Tax Exempt</div></div>
    </div>
    <div class="section-title">&#x1F4E6; Load Summary — All Dispatched Loads This Period</div>
    <table class="loads-table">
      <thead><tr><th>Load #</th><th>Pickup Date</th><th>Origin</th><th>Destination</th><th>Broker</th><th>Equipment</th><th class="amt">Gross Rate</th></tr></thead>
      <tbody>${loadRows}</tbody>
    </table>
    <div class="totals-wrap" style="margin-top:0;border-top:none;border-radius:0 0 8px 8px">
      <table class="tot-table">
        <tr><td>Total Loads: <strong>${loads.length}</strong></td><td>Gross Freight Total</td><td>$${grossTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
        <tr class="comm"><td colspan="2">&#x1F4B0; Dispatch Commission (${feePercent}% of $${grossTotal.toLocaleString('en-US',{minimumFractionDigits:2})}) — Amount Carrier Pays Shipping Wish</td><td>$${commAmt.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
        <tr class="cpay"><td colspan="2">&#x1F69B; Carrier Net Earnings (After ${feePercent}% Commission Deducted)</td><td>$${carrierPay.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
        <tr class="grand"><td colspan="2">&#x26A1; TOTAL AMOUNT DUE TO SHIPPING WISH LLC</td><td>$${commAmt.toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
      </table>
    </div>
    <div class="memo">
      <h5>&#x1F4DD; Memo &amp; Payment Instructions</h5>
      <p>${billingNotes || `Dispatch commission invoice covering ${loads.length} load(s) completed during the period: ${periodLabel}. Commission rate of ${feePercent}% applies to gross freight as per dispatch service agreement.`}</p>
      <p style="margin-top:6px">Please remit <strong>$${commAmt.toLocaleString('en-US',{minimumFractionDigits:2})}</strong> within 7 days. Contact: dispatch@shippingwish.com | +1 917 737 0021</p>
    </div>
    <div class="inv-footer">
      <strong>Shipping Wish LLC — Accounts Receivable &amp; Billing Department</strong><br>
      Official Dispatch Commission Invoice | LLC Registered in Delaware | 19266 Coastal Hwy, Rehoboth, DE 19971, USA
    </div>
  </div>
</div></body></html>`;
}

// ============================================================
// BATCH WEEKLY INVOICE - POST /api/invoices/batch
// Body: { carrierId, loadIds: [1,2,3], periodLabel: 'Aug 18-24 2026' }
// Dispatcher selects carrier + multiple delivered loads → system
// calculates total → applies carrier's commission % → generates invoice
// ============================================================
// Restrict invoice generation to Admin & Super Admin (Finance Dept only)
router.post('/batch', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const { carrierId, loadIds, periodLabel, dueDate } = req.body;
  if (!carrierId || !Array.isArray(loadIds) || loadIds.length === 0) {
    return res.status(400).json({ error: 'carrierId and loadIds[] are required.' });
  }

  try {
    // 1. Get carrier info + commission rate
    const carrierRes = await pool.query(
      `SELECT id, name, company_name, phone, email, mc_number,
              dispatch_fee_percent, equipment_category, billing_notes
       FROM users WHERE id = $1 AND role = 'carrier'`,
      [carrierId]
    );
    if (!carrierRes.rows.length) return res.status(404).json({ error: 'Carrier not found.' });
    const carrier = carrierRes.rows[0];

    // 2. Get all loads
    const loadsRes = await pool.query(
      `SELECT id, load_number, pickup_location, delivery_location, pickup_date, delivery_date,
              broker_name, equipment_type, rate, status, carrier_id
       FROM loads
       WHERE id = ANY($1::int[]) AND carrier_id = $2`,
      [loadIds, carrierId]
    );
    if (!loadsRes.rows.length) return res.status(404).json({ error: 'No loads found for this carrier.' });
    const loads = loadsRes.rows;

    // 3. Check none already invoiced
    const alreadyInvoiced = await pool.query(
      `SELECT load_id FROM invoices WHERE load_id = ANY($1::int[])`,
      [loadIds]
    );
    if (alreadyInvoiced.rows.length > 0) {
      const ids = alreadyInvoiced.rows.map(r => r.load_id).join(', ');
      return res.status(409).json({ error: `Loads already invoiced: ${ids}. Remove them from the batch.` });
    }

    const feePercent  = parseFloat(carrier.dispatch_fee_percent || 5.00);
    const grossTotal  = loads.reduce((s, l) => s + parseFloat(l.rate || 0), 0);
    const commAmt     = parseFloat(((grossTotal * feePercent) / 100).toFixed(2));
    const carrierPay  = parseFloat((grossTotal - commAmt).toFixed(2));
    const equipLabel  = { box_truck:'Box Truck', dry_van:'Dry Van (53ft)', reefer:'Refrigerated (Reefer)', flatbed:'Flatbed', other:'Other' }[carrier.equipment_category] || carrier.equipment_category || 'Dry Van';
    const period      = periodLabel || `${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})} Invoice`;
    const issueDate   = new Date().toISOString().slice(0, 10);
    const due         = dueDate || new Date(Date.now() + 7*86400000).toISOString().slice(0, 10);
    const invoiceNum  = `SW-COMM-${carrier.id}-${Date.now().toString().slice(-6)}`;

    const htmlData = {
      invoiceNumber: invoiceNum, periodLabel: period,
      carrierName: carrier.name, carrierCompany: carrier.company_name,
      carrierPhone: carrier.phone, carrierEmail: carrier.email, carrierMc: carrier.mc_number,
      loads, feePercent, status: 'unpaid', issueDate, dueDate: due,
      billingNotes: carrier.billing_notes, equipLabel
    };

    // 4. Generate HTML
    const htmlContent = generateBatchInvoiceHtml(htmlData);
    fs.writeFileSync(path.join(PUBLIC_INVOICE_DIR, `${invoiceNum}.html`), htmlContent);

    // 5. Generate PDF using PDFKit (simplified for batch)
    const pdfFilename = await new Promise((resolve, reject) => {
      const fname  = `Invoice_${invoiceNum}.pdf`;
      const fpath  = path.join(PUBLIC_INVOICE_DIR, fname);
      const PDFDocument = require('pdfkit');
      const doc    = new PDFDocument({ margin: 40, size: 'LETTER' });
      const stream = fs.createWriteStream(fpath);
      doc.pipe(stream);

      const L = 40, R = 572;
      // Header
      doc.rect(0, 0, 612, 108).fill('#0f172a');
      doc.fillColor('#f59e0b').font('Helvetica-Bold').fontSize(20).text('SHIPPING WISH LLC', L, 26);
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(9).text('Premier US Freight Dispatch & Enterprise Logistics', L, 50);
      doc.fillColor('#cbd5e1').fontSize(8).text('www.shippingwish.com | dispatch@shippingwish.com | +1 (917) 737-0021', L, 64);
      const bColor = '#f59e0b';
      doc.roundedRect(440, 26, 132, 32, 6).fill(bColor);
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('PAYMENT DUE', 440, 35, { width: 132, align: 'center' });

      let y = 122;
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16).text('DISPATCH COMMISSION INVOICE', L, y);
      doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Official Shipping Wish LLC Billing Statement', L, y + 18);
      doc.fillColor('#475569').fontSize(8.5)
         .text(`Invoice #: ${invoiceNum}`, 380, y, { width: 192, align: 'right' })
         .text(`Period: ${period}`, 380, y + 13, { width: 192, align: 'right' })
         .text(`Issue: ${issueDate}  Due: ${due}`, 380, y + 26, { width: 192, align: 'right' });

      doc.moveTo(L, y + 48).lineTo(R, y + 48).strokeColor('#e2e8f0').lineWidth(1).stroke();
      y += 62;

      // Bill to/from
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8').text('ISSUED BY', L, y);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Shipping Wish LLC', L, y + 12);
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text('19266 Coastal Hwy, Rehoboth, DE 19971 | dispatch@shippingwish.com', L, y + 24);

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8').text('BILLED TO (CARRIER)', 320, y);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#2563eb').text(carrier.company_name || carrier.name, 320, y + 12);
      doc.font('Helvetica').fontSize(8).fillColor('#475569')
         .text(`${carrier.name} | ${carrier.phone || 'N/A'}`, 320, y + 24)
         .text(`${carrier.email || 'N/A'}${carrier.mc_number ? ' | MC# ' + carrier.mc_number : ''}`, 320, y + 35);

      y += 58;
      // Meta bar
      doc.rect(L, y, 532, 28).fill('#f8fafc').stroke('#e2e8f0');
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#94a3b8')
         .text('EQUIPMENT', L+8, y+5).text('COMMISSION RATE', 200, y+5).text('TOTAL LOADS', 360, y+5).text('TAX', 480, y+5);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
         .text(equipLabel, L+8, y+15)
         .text(`${feePercent}%`, 200, y+15, { fillColor: '#b45309' });
      doc.fillColor('#b45309').text(`${feePercent}%`, 200, y+15);
      doc.fillColor('#0f172a').text(`${loads.length} Loads`, 360, y+15);
      doc.fillColor('#059669').text('Tax Exempt', 480, y+15);
      y += 40;

      // Table header
      doc.rect(L, y, 532, 20).fill('#0f172a');
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
         .text('LOAD #', L+4, y+6, { width: 65 })
         .text('DATE', L+70, y+6, { width: 52 })
         .text('ORIGIN', L+124, y+6, { width: 90 })
         .text('DESTINATION', L+216, y+6, { width: 90 })
         .text('BROKER', L+308, y+6, { width: 90 })
         .text('GROSS RATE', L+400, y+6, { width: 120, align: 'right' });
      y += 20;

      loads.forEach((l, i) => {
        if (y > 680) { doc.addPage(); y = 40; }
        doc.rect(L, y, 532, 18).fill(i%2===0?'#ffffff':'#f8fafc').stroke('#e2e8f0');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(l.load_number||'-', L+4, y+5, { width: 65 });
        doc.font('Helvetica').fontSize(7).fillColor('#475569')
           .text((l.pickup_date||'').toString().slice(0,10), L+70, y+5, { width: 52 })
           .text((l.pickup_location||'-').slice(0,18), L+124, y+5, { width: 90 })
           .text((l.delivery_location||'-').slice(0,18), L+216, y+5, { width: 90 })
           .text((l.broker_name||'-').slice(0,18), L+308, y+5, { width: 90 });
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a')
           .text('$'+parseFloat(l.rate||0).toLocaleString('en-US',{minimumFractionDigits:2}), L+400, y+5, { width: 120, align: 'right' });
        y += 18;
      });

      y += 8;
      // Totals
      [
        { lbl: `Gross Freight Total (${loads.length} Loads)`, val: '$'+grossTotal.toLocaleString('en-US',{minimumFractionDigits:2}), bg:'#f8fafc', fc:'#0f172a' },
        { lbl: `Dispatch Commission ${feePercent}% — Payable to Shipping Wish LLC`, val: '$'+commAmt.toLocaleString('en-US',{minimumFractionDigits:2}), bg:'#fffbeb', fc:'#b45309' },
        { lbl: `Carrier Net Earnings After ${feePercent}% Commission`, val: '$'+carrierPay.toLocaleString('en-US',{minimumFractionDigits:2}), bg:'#f0fdf4', fc:'#15803d' },
      ].forEach(r => {
        doc.rect(L, y, 532, 20).fill(r.bg).stroke('#e2e8f0');
        doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(r.lbl, L+8, y+6, { width: 370 });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(r.fc).text(r.val, L+378, y+6, { width: 142, align: 'right' });
        y += 20;
      });
      // Grand total
      doc.rect(L, y, 532, 26).fill('#0f172a');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text('TOTAL AMOUNT DUE TO SHIPPING WISH LLC', L+8, y+8, { width: 350 });
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#f59e0b').text('$'+commAmt.toLocaleString('en-US',{minimumFractionDigits:2}), L+358, y+7, { width: 162, align: 'right' });
      y += 40;

      // Memo
      doc.rect(L, y, 532, 46).fill('#f1f5f9').stroke('#cbd5e1');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('MEMO & PAYMENT INSTRUCTIONS', L+8, y+7);
      doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
         .text(carrier.billing_notes || `Commission for ${loads.length} load(s) | Period: ${period} | Rate: ${feePercent}%`, L+8, y+20, { width: 510 })
         .text('Please remit within 7 days. Contact: dispatch@shippingwish.com | +1 (917) 737-0021', L+8, y+33, { width: 510 });
      y += 58;

      doc.moveTo(L, y).lineTo(R, y).strokeColor('#e2e8f0').lineWidth(1).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('Shipping Wish LLC — Accounts Receivable', L, y+8);
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text('Official Dispatch Commission Invoice | LLC Registered Delaware | 19266 Coastal Hwy, Rehoboth, DE 19971 USA', L, y+20);

      doc.end();
      stream.on('finish', () => resolve(fname));
      stream.on('error', reject);
    });

    // 6. Save to DB (one invoice record, stores all load IDs as JSON)
    const insert = await pool.query(
      `INSERT INTO invoices (
         load_id, invoice_number,
         amount, freight_amount, accessorial_amount, total_amount,
         status, factoring_status, issued_date, pdf_filename
       ) VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', 'direct_pay', $7, $8) RETURNING id`,
      [loads[0].id, invoiceNum, commAmt, grossTotal, 0, grossTotal, issueDate, pdfFilename]
    );

    // 7. Mark all loads as invoiced
    await pool.query(
      `UPDATE loads SET status = 'invoiced', updated_at = now() WHERE id = ANY($1::int[])`,
      [loadIds]
    );

    res.json({
      ok: true,
      invoiceNumber: invoiceNum,
      invoiceId: insert.rows[0].id,
      totalLoads: loads.length,
      grossTotal: grossTotal.toFixed(2),
      commissionPercent: feePercent,
      commissionAmount: commAmt.toFixed(2),
      carrierNetPay: carrierPay.toFixed(2),
      htmlUrl: `/invoices/${invoiceNum}.html`,
      pdfUrl: `/invoices/Invoice_${invoiceNum}.pdf`
    });
  } catch (err) {
    console.error('Batch invoice error:', err);
    res.status(500).json({ error: 'Could not generate batch invoice.' });
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

// Update paid / pending status â€” dispatcher, admin, super_admin
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

    const targetEmail = recipientEmail || inv.carrier_email || 'dispatch@shippingwish.com';

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
        description: `Shipping Wish Freight Invoice #${inv.invoice_number} (Load ${inv.load_number}: ${inv.pickup_location} âž” ${inv.delivery_location})`
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

