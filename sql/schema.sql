-- Shipping Wish LLC — Enterprise TMS Database Schema (v2)

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'dispatcher', 'sales_rep', 'carrier', 'driver', 'carrier_admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ensure all role ENUM values exist
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales_rep';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'driver';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'carrier_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE load_status AS ENUM (
    'new', 'booked', 'dispatched', 'at_pickup', 'loaded',
    'in_transit', 'at_delivery', 'delivered', 'pod_uploaded', 'invoiced', 'paid', 'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ensure all load_status ENUM values exist
DO $$ BEGIN
  ALTER TYPE load_status ADD VALUE IF NOT EXISTS 'new';
  ALTER TYPE load_status ADD VALUE IF NOT EXISTS 'pod_uploaded';
  ALTER TYPE load_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_category AS ENUM (
    'rate_confirmation', 'bol', 'pod', 'carrier_packet',
    'insurance', 'w9', 'mc_certificate', 'invoice', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'carrier',
  company_name TEXT,
  phone TEXT,
  mc_number TEXT,
  dot_number TEXT,
  address TEXT,
  is_suspended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure optional columns exist on users if table already existed
ALTER TABLE users ADD COLUMN IF NOT EXISTS dot_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER;

-- Per-Carrier Custom Commission Rate Fields
-- dispatch_fee_percent: The % we charge this carrier (e.g. 5 = 5%, 3 = 3%)
-- equipment_category: 'box_truck' | 'dry_van' | 'reefer' | 'flatbed' | 'other'
-- billing_notes: Internal admin notes about this carrier billing agreement
ALTER TABLE users ADD COLUMN IF NOT EXISTS dispatch_fee_percent NUMERIC(5,2) DEFAULT 5.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipment_category TEXT DEFAULT 'dry_van';
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- Dispatcher to Carrier Assignment Mapping
CREATE TABLE IF NOT EXISTS dispatcher_carriers (
  id SERIAL PRIMARY KEY,
  dispatcher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dispatcher_id, carrier_id)
);

-- Brokers Table
CREATE TABLE IF NOT EXISTS brokers (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  mc_number TEXT UNIQUE,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  credit_rating TEXT DEFAULT 'A',
  broker_packet_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trucks Table
CREATE TABLE IF NOT EXISTS trucks (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  truck_number TEXT NOT NULL,
  vin TEXT,
  plate TEXT,
  insurance_expiry DATE,
  registration_expiry DATE,
  inspection_expiry DATE,
  mileage NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trailers Table
CREATE TABLE IF NOT EXISTS trailers (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  trailer_number TEXT NOT NULL,
  type TEXT DEFAULT 'Dry Van',
  registration_expiry DATE,
  inspection_expiry DATE,
  insurance_expiry DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  license_number TEXT,
  cdl_expiry DATE,
  medical_expiry DATE,
  assigned_truck_id INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
  assigned_trailer_id INTEGER REFERENCES trailers(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loads Table
CREATE TABLE IF NOT EXISTS loads (
  id SERIAL PRIMARY KEY,
  load_number TEXT UNIQUE NOT NULL,
  carrier_id INTEGER REFERENCES users(id),
  dispatcher_id INTEGER REFERENCES users(id),
  broker_id INTEGER REFERENCES brokers(id),
  driver_id INTEGER REFERENCES drivers(id),
  truck_id INTEGER REFERENCES trucks(id),
  trailer_id INTEGER REFERENCES trailers(id),
  
  broker_name TEXT,
  broker_mc TEXT,
  broker_contact TEXT,
  
  pickup_company TEXT,
  pickup_location TEXT NOT NULL,
  pickup_state CHAR(2),
  pickup_date DATE,
  pickup_time TEXT,
  
  delivery_company TEXT,
  delivery_location TEXT NOT NULL,
  delivery_state CHAR(2),
  delivery_date DATE,
  delivery_time TEXT,
  
  commodity TEXT,
  weight NUMERIC(10,2),
  miles NUMERIC(8,2) DEFAULT 0,
  rate NUMERIC(10,2) DEFAULT 0,
  rpm NUMERIC(6,2) DEFAULT 0,
  carrier_pay NUMERIC(10,2) DEFAULT 0,
  equipment_type TEXT,
  
  status load_status NOT NULL DEFAULT 'new',
  dispatcher_notes TEXT,
  internal_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alter table loads for any missing columns if loads already existed
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_id INTEGER REFERENCES brokers(id);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS truck_id INTEGER REFERENCES trucks(id);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS trailer_id INTEGER REFERENCES trailers(id);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_mc TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_contact TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_company TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_company TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS commodity TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS weight NUMERIC(10,2);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS miles NUMERIC(8,2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS rate NUMERIC(10,2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS rpm NUMERIC(6,2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS carrier_pay NUMERIC(10,2) DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS dispatcher_notes TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_zip TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_zip TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_tz TEXT DEFAULT 'America/New_York';
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_tz TEXT DEFAULT 'America/New_York';
ALTER TABLE loads ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS bol_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS cancellation_requested_by INTEGER REFERENCES users(id);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS freight_class TEXT;

-- Document Approval & Replacement Columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pending_filepath TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pending_filename TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pending_original_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS edit_reason TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS edit_requested_by INTEGER REFERENCES users(id);

-- Load Status History Table
CREATE TABLE IF NOT EXISTS load_status_history (
  id SERIAL PRIMARY KEY,
  load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
  status load_status NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Accessorials & Expenses (Detention, TONU, Layover, Lumper, Fuel Advance)
CREATE TABLE IF NOT EXISTS load_accessorials (
  id SERIAL PRIMARY KEY,
  load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- State Mileage for IFTA
CREATE TABLE IF NOT EXISTS load_state_miles (
  id SERIAL PRIMARY KEY,
  load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
  state CHAR(2) NOT NULL,
  miles NUMERIC(8,2) NOT NULL DEFAULT 0
);

-- Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category doc_category NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  filepath TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fuel Purchases Table (for IFTA & Expense tracking)
CREATE TABLE IF NOT EXISTS fuel_purchases (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  truck_id INTEGER REFERENCES trucks(id),
  driver_id INTEGER REFERENCES drivers(id),
  purchase_date DATE NOT NULL,
  state CHAR(2) NOT NULL,
  gallons NUMERIC(8,2) NOT NULL,
  cost NUMERIC(10,2) NOT NULL,
  station_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  load_id INTEGER UNIQUE REFERENCES loads(id),
  invoice_number TEXT UNIQUE NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  freight_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  accessorial_amount NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  factoring_status TEXT DEFAULT 'direct_pay',
  issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_date DATE,
  pdf_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alter table invoices if needed
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS freight_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accessorial_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS factoring_status TEXT DEFAULT 'direct_pay';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_hosted_url TEXT;

-- Load Offers Table (AI Load Finder & Carrier Client Approval Flow)
CREATE TABLE IF NOT EXISTS load_offers (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  dispatcher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  broker_name TEXT NOT NULL,
  broker_mc TEXT,
  broker_phone TEXT,
  pickup_location TEXT NOT NULL,
  pickup_state CHAR(2),
  pickup_date DATE,
  delivery_location TEXT NOT NULL,
  delivery_state CHAR(2),
  delivery_date DATE,
  rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  miles NUMERIC(8,2) NOT NULL DEFAULT 0,
  rpm NUMERIC(6,2) NOT NULL DEFAULT 0,
  equipment_type TEXT DEFAULT '53ft Dry Van',
  status TEXT DEFAULT 'pending', -- pending, accepted, declined, booked
  ai_match_score NUMERIC(5,2) DEFAULT 95.00,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CRM Leads Table
CREATE TABLE IF NOT EXISTS crm_leads (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  mc_number TEXT,
  dot_number TEXT,
  equipment_type TEXT DEFAULT '53ft Dry Van',
  num_trucks INTEGER DEFAULT 1,
  target_lanes TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new, contacted, interested, packet_sent, active, dead
  sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lead Tasks & Follow-up Checklist
CREATE TABLE IF NOT EXISTS lead_tasks (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE CASCADE,
  task_title TEXT NOT NULL,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email Outreach Logs (Resend Integration)
CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  email_type TEXT DEFAULT 'outreach', -- outreach, onboarding_packet, follow_up
  status TEXT DEFAULT 'sent', -- sent, delivered, failed
  resend_id TEXT,
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VOIP Call & SMS Logs (OpenPhone / MightyCall Integration)
CREATE TABLE IF NOT EXISTS voip_call_logs (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voip_provider TEXT NOT NULL DEFAULT 'OpenPhone', -- OpenPhone or MightyCall
  call_type TEXT DEFAULT 'outbound_call', -- outbound_call, inbound_call, sms
  from_number TEXT,
  to_number TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  disposition TEXT DEFAULT 'completed', -- completed, no_answer, voicemail, busy
  recording_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for CRM performance
CREATE INDEX IF NOT EXISTS idx_leads_sales_rep ON crm_leads(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON lead_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON lead_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_email_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_voip_lead ON voip_call_logs(lead_id);

-- Employee HR & Salary Ledger (ERP Module)
CREATE TABLE IF NOT EXISTS employee_hr (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL DEFAULT 'Freight Dispatcher',
  salary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  pay_frequency TEXT DEFAULT 'monthly', -- monthly, bi-weekly, weekly
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  emergency_contact TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Load Planning & Driver Future Availability Schedule
CREATE TABLE IF NOT EXISTS load_plans (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE CASCADE,
  truck_id INTEGER REFERENCES trucks(id) ON DELETE CASCADE,
  available_date DATE NOT NULL,
  pickup_location TEXT NOT NULL,
  delivery_preference TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, booked, completed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Multi-Dispatcher Truck & Driver Assignment Matrix
CREATE TABLE IF NOT EXISTS dispatcher_trucks (
  id SERIAL PRIMARY KEY,
  dispatcher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  truck_id INTEGER REFERENCES trucks(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  shift_type TEXT DEFAULT 'all', -- all, day_shift, night_shift, weekend
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dispatcher_id, truck_id)
);

-- Tracking Events Table (GPS tracking & status pings)
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

-- Notifications Table (In-app notifications)
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

-- Audit Log Table (System security & action auditing)
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

-- Load Messages Table (Load communication chat)
CREATE TABLE IF NOT EXISTS load_messages (
  id SERIAL PRIMARY KEY,
  load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additional Indexes for ERP performance
CREATE INDEX IF NOT EXISTS idx_employee_hr_user ON employee_hr(user_id);
CREATE INDEX IF NOT EXISTS idx_load_plans_driver ON load_plans(driver_id);
CREATE INDEX IF NOT EXISTS idx_load_plans_available ON load_plans(available_date);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trucks_disp ON dispatcher_trucks(dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trucks_truck ON dispatcher_trucks(truck_id);
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

-- Website CMS Settings Table
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Blog Posts Table for SEO & Backlinks
CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'Freight Dispatch',
  author TEXT DEFAULT 'Shipping Wish Editorial Desk',
  read_time TEXT DEFAULT '5 min read',
  image_url TEXT,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(is_published);



