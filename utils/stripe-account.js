// STRICT Per-Brand Stripe Account Hard-Lock.
// Shipping Wish LLC (acct_1TUR7pHmcOqr16cJ) is ONLY permitted for Shipping Wish & Loads Nexus (USA Trucking SaaS).
// BuyWishOnline (E-Commerce) and NYC Limo Wish (Chauffeur) are STRICTLY FORBIDDEN from falling back to
// Shipping Wish LLC's STRIPE_SECRET_KEY to protect the manually reinstated Shipping Wish LLC Stripe account.

function approvedSecret(brand = 'shippingwish') {
  const b = String(brand || 'shippingwish').toLowerCase();
  if (b === 'buywish') {
    // Hard-locked: NEVER falls back to Shipping Wish LLC Stripe key!
    return process.env.BUYWISH_STRIPE_SECRET_KEY || '';
  }
  if (b === 'nyclimo') {
    // Hard-locked: NEVER falls back to Shipping Wish LLC Stripe key!
    return process.env.NYCLIMO_STRIPE_SECRET_KEY || '';
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
    return process.env.BUYWISH_STRIPE_WEBHOOK_SECRET || '';
  }
  if (b === 'nyclimo') {
    return process.env.NYCLIMO_STRIPE_WEBHOOK_SECRET || '';
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
