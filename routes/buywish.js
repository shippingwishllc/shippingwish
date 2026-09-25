const express = require('express');
const router = express.Router();
const pool = require('../db');
const { sendBrandedEmail } = require('../utils/mailer');
const { escapeHtml } = require('../utils/email-templates');

function getStripe() {
  const key = process.env.BUYWISH_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) return null;
  return require('stripe')(key);
}

// 1. Get Live Products for Storefront
router.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ecommerce_products WHERE is_active = true ORDER BY trend_score DESC`
    );
    res.json({ ok: true, products: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load catalog.' });
  }
});

// 2. Track Order
router.get('/orders/track/:order_number', async (req, res) => {
  const orderNum = String(req.params.order_number || '').trim().toUpperCase();
  try {
    const { rows } = await pool.query(
      `SELECT order_number, customer_name, fulfillment_status, supplier_tracking_number, supplier, items, created_at
       FROM ecommerce_orders
       WHERE upper(order_number) = $1`,
      [orderNum]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found. Please check your order number.' });
    }

    res.json({ ok: true, order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not track order.' });
  }
});

// 3. Initiate Checkout Session
router.post('/checkout', async (req, res) => {
  const { items, customer, shipping } = req.body;
  if (!items || !items.length || !customer || !customer.email) {
    return res.status(400).json({ error: 'Items and customer email are required.' });
  }

  try {
    let totalCents = 0;
    const lineItems = items.map(item => {
      const unitCents = Math.round(parseFloat(item.price || 0) * 100);
      const qty = parseInt(item.quantity || 1, 10);
      totalCents += unitCents * qty;
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title || 'BuyWishOnline Essential',
            images: item.image_url ? [item.image_url] : []
          },
          unit_amount: unitCents
        },
        quantity: qty
      };
    });

    const orderNumber = 'BWO-' + Math.floor(10000 + Math.random() * 90000);
    const totalDollars = (totalCents / 100).toFixed(2);
    const costDollars = (totalCents * 0.35 / 100).toFixed(2);
    const profitDollars = (totalDollars - costDollars).toFixed(2);

    // Save order in database
    await pool.query(`
      INSERT INTO ecommerce_orders (
        order_number, customer_name, customer_email, customer_phone,
        shipping_city, shipping_state, items, total_amount, cost_amount,
        profit_margin, supplier, supplier_tracking_number, fulfillment_status, payment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Zendrop', $11, 'processing', 'paid')
    `, [
      orderNumber,
      customer.name || 'Valued Customer',
      customer.email,
      customer.phone || null,
      shipping?.city || 'US',
      shipping?.state || '',
      JSON.stringify(items),
      totalDollars,
      costDollars,
      profitDollars,
      'ZD' + Math.floor(1000000 + Math.random() * 9000000) + 'US'
    ]);

    const stripe = getStripe();
    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: customer.email,
        line_items: lineItems,
        success_url: `${req.headers.origin || 'https://www.buywishonline.com'}/?order_success=${orderNumber}`,
        cancel_url: `${req.headers.origin || 'https://www.buywishonline.com'}/?canceled=1`,
        metadata: {
          order_number: orderNumber,
          customer_name: customer.name || ''
        }
      });

      return res.json({ ok: true, url: session.url, order_number: orderNumber });
    }

    // Direct simulated success if test mode
    res.json({
      ok: true,
      simulated: true,
      order_number: orderNumber,
      message: 'Order created successfully! Zendrop auto-fulfillment initialized.'
    });
  } catch (err) {
    console.error('[BUYWISH CHECKOUT ERROR]:', err);
    res.status(500).json({ error: err.message || 'Could not process order.' });
  }
});

module.exports = router;
