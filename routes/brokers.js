const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// List brokers — with quick search by name or MC number
router.get('/', requireAuth, async (req, res) => {
  const { search } = req.query;
  try {
    let query = `SELECT * FROM brokers`;
    let params = [];
    if (search) {
      query += ` WHERE lower(company_name) LIKE lower($1) OR lower(mc_number) LIKE lower($1) OR lower(contact_person) LIKE lower($1)`;
      params.push(`%${search}%`);
    }
    query += ` ORDER BY company_name ASC`;
    const result = await pool.query(query, params);
    res.json({ brokers: result.rows });
  } catch (err) {
    console.error('List brokers error:', err);
    res.status(500).json({ error: 'Could not load brokers.' });
  }
});

// Create a broker — dispatcher/admin
router.post('/', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { company_name, mc_number, contact_person, email, phone, credit_rating, notes } = req.body;
  if (!company_name) return res.status(400).json({ error: 'Broker company name is required.' });

  try {
    if (mc_number) {
      const existing = await pool.query('SELECT id FROM brokers WHERE lower(mc_number) = lower($1)', [mc_number]);
      if (existing.rows.length) return res.status(409).json({ error: 'A broker with this MC number already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO brokers (company_name, mc_number, contact_person, email, phone, credit_rating, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [company_name, mc_number || null, contact_person || null, email || null, phone || null, credit_rating || 'A', notes || null]
    );
    res.json({ ok: true, broker: result.rows[0] });
  } catch (err) {
    console.error('Create broker error:', err);
    res.status(500).json({ error: 'Could not create broker.' });
  }
});

// Get single broker detail + load history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const brokerRes = await pool.query('SELECT * FROM brokers WHERE id = $1', [req.params.id]);
    if (!brokerRes.rows.length) return res.status(404).json({ error: 'Broker not found.' });

    const loadsRes = await pool.query(
      `SELECT l.id, l.load_number, l.pickup_location, l.delivery_location, l.rate, l.status, l.created_at,
              u.name AS carrier_name
       FROM loads l
       LEFT JOIN users u ON u.id = l.carrier_id
       WHERE l.broker_id = $1 OR lower(l.broker_name) = lower($2)
       ORDER BY l.created_at DESC LIMIT 20`,
      [req.params.id, brokerRes.rows[0].company_name]
    );

    res.json({ broker: brokerRes.rows[0], loads: loadsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load broker details.' });
  }
});

// Update broker — dispatcher/admin
router.put('/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { company_name, mc_number, contact_person, email, phone, credit_rating, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE brokers
       SET company_name = $1, mc_number = $2, contact_person = $3, email = $4, phone = $5, credit_rating = $6, notes = $7
       WHERE id = $8 RETURNING *`,
      [company_name, mc_number || null, contact_person || null, email || null, phone || null, credit_rating || 'A', notes || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Broker not found.' });
    res.json({ ok: true, broker: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update broker.' });
  }
});

// Delete broker — admin/super_admin
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM brokers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete broker.' });
  }
});

module.exports = router;
