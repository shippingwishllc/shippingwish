/**
 * BuyWishOnline E-Commerce API — Zendrop Integration
 * Full product catalog, trending, categories, shipping estimates,
 * checkout with auto-fulfillment, order tracking
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requireRole, JWT_SECRET, extractToken } = require('../middleware/auth');
const { zendropCall, zendropListTools } = require('../utils/zendrop-client');
const {
  TARGET_COUNTRIES,
  WINNING_SEARCHES,
  departmentByQuery,
  normalizeProduct,
  summarizeLane,
  scoreProduct,
  qualifiesForStore,
  deliveryLabel,
  productHandle,
  storeProductFromRow
} = require('../utils/buywish-catalog');
const { selectOrderTool, buildOrderArguments, extractOrderId } = require('../utils/buywish-fulfillment');
const buyWishAdmin = [requireAuth, requireRole('admin')];

// ============================================================
// IN-MEMORY CACHE (15 minutes for catalog, 5 min for trending)
// ============================================================
const cache = {};
function getCache(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expires) { delete cache[key]; return null; }
  return entry.data;
}
function setCache(key, data, ttlMs) {
  cache[key] = { data, expires: Date.now() + ttlMs };
}

let buyWishSchemaReady = false;
async function ensureBuyWishSchema() {
  if (buyWishSchemaReady) return;
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
      supplier TEXT NOT NULL DEFAULT 'Zendrop',
      zendrop_order_id TEXT,
      supplier_tracking_number TEXT,
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      fulfillment_status TEXT NOT NULL DEFAULT 'awaiting_payment',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ecommerce_products (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      description TEXT,
      category TEXT,
      retail_price NUMERIC(10,2) NOT NULL,
      supplier_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      estimated_margin NUMERIC(5,2),
      trend_score INTEGER DEFAULT 0,
      source TEXT DEFAULT 'Zendrop',
      image_url TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS zendrop_id TEXT;
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS compare_price NUMERIC(10,2);
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS badge TEXT;
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS ships_to JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS delivery_label TEXT;
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS winning_score INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS import_status TEXT;
    ALTER TABLE ecommerce_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ecom_products_zendrop_id ON ecommerce_products (zendrop_id);

    CREATE TABLE IF NOT EXISTS buywish_customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS shipping_country TEXT;
    ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS shipping_postal TEXT;
    ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS shipping_line2 TEXT;
    ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS customer_id INTEGER;
    ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS zendrop_sync_status TEXT;
    ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS zendrop_sync_detail TEXT;
  `);
  buyWishSchemaReady = true;
}

function signCustomer(customer) {
  return jwt.sign(
    { id: customer.id, email: customer.email, role: 'buywish_customer', typ: 'buywish' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function readCustomer(req) {
  const token = extractToken(req) || (req.cookies && req.cookies.bwo_token);
  if (!token || !JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.typ !== 'buywish' || payload.role !== 'buywish_customer') return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function requireCustomer(req, res, next) {
  const customer = readCustomer(req);
  if (!customer) return res.status(401).json({ error: 'Sign in to view your BuyWish account.' });
  req.customer = customer;
  next();
}

const accountHits = new Map();
function accountRateLimit(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() || 'local';
  const now = Date.now();
  const hits = (accountHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= 20) return res.status(429).json({ error: 'Too many account attempts. Please wait a few minutes.' });
  hits.push(now);
  accountHits.set(ip, hits);
  next();
}

async function listSyncedProducts({ category, search, limit, page }) {
  await ensureBuyWishSchema();
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 48);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (pageNum - 1) * perPage;
  const params = [];
  const where = ['is_active = true', 'zendrop_id IS NOT NULL'];
  if (category && category !== 'all') {
    params.push(category);
    where.push(`lower(category) = lower($${params.length})`);
  }
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length} OR category ILIKE $${params.length})`);
  }
  const whereSql = where.join(' AND ');
  const totalRes = await pool.query(`SELECT count(*)::int AS total FROM ecommerce_products WHERE ${whereSql}`, params);
  const rows = await pool.query(
    `SELECT * FROM ecommerce_products WHERE ${whereSql}
     ORDER BY winning_score DESC, trend_score DESC, updated_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, perPage, offset]
  );
  return {
    products: rows.rows.map(storeProductFromRow),
    total: totalRes.rows[0] ? totalRes.rows[0].total : 0,
    page: pageNum,
    per_page: perPage
  };
}

async function fetchDepartmentProducts(department, { search, limit, page }) {
  const byId = new Map();
  const queries = search && String(search).trim()
    ? [String(search).trim()]
    : department.searches;
  await Promise.all(queries.map(async (q) => {
    try {
      const data = await zendropCall('get_catalog_products', { search: q, limit: 16 }, { timeoutMs: 8000 });
      (data.products || []).forEach((product) => {
        const normalized = normalizeProduct(product);
        if (!normalized.id || byId.has(String(normalized.id))) return;
        normalized.category = department.key;
        byId.set(String(normalized.id), normalized);
      });
    } catch (err) {
      // One Zendrop search can fail without emptying the department page.
    }
  }));
  const products = [...byId.values()];
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 48);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (pageNum - 1) * perPage;
  return {
    products: products.slice(offset, offset + perPage),
    total: products.length,
    page: pageNum,
    per_page: perPage
  };
}

// ============================================================
// GET /api/buywish/products — Live Zendrop Catalog
// ============================================================
router.get('/products', async (req, res) => {
  try {
    const { category, search, limit = 24, page = 1, sort = 'trending', source } = req.query;
    const department = departmentByQuery(category);
    if (department) {
      const deptKey = `dept_${department.key}_${search || ''}_${page}_${limit}`;
      const deptCached = getCache(deptKey);
      if (deptCached) return res.json({ ok: true, ...deptCached, source: 'cache' });
      const found = await fetchDepartmentProducts(department, { search, limit, page });
      if (found.products.length) {
        setCache(deptKey, found, 10 * 60 * 1000);
        return res.json({ ok: true, ...found, source: 'zendrop', category: department.title });
      }
    }
    if (source !== 'live') {
      try {
        await ensureBuyWishSchema();
        const stocked = await pool.query(
          `SELECT count(*)::int AS total FROM ecommerce_products WHERE is_active = true AND zendrop_id IS NOT NULL`
        );
        if (stocked.rows[0] && stocked.rows[0].total > 0) {
          const synced = await listSyncedProducts({ category, search, limit, page });
          return res.json({ ok: true, ...synced, source: 'catalog' });
        }
      } catch (dbErr) {
        console.error('[BUYWISH CATALOG READ]:', dbErr.message);
      }
    }
    const cacheKey = `products_${category || 'all'}_${search || ''}_${page}_${sort}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ok: true, products: cached.products, total: cached.total, page: cached.page, per_page: cached.per_page, source: 'cache' });

    let products = [];

    // Fetch from Zendrop
    if (sort === 'trending' || !sort) {
      // Get trending products
      const trendingData = await zendropCall('get_catalog_trending_products', { limit: 50 });
      if (trendingData && trendingData.products) {
        products = trendingData.products.map(normalizeProduct);
      }
    }

    // Also get "my products" (user's imported products)
    try {
      const myProducts = await zendropCall('get_my_products', { limit: 50 });
      if (myProducts && myProducts.products && myProducts.products.length > 0) {
        const normalized = myProducts.products.map(p => normalizeProduct({ ...p, is_trending: false }));
        // Merge, dedup by id
        const existingIds = new Set(products.map(p => p.id));
        normalized.forEach(p => { if (!existingIds.has(p.id)) products.push(p); });
      }
    } catch (e) {
      // My products is optional
    }

    // Filter by category
    if (category && category !== 'all') {
      products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }

    // Filter by search
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      products = products.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }

    // Pagination
    const perPage = Math.min(parseInt(limit, 10) || 24, 48);
    const offset = (parseInt(page, 10) - 1) * perPage;
    const total = products.length;
    const paginated = products.slice(offset, offset + perPage);

    const payload = { products: paginated, total, page: parseInt(page, 10), per_page: perPage };
    setCache(cacheKey, payload, 15 * 60 * 1000); // 15 min cache
    res.json({ ok: true, ...payload, source: 'zendrop' });
  } catch (err) {
    console.error('[BUYWISH PRODUCTS ERROR]:', err.message);
    // Fallback: try database
    try {
      const { rows } = await pool.query(`SELECT * FROM ecommerce_products WHERE is_active = true ORDER BY trend_score DESC LIMIT 24`);
      res.json({ ok: true, products: rows, source: 'database' });
    } catch (dbErr) {
      res.json({ ok: true, products: [], error: 'Could not load catalog.', source: 'error' });
    }
  }
});

// ============================================================
// GET /api/buywish/products/trending — Top Trending
// ============================================================
router.get('/products/trending', async (req, res) => {
  try {
    const cached = getCache('trending');
    if (cached) return res.json({ ok: true, products: cached });

    const data = await zendropCall('get_catalog_trending_products', { limit: 20 });
    const products = (data.products || []).map(p => normalizeProduct({ ...p, is_trending: true, badge: 'hot' }));

    setCache('trending', products, 5 * 60 * 1000); // 5 min cache
    res.json({ ok: true, products });
  } catch (err) {
    res.status(500).json({ error: 'Could not load trending products.' });
  }
});

// ============================================================
// GET /api/buywish/products/categories — Available Categories
// ============================================================
router.get('/products/categories', async (req, res) => {
  try {
    await ensureBuyWishSchema();
    const synced = await pool.query(`
      SELECT category AS name, count(*)::int AS count
      FROM ecommerce_products
      WHERE is_active = true AND zendrop_id IS NOT NULL
      GROUP BY category
      ORDER BY count DESC, category ASC
    `);
    if (synced.rows.length) return res.json({ ok: true, categories: synced.rows, source: 'catalog' });
    const cached = getCache('categories');
    if (cached) return res.json({ ok: true, categories: cached });

    const data = await zendropCall('get_catalog_categories', {});
    const cats = data.categories || data || [];

    setCache('categories', cats, 60 * 60 * 1000); // 1 hour
    res.json({ ok: true, categories: cats });
  } catch (err) {
    res.json({ ok: true, categories: [] });
  }
});

// ============================================================
// GET /api/buywish/products/:id — Single Product Detail
// ============================================================
router.get('/products/:id', async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  if (!productId) return res.status(400).json({ error: 'Invalid product ID.' });

  try {
    try {
      await ensureBuyWishSchema();
      const found = await pool.query(
        `SELECT * FROM ecommerce_products WHERE zendrop_id = $1 AND is_active = true LIMIT 1`,
        [String(productId)]
      );
      if (found.rows.length) return res.json({ ok: true, product: storeProductFromRow(found.rows[0]), source: 'catalog' });
    } catch (dbErr) {
      // Live Zendrop remains the fallback when the catalog table is unavailable.
    }
    const cacheKey = `product_${productId}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ok: true, product: cached });

    const data = await zendropCall('get_catalog_product', { product_id: productId });
    const product = normalizeProduct(data);

    setCache(cacheKey, product, 30 * 60 * 1000); // 30 min
    res.json({ ok: true, product });
  } catch (err) {
    res.status(404).json({ error: 'Product not found.' });
  }
});

// ============================================================
// POST /api/buywish/shipping/estimate — Shipping Cost by Country
// ============================================================
router.post('/shipping/estimate', async (req, res) => {
  const { product_id, country = 'US', quantity = 1 } = req.body;
  try {
    const data = await zendropCall('get_catalog_shipping_estimate', {
      product_id: parseInt(product_id, 10),
      country_code: country.toUpperCase(),
      quantity: parseInt(quantity, 10)
    });
    res.json({ ok: true, estimate: data });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Shipping estimate is unavailable right now.' });
  }
});

// ============================================================
// GET /api/buywish/store — Zendrop Store Info
// ============================================================
router.get('/store', ...buyWishAdmin, async (req, res) => {
  try {
    const data = await zendropCall('get_store', {});
    res.json({ ok: true, store: data });
  } catch (err) {
    res.status(500).json({ error: 'Could not load store info.' });
  }
});

// ============================================================
// GET /api/buywish/stats — Dashboard Stats
// ============================================================
router.get('/stats', ...buyWishAdmin, async (req, res) => {
  try {
    const [ordersBreakdown, weeklyPerf] = await Promise.allSettled([
      zendropCall('get_orders_breakdown', {}),
      zendropCall('get_weekly_performance', {})
    ]);
    res.json({
      ok: true,
      orders: ordersBreakdown.status === 'fulfilled' ? ordersBreakdown.value : null,
      weekly: weeklyPerf.status === 'fulfilled' ? weeklyPerf.value : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// ============================================================
// GET /api/buywish/orders/track/:order_number — Track Order
// ============================================================
router.get('/orders/track/:order_number', async (req, res) => {
  const orderNum = String(req.params.order_number || '').trim().toUpperCase();
  try {
    // Check our DB first
    const { rows } = await pool.query(
      `SELECT order_number, customer_name, fulfillment_status, supplier_tracking_number, supplier, items, created_at, zendrop_order_id
       FROM ecommerce_orders WHERE upper(order_number) = $1`,
      [orderNum]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found. Please check your order number.' });
    }

    const order = rows[0];
    const zendropOrderId = order.zendrop_order_id;
    // Supplier identifiers are internal; public tracking returns only customer-facing status and tracking data.
    delete order.zendrop_order_id;

    // Try to get live tracking from Zendrop if we have a linked supplier order
    if (zendropOrderId) {
      try {
        const trackingData = await zendropCall('get_tracking_events', { order_id: zendropOrderId });
        if (trackingData && trackingData.events) {
          order.tracking_events = trackingData.events;
        }
      } catch (e) {
        // tracking is best-effort
      }
    }

    res.json({ ok: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Could not track order.' });
  }
});

// ============================================================
// STRIPE CLIENT & MULTI-CURRENCY
// ============================================================
const CURRENCY_RATES = {
  USD: 1.0,
  GBP: 0.79,
  CAD: 1.36,
  EUR: 0.93,
  AUD: 1.54
};

const { getApprovedStripe, approvedWebhookSecret } = require('../utils/stripe-account');

function getStripe() {
  return getApprovedStripe();
}

// ============================================================
// POST /api/buywish/checkout — Stripe Payments + Automatic Tax
// ============================================================
router.post('/checkout', async (req, res) => {
  const { items, customer, currency = 'USD' } = req.body || {};
  const signedIn = readCustomer(req);
  if (!Array.isArray(items) || items.length < 1 || items.length > 20 || !customer || !customer.email) {
    return res.status(400).json({ error: 'A valid cart and customer email are required.' });
  }

  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Checkout is temporarily unavailable.' });

  try {
    const curUpper = String(currency || 'USD').toUpperCase();
    if (!Object.hasOwn(CURRENCY_RATES, curUpper)) return res.status(400).json({ error: 'Unsupported currency.' });
    const rate = CURRENCY_RATES[curUpper];
    const trustedItems = [];
    const lineItems = [];
    let subtotalCents = 0;

    for (const item of items) {
      const productId = Number.parseInt(item.product_id, 10);
      const qty = Number.parseInt(item.quantity, 10);
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isInteger(qty) || qty < 1 || qty > 10) {
        return res.status(400).json({ error: 'Each item needs a valid product and quantity (1–10).' });
      }
      const productData = await zendropCall('get_catalog_product', { product_id: productId });
      const product = normalizeProduct(productData.product || productData);
      const price = Number(product.retail_price);
      if (!product.id || Number(product.id) !== productId || !Number.isFinite(price) || price <= 0 || product.in_stock === false) {
        return res.status(409).json({ error: 'A cart item is unavailable. Refresh your cart and try again.' });
      }

      const unitAmount = Math.max(50, Math.round(price * rate * 100));
      subtotalCents += unitAmount * qty;
      trustedItems.push({ product_id: productId, title: product.title, quantity: qty, supplier: 'Zendrop' });
      lineItems.push({
        price_data: {
          currency: curUpper.toLowerCase(),
          product_data: { name: product.title, images: product.images?.[0] ? [product.images[0]] : [] },
          unit_amount: unitAmount
        },
        quantity: qty
      });
    }

    await ensureBuyWishSchema();
    const orderNumber = 'BWO-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const subtotalDollars = (subtotalCents / 100).toFixed(2);
    const addrParts = String(customer.address || '').split(',');
    const city = addrParts[1]?.trim() || customer.city || 'Unknown';
    const state = addrParts[2]?.trim() || customer.state || '';

    // Persist before creating the payment session. No synthetic supplier tracking number is generated.
    await pool.query(`
      INSERT INTO ecommerce_orders (
        order_number, customer_name, customer_email, customer_phone,
        shipping_address, shipping_city, shipping_state, shipping_country, items, total_amount, subtotal_amount,
        supplier, supplier_tracking_number, fulfillment_status, payment_status, currency, customer_id, zendrop_sync_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Zendrop',NULL,'awaiting_payment','pending',$12,$13,'not_sent')
    `, [
      orderNumber,
      String(customer.name || 'Valued Customer').slice(0, 160),
      String(customer.email).slice(0, 254),
      String(customer.phone || '').slice(0, 40) || null,
      String(customer.address || '').slice(0, 500) || null,
      city, state,
      String(customer.country || 'US').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'US',
      JSON.stringify(trustedItems),
      subtotalDollars, subtotalDollars, curUpper,
      signedIn ? signedIn.id : null
    ]);

    const baseUrl = 'https://www.buywishonline.com';
    const sessionPayload = {
      mode: 'payment',
      customer_email: String(customer.email).slice(0, 254),
      line_items: lineItems,
      success_url: `${baseUrl}/?order_success=${encodeURIComponent(orderNumber)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?canceled=1`,
      metadata: { order_number: orderNumber, source: 'buywishonline' },
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB']
      },
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      payment_intent_data: { metadata: { order_number: orderNumber, source: 'buywishonline' } }
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create({ ...sessionPayload, automatic_tax: { enabled: true } });
    } catch (taxErr) {
      if (taxErr.message && (taxErr.message.includes('tax') || taxErr.message.includes('head office'))) {
        console.warn('[BUYWISH STRIPE TAX]: Tax configuration unavailable; retrying without automatic tax.');
        session = await stripe.checkout.sessions.create(sessionPayload);
      } else {
        throw taxErr;
      }
    }

    await pool.query(
      'UPDATE ecommerce_orders SET stripe_session_id = $1 WHERE upper(order_number) = upper($2)',
      [session.id, orderNumber]
    );
    return res.json({ ok: true, url: session.url, order_number: orderNumber, session_id: session.id });
  } catch (err) {
    console.error('[BUYWISH CHECKOUT ERROR]:', err.message);
    return res.status(500).json({ error: 'Could not process order.' });
  }
});

// ============================================================
// GET /api/buywish/verify-session — Verify Stripe Session & Confirm Payment
// ============================================================
router.get('/verify-session', async (req, res) => {
  const { session_id, order_number } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe is not configured' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['payment_intent', 'line_items']
    });

    const isPaid = session.payment_status === 'paid';
    const orderNum = session.metadata?.order_number;
    if (!orderNum || (order_number && String(order_number).toUpperCase() !== String(orderNum).toUpperCase())) {
      return res.status(403).json({ error: 'Checkout session does not match this order.' });
    }
    const taxAmount = (session.total_details?.amount_tax || 0) / 100;
    const totalAmount = (session.amount_total || 0) / 100;
    const subtotalAmount = (session.amount_subtotal || 0) / 100;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    if (isPaid && orderNum) {
      await ensureBuyWishSchema();
      await pool.query(`
        UPDATE ecommerce_orders
        SET payment_status = 'paid',
            fulfillment_status = CASE WHEN zendrop_order_id IS NULL THEN 'payment_confirmed_pending_supplier' ELSE fulfillment_status END,
            stripe_session_id = $1,
            stripe_payment_intent = $2,
            tax_amount = $3,
            total_amount = $4,
            subtotal_amount = $5,
            updated_at = NOW()
        WHERE upper(order_number) = upper($6) AND stripe_session_id = $1
      `, [session.id, paymentIntentId, taxAmount, totalAmount, subtotalAmount, orderNum]);
      await saveStripeShipping(session);
      await pushPaidOrderToZendrop(orderNum);
    }

    res.json({
      ok: true,
      paid: isPaid,
      order_number: orderNum,
      amount_total: totalAmount,
      amount_subtotal: subtotalAmount,
      tax_amount: taxAmount,
      currency: session.currency?.toUpperCase(),
      customer_email: session.customer_details?.email || session.customer_email,
      customer_name: session.customer_details?.name || session.metadata?.customer_name,
      shipping: session.shipping_details
    });
  } catch (err) {
    console.error('[BUYWISH VERIFY SESSION ERROR]:', err.message);
    res.status(500).json({ error: 'Could not verify checkout session' });
  }
});

// ============================================================
// Admin-only supplier handoff queue. Zendrop's public docs do not specify
// a custom-store order-creation action; operators place the order in Zendrop
// and record its real order ID here. Never synthesize a supplier/tracking ID.
// ============================================================
router.get('/admin/orders', ...buyWishAdmin, async (req, res) => {
  try {
    await ensureBuyWishSchema();
    const scope = req.query.scope === 'all' ? 'all' : 'queue';
    const where = scope === 'all'
      ? 'TRUE'
      : `payment_status = 'paid' AND zendrop_order_id IS NULL`;
    const { rows } = await pool.query(
      `SELECT order_number, customer_name, customer_email, customer_phone,
              shipping_address, shipping_city, shipping_state, shipping_postal, shipping_country,
              items, total_amount, subtotal_amount, tax_amount, currency, payment_status, fulfillment_status,
              zendrop_order_id, zendrop_sync_status, zendrop_sync_detail, supplier_tracking_number,
              created_at, updated_at
       FROM ecommerce_orders
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json({ ok: true, orders: rows, scope });
  } catch (err) {
    console.error('[BUYWISH ADMIN ORDERS ERROR]:', err.message);
    res.status(500).json({ error: 'Could not load supplier handoff queue.' });
  }
});

router.patch('/admin/orders/:order_number/supplier', ...buyWishAdmin, async (req, res) => {
  const supplierOrderId = String(req.body?.zendrop_order_id || '').trim();
  if (!supplierOrderId || supplierOrderId.length > 120 || /[\r\n]/.test(supplierOrderId)) {
    return res.status(400).json({ error: 'A valid Zendrop order ID is required.' });
  }

  let client;
  let transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    // Serialize links for the same supplier order ID so it cannot attach to two store orders concurrently.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [supplierOrderId]);

    const target = await client.query(
      `SELECT id, payment_status, zendrop_order_id, fulfillment_status
       FROM ecommerce_orders
       WHERE upper(order_number) = upper($1)
       FOR UPDATE`,
      [req.params.order_number]
    );
    const order = target.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.payment_status !== 'paid') {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'Only paid customer orders can be linked to a supplier order.' });
    }
    if (order.zendrop_order_id != null) {
      if (String(order.zendrop_order_id) === supplierOrderId) {
        await client.query('COMMIT');
        transactionOpen = false;
        return res.json({
          ok: true,
          already_linked: true,
          order: {
            order_number: order.order_number,
            fulfillment_status: order.fulfillment_status,
            zendrop_order_id: String(order.zendrop_order_id)
          }
        });
      }
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'This store order already has a different Zendrop order linked.' });
    }

    const duplicate = await client.query(
      'SELECT 1 FROM ecommerce_orders WHERE zendrop_order_id = $1 AND id <> $2 LIMIT 1',
      [supplierOrderId, order.id]
    );
    if (duplicate.rows.length) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'That Zendrop order ID is already linked to another store order.' });
    }

    const updated = await client.query(
      `UPDATE ecommerce_orders
       SET zendrop_order_id = $1, supplier = 'Zendrop',
           fulfillment_status = 'supplier_order_placed', updated_at = NOW()
       WHERE id = $2 AND payment_status = 'paid' AND zendrop_order_id IS NULL
       RETURNING order_number, fulfillment_status, zendrop_order_id`,
      [supplierOrderId, order.id]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'Supplier order link changed; refresh the queue and try again.' });
    }

    await client.query('COMMIT');
    transactionOpen = false;
    res.json({ ok: true, already_linked: false, order: updated.rows[0] });
  } catch (err) {
    if (transactionOpen && client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'That Zendrop order ID is already linked to another store order.' });
    console.error('[BUYWISH SUPPLIER HANDOFF ERROR]:', err.message);
    res.status(500).json({ error: 'Could not save supplier order reference.' });
  } finally {
    if (client) client.release();
  }
});
router.post('/admin/orders/:order_number/push', ...buyWishAdmin, async (req, res) => {
  try {
    const result = await pushPaidOrderToZendrop(req.params.order_number);
    if (!result.ok && !result.manual) return res.status(409).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Could not send this order to Zendrop.' });
  }
});

router.get('/admin/catalog', ...buyWishAdmin, async (req, res) => {
  try {
    await ensureBuyWishSchema();
    const { rows } = await pool.query(`
      SELECT category, count(*)::int AS products
      FROM ecommerce_products
      WHERE is_active = true AND zendrop_id IS NOT NULL
      GROUP BY category
      ORDER BY products DESC, category ASC
    `);
    const total = rows.reduce((sum, row) => sum + row.products, 0);
    res.json({ ok: true, total, categories: rows, countries: TARGET_COUNTRIES });
  } catch (err) {
    res.status(500).json({ error: 'Could not load the synced catalog.' });
  }
});

router.post('/admin/catalog/sync', ...buyWishAdmin, async (req, res) => {
  if (catalogSyncing) return res.status(409).json({ error: 'A catalog sync is already running.' });
  catalogSyncing = true;
  try {
    await ensureBuyWishSchema();
    const offset = Math.max(parseInt(req.body && req.body.offset, 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.body && req.body.limit, 10) || 8, 1), 12);
    const candidates = await gatherCandidates();
    const slice = candidates.slice(offset, offset + limit);
    const qualified = [];
    let skipped = 0;
    await mapPool(slice, 3, async (product) => {
      const profile = await shippingProfile(product.id);
      if (!qualifiesForStore(profile)) {
        skipped += 1;
        return;
      }
      await upsertQualified(product, profile);
      qualified.push({
        id: product.id,
        title: product.title,
        category: product.category,
        usa_days: profile.fastestDays
      });
    });
    Object.keys(cache).forEach((key) => delete cache[key]);
    res.json({
      ok: true,
      checked: slice.length,
      qualified: qualified.length,
      skipped,
      products: qualified,
      next_offset: offset + slice.length,
      total_candidates: candidates.length,
      done: offset + slice.length >= candidates.length,
      rule: 'Kept only when Zendrop quotes USA, Canada, and UK shipping and the fastest USA lane is 14 days or fewer.'
    });
  } catch (err) {
    console.error('[BUYWISH CATALOG SYNC]:', err.message);
    res.status(500).json({ error: err.message || 'Catalog sync failed.' });
  } finally {
    catalogSyncing = false;
  }
});

router.post('/account/register', accountRateLimit, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const phone = String(req.body?.phone || '').trim();
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  try {
    await ensureBuyWishSchema();
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await pool.query(
      `INSERT INTO buywish_customers (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone`,
      [name, email, passwordHash, phone.slice(0, 40) || null]
    );
    const customer = created.rows[0];
    const token = signCustomer(customer);
    res.cookie('bwo_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ ok: true, token, customer });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });
    res.status(500).json({ error: 'Could not create the account.' });
  }
});

router.post('/account/login', accountRateLimit, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  try {
    await ensureBuyWishSchema();
    const found = await pool.query(`SELECT id, name, email, phone, password_hash FROM buywish_customers WHERE email = $1`, [email]);
    const customer = found.rows[0];
    const valid = customer && await bcrypt.compare(password, customer.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = signCustomer(customer);
    res.cookie('bwo_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ ok: true, token, customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } });
  } catch (err) {
    res.status(500).json({ error: 'Could not sign in.' });
  }
});

router.get('/account/me', requireCustomer, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, name, email, phone, created_at FROM buywish_customers WHERE id = $1`, [req.customer.id]);
    if (!rows.length) return res.status(401).json({ error: 'Sign in to view your BuyWish account.' });
    res.json({ ok: true, customer: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not load the account.' });
  }
});

router.get('/account/orders', requireCustomer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT order_number, items, total_amount, currency, payment_status, fulfillment_status,
              supplier_tracking_number, shipping_city, shipping_country, created_at
       FROM ecommerce_orders
       WHERE customer_id = $1 OR lower(customer_email) = lower($2)
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.customer.id, req.customer.email]
    );
    res.json({ ok: true, orders: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load orders.' });
  }
});

router.post('/account/logout', (req, res) => {
  res.clearCookie('bwo_token', { path: '/' });
  res.json({ ok: true });
});

// ============================================================
// POST /api/buywish/import-product — Import Product to My Store
// ============================================================
router.post('/import-product', ...buyWishAdmin, async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required.' });
  try {
    const result = await zendropCall('import_my_product', { product_id: parseInt(product_id, 10) });
    // Clear products cache so it refreshes
    delete cache['products_all___1_trending'];
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not import product.' });
  }
});

// ============================================================
// GET /api/buywish/my-products — Admin: View Imported Products
// ============================================================
router.get('/my-products', ...buyWishAdmin, async (req, res) => {
  try {
    const data = await zendropCall('get_my_products', { limit: 50 });
    const products = (data.products || []).map(normalizeProduct);
    res.json({ ok: true, products, total: data.total || products.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load my products.' });
  }
});

// ============================================================
// GET /api/buywish/catalog/search — Search Zendrop Catalog
// ============================================================
router.get('/catalog/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: 'Search query required.' });
  try {
    const cacheKey = `search_${q}_${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ok: true, products: cached });

    const data = await zendropCall('get_catalog_products', { search: q, limit: parseInt(limit, 10) });
    const products = (data.products || []).map(normalizeProduct);

    setCache(cacheKey, products, 5 * 60 * 1000);
    res.json({ ok: true, products, total: data.total || products.length });
  } catch (err) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ============================================================
// GET /api/buywish/billing — Zendrop Credit Balance
// ============================================================
router.get('/billing', ...buyWishAdmin, async (req, res) => {
  try {
    const data = await zendropCall('get_billing_credit_balance', {});
    res.json({ ok: true, billing: data });
  } catch (err) {
    res.status(500).json({ error: 'Could not load billing info.' });
  }
});

// ============================================================
// DELETE cache — force refresh (admin use)
// ============================================================
router.post('/cache/clear', ...buyWishAdmin, (req, res) => {
  Object.keys(cache).forEach(k => delete cache[k]);
  res.json({ ok: true, message: 'Product cache cleared. Next request will fetch fresh from Zendrop.' });
});

// ============================================================
// VERIFIED CUSTOMER REVIEWS API
// ============================================================
let reviewsTableReady = false;
async function ensureReviewsTable() {
  if (reviewsTableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ecommerce_reviews (
        id SERIAL PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_title TEXT,
        author_name TEXT NOT NULL,
        author_email TEXT,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title TEXT,
        comment TEXT NOT NULL,
        country_code TEXT DEFAULT 'US',
        country_name TEXT DEFAULT 'United States',
        verified_purchase BOOLEAN DEFAULT false,
        order_number TEXT,
        helpful_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'approved',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_product ON ecommerce_reviews(product_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_status ON ecommerce_reviews(status);
    `);

    await pool.query(`
      DELETE FROM ecommerce_reviews
      WHERE product_id LIKE 'global-%'
        AND lower(author_email) IN (
          'm.vance@gmail.com',
          'sarah.j@outlook.com',
          'liam.oc@btinternet.com',
          'chloe.tremblay@gmail.com',
          'dmiller_transport@yahoo.com',
          'emma.w@gmail.com',
          'sophie.m@orange.fr'
        )
    `);

    reviewsTableReady = true;
  } catch (err) {
    console.error('[BUYWISH REVIEWS DB INIT ERROR]:', err.message);
  }
}

// GET /api/buywish/reviews?product_id=...&limit=...
router.get('/reviews', async (req, res) => {
  await ensureReviewsTable();
  const productId = req.query.product_id;
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  try {
    let reviewsQuery;
    let params = [];

    if (productId && productId !== 'all') {
      reviewsQuery = `
        SELECT id, product_id, product_title, author_name, rating, title, comment,
               country_code, country_name, verified_purchase, helpful_count, created_at
        FROM ecommerce_reviews
        WHERE status = 'approved' AND product_id = $1
        ORDER BY verified_purchase DESC, helpful_count DESC, created_at DESC
        LIMIT $2
      `;
      params = [productId, limit];
    } else {
      reviewsQuery = `
        SELECT id, product_id, product_title, author_name, rating, title, comment,
               country_code, country_name, verified_purchase, helpful_count, created_at
        FROM ecommerce_reviews
        WHERE status = 'approved'
        ORDER BY verified_purchase DESC, helpful_count DESC, created_at DESC
        LIMIT $1
      `;
      params = [limit];
    }

    const { rows } = await pool.query(reviewsQuery, params);

    // Calculate rating breakdown and summary
    const statsQuery = productId && productId !== 'all'
      ? `SELECT rating, count(*) as count FROM ecommerce_reviews WHERE status = 'approved' AND product_id = $1 GROUP BY rating`
      : `SELECT rating, count(*) as count FROM ecommerce_reviews WHERE status = 'approved' GROUP BY rating`;
    const statsParams = (productId && productId !== 'all') ? [productId] : [];
    const statsRes = await pool.query(statsQuery, statsParams);

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalScore = 0;
    let totalCount = 0;

    statsRes.rows.forEach(r => {
      const star = parseInt(r.rating, 10);
      const c = parseInt(r.count, 10);
      if (breakdown[star] !== undefined) breakdown[star] = c;
      totalScore += star * c;
      totalCount += c;
    });

    const averageRating = totalCount > 0 ? parseFloat((totalScore / totalCount).toFixed(1)) : 0;
    const recommendedPercent = totalCount > 0 ? Math.round(((breakdown[5] + breakdown[4]) / totalCount) * 100) : 0;

    res.json({
      success: true,
      stats: {
        average_rating: averageRating,
        total_reviews: totalCount || rows.length,
        recommended_percent: recommendedPercent,
        breakdown
      },
      reviews: rows
    });
  } catch (err) {
    console.error('[GET REVIEWS ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// POST /api/buywish/reviews - Submit a real customer review
router.post('/reviews', async (req, res) => {
  await ensureReviewsTable();
  const { product_id, product_title, author_name, author_email, rating, title, comment, order_number } = req.body;

  if (!author_name || !author_name.trim()) {
    return res.status(400).json({ error: 'Your name is required.' });
  }
  const numRating = parseInt(rating, 10);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
  }
  if (!comment || comment.trim().length < 5) {
    return res.status(400).json({ error: 'Please write a review of at least 5 characters.' });
  }

  try {
    // Check if order number or email is a verified purchase in ecommerce_orders
    let isVerified = false;
    if (order_number && order_number.trim()) {
      const orderCheck = await pool.query(
        'SELECT id FROM ecommerce_orders WHERE upper(order_number) = upper($1) LIMIT 1',
        [order_number.trim()]
      );
      if (orderCheck.rows.length > 0) isVerified = true;
    }
    if (!isVerified && author_email && author_email.trim()) {
      const emailCheck = await pool.query(
        'SELECT id FROM ecommerce_orders WHERE lower(customer_email) = lower($1) LIMIT 1',
        [author_email.trim()]
      );
      if (emailCheck.rows.length > 0) isVerified = true;
    }

    // Geo country
    const countryCode = (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || req.body.country_code || 'US').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'US';
    const countryMap = {
      US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
      DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands', PK: 'Pakistan'
    };
    const countryName = countryMap[countryCode] || 'International';

    const insertRes = await pool.query(`
      INSERT INTO ecommerce_reviews (
        product_id, product_title, author_name, author_email, rating, title,
        comment, country_code, country_name, verified_purchase, order_number, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, product_id, product_title, author_name, rating, title, comment, country_code, country_name, verified_purchase, helpful_count, created_at
    `, [
      product_id || 'general',
      product_title || 'BuyWishOnline Product',
      author_name.trim().slice(0, 60),
      (author_email || '').trim().slice(0, 100),
      numRating,
      (title || '').trim().slice(0, 120),
      comment.trim().slice(0, 1000),
      countryCode,
      countryName,
      isVerified,
      (order_number || '').trim().slice(0, 40),
      isVerified ? 'approved' : 'pending'
    ]);

    res.json({
      success: true,
      message: isVerified
        ? 'Thank you! Your verified purchase review has been published.'
        : 'Thank you! Your review was received and will appear after it is checked.',
      review: insertRes.rows[0]
    });
  } catch (err) {
    console.error('[POST REVIEW ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to submit review. Please try again.' });
  }
});

// POST /api/buywish/reviews/:id/helpful
router.post('/reviews/:id/helpful', async (req, res) => {
  await ensureReviewsTable();
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid review ID' });

  try {
    const r = await pool.query(
      'UPDATE ecommerce_reviews SET helpful_count = helpful_count + 1 WHERE id = $1 RETURNING helpful_count',
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Review not found' });
    res.json({ success: true, helpful_count: r.rows[0].helpful_count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update helpful count' });
  }
});

// ============================================================
// Stripe Webhook Handler for BuyWishOnline
// ============================================================
function stripeShipping(session) {
  const ship = session.shipping_details || (session.collected_information && session.collected_information.shipping_details) || {};
  const addr = ship.address || {};
  return {
    name: ship.name || (session.customer_details && session.customer_details.name) || null,
    phone: (session.customer_details && session.customer_details.phone) || null,
    line1: [addr.line1, addr.line2].filter(Boolean).join(', '),
    city: addr.city || null,
    state: addr.state || null,
    postal: addr.postal_code || null,
    country: addr.country || null
  };
}

async function saveStripeShipping(session) {
  const orderNumber = session.metadata && session.metadata.order_number;
  if (!orderNumber) return;
  const ship = stripeShipping(session);
  await pool.query(`
    UPDATE ecommerce_orders SET
      customer_name = COALESCE($2, customer_name),
      customer_phone = COALESCE($3, customer_phone),
      shipping_address = COALESCE(NULLIF($4, ''), shipping_address),
      shipping_city = COALESCE(NULLIF($5, ''), shipping_city),
      shipping_state = COALESCE(NULLIF($6, ''), shipping_state),
      shipping_postal = COALESCE(NULLIF($7, ''), shipping_postal),
      shipping_country = COALESCE(NULLIF($8, ''), shipping_country),
      updated_at = NOW()
    WHERE upper(order_number) = upper($1)
  `, [orderNumber, ship.name, ship.phone, ship.line1, ship.city, ship.state, ship.postal, ship.country]);
}

let catalogSyncing = false;

async function mapPool(items, limit, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function shippingProfile(productId) {
  const lanes = {};
  await Promise.all(TARGET_COUNTRIES.map(async (country) => {
    try {
      const data = await zendropCall('get_catalog_shipping_estimate', {
        product_id: Number(productId),
        country_code: country,
        quantity: 1
      }, { timeoutMs: 8000 });
      lanes[country] = summarizeLane(data);
    } catch (err) {
      lanes[country] = { ships: false, fastestDays: null };
    }
  }));
  return {
    lanes,
    shipsAll: TARGET_COUNTRIES.every((country) => lanes[country] && lanes[country].ships),
    fastestDays: lanes.US ? lanes.US.fastestDays : null
  };
}

async function gatherCandidates() {
  const byId = new Map();
  const trending = await zendropCall('get_catalog_trending_products', { limit: 30 }, { timeoutMs: 8000 });
  (trending.products || []).forEach((product) => {
    const normalized = normalizeProduct({ ...product, is_trending: true });
    if (normalized.id) byId.set(String(normalized.id), normalized);
  });
  for (const search of WINNING_SEARCHES) {
    try {
      const data = await zendropCall('get_catalog_products', { search: search.q, limit: 8 }, { timeoutMs: 8000 });
      (data.products || []).forEach((product) => {
        const normalized = normalizeProduct({ ...product, category: product.category || search.category });
        if (normalized.id && !byId.has(String(normalized.id))) byId.set(String(normalized.id), normalized);
      });
    } catch (err) {
      // One search failing should not discard the rest of the edit.
    }
  }
  return [...byId.values()];
}

async function upsertQualified(product, profile) {
  const handle = productHandle(product.id);
  if (!handle) return;
  const score = scoreProduct({
    trending: product.is_trending || product.badge === 'hot',
    shipsAll: profile.shipsAll,
    fastestDays: profile.fastestDays,
    inStock: product.in_stock,
    comparePrice: product.compare_price,
    retailPrice: product.retail_price
  });
  const retail = Number(product.retail_price) || 0;
  const cost = Number(product.supplier_cost) || 0;
  const margin = retail > 0 ? Number((((retail - cost) / retail) * 100).toFixed(2)) : null;
  await pool.query(`
    INSERT INTO ecommerce_products (
      title, handle, description, category, retail_price, supplier_cost, estimated_margin,
      trend_score, source, image_url, is_active, zendrop_id, compare_price, images, features,
      badge, ships_to, delivery_label, winning_score, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Zendrop',$9,true,$10,$11,$12::jsonb,$13::jsonb,$14,$15::jsonb,$16,$17,now())
    ON CONFLICT (zendrop_id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      retail_price = EXCLUDED.retail_price,
      supplier_cost = EXCLUDED.supplier_cost,
      estimated_margin = EXCLUDED.estimated_margin,
      trend_score = EXCLUDED.trend_score,
      image_url = EXCLUDED.image_url,
      is_active = true,
      compare_price = EXCLUDED.compare_price,
      images = EXCLUDED.images,
      features = EXCLUDED.features,
      badge = EXCLUDED.badge,
      ships_to = EXCLUDED.ships_to,
      delivery_label = EXCLUDED.delivery_label,
      winning_score = EXCLUDED.winning_score,
      updated_at = now()
  `, [
    String(product.title || 'Premium Product').slice(0, 240),
    handle,
    product.description || '',
    product.category || 'Featured',
    retail,
    cost,
    margin,
    score,
    product.image_url,
    String(product.id),
    product.compare_price ? Number(product.compare_price) : null,
    JSON.stringify(product.images || []),
    JSON.stringify(product.features || []),
    score >= 70 ? 'best' : (product.badge || 'new'),
    JSON.stringify(TARGET_COUNTRIES),
    deliveryLabel(profile),
    score
  ]);
  try {
    await zendropCall('import_my_product', { product_id: Number(product.id) }, { timeoutMs: 8000 });
    await pool.query(`UPDATE ecommerce_products SET import_status = 'imported' WHERE zendrop_id = $1`, [String(product.id)]);
  } catch (err) {
    await pool.query(
      `UPDATE ecommerce_products SET import_status = $2 WHERE zendrop_id = $1`,
      [String(product.id), String(err.message || 'import failed').slice(0, 180)]
    );
  }
}

async function pushPaidOrderToZendrop(orderNumber) {
  await ensureBuyWishSchema();
  const { rows } = await pool.query(
    `SELECT * FROM ecommerce_orders WHERE upper(order_number) = upper($1)`,
    [orderNumber]
  );
  const order = rows[0];
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.payment_status !== 'paid') return { ok: false, error: 'Only paid orders are sent to Zendrop.' };
  if (order.zendrop_order_id) {
    return { ok: true, already_linked: true, zendrop_order_id: order.zendrop_order_id };
  }
  const updatedAt = order.updated_at ? new Date(order.updated_at).getTime() : 0;
  if (order.zendrop_sync_status === 'sending' && Date.now() - updatedAt < 120000) {
    return { ok: false, error: 'A Zendrop send is already in progress for this order.' };
  }
  await pool.query(
    `UPDATE ecommerce_orders SET zendrop_sync_status = 'sending', updated_at = NOW() WHERE id = $1 AND zendrop_order_id IS NULL`,
    [order.id]
  );

  let tools;
  try {
    tools = await zendropListTools({ timeoutMs: 8000 });
  } catch (err) {
    await pool.query(
      `UPDATE ecommerce_orders SET zendrop_sync_status = 'failed', zendrop_sync_detail = $2, updated_at = NOW() WHERE id = $1`,
      [order.id, String(err.message || 'Zendrop tools unavailable').slice(0, 240)]
    );
    return { ok: false, error: 'Could not read Zendrop tools.' };
  }

  const tool = selectOrderTool(tools);
  if (!tool) {
    const detail = 'Paid on BuyWish. Zendrop did not publish a custom-store order tool, so place this order in the Zendrop dashboard and paste its order ID here.';
    await pool.query(
      `UPDATE ecommerce_orders SET zendrop_sync_status = 'manual_required', zendrop_sync_detail = $2, updated_at = NOW() WHERE id = $1`,
      [order.id, detail]
    );
    return { ok: false, manual: true, error: detail };
  }

  const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
  const built = buildOrderArguments(tool, { ...order, items });
  if (!built.ok) {
    await pool.query(
      `UPDATE ecommerce_orders SET zendrop_sync_status = 'manual_required', zendrop_sync_detail = $2, updated_at = NOW() WHERE id = $1`,
      [order.id, built.error]
    );
    return built;
  }

  try {
    const result = await zendropCall(built.toolName, built.args, { timeoutMs: 10000 });
    const zendropOrderId = extractOrderId(result);
    if (!zendropOrderId) {
      const detail = 'Zendrop answered without an order id. Confirm the order in Zendrop before linking an ID.';
      await pool.query(
        `UPDATE ecommerce_orders SET zendrop_sync_status = 'manual_required', zendrop_sync_detail = $2, updated_at = NOW() WHERE id = $1`,
        [order.id, detail]
      );
      return { ok: false, manual: true, error: detail };
    }
    const saved = await pool.query(`
      UPDATE ecommerce_orders
      SET zendrop_order_id = $2, supplier = 'Zendrop', fulfillment_status = 'supplier_order_placed',
          zendrop_sync_status = 'sent', zendrop_sync_detail = $3, updated_at = NOW()
      WHERE id = $1 AND zendrop_order_id IS NULL
      RETURNING zendrop_order_id
    `, [order.id, zendropOrderId, `Sent with ${built.toolName}`]);
    if (!saved.rows.length) return { ok: true, already_linked: true };
    return { ok: true, zendrop_order_id: zendropOrderId, tool: built.toolName };
  } catch (err) {
    await pool.query(
      `UPDATE ecommerce_orders SET zendrop_sync_status = 'failed', zendrop_sync_detail = $2, updated_at = NOW() WHERE id = $1`,
      [order.id, String(err.message || 'Zendrop send failed').slice(0, 240)]
    );
    return { ok: false, error: err.message || 'Zendrop send failed.' };
  }
}

async function applyCheckoutEvent(event) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return;
  const session = event.data && event.data.object;
  if (!session || session.metadata?.source !== 'buywishonline') return;
  const orderNumber = session.metadata?.order_number;
  const taxAmount = (session.total_details?.amount_tax || 0) / 100;
  const totalAmount = (session.amount_total || 0) / 100;
  const subtotalAmount = (session.amount_subtotal || 0) / 100;
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

  if (orderNumber && session.payment_status === 'paid') {
    await ensureBuyWishSchema();
    await pool.query(`
      UPDATE ecommerce_orders
      SET payment_status = 'paid',
          fulfillment_status = CASE WHEN zendrop_order_id IS NULL THEN 'payment_confirmed_pending_supplier' ELSE fulfillment_status END,
          stripe_session_id = $1,
          stripe_payment_intent = $2,
          tax_amount = $3,
          total_amount = $4,
          subtotal_amount = $5,
          updated_at = NOW()
      WHERE upper(order_number) = upper($6)
    `, [session.id, paymentIntentId, taxAmount, totalAmount, subtotalAmount, orderNumber]);
    await saveStripeShipping(session);
    const pushed = await pushPaidOrderToZendrop(orderNumber);
    console.log(`[BUYWISH ORDER PAID]: Order ${orderNumber} paid ($${totalAmount}). Zendrop: ${pushed.ok ? 'sent' : (pushed.manual ? 'manual' : 'pending')}`);
  }
}

async function handleBuyWishWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = approvedWebhookSecret();
  const stripe = getStripe();

  if (!stripe) return res.status(503).send('Stripe is not configured');
  if (!webhookSecret || !sig || !Buffer.isBuffer(req.body)) {
    return res.status(400).send('A configured signing secret, signature, and raw request body are required.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[BUYWISH WEBHOOK SIGNATURE ERROR]:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await applyCheckoutEvent(event);
    res.json({ received: true });
  } catch (e) {
    console.error('[BUYWISH WEBHOOK PROCESS ERROR]:', e.message);
    res.status(500).json({ error: 'Webhook processing error' });
  }
}

router.handleBuyWishWebhook = handleBuyWishWebhook;
module.exports = router;
module.exports.handleBuyWishWebhook = handleBuyWishWebhook;
module.exports.applyCheckoutEvent = applyCheckoutEvent;

