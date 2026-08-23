-- ============================================================
-- MIGRATION: Per-Carrier Custom Commission Rate
-- Run this in Vercel Postgres Query Editor
-- Date: 2026-08-23
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS dispatch_fee_percent NUMERIC(5,2) DEFAULT 5.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipment_category TEXT DEFAULT 'dry_van';
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- Verify columns added:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('dispatch_fee_percent', 'equipment_category', 'billing_notes');
