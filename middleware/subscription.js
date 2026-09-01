const pool = require('../db');

const TRIAL_DAYS = parseInt(process.env.PORTAL_TRIAL_DAYS || process.env.STRIPE_TRIAL_DAYS || '7', 10);
const ACTIVE_SUB_STATUSES = ['trialing', 'active'];

/**
 * Carrier portal access: 7-day portal trial OR Stripe subscription (trialing/active).
 * Paying before trial ends keeps access via subscription status.
 */
async function getCarrierAccess(userId, email) {
  const userRes = await pool.query(
    `SELECT id, role, is_suspended, trial_ends_at, email_verified_at, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!userRes.rows.length) {
    return { allowed: false, reason: 'not_found' };
  }
  const user = userRes.rows[0];

  if (user.is_suspended) {
    return { allowed: false, reason: 'suspended', message: 'Account suspended. Contact Shipping Wish support.' };
  }

  const subRes = await pool.query(
    `SELECT b.* FROM billing_subscriptions b
     LEFT JOIN crm_leads l ON l.id = b.lead_id
     WHERE b.user_id = $1 OR lower(l.email) = lower($2)
     ORDER BY b.created_at DESC LIMIT 1`,
    [userId, email || '']
  ).catch(() => ({ rows: [] }));

  const sub = subRes.rows[0] || null;
  if (sub && ACTIVE_SUB_STATUSES.includes(String(sub.status || '').toLowerCase())) {
    return {
      allowed: true,
      mode: 'subscription',
      subscription: sub,
      trialDays: TRIAL_DAYS
    };
  }

  const trialEnds = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
  if (trialEnds && trialEnds > new Date()) {
    const msLeft = trialEnds.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return {
      allowed: true,
      mode: 'portal_trial',
      trialEndsAt: trialEnds.toISOString(),
      trialDaysLeft: daysLeft,
      subscription: sub,
      trialDays: TRIAL_DAYS
    };
  }

  return {
    allowed: false,
    reason: 'trial_expired',
    message: 'Your 7-day portal trial ended. Start or complete weekly Stripe billing to keep using the TMS.',
    checkoutUrl: '/checkout?plan=solo_weekly',
    trialEndsAt: trialEnds ? trialEnds.toISOString() : null,
    subscription: sub,
    trialDays: TRIAL_DAYS
  };
}

function isCarrierRole(role) {
  return role === 'carrier' || role === 'carrier_admin';
}

function requireCarrierSubscription(req, res, next) {
  if (!req.user || !isCarrierRole(req.user.role)) return next();

  getCarrierAccess(req.user.id, req.user.email)
    .then((access) => {
      if (!access.allowed) {
        return res.status(403).json({
          error: access.message || 'Subscription required.',
          code: 'SUBSCRIPTION_REQUIRED',
          reason: access.reason,
          checkoutUrl: access.checkoutUrl || '/checkout?plan=solo_weekly',
          access
        });
      }
      req.carrierAccess = access;
      next();
    })
    .catch((err) => {
      console.error('requireCarrierSubscription:', err);
      res.status(500).json({ error: 'Could not verify subscription status.' });
    });
}

module.exports = {
  TRIAL_DAYS,
  ACTIVE_SUB_STATUSES,
  getCarrierAccess,
  isCarrierRole,
  requireCarrierSubscription
};
