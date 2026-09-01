-- Portal OTP signup + 7-day trial before Stripe subscription required

CREATE TABLE IF NOT EXISTS signup_pending (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  otp_hash TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  mc_number TEXT,
  dot_number TEXT,
  address TEXT,
  signup_ip TEXT,
  user_agent TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_pending_email ON signup_pending(lower(email));

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
