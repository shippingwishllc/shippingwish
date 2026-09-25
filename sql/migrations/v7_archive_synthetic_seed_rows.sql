-- One-time, reviewable cleanup for rows created by the old SuperAdmin demo seeder.
-- This migration archives/disables exact seeded identifiers; it does not delete customer data.
BEGIN;

UPDATE ecommerce_orders
SET payment_status = 'demo', fulfillment_status = 'demo', supplier_tracking_number = NULL, updated_at = NOW()
WHERE order_number IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105');

UPDATE ecommerce_products
SET is_active = FALSE
WHERE handle IN ('cordless-muscle-gun', 'smart-car-mount', 'rgb-light-bar', 'tactical-cargo-organizer');

UPDATE limo_bookings
SET status = 'cancelled', payment_status = 'demo', updated_at = NOW()
WHERE booking_number IN ('NLW-2026-081', 'NLW-2026-082', 'NLW-2026-083', 'NLW-2026-084');

UPDATE loads
SET status = 'cancelled', updated_at = NOW()
WHERE load_number IN ('LN-4011', 'LN-4012', 'LN-4013', 'LN-4014', 'LN-4015', 'LN-4016');

UPDATE trucks
SET is_active = FALSE, dispatch_status = 'empty', status = 'inactive', updated_at = NOW()
WHERE truck_number IN ('TRK-101', 'TRK-102', 'TRK-103', 'TRK-104')
  AND carrier_id IN (
    SELECT id FROM users WHERE email IN ('ops@apexfreight.com', 'elena@ironcladhauling.com')
  );

UPDATE users
SET weekly_plan = NULL
WHERE email IN ('ops@apexfreight.com', 'elena@ironcladhauling.com');

UPDATE billing_subscriptions
SET status = 'canceled'
WHERE stripe_subscription_id IN ('sub_live_sw_01', 'sub_live_sw_02', 'sub_live_ln_01');

UPDATE audit_log
SET action = 'DEMO_SEED_ARCHIVED',
    payload = '{"reason":"known synthetic startup seed"}'::jsonb
WHERE action IN ('SUPERADMIN_INITIALIZED', '2FA_OTP_VERIFIED', 'STRIPE_GATEWAY_SYNC')
  AND ip_address = '127.0.0.1'
  AND created_at < NOW() - INTERVAL '30 minutes';

COMMIT;
