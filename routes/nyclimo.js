const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requireRole, JWT_SECRET } = require('../middleware/auth');
const { ensureSchema } = require('../utils/limo-ensure-schema');
const {
  haversineMiles, estimateDurationMins, quoteAllVehicles, generateBookingNumber,
  calcPointToPointPrice, calcHourlyPrice
} = require('../utils/limo-pricing');
const { sendEmail } = require('../utils/mailer');

const APP_URL = (process.env.APP_URL || 'https://www.nyclimowish.com').replace(/\/$/, '');

function signLimoToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, partner_base_id: user.partner_base_id || null, is_limo_user: true }, JWT_SECRET, { expiresIn: '7d' });
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  try {
    await ensureSchema();
    const { rows } = await pool.query('SELECT * FROM limo_users WHERE lower(email) = lower($1)', [email]);
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role, partner_base_id: rows[0].partner_base_id || null };
    res.cookie('nlw_token', signLimoToken(user), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400 * 1000 });
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/signup', async (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required.' });
  try {
    await ensureSchema();
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO limo_users (name, email, password_hash, role, phone) VALUES ($1,$2,$3,'customer',$4) RETURNING id, name, email, role`,
      [name, email, hash, phone || null]
    );
    res.cookie('nlw_token', signLimoToken(rows[0]), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400 * 1000 });
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered.' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
router.post('/logout', (req, res) => { res.clearCookie('nlw_token'); res.json({ ok: true }); });

function getStripe() {
  const key = process.env.NYCLIMO_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) return null;
  return require('stripe')(key);
}

async function getVehicles() {
  await ensureSchema();
  const { rows } = await pool.query('SELECT * FROM limo_vehicles WHERE is_active = TRUE ORDER BY sort_order');
  return rows;
}

async function geocodeAddress(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`);
    const data = await res.json();
    if (data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng, formatted: data.results[0].formatted_address };
    }
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`, {
    headers: { 'User-Agent': 'NYC-Limo-Wish/1.0' }
  });
  const data = await res.json();
  if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), formatted: data[0].display_name };
  return null;
}

router.get('/vehicles', async (req, res) => {
  try { res.json({ vehicles: await getVehicles() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quote', async (req, res) => {
  try {
    const { serviceType, pickup, dropoff, hours, pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body || {};
    const vehicles = await getVehicles();
    let miles = 0, durationMins = 0, pickupGeo = null, dropoffGeo = null;

    if (pickupLat && pickupLng) pickupGeo = { lat: pickupLat, lng: pickupLng, formatted: pickup };
    else if (pickup) pickupGeo = await geocodeAddress(pickup);

    if (serviceType === 'hourly') {
      durationMins = (parseFloat(hours) || 3) * 60;
    } else {
      if (dropoffLat && dropoffLng) dropoffGeo = { lat: dropoffLat, lng: dropoffLng, formatted: dropoff };
      else if (dropoff) dropoffGeo = await geocodeAddress(dropoff);
      if (pickupGeo && dropoffGeo) {
        miles = Math.round(haversineMiles(pickupGeo.lat, pickupGeo.lng, dropoffGeo.lat, dropoffGeo.lng) * 1.25 * 100) / 100;
        durationMins = estimateDurationMins(miles);
      }
    }

    res.json({
      serviceType: serviceType || 'point_to_point',
      distance: { miles, durationMins },
      pickup: pickupGeo, dropoff: dropoffGeo,
      quotes: quoteAllVehicles(vehicles, { serviceType: serviceType || 'point_to_point', miles, hours: hours || 3 })
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bookings', async (req, res) => {
  try {
    await ensureSchema();
    const b = req.body || {};
    const firstName = String(b.firstName || '').trim().slice(0, 80);
    const lastName = String(b.lastName || '').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
    const phone = String(b.phone || '').trim().slice(0, 40);
    const pickupDate = String(b.pickupDate || '');
    if (!firstName || !lastName || !/^\\S+@\\S+\\.\\S+$/.test(email) || !phone) {
      return res.status(400).json({ error: 'Valid passenger name, email, and phone are required.' });
    }
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(pickupDate) || Number.isNaN(Date.parse(pickupDate)) ||
        new Date(pickupDate + 'T00:00:00Z') <= new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) {
      return res.status(400).json({ error: 'Pickup date must be a valid future date.' });
    }
    const vehicle = (await getVehicles()).find((v) => v.id === b.vehicleId);
    if (!vehicle) return res.status(400).json({ error: 'Invalid vehicle class.' });
    const serviceType = b.serviceType === 'hourly' ? 'hourly' : 'point_to_point';
    const passengers = Number.parseInt(b.passengers || 1, 10);
    if (!Number.isInteger(passengers) || passengers < 1 || passengers > Number(vehicle.passengers || 1)) {
      return res.status(400).json({ error: 'Passenger count exceeds this vehicle class capacity.' });
    }

    let referralBaseId = null;
    if (b.referralCode) {
      const referral = await pool.query(
        `SELECT id FROM limo_partner_bases WHERE upper(referral_code) = upper($1) AND approval_status = 'approved'`,
        [String(b.referralCode).trim()]
      );
      if (!referral.rows.length) return res.status(400).json({ error: 'Referral code is invalid or inactive.' });
      referralBaseId = referral.rows[0].id;
    }

    const pickupGeo = await geocodeAddress(String(b.pickup || '').trim());
    if (!pickupGeo) return res.status(400).json({ error: 'Pickup address could not be verified.' });
    let dropoffGeo = null;
    let miles = 0;
    let durationMins = 0;
    let durationHours = null;
    const verifiedStops = [];
    if (serviceType === 'hourly') {
      durationHours = Number(b.durationHours || 3);
      if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 24) {
        return res.status(400).json({ error: 'Hourly bookings must be between 1 and 24 hours.' });
      }
      durationMins = Math.round(durationHours * 60);
    } else {
      dropoffGeo = await geocodeAddress(String(b.dropoff || '').trim());
      if (!dropoffGeo) return res.status(400).json({ error: 'Drop-off address could not be verified.' });
      const inputStops = Array.isArray(b.stops) ? b.stops : [];
      if (inputStops.length > 5) return res.status(400).json({ error: 'A booking can include at most five additional stops.' });
      const points = [pickupGeo];
      for (const stop of inputStops) {
        const address = typeof stop === 'string' ? stop : (stop.address || stop.location || '');
        const point = await geocodeAddress(String(address).trim());
        if (!point) return res.status(400).json({ error: 'A stop address could not be verified.' });
        points.push(point);
        verifiedStops.push({ address: point.formatted, lat: point.lat, lng: point.lng });
      }
      points.push(dropoffGeo);
      const estimate = points.slice(1).reduce((sum, point, index) =>
        sum + haversineMiles(points[index].lat, points[index].lng, point.lat, point.lng) * 1.25, 0);
      miles = Math.round(estimate * 100) / 100;
      durationMins = estimateDurationMins(miles);
    }
    const pricing = serviceType === 'hourly'
      ? calcHourlyPrice(vehicle, durationHours)
      : calcPointToPointPrice(vehicle, miles);
    const bookingNumber = generateBookingNumber();

    const { rows } = await pool.query(
      `INSERT INTO limo_bookings (
         booking_number, service_type, status, pickup_address, pickup_lat, pickup_lng,
         dropoff_address, dropoff_lat, dropoff_lng, stops, pickup_date, pickup_time, duration_hours,
         distance_miles, duration_mins, vehicle_id, passengers, luggage, child_seats,
         passenger_first_name, passenger_last_name, passenger_email, passenger_phone, trip_notes,
         base_price, tolls, gratuity, total_price, source, referral_base_id, flight_number, is_manual
       ) VALUES (
         $1,$2,'pending_operator',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
       ) RETURNING id, booking_number, status, pickup_date, pickup_time, total_price, payment_status`,
      [bookingNumber, serviceType, pickupGeo.formatted, pickupGeo.lat, pickupGeo.lng,
       dropoffGeo?.formatted || '', dropoffGeo?.lat || null, dropoffGeo?.lng || null, JSON.stringify(verifiedStops),
       pickupDate, String(b.pickupTime || '').slice(0, 20), durationHours, miles, durationMins, vehicle.id,
       passengers, Number.parseInt(b.luggage || 1, 10), Number.parseInt(b.childSeats || 0, 10),
       firstName, lastName, email, phone, String(b.tripNotes || '').slice(0, 1000),
       pricing.subtotal, pricing.tolls, pricing.gratuity, pricing.total,
       String(b.source || 'web').slice(0, 40), referralBaseId, String(b.flightNumber || '').slice(0, 30) || null, false]
    );
    await pool.query(
      'INSERT INTO limo_booking_status_history (booking_id, status, note) VALUES ($1,$2,$3)',
      [rows[0].id, 'pending_operator', 'Booking request received; a verified operator must accept before payment.']
    );
    const dispatch = await require('./nyclimo-partners').dispatchBooking(rows[0].id);
    const current = await pool.query('SELECT id, booking_number, status, pickup_date, pickup_time, total_price, payment_status FROM limo_bookings WHERE id = $1', [rows[0].id]);
    res.status(201).json({ booking: current.rows[0] || rows[0], dispatch: { accepted: dispatch.ok, pending: !dispatch.ok } });
  } catch (err) {
    console.error('[LIMO BOOKING CREATE ERROR]:', err.message);
    res.status(500).json({ error: 'Could not create this booking request.' });
  }
});

router.post('/bookings/:id/checkout', async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured.' });
    const { rows } = await pool.query('SELECT * FROM limo_bookings WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const booking = rows[0];
    if (booking.status !== 'operator_accepted') {
      return res.status(409).json({ error: 'A licensed operator must accept this ride before payment is enabled.' });
    }
    if (booking.payment_status === 'paid') return res.status(409).json({ error: 'This ride is already paid.' });
    if (booking.stripe_session_id) {
      const prior = await stripe.checkout.sessions.retrieve(booking.stripe_session_id).catch(() => null);
      if (prior?.status === 'open' && prior.url) return res.json({ url: prior.url });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: booking.passenger_email || undefined,
      line_items: [{ price_data: {
        currency: 'usd',
        product_data: { name: `NYC Limo Wish — ${booking.booking_number}`, description: booking.pickup_address },
        unit_amount: Math.round(Number(booking.total_price) * 100)
      }, quantity: 1 }],
      metadata: { type: 'limo_booking', booking_id: String(booking.id), booking_number: booking.booking_number },
      success_url: `${APP_URL}/book/success?booking=${encodeURIComponent(booking.booking_number)}`,
      cancel_url: `${APP_URL}/book?canceled=1`
    }, { idempotencyKey: `limo-booking-${booking.id}` });
    await pool.query('UPDATE limo_bookings SET stripe_session_id = $1, updated_at = now() WHERE id = $2', [session.id, booking.id]);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[LIMO CHECKOUT ERROR]:', err.message);
    res.status(500).json({ error: 'Could not start payment for this booking.' });
  }
});

router.get('/track/:number', async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT b.booking_number, b.status, b.service_type, b.pickup_address, b.dropoff_address,
              b.pickup_date, b.pickup_time, b.total_price, b.payment_status, v.name AS vehicle_name,
              p.display_name AS operator_name
       FROM limo_bookings b
       LEFT JOIN limo_vehicles v ON v.id = b.vehicle_id
       LEFT JOIN limo_partner_bases p ON p.id = b.operator_base_id
       WHERE b.booking_number = $1`,
      [req.params.number]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const { rows: history } = await pool.query(
      'SELECT status, note, created_at FROM limo_booking_status_history WHERE booking_id = (SELECT id FROM limo_bookings WHERE booking_number = $1) ORDER BY created_at',
      [req.params.number]
    );
    res.json({ booking: rows[0], history });
  } catch (err) { res.status(500).json({ error: 'Could not load this ride status.' }); }
});

router.post('/corporate-lead', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, message } = req.body || {};
    await sendEmail({
      to: process.env.OPS_EMAIL || 'info@nyclimowish.com',
      subject: `Corporate Lead — ${firstName} ${lastName}`,
      html: `<p><strong>${firstName} ${lastName}</strong><br>${email}<br>${phone || ''}</p><p>${message || ''}</p>`
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/erp/bookings', requireAuth, requireRole('dispatcher', 'admin'), async (req, res) => {
  try {
    const { status, q } = req.query;
    let sql = `SELECT b.*, v.name AS vehicle_name, u.name AS driver_name FROM limo_bookings b
               LEFT JOIN limo_vehicles v ON v.id = b.vehicle_id LEFT JOIN limo_users u ON u.id = b.assigned_driver_id WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); sql += ` AND b.status = $${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (b.booking_number ILIKE $${params.length} OR b.passenger_phone ILIKE $${params.length})`; }
    sql += ' ORDER BY b.pickup_date DESC LIMIT 200';
    res.json({ bookings: (await pool.query(sql, params)).rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/erp/bookings/:id', requireAuth, requireRole('dispatcher', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT b.*, v.name AS vehicle_name FROM limo_bookings b LEFT JOIN limo_vehicles v ON v.id = b.vehicle_id WHERE b.id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    const { rows: history } = await pool.query('SELECT * FROM limo_booking_status_history WHERE booking_id = $1 ORDER BY created_at', [req.params.id]);
    res.json({ booking: rows[0], history });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/erp/bookings', requireAuth, requireRole('dispatcher', 'admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const vehicle = (await getVehicles()).find((v) => v.id === b.vehicleId) || (await getVehicles())[0];
    const pricing = (b.serviceType === 'hourly') ? calcHourlyPrice(vehicle, b.durationHours || 3) : calcPointToPointPrice(vehicle, parseFloat(b.distanceMiles) || 0);
    const bookingNumber = generateBookingNumber();
    const { rows } = await pool.query(
      `INSERT INTO limo_bookings (booking_number, service_type, status, pickup_address, dropoff_address, pickup_date, pickup_time,
        vehicle_id, passenger_first_name, passenger_last_name, passenger_email, passenger_phone, trip_notes,
        base_price, tolls, gratuity, total_price, payment_status, source, dispatcher_id, is_manual, internal_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'phone',$19,TRUE,$20) RETURNING *`,
      [bookingNumber, b.serviceType || 'point_to_point', b.status || 'confirmed', b.pickup, b.dropoff, b.pickupDate, b.pickupTime,
        vehicle.id, b.firstName, b.lastName, b.email || '', b.phone, b.tripNotes || '',
        pricing.subtotal, pricing.tolls, pricing.gratuity, b.totalPrice || pricing.total, b.paymentStatus || 'pending',
        req.user.id, b.internalNotes || '']
    );
    await pool.query('INSERT INTO limo_booking_status_history (booking_id, status, note, changed_by) VALUES ($1,$2,$3,$4)',
      [rows[0].id, rows[0].status, 'Phone booking', req.user.id]);
    res.json({ booking: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/erp/bookings/:id', requireAuth, requireRole('dispatcher', 'admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const fields = [], params = [req.params.id];
    for (const key of ['status', 'assigned_driver_id', 'payment_status', 'internal_notes', 'vehicle_id']) {
      if (b[key] !== undefined) { params.push(b[key]); fields.push(`${key} = $${params.length}`); }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });
    fields.push('updated_at = now()');
    const { rows } = await pool.query(`UPDATE limo_bookings SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, params);
    if (b.status) await pool.query('INSERT INTO limo_booking_status_history (booking_id, status, changed_by) VALUES ($1,$2,$3)', [req.params.id, b.status, req.user.id]);
    res.json({ booking: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/erp/stats', requireAuth, requireRole('dispatcher', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE pickup_date = CURRENT_DATE) AS today,
      COUNT(*) FILTER (WHERE status IN ('pending','confirmed','dispatched')) AS active,
      COUNT(*) FILTER (WHERE status = 'completed' AND pickup_date >= date_trunc('month', CURRENT_DATE)) AS month_completed,
      COALESCE(SUM(total_price) FILTER (WHERE payment_status = 'paid' AND pickup_date >= date_trunc('month', CURRENT_DATE)), 0) AS month_revenue
      FROM limo_bookings`);
    res.json({ stats: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/driver/trips', requireAuth, requireRole('driver', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, v.name AS vehicle_name FROM limo_bookings b LEFT JOIN limo_vehicles v ON v.id = b.vehicle_id
       WHERE b.assigned_driver_id = $1 AND b.status IN ('confirmed','dispatched','en_route','at_pickup','in_progress')
       ORDER BY b.pickup_date, b.pickup_time`, [req.user.id]);
    res.json({ trips: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/driver/trips/:id/status', requireAuth, requireRole('driver', 'admin'), async (req, res) => {
  try {
    const { status, lat, lng } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE limo_bookings SET status = $1, updated_at = now() WHERE id = $2 AND assigned_driver_id = $3 RETURNING *',
      [status, req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Trip not found.' });
    await pool.query('INSERT INTO limo_booking_status_history (booking_id, status, changed_by) VALUES ($1,$2,$3)', [req.params.id, status, req.user.id]);
    if (lat && lng) {
      await pool.query(`INSERT INTO limo_drivers (user_id, current_lat, current_lng, last_ping_at) VALUES ($1,$2,$3,now())
        ON CONFLICT (user_id) DO UPDATE SET current_lat=$2, current_lng=$3, last_ping_at=now()`, [req.user.id, lat, lng]);
    }
    res.json({ trip: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/passenger/bookings', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.booking_number, b.status, b.pickup_address, b.dropoff_address, b.pickup_date, b.pickup_time, b.total_price, v.name AS vehicle_name
       FROM limo_bookings b LEFT JOIN limo_vehicles v ON v.id = b.vehicle_id
       WHERE b.passenger_email = $1 OR b.customer_id = $2 ORDER BY b.pickup_date DESC LIMIT 50`, [req.user.email, req.user.id]);
    res.json({ bookings: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function handleStripeWebhook(event) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return;
  const session = event.data.object;
  if (session.metadata?.type !== 'limo_booking' || session.payment_status !== 'paid' || !session.id) return;
  const bookingId = session.metadata.booking_id;
  if (!bookingId) return;
  const updated = await pool.query(`UPDATE limo_bookings SET payment_status = 'paid', status = 'confirmed', stripe_payment_intent = $1, updated_at = now()
    WHERE id = $2 AND stripe_session_id = $3 AND status = 'operator_accepted' AND payment_status <> 'paid' RETURNING id`,
    [session.payment_intent || null, bookingId, session.id]);
  if (!updated.rows.length) return;
  await pool.query('INSERT INTO limo_booking_status_history (booking_id, status, note) VALUES ($1,$2,$3)', [bookingId, 'confirmed', 'Payment received after licensed operator acceptance']);
  const { rows } = await pool.query('SELECT * FROM limo_bookings WHERE id = $1', [bookingId]);
  if (rows[0]?.passenger_email) {
    await sendEmail({
      to: rows[0].passenger_email,
      subject: `Ride confirmed — ${rows[0].booking_number}`,
      html: `<p>Your payment is complete and your ride is confirmed with a licensed operator.</p><p>${rows[0].pickup_address}<br>${rows[0].pickup_date} ${rows[0].pickup_time}</p><p>Reference: ${rows[0].booking_number}</p>`
    }).catch((err) => console.warn('[LIMO CONFIRMATION EMAIL]:', err.message));
  }
}

module.exports = router;
module.exports.handleStripeWebhook = handleStripeWebhook;
