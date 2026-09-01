const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function assertOwnedFleetRow(req, table, id) {
  const allowed = { trucks: true, trailers: true, drivers: true };
  if (!allowed[table]) return { status: 400, error: 'Invalid fleet table.' };
  const r = await pool.query(`SELECT carrier_id FROM ${table} WHERE id = $1`, [id]);
  if (!r.rows.length) return { status: 404, error: 'Not found.' };
  const staff = ['dispatcher', 'admin', 'super_admin'].includes(req.user.role);
  if (staff) return { ok: true };
  if (req.user.role === 'carrier' && r.rows[0].carrier_id === req.user.id) return { ok: true };
  return { status: 403, error: 'You can only change your own fleet.' };
}

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
    const gate = await assertOwnedFleetRow(req, 'trucks', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
router.delete('/trucks/:id', requireAuth, async (req, res) => {
  try {
    const gate = await assertOwnedFleetRow(req, 'trucks', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
    const gate = await assertOwnedFleetRow(req, 'trailers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
router.delete('/trailers/:id', requireAuth, async (req, res) => {
  try {
    const gate = await assertOwnedFleetRow(req, 'trailers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
    let where = 'd.deleted_at IS NULL';
    if (carrierId) {
      where += ` AND d.carrier_id = $1`;
      params.push(carrierId);
    }
    query += ` WHERE ${where}`;
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
    const gate = await assertOwnedFleetRow(req, 'drivers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
router.delete('/drivers/:id', requireAuth, async (req, res) => {
  try {
    const gate = await assertOwnedFleetRow(req, 'drivers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    await pool.query(
      'UPDATE drivers SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true, message: 'Driver moved to Trash. Company admin can ask Shipping Wish to restore.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete driver.' });
  }
});

router.post('/drivers/:id/invite', requireAuth, async (req, res) => {
  try {
    const gate = await assertOwnedFleetRow(req, 'drivers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const dr = await pool.query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
    const driver = dr.rows[0];
    const email = String(req.body.email || driver.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Driver email is required to invite them to the app.' });

    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const { sendBrandedEmail } = require('../utils/mailer');
    const { COMPANY, APP_URL } = require('../utils/email-templates');

    let userRow = (await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email])).rows[0];
    let tempPassword = null;
    if (!userRow) {
      tempPassword = crypto.randomBytes(4).toString('hex') + 'Aa1';
      const hash = await bcrypt.hash(tempPassword, 10);
      const ins = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, company_name, phone, organization_id)
         VALUES ($1,$2,$3,'driver',$4,$5,$6) RETURNING *`,
        [driver.name, email, hash, req.user.company_name || req.user.name, driver.phone, req.user.id]
      );
      userRow = ins.rows[0];
    } else if (userRow.role !== 'driver') {
      return res.status(409).json({ error: 'That email already belongs to another account type.' });
    }

    await pool.query(
      `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`
    ).catch(() => {});
    await pool.query(`UPDATE drivers SET user_id = $1, email = $2 WHERE id = $3`, [userRow.id, email, driver.id]);

    const loginUrl = `${APP_URL}/login`;
    const bodyHtml = `<p>You were invited to the Shipping Wish driver app for ${req.user.company_name || req.user.name}.</p>
      <p>Sign in at <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Email: ${email}${tempPassword ? `<br>Temporary password: <strong>${tempPassword}</strong>` : '<br>Use your existing password.'}</p>
      <p>Call operations ${COMPANY.phone} if you cannot get in.</p>`;
    await sendBrandedEmail({
      to: email,
      subject: `Driver app login — ${req.user.company_name || 'Shipping Wish LLC'}`,
      html: `<div style="font-family:Georgia,serif;padding:24px;">${bodyHtml}</div>`,
      text: `Driver app: ${loginUrl}  Email: ${email}${tempPassword ? ' Password: ' + tempPassword : ''}`,
      emailType: 'driver_invite',
      templateKey: 'driver_invite',
      transactional: true
    });

    res.json({
      ok: true,
      message: tempPassword
        ? `Invite sent to ${email}. Temporary password is in that email.`
        : `Invite sent to ${email}. They can sign in with their existing password.`,
      user_id: userRow.id
    });
  } catch (err) {
    console.error('driver invite:', err);
    res.status(500).json({ error: err.message || 'Could not invite driver.' });
  }
});

module.exports = router;
