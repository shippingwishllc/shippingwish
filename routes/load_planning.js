const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ensureCarriersSyncedToUsers, syncTruckLocationToAiDispatch } = require('../utils/carrier-sync');

// GET /api/load-planning - List future load availability plans
router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureCarriersSyncedToUsers().catch(() => {});
    let query = `
      SELECT lp.*,
             d.name as driver_name,
             d.phone as driver_phone,
             d.carrier_id,
             t.truck_number,
             COALESCE(NULLIF(t.equipment_type, ''), NULLIF(d.equipment_type, ''), NULLIF(cu.equipment_category, ''), '53ft Dry Van') AS equipment_type,
             COALESCE(cu.company_name, cu.name, 'Carrier Fleet') AS carrier_company,
             u.name as planner_name
      FROM load_plans lp
      JOIN drivers d ON lp.driver_id = d.id
      JOIN trucks t ON lp.truck_id = t.id
      LEFT JOIN users cu ON cu.id = d.carrier_id
      LEFT JOIN users u ON lp.created_by = u.id
    `;
    const params = [];

    if (req.user.role === 'carrier' || req.user.role === 'carrier_admin') {
      query += ` WHERE d.carrier_id = $1`;
      params.push(req.user.id);
    } else if (req.user.role === 'driver') {
      query += ` WHERE d.user_id = $1`;
      params.push(req.user.id);
    } else if (!['dispatcher', 'admin', 'super_admin'].includes(req.user.role)) {
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
    const { driver_id, truck_id, equipment_type, available_date, pickup_location, delivery_preference, notes } = req.body;

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

    const dInfo = await pool.query('SELECT name, phone, carrier_id FROM drivers WHERE id = $1', [driver_id]);
    const tInfo = await pool.query('SELECT truck_number, carrier_id, equipment_type FROM trucks WHERE id = $1', [truck_id]);
    const carrierId = (tInfo.rows[0] && tInfo.rows[0].carrier_id) || (dInfo.rows[0] && dInfo.rows[0].carrier_id) || req.user.id;
    const cleanEq = (equipment_type && String(equipment_type).trim()) || (tInfo.rows[0] && tInfo.rows[0].equipment_type) || '53ft Dry Van';
    const truckNumber = (tInfo.rows[0] && tInfo.rows[0].truck_number) || '101';
    const driverName = (dInfo.rows[0] && dInfo.rows[0].name) || 'Driver';
    const driverPhone = (dInfo.rows[0] && dInfo.rows[0].phone) || null;

    if (cleanEq) {
      await pool.query('UPDATE trucks SET equipment_type = $1, status = $2 WHERE id = $3', [cleanEq, 'active', truck_id]).catch(() => {});
      await pool.query('UPDATE drivers SET equipment_type = $1, assigned_truck_id = COALESCE(assigned_truck_id, $2), status = $3 WHERE id = $4', [cleanEq, truck_id, 'available', driver_id]).catch(() => {});
      await pool.query('UPDATE users SET equipment_category = $1 WHERE id = $2', [cleanEq, carrierId]).catch(() => {});
    }

    const result = await pool.query(
      `INSERT INTO load_plans (
        driver_id, truck_id, available_date, pickup_location, delivery_preference, notes, created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
      RETURNING *`,
      [driver_id, truck_id, available_date, pickup_location, delivery_preference || '', notes || '', req.user.id]
    );

    // Sync newly scheduled empty location & preference directly to AI Dispatch Brain
    try {
      const uRes = await pool.query('SELECT company_name, name, phone, email, mc_number, dot_number FROM users WHERE id = $1', [carrierId]);
      const carrierCompany = (uRes.rows[0] && (uRes.rows[0].company_name || uRes.rows[0].name)) || driverName;

      // Update customer_carriers so equipment doesn't get reverted by legacy sync
      if (carrierCompany) {
        await pool.query('UPDATE customer_carriers SET equipment_type = $1 WHERE lower(company_name) = lower($2)', [cleanEq, carrierCompany]).catch(() => {});
      }

      await syncTruckLocationToAiDispatch(carrierId, {
        empty_zip: pickup_location,
        prefer_destination: delivery_preference,
        equipment: cleanEq,
        status: 'active'
      });

      // Ensure active record exists in ai_dispatch_carriers for 1-click AI Dispatch matching
      await pool.query(
        `INSERT INTO ai_dispatch_carriers (
           company_name, truck_number, contact_name, phone, equipment,
           empty_zip, prefer_destination, status, sms_consent, last_location, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', true, $6, now())
         ON CONFLICT (company_name) DO UPDATE SET
           truck_number = EXCLUDED.truck_number,
           contact_name = COALESCE(EXCLUDED.contact_name, ai_dispatch_carriers.contact_name),
           phone = COALESCE(EXCLUDED.phone, ai_dispatch_carriers.phone),
           equipment = EXCLUDED.equipment,
           empty_zip = EXCLUDED.empty_zip,
           prefer_destination = EXCLUDED.prefer_destination,
           status = 'active',
           last_location = EXCLUDED.empty_zip,
           updated_at = now()`,
        [
          carrierCompany,
          truckNumber,
          driverName,
          driverPhone || (uRes.rows[0] && uRes.rows[0].phone) || null,
          cleanEq,
          pickup_location,
          delivery_preference || null
        ]
      ).catch((e) => console.warn('[LoadPlanning] ai_dispatch_carriers upsert notice:', e.message));
    } catch (syncErr) {
      console.warn('[LoadPlanning] AI dispatch sync notice:', syncErr.message);
    }

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
