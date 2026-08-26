const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

// POST /api/tracking/ping — Record GPS ping or driver status update
router.post('/ping', requireAuth, async (req, res) => {
  const { loadId, latitude, longitude, locationName, status, notes } = req.body;
  const driverId = req.user.id;

  if (!loadId) {
    return res.status(400).json({ error: 'loadId is required for tracking pings.' });
  }

  try {
    // 1. Verify driver or assigned user has access to load
    const loadRes = await pool.query(
      `SELECT id, load_number, carrier_id, dispatcher_id, status FROM loads WHERE id = $1`,
      [loadId]
    );

    if (loadRes.rows.length === 0) {
      return res.status(404).json({ error: 'Load not found.' });
    }

    const load = loadRes.rows[0];
    const role = req.user.role;
    if (role === 'carrier' && load.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }
    if (role === 'dispatcher' && load.dispatcher_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }
    if (role === 'driver') {
      const dr = await pool.query(
        `SELECT id FROM drivers WHERE user_id = $1 OR (email IS NOT NULL AND lower(email) = lower($2))`,
        [req.user.id, req.user.email || '']
      );
      const ids = dr.rows.map((r) => r.id);
      const assigned = await pool.query('SELECT driver_id FROM loads WHERE id = $1', [loadId]);
      if (!assigned.rows[0] || !ids.includes(assigned.rows[0].driver_id)) {
        return res.status(403).json({ error: 'This load is not assigned to you.' });
      }
    }

    // 2. Insert tracking event
    const eventRes = await pool.query(
      `INSERT INTO tracking_events (load_id, driver_id, latitude, longitude, location_name, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        loadId,
        driverId,
        latitude || null,
        longitude || null,
        locationName || null,
        status || load.status,
        notes || null
      ]
    );

    // 3. If status is provided and different from current load status, update load status & history
    if (status && status !== load.status) {
      await pool.query(`UPDATE loads SET status = $1, updated_at = now() WHERE id = $2`, [status, loadId]);

      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [loadId, status, driverId, `Status updated via driver tracking ping to ${status}`]
      );

      // Notify dispatcher
      if (load.dispatcher_id) {
        await createNotification(
          load.dispatcher_id,
          `Load #${load.load_number} Status Update`,
          `Driver updated status to "${status.replace('_', ' ')}"${locationName ? ' at ' + locationName : ''}.`,
          'info',
          `/load-detail.html?id=${loadId}`
        );
      }

      auditLog(driverId, 'LOAD_STATUS_UPDATE_GPS', 'load', loadId, { oldStatus: load.status, newStatus: status, locationName }, getClientIp(req));
    }

    res.json({ ok: true, event: eventRes.rows[0] });
  } catch (err) {
    console.error('Tracking ping error:', err);
    res.status(500).json({ error: 'Could not record tracking ping.' });
  }
});

// GET /api/tracking/load/:loadId — Get tracking timeline for a load
router.get('/load/:loadId', requireAuth, async (req, res) => {
  const { loadId } = req.params;

  try {
    const eventsRes = await pool.query(
      `SELECT t.*, u.name AS driver_name
       FROM tracking_events t
       LEFT JOIN users u ON u.id = t.driver_id
       WHERE t.load_id = $1
       ORDER BY t.ping_time DESC`,
      [loadId]
    );

    res.json({ events: eventsRes.rows });
  } catch (err) {
    console.error('Fetch load tracking error:', err);
    res.status(500).json({ error: 'Could not fetch load tracking history.' });
  }
});

// GET /api/tracking/driver/latest — Get latest location of active drivers
router.get('/driver/latest', requireAuth, async (req, res) => {
  try {
    const latestRes = await pool.query(
      `SELECT DISTINCT ON (t.driver_id)
         t.id, t.driver_id, t.load_id, t.latitude, t.longitude, t.location_name, t.status, t.ping_time,
         u.name AS driver_name, u.phone AS driver_phone,
         l.load_number
       FROM tracking_events t
       JOIN users u ON u.id = t.driver_id
       LEFT JOIN loads l ON l.id = t.load_id
       ORDER BY t.driver_id, t.ping_time DESC`
    );

    res.json({ drivers: latestRes.rows });
  } catch (err) {
    console.error('Fetch active drivers error:', err);
    res.status(500).json({ error: 'Could not fetch driver locations.' });
  }
});

module.exports = router;
