-- Shipping Wish LLC — Growth Engine (v3)
-- Outreach deliverability, inbound replies, weekly Stripe retainers, FMCSA enrichment.

CREATE TABLE IF NOT EXISTS unsubscribes (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_inbound (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  from_email TEXT NOT NULL,
  to_email TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  resend_email_id TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_sends (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  template_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,
  provider_id TEXT,
  status TEXT DEFAULT 'sent',
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  plan_key TEXT NOT NULL DEFAULT 'solo_weekly',
  amount_cents INTEGER NOT NULL DEFAULT 9900,
  interval TEXT DEFAULT 'week',
  status TEXT DEFAULT 'incomplete',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS phy_address TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS phy_city TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS phy_state TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS phy_zip TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS officer_name TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS safety_rating TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS authority_status TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS num_drivers INTEGER;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS insurance_onfile BOOLEAN;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT FALSE;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS unread_replies INTEGER DEFAULT 0;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS fmcsa_raw JSONB;

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_plan TEXT;

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS template_key TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS reply_received BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_email_inbound_lead ON email_inbound(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_inbound_unread ON email_inbound(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_inbound_from ON email_inbound(from_email);
CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_sends(lead_id);
CREATE INDEX IF NOT EXISTS idx_billing_lead ON billing_subscriptions(lead_id);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email);
CREATE INDEX IF NOT EXISTS idx_leads_state ON crm_leads(phy_state);
CREATE INDEX IF NOT EXISTS idx_leads_mc ON crm_leads(mc_number);
