const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

// GET /api/messages/load/:loadId — Fetch messages for a load
router.get('/load/:loadId', requireAuth, async (req, res) => {
  const { loadId } = req.params;

  try {
    const loadRes = await pool.query(`SELECT carrier_id, dispatcher_id, driver_id FROM loads WHERE id = $1`, [loadId]);
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });

    const load = loadRes.rows[0];
    if (req.user.role === 'carrier' && load.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.user.role === 'dispatcher' && load.dispatcher_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const messagesRes = await pool.query(
      `SELECT m.*, u.name AS sender_name, u.role AS sender_role
       FROM load_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.load_id = $1
       ORDER BY m.created_at ASC`,
      [loadId]
    );

    res.json({ messages: messagesRes.rows });
  } catch (err) {
    console.error('Fetch load messages error:', err);
    res.status(500).json({ error: 'Could not fetch messages.' });
  }
});

// POST /api/messages/load/:loadId — Post a new message
router.post('/load/:loadId', requireAuth, async (req, res) => {
  const { loadId } = req.params;
  const { message, attachmentUrl } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  try {
    const loadRes = await pool.query(`SELECT load_number, carrier_id, dispatcher_id, driver_id FROM loads WHERE id = $1`, [loadId]);
    if (!loadRes.rows.length) return res.status(404).json({ error: 'Load not found.' });

    const load = loadRes.rows[0];
    const senderId = req.user.id;

    const result = await pool.query(
      `INSERT INTO load_messages (load_id, sender_id, message, attachment_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [loadId, senderId, message.trim(), attachmentUrl || null]
    );

    // Notify other parties on load
    const recipients = [load.carrier_id, load.dispatcher_id, load.driver_id]
      .filter(id => id && id !== senderId);

    const uniqueRecipients = [...new Set(recipients)];

    for (const recipientId of uniqueRecipients) {
      await createNotification(
        recipientId,
        `New Message on Load #${load.load_number}`,
        `${req.user.name}: ${message.trim().slice(0, 60)}${message.length > 60 ? '...' : ''}`,
        'info',
        `/load-detail.html?id=${loadId}`
      );
    }

    res.json({ ok: true, message: result.rows[0] });
  } catch (err) {
    console.error('Post load message error:', err);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

module.exports = router;
