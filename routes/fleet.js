const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enforceTruckSubscriptionLimit, syncTruckLocationToAiDispatch } = require('../utils/carrier-sync');

const router = express.Router();

async function assertOwnedFleetRow(req, table, id) {
  const allowed = { trucks: true, trailers: true, drivers: true };
  if (!allowed[table]) return { status: 400, error: 'Invalid fleet table.' };
  const r = await pool.query(`SELECT carrier_id FROM ${table} WHERE id = $1`, [id]);
  if (!r.rows.length) return { status: 404, error: 'Not found.' };
  const carrier_id = r.rows[0].carrier_id;
  const staff = ['dispatcher', 'admin', 'super_admin'].includes(req.user.role);
  if (staff) return { ok: true, carrier_id };
  if (['carrier', 'carrier_admin'].includes(req.user.role) && carrier_id === req.user.id) {
    return { ok: true, carrier_id };
  }
  return { status: 403, error: 'You can only change your own fleet.' };
}

// Helper: Scoping carrier_id
function getCarrierScope(req) {
  if (req.user.role === 'carrier') return req.user.id;
  return req.query.carrierId || null;
}

// ================= CARRIER CLIENT COMPANIES =================

// List carriers
router.get('/carriers', requireAuth, async (req, res) => {
  try {
    let query, params = [];
    if (req.user.role === 'carrier') {
      query = `
        SELECT u.id, u.name, u.company_name, u.phone, u.email, u.mc_number, u.dot_number,
               u.dispatch_fee_percent, u.equipment_category, u.billing_notes, u.is_suspended, u.created_at,
               dc.dispatcher_id, disp.name AS dispatcher_name, disp.email AS dispatcher_email,
               (SELECT COUNT(*) FROM trucks WHERE carrier_id = u.id) AS truck_count,
               (SELECT COUNT(*) FROM drivers WHERE carrier_id = u.id AND deleted_at IS NULL) AS driver_count
        FROM users u
        LEFT JOIN dispatcher_carriers dc ON dc.carrier_id = u.id
        LEFT JOIN users disp ON dc.dispatcher_id = disp.id
        WHERE u.id = $1 AND u.role = 'carrier'`;
      params = [req.user.id];
    } else if (req.user.role === 'dispatcher') {
      query = `
        SELECT u.id, u.name, u.company_name, u.phone, u.email, u.mc_number, u.dot_number,
               u.dispatch_fee_percent, u.equipment_category, u.billing_notes, u.is_suspended, u.created_at,
               dc.dispatcher_id, disp.name AS dispatcher_name, disp.email AS dispatcher_email,
               (SELECT COUNT(*) FROM trucks WHERE carrier_id = u.id) AS truck_count,
               (SELECT COUNT(*) FROM drivers WHERE carrier_id = u.id AND deleted_at IS NULL) AS driver_count
        FROM users u
        LEFT JOIN dispatcher_carriers dc ON dc.carrier_id = u.id
        LEFT JOIN users disp ON dc.dispatcher_id = disp.id
        WHERE u.role = 'carrier' AND (dc.dispatcher_id = $1 OR dc.dispatcher_id IS NULL)
        ORDER BY u.created_at DESC`;
      params = [req.user.id];
    } else {
      query = `
        SELECT u.id, u.name, u.company_name, u.phone, u.email, u.mc_number, u.dot_number,
               u.dispatch_fee_percent, u.equipment_category, u.billing_notes, u.is_suspended, u.created_at,
               dc.dispatcher_id, disp.name AS dispatcher_name, disp.email AS dispatcher_email,
               (SELECT COUNT(*) FROM trucks WHERE carrier_id = u.id) AS truck_count,
               (SELECT COUNT(*) FROM drivers WHERE carrier_id = u.id AND deleted_at IS NULL) AS driver_count
        FROM users u
        LEFT JOIN dispatcher_carriers dc ON dc.carrier_id = u.id
        LEFT JOIN users disp ON dc.dispatcher_id = disp.id
        WHERE u.role = 'carrier'
        ORDER BY u.created_at DESC`;
      params = [];
    }
    const result = await pool.query(query, params);
    res.json({ carriers: result.rows });
  } catch (err) {
    console.error('List fleet carriers error:', err);
    res.status(500).json({ error: 'Could not load carrier companies.' });
  }
});

// List dispatchers (for assignment dropdown)
router.get('/dispatchers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email FROM users WHERE role = 'dispatcher' AND is_suspended IS NOT TRUE ORDER BY name ASC`
    );
    res.json({ dispatchers: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load dispatchers.' });
  }
});

// Create carrier client company
router.post('/carriers', requireAuth, async (req, res) => {
  if (!['admin', 'super_admin', 'dispatcher'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied. Only staff can create carrier companies.' });
  }

  const { company_name, owner_name, email, password, phone, mc_number, dot_number, dispatcher_id, dispatch_fee_percent } = req.body;

  if (!company_name || !phone || !email || !password) {
    return res.status(400).json({ error: 'Company Name, Phone, Email, and Password are required.' });
  }

  const bcrypt = require('bcryptjs');
  const safeEmail = email.trim().toLowerCase();

  try {
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [safeEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'A user account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const feeNum = parseFloat(dispatch_fee_percent) || 5.0;

    const userRes = await pool.query(
      `INSERT INTO users (name, company_name, email, phone, mc_number, dot_number, role, password_hash, dispatch_fee_percent)
       VALUES ($1, $2, $3, $4, $5, $6, 'carrier', $7, $8)
       RETURNING id, name, company_name, email, phone, mc_number, dot_number, role, dispatch_fee_percent, created_at`,
      [owner_name || company_name, company_name, safeEmail, phone, mc_number || null, dot_number || null, passwordHash, feeNum]
    );
    const carrier = userRes.rows[0];

    // Assign dispatcher if provided
    const targetDispatcherId = dispatcher_id || (req.user.role === 'dispatcher' ? req.user.id : null);
    if (targetDispatcherId) {
      await pool.query(
        `INSERT INTO dispatcher_carriers (dispatcher_id, carrier_id) VALUES ($1, $2)
         ON CONFLICT (dispatcher_id, carrier_id) DO NOTHING`,
        [targetDispatcherId, carrier.id]
      ).catch(() => {});
    }

    // Synchronize to ai_dispatch_carriers for AI Dispatch auto-matching
    await pool.query(
      `INSERT INTO ai_dispatch_carriers (company_name, contact_name, phone, email, mc_number, dot_number, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (company_name) DO UPDATE SET phone = EXCLUDED.phone, email = EXCLUDED.email, is_active = true`,
      [company_name, owner_name || company_name, phone, safeEmail, mc_number || null, dot_number || null]
    ).catch(() => {});

    res.json({ ok: true, carrier });
  } catch (err) {
    console.error('Create carrier error:', err);
    res.status(500).json({ error: err.message || 'Could not create carrier company.' });
  }
});

// Update carrier client company
router.put('/carriers/:id', requireAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  const { company_name, owner_name, email, password, phone, mc_number, dot_number, dispatcher_id, dispatch_fee_percent, is_suspended } = req.body;
  const carrierId = req.params.id;

  try {
    const bcrypt = require('bcryptjs');
    let hashUpdate = '';
    let params = [owner_name || company_name, company_name, phone, mc_number || null, dot_number || null, parseFloat(dispatch_fee_percent) || 5.0, is_suspended === true || is_suspended === 'true', carrierId];

    if (password && password.length >= 4) {
      const hash = await bcrypt.hash(password, 10);
      params.push(hash);
      hashUpdate = `, password_hash = $${params.length}`;
    }

    if (email) {
      params.push(email.trim().toLowerCase());
      hashUpdate += `, email = $${params.length}`;
    }

    const result = await pool.query(
      `UPDATE users
       SET name = $1, company_name = $2, phone = $3, mc_number = $4, dot_number = $5, dispatch_fee_percent = $6, is_suspended = $7 ${hashUpdate}
       WHERE id = $8 AND role = 'carrier'
       RETURNING id, name, company_name, email, phone, mc_number, dot_number, dispatch_fee_percent, is_suspended`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Carrier not found.' });

    if (dispatcher_id !== undefined) {
      await pool.query('DELETE FROM dispatcher_carriers WHERE carrier_id = $1', [carrierId]);
      if (dispatcher_id) {
        await pool.query('INSERT INTO dispatcher_carriers (dispatcher_id, carrier_id) VALUES ($1, $2)', [dispatcher_id, carrierId]);
      }
    }

    res.json({ ok: true, carrier: result.rows[0] });
  } catch (err) {
    console.error('Update carrier error:', err);
    res.status(500).json({ error: 'Could not update carrier company.' });
  }
});

// Delete / suspend carrier company
router.delete('/carriers/:id', requireAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied.' });
  }
  const carrierId = req.params.id;
  try {
    await pool.query(`UPDATE users SET is_suspended = true, deleted_at = now() WHERE id = $1 AND role = 'carrier'`, [carrierId]);
    res.json({ ok: true, message: 'Carrier company deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove carrier.' });
  }
});

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

  // 1. Subscription Guard: Enforce maximum allowed trucks per pricing plan
  const limitCheck = await enforceTruckSubscriptionLimit(carrier_id, req.user.role);
  if (!limitCheck.allowed) {
    return res.status(403).json({
      error: limitCheck.reason,
      code: 'TRUCK_LIMIT_REACHED',
      current_count: limitCheck.currentCount,
      max_allowed: limitCheck.maxAllowed,
      upgradeUrl: limitCheck.upgradeUrl || '/pricing'
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO trucks (carrier_id, truck_number, vin, plate, insurance_expiry, registration_expiry, inspection_expiry, mileage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [carrier_id, truck_number, vin || null, plate || null, insurance_expiry || null, registration_expiry || null, inspection_expiry || null, mileage || 0]
    );

    // 2. Synchronize initial empty location & equipment to AI Dispatch Brain
    if (req.body.empty_zip || req.body.location || req.body.equipment_type || req.body.prefer_destination) {
      await syncTruckLocationToAiDispatch(carrier_id, {
        empty_zip: req.body.empty_zip || req.body.location,
        equipment: req.body.equipment_type,
        prefer_destination: req.body.prefer_destination
      }).catch(() => {});
    }

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

    if (req.body.empty_zip || req.body.location || req.body.equipment_type || req.body.prefer_destination) {
      await syncTruckLocationToAiDispatch(result.rows[0].carrier_id, {
        empty_zip: req.body.empty_zip || req.body.location,
        equipment: req.body.equipment_type,
        prefer_destination: req.body.prefer_destination
      }).catch(() => {});
    }

    res.json({ ok: true, truck: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update truck.' });
  }
});

// Delete truck (Admin or owning carrier only)
router.delete('/trucks/:id', requireAuth, async (req, res) => {
  try {
    const gate = await assertOwnedFleetRow(req, 'trucks', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    if (!['admin', 'super_admin'].includes(req.user.role) && gate.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied. Only Admins or the owning carrier can delete trucks.' });
    }
    await pool.query('DELETE FROM trucks WHERE id = $1', [req.params.id]);
    res.json({ ok: true, message: 'Truck deleted successfully.' });
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

// Delete trailer (Admin or owning carrier only)
router.delete('/trailers/:id', requireAuth, async (req, res) => {
  try {
    const gate = await assertOwnedFleetRow(req, 'trailers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    if (!['admin', 'super_admin'].includes(req.user.role) && gate.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied. Only Admins or the owning carrier can delete trailers.' });
    }
    await pool.query('DELETE FROM trailers WHERE id = $1', [req.params.id]);
    res.json({ ok: true, message: 'Trailer deleted successfully.' });
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
  const { name, phone, email, password, license_number, cdl_expiry, medical_expiry, assigned_truck_id, assigned_trailer_id, status } = req.body;
  const carrier_id = req.user.role === 'carrier' ? req.user.id : req.body.carrier_id;

  if (!name || !carrier_id) {
    return res.status(400).json({ error: 'Driver name and carrier are required.' });
  }

  try {
    let userId = null;
    const safeEmail = email ? String(email).trim().toLowerCase() : null;

    if (safeEmail && password && password.length >= 4) {
      const bcrypt = require('bcryptjs');
      const existingUser = await pool.query('SELECT id, role FROM users WHERE lower(email) = lower($1)', [safeEmail]);
      if (existingUser.rows.length) {
        if (existingUser.rows[0].role === 'driver') {
          userId = existingUser.rows[0].id;
          const hash = await bcrypt.hash(password, 10);
          await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
        }
      } else {
        const hash = await bcrypt.hash(password, 10);
        const cRow = await pool.query('SELECT company_name, name FROM users WHERE id = $1', [carrier_id]);
        const compName = cRow.rows[0] ? (cRow.rows[0].company_name || cRow.rows[0].name) : 'Shipping Wish Fleet';
        const insUser = await pool.query(
          `INSERT INTO users (name, email, password_hash, role, company_name, phone, organization_id)
           VALUES ($1, $2, $3, 'driver', $4, $5, $6) RETURNING id`,
          [name, safeEmail, hash, compName, phone || null, carrier_id]
        );
        userId = insUser.rows[0].id;
      }
    }

    await pool.query(
      `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`
    ).catch(() => {});

    const result = await pool.query(
      `INSERT INTO drivers (carrier_id, name, phone, email, license_number, cdl_expiry, medical_expiry, assigned_truck_id, assigned_trailer_id, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [carrier_id, name, phone || null, safeEmail || null, license_number || null, cdl_expiry || null, medical_expiry || null, assigned_truck_id || null, assigned_trailer_id || null, status || 'available', userId]
    );
    res.json({ ok: true, driver: result.rows[0], user_created: !!userId });
  } catch (err) {
    console.error('Create driver error:', err);
    res.status(500).json({ error: 'Could not create driver.' });
  }
});

// Update driver
router.put('/drivers/:id', requireAuth, async (req, res) => {
  const { name, phone, email, password, license_number, cdl_expiry, medical_expiry, assigned_truck_id, assigned_trailer_id, status } = req.body;
  try {
    const gate = await assertOwnedFleetRow(req, 'drivers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    let userId = null;
    const safeEmail = email ? String(email).trim().toLowerCase() : null;

    if (password && password.length >= 4) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(password, 10);
      const drRow = await pool.query('SELECT user_id, email, name, carrier_id FROM drivers WHERE id = $1', [req.params.id]);
      if (drRow.rows.length && drRow.rows[0].user_id) {
        userId = drRow.rows[0].user_id;
        await pool.query('UPDATE users SET password_hash = $1, email = COALESCE($2, email) WHERE id = $3', [hash, safeEmail, userId]);
      } else if (safeEmail) {
        const cRow = await pool.query('SELECT company_name, name FROM users WHERE id = $1', [drRow.rows[0]?.carrier_id || gate.carrier_id]);
        const compName = cRow.rows[0] ? (cRow.rows[0].company_name || cRow.rows[0].name) : 'Shipping Wish Fleet';
        const insUser = await pool.query(
          `INSERT INTO users (name, email, password_hash, role, company_name, phone, organization_id)
           VALUES ($1, $2, $3, 'driver', $4, $5, $6)
           ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash
           RETURNING id`,
          [name, safeEmail, hash, compName, phone || null, gate.carrier_id]
        );
        userId = insUser.rows[0]?.id;
      }
    }

    const result = await pool.query(
      `UPDATE drivers
       SET name = $1, phone = $2, email = $3, license_number = $4, cdl_expiry = $5, medical_expiry = $6,
           assigned_truck_id = $7, assigned_trailer_id = $8, status = $9,
           user_id = COALESCE($10, user_id)
       WHERE id = $11 RETURNING *`,
      [name, phone || null, safeEmail || null, license_number || null, cdl_expiry || null, medical_expiry || null, assigned_truck_id || null, assigned_trailer_id || null, status || 'available', userId, req.params.id]
    );
    res.json({ ok: true, driver: result.rows[0] });
  } catch (err) {
    console.error('Update driver error:', err);
    res.status(500).json({ error: 'Could not update driver.' });
  }
});

// Delete driver (Admin or owning carrier only)
router.delete('/drivers/:id', requireAuth, async (req, res) => {
  try {
    const gate = await assertOwnedFleetRow(req, 'drivers', req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    if (!['admin', 'super_admin'].includes(req.user.role) && gate.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied. Only Admins or the owning carrier can remove drivers.' });
    }
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
