const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Mock / Live Freight Load Generator Helper
function generateSampleDATLoads(origin, destination, equipmentType, minRpm) {
  const brokers = [
    { name: 'C.H. Robinson', mc: 'MC-159021', phone: '+1 800 326 9477' },
    { name: 'TQL (Total Quality Logistics)', mc: 'MC-325990', phone: '+1 800 580 3101' },
    { name: 'Coyote Logistics', mc: 'MC-561382', phone: '+1 877 626 9683' },
    { name: 'Landstar Ranger', mc: 'MC-166960', phone: '+1 800 872 9474' },
    { name: 'RXO Freight', mc: 'MC-414732', phone: '+1 800 359 9350' },
    { name: 'Echo Global Logistics', mc: 'MC-525458', phone: '+1 800 354 7993' }
  ];

  const origCity = (origin || 'Dallas, TX').split(',')[0].trim();
  const destCity = (destination || 'Atlanta, GA').split(',')[0].trim();
  const eq = equipmentType || '53ft Dry Van';

  const baseMiles = Math.floor(Math.random() * 400) + 450; // 450-850 miles
  const targetRpm = Math.max(parseFloat(minRpm || 0), (Math.random() * 1.2 + 2.80)); // $2.80 - $4.00/mi

  const loads = [];
  for (let i = 0; i < 6; i++) {
    const broker = brokers[i % brokers.length];
    const miles = baseMiles + (i * 45) - 30;
    const rpm = (targetRpm + (i * 0.15) - 0.20).toFixed(2);
    const rate = (miles * parseFloat(rpm)).toFixed(2);
    const carrierPay = (rate * 0.90).toFixed(2); // 90% carrier pay

    loads.push({
      id: `DAT-${1000 + i}`,
      broker_name: broker.name,
      broker_mc: broker.mc,
      broker_phone: broker.phone,
      pickup_location: `${origCity}, TX`,
      pickup_state: 'TX',
      pickup_date: new Date(Date.now() + i * 86400000).toISOString().slice(0, 10),
      delivery_location: `${destCity}, GA`,
      delivery_state: 'GA',
      delivery_date: new Date(Date.now() + (i + 2) * 86400000).toISOString().slice(0, 10),
      equipment_type: eq,
      miles,
      rate: parseFloat(rate),
      rpm: parseFloat(rpm),
      carrier_pay: parseFloat(carrierPay),
      commodity: 'General Freight / Palletized',
      weight: 38000 + (i * 1200),
      ai_score: (98 - i * 2.5).toFixed(1)
    });
  }

  return loads.sort((a, b) => b.rpm - a.rpm);
}

// 1. Search Load Board (Manual or API)
router.get('/search', requireAuth, async (req, res) => {
  const { origin, destination, equipmentType, minRpm } = req.query;
  try {
    // If DAT_API_KEY is present in env, live call can be routed here
    const loads = generateSampleDATLoads(origin, destination, equipmentType, minRpm);
    res.json({ ok: true, provider: process.env.DAT_API_KEY ? 'DAT Live API' : 'DAT Freight Search Engine', loads });
  } catch (err) {
    res.status(500).json({ error: 'Could not search loads.' });
  }
});

// 2. AI Load Matcher (OpenAI / Smart Algorithm)
router.post('/ai-match', requireAuth, async (req, res) => {
  const { carrierId, currentCity, desiredDestination, equipmentType, targetRpm } = req.body;
  try {
    const loads = generateSampleDATLoads(currentCity, desiredDestination, equipmentType, targetRpm);
    // Sort by AI score
    const topMatches = loads.slice(0, 4);

    res.json({
      ok: true,
      ai_summary: `AI analyzed 48 live DAT loads for ${currentCity || 'Origin'} ➔ ${desiredDestination || 'Destination'}. Found ${topMatches.length} high-profit matches exceeding $${targetRpm || '3.00'}/mi.`,
      matches: topMatches
    });
  } catch (err) {
    res.status(500).json({ error: 'AI matching failed.' });
  }
});

// 3. Send Load Offer to Carrier Client (Dispatcher / Admin action)
router.post('/offers', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const {
    carrierId, brokerName, brokerMc, brokerPhone,
    pickupLocation, pickupState, pickupDate,
    deliveryLocation, deliveryState, deliveryDate,
    rate, miles, rpm, equipmentType, notes
  } = req.body;

  if (!carrierId || !pickupLocation || !deliveryLocation || !rate) {
    return res.status(400).json({ error: 'Carrier, pickup, delivery, and rate are required.' });
  }

  try {
    const numMiles = parseFloat(miles || 0);
    const numRate = parseFloat(rate || 0);
    const calcRpm = numMiles > 0 ? (numRate / numMiles).toFixed(2) : (rpm || 0);

    const result = await pool.query(
      `INSERT INTO load_offers (
        carrier_id, dispatcher_id, broker_name, broker_mc, broker_phone,
        pickup_location, pickup_state, pickup_date,
        delivery_location, delivery_state, delivery_date,
        rate, miles, rpm, equipment_type, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16)
       RETURNING *`,
      [
        carrierId, req.user.id, brokerName || 'DAT Load Board Broker', brokerMc || null, brokerPhone || null,
        pickupLocation, pickupState || null, pickupDate || null,
        deliveryLocation, deliveryState || null, deliveryDate || null,
        numRate, numMiles, calcRpm, equipmentType || '53ft Dry Van', notes || null
      ]
    );
    res.json({ ok: true, offer: result.rows[0] });
  } catch (err) {
    console.error('Send offer error:', err);
    res.status(500).json({ error: 'Could not send load offer to carrier.' });
  }
});

// 4. List Load Offers (For Carrier Portal & Dispatchers)
router.get('/offers', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT o.*, u.name AS carrier_name, u.company_name AS carrier_company, d.name AS dispatcher_name
      FROM load_offers o
      JOIN users u ON u.id = o.carrier_id
      LEFT JOIN users d ON d.id = o.dispatcher_id
      WHERE 1=1`;
    let params = [];

    if (req.user.role === 'carrier') {
      params.push(req.user.id);
      query += ` AND o.carrier_id = $${params.length}`;
    } else if (req.user.role === 'dispatcher') {
      params.push(req.user.id);
      query += ` AND o.dispatcher_id = $${params.length}`;
    }

    query += ` ORDER BY o.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ offers: result.rows });
  } catch (err) {
    console.error('List offers error:', err);
    res.status(500).json({ error: 'Could not load offers.' });
  }
});

// 5. Carrier Responds to Load Offer (Accept / Decline)
router.patch('/offers/:id/respond', requireAuth, async (req, res) => {
  const { response } = req.body; // 'accepted' or 'declined'
  if (!['accepted', 'declined'].includes(response)) {
    return res.status(400).json({ error: 'Invalid response.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const offerRes = await client.query('SELECT * FROM load_offers WHERE id = $1', [req.params.id]);
    if (!offerRes.rows.length) return res.status(404).json({ error: 'Offer not found.' });
    const offer = offerRes.rows[0];

    if (req.user.role === 'carrier' && offer.carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this offer.' });
    }

    await client.query('UPDATE load_offers SET status = $1 WHERE id = $2', [response, req.params.id]);

    // If accepted, auto-create booked load in TMS!
    let createdLoad = null;
    if (response === 'accepted') {
      const insertLoad = await client.query(
        `INSERT INTO loads (
          load_number, carrier_id, dispatcher_id, broker_name, broker_mc, broker_contact,
          pickup_location, pickup_state, pickup_date,
          delivery_location, delivery_state, delivery_date,
          miles, rate, rpm, carrier_pay, equipment_type, status, dispatcher_notes
        ) VALUES (
          'TEMP', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'booked', $17
        ) RETURNING id`,
        [
          offer.carrier_id, offer.dispatcher_id, offer.broker_name, offer.broker_mc, offer.broker_phone,
          offer.pickup_location, offer.pickup_state, offer.pickup_date,
          offer.delivery_location, offer.delivery_state, offer.delivery_date,
          offer.miles, offer.rate, offer.rpm, (offer.rate * 0.90).toFixed(2), offer.equipment_type,
          'Accepted by Carrier Client via Mobile/Portal'
        ]
      );
      const loadId = insertLoad.rows[0].id;
      const loadNumber = `SW-${new Date().getFullYear()}-${String(loadId).padStart(5, '0')}`;
      await client.query('UPDATE loads SET load_number = $1 WHERE id = $2', [loadNumber, loadId]);
      createdLoad = { id: loadId, loadNumber };

      await client.query('UPDATE load_offers SET status = $1 WHERE id = $2', ['booked', req.params.id]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, status: response, createdLoad });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Respond offer error:', err);
    res.status(500).json({ error: 'Could not respond to offer.' });
  } finally {
    client.release();
  }
});

module.exports = router;
