const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// List fuel purchases
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT fp.*, u.name AS carrier_name, t.truck_number, d.name AS driver_name
      FROM fuel_purchases fp
      JOIN users u ON u.id = fp.carrier_id
      LEFT JOIN trucks t ON t.id = fp.truck_id
      LEFT JOIN drivers d ON d.id = fp.driver_id`;
    let params = [];

    if (req.user.role === 'carrier') {
      query += ` WHERE fp.carrier_id = $1`;
      params.push(req.user.id);
    } else if (req.query.carrierId) {
      query += ` WHERE fp.carrier_id = $1`;
      params.push(req.query.carrierId);
    }

    query += ` ORDER BY fp.purchase_date DESC`;
    const result = await pool.query(query, params);
    res.json({ purchases: result.rows });
  } catch (err) {
    console.error('List fuel error:', err);
    res.status(500).json({ error: 'Could not load fuel purchases.' });
  }
});

// Add fuel purchase
router.post('/', requireAuth, async (req, res) => {
  const { truck_id, driver_id, purchase_date, state, gallons, cost, station_name } = req.body;
  const carrier_id = req.user.role === 'carrier' ? req.user.id : req.body.carrier_id;

  if (!purchase_date || !state || !gallons || !cost || !carrier_id) {
    return res.status(400).json({ error: 'Date, state, gallons, cost, and carrier are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO fuel_purchases (carrier_id, truck_id, driver_id, purchase_date, state, gallons, cost, station_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [carrier_id, truck_id || null, driver_id || null, purchase_date, state.toUpperCase().slice(0, 2), gallons, cost, station_name || null]
    );
    res.json({ ok: true, purchase: result.rows[0] });
  } catch (err) {
    console.error('Add fuel error:', err);
    res.status(500).json({ error: 'Could not log fuel purchase.' });
  }
});

// Delete fuel log
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'carrier') {
      await pool.query('DELETE FROM fuel_purchases WHERE id = $1 AND carrier_id = $2', [req.params.id, req.user.id]);
    } else {
      await pool.query('DELETE FROM fuel_purchases WHERE id = $1', [req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete fuel record.' });
  }
});

module.exports = router;
