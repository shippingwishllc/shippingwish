const pool = require('../db');
const { encryptSecret, decryptSecret } = require('./eld-crypto');
const {
  pullProvider,
  geotabAuthenticate,
  formatMinutes
} = require('./eld-providers');

let migrated = false;

async function ensureEldConnectTables() {
  if (migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eld_connections (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(30) NOT NULL,
      auth_mode VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      account_label VARCHAR(200),
      encrypted_access_token TEXT,
      encrypted_refresh_token TEXT,
      encrypted_api_key TEXT,
      extra_json JSONB DEFAULT '{}'::jsonb,
      token_expires_at TIMESTAMP,
      consent_at TIMESTAMP,
      consent_ip VARCHAR(64),
      last_sync_at TIMESTAMP,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_eld_conn_user ON eld_connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_eld_conn_provider ON eld_connections(provider);

    CREATE TABLE IF NOT EXISTS eld_vehicles (
      id SERIAL PRIMARY KEY,
      connection_id INT REFERENCES eld_connections(id) ON DELETE CASCADE,
      provider VARCHAR(30) NOT NULL,
      external_id VARCHAR(80) NOT NULL,
      name VARCHAR(200),
      vin VARCHAR(32),
      unit_number VARCHAR(50),
      make VARCHAR(80),
      model VARCHAR(80),
      year INT,
      gps_lat NUMERIC(10, 6),
      gps_lon NUMERIC(10, 6),
      speed NUMERIC(6, 2),
      heading NUMERIC(6, 2),
      location_name VARCHAR(255),
      located_at TIMESTAMP,
      engine_state VARCHAR(40),
      odometer_miles NUMERIC(12, 1),
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE(connection_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_eld_vehicles_conn ON eld_vehicles(connection_id);

    CREATE TABLE IF NOT EXISTS eld_drivers (
      id SERIAL PRIMARY KEY,
      connection_id INT REFERENCES eld_connections(id) ON DELETE CASCADE,
      provider VARCHAR(30) NOT NULL,
      external_id VARCHAR(80) NOT NULL,
      name VARCHAR(200),
      email VARCHAR(200),
      phone VARCHAR(40),
      duty_status VARCHAR(40),
      drive_remaining_minutes INT,
      shift_remaining_minutes INT,
      cycle_remaining_minutes INT,
      break_remaining_minutes INT,
      vehicle_external_id VARCHAR(80),
      gps_lat NUMERIC(10, 6),
      gps_lon NUMERIC(10, 6),
      located_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE(connection_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_eld_drivers_conn ON eld_drivers(connection_id);
  `);
  migrated = true;
}

function publicConnection(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    auth_mode: row.auth_mode,
    status: row.status,
    account_label: row.account_label || null,
    last_sync_at: row.last_sync_at,
    last_error: row.last_error,
    consent_at: row.consent_at,
    created_at: row.created_at,
    extra: {
      database: row.extra_json?.database || null,
      server: row.extra_json?.server || null
    }
  };
}

function publicVehicle(row) {
  const lat = row.gps_lat != null ? Number(row.gps_lat) : null;
  const lon = row.gps_lon != null ? Number(row.gps_lon) : null;
  return {
    id: row.id,
    connection_id: row.connection_id,
    provider: row.provider,
    external_id: row.external_id,
    name: row.name,
    vin: row.vin,
    unit_number: row.unit_number,
    make: row.make,
    model: row.model,
    year: row.year,
    gps_lat: Number.isFinite(lat) ? lat : null,
    gps_lon: Number.isFinite(lon) ? lon : null,
    speed: row.speed != null ? Number(row.speed) : null,
    heading: row.heading != null ? Number(row.heading) : null,
    location_name: row.location_name || null,
    located_at: row.located_at,
    engine_state: row.engine_state,
    odometer_miles: row.odometer_miles != null ? Number(row.odometer_miles) : null
  };
}

function publicDriver(row) {
  return {
    id: row.id,
    connection_id: row.connection_id,
    provider: row.provider,
    external_id: row.external_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    duty_status: row.duty_status,
    driving_remaining: formatMinutes(row.drive_remaining_minutes),
    shift_remaining: formatMinutes(row.shift_remaining_minutes),
    cycle_remaining: formatMinutes(row.cycle_remaining_minutes),
    break_remaining: formatMinutes(row.break_remaining_minutes),
    drive_remaining_minutes: row.drive_remaining_minutes,
    shift_remaining_minutes: row.shift_remaining_minutes,
    cycle_remaining_minutes: row.cycle_remaining_minutes,
    vehicle_external_id: row.vehicle_external_id,
    gps_lat: row.gps_lat != null ? Number(row.gps_lat) : null,
    gps_lon: row.gps_lon != null ? Number(row.gps_lon) : null,
    located_at: row.located_at
  };
}

async function connectionsForUser(user) {
  await ensureEldConnectTables();
  if (['admin', 'super_admin', 'dispatcher'].includes(user.role)) {
    const { rows } = await pool.query(
      `SELECT * FROM eld_connections ORDER BY updated_at DESC LIMIT 50`
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT * FROM eld_connections WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`,
    [user.id]
  );
  return rows;
}

async function getConnection(id, user) {
  await ensureEldConnectTables();
  const { rows } = await pool.query(`SELECT * FROM eld_connections WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  if (['admin', 'super_admin', 'dispatcher'].includes(user.role)) return row;
  if (row.user_id === user.id) return row;
  return null;
}

function extrasFrom(row) {
  return row.extra_json && typeof row.extra_json === 'object' ? row.extra_json : {};
}

function credsFrom(row) {
  const extra = extrasFrom(row);
  return {
    accessToken: decryptSecret(row.encrypted_access_token),
    refreshToken: decryptSecret(row.encrypted_refresh_token),
    apiKey: decryptSecret(row.encrypted_api_key),
    database: extra.database,
    username: extra.username,
    server: extra.server,
    sessionId: decryptSecret(extra.encrypted_session_id)
  };
}

async function upsertVehicles(connectionId, provider, vehicles) {
  for (const v of vehicles) {
    if (!v.external_id) continue;
    await pool.query(`
      INSERT INTO eld_vehicles (
        connection_id, provider, external_id, name, vin, unit_number, make, model, year,
        gps_lat, gps_lon, speed, heading, location_name, located_at, engine_state, odometer_miles, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
      ON CONFLICT (connection_id, external_id) DO UPDATE SET
        name = EXCLUDED.name,
        vin = COALESCE(EXCLUDED.vin, eld_vehicles.vin),
        unit_number = COALESCE(EXCLUDED.unit_number, eld_vehicles.unit_number),
        make = COALESCE(EXCLUDED.make, eld_vehicles.make),
        model = COALESCE(EXCLUDED.model, eld_vehicles.model),
        year = COALESCE(EXCLUDED.year, eld_vehicles.year),
        gps_lat = COALESCE(EXCLUDED.gps_lat, eld_vehicles.gps_lat),
        gps_lon = COALESCE(EXCLUDED.gps_lon, eld_vehicles.gps_lon),
        speed = COALESCE(EXCLUDED.speed, eld_vehicles.speed),
        heading = COALESCE(EXCLUDED.heading, eld_vehicles.heading),
        location_name = COALESCE(EXCLUDED.location_name, eld_vehicles.location_name),
        located_at = COALESCE(EXCLUDED.located_at, eld_vehicles.located_at),
        engine_state = COALESCE(EXCLUDED.engine_state, eld_vehicles.engine_state),
        odometer_miles = COALESCE(EXCLUDED.odometer_miles, eld_vehicles.odometer_miles),
        updated_at = now()
    `, [
      connectionId, provider, v.external_id, v.name, v.vin, v.unit_number, v.make, v.model, v.year,
      v.gps_lat, v.gps_lon, v.speed, v.heading, v.location_name, v.located_at, v.engine_state, v.odometer_miles
    ]);
  }
}

async function upsertDrivers(connectionId, provider, drivers) {
  for (const d of drivers) {
    if (!d.external_id) continue;
    await pool.query(`
      INSERT INTO eld_drivers (
        connection_id, provider, external_id, name, email, phone, duty_status,
        drive_remaining_minutes, shift_remaining_minutes, cycle_remaining_minutes, break_remaining_minutes,
        vehicle_external_id, gps_lat, gps_lon, located_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
      ON CONFLICT (connection_id, external_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, eld_drivers.email),
        phone = COALESCE(EXCLUDED.phone, eld_drivers.phone),
        duty_status = COALESCE(EXCLUDED.duty_status, eld_drivers.duty_status),
        drive_remaining_minutes = COALESCE(EXCLUDED.drive_remaining_minutes, eld_drivers.drive_remaining_minutes),
        shift_remaining_minutes = COALESCE(EXCLUDED.shift_remaining_minutes, eld_drivers.shift_remaining_minutes),
        cycle_remaining_minutes = COALESCE(EXCLUDED.cycle_remaining_minutes, eld_drivers.cycle_remaining_minutes),
        break_remaining_minutes = COALESCE(EXCLUDED.break_remaining_minutes, eld_drivers.break_remaining_minutes),
        vehicle_external_id = COALESCE(EXCLUDED.vehicle_external_id, eld_drivers.vehicle_external_id),
        gps_lat = COALESCE(EXCLUDED.gps_lat, eld_drivers.gps_lat),
        gps_lon = COALESCE(EXCLUDED.gps_lon, eld_drivers.gps_lon),
        located_at = COALESCE(EXCLUDED.located_at, eld_drivers.located_at),
        updated_at = now()
    `, [
      connectionId, provider, d.external_id, d.name, d.email, d.phone, d.duty_status,
      d.drive_remaining_minutes, d.shift_remaining_minutes, d.cycle_remaining_minutes, d.break_remaining_minutes,
      d.vehicle_external_id, d.gps_lat, d.gps_lon, d.located_at
    ]);
  }
}

async function saveOauthConnection({ userId, provider, token, consentIp }) {
  await ensureEldConnectTables();
  const expires = token.expires_in
    ? new Date(Date.now() + (Number(token.expires_in) * 1000))
    : null;
  const { rows } = await pool.query(`
    INSERT INTO eld_connections (
      user_id, provider, auth_mode, status, encrypted_access_token, encrypted_refresh_token,
      token_expires_at, consent_at, consent_ip, updated_at
    ) VALUES ($1,$2,'oauth','connected',$3,$4,$5, now(), $6, now())
    RETURNING *
  `, [
    userId,
    provider,
    encryptSecret(token.access_token),
    encryptSecret(token.refresh_token || ''),
    expires,
    consentIp || null
  ]);
  return rows[0];
}

async function saveApiKeyConnection({ userId, provider, apiKey, consentIp, extra }) {
  await ensureEldConnectTables();
  const { rows } = await pool.query(`
    INSERT INTO eld_connections (
      user_id, provider, auth_mode, status, encrypted_api_key, extra_json,
      consent_at, consent_ip, updated_at
    ) VALUES ($1,$2,'api_key','connected',$3,$4::jsonb, now(), $5, now())
    RETURNING *
  `, [userId, provider, encryptSecret(apiKey), JSON.stringify(extra || {}), consentIp || null]);
  return rows[0];
}

async function saveGeotabConnection({ userId, session, consentIp }) {
  await ensureEldConnectTables();
  const extra = {
    database: session.database,
    username: session.userName,
    server: session.server,
    encrypted_session_id: encryptSecret(session.sessionId)
  };
  const { rows } = await pool.query(`
    INSERT INTO eld_connections (
      user_id, provider, auth_mode, status, extra_json, account_label,
      consent_at, consent_ip, updated_at
    ) VALUES ($1,'geotab','session','connected',$2::jsonb,$3, now(), $4, now())
    RETURNING *
  `, [userId, JSON.stringify(extra), `${session.database} fleet`, consentIp || null]);
  return rows[0];
}

async function syncConnection(row) {
  await ensureEldConnectTables();
  const pulled = await pullProvider(row.provider, credsFrom(row));
  await upsertVehicles(row.id, row.provider, pulled.vehicles || []);
  await upsertDrivers(row.id, row.provider, pulled.drivers || []);
  await pool.query(
    `UPDATE eld_connections
     SET status = 'connected', account_label = COALESCE($2, account_label),
         last_sync_at = now(), last_error = NULL, updated_at = now()
     WHERE id = $1`,
    [row.id, pulled.account_label || null]
  );
  return {
    vehicles: pulled.vehicles?.length || 0,
    drivers: pulled.drivers?.length || 0,
    account_label: pulled.account_label
  };
}

async function markConnectionError(id, message) {
  await pool.query(
    `UPDATE eld_connections SET status = 'error', last_error = $2, updated_at = now() WHERE id = $1`,
    [id, String(message || 'Sync failed').slice(0, 400)]
  );
}

async function disconnectConnection(id) {
  await pool.query(`DELETE FROM eld_connections WHERE id = $1`, [id]);
}

async function deskPayload(user) {
  const connections = await connectionsForUser(user);
  const ids = connections.map((c) => c.id);
  let vehicles = [];
  let drivers = [];
  if (ids.length) {
    const v = await pool.query(
      `SELECT * FROM eld_vehicles WHERE connection_id = ANY($1::int[]) ORDER BY name ASC`,
      [ids]
    );
    const d = await pool.query(
      `SELECT * FROM eld_drivers WHERE connection_id = ANY($1::int[]) ORDER BY name ASC`,
      [ids]
    );
    vehicles = v.rows.map(publicVehicle);
    drivers = d.rows.map(publicDriver);
  }
  return {
    connections: connections.map(publicConnection),
    vehicles,
    drivers,
    with_gps: vehicles.filter((v) => v.gps_lat != null && v.gps_lon != null)
  };
}

async function applyVehiclePing(connectionId, mapped) {
  if (!mapped?.external_id) return;
  await upsertVehicles(connectionId, mapped.provider || 'motive', [mapped]);
}

module.exports = {
  ensureEldConnectTables,
  publicConnection,
  publicVehicle,
  publicDriver,
  connectionsForUser,
  getConnection,
  saveOauthConnection,
  saveApiKeyConnection,
  saveGeotabConnection,
  syncConnection,
  markConnectionError,
  disconnectConnection,
  deskPayload,
  applyVehiclePing
};
