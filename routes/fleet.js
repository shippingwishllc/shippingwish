const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: Scoping carrier_id
function getCarrierScope(req) {
  if (req.user.role === 'carrier') return req.user.id;
  return req.query.carrierId || null;
}

// ================= TRUCKS =================

// List trucks
router.get('/trucks', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT t.*, u.name AS carrier_name, u.company_name AS carrier_company,
             d.name AS current_driver_name
      FROM trucks t
      JOIN users u ON u.id = t.carrier_id
      LEFT JOIN drivers d ON d.assigned_truck_id = t.id`;
    let params = [];
    const carrierId = getCarrierScope(req);
    if (carrierId) {
      query += ` WHERE t.carrier_id = $1`;
      params.push(carrierId);
    }
    query += ` ORDER BY t.truck_number ASC`;
    const result = await pool.query(query, params);
    res.json({ trucks: result.rows });
  } catch (err) {
    console.error('List trucks error:', err);
    res.status(500).json({ error: 'Could not load trucks.' });
  }
});

// Create truck
router.post('/trucks', requireAuth, async (req, res) => {
  const { truck_number, vin, plate, insurance_expiry, registration_expiry, inspection_expiry, mileage } = req.body;
  const carrier_id = req.user.role === 'carrier' ? req.user.id : req.body.carrier_id;

  if (!truck_number || !carrier_id) {
    return res.status(400).json({ error: 'Truck number and carrier are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO trucks (carrier_id, truck_number, vin, plate, insurance_expiry, registration_expiry, inspection_expiry, mileage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [carrier_id, truck_number, vin || null, plate || null, insurance_expiry || null, registration_expiry || null, inspection_expiry || null, mileage || 0]
    );
    res.json({ ok: true, truck: result.rows[0] });
  } catch (err) {
    console.error('Create truck error:', err);
    res.status(500).json({ error: 'Could not create truck.' });
  }
});

// Update truck
router.put('/trucks/:id', requireAuth, async (req, res) => {
  const { truck_number, vin, plate, insurance_expiry, registration_expiry, inspection_expiry, mileage, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE trucks
       SET truck_number = $1, vin = $2, plate = $3, insurance_expiry = $4, registration_expiry = $5, inspection_expiry = $6, mileage = $7, status = $8
       WHERE id = $9 RETURNING *`,
      [truck_number, vin || null, plate || null, insurance_expiry || null, registration_expiry || null, inspection_expiry || null, mileage || 0, status || 'active', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Truck not found.' });
    res.json({ ok: true, truck: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update truck.' });
  }
});

// Delete truck
router.delete('/trucks/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM trucks WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete truck.' });
  }
});

// ================= TRAILERS =================

// List trailers
router.get('/trailers', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT tr.*, u.name AS carrier_name, u.company_name AS carrier_company
      FROM trailers tr
      JOIN users u ON u.id = tr.carrier_id`;
    let params = [];
    const carrierId = getCarrierScope(req);
    if (carrierId) {
      query += ` WHERE tr.carrier_id = $1`;
      params.push(carrierId);
    }
    query += ` ORDER BY tr.trailer_number ASC`;
    const result = await pool.query(query, params);
    res.json({ trailers: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load trailers.' });
  }
});

// Create trailer
router.post('/trailers', requireAuth, async (req, res) => {
  const { trailer_number, type, registration_expiry, inspection_expiry, insurance_expiry } = req.body;
  const carrier_id = req.user.role === 'carrier' ? req.user.id : req.body.carrier_id;

  if (!trailer_number || !carrier_id) {
    return res.status(400).json({ error: 'Trailer number and carrier are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO trailers (carrier_id, trailer_number, type, registration_expiry, inspection_expiry, insurance_expiry)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [carrier_id, trailer_number, type || 'Dry Van', registration_expiry || null, inspection_expiry || null, insurance_expiry || null]
    );
    res.json({ ok: true, trailer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not create trailer.' });
  }
});

// Update trailer
router.put('/trailers/:id', requireAuth, async (req, res) => {
  const { trailer_number, type, registration_expiry, inspection_expiry, insurance_expiry, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE trailers
       SET trailer_number = $1, type = $2, registration_expiry = $3, inspection_expiry = $4, insurance_expiry = $5, status = $6
       WHERE id = $7 RETURNING *`,
      [trailer_number, type || 'Dry Van', registration_expiry || null, inspection_expiry || null, insurance_expiry || null, status || 'active', req.params.id]
    );
    res.json({ ok: true, trailer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update trailer.' });
  }
});

// Delete trailer
router.delete('/trailers/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM trailers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete trailer.' });
  }
});

// ================= DRIVERS =================

// List drivers
router.get('/drivers', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT d.*, u.name AS carrier_name, u.company_name AS carrier_company,
             t.truck_number, tr.trailer_number
      FROM drivers d
      JOIN users u ON u.id = d.carrier_id
      LEFT JOIN trucks t ON t.id = d.assigned_truck_id
      LEFT JOIN trailers tr ON tr.id = d.assigned_trailer_id`;
    let params = [];
    const carrierId = getCarrierScope(req);
    if (carrierId) {
      query += ` WHERE d.carrier_id = $1`;
      params.push(carrierId);
    }
    query += ` ORDER BY d.name ASC`;
    const result = await pool.query(query, params);
    res.json({ drivers: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load drivers.' });
  }
});

// Create driver
router.post('/drivers', requireAuth, async (req, res) => {
  const { name, phone, email, license_number, cdl_expiry, medical_expiry, assigned_truck_id, assigned_trailer_id, status } = req.body;
  const carrier_id = req.user.role === 'carrier' ? req.user.id : req.body.carrier_id;

  if (!name || !carrier_id) {
    return res.status(400).json({ error: 'Driver name and carrier are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO drivers (carrier_id, name, phone, email, license_number, cdl_expiry, medical_expiry, assigned_truck_id, assigned_trailer_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [carrier_id, name, phone || null, email || null, license_number || null, cdl_expiry || null, medical_expiry || null, assigned_truck_id || null, assigned_trailer_id || null, status || 'available']
    );
    res.json({ ok: true, driver: result.rows[0] });
  } catch (err) {
    console.error('Create driver error:', err);
    res.status(500).json({ error: 'Could not create driver.' });
  }
});

// Update driver
router.put('/drivers/:id', requireAuth, async (req, res) => {
  const { name, phone, email, license_number, cdl_expiry, medical_expiry, assigned_truck_id, assigned_trailer_id, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE drivers
       SET name = $1, phone = $2, email = $3, license_number = $4, cdl_expiry = $5, medical_expiry = $6,
           assigned_truck_id = $7, assigned_trailer_id = $8, status = $9
       WHERE id = $10 RETURNING *`,
      [name, phone || null, email || null, license_number || null, cdl_expiry || null, medical_expiry || null, assigned_truck_id || null, assigned_trailer_id || null, status || 'available', req.params.id]
    );
    res.json({ ok: true, driver: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update driver.' });
  }
});

// Delete driver
router.delete('/drivers/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete driver.' });
  }
});

module.exports = router;
