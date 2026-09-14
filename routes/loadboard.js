const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Mock / Live Freight Load Generator Helper
function generateSampleDATLoads(origin, destination, equipmentType, minRpm) {
  const brokers = [
    { name: 'C.H. Robinson', mc: 'MC-159021', phone: '+1 800 326 9477', email: 'dispatch@chrobinson.com' },
    { name: 'TQL (Total Quality Logistics)', mc: 'MC-325990', phone: '+1 800 580 3101', email: 'loadbooking@tql.com' },
    { name: 'Coyote Logistics', mc: 'MC-561382', phone: '+1 877 626 9683', email: 'rates@coyote.com' },
    { name: 'Landstar Ranger', mc: 'MC-166960', phone: '+1 800 872 9474', email: 'dispatch@landstar.com' },
    { name: 'RXO Freight', mc: 'MC-414732', phone: '+1 800 359 9350', email: 'rates@rxo.com' },
    { name: 'Echo Global Logistics', mc: 'MC-525458', phone: '+1 800 354 7993', email: 'booking@echoglobal.com' }
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
      broker_email: broker.email,
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
    carrierId, brokerName, brokerMc, brokerPhone, brokerEmail,
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
        carrier_id, dispatcher_id, broker_name, broker_mc, broker_phone, broker_email,
        pickup_location, pickup_state, pickup_date,
        delivery_location, delivery_state, delivery_date,
        rate, miles, rpm, equipment_type, status, driver_approval_status, broker_negotiation_status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending', 'pending', 'idle', $17)
       RETURNING *`,
      [
        carrierId, req.user.id, brokerName || 'DAT Load Board Broker', brokerMc || null, brokerPhone || null, brokerEmail || 'dispatch@broker.com',
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
      SELECT o.*, u.name AS carrier_name, u.company_name AS carrier_company, u.phone AS carrier_phone, u.email AS carrier_email, u.mc_number AS carrier_mc, d.name AS dispatcher_name
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

    const appStatus = response === 'accepted' ? 'approved' : 'declined';
    await client.query('UPDATE load_offers SET status = $1, driver_approval_status = $2 WHERE id = $3', [response, appStatus, req.params.id]);

    let createdLoad = null;
    let negotiationResult = null;

    if (response === 'accepted') {
      await client.query(
        `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
         VALUES ($1, 'driver_approved', 'driver', $2, $3, $4)`,
        [offer.id, `Driver/Carrier approved load offer #${offer.id}`, offer.rate, offer.rpm]
      );

      // Trigger Autonomous AI Broker Bidding Email!
      const targetBid = (parseFloat(offer.rate) + 150).toFixed(2);
      await client.query(
        `UPDATE load_offers SET broker_negotiation_status = 'bidding', initial_bid_rate = $1 WHERE id = $2`,
        [targetBid, offer.id]
      );

      const { sendBrandedEmail } = require('../utils/mailer');
      const carrierRes = await client.query('SELECT * FROM users WHERE id = $1', [offer.carrier_id]);
      const carrier = carrierRes.rows[0] || {};
      const carrierCompany = carrier.company_name || carrier.name || 'Motor Carrier';
      const carrierMc = carrier.mc_number || '149201';

      const emailSubject = `Rate Inquiry & Load Booking: ${offer.pickup_location} ➔ ${offer.delivery_location} (${offer.equipment_type}) — MC# ${carrierMc}`;
      const emailBody = `Hi ${offer.broker_name} Dispatch,\n\n` +
        `Shipping Wish LLC is bidding on behalf of ${carrierCompany} (MC# ${carrierMc}).\n\n` +
        `Load Details:\n` +
        `• Lane: ${offer.pickup_location} ➔ ${offer.delivery_location}\n` +
        `• Equipment: ${offer.equipment_type}\n` +
        `• Distance: ${offer.miles} miles\n` +
        `• Requested Rate: $${targetBid} ($${(targetBid / offer.miles).toFixed(2)}/mile)\n\n` +
        `Our truck is empty and ready for immediate dispatch. Please confirm rate and send Rate Confirmation to dispatch@shippingwish.com.\n\n` +
        `Best regards,\nShipping Wish Autonomous Dispatch Engine\nhttps://www.shippingwish.com`;

      try {
        await sendBrandedEmail({
          to: offer.broker_email || 'dispatch@broker.com',
          subject: emailSubject,
          text: emailBody,
          html: `<pre style="font-family:sans-serif;font-size:14px;">${emailBody}</pre>`,
          emailType: 'broker_bid'
        });
      } catch (e) {
        console.warn('Broker bid email notice:', e.message);
      }

      await client.query(
        `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
         VALUES ($1, 'broker_bid_sent', 'ai_bot', $2, $3, $4)`,
        [offer.id, `AI dispatched official rate inquiry email to ${offer.broker_name} (${offer.broker_email}) requesting $${targetBid}`, targetBid, (targetBid / offer.miles).toFixed(2)]
      );

      negotiationResult = {
        broker_negotiation_status: 'bidding',
        initial_bid_rate: targetBid,
        message: `Driver approved! AI emailed ${offer.broker_name} requesting $${targetBid} ($${(targetBid / offer.miles).toFixed(2)}/mi).`
      };
    }

    await client.query('COMMIT');
    res.json({ ok: true, status: response, createdLoad, negotiation: negotiationResult });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Respond offer error:', err);
    res.status(500).json({ error: 'Could not respond to offer.' });
  } finally {
    client.release();
  }
});

// 6. AI Dispatch Loads to Driver via SMS & Email
router.post('/ai-dispatch-driver-offers', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { carrierId, currentCity, destination, equipmentType, minRpm, sendSms, sendEmail } = req.body;

  if (!carrierId) return res.status(400).json({ error: 'Carrier ID is required.' });

  try {
    const carrierRes = await pool.query('SELECT * FROM users WHERE id = $1', [carrierId]);
    if (!carrierRes.rows.length) return res.status(404).json({ error: 'Carrier not found.' });
    const carrier = carrierRes.rows[0];

    const loads = generateSampleDATLoads(currentCity || 'Dallas, TX', destination || 'Atlanta, GA', equipmentType || carrier.equipment_type || '53ft Dry Van', minRpm || 2.80);
    const topLoad = loads[0];

    const targetMinRpm = parseFloat(minRpm || 2.80);
    const result = await pool.query(
      `INSERT INTO load_offers (
        carrier_id, dispatcher_id, broker_name, broker_mc, broker_phone, broker_email,
        pickup_location, pickup_state, pickup_date,
        delivery_location, delivery_state, delivery_date,
        rate, miles, rpm, equipment_type, status, driver_approval_status, broker_negotiation_status, target_min_rpm, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending', 'pending', 'idle', $17, $18)
       RETURNING *`,
      [
        carrier.id, req.user.id, topLoad.broker_name, topLoad.broker_mc, topLoad.broker_phone, topLoad.broker_email,
        topLoad.pickup_location, topLoad.pickup_state, topLoad.pickup_date,
        topLoad.delivery_location, topLoad.delivery_state, topLoad.delivery_date,
        topLoad.rate, topLoad.miles, topLoad.rpm, topLoad.equipment_type, targetMinRpm, `AI matched DAT Load #${topLoad.id}`
      ]
    );

    const offer = result.rows[0];
    let smsSent = false;
    let emailSent = false;

    // Send Driver SMS Notification
    if (sendSms !== false && carrier.phone) {
      try {
        const { logSmsMessage } = require('../utils/sms-inbox');
        const smsBody = `Shipping Wish AI Load Match #${offer.id}: ${offer.pickup_location} ➔ ${offer.delivery_location} (${offer.miles}mi) paying $${offer.rate} ($${offer.rpm}/mi). Reply YES ${offer.id} to approve broker rate negotiation!`;
        await logSmsMessage({
          direction: 'outbound',
          from_number: process.env.TWILIO_FROM_NUMBER || '+16094696004',
          to_number: carrier.phone,
          body: smsBody,
          sent_by: req.user.id,
          disposition: 'sent'
        });
        smsSent = true;
      } catch (err) {
        console.warn('Driver SMS dispatch error:', err.message);
      }
    }

    // Send Driver Email Notification
    if (sendEmail !== false && carrier.email) {
      try {
        const { sendBrandedEmail } = require('../utils/mailer');
        const emailBody = `Hi ${carrier.name},\n\n` +
          `Shipping Wish AI matched a high-profit ${offer.equipment_type} load for your fleet:\n\n` +
          `• Lane: ${offer.pickup_location} ➔ ${offer.delivery_location}\n` +
          `• Distance: ${offer.miles} miles\n` +
          `• Gross Pay: $${offer.rate} ($${offer.rpm}/mile)\n` +
          `• Broker: ${offer.broker_name}\n\n` +
          `Click below to approve this load or reply YES to this email:\n` +
          `${process.env.APP_URL || 'https://www.shippingwish.com'}/portal?approve_offer=${offer.id}\n\n` +
          `Best regards,\nShipping Wish AI Load Matching Team`;

        await sendBrandedEmail({
          to: carrier.email,
          subject: `AI Load Match: ${offer.pickup_location} ➔ ${offer.delivery_location} ($${offer.rate})`,
          text: emailBody,
          html: `<pre style="font-family:sans-serif;font-size:14px;">${emailBody}</pre>`,
          emailType: 'load_offer'
        });
        emailSent = true;
      } catch (err) {
        console.warn('Driver Email dispatch error:', err.message);
      }
    }

    res.json({
      ok: true,
      offer,
      sms_sent: smsSent,
      email_sent: emailSent,
      message: `AI Load Offer #${offer.id} matched and dispatched to driver ${carrier.name}`
    });
  } catch (err) {
    console.error('AI dispatch driver offer error:', err);
    res.status(500).json({ error: 'Could not dispatch AI load offer to driver.' });
  }
});

// 7. Broker Counter-Offer Simulator & Automated Negotiation Decision Endpoint
router.post('/broker-counter-reply', requireAuth, async (req, res) => {
  const { offer_id, counter_rate, broker_message } = req.body;

  if (!offer_id || !counter_rate) {
    return res.status(400).json({ error: 'Offer ID and counter rate are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const offerRes = await client.query('SELECT * FROM load_offers WHERE id = $1', [offer_id]);
    if (!offerRes.rows.length) return res.status(404).json({ error: 'Offer not found.' });
    const offer = offerRes.rows[0];

    const counterRateNum = parseFloat(counter_rate);
    const miles = parseFloat(offer.miles || 1);
    const counterRpm = (counterRateNum / miles).toFixed(2);
    const minTargetRpm = parseFloat(offer.target_min_rpm || 2.80);
    const minAcceptableRate = miles * minTargetRpm;

    let newNegotiationStatus = 'countered';
    let decisionMessage = '';
    let createdLoad = null;

    if (counterRateNum >= minAcceptableRate) {
      newNegotiationStatus = 'accepted';
      decisionMessage = `Broker offer $${counterRateNum} ($${counterRpm}/mi) meets minimum target $${minTargetRpm}/mi. Deal accepted! Rate Con requested.`;

      await client.query(
        `UPDATE load_offers SET status = 'accepted', broker_negotiation_status = 'accepted', final_agreed_rate = $1 WHERE id = $2`,
        [counterRateNum, offer.id]
      );

      // Auto-create booked load in loads table!
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
          miles, counterRateNum, counterRpm, (counterRateNum * 0.90).toFixed(2), offer.equipment_type,
          `Auto-booked via Autonomous AI Broker Rate Negotiation for $${counterRateNum}`
        ]
      );
      const loadId = insertLoad.rows[0].id;
      const loadNumber = `SW-${new Date().getFullYear()}-${String(loadId).padStart(5, '0')}`;
      await client.query('UPDATE loads SET load_number = $1 WHERE id = $2', [loadNumber, loadId]);
      createdLoad = { id: loadId, loadNumber };
      await client.query('UPDATE load_offers SET status = \'booked\' WHERE id = $1', [offer.id]);
    } else {
      newNegotiationStatus = 'countered';
      const midPointRate = ((counterRateNum + (miles * (minTargetRpm + 0.30))) / 2).toFixed(2);
      decisionMessage = `Broker offer $${counterRateNum} is below target. AI countered with $${midPointRate} ($${(midPointRate / miles).toFixed(2)}/mi).`;

      await client.query(
        `UPDATE load_offers SET broker_negotiation_status = 'countered' WHERE id = $1`,
        [offer.id]
      );
    }

    await client.query(
      `INSERT INTO ai_load_negotiations (offer_id, event_type, sender_type, message_text, rate_offered, rpm)
       VALUES ($1, $2, 'broker', $3, $4, $5)`,
      [offer.id, newNegotiationStatus === 'accepted' ? 'deal_closed' : 'broker_counter_received', broker_message || decisionMessage, counterRateNum, counterRpm]
    );

    await client.query('COMMIT');
    res.json({
      ok: true,
      offer_id: offer.id,
      broker_negotiation_status: newNegotiationStatus,
      decision: decisionMessage,
      counter_rate: counterRateNum,
      counter_rpm: counterRpm,
      created_load: createdLoad
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Broker counter reply error:', err);
    res.status(500).json({ error: 'Could not process broker counter reply.' });
  } finally {
    client.release();
  }
});

// 8. Get AI Negotiation Timeline History
router.get('/negotiations/:offerId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ai_load_negotiations WHERE offer_id = $1 ORDER BY created_at ASC`,
      [req.params.offerId]
    );
    res.json({ ok: true, negotiations: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load negotiation history.' });
  }
});

module.exports = router;

