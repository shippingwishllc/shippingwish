// Only the Shipping Wish Stripe account is approved.
// LoadsNexus, NYC Limo Wish, and BuyWish Online charge that same account.
// Brand-specific keys are ignored even if they are still set in the environment.

function approvedSecret() {
  return process.env.STRIPE_SECRET_KEY || process.env.SHIPPINGWISH_STRIPE_SECRET_KEY || '';
}

function approvedWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || process.env.SHIPPINGWISH_STRIPE_WEBHOOK_SECRET || '';
}

function getApprovedStripe() {
  const key = approvedSecret();
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) return null;
  return require('stripe')(key);
}

module.exports = {
  approvedSecret,
  approvedWebhookSecret,
  getApprovedStripe
};
