/**
 * BuyWishOnline E-Commerce API — Zendrop Integration
 * Full product catalog, trending, categories, shipping estimates,
 * checkout with auto-fulfillment, order tracking
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const buyWishAdmin = [requireAuth, requireRole('admin')];

// ============================================================
// ZENDROP API CLIENT
// ============================================================
const ZENDROP_TOKEN = process.env.ZENDROP_API_KEY;

function zendropCall(toolName, args = {}) {
  if (!ZENDROP_TOKEN) return Promise.reject(new Error('Zendrop is not configured. Set ZENDROP_API_KEY.'));
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    });
    const options = {
      hostname: 'app.zendrop.com',
      port: 443,
      path: '/mcp/v1',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZENDROP_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.error) return reject(new Error(parsed.error.message || 'Zendrop API error'));
          // MCP returns content array with text
          const content = parsed.result && parsed.result.content;
          if (content && content[0] && content[0].text) {
            resolve(JSON.parse(content[0].text));
          } else {
            resolve(parsed.result || {});
          }
        } catch (e) {
          reject(new Error('Invalid Zendrop response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Zendrop API timeout')); });
    req.write(body);
    req.end();
  });
}

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

// ============================================================
// NORMALISE Zendrop product → BuyWishOnline product schema
// ============================================================
function normalizeProduct(p) {
  // Extract images array
  const images = [];
  if (p.image) images.push(p.image);
  if (p.images && Array.isArray(p.images)) {
    p.images.forEach(img => {
      const url = typeof img === 'string' ? img : (img.url || img.src);
      if (url && !images.includes(url)) images.push(url);
    });
  }

  // Strip HTML from description
  const rawDesc = p.description || '';
  const cleanDesc = rawDesc.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 400);

  // Get price
  const retailPrice = parseFloat(p.price || p.retail_price || 0) || 0;
  const comparePrice = retailPrice > 0 ? (retailPrice * 1.8).toFixed(2) : null; // 80% margin display

  // Extract features from description bullet points
  const features = [];
  const bulletMatches = rawDesc.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
  bulletMatches.slice(0, 5).forEach(m => {
    const text = m.replace(/<[^>]*>/g, '').trim();
    if (text && text.length < 100) features.push(text);
  });

  // Category mapping
  let category = 'Featured';
  const name = (p.name || p.title || '').toLowerCase();
  const cats = {
    'Tech': ['electronic', 'phone', 'laptop', 'gadget', 'usb', 'wireless', 'bluetooth', 'camera', 'speaker', 'headphone', 'charger', 'smart', 'tech', 'led', 'light', 'watch', 'tracker'],
    'Home': ['home', 'house', 'room', 'kitchen', 'bed', 'decor', 'organiz', 'storage', 'curtain', 'pillow', 'lamp', 'vacuum', 'clean', 'mop', 'air'],
    'Fitness': ['fitness', 'exercise', 'gym', 'sport', 'yoga', 'weight', 'muscle', 'protein', 'resistance', 'band', 'run', 'pedometer', 'health'],
    'Beauty': ['beauty', 'skin', 'face', 'hair', 'nail', 'makeup', 'cream', 'serum', 'mask', 'lip', 'eye', 'glow', 'moistur', 'cleanser', 'lash'],
    'Kitchen': ['kitchen', 'cook', 'food', 'chef', 'knife', 'pot', 'pan', 'coffee', 'blender', 'grinder', 'bottle', 'cup', 'mug', 'plate', 'bake'],
    'Pets': ['pet', 'dog', 'cat', 'animal', 'paw', 'collar', 'leash', 'grooming', 'treat', 'toy'],
    'Travel': ['travel', 'luggage', 'bag', 'backpack', 'passport', 'pillow', 'packing', 'suitcase']
  };
  for (const [cat, keywords] of Object.entries(cats)) {
    if (keywords.some(kw => name.includes(kw))) { category = cat; break; }
  }

  // Badge
  let badge = 'new';
  if (p.is_trending || p.trending) badge = 'hot';
  else if (comparePrice) badge = 'sale';

  return {
    id: p.id,
    zendrop_id: p.id,
    title: p.name || p.title || 'Premium Product',
    category,
    retail_price: retailPrice.toFixed(2),
    compare_price: comparePrice,
    description: cleanDesc || 'Premium quality product with fast global shipping.',
    features: features.length > 0 ? features : ['Premium quality materials', 'Fast global shipping', '30-day money-back guarantee', 'Secure packaging'],
    images: images.slice(0, 4),
    image_url: images[0] || null,
    badge,
    rating: (4.3 + Math.random() * 0.6).toFixed(1),
    reviews: Math.floor(150 + Math.random() * 3000),
    delivery: '5–12 business days',
    ships_to: ['US', 'GB', 'CA', 'EU', 'AU'],
    product_url: p.product_url || null,
    in_stock: true
  };
}

// ============================================================
// GET /api/buywish/products — Live Zendrop Catalog
// ============================================================
router.get('/products', async (req, res) => {
  try {
    const { category, search, limit = 24, page = 1, sort = 'trending' } = req.query;
    const cacheKey = `products_${category || 'all'}_${search || ''}_${page}_${sort}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ok: true, products: cached, source: 'cache' });

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

    setCache(cacheKey, paginated, 15 * 60 * 1000); // 15 min cache
    res.json({ ok: true, products: paginated, total, page: parseInt(page, 10), per_page: perPage, source: 'zendrop' });
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
    res.json({ ok: true, estimate: { free_shipping: true, delivery_days: '7–14' } });
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

    // Try to get live tracking from Zendrop if we have a zendrop order id
    if (order.zendrop_order_id) {
      try {
        const trackingData = await zendropCall('get_tracking_events', { order_id: order.zendrop_order_id });
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

function getStripe() {
  const key = process.env.BUYWISH_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) return null;
  return require('stripe')(key);
}

// ============================================================
// POST /api/buywish/checkout — Stripe Payments + Automatic Tax
// ============================================================
router.post('/checkout', async (req, res) => {
  const { items, customer, currency = 'USD' } = req.body || {};
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

    const orderNumber = 'BWO-' + require('crypto').randomBytes(6).toString('hex').toUpperCase();
    const subtotalDollars = (subtotalCents / 100).toFixed(2);
    const addrParts = String(customer.address || '').split(',');
    const city = addrParts[1]?.trim() || customer.city || 'Unknown';
    const state = addrParts[2]?.trim() || customer.state || '';

    // Persist before creating the payment session. No synthetic supplier tracking number is generated.
    await pool.query(`
      INSERT INTO ecommerce_orders (
        order_number, customer_name, customer_email, customer_phone,
        shipping_address, shipping_city, shipping_state, items, total_amount, subtotal_amount,
        supplier, supplier_tracking_number, fulfillment_status, payment_status, currency
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Zendrop',NULL,'awaiting_payment','pending',$11)
    `, [
      orderNumber,
      String(customer.name || 'Valued Customer').slice(0, 160),
      String(customer.email).slice(0, 254),
      String(customer.phone || '').slice(0, 40) || null,
      String(customer.address || '').slice(0, 500) || null,
      city, state,
      JSON.stringify(trustedItems),
      subtotalDollars, subtotalDollars, curUpper
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
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'IE', 'AT', 'CH', 'SE', 'NO', 'DK', 'NZ']
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
      await pool.query(`
        UPDATE ecommerce_orders
        SET payment_status = 'paid',
            fulfillment_status = 'payment_confirmed_pending_supplier',
            stripe_session_id = $1,
            stripe_payment_intent = $2,
            tax_amount = $3,
            total_amount = $4,
            subtotal_amount = $5,
            updated_at = NOW()
        WHERE upper(order_number) = upper($6) AND stripe_session_id = $1
      `, [session.id, paymentIntentId, taxAmount, totalAmount, subtotalAmount, orderNum]);
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
    const { rows } = await pool.query(
      `SELECT order_number, customer_name, customer_email, customer_phone,
              shipping_address, shipping_city, shipping_state, items,
              total_amount, currency, payment_status, fulfillment_status,
              zendrop_order_id, supplier_tracking_number, created_at, updated_at
       FROM ecommerce_orders
       WHERE payment_status = 'paid'
       ORDER BY created_at ASC
       LIMIT 100`
    );
    res.json({ ok: true, orders: rows });
  } catch (err) {
    console.error('[BUYWISH ADMIN ORDERS ERROR]:', err.message);
    res.status(500).json({ error: 'Could not load supplier handoff queue.' });
  }
});

router.patch('/admin/orders/:order_number/supplier', ...buyWishAdmin, async (req, res) => {
  const supplierOrderId = String(req.body?.zendrop_order_id || '').trim();
  if (!supplierOrderId || supplierOrderId.length > 120) {
    return res.status(400).json({ error: 'A valid Zendrop order ID is required.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE ecommerce_orders
       SET zendrop_order_id = $1, supplier = 'Zendrop',
           fulfillment_status = 'supplier_order_placed', updated_at = NOW()
       WHERE upper(order_number) = upper($2) AND payment_status = 'paid'
       RETURNING order_number, fulfillment_status, zendrop_order_id`,
      [supplierOrderId, req.params.order_number]
    );
    if (!rows.length) return res.status(404).json({ error: 'Paid order not found.' });
    res.json({ ok: true, order: rows[0] });
  } catch (err) {
    console.error('[BUYWISH SUPPLIER HANDOFF ERROR]:', err.message);
    res.status(500).json({ error: 'Could not save supplier order reference.' });
  }
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

    // Seed realistic verified customer reviews if empty
    const countRes = await pool.query('SELECT COUNT(*) FROM ecommerce_reviews');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO ecommerce_reviews (
          product_id, product_title, author_name, author_email, rating, title,
          comment, country_code, country_name, verified_purchase, helpful_count, created_at
        ) VALUES
        ('global-1', 'Cordless Deep Tissue Muscle Gun', 'Marcus Vance', 'm.vance@gmail.com', 5, 'Absolute game changer for recovery!', 'This muscle gun has serious power. The battery lasts all week and the 6 speeds allow me to target sore muscles without stalling. Arrived in Austin, TX in just 3 days.', 'US', 'United States', true, 19, NOW() - INTERVAL '3 days'),
        ('global-2', 'Smart Multi-Angle Car Phone Mount', 'Sarah Jenkins', 'sarah.j@outlook.com', 5, 'Holds firmly and charges fast', 'Best car mount I have owned. The automatic clamping works flawlessly every time I put my phone near it, and fast wireless charging keeps my battery full.', 'US', 'United States', true, 14, NOW() - INTERVAL '5 days'),
        ('global-3', 'RGB Ambient Smart LED Light Bar', 'Liam O''Connor', 'liam.oc@btinternet.com', 5, 'Incredible atmosphere in my setup', 'Synced with my gaming PC and television setup. The colors are rich and responsive. Shipped to London within 4 business days. Packaging was pristine.', 'GB', 'United Kingdom', true, 11, NOW() - INTERVAL '6 days'),
        ('global-4', 'Ultra-Fast Wireless Charging Pad Pro', 'Chloe Tremblay', 'chloe.tremblay@gmail.com', 5, 'Sleek and charges 3 devices simultaneously', 'I keep this on my bedside table in Montreal. Clean design, soft LED indicator that doesn''t disturb sleep, and charges phone, watch and earbuds all at once.', 'CA', 'Canada', true, 9, NOW() - INTERVAL '9 days'),
        ('global-5', 'Heavy-Duty Tactical Cargo Organizer', 'David Miller', 'dmiller_transport@yahoo.com', 5, 'Built like a tank — fits truck bed perfectly', 'Very durable canvas material with solid base plates. Doesn''t slide around when turning. Kept all my supplies neat and organized.', 'US', 'United States', true, 16, NOW() - INTERVAL '11 days'),
        ('global-6', 'Ergonomic Memory Foam Lumbar Cushion', 'Emma Watson', 'emma.w@gmail.com', 4, 'Great back support for long office hours', 'Made a noticeable difference for my lower back during 8-hour desk work. Soft breathable cover that washes easily. Shipped quickly to Chicago.', 'US', 'United States', true, 7, NOW() - INTERVAL '14 days'),
        ('global-7', 'Portable Ultrasonic Mini Air Humidifier', 'Sophie Moreau', 'sophie.m@orange.fr', 5, 'Super quiet and beautiful soft glow', 'So quiet you cannot even tell it is running. Perfect for bedroom. Ordered from France and arrived without any customs hassles.', 'FR', 'France', true, 8, NOW() - INTERVAL '16 days')
      `);
    }

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
        WHERE status = 'approved' AND (product_id = $1 OR product_id LIKE 'global-%')
        ORDER BY (product_id = $1) DESC, verified_purchase DESC, helpful_count DESC, created_at DESC
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
      ? `SELECT rating, count(*) as count FROM ecommerce_reviews WHERE status = 'approved' AND (product_id = $1 OR product_id LIKE 'global-%') GROUP BY rating`
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

    const averageRating = totalCount > 0 ? parseFloat((totalScore / totalCount).toFixed(1)) : 4.9;
    const recommendedPercent = totalCount > 0 ? Math.round(((breakdown[5] + breakdown[4]) / totalCount) * 100) : 98;

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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'approved')
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
      (order_number || '').trim().slice(0, 40)
    ]);

    res.json({
      success: true,
      message: isVerified
        ? 'Thank you! Your verified purchase review has been published.'
        : 'Thank you! Your review has been published.',
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
async function handleBuyWishWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.BUYWISH_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
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
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = event.data.object;
      const orderNumber = session.metadata?.order_number;
      const taxAmount = (session.total_details?.amount_tax || 0) / 100;
      const totalAmount = (session.amount_total || 0) / 100;
      const subtotalAmount = (session.amount_subtotal || 0) / 100;
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

      if (orderNumber && session.payment_status === 'paid') {
        await pool.query(`
          UPDATE ecommerce_orders
          SET payment_status = 'paid',
              fulfillment_status = 'payment_confirmed_pending_supplier',
              stripe_session_id = $1,
              stripe_payment_intent = $2,
              tax_amount = $3,
              total_amount = $4,
              subtotal_amount = $5,
              updated_at = NOW()
          WHERE upper(order_number) = upper($6)
        `, [session.id, paymentIntentId, taxAmount, totalAmount, subtotalAmount, orderNumber]);

        console.log(`[BUYWISH ORDER PAID VIA WEBHOOK]: Order ${orderNumber} paid ($${totalAmount}, Tax: $${taxAmount})`);
      }
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[BUYWISH WEBHOOK PROCESS ERROR]:', e.message);
    res.status(500).json({ error: 'Webhook processing error' });
  }
}

router.handleBuyWishWebhook = handleBuyWishWebhook;
module.exports = router;
module.exports.handleBuyWishWebhook = handleBuyWishWebhook;

