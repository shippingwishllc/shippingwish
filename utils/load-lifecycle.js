// utils/load-lifecycle.js
// Single Unified End-to-End Load Lifecycle Engine connecting:
//   Loads Nexus Marketplace -> Carrier 1-Tap Approval -> Shipping Wish Dispatch TMS -> Driver App -> Tracking -> POD -> Factoring & Settlements

const crypto = require('crypto');
const pool = require('../db');
const { createNotification } = require('./notifications');
const { analyzeLoadProfit } = require('./profit-engine');

const CANONICAL_STATUSES = [
  'open',
  'new',
  'pending_carrier_approval',
  'booked',
  'ratecon_signed',
  'assigned',
  'dispatched',
  'at_pickup',
  'loading',
  'loaded',
  'in_transit',
  'at_delivery',
  'unloading',
  'delivered',
  'pod_uploaded',
  'invoiced',
  'paid',
  'covered',
  'cancellation_requested',
  'cancelled',
  'expired'
];

let schemaReady = false;
async function ensureUnifiedSchema() {
  if (schemaReady) return;
  try {
    // 1. If production PostgreSQL uses ENUM type `load_status`, safely register all canonical lifecycle values
    //    (Each ALTER TYPE must execute as its own standalone query outside an implicit transaction block!)
    const enumCheck = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'load_status' LIMIT 1`).catch(() => ({ rows: [] }));
    if (enumCheck.rows.length > 0) {
      const existingValsRes = await pool.query(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'load_status'`
      ).catch(() => ({ rows: [] }));
      const existingSet = new Set(existingValsRes.rows.map((r) => r.enumlabel));
      for (const st of CANONICAL_STATUSES) {
        if (!existingSet.has(st)) {
          await pool.query(`ALTER TYPE load_status ADD VALUE IF NOT EXISTS '${st}'`).catch(() => {});
        }
      }
    }

    // 2. Ensure unified lifecycle, carrier/driver metadata, tracking_events & permanent cloud storage columns exist
    await pool.query(`
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS is_public_board BOOLEAN DEFAULT FALSE;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(200);
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_mc VARCHAR(60);
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_name VARCHAR(150);
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(60);
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS truck_number VARCHAR(60);
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS trailer_number VARCHAR(60);
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS tracking_notes TEXT;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS empty_miles NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS detention_total NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS fuel_est NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS net_profit_est NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_tracking_token VARCHAR(96);
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approval_status VARCHAR(30) DEFAULT 'not_requested';
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approval_requested_at TIMESTAMP;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approved_at TIMESTAMP;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approval_notes TEXT;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS cloud_url TEXT;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120);
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data_b64 TEXT;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(30) DEFAULT 'local';
      CREATE TABLE IF NOT EXISTS tracking_events (
        id SERIAL PRIMARY KEY,
        load_id INT REFERENCES loads(id) ON DELETE SET NULL,
        driver_id INT REFERENCES users(id) ON DELETE SET NULL,
        latitude NUMERIC(10, 6),
        longitude NUMERIC(10, 6),
        speed NUMERIC(6, 2) DEFAULT 0,
        heading NUMERIC(6, 2) DEFAULT 0,
        location_name VARCHAR(255),
        status VARCHAR(50),
        notes TEXT,
        ping_time TIMESTAMP DEFAULT now()
      );
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS speed NUMERIC(6, 2) DEFAULT 0;
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS heading NUMERIC(6, 2) DEFAULT 0;
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS status VARCHAR(50);
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS ping_time TIMESTAMP DEFAULT now();
    `);
    schemaReady = true;
  } catch (err) {
    console.warn('[UnifiedLifecycle] Schema ensure warning:', err.message);
  }
}

/**
 * Strict RBAC + participant ownership check for any load endpoint.
 * Returns true if req.user is allowed to access this load.
 */
async function userCanAccessLoad(req, load, { write = false } = {}) {
  if (!req.user || !load) return false;
  const role = String(req.user.role || '').toLowerCase();
  if (role === 'admin' || role === 'super_admin') return true;

  if (role === 'dispatcher' || role === 'sales_rep') {
    // Dispatchers can access loads they dispatch, unassigned marketplace loads, or if read-only in dispatch desk
    if (!write) return true;
    if (!load.dispatcher_id || Number(load.dispatcher_id) === Number(req.user.id)) return true;
    return false;
  }

  if (role === 'broker') {
    if (load.broker_user_id && Number(load.broker_user_id) === Number(req.user.id)) return true;
    if (load.dispatcher_id && Number(load.dispatcher_id) === Number(req.user.id)) return true;
    return false;
  }

  if (role === 'carrier' || role === 'carrier_admin') {
    return load.carrier_id && Number(load.carrier_id) === Number(req.user.id);
  }

  if (role === 'driver') {
    const dr = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1 OR (email IS NOT NULL AND lower(email) = lower($2))`,
      [req.user.id, req.user.email || '']
    ).catch(() => ({ rows: [] }));
    const ids = dr.rows.map((r) => Number(r.id));
    if (load.driver_id && ids.includes(Number(load.driver_id))) return true;
    if (load.carrier_id && Number(load.carrier_id) === Number(req.user.id)) return true;
    return false;
  }

  return false;
}

/**
 * Bridge a Loads Nexus Marketplace load cleanly into the Shipping Wish Dispatch & Driver TMS lifecycle.
 * Sets real foreign keys (carrier_id, driver_id, truck_id), generates a Broker Tracking Token,
 * removes the load from the public board (is_public_board = FALSE), and sends instant alerts.
 */
async function awardLoadToCarrier({
  loadId,
  carrierId = null,
  carrierName = null,
  carrierMc = null,
  driverId = null,
  driverName = null,
  driverPhone = null,
  truckId = null,
  truckNumber = null,
  trailerNumber = null,
  finalRate = null,
  awardedByUserId = null,
  notes = ''
}) {
  await ensureUnifiedSchema();

  const existingRes = await pool.query(
    `SELECT * FROM loads WHERE id::text = $1 OR load_number = $1 LIMIT 1`,
    [String(loadId)]
  );
  if (!existingRes.rows.length) {
    throw new Error('Load not found.');
  }
  const load = existingRes.rows[0];

  // Attempt to resolve carrier_id from users if only MC or name was passed
  let resolvedCarrierId = carrierId ? Number(carrierId) : load.carrier_id;
  if (!resolvedCarrierId && carrierMc) {
    const cleanMc = String(carrierMc).replace(/\D/g, '');
    if (cleanMc.length >= 4) {
      const uRes = await pool.query(
        `SELECT id, company_name, name FROM users WHERE role IN ('carrier', 'carrier_admin') AND regexp_replace(COALESCE(mc_number,''), '\\D', '', 'g') = $1 LIMIT 1`,
        [cleanMc]
      ).catch(() => ({ rows: [] }));
      if (uRes.rows[0]) resolvedCarrierId = uRes.rows[0].id;
    }
  }

  // Generate secure Broker Tracking Token if not present
  const trackingToken = load.broker_tracking_token || crypto.randomBytes(18).toString('hex');
  const nextRate = finalRate !== null && Number(finalRate) > 0 ? Number(finalRate) : Number(load.rate || 0);
  const miles = Number(load.miles || 0);
  const nextRpm = miles > 0 ? Number((nextRate / miles).toFixed(2)) : Number(load.rpm || 0);

  const profit = analyzeLoadProfit({
    rate: nextRate,
    loadedMiles: miles || 500,
    deadheadMiles: Number(load.empty_miles || 0),
    origin: load.pickup_location,
    destination: load.delivery_location,
    equipmentType: load.equipment_type
  });

  const updatedRes = await pool.query(
    `UPDATE loads
     SET status = 'booked',
         is_public_board = FALSE,
         carrier_id = COALESCE($1, carrier_id),
         carrier_name = COALESCE($2, carrier_name),
         carrier_mc = COALESCE($3, carrier_mc),
         driver_id = COALESCE($4, driver_id),
         driver_name = COALESCE($5, driver_name),
         driver_phone = COALESCE($6, driver_phone),
         truck_id = COALESCE($7, truck_id),
         truck_number = COALESCE($8, truck_number),
         trailer_number = COALESCE($9, trailer_number),
         rate = $10,
         rpm = $11,
         fuel_est = $12,
         net_profit_est = $13,
         broker_tracking_token = $14,
         tracking_notes = COALESCE($15, tracking_notes),
         updated_at = NOW()
     WHERE id = $16
     RETURNING *`,
    [
      resolvedCarrierId || null,
      carrierName || null,
      carrierMc || null,
      driverId || null,
      driverName || null,
      driverPhone || null,
      truckId || null,
      truckNumber || null,
      trailerNumber || null,
      nextRate,
      nextRpm,
      profit.fuel_cost,
      profit.true_net_profit,
      trackingToken,
      notes || null,
      load.id
    ]
  );

  const updated = updatedRes.rows[0];

  // Record in load_status_history
  await pool.query(
    `INSERT INTO load_status_history (load_id, status, changed_by, notes)
     VALUES ($1, 'booked', $2, $3)`,
    [
      updated.id,
      awardedByUserId || null,
      `Load awarded to ${carrierName || 'Carrier'} at $${nextRate.toLocaleString()} (Net Est: $${profit.true_net_profit.toLocaleString()}). Broker tracking & RateCon unlocked.`
    ]
  ).catch(() => {});

  // Also register token into broker_tracking_links table if present
  await pool.query(
    `INSERT INTO broker_tracking_links (token, load_id, load_number, origin, destination, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'booked', NOW())
     ON CONFLICT (token) DO NOTHING`,
    [trackingToken, updated.id, updated.load_number, updated.pickup_location, updated.delivery_location]
  ).catch(() => {});

  // Notify Carrier
  if (resolvedCarrierId) {
    createNotification(
      resolvedCarrierId,
      `Load Booked #${updated.load_number}`,
      `${updated.pickup_location} -> ${updated.delivery_location} ($${nextRate.toLocaleString()}). RateCon & Live Dispatch ready!`,
      'success',
      `/load-detail.html?id=${updated.id}`
    ).catch(() => {});
  }

  return {
    load: updated,
    profit,
    tracking_url: `/track/${trackingToken}`
  };
}

module.exports = {
  CANONICAL_STATUSES,
  ensureUnifiedSchema,
  userCanAccessLoad,
  awardLoadToCarrier
};
