const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { lookupCensusRow, censusQuery, digits } = require('../utils/fmcsa');
const { TOP_BROKERS, getKnownBroker, aiAnalyzeBroker, lookupMotusBond, lookupInternalDtp, lookupLoadWrap } = require('../utils/broker-vet');
const { extractPhoneWithExt } = require('../utils/dat-load-parser');
const { sanitizeEmail } = require('../utils/email-valid');
const { sendBrandedEmail, getLoadsNexusSender } = require('../utils/mailer');

const router = express.Router();

let _brokersSchemaReady = false;
async function ensureBrokersSchema() {
  if (_brokersSchemaReady) return;
  try {
    await pool.query(`
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS dot_number TEXT;
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS city TEXT;
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS state TEXT;
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS outreach_status TEXT DEFAULT 'not_contacted';
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ;
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS email_count INT DEFAULT 0;
      ALTER TABLE brokers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_kv_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => {});
    _brokersSchemaReady = true;
  } catch (err) {
    console.warn('[Brokers Schema]', err.message);
  }
}

async function bridgeOrAdmin(req, res, next) {
  const provided = String(req.headers['x-bridge-key'] || '').trim();
  if (provided) {
    const envKey = String(process.env.DAT_BRIDGE_KEY || '').trim();
    if (envKey && provided.length === envKey.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(envKey))) {
      return next();
    }
    try {
      const dbRes = await pool.query(`SELECT value FROM system_kv_settings WHERE key = 'desktop_bridge_key' LIMIT 1`);
      const dbKey = String(dbRes.rows[0]?.value || '').trim();
      if (dbKey && provided.length === dbKey.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(dbKey))) {
        return next();
      }
    } catch (_) {}
  }
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    return requireRole('dispatcher', 'admin', 'super_admin')(req, res, next);
  });
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function isGenericBrokerName(name) {
  const n = String(name || '').trim();
  if (n.length < 3 || n.length > 100) return true;
  if (/[\r\n]/.test(n)) return true;
  return /^(?:verified\s+freight\s+broker|dat\s+verified\s+broker|direct\s+broker|unknown|n\/a|none|book\s+on\s+convoy)/i.test(n);
}

async function upsertBrokersBatch(records = []) {
  await ensureBrokersSchema();
  if (!Array.isArray(records) || !records.length) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  // Load existing lookup index once for fast O(1) dedup
  const existingRes = await pool.query(
    `SELECT id, company_name, mc_number, dot_number, contact_person, email, phone, city, state, address, source
     FROM brokers`
  );
  const byMc = new Map();
  const byEmail = new Map();
  const byName = new Map();
  for (const r of existingRes.rows) {
    const mc = digits(r.mc_number);
    const em = String(r.email || '').toLowerCase().trim();
    const nm = normName(r.company_name);
    if (mc) byMc.set(mc, r);
    if (em) byEmail.set(em, r);
    if (nm) byName.set(nm, r);
  }

  const toInsert = [];
  const toUpdate = [];
  let skipped = 0;

  for (const raw of records) {
    const companyName = String(raw.company_name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (isGenericBrokerName(companyName)) { skipped++; continue; }

    const mcDigits = digits(raw.mc_number);
    const mcFormatted = mcDigits ? `MC-${mcDigits}` : null;
    const dotNum = digits(raw.dot_number) || null;
    const email = sanitizeEmail(String(raw.email || '').trim()) || null;
    const phone = formatPhone(raw.phone) || null;
    const contactPerson = String(raw.contact_person || '').replace(/\s+/g, ' ').trim().slice(0, 90) || null;
    const city = String(raw.city || '').trim().slice(0, 60) || null;
    const state = String(raw.state || '').trim().toUpperCase().slice(0, 2) || null;
    const address = String(raw.address || '').trim().slice(0, 180) || null;
    const rating = String(raw.credit_rating || 'Unrated').trim().slice(0, 20);
    const notes = String(raw.notes || '').trim().slice(0, 400) || null;
    const source = String(raw.source || 'manual').trim().slice(0, 30);

    const nmKey = normName(companyName);
    const match = (mcDigits && byMc.get(mcDigits)) || (email && byEmail.get(email)) || byName.get(nmKey);

    if (match) {
      // Only enrich missing fields
      const needsUpdate =
        (!match.email && email) ||
        (!match.phone && phone) ||
        (!match.mc_number && mcFormatted) ||
        (!match.dot_number && dotNum) ||
        (!match.contact_person && contactPerson) ||
        (!match.state && state);
      if (needsUpdate) {
        toUpdate.push({
          id: match.id,
          mc_number: match.mc_number || mcFormatted,
          dot_number: match.dot_number || dotNum,
          contact_person: match.contact_person || contactPerson,
          email: match.email || email,
          phone: match.phone || phone,
          city: match.city || city,
          state: match.state || state,
          address: match.address || address
        });
        if (!match.email && email) { match.email = email; byEmail.set(email, match); }
        if (!match.mc_number && mcFormatted) { match.mc_number = mcFormatted; byMc.set(mcDigits, match); }
        if (!match.phone && phone) match.phone = phone;
      } else {
        skipped++;
      }
    } else {
      const rec = {
        company_name: companyName,
        mc_number: mcFormatted,
        dot_number: dotNum,
        contact_person: contactPerson,
        email,
        phone,
        city,
        state,
        address,
        credit_rating: rating,
        notes,
        source
      };
      toInsert.push(rec);
      // Register in maps immediately so duplicates inside the same batch are skipped
      if (mcDigits) byMc.set(mcDigits, rec);
      if (email) byEmail.set(email, rec);
      byName.set(nmKey, rec);
    }
  }

  let inserted = 0;
  const CHUNK = 100;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const vals = [];
    const placeholders = chunk.map((r, idx) => {
      const base = idx * 12;
      vals.push(
        r.company_name, r.mc_number, r.dot_number, r.contact_person,
        r.email, r.phone, r.city, r.state, r.address,
        r.credit_rating, r.notes, r.source
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12})`;
    });
    const ins = await pool.query(
      `INSERT INTO brokers (
        company_name, mc_number, dot_number, contact_person,
        email, phone, city, state, address,
        credit_rating, notes, source
      ) VALUES ${placeholders.join(',')}
      RETURNING id`,
      vals
    );
    inserted += ins.rows.length;
  }

  let updated = 0;
  for (const u of toUpdate) {
    await pool.query(
      `UPDATE brokers
       SET mc_number = COALESCE(NULLIF($2,''), mc_number),
           dot_number = COALESCE(NULLIF($3,''), dot_number),
           contact_person = COALESCE(NULLIF($4,''), contact_person),
           email = COALESCE(NULLIF($5,''), email),
           phone = COALESCE(NULLIF($6,''), phone),
           city = COALESCE(NULLIF($7,''), city),
           state = COALESCE(NULLIF($8,''), state),
           address = COALESCE(NULLIF($9,''), address),
           updated_at = NOW()
       WHERE id = $1`,
      [u.id, u.mc_number, u.dot_number, u.contact_person, u.email, u.phone, u.city, u.state, u.address]
    ).catch(() => {});
    updated++;
  }

  return { inserted, updated, skipped };
}

function extractBrokerRecordFromLoad(l) {
  const contact = String(l.broker_contact || '');
  const emailMatch = contact.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  const email = emailMatch ? emailMatch[1].toLowerCase() : null;
  const phone = extractPhoneWithExt(contact) || null;
  return {
    company_name: l.broker_name,
    mc_number: l.broker_mc || null,
    email,
    phone,
    credit_rating: 'Verified',
    notes: 'Auto-synced from live freight load board',
    source: 'load_sync'
  };
}

async function syncBrokersFromLoadRows(loadRows = []) {
  const recs = (loadRows || [])
    .filter(l => l && l.broker_name && !isGenericBrokerName(l.broker_name))
    .map(extractBrokerRecordFromLoad);
  if (!recs.length) return { inserted: 0, updated: 0, skipped: 0 };
  return upsertBrokersBatch(recs);
}

function formatPhone(value) {
  const d = digits(value);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(value || '').trim();
}

function formatCensusDate(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return '';
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function entityTypes(carship) {
  const map = { C: 'Carrier', B: 'Broker', S: 'Shipper', F: 'Freight Forwarder' };
  return String(carship || '')
    .split(/[;,/]/)
    .map((part) => map[part.trim().toUpperCase()] || '')
    .filter(Boolean);
}

function censusBrokerPayload(row) {
  const mc = digits(row.docket1);
  const prefix = String(row.docket1prefix || 'MC').toUpperCase();
  const types = entityTypes(row.carship);
  const usdotActive = String(row.status_code || '').toUpperCase() === 'A';
  const docketActive = String(row.docket1_status_code || '').toUpperCase() === 'A';
  const isBroker = types.includes('Broker');
  const cityState = [row.phy_city, row.phy_state, row.phy_zip].filter(Boolean).join(', ');
  const address = [row.phy_street, cityState].filter(Boolean).join(', ');
  const authorityBits = [];
  authorityBits.push(usdotActive ? 'USDOT ACTIVE' : 'USDOT INACTIVE');
  if (row.docket1_status_code) {
    authorityBits.push(`${prefix} docket ${docketActive ? 'ACTIVE' : row.docket1_status_code}`);
  }
  if (row.classdef) authorityBits.push(row.classdef);
  if (types.length) authorityBits.push(types.join(' + '));

  return {
    ok: true,
    authentic: true,
    source: 'FMCSA Census',
    mcNumber: mc ? `${prefix}-${mc}` : '',
    dotNumber: String(row.dot_number || ''),
    companyName: row.legal_name || row.dba_name || 'Unknown',
    cityState: cityState || 'US',
    address,
    phone: formatPhone(row.phone),
    email: String(row.email_address || '').toLowerCase(),
    officer: String(row.company_officer_1 || '').replace(/\s+/g, ' ').trim(),
    entityTypes: types.join(', ') || 'Not listed',
    authorityStatus: authorityBits.join(' — '),
    usdotActive,
    isBroker,
    addDate: formatCensusDate(row.add_date),
    bondStatus: 'Bond not in Motus feed for this docket. Confirm BMC-84/85 on SAFER.',
    bondUrl: row.dot_number
      ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(row.dot_number)}`
      : 'https://safer.fmcsa.dot.gov/',
    creditRating: 'N/A',
    creditScore: null,
    daysToPay: null,
    factoringStatus: 'Not published by FMCSA. Check Highway, DAT, or your factor.',
    creditLimit: 'Not published by FMCSA',
    riskLevel: usdotActive ? 'FMCSA ACTIVE' : 'FMCSA INACTIVE',
    entityNote: isBroker
      ? 'FMCSA lists broker authority on this docket. Credit score / days-to-pay are not government data.'
      : 'FMCSA does not list Broker on this docket (carrier/shipper only). Credit score is not government data.',
    verifiedAt: new Date().toISOString()
  };
}

router.get('/credit-check/:mc', requireAuth, async (req, res) => {
  const rawInput = String(req.params.mc || '').trim();
  if (!rawInput) {
    return res.status(400).json({ error: 'Valid MC or DOT number is required.' });
  }

  try {
    // 1. Check verified top brokers benchmark database first
    const known = getKnownBroker(rawInput);
    if (known) {
      const d = digits(known.mcNumber);
      const internalDtp = await lookupInternalDtp(pool, d);
      return res.json({
        ok: true,
        authentic: true,
        source: 'Verified Broker Network & FMCSA Intelligence',
        mcNumber: known.mcNumber,
        dotNumber: known.dotNumber,
        companyName: known.companyName,
        cityState: known.cityState,
        address: known.address,
        phone: known.phone,
        email: known.email,
        officer: known.officer,
        entityTypes: 'Broker / Property Brokerage',
        authorityStatus: 'USDOT ACTIVE — Broker Operating Authority Verified',
        usdotActive: true,
        isBroker: true,
        addDate: 'Established Multi-Year Carrier Partner',
        bondStatus: known.bondStatus,
        bondUrl: `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(known.dotNumber)}`,
        creditRating: known.creditRating,
        creditScore: known.creditScore,
        creditSource: 'Verified Freight Bureau & Industry Benchmark',
        daysToPay: (internalDtp && internalDtp.daysToPay) || known.daysToPay,
        paidLoadCount: internalDtp ? internalDtp.paidLoadCount : null,
        dtpSource: internalDtp ? 'internal' : 'Verified Industry Benchmark',
        factoringStatus: known.factoringStatus,
        creditLimit: '$100,000+ Pre-Approved',
        riskLevel: known.riskLevel,
        aboutBroker: known.aboutBroker,
        verifiedAt: new Date().toISOString()
      });
    }

    // 2. Query FMCSA Census
    const row = await lookupCensusRow(rawInput);
    if (!row) {
      return res.status(404).json({
        error: `No FMCSA record found for "${rawInput}". Please check the MC# or DOT#, or search by exact company name.`
      });
    }

    const payload = censusBrokerPayload(row);
    const mcDigits = digits(payload.mcNumber);

    // AI Analysis & Risk Score Calculation
    const aiAnalysis = aiAnalyzeBroker(row, rawInput);
    if (aiAnalysis) {
      payload.creditScore = aiAnalysis.creditScore;
      payload.creditRating = aiAnalysis.creditRating;
      payload.riskLevel = aiAnalysis.riskLevel;
      payload.daysToPay = aiAnalysis.daysToPay;
      payload.factoringStatus = aiAnalysis.factoringStatus;
      payload.aboutBroker = aiAnalysis.aboutBroker;
      payload.creditSource = 'AI Freight Intelligence';
      payload.dtpSource = 'AI Industry Estimate';
    }

    const [bond, internalDtp, wrap] = await Promise.all([
      lookupMotusBond(payload.mcNumber, payload.dotNumber),
      lookupInternalDtp(pool, mcDigits),
      lookupLoadWrap(payload.mcNumber, payload.dotNumber)
    ]);

    if (bond && bond.bondOnFile) {
      payload.bondStatus = bond.bondStatus;
      payload.bondAmount = bond.bondAmount;
      payload.bondSource = bond.bondSource;
    } else if (wrap && wrap.bondStatus) {
      payload.bondStatus = wrap.bondStatus;
      payload.bondAmount = wrap.bondAmount;
      payload.bondSource = 'LoadWrap';
    }

    if (internalDtp && internalDtp.daysToPay != null) {
      payload.daysToPay = internalDtp.daysToPay;
      payload.paidLoadCount = internalDtp.paidLoadCount;
      payload.dtpSource = 'internal';
    } else if (wrap && wrap.daysToPay != null) {
      payload.daysToPay = wrap.daysToPay;
      payload.dtpSource = 'LoadWrap';
    }

    if (wrap && wrap.creditScore != null) {
      payload.creditScore = wrap.creditScore;
      payload.creditRating = wrap.creditRating;
      payload.creditSource = 'LoadWrap';
      payload.riskLevel = payload.usdotActive ? `LoadWrap ${wrap.creditScore}` : 'FMCSA INACTIVE';
    }

    if (wrap && wrap.factoringStatus) {
      payload.factoringStatus = wrap.factoringStatus;
    }

    payload.loadWrapConfigured = !!String(process.env.LOADWRAP_API_KEY || '').trim();

    try {
      const saved = await pool.query(
        `SELECT id, credit_rating, notes FROM brokers
         WHERE regexp_replace(coalesce(mc_number,''), '[^0-9]', '', 'g') = $1
         LIMIT 1`,
        [mcDigits]
      );
      if (saved.rows.length) {
        payload.alreadySaved = true;
        payload.directoryId = saved.rows[0].id;
        payload.directoryRating = saved.rows[0].credit_rating || '';
        if (payload.creditScore == null && payload.directoryRating && payload.directoryRating !== 'Unrated') {
          payload.creditRating = payload.directoryRating;
          payload.creditSource = 'directory';
        }
      }
    } catch {
      // directory lookup is optional
    }

    return res.json(payload);
  } catch (err) {
    console.error('Credit check error:', err);
    res.status(500).json({ error: 'Could not look up FMCSA census for this broker.' });
  }
});

// List brokers — fast server-side search, filtering, pagination & live directory stats
// Staff (super_admin/admin/dispatcher/sales_rep) get full management + outreach;
// Paid/Trial Carriers get full read-only directory access; Unpaid Carriers get locked teaser preview.
router.get('/', requireAuth, async (req, res) => {
  await ensureBrokersSchema();
  const { search, state, source, hasEmail, outreach } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(250, Math.max(10, parseInt(req.query.limit, 10) || 100));
  const offset = (page - 1) * limit;

  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isStaff = ['super_admin', 'admin', 'dispatcher', 'sales_rep'].includes(role);
    let hasFullAccess = isStaff;

    if (!hasFullAccess && (role === 'carrier' || role === 'carrier_admin')) {
      const userCheck = await pool.query(
        `SELECT u.weekly_plan, u.trial_ends_at,
                (SELECT b.status FROM billing_subscriptions b WHERE b.user_id = u.id ORDER BY b.created_at DESC LIMIT 1) AS sub_status,
                (SELECT b.plan_key FROM billing_subscriptions b WHERE b.user_id = u.id ORDER BY b.created_at DESC LIMIT 1) AS sub_plan
         FROM users u WHERE u.id = $1`,
        [req.user.id]
      ).catch(() => ({ rows: [] }));
      if (userCheck.rows.length) {
        const u = userCheck.rows[0];
        const isSubActive = ['active', 'trialing'].includes(String(u.sub_status || '').toLowerCase());
        const isTrial = u.trial_ends_at && new Date(u.trial_ends_at) > new Date();
        const planKey = String(u.weekly_plan || '');
        const subKey = String(u.sub_plan || '');
        if (isSubActive || isTrial || planKey.startsWith('loadboard_') || subKey.startsWith('loadboard_') || (planKey && planKey !== 'free' && planKey !== 'canceled')) {
          hasFullAccess = true;
        }
      }
    }

    const where = [];
    const params = [];

    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      const p = `$${params.length}`;
      where.push(`(company_name ILIKE ${p} OR COALESCE(mc_number,'') ILIKE ${p} OR COALESCE(dot_number,'') ILIKE ${p} OR COALESCE(contact_person,'') ILIKE ${p} OR COALESCE(email,'') ILIKE ${p} OR COALESCE(phone,'') ILIKE ${p} OR COALESCE(city,'') ILIKE ${p})`);
    }
    if (state && String(state).trim() && String(state).toUpperCase() !== 'ALL') {
      params.push(String(state).trim().toUpperCase().slice(0, 2));
      where.push(`UPPER(COALESCE(state,'')) = $${params.length}`);
    }
    if (source && String(source).trim() && String(source) !== 'all') {
      params.push(String(source).trim());
      where.push(`COALESCE(source,'manual') = $${params.length}`);
    }
    if (hasEmail === '1' || hasEmail === 'true') {
      where.push(`email IS NOT NULL AND email LIKE '%@%'`);
    }
    if (outreach && String(outreach).trim() && String(outreach) !== 'all') {
      params.push(String(outreach).trim());
      where.push(`COALESCE(outreach_status,'not_contacted') = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await pool.query(`SELECT COUNT(*)::int AS filtered_total FROM brokers ${whereSql}`, params);

    const effectiveLimit = hasFullAccess ? limit : 5;
    const effectiveOffset = hasFullAccess ? offset : 0;
    const listParams = [...params, effectiveLimit, effectiveOffset];
    const result = await pool.query(
      `SELECT * FROM brokers ${whereSql}
       ORDER BY (CASE WHEN email IS NOT NULL AND email LIKE '%@%' THEN 0 ELSE 1 END), id DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    const statsRes = await pool.query(`
      SELECT
        COUNT(*)::int AS total_brokers,
        COUNT(*) FILTER (WHERE email IS NOT NULL AND email LIKE '%@%')::int AS with_email,
        COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '')::int AS with_phone,
        COUNT(*) FILTER (WHERE source = 'load_sync')::int AS from_loads,
        COUNT(*) FILTER (WHERE source = 'fmcsa_census')::int AS from_fmcsa,
        COUNT(*) FILTER (WHERE outreach_status = 'invited')::int AS invited_count
      FROM brokers
    `);

    const brokersOut = hasFullAccess
      ? result.rows
      : result.rows.map((b) => ({
          ...b,
          email: b.email ? 'locked@carrierpass.com (Subscription Required)' : null,
          phone: b.phone ? '(800) ***-**** (Pass Required)' : null,
          is_locked: true
        }));

    res.json({
      ok: true,
      has_full_access: hasFullAccess,
      can_manage: isStaff,
      locked_preview: !hasFullAccess,
      brokers: brokersOut,
      filtered_total: countRes.rows[0]?.filtered_total || 0,
      page,
      limit: effectiveLimit,
      stats: statsRes.rows[0] || {}
    });
  } catch (err) {
    console.error('List brokers error:', err);
    res.status(500).json({ error: 'Could not load brokers.' });
  }
});

// POST /api/brokers/sync-from-loads — Extract ALL unique real brokers (emails, phones, MCs) from live loads + Top Verified Brokers
router.post('/sync-from-loads', bridgeOrAdmin, async (req, res) => {
  try {
    await ensureBrokersSchema();
    const loadsRes = await pool.query(`
      SELECT broker_name, broker_mc, broker_contact
      FROM loads
      WHERE deleted_at IS NULL AND broker_name IS NOT NULL AND broker_name != ''
      ORDER BY id DESC
      LIMIT 5000
    `);

    const records = loadsRes.rows.map(extractBrokerRecordFromLoad);

    // Also ensure major verified Tier-1 USA brokers from broker-vet.js are in directory
    if (req.body?.includeTopBrokers !== false && Array.isArray(TOP_BROKERS)) {
      for (const tb of TOP_BROKERS) {
        const [cityPart, statePart] = String(tb.cityState || '').split(',').map(s => s.trim());
        records.push({
          company_name: tb.companyName,
          mc_number: tb.mcNumber,
          dot_number: tb.dotNumber,
          contact_person: tb.officer || 'Carrier Relations',
          email: tb.email || null,
          phone: tb.phone || null,
          city: cityPart || null,
          state: statePart ? statePart.slice(0, 2).toUpperCase() : null,
          address: tb.address || tb.cityState || null,
          credit_rating: tb.creditRating || 'A+',
          notes: `Tier-1 Verified USA Broker · ${tb.daysToPay || 25} DTP · ${tb.bondStatus || '$75k Bond Active'}`,
          source: 'known_verified'
        });
      }
    }

    const summary = await upsertBrokersBatch(records);
    const statsRes = await pool.query(`
      SELECT COUNT(*)::int AS total_brokers,
             COUNT(*) FILTER (WHERE email IS NOT NULL AND email LIKE '%@%')::int AS with_email,
             COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '')::int AS with_phone
      FROM brokers
    `);

    res.json({
      ok: true,
      scanned_loads: loadsRes.rows.length,
      ...summary,
      stats: statsRes.rows[0] || {},
      message: `Synced from live loads! +${summary.inserted} new brokers added, ${summary.updated} enriched (${statsRes.rows[0]?.total_brokers || 0} total in directory).`
    });
  } catch (err) {
    console.error('Sync brokers from loads error:', err);
    res.status(500).json({ error: 'Could not sync brokers from loads: ' + err.message });
  }
});

// POST /api/brokers/sync-fmcsa — Pull live active USA Freight Brokers directly from US DOT FMCSA Census API (az4n-8mr2)
router.post('/sync-fmcsa', bridgeOrAdmin, async (req, res) => {
  try {
    await ensureBrokersSchema();
    const state = String(req.body?.state || 'ALL').trim().toUpperCase();
    const limit = Math.min(500, Math.max(25, parseInt(req.body?.limit, 10) || 500));
    const emailsOnly = req.body?.emailsOnly !== false;
    const resetOffset = Boolean(req.body?.resetOffset);

    const kvKey = `fmcsa_broker_offset_${state}_${emailsOnly ? 'em' : 'all'}`;
    let offset = Number.isFinite(Number(req.body?.offset)) ? Math.max(0, parseInt(req.body.offset, 10)) : null;

    if (offset === null) {
      if (resetOffset) {
        offset = 0;
      } else {
        const kvRes = await pool.query(`SELECT value FROM system_kv_settings WHERE key = $1 LIMIT 1`, [kvKey]).catch(() => ({ rows: [] }));
        offset = parseInt(kvRes.rows[0]?.value || '0', 10) || 0;
      }
    }

    const whereParts = [`carship like '%B%'`, `status_code='A'`];
    if (state && state !== 'ALL' && /^[A-Z]{2}$/.test(state)) {
      whereParts.push(`phy_state='${state}'`);
    }
    if (emailsOnly) {
      whereParts.push(`email_address IS NOT NULL`);
    } else {
      whereParts.push(`(email_address IS NOT NULL OR phone IS NOT NULL)`);
    }

    const rows = await censusQuery({
      $where: whereParts.join(' AND '),
      $order: 'dot_number ASC',
      $limit: String(limit),
      $offset: String(offset)
    });

    const records = rows.map((row) => {
      const mc = digits(row.docket1) || digits(row.docket2);
      const prefix = String(row.docket1prefix || 'MC').toUpperCase();
      const cityState = [row.phy_city, row.phy_state, row.phy_zip].filter(Boolean).join(', ');
      const addr = [row.phy_street, cityState].filter(Boolean).join(', ');
      return {
        company_name: row.legal_name || row.dba_name || '',
        mc_number: mc ? `${prefix}-${mc}` : null,
        dot_number: String(row.dot_number || ''),
        contact_person: String(row.company_officer_1 || row.dba_name || 'Broker Operations').replace(/\s+/g, ' ').trim(),
        email: sanitizeEmail(row.email_address || '') || null,
        phone: formatPhone(row.phone) || null,
        city: row.phy_city || null,
        state: row.phy_state || null,
        address: addr || null,
        credit_rating: 'FMCSA Active',
        notes: `FMCSA Active Broker · USDOT ${row.dot_number || 'N/A'} · ${cityState || 'USA'}`,
        source: 'fmcsa_census'
      };
    });

    const summary = await upsertBrokersBatch(records);
    const nextOffset = rows.length < limit ? 0 : (offset + rows.length);

    await pool.query(
      `INSERT INTO system_kv_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [kvKey, String(nextOffset)]
    ).catch(() => {});

    const statsRes = await pool.query(`
      SELECT COUNT(*)::int AS total_brokers,
             COUNT(*) FILTER (WHERE email IS NOT NULL AND email LIKE '%@%')::int AS with_email,
             COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '')::int AS with_phone,
             COUNT(*) FILTER (WHERE source = 'fmcsa_census')::int AS from_fmcsa
      FROM brokers
    `);

    res.json({
      ok: true,
      state,
      fetched_from_fmcsa: rows.length,
      offset_used: offset,
      next_offset: nextOffset,
      ...summary,
      stats: statsRes.rows[0] || {},
      message: `FMCSA Live Sync complete (${state})! +${summary.inserted} new active USA brokers saved, ${summary.updated} enriched (${statsRes.rows[0]?.total_brokers || 0} total in directory).`
    });
  } catch (err) {
    console.error('FMCSA bulk broker sync error:', err);
    res.status(500).json({ error: 'FMCSA Live Sync failed: ' + err.message });
  }
});

// POST /api/brokers/send-outreach — Send branded LoadsNexus® Partner Invite (Free Load Posting + API Integration)
router.post('/send-outreach', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    await ensureBrokersSchema();
    const rawIds = Array.isArray(req.body?.broker_ids)
      ? req.body.broker_ids
      : (req.body?.broker_id ? [req.body.broker_id] : []);
    const ids = [...new Set(rawIds.map(n => parseInt(n, 10)).filter(n => n > 0))].slice(0, 20);
    if (!ids.length) {
      return res.status(400).json({ error: 'Select at least one broker with an email address.' });
    }

    const brokersRes = await pool.query(
      `SELECT id, company_name, mc_number, contact_person, email, phone
       FROM brokers WHERE id = ANY($1::int[])`,
      [ids]
    );

    const customSubject = String(req.body?.subject || '').trim();
    const customIntro = String(req.body?.message || '').trim();

    const sent = [];
    const failed = [];

    for (const b of brokersRes.rows) {
      const to = sanitizeEmail(b.email || '');
      if (!to) {
        failed.push({ id: b.id, company: b.company_name, reason: 'No valid email address' });
        continue;
      }

      const greeting = b.contact_person && b.contact_person !== 'Broker Operations'
        ? `Hello ${b.contact_person},`
        : `Hello ${b.company_name} Team,`;

      const subject = customSubject || `Partner with LoadsNexus & Shipping Wish — Free Load Posting + Direct API`;

      const defaultParagraph = customIntro || `We are reaching out from Shipping Wish LLC & LoadsNexus (loadsnexus.com). We operate an active nationwide network of vetted US carriers (53' Dry Vans, Reefers, Flatbeds, Hotshots & Box Trucks) looking for direct broker freight.`;

      const textBody = `${greeting}

${defaultParagraph}

Three zero-cost ways to cover your loads faster with our network:
1. Zero Extra Work — Just CC loads@loadsnexus.com: Add loads@loadsnexus.com to your daily "available loads" email blast and our AI automatically posts your lanes live to our vetted carriers within 30 seconds.
2. Post Unlimited Loads 100% FREE (Single or Bulk CSV): https://www.loadsnexus.com/post-load
3. Direct API Integration: Connect your TMS / Broker API to our platform — or use our LoadsNexus Partner Load API — so your available loads publish in real time and auto-remove the second they are covered.

Reply to this email with your MC#, daily load list, or API docs and our operations team will get your brokerage connected today.

Best regards,
Shipping Wish LLC / LoadsNexus Carrier & Broker Partnerships
Phone: +1 (917) 737-0021
Web: https://www.loadsnexus.com | https://www.shippingwish.com
Email: dispatch@loadsnexus.com`;

      const htmlBody = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#059669;padding:20px 28px;color:#ffffff;">
      <div style="font-size:18px;font-weight:800;letter-spacing:-0.2px;">LoadsNexus</div>
      <div style="font-size:12px;opacity:0.9;margin-top:2px;">Broker Partnership &amp; Direct Capacity Network · Powered by Shipping Wish LLC</div>
    </div>
    <div style="padding:26px 28px;font-size:14.5px;line-height:1.65;color:#334155;">
      <p style="margin:0 0 14px;color:#0f172a;font-weight:600;">${greeting}</p>
      <p style="margin:0 0 16px;">${defaultParagraph.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;margin:18px 0;">
        <div style="font-weight:700;color:#065f46;margin-bottom:8px;">Three Zero-Cost Ways to Cover Freight Faster With Us:</div>
        <div style="margin-bottom:8px;"><strong>1. Zero Extra Work — CC <span style="font-family:monospace;color:#047857;">loads@loadsnexus.com</span>:</strong> Simply CC <a href="mailto:loads@loadsnexus.com" style="color:#059669;font-weight:700;">loads@loadsnexus.com</a> on your daily "available loads" email blast — our AI auto-posts your open lanes directly to active carriers in 30 seconds.</div>
        <div style="margin-bottom:8px;"><strong>2. Free Broker Portal &amp; Bulk CSV Upload:</strong> Post unlimited spot &amp; contract lanes 100% free at <a href="https://www.loadsnexus.com" style="color:#059669;font-weight:700;">loadsnexus.com</a>.</div>
        <div><strong>3. Direct API / TMS Syndication:</strong> Connect your Broker TMS API (or use our LoadsNexus Partner REST API) for real-time posting and instant covered-load removal.</div>
      </div>
      <p style="margin:16px 0 20px;">Simply reply with your MC#, daily load list, or carrier setup packet — our dispatchers and carriers reach out directly with active MC#, insurance, and W-9 ready to roll for <strong>${String(b.company_name).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</strong>.</p>
      <a href="https://www.loadsnexus.com" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:8px;font-size:14px;">Activate Free Broker Portal</a>
      <p style="margin:24px 0 0;font-size:12.5px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px;">
        <strong>Fleet Operations Desk | Shipping Wish LLC &amp; LoadsNexus</strong><br>
        📞 +1 (917) 737-0021 &middot; <a href="https://www.loadsnexus.com" style="color:#059669;text-decoration:none;">www.loadsnexus.com</a> &middot; <a href="https://www.shippingwish.com" style="color:#2563eb;text-decoration:none;">www.shippingwish.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;

      try {
        const result = await sendBrandedEmail({
          to,
          subject,
          html: htmlBody,
          text: textBody,
          from: getLoadsNexusSender('dispatch'),
          replyTo: 'dispatch@shippingwish.com',
          sentBy: req.user?.id || null,
          emailType: 'broker_partner_invite',
          templateKey: 'broker_api_invite'
        });

        if (result && result.skipped) {
          failed.push({ id: b.id, company: b.company_name, email: to, reason: result.reason || 'unsubscribed' });
        } else {
          await pool.query(
            `UPDATE brokers
             SET outreach_status = 'invited',
                 last_emailed_at = NOW(),
                 email_count = COALESCE(email_count, 0) + 1,
                 updated_at = NOW()
             WHERE id = $1`,
            [b.id]
          );
          sent.push({ id: b.id, company: b.company_name, email: to });
        }
      } catch (mailErr) {
        failed.push({ id: b.id, company: b.company_name, email: to, reason: mailErr.message });
      }
    }

    res.json({
      ok: true,
      sent_count: sent.length,
      failed_count: failed.length,
      sent,
      failed,
      message: `Sent ${sent.length} broker partnership invite(s)${failed.length ? ` (${failed.length} skipped/failed)` : ''}!`
    });
  } catch (err) {
    console.error('Broker outreach email error:', err);
    res.status(500).json({ error: 'Could not send broker outreach emails: ' + err.message });
  }
});

// Create a broker — dispatcher/admin
router.post('/', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { company_name, mc_number, contact_person, email, phone, credit_rating, notes } = req.body;
  if (!company_name) return res.status(400).json({ error: 'Broker company name is required.' });

  try {
    if (mc_number) {
      const existing = await pool.query('SELECT id FROM brokers WHERE lower(mc_number) = lower($1)', [mc_number]);
      if (existing.rows.length) return res.status(409).json({ error: 'A broker with this MC number already exists.' });
    }

    const result = await pool.query(
      `INSERT INTO brokers (company_name, mc_number, contact_person, email, phone, credit_rating, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [company_name, mc_number || null, contact_person || null, email || null, phone || null, credit_rating || 'Unrated', notes || null]
    );
    res.json({ ok: true, broker: result.rows[0] });
  } catch (err) {
    console.error('Create broker error:', err);
    res.status(500).json({ error: 'Could not create broker.' });
  }
});

// Get single broker detail + load history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const brokerRes = await pool.query('SELECT * FROM brokers WHERE id = $1', [req.params.id]);
    if (!brokerRes.rows.length) return res.status(404).json({ error: 'Broker not found.' });

    const loadsRes = await pool.query(
      `SELECT l.id, l.load_number, l.pickup_location, l.delivery_location, l.rate, l.status, l.created_at,
              u.name AS carrier_name
       FROM loads l
       LEFT JOIN users u ON u.id = l.carrier_id
       WHERE l.broker_id = $1 OR lower(l.broker_name) = lower($2)
       ORDER BY l.created_at DESC LIMIT 20`,
      [req.params.id, brokerRes.rows[0].company_name]
    );

    res.json({ broker: brokerRes.rows[0], loads: loadsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load broker details.' });
  }
});

// Update broker — dispatcher/admin
router.put('/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { company_name, mc_number, contact_person, email, phone, credit_rating, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE brokers
       SET company_name = $1, mc_number = $2, contact_person = $3, email = $4, phone = $5, credit_rating = $6, notes = $7
       WHERE id = $8 RETURNING *`,
      [company_name, mc_number || null, contact_person || null, email || null, phone || null, credit_rating || 'A', notes || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Broker not found.' });
    res.json({ ok: true, broker: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update broker.' });
  }
});

// Delete broker — admin/super_admin
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM brokers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete broker.' });
  }
});

module.exports = router;
module.exports.syncBrokersFromLoadRows = syncBrokersFromLoadRows;
module.exports.upsertBrokersBatch = upsertBrokersBatch;
