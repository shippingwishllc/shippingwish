const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');
const { escapeHtml, COMPANY } = require('../utils/email-templates');

// Ensure tables & columns for multi-brand executive operations
let tablesInitialized = false;
async function ensureSuperAdminTables() {
  if (tablesInitialized) return;
  try {
    // Trucks fleet dispatch status columns
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
    `).catch(() => {});

    // BuyWishOnline E-Commerce Orders
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

    // BuyWishOnline AI Product Hunting Catalog
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

    // Seed mock data for e-commerce if empty so SuperAdmin dashboard has live metrics immediately
    const checkEcom = await pool.query('SELECT COUNT(*) FROM ecommerce_orders');
    if (parseInt(checkEcom.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO ecommerce_orders (order_number, customer_name, customer_email, customer_phone, shipping_city, shipping_state, items, total_amount, cost_amount, profit_margin, supplier, supplier_tracking_number, fulfillment_status, payment_status, created_at)
        VALUES
        ('BWO-89102', 'Sarah Jenkins', 's.jenkins@gmail.com', '(512) 555-0142', 'Austin', 'TX', '[{"title":"Smart Multi-Angle Car Phone Mount","qty":2,"price":29.99}]', 59.98, 18.00, 41.98, 'Zendrop', 'ZD9841209US', 'in_transit', 'paid', NOW() - INTERVAL '1 day'),
        ('BWO-89103', 'Marcus Vance', 'mvance99@outlook.com', '(718) 555-8821', 'Brooklyn', 'NY', '[{"title":"Cordless Deep Tissue Muscle Gun","qty":1,"price":79.99}]', 79.99, 28.50, 51.49, 'Zendrop', 'ZD9841255US', 'processing', 'paid', NOW() - INTERVAL '4 hours'),
        ('BWO-89104', 'Elena Rostova', 'elena.rostova@yahoo.com', '(305) 555-3910', 'Miami', 'FL', '[{"title":"RGB Ambient Smart LED Light Bar","qty":3,"price":34.99}]', 104.97, 36.00, 68.97, 'Zendrop', 'ZD9841108US', 'delivered', 'paid', NOW() - INTERVAL '3 days'),
        ('BWO-89105', 'David Kim', 'dkim_logistics@gmail.com', '(206) 555-7124', 'Seattle', 'WA', '[{"title":"Ultra-Fast Wireless Charging Pad Pro","qty":1,"price":39.99}]', 39.99, 12.00, 27.99, 'Zendrop', 'ZD9841399US', 'in_transit', 'paid', NOW() - INTERVAL '12 hours')
      `).catch(() => {});

      await pool.query(`
        INSERT INTO ecommerce_products (title, handle, description, category, retail_price, supplier_cost, estimated_margin, trend_score, source, image_url)
        VALUES
        ('Cordless Deep Tissue Muscle Gun', 'cordless-muscle-gun', 'High-torque percussion therapy with 6 speed levels.', 'Fitness & Health', 79.99, 28.50, 64.37, 98, 'Zendrop AI Hunter', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=400&q=80'),
        ('Smart Multi-Angle Car Phone Mount', 'smart-car-mount', 'Auto-clamping Qi-enabled wireless induction car charger.', 'Automotive', 29.99, 9.00, 69.99, 94, 'Zendrop AI Hunter', 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=400&q=80'),
        ('RGB Ambient Smart LED Light Bar', 'rgb-light-bar', 'Sound sync gaming and studio accent lighting.', 'Electronics', 34.99, 12.00, 65.70, 91, 'Zendrop AI Hunter', 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80'),
        ('Heavy-Duty Tactical Cargo Organizer', 'tactical-cargo-organizer', 'Foldable waterproof organizer for trucks and SUVs.', 'Automotive & Freight', 49.99, 16.50, 66.99, 89, 'Zendrop AI Hunter', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80')
        ON CONFLICT (handle) DO NOTHING
      `).catch(() => {});
    }

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
        count(*) FILTER (WHERE status = 'available' OR status = 'posted') as available_loads,
        count(*) FILTER (WHERE status = 'booked' OR status = 'covered' OR status = 'delivered') as covered_loads,
        coalesce(sum(rate) FILTER (WHERE rate > 0), 0) as total_freight_valuation
      FROM loads
    `).catch(() => ({ rows: [{ total_loads: 0, available_loads: 0, covered_loads: 0, total_freight_valuation: 0 }] }));

    const loadStats = loadsStatsQuery.rows[0];

    // Recent Active Loads
    const recentLoads = await pool.query(`
      SELECT 
        id, load_number, origin_city, origin_state, destination_city, destination_state,
        equipment_type, rate, miles, status, pickup_date, delivery_date, broker_name
      FROM loads
      ORDER BY id DESC
      LIMIT 15
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
      LIMIT 10
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
      LIMIT 10
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

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
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
        }
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
// 2. TRUCK STATUS TOGGLE (Empty / Booked / Unloading Tomorrow)
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
        next_available_city = COALESCE($3, next_available_city),
        updated_at = now()
      WHERE id = $4
    `, [status, next_available_date || null, next_available_city || null, truck_id]);

    res.json({ ok: true, message: `Truck #${truck_id} status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not update truck status.' });
  }
});

// -------------------------------------------------------------
// 3. NYC LIMO WISH BOOKING STATUS UPDATE
// -------------------------------------------------------------
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
// 4. BUYWISHONLINE ORDER STATUS & ZENDROP FULFILLMENT
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
// 5. CROSS-BRAND AI CARRIER-LOAD MATCHMAKER
// -------------------------------------------------------------
router.post('/ai/match-loads', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // Find all empty trucks
    const emptyTrucks = await pool.query(`
      SELECT t.id, t.unit_number, t.equipment_type, t.next_available_city, u.company_name, u.phone
      FROM trucks t
      JOIN users u ON u.id = t.carrier_id
      WHERE coalesce(t.dispatch_status, 'empty') IN ('empty', 'unloading_tomorrow')
      LIMIT 10
    `).catch(() => ({ rows: [] }));

    // Find live available loads
    const liveLoads = await pool.query(`
      SELECT id, load_number, origin_city, origin_state, destination_city, destination_state, equipment_type, rate, miles, broker_name
      FROM loads
      WHERE status IN ('available', 'posted')
      LIMIT 20
    `).catch(() => ({ rows: [] }));

    // Simple AI heuristic matching by equipment or geographic proximity
    const matches = [];
    emptyTrucks.rows.forEach(truck => {
      const candidates = liveLoads.rows.filter(load => {
        if (!truck.equipment_type || !load.equipment_type) return true;
        return String(truck.equipment_type).toLowerCase() === String(load.equipment_type).toLowerCase();
      });

      if (candidates.length) {
        matches.push({
          truck: {
            id: truck.id,
            unit: truck.unit_number,
            equipment: truck.equipment_type || 'Dry Van',
            carrier: truck.company_name,
            phone: truck.phone,
            location: truck.next_available_city || 'Regional Hub'
          },
          recommended_load: candidates[0],
          alternate_loads_count: candidates.length - 1
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
// 6. CROSS-BRAND AI MARKETING CAMPAIGN GENERATOR
// -------------------------------------------------------------
router.post('/ai/generate-marketing', requireAuth, requireSuperAdmin, async (req, res) => {
  const { brand, channel, audience } = req.body;
  const targetBrand = brand || 'shippingwish';
  const targetChannel = channel || 'email'; // email, sms, social

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
