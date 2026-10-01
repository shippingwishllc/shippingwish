-- Permanent cleanup for rows created by the old SuperAdmin demo seeder.
-- Deletes exact synthetic demo keys; preserves all real customer data.

DELETE FROM ecommerce_orders
WHERE order_number IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105')
   OR payment_status = 'demo';

DELETE FROM ecommerce_products
WHERE handle IN ('cordless-muscle-gun', 'smart-car-mount', 'rgb-light-bar', 'tactical-cargo-organizer');

DELETE FROM limo_bookings
WHERE booking_number IN ('NLW-2026-081', 'NLW-2026-082', 'NLW-2026-083', 'NLW-2026-084')
   OR payment_status = 'demo';

DELETE FROM loads
WHERE load_number IN ('LN-4011', 'LN-4012', 'LN-4013', 'LN-4014', 'LN-4015', 'LN-4016');

DELETE FROM trucks
WHERE truck_number IN ('TRK-101', 'TRK-102', 'TRK-103', 'TRK-104')
   OR carrier_id IN (
     SELECT id FROM users WHERE email IN ('ops@apexfreight.com', 'elena@ironcladhauling.com')
   );

DELETE FROM users
WHERE email IN ('ops@apexfreight.com', 'elena@ironcladhauling.com');

DELETE FROM billing_subscriptions
WHERE stripe_subscription_id IN ('sub_live_sw_01', 'sub_live_sw_02', 'sub_live_ln_01');

DELETE FROM audit_log
WHERE action = 'DEMO_SEED_ARCHIVED'
   OR (ip_address = '127.0.0.1' AND action = 'SUPERADMIN_INITIALIZED');
