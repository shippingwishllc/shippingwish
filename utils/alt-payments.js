// utils/alt-payments.js
// Native Zero-Dependency Square Online Checkout (v2) + PayPal Commerce Platform (Orders v2)
// Strictly isolated per brand (buywish, nyclimo) so Shipping Wish LLC's Stripe account is NEVER touched.

const crypto = require('crypto');

function brandPrefix(brand) {
  const b = String(brand || '').toLowerCase();
  if (b === 'buywish') return 'BUYWISH';
  if (b === 'nyclimo') return 'NYCLIMO';
  return 'ALT';
}

function getSquareConfig(brand) {
  const p = brandPrefix(brand);
  const accessToken = (process.env[`${p}_SQUARE_ACCESS_TOKEN`] || '').trim();
  const locationId = (process.env[`${p}_SQUARE_LOCATION_ID`] || '').trim();
  const env = String(process.env[`${p}_SQUARE_ENV`] || 'production').toLowerCase();
  const baseUrl = env === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
  return {
    configured: Boolean(accessToken && locationId),
    accessToken,
    locationId,
    env,
    baseUrl
  };
}

function getPayPalConfig(brand) {
  const p = brandPrefix(brand);
  const clientId = (process.env[`${p}_PAYPAL_CLIENT_ID`] || '').trim();
  const clientSecret = (process.env[`${p}_PAYPAL_CLIENT_SECRET`] || '').trim();
  const env = String(process.env[`${p}_PAYPAL_ENV`] || 'live').toLowerCase();
  const baseUrl = env === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
  return {
    configured: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    env,
    baseUrl
  };
}

function getBrandGatewayStatus(brand) {
  const sq = getSquareConfig(brand);
  const pp = getPayPalConfig(brand);
  const active_provider = sq.configured ? 'square' : pp.configured ? 'paypal' : null;
  const available_providers = [];
  if (sq.configured) available_providers.push('square');
  if (pp.configured) available_providers.push('paypal');
  return {
    brand,
    active_provider,
    available_providers,
    square_configured: sq.configured,
    square_env: sq.configured ? sq.env : null,
    paypal_configured: pp.configured,
    paypal_env: pp.configured ? pp.env : null,
    stripe_isolated: true
  };
}

// ============================================================
// SQUARE ONLINE CHECKOUT API v2 (Hosted Payment Links)
// ============================================================
async function createSquareCheckout({
  brand,
  referenceId,
  title,
  description = '',
  amountCents,
  currency = 'USD',
  lineItems = null,
  redirectUrl,
  customerEmail = ''
}) {
  const cfg = getSquareConfig(brand);
  if (!cfg.configured) throw new Error(`Square is not configured for ${brand}.`);

  const cur = String(currency || 'USD').toUpperCase();
  const idempotencyKey = crypto.createHash('sha256').update(`${brand}-sq-${referenceId}-${amountCents}`).digest('hex').slice(0, 40);

  const sqLineItems = Array.isArray(lineItems) && lineItems.length > 0
    ? lineItems.map((it) => ({
        name: String(it.name || title).slice(0, 250),
        quantity: String(Math.max(1, Number(it.quantity || 1))),
        base_price_money: {
          amount: Math.max(50, Math.round(Number(it.unitAmountCents || 0))),
          currency: cur
        }
      }))
    : [{
        name: String(title || referenceId).slice(0, 250),
        note: String(description || '').slice(0, 400),
        quantity: '1',
        base_price_money: {
          amount: Math.max(50, Math.round(Number(amountCents || 0))),
          currency: cur
        }
      }];

  const body = {
    idempotency_key: idempotencyKey,
    order: {
      location_id: cfg.locationId,
      reference_id: String(referenceId).slice(0, 40),
      line_items: sqLineItems
    },
    checkout_options: {
      redirect_url: redirectUrl,
      ask_for_shipping_address: brand === 'buywish',
      accepted_payment_methods: {
        apple_pay: true,
        google_pay: true,
        cash_app_pay: cur === 'USD'
      }
    }
  };
  if (customerEmail) {
    body.pre_populated_data = { buyer_email: String(customerEmail).slice(0, 254) };
  }

  const res = await fetch(`${cfg.baseUrl}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': '2025-01-23'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.payment_link?.url) {
    const errMsg = data.errors?.[0]?.detail || data.message || `Square API error (${res.status})`;
    throw new Error(errMsg);
  }

  const orderId = data.payment_link.order_id || data.related_resources?.orders?.[0]?.id || data.payment_link.id;
  return {
    provider: 'square',
    sessionId: `square:${orderId}`,
    externalId: orderId,
    url: data.payment_link.url
  };
}

async function verifySquarePayment({ brand, orderId, expectedCountry = '', strictCountryMatch = false }) {
  const cfg = getSquareConfig(brand);
  if (!cfg.configured) throw new Error(`Square is not configured for ${brand}.`);

  const cleanOrderId = String(orderId || '').replace(/^square:/, '').trim();
  const res = await fetch(`${cfg.baseUrl}/v2/orders/${encodeURIComponent(cleanOrderId)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${cfg.accessToken}`,
      'Square-Version': '2025-01-23'
    },
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.order) {
    throw new Error(data.errors?.[0]?.detail || 'Could not verify Square order.');
  }

  const order = data.order;
  const tenders = Array.isArray(order.tenders) ? order.tenders : [];
  const paidTender = tenders.find((t) => ['CAPTURED', 'COMPLETED'].includes(String(t.card_details?.status || '').toUpperCase())) || tenders[0];
  const isPaid = String(order.state || '').toUpperCase() === 'COMPLETED' || Boolean(paidTender);

  if (!isPaid) {
    return { ok: true, paid: false, provider: 'square', orderId: cleanOrderId };
  }

  // Inspect actual Square Payment object for billing/card country anti-chargeback check
  const paymentId = paidTender?.payment_id || paidTender?.id || null;
  let billingCountry = '';
  let riskLevel = '';
  if (paymentId) {
    try {
      const pRes = await fetch(`${cfg.baseUrl}/v2/payments/${encodeURIComponent(paymentId)}`, {
        headers: {
          'Authorization': `Bearer ${cfg.accessToken}`,
          'Square-Version': '2025-01-23'
        },
        signal: AbortSignal.timeout(8000)
      });
      const pData = await pRes.json().catch(() => ({}));
      const pay = pData.payment || {};
      billingCountry = String(pay.billing_address?.country || '').toUpperCase().trim();
      riskLevel = String(pay.risk_evaluation?.risk_level || '').toUpperCase().trim();

      const exp = String(expectedCountry || '').toUpperCase().trim();
      let blockReason = null;
      if (strictCountryMatch && exp && billingCountry && billingCountry !== exp) {
        blockReason = `Card billing country (${billingCountry}) does not match shipping country (${exp}).`;
      } else if (strictCountryMatch && riskLevel === 'HIGH') {
        blockReason = 'Square Risk Evaluation flagged this transaction as HIGH risk.';
      }

      if (blockReason && pay.amount_money?.amount) {
        // Automatic instant refund so zero chargeback & zero fulfillment occur
        await fetch(`${cfg.baseUrl}/v2/refunds`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfg.accessToken}`,
            'Content-Type': 'application/json',
            'Square-Version': '2025-01-23'
          },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            payment_id: paymentId,
            amount_money: pay.amount_money,
            reason: `Fraud Shield: ${blockReason}`
          }),
          signal: AbortSignal.timeout(10000)
        }).catch(() => {});
        return { ok: false, paid: false, fraudBlocked: true, reason: blockReason, provider: 'square' };
      }
    } catch (_) {}
  }

  return {
    ok: true,
    paid: true,
    provider: 'square',
    orderId: cleanOrderId,
    paymentId,
    billingCountry,
    amountTotal: Number(order.total_money?.amount || 0) / 100,
    currency: order.total_money?.currency || 'USD'
  };
}

// ============================================================
// PAYPAL COMMERCE PLATFORM (Orders v2 REST API)
// ============================================================
const paypalTokenCache = {};
async function getPayPalAccessToken(brand) {
  const cfg = getPayPalConfig(brand);
  if (!cfg.configured) throw new Error(`PayPal is not configured for ${brand}.`);
  const cached = paypalTokenCache[brand];
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${cfg.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'PayPal authentication failed.');
  }
  paypalTokenCache[brand] = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || 3000) * 1000)
  };
  return data.access_token;
}

async function createPayPalCheckout({
  brand,
  referenceId,
  title,
  description = '',
  amountCents,
  currency = 'USD',
  returnUrl,
  cancelUrl
}) {
  const cfg = getPayPalConfig(brand);
  const accessToken = await getPayPalAccessToken(brand);
  const cur = String(currency || 'USD').toUpperCase();
  const value = (Math.max(50, Math.round(Number(amountCents || 0))) / 100).toFixed(2);
  const brandDisplay = brand === 'buywish' ? 'BuyWishOnline' : 'NYC Limo Wish';

  const res = await fetch(`${cfg.baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(referenceId).slice(0, 127),
        custom_id: String(referenceId).slice(0, 127),
        description: String(description || title || referenceId).slice(0, 127),
        amount: {
          currency_code: cur,
          value
        }
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: brandDisplay,
            landing_page: 'LOGIN',
            user_action: 'PAY_NOW',
            shipping_preference: brand === 'buywish' ? 'GET_FROM_FILE' : 'NO_SHIPPING',
            return_url: returnUrl,
            cancel_url: cancelUrl
          }
        }
      }
    }),
    signal: AbortSignal.timeout(12000)
  });

  const data = await res.json().catch(() => ({}));
  const approveLink = Array.isArray(data.links)
    ? (data.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href)
    : null;
  if (!res.ok || !data.id || !approveLink) {
    throw new Error(data.details?.[0]?.description || data.message || `PayPal order creation failed (${res.status})`);
  }

  return {
    provider: 'paypal',
    sessionId: `paypal:${data.id}`,
    externalId: data.id,
    url: approveLink
  };
}

async function verifyAndCapturePayPalOrder({ brand, orderId, expectedCountry = '', strictCountryMatch = false }) {
  const cfg = getPayPalConfig(brand);
  const accessToken = await getPayPalAccessToken(brand);
  const cleanOrderId = String(orderId || '').replace(/^paypal:/, '').trim();

  // Step 1: Inspect PayPal Order BEFORE capture to enforce country-match anti-chargeback shield!
  const getRes = await fetch(`${cfg.baseUrl}/v2/checkout/orders/${encodeURIComponent(cleanOrderId)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000)
  });
  const order = await getRes.json().catch(() => ({}));
  if (!getRes.ok || !order.id) {
    throw new Error(order.message || 'Could not retrieve PayPal order.');
  }

  const payerCountry = String(order.payer?.address?.country_code || '').toUpperCase().trim();
  const exp = String(expectedCountry || '').toUpperCase().trim();

  if (order.status === 'COMPLETED') {
    const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      ok: true,
      paid: true,
      provider: 'paypal',
      orderId: cleanOrderId,
      paymentId: cap?.id || cleanOrderId,
      payerCountry,
      amountTotal: Number(cap?.amount?.value || order.purchase_units?.[0]?.amount?.value || 0),
      currency: cap?.amount?.currency_code || order.purchase_units?.[0]?.amount?.currency_code || 'USD'
    };
  }

  if (order.status !== 'APPROVED') {
    return { ok: true, paid: false, provider: 'paypal', orderId: cleanOrderId, status: order.status };
  }

  // Country mismatch check BEFORE capture — zero funds taken, zero chargeback!
  if (strictCountryMatch && exp && payerCountry && payerCountry !== exp) {
    return {
      ok: false,
      paid: false,
      fraudBlocked: true,
      provider: 'paypal',
      reason: `PayPal account country (${payerCountry}) does not match shipping country (${exp}). Payment was NOT captured.`
    };
  }

  // Step 2: Capture approved & verified PayPal Order
  const capRes = await fetch(`${cfg.baseUrl}/v2/checkout/orders/${encodeURIComponent(cleanOrderId)}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(12000)
  });
  const captured = await capRes.json().catch(() => ({}));
  if (!capRes.ok || captured.status !== 'COMPLETED') {
    throw new Error(captured.details?.[0]?.description || captured.message || 'Could not capture PayPal payment.');
  }

  const capObj = captured.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    ok: true,
    paid: true,
    provider: 'paypal',
    orderId: cleanOrderId,
    paymentId: capObj?.id || cleanOrderId,
    payerCountry,
    amountTotal: Number(capObj?.amount?.value || 0),
    currency: capObj?.amount?.currency_code || 'USD'
  };
}

// ============================================================
// UNIFIED BRAND CHECKOUT DISPATCHER (Square or PayPal)
// ============================================================
async function createBrandCheckout(opts) {
  const status = getBrandGatewayStatus(opts.brand);
  const preferred = String(opts.preferredProvider || '').toLowerCase();
  let chosen = status.active_provider;
  if (preferred === 'paypal' && status.paypal_configured) chosen = 'paypal';
  if (preferred === 'square' && status.square_configured) chosen = 'square';

  if (chosen === 'square') {
    return createSquareCheckout(opts);
  }
  if (chosen === 'paypal') {
    return createPayPalCheckout({
      ...opts,
      returnUrl: opts.returnUrl || opts.redirectUrl,
      cancelUrl: opts.cancelUrl || opts.redirectUrl
    });
  }
  return null;
}

async function verifyBrandPayment({ brand, sessionId, expectedCountry = '', strictCountryMatch = false }) {
  const raw = String(sessionId || '').trim();
  if (raw.startsWith('square:')) {
    return verifySquarePayment({ brand, orderId: raw, expectedCountry, strictCountryMatch });
  }
  if (raw.startsWith('paypal:')) {
    return verifyAndCapturePayPalOrder({ brand, orderId: raw, expectedCountry, strictCountryMatch });
  }
  return null;
}

module.exports = {
  getSquareConfig,
  getPayPalConfig,
  getBrandGatewayStatus,
  createSquareCheckout,
  verifySquarePayment,
  createPayPalCheckout,
  verifyAndCapturePayPalOrder,
  createBrandCheckout,
  verifyBrandPayment
};
