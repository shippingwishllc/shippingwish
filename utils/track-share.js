const crypto = require('crypto');
const pool = require('../db');
const { publicBaseUrl, osmEmbedForPoints } = require('./eld-providers');

let migrated = false;

async function ensureTrackShareTables() {
  if (migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS load_tracking_shares (
      id SERIAL PRIMARY KEY,
      load_id INT,
      created_by INT,
      driver_phone VARCHAR(40),
      driver_name VARCHAR(200),
      driver_user_id INT,
      driver_email VARCHAR(200),
      broker_email VARCHAR(200),
      broker_name VARCHAR(200),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      accept_token VARCHAR(64) UNIQUE NOT NULL,
      view_token VARCHAR(64) UNIQUE NOT NULL,
      accepted_at TIMESTAMP,
      last_lat NUMERIC(10, 6),
      last_lon NUMERIC(10, 6),
      last_ping_at TIMESTAMP,
      expires_at TIMESTAMP,
      sms_sent_at TIMESTAMP,
      sms_skip_reason TEXT,
      email_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_track_share_load ON load_tracking_shares(load_id);
    CREATE INDEX IF NOT EXISTS idx_track_share_status ON load_tracking_shares(status);
    CREATE INDEX IF NOT EXISTS idx_track_share_accept ON load_tracking_shares(accept_token);
    CREATE INDEX IF NOT EXISTS idx_track_share_view ON load_tracking_shares(view_token);
  `);
  migrated = true;
}

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function acceptUrl(token) {
  return `${publicBaseUrl()}/track-accept?t=${encodeURIComponent(token)}`;
}

function viewUrl(token) {
  return `${publicBaseUrl()}/track-share?t=${encodeURIComponent(token)}`;
}

function publicShare(row, { includeTokens } = {}) {
  if (!row) return null;
  const lat = row.last_lat != null ? Number(row.last_lat) : null;
  const lon = row.last_lon != null ? Number(row.last_lon) : null;
  const hasGps = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  const out = {
    id: row.id,
    load_id: row.load_id,
    load_number: row.load_number || null,
    pickup: row.pickup_location || row.pickup || null,
    delivery: row.delivery_location || row.delivery || null,
    driver_name: row.driver_name || null,
    broker_name: row.broker_name || null,
    status: row.status,
    accepted_at: row.accepted_at,
    last_ping_at: row.last_ping_at,
    expires_at: row.expires_at,
    gps_lat: hasGps ? lat : null,
    gps_lon: hasGps ? lon : null,
    map_url: hasGps ? osmEmbedForPoints([{ lat, lng: lon }]) : null,
    sms_sent_at: row.sms_sent_at,
    sms_skip_reason: row.sms_skip_reason || null,
    created_at: row.created_at
  };
  if (includeTokens) {
    out.accept_url = acceptUrl(row.accept_token);
    out.view_url = viewUrl(row.view_token);
  }
  return out;
}

async function loadRow(loadId) {
  const id = parseInt(loadId, 10);
  if (!Number.isFinite(id)) return null;
  const { rows } = await pool.query(
    `SELECT id, load_number, pickup_location, delivery_location, broker_name, broker_mc,
            broker_contact, driver_name, driver_phone, carrier_name, status, delivery_date
     FROM loads WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

function canAccessLoad(user, load) {
  if (!user || !load) return false;
  const role = user.role;
  if (['admin', 'super_admin', 'dispatcher'].includes(role)) return true;
  if (role === 'broker') {
    const email = String(user.email || '').toLowerCase();
    const contact = String(load.broker_contact || '').toLowerCase();
    const mc = String(user.mc_number || '');
    return (email && contact.includes(email)) || (mc && String(load.broker_mc || '') === mc);
  }
  if (['carrier', 'carrier_admin'].includes(role)) return true;
  if (role === 'driver') return true;
  return false;
}

async function createShare({ user, loadId, driverPhone, driverName, driverEmail, brokerEmail, brokerName }) {
  await ensureTrackShareTables();
  const load = await loadRow(loadId);
  if (!load) {
    const err = new Error('Load not found.');
    err.status = 404;
    throw err;
  }
  if (!canAccessLoad(user, load)) {
    const err = new Error('You cannot send tracking on this load.');
    err.status = 403;
    throw err;
  }
  const phone = String(driverPhone || load.driver_phone || '').trim();
  const name = String(driverName || load.driver_name || '').trim() || null;
  const expires = new Date(Date.now() + 8 * 24 * 3600 * 1000);
  const { rows } = await pool.query(`
    INSERT INTO load_tracking_shares (
      load_id, created_by, driver_phone, driver_name, driver_email, broker_email, broker_name,
      status, accept_token, view_token, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10)
    RETURNING *
  `, [
    load.id,
    user.id,
    phone || null,
    name,
    driverEmail || null,
    brokerEmail || load.broker_contact || null,
    brokerName || load.broker_name || null,
    newToken(),
    newToken(),
    expires
  ]);
  return Object.assign(rows[0], load);
}

async function byAcceptToken(token) {
  await ensureTrackShareTables();
  const { rows } = await pool.query(
    `SELECT s.*, l.load_number, l.pickup_location, l.delivery_location, l.broker_name AS load_broker
     FROM load_tracking_shares s
     LEFT JOIN loads l ON l.id = s.load_id
     WHERE s.accept_token = $1`,
    [token]
  );
  return rows[0] || null;
}

async function byViewToken(token) {
  await ensureTrackShareTables();
  const { rows } = await pool.query(
    `SELECT s.*, l.load_number, l.pickup_location, l.delivery_location
     FROM load_tracking_shares s
     LEFT JOIN loads l ON l.id = s.load_id
     WHERE s.view_token = $1`,
    [token]
  );
  return rows[0] || null;
}

async function acceptShare(row, { userId } = {}) {
  if (row.status === 'expired' || (row.expires_at && new Date(row.expires_at) < new Date())) {
    const err = new Error('This tracking link has expired.');
    err.status = 410;
    throw err;
  }
  if (row.status === 'stopped' || row.status === 'declined') {
    const err = new Error('This tracking request is no longer open.');
    err.status = 409;
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE load_tracking_shares
     SET status = 'accepted', accepted_at = COALESCE(accepted_at, now()),
         driver_user_id = COALESCE($2, driver_user_id)
     WHERE id = $1
     RETURNING *`,
    [row.id, userId || null]
  );
  return rows[0];
}

async function declineShare(row) {
  await pool.query(`UPDATE load_tracking_shares SET status = 'declined' WHERE id = $1`, [row.id]);
}

async function recordPing(row, { lat, lon, locationName }) {
  if (row.status !== 'accepted') {
    const err = new Error('Driver has not accepted tracking yet.');
    err.status = 409;
    throw err;
  }
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const err = new Error('GPS must be real coordinates from the phone.');
    err.status = 400;
    throw err;
  }
  await pool.query(
    `UPDATE load_tracking_shares SET last_lat = $2, last_lon = $3, last_ping_at = now() WHERE id = $1`,
    [row.id, latitude, longitude]
  );
  if (row.load_id) {
    await pool.query(
      `INSERT INTO tracking_events (load_id, driver_id, latitude, longitude, location_name, status, notes, ping_time)
       VALUES ($1, $2, $3, $4, $5, 'tracking_share', $6, now())`,
      [row.load_id, row.driver_user_id || null, latitude, longitude, locationName || null, 'SW Track accept']
    ).catch(() => {});
  }
  return { gps_lat: latitude, gps_lon: longitude, last_ping_at: new Date().toISOString() };
}

async function sharesForUser(user, loadId) {
  await ensureTrackShareTables();
  if (loadId) {
    const load = await loadRow(loadId);
    if (!load || !canAccessLoad(user, load)) return [];
    const { rows } = await pool.query(
      `SELECT s.*, l.load_number, l.pickup_location, l.delivery_location
       FROM load_tracking_shares s
       LEFT JOIN loads l ON l.id = s.load_id
       WHERE s.load_id = $1
       ORDER BY s.created_at DESC LIMIT 20`,
      [load.id]
    );
    return rows;
  }
  if (['admin', 'super_admin', 'dispatcher'].includes(user.role)) {
    const { rows } = await pool.query(
      `SELECT s.*, l.load_number, l.pickup_location, l.delivery_location
       FROM load_tracking_shares s
       LEFT JOIN loads l ON l.id = s.load_id
       ORDER BY s.created_at DESC LIMIT 50`
    );
    return rows;
  }
  if (user.role === 'broker') {
    const { rows } = await pool.query(
      `SELECT s.*, l.load_number, l.pickup_location, l.delivery_location
       FROM load_tracking_shares s
       LEFT JOIN loads l ON l.id = s.load_id
       WHERE s.created_by = $1 OR lower(COALESCE(s.broker_email,'')) = lower($2)
          OR (l.broker_mc IS NOT NULL AND l.broker_mc = $3)
       ORDER BY s.created_at DESC LIMIT 50`,
      [user.id, user.email || '', user.mc_number || '']
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT s.*, l.load_number, l.pickup_location, l.delivery_location
     FROM load_tracking_shares s
     LEFT JOIN loads l ON l.id = s.load_id
     WHERE s.created_by = $1 OR s.driver_user_id = $1
     ORDER BY s.created_at DESC LIMIT 50`,
    [user.id]
  );
  return rows;
}

async function pendingForDriver(user) {
  await ensureTrackShareTables();
  const { rows } = await pool.query(
    `SELECT s.*, l.load_number, l.pickup_location, l.delivery_location
     FROM load_tracking_shares s
     LEFT JOIN loads l ON l.id = s.load_id
     WHERE s.status = 'pending'
       AND (s.driver_user_id = $1 OR lower(COALESCE(s.driver_email,'')) = lower($2))
       AND (s.expires_at IS NULL OR s.expires_at > now())
     ORDER BY s.created_at DESC LIMIT 10`,
    [user.id, user.email || '']
  );
  return rows;
}

async function markSms(id, { sent, reason }) {
  if (sent) {
    await pool.query(`UPDATE load_tracking_shares SET sms_sent_at = now(), sms_skip_reason = NULL WHERE id = $1`, [id]);
  } else {
    await pool.query(`UPDATE load_tracking_shares SET sms_skip_reason = $2 WHERE id = $1`, [id, String(reason || '').slice(0, 200)]);
  }
}

async function markEmail(id) {
  await pool.query(`UPDATE load_tracking_shares SET email_sent_at = now() WHERE id = $1`, [id]);
}

async function stopShare(id, user) {
  const { rows } = await pool.query(`SELECT * FROM load_tracking_shares WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  const load = row.load_id ? await loadRow(row.load_id) : { broker_contact: row.broker_email, broker_mc: null };
  if (!canAccessLoad(user, load || { broker_contact: row.broker_email })) return null;
  await pool.query(`UPDATE load_tracking_shares SET status = 'stopped' WHERE id = $1`, [id]);
  return true;
}

module.exports = {
  ensureTrackShareTables,
  publicShare,
  loadRow,
  canAccessLoad,
  createShare,
  byAcceptToken,
  byViewToken,
  acceptShare,
  declineShare,
  recordPing,
  sharesForUser,
  pendingForDriver,
  markSms,
  markEmail,
  stopShare,
  acceptUrl,
  viewUrl
};
