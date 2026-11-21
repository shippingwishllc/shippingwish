// utils/load-ingest.js
// Centralized Freight Load Normalization, Cross-Channel Deduplication, CSV Parser & 24h Auto-Expiry Engine
// Channels: BROKER_API, EMAIL_PARSER, CSV_SYNC, MANUAL_PORTAL, EDI_204

const crypto = require('crypto');
const pool = require('../db');
const { ensureUnifiedSchema } = require('./load-lifecycle');
const { stateCenter, roadMiles, FREIGHT_COORDINATES } = require('./geo');
const { lookupZip } = require('./us-zipcodes');
const { extractPhoneWithExt } = require('./dat-load-parser');
const { sanitizeEmail } = require('./email-valid');

const VALID_CHANNELS = new Set([
  'BROKER_API',
  'EMAIL_PARSER',
  'CSV_SYNC',
  'MANUAL_PORTAL',
  'EDI_204'
]);

function normalizeEquipment(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('reefer') || s.includes('refrig') || s.includes('temp') || s === 'r' || s === 'vr') {
    return { code: 'REEFER', label: '53ft Reefer', defaultLength: 53 };
  }
  if (s.includes('step') || s === 'sd') {
    return { code: 'STEP_DECK', label: 'Step Deck', defaultLength: 53 };
  }
  if (s.includes('hotshot') || s.includes('hot shot') || s === 'hs') {
    return { code: 'HOTSHOT', label: '40ft Hotshot', defaultLength: 40 };
  }
  if (s.includes('flat') || s === 'f' || s === 'fd') {
    return { code: 'FLATBED', label: '48ft Flatbed', defaultLength: 48 };
  }
  if (s.includes('box') || s.includes('straight') || s.includes('26') || s === 'sb') {
    return { code: 'BOX_TRUCK', label: '26ft Box Truck', defaultLength: 26 };
  }
  if (s.includes('power') || s === 'po') {
    return { code: 'POWER_ONLY', label: 'Power Only', defaultLength: 0 };
  }
  return { code: 'DRY_VAN', label: '53ft Dry Van', defaultLength: 53 };
}

function parseCityState(rawStr, cityIn, stateIn, zipIn) {
  const raw = String(rawStr || '').trim();
  let city = String(cityIn || '').trim();
  let state = String(stateIn || '').trim().toUpperCase().slice(0, 2);
  let zip = String(zipIn || '').replace(/[^0-9]/g, '').slice(0, 5);

  if (!city && raw) {
    const zipMatch = raw.match(/\b(\d{5})\b/);
    if (zipMatch && !zip) zip = zipMatch[1];
    const clean = raw.replace(/\b\d{5}\b/, '').replace(/,\s*US(?:A)?$/i, '').trim();
    const m = clean.match(/^([A-Za-z0-9\s.'-]+?)(?:,\s*|\s+)([A-Za-z]{2})$/);
    if (m) {
      city = m[1].trim();
      state = state || m[2].toUpperCase();
    } else {
      city = clean;
    }
  }
  if ((!city || !state) && zip && zip.length === 5) {
    try {
      const zInfo = lookupZip(zip);
      if (zInfo) {
        if (!city && zInfo.city) city = zInfo.city;
        if (!state && zInfo.state) state = String(zInfo.state).toUpperCase().slice(0, 2);
      }
    } catch (_) {}
  }
  const full = city && state ? `${city}, ${state}` : (raw || city || '');
  return { city, state: state || null, zip: zip || null, full };
}

function resolveOfflineCoords(loc) {
  if (!loc) return null;
  if (loc.city && loc.state) {
    const key = `${loc.city.toLowerCase()}, ${loc.state.toLowerCase()}`;
    if (FREIGHT_COORDINATES && FREIGHT_COORDINATES[key]) {
      return FREIGHT_COORDINATES[key];
    }
  }
  if (loc.state) return stateCenter(loc.state);
  return null;
}

function parseDateSafe(val, fallbackIso = null) {
  if (!val) return fallbackIso;
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return fallbackIso;
}

function normalizeFullOrPartial(val) {
  const s = String(val || '').toUpperCase().trim();
  if (s === 'LTL' || s.includes('PARTIAL') || s.includes('LESS')) return 'LTL';
  return 'FTL';
}

function buildDedupKey({ brokerMc, brokerName, originFull, destFull, pickupDate, externalRef }) {
  const mcDigits = String(brokerMc || '').replace(/\D/g, '');
  const brokerPart = mcDigits ? `mc${mcDigits}` : String(brokerName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  if (externalRef && String(externalRef).trim().length >= 3) {
    const refPart = String(externalRef).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
    return `ref:${brokerPart}:${refPart}`;
  }
  const origPart = String(originFull || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  const destPart = String(destFull || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  const datePart = String(pickupDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return `lane:${brokerPart}:${origPart}:${destPart}:${datePart}`;
}

function normalizeStandardLoad(raw = {}, ctx = {}) {
  const orig = parseCityState(
    raw.origin || raw.pickup_location || raw.origin_location,
    raw.origin_city,
    raw.origin_state || raw.pickup_state,
    raw.origin_zip
  );
  const dest = parseCityState(
    raw.destination || raw.delivery_location || raw.dest_location,
    raw.destination_city,
    raw.destination_state || raw.delivery_state,
    raw.destination_zip
  );

  const origGeo = resolveOfflineCoords(orig);
  const destGeo = resolveOfflineCoords(dest);

  const originLat = raw.origin_lat != null ? Number(raw.origin_lat) : (origGeo ? Number(origGeo.lat) : null);
  const originLng = raw.origin_lng != null ? Number(raw.origin_lng) : (origGeo ? Number(origGeo.lng) : null);
  const destLat = raw.destination_lat != null ? Number(raw.destination_lat) : (destGeo ? Number(destGeo.lat) : null);
  const destLng = raw.destination_lng != null ? Number(raw.destination_lng) : (destGeo ? Number(destGeo.lng) : null);

  let miles = parseInt(String(raw.estimated_miles ?? raw.miles ?? raw.loaded_miles ?? '').replace(/[^0-9]/g, ''), 10) || 0;
  if (miles <= 0 && Number.isFinite(originLat) && Number.isFinite(originLng) && Number.isFinite(destLat) && Number.isFinite(destLng)) {
    try {
      const est = roadMiles({ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng });
      if (est && est > 0) miles = Math.round(est);
    } catch (_) {}
  }

  const rateRaw = String(raw.rate_total_usd ?? raw.rate ?? raw.total_rate ?? '').replace(/[^0-9.]/g, '');
  const rate = parseFloat(rateRaw) || 0;
  const rpm = miles > 0 && rate > 0 ? Number((rate / miles).toFixed(2)) : (parseFloat(raw.rate_per_mile ?? raw.rpm) || 0);

  const eq = normalizeEquipment(raw.equipment_type || raw.equipment || raw.trailer_type);
  const weightRaw = String(raw.weight_lbs ?? raw.weight ?? '').replace(/[^0-9.]/g, '');
  const weightLbs = Math.round(parseFloat(weightRaw)) || (eq.code === 'BOX_TRUCK' ? 8500 : 42000);
  const lengthFt = parseInt(String(raw.length_ft ?? raw.length ?? '').replace(/[^0-9]/g, ''), 10) || eq.defaultLength || 53;

  const todayIso = new Date().toISOString().slice(0, 10);
  const pickupStart = parseDateSafe(raw.pickup_date_start || raw.pickup_date, todayIso);
  const pickupEnd = parseDateSafe(raw.pickup_date_end, null);
  const deliveryStart = parseDateSafe(raw.delivery_date_start || raw.delivery_date, null);
  const deliveryEnd = parseDateSafe(raw.delivery_date_end, null);

  const channelRaw = String(raw.source_channel || ctx.source_channel || 'MANUAL_PORTAL').toUpperCase().trim();
  const sourceChannel = VALID_CHANNELS.has(channelRaw) ? channelRaw : 'MANUAL_PORTAL';

  const brokerName = String(
    raw.broker_company_name || raw.broker_name || ctx.broker_company_name || ctx.company_name || 'Verified Freight Broker'
  ).trim().slice(0, 140);

  const mcRaw = String(raw.broker_mc_number || raw.broker_mc || ctx.broker_mc_number || ctx.mc_number || '').trim();
  const mcDigits = mcRaw.replace(/\D/g, '');
  const brokerMc = mcDigits ? `MC-${mcDigits}` : (mcRaw || null);

  const dotDigits = String(raw.broker_dot_number || raw.dot_number || ctx.broker_dot_number || ctx.dot_number || '').replace(/\D/g, '');
  const brokerDot = dotDigits || null;

  const brokerEmail = sanitizeEmail(raw.broker_contact_email || raw.broker_email || raw.email || ctx.broker_contact_email || ctx.email || '') || null;
  const brokerPhone = extractPhoneWithExt(String(raw.broker_contact_phone || raw.broker_phone || raw.phone || ctx.broker_contact_phone || ctx.phone || '')) || null;
  const brokerContact = [brokerEmail, brokerPhone].filter(Boolean).join(' | ') || null;
  const brokerVerified = Boolean(raw.broker_verified ?? ctx.broker_verified ?? Boolean(brokerMc));

  const externalRef = String(raw.external_reference_id || raw.external_ref || raw.external_id || raw.reference_id || '').trim().slice(0, 110) || null;
  const fullOrPartial = normalizeFullOrPartial(raw.full_or_partial || raw.load_type);
  const commodity = String(raw.commodity_description || raw.commodity || 'General Freight').trim().slice(0, 160);
  const notes = String(raw.notes || raw.special_instructions || '').trim().slice(0, 1000) || null;

  const ttlHours = Math.max(1, Math.min(168, Number(raw.ttl_hours || ctx.ttl_hours || 24)));
  const expiresAt = raw.expires_at ? new Date(raw.expires_at) : new Date(Date.now() + ttlHours * 3600 * 1000);

  const dedupKey = buildDedupKey({
    brokerMc,
    brokerName,
    originFull: orig.full,
    destFull: dest.full,
    pickupDate: pickupStart,
    externalRef
  });

  return {
    external_reference_id: externalRef,
    source_channel: sourceChannel,
    source_type: sourceChannel === 'BROKER_API' ? 'partner_api'
      : sourceChannel === 'EMAIL_PARSER' ? 'ai_ingest'
      : sourceChannel === 'EDI_204' ? 'edi_204'
      : 'broker',
    broker_user_id: ctx.broker_user_id || raw.broker_user_id || null,
    broker_company_name: brokerName,
    broker_mc_number: brokerMc,
    broker_dot_number: brokerDot,
    broker_contact_email: brokerEmail,
    broker_contact_phone: brokerPhone,
    broker_contact: brokerContact,
    broker_verified: brokerVerified,
    origin_city: orig.city,
    origin_state: orig.state,
    origin_zip: orig.zip,
    origin_full: orig.full,
    origin_lat: Number.isFinite(originLat) ? originLat : null,
    origin_lng: Number.isFinite(originLng) ? originLng : null,
    destination_city: dest.city,
    destination_state: dest.state,
    destination_zip: dest.zip,
    destination_full: dest.full,
    destination_lat: Number.isFinite(destLat) ? destLat : null,
    destination_lng: Number.isFinite(destLng) ? destLng : null,
    pickup_date_start: pickupStart,
    pickup_date_end: pickupEnd,
    delivery_date_start: deliveryStart,
    delivery_date_end: deliveryEnd,
    equipment_code: eq.code,
    equipment_type: eq.label,
    weight_lbs: weightLbs,
    length_ft: lengthFt,
    full_or_partial: fullOrPartial,
    commodity_description: commodity,
    rate_total_usd: rate,
    estimated_miles: miles,
    rate_per_mile: rpm,
    notes,
    expires_at: expiresAt,
    dedup_key: dedupKey
  };
}

function validateNormalizedLoad(norm) {
  const errors = [];
  if (!norm.origin_full || norm.origin_full.length < 3) errors.push('Origin city/state is required');
  if (!norm.destination_full || norm.destination_full.length < 3) errors.push('Destination city/state is required');
  if (norm.rate_total_usd < 0) errors.push('Rate cannot be negative');
  if (norm.weight_lbs > 120000) errors.push('Weight exceeds legal maximum (120,000 lbs)');
  return errors;
}

async function upsertStandardLoad(raw, ctx = {}) {
  await ensureUnifiedSchema();
  const norm = normalizeStandardLoad(raw, ctx);
  const errs = validateNormalizedLoad(norm);
  if (errs.length) {
    return { ok: false, action: 'invalid', errors: errs, normalized: norm };
  }

  // Cross-channel deduplication: check active/recent open loads matching dedup_key OR exact lane+broker
  const existing = await pool.query(
    `SELECT id, load_number, status, carrier_id
     FROM loads
     WHERE deleted_at IS NULL
       AND (
         dedup_key = $1
         OR (
           lower(pickup_location) = lower($2)
           AND lower(delivery_location) = lower($3)
           AND pickup_date = $4::date
           AND (
             ($5::text IS NOT NULL AND broker_mc = $5::text)
             OR lower(broker_name) = lower($6)
           )
         )
       )
       AND created_at > NOW() - INTERVAL '72 hours'
     ORDER BY id DESC
     LIMIT 1`,
    [
      norm.dedup_key,
      norm.origin_full,
      norm.destination_full,
      norm.pickup_date_start,
      norm.broker_mc_number,
      norm.broker_company_name
    ]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    // Never overwrite a load already booked/dispatched by a carrier
    if (row.carrier_id) {
      return { ok: true, action: 'skipped_booked', load: row, normalized: norm };
    }
    const upd = await pool.query(
      `UPDATE loads
       SET rate = CASE WHEN $2 > 0 THEN $2 ELSE rate END,
           miles = CASE WHEN $3 > 0 THEN $3 ELSE miles END,
           rpm = CASE WHEN $4 > 0 THEN $4 ELSE rpm END,
           weight = CASE WHEN $5 > 0 THEN $5 ELSE weight END,
           broker_contact = COALESCE(NULLIF($6, ''), broker_contact),
           broker_mc = COALESCE(NULLIF($7, ''), broker_mc),
           broker_dot_number = COALESCE(NULLIF($8, ''), broker_dot_number),
           broker_verified = COALESCE(broker_verified, FALSE) OR $9,
           expires_at = $10,
           is_public_board = TRUE,
           status = CASE WHEN status::text IN ('expired', 'covered') THEN 'open' ELSE status END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        row.id,
        norm.rate_total_usd,
        norm.estimated_miles,
        norm.rate_per_mile,
        norm.weight_lbs,
        norm.broker_contact,
        norm.broker_mc_number,
        norm.broker_dot_number,
        norm.broker_verified,
        norm.expires_at
      ]
    );
    return { ok: true, action: 'updated', load: upd.rows[0], normalized: norm };
  }

  const loadNumber = `LNX-${crypto.randomInt(100000, 999999)}`;
  const ins = await pool.query(
    `INSERT INTO loads (
      load_number, external_reference_id, source_channel, source_type,
      broker_user_id, broker_name, broker_mc, broker_dot_number, broker_contact, broker_verified,
      pickup_location, pickup_state, origin_zip, origin_lat, origin_lng,
      delivery_location, delivery_state, destination_zip, destination_lat, destination_lng,
      pickup_date, pickup_date_end, delivery_date, delivery_date_end,
      equipment_type, weight, length_ft, full_or_partial, commodity,
      rate, miles, rpm, notes, status, is_public_board, expires_at, dedup_key,
      created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,
      $21,$22,$23,$24,
      $25,$26,$27,$28,$29,
      $30,$31,$32,$33,'open',TRUE,$34,$35,
      NOW(),NOW()
    ) RETURNING *`,
    [
      loadNumber, norm.external_reference_id, norm.source_channel, norm.source_type,
      norm.broker_user_id, norm.broker_company_name, norm.broker_mc_number, norm.broker_dot_number, norm.broker_contact, norm.broker_verified,
      norm.origin_full, norm.origin_state, norm.origin_zip, norm.origin_lat, norm.origin_lng,
      norm.destination_full, norm.destination_state, norm.destination_zip, norm.destination_lat, norm.destination_lng,
      norm.pickup_date_start, norm.pickup_date_end, norm.delivery_date_start, norm.delivery_date_end,
      norm.equipment_type, norm.weight_lbs, norm.length_ft, norm.full_or_partial, norm.commodity_description,
      norm.rate_total_usd, norm.estimated_miles, norm.rate_per_mile, norm.notes, norm.expires_at, norm.dedup_key
    ]
  );

  const inserted = ins.rows[0];

  // Live SSE broadcast
  try {
    const loadboardRouter = require('../routes/loadboard');
    if (typeof loadboardRouter.broadcastLoadboardEvent === 'function') {
      loadboardRouter.broadcastLoadboardEvent('load_posted', inserted);
    }
  } catch (_) {}

  // Auto-save real broker into Broker Directory
  try {
    const brokersRouter = require('../routes/brokers');
    if (typeof brokersRouter.syncBrokersFromLoadRows === 'function') {
      brokersRouter.syncBrokersFromLoadRows([inserted]).catch(() => {});
    }
  } catch (_) {}

  // Vercel-native Instant High-RPM Dispatcher Truck Matching Alert (zero node-cron)
  try {
    const { matchAndAlertDispatchersForLoad } = require('./dispatcher-alerts');
    matchAndAlertDispatchersForLoad(inserted).catch(() => {});
  } catch (_) {}

  return { ok: true, action: 'inserted', load: inserted, normalized: norm };
}

/**
 * RFC-4180 CSV parser with automatic flexible header mapping
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsvFreightText(csvText, customMap = {}) {
  const lines = String(csvText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { headers: [], validRows: [], invalidRows: [{ row: 1, errors: ['CSV must include a header row and at least one data row.'] }] };
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const normHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const findCol = (field, aliases, excludeTokens = []) => {
    if (customMap && customMap[field]) {
      const target = String(customMap[field]).toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = normHeaders.indexOf(target);
      if (idx >= 0) return idx;
    }
    // Pass 1: Exact normalized header match (prevents origin_state from hijacking origin_city)
    for (const a of aliases) {
      const idx = normHeaders.findIndex((h) => h === a);
      if (idx >= 0) return idx;
    }
    // Pass 2: Safe substring fallback (respecting exclusions)
    for (const a of aliases) {
      const idx = normHeaders.findIndex(
        (h) => h.includes(a) && !excludeTokens.some((ex) => h.includes(ex))
      );
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const colIdx = {
    origin: findCol('origin', ['origincity', 'pickupcity', 'pickuplocation', 'originlocation', 'origin', 'from', 'orig'], ['state', 'zip', 'postal', 'lat', 'lng', 'date']),
    origin_state: findCol('origin_state', ['originstate', 'pickupstate', 'origst', 'fromstate']),
    origin_zip: findCol('origin_zip', ['originzip', 'pickupzip', 'origzip', 'fromzip']),
    destination: findCol('destination', ['destinationcity', 'deliverycity', 'destcity', 'deliverylocation', 'destinationlocation', 'destination', 'dest', 'to'], ['state', 'zip', 'postal', 'lat', 'lng', 'date']),
    destination_state: findCol('destination_state', ['destinationstate', 'deliverystate', 'deststate', 'destst', 'tostate']),
    destination_zip: findCol('destination_zip', ['destinationzip', 'deliveryzip', 'destzip', 'tozip']),
    equipment: findCol('equipment', ['equipmenttype', 'equipment', 'trailertype', 'trailer', 'trucktype']),
    weight: findCol('weight', ['weightlbs', 'weight', 'lbs']),
    length_ft: findCol('length_ft', ['lengthft', 'length', 'trailerlength']),
    full_or_partial: findCol('full_or_partial', ['fullorpartial', 'loadtype', 'ftlltl', 'capacity']),
    rate: findCol('rate', ['ratetotalusd', 'totalrate', 'rate', 'price', 'pay']),
    miles: findCol('miles', ['estimatedmiles', 'loadedmiles', 'miles', 'trip', 'distance']),
    pickup_date: findCol('pickup_date', ['pickupdate', 'pickupdatestart', 'shipdate', 'date']),
    delivery_date: findCol('delivery_date', ['deliverydate', 'deliverydatestart', 'dropdate']),
    commodity: findCol('commodity', ['commoditydescription', 'commodity', 'freight', 'cargo']),
    external_ref: findCol('external_ref', ['externalreferenceid', 'referenceid', 'externalref', 'ref', 'reference', 'loadnumber', 'loadid', 'bol']),
    notes: findCol('notes', ['notes', 'specialinstructions', 'comments', 'instructions'])
  };

  const validRows = [];
  const invalidRows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (k) => (colIdx[k] >= 0 ? (cells[colIdx[k]] || '').trim() : '');

    const origCity = get('origin');
    const origSt = get('origin_state');
    const destCity = get('destination');
    const destSt = get('destination_state');

    const rawRow = {
      origin: origSt && origCity && !origCity.includes(',') ? `${origCity}, ${origSt}` : origCity,
      origin_state: origSt || undefined,
      origin_zip: get('origin_zip') || undefined,
      destination: destSt && destCity && !destCity.includes(',') ? `${destCity}, ${destSt}` : destCity,
      destination_state: destSt || undefined,
      destination_zip: get('destination_zip') || undefined,
      equipment_type: get('equipment') || '53ft Dry Van',
      weight_lbs: get('weight') || 42000,
      length_ft: get('length_ft') || undefined,
      full_or_partial: get('full_or_partial') || 'FTL',
      rate_total_usd: get('rate') || 0,
      estimated_miles: get('miles') || 0,
      pickup_date_start: get('pickup_date') || undefined,
      delivery_date_start: get('delivery_date') || undefined,
      commodity_description: get('commodity') || 'General Freight',
      external_reference_id: get('external_ref') || undefined,
      notes: get('notes') || undefined
    };

    const preview = normalizeStandardLoad(rawRow, { source_channel: 'CSV_SYNC' });
    const errs = validateNormalizedLoad(preview);
    if (errs.length) {
      invalidRows.push({ row: i + 1, raw: rawRow, errors: errs });
    } else {
      validRows.push({ row: i + 1, raw: rawRow, preview });
    }
  }

  return { headers, validRows, invalidRows };
}

async function expireStaleLoads() {
  await ensureUnifiedSchema();
  const res = await pool.query(
    `UPDATE loads
     SET status = 'expired', updated_at = NOW()
     WHERE deleted_at IS NULL
       AND carrier_id IS NULL
       AND status::text IN ('open', 'new')
       AND expires_at IS NOT NULL
       AND expires_at < NOW()
     RETURNING id, load_number`
  ).catch(() => ({ rows: [] }));

  if (res.rows.length > 0) {
    try {
      const loadboardRouter = require('../routes/loadboard');
      if (typeof loadboardRouter.broadcastLoadboardEvent === 'function') {
        for (const r of res.rows) {
          loadboardRouter.broadcastLoadboardEvent('load_covered', {
            id: r.load_number || r.id,
            status: 'expired',
            covered_at: Date.now()
          });
        }
      }
    } catch (_) {}
  }

  return { expired_count: res.rows.length, expired_ids: res.rows.map((r) => r.load_number || r.id) };
}

module.exports = {
  normalizeEquipment,
  normalizeStandardLoad,
  validateNormalizedLoad,
  upsertStandardLoad,
  parseCsvFreightText,
  expireStaleLoads,
  buildDedupKey
};
