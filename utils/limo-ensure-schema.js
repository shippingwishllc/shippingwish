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
  tolls NUMERIC(10,2) NOT NULL DEFAULT 0,
  gratuity NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_commission_rate NUMERIC(5,4) NOT NULL,
  platform_commission_amount NUMERIC(10,2) NOT NULL,
  referral_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL,
  referral_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  referral_commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  operator_payout_amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'earned' CHECK (status IN ('earned', 'paid', 'void')),
  payout_reference TEXT,
  operator_payout_status TEXT NOT NULL DEFAULT 'earned' CHECK (operator_payout_status IN ('earned', 'paid')),
  operator_payout_reference TEXT,
  operator_paid_at TIMESTAMPTZ,
  referral_payout_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (referral_payout_status IN ('earned', 'paid', 'not_applicable')),
  referral_payout_reference TEXT,
  referral_paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

ALTER TABLE limo_users ADD COLUMN IF NOT EXISTS partner_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL;
ALTER TABLE limo_users ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE limo_users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE limo_users ADD COLUMN IF NOT EXISTS newsletter BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS operator_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS referral_base_id INTEGER REFERENCES limo_partner_bases(id) ON DELETE SET NULL;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS accepted_offer_id INTEGER REFERENCES limo_partner_offers(id) ON DELETE SET NULL;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS partner_offer_round INTEGER NOT NULL DEFAULT 0;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS meet_and_greet BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS airport_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS child_seat_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE limo_bookings ADD COLUMN IF NOT EXISTS meet_and_greet_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE limo_commission_ledger ADD COLUMN IF NOT EXISTS operator_payout_status TEXT NOT NULL DEFAULT 'earned';
ALTER TABLE limo_commission_ledger ADD COLUMN IF NOT EXISTS operator_payout_reference TEXT;
ALTER TABLE limo_commission_ledger ADD COLUMN IF NOT EXISTS operator_paid_at TIMESTAMPTZ;
ALTER TABLE limo_commission_ledger ADD COLUMN IF NOT EXISTS referral_payout_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE limo_commission_ledger ADD COLUMN IF NOT EXISTS referral_payout_reference TEXT;
ALTER TABLE limo_commission_ledger ADD COLUMN IF NOT EXISTS referral_paid_at TIMESTAMPTZ;
UPDATE limo_commission_ledger SET operator_payout_status = 'paid', operator_payout_reference = payout_reference, operator_paid_at = paid_at WHERE status = 'paid' AND operator_payout_status = 'earned';
UPDATE limo_commission_ledger SET referral_payout_status = 'earned' WHERE referral_base_id IS NOT NULL AND referral_payout_status = 'not_applicable' AND status <> 'void';
CREATE INDEX IF NOT EXISTS idx_limo_partner_offers_queue ON limo_partner_offers(partner_base_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_limo_partner_bases_eligibility ON limo_partner_bases(approval_status, availability_status);
CREATE TABLE IF NOT EXISTS limo_partner_applications (
  id SERIAL PRIMARY KEY,
  applicant_type VARCHAR(50) DEFAULT 'chauffeur',
  full_name VARCHAR(150),
  company_name VARCHAR(150),
  phone VARCHAR(50),
  email VARCHAR(255),
  vehicle_type VARCHAR(100),
  vehicle_name VARCHAR(100),
  vehicle_year VARCHAR(20),
  vehicle_color VARCHAR(50),
  dispatch_software TEXT,
  airports TEXT,
  license_number VARCHAR(100),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending_review',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

const DEFAULT_VEHICLES = [
  ['business_sedan', 'Business Sedan', 'Cadillac CT6, Lyriq or similar', 3, 3, 65.00, 2.80, 69.33, 1.0, 75.00, 'best_value', 1],
  ['elitex_suv', 'EliteX SUV', 'Cadillac XT6, Lincoln Aviator or similar', 4, 4, 75.00, 3.10, 74.67, 1.0, 85.00, 'popular', 2],
  ['luxury_suv', 'Luxury SUV', 'Chevrolet Suburban or similar', 6, 6, 85.00, 3.40, 83.20, 1.0, 95.00, 'best_value', 3],
  ['premium_suv', 'Premium SUV', 'Cadillac Escalade ESV, Lincoln Navigator or similar', 6, 6, 95.00, 3.80, 106.67, 1.0, 110.00, 'top_rated', 4],
  ['premium_sedan', 'Premium Sedan', 'Mercedes S-Class, BMW 7 Series', 3, 3, 100.00, 4.00, 117.33, 1.0, 115.00, 'top_rated', 5],
  ['business_sprinter', 'Standard Sprinter', 'Mercedes Sprinter with Standard Seating', 14, 14, 135.00, 4.60, 138.67, 1.0, 150.00, 'popular', 6],
  ['stretch_limo', 'Limo 9P', 'Lincoln MKT Stretch or similar', 9, 3, 150.00, 5.20, 160.00, 1.0, 175.00, null, 7],
  ['standard_van', 'Standard Van', 'Ford Transit or similar', 12, 12, 120.00, 4.20, 120.00, 1.0, 140.00, null, 8],
  ['party_bus', 'Party Bus 20P', 'Luxury party bus with perimeter seating', 20, 20, 260.00, 6.50, 250.00, 1.0, 300.00, null, 9]
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           models = EXCLUDED.models,
           passengers = EXCLUDED.passengers,
           luggage = EXCLUDED.luggage,
           base_fare = EXCLUDED.base_fare,
           per_mile = EXCLUDED.per_mile,
           hourly_rate = EXCLUDED.hourly_rate,
           multiplier = EXCLUDED.multiplier,
           min_fare = EXCLUDED.min_fare,
           badge = EXCLUDED.badge,
           sort_order = EXCLUDED.sort_order`, v
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
