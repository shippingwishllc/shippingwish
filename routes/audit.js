const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit-logs — Admin & Super Admin audit log viewer
router.get('/', requireAuth, requireRole('super_admin', 'admin'), async (req, res) => {
  const limit = parseInt(req.query.limit || 50, 10);
  const page = parseInt(req.query.page || 1, 10);
  const offset = (page - 1) * limit;
  const actionFilter = req.query.action || null;
  const entityFilter = req.query.entity || null;

  try {
    let query = `
      SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE 1=1`;
    let params = [];

    if (actionFilter) {
      params.push(`%${actionFilter}%`);
      query += ` AND a.action ILIKE $${params.length}`;
    }

    if (entityFilter) {
      params.push(entityFilter);
      query += ` AND a.entity_type = $${params.length}`;
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const logsRes = await pool.query(query, params);

    const countRes = await pool.query(`SELECT COUNT(*) FROM audit_log`);

    res.json({
      logs: logsRes.rows,
      total: parseInt(countRes.rows[0].count || 0, 10),
      page,
      limit
    });
  } catch (err) {
    console.error('Fetch audit log error:', err);
    res.status(500).json({ error: 'Could not load audit logs.' });
  }
});

module.exports = router;
