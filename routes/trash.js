const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getRetentionDays,
  enrichTrashItem,
  purgeExpiredTrash,
  permanentlyDeleteItem,
  maybeAutoPurgeTrash
} = require('../utils/trash');

const router = express.Router();
const adminOnly = requireRole('admin', 'super_admin');

router.get('/', requireAuth, adminOnly, async (req, res) => {
  const type = String(req.query.type || 'loads').toLowerCase();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage || '20', 10)));
  const offset = (page - 1) * perPage;

  try {
    await maybeAutoPurgeTrash();

    let items = [];
    let total = 0;

    if (type === 'loads') {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM loads WHERE deleted_at IS NOT NULL`);
      total = countRes.rows[0]?.count || 0;
      const result = await pool.query(
        `SELECT l.id, l.load_number, l.status, l.rate, l.pickup_location, l.delivery_location,
                l.deleted_at, u.name AS carrier_name, u.company_name AS carrier_company,
                du.name AS deleted_by_name
         FROM loads l
         JOIN users u ON u.id = l.carrier_id
         LEFT JOIN users du ON du.id = l.deleted_by
         WHERE l.deleted_at IS NOT NULL
         ORDER BY l.deleted_at DESC
         LIMIT $1 OFFSET $2`,
        [perPage, offset]
      );
      items = result.rows.map((r) => enrichTrashItem({ type: 'load', ...r }));
    } else if (type === 'users') {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NOT NULL`);
      total = countRes.rows[0]?.count || 0;
      const result = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.company_name, u.phone, u.mc_number,
                u.deleted_at, du.name AS deleted_by_name
         FROM users u
         LEFT JOIN users du ON du.id = u.deleted_by
         WHERE u.deleted_at IS NOT NULL
         ORDER BY u.deleted_at DESC
         LIMIT $1 OFFSET $2`,
        [perPage, offset]
      );
      items = result.rows.map((r) => enrichTrashItem({ type: 'user', ...r }));
    } else if (type === 'drivers') {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM drivers WHERE deleted_at IS NOT NULL`);
      total = countRes.rows[0]?.count || 0;
      const result = await pool.query(
        `SELECT d.id, d.name, d.phone, d.email, d.deleted_at,
                u.name AS carrier_name, u.company_name AS carrier_company,
                du.name AS deleted_by_name
         FROM drivers d
         JOIN users u ON u.id = d.carrier_id
         LEFT JOIN users du ON du.id = d.deleted_by
         WHERE d.deleted_at IS NOT NULL
         ORDER BY d.deleted_at DESC
         LIMIT $1 OFFSET $2`,
        [perPage, offset]
      );
      items = result.rows.map((r) => enrichTrashItem({ type: 'driver', ...r }));
    } else if (type === 'emails') {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM email_inbound WHERE deleted_at IS NOT NULL`);
      total = countRes.rows[0]?.count || 0;
      const result = await pool.query(
        `SELECT i.id, i.from_email, i.subject, i.created_at AS received_at, i.deleted_at,
                l.company_name, l.owner_name,
                du.name AS deleted_by_name
         FROM email_inbound i
         LEFT JOIN crm_leads l ON l.id = i.lead_id
         LEFT JOIN users du ON du.id = i.deleted_by
         WHERE i.deleted_at IS NOT NULL
         ORDER BY i.deleted_at DESC
         LIMIT $1 OFFSET $2`,
        [perPage, offset]
      );
      items = result.rows.map((r) => enrichTrashItem({ type: 'email', ...r }));
    } else {
      return res.status(400).json({ error: 'Invalid type. Use loads, users, drivers, or emails.' });
    }

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    res.json({
      items,
      total,
      page,
      perPage,
      totalPages,
      type,
      retentionDays: getRetentionDays()
    });
  } catch (err) {
    console.error('Trash list error:', err);
    res.status(500).json({ error: 'Could not load trash.' });
  }
});

router.get('/counts', requireAuth, adminOnly, async (req, res) => {
  try {
    await maybeAutoPurgeTrash();
    const loads = await pool.query(`SELECT COUNT(*)::int AS count FROM loads WHERE deleted_at IS NOT NULL`);
    const users = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NOT NULL`);
    const drivers = await pool.query(`SELECT COUNT(*)::int AS count FROM drivers WHERE deleted_at IS NOT NULL`);
    const emails = await pool.query(`SELECT COUNT(*)::int AS count FROM email_inbound WHERE deleted_at IS NOT NULL`);
    res.json({
      loads: loads.rows[0]?.count || 0,
      users: users.rows[0]?.count || 0,
      drivers: drivers.rows[0]?.count || 0,
      emails: emails.rows[0]?.count || 0,
      total:
        (loads.rows[0]?.count || 0) +
        (users.rows[0]?.count || 0) +
        (drivers.rows[0]?.count || 0) +
        (emails.rows[0]?.count || 0),
      retentionDays: getRetentionDays()
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load trash counts.' });
  }
});

router.post('/restore', requireAuth, adminOnly, async (req, res) => {
  const { type, id } = req.body || {};
  const TYPE_MAP = { load: 'loads', user: 'users', driver: 'drivers', email: 'email_inbound' };
  const table = TYPE_MAP[type];
  if (!table || !id) {
    return res.status(400).json({ error: 'type and id are required (load, user, driver, email).' });
  }

  try {
    if (type === 'user') {
      const check = await pool.query('SELECT role FROM users WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
      if (!check.rows.length) return res.status(404).json({ error: 'Item not found in trash.' });
      const dup = await pool.query(
        `SELECT id FROM users WHERE lower(email) = lower((SELECT email FROM users WHERE id = $1)) AND deleted_at IS NULL AND id != $1`,
        [id]
      );
      if (dup.rows.length) {
        return res.status(409).json({ error: 'Cannot restore — another active account uses this email.' });
      }
    }

    const result = await pool.query(
      `UPDATE ${table} SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found in trash.' });
    res.json({ ok: true, message: 'Restored successfully.' });
  } catch (err) {
    console.error('Trash restore error:', err);
    res.status(500).json({ error: 'Could not restore item.' });
  }
});

router.post('/purge-permanent', requireAuth, adminOnly, async (req, res) => {
  const { type, id, confirm } = req.body || {};
  if (confirm !== 'DELETE_FOREVER') {
    return res.status(400).json({
      error: 'Confirmation required.',
      hint: 'Send { "confirm": "DELETE_FOREVER" } with type and id.'
    });
  }
  if (!type || !id) {
    return res.status(400).json({ error: 'type and id are required.' });
  }

  try {
    const ok = await permanentlyDeleteItem(type, id);
    if (!ok) return res.status(404).json({ error: 'Item not found in trash or could not delete.' });
    res.json({ ok: true, message: 'Permanently deleted. This cannot be undone.' });
  } catch (err) {
    console.error('Trash permanent delete error:', err);
    res.status(500).json({ error: 'Could not permanently delete item.' });
  }
});

router.post('/run-auto-purge', requireAuth, adminOnly, async (req, res) => {
  try {
    const result = await purgeExpiredTrash();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Auto-purge failed.' });
  }
});

module.exports = router;
