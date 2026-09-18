const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendPushToUsers } = require('./mobile-push');

const router = express.Router();

let migrated = false;
async function ensureTable() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS load_messages (
        id SERIAL PRIMARY KEY,
        load_id INT REFERENCES loads(id) ON DELETE CASCADE,
        sender_id INT REFERENCES users(id) ON DELETE SET NULL,
        sender_name VARCHAR(255),
        sender_role VARCHAR(50),
        message TEXT NOT NULL,
        attachments JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_load_messages_load_id ON load_messages(load_id);
    `);
    migrated = true;
  } catch (err) {
    console.error('[LoadMessages] Migration error:', err.message);
  }
}
ensureTable();

// Verify user has access to load (admin, super_admin, dispatcher, carrier, driver, broker)
async function verifyLoadAccess(user, loadId) {
  if (['admin', 'super_admin'].includes(user.role)) return true;

  const res = await pool.query(
    `SELECT id, carrier_id, dispatcher_id, driver_id, broker_id, load_number FROM loads WHERE id = $1`,
    [loadId]
  );
  if (res.rows.length === 0) return null;
  const load = res.rows[0];

  if (['carrier', 'carrier_admin'].includes(user.role) && load.carrier_id === user.id) return load;
  if (user.role === 'dispatcher' && (load.dispatcher_id === user.id || !load.dispatcher_id)) return load;
  if (user.role === 'broker' && load.broker_id === user.id) return load;

  if (user.role === 'driver') {
    const dr = await pool.query(`SELECT id FROM drivers WHERE user_id = $1`, [user.id]);
    const driverIds = dr.rows.map(r => r.id);
    if (load.driver_id && driverIds.includes(load.driver_id)) return load;
  }

  return false;
}

// GET /api/loads/:id/messages — Chronological chat on a load
router.get('/:id/messages', requireAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.id, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Invalid load ID' });

  try {
    const load = await verifyLoadAccess(req.user, loadId);
    if (load === null) return res.status(404).json({ error: 'Load not found' });
    if (load === false) return res.status(403).json({ error: 'Access denied to this load' });

    const msgRes = await pool.query(
      `SELECT m.*, u.email as sender_email
       FROM load_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.load_id = $1
       ORDER BY m.created_at ASC`,
      [loadId]
    );

    res.json({ ok: true, messages: msgRes.rows });
  } catch (err) {
    console.error('[LoadMessages] Get error:', err);
    res.status(500).json({ error: 'Could not fetch load messages' });
  }
});

// POST /api/loads/:id/messages — Post message and broadcast
router.post('/:id/messages', requireAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.id, 10);
  const { message, attachments = [] } = req.body;

  if (isNaN(loadId) || !message || !message.trim()) {
    return res.status(400).json({ error: 'Valid load ID and message text are required.' });
  }

  try {
    const load = await verifyLoadAccess(req.user, loadId);
    if (load === null) return res.status(404).json({ error: 'Load not found' });
    if (load === false) return res.status(403).json({ error: 'Access denied to this load' });

    const insertRes = await pool.query(
      `INSERT INTO load_messages (load_id, sender_id, sender_name, sender_role, message, attachments, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [
        loadId,
        req.user.id,
        req.user.name || req.user.email,
        req.user.role || 'user',
        message.trim(),
        JSON.stringify(attachments)
      ]
    );

    const newMsg = insertRes.rows[0];

    // Determine recipients to notify
    const loadDetails = await pool.query(
      `SELECT carrier_id, dispatcher_id, broker_id, load_number FROM loads WHERE id = $1`,
      [loadId]
    );
    const row = loadDetails.rows[0] || {};
    const recipients = [row.carrier_id, row.dispatcher_id, row.broker_id]
      .filter(id => id && id !== req.user.id);

    if (recipients.length > 0) {
      // Send in-app notification
      for (const recId of recipients) {
        createNotification(
          recId,
          `New Message on Load #${row.load_number || loadId}`,
          `${req.user.name || 'User'}: ${message.trim().substring(0, 100)}`,
          'info',
          `/load-detail.html?id=${loadId}`
        ).catch(() => {});
      }

      // Send mobile push notification
      sendPushToUsers(recipients, {
        title: `Load #${row.load_number || loadId} Message`,
        body: `${req.user.name || 'Team member'}: ${message.trim().substring(0, 90)}`,
        data: { load_id: loadId, type: 'load_message' }
      }).catch(() => {});
    }

    res.json({ ok: true, message: newMsg });
  } catch (err) {
    console.error('[LoadMessages] Post error:', err);
    res.status(500).json({ error: 'Could not send message' });
  }
});

// GET /api/loads/:id/timeline — Unified audit timeline (history, tracking, messages)
router.get('/:id/timeline', requireAuth, async (req, res) => {
  const loadId = parseInt(req.params.id, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Invalid load ID' });

  try {
    const load = await verifyLoadAccess(req.user, loadId);
    if (load === null) return res.status(404).json({ error: 'Load not found' });
    if (load === false) return res.status(403).json({ error: 'Access denied' });

    // 1. Status history
    const historyRes = await pool.query(
      `SELECT id, status, notes, changed_by, COALESCE(changed_at, now()) as created_at, 'status_change' as event_type
       FROM load_status_history WHERE load_id = $1`,
      [loadId]
    );

    // 2. Tracking pings
    const trackingRes = await pool.query(
      `SELECT id, status, notes, location_name, latitude, longitude, ping_time as created_at, 'gps_ping' as event_type
       FROM tracking_events WHERE load_id = $1`,
      [loadId]
    );

    // 3. Messages
    const msgRes = await pool.query(
      `SELECT id, sender_name, sender_role, message as notes, created_at, 'chat_message' as event_type
       FROM load_messages WHERE load_id = $1`,
      [loadId]
    );

    // Merge and sort chronologically
    const allEvents = [
      ...historyRes.rows,
      ...trackingRes.rows,
      ...msgRes.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ ok: true, timeline: allEvents });
  } catch (err) {
    console.error('[LoadTimeline] Error:', err);
    res.status(500).json({ error: 'Could not fetch load timeline' });
  }
});

module.exports = router;
