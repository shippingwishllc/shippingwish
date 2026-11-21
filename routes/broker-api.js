// routes/broker-api.js
// LoadsNexus & Shipping Wish Multi-Channel Freight Ingestion & Partner REST API v1
// - Broker API Key Management (/api/broker/api-key)
// - Normalized Load CRUD (/api/v1/loads, PUT, DELETE, Refresh/Bump, Bulk CSV, Search)
// - AI Email-to-Load Webhook (/api/v1/ingest/email)
// - External Broker API Adapter Framework (/api/v1/adapters)
// - FMCSA Broker Authority Verification (/api/v1/brokers/verify-fmcsa/:mc)
// - Shipping Wish Dispatch Carrier Proposal Bridge (/api/v1/loads/:id/propose-to-carrier & /api/v1/dispatch/proposals)

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { ensureUnifiedSchema, requestCarrierApproval } = require('../utils/load-lifecycle');
const { upsertStandardLoad, parseCsvFreightText, expireStaleLoads } = require('../utils/load-ingest');
const { processInboundFreightEmail } = require('../utils/email-load-pipeline');
const { listAdapters, getAdapter, runAdapterSync } = require('../utils/broker-adapters');
const { lookupCensusRow, digits } = require('../utils/fmcsa');
const { getKnownBroker } = require('../utils/broker-vet');
const { getFreightDeadhead } = require('../utils/geo');
const { parseOriginWithZip, parseDestinationsWithZip } = require('../utils/us-zipcodes');

const router = express.Router();

// Simple in-memory rate limiter for public FMCSA verification endpoint (30 req/min per IP)
const fmcsaHits = new Map();
function rateLimitFmcsa(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const rec = fmcsaHits.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 60000; }
  rec.count++;
  fmcsaHits.set(ip, rec);
  if (rec.count > 30) {
    return res.status(429).json({ error: 'Too many FMCSA verification requests. Please wait a minute.' });
  }
  next();
}

async function ensureBrokerApiKeyTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broker_api_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key TEXT NOT NULL UNIQUE,
      name TEXT DEFAULT 'Production TMS Key',
      is_active BOOLEAN DEFAULT true,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_broker_api_keys_key ON broker_api_keys(api_key);
  `).catch(() => {});
}

function generateApiKey() {
  return 'ln_live_' + crypto.randomBytes(24).toString('hex');
}

// Middleware: Authenticate via Partner API Key OR logged-in Broker/Admin/Dispatcher session
async function authenticateApiKeyOrSession(req, res, next) {
  await ensureBrokerApiKeyTable();
  const authHeader = String(req.headers['authorization'] || '');
  const apiKeyHeader = String(req.headers['x-api-key'] || '');
  let token = apiKeyHeader.trim();
  if (!token && authHeader.startsWith('Bearer ln_')) {
    token = authHeader.slice(7).trim();
  }

  if (token) {
    try {
      const keyRes = await pool.query(
        `SELECT k.*, u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                u.company_name, u.mc_number, u.dot_number, u.phone
         FROM broker_api_keys k
         JOIN users u ON k.user_id = u.id
         WHERE k.api_key = $1 AND k.is_active = true AND u.deleted_at IS NULL AND u.is_suspended = false`,
        [token]
      );
      if (!keyRes.rows.length) {
        return res.status(401).json({ error: 'Invalid or revoked API key.', code: 'INVALID_API_KEY' });
      }
      req.brokerUser = keyRes.rows[0];
      pool.query('UPDATE broker_api_keys SET last_used_at = NOW() WHERE id = $1', [keyRes.rows[0].id]).catch(() => {});
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Internal error verifying API key.' });
    }
  }

  // Fallback to authenticated browser/app session for Broker / Admin / SuperAdmin / Dispatcher
  return requireAuth(req, res, async (err) => {
    if (err) return next(err);
    const role = String(req.user?.role || '').toLowerCase();
    if (!['broker', 'admin', 'super_admin', 'dispatcher'].includes(role)) {
      return res.status(403).json({ error: 'Verified Broker or Admin account required.', code: 'ROLE_FORBIDDEN' });
    }
    try {
      const uRes = await pool.query(
        `SELECT id AS user_id, name AS user_name, email AS user_email, role AS user_role,
                company_name, mc_number, dot_number, phone
         FROM users WHERE id = $1 LIMIT 1`,
        [req.user.id]
      );
      req.brokerUser = uRes.rows[0] || {
        user_id: req.user.id,
        user_name: req.user.name,
        user_email: req.user.email,
        user_role: role,
        company_name: req.user.company_name || 'Verified Freight Brokerage',
        mc_number: req.user.mc_number || null,
        dot_number: req.user.dot_number || null,
        phone: req.user.phone || null
      };
      return next();
    } catch (_) {
      return res.status(500).json({ error: 'Could not resolve broker session.' });
    }
  });
}

function brokerContextFromReq(req, defaultChannel = 'BROKER_API') {
  const b = req.brokerUser || {};
  return {
    broker_user_id: b.user_id || null,
    broker_company_name: b.company_name || b.user_name || 'Verified Freight Brokerage',
    broker_mc_number: b.mc_number || null,
    broker_dot_number: b.dot_number || null,
    broker_contact_email: b.user_email || null,
    broker_contact_phone: b.phone || null,
    broker_verified: Boolean(b.mc_number || ['admin', 'super_admin'].includes(String(b.user_role || '').toLowerCase())),
    source_channel: defaultChannel
  };
}

// ====================================================
// 1. INTERNAL BROKER DESK API KEY MANAGEMENT
// ====================================================

router.get(['/broker/api-key', '/api-key'], requireAuth, async (req, res) => {
  await ensureBrokerApiKeyTable();
  try {
    const brokerId = req.user.id;
    let keyRes = await pool.query(
      `SELECT id, api_key, name, is_active, last_used_at, created_at
       FROM broker_api_keys
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [brokerId]
    );
    if (!keyRes.rows.length) {
      const newKey = generateApiKey();
      keyRes = await pool.query(
        `INSERT INTO broker_api_keys (user_id, api_key, name, is_active, created_at)
         VALUES ($1, $2, 'Production TMS Key', true, NOW())
         RETURNING id, api_key, name, is_active, last_used_at, created_at`,
        [brokerId, newKey]
      );
    }
    const row = keyRes.rows[0];
    res.json({ ok: true, api_key: row.api_key, name: row.name, created_at: row.created_at, last_used_at: row.last_used_at });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch API key.' });
  }
});

router.post(['/broker/api-key/regenerate', '/api-key/regenerate'], requireAuth, async (req, res) => {
  await ensureBrokerApiKeyTable();
  try {
    const brokerId = req.user.id;
    await pool.query(`UPDATE broker_api_keys SET is_active = false WHERE user_id = $1`, [brokerId]);
    const newKey = generateApiKey();
    const ins = await pool.query(
      `INSERT INTO broker_api_keys (user_id, api_key, name, is_active, created_at)
       VALUES ($1, $2, 'Production TMS Key', true, NOW())
       RETURNING id, api_key, name, is_active, last_used_at, created_at`,
      [brokerId, newKey]
    );
    res.json({ ok: true, api_key: ins.rows[0].api_key, message: 'Fresh API key generated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not regenerate API key.' });
  }
});

// ====================================================
// 2. PUBLIC FMCSA BROKER VERIFICATION (3-STEP ONBOARDING)
// ====================================================

router.get('/v1/brokers/verify-fmcsa/:mc', rateLimitFmcsa, async (req, res) => {
  const rawInput = String(req.params.mc || '').trim();
  const num = digits(rawInput);
  if (!num || num.length < 4) {
    return res.status(400).json({ error: 'Enter a valid MC# or USDOT# (minimum 4 digits).' });
  }
  try {
    // 1. Check Tier-1 verified brokers first
    const known = getKnownBroker(rawInput);
    if (known) {
      const dom = known.email && known.email.includes('@') ? known.email.split('@')[1].toLowerCase() : null;
      return res.json({
        ok: true,
        verified: true,
        is_broker: true,
        usdot_active: true,
        source: 'Verified Broker Registry + FMCSA',
        mc_number: known.mcNumber,
        dot_number: known.dotNumber,
        legal_name: known.companyName,
        dba_name: known.companyName,
        address: known.address || known.cityState,
        city_state: known.cityState,
        phone: known.phone,
        email: known.email,
        expected_email_domain: dom,
        authority_status: 'ACTIVE — Broker Operating Authority Verified'
      });
    }

    // 2. Live US DOT FMCSA Census lookup
    const row = await lookupCensusRow(rawInput);
    if (!row) {
      return res.status(404).json({
        ok: false,
        error: `No active FMCSA record found for "${rawInput}". Verify your MC# or USDOT# and try again.`
      });
    }
    const mc = digits(row.docket1) || digits(row.docket2) || num;
    const prefix = String(row.docket1prefix || 'MC').toUpperCase();
    const usdotActive = String(row.status_code || '').toUpperCase() === 'A';
    const isBroker = String(row.carship || '').toUpperCase().includes('B');
    const cityState = [row.phy_city, row.phy_state, row.phy_zip].filter(Boolean).join(', ');
    const address = [row.phy_street, cityState].filter(Boolean).join(', ');
    const email = String(row.email_address || '').toLowerCase().trim() || null;
    const expectedDomain = email && email.includes('@') ? email.split('@')[1] : null;

    return res.json({
      ok: true,
      verified: Boolean(usdotActive && isBroker),
      is_broker: isBroker,
      usdot_active: usdotActive,
      source: 'US DOT FMCSA Census Live',
      mc_number: `${prefix}-${mc}`,
      dot_number: String(row.dot_number || ''),
      legal_name: row.legal_name || row.dba_name || '',
      dba_name: row.dba_name || row.legal_name || '',
      officer: String(row.company_officer_1 || '').trim(),
      address,
      city_state: cityState,
      phone: row.phone || '',
      email,
      expected_email_domain: expectedDomain,
      authority_status: usdotActive
        ? (isBroker ? 'ACTIVE — Licensed Property Broker Authority' : 'ACTIVE — Motor Carrier Only (No Broker Authority Listed)')
        : 'INACTIVE — Authority Not Active'
    });
  } catch (err) {
    res.status(500).json({ error: 'FMCSA verification error: ' + err.message });
  }
});

// ====================================================
// 3. NORMALIZED LOAD BOARD SEARCH (/api/v1/loads/search)
// ====================================================

router.get('/v1/loads/search', optionalAuth, async (req, res) => {
  try {
    await ensureUnifiedSchema();
    const {
      origin, radius_mi, destination, dest_radius_mi,
      equipment_types, equipment_type, min_rpm, max_weight,
      full_or_partial, pickup_date_start, pickup_date_end,
      source_channel, limit: rawLimit
    } = req.query;

    const conds = [
      `l.deleted_at IS NULL`,
      `l.status::text IN ('open', 'new')`,
      `(l.expires_at IS NULL OR l.expires_at > NOW())`,
      `(l.is_public_board = TRUE OR l.carrier_id IS NULL)`
    ];
    const params = [];

    if (full_or_partial && ['FTL', 'LTL'].includes(String(full_or_partial).toUpperCase())) {
      params.push(String(full_or_partial).toUpperCase());
      conds.push(`UPPER(COALESCE(l.full_or_partial, 'FTL')) = $${params.length}`);
    }
    if (source_channel && String(source_channel).toUpperCase() !== 'ALL') {
      params.push(String(source_channel).toUpperCase());
      conds.push(`UPPER(COALESCE(l.source_channel, 'MANUAL_PORTAL')) = $${params.length}`);
    }
    if (pickup_date_start && /^\d{4}-\d{2}-\d{2}$/.test(String(pickup_date_start))) {
      params.push(String(pickup_date_start));
      conds.push(`l.pickup_date >= $${params.length}::date`);
    }
    if (pickup_date_end && /^\d{4}-\d{2}-\d{2}$/.test(String(pickup_date_end))) {
      params.push(String(pickup_date_end));
      conds.push(`l.pickup_date <= $${params.length}::date`);
    }
    if (min_rpm && !isNaN(parseFloat(min_rpm)) && parseFloat(min_rpm) > 0) {
      params.push(parseFloat(min_rpm));
      conds.push(`l.rpm >= $${params.length}`);
    }

    const lim = Math.min(500, Math.max(10, parseInt(rawLimit, 10) || 250));
    const dbRes = await pool.query(
      `SELECT l.id, l.load_number, l.external_reference_id, l.source_channel, l.source_type,
              l.broker_name, l.broker_mc, l.broker_dot_number, l.broker_contact, l.broker_verified,
              l.pickup_location, l.pickup_state, l.origin_zip, l.origin_lat, l.origin_lng,
              l.delivery_location, l.delivery_state, l.destination_zip, l.destination_lat, l.destination_lng,
              l.pickup_date, l.pickup_date_end, l.delivery_date, l.delivery_date_end,
              l.equipment_type, l.weight, l.length_ft, l.full_or_partial, l.commodity,
              l.rate, l.miles, l.rpm, l.status, l.expires_at, l.created_at, l.updated_at
       FROM loads l
       WHERE ${conds.join(' AND ')}
       ORDER BY l.updated_at DESC, l.id DESC
       LIMIT ${lim}`,
      params
    );

    const origInfo = origin ? parseOriginWithZip(String(origin).trim()) : null;
    const maxDho = radius_mi ? parseInt(radius_mi, 10) : 150;
    const destInfo = destination ? parseDestinationsWithZip(String(destination).trim()) : null;
    const maxDhd = dest_radius_mi ? parseInt(dest_radius_mi, 10) : 150;
    const maxWtNum = max_weight ? parseInt(max_weight, 10) : 0;

    const eqList = String(equipment_types || equipment_type || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && s !== 'all' && s !== 'any');

    let rows = dbRes.rows.map((r) => {
      const weightNum = Math.round(parseFloat(String(r.weight ?? '').replace(/[^0-9.]/g, ''))) || 42000;
      const dho = origInfo ? getFreightDeadhead(origInfo, r.pickup_location) : 0;
      const dhd = destination && !destInfo?.isNationwide ? getFreightDeadhead(String(destination), r.delivery_location) : 0;
      return {
        ...r,
        weight_lbs: weightNum,
        deadhead_origin_mi: dho,
        deadhead_dest_mi: dhd
      };
    });

    if (origInfo && maxDho > 0) rows = rows.filter((r) => r.deadhead_origin_mi <= maxDho);
    if (destination && !destInfo?.isNationwide && maxDhd > 0) {
      rows = rows.filter((r) => {
        if (destInfo?.states?.length) {
          return destInfo.states.some((st) => String(r.delivery_location || '').toUpperCase().includes(st));
        }
        return r.deadhead_dest_mi <= maxDhd || String(r.delivery_location || '').toLowerCase().includes(String(destination).toLowerCase());
      });
    }
    if (maxWtNum > 0) rows = rows.filter((r) => r.weight_lbs <= maxWtNum);
    if (eqList.length > 0) {
      rows = rows.filter((r) => {
        const eqLow = String(r.equipment_type || '').toLowerCase();
        return eqList.some((want) => {
          if (want.includes('reefer')) return eqLow.includes('reefer');
          if (want.includes('flat')) return eqLow.includes('flat');
          if (want.includes('step')) return eqLow.includes('step');
          if (want.includes('box') || want.includes('straight')) return eqLow.includes('box') || eqLow.includes('straight');
          if (want.includes('hotshot')) return eqLow.includes('hotshot');
          if (want.includes('power')) return eqLow.includes('power');
          if (want.includes('van') || want.includes('dry')) return eqLow.includes('van') || eqLow.includes('dry');
          return eqLow.includes(want);
        });
      });
    }

    res.json({ ok: true, count: rows.length, loads: rows });
  } catch (err) {
    res.status(500).json({ error: 'Search failed: ' + err.message });
  }
});

// ====================================================
// 4. BROKER REST API v1 CRUD + BULK CSV + REFRESH/BUMP
// ====================================================

router.get('/v1/loads/csv-template', (req, res) => {
  const sampleCsv = [
    'external_reference_id,origin_city,origin_state,origin_zip,destination_city,destination_state,destination_zip,pickup_date,delivery_date,equipment_type,weight_lbs,length_ft,full_or_partial,rate_total_usd,estimated_miles,commodity_description,notes',
    'BRK-10421,Dallas,TX,75201,Atlanta,GA,30301,' + new Date().toISOString().slice(0, 10) + ',' + new Date(Date.now() + 86400000).toISOString().slice(0, 10) + ',DRY_VAN,42000,53,FTL,2950,781,Packaged Consumer Goods,FCFS 08:00-16:00',
    'BRK-10422,Chicago,IL,60601,Nashville,TN,37201,' + new Date().toISOString().slice(0, 10) + ',' + new Date(Date.now() + 86400000).toISOString().slice(0, 10) + ',REEFER,38500,53,FTL,2200,472,Chilled Produce 36F,Pre-cool trailer required'
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="LoadsNexus-Bulk-Upload-Template.csv"');
  res.send(sampleCsv);
});

router.post('/v1/loads/bulk-csv', authenticateApiKeyOrSession, async (req, res) => {
  try {
    const { csv, rows: rawRows, columnMap, dryRun } = req.body || {};
    const ctx = brokerContextFromReq(req, 'CSV_SYNC');

    let parsed;
    if (csv && typeof csv === 'string') {
      parsed = parseCsvFreightText(csv, columnMap || {});
    } else if (Array.isArray(rawRows) && rawRows.length) {
      const validRows = [];
      const invalidRows = [];
      rawRows.forEach((r, idx) => {
        const preview = require('../utils/load-ingest').normalizeStandardLoad(r, ctx);
        const errs = require('../utils/load-ingest').validateNormalizedLoad(preview);
        if (errs.length) invalidRows.push({ row: idx + 1, raw: r, errors: errs });
        else validRows.push({ row: idx + 1, raw: r, preview });
      });
      parsed = { headers: Object.keys(rawRows[0] || {}), validRows, invalidRows };
    } else {
      return res.status(400).json({ error: 'Provide either "csv" text or "rows" array.' });
    }

    if (dryRun) {
      return res.json({
        ok: true,
        dry_run: true,
        headers: parsed.headers,
        valid_count: parsed.validRows.length,
        invalid_count: parsed.invalidRows.length,
        valid_preview: parsed.validRows.slice(0, 50).map((v) => ({
          row: v.row,
          origin: v.preview.origin_full,
          destination: v.preview.destination_full,
          equipment: v.preview.equipment_type,
          weight_lbs: v.preview.weight_lbs,
          rate_total_usd: v.preview.rate_total_usd,
          estimated_miles: v.preview.estimated_miles,
          rate_per_mile: v.preview.rate_per_mile,
          pickup_date: v.preview.pickup_date_start,
          full_or_partial: v.preview.full_or_partial,
          external_reference_id: v.preview.external_reference_id
        })),
        invalid_rows: parsed.invalidRows.slice(0, 50)
      });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const published = [];

    for (const vr of parsed.validRows.slice(0, 250)) {
      const r = await upsertStandardLoad(vr.raw, ctx);
      if (r.ok) {
        if (r.action === 'inserted') { inserted++; published.push(r.load); }
        else if (r.action === 'updated') { updated++; published.push(r.load); }
        else skipped++;
      } else {
        skipped++;
      }
    }

    res.status(201).json({
      ok: true,
      inserted_count: inserted,
      updated_count: updated,
      skipped_count: skipped,
      invalid_count: parsed.invalidRows.length,
      invalid_rows: parsed.invalidRows.slice(0, 25),
      loads: published.slice(0, 50),
      message: `Bulk CSV complete: +${inserted} new loads published, ${updated} refreshed, ${parsed.invalidRows.length} invalid.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Bulk CSV upload error: ' + err.message });
  }
});

// POST /api/v1/loads — Create / upsert load via Partner REST API or Broker Portal
router.post('/v1/loads', authenticateApiKeyOrSession, async (req, res) => {
  try {
    const channel = req.headers['x-api-key'] || String(req.headers['authorization'] || '').startsWith('Bearer ln_')
      ? 'BROKER_API'
      : (req.body.source_channel || 'MANUAL_PORTAL');
    const ctx = brokerContextFromReq(req, channel);
    const result = await upsertStandardLoad(req.body, ctx);
    if (!result.ok) {
      return res.status(400).json({ error: result.errors.join('; '), code: 'VALIDATION_ERROR', errors: result.errors });
    }
    const l = result.load;
    res.status(result.action === 'inserted' ? 201 : 200).json({
      ok: true,
      action: result.action,
      load_id: l.load_number,
      db_id: l.id,
      status: l.status,
      source_channel: l.source_channel || channel,
      pickup: l.pickup_location,
      delivery: l.delivery_location,
      rate: l.rate,
      miles: l.miles,
      rpm: l.rpm,
      equipment: l.equipment_type,
      expires_at: l.expires_at,
      public_view_url: `https://www.loadsnexus.com/board?q=${encodeURIComponent(l.load_number)}`,
      ratecon_url: `https://www.loadsnexus.com/api/loadboard/loads/${encodeURIComponent(l.load_number)}/ratecon-pdf`,
      message: `Load #${l.load_number} ${result.action} live on LoadsNexus.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not publish load: ' + err.message });
  }
});

// GET /api/v1/loads — List broker's own loads (or all recent broker loads for admin)
router.get('/v1/loads', authenticateApiKeyOrSession, async (req, res) => {
  try {
    await ensureUnifiedSchema();
    const b = req.brokerUser;
    const isAdmin = ['admin', 'super_admin'].includes(String(b.user_role || '').toLowerCase());
    const r = isAdmin
      ? await pool.query(
          `SELECT id, load_number, external_reference_id, source_channel, status, rate, pickup_location, delivery_location,
                  pickup_date, delivery_date, equipment_type, weight, length_ft, full_or_partial, commodity,
                  miles, rpm, broker_name, broker_mc, broker_verified, expires_at, created_at, updated_at
           FROM loads WHERE deleted_at IS NULL AND status::text != 'cancelled'
           ORDER BY updated_at DESC LIMIT 100`
        )
      : await pool.query(
          `SELECT id, load_number, external_reference_id, source_channel, status, rate, pickup_location, delivery_location,
                  pickup_date, delivery_date, equipment_type, weight, length_ft, full_or_partial, commodity,
                  miles, rpm, broker_name, broker_mc, broker_verified, expires_at, created_at, updated_at
           FROM loads
           WHERE deleted_at IS NULL AND status::text != 'cancelled'
             AND (broker_user_id = $1 OR broker_contact ILIKE $2 OR ($3::text != '' AND broker_mc = $3))
           ORDER BY updated_at DESC LIMIT 100`,
          [b.user_id || 0, `%${b.user_email || ''}%`, b.mc_number || '']
        );
    res.json({ ok: true, total: r.rows.length, loads: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not list loads: ' + err.message });
  }
});

// PUT /api/v1/loads/:id — Update broker load fields or status (AVAILABLE / BOOKED / COVERED / CANCELLED)
router.put('/v1/loads/:id', authenticateApiKeyOrSession, async (req, res) => {
  try {
    await ensureUnifiedSchema();
    const idParam = String(req.params.id || '').trim();
    const b = req.brokerUser;
    const isAdmin = ['admin', 'super_admin', 'dispatcher'].includes(String(b.user_role || '').toLowerCase());

    const found = await pool.query(
      `SELECT * FROM loads WHERE deleted_at IS NULL AND (load_number = $1 OR id::text = $1) LIMIT 1`,
      [idParam]
    );
    if (!found.rows.length) return res.status(404).json({ error: 'Load not found.' });
    const existing = found.rows[0];
    if (!isAdmin && Number(existing.broker_user_id) !== Number(b.user_id) && !(b.user_email && String(existing.broker_contact || '').toLowerCase().includes(b.user_email.toLowerCase()))) {
      return res.status(403).json({ error: 'Not authorized to modify this load.' });
    }

    const statusMap = {
      AVAILABLE: 'open', OPEN: 'open',
      PENDING_APPROVAL: 'pending_carrier_approval',
      BOOKED: 'booked', COVERED: 'covered',
      EXPIRED: 'expired', CANCELLED: 'cancelled', CANCELED: 'cancelled'
    };
    const nextStatus = req.body.status ? (statusMap[String(req.body.status).toUpperCase()] || existing.status) : existing.status;
    const nextRate = req.body.rate_total_usd ?? req.body.rate ?? existing.rate;
    const nextMiles = req.body.estimated_miles ?? req.body.miles ?? existing.miles;
    const nextRpm = Number(nextMiles) > 0 && Number(nextRate) > 0 ? Number((Number(nextRate) / Number(nextMiles)).toFixed(2)) : existing.rpm;

    const upd = await pool.query(
      `UPDATE loads
       SET status = $2,
           rate = $3,
           miles = $4,
           rpm = $5,
           pickup_location = COALESCE(NULLIF($6,''), pickup_location),
           delivery_location = COALESCE(NULLIF($7,''), delivery_location),
           equipment_type = COALESCE(NULLIF($8,''), equipment_type),
           weight = COALESCE($9, weight),
           notes = COALESCE($10, notes),
           expires_at = CASE WHEN $2::text = 'open' THEN NOW() + INTERVAL '24 hours' ELSE expires_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        existing.id,
        nextStatus,
        Number(nextRate) || 0,
        Number(nextMiles) || 0,
        Number(nextRpm) || 0,
        req.body.origin || req.body.pickup_location || '',
        req.body.destination || req.body.delivery_location || '',
        req.body.equipment_type || req.body.equipment || '',
        req.body.weight_lbs || req.body.weight ? Number(req.body.weight_lbs || req.body.weight) : null,
        req.body.notes !== undefined ? req.body.notes : null
      ]
    );

    if (['covered', 'booked', 'cancelled', 'expired'].includes(nextStatus)) {
      try {
        require('./loadboard').broadcastLoadboardEvent('load_covered', { id: existing.load_number || existing.id, status: nextStatus, covered_at: Date.now() });
      } catch (_) {}
    }

    res.json({ ok: true, load: upd.rows[0], message: `Load #${existing.load_number} updated (${nextStatus}).` });
  } catch (err) {
    res.status(500).json({ error: 'Could not update load: ' + err.message });
  }
});

// POST /api/v1/loads/:id/refresh — 1-Click "Refresh / Bump Load" (Resets 24-hour expiration timer)
router.post('/v1/loads/:id/refresh', authenticateApiKeyOrSession, async (req, res) => {
  try {
    await ensureUnifiedSchema();
    const idParam = String(req.params.id || '').trim();
    const upd = await pool.query(
      `UPDATE loads
       SET expires_at = NOW() + INTERVAL '24 hours',
           status = CASE WHEN status::text IN ('expired', 'new') THEN 'open' ELSE status END,
           is_public_board = TRUE,
           updated_at = NOW()
       WHERE deleted_at IS NULL AND (load_number = $1 OR id::text = $1)
       RETURNING id, load_number, status, expires_at, updated_at`,
      [idParam]
    );
    if (!upd.rows.length) return res.status(404).json({ error: 'Load not found.' });
    res.json({ ok: true, load: upd.rows[0], message: `Load #${upd.rows[0].load_number} bumped live for another 24 hours!` });
  } catch (err) {
    res.status(500).json({ error: 'Could not refresh load: ' + err.message });
  }
});

// DELETE /api/v1/loads/:id — Cancel / remove load
router.delete('/v1/loads/:id', authenticateApiKeyOrSession, async (req, res) => {
  const loadId = String(req.params.id || '').trim();
  try {
    const r = await pool.query(
      `UPDATE loads SET status = 'cancelled', updated_at = NOW()
       WHERE load_number = $1 OR id::text = $1
       RETURNING id, load_number`,
      [loadId]
    );
    if (r.rows.length) {
      try {
        require('./loadboard').broadcastLoadboardEvent('load_covered', { id: r.rows[0].load_number || r.rows[0].id, status: 'cancelled', covered_at: Date.now() });
      } catch (_) {}
    }
    res.json({ ok: true, load_id: loadId, status: 'cancelled', message: `Load #${loadId} cancelled and removed from LoadsNexus.` });
  } catch (err) {
    res.status(500).json({ error: 'Could not cancel load via API.' });
  }
});

// ====================================================
// 5. SHIPPING WISH CARRIER APPROVAL PROPOSAL BRIDGE
// ====================================================

router.post('/v1/loads/:id/propose-to-carrier', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    await ensureUnifiedSchema();
    const idParam = String(req.params.id || '').trim();
    const { carrier_id, notes, proposed_rate } = req.body || {};
    if (!carrier_id) return res.status(400).json({ error: 'carrier_id is required to propose a load.' });

    const found = await pool.query(
      `SELECT id, load_number FROM loads WHERE deleted_at IS NULL AND (load_number = $1 OR id::text = $1) LIMIT 1`,
      [idParam]
    );
    if (!found.rows.length) return res.status(404).json({ error: 'Load not found.' });

    const result = await requestCarrierApproval({
      loadId: found.rows[0].id,
      carrierId: parseInt(carrier_id, 10),
      dispatcherId: req.user.id,
      notes: notes || '',
      proposedRate: proposed_rate ? Number(proposed_rate) : undefined
    });

    res.json({
      ok: true,
      load: result.load,
      message: `Load #${found.rows[0].load_number} proposed to carrier for 1-click approval!`
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not propose load to carrier: ' + err.message });
  }
});

// GET /api/v1/dispatch/proposals — Shipping Wish Carrier Approval Queue (/dispatch/proposals)
router.get('/v1/dispatch/proposals', requireAuth, requireRole('dispatcher', 'admin', 'super_admin', 'carrier', 'carrier_admin'), async (req, res) => {
  try {
    await ensureUnifiedSchema();
    const role = String(req.user.role || '').toLowerCase();
    const isCarrier = role === 'carrier' || role === 'carrier_admin';

    const params = [];
    let carrierFilter = '';
    if (isCarrier) {
      params.push(req.user.id);
      carrierFilter = `AND l.carrier_id = $1`;
    }

    const r = await pool.query(
      `SELECT l.id, l.load_number, l.pickup_location, l.delivery_location, l.pickup_date,
              l.equipment_type, l.weight, l.miles, l.rate, l.rpm, l.status,
              l.broker_name, l.broker_mc, l.broker_contact, l.source_channel,
              l.carrier_id, l.carrier_name, l.carrier_mc,
              l.carrier_approval_status, l.carrier_approval_requested_at,
              l.carrier_approved_at, l.carrier_approval_notes,
              u.name AS assigned_carrier_name, u.company_name AS assigned_carrier_company, u.phone AS assigned_carrier_phone,
              d.name AS dispatcher_name,
              (SELECT COUNT(*)::int FROM documents doc WHERE doc.load_id = l.id AND lower(COALESCE(doc.doc_type,'')) LIKE '%rate%') AS ratecon_count
       FROM loads l
       LEFT JOIN users u ON u.id = l.carrier_id
       LEFT JOIN users d ON d.id = l.dispatcher_id
       WHERE l.deleted_at IS NULL
         AND (
           COALESCE(l.carrier_approval_status, 'not_requested') != 'not_requested'
           OR l.status::text = 'pending_carrier_approval'
         )
         ${carrierFilter}
       ORDER BY COALESCE(l.carrier_approval_requested_at, l.updated_at) DESC
       LIMIT 100`,
      params
    );

    const proposals = r.rows.map((p) => {
      const appr = String(p.carrier_approval_status || '').toLowerCase();
      let display_pill = 'Sent to Carrier';
      if (p.ratecon_count > 0 || p.status === 'ratecon_signed') display_pill = 'Rate Con Uploaded';
      else if (appr === 'approved' || ['booked', 'assigned', 'dispatched', 'in_transit', 'delivered'].includes(p.status)) display_pill = 'Carrier Approved (Ready to Book)';
      else if (appr === 'declined' || appr === 'rejected') display_pill = 'Declined by Carrier';
      return { ...p, display_pill };
    });

    res.json({ ok: true, count: proposals.length, proposals });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch dispatch proposals: ' + err.message });
  }
});

// ====================================================
// 6. MODULE B: AI EMAIL-TO-LOAD WEBHOOK (/api/v1/ingest/email)
// ====================================================

router.post('/v1/ingest/email', async (req, res, next) => {
  // Accept verified webhook secret OR authenticated Staff/Broker session
  const secret = String(process.env.INBOUND_WEBHOOK_SECRET || process.env.RESEND_INBOUND_SECRET || '').trim();
  const provided = String(req.query.secret || req.headers['x-inbound-secret'] || req.headers['x-webhook-secret'] || '').trim();
  const hasValidSecret = Boolean(secret && provided && provided === secret);

  const runHandler = async () => {
    try {
      const b = req.body || {};
      const fromEmail = b.from || b.sender || b.fromEmail || b.envelope?.from || '';
      const toEmail = b.to || b.recipient || b.toEmail || 'loads@loadsnexus.com';
      const subject = b.subject || '';
      const bodyText = b.text || b['body-plain'] || b.bodyText || '';
      const bodyHtml = b.html || b['body-html'] || b.bodyHtml || '';
      const attachments = Array.isArray(b.attachments) ? b.attachments : [];
      const dryRun = Boolean(b.dryRun);

      if (!bodyText && !bodyHtml && !attachments.length) {
        return res.status(400).json({ error: 'Email payload must include text, html, or CSV attachment.' });
      }

      const result = await processInboundFreightEmail({
        fromEmail,
        toEmail,
        subject,
        bodyText,
        bodyHtml,
        attachments,
        dryRun
      });

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'Email-to-load ingestion failed: ' + err.message });
    }
  };

  if (hasValidSecret) return runHandler();
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    return requireRole('admin', 'super_admin', 'dispatcher', 'broker')(req, res, runHandler);
  });
});

// ====================================================
// 7. MODULE C: EXTERNAL BROKER API ADAPTERS (/api/v1/adapters)
// ====================================================

router.get('/v1/adapters', requireAuth, requireRole('admin', 'super_admin', 'dispatcher'), (req, res) => {
  res.json({ ok: true, adapters: listAdapters() });
});

router.post('/v1/adapters/test-mock', requireAuth, requireRole('admin', 'super_admin', 'dispatcher'), async (req, res) => {
  try {
    const dryRun = req.body?.dryRun !== false; // default dryRun=true so test doesn't pollute live board unless explicitly requested
    const syncRes = await runAdapterSync('mock', { dryRun });
    const mockAdapter = getAdapter('mock');
    const quoteRes = await mockAdapter.submitQuoteOrBook('MOCK-CHR-1001', 'MC-1094821', 2950);
    res.json({ ok: true, sync: syncRes, quote_test: quoteRes });
  } catch (err) {
    res.status(500).json({ error: 'MockBrokerAdapter test error: ' + err.message });
  }
});

router.post('/v1/adapters/:key/sync', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await runAdapterSync(req.params.key, { dryRun: Boolean(req.body?.dryRun) });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/v1/adapters/:key/quote', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    const adapter = getAdapter(req.params.key);
    if (!adapter) return res.status(404).json({ error: 'Broker adapter not found.' });
    const { load_id, carrier_mc, rate } = req.body || {};
    if (!load_id || !carrier_mc || !rate) {
      return res.status(400).json({ error: 'load_id, carrier_mc, and rate are required.' });
    }
    const quoteRes = await adapter.submitQuoteOrBook(load_id, carrier_mc, Number(rate));
    res.json({ ok: true, adapter: adapter.key, result: quoteRes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Trigger manual stale expiry (Admin only)
router.post('/v1/loads/expire-stale', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const out = await expireStaleLoads();
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
