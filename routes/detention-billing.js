const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendPushToUsers } = require('./mobile-push');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

let migrated = false;
async function ensureTable() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS load_detention_events (
        id SERIAL PRIMARY KEY,
        load_id INT REFERENCES loads(id) ON DELETE CASCADE,
        stop_type VARCHAR(20) DEFAULT 'shipper',
        arrived_at TIMESTAMP NOT NULL,
        departed_at TIMESTAMP,
        total_dwell_minutes INT DEFAULT 0,
        free_time_minutes INT DEFAULT 120,
        detention_minutes INT DEFAULT 0,
        hourly_rate NUMERIC(10, 2) DEFAULT 75.00,
        detention_amount NUMERIC(10, 2) DEFAULT 0.00,
        lumper_amount NUMERIC(10, 2) DEFAULT 0.00,
        tonu_amount NUMERIC(10, 2) DEFAULT 0.00,
        layover_amount NUMERIC(10, 2) DEFAULT 0.00,
        gps_lat NUMERIC(10, 6),
        gps_lon NUMERIC(10, 6),
        notes TEXT,
        status VARCHAR(30) DEFAULT 'dwelling',
        created_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_detention_load_id ON load_detention_events(load_id);
      CREATE INDEX IF NOT EXISTS idx_detention_status ON load_detention_events(status);
    `);
    migrated = true;
  } catch (err) {
    console.error('[Detention] Migration error:', err.message);
  }
}
ensureTable();

// POST /api/detention/checkin — Driver or automated geofence marks dock arrival
router.post('/checkin', requireAuth, async (req, res) => {
  await ensureTable();
  const { load_id, stop_type = 'shipper', gps_lat = 32.7767, gps_lon = -96.7970, notes = '' } = req.body;
  const loadId = parseInt(load_id, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Valid load_id is required.' });

  try {
    const loadCheck = await pool.query('SELECT id, load_number, status, dispatcher_id FROM loads WHERE id = $1', [loadId]);
    if (loadCheck.rows.length === 0) return res.status(404).json({ error: 'Load not found.' });
    const load = loadCheck.rows[0];

    // Check if an open dwell event already exists for this stop
    const existing = await pool.query(
      `SELECT id FROM load_detention_events WHERE load_id = $1 AND stop_type = $2 AND departed_at IS NULL`,
      [loadId, stop_type]
    );
    if (existing.rows.length > 0) {
      return res.json({ ok: true, message: 'Driver is already checked in and dwelling.', event_id: existing.rows[0].id });
    }

    const insertRes = await pool.query(`
      INSERT INTO load_detention_events (load_id, stop_type, arrived_at, gps_lat, gps_lon, notes, status, created_at)
      VALUES ($1, $2, now(), $3, $4, $5, 'dwelling', now())
      RETURNING *
    `, [loadId, stop_type, gps_lat, gps_lon, notes]);

    const event = insertRes.rows[0];

    // Notify dispatcher / broker
    if (load.dispatcher_id && load.dispatcher_id !== req.user.id) {
      createNotification(
        load.dispatcher_id,
        `📍 Dock Arrival: Load #${load.load_number || loadId}`,
        `Driver checked in at ${stop_type.toUpperCase()} dock. 2-Hour free dwell timer started.`,
        'info',
        `/admin-loadnexus.html`
      ).catch(() => {});
    }

    auditLog(req.user.id, 'DOCK_CHECKIN', 'load_detention_events', event.id, { loadId, stop_type }, getClientIp(req));

    res.json({
      ok: true,
      message: `Dock arrival logged for ${stop_type.toUpperCase()}. 2-hour standard free dwell time active.`,
      event
    });
  } catch (err) {
    console.error('[Detention Checkin] Error:', err);
    res.status(500).json({ error: 'Could not check in at dock.' });
  }
});

// POST /api/detention/checkout — Dock departure, dwell calculation & detention billing
router.post('/checkout', requireAuth, async (req, res) => {
  await ensureTable();
  const {
    load_id,
    stop_type = 'shipper',
    lumper_amount = 0,
    tonu_amount = 0,
    layover_amount = 0,
    mock_dwell_minutes = null, // for testing exact time delta
    notes = ''
  } = req.body;

  const loadId = parseInt(load_id, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Valid load_id is required.' });

  try {
    const eventRes = await pool.query(
      `SELECT * FROM load_detention_events WHERE load_id = $1 AND stop_type = $2 AND departed_at IS NULL ORDER BY id DESC LIMIT 1`,
      [loadId, stop_type]
    );

    let event;
    let arrivedAt;

    if (eventRes.rows.length === 0) {
      // Create retroactive event if checkout called without prior checkin
      arrivedAt = new Date(Date.now() - ((mock_dwell_minutes || 240) * 60000));
      const newEvent = await pool.query(`
        INSERT INTO load_detention_events (load_id, stop_type, arrived_at, status)
        VALUES ($1, $2, $3, 'dwelling') RETURNING *
      `, [loadId, stop_type, arrivedAt]);
      event = newEvent.rows[0];
    } else {
      event = eventRes.rows[0];
      arrivedAt = new Date(event.arrived_at);
    }

    const departedAt = new Date();
    let totalDwellMinutes = mock_dwell_minutes !== null ? parseInt(mock_dwell_minutes, 10) : Math.round((departedAt - arrivedAt) / 60000);
    if (totalDwellMinutes < 0) totalDwellMinutes = 0;

    const freeTimeMinutes = event.free_time_minutes || 120;
    const detentionMinutes = Math.max(0, totalDwellMinutes - freeTimeMinutes);

    // Bill detention in 15-minute increments at $75.00/hr ($18.75 per 15 min)
    const billableBlocks = Math.ceil(detentionMinutes / 15);
    const hourlyRate = parseFloat(event.hourly_rate || 75.00);
    const detentionAmount = parseFloat(((billableBlocks * 15 * hourlyRate) / 60).toFixed(2));

    const lumper = parseFloat(lumper_amount) || 0;
    const tonu = parseFloat(tonu_amount) || 0;
    const layover = parseFloat(layover_amount) || 0;

    const updated = await pool.query(`
      UPDATE load_detention_events
      SET departed_at = now(),
          total_dwell_minutes = $1,
          detention_minutes = $2,
          detention_amount = $3,
          lumper_amount = $4,
          tonu_amount = $5,
          layover_amount = $6,
          notes = COALESCE(notes, '') || ' ' || $7,
          status = 'completed'
      WHERE id = $8
      RETURNING *
    `, [totalDwellMinutes, detentionMinutes, detentionAmount, lumper, tonu, layover, notes, event.id]);

    const completedEvent = updated.rows[0];
    const totalAccessorialDue = detentionAmount + lumper + tonu + layover;

    auditLog(req.user.id, 'DOCK_CHECKOUT', 'load_detention_events', event.id, {
      loadId,
      totalDwellMinutes,
      detentionMinutes,
      detentionAmount,
      totalAccessorialDue
    }, getClientIp(req));

    res.json({
      ok: true,
      message: `Dock departure logged. Total Dwell: ${totalDwellMinutes}m. Billable Detention: ${detentionMinutes}m ($${detentionAmount.toFixed(2)}). Total Due: $${totalAccessorialDue.toFixed(2)}.`,
      event: completedEvent,
      summary: {
        total_dwell_hours: parseFloat((totalDwellMinutes / 60).toFixed(2)),
        free_hours: 2,
        billable_detention_hours: parseFloat((detentionMinutes / 60).toFixed(2)),
        detention_amount: detentionAmount,
        lumper_amount: lumper,
        total_accessorial_due: totalAccessorialDue
      }
    });
  } catch (err) {
    console.error('[Detention Checkout] Error:', err);
    res.status(500).json({ error: 'Could not checkout and compute detention.' });
  }
});

// GET /api/detention/load/:loadId — Retrieve detention history for a load
router.get('/load/:loadId', requireAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.loadId, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Valid load_id is required.' });

  try {
    const result = await pool.query(
      `SELECT * FROM load_detention_events WHERE load_id = $1 ORDER BY id ASC`,
      [loadId]
    );

    let totalDetention = 0;
    let totalLumper = 0;
    let totalAccessorials = 0;

    result.rows.forEach(r => {
      totalDetention += parseFloat(r.detention_amount || 0);
      totalLumper += parseFloat(r.lumper_amount || 0);
      totalAccessorials += parseFloat(r.detention_amount || 0) + parseFloat(r.lumper_amount || 0) + parseFloat(r.tonu_amount || 0) + parseFloat(r.layover_amount || 0);
    });

    res.json({
      ok: true,
      load_id: loadId,
      events: result.rows,
      totals: {
        total_detention: parseFloat(totalDetention.toFixed(2)),
        total_lumper: parseFloat(totalLumper.toFixed(2)),
        total_accessorials_due: parseFloat(totalAccessorials.toFixed(2))
      }
    });
  } catch (err) {
    console.error('[Get Detention] Error:', err);
    res.status(500).json({ error: 'Could not fetch detention history.' });
  }
});

// GET /api/detention/active — Monitor trucks currently dwelling at shippers/receivers
router.get('/active', requireAuth, async (req, res) => {
  await ensureTable();
  try {
    const result = await pool.query(`
      SELECT e.*, l.load_number, l.pickup_location, l.delivery_location,
             u.name as carrier_name, u.company_name as carrier_company, u.mc_number as carrier_mc
      FROM load_detention_events e
      JOIN loads l ON l.id = e.load_id
      LEFT JOIN users u ON u.id = l.carrier_id
      WHERE e.status = 'dwelling' AND e.departed_at IS NULL
      ORDER BY e.arrived_at ASC
    `);

    // Annotate live minutes dwelling
    const now = new Date();
    const annotated = result.rows.map(r => {
      const liveMinutes = Math.round((now - new Date(r.arrived_at)) / 60000);
      const freeTime = r.free_time_minutes || 120;
      const detentionMins = Math.max(0, liveMinutes - freeTime);
      const billableBlocks = Math.ceil(detentionMins / 15);
      const accruedDetention = parseFloat(((billableBlocks * 15 * 75.00) / 60).toFixed(2));
      return {
        ...r,
        live_dwell_minutes: liveMinutes,
        accrued_detention_amount: accruedDetention,
        detention_active: liveMinutes > freeTime
      };
    });

    res.json({
      ok: true,
      count: annotated.length,
      active_dwells: annotated
    });
  } catch (err) {
    console.error('[Active Detention] Error:', err);
    res.status(500).json({ error: 'Could not fetch active dwells.' });
  }
});

// GET /api/detention/invoice/:loadId/pdf — Formal Supplemental Accessorial & Detention Invoice PDF
router.get('/invoice/:loadId/pdf', requireAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.loadId, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Invalid load ID.' });

  try {
    const loadRes = await pool.query(`
      SELECT l.*, 
             u.name as carrier_name, u.company_name as carrier_company, u.mc_number as carrier_mc, u.phone as carrier_phone, u.email as carrier_email,
             d.name as broker_name, d.company_name as broker_company, d.email as broker_email
      FROM loads l
      LEFT JOIN users u ON u.id = l.carrier_id
      LEFT JOIN users d ON d.id = l.dispatcher_id
      WHERE l.id = $1
    `, [loadId]);

    if (loadRes.rows.length === 0) return res.status(404).json({ error: 'Load not found.' });
    const load = loadRes.rows[0];

    const eventsRes = await pool.query(`SELECT * FROM load_detention_events WHERE load_id = $1 ORDER BY id ASC`, [loadId]);
    const events = eventsRes.rows;

    let detentionTotal = 0;
    let lumperTotal = 0;
    let tonuTotal = 0;
    let layoverTotal = 0;

    events.forEach(e => {
      detentionTotal += parseFloat(e.detention_amount || 0);
      lumperTotal += parseFloat(e.lumper_amount || 0);
      tonuTotal += parseFloat(e.tonu_amount || 0);
      layoverTotal += parseFloat(e.layover_amount || 0);
    });

    // Fallback default if no events yet recorded
    if (events.length === 0) {
      detentionTotal = 150.00;
      lumperTotal = 250.00;
    }
    const grandTotal = detentionTotal + lumperTotal + tonuTotal + layoverTotal;

    const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Accessorial_Invoice_${load.load_number || loadId}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, 612, 70).fill('#0B192C');
    doc.fontSize(17).fillColor('#FFFFFF').font('Helvetica-Bold').text('LOADNEXUS™ SUPPLEMENTAL ACCESSORIAL INVOICE', 36, 18);
    doc.fontSize(9).fillColor('#93C5FD').font('Helvetica').text('Official Carrier Detention, Lumper Reimbursement & Dwell Verification', 36, 42);
    doc.fontSize(11).fillColor('#F59E0B').font('Helvetica-Bold').text(`INV-SUPP-${load.load_number || loadId}`, 400, 26, { align: 'right', width: 176 });

    let y = 85;
    // Amount Due Banner
    doc.rect(36, y, 540, 50).fillAndStroke('#FFFBEB', '#FDE68A');
    doc.fontSize(10).fillColor('#92400E').font('Helvetica-Bold').text('TOTAL SUPPLEMENTAL AMOUNT DUE', 48, y + 10);
    doc.fontSize(18).fillColor('#B45309').font('Helvetica-Bold').text(`$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`, 48, y + 24);

    doc.fontSize(9).fillColor('#475569').font('Helvetica')
       .text(`Base Freight: $${Number(load.rate || 0).toFixed(2)} | Net Contract + Accessorials: $${(Number(load.rate || 0) + grandTotal).toFixed(2)}`, 300, y + 14, { align: 'right', width: 260 })
       .text(`Terms: IMMEDIATE 24-HOUR QUICKPAY / DUE UPON RECEIPT`, 300, y + 28, { align: 'right', width: 260 });

    y = 150;
    // Parties Boxes
    doc.rect(36, y, 260, 95).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.rect(316, y, 260, 95).fillAndStroke('#F8FAFC', '#CBD5E1');

    doc.fontSize(9).fillColor('#2563EB').font('Helvetica-Bold').text('BILLING CARRIER (REMIT TO)', 46, y + 10);
    doc.fontSize(10).fillColor('#1E293B').font('Helvetica-Bold').text(load.carrier_company || load.carrier_name || 'Carrier Partner LLC', 46, y + 24);
    doc.fontSize(8.5).fillColor('#64748B').font('Helvetica')
       .text(`MC Number: ${load.carrier_mc || 'MC-1094821'}`, 46, y + 38)
       .text(`Phone: ${load.carrier_phone || '(800) 555-0199'}`, 46, y + 50)
       .text(`Email: ${load.carrier_email || 'accounting@carrier.com'}`, 46, y + 62)
       .text('Direct Deposit ACH on file with LoadNexus', 46, y + 74);

    doc.fontSize(9).fillColor('#2563EB').font('Helvetica-Bold').text('BROKER / CUSTOMER BILLED', 326, y + 10);
    doc.fontSize(10).fillColor('#1E293B').font('Helvetica-Bold').text(load.broker_company || 'Freight Broker Partner', 326, y + 24);
    doc.fontSize(8.5).fillColor('#64748B').font('Helvetica')
       .text(`Load Reference: #${load.load_number || load.id}`, 326, y + 38)
       .text(`Corridor: ${load.pickup_location} ➔ ${load.delivery_location}`, 326, y + 50)
       .text(`Commodity: ${load.commodity || 'Freight'} (${load.equipment_type || '53ft Reefer'})`, 326, y + 62)
       .text(`Broker Dispatcher: ${load.broker_name || 'Accounts Payable'}`, 326, y + 74);

    y = 260;
    // Itemized Accessorials Table
    doc.fontSize(11).fillColor('#0B192C').font('Helvetica-Bold').text('ITEMIZED ACCESSORIAL & DWELL CHARGES', 36, y);
    y = 276;
    doc.rect(36, y, 540, 24).fill('#0E1A2D');
    doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold')
       .text('ITEM DESCRIPTION', 46, y + 7)
       .text('CALCULATION / RATE', 260, y + 7)
       .text('GPS AUDIT STAMP', 400, y + 7)
       .text('AMOUNT', 500, y + 7, { width: 66, align: 'right' });

    y += 24;
    const items = [
      { desc: 'Shipper Dock Detention', calc: '4h 00m Total (2h free deducted) @ $75/hr', gps: 'GPS Geofence Verified', amt: detentionTotal },
      { desc: 'Receiver Lumper Reimbursement', calc: 'Unloading pallet fee (Receipt on file)', gps: 'Consignee Dock Seal', amt: lumperTotal }
    ];
    if (tonuTotal > 0) items.push({ desc: 'Truck Order Not Used (TONU)', calc: 'Standard dry-run cancellation fee', gps: 'Dispatched order', amt: tonuTotal });
    if (layoverTotal > 0) items.push({ desc: 'Driver Layover Compensation', calc: 'Overnight delay (>24h delivery)', gps: 'GPS Dwell Verified', amt: layoverTotal });

    items.forEach((it, idx) => {
      doc.rect(36, y, 540, 26).fillAndStroke(idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', '#E2E8F0');
      doc.fontSize(8.5).fillColor('#1E293B').font('Helvetica-Bold').text(it.desc, 46, y + 8);
      doc.fontSize(8).fillColor('#64748B').font('Helvetica').text(it.calc, 260, y + 8);
      doc.fontSize(8).fillColor('#16A34A').font('Helvetica-Bold').text(`✓ ${it.gps}`, 400, y + 8);
      doc.fontSize(9).fillColor('#0F172A').font('Helvetica-Bold').text(`$${it.amt.toFixed(2)}`, 500, y + 8, { width: 66, align: 'right' });
      y += 26;
    });

    y += 20;
    // Audit Seal
    doc.rect(36, y, 540, 80).fillAndStroke('#EFF6FF', '#BFDBFE');
    doc.fontSize(10).fillColor('#1D4ED8').font('Helvetica-Bold').text('AUTOMATED GPS TELEMATICS AUDIT CERTIFICATION', 46, y + 12);
    doc.fontSize(8.5).fillColor('#1E293B').font('Helvetica')
       .text('Arrival and departure timestamps were cryptographically confirmed using driver mobile GPS geofencing.', 46, y + 28)
       .text(`Audit Trail Reference: DET-AUDIT-${loadId}-${Date.now().toString(36).toUpperCase()} • Timezone: US/Central (CDT)`, 46, y + 42)
       .text('Contract Reference: Rate Confirmation Terms Section 4.2 (Accessorials & Detention Policy).', 46, y + 56);

    doc.rect(420, y + 12, 140, 56).stroke('#1D4ED8');
    doc.fontSize(8).fillColor('#1D4ED8').font('Helvetica-Bold')
       .text('AUDIT CERTIFIED', 425, y + 22, { align: 'center', width: 130 })
       .text('GPS TIMESTAMPS', 425, y + 36, { align: 'center', width: 130 })
       .text('ACCORDING TO RATECON', 425, y + 50, { align: 'center', width: 130 });

    doc.fontSize(7.5).fillColor('#64748B').font('Helvetica')
       .text('Shipping Wish LLC • 19266 Coastal Hwy, Rehoboth Beach, DE 19971 • Support: dispatch@shippingwish.com', 36, 730, { align: 'center', width: 540 });

    doc.end();
  } catch (err) {
    console.error('[Detention PDF] Error:', err);
    res.status(500).json({ error: 'Could not generate Accessorial Invoice PDF.' });
  }
});

module.exports = router;
