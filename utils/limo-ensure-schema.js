const pool = require('../db');

let ran = false;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS limo_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS limo_vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  models TEXT,
  passengers INTEGER NOT NULL DEFAULT 3,
  luggage INTEGER NOT NULL DEFAULT 3,
  base_fare NUMERIC(10,2) NOT NULL DEFAULT 85,
  per_mile NUMERIC(8,2) NOT NULL DEFAULT 3.20,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 75,
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  min_fare NUMERIC(10,2) NOT NULL DEFAULT 95,
  badge TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS limo_bookings (
  id SERIAL PRIMARY KEY,
  booking_number TEXT UNIQUE NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'point_to_point',
  status TEXT NOT NULL DEFAULT 'pending',
  pickup_address TEXT NOT NULL,
  pickup_lat NUMERIC(10,7),
  pickup_lng NUMERIC(10,7),
  dropoff_address TEXT,
  dropoff_lat NUMERIC(10,7),
  dropoff_lng NUMERIC(10,7),
  stops JSONB DEFAULT '[]',
  pickup_date DATE NOT NULL,
  pickup_time TEXT NOT NULL,
  duration_hours NUMERIC(4,1),
  distance_miles NUMERIC(8,2) DEFAULT 0,
  duration_mins INTEGER DEFAULT 0,
  vehicle_id TEXT REFERENCES limo_vehicles(id),
  passengers INTEGER DEFAULT 1,
  luggage INTEGER DEFAULT 1,
  child_seats INTEGER DEFAULT 0,
  passenger_first_name TEXT,
  passenger_last_name TEXT,
  passenger_email TEXT,
  passenger_phone TEXT,
  trip_notes TEXT,
  base_price NUMERIC(10,2) DEFAULT 0,
  tolls NUMERIC(10,2) DEFAULT 0,
  gratuity NUMERIC(10,2) DEFAULT 0,
  total_price NUMERIC(10,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid',
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  source TEXT DEFAULT 'web',
  assigned_driver_id INTEGER REFERENCES limo_users(id) ON DELETE SET NULL,
  dispatcher_id INTEGER REFERENCES limo_users(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES limo_users(id) ON DELETE SET NULL,
  flight_number TEXT,
  is_manual BOOLEAN DEFAULT FALSE,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS limo_booking_status_history (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES limo_bookings(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  changed_by INTEGER REFERENCES limo_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS limo_drivers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES limo_users(id) ON DELETE CASCADE,
  license_number TEXT,
  vehicle_assigned TEXT,
  status TEXT DEFAULT 'available',
  current_lat NUMERIC(10,7),
  current_lng NUMERIC(10,7),
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_limo_bookings_status ON limo_bookings(status);
CREATE INDEX IF NOT EXISTS idx_limo_bookings_date ON limo_bookings(pickup_date);
CREATE INDEX IF NOT EXISTS idx_limo_bookings_number ON limo_bookings(booking_number);

-- NYC Limo Wish asset-light base-partner marketplace.
-- Approval and license checks are performed manually by an authorized admin.
CREATE TABLE IF NOT EXISTS limo_partner_bases (
  id SERIAL PRIMARY KEY,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  base_type TEXT NOT NULL CHECK (base_type IN ('black_car', 'luxury_limo')),
  tlc_base_license_number TEXT NOT NULL UNIQUE,
  tlc_base_license_expires_at DATE,
  insurance_expires_at DATE,
  service_areas TEXT[] NOT NULL DEFAULT '{}',
  vehicle_classes TEXT[] NOT NULL DEFAULT '{}',
  max_passengers INTEGER NOT NULL DEFAULT 0 CHECK (max_passengers >= 0),
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  platform_commission_rate NUMERIC(5,4),
  referral_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'suspended', 'rejected')),
  verification_reference TEXT,
  verified_at TIMESTAMPTZ,
  verified_by INTEGER REFERENCES limo_users(id) ON DELETE SET NULL,
  availability_status TEXT NOT NULL DEFAULT 'unavailable' CHECK (availability_status IN ('available', 'unavailable')),
  availability_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS limo_partner_offers (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES limo_bookings(id) ON DELETE CASCADE,
  partner_base_id INTEGER NOT NULL REFERENCES limo_partner_bases(id) ON DELETE CASCADE,
  offer_round INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'declined', 'expired', 'cancelled')),
  platform_commission_rate NUMERIC(5,4) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  responded_by INTEGER REFERENCES limo_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, partner_base_id, offer_round)
);

CREATE TABLE IF NOT EXISTS limo_commission_ledger (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES limo_bookings(id) ON DELETE CASCADE,
  operator_base_id INTEGER NOT NULL REFERENCES limo_partner_bases(id),
  gross_fare NUMERIC(10,2) NOT NULL,
  platform_commission_rate NUMERIC(5,4) NOT NULL,
  platform_commission_amount NUMERIC(10,2) NOT NULL,
  referral_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL,
  referral_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  referral_commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  operator_payout_amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'earned' CHECK (status IN ('earned', 'paid', 'void')),
  payout_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

ALTER TABLE limo_users ADD COLUMN IF NOT EXISTS partner_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS operator_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS referral_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS accepted_offer_id INTEGER REFERENCES limo_partner_offers(id) ON DELETE SET NULL;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS partner_offer_round INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_limo_partner_offers_queue ON limo_partner_offers(partner_base_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_limo_partner_bases_eligibility ON limo_partner_bases(approval_status, availability_status);
`;

const DEFAULT_VEHICLES = [
  ['business_sedan', 'Business Sedan', 'Cadillac XTS, Lyriq or similar', 3, 3, 85, 3.20, 75, 1.0, 95, 'best_value', 1],
  ['premium_sedan', 'Premium Sedan', 'Mercedes S-Class, BMW 7 Series', 3, 3, 120, 4.50, 110, 1.2, 120, 'top_rated', 2],
  ['elitex_suv', 'EliteX SUV', 'Cadillac Escalade ESV or similar', 6, 6, 110, 3.80, 95, 1.1, 110, null, 3],
  ['luxury_suv', 'Luxury SUV', 'Chevrolet Suburban or similar', 6, 6, 105, 3.60, 90, 1.0, 105, 'popular', 4],
  ['business_sprinter', 'Business Sprinter', 'Mercedes Sprinter Executive', 14, 14, 180, 5.50, 150, 1.3, 180, null, 5],
  ['stretch_limo', 'Stretch Limousine', 'Lincoln MKT Stretch or similar', 10, 8, 200, 6.00, 175, 1.4, 200, null, 6],
  ['standard_van', 'Standard Van', 'Ford Transit or similar', 12, 12, 150, 4.80, 130, 1.15, 150, null, 7],
  ['party_bus', 'Party Bus 20P', 'Luxury party bus with lighting', 20, 20, 350, 8.00, 300, 1.6, 350, null, 8]
];

async function ensureSchema() {
  if (ran) return;
  ran = true;

  for (const stmt of SCHEMA_SQL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    try { await pool.query(stmt); } catch (err) { console.warn('[SCHEMA]', err.message); }
  }

  for (const v of DEFAULT_VEHICLES) {
    try {
      await pool.query(
        `INSERT INTO limo_vehicles (id, name, models, passengers, luggage, base_fare, per_mile, hourly_rate, multiplier, min_fare, badge, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`, v
      );
    } catch (err) { console.warn('[VEHICLES]', err.message); }
  }

  // Never create a publicly guessable administrator account during app startup.
  // Provision the first admin through a controlled database operation.
  if (!process.env.NYCLIMO_ADMIN_EMAIL || !process.env.NYCLIMO_ADMIN_PASSWORD) {
    console.warn('[SEED] Skipping NYC Limo admin creation: NYCLIMO_ADMIN_EMAIL and NYCLIMO_ADMIN_PASSWORD are required.');
  } else {
    try {
      const bcrypt = require('bcryptjs');
      const check = await pool.query("SELECT id FROM limo_users WHERE role = 'admin' LIMIT 1");
      if (!check.rows.length) {
        const hash = await bcrypt.hash(process.env.NYCLIMO_ADMIN_PASSWORD, 12);
        await pool.query(
          `INSERT INTO limo_users (name, email, password_hash, role)
           VALUES ('NYC Limo Admin', $1, $2, 'admin')
           ON CONFLICT (email) DO NOTHING`, [process.env.NYCLIMO_ADMIN_EMAIL.toLowerCase(), hash]
        );
      }
    } catch (err) { console.warn('[SEED]', err.message); }
  }
}

module.exports = { ensureSchema };
