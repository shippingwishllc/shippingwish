const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { normalizeEquipmentAndWeight } = require('../utils/ai-freight-extractor');

const router = express.Router();

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

// Middleware: Authenticate requests using API Key
async function authenticateApiKey(req, res, next) {
  await ensureBrokerApiKeyTable();
  const authHeader = req.headers['authorization'] || '';
  const apiKeyHeader = req.headers['x-api-key'] || '';
  let token = apiKeyHeader;
  if (!token && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    return res.status(401).json({
      error: 'Missing API key. Provide via header "Authorization: Bearer <key>" or "x-api-key: <key>".',
      code: 'API_KEY_REQUIRED',
      docs_url: 'https://www.loadsnexus.com/docs/api'
    });
  }

  try {
    const keyRes = await pool.query(
      `SELECT k.*, u.id as user_id, u.name as user_name, u.email as user_email,
              u.company_name, u.mc_number, u.dot_number, u.phone
       FROM broker_api_keys k
       JOIN users u ON k.user_id = u.id
       WHERE k.api_key = $1 AND k.is_active = true AND u.deleted_at IS NULL AND u.is_suspended = false`,
      [token]
    );

    if (!keyRes.rows.length) {
      return res.status(401).json({
        error: 'Invalid or revoked API key.',
        code: 'INVALID_API_KEY'
      });
    }

    req.brokerUser = keyRes.rows[0];
    pool.query('UPDATE broker_api_keys SET last_used_at = NOW() WHERE id = $1', [keyRes.rows[0].id]).catch(() => {});
    next();
  } catch (err) {
    console.error('API key auth error:', err);
    res.status(500).json({ error: 'Internal error verifying API key.' });
  }
}

// ----------------------------------------------------
// INTERNAL BROKER DESK KEY MANAGEMENT
// ----------------------------------------------------

// GET /api/broker/api-key — Get or auto-generate broker's primary API key
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
      const ins = await pool.query(
        `INSERT INTO broker_api_keys (user_id, api_key, name, is_active, created_at)
         VALUES ($1, $2, 'Production TMS Key', true, NOW())
         RETURNING id, api_key, name, is_active, last_used_at, created_at`,
        [brokerId, newKey]
      );
      keyRes = ins;
    }

    const row = keyRes.rows[0];
    res.json({
      ok: true,
      api_key: row.api_key,
      name: row.name,
      created_at: row.created_at,
      last_used_at: row.last_used_at
    });
  } catch (err) {
    console.error('Get API key error:', err);
    res.status(500).json({ error: 'Could not fetch API key.' });
  }
});

// POST /api/broker/api-key/regenerate — Invalidate old key and generate a fresh key
router.post(['/broker/api-key/regenerate', '/api-key/regenerate'], requireAuth, async (req, res) => {
  await ensureBrokerApiKeyTable();
  try {
    const brokerId = req.user.id;
    // Deactivate old keys
    await pool.query(
      `UPDATE broker_api_keys SET is_active = false WHERE user_id = $1`,
      [brokerId]
    );

    // Create fresh key
    const newKey = generateApiKey();
    const ins = await pool.query(
      `INSERT INTO broker_api_keys (user_id, api_key, name, is_active, created_at)
       VALUES ($1, $2, 'Production TMS Key', true, NOW())
       RETURNING id, api_key, name, is_active, last_used_at, created_at`,
      [brokerId, newKey]
    );

    res.json({
      ok: true,
      api_key: ins.rows[0].api_key,
      message: 'Fresh API key generated successfully. Update your external TMS/ERP settings.'
    });
  } catch (err) {
    console.error('Regenerate API key error:', err);
    res.status(500).json({ error: 'Could not regenerate API key.' });
  }
});

// ----------------------------------------------------
// EXTERNAL PARTNER REST API (v1)
// ----------------------------------------------------

// POST /api/v1/loads — Ingest loads from external TMS/ERP
router.post('/v1/loads', authenticateApiKey, async (req, res) => {
  const {
    origin, destination, equipment, rate, miles, weight,
    commodity, pickup_date, delivery_date, notes
  } = req.body;

  if (!origin || !destination || !rate) {
    return res.status(400).json({
      error: 'Missing required freight parameters: origin, destination, and rate are mandatory.',
      code: 'VALIDATION_ERROR'
    });
  }

  const numRate = Number(rate);
  if (isNaN(numRate) || numRate < 150) {
    return res.status(400).json({
      error: 'Invalid rate. Minimum spot freight rate is $150 USD.',
      code: 'INVALID_RATE'
    });
  }

  const milesNum = Number(miles) > 0 ? Number(miles) : 650;
  const rpm = (numRate / milesNum).toFixed(2);
  const broker = req.brokerUser;
  const norm = normalizeEquipmentAndWeight(equipment || "53' Dry Van", weight || '42,000 lbs');

  const loadNumber = 'SW-' + Math.floor(100000 + Math.random() * 900000);

  try {
    await pool.query(`
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_name TEXT;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_mc TEXT;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_contact TEXT;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS miles NUMERIC(8,2) DEFAULT 0;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS rpm NUMERIC(6,2) DEFAULT 0;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS external_ref TEXT;
    `).catch(() => {});

    const bName = broker.company_name || broker.user_name || 'Verified Freight Brokerage';
    const mc = broker.mc_number || 'MC-VERIFIED';
    const contact = `${broker.phone || '+1 (800) 580-3101'} | ${broker.user_email}`;

    const ins = await pool.query(
      `INSERT INTO loads (
        load_number, status, rate, pickup_location, delivery_location,
        pickup_date, delivery_date, equipment_type, weight, commodity,
        notes, broker_name, broker_mc, broker_contact, miles, rpm, created_at, updated_at
      ) VALUES ($1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING id, load_number, status, rate, pickup_location, delivery_location, pickup_date, equipment_type, weight, miles, rpm, created_at`,
      [
        loadNumber, numRate, origin, destination,
        pickup_date || new Date(), delivery_date || null,
        norm.equipment_type, norm.weight, commodity || 'General Freight',
        `API Ingest from ${bName} (${mc}). Notes: ${notes || 'Immediate dispatch'}`,
        bName, mc, contact, milesNum, Number(rpm)
      ]
    );

    const postedLoad = ins.rows[0];

    res.status(201).json({
      ok: true,
      load_id: postedLoad.load_number,
      status: 'active',
      pickup: postedLoad.pickup_location,
      delivery: postedLoad.delivery_location,
      rate: postedLoad.rate,
      rpm: postedLoad.rpm,
      equipment: postedLoad.equipment_type,
      public_view_url: `https://www.loadsnexus.com/board?q=${encodeURIComponent(postedLoad.load_number)}`,
      ratecon_url: `https://www.loadsnexus.com/api/loadboard/loads/${postedLoad.load_number}/ratecon-pdf`,
      message: `Load #${postedLoad.load_number} published live to LoadsNexus spot exchange.`
    });
  } catch (err) {
    console.error('API v1 post load error:', err);
    res.status(500).json({ error: 'Could not post load via API.' });
  }
});

// GET /api/v1/loads — Query broker's active loads via API
router.get('/v1/loads', authenticateApiKey, async (req, res) => {
  try {
    const broker = req.brokerUser;
    const email = broker.user_email;
    const mc = broker.mc_number;

    const r = await pool.query(
      `SELECT id, load_number, status, rate, pickup_location, delivery_location,
              pickup_date, equipment_type, weight, commodity, miles, rpm, created_at
       FROM loads
       WHERE status != 'cancelled' AND (broker_contact ILIKE $1 OR broker_mc = $2)
       ORDER BY created_at DESC LIMIT 100`,
      [`%${email}%`, mc || '']
    );

    res.json({
      ok: true,
      total: r.rows.length,
      loads: r.rows
    });
  } catch (err) {
    console.error('API v1 list loads error:', err);
    res.status(500).json({ error: 'Could not list loads via API.' });
  }
});

// DELETE /api/v1/loads/:id — Cancel or cover load via API
router.delete('/v1/loads/:id', authenticateApiKey, async (req, res) => {
  const loadId = req.params.id;
  try {
    await pool.query(
      `UPDATE loads SET status = 'cancelled', updated_at = NOW() WHERE load_number = $1 OR id::text = $1`,
      [loadId]
    );

    res.json({
      ok: true,
      load_id: loadId,
      status: 'cancelled',
      message: `Load #${loadId} cancelled and removed from active exchange.`
    });
  } catch (err) {
    console.error('API v1 delete load error:', err);
    res.status(500).json({ error: 'Could not cancel load via API.' });
  }
});

module.exports = router;
