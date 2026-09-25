const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ensureSchema } = require('../utils/limo-ensure-schema');

const router = express.Router();
async function dispatchBooking(bookingId, actorId = null) {
  const client = await pool.connect();
  try {
    await ensureSchema();
    await client.query('BEGIN');
    const bookingResult = await client.query('SELECT * FROM limo_bookings WHERE id = $1 FOR UPDATE', [bookingId]);
    const booking = bookingResult.rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Booking not found.' };
    }
    if (!['pending_operator', 'offering'].includes(booking.status) || booking.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return { ok: false, status: 409, error: 'Only unpaid bookings awaiting an operator can be dispatched.' };
    }

    await client.query(
      `UPDATE limo_partner_offers SET status = 'expired'
       WHERE booking_id = $1 AND status = 'offered' AND expires_at <= now()`,
      [booking.id]
    );
    const zones = pickupZones(booking);
    const { rows: partners } = await client.query(
      `SELECT id, display_name, contact_email, platform_commission_rate
       FROM limo_partner_bases
       WHERE approval_status = 'approved'
         AND availability_status = 'available'
         AND availability_updated_at >= now() - interval '10 minutes'
         AND tlc_base_license_expires_at >= $1
         AND insurance_expires_at >= $1
         AND max_passengers >= $2
         AND service_areas && $3::text[]
         AND vehicle_classes @> ARRAY[$4]::text[]
         AND platform_commission_rate IS NOT NULL
         AND platform_commission_rate + referral_commission_rate <= 1
         AND NOT EXISTS (
           SELECT 1 FROM limo_partner_offers prior
           WHERE prior.booking_id = $5 AND prior.partner_base_id = limo_partner_bases.id
             AND (prior.status IN ('declined', 'accepted')
               OR (prior.status = 'offered' AND prior.expires_at > now()))
         )
       ORDER BY id
       LIMIT 20`,
      [booking.pickup_date, booking.passengers || 1, zones, booking.vehicle_id, booking.id]
    );
    if (!partners.length) {
      await client.query(
        `UPDATE limo_bookings SET status = 'pending_operator', updated_at = now() WHERE id = $1`,
        [booking.id]
      );
      await writeStatus(client, booking.id, 'pending_operator', 'No currently available verified operator matched this request.', actorId);
      await client.query('COMMIT');
      return { ok: false, status: 409, no_match: true, error: 'No verified available operator matches this trip yet.' };
    }

    const offerRound = Number(booking.partner_offer_round || 0) + 1;
    const created = [];
    for (const partner of partners) {
      const result = await client.query(
        `INSERT INTO limo_partner_offers (booking_id, partner_base_id, offer_round, status, platform_commission_rate, expires_at)
         VALUES ($1,$2,$3,'offered',$4,now() + interval '10 minutes')
         ON CONFLICT (booking_id, partner_base_id, offer_round) DO NOTHING
         RETURNING id, partner_base_id, expires_at`,
        [booking.id, partner.id, offerRound, partner.platform_commission_rate]
      );
      if (result.rows[0]) created.push({ ...result.rows[0], display_name: partner.display_name, contact_email: partner.contact_email });
    }
    await client.query(
      `UPDATE limo_bookings SET status = 'offering', partner_offer_round = $1, updated_at = now() WHERE id = $2`,
      [offerRound, booking.id]
    );
    await writeStatus(client, booking.id, 'offering', `Partner offers sent to ${created.length} verified base(s).`, actorId);
    await client.query('COMMIT');

    for (const partner of created) {
      if (!partner.contact_email) continue;
      require('../utils/mailer').sendEmail({
        to: partner.contact_email,
        subject: `New NYC Limo Wish operator offer`,
        html: `<p>A new ride request matches your approved base profile.</p><p>Open the NYC Limo Wish partner portal to review the trip and accept or decline it. The offer expires in 10 minutes.</p><p>Operator offer #${partner.id}</p>`
      }).catch((err) => console.warn('[LIMO PARTNER OFFER EMAIL]:', err.message));
    }
    return { ok: true, booking_number: booking.booking_number, offer_round: offerRound, offers: created.map(({ contact_email, ...offer }) => offer) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[LIMO PARTNER DISPATCH ERROR]:', err.message);
    return { ok: false, status: 500, error: 'Could not dispatch this booking.' };
  } finally {
    client.release();
  }
}
const adminGate = [requireAuth, requireRole('admin')];
const dispatchGate = [requireAuth, requireRole('admin', 'dispatcher')];
const partnerGate = [requireAuth, requireRole('partner_dispatcher')];

function cleanList(value, limit = 40) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean))].slice(0, limit);
}

function validRate(value, max = 1) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= max ? rate : null;
}

function pickupZones(booking) {
  const address = String(booking.pickup_address || '').toUpperCase();
  const zip = address.match(/\b\d{5}\b/)?.[0];
  const zones = new Set(['NYC']);
  if (zip) zones.add(zip);
  for (const [term, code] of [['JFK', 'JFK'], ['LAGUARDIA', 'LGA'], ['LGA', 'LGA'], ['NEWARK', 'EWR'], ['EWR', 'EWR'], ['TETERBORO', 'TEB'], ['TEB', 'TEB']]) {
    if (address.includes(term)) zones.add(code);
  }
  return [...zones];
}

async function writeStatus(client, bookingId, status, note, userId) {
  await client.query(
    'INSERT INTO limo_booking_status_history (booking_id, status, note, changed_by) VALUES ($1,$2,$3,$4)',
    [bookingId, status, note, userId || null]
  );
}

async function createCommissionLedger(client, bookingId) {
  const { rows } = await client.query(
    `INSERT INTO limo_commission_ledger (
       booking_id, operator_base_id, gross_fare, platform_commission_rate, platform_commission_amount,
       tolls, gratuity, referral_base_id, referral_commission_rate, referral_commission_amount,
       operator_payout_amount
     )
     SELECT b.id, o.partner_base_id, b.base_price, o.platform_commission_rate,
            ROUND(b.base_price * o.platform_commission_rate, 2),
            COALESCE(b.tolls, 0), COALESCE(b.gratuity, 0), b.referral_base_id,
            COALESCE(r.referral_commission_rate, 0),
            ROUND(b.base_price * COALESCE(r.referral_commission_rate, 0), 2),
            ROUND(COALESCE(b.base_price, 0) + COALESCE(b.tolls, 0) + COALESCE(b.gratuity, 0)
              - (b.base_price * o.platform_commission_rate)
              - (b.base_price * COALESCE(r.referral_commission_rate, 0)), 2)
     FROM limo_bookings b
     JOIN limo_partner_offers o ON o.id = b.accepted_offer_id AND o.status = 'accepted'
     LEFT JOIN limo_partner_bases r ON r.id = b.referral_base_id
     WHERE b.id = $1 AND b.status = 'completed' AND b.payment_status = 'paid'
     ON CONFLICT (booking_id) DO NOTHING
     RETURNING *`,
    [bookingId]
  );
  return rows[0] || null;
}

// Base onboarding begins pending. A human admin must verify the TLC license and insurance
// against current records before the base can receive offers.
router.get('/erp/partner-bases', ...dispatchGate, async (_req, res) => {
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, legal_name, display_name, base_type, tlc_base_license_number,
              tlc_base_license_expires_at, insurance_expires_at, service_areas,
              vehicle_classes, max_passengers, contact_email, contact_phone,
              platform_commission_rate, referral_commission_rate, referral_code,
              approval_status, verification_reference, verified_at, availability_status,
              availability_updated_at, created_at, updated_at
       FROM limo_partner_bases ORDER BY created_at DESC LIMIT 250`
    );
    res.json({ ok: true, partners: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load operator partners.' });
  }
});

router.post('/erp/partner-bases', ...adminGate, async (req, res) => {
  const body = req.body || {};
  const baseType = String(body.base_type || '');
  const legalName = String(body.legal_name || '').trim().slice(0, 180);
  const displayName = String(body.display_name || legalName).trim().slice(0, 120);
  const license = String(body.tlc_base_license_number || '').trim().toUpperCase();
  const email = String(body.contact_email || '').trim().toLowerCase();
  const platformRate = validRate(body.platform_commission_rate, 0.5);
  const referralRate = validRate(body.referral_commission_rate ?? 0, 0.25);
  const serviceAreas = cleanList(body.service_areas);
  const vehicleClasses = cleanList(body.vehicle_classes);
  const maxPassengers = Number.parseInt(body.max_passengers, 10);
  if (!legalName || !displayName || !license || !/^\S+@\S+\.\S+$/.test(email) ||
      !['black_car', 'luxury_limo'].includes(baseType) || platformRate === null ||
      referralRate === null || platformRate + referralRate > 1 ||
      !Number.isInteger(maxPassengers) || maxPassengers < 1 || maxPassengers > 60 ||
      !serviceAreas.length || !vehicleClasses.length) {
    return res.status(400).json({ error: 'Provide valid base details, TLC license, service areas, vehicle classes, capacity, and commission rates.' });
  }
  try {
    await ensureSchema();
    const referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const { rows } = await pool.query(
      `INSERT INTO limo_partner_bases (
         legal_name, display_name, base_type, tlc_base_license_number,
         tlc_base_license_expires_at, insurance_expires_at, service_areas,
         vehicle_classes, max_passengers, contact_email, contact_phone,
         platform_commission_rate, referral_commission_rate, referral_code
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, legal_name, display_name, base_type, tlc_base_license_number,
         service_areas, vehicle_classes, max_passengers, approval_status, referral_code`,
      [legalName, displayName, baseType, license, body.tlc_base_license_expires_at || null,
       body.insurance_expires_at || null, serviceAreas, vehicleClasses, maxPassengers,
       email, String(body.contact_phone || '').trim().slice(0, 40) || null,
       platformRate, referralRate, referralCode]
    );
    res.status(201).json({ ok: true, partner: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That TLC base license is already registered.' });
    res.status(500).json({ error: 'Could not save operator partner.' });
  }
});

router.patch('/erp/partner-bases/:id/verification', ...adminGate, async (req, res) => {
  const body = req.body || {};
  const approvalStatus = String(body.approval_status || '');
  const reference = String(body.verification_reference || '').trim().slice(0, 500);
  if (!['approved', 'suspended', 'rejected', 'pending'].includes(approvalStatus)) {
    return res.status(400).json({ error: 'Invalid approval status.' });
  }
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `UPDATE limo_partner_bases
       SET approval_status = $1,
           verification_reference = NULLIF($2, ''),
           verified_at = CASE WHEN $1 = 'approved' THEN now() ELSE NULL END,
           verified_by = CASE WHEN $1 = 'approved' THEN $3 ELSE NULL END,
           updated_at = now()
       WHERE id = $4
         AND ($1 <> 'approved' OR (
           NULLIF($2, '') IS NOT NULL
           AND tlc_base_license_expires_at >= CURRENT_DATE
           AND insurance_expires_at >= CURRENT_DATE
           AND platform_commission_rate IS NOT NULL
         ))
       RETURNING id, approval_status, verification_reference, verified_at`,
      [approvalStatus, reference, req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(409).json({ error: 'Partner not found or current license, insurance, commission terms, and a verification reference are required.' });
    res.json({ ok: true, partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update verification status.' });
  }
});

router.post('/erp/partner-bases/:id/users', ...adminGate, async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: 'Provide a name, valid email, and a temporary password between 12 and 128 characters.' });
  }
  try {
    await ensureSchema();
    const partner = await pool.query(
      `SELECT id FROM limo_partner_bases WHERE id = $1 AND approval_status = 'approved'`,
      [req.params.id]
    );
    if (!partner.rows.length) return res.status(409).json({ error: 'Approve the operator base before creating its portal account.' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO limo_users (name, email, password_hash, role, partner_base_id)
       VALUES ($1,$2,$3,'partner_dispatcher',$4)
       RETURNING id, name, email, role, partner_base_id`,
      [name, email, hash, req.params.id]
    );
    res.status(201).json({ ok: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email already has an account.' });
    res.status(500).json({ error: 'Could not create operator portal account.' });
  }
});

router.patch('/partner/availability', ...partnerGate, async (req, res) => {
  const availability = String(req.body?.availability_status || '');
  if (!['available', 'unavailable'].includes(availability) || !req.user.partner_base_id) {
    return res.status(400).json({ error: 'A valid partner account and availability status are required.' });
  }
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `UPDATE limo_partner_bases SET availability_status = $1, availability_updated_at = now(), updated_at = now()
       WHERE id = $2 AND approval_status = 'approved'
       RETURNING id, availability_status, availability_updated_at`,
      [availability, req.user.partner_base_id]
    );
    if (!rows.length) return res.status(403).json({ error: 'This operator base is not approved.' });
    res.json({ ok: true, partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update availability.' });
  }
});

router.post('/erp/bookings/:id/offers', ...dispatchGate, async (req, res) => {
  const result = await dispatchBooking(req.params.id, req.user.id);
  if (!result.ok) return res.status(result.status || 500).json(result);
  res.json(result);
});

router.get('/partner/offers', ...partnerGate, async (req, res) => {
  if (!req.user.partner_base_id) return res.status(403).json({ error: 'Operator account is not linked to a base.' });
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.expires_at, o.created_at, b.booking_number, b.service_type,
              b.pickup_address, b.dropoff_address, b.pickup_date, b.pickup_time, b.vehicle_id,
              b.passengers, b.luggage, b.total_price, o.platform_commission_rate
       FROM limo_partner_offers o
       JOIN limo_bookings b ON b.id = o.booking_id
       WHERE o.partner_base_id = $1 AND o.status = 'offered' AND o.expires_at > now()
       ORDER BY o.expires_at ASC LIMIT 100`,
      [req.user.partner_base_id]
    );
    res.json({ ok: true, offers: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load operator offers.' });
  }
});

router.post('/partner/offers/:id/respond', ...partnerGate, async (req, res) => {
  const decision = String(req.body?.decision || '');
  if (!['accept', 'decline'].includes(decision) || !req.user.partner_base_id) {
    return res.status(400).json({ error: 'Choose accept or decline from a linked operator account.' });
  }
  const client = await pool.connect();
  try {
    await ensureSchema();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT o.*, b.booking_number, b.status AS booking_status
       FROM limo_partner_offers o JOIN limo_bookings b ON b.id = o.booking_id
       WHERE o.id = $1 AND o.partner_base_id = $2
       FOR UPDATE OF o, b`,
      [req.params.id, req.user.partner_base_id]
    );
    const offer = rows[0];
    if (!offer || offer.status !== 'offered' || new Date(offer.expires_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This operator offer is no longer available.' });
    }
    if (decision === 'decline') {
      await client.query(
        `UPDATE limo_partner_offers SET status = 'declined', responded_at = now(), responded_by = $1 WHERE id = $2`,
        [req.user.id, offer.id]
      );
      await writeStatus(client, offer.booking_id, 'pending_operator', 'A partner base declined the trip offer.', req.user.id);
      await client.query(
        `UPDATE limo_bookings SET status = 'pending_operator', updated_at = now()
         WHERE id = $1 AND status = 'offering'`,
        [offer.booking_id]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, status: 'declined' });
    }
    if (!['offering', 'pending_operator'].includes(offer.booking_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Another operator has already accepted this trip.' });
    }
    const update = await client.query(
      `UPDATE limo_bookings
       SET operator_base_id = $1, accepted_offer_id = $2, status = 'operator_accepted', updated_at = now()
       WHERE id = $3 AND payment_status <> 'paid'
         AND status IN ('offering', 'pending_operator')
       RETURNING id, booking_number, passenger_email, passenger_first_name, pickup_address, pickup_date, pickup_time`,
      [req.user.partner_base_id, offer.id, offer.booking_id]
    );
    if (!update.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Another operator has already accepted this trip.' });
    }
    await client.query(
      `UPDATE limo_partner_offers SET status = CASE WHEN id = $1 THEN 'accepted' ELSE 'expired' END,
         responded_at = CASE WHEN id = $1 THEN now() ELSE responded_at END,
         responded_by = CASE WHEN id = $1 THEN $2 ELSE responded_by END
       WHERE booking_id = $3 AND status = 'offered'`,
      [offer.id, req.user.id, offer.booking_id]
    );
    await client.query("UPDATE limo_partner_bases SET availability_status = 'unavailable', availability_updated_at = now(), updated_at = now() WHERE id = $1", [req.user.partner_base_id]);
    await writeStatus(client, offer.booking_id, 'operator_accepted', 'A verified TLC-licensed partner base accepted the request. Payment is now available.', req.user.id);
    await client.query('COMMIT');

    const booking = update.rows[0];
    if (booking.passenger_email) {
      await require('../utils/mailer').sendEmail({
        to: booking.passenger_email,
        subject: `A licensed operator accepted — ${booking.booking_number}`,
        html: `<p>Your ride request was accepted by a licensed operator base.</p><p>${booking.pickup_address}<br>${booking.pickup_date} ${booking.pickup_time}</p><p>Continue to secure payment on the booking page to confirm your trip.</p>`
      }).catch((err) => console.warn('[LIMO OPERATOR ACCEPTANCE EMAIL]:', err.message));
    }
    res.json({ ok: true, status: 'operator_accepted', booking_number: booking.booking_number });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Could not respond to the operator offer.' });
  } finally {
    client.release();
  }
});

const nextPartnerStatus = {
  confirmed: ['dispatched'],
  dispatched: ['en_route'],
  en_route: ['at_pickup'],
  at_pickup: ['in_progress'],
  in_progress: ['completed']
};

router.get('/partner/bookings', ...partnerGate, async (req, res) => {
  if (!req.user.partner_base_id) return res.status(403).json({ error: 'Operator account is not linked to a base.' });
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, booking_number, status, service_type, pickup_address, dropoff_address, pickup_date, pickup_time,
              duration_hours, vehicle_id, passengers, luggage, passenger_first_name, passenger_last_name,
              passenger_email, passenger_phone, trip_notes, total_price
       FROM limo_bookings
       WHERE operator_base_id = $1 AND payment_status = 'paid' AND status NOT IN ('completed', 'cancelled')
       ORDER BY pickup_date, pickup_time LIMIT 100`,
      [req.user.partner_base_id]
    );
    res.json({ ok: true, bookings: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load assigned rides.' });
  }
});

router.post('/partner/bookings/:id/status', ...partnerGate, async (req, res) => {
  const status = String(req.body?.status || '');
  const client = await pool.connect();
  try {
    await ensureSchema();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, status, payment_status FROM limo_bookings
       WHERE id = $1 AND operator_base_id = $2 FOR UPDATE`,
      [req.params.id, req.user.partner_base_id]
    );
    const booking = rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Trip not found for this operator.' });
    }
    if (booking.payment_status !== 'paid' || !nextPartnerStatus[booking.status]?.includes(status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Trip status must follow the paid, accepted-trip lifecycle.' });
    }
    await client.query('UPDATE limo_bookings SET status = $1, updated_at = now() WHERE id = $2', [status, booking.id]);
    await writeStatus(client, booking.id, status, 'Status updated by the accepted operator base.', req.user.id);
    let commission = null;
    if (status === 'completed') commission = await createCommissionLedger(client, booking.id);
    await client.query('COMMIT');
    res.json({ ok: true, status, commission });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Could not update operator trip status.' });
  } finally {
    client.release();
  }
});

router.get('/erp/commissions', ...dispatchGate, async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT l.*, b.booking_number, p.display_name AS operator_name, r.display_name AS referral_name
       FROM limo_commission_ledger l
       JOIN limo_bookings b ON b.id = l.booking_id
       JOIN limo_partner_bases p ON p.id = l.operator_base_id
       LEFT JOIN limo_partner_bases r ON r.id = l.referral_base_id
       ORDER BY l.created_at DESC LIMIT 250`
    );
    res.json({ ok: true, commissions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load commission ledger.' });
  }
});

router.patch('/erp/commissions/:id/payout', ...adminGate, async (req, res) => {
  const reference = String(req.body?.payout_reference || '').trim().slice(0, 200);
  if (!reference) return res.status(400).json({ error: 'A payout reference is required to record settlement.' });
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `UPDATE limo_commission_ledger SET status = 'paid', payout_reference = $1, paid_at = now()
       WHERE id = $2 AND status = 'earned' RETURNING id, booking_id, operator_payout_amount, status, payout_reference, paid_at`,
      [reference, req.params.id]
    );
    if (!rows.length) return res.status(409).json({ error: 'Commission entry not found or already settled.' });
    res.json({ ok: true, commission: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not record commission payout.' });
  }
});

module.exports = router;
module.exports.dispatchBooking = dispatchBooking;
