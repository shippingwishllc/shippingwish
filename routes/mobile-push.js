const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const https = require('https');

const router = express.Router();

// Auto-migrate push tokens table
let migrated = false;
async function ensureTable() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mobile_push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        platform VARCHAR(30) DEFAULT 'unknown',
        app_name VARCHAR(50) DEFAULT 'shippingwish',
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    migrated = true;
  } catch (err) {
    console.error('[Push] Migration error:', err.message);
  }
}
ensureTable();

// Dispatch push notifications to Expo Push API
async function sendExpoPushNotifications(messages) {
  if (!messages || messages.length === 0) return { ok: true, count: 0 };

  return new Promise((resolve) => {
    const postData = JSON.stringify(messages);
    const options = {
      hostname: 'exp.host',
      port: 443,
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, data: parsed });
        } catch (e) {
          resolve({ ok: false, error: 'Invalid JSON response from Expo' });
        }
      });
    });

    req.on('error', (e) => {
      console.warn('[Push] Error sending to Expo Push API:', e.message);
      resolve({ ok: false, error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

// Exportable helper for dispatching notifications to specific user(s)
async function sendPushToUsers(userIds, { title, body, data = {} }) {
  await ensureTable();
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) return;

  try {
    const res = await pool.query(
      `SELECT token FROM mobile_push_tokens WHERE user_id = ANY($1::int[])`,
      [ids]
    );

    const tokens = (res.rows || []).map(r => r.token).filter(Boolean);
    if (tokens.length === 0) return { ok: true, sent: 0 };

    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title: title || 'Shipping Wish Notification',
      body: body || '',
      data: { ...data, timestamp: new Date().toISOString() }
    }));

    return await sendExpoPushNotifications(messages);
  } catch (err) {
    console.error('[Push] sendPushToUsers error:', err.message);
    return { ok: false, error: err.message };
  }
}

// POST /api/mobile/push-token — Register or update device token
router.post('/push-token', requireAuth, async (req, res) => {
  await ensureTable();
  const { token, platform, appName } = req.body;
  const userId = req.user.id;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Valid push token is required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO mobile_push_tokens (user_id, token, platform, app_name, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           app_name = EXCLUDED.app_name,
           updated_at = now()
       RETURNING *`,
      [userId, token.trim(), platform || 'unknown', appName || 'shippingwish']
    );

    res.json({ ok: true, message: 'Push token registered successfully.', tokenRecord: result.rows[0] });
  } catch (err) {
    console.error('[Push] Register token error:', err);
    res.status(500).json({ error: 'Could not register push token.' });
  }
});

// DELETE /api/mobile/push-token — Unregister device token (e.g. on logout)
router.delete('/push-token', requireAuth, async (req, res) => {
  await ensureTable();
  const { token } = req.body;
  const userId = req.user.id;

  try {
    if (token) {
      await pool.query(`DELETE FROM mobile_push_tokens WHERE token = $1 AND user_id = $2`, [token, userId]);
    } else {
      await pool.query(`DELETE FROM mobile_push_tokens WHERE user_id = $1`, [userId]);
    }
    res.json({ ok: true, message: 'Push token removed.' });
  } catch (err) {
    console.error('[Push] Delete token error:', err);
    res.status(500).json({ error: 'Could not delete push token.' });
  }
});

// POST /api/mobile/send-test — Send a test notification to the authenticated user
router.post('/send-test', requireAuth, async (req, res) => {
  const { title, body } = req.body;
  const result = await sendPushToUsers(req.user.id, {
    title: title || 'LoadNexus Mobile Alert',
    body: body || 'Test push notification from Shipping Wish Cloud!',
    data: { type: 'test_alert', sender: 'superadmin' }
  });

  res.json({ ok: true, result });
});

module.exports = router;
module.exports.sendPushToUsers = sendPushToUsers;
