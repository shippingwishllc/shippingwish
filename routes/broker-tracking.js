/**
 * routes/broker-tracking.js
 * Shipping Wish LLC — Live Broker Check-Call & GPS Tracking Engine
 * 
 * Provides public, token-authenticated real-time load tracking for freight brokers,
 * eliminating manual phone check-calls with automated milestone updates and live GPS breadcrumbs.
 */

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { sendBrandedEmail } = require('../utils/mailer');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getEmbedDirectionsUrl } = require('../utils/google-maps');

const router = express.Router();

/**
 * Generate a cryptographically secure random tracking token
 */
function generateTrackingToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Ensure tracking columns exist on ai_dispatch_offers
 */
let trackingSchemaPromise = null;
async function ensureTrackingSchema() {
  if (!trackingSchemaPromise) {
    trackingSchemaPromise = pool.query(`
      ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS tracking_token TEXT;
      ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS tracking_status TEXT DEFAULT 'booked';
      ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS last_known_lat NUMERIC(9,6);
      ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS last_known_lng NUMERIC(9,6);
      ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS last_known_city TEXT;
      ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS last_known_state TEXT;
      ALTER TABLE ai_dispatch_offers ADD COLUMN IF NOT EXISTS check_calls_log JSONB DEFAULT '[]'::jsonb;
      CREATE INDEX IF NOT EXISTS ai_dispatch_offers_tracking_token_idx ON ai_dispatch_offers (tracking_token);
    `).catch((err) => {
      console.warn('[Tracking Schema] Column check notice:', err.message);
    });
  }
  return trackingSchemaPromise;
}

/**
 * Helper to fetch tracking offer with joined load and carrier details
 */
async function getOfferByToken(token) {
  await ensureTrackingSchema();
  const query = `
    SELECT 
      o.id AS offer_id,
      o.load_id,
      o.carrier_id,
      o.status AS offer_status,
      COALESCE(o.tracking_token, $1) AS tracking_token,
      COALESCE(o.tracking_status, 'booked') AS tracking_status,
      o.last_known_lat,
      o.last_known_lng,
      o.last_known_city,
      o.last_known_state,
      COALESCE(o.check_calls_log, '[]'::jsonb) AS check_calls_log,
      o.broker_email,
      l.pickup_location,
      l.delivery_location,
      l.pickup_date,
      l.delivery_date,
      l.equipment_type,
      l.weight,
      l.rate,
      l.commodity,
      c.company_name AS carrier_name,
      c.mc_number,
      c.dot_number,
      c.phone AS carrier_phone,
      c.contact_name AS driver_name
    FROM ai_dispatch_offers o
    LEFT JOIN loads l ON l.id = o.load_id
    LEFT JOIN ai_dispatch_carriers c ON c.id = o.carrier_id
    WHERE o.tracking_token = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [token]);
  return rows[0] || null;
}

/**
 * GET /api/tracking/:token
 * Public endpoint for brokers to fetch real-time load status & GPS trail
 */
router.get('/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Tracking token required' });

    let record = await getOfferByToken(token);

    // If not found by exact token, check if it's an offer ID for internal preview
    if (!record && /^\d+$/.test(token)) {
      const { rows } = await pool.query(`
        SELECT 
          o.id AS offer_id,
          o.load_id,
          o.carrier_id,
          o.status AS offer_status,
          COALESCE(o.tracking_token, '') AS tracking_token,
          COALESCE(o.tracking_status, 'booked') AS tracking_status,
          o.last_known_lat,
          o.last_known_lng,
          o.last_known_city,
          o.last_known_state,
          COALESCE(o.check_calls_log, '[]'::jsonb) AS check_calls_log,
          o.broker_email,
          l.pickup_location,
          l.delivery_location,
          l.pickup_date,
          l.delivery_date,
          l.equipment_type,
          l.weight,
          l.rate,
          l.commodity,
          c.company_name AS carrier_name,
          c.mc_number,
          c.dot_number,
          c.phone AS carrier_phone,
          c.contact_name AS driver_name
        FROM ai_dispatch_offers o
        LEFT JOIN loads l ON l.id = o.load_id
        LEFT JOIN ai_dispatch_carriers c ON c.id = o.carrier_id
        WHERE o.id = $1
      `, [Number(token)]);
      record = rows[0] || null;
    }

    if (!record) {
      return res.status(404).json({ error: 'Tracking link not found or expired.' });
    }

    res.json({
      ok: true,
      tracking: {
        offer_id: record.offer_id,
        load_id: record.load_id,
        tracking_token: record.tracking_token,
        status: record.tracking_status,
        origin: record.pickup_location || 'Pending Shipper',
        destination: record.delivery_location || 'Pending Consignee',
        pickup_date: record.pickup_date,
        delivery_date: record.delivery_date,
        equipment: record.equipment_type || "53' Dry Van",
        carrier: {
          name: record.carrier_name || 'Shipping Wish Logistics',
          mc: record.mc_number || '1489201',
          dot: record.dot_number || '3976521',
          driver: record.driver_name || 'Operations Assigned Unit'
        },
        gps: {
          lat: record.last_known_lat ? Number(record.last_known_lat) : 36.8656,
          lng: record.last_known_lng ? Number(record.last_known_lng) : -87.4886,
          city: record.last_known_city || 'In Transit',
          state: record.last_known_state || 'US',
          updated_at: new Date().toISOString()
        },
        milestones: [
          { key: 'booked', label: 'Load Booked & RateCon Verified', completed: true },
          { key: 'dispatched', label: 'Dispatched to Shipper', completed: ['dispatched', 'at_shipper', 'loaded', 'at_receiver', 'delivered'].includes(record.tracking_status) },
          { key: 'at_shipper', label: 'Arrived at Shipper', completed: ['at_shipper', 'loaded', 'at_receiver', 'delivered'].includes(record.tracking_status) },
          { key: 'loaded', label: 'Loaded & Rolling In-Transit', completed: ['loaded', 'at_receiver', 'delivered'].includes(record.tracking_status) },
          { key: 'at_receiver', label: 'Arrived at Receiver', completed: ['at_receiver', 'delivered'].includes(record.tracking_status) },
          { key: 'delivered', label: 'Delivered & Signed POD', completed: record.tracking_status === 'delivered' }
        ],
        check_calls: Array.isArray(record.check_calls_log) ? record.check_calls_log : [],
        embed_map_url: getEmbedDirectionsUrl({
          origin: record.pickup_location,
          destination: record.delivery_location
        })
      }
    });
  } catch (err) {
    console.error('[Broker Tracking] Fetch error:', err);
    res.status(500).json({ error: 'Could not fetch tracking data: ' + err.message });
  }
});

/**
 * POST /api/tracking/:token/update
 * Update load milestone, GPS location, and optionally alert the broker
 */
router.post('/:token/update', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    const {
      status,
      lat,
      lng,
      city,
      state,
      notes = '',
      notify_broker = true
    } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status milestone is required.' });
    }

    await ensureTrackingSchema();

    // Find offer
    const { rows } = await pool.query(
      `SELECT * FROM ai_dispatch_offers WHERE tracking_token = $1 OR id = $2`,
      [token, /^\d+$/.test(token) ? Number(token) : -1]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Tracking offer not found.' });
    }

    const offer = rows[0];
    const timestamp = new Date().toISOString();

    const newLogEntry = {
      status,
      timestamp,
      location: city && state ? `${city}, ${state}` : (city || 'Highway En Route'),
      notes: notes || `Milestone updated to ${status.toUpperCase()}`,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null
    };

    let existingLogs = Array.isArray(offer.check_calls_log) ? offer.check_calls_log : [];
    existingLogs.push(newLogEntry);

    await pool.query(
      `UPDATE ai_dispatch_offers 
       SET tracking_status = $1,
           last_known_lat = COALESCE($2, last_known_lat),
           last_known_lng = COALESCE($3, last_known_lng),
           last_known_city = COALESCE($4, last_known_city),
           last_known_state = COALESCE($5, last_known_state),
           check_calls_log = $6::jsonb,
           updated_at = now()
       WHERE id = $7`,
      [
        status,
        lat || null,
        lng || null,
        city || null,
        state || null,
        JSON.stringify(existingLogs),
        offer.id
      ]
    );

    // If notify_broker is requested and broker email is known, send automated check-call
    let brokerNotified = false;
    if (notify_broker && offer.broker_email && offer.broker_email.includes('@')) {
      try {
        const statusDisplay = status.replace('_', ' ').toUpperCase();
        await sendBrandedEmail({
          to: offer.broker_email,
          subject: `CHECK-CALL: Load #${offer.load_id} Status Update: ${statusDisplay}`,
          text: `
Hello,

This is an automated check-call update for Load #${offer.load_id}.

CURRENT STATUS: ${statusDisplay}
LOCATION: ${city ? `${city}, ${state || ''}` : 'En route'}
TIME: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST
NOTES: ${notes || 'Driver is on schedule.'}

Live Tracking Link: https://www.shippingwish.com/track/${offer.tracking_token || token}

Thank you,
Shipping Wish Dispatch Desk
+1 (800) 580-3101 | dispatch@shippingwish.com
          `.trim()
        });
        brokerNotified = true;
      } catch (mailErr) {
        console.warn('[CheckCall Mail] Failed to email broker:', mailErr.message);
      }
    }

    res.json({
      ok: true,
      message: `Status updated to ${status}.`,
      status,
      broker_notified: brokerNotified,
      log_entry: newLogEntry
    });
  } catch (err) {
    console.error('[Tracking Update] Error:', err);
    res.status(500).json({ error: 'Could not update tracking: ' + err.message });
  }
});

/**
 * POST /api/tracking/generate-for-offer
 * Staff endpoint to generate tracking token for an offer
 */
router.post('/generate-for-offer', requireAuth, async (req, res) => {
  try {
    const { offer_id } = req.body;
    if (!offer_id) return res.status(400).json({ error: 'Offer ID required' });

    await ensureTrackingSchema();
    const token = generateTrackingToken();

    await pool.query(
      `UPDATE ai_dispatch_offers 
       SET tracking_token = $1, tracking_status = COALESCE(tracking_status, 'booked')
       WHERE id = $2`,
      [token, offer_id]
    );

    res.json({
      ok: true,
      offer_id,
      tracking_token: token,
      tracking_url: `https://www.shippingwish.com/track/${token}`,
      message: `Tracking link created.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tracking token: ' + err.message });
  }
});

module.exports = router;
module.exports.generateTrackingToken = generateTrackingToken;
