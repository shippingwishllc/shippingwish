const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

const STATUS_FLOW = [
  'new', 'booked', 'dispatched', 'at_pickup', 'loaded',
  'in_transit', 'at_delivery', 'delivered', 'pod_uploaded', 'invoiced', 'paid',
  'cancellation_requested', 'cancelled'
];

// Endpoint: Fetch last delivery location & date for next load / reload suggestion
router.get('/last-delivery', requireAuth, async (req, res) => {
  const { carrierId, driverId } = req.query;
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
             u.name AS carrier_name, u.company_name AS carrier_company, u.phone AS carrier_phone,
             d.name AS dispatcher_name,
             dr.name AS driver_name, dr.phone AS driver_phone,
             t.truck_number, tr.trailer_number
      FROM loads l
      JOIN users u ON u.id = l.carrier_id
      LEFT JOIN users d ON d.id = l.dispatcher_id
      LEFT JOIN drivers dr ON dr.id = l.driver_id
      LEFT JOIN trucks t ON t.id = l.truck_id
      LEFT JOIN trailers tr ON tr.id = l.trailer_id
      WHERE 1=1`;
    let params = [];

    if (req.user.role === 'carrier') {
      params.push(req.user.id);
      query += ` AND l.carrier_id = $${params.length}`;
    } else if (req.user.role === 'dispatcher') {
      // STRICT ISOLATION: Each dispatcher ONLY sees loads booked by themselves
      params.push(req.user.id);
      query += ` AND l.dispatcher_id = $${params.length}`;
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
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const loadResult = await pool.query(
      `SELECT l.*,
              u.name AS carrier_name, u.company_name AS carrier_company, u.phone AS carrier_phone, u.email AS carrier_email,
              d.name AS dispatcher_name, d.phone AS dispatcher_phone, d.email AS dispatcher_email,
              dr.name AS driver_name, dr.phone AS driver_phone,
              t.truck_number, tr.trailer_number,
              b.company_name AS broker_table_name, b.mc_number AS broker_table_mc
       FROM loads l
       JOIN users u ON u.id = l.carrier_id
       LEFT JOIN users d ON d.id = l.dispatcher_id
       LEFT JOIN drivers dr ON dr.id = l.driver_id
       LEFT JOIN trucks t ON t.id = l.truck_id
       LEFT JOIN trailers tr ON tr.id = l.trailer_id
       LEFT JOIN brokers b ON b.id = l.broker_id
       WHERE l.id = $1`,
      [id]
    );
    if (!loadResult.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadResult.rows[0];

    if (req.user.role === 'carrier' && load.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }
    if (req.user.role === 'dispatcher' && load.dispatcher_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }

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
    const loadResult = await pool.query('SELECT load_number, carrier_id, dispatcher_id, status AS current_status FROM loads WHERE id = $1', [id]);
    if (!loadResult.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadResult.rows[0];

    if (req.user.role === 'carrier' && load.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }
    if (req.user.role === 'dispatcher' && load.dispatcher_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }

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

module.exports = router;
