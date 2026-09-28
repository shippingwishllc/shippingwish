const pool = require('../db');

/** Review logins for the NYC Limo Wish portals. Passwords are not stored here. */
const REVIEW_ACCOUNTS = [
  {
    email: 'customer.review@nyclimowish.com',
    name: 'Review Customer',
    role: 'customer',
    phone: '+1 917 555 0101',
    passwordHash: '$2a$12$Q1mUNe8Krnj5R4PtWKNkNur6vicKvuhWjMdYYWUJ..qqOk8rbGfRW'
  },
  {
    email: 'driver.review@nyclimowish.com',
    name: 'Review Driver',
    role: 'driver',
    phone: '+1 917 555 0102',
    passwordHash: '$2a$12$J1ezEqiE1YD/BAjFnv4i.ezvV.5kp9VLT4ksE9zYlzyDV/qzlzjNe'
  },
  {
    email: 'operator.review@nyclimowish.com',
    name: 'Review Operator',
    role: 'partner_dispatcher',
    phone: '+1 917 555 0103',
    passwordHash: '$2a$12$6xBiU42hVLPaf/Jq4EG4F.VmX0Zvf0GBNM5HNrmX1fr8HHnuiw63O'
  },
  {
    email: 'staff.review@nyclimowish.com',
    name: 'Review Staff',
    role: 'admin',
    phone: '+1 917 555 0104',
    passwordHash: '$2a$12$G169hslSH6jHjB6V8XcaAumPlT.nlDXk/RSkS5D8rJL2BQVWXyWBu'
  }
];

const REVIEW_BASE_LICENSE = 'REVIEW-NLW-0001';
const REVIEW_BOOKING = 'NLW-REVIEW-RIDE';

async function seedReviewAccounts() {
  for (const account of REVIEW_ACCOUNTS) {
    await pool.query(
      `INSERT INTO limo_users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING`,
      [account.name, account.email, account.passwordHash, account.role, account.phone]
    );
  }

  const base = await pool.query(
    `INSERT INTO limo_partner_bases (
       legal_name, display_name, base_type, tlc_base_license_number,
       tlc_base_license_expires_at, insurance_expires_at, service_areas, vehicle_classes,
       max_passengers, contact_email, contact_phone, platform_commission_rate,
       referral_commission_rate, referral_code, approval_status, verification_reference,
       verified_at, availability_status, availability_updated_at
     ) VALUES (
       'Review Black Car Base LLC', 'Review Base', 'black_car', $1,
       CURRENT_DATE + 365, CURRENT_DATE + 365, ARRAY['NYC','JFK']::text[], ARRAY['business_sedan','luxury_suv']::text[],
       6, 'operator.review@nyclimowish.com', '+1 917 555 0103', 0.2000,
       0, 'REVIEWBASE', 'approved', 'review-seed',
       now(), 'available', now()
     )
     ON CONFLICT (tlc_base_license_number) DO UPDATE SET
       tlc_base_license_expires_at = CURRENT_DATE + 365,
       insurance_expires_at = CURRENT_DATE + 365,
       approval_status = 'approved',
       updated_at = now()
     RETURNING id`,
    [REVIEW_BASE_LICENSE]
  );
  const baseId = base.rows[0].id;

  await pool.query(
    `UPDATE limo_users
     SET role = 'partner_dispatcher', partner_base_id = $1
     WHERE lower(email) = 'operator.review@nyclimowish.com'`,
    [baseId]
  );

  const users = await pool.query(
    `SELECT id, lower(email) AS email FROM limo_users
     WHERE lower(email) = ANY($1::text[])`,
    [REVIEW_ACCOUNTS.map((account) => account.email)]
  );
  const idFor = (email) => users.rows.find((row) => row.email === email)?.id;
  const customerId = idFor('customer.review@nyclimowish.com');
  const driverId = idFor('driver.review@nyclimowish.com');
  if (!customerId || !driverId) return;

  const booking = await pool.query(
    `INSERT INTO limo_bookings (
       booking_number, service_type, status, pickup_address, dropoff_address,
       pickup_date, pickup_time, vehicle_id, passengers, luggage,
       passenger_first_name, passenger_last_name, passenger_email, passenger_phone,
       base_price, tolls, gratuity, total_price, payment_status, source,
       customer_id, assigned_driver_id, trip_notes
     ) VALUES (
       $1, 'point_to_point', 'dispatched',
       'John F. Kennedy International Airport, Queens, NY',
       'Times Square, Manhattan, NY',
       CURRENT_DATE + 1, '12:00', 'business_sedan', 2, 2,
       'Review', 'Customer', 'customer.review@nyclimowish.com', '+1 917 555 0101',
       120, 10.53, 24, 154.53, 'unpaid', 'review',
       $2, $3, 'Sample ride so each portal has something to open.'
     )
     ON CONFLICT (booking_number) DO UPDATE SET
       assigned_driver_id = COALESCE(limo_bookings.assigned_driver_id, EXCLUDED.assigned_driver_id),
       customer_id = COALESCE(limo_bookings.customer_id, EXCLUDED.customer_id)
     RETURNING id`,
    [REVIEW_BOOKING, customerId, driverId]
  );
  const bookingId = booking.rows[0].id;

  await pool.query(
    `INSERT INTO limo_booking_status_history (booking_id, status, note)
     SELECT $1, 'dispatched', 'Review ride for portal checks.'
     WHERE NOT EXISTS (
       SELECT 1 FROM limo_booking_status_history WHERE booking_id = $1 AND note = 'Review ride for portal checks.'
     )`,
    [bookingId]
  );

  await pool.query(
    `INSERT INTO limo_partner_offers (
       booking_id, partner_base_id, offer_round, status, platform_commission_rate, expires_at
     ) VALUES ($1, $2, 1, 'offered', 0.2000, now() + interval '14 days')
     ON CONFLICT (booking_id, partner_base_id, offer_round) DO UPDATE SET
       expires_at = CASE
         WHEN limo_partner_offers.status = 'offered' AND limo_partner_offers.expires_at <= now()
         THEN now() + interval '14 days'
         ELSE limo_partner_offers.expires_at
       END`,
    [bookingId, baseId]
  );

  await pool.query(
    `INSERT INTO limo_drivers (user_id, license_number, vehicle_assigned, status)
     VALUES ($1, 'REVIEW-DRIVER', 'business_sedan', 'available')
     ON CONFLICT (user_id) DO NOTHING`,
    [driverId]
  );
}

module.exports = { REVIEW_ACCOUNTS, seedReviewAccounts };
