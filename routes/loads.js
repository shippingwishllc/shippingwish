const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

const STATUS_FLOW = [
  'open', 'new', 'pending_carrier_approval', 'booked', 'ratecon_signed', 'dispatched',
  'at_pickup', 'loaded', 'in_transit', 'at_delivery', 'delivered', 'pod_uploaded',
  'invoiced', 'paid', 'covered', 'cancellation_requested', 'cancelled'
];

async function denyIfNoLoadAccess(req, res, load) {
  const role = req.user.role;
  if (role === 'admin' || role === 'super_admin') return false;
  if (role === 'carrier' && load.carrier_id !== req.user.id) {
    res.status(403).json({ error: 'You do not have access to this load.' });
    return true;
  }
  if (role === 'dispatcher' && load.dispatcher_id !== req.user.id) {
    res.status(403).json({ error: 'You do not have access to this load.' });
    return true;
  }
  if (role === 'driver') {
    const dr = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1 OR (email IS NOT NULL AND lower(email) = lower($2))`,
      [req.user.id, req.user.email || '']
    );
    const ids = dr.rows.map((r) => r.id);
    if (!load.driver_id || !ids.includes(load.driver_id)) {
      res.status(403).json({ error: 'This load is not assigned to you.' });
      return true;
    }
  }
  return false;
}

// Endpoint: Fetch last delivery location & date for next load / reload suggestion
router.get('/last-delivery', requireAuth, async (req, res) => {
  let { carrierId, driverId } = req.query;

  if (['carrier', 'carrier_admin'].includes(req.user.role)) {
    carrierId = req.user.id;
    driverId = null;
  }

  if (!carrierId && !driverId) {
    return res.json({ lastDelivery: null });
  }

  try {
    let query = `
      SELECT delivery_company, delivery_location, delivery_state, delivery_date, delivery_time, load_number
      FROM loads
      WHERE 1=1`;
    let params = [];

    if (driverId) {
      params.push(driverId);
      query += ` AND driver_id = $${params.length}`;
    } else if (carrierId) {
      params.push(carrierId);
      query += ` AND carrier_id = $${params.length}`;
    }

    query += ` ORDER BY delivery_date DESC, created_at DESC LIMIT 1`;
    const result = await pool.query(query, params);
    
    res.json({ lastDelivery: result.rows[0] || null });
  } catch (err) {
    console.error('Error fetching last delivery:', err);
    res.status(500).json({ error: 'Could not fetch last delivery info.' });
  }
});

// Create load — dispatcher, admin, super_admin
router.post('/', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const {
    carrierId, brokerId, brokerName, brokerMc, brokerContact,
    driverId, truckId, trailerId, equipmentType,
    pickupCompany, pickupLocation, pickupState, pickupZip, pickupTz, pickupDate, pickupTime,
    deliveryCompany, deliveryLocation, deliveryState, deliveryZip, deliveryTz, deliveryDate, deliveryTime,
    commodity, weight, miles, rate, carrierPay, referenceNumber, bolNumber, freightClass,
    dispatcherNotes, internalNotes
  } = req.body;

  if (!carrierId || !pickupLocation || !deliveryLocation) {
    return res.status(400).json({ error: 'Carrier, pickup location, and delivery location are required.' });
  }

  const numMiles = parseFloat(miles || 0);
  const numRate = parseFloat(rate || 0);
  const rpm = numMiles > 0 ? (numRate / numMiles).toFixed(2) : 0;
  const numCarrierPay = parseFloat(carrierPay || 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insert = await client.query(
      `INSERT INTO loads (
        load_number, carrier_id, dispatcher_id, broker_id, broker_name, broker_mc, broker_contact,
        driver_id, truck_id, trailer_id, equipment_type,
        pickup_company, pickup_location, pickup_state, pickup_zip, pickup_tz, pickup_date, pickup_time,
        delivery_company, delivery_location, delivery_state, delivery_zip, delivery_tz, delivery_date, delivery_time,
        commodity, weight, miles, rate, rpm, carrier_pay, reference_number, bol_number, freight_class, status,
        dispatcher_notes, internal_notes
      ) VALUES (
        'TEMP', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, 'booked', $34, $35
      ) RETURNING id`,
      [
        carrierId, req.user.id, brokerId || null, brokerName || null, brokerMc || null, brokerContact || null,
        driverId || null, truckId || null, trailerId || null, equipmentType || null,
        pickupCompany || null, pickupLocation, pickupState || null, pickupZip || null, pickupTz || 'America/New_York', pickupDate || null, pickupTime || null,
        deliveryCompany || null, deliveryLocation, deliveryState || null, deliveryZip || null, deliveryTz || 'America/New_York', deliveryDate || null, deliveryTime || null,
        commodity || null, weight || 0, numMiles, numRate, rpm, numCarrierPay, referenceNumber || null, bolNumber || null, freightClass || null,
        dispatcherNotes || null, internalNotes || null
      ]
    );
    const id = insert.rows[0].id;
    const loadNumber = `SW-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
    await client.query('UPDATE loads SET load_number = $1 WHERE id = $2', [loadNumber, id]);
    
    await client.query(
      `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'booked', $2, 'Load created and booked')`,
      [id, req.user.id]
    );
    
    await client.query('COMMIT');

    // Notify carrier
    await createNotification(
      carrierId,
      `New Load Booked #${loadNumber}`,
      `Load from ${pickupLocation} to ${deliveryLocation} ($${numRate}) has been booked.`,
      'info',
      `/load-detail.html?id=${id}`
    );

    auditLog(req.user.id, 'LOAD_CREATE', 'load', id, { loadNumber, carrierId, rate: numRate }, getClientIp(req));

    try {
      const driverAssistant = require('../utils/driver-assistant');
      driverAssistant.onLoadBooked(id).catch((err) => console.warn('[DRIVER-ASSISTANT] booked notify:', err.message));
    } catch (_) {}

    res.json({ ok: true, id, loadNumber });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create load error:', err);
    res.status(500).json({ error: 'Could not create load.' });
  } finally {
    client.release();
  }
});

// List loads — Dispatchers see ONLY their own booked loads, Admins see ALL loads
router.get('/', requireAuth, async (req, res) => {
  const { status, carrierId, dispatcherId, search } = req.query;
  try {
    let query = `
      SELECT l.*,
             COALESCE(u.name, 'Shipping Wish Fleet') AS carrier_name, 
             COALESCE(u.company_name, 'Shipping Wish Fleet') AS carrier_company, 
             COALESCE(u.phone, '+1 (917) 737-0021') AS carrier_phone,
             d.name AS dispatcher_name,
             dr.name AS driver_name, dr.phone AS driver_phone,
             COALESCE(t.truck_number, '101') AS truck_number, tr.trailer_number
      FROM loads l
      LEFT JOIN users u ON u.id = l.carrier_id
      LEFT JOIN users d ON d.id = l.dispatcher_id
      LEFT JOIN drivers dr ON dr.id = l.driver_id
      LEFT JOIN trucks t ON t.id = l.truck_id
      LEFT JOIN trailers tr ON tr.id = l.trailer_id
      WHERE l.deleted_at IS NULL`;
    let params = [];

    if (req.user.role === 'carrier') {
      params.push(req.user.id);
      query += ` AND l.carrier_id = $${params.length}`;
    } else if (req.user.role === 'driver') {
      params.push(req.user.id);
      const n = params.length;
      params.push(req.user.email || '');
      query += ` AND (
        dr.user_id = $${n}
        OR (dr.email IS NOT NULL AND lower(dr.email) = lower($${n + 1}))
      )`;
    } else if (req.user.role === 'dispatcher') {
      // Dispatchers see loads booked by themselves or unassigned company fleet / AI loads
      params.push(req.user.id);
      query += ` AND (l.dispatcher_id = $${params.length} OR l.dispatcher_id IS NULL)`;
    }

    if (carrierId && req.user.role !== 'carrier') {
      params.push(carrierId);
      query += ` AND l.carrier_id = $${params.length}`;
    }
    if (dispatcherId && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
      params.push(dispatcherId);
      query += ` AND l.dispatcher_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND l.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (lower(l.load_number) LIKE lower($${params.length}) OR lower(l.broker_name) LIKE lower($${params.length}) OR lower(l.pickup_location) LIKE lower($${params.length}) OR lower(l.delivery_location) LIKE lower($${params.length}))`;
    }

    query += ` ORDER BY l.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ loads: result.rows });
  } catch (err) {
    console.error('List loads error:', err);
    res.status(500).json({ error: 'Could not load loads.' });
  }
});

// Load detail — includes status history, mileage, accessorials, and documents
router.get('/:id', requireAuth, async (req, res, next) => {
  const { id } = req.params;
  if (!/^\d+$/.test(String(id))) return next();
  try {
    const loadResult = await pool.query(
      `SELECT l.*,
              u.name AS carrier_name, u.company_name AS carrier_company, u.phone AS carrier_phone, u.email AS carrier_email,
              d.name AS dispatcher_name, d.phone AS dispatcher_phone, d.email AS dispatcher_email,
              dr.name AS driver_name, dr.phone AS driver_phone,
              t.truck_number, tr.trailer_number,
              b.company_name AS broker_table_name, b.mc_number AS broker_table_mc
       FROM loads l
       LEFT JOIN users u ON u.id = l.carrier_id
       LEFT JOIN users d ON d.id = l.dispatcher_id
       LEFT JOIN drivers dr ON dr.id = l.driver_id
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN trailers tr ON tr.id = l.trailer_id
       LEFT JOIN brokers b ON b.id = l.broker_id
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id]
    );
    if (!loadResult.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadResult.rows[0];

    if (await denyIfNoLoadAccess(req, res, load)) return;

    const history = await pool.query(
      `SELECT h.*, u.name AS changed_by_name FROM load_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.load_id = $1 ORDER BY h.changed_at ASC`,
      [id]
    );
    const miles = await pool.query(
      `SELECT * FROM load_state_miles WHERE load_id = $1 ORDER BY id ASC`,
      [id]
    );
    const accessorials = await pool.query(
      `SELECT * FROM load_accessorials WHERE load_id = $1 ORDER BY id ASC`,
      [id]
    );
    const docs = await pool.query(
      `SELECT * FROM documents WHERE load_id = $1 ORDER BY uploaded_at DESC`,
      [id]
    );

    res.json({ load, history: history.rows, miles: miles.rows, accessorials: accessorials.rows, documents: docs.rows });
  } catch (err) {
    console.error('Load detail error:', err);
    res.status(500).json({ error: 'Could not load details.' });
  }
});

// Update load detail — dispatcher/admin/super_admin
router.put('/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { id } = req.params;
  const {
    carrierId, brokerId, brokerName, brokerMc, brokerContact,
    driverId, truckId, trailerId, equipmentType,
    pickupCompany, pickupLocation, pickupState, pickupZip, pickupTz, pickupDate, pickupTime,
    deliveryCompany, deliveryLocation, deliveryState, deliveryZip, deliveryTz, deliveryDate, deliveryTime,
    commodity, weight, miles, rate, carrierPay, referenceNumber, bolNumber,
    dispatcherNotes, internalNotes
  } = req.body;

  const numMiles = parseFloat(miles || 0);
  const numRate = parseFloat(rate || 0);
  const rpm = numMiles > 0 ? (numRate / numMiles).toFixed(2) : 0;
  const numCarrierPay = parseFloat(carrierPay || 0);

  try {
    const result = await pool.query(
      `UPDATE loads SET
        carrier_id = $1, broker_id = $2, broker_name = $3, broker_mc = $4, broker_contact = $5,
        driver_id = $6, truck_id = $7, trailer_id = $8, equipment_type = $9,
        pickup_company = $10, pickup_location = $11, pickup_state = $12, pickup_zip = $13, pickup_tz = $14, pickup_date = $15, pickup_time = $16,
        delivery_company = $17, delivery_location = $18, delivery_state = $19, delivery_zip = $20, delivery_tz = $21, delivery_date = $22, delivery_time = $23,
        commodity = $24, weight = $25, miles = $26, rate = $27, rpm = $28, carrier_pay = $29, reference_number = $30, bol_number = $31,
        dispatcher_notes = $32, internal_notes = $33, updated_at = now()
       WHERE id = $34 RETURNING *`,
      [
        carrierId, brokerId || null, brokerName || null, brokerMc || null, brokerContact || null,
        driverId || null, truckId || null, trailerId || null, equipmentType || null,
        pickupCompany || null, pickupLocation, pickupState || null, pickupZip || null, pickupTz || 'America/New_York', pickupDate || null, pickupTime || null,
        deliveryCompany || null, deliveryLocation, deliveryState || null, deliveryZip || null, deliveryTz || 'America/New_York', deliveryDate || null, deliveryTime || null,
        commodity || null, weight || 0, numMiles, numRate, rpm, numCarrierPay, referenceNumber || null, bolNumber || null,
        dispatcherNotes || null, internalNotes || null, id
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Load not found.' });

    auditLog(req.user.id, 'LOAD_UPDATE', 'load', id, { loadNumber: result.rows[0].load_number }, getClientIp(req));

    res.json({ ok: true, load: result.rows[0] });
  } catch (err) {
    console.error('Update load error:', err);
    res.status(500).json({ error: 'Could not update load.' });
  }
});

// Update status (e.g. Mark as Delivered)
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  if (!STATUS_FLOW.includes(status)) {
    return res.status(400).json({ error: 'Invalid load status.' });
  }
  try {
    const loadResult = await pool.query('SELECT load_number, carrier_id, dispatcher_id, driver_id, status AS current_status FROM loads WHERE id = $1', [id]);
    if (!loadResult.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadResult.rows[0];

    if (await denyIfNoLoadAccess(req, res, load)) return;

    await pool.query('UPDATE loads SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
    await pool.query(
      'INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1,$2,$3,$4)',
      [id, status, req.user.id, notes || null]
    );

    // Notifications
    const readableStatus = status.replace('_', ' ');
    if (load.carrier_id && load.carrier_id !== req.user.id) {
      await createNotification(load.carrier_id, `Load #${load.load_number} Status Updated`, `Status changed to "${readableStatus}".`, 'info', `/load-detail.html?id=${id}`);
    }
    if (load.dispatcher_id && load.dispatcher_id !== req.user.id) {
      await createNotification(load.dispatcher_id, `Load #${load.load_number} Status Updated`, `Status changed to "${readableStatus}".`, 'info', `/load-detail.html?id=${id}`);
    }

    auditLog(req.user.id, 'LOAD_STATUS_CHANGE', 'load', id, { oldStatus: load.current_status, newStatus: status, notes }, getClientIp(req));

    try {
      const driverAssistant = require('../utils/driver-assistant');
      driverAssistant.onLoadStatusChanged(id, status, load.current_status).catch((err) => console.warn('[DRIVER-ASSISTANT] status change notify:', err.message));
    } catch (_) {}

    res.json({ ok: true });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Could not update status.' });
  }
});

// Add state miles
router.post('/:id/miles', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { state, miles } = req.body;
  if (!state || !miles) return res.status(400).json({ error: 'State and miles are required.' });
  try {
    const loadResult = await pool.query('SELECT carrier_id FROM loads WHERE id = $1', [id]);
    if (!loadResult.rows.length) return res.status(404).json({ error: 'Load not found.' });
    if (req.user.role === 'carrier' && loadResult.rows[0].carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }
    await pool.query(
      'INSERT INTO load_state_miles (load_id, state, miles) VALUES ($1,$2,$3)',
      [id, state.toUpperCase().slice(0, 2), miles]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not save mileage.' });
  }
});

// ============================================================
// LOAD CANCELLATION WORKFLOW
// 1. Dispatcher submits cancellation request + reason
// 2. Admin approves (status -> cancelled) or rejects (status -> booked)
// 3. Admin can also cancel directly anytime
// ============================================================

// GET /api/loads/pending-cancellations — List pending cancellation requests (Admin)
router.get('/pending-cancellations', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.id, l.load_number, l.pickup_location, l.delivery_location, l.rate, l.status,
             l.cancellation_reason, l.cancellation_requested_at,
             u.company_name AS carrier_name,
             disp.name AS dispatcher_name
      FROM loads l
      JOIN users u ON u.id = l.carrier_id
      LEFT JOIN users disp ON disp.id = l.cancellation_requested_by
      WHERE l.status = 'cancellation_requested'
      ORDER BY l.cancellation_requested_at DESC
    `);
    res.json({ requests: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch cancellation requests.' });
  }
});

// POST /api/loads/:id/request-cancellation — Trigger cancellation request with reason
router.post('/:id/request-cancellation', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Cancellation reason is required.' });
  }

  try {
    const loadRes = await pool.query(
      `SELECT l.id, l.load_number, l.status, l.carrier_id, l.dispatcher_id,
              u.company_name AS carrier_name
       FROM loads l JOIN users u ON u.id = l.carrier_id
       WHERE l.id = $1`,
      [id]
    );
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadRes.rows[0];

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (isAdmin) {
      // Admin directly cancels load without needing approval
      await pool.query(
        `UPDATE loads
         SET status = 'cancelled', cancellation_reason = $1,
             cancellation_requested_by = $2, cancellation_requested_at = now(), updated_at = now()
         WHERE id = $3`,
        [reason, req.user.id, id]
      );
      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes)
         VALUES ($1, 'cancelled', $2, $3)`,
        [id, req.user.id, `Direct Admin Cancellation: ${reason}`]
      );
      return res.json({ ok: true, directCancelled: true, message: `Load #${load.load_number} has been cancelled.` });
    }

    // Dispatcher submits cancellation request for Admin approval
    await pool.query(
      `UPDATE loads
       SET status = 'cancellation_requested', cancellation_reason = $1,
           cancellation_requested_by = $2, cancellation_requested_at = now(), updated_at = now()
       WHERE id = $3`,
      [reason, req.user.id, id]
    );
    await pool.query(
      `INSERT INTO load_status_history (load_id, status, changed_by, notes)
       VALUES ($1, 'cancellation_requested', $2, $3)`,
      [id, req.user.id, `Cancellation Request Submitted: ${reason}`]
    );

    // Create Admin Notifications
    const admins = await pool.query(`SELECT id FROM users WHERE role IN ('admin', 'super_admin')`);
    for (const a of admins.rows) {
      await createNotification(
        a.id,
        `⚠️ Cancellation Requested: Load #${load.load_number}`,
        `Dispatcher ${req.user.name} requested cancellation for Load #${load.load_number}. Reason: ${reason}`,
        'warning',
        `/admin-dashboard.html`
      );
    }

    res.json({
      ok: true,
      pendingApproval: true,
      message: `Cancellation request for Load #${load.load_number} submitted to Admin for approval.`
    });
  } catch (err) {
    console.error('Cancellation request error:', err);
    res.status(500).json({ error: 'Could not submit cancellation request.' });
  }
});

// POST /api/loads/:id/approve-cancellation — Admin approves or rejects request
router.post('/:id/approve-cancellation', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body; // action: 'approve' | 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject".' });
  }

  try {
    const loadRes = await pool.query(
      `SELECT l.id, l.load_number, l.status, l.carrier_id, l.dispatcher_id, l.cancellation_requested_by
       FROM loads l WHERE l.id = $1`,
      [id]
    );
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadRes.rows[0];

    if (action === 'approve') {
      await pool.query(
        `UPDATE loads SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [id]
      );
      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes)
         VALUES ($1, 'cancelled', $2, $3)`,
        [id, req.user.id, `Admin Approved Cancellation: ${notes || 'Cancellation approved'}`]
      );

      // Notify dispatcher
      if (load.dispatcher_id) {
        await createNotification(
          load.dispatcher_id,
          `✅ Cancellation Approved: Load #${load.load_number}`,
          `Admin approved cancellation for Load #${load.load_number}.`,
          'info',
          `/dispatcher-dashboard.html`
        );
      }

      return res.json({ ok: true, status: 'cancelled', message: `Load #${load.load_number} cancellation APPROVED.` });
    } else {
      // Reject — revert status to booked
      await pool.query(
        `UPDATE loads SET status = 'booked', updated_at = now() WHERE id = $1`,
        [id]
      );
      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes)
         VALUES ($1, 'booked', $2, $3)`,
        [id, req.user.id, `Admin Rejected Cancellation: ${notes || 'Cancellation request rejected'}`]
      );

      // Notify dispatcher
      if (load.dispatcher_id) {
        await createNotification(
          load.dispatcher_id,
          `❌ Cancellation Rejected: Load #${load.load_number}`,
          `Admin rejected cancellation for Load #${load.load_number}. Load remains active.`,
          'warning',
          `/dispatcher-dashboard.html`
        );
      }

      return res.json({ ok: true, status: 'booked', message: `Load #${load.load_number} cancellation REJECTED.` });
    }
  } catch (err) {
    console.error('Approve cancellation error:', err);
    res.status(500).json({ error: 'Could not process cancellation approval.' });
  }
});

// ADMIN: Move load to trash (soft delete)
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE loads SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id, load_number`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Load not found or already in trash.' });
    auditLog(req.user.id, 'LOAD_TRASH', 'load', req.params.id, { loadNumber: result.rows[0].load_number }, getClientIp(req));
    res.json({ ok: true, message: 'Load moved to Trash. Restore from Trash page if needed.' });
  } catch (err) {
    console.error('Trash load error:', err);
    res.status(500).json({ error: 'Could not move load to trash.' });
  }
});

// GET /api/loads/profit-analyze — True USA Trucking Net-Profit Calculator
router.get('/profit-analyze', requireAuth, (req, res) => {
  const { analyzeLoadProfit } = require('../utils/profit-engine');
  const result = analyzeLoadProfit({
    rate: Number(req.query.rate || 0),
    loadedMiles: Number(req.query.miles || req.query.loadedMiles || 500),
    deadheadMiles: Number(req.query.deadhead || req.query.deadheadMiles || 0),
    origin: req.query.origin || '',
    destination: req.query.destination || '',
    equipmentType: req.query.equipment || '53ft Dry Van',
    mpg: req.query.mpg ? Number(req.query.mpg) : null,
    dieselPrice: req.query.dieselPrice ? Number(req.query.dieselPrice) : null,
    factoringPercent: req.query.factoringPercent !== undefined ? Number(req.query.factoringPercent) : 2.0,
    dispatchPercent: req.query.dispatchPercent !== undefined ? Number(req.query.dispatchPercent) : 0
  });
  res.json({ ok: true, analysis: result });
});

// POST /api/loads/:id/carrier-decision — 1-Tap Carrier Load Approval ("Zero Forced Dispatch")
router.post('/:id/carrier-decision', requireAuth, async (req, res) => {
  const { ensureUnifiedSchema, awardLoadToCarrier } = require('../utils/load-lifecycle');
  await ensureUnifiedSchema();

  const loadId = parseInt(req.params.id, 10);
  const decision = String(req.body.decision || '').toLowerCase(); // 'approve' | 'decline'
  const notes = String(req.body.notes || '').trim();
  if (isNaN(loadId) || !['approve', 'decline'].includes(decision)) {
    return res.status(400).json({ error: 'Valid load ID and decision (approve or decline) are required.' });
  }

  try {
    const loadRes = await pool.query('SELECT * FROM loads WHERE id = $1 AND deleted_at IS NULL', [loadId]);
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadRes.rows[0];

    const isStaff = ['admin', 'super_admin', 'dispatcher'].includes(req.user.role);
    if (!isStaff && Number(load.carrier_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only approve or decline loads offered to your carrier account.' });
    }

    if (decision === 'approve') {
      const awarded = await awardLoadToCarrier({
        loadId: load.id,
        carrierId: load.carrier_id || req.user.id,
        awardedByUserId: req.user.id,
        notes: notes || 'Approved by Carrier via 1-Tap Zero Forced Dispatch'
      });
      await pool.query(
        `UPDATE loads SET carrier_approval_status = 'approved', carrier_approved_at = NOW(), carrier_approval_notes = $1 WHERE id = $2`,
        [notes || 'Approved by carrier', load.id]
      );

      if (load.dispatcher_id) {
        createNotification(
          load.dispatcher_id,
          `✅ Carrier APPROVED Load #${load.load_number}`,
          `Carrier approved ${load.pickup_location} -> ${load.delivery_location} ($${Number(load.rate || 0).toLocaleString()}). Live broker tracking link generated!`,
          'success',
          `/load-detail.html?id=${load.id}`
        ).catch(() => {});
        const { sendPushToUsers } = require('./mobile-push');
        sendPushToUsers(load.dispatcher_id, {
          title: `✅ Carrier Approved #${load.load_number}`,
          body: `${load.pickup_location} → ${load.delivery_location} ($${Number(load.rate || 0).toLocaleString()}) is BOOKED!`,
          data: { load_id: load.id, type: 'carrier_approved' }
        }).catch(() => {});
      }

      // Auto-send Live GPS Broker Tracking Magic Link if a real broker email exists on the load
      try {
        const contactStr = String(load.broker_contact || '').trim();
        const emailMatch = contactStr.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (emailMatch && awarded.tracking_url && !emailMatch[0].includes('locked@')) {
          const { sendBrandedEmail } = require('../utils/mailer');
          sendBrandedEmail({
            to: emailMatch[0],
            subject: `Carrier Confirmed & Live Tracking — Load #${load.load_number} (${load.pickup_location} → ${load.delivery_location})`,
            html: `
              <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
                <div style="background:#0b1528;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
                  <h2 style="margin:0;font-size:17px;">✅ Carrier Approved & Booked — Load #${load.load_number}</h2>
                </div>
                <div style="padding:20px 22px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;background:#fff;">
                  <p>Our verified motor carrier has officially approved <strong>${load.pickup_location} → ${load.delivery_location}</strong> ($${Number(load.rate || 0).toLocaleString()}).</p>
                  <p style="font-size:13px;color:#475569;">Track live GPS location and delivery milestones in real time (zero check-calls needed):</p>
                  <a href="${awarded.tracking_url}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:8px;margin-top:6px;">📍 Open Live GPS Tracking Link ↗</a>
                </div>
              </div>
            `
          }).catch(() => {});
        }
      } catch (_) {}

      return res.json({
        ok: true,
        decision: 'approved',
        load: awarded.load,
        tracking_url: awarded.tracking_url,
        message: `Load #${load.load_number} APPROVED! Status updated to BOOKED and live tracking link generated.`
      });
    }

    await pool.query(
      `UPDATE loads SET status = 'open', is_public_board = CASE WHEN source_type IN ('broker','api','dat') THEN TRUE ELSE is_public_board END, carrier_approval_status = 'declined', carrier_approval_notes = $1, updated_at = NOW() WHERE id = $2`,
      [notes || 'Declined by carrier', load.id]
    );
    await pool.query(
      `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'open', $2, $3)`,
      [load.id, req.user.id, `Carrier declined load offer: ${notes || 'Passed'}`]
    ).catch(() => {});

    if (load.dispatcher_id) {
      createNotification(
        load.dispatcher_id,
        `❌ Carrier Declined Load #${load.load_number}`,
        `Carrier passed on ${load.pickup_location} -> ${load.delivery_location}. Reason: ${notes || 'No reason provided'}`,
        'warning',
        `/dispatcher-dashboard.html`
      ).catch(() => {});
    }

    return res.json({ ok: true, decision: 'declined', message: `Load #${load.load_number} declined. Dispatcher has been notified.` });
  } catch (err) {
    console.error('Carrier decision error:', err);
    res.status(500).json({ error: 'Could not process carrier load decision.' });
  }
});

// GET /api/loads/history-report/pdf — Branded Real-Data Driver & Fleet Performance History PDF Report
router.get('/history-report/pdf', requireAuth, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { analyzeLoadProfit } = require('../utils/profit-engine');
    const { ensureUnifiedSchema } = require('../utils/load-lifecycle');
    await ensureUnifiedSchema();

    const period = String(req.query.period || '30_days');
    const loadFilter = req.query.loadNumber ? String(req.query.loadNumber).trim() : null;

    const uRes = await pool.query(
      `SELECT id, name, company_name, mc_number, phone FROM users WHERE id = $1`,
      [req.user.id]
    );
    const u = uRes.rows[0] || {};
    const driverName = req.query.driverName || u.name || 'Carrier Operator';
    const companyName = req.query.companyName || u.company_name || 'Shipping Wish Carrier Partner';
    const mcNumber = req.query.mcNumber || u.mc_number || 'MC-ON-FILE';
    const truckUnit = req.query.truckUnit || 'Fleet';

    const params = [];
    let sql = `
      SELECT id, load_number, pickup_location, delivery_location, miles, empty_miles, rate, detention_total, fuel_est, equipment_type, delivery_date, updated_at, status
      FROM loads
      WHERE deleted_at IS NULL
        AND status IN ('delivered', 'pod_uploaded', 'invoiced', 'paid')
    `;

    if (['carrier', 'carrier_admin'].includes(req.user.role)) {
      params.push(req.user.id);
      sql += ` AND carrier_id = $${params.length}`;
    } else if (req.user.role === 'driver') {
      params.push(req.user.id, req.user.email || '');
      sql += ` AND (driver_id IN (SELECT id FROM drivers WHERE user_id = $${params.length - 1} OR lower(email) = lower($${params.length})) OR carrier_id = $${params.length - 1})`;
    } else if (req.query.carrierId) {
      params.push(parseInt(req.query.carrierId, 10));
      sql += ` AND carrier_id = $${params.length}`;
    }

    if (loadFilter) {
      params.push(loadFilter);
      sql += ` AND (load_number = $${params.length} OR id::text = $${params.length})`;
    } else {
      const daysBack = period === '7_days' ? 7 : (period === '15_days' ? 15 : 30);
      params.push(daysBack);
      sql += ` AND COALESCE(delivery_date, updated_at::date) >= CURRENT_DATE - ($${params.length}::int)`;
    }
    sql += ` ORDER BY COALESCE(delivery_date, updated_at::date) DESC LIMIT 100`;

    const dbRes = await pool.query(sql, params);
    const rows = (dbRes.rows || []).map((r) => {
      const loadedMi = Number(r.miles || 0);
      const emptyMi = Number(r.empty_miles || 0);
      const gross = Number(r.rate || 0) + Number(r.detention_total || 0);
      const est = analyzeLoadProfit({
        rate: gross,
        loadedMiles: loadedMi || 1,
        deadheadMiles: emptyMi,
        origin: r.pickup_location,
        destination: r.delivery_location,
        equipmentType: r.equipment_type
      });
      const fuelCost = Number(r.fuel_est || 0) > 0 ? Number(r.fuel_est) : est.fuel_cost;
      return {
        load_number: r.load_number || `SW-${r.id}`,
        date: String(r.delivery_date || r.updated_at || '').slice(0, 10),
        origin: r.pickup_location || '-',
        destination: r.delivery_location || '-',
        loaded_miles: loadedMi,
        empty_miles: emptyMi,
        rate: gross,
        fuel_cost: fuelCost
      };
    });

    const totalLoads = rows.length;
    const loadedMiles = rows.reduce((s, r) => s + r.loaded_miles, 0);
    const emptyMiles = rows.reduce((s, r) => s + r.empty_miles, 0);
    const totalMiles = loadedMiles + emptyMiles;
    const grossEarnings = rows.reduce((s, r) => s + r.rate, 0);
    const fuelExpense = rows.reduce((s, r) => s + r.fuel_cost, 0);
    const netProfit = grossEarnings - fuelExpense;

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ShippingWish_Report_${period}.pdf"`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 92).fill('#0B1528');
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('SHIPPING WISH LLC', 40, 26);
    doc.fillColor('#F59E0B').fontSize(10).text('24/7 FLEET OPERATIONS DESK & ENTERPRISE TMS STATEMENT', 40, 50);
    doc.fillColor('#94A3B8').fontSize(9).text(`Generated: ${new Date().toUTCString()}   |   Period: ${period.toUpperCase().replace('_', ' ')}`, 40, 66);

    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text(`Carrier / Company: ${companyName} (${mcNumber})`, 40, 110);
    doc.fontSize(10).font('Helvetica').fillColor('#334155').text(`Operator: ${driverName}   •   Unit: ${truckUnit}   •   Support: +1 (917) 737-0021`, 40, 128);

    doc.fillColor('#0B1528').fontSize(13).font('Helvetica-Bold').text('1. EXECUTIVE MILEAGE, EARNINGS & FUEL SUMMARY', 40, 156);
    doc.rect(40, 174, 532, 78).fillAndStroke('#F8FAFC', '#CBD5E1');

    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold');
    doc.text(`Completed Loads: ${totalLoads}`, 54, 186);
    doc.text(`Total Driven Miles: ${totalMiles.toLocaleString()} mi`, 54, 204);
    doc.text(`Loaded: ${loadedMiles.toLocaleString()} mi   |   Empty (Deadhead): ${emptyMiles.toLocaleString()} mi`, 54, 222);

    doc.fillColor('#15803D').text(`Gross Earnings: $${grossEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 338, 186);
    doc.fillColor('#B45309').text(`Est. Fuel Expense: -$${fuelExpense.toFixed(2)}`, 338, 204);
    doc.fillColor('#1D4ED8').text(`Net Profit (After Fuel): $${netProfit.toFixed(2)}`, 338, 222);

    doc.fillColor('#0B1528').fontSize(13).font('Helvetica-Bold').text('2. LINE-BY-LINE COMPLETED LOAD LEDGER', 40, 272);
    let y = 295;
    doc.rect(40, y, 532, 22).fill('#0B1528');
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('LOAD #', 48, y + 6);
    doc.text('DATE', 110, y + 6);
    doc.text('ROUTE (ORIGIN -> DESTINATION)', 168, y + 6);
    doc.text('LOADED / EMPTY', 338, y + 6);
    doc.text('GROSS', 430, y + 6);
    doc.text('FUEL EST.', 480, y + 6);
    doc.text('NET', 532, y + 6);
    y += 26;

    if (!rows.length) {
      doc.fillColor('#64748B').fontSize(10).font('Helvetica').text('No completed loads found for the selected period.', 48, y + 4);
    } else {
      rows.forEach((r, idx) => {
        if (y > 700) { doc.addPage(); y = 50; }
        if (idx % 2 === 0) doc.rect(40, y - 4, 532, 22).fill('#F8FAFC');
        doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica-Bold').text(r.load_number, 48, y);
        doc.font('Helvetica').fillColor('#334155').text(r.date, 110, y);
        doc.text(`${r.origin} -> ${r.destination}`, 168, y, { width: 165, ellipsis: true });
        doc.text(`${r.loaded_miles} / ${r.empty_miles} mi`, 338, y);
        doc.fillColor('#15803D').font('Helvetica-Bold').text(`$${r.rate.toFixed(0)}`, 430, y);
        doc.fillColor('#B45309').font('Helvetica').text(`-$${r.fuel_cost.toFixed(0)}`, 480, y);
        doc.fillColor('#1D4ED8').font('Helvetica-Bold').text(`$${(r.rate - r.fuel_cost).toFixed(0)}`, 532, y);
        y += 22;
      });
    }

    doc.end();
  } catch (err) {
    console.error('History PDF error:', err);
    res.status(500).json({ error: 'Could not generate load history PDF.' });
  }
});

module.exports = router;
