const pool = require('../db');
const { encryptSecret, decryptSecret } = require('./eld-crypto');
const { listPartners, getPartner, pushLocation, previewPayload } = require('./visibility-partners');

let migrated = false;

async function ensureVisibilityTables() {
  if (migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visibility_connections (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      partner VARCHAR(30) NOT NULL,
      auth_mode VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      account_label VARCHAR(200),
      encrypted_username TEXT,
      encrypted_password TEXT,
      encrypted_api_key TEXT,
      extra_json JSONB DEFAULT '{}'::jsonb,
      consent_at TIMESTAMP,
      consent_ip VARCHAR(64),
      last_push_at TIMESTAMP,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_vis_conn_user ON visibility_connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_vis_conn_partner ON visibility_connections(partner);

    CREATE TABLE IF NOT EXISTS visibility_push_log (
      id SERIAL PRIMARY KEY,
      connection_id INT REFERENCES visibility_connections(id) ON DELETE CASCADE,
      share_id INT,
      load_id INT,
      partner VARCHAR(30) NOT NULL,
      ok BOOLEAN NOT NULL DEFAULT FALSE,
      http_status INT,
      error TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_vis_push_share ON visibility_push_log(share_id);
  `);
  migrated = true;
}

function extrasFrom(row) {
  return row && row.extra_json && typeof row.extra_json === 'object' ? row.extra_json : {};
}

function publicConnection(row) {
  if (!row) return null;
  const extra = extrasFrom(row);
  return {
    id: row.id,
    partner: row.partner,
    auth_mode: row.auth_mode,
    status: row.status,
    account_label: row.account_label || null,
    last_push_at: row.last_push_at,
    last_error: row.last_error,
    consent_at: row.consent_at,
    created_at: row.created_at,
    extra: {
      push_url_set: Boolean(extra.push_url),
      account_id_set: Boolean(extra.account_id),
      partner_id_set: Boolean(extra.partner_id),
      client_id_set: Boolean(extra.client_id),
      default_shipper: extra.default_shipper || null,
      default_mpid: extra.default_mpid || null,
      default_scac: extra.default_scac || null
    }
  };
}

function credsFrom(row) {
  const extra = extrasFrom(row);
  return {
    username: decryptSecret(row.encrypted_username),
    password: decryptSecret(row.encrypted_password),
    apiKey: decryptSecret(row.encrypted_api_key),
    clientId: extra.client_id || null,
    secret: decryptSecret(extra.encrypted_secret),
    accountId: extra.account_id || null,
    partnerId: extra.partner_id || null,
    pushUrl: extra.push_url || (getPartner(row.partner) && getPartner(row.partner).pushUrl) || null
  };
}

async function connectionsForOwner(userId) {
  await ensureVisibilityTables();
  const id = parseInt(userId, 10);
  if (!Number.isFinite(id)) return [];
  const { rows } = await pool.query(
    `SELECT * FROM visibility_connections WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`,
    [id]
  );
  return rows;
}

async function connectionsForUser(user) {
  await ensureVisibilityTables();
  if (['admin', 'super_admin', 'dispatcher'].includes(user.role)) {
    const { rows } = await pool.query(`SELECT * FROM visibility_connections ORDER BY updated_at DESC LIMIT 50`);
    return rows;
  }
  return connectionsForOwner(user.id);
}

async function getConnection(id, user) {
  await ensureVisibilityTables();
  const { rows } = await pool.query(`SELECT * FROM visibility_connections WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  if (['admin', 'super_admin', 'dispatcher'].includes(user.role)) return row;
  if (row.user_id === user.id) return row;
  return null;
}

async function saveConnection({
  userId, partner, authMode, username, password, apiKey, extra, consentIp, accountLabel
}) {
  await ensureVisibilityTables();
  const spec = getPartner(partner);
  if (!spec) throw new Error('Pick FourKites, MacroPoint, or Trucker Tools.');
  const extraSafe = Object.assign({}, extra || {});
  if (extraSafe.secret) {
    extraSafe.encrypted_secret = encryptSecret(extraSafe.secret);
    delete extraSafe.secret;
  }
  const { rows } = await pool.query(`
    INSERT INTO visibility_connections (
      user_id, partner, auth_mode, status, account_label,
      encrypted_username, encrypted_password, encrypted_api_key, extra_json,
      consent_at, consent_ip, updated_at
    ) VALUES ($1,$2,$3,'connected',$4,$5,$6,$7,$8::jsonb, now(), $9, now())
    RETURNING *
  `, [
    userId,
    spec.key,
    authMode,
    accountLabel || spec.name,
    username ? encryptSecret(username) : null,
    password ? encryptSecret(password) : null,
    apiKey ? encryptSecret(apiKey) : null,
    JSON.stringify(extraSafe),
    consentIp || null
  ]);
  return rows[0];
}

async function disconnectConnection(id) {
  await pool.query(`DELETE FROM visibility_connections WHERE id = $1`, [id]);
}

async function markPush(row, { ok, status, error, shareId, loadId }) {
  await pool.query(
    `UPDATE visibility_connections
     SET last_push_at = now(), last_error = $2, status = $3, updated_at = now()
     WHERE id = $1`,
    [row.id, ok ? null : String(error || '').slice(0, 400), ok ? 'connected' : 'error']
  );
  await pool.query(
    `INSERT INTO visibility_push_log (connection_id, share_id, load_id, partner, ok, http_status, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.id, shareId || null, loadId || null, row.partner, Boolean(ok), status || null, ok ? null : String(error || '').slice(0, 400)]
  );
}

function pingFromShare(share, overrides) {
  const vis = share.visibility_json && typeof share.visibility_json === 'object' ? share.visibility_json : {};
  const base = {
    lat: share.last_lat,
    lon: share.last_lon,
    locatedAt: share.last_ping_at || new Date().toISOString(),
    load_number: share.load_number,
    billOfLading: vis.billOfLading || share.load_number,
    shipper: vis.shipper || vis.fourkites_shipper,
    fourkites_shipper: vis.fourkites_shipper || vis.shipper,
    operatingCarrierScac: vis.scac || vis.operatingCarrierScac,
    scac: vis.scac,
    truckNumber: vis.truckNumber || share.truck_number,
    trailerNumber: vis.trailerNumber,
    driverPhone: share.driver_phone,
    city: vis.city,
    state: vis.state,
    macropoint_mpid: vis.macropoint_mpid,
    macropoint_sender_load_id: vis.macropoint_sender_load_id || share.load_number,
    macropoint_requestor_load_id: vis.macropoint_requestor_load_id || vis.billOfLading || share.load_number,
    truckertools_order_id: vis.truckertools_order_id || share.load_number
  };
  Object.entries(overrides || {}).forEach(([k, v]) => {
    if (base[k] == null || base[k] === '') base[k] = v;
  });
  return base;
}

async function pushShareToConnections(user, share, { lat, lon, dryRun }) {
  await ensureVisibilityTables();
  const vis = share.visibility_json && typeof share.visibility_json === 'object' ? share.visibility_json : {};
  const wanted = Array.isArray(vis.partners) ? vis.partners.map((p) => String(p).toLowerCase()) : [];
  if (!wanted.length) return [];
  const byOwner = await connectionsForOwner(share.created_by);
  const byUser = user && user.id && user.id !== share.created_by && !['admin', 'super_admin', 'dispatcher'].includes(user.role)
    ? await connectionsForOwner(user.id)
    : [];
  const rows = [];
  const seen = new Set();
  byOwner.concat(byUser).forEach((r) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    rows.push(r);
  });
  const targets = rows.filter((r) => wanted.includes(r.partner));
  const results = [];
  for (const row of targets) {
    const extra = extrasFrom(row);
    const ping = pingFromShare(Object.assign({}, share, {
      last_lat: lat != null ? lat : share.last_lat,
      last_lon: lon != null ? lon : share.last_lon
    }), {
      shipper: extra.default_shipper,
      fourkites_shipper: extra.default_shipper,
      macropoint_mpid: extra.default_mpid,
      operatingCarrierScac: extra.default_scac,
      scac: extra.default_scac
    });
    try {
      if (dryRun) {
        results.push({
          partner: row.partner,
          connection_id: row.id,
          dry_run: true,
          preview: previewPayload(row.partner, ping, credsFrom(row))
        });
        continue;
      }
      const pushed = await pushLocation(row.partner, credsFrom(row), ping);
      await markPush(row, {
        ok: pushed.ok,
        status: pushed.status,
        error: pushed.ok ? null : `HTTP ${pushed.status}`,
        shareId: share.id,
        loadId: share.load_id
      });
      results.push({
        partner: row.partner,
        connection_id: row.id,
        ok: pushed.ok,
        status: pushed.status
      });
    } catch (err) {
      if (!dryRun) {
        await markPush(row, {
          ok: false,
          error: err.message,
          shareId: share.id,
          loadId: share.load_id
        });
      }
      results.push({ partner: row.partner, connection_id: row.id, ok: false, error: err.message });
    }
  }
  return results;
}

async function recentLog(user, limit) {
  const rows = await connectionsForUser(user);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const { rows: log } = await pool.query(
    `SELECT * FROM visibility_push_log WHERE connection_id = ANY($1::int[]) ORDER BY created_at DESC LIMIT $2`,
    [ids, limit || 20]
  );
  return log.map((r) => ({
    id: r.id,
    partner: r.partner,
    ok: r.ok,
    http_status: r.http_status,
    error: r.error,
    share_id: r.share_id,
    load_id: r.load_id,
    created_at: r.created_at
  }));
}

async function deskPayload(user) {
  const connections = await connectionsForUser(user);
  const log = await recentLog(user, 15);
  return {
    partners: listPartners(),
    connections: connections.map(publicConnection),
    log,
    how: 'Connect official partner credentials, then SW Track GPS pings (after the driver Accepts) are posted to that partner. Empty credentials mean nothing is pushed. We do not scrape MacroPoint, FourKites, or Trucker Tools.'
  };
}

module.exports = {
  ensureVisibilityTables,
  publicConnection,
  connectionsForUser,
  connectionsForOwner,
  getConnection,
  saveConnection,
  disconnectConnection,
  pingFromShare,
  pushShareToConnections,
  recentLog,
  deskPayload
};
