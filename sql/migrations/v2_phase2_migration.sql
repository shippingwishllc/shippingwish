-- Shipping Wish LLC — Phase 2 Database Migration
-- Version: 2.1.0

-- 1. Extend user_role ENUM
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'driver';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'carrier_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Extend load_status ENUM if needed
DO $$ BEGIN
  ALTER TYPE load_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Extend loads table with zip codes, timezones, and reference numbers
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_zip TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_zip TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_tz TEXT DEFAULT 'America/New_York';
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_tz TEXT DEFAULT 'America/New_York';
ALTER TABLE loads ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS bol_number TEXT;

-- 4. Extend users and entities with organization_id for tenant isolation
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE trailers ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS organization_id INTEGER;

-- 5. Create tracking_events table (GPS tracking & status pings)
CREATE TABLE IF NOT EXISTS tracking_events (
  id SERIAL PRIMARY KEY,
  load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  location_name TEXT,
  status load_status,
  notes TEXT,
  ping_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create notifications table (In-app notifications)
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- info, success, warning, danger
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Create audit_log table (System security & action auditing)
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  payload JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Create load_messages table (Load communication chat)
CREATE TABLE IF NOT EXISTS load_messages (
  id SERIAL PRIMARY KEY,
  load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Create Indexes
CREATE INDEX IF NOT EXISTS idx_tracking_load ON tracking_events(load_id);
CREATE INDEX IF NOT EXISTS idx_tracking_driver ON tracking_events(driver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_load_messages_load ON load_messages(load_id);
CREATE INDEX IF NOT EXISTS idx_loads_ref ON loads(reference_number);
CREATE INDEX IF NOT EXISTS idx_loads_bol ON loads(bol_number);
