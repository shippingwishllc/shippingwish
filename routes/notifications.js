const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — Fetch user notifications
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const limit = parseInt(req.query.limit || 20, 10);
  const page = parseInt(req.query.page || 1, 10);
  const offset = (page - 1) * limit;

  try {
    const listRes = await pool.query(
      `SELECT id, title, message, type, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY is_read ASC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(CASE WHEN is_read = FALSE THEN 1 END) AS unread
       FROM notifications
       WHERE user_id = $1`,
      [userId]
    );

    res.json({
      notifications: listRes.rows,
      total: parseInt(countRes.rows[0].total || 0, 10),
      unreadCount: parseInt(countRes.rows[0].unread || 0, 10),
      page,
      limit
    });
  } catch (err) {
    console.error('Notifications list error:', err);
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

// GET /api/notifications/unread-count — Quick bell badge count
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ unreadCount: parseInt(countRes.rows[0].unread || 0, 10) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Could not get unread count.' });
  }
});

// PUT /api/notifications/:id/read — Mark single notification read
router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Could not update notification.' });
  }
});

// PUT /api/notifications/read-all — Mark all notifications read
router.put('/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Could not mark notifications as read.' });
  }
});

module.exports = router;
