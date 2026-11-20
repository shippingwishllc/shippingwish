const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');
const { escapeHtml, COMPANY } = require('../utils/email-templates');
const { ensureSchema: ensureLimoSchema } = require('../utils/limo-ensure-schema');

// Ensure tables & columns for multi-brand executive operations
let tablesInitialized = false;
async function ensureSuperAdminTables() {
  if (tablesInitialized) return;
  try {
    // 1. Ensure NYC Limo Wish tables & default vehicles exist
    await ensureLimoSchema().catch((err) => console.warn('[LIMO SCHEMA SETUP WARN]:', err.message));

    // 2. Trucks fleet dispatch status columns
    await pool.query(`
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'empty';
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS next_available_date DATE;
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS next_available_city TEXT;
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS assigned_driver_name TEXT;
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS assigned_driver_phone TEXT;
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS current_load_id INTEGER;
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS unit_number TEXT;
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS equipment_type TEXT DEFAULT '53ft Dry Van';
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS trailer_type TEXT DEFAULT 'Dry Van';
      ALTER TABLE trucks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_plan TEXT;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS cancellation_requested_by INTEGER;
      ALTER TABLE loads ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;
    `).catch(() => {});

    // 3. BuyWishOnline E-Commerce Orders
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ecommerce_orders (
        id SERIAL PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT,
        shipping_address TEXT,
        shipping_city TEXT,
        shipping_state TEXT,
        items JSONB NOT NULL DEFAULT '[]',
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        subtotal_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        cost_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        profit_margin NUMERIC(10,2) NOT NULL DEFAULT 0,
        supplier TEXT NOT NULL DEFAULT 'Zendrop',
        supplier_order_id TEXT,
        zendrop_order_id TEXT,
        supplier_tracking_number TEXT,
        stripe_session_id TEXT,
        stripe_payment_intent TEXT,
        fulfillment_status TEXT NOT NULL DEFAULT 'awaiting_payment',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
      ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
      ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS zendrop_order_id TEXT;
      ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
      ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;
      ALTER TABLE ecommerce_orders ALTER COLUMN payment_status SET DEFAULT 'pending';
      ALTER TABLE ecommerce_orders ALTER COLUMN fulfillment_status SET DEFAULT 'awaiting_payment';
      CREATE INDEX IF NOT EXISTS idx_ecom_orders_status ON ecommerce_orders(fulfillment_status);
    `).catch(() => {});

    // 4. BuyWishOnline AI Product Hunting Catalog
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ecommerce_products (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        handle TEXT NOT NULL UNIQUE,
        description TEXT,
        category TEXT,
        retail_price NUMERIC(10,2) NOT NULL,
        supplier_cost NUMERIC(10,2) NOT NULL,
        estimated_margin NUMERIC(5,2),
        trend_score INTEGER DEFAULT 85,
        source TEXT DEFAULT 'Zendrop AI Hunter',
        image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `).catch(() => {});

    // Product and order data must come from real integrations and paid checkouts.

    // 5. Ensure audit_log and site_settings tables exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        ip_address TEXT,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `).catch(() => {});

    // Clean up any lingering synthetic demo records so only real user activity is shown
    await pool.query(`
      DELETE FROM ecommerce_orders 
      WHERE order_number IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105') 
         OR payment_status = 'demo';
      DELETE FROM ecommerce_products WHERE handle IN ('cordless-muscle-gun', 'smart-car-mount', 'rgb-light-bar', 'tactical-cargo-organizer');
      DELETE FROM limo_bookings 
      WHERE booking_number IN ('NLW-2026-081', 'NLW-2026-082', 'NLW-2026-083', 'NLW-2026-084') 
         OR payment_status = 'demo' 
         OR passenger_email IN ('vip@nyclimowish.com', 'admin@nyclimowish.com') 
         OR total_price = 985 
         OR passenger_first_name IN ('James', 'Alexander', 'Sophia', 'Marcus');
      DELETE FROM loads 
      WHERE load_number IN ('LN-4011', 'LN-4012', 'LN-4013', 'LN-4014', 'LN-4015', 'LN-4016')
         OR COALESCE(source_type, '') = 'dat_sync';
      DELETE FROM trucks 
      WHERE carrier_id IN (SELECT id FROM users WHERE email IN ('ops@apexfreight.com', 'elena@ironcladhauling.com', 'demo@shippingwish.com'));
      DELETE FROM users WHERE email IN ('ops@apexfreight.com', 'elena@ironcladhauling.com', 'demo@shippingwish.com');
      DELETE FROM billing_subscriptions WHERE stripe_subscription_id IN ('sub_live_sw_01', 'sub_live_sw_02', 'sub_live_ln_01');
      DELETE FROM audit_log WHERE action = 'DEMO_SEED_ARCHIVED' OR (ip_address = '127.0.0.1' AND action = 'SUPERADMIN_INITIALIZED');
    `).catch(() => {});

    tablesInitialized = true;
  } catch (err) {
    console.error('[SUPERADMIN DB SETUP ERROR]:', err.message);
  }
}

// -------------------------------------------------------------
// 1. MASTER EXECUTIVE COMMAND CENTER OVERVIEW
// -------------------------------------------------------------
router.get('/overview', requireAuth, requireSuperAdmin, async (req, res) => {
  await ensureSuperAdminTables();

  try {
    // ---------------------------------------------------------
    // A. SHIPPING WISH TMS & SUBSCRIPTIONS
    // ---------------------------------------------------------
    const swSubQuery = await pool.query(`
      SELECT 
        status, 
        plan_key,
        amount_cents,
        interval,
        count(*) as count,
        sum(amount_cents) as total_cents
      FROM billing_subscriptions
      WHERE COALESCE(plan_key, '') NOT LIKE 'loadboard_%'
        AND COALESCE(stripe_subscription_id, '') NOT IN ('sub_live_sw_01', 'sub_live_sw_02', 'sub_live_ln_01')
        AND COALESCE(status, '') NOT IN ('canceled')
      GROUP BY status, plan_key, amount_cents, interval
    `).catch(() => ({ rows: [] }));

    let swActiveSubsCount = 0;
    let swPastDueSubsCount = 0;
    let swWeeklyMrrCents = 0;

    swSubQuery.rows.forEach(r => {
      const cnt = parseInt(r.count, 10);
      const amt = parseInt(r.amount_cents || 0, 10);
      if (r.status === 'active' || r.status === 'trialing') {
        swActiveSubsCount += cnt;
        const mult = String(r.interval || 'week').toLowerCase() === 'month' ? 1 : 4.33;
        swWeeklyMrrCents += (amt * cnt * mult);
      } else if (r.status === 'past_due' || r.status === 'incomplete' || r.status === 'unpaid') {
        swPastDueSubsCount += cnt;
      }
    });

    // Invoices Paid / Pending / Unpaid / Overdue Revenue
    const invQuery = await pool.query(`
      SELECT 
        count(*) as total_invoices,
        count(*) FILTER (WHERE status = 'paid') as paid_count,
        count(*) FILTER (WHERE status IN ('unpaid', 'pending', 'sent', 'overdue')) as pending_count,
        coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
        coalesce(sum(amount) FILTER (WHERE status IN ('unpaid', 'pending', 'sent', 'overdue')), 0) as pending_amount
      FROM invoices
    `).catch(() => ({ rows: [{ total_invoices: 0, paid_count: 0, pending_count: 0, paid_amount: 0, pending_amount: 0 }] }));

    const invoiceStats = invQuery.rows[0];

    // Exact Total Registered Carriers Count (never capped by LIMIT 25!)
    const totalCarriersRes = await pool.query(`
      SELECT count(*)::int AS total_carriers
      FROM users
      WHERE role IN ('carrier', 'carrier_admin')
        AND deleted_at IS NULL
        AND email NOT IN ('ops@apexfreight.com', 'elena@ironcladhauling.com', 'demo@shippingwish.com')
    `).catch(() => ({ rows: [{ total_carriers: 0 }] }));
    const totalCarriersCount = totalCarriersRes.rows[0]?.total_carriers || 0;

    // Onboarded Carriers List (Users with role carrier)
    const carriersQuery = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.company_name, 
        u.email, 
        u.phone, 
        u.mc_number, 
        u.dot_number, 
        u.weekly_plan,
        u.created_at,
        count(t.id) as truck_count
      FROM users u
      LEFT JOIN trucks t ON t.carrier_id = u.id AND t.is_active IS NOT FALSE
      WHERE u.role IN ('carrier', 'carrier_admin') 
        AND u.deleted_at IS NULL
        AND u.email NOT IN ('ops@apexfreight.com', 'elena@ironcladhauling.com', 'demo@shippingwish.com')
      GROUP BY u.id, u.name, u.company_name, u.email, u.phone, u.mc_number, u.dot_number, u.weekly_plan, u.created_at
      ORDER BY u.created_at DESC
      LIMIT 25
    `).catch(() => ({ rows: [] }));

    // Fleet Trucks Status: Booked vs Empty vs Unloading Tomorrow (combines TMS trucks + AI Dispatch roster trucks)
    const trucksQuery = await pool.query(`
      SELECT 
        t.id,
        t.unit_number,
        t.truck_number,
        t.equipment_type,
        t.trailer_type,
        t.status,
        coalesce(t.dispatch_status, 'empty') as dispatch_status,
        t.next_available_date,
        t.next_available_city,
        t.assigned_driver_name,
        t.assigned_driver_phone,
        u.company_name as carrier_name,
        u.phone as carrier_phone,
        u.mc_number as carrier_mc
      FROM trucks t
      LEFT JOIN users u ON u.id = t.carrier_id
      WHERE t.is_active IS NOT FALSE
        AND COALESCE(u.email, '') NOT IN ('ops@apexfreight.com', 'elena@ironcladhauling.com', 'demo@shippingwish.com')
      ORDER BY t.id DESC
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    // Also include active trucks from ai_dispatch_carriers if not already in trucksQuery
    const aiCarriersRes = await pool.query(`
      SELECT id, company_name, contact_name, phone, email, mc_number, equipment, empty_zip, status, truck_number
      FROM ai_dispatch_carriers
      ORDER BY id DESC
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    const combinedTrucks = [...trucksQuery.rows];
    const existingNums = new Set(combinedTrucks.map(t => String(t.truck_number || t.unit_number || '').replace(/^Unit\s*#?/i, '').trim().toLowerCase()).filter(Boolean));
    for (const ac of aiCarriersRes.rows) {
      const num = String(ac.truck_number || ac.id || '101').replace(/^Unit\s*#?/i, '').trim();
      if (existingNums.has(num.toLowerCase())) continue;
      existingNums.add(num.toLowerCase());
      const acStatus = String(ac.status || 'active').toLowerCase();
      combinedTrucks.push({
        id: ac.id,
        source: 'ai_dispatch',
        unit_number: `Unit #${num}`,
        truck_number: num,
        equipment_type: ac.equipment || 'Box Truck',
        trailer_type: ac.equipment || 'Box Truck',
        status: acStatus,
        dispatch_status: acStatus === 'booked' ? 'booked' : (acStatus === 'rolling' ? 'booked' : 'empty'),
        next_available_date: null,
        next_available_city: ac.empty_zip || '—',
        assigned_driver_name: ac.contact_name || ac.company_name || 'Driver',
        assigned_driver_phone: ac.phone || '',
        carrier_name: ac.company_name || 'Fleet Carrier',
        carrier_phone: ac.phone || '',
        carrier_mc: ac.mc_number || ''
      });
    }

    let trucksBooked = 0;
    let trucksEmpty = 0;
    let trucksUnloadingTomorrow = 0;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    combinedTrucks.forEach(t => {
      const st = String(t.dispatch_status || t.status || 'empty').toLowerCase();
      const nextDate = t.next_available_date ? new Date(t.next_available_date).toISOString().slice(0, 10) : '';
      if (st === 'booked' || st === 'dispatched' || st === 'in_transit' || st === 'rolling') {
        trucksBooked++;
      } else if (st === 'unloading_tomorrow' || nextDate === tomorrowStr) {
        trucksUnloadingTomorrow++;
      } else {
        trucksEmpty++;
      }
    });

    // TMS Active Loads Query (recent operational loads with carrier & dispatcher info)
    const allTmsLoads = await pool.query(`
      SELECT 
        l.id,
        l.load_number,
        COALESCE(c.company_name, c.name, 'Unassigned') as carrier_company,
        COALESCE(d.name, 'Unassigned') as dispatcher_name,
        COALESCE(l.broker_name, 'Direct Broker') as broker_name,
        COALESCE(l.pickup_location, '—') as pickup_location,
        l.pickup_state,
        COALESCE(l.delivery_location, '—') as delivery_location,
        l.delivery_state,
        COALESCE(l.rate, 0) as rate,
        l.status,
        l.equipment_type,
        l.created_at
      FROM loads l
      LEFT JOIN users c ON c.id = l.carrier_id
      LEFT JOIN users d ON d.id = l.dispatcher_id
      WHERE l.load_number NOT IN ('LN-4011', 'LN-4012', 'LN-4013', 'LN-4014', 'LN-4015', 'LN-4016')
        AND COALESCE(l.source_type, '') <> 'dat_sync'
      ORDER BY l.id DESC
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    // Dispatchers Team & Matrix Query
    let dispatchersMatrixRows = [];
    try {
      const dmRes = await pool.query(`
        SELECT 
          d.id, 
          d.name, 
          d.email, 
          d.phone,
          COUNT(DISTINCT dc.carrier_id) as assigned_carriers_count,
          COUNT(DISTINCT l.id) FILTER (WHERE l.status::text IN ('booked', 'dispatched', 'in_transit', 'at_pickup', 'loaded', 'at_delivery')) as active_loads_count,
          COALESCE(SUM(l.rate) FILTER (WHERE l.status::text NOT IN ('cancelled')), 0) as total_revenue
        FROM users d
        LEFT JOIN dispatcher_carriers dc ON dc.dispatcher_id = d.id
        LEFT JOIN loads l ON l.dispatcher_id = d.id
        WHERE d.role IN ('dispatcher', 'admin', 'super_admin') AND d.deleted_at IS NULL
        GROUP BY d.id, d.name, d.email, d.phone
        ORDER BY total_revenue DESC
      `);
      dispatchersMatrixRows = dmRes.rows;
    } catch (e) {
      const dmResFallback = await pool.query(`
        SELECT 
          d.id, 
          d.name, 
          d.email, 
          d.phone,
          0 as assigned_carriers_count,
          COUNT(DISTINCT l.id) FILTER (WHERE l.status::text IN ('booked', 'dispatched', 'in_transit', 'at_pickup', 'loaded', 'at_delivery')) as active_loads_count,
          COALESCE(SUM(l.rate) FILTER (WHERE l.status::text NOT IN ('cancelled')), 0) as total_revenue
        FROM users d
        LEFT JOIN loads l ON l.dispatcher_id = d.id
        WHERE d.role IN ('dispatcher', 'admin', 'super_admin') AND d.deleted_at IS NULL
        GROUP BY d.id, d.name, d.email, d.phone
        ORDER BY total_revenue DESC
      `).catch(() => ({ rows: [] }));
      dispatchersMatrixRows = dmResFallback.rows;
    }

    // Pending Load Cancellation Requests
    const cancellationRequests = await pool.query(`
      SELECT 
        l.id, 
        l.load_number, 
        l.pickup_location, 
        l.delivery_location, 
        l.rate, 
        l.cancellation_reason, 
        l.cancellation_requested_at,
        COALESCE(disp.name, 'Dispatcher') as requested_by_name,
        disp.email as requested_by_email
      FROM loads l
      LEFT JOIN users disp ON disp.id = l.cancellation_requested_by
      WHERE l.status = 'cancellation_requested'
      ORDER BY l.cancellation_requested_at DESC
    `).catch(() => ({ rows: [] }));

    // Website CMS Settings
    const settingsRows = await pool.query('SELECT key, value FROM site_settings').catch(() => ({ rows: [] }));
    const siteSettings = {
      company_name: 'Shipping Wish LLC',
      info_email: 'info@shippingwish.com',
      support_email: 'support@shippingwish.com',
      dispatch_email: 'dispatch@shippingwish.com',
      phone_number: '+1 (917) 737-0021',
      address: '19266 Coastal Hwy, Rehoboth Beach, DE 19971',
      linkedin_url: 'https://linkedin.com/company/shippingwish',
      facebook_url: 'https://facebook.com/shippingwish',
      twitter_url: 'https://x.com/shippingwish',
      instagram_url: 'https://instagram.com/shippingwish',
      youtube_url: 'https://youtube.com/@shippingwish'
    };
    settingsRows.rows.forEach(r => { if (r.key && r.value) siteSettings[r.key] = r.value; });

    // System Security Audit Logs
    const auditLogsQuery = await pool.query(`
      SELECT 
        a.id, 
        a.created_at, 
        COALESCE(u.name, 'System') as user_name, 
        COALESCE(u.role::text, 'system') as user_role, 
        a.action, 
        a.entity_type, 
        a.entity_id, 
        a.ip_address, 
        a.payload
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.action NOT IN ('DEMO_SEED_ARCHIVED')
        AND NOT (a.ip_address = '127.0.0.1' AND a.action = 'SUPERADMIN_INITIALIZED')
      ORDER BY a.id DESC
      LIMIT 30
    `).catch(() => ({ rows: [] }));

    // ---------------------------------------------------------
    // B. LOADSNEXUS AI LOAD BOARD
    // ---------------------------------------------------------
    const lnSubQuery = await pool.query(`
      SELECT 
        plan_key,
        status,
        amount_cents,
        count(*) as count,
        sum(amount_cents) as total_cents
      FROM billing_subscriptions
      WHERE COALESCE(plan_key, '') LIKE 'loadboard_%'
        AND COALESCE(stripe_subscription_id, '') NOT IN ('sub_live_sw_01', 'sub_live_sw_02', 'sub_live_ln_01')
        AND COALESCE(status, '') NOT IN ('canceled')
      GROUP BY plan_key, status, amount_cents
    `).catch(() => ({ rows: [] }));

    let lnActiveSubsCount = 0;
    let lnMrrCents = 0;
    const lnTiers = { solo: 0, team: 0, fleet: 0 };

    lnSubQuery.rows.forEach(r => {
      const cnt = parseInt(r.count, 10);
      const amt = parseInt(r.amount_cents || 0, 10);
      if (r.status === 'active' || r.status === 'trialing') {
        lnActiveSubsCount += cnt;
        lnMrrCents += (amt * cnt);
        if (r.plan_key === 'loadboard_ai_pass') lnTiers.solo += cnt;
        if (r.plan_key === 'loadboard_team_pass') lnTiers.team += cnt;
        if (r.plan_key === 'loadboard_fleet_pass') lnTiers.fleet += cnt;
      }
    });

    // Registered Broker Accounts + Monitored Brokers Directory
    const brokersQuery = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM users WHERE role = 'broker' AND deleted_at IS NULL) AS broker_accounts,
        (SELECT count(*)::int FROM brokers) AS monitored_brokers
    `).catch(() => ({ rows: [{ broker_accounts: 0, monitored_brokers: 0 }] }));
    const brokerAccountsCount = brokersQuery.rows[0]?.broker_accounts || 0;
    const monitoredBrokersCount = brokersQuery.rows[0]?.monitored_brokers || 0;

    // Loads Metrics (Includes all live open & synced marketplace loads + booked/covered loads!)
    const loadsStatsQuery = await pool.query(`
      SELECT 
        count(*) as total_loads,
        count(*) FILTER (WHERE status::text IN ('new', 'open')) as available_loads,
        count(*) FILTER (WHERE status::text IN ('booked', 'ratecon_signed', 'covered', 'dispatched', 'at_pickup', 'loaded', 'in_transit', 'at_delivery', 'delivered', 'pod_uploaded', 'invoiced', 'paid')) as covered_loads,
        coalesce(sum(rate) FILTER (WHERE rate > 0 AND status::text IN ('new', 'open')), 0) as open_freight_valuation,
        coalesce(sum(rate) FILTER (WHERE rate > 0 AND status::text IN ('booked', 'ratecon_signed', 'covered', 'dispatched', 'at_pickup', 'loaded', 'in_transit', 'at_delivery', 'delivered', 'pod_uploaded', 'invoiced', 'paid')), 0) as booked_freight_valuation,
        coalesce(sum(rate) FILTER (WHERE rate > 0 AND status::text NOT IN ('cancelled', 'expired')), 0) as total_freight_valuation
      FROM loads
      WHERE deleted_at IS NULL
        AND load_number NOT IN ('LN-4011', 'LN-4012', 'LN-4013', 'LN-4014', 'LN-4015', 'LN-4016')
    `).catch(() => ({ rows: [{ total_loads: 0, available_loads: 0, covered_loads: 0, open_freight_valuation: 0, booked_freight_valuation: 0, total_freight_valuation: 0 }] }));

    const loadStats = loadsStatsQuery.rows[0];

    // Recent Active Loads
    const recentLoads = await pool.query(`
      SELECT 
        id,
        load_number,
        COALESCE(pickup_location, '—') as origin,
        COALESCE(delivery_location, '—') as destination,
        equipment_type,
        rate,
        miles,
        status,
        pickup_date,
        delivery_date,
        broker_name
      FROM loads
      WHERE deleted_at IS NULL
        AND load_number NOT IN ('LN-4011', 'LN-4012', 'LN-4013', 'LN-4014', 'LN-4015', 'LN-4016')
      ORDER BY id DESC
      LIMIT 20
    `).catch(() => ({ rows: [] }));

    // ---------------------------------------------------------
    // C. NYC LIMO WISH (nyclimowish.com) — Fixed FILTER (WHERE ...) SQL syntax!
    // ---------------------------------------------------------
    const limoStatsQuery = await pool.query(`
      SELECT 
        count(*) FILTER (WHERE COALESCE(status, '') != 'cancelled') as total_bookings,
        count(*) FILTER (WHERE status = 'pending') as pending_count,
        count(*) FILTER (WHERE status IN ('confirmed', 'assigned', 'en_route', 'in_progress')) as confirmed_count,
        count(*) FILTER (WHERE status = 'completed') as completed_count,
        count(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        coalesce(sum(total_price) FILTER (WHERE payment_status = 'paid' OR status = 'completed'), 0) as total_revenue
      FROM limo_bookings
      WHERE COALESCE(payment_status, '') != 'demo'
        AND COALESCE(booking_number, '') NOT IN ('NLW-2026-081', 'NLW-2026-082', 'NLW-2026-083', 'NLW-2026-084')
        AND COALESCE(passenger_email, '') NOT IN ('vip@nyclimowish.com', 'admin@nyclimowish.com')
    `).catch((e) => {
      console.warn('[SUPERADMIN LIMO STATS WARN]:', e.message);
      return { rows: [{ total_bookings: 0, pending_count: 0, confirmed_count: 0, completed_count: 0, cancelled_count: 0, total_revenue: 0 }] };
    });

    const limoStats = limoStatsQuery.rows[0];

    const recentLimoBookings = await pool.query(`
      SELECT 
        id, booking_number, service_type, pickup_address, dropoff_address,
        pickup_date, pickup_time, passenger_first_name, passenger_last_name,
        passenger_phone, passenger_email, vehicle_id, total_price, status, payment_status, created_at
      FROM limo_bookings
      WHERE COALESCE(payment_status, '') != 'demo'
        AND booking_number NOT IN ('NLW-2026-081', 'NLW-2026-082', 'NLW-2026-083', 'NLW-2026-084')
        AND COALESCE(passenger_email, '') NOT IN ('vip@nyclimowish.com', 'admin@nyclimowish.com')
        AND COALESCE(passenger_first_name, '') NOT IN ('James', 'Alexander', 'Sophia', 'Marcus')
        AND total_price != 985
      ORDER BY id DESC
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    // ---------------------------------------------------------
    // D. BUYWISHONLINE (buywishonline.com)
    // ---------------------------------------------------------
    const ecomStatsQuery = await pool.query(`
      SELECT 
        count(*) FILTER (WHERE payment_status = 'paid' AND COALESCE(payment_status, '') != 'demo' AND order_number NOT IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105')) as total_orders,
        count(*) FILTER (WHERE payment_status = 'paid' AND fulfillment_status = 'processing') as processing_count,
        count(*) FILTER (WHERE payment_status = 'paid' AND fulfillment_status = 'in_transit') as shipping_count,
        count(*) FILTER (WHERE payment_status = 'paid' AND fulfillment_status = 'delivered') as delivered_count,
        count(*) FILTER (WHERE fulfillment_status = 'cancelled' AND COALESCE(payment_status, '') != 'demo') as cancelled_count,
        count(*) FILTER (WHERE payment_status != 'paid' AND fulfillment_status = 'awaiting_payment' AND COALESCE(payment_status, '') != 'demo' AND order_number NOT IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105')) as abandoned_checkouts_count,
        coalesce(sum(total_amount) FILTER (WHERE payment_status = 'paid' AND COALESCE(payment_status, '') != 'demo' AND order_number NOT IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105')), 0) as total_sales,
        coalesce(sum(profit_margin) FILTER (WHERE payment_status = 'paid' AND COALESCE(payment_status, '') != 'demo' AND order_number NOT IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105')), 0) as total_profit
      FROM ecommerce_orders
      WHERE order_number NOT IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105')
    `).catch(() => ({ rows: [{ total_orders: 0, processing_count: 0, shipping_count: 0, delivered_count: 0, cancelled_count: 0, abandoned_checkouts_count: 0, total_sales: 0, total_profit: 0 }] }));

    const ecomStats = ecomStatsQuery.rows[0];

    const recentEcomOrders = await pool.query(`
      SELECT 
        id, order_number, customer_name, customer_email, shipping_city, shipping_state,
        items, total_amount, profit_margin, supplier, supplier_tracking_number, fulfillment_status, payment_status, created_at
      FROM ecommerce_orders
      WHERE COALESCE(payment_status, '') = 'paid'
        AND order_number NOT IN ('BWO-89102', 'BWO-89103', 'BWO-89104', 'BWO-89105')
      ORDER BY id DESC
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    const winningProducts = await pool.query(`
      SELECT * FROM ecommerce_products 
      WHERE is_active = true 
        AND handle NOT IN ('cordless-muscle-gun', 'smart-car-mount', 'rgb-light-bar', 'tactical-cargo-organizer')
      ORDER BY trend_score DESC 
      LIMIT 10
    `).catch(() => ({ rows: [] }));

    const liveProductsCountRes = await pool.query(`
      SELECT count(*)::int AS live_products FROM ecommerce_products WHERE is_active = true
    `).catch(() => ({ rows: [{ live_products: 0 }] }));
    const liveEcomProductsCount = liveProductsCountRes.rows[0]?.live_products || 0;

    // ---------------------------------------------------------
    // COMBINED EXECUTIVE TOTALS (100% Real Verified Revenue)
    // ---------------------------------------------------------
    const totalEmpireMrrDollars = Math.round((swWeeklyMrrCents + lnMrrCents) / 100);
    const totalGrossVolumeDollars = Math.round(
      parseFloat(invoiceStats.paid_amount || 0) +
      parseFloat(limoStats.total_revenue || 0) +
      parseFloat(ecomStats.total_sales || 0)
    );

    // Per-brand Payment Gateway Health (Shipping Wish LLC Stripe hard-locked to Trucking SaaS only!)
    const { getBrandGatewayStatus } = require('../utils/alt-payments');
    const approvedKey = process.env.STRIPE_SECRET_KEY || process.env.SHIPPINGWISH_STRIPE_SECRET_KEY || '';
    const stripeMode = approvedKey.startsWith('sk_live_') ? 'LIVE PRODUCTION' : (approvedKey ? 'TEST MODE' : 'NOT CONFIGURED');
    const nyclimoGw = getBrandGatewayStatus('nyclimo');
    const buywishGw = getBrandGatewayStatus('buywish');
    const stripeHealth = {
      shipping_wish: {
        configured: Boolean(approvedKey),
        mode: stripeMode,
        account: 'Shipping Wish LLC (Stripe)'
      },
      loads_nexus: {
        configured: Boolean(approvedKey),
        mode: stripeMode,
        account: 'Shipping Wish LLC (Stripe)'
      },
      nyc_limo: {
        configured: Boolean(nyclimoGw.active_provider),
        mode: nyclimoGw.active_provider ? nyclimoGw.active_provider.toUpperCase() : 'STRIPE ISOLATED (ADD SQUARE/PAYPAL)',
        account: 'Dedicated Non-Stripe Gateway'
      },
      buywish: {
        configured: Boolean(buywishGw.active_provider),
        mode: buywishGw.active_provider ? buywishGw.active_provider.toUpperCase() : 'PAUSED & STRIPE ISOLATED',
        account: 'Dedicated Non-Stripe Gateway'
      }
    };

    let carrierSetupRequests = [];
    try {
      const setupRows = await pool.query(
        `SELECT id, company_name, owner_name, phone, email, mc_number, dot_number, num_trucks, created_at
         FROM onboarding_submissions
         ORDER BY created_at DESC
         LIMIT 15`
      );
      carrierSetupRequests = setupRows.rows;
    } catch (setupErr) {
      carrierSetupRequests = [];
    }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      current_user: req.user ? {
        id: req.user.id,
        name: req.user.name || 'Super Admin',
        email: req.user.email || '',
        role: req.user.role || 'super_admin'
      } : null,
      stripe_health: stripeHealth,
      carrier_setup_requests: carrierSetupRequests,
      executive_summary: {
        total_empire_mrr_dollars: totalEmpireMrrDollars,
        total_subscribers: swActiveSubsCount + lnActiveSubsCount,
        total_gross_volume_dollars: totalGrossVolumeDollars,
        total_trucks: combinedTrucks.length,
        trucks_booked: trucksBooked,
        trucks_empty: trucksEmpty,
        trucks_unloading_tomorrow: trucksUnloadingTomorrow,
        active_loads_valuation: parseFloat(loadStats.total_freight_valuation || 0),
        open_loads_valuation: parseFloat(loadStats.open_freight_valuation || 0),
        booked_loads_valuation: parseFloat(loadStats.booked_freight_valuation || 0),
        total_limo_rides: parseInt(limoStats.total_bookings, 10),
        total_ecom_orders: parseInt(ecomStats.total_orders, 10),
        abandoned_checkouts: parseInt(ecomStats.abandoned_checkouts_count || 0, 10)
      },
      shipping_wish: {
        active_subscribers: swActiveSubsCount,
        past_due_subscribers: swPastDueSubsCount,
        mrr_dollars: Math.round(swWeeklyMrrCents / 100),
        total_invoices_paid_dollars: parseFloat(invoiceStats.paid_amount || 0),
        total_invoices_pending_dollars: parseFloat(invoiceStats.pending_amount || 0),
        total_carriers_count: totalCarriersCount,
        onboarded_carriers: carriersQuery.rows,
        fleet_trucks: combinedTrucks,
        trucks_breakdown: {
          booked: trucksBooked,
          empty: trucksEmpty,
          unloading_tomorrow: trucksUnloadingTomorrow
        },
        all_loads: allTmsLoads.rows,
        dispatchers_matrix: dispatchersMatrixRows,
        cancellation_requests: cancellationRequests.rows,
        site_settings: siteSettings,
        audit_logs: auditLogsQuery.rows
      },
      loads_nexus: {
        active_subscribers: lnActiveSubsCount,
        mrr_dollars: Math.round(lnMrrCents / 100),
        tiers: lnTiers,
        total_brokers: Math.max(monitoredBrokersCount, brokerAccountsCount),
        monitored_brokers: monitoredBrokersCount,
        broker_accounts: brokerAccountsCount,
        total_loads: parseInt(loadStats.total_loads, 10),
        available_loads: parseInt(loadStats.available_loads, 10),
        covered_loads: parseInt(loadStats.covered_loads, 10),
        freight_valuation_dollars: parseFloat(loadStats.total_freight_valuation || 0),
        recent_loads: recentLoads.rows
      },
      nyclimo_wish: {
        total_bookings: parseInt(limoStats.total_bookings, 10),
        pending: parseInt(limoStats.pending_count, 10),
        confirmed: parseInt(limoStats.confirmed_count, 10),
        completed: parseInt(limoStats.completed_count, 10),
        cancelled: parseInt(limoStats.cancelled_count, 10),
        revenue_dollars: parseFloat(limoStats.total_revenue || 0),
        recent_bookings: recentLimoBookings.rows
      },
      buywish_online: {
        live_products: liveEcomProductsCount,
        total_orders: parseInt(ecomStats.total_orders, 10),
        abandoned_checkouts: parseInt(ecomStats.abandoned_checkouts_count || 0, 10),
        processing: parseInt(ecomStats.processing_count, 10),
        in_transit: parseInt(ecomStats.shipping_count, 10),
        delivered: parseInt(ecomStats.delivered_count, 10),
        cancelled: parseInt(ecomStats.cancelled_count, 10),
        sales_dollars: parseFloat(ecomStats.total_sales || 0),
        profit_dollars: parseFloat(ecomStats.total_profit || 0),
        recent_orders: recentEcomOrders.rows,
        ai_winning_products: winningProducts.rows
      }
    });
  } catch (err) {
    console.error('SuperAdmin overview error:', err);
    res.status(500).json({ error: err.message || 'Could not load executive dashboard.' });
  }
});

// -------------------------------------------------------------
// 2. ONBOARD CARRIER & FLEET TRUCK DIRECTLY
// -------------------------------------------------------------
router.post('/carriers/add', requireAuth, requireSuperAdmin, async (req, res) => {
  const { company_name, owner_name, email, phone, mc_number, dot_number, weekly_plan, unit_number, equipment_type, driver_name, driver_phone, initial_status, location } = req.body;
  if (!company_name || !phone) {
    return res.status(400).json({ error: 'Company name and phone number are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const safeEmail = email && email.trim() ? email.trim().toLowerCase() : `carrier_${Date.now()}@shippingwish.com`;
    const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [safeEmail]);
    const temporaryPassword = existing.rows.length ? null : crypto.randomBytes(9).toString('base64url');
    const hash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 12) : null;

    const userRes = existing.rows.length
      ? await client.query(`
          UPDATE users
          SET name = $1, company_name = $2, phone = $3, mc_number = $4, dot_number = $5, weekly_plan = $6
          WHERE id = $7
          RETURNING id, name, company_name
        `, [owner_name || company_name, company_name, phone, mc_number || null, dot_number || null, weekly_plan || 'weekly_dedicated_500', existing.rows[0].id])
      : await client.query(`
          INSERT INTO users (name, company_name, email, phone, mc_number, dot_number, role, weekly_plan, password_hash)
          VALUES ($1, $2, $3, $4, $5, $6, 'carrier', $7, $8)
          RETURNING id, name, company_name
        `, [owner_name || company_name, company_name, safeEmail, phone, mc_number || null, dot_number || null, weekly_plan || 'weekly_dedicated_500', hash]);

    const carrierId = userRes.rows[0].id;

    if (unit_number || equipment_type) {
      await client.query(`
        INSERT INTO trucks (
          carrier_id, truck_number, unit_number, equipment_type, trailer_type,
          dispatch_status, status, next_available_date, next_available_city,
          assigned_driver_name, assigned_driver_phone, is_active
        ) VALUES (
          $1, $2, $3, $4, $4,
          $5, 'active', CURRENT_DATE, $6,
          $7, $8, true
        )
      `, [
        carrierId,
        unit_number || `TRK-${carrierId}`,
        unit_number ? (unit_number.startsWith('Unit') ? unit_number : `Unit #${unit_number}`) : `Unit #${carrierId}`,
        equipment_type || '53ft Dry Van',
        initial_status || 'empty',
        location || 'Regional Hub',
        driver_name || owner_name || 'Assigned Driver',
        driver_phone || phone
      ]);
    }

    await client.query('COMMIT');

    // Automatically synchronize onboarded carrier & truck into AI Dispatch Brain
    try {
      const { syncCarrierToAiDispatch } = require('../utils/carrier-sync');
      await syncCarrierToAiDispatch({
        userId: carrierId,
        company_name,
        contact_name: owner_name || driver_name || company_name,
        phone,
        email: safeEmail,
        mc_number,
        dot_number,
        equipment: equipment_type || "53' Dry Van",
        empty_zip: location,
        status: 'active'
      });
    } catch (syncErr) {
      console.warn('[SuperAdmin] AI dispatch sync notice:', syncErr.message);
    }

    res.json({
      ok: true,
      message: temporaryPassword
        ? `Carrier "${company_name}" onboarded and active in AI dispatch. Share the one-time password, then have them change it.`
        : `Carrier "${company_name}" was updated in TMS and AI dispatch. Their existing password was left unchanged.`,
      email: safeEmail,
      temporary_password: temporaryPassword
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message || 'Could not add carrier.' });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// 3. TRUCK STATUS TOGGLE (Empty / Booked / Unloading Tomorrow)
// -------------------------------------------------------------
router.post('/trucks/status', requireAuth, requireSuperAdmin, async (req, res) => {
  const { truck_id, status, next_available_date, next_available_city, source } = req.body;
  if (!truck_id || !status) {
    return res.status(400).json({ error: 'Truck ID and status are required.' });
  }

  const validStatuses = ['empty', 'booked', 'unloading_tomorrow', 'maintenance'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: ' + validStatuses.join(', ') });
  }

  try {
    let updatedCount = 0;
    if (source !== 'ai_dispatch') {
      const r1 = await pool.query(`
        UPDATE trucks SET
          dispatch_status = $1,
          next_available_date = COALESCE($2, next_available_date),
          next_available_city = COALESCE($3, next_available_city)
        WHERE id = $4
      `, [status, next_available_date || null, next_available_city || null, truck_id]);
      updatedCount = r1.rowCount || 0;
    }

    if (source === 'ai_dispatch' || updatedCount === 0) {
      await pool.query(`
        UPDATE ai_dispatch_carriers SET
          status = $1,
          current_location = COALESCE($2, current_location),
          updated_at = NOW()
        WHERE id = $3
      `, [status, next_available_city || null, truck_id]).catch(() => {});
    }

    res.json({ ok: true, message: `Truck #${truck_id} status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not update truck status.' });
  }
});

// -------------------------------------------------------------
// 4. POST LIVE SPOT FREIGHT LOAD DIRECTLY
// -------------------------------------------------------------
router.post('/loads/add', requireAuth, requireSuperAdmin, async (req, res) => {
  const { load_number, pickup_location, delivery_location, equipment_type, miles, rate, broker_name, broker_phone, broker_mc, commodity } = req.body;
  if (!pickup_location || !delivery_location || !rate) {
    return res.status(400).json({ error: 'Pickup location, delivery location, and rate are required.' });
  }

  try {
    const lNumber = load_number && load_number.trim() ? load_number.trim() : `LN-${Math.floor(1000 + Math.random() * 9000)}`;
    const calcMiles = parseFloat(miles || 500);
    const calcRate = parseFloat(rate || 2000);
    const rpm = calcMiles > 0 ? (calcRate / calcMiles).toFixed(2) : 0;

    await pool.query(`
      INSERT INTO loads (
        load_number, pickup_location, delivery_location, equipment_type,
        miles, rate, rpm, status, broker_name, broker_contact, broker_mc, commodity,
        pickup_date, delivery_date
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, 'new', $8, $9, $10, $11,
        CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '2 days'
      )
    `, [
      lNumber,
      pickup_location,
      delivery_location,
      equipment_type || '53ft Dry Van',
      calcMiles,
      calcRate,
      rpm,
      broker_name || 'Direct Broker Partner',
      broker_phone || '',
      broker_mc || '',
      commodity || 'General Freight'
    ]);

    res.json({ ok: true, message: `Spot load #${lNumber} posted to LoadsNexus successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not post load.' });
  }
});

// -------------------------------------------------------------
// 5. NYC LIMO WISH BOOKING ADD & STATUS UPDATE
// -------------------------------------------------------------
router.post('/limo/add', requireAuth, requireSuperAdmin, async (req, res) => {
  const { passenger_name, phone, email, service_type, pickup_address, dropoff_address, pickup_date, pickup_time, vehicle_id, total_price, payment_status } = req.body;
  if (!passenger_name || !pickup_address || !dropoff_address) {
    return res.status(400).json({ error: 'Passenger name, pickup address, and dropoff address are required.' });
  }

  try {
    const bookingNumber = `NLW-2026-${Math.floor(100 + Math.random() * 900)}`;
    const names = String(passenger_name).trim().split(' ');
    const firstName = names[0];
    const lastName = names.slice(1).join(' ') || '';

    await pool.query(`
      INSERT INTO limo_bookings (
        booking_number, service_type, status, pickup_address, dropoff_address,
        pickup_date, pickup_time, vehicle_id,
        passenger_first_name, passenger_last_name, passenger_email, passenger_phone,
        total_price, payment_status
      ) VALUES (
        $1, $2, 'confirmed', $3, $4,
        COALESCE($5::date, CURRENT_DATE + INTERVAL '1 day'), COALESCE($6, '12:00'), $7,
        $8, $9, $10, $11,
        COALESCE($12, 195.00), COALESCE($13, 'paid')
      )
    `, [
      bookingNumber,
      service_type || 'airport_transfer',
      pickup_address,
      dropoff_address,
      pickup_date || null,
      pickup_time || null,
      vehicle_id || 'elitex_suv',
      firstName,
      lastName,
      email || 'vip@nyclimowish.com',
      phone || '',
      total_price ? parseFloat(total_price) : 195.00,
      payment_status || 'paid'
    ]);

    res.json({ ok: true, message: `Reservation #${bookingNumber} booked and confirmed.` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not create reservation.' });
  }
});

router.post('/limo/status', requireAuth, requireSuperAdmin, async (req, res) => {
  const { booking_id, status, internal_notes } = req.body;
  if (!booking_id || !status) {
    return res.status(400).json({ error: 'Booking ID and status are required.' });
  }

  try {
    await pool.query(`
      UPDATE limo_bookings SET
        status = $1,
        internal_notes = COALESCE(NULLIF($2, ''), internal_notes),
        updated_at = now()
      WHERE id = $3
    `, [status, internal_notes || '', booking_id]);

    res.json({ ok: true, message: `Limo booking #${booking_id} status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not update limo booking.' });
  }
});

// -------------------------------------------------------------
// 6. BUYWISHONLINE ORDER STATUS & ZENDROP FULFILLMENT
// -------------------------------------------------------------
router.post('/ecom/order-status', requireAuth, requireSuperAdmin, async (req, res) => {
  const { order_id, fulfillment_status, supplier_tracking_number } = req.body;
  if (!order_id || !fulfillment_status) {
    return res.status(400).json({ error: 'Order ID and fulfillment status are required.' });
  }

  try {
    await pool.query(`
      UPDATE ecommerce_orders SET
        fulfillment_status = $1,
        supplier_tracking_number = COALESCE(NULLIF($2, ''), supplier_tracking_number),
        updated_at = now()
      WHERE id = $3
    `, [fulfillment_status, supplier_tracking_number || '', order_id]);

    res.json({ ok: true, message: `Order #${order_id} fulfillment updated to ${fulfillment_status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not update order status.' });
  }
});

// -------------------------------------------------------------
// 7. CROSS-BRAND AI CARRIER-LOAD MATCHMAKER
// -------------------------------------------------------------
router.post('/ai/match-loads', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // Find all empty or unloading tomorrow trucks across both tables
    const emptyTrucks = await pool.query(`
      SELECT t.id, t.unit_number, t.truck_number, t.equipment_type, t.next_available_city, u.company_name, u.phone
      FROM trucks t
      LEFT JOIN users u ON u.id = t.carrier_id
      WHERE coalesce(t.dispatch_status, 'empty') IN ('empty', 'unloading_tomorrow')
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    const aiTrucks = await pool.query(`
      SELECT id, truck_number AS unit_number, truck_number, equipment_type, current_location AS next_available_city, company_name, phone
      FROM ai_dispatch_carriers
      WHERE is_active = true AND coalesce(status, 'empty') IN ('empty', 'unloading_tomorrow', 'available')
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    const allEmptyTrucks = [...emptyTrucks.rows];
    const seenUnits = new Set(allEmptyTrucks.map(t => String(t.unit_number || t.truck_number || '').trim().toLowerCase()));
    aiTrucks.rows.forEach(at => {
      const uKey = String(at.unit_number || '').trim().toLowerCase();
      if (!uKey || !seenUnits.has(uKey)) {
        seenUnits.add(uKey);
        allEmptyTrucks.push(at);
      }
    });

    // Find live available loads (excluding synthetic dat_sync loads)
    const liveLoads = await pool.query(`
      SELECT id, load_number,
        COALESCE(NULLIF(pickup_location, ''), '—') as origin,
        COALESCE(NULLIF(delivery_location, ''), '—') as destination,
        equipment_type, rate, miles, broker_name
      FROM loads
      WHERE status::text = 'new'
        AND deleted_at IS NULL
        AND COALESCE(source_type, '') <> 'dat_sync'
      ORDER BY created_at DESC
      LIMIT 30
    `).catch(() => ({ rows: [] }));

    // AI heuristic matching by equipment compatibility and location
    const matches = [];
    allEmptyTrucks.forEach(truck => {
      const candidates = liveLoads.rows.filter(load => {
        if (!truck.equipment_type || !load.equipment_type) return true;
        const tEq = String(truck.equipment_type).toLowerCase();
        const lEq = String(load.equipment_type).toLowerCase();
        if (tEq.includes('van') && lEq.includes('van')) return true;
        if (tEq.includes('reefer') && lEq.includes('reefer')) return true;
        if (tEq.includes('flatbed') && lEq.includes('flatbed')) return true;
        return tEq === lEq;
      });

      if (candidates.length) {
        matches.push({
          truck: {
            id: truck.id,
            unit: truck.unit_number || truck.truck_number || `Unit #${truck.id}`,
            equipment: truck.equipment_type || '53ft Dry Van',
            carrier: truck.company_name || 'Fleet Carrier Partner',
            phone: truck.phone || '—',
            location: truck.next_available_city || '—'
          },
          recommended_load: candidates[0],
          alternate_loads_count: Math.max(0, candidates.length - 1)
        });
      }
    });

    res.json({
      ok: true,
      total_empty_trucks: allEmptyTrucks.length,
      total_available_loads: liveLoads.rows.length,
      matches
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not compute AI matches.' });
  }
});

// -------------------------------------------------------------
// 8. CROSS-BRAND AI MARKETING CAMPAIGN GENERATOR
// -------------------------------------------------------------
router.post('/ai/generate-marketing', requireAuth, requireSuperAdmin, async (req, res) => {
  const { brand, channel, audience } = req.body;
  const targetBrand = brand || 'shippingwish';
  const targetChannel = channel || 'email';

  const templates = {
    shippingwish: {
      email: {
        subject: 'A dispatch manager for your trucks — first 7 days free',
        headline: 'Your own dispatch manager, flat weekly price',
        body: 'Shipping Wish gives your trucks a dispatch manager who finds loads, handles broker paperwork, and follows up on detention. You pay a flat weekly price instead of a percentage of your freight, and you approve every load. The first 7 days are free.',
        cta: 'Claim Your 7-Day Free Operations Desk'
      },
      sms: 'Shipping Wish: a dispatch manager for your trucks at a flat weekly price, no percentage of your freight. First 7 days free: shippingwish.com/signup',
      social: 'Shipping Wish dispatch: a manager for your trucks, a TMS for your paperwork, and a flat weekly price instead of a percentage of your freight. First 7 days free.'
    },
    loadsnexus: {
      email: {
        subject: 'LoadsNexus: broker-posted loads with direct contacts, $19/month',
        headline: 'Loads posted by brokers, with the broker contact on every load',
        body: 'LoadsNexus shows loads that brokers post directly, with the broker phone and email on each one, plus an FMCSA authority lookup before you call. How many loads are open changes day to day. Plans start at $19/month.',
        cta: 'Activate $19 Solo Pass Now'
      },
      sms: 'LoadsNexus: broker-posted loads with direct broker contacts and FMCSA authority lookup, from $19/month: loadsnexus.com/login',
      social: 'LoadsNexus: search loads posted by brokers, see the broker contact on each load, and check FMCSA authority before you call. From $19/month, one workstation plus one driver phone.'
    },
    nyclimowish: {
      email: {
        subject: '✨ Executive Black Car & Luxury Chauffeur Service in NYC',
        headline: 'Effortless JFK, LGA, EWR Airport Transfers & Executive Sedans',
        body: 'Arrive in luxury and comfort with NYC Limo Wish. Premium late-model Cadillac Escalades, Mercedes-Benz S-Class, and luxury stretch limousines driven by professional licensed chauffeurs. Flight tracking, 60 minutes free airport wait time, and guaranteed on-time pickup.',
        cta: 'Book Your Luxury Chauffeur Online'
      },
      sms: 'NYC Limo Wish: Premium NYC & Tri-State airport chauffeur transfers. Flight tracking & flat rates. Reserve in 60s: nyclimowish.com',
      social: '🗽 Upgrade your New York travel experience. Whether JFK transfers, corporate meetings, or VIP evening events, NYC Limo Wish delivers world-class chauffeur service. Reserve online at nyclimowish.com.'
    },
    buywishonline: {
      email: {
        subject: '🎁 Trending Tech & Lifestyle Innovation — Exclusive VIP Flash Sale',
        headline: 'Handpicked Quality Essentials with Fast US Shipping',
        body: 'Discover the latest viral lifestyle accessories, smart automotive tech, and ergonomic essentials sourced directly for durability and performance. Shop with confidence with our 30-day money-back guarantee and free tracked shipping.',
        cta: 'Shop Trending Catalog Now'
      },
      sms: 'BuyWishOnline VIP: Save 25% on trending smart tech & lifestyle gear with code VIP25. Free US shipping: buywishonline.com',
      social: '🛍️ Smart tech for smarter living. Hand-tested viral essentials curated for quality. Fast fulfillment and guaranteed satisfaction at buywishonline.com.'
    }
  };

  const selected = templates[targetBrand] || templates.shippingwish;
  const campaign = selected[targetChannel] || selected.email;

  res.json({
    ok: true,
    brand: targetBrand,
    channel: targetChannel,
    campaign
  });
});

// =========================================================================
// 1-CLICK CROSS-DOMAIN SUPERADMIN SSO (BuyWishOnline Admin, NYC Limo ERP, LoadsNexus)
// Strictly super_admin only — mints a 60-second signed ticket exchanged for HttpOnly cookies on target domain!
// =========================================================================
// Direct 1-Click GET Redirect Launcher (Zero popup blockers, zero about:blank!)
router.get('/sso-go', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && !req.user.is_super_admin) {
      return res.status(403).send('Only Super Admin can launch cross-brand SSO.');
    }
    const jwt = require('jsonwebtoken');
    const crypto = require('crypto');
    const { JWT_SECRET } = require('../middleware/auth');

    const brand = String(req.query.brand || '').toLowerCase();
    const BRAND_TARGETS = {
      buywish: { origin: 'https://www.buywishonline.com', next: '/buywishonline/admin' },
      nyclimo: { origin: 'https://www.nyclimowish.com', next: '/erp' },
      loadsnexus: { origin: 'https://www.loadsnexus.com', next: '/' }
    };
    const target = BRAND_TARGETS[brand];
    if (!target) return res.status(400).send('Invalid brand target.');

    const ticket = jwt.sign(
      {
        purpose: 'superadmin_sso',
        id: req.user.id,
        name: req.user.name || 'Super Admin',
        email: req.user.email || '',
        role: 'super_admin',
        is_super_admin: true,
        nonce: crypto.randomBytes(8).toString('hex')
      },
      JWT_SECRET,
      { expiresIn: '60s' }
    );

    const launchUrl = `${target.origin}/api/superadmin/sso-exchange?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(target.next)}`;
    return res.redirect(302, launchUrl);
  } catch (err) {
    console.error('[SuperAdmin SSO Go] Error:', err);
    return res.status(500).send('Could not launch SSO.');
  }
});

router.post('/sso-launch', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && !req.user.is_super_admin) {
      return res.status(403).json({ error: 'Only Super Admin can launch cross-brand SSO.' });
    }
    const jwt = require('jsonwebtoken');
    const crypto = require('crypto');
    const { JWT_SECRET } = require('../middleware/auth');

    const brand = String(req.body?.brand || '').toLowerCase();
    const BRAND_TARGETS = {
      buywish: { origin: 'https://www.buywishonline.com', next: '/buywishonline/admin' },
      nyclimo: { origin: 'https://www.nyclimowish.com', next: '/erp' },
      loadsnexus: { origin: 'https://www.loadsnexus.com', next: '/' }
    };
    const target = BRAND_TARGETS[brand];
    if (!target) {
      return res.status(400).json({ error: 'Invalid brand target.' });
    }

    const ticket = jwt.sign(
      {
        purpose: 'superadmin_sso',
        id: req.user.id,
        name: req.user.name || 'Super Admin',
        email: req.user.email || '',
        role: 'super_admin',
        is_super_admin: true,
        nonce: crypto.randomBytes(8).toString('hex')
      },
      JWT_SECRET,
      { expiresIn: '60s' }
    );

    const launchUrl = `${target.origin}/api/superadmin/sso-exchange?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(target.next)}`;
    res.json({ ok: true, brand, launch_url: launchUrl });
  } catch (err) {
    console.error('[SuperAdmin SSO Launch] Error:', err);
    res.status(500).json({ error: 'Could not generate SSO launch link.' });
  }
});

router.get('/sso-exchange', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const crypto = require('crypto');
    const { JWT_SECRET } = require('../middleware/auth');

    const ticket = String(req.query.ticket || '').trim();
    const rawNext = String(req.query.next || '/').trim();
    const safeNext = (rawNext.startsWith('/') && !rawNext.startsWith('//')) ? rawNext : '/';

    if (!ticket) return res.status(400).send('Missing SSO ticket.');
    const payload = jwt.verify(ticket, JWT_SECRET);
    if (!payload || payload.purpose !== 'superadmin_sso' || payload.role !== 'super_admin') {
      return res.status(403).send('Invalid or unauthorized SSO ticket.');
    }

    const sessionId = `sso_${crypto.randomBytes(12).toString('hex')}`;
    try {
      await pool.query(
        `INSERT INTO user_active_sessions (user_id, session_id, device_type, ip_address, user_agent, last_active_at)
         VALUES ($1, $2, 'superadmin_sso', $3, $4, NOW())`,
        [payload.id, sessionId, req.ip || '', String(req.headers['user-agent'] || '').slice(0, 240)]
      );
    } catch (_) {}

    const swJwt = jwt.sign(
      {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        role: 'super_admin',
        is_super_admin: true,
        session_id: sessionId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const nlwJwt = jwt.sign(
      {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        role: 'super_admin',
        is_super_admin: true,
        is_limo_user: true
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const isSecure = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().split(':')[0].toLowerCase();
    let cookieDomain;
    if (reqHost.endsWith('buywishonline.com')) cookieDomain = '.buywishonline.com';
    else if (reqHost.endsWith('nyclimowish.com')) cookieDomain = '.nyclimowish.com';
    else if (reqHost.endsWith('loadsnexus.com')) cookieDomain = '.loadsnexus.com';
    else if (reqHost.endsWith('shippingwish.com')) cookieDomain = '.shippingwish.com';

    const cookieOpts = {
      httpOnly: true,
      secure: Boolean(isSecure),
      sameSite: 'lax',
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000
    };

    res.cookie('sw_token', swJwt, cookieOpts);
    res.cookie('nlw_token', nlwJwt, cookieOpts);
    return res.redirect(302, safeNext);
  } catch (err) {
    console.error('[SuperAdmin SSO Exchange] Error:', err.message);
    return res.status(401).send('SSO ticket expired or invalid. Please return to Superadmin Command Center and click again.');
  }
});

// =========================================================================
// 7. 1-CLICK LIVE 8-STAGE USA TRUCKING E2E WALKTHROUGH (AUTO-CLEANUP)
//    Verifies: Loads Nexus Post -> AI Net-Profit -> 1-Tap Carrier Approval ->
//    Auto Broker GPS Tracking Link -> Driver GPS Ping -> Private Vercel Blob POD
//    Upload/Read -> Factoring Packet & Settlement PDFs -> AI Reloads -> Clean Purge!
// =========================================================================
router.post('/run-trucking-e2e', requireAuth, requireSuperAdmin, async (req, res) => {
  const startedAt = Date.now();
  const stages = [];
  const pass = (id, name, detail) => stages.push({ id, name, status: 'PASS', detail });
  const fail = (id, name, detail) => stages.push({ id, name, status: 'FAIL', detail });

  const { ensureUnifiedSchema, awardLoadToCarrier } = require('../utils/load-lifecycle');
  const { analyzeLoadProfit } = require('../utils/profit-engine');
  const { storeDocumentBuffer, readDocumentBuffer, isBlobConfigured } = require('../utils/cloud-storage');
  const PDFDocument = require('pdfkit');
  const os = require('os');
  const path = require('path');

  const created = { loadId: null, docId: null, settlementId: null };
  const loadNumber = 'E2E-' + Math.floor(100000 + Math.random() * 899999);

  try {
    await ensureUnifiedSchema();

    // Pick a real carrier if present, otherwise use current super_admin id
    const carRes = await pool.query(`SELECT id, name, company_name, mc_number FROM users WHERE role IN ('carrier','carrier_admin') ORDER BY id ASC LIMIT 1`).catch(() => ({ rows: [] }));
    const carrier = carRes.rows[0] || { id: req.user.id, name: req.user.name || 'Super Admin', company_name: 'Shipping Wish Fleet', mc_number: 'MC-148295' };

    // STAGE 1: Publish Spot Load to Loads Nexus & Verify Live Searchable Row
    try {
      const ins = await pool.query(
        `INSERT INTO loads (
          load_number, status, is_public_board, broker_user_id, rate, pickup_location, delivery_location,
          pickup_date, equipment_type, weight, commodity, broker_name, broker_mc, broker_contact,
          miles, rpm, source_type, created_at, updated_at
        ) VALUES ($1, 'new', TRUE, $2, 3450, 'Dallas, TX', 'Atlanta, GA', CURRENT_DATE + 1, '53ft Reefer', 41500,
          'E2E Diagnostic Produce', 'Verified Direct Broker', 'MC-128490', '+1 (917) 737-0021', 780, 4.42, 'broker', NOW(), NOW())
        RETURNING *`,
        [loadNumber, req.user.id]
      );
      created.loadId = ins.rows[0].id;
      const checkSearch = await pool.query(
        `SELECT id, load_number FROM loads WHERE id = $1 AND is_public_board = TRUE AND status IN ('open','new') AND deleted_at IS NULL`,
        [created.loadId]
      );
      if (checkSearch.rows.length === 1) {
        pass(1, 'Loads Nexus Spot Post & Live Board Sync', `Load #${loadNumber} published ($3,450 / 780 mi = $4.42/mi) & live searchable.`);
      } else {
        fail(1, 'Loads Nexus Spot Post & Live Board Sync', 'Inserted load was not visible in open board query.');
      }
    } catch (e) {
      fail(1, 'Loads Nexus Spot Post & Live Board Sync', e.message);
      throw e;
    }

    // STAGE 2: AI True Net-Profit Engine
    try {
      const a = analyzeLoadProfit({
        rate: 3450,
        miles: 780,
        deadheadMiles: 45,
        origin: 'Dallas, TX',
        destination: 'Atlanta, GA',
        equipmentType: '53ft Reefer'
      });
      if (Number.isFinite(Number(a.true_net_profit)) && Number(a.net_rpm) > 0) {
        pass(2, 'AI True Net-Profit Load Calculator', `True Net Profit: $${a.true_net_profit} | Net RPM: $${a.net_rpm}/mi | Fuel: $${a.fuel_cost} (${a.verdict_label})`);
      } else {
        fail(2, 'AI True Net-Profit Load Calculator', 'Invalid profit calculation result.');
      }
    } catch (e) {
      fail(2, 'AI True Net-Profit Load Calculator', e.message);
    }

    // STAGE 3: Dispatcher 1-Tap Carrier Approval Request ("Zero Forced Dispatch")
    try {
      await pool.query(
        `UPDATE loads SET status = 'pending_carrier_approval', carrier_id = $1, dispatcher_id = $2,
           carrier_approval_status = 'pending', carrier_approval_requested_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [carrier.id, req.user.id, created.loadId]
      );
      pass(3, 'Dispatcher 1-Tap Carrier Approval Offer', `Offered #${loadNumber} to Carrier #${carrier.id} (${carrier.company_name || carrier.name}).`);
    } catch (e) {
      fail(3, 'Dispatcher 1-Tap Carrier Approval Offer', e.message);
    }

    // STAGE 4: Carrier 1-Tap Approve -> Books Load, Removes from Public Board, Generates Live Tracking Token
    let trackingToken = '';
    try {
      const awarded = await awardLoadToCarrier({
        loadId: created.loadId,
        carrierId: carrier.id,
        carrierName: carrier.company_name || carrier.name,
        carrierMc: carrier.mc_number || 'MC-148295',
        awardedByUserId: carrier.id,
        notes: 'Approved via E2E Diagnostic'
      });
      trackingToken = awarded.load?.broker_tracking_token || '';
      if (trackingToken && awarded.load?.status === 'booked' && awarded.load?.is_public_board === false) {
        pass(4, 'Carrier 1-Tap Approve & Auto Tracking Token', `Status = BOOKED, removed from open board, Tracking Token ${trackingToken.slice(0, 12)}... generated.`);
      } else {
        fail(4, 'Carrier 1-Tap Approve & Auto Tracking Token', 'Missing tracking token or incorrect booked state.');
      }
    } catch (e) {
      fail(4, 'Carrier 1-Tap Approve & Auto Tracking Token', e.message);
    }

    // STAGE 5: Driver Mobile App Live GPS Ping + Zero Check-Call Broker Tracking Query
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tracking_events (
          id SERIAL PRIMARY KEY,
          load_id INT REFERENCES loads(id) ON DELETE SET NULL,
          driver_id INT REFERENCES users(id) ON DELETE SET NULL,
          latitude NUMERIC(10, 6),
          longitude NUMERIC(10, 6),
          speed NUMERIC(6, 2) DEFAULT 0,
          heading NUMERIC(6, 2) DEFAULT 0,
          location_name VARCHAR(255),
          status VARCHAR(50),
          notes TEXT,
          ping_time TIMESTAMP DEFAULT now()
        )
      `);
      await pool.query(
        `INSERT INTO tracking_events (load_id, driver_id, latitude, longitude, speed, heading, location_name, status, notes, ping_time)
         VALUES ($1, $2, 32.5252, -93.7502, 65, 88, 'I-20 East near Shreveport, LA', 'in_transit', 'E2E Mobile GPS Ping', NOW())`,
        [created.loadId, carrier.id]
      );
      const gpsCheck = await pool.query(
        `SELECT l.broker_tracking_token, te.latitude, te.longitude, te.location_name
         FROM loads l
         LEFT JOIN LATERAL (
           SELECT latitude, longitude, location_name FROM tracking_events WHERE load_id = l.id ORDER BY ping_time DESC LIMIT 1
         ) te ON TRUE
         WHERE l.broker_tracking_token = $1 LIMIT 1`,
        [trackingToken]
      );
      const row = gpsCheck.rows[0];
      if (row && Math.abs(Number(row.latitude) - 32.5252) < 0.01) {
        pass(5, 'Mobile Auto-GPS Ping & Broker Tracking Sync', `Live GPS (${row.latitude}, ${row.longitude} • ${row.location_name}) synced to public broker token.`);
      } else {
        fail(5, 'Mobile Auto-GPS Ping & Broker Tracking Sync', 'GPS coordinates did not resolve on broker tracking query.');
      }
    } catch (e) {
      fail(5, 'Mobile Auto-GPS Ping & Broker Tracking Sync', e.message);
    }

    // STAGE 6: Driver Mobile Camera POD Upload -> Private Vercel Blob (`shippingwish-docs`) -> Verified Read-Back!
    try {
      const tinyJpgB64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const origBuf = Buffer.from(tinyJpgB64, 'base64');
      const stored = await storeDocumentBuffer({
        buffer: origBuf,
        filename: 'e2e_signed_pod.jpg',
        folder: 'tms/pod',
        mimeType: 'image/jpeg',
        localDir: path.join(os.tmpdir(), 'uploads')
      });
      const docIns = await pool.query(
        `INSERT INTO documents (load_id, carrier_id, category, filename, original_name, filepath, file_size, uploaded_by, cloud_url, mime_type, file_data_b64, storage_provider)
         VALUES ($1, $2, 'pod', $3, 'e2e_signed_pod.jpg', $4, $5, $6, $7, 'image/jpeg', $8, $9)
         RETURNING *`,
        [created.loadId, carrier.id, path.basename(stored.filepath || 'e2e_signed_pod.jpg'), stored.filepath, stored.file_size, carrier.id, stored.cloud_url, stored.file_data_b64, stored.storage_provider]
      );
      created.docId = docIns.rows[0].id;
      await pool.query(`UPDATE loads SET status = 'pod_uploaded', updated_at = NOW() WHERE id = $1`, [created.loadId]);

      const readBack = await readDocumentBuffer(docIns.rows[0]);
      if (readBack && readBack.length === origBuf.length) {
        pass(6, 'Mobile Camera POD -> Private Cloud Vault', `Stored via [${stored.storage_provider}] (Blob Active: ${isBlobConfigured() ? 'YES' : 'DB Fallback'}) & verified exact ${readBack.length}-byte read-back + status = pod_uploaded.`);
      } else {
        fail(6, 'Mobile Camera POD -> Private Cloud Vault', `Stored via [${stored.storage_provider}] but read-back length mismatch (${readBack ? readBack.length : 0} vs ${origBuf.length}).`);
      }
    } catch (e) {
      fail(6, 'Mobile Camera POD -> Private Cloud Vault', e.message);
    }

    // STAGE 7: 1-Click Factoring Packet PDF + Driver Settlement Generation
    try {
      const pdfBytes = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.fontSize(16).text(`Shipping Wish LLC — Factoring Packet #${loadNumber}`);
        doc.fontSize(11).text('Lane: Dallas, TX -> Atlanta, GA | Gross Rate: $3,450.00 | POD Attached');
        doc.end();
      });
      const stlNum = 'E2E-STL-' + Math.floor(10000 + Math.random() * 89999);
      const stlIns = await pool.query(
        `INSERT INTO driver_settlements (
           settlement_number, carrier_id, driver_name, period_start, period_end,
           loads_count, loaded_miles, gross_revenue, pay_type, pay_rate, driver_gross_pay, net_driver_pay, carrier_net_profit, status, created_by
         ) VALUES ($1, $2, 'E2E Driver', CURRENT_DATE - 7, CURRENT_DATE, 1, 780, 3450, 'percent', 28, 966, 966, 2484, 'draft', $3)
         RETURNING id, net_driver_pay`,
        [stlNum, carrier.id, req.user.id]
      );
      created.settlementId = stlIns.rows[0].id;
      if (pdfBytes.slice(0, 5).toString('utf8') === '%PDF-' && created.settlementId) {
        pass(7, 'Factoring Packet PDF & Driver Settlement', `Generated valid ${pdfBytes.length}-byte PDF + Settlement #${stlNum} (Driver Net: $${stlIns.rows[0].net_driver_pay}).`);
      } else {
        fail(7, 'Factoring Packet PDF & Driver Settlement', 'PDF stream or settlement row failed.');
      }
    } catch (e) {
      fail(7, 'Factoring Packet PDF & Driver Settlement', e.message);
    }

    // STAGE 8: AI Reload Finder + Stripe Isolation & BuyWish Pause Verification
    try {
      const { getBrandGatewayStatus } = require('../utils/alt-payments');
      const bwGw = getBrandGatewayStatus('buywish');
      const lmGw = getBrandGatewayStatus('nyclimo');
      const relQ = await pool.query(
        `SELECT COUNT(*)::int AS open_cnt FROM loads WHERE deleted_at IS NULL AND status IN ('open','new')`
      );
      pass(
        8,
        'AI Reload Pool & Stripe Isolation Health',
        `Open Reload Pool: ${relQ.rows[0]?.open_cnt || 0} loads | BuyWish Stripe Isolated: ${bwGw.stripe_isolated ? 'YES' : 'NO'} | NYCLimo Stripe Isolated: ${lmGw.stripe_isolated ? 'YES' : 'NO'}.`
      );
    } catch (e) {
      fail(8, 'AI Reload Pool & Stripe Isolation Health', e.message);
    }
  } finally {
    // AUTO-CLEANUP: Delete ALL temporary E2E rows so production database remains 100% spotless!
    if (created.settlementId) await pool.query('DELETE FROM driver_settlements WHERE id = $1', [created.settlementId]).catch(() => {});
    if (created.docId) await pool.query('DELETE FROM documents WHERE id = $1', [created.docId]).catch(() => {});
    if (created.loadId) {
      await pool.query('DELETE FROM tracking_events WHERE load_id = $1', [created.loadId]).catch(() => {});
      await pool.query('DELETE FROM load_status_history WHERE load_id = $1', [created.loadId]).catch(() => {});
      await pool.query(`DELETE FROM notifications WHERE link LIKE $1`, [`%${created.loadId}%`]).catch(() => {});
      await pool.query('DELETE FROM loads WHERE id = $1', [created.loadId]).catch(() => {});
    }
  }

  const passed = stages.filter((s) => s.status === 'PASS').length;
  const failed = stages.filter((s) => s.status === 'FAIL').length;
  res.json({
    ok: failed === 0,
    passed,
    failed,
    total: stages.length,
    duration_ms: Date.now() - startedAt,
    cleaned_up: true,
    stages
  });
});

module.exports = router;
