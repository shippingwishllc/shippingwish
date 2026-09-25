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
        shipping_city TEXT,
        shipping_state TEXT,
        items JSONB NOT NULL DEFAULT '[]',
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        cost_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        profit_margin NUMERIC(10,2) NOT NULL DEFAULT 0,
        supplier TEXT NOT NULL DEFAULT 'Zendrop',
        supplier_order_id TEXT,
        supplier_tracking_number TEXT,
        fulfillment_status TEXT NOT NULL DEFAULT 'processing',
        payment_status TEXT NOT NULL DEFAULT 'paid',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
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

    // Do not seed synthetic audit history, limo rides, carriers, trucks, freight loads, or billing subscriptions.

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
      WHERE plan_key NOT LIKE 'loadboard_%'
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
        // Convert weekly to monthly (weekly * 4.33)
        swWeeklyMrrCents += (amt * cnt * 4.33);
      } else if (r.status === 'past_due' || r.status === 'incomplete') {
        swPastDueSubsCount += cnt;
      }
    });

    // Invoices Paid / Revenue
    const invQuery = await pool.query(`
      SELECT 
        count(*) as total_invoices,
        count(*) FILTER (WHERE status = 'paid') as paid_count,
        count(*) FILTER (WHERE status = 'pending' OR status = 'sent') as pending_count,
        coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
        coalesce(sum(amount) FILTER (WHERE status = 'pending' OR status = 'sent'), 0) as pending_amount
      FROM invoices
    `).catch(() => ({ rows: [{ total_invoices: 0, paid_count: 0, pending_count: 0, paid_amount: 0, pending_amount: 0 }] }));

    const invoiceStats = invQuery.rows[0];

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
      LEFT JOIN trucks t ON t.carrier_id = u.id
      WHERE u.role IN ('carrier', 'carrier_admin') AND u.deleted_at IS NULL
      GROUP BY u.id, u.name, u.company_name, u.email, u.phone, u.mc_number, u.dot_number, u.weekly_plan, u.created_at
      ORDER BY u.created_at DESC
      LIMIT 25
    `).catch(() => ({ rows: [] }));

    // Fleet Trucks Status: Booked vs Empty vs Unloading Tomorrow
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
      ORDER BY t.id DESC
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    let trucksBooked = 0;
    let trucksEmpty = 0;
    let trucksUnloadingTomorrow = 0;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    trucksQuery.rows.forEach(t => {
      const st = String(t.dispatch_status || t.status || 'empty').toLowerCase();
      const nextDate = t.next_available_date ? new Date(t.next_available_date).toISOString().slice(0, 10) : '';
      if (st === 'booked' || st === 'dispatched' || st === 'in_transit') {
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
        COALESCE(c.company_name, c.name, 'Unassigned Carrier') as carrier_company,
        COALESCE(d.name, 'Unassigned Dispatcher') as dispatcher_name,
        COALESCE(l.broker_name, 'Direct Broker') as broker_name,
        COALESCE(l.pickup_location, 'Origin') as pickup_location,
        l.pickup_state,
        COALESCE(l.delivery_location, 'Destination') as delivery_location,
        l.delivery_state,
        COALESCE(l.rate, 0) as rate,
        l.status,
        l.equipment_type,
        l.created_at
      FROM loads l
      LEFT JOIN users c ON c.id = l.carrier_id
      LEFT JOIN users d ON d.id = l.dispatcher_id
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
      WHERE plan_key LIKE 'loadboard_%'
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

    // Registered Brokers
    const brokersQuery = await pool.query(`
      SELECT count(*) as total_brokers FROM users WHERE role = 'broker' AND deleted_at IS NULL
    `).catch(() => ({ rows: [{ total_brokers: 0 }] }));

    // Loads Metrics
    const loadsStatsQuery = await pool.query(`
      SELECT 
        count(*) as total_loads,
        count(*) FILTER (WHERE status::text = 'new') as available_loads,
        count(*) FILTER (WHERE status::text IN ('booked', 'covered', 'delivered', 'in_transit', 'dispatched', 'paid')) as covered_loads,
        coalesce(sum(rate) FILTER (WHERE rate > 0), 0) as total_freight_valuation
      FROM loads
    `).catch(() => ({ rows: [{ total_loads: 0, available_loads: 0, covered_loads: 0, total_freight_valuation: 0 }] }));

    const loadStats = loadsStatsQuery.rows[0];

    // Recent Active Loads
    const recentLoads = await pool.query(`
      SELECT 
        id,
        load_number,
        COALESCE(pickup_location, 'Chicago, IL') as origin,
        COALESCE(delivery_location, 'Atlanta, GA') as destination,
        equipment_type,
        rate,
        miles,
        status,
        pickup_date,
        delivery_date,
        broker_name
      FROM loads
      ORDER BY id DESC
      LIMIT 20
    `).catch(() => ({ rows: [] }));

    // ---------------------------------------------------------
    // C. NYC LIMO WISH (nyclimowish.com)
    // ---------------------------------------------------------
    const limoStatsQuery = await pool.query(`
      SELECT 
        count(*) as total_bookings,
        count(*) FILTER (WHERE status = 'pending') as pending_count,
        count(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        count(*) FILTER (WHERE status = 'completed') as completed_count,
        count(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        coalesce(sum(total_price) FILTER (WHERE payment_status = 'paid' OR status = 'completed'), 0) as total_revenue
      FROM limo_bookings
    `).catch(() => ({ rows: [{ total_bookings: 0, pending_count: 0, confirmed_count: 0, completed_count: 0, cancelled_count: 0, total_revenue: 0 }] }));

    const limoStats = limoStatsQuery.rows[0];

    const recentLimoBookings = await pool.query(`
      SELECT 
        id, booking_number, service_type, pickup_address, dropoff_address,
        pickup_date, pickup_time, passenger_first_name, passenger_last_name,
        passenger_phone, passenger_email, vehicle_id, total_price, status, payment_status, created_at
      FROM limo_bookings
      ORDER BY id DESC
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    // ---------------------------------------------------------
    // D. BUYWISHONLINE (buywishonline.com)
    // ---------------------------------------------------------
    const ecomStatsQuery = await pool.query(`
      SELECT 
        count(*) as total_orders,
        count(*) FILTER (WHERE fulfillment_status = 'processing') as processing_count,
        count(*) FILTER (WHERE fulfillment_status = 'in_transit') as shipping_count,
        count(*) FILTER (WHERE fulfillment_status = 'delivered') as delivered_count,
        count(*) FILTER (WHERE fulfillment_status = 'cancelled') as cancelled_count,
        coalesce(sum(total_amount), 0) as total_sales,
        coalesce(sum(profit_margin), 0) as total_profit
      FROM ecommerce_orders
    `).catch(() => ({ rows: [{ total_orders: 0, processing_count: 0, shipping_count: 0, delivered_count: 0, cancelled_count: 0, total_sales: 0, total_profit: 0 }] }));

    const ecomStats = ecomStatsQuery.rows[0];

    const recentEcomOrders = await pool.query(`
      SELECT 
        id, order_number, customer_name, customer_email, shipping_city, shipping_state,
        items, total_amount, profit_margin, supplier, supplier_tracking_number, fulfillment_status, created_at
      FROM ecommerce_orders
      ORDER BY id DESC
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    const winningProducts = await pool.query(`
      SELECT * FROM ecommerce_products WHERE is_active = true ORDER BY trend_score DESC LIMIT 10
    `).catch(() => ({ rows: [] }));

    // ---------------------------------------------------------
    // COMBINED EXECUTIVE TOTALS
    // ---------------------------------------------------------
    const totalEmpireMrrDollars = Math.round((swWeeklyMrrCents + lnMrrCents) / 100);
    const totalGrossVolumeDollars = Math.round(
      parseFloat(invoiceStats.paid_amount || 0) +
      parseFloat(limoStats.total_revenue || 0) +
      parseFloat(ecomStats.total_sales || 0) +
      (parseFloat(loadStats.total_freight_valuation || 0) * 0.10) // 10% brokerage commission
    );

    // Stripe accounts operational health
    const stripeHealth = {
      shipping_wish: {
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        mode: (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'LIVE PRODUCTION' : 'TEST MODE',
        account: 'Shipping Wish LLC'
      },
      loads_nexus: {
        configured: Boolean(process.env.STRIPE_LOADSNEXUS_SECRET_KEY || process.env.STRIPE_SECRET_KEY),
        mode: (process.env.STRIPE_LOADSNEXUS_SECRET_KEY || '').startsWith('sk_live_') ? 'LIVE PRODUCTION' : 'TEST / UNDER REVIEW',
        account: 'LoadsNexus Dedicated'
      }
    };

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stripe_health: stripeHealth,
      executive_summary: {
        total_empire_mrr_dollars: totalEmpireMrrDollars,
        total_subscribers: swActiveSubsCount + lnActiveSubsCount,
        total_gross_volume_dollars: totalGrossVolumeDollars,
        total_trucks: trucksQuery.rows.length,
        trucks_booked: trucksBooked,
        trucks_empty: trucksEmpty,
        trucks_unloading_tomorrow: trucksUnloadingTomorrow,
        active_loads_valuation: parseFloat(loadStats.total_freight_valuation || 0),
        total_limo_rides: parseInt(limoStats.total_bookings, 10),
        total_ecom_orders: parseInt(ecomStats.total_orders, 10)
      },
      shipping_wish: {
        active_subscribers: swActiveSubsCount,
        past_due_subscribers: swPastDueSubsCount,
        mrr_dollars: Math.round(swWeeklyMrrCents / 100),
        total_invoices_paid_dollars: parseFloat(invoiceStats.paid_amount || 0),
        total_invoices_pending_dollars: parseFloat(invoiceStats.pending_amount || 0),
        onboarded_carriers: carriersQuery.rows,
        fleet_trucks: trucksQuery.rows,
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
        total_brokers: parseInt(brokersQuery.rows[0].total_brokers, 10),
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
        total_orders: parseInt(ecomStats.total_orders, 10),
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
    const safeEmail = email && email.trim() ? email.trim() : `carrier_${Date.now()}@shippingwish.com`;
    const hash = await bcrypt.hash('CarrierPass2026!', 10);

    const userRes = await client.query(`
      INSERT INTO users (name, company_name, email, phone, mc_number, dot_number, role, weekly_plan, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6, 'carrier', $7, $8)
      ON CONFLICT (email) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        phone = EXCLUDED.phone,
        mc_number = EXCLUDED.mc_number,
        weekly_plan = EXCLUDED.weekly_plan
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
    res.json({ ok: true, message: `Carrier "${company_name}" onboarded successfully with fleet unit.` });
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
  const { truck_id, status, next_available_date, next_available_city } = req.body;
  if (!truck_id || !status) {
    return res.status(400).json({ error: 'Truck ID and status are required.' });
  }

  const validStatuses = ['empty', 'booked', 'unloading_tomorrow', 'maintenance'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: ' + validStatuses.join(', ') });
  }

  try {
    await pool.query(`
      UPDATE trucks SET
        dispatch_status = $1,
        next_available_date = COALESCE($2, next_available_date),
        next_available_city = COALESCE($3, next_available_city)
      WHERE id = $4
    `, [status, next_available_date || null, next_available_city || null, truck_id]);

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
      broker_phone || '(800) 555-0199',
      broker_mc || 'MC-889102',
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
      phone || '(212) 555-0100',
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
    // Find all empty or unloading tomorrow trucks
    const emptyTrucks = await pool.query(`
      SELECT t.id, t.unit_number, t.truck_number, t.equipment_type, t.next_available_city, u.company_name, u.phone
      FROM trucks t
      JOIN users u ON u.id = t.carrier_id
      WHERE coalesce(t.dispatch_status, 'empty') IN ('empty', 'unloading_tomorrow')
      LIMIT 15
    `).catch(() => ({ rows: [] }));

    // Find live available loads
    const liveLoads = await pool.query(`
      SELECT id, load_number,
        COALESCE(pickup_location, 'Chicago, IL') as origin,
        COALESCE(delivery_location, 'Atlanta, GA') as destination,
        equipment_type, rate, miles, broker_name
      FROM loads
      WHERE status::text = 'new'
      LIMIT 30
    `).catch(() => ({ rows: [] }));

    // AI heuristic matching by equipment compatibility and location
    const matches = [];
    emptyTrucks.rows.forEach(truck => {
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
            phone: truck.phone || '(800) 555-0100',
            location: truck.next_available_city || 'Regional Hub'
          },
          recommended_load: candidates[0],
          alternate_loads_count: Math.max(0, candidates.length - 1)
        });
      }
    });

    res.json({
      ok: true,
      total_empty_trucks: emptyTrucks.rows.length,
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
        subject: '🚀 Eliminate Deadhead: Dedicated Fleet Operations for Your Trucks ($0 First Week)',
        headline: 'Keep Your Trucks Rolling at Peak RPM Every Day',
        body: 'Top owner operators spend 15+ hours a week chasing rate cons, negotiating broker packets, and fighting for detention pay. Shipping Wish assigns you a named 24/7 dedicated dispatch operations desk to book top-dollar spot freight with ZERO percentage cuts from your rate. Keep 100% of your freight pay. Try 7 days completely free.',
        cta: 'Claim Your 7-Day Free Operations Desk'
      },
      sms: 'Shipping Wish Ops: Need high-paying reloads this week? We book direct shipper and broker freight with 0% cut. Start 7 days free: shippingwish.com/signup',
      social: '🚛 Why pay 10% dispatch fees? Shipping Wish provides full enterprise TMS, named fleet managers, and high-RPM lane strategy for a flat weekly retainer. You keep 100% of broker freight pay. Claim your 7-day free trial today.'
    },
    loadsnexus: {
      email: {
        subject: '⚡ Stop Paying $150/mo for Slow Load Boards — AI Spot Freight at $19/mo',
        headline: 'Instant 50-State Live Freight with Unmasked Broker Contacts',
        body: 'Tired of stale DAT postings and hidden phone numbers? LoadsNexus AI scans 50 states for high-RPM spot freight, reveals direct broker contact info unmasked, and provides instant FMCSA credit check and $75k bond verification. Start self-dispatching today for only $19/month.',
        cta: 'Activate $19 Solo Pass Now'
      },
      sms: 'LoadsNexus: 50-State spot freight with direct broker phone numbers & credit scores. Only $19/mo. Sign in now: loadsnexus.com/login',
      social: '🔥 Disruping freight tech: LoadsNexus gives carriers unlimited AI load search, unmasked broker contacts, and FMCSA credit scores for just $19/mo. 1 Workstation + 1 Driver Mobile single-device guard included.'
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

module.exports = router;
