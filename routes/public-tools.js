const express = require('express');
const { searchFmcsa } = require('../utils/fmcsa');

const router = express.Router();

const rateMap = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 45;

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res, next) {
  const key = clientIp(req);
  const now = Date.now();
  let entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count += 1;
  rateMap.set(key, entry);
  if (entry.count > RATE_MAX) {
    return res.status(429).json({
      error: 'Too many searches. Please wait a few minutes or contact us for dispatch support.',
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000)
    });
  }
  next();
}

function publicCarrier(row) {
  return {
    company_name: row.company_name || '',
    dba_name: row.dba_name || '',
    owner_name: row.owner_name || row.officer_name || '',
    mc_number: row.mc_number || '',
    dot_number: row.dot_number || '',
    phone: row.phone || '',
    email: row.email || '',
    phy_address: row.phy_address || row.address || '',
    phy_city: row.phy_city || '',
    phy_state: row.phy_state || row.state || '',
    phy_zip: row.phy_zip || '',
    equipment_type: row.equipment_type || '',
    num_trucks: row.num_trucks || null,
    num_drivers: row.num_drivers || null,
    safety_rating: row.safety_rating || '',
    authority_status: row.authority_status || '',
    usdot_status: row.usdot_status || '',
    source: 'FMCSA Company Census'
  };
}

/** Public read-only FMCSA census lookup — no auth, rate limited */
router.get('/carrier-search', rateLimit, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const mode = String(req.query.mode || 'auto').trim().toLowerCase();

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Enter at least 2 characters to search.' });
  }
  if (q.length > 120) {
    return res.status(400).json({ error: 'Search query is too long.' });
  }

  try {
    const result = await searchFmcsa(q, { mode });
    const carriers = (result.carriers || []).slice(0, 15).map(publicCarrier);
    res.json({
      ok: true,
      count: carriers.length,
      queryType: result.query?.type || mode,
      source: result.source || 'FMCSA Census',
      carriers,
      disclaimer:
        'Public FMCSA Company Census data. Not a credit score, fraud score, or broker payment history. Verify authority on SAFER before hauling.'
    });
  } catch (err) {
    console.error('Public carrier search error:', err);
    res.status(500).json({ error: 'Search temporarily unavailable. Try again shortly.' });
  }
});

module.exports = router;
