// Per-brand Stripe account isolation.
// Shipping Wish & Loads Nexus share the primary Shipping Wish LLC Trucking SaaS Stripe account.
// BuyWishOnline (E-Commerce) and NYC Limo Wish (Chauffeur) should use their own dedicated
// Stripe sub-accounts (BUYWISH_STRIPE_SECRET_KEY / NYCLIMO_STRIPE_SECRET_KEY) to prevent
// MCC/descriptor mismatch or dropshipping disputes from affecting Shipping Wish LLC.

function approvedSecret(brand = 'shippingwish') {
  const b = String(brand || 'shippingwish').toLowerCase();
  if (b === 'buywish') {
    return process.env.BUYWISH_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || process.env.SHIPPINGWISH_STRIPE_SECRET_KEY || '';
  }
  if (b === 'nyclimo') {
    return process.env.NYCLIMO_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || process.env.SHIPPINGWISH_STRIPE_SECRET_KEY || '';
  }
  return process.env.STRIPE_SECRET_KEY || process.env.SHIPPINGWISH_STRIPE_SECRET_KEY || '';
}

function hasDedicatedStripeKey(brand = 'shippingwish') {
  const b = String(brand || 'shippingwish').toLowerCase();
  if (b === 'buywish') return /^(sk|rk)_(test|live)_/.test(process.env.BUYWISH_STRIPE_SECRET_KEY || '');
  if (b === 'nyclimo') return /^(sk|rk)_(test|live)_/.test(process.env.NYCLIMO_STRIPE_SECRET_KEY || '');
  return /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || process.env.SHIPPINGWISH_STRIPE_SECRET_KEY || '');
}

function approvedWebhookSecret(brand = 'shippingwish') {
  const b = String(brand || 'shippingwish').toLowerCase();
  if (b === 'buywish') {
    return process.env.BUYWISH_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';
  }
  if (b === 'nyclimo') {
    return process.env.NYCLIMO_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';
  }
  return process.env.STRIPE_WEBHOOK_SECRET || process.env.SHIPPINGWISH_STRIPE_WEBHOOK_SECRET || '';
}

function getApprovedStripe(brand = 'shippingwish') {
  const key = approvedSecret(brand);
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) return null;
  return require('stripe')(key);
}

module.exports = {
  approvedSecret,
  approvedWebhookSecret,
  hasDedicatedStripeKey,
  getApprovedStripe
};
