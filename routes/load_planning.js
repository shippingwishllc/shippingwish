const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/load-planning - List future load availability plans
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT lp.*, d.name as driver_name, d.phone as driver_phone, t.truck_number, u.name as planner_name
      FROM load_plans lp
      JOIN drivers d ON lp.driver_id = d.id
      JOIN trucks t ON lp.truck_id = t.id
      LEFT JOIN users u ON lp.created_by = u.id
    `;
    const params = [];

    // If Dispatcher, filter by trucks assigned to them
    if (req.user.role === 'dispatcher') {
      query += ` JOIN dispatcher_trucks dt ON lp.truck_id = dt.truck_id WHERE dt.dispatcher_id = $1`;
      params.push(req.user.id);
    } else if (req.user.role === 'carrier' || req.user.role === 'carrier_admin') {
      query += ` WHERE d.carrier_id = $1`;
      params.push(req.user.id);
    } else if (req.user.role === 'driver') {
      query += ` WHERE d.user_id = $1`;
      params.push(req.user.id);
    } else if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.json({ load_plans: [] });
    }

    query += ` ORDER BY lp.available_date ASC, lp.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ load_plans: result.rows });
  } catch (err) {
    console.error('Error fetching load plans:', err);
    res.status(500).json({ error: 'Server error fetching load plans' });
  }
});

// POST /api/load-planning - Create driver future availability plan
router.post('/', requireAuth, async (req, res) => {
  try {
    const { driver_id, truck_id, available_date, pickup_location, delivery_preference, notes } = req.body;

    if (!driver_id || !truck_id || !available_date || !pickup_location) {
      return res.status(400).json({ error: 'Driver, Truck, Available Date, and Pickup Location are required' });
    }

    if (req.user.role === 'carrier' || req.user.role === 'carrier_admin') {
      const d = await pool.query('SELECT id FROM drivers WHERE id = $1 AND carrier_id = $2', [driver_id, req.user.id]);
      const t = await pool.query('SELECT id FROM trucks WHERE id = $1 AND carrier_id = $2', [truck_id, req.user.id]);
      if (!d.rows.length || !t.rows.length) {
        return res.status(403).json({ error: 'That driver or truck is not on your fleet.' });
      }
    }

    const result = await pool.query(
      `INSERT INTO load_plans (
        driver_id, truck_id, available_date, pickup_location, delivery_preference, notes, created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
      RETURNING *`,
      [driver_id, truck_id, available_date, pickup_location, delivery_preference || '', notes || '', req.user.id]
    );

    res.status(201).json({ message: 'Driver load availability scheduled successfully', load_plan: result.rows[0] });
  } catch (err) {
    console.error('Error creating load plan:', err);
    res.status(500).json({ error: 'Server error creating load plan' });
  }
});

// PUT /api/load-planning/:id/status - Update plan status
router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['scheduled', 'booked', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid load plan status' });
    }

    if (req.user.role === 'carrier' || req.user.role === 'carrier_admin') {
      const own = await pool.query(
        `SELECT lp.id FROM load_plans lp
         JOIN drivers d ON d.id = lp.driver_id
         WHERE lp.id = $1 AND d.carrier_id = $2`,
        [id, req.user.id]
      );
      if (!own.rows.length) return res.status(403).json({ error: 'That availability row is not yours.' });
    }

    const result = await pool.query(
      `UPDATE load_plans SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    res.json({ message: 'Load plan status updated', load_plan: result.rows[0] });
  } catch (err) {
    console.error('Error updating load plan status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
