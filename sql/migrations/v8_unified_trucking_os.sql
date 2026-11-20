-- v8_unified_trucking_os.sql
-- Unified Shipping Wish (AI Dispatch + Carrier TMS) & Loads Nexus (Load Board) Schema Upgrade
-- Safe, idempotent migration — eliminates runtime ALTER TABLE locks in hot request paths.

-- 1. Unified loads columns connecting Loads Nexus Marketplace -> Shipping Wish Dispatch TMS -> Settlement
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS is_public_board BOOLEAN DEFAULT FALSE;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS source_id INTEGER;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_name TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_mc TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_contact TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_name TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_mc TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_phone TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS truck_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS trailer_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS tracking_notes TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS miles NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS empty_miles NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS rpm NUMERIC(8, 2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS detention_total NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS fuel_est NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS net_profit_est NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_tracking_token VARCHAR(96);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approval_status VARCHAR(30) DEFAULT 'not_requested';
ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approval_requested_at TIMESTAMP;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approved_at TIMESTAMP;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_approval_notes TEXT;

-- Mark genuine existing marketplace loads as public, keep private carrier TMS loads private
UPDATE loads
SET is_public_board = TRUE
WHERE is_public_board IS NOT TRUE
  AND status IN ('new', 'open')
  AND carrier_id IS NULL
  AND COALESCE(source_type, '') IN ('broker', 'api', 'dat', 'ai_ingest', 'partner_api');

-- Performance indexes for Loads Nexus search & Dispatch TMS
CREATE INDEX IF NOT EXISTS idx_loads_public_board_status ON loads(is_public_board, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loads_broker_user_id ON loads(broker_user_id);
CREATE INDEX IF NOT EXISTS idx_loads_carrier_status ON loads(carrier_id, status);
CREATE INDEX IF NOT EXISTS idx_loads_tracking_token ON loads(broker_tracking_token);

-- 2. Durable cloud/DB document storage columns (prevents Vercel /tmp file loss)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cloud_url TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data_b64 TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(30) DEFAULT 'local';

-- 3. Carrier factoring & driver pay defaults on users / drivers
ALTER TABLE users ADD COLUMN IF NOT EXISTS factoring_company TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS factoring_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS factoring_noa_text TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_mpg NUMERIC(5, 2) DEFAULT 6.5;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pay_type VARCHAR(20) DEFAULT 'percent';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pay_rate NUMERIC(8, 2) DEFAULT 28.00;

-- 4. Driver Settlements Ledger (Weekly / Bi-Weekly / Monthly Statements)
CREATE TABLE IF NOT EXISTS driver_settlements (
  id SERIAL PRIMARY KEY,
  settlement_number VARCHAR(50) UNIQUE NOT NULL,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name VARCHAR(150),
  truck_number VARCHAR(50),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  loads_count INTEGER DEFAULT 0,
  loaded_miles NUMERIC(10, 2) DEFAULT 0,
  empty_miles NUMERIC(10, 2) DEFAULT 0,
  gross_revenue NUMERIC(12, 2) DEFAULT 0,
  pay_type VARCHAR(20) DEFAULT 'percent',
  pay_rate NUMERIC(8, 2) DEFAULT 28.00,
  driver_gross_pay NUMERIC(12, 2) DEFAULT 0,
  fuel_deduction NUMERIC(12, 2) DEFAULT 0,
  advances_deduction NUMERIC(12, 2) DEFAULT 0,
  other_deductions NUMERIC(12, 2) DEFAULT 0,
  reimbursements NUMERIC(12, 2) DEFAULT 0,
  net_driver_pay NUMERIC(12, 2) DEFAULT 0,
  carrier_net_profit NUMERIC(12, 2) DEFAULT 0,
  load_ids_json JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  status VARCHAR(30) DEFAULT 'draft',
  paid_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_carrier ON driver_settlements(carrier_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver ON driver_settlements(driver_id, period_end DESC);

-- 5. Carrier-to-Broker / Factoring Billing Packets
CREATE TABLE IF NOT EXISTS factoring_packets (
  id SERIAL PRIMARY KEY,
  packet_number VARCHAR(50) UNIQUE NOT NULL,
  load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  recipient_type VARCHAR(30) DEFAULT 'broker', -- broker | factoring
  recipient_name VARCHAR(200),
  recipient_email VARCHAR(200),
  gross_rate NUMERIC(12, 2) DEFAULT 0,
  detention_amount NUMERIC(10, 2) DEFAULT 0,
  lumper_amount NUMERIC(10, 2) DEFAULT 0,
  other_accessorials NUMERIC(10, 2) DEFAULT 0,
  total_invoice_amount NUMERIC(12, 2) DEFAULT 0,
  included_doc_ids JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(30) DEFAULT 'sent', -- draft | sent | funded | paid | overdue
  sent_at TIMESTAMP DEFAULT NOW(),
  due_date DATE,
  paid_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_factoring_packets_carrier ON factoring_packets(carrier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_factoring_packets_load ON factoring_packets(load_id);
