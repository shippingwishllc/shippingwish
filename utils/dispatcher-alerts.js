// utils/dispatcher-alerts.js
// Vercel-Native Instant High-RPM Dispatcher Alert Engine (Zero node-cron required!)
// Automatically matches newly ingested LoadsNexus loads against active Shipping Wish trucks
// in ai_dispatch_carriers and raises real-time SSE + persistent dispatcher_load_alerts records.

const pool = require('../db');
const { getFreightDeadhead } = require('./geo');
const { parseOriginWithZip } = require('./us-zipcodes');

let alertsSchemaReady = false;

async function ensureDispatcherAlertsSchema() {
  if (alertsSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatcher_load_alerts (
      id SERIAL PRIMARY KEY,
      load_id INTEGER NOT NULL,
      load_number TEXT,
      carrier_id INTEGER NOT NULL,
      carrier_company TEXT,
      truck_number TEXT,
      carrier_phone TEXT,
      origin TEXT,
      destination TEXT,
      equipment_type TEXT,
      rate NUMERIC(12,2) DEFAULT 0,
      miles INTEGER DEFAULT 0,
      rpm NUMERIC(8,2) DEFAULT 0,
      deadhead_mi INTEGER DEFAULT 0,
      source_channel TEXT,
      broker_name TEXT,
      broker_mc TEXT,
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (load_id, carrier_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dispatcher_alerts_status_created
      ON dispatcher_load_alerts (status, created_at DESC);
  `);
  alertsSchemaReady = true;
}

function equipmentBucket(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('reefer') || s.includes('refrig') || s.includes('temp')) return 'REEFER';
  if (s.includes('step')) return 'STEP_DECK';
  if (s.includes('flat')) return 'FLATBED';
  if (s.includes('box') || s.includes('straight') || s.includes('26')) return 'BOX_TRUCK';
  if (s.includes('hotshot') || s.includes('hot shot')) return 'HOTSHOT';
  if (s.includes('power')) return 'POWER_ONLY';
  return 'DRY_VAN';
}

async function matchAndAlertDispatchersForLoad(load) {
  if (!load || !load.id || !load.pickup_location) return { matched: 0, alerts: [] };

  const rate = Number(load.rate || 0);
  const miles = Number(load.miles || 0);
  const rpm = miles > 0 && rate > 0 ? Number((rate / miles).toFixed(2)) : Number(load.rpm || 0);

  // Only alert dispatchers on priced spot loads with competitive RPM (>= $2.00/mi)
  if (rpm < 2.0 && rate < 1200) {
    return { matched: 0, alerts: [] };
  }

  await ensureDispatcherAlertsSchema();

  const carriersRes = await pool.query(`
    SELECT id, company_name, truck_number, phone, equipment, empty_zip, home_state,
           min_rpm, max_deadhead, avoid_states
    FROM ai_dispatch_carriers
    WHERE LOWER(COALESCE(status, 'active')) IN ('active', 'available', 'empty_soon')
    LIMIT 100
  `).catch(() => ({ rows: [] }));

  if (!carriersRes.rows.length) return { matched: 0, alerts: [] };

  const loadEq = equipmentBucket(load.equipment_type);
  const destState = String(load.delivery_state || '').toUpperCase();
  const createdAlerts = [];

  for (const c of carriersRes.rows) {
    // 1. Equipment compatibility
    if (c.equipment && equipmentBucket(c.equipment) !== loadEq) continue;

    // 2. RPM floor check
    const minRpm = Math.max(Number(c.min_rpm || 0), 2.0);
    if (rpm > 0 && rpm < minRpm) continue;

    // 3. Avoid-states filter
    const avoid = String(c.avoid_states || '').toUpperCase();
    if (destState && avoid && avoid.split(/[\s,;]+/).includes(destState)) continue;

    // 4. Deadhead proximity check (using offline ZIP/city/state coordinates)
    const truckLoc = c.empty_zip || c.home_state || '';
    if (!truckLoc) continue;
    const origParsed = parseOriginWithZip(String(truckLoc).trim());
    const deadhead = getFreightDeadhead(origParsed || truckLoc, load.pickup_location);
    const maxDh = Math.min(Math.max(Number(c.max_deadhead || 150), 50), 250);
    if (deadhead > maxDh) continue;

    // 5. Persist deduplicated alert
    const ins = await pool.query(
      `INSERT INTO dispatcher_load_alerts (
        load_id, load_number, carrier_id, carrier_company, truck_number, carrier_phone,
        origin, destination, equipment_type, rate, miles, rpm, deadhead_mi,
        source_channel, broker_name, broker_mc, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'unread')
      ON CONFLICT (load_id, carrier_id) DO NOTHING
      RETURNING *`,
      [
        load.id,
        load.load_number || `LNX-${load.id}`,
        c.id,
        c.company_name || 'Active Fleet Carrier',
        c.truck_number || '101',
        c.phone || null,
        load.pickup_location,
        load.delivery_location,
        load.equipment_type || '53ft Dry Van',
        rate,
        miles,
        rpm,
        deadhead,
        load.source_channel || 'LOADSNEXUS',
        load.broker_name || 'Verified Freight Broker',
        load.broker_mc || null
      ]
    ).catch(() => ({ rows: [] }));

    if (ins.rows[0]) {
      createdAlerts.push(ins.rows[0]);
      try {
        const loadboardRouter = require('../routes/loadboard');
        if (typeof loadboardRouter.broadcastLoadboardEvent === 'function') {
          loadboardRouter.broadcastLoadboardEvent('high_rpm_truck_match', ins.rows[0]);
        }
      } catch (_) {}
    }
  }

  return { matched: createdAlerts.length, alerts: createdAlerts };
}

async function listDispatcherAlerts({ status = 'unread', limit = 30 } = {}) {
  await ensureDispatcherAlertsSchema();
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  const cond = status && status !== 'all' ? 'WHERE status = $1' : '';
  const params = status && status !== 'all' ? [status] : [];
  const { rows } = await pool.query(
    `SELECT * FROM dispatcher_load_alerts ${cond} ORDER BY created_at DESC LIMIT ${lim}`,
    params
  );
  return rows;
}

async function acknowledgeAlert(alertId) {
  await ensureDispatcherAlertsSchema();
  const { rows } = await pool.query(
    `UPDATE dispatcher_load_alerts SET status = 'dismissed' WHERE id = $1 RETURNING *`,
    [Number(alertId)]
  );
  return rows[0] || null;
}

module.exports = {
  ensureDispatcherAlertsSchema,
  matchAndAlertDispatchersForLoad,
  listDispatcherAlerts,
  acknowledgeAlert,
  equipmentBucket
};
