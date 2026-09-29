const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { auditLog, getClientIp } = require('../utils/audit');
const { sendPushToUsers } = require('./mobile-push');

const router = express.Router();

// Auto-migrate tracking tables
let tablesEnsured = false;
async function ensureTrackingTables() {
  if (tablesEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracking_events (
        id SERIAL PRIMARY KEY,
        load_id INT REFERENCES loads(id) ON DELETE SET NULL,
        driver_id INT REFERENCES users(id) ON DELETE SET NULL,
        latitude NUMERIC(10, 6),
        longitude NUMERIC(10, 6),
        speed NUMERIC(6, 2) DEFAULT 0,
        heading NUMERIC(6, 2) DEFAULT 0,
        location_name VARCHAR(255),
        status VARCHAR(50),
        notes TEXT,
        ping_time TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_tracking_events_load_id ON tracking_events(load_id);
      CREATE INDEX IF NOT EXISTS idx_tracking_events_driver_id ON tracking_events(driver_id);
      CREATE INDEX IF NOT EXISTS idx_tracking_events_ping_time ON tracking_events(ping_time DESC);
    `);
    tablesEnsured = true;
  } catch (err) {
    console.error('[Tracking] Migration error:', err.message);
  }
}
ensureTrackingTables();

// POST /api/tracking/ping — Record GPS ping or driver status update
router.post('/ping', requireAuth, async (req, res) => {
  await ensureTrackingTables();

  const activeLoadId = req.body.loadId || req.body.load_id || null;
  const { latitude, longitude, speed = 0, heading = 0, locationName, status, notes } = req.body;
  const driverId = req.user.id;

  try {
    let resolvedLoadId = activeLoadId ? parseInt(activeLoadId, 10) : null;
    let load = null;

    // If load was specified, verify access
    if (resolvedLoadId && !isNaN(resolvedLoadId)) {
      const loadRes = await pool.query(
        `SELECT id, load_number, carrier_id, dispatcher_id, driver_id, status FROM loads WHERE id = $1`,
        [resolvedLoadId]
      );

      if (loadRes.rows.length > 0) {
        load = loadRes.rows[0];
      } else {
        resolvedLoadId = null; // not found, fallback to duty ping
      }
    } else if (req.user.role === 'driver') {
      // Auto-detect if driver has an active in-transit load
      const activeLoadRes = await pool.query(
        `SELECT l.id, l.load_number, l.carrier_id, l.dispatcher_id, l.driver_id, l.status
         FROM loads l
         JOIN drivers d ON d.id = l.driver_id
         WHERE (d.user_id = $1 OR lower(d.email) = lower($2))
           AND l.status IN ('assigned', 'dispatched', 'in_transit', 'loading', 'unloading')
         ORDER BY l.updated_at DESC LIMIT 1`,
        [driverId, req.user.email || '']
      );
      if (activeLoadRes.rows.length > 0) {
        load = activeLoadRes.rows[0];
        resolvedLoadId = load.id;
      }
    }

    // Insert tracking event
    const eventRes = await pool.query(
      `INSERT INTO tracking_events (load_id, driver_id, latitude, longitude, speed, heading, location_name, status, notes, ping_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       RETURNING *`,
      [
        resolvedLoadId,
        driverId,
        latitude || null,
        longitude || null,
        speed || 0,
        heading || 0,
        locationName || null,
        status || (load ? load.status : 'on_duty'),
        notes || null
      ]
    );

    // If load status has changed, update load status & timeline
    if (load && status && status !== load.status) {
      await pool.query(`UPDATE loads SET status = $1, updated_at = now() WHERE id = $2`, [status, resolvedLoadId]);

      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [resolvedLoadId, status, driverId, `Status updated via mobile GPS ping to ${status}`]
      );

      // Notify dispatcher & carrier
      const notifyUsers = [load.dispatcher_id, load.carrier_id].filter(id => id && id !== driverId);
      for (const uid of notifyUsers) {
        createNotification(
          uid,
          `Load #${load.load_number} Status: ${status.toUpperCase()}`,
          `Driver location: ${locationName || (latitude ? `${latitude}, ${longitude}` : 'En route')}`,
          'info',
          `/load-detail.html?id=${resolvedLoadId}`
        ).catch(() => {});
      }

      sendPushToUsers(notifyUsers, {
        title: `🚚 Load #${load.load_number} Update`,
        body: `Status: ${status.replace('_', ' ').toUpperCase()} at ${locationName || 'active corridor'}`,
        data: { load_id: resolvedLoadId, status }
      }).catch(() => {});

      auditLog(driverId, 'LOAD_STATUS_UPDATE_GPS', 'load', resolvedLoadId, { oldStatus: load.status, newStatus: status, locationName }, getClientIp(req));
    }

    res.json({ ok: true, event: eventRes.rows[0], loadId: resolvedLoadId });
  } catch (err) {
    console.error('Tracking ping error:', err);
    res.status(500).json({ error: 'Could not record tracking ping.' });
  }
});

// GET /api/tracking/load/:loadId — Get tracking timeline for a load
router.get('/load/:loadId', requireAuth, async (req, res) => {
  await ensureTrackingTables();
  const { loadId } = req.params;

  try {
    const loadRes = await pool.query('SELECT id, carrier_id, dispatcher_id, driver_id FROM loads WHERE id = $1', [loadId]);
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const load = loadRes.rows[0];
    const role = req.user.role;

    if (['carrier', 'carrier_admin'].includes(role) && load.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (role === 'dispatcher' && load.dispatcher_id && load.dispatcher_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

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
  await ensureTrackingTables();
  try {
    let query = `
      SELECT DISTINCT ON (t.driver_id)
         t.id, t.driver_id, t.load_id, t.latitude, t.longitude, t.speed, t.heading, t.location_name, t.status, t.ping_time,
         u.name AS driver_name, u.phone AS driver_phone,
         l.load_number
       FROM tracking_events t
       JOIN users u ON u.id = t.driver_id
       LEFT JOIN loads l ON l.id = t.load_id
       WHERE 1=1`;
    let params = [];

    if (['carrier', 'carrier_admin'].includes(req.user.role)) {
      params.push(req.user.id);
      query += ` AND (l.carrier_id = $1 OR t.driver_id IN (SELECT user_id FROM drivers WHERE carrier_id = $1))`;
    } else if (req.user.role === 'driver') {
      params.push(req.user.id);
      query += ` AND t.driver_id = $1`;
    } else if (req.user.role === 'dispatcher') {
      params.push(req.user.id);
      query += ` AND (l.dispatcher_id = $1 OR l.dispatcher_id IS NULL)`;
    }

    query += ` ORDER BY t.driver_id, t.ping_time DESC`;
    const latestRes = await pool.query(query, params);

    res.json({ drivers: latestRes.rows });
  } catch (err) {
    console.error('Fetch active drivers error:', err);
    res.status(500).json({ error: 'Could not fetch driver locations.' });
  }
});

// GET /api/tracking/live-fleet — Live Fleet Coordinates for TMS & Superadmin Command Center
router.get('/live-fleet', requireAuth, async (req, res) => {
  await ensureTrackingTables();

  try {
    const liveDrivers = await pool.query(`
      SELECT DISTINCT ON (t.driver_id)
        t.driver_id,
        COALESCE(u.name, 'Driver #' || t.driver_id) as driver_name,
        COALESCE(u.phone, 'N/A') as phone,
        COALESCE(u.company_name, 'Fleet Carrier') as company,
        t.latitude,
        t.longitude,
        t.speed,
        t.heading,
        t.location_name,
        t.status,
        t.ping_time,
        l.id as load_id,
        l.load_number,
        l.pickup_location,
        l.delivery_location
      FROM tracking_events t
      JOIN users u ON u.id = t.driver_id
      LEFT JOIN loads l ON l.id = t.load_id
      WHERE t.latitude IS NOT NULL AND t.longitude IS NOT NULL
      ORDER BY t.driver_id, t.ping_time DESC
      LIMIT 50
    `);

    let fleet = (liveDrivers.rows || []).filter((row) => row.latitude != null && row.longitude != null);

    try {
      const eld = await pool.query(`
        SELECT v.name as driver_name, v.unit_number, v.gps_lat as latitude, v.gps_lon as longitude,
               v.speed, v.heading, v.location_name, v.located_at as ping_time, c.provider, c.account_label as company
        FROM eld_vehicles v
        JOIN eld_connections c ON c.id = v.connection_id
        WHERE v.gps_lat IS NOT NULL AND v.gps_lon IS NOT NULL
        ORDER BY v.updated_at DESC
        LIMIT 50
      `);
      eld.rows.forEach((row) => {
        fleet.push({
          driver_name: row.driver_name,
          company: row.company,
          latitude: row.latitude,
          longitude: row.longitude,
          speed: row.speed,
          heading: row.heading,
          location_name: row.location_name,
          status: 'eld',
          ping_time: row.ping_time,
          source: row.provider
        });
      });
    } catch (_) { /* eld tables may not exist yet */ }

    res.json({ ok: true, count: fleet.length, fleet, note: 'Only real GPS pings. Empty until a driver pings or an ELD is connected.' });
  } catch (err) {
    console.error('Live fleet telematics error:', err);
    res.status(500).json({ error: 'Could not fetch live fleet telematics.' });
  }
});

module.exports = router;
