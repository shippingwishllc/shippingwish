// routes/settlements.js
// Unified USA Carrier Financial Suite:
//   1. Driver Pay Settlements (% of gross, per-mile, flat) + Branded PDF Statement
//   2. Per-Truck Profit & Loss (P&L) Analytics
//   3. 1-Click Carrier-to-Broker / Factoring Invoice Packet (Invoice + RateCon + POD + Detention PDF & Email)

const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');
const { analyzeLoadProfit } = require('../utils/profit-engine');
const { ensureUnifiedSchema, userCanAccessLoad } = require('../utils/load-lifecycle');

const router = express.Router();

let tablesEnsured = false;
async function ensureSettlementTables() {
  if (tablesEnsured) return;
  await ensureUnifiedSchema();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_settlements (
        id SERIAL PRIMARY KEY,
        settlement_number VARCHAR(50) UNIQUE NOT NULL,
        carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
        driver_name VARCHAR(150),
        truck_number VARCHAR(50),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        loads_count INTEGER DEFAULT 0,
        loaded_miles NUMERIC(10, 2) DEFAULT 0,
        empty_miles NUMERIC(10, 2) DEFAULT 0,
        gross_revenue NUMERIC(12, 2) DEFAULT 0,
        pay_type VARCHAR(20) DEFAULT 'percent',
        pay_rate NUMERIC(8, 2) DEFAULT 28.00,
        driver_gross_pay NUMERIC(12, 2) DEFAULT 0,
        fuel_deduction NUMERIC(12, 2) DEFAULT 0,
        advances_deduction NUMERIC(12, 2) DEFAULT 0,
        other_deductions NUMERIC(12, 2) DEFAULT 0,
        reimbursements NUMERIC(12, 2) DEFAULT 0,
        net_driver_pay NUMERIC(12, 2) DEFAULT 0,
        carrier_net_profit NUMERIC(12, 2) DEFAULT 0,
        load_ids_json JSONB DEFAULT '[]'::jsonb,
        notes TEXT,
        status VARCHAR(30) DEFAULT 'draft',
        paid_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS factoring_packets (
        id SERIAL PRIMARY KEY,
        packet_number VARCHAR(50) UNIQUE NOT NULL,
        load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
        carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recipient_type VARCHAR(30) DEFAULT 'broker',
        recipient_name VARCHAR(200),
        recipient_email VARCHAR(200),
        gross_rate NUMERIC(12, 2) DEFAULT 0,
        detention_amount NUMERIC(10, 2) DEFAULT 0,
        lumper_amount NUMERIC(10, 2) DEFAULT 0,
        other_accessorials NUMERIC(10, 2) DEFAULT 0,
        total_invoice_amount NUMERIC(12, 2) DEFAULT 0,
        included_doc_ids JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(30) DEFAULT 'sent',
        sent_at TIMESTAMP DEFAULT NOW(),
        due_date DATE,
        paid_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    tablesEnsured = true;
  } catch (err) {
    console.warn('[Settlements] Table ensure warning:', err.message);
  }
}

// =========================================================================
// 1. DRIVER SETTLEMENTS (List, Generate, Mark Paid, Branded PDF Stream)
// =========================================================================

router.get('/', requireAuth, async (req, res) => {
  await ensureSettlementTables();
  try {
    const isCarrier = ['carrier', 'carrier_admin'].includes(req.user.role);
    const params = [];
    let query = `
      SELECT s.*, u.company_name AS carrier_company
      FROM driver_settlements s
      LEFT JOIN users u ON u.id = s.carrier_id
      WHERE 1=1
    `;
    if (isCarrier) {
      params.push(req.user.id);
      query += ` AND s.carrier_id = $${params.length}`;
    } else if (req.query.carrierId) {
      params.push(parseInt(req.query.carrierId, 10));
      query += ` AND s.carrier_id = $${params.length}`;
    }
    query += ` ORDER BY s.period_end DESC, s.created_at DESC LIMIT 100`;
    const { rows } = await pool.query(query, params);
    res.json({ ok: true, settlements: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load driver settlements.' });
  }
});

router.post('/generate', requireAuth, requireRole('carrier', 'carrier_admin', 'dispatcher', 'admin', 'super_admin'), async (req, res) => {
  await ensureSettlementTables();
  try {
    const isCarrier = ['carrier', 'carrier_admin'].includes(req.user.role);
    const carrierId = isCarrier ? req.user.id : parseInt(req.body.carrierId || req.user.id, 10);
    const driverId = req.body.driverId ? parseInt(req.body.driverId, 10) : null;
    const periodStart = req.body.periodStart || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const periodEnd = req.body.periodEnd || new Date().toISOString().slice(0, 10);
    const payType = ['percent', 'per_mile', 'flat'].includes(req.body.payType) ? req.body.payType : 'percent';
    const payRate = Math.max(0, Number(req.body.payRate ?? (payType === 'per_mile' ? 0.65 : 28)));
    const fuelDeduction = Math.max(0, Number(req.body.fuelDeduction || 0));
    const advancesDeduction = Math.max(0, Number(req.body.advancesDeduction || 0));
    const otherDeductions = Math.max(0, Number(req.body.otherDeductions || 0));
    const reimbursements = Math.max(0, Number(req.body.reimbursements || 0));
    const notes = String(req.body.notes || '').trim();

    const params = [carrierId, periodStart, periodEnd];
    let loadSql = `
      SELECT l.id, l.load_number, l.pickup_location, l.delivery_location, l.miles, l.empty_miles,
             l.rate, l.detention_total, l.driver_name, l.truck_number, l.delivery_date, l.updated_at
      FROM loads l
      WHERE l.deleted_at IS NULL
        AND l.carrier_id = $1
        AND l.status IN ('delivered', 'pod_uploaded', 'invoiced', 'paid')
        AND COALESCE(l.delivery_date, l.updated_at::date) BETWEEN $2::date AND $3::date
    `;
    if (driverId) {
      params.push(driverId);
      loadSql += ` AND l.driver_id = $${params.length}`;
    }
    loadSql += ` ORDER BY COALESCE(l.delivery_date, l.updated_at::date) ASC`;
    const loadRes = await pool.query(loadSql, params);
    const loads = loadRes.rows;

    let driverName = String(req.body.driverName || '').trim();
    let truckNumber = String(req.body.truckNumber || '').trim();
    if (driverId && !driverName) {
      const dr = await pool.query('SELECT name FROM drivers WHERE id = $1', [driverId]).catch(() => ({ rows: [] }));
      if (dr.rows[0]) driverName = dr.rows[0].name;
    }
    if (!driverName && loads[0]?.driver_name) driverName = loads[0].driver_name;
    if (!truckNumber && loads[0]?.truck_number) truckNumber = loads[0].truck_number;

    const loadedMiles = loads.reduce((s, l) => s + Number(l.miles || 0), 0);
    const emptyMiles = loads.reduce((s, l) => s + Number(l.empty_miles || 0), 0);
    const grossRevenue = loads.reduce((s, l) => s + Number(l.rate || 0) + Number(l.detention_total || 0), 0);

    let driverGrossPay = 0;
    if (payType === 'percent') {
      driverGrossPay = Number(((grossRevenue * payRate) / 100).toFixed(2));
    } else if (payType === 'per_mile') {
      driverGrossPay = Number(((loadedMiles + emptyMiles) * payRate).toFixed(2));
    } else {
      driverGrossPay = Number(payRate.toFixed(2));
    }

    const netDriverPay = Number(Math.max(0, driverGrossPay - fuelDeduction - advancesDeduction - otherDeductions + reimbursements).toFixed(2));
    const estFuelTotal = loads.reduce((s, l) => s + analyzeLoadProfit({
      rate: Number(l.rate || 0),
      loadedMiles: Number(l.miles || 500),
      deadheadMiles: Number(l.empty_miles || 0),
      origin: l.pickup_location,
      destination: l.delivery_location
    }).fuel_cost, 0);
    const carrierNetProfit = Number((grossRevenue - netDriverPay - estFuelTotal).toFixed(2));

    const settlementNumber = `STL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const ins = await pool.query(
      `INSERT INTO driver_settlements (
         settlement_number, carrier_id, driver_id, driver_name, truck_number,
         period_start, period_end, loads_count, loaded_miles, empty_miles, gross_revenue,
         pay_type, pay_rate, driver_gross_pay, fuel_deduction, advances_deduction,
         other_deductions, reimbursements, net_driver_pay, carrier_net_profit,
         load_ids_json, notes, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'approved',$23)
       RETURNING *`,
      [
        settlementNumber, carrierId, driverId, driverName || 'Company Driver', truckNumber || 'Unit #101',
        periodStart, periodEnd, loads.length, loadedMiles, emptyMiles, grossRevenue,
        payType, payRate, driverGrossPay, fuelDeduction, advancesDeduction,
        otherDeductions, reimbursements, netDriverPay, carrierNetProfit,
        JSON.stringify(loads.map((l) => l.id)), notes || null, req.user.id
      ]
    );

    res.json({
      ok: true,
      settlement: ins.rows[0],
      loads,
      pdf_url: `/api/settlements/${ins.rows[0].id}/pdf`
    });
  } catch (err) {
    console.error('[Settlements Generate] Error:', err);
    res.status(500).json({ error: 'Could not generate driver settlement.' });
  }
});

// Stream Branded Driver Settlement PDF (Serverless-safe — zero /tmp links!)
router.get('/:id/pdf', requireAuth, async (req, res) => {
  await ensureSettlementTables();
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid settlement ID.' });

    const sRes = await pool.query(
      `SELECT s.*, u.company_name, u.mc_number, u.phone AS carrier_phone, u.email AS carrier_email
       FROM driver_settlements s
       LEFT JOIN users u ON u.id = s.carrier_id
       WHERE s.id = $1`,
      [id]
    );
    if (!sRes.rows.length) return res.status(404).json({ error: 'Settlement not found.' });
    const stl = sRes.rows[0];

    if (['carrier', 'carrier_admin'].includes(req.user.role) && Number(stl.carrier_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Access denied to this settlement.' });
    }

    const loadIds = Array.isArray(stl.load_ids_json) ? stl.load_ids_json : [];
    const loadRows = loadIds.length
      ? (await pool.query(
          `SELECT load_number, pickup_location, delivery_location, miles, empty_miles, rate, detention_total, delivery_date
           FROM loads WHERE id = ANY($1::int[]) ORDER BY delivery_date ASC`,
          [loadIds]
        )).rows
      : [];

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${stl.settlement_number}.pdf"`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 86).fill('#0B1528');
    doc.fillColor('#FFFFFF').fontSize(19).font('Helvetica-Bold').text('DRIVER PAY SETTLEMENT STATEMENT', 40, 24);
    doc.fillColor('#F59E0B').fontSize(10).text(`${stl.company_name || 'SHIPPING WISH CARRIER PARTNER'}  •  ${stl.settlement_number}`, 40, 48);
    doc.fillColor('#94A3B8').fontSize(9).text(`Pay Period: ${String(stl.period_start).slice(0, 10)} to ${String(stl.period_end).slice(0, 10)}  |  Powered by Shipping Wish TMS`, 40, 64);

    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold').text(`Driver: ${stl.driver_name || 'Assigned Driver'}   |   Unit: ${stl.truck_number || 'N/A'}`, 40, 104);
    doc.fontSize(9.5).font('Helvetica').fillColor('#334155').text(`Pay Structure: ${stl.pay_type === 'percent' ? `${stl.pay_rate}% of Gross` : (stl.pay_type === 'per_mile' ? `$${stl.pay_rate}/mile` : `$${stl.pay_rate} Flat`)}   •   Status: ${String(stl.status || 'approved').toUpperCase()}`, 40, 120);

    doc.rect(40, 142, 532, 86).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold');
    doc.text(`Completed Loads: ${stl.loads_count}`, 54, 154);
    doc.text(`Loaded Miles: ${Number(stl.loaded_miles).toLocaleString()} mi   |   Empty: ${Number(stl.empty_miles).toLocaleString()} mi`, 54, 172);
    doc.text(`Gross Load Revenue: $${Number(stl.gross_revenue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 54, 190);
    doc.text(`Driver Gross Pay: $${Number(stl.driver_gross_pay).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 54, 208);

    doc.fillColor('#B45309').text(`Fuel / Advances / Other Deductions: -$${(Number(stl.fuel_deduction) + Number(stl.advances_deduction) + Number(stl.other_deductions)).toFixed(2)}`, 335, 154);
    doc.fillColor('#15803D').text(`Reimbursements: +$${Number(stl.reimbursements).toFixed(2)}`, 335, 174);
    doc.fillColor('#1D4ED8').fontSize(13).text(`NET DRIVER PAY: $${Number(stl.net_driver_pay).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 335, 198);

    let y = 248;
    doc.fillColor('#0B1528').fontSize(12).font('Helvetica-Bold').text('COMPLETED LOADS INCLUDED IN SETTLEMENT', 40, y);
    y += 20;
    doc.rect(40, y, 532, 22).fill('#0B1528');
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('LOAD #', 48, y + 6);
    doc.text('ROUTE', 120, y + 6);
    doc.text('MILES (L/E)', 355, y + 6);
    doc.text('RATE + DETENTION', 460, y + 6);
    y += 26;

    loadRows.forEach((r, idx) => {
      if (y > 700) { doc.addPage(); y = 50; }
      if (idx % 2 === 0) doc.rect(40, y - 4, 532, 20).fill('#F8FAFC');
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold').text(r.load_number || '-', 48, y);
      doc.font('Helvetica').fillColor('#334155').text(`${r.pickup_location || '-'} -> ${r.delivery_location || '-'}`, 120, y, { width: 225, ellipsis: true });
      doc.text(`${Number(r.miles || 0)} / ${Number(r.empty_miles || 0)} mi`, 355, y);
      doc.fillColor('#15803D').font('Helvetica-Bold').text(`$${(Number(r.rate || 0) + Number(r.detention_total || 0)).toFixed(2)}`, 460, y);
      y += 22;
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Could not generate settlement PDF.' });
  }
});

// =========================================================================
// 2. PER-TRUCK PROFIT & LOSS (P&L) ANALYTICS
// =========================================================================
router.get('/truck-pnl', requireAuth, async (req, res) => {
  await ensureSettlementTables();
  try {
    const isCarrier = ['carrier', 'carrier_admin'].includes(req.user.role);
    const days = Math.min(365, Math.max(1, parseInt(req.query.days || '30', 10)));
    const params = [days];
    let sql = `
      SELECT COALESCE(t.truck_number, l.truck_number, 'Unassigned Unit') AS truck_unit,
             COUNT(l.id)::int AS loads_count,
             COALESCE(SUM(l.miles), 0)::numeric AS loaded_miles,
             COALESCE(SUM(l.empty_miles), 0)::numeric AS empty_miles,
             COALESCE(SUM(l.rate + COALESCE(l.detention_total, 0)), 0)::numeric AS gross_revenue,
             COALESCE(SUM(l.fuel_est), 0)::numeric AS fuel_est
      FROM loads l
      LEFT JOIN trucks t ON t.id = l.truck_id
      WHERE l.deleted_at IS NULL
        AND l.status IN ('delivered', 'pod_uploaded', 'invoiced', 'paid')
        AND l.updated_at >= NOW() - ($1 || ' days')::interval
    `;
    if (isCarrier) {
      params.push(req.user.id);
      sql += ` AND l.carrier_id = $${params.length}`;
    } else if (req.query.carrierId) {
      params.push(parseInt(req.query.carrierId, 10));
      sql += ` AND l.carrier_id = $${params.length}`;
    }
    sql += ` GROUP BY truck_unit ORDER BY gross_revenue DESC`;
    const { rows } = await pool.query(sql, params);

    const trucks = rows.map((r) => {
      const loaded = Number(r.loaded_miles || 0);
      const empty = Number(r.empty_miles || 0);
      const totalMi = loaded + empty;
      const gross = Number(r.gross_revenue || 0);
      const fuel = Number(r.fuel_est || 0) > 0 ? Number(r.fuel_est) : Number(((totalMi / 6.5) * 3.72).toFixed(2));
      const net = Number((gross - fuel).toFixed(2));
      return {
        truck_unit: r.truck_unit,
        loads_count: r.loads_count,
        loaded_miles: loaded,
        empty_miles: empty,
        total_miles: totalMi,
        gross_revenue: gross,
        fuel_expense: fuel,
        net_profit: net,
        effective_rpm: totalMi > 0 ? Number((gross / totalMi).toFixed(2)) : 0
      };
    });

    res.json({ ok: true, period_days: days, trucks });
  } catch (err) {
    res.status(500).json({ error: 'Could not compute Per-Truck P&L.' });
  }
});

// =========================================================================
// 3. 1-CLICK CARRIER-TO-BROKER / FACTORING INVOICE PACKET (PDF + Email)
// =========================================================================
router.get('/factoring-packet/:loadId/pdf', requireAuth, async (req, res) => {
  await ensureSettlementTables();
  try {
    const loadId = parseInt(req.params.loadId, 10);
    if (isNaN(loadId)) return res.status(400).json({ error: 'Invalid load ID.' });

    const loadRes = await pool.query(
      `SELECT l.*, c.company_name AS carrier_company, c.name AS carrier_contact, c.mc_number AS carrier_mc_num,
              c.dot_number AS carrier_dot_num, c.phone AS carrier_phone, c.email AS carrier_email,
              c.address AS carrier_address, c.factoring_company, c.factoring_email, c.factoring_noa_text
       FROM loads l
       LEFT JOIN users c ON c.id = l.carrier_id
       WHERE l.id = $1`,
      [loadId]
    );
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadRes.rows[0];

    if (!(await userCanAccessLoad(req, load))) {
      return res.status(403).json({ error: 'Access denied to this load billing packet.' });
    }

    const docsRes = await pool.query(
      `SELECT id, category, original_name, uploaded_at FROM documents WHERE load_id = $1 ORDER BY uploaded_at ASC`,
      [loadId]
    ).catch(() => ({ rows: [] }));

    const rate = Number(load.rate || 0);
    const detention = Number(load.detention_total || 0);
    const totalDue = rate + detention;
    const invNo = `INV-${load.load_number || load.id}`;

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Billing_Packet_${load.load_number || load.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 84).fill('#0B1528');
    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text('CARRIER FREIGHT INVOICE & FACTORING PACKET', 40, 22);
    doc.fillColor('#F59E0B').fontSize(10).text(`${load.carrier_company || load.carrier_name || 'MOTOR CARRIER'}  •  ${load.carrier_mc_num || load.carrier_mc || ''}`, 40, 46);
    doc.fillColor('#94A3B8').fontSize(9).text(`Invoice #: ${invNo}   |   Load #: ${load.load_number}   |   Date: ${new Date().toISOString().slice(0, 10)}`, 40, 62);

    // Bill To vs Remit To (Factoring NOA)
    doc.rect(40, 102, 256, 92).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.rect(316, 102, 256, 92).fillAndStroke('#EFF6FF', '#93C5FD');

    doc.fillColor('#1D4ED8').fontSize(9).font('Helvetica-Bold').text('BILL TO (BROKER / PAYOR)', 52, 112);
    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold').text(load.broker_name || 'Freight Broker', 52, 126);
    doc.font('Helvetica').fontSize(9).fillColor('#334155')
      .text(`MC #: ${load.broker_mc || 'On File'}`, 52, 144)
      .text(`Contact: ${load.broker_contact || 'Accounts Payable'}`, 52, 158, { width: 235 });

    doc.fillColor('#1D4ED8').fontSize(9).font('Helvetica-Bold').text(load.factoring_company ? 'REMIT PAYMENT TO (NOTICE OF ASSIGNMENT)' : 'REMIT PAYMENT TO (CARRIER)', 328, 112);
    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold').text(load.factoring_company || load.carrier_company || 'Motor Carrier', 328, 126);
    doc.font('Helvetica').fontSize(8.5).fillColor('#334155')
      .text(load.factoring_noa_text || (load.factoring_company
        ? `This invoice has been assigned to ${load.factoring_company}. Remit funds exclusively to factoring account on NOA.`
        : `${load.carrier_address || 'USA Motor Carrier'}\n${load.carrier_email || ''}  •  ${load.carrier_phone || ''}`), 328, 144, { width: 235 });

    // Load Shipment Details
    let y = 212;
    doc.fillColor('#0B1528').fontSize(11).font('Helvetica-Bold').text('SHIPMENT & LINE-ITEM CHARGES', 40, y);
    y += 18;
    doc.rect(40, y, 532, 22).fill('#0B1528');
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('DESCRIPTION', 50, y + 6);
    doc.text('REFERENCE / DETAILS', 260, y + 6);
    doc.text('AMOUNT (USD)', 470, y + 6);
    y += 28;

    doc.fillColor('#0F172A').fontSize(9.5).font('Helvetica-Bold').text('Linehaul Freight Transportation', 50, y);
    doc.font('Helvetica').fillColor('#334155').text(`${load.pickup_location} -> ${load.delivery_location} (${load.miles || 0} mi)`, 260, y, { width: 200 });
    doc.fillColor('#0F172A').font('Helvetica-Bold').text(`$${rate.toFixed(2)}`, 470, y);
    y += 26;

    if (detention > 0) {
      doc.fillColor('#0F172A').fontSize(9.5).font('Helvetica-Bold').text('Approved GPS-Verified Detention Fee', 50, y);
      doc.font('Helvetica').fillColor('#334155').text('Verified Arrival / Departure Timestamps', 260, y);
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(`$${detention.toFixed(2)}`, 470, y);
      y += 24;
    }

    doc.rect(40, y + 4, 532, 32).fill('#0B1528');
    doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold').text('TOTAL AMOUNT DUE (NET 30 / QUICKPAY)', 52, y + 14);
    doc.fillColor('#F59E0B').fontSize(14).text(`$${totalDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 455, y + 12);

    y += 56;
    doc.fillColor('#0B1528').fontSize(11).font('Helvetica-Bold').text('VERIFIED SUPPORTING DOCUMENTS IN CLOUD VAULT', 40, y);
    y += 18;
    if (!docsRes.rows.length) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#B45309').text('Reminder: Upload Signed BOL/POD & Rate Confirmation before final factoring funding.', 40, y);
    } else {
      docsRes.rows.forEach((d) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#15803D').text(`✓ [${String(d.category || 'DOC').toUpperCase()}]`, 44, y);
        doc.font('Helvetica').fillColor('#334155').text(`${d.original_name}  (Uploaded ${String(d.uploaded_at || '').slice(0, 10)})`, 145, y);
        y += 18;
      });
    }

    doc.end();
  } catch (err) {
    console.error('[FactoringPacket PDF] Error:', err);
    res.status(500).json({ error: 'Could not generate factoring billing packet PDF.' });
  }
});

router.post('/factoring-packet', requireAuth, requireRole('carrier', 'carrier_admin', 'dispatcher', 'admin', 'super_admin'), async (req, res) => {
  await ensureSettlementTables();
  try {
    const loadId = parseInt(req.body.loadId, 10);
    if (isNaN(loadId)) return res.status(400).json({ error: 'loadId is required.' });

    const loadRes = await pool.query(
      `SELECT l.*, c.company_name AS carrier_company, c.mc_number AS carrier_mc_num, c.factoring_company, c.factoring_email
       FROM loads l LEFT JOIN users c ON c.id = l.carrier_id WHERE l.id = $1`,
      [loadId]
    );
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadRes.rows[0];
    if (!(await userCanAccessLoad(req, load))) {
      return res.status(403).json({ error: 'Access denied to this load.' });
    }

    const recipientType = req.body.recipientType === 'factoring' ? 'factoring' : 'broker';
    const recipientEmail = String(req.body.recipientEmail || (recipientType === 'factoring' ? load.factoring_email : '') || '').trim();
    const recipientName = String(req.body.recipientName || (recipientType === 'factoring' ? load.factoring_company : load.broker_name) || 'Accounts Payable').trim();
    const detentionAmount = Math.max(0, Number(req.body.detentionAmount ?? load.detention_total ?? 0));
    const lumperAmount = Math.max(0, Number(req.body.lumperAmount || 0));
    const otherAccessorials = Math.max(0, Number(req.body.otherAccessorials || 0));
    const grossRate = Number(load.rate || 0);
    const totalInvoice = Number((grossRate + detentionAmount + lumperAmount + otherAccessorials).toFixed(2));

    const docsRes = await pool.query(`SELECT id FROM documents WHERE load_id = $1`, [loadId]).catch(() => ({ rows: [] }));
    const packetNumber = `PKT-${load.load_number || loadId}-${String(Date.now()).slice(-4)}`;
    const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const ins = await pool.query(
      `INSERT INTO factoring_packets (
         packet_number, load_id, carrier_id, recipient_type, recipient_name, recipient_email,
         gross_rate, detention_amount, lumper_amount, other_accessorials, total_invoice_amount,
         included_doc_ids, status, due_date, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'sent',$13,$14)
       RETURNING *`,
      [
        packetNumber, loadId, load.carrier_id || req.user.id, recipientType, recipientName, recipientEmail || null,
        grossRate, detentionAmount, lumperAmount, otherAccessorials, totalInvoice,
        JSON.stringify(docsRes.rows.map((d) => d.id)), dueDate, req.user.id
      ]
    );

    // Update load status to invoiced
    await pool.query(`UPDATE loads SET status = 'invoiced', detention_total = $1, updated_at = NOW() WHERE id = $2`, [detentionAmount, loadId]);
    await pool.query(
      `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'invoiced', $2, $3)`,
      [loadId, req.user.id, `1-Click ${recipientType.toUpperCase()} Billing Packet #${packetNumber} sent ($${totalInvoice.toFixed(2)})`]
    ).catch(() => {});

    let emailSent = false;
    if (recipientEmail && recipientEmail.includes('@')) {
      try {
        await sendBrandedEmail({
          to: recipientEmail,
          subject: `Invoice & POD Packet #${packetNumber} — Load #${load.load_number} ($${totalInvoice.toFixed(2)})`,
          html: `<p>Please find the freight invoice and supporting documentation packet for <strong>Load #${load.load_number}</strong> (${load.pickup_location} &rarr; ${load.delivery_location}).</p>
                 <p><strong>Carrier:</strong> ${load.carrier_company || load.carrier_name || 'Motor Carrier'} (${load.carrier_mc_num || load.carrier_mc || ''})<br/>
                 <strong>Total Invoice Amount:</strong> $${totalInvoice.toFixed(2)} USD<br/>
                 <strong>Included Documents:</strong> ${docsRes.rows.length} verified file(s) in Shipping Wish Cloud Vault.</p>`,
          text: `Invoice Packet #${packetNumber} for Load #${load.load_number}. Total Due: $${totalInvoice.toFixed(2)}.`,
          emailType: 'factoring_packet',
          templateKey: 'factoring_packet'
        });
        emailSent = true;
      } catch (e) {
        console.warn('[FactoringPacket] Email warning:', e.message);
      }
    }

    res.json({
      ok: true,
      packet: ins.rows[0],
      email_sent: emailSent,
      pdf_url: `/api/settlements/factoring-packet/${loadId}/pdf`,
      message: `Billing Packet #${packetNumber} generated ($${totalInvoice.toFixed(2)}) and load marked INVOICED.`
    });
  } catch (err) {
    console.error('[FactoringPacket] Error:', err);
    res.status(500).json({ error: 'Could not create factoring billing packet.' });
  }
});

module.exports = router;
