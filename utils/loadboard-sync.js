const pool = require('../db');

const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal']);

function assertPublicHttps(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '').trim()); }
  catch { throw new Error('Enter a full https API URL.'); }
  if (url.protocol !== 'https:') throw new Error('Only https load-board API URLs are allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const rebind = ['.nip.io', '.sslip.io', '.localtest.me', '.lvh.me', '.vcap.me'];
  if (PRIVATE_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal') || host.includes(':') || rebind.some((suffix) => host.endsWith(suffix))) {
    throw new Error('That API host is not allowed.');
  }
  if (/^\d+(\.\d+){0,3}$/.test(host) || isPrivateIp(host)) {
    throw new Error('Private network addresses are not allowed.');
  }
  return url.toString();
}

function isPrivateIp(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const n = m.slice(1).map((part) => Number(part));
  if (n.some((part) => part > 255)) return true;
  const [a, b] = n;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a === 0;
}

let boardSchemaPromise = null;
function ensureBoardSchema() {
  if (!boardSchemaPromise) {
    boardSchemaPromise = createBoardSchema().catch((err) => {
      boardSchemaPromise = null;
      throw err;
    });
  }
  return boardSchemaPromise;
}

async function createBoardSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loadboard_api_sources (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT,
      header_name TEXT NOT NULL DEFAULT 'Authorization',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_sync_at TIMESTAMPTZ,
      last_status TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ai_dispatch_carriers (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      equipment TEXT,
      empty_zip TEXT,
      prefer_destination TEXT,
      status TEXT NOT NULL DEFAULT 'paused',
      last_sms_at TIMESTAMPTZ,
      last_sms_status TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS mc_number TEXT;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS dot_number TEXT;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS min_rpm NUMERIC(6,2);
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS max_deadhead INTEGER NOT NULL DEFAULT 150;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS home_state TEXT;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS avoid_states TEXT;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS last_location TEXT;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS off_until TIMESTAMPTZ;
    ALTER TABLE ai_dispatch_carriers ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;
    ALTER TABLE loads ADD COLUMN IF NOT EXISTS source_type TEXT;
    ALTER TABLE loads ADD COLUMN IF NOT EXISTS source_id INTEGER;
    ALTER TABLE loads ADD COLUMN IF NOT EXISTS external_id TEXT;
    CREATE TABLE IF NOT EXISTS ai_dispatch_offers (
      id SERIAL PRIMARY KEY,
      carrier_id INTEGER NOT NULL REFERENCES ai_dispatch_carriers(id) ON DELETE CASCADE,
      load_id INTEGER NOT NULL,
      batch TEXT NOT NULL,
      slot INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'offered',
      origin_label TEXT,
      deadhead_miles INTEGER,
      loaded_miles INTEGER,
      miles_estimated BOOLEAN NOT NULL DEFAULT FALSE,
      all_in_rpm NUMERIC(6,2),
      score NUMERIC(10,2),
      broker_email TEXT,
      broker_reply TEXT,
      note TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      requested_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ai_dispatch_offers_carrier_idx ON ai_dispatch_offers (carrier_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ai_dispatch_offers_load_idx ON ai_dispatch_offers (load_id, status);
    ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS broker_authority JSONB;
    ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS ratecon JSONB;
    ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS reload_plan JSONB;
    ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS transit JSONB;
    ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS detention JSONB;
    CREATE TABLE IF NOT EXISTS ai_dispatch_pods (
      id SERIAL PRIMARY KEY,
      offer_id INTEGER NOT NULL REFERENCES ai_dispatch_offers(id) ON DELETE CASCADE,
      carrier_id INTEGER NOT NULL REFERENCES ai_dispatch_carriers(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      twilio_sid TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ai_dispatch_pods_offer_idx ON ai_dispatch_pods (offer_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS ai_dispatch_messages (
      id SERIAL PRIMARY KEY,
      carrier_id INTEGER NOT NULL REFERENCES ai_dispatch_carriers(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      intent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ai_dispatch_messages_carrier_idx ON ai_dispatch_messages (carrier_id, created_at DESC);
  `);
  // ADD VALUE can't share a transaction with other statements, so each runs on its own.
  for (const value of ['covered', 'expired']) {
    await pool.query(`ALTER TYPE load_status ADD VALUE IF NOT EXISTS '${value}'`).catch(() => {});
  }
}

function recognizedLoads(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.loads)) return payload.loads;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && payload.data && Array.isArray(payload.data.loads)) return payload.data.loads;
  return null;
}

function pickLoads(payload) {
  return recognizedLoads(payload) || [];
}

function isoDateOrNull(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function mapExternalLoad(row) {
  const origin = row.origin || row.pickup || row.pickup_location || row.pickup_city;
  const destination = row.destination || row.delivery || row.delivery_location || row.dropoff;
  const rate = Number(row.rate || row.rate_total || row.price || 0);
  const miles = Number(row.miles || row.distance || 0);
  if (!origin || !destination || !Number.isFinite(rate) || rate < 150) return null;
  const externalId = String(row.external_id || row.id || row.load_id || `${origin}|${destination}|${rate}`).slice(0, 120);
  return {
    externalId,
    origin: String(origin).slice(0, 180),
    destination: String(destination).slice(0, 180),
    rate,
    miles: Number.isFinite(miles) ? miles : 0,
    equipment: String(row.equipment || row.equipment_type || "53' Dry Van").slice(0, 80),
    weight: row.weight || null,
    commodity: String(row.commodity || 'General Freight').slice(0, 120),
    pickupDate: isoDateOrNull(row.pickup_date || row.pickupDate),
    deliveryDate: isoDateOrNull(row.delivery_date || row.deliveryDate),
    brokerName: String(row.broker_name || row.broker || row.company || 'Licensed board').slice(0, 120),
    brokerPhone: String(row.broker_phone || row.phone || '').slice(0, 40),
    brokerEmail: String(row.broker_email || row.email || '').slice(0, 120),
    brokerMc: String(row.broker_mc || row.mc || '').slice(0, 40),
    covered: ['covered', 'expired', 'cancelled', 'booked'].includes(String(row.status || '').toLowerCase())
  };
}

async function fetchSourceLoads(source) {
  const url = assertPublicHttps(source.base_url);
  const headers = { Accept: 'application/json' };
  const headerName = source.header_name || 'Authorization';
  if (source.api_key) {
    headers[headerName] = headerName.toLowerCase() === 'authorization' && !String(source.api_key).startsWith('Bearer ')
      ? `Bearer ${source.api_key}`
      : source.api_key;
  }
  const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('The API redirected. Paste the final https JSON URL.');
  }
  if (!response.ok) throw new Error(`API responded ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json') && !type.includes('text/plain')) {
    throw new Error('The API did not return JSON. This desk does not read web pages.');
  }
  const payload = await response.json();
  const rows = recognizedLoads(payload);
  if (!rows) throw new Error('JSON did not include a loads array. This desk does not read web pages.');
  return rows.map(mapExternalLoad).filter(Boolean);
}

async function upsertApiLoads(source, loads) {
  const seen = [];
  for (const load of loads) {
    seen.push(load.externalId);
    const rpm = load.miles > 0 ? Number((load.rate / load.miles).toFixed(2)) : 0;
    const status = load.covered ? 'covered' : 'new';
    const existing = await pool.query(
      `SELECT id FROM loads WHERE source_type = 'api' AND source_id = $1 AND external_id = $2 LIMIT 1`,
      [source.id, load.externalId]
    );
    const contact = [load.brokerPhone, load.brokerEmail].filter(Boolean).join(' | ');
    if (existing.rows.length) {
      await pool.query(
        `UPDATE loads
         SET status = CASE WHEN status = 'covered' THEN 'covered' ELSE $2 END,
             rate = $3, pickup_location = $4, delivery_location = $5,
             equipment_type = $6, weight = $7, commodity = $8,
             pickup_date = COALESCE($9::date, pickup_date),
             delivery_date = COALESCE($10::date, delivery_date),
             broker_name = $11, broker_mc = $12, broker_contact = $13,
             miles = $14, rpm = $15, updated_at = now()
         WHERE id = $1`,
        [
          existing.rows[0].id, status, load.rate, load.origin, load.destination,
          load.equipment, load.weight, load.commodity, load.pickupDate, load.deliveryDate,
          load.brokerName, load.brokerMc, contact, load.miles, rpm
        ]
      );
    } else if (!load.covered) {
      const loadNumber = `LN-API-${source.id}-${String(load.externalId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 18)}`;
      const ins = await pool.query(
        `INSERT INTO loads (
           load_number, status, rate, pickup_location, delivery_location,
           pickup_date, delivery_date, equipment_type, weight, commodity,
           notes, broker_name, broker_mc, broker_contact, miles, rpm,
           source_type, source_id, external_id, created_at, updated_at
         ) VALUES (
           $1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'api', $16, $17, now(), now()
         ) RETURNING *`,
        [
          loadNumber, load.rate, load.origin, load.destination,
          load.pickupDate || null, load.deliveryDate || null, load.equipment, load.weight, load.commodity,
          `Imported from licensed API source ${source.name}.`,
          load.brokerName, load.brokerMc, contact, load.miles, rpm, source.id, load.externalId
        ]
      );
      try { require('./dispatch-brain').fanoutPostedLoad(ins.rows[0]); } catch (err) {
        console.warn('[dispatch] API fanout failed:', err.message);
      }
    }
  }
  await pool.query(
    `UPDATE loads SET status = 'expired', updated_at = now()
     WHERE source_type = 'api' AND source_id = $1 AND status = 'new'
       AND NOT (external_id = ANY($2::text[]))`,
    [source.id, seen]
  );
  await pool.query(
    `UPDATE loads SET status = 'expired', updated_at = now()
     WHERE status = 'new' AND pickup_date IS NOT NULL AND pickup_date < CURRENT_DATE`
  );
}

async function syncSource(source, { force = false } = {}) {
  await ensureBoardSchema();
  if (!force && source.last_sync_at && Date.now() - new Date(source.last_sync_at).getTime() < 55000) {
    return { skipped: true, status: source.last_status || 'fresh' };
  }
  try {
    const loads = await fetchSourceLoads(source);
    await upsertApiLoads(source, loads);
    await pool.query(
      `UPDATE loadboard_api_sources SET last_sync_at = now(), last_status = $2, last_error = NULL WHERE id = $1`,
      [source.id, `Imported ${loads.length} loads`]
    );
    return { ok: true, count: loads.length };
  } catch (err) {
    await pool.query(
      `UPDATE loadboard_api_sources SET last_sync_at = now(), last_status = 'error', last_error = $2 WHERE id = $1`,
      [source.id, safeSyncError(source, err)]
    );
    return { ok: false, error: err.message };
  }
}

async function syncDueSources() {
  await ensureBoardSchema();
  const { rows } = await pool.query(`SELECT * FROM loadboard_api_sources WHERE enabled = TRUE ORDER BY id`);
  const results = [];
  for (const source of rows) results.push({ id: source.id, ...(await syncSource(source)) });
  return results;
}

function safeSyncError(source, err) {
  let message = String(err && err.message ? err.message : 'sync failed');
  if (source.base_url) message = message.split(source.base_url).join('[url]');
  if (source.api_key) message = message.split(String(source.api_key)).join('[key]');
  return message.slice(0, 300);
}

module.exports = {
  assertPublicHttps,
  ensureBoardSchema,
  pickLoads,
  recognizedLoads,
  mapExternalLoad,
  syncSource,
  syncDueSources,
  safeSyncError
};
