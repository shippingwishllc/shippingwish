const pool = require('../db');

const TRIAL_DAYS = parseInt(process.env.PORTAL_TRIAL_DAYS || process.env.STRIPE_TRIAL_DAYS || '7', 10);
const ACTIVE_SUB_STATUSES = ['trialing', 'active'];

/**
 * Carrier portal access: 7-day portal trial OR Stripe subscription (trialing/active).
 * Paying before trial ends keeps access via subscription status.
 */
async function getCarrierAccess(userId, email) {
  const userRes = await pool.query(
    `SELECT id, role, is_suspended, trial_ends_at, email_verified_at, created_at, weekly_plan
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

  if (user.weekly_plan === 'canceled') {
    return {
      allowed: false,
      reason: 'canceled',
      message: 'Your subscription was canceled and portal access has ended. Contact Shipping Wish support to reactivate.',
      checkoutUrl: '/signup?reactivate=1'
    };
  }

  if (user.weekly_plan === 'past_due') {
    return {
      allowed: false,
      reason: 'past_due',
      message: 'Your recent subscription payment failed or is past due. Please pay your outstanding invoice or update your payment card to restore access.',
      checkoutUrl: '/checkout?plan=solo_weekly'
    };
  }

  if (user.weekly_plan === 'pending_card') {
    return {
      allowed: false,
      reason: 'pending_card',
      message: 'Credit card capture is required to activate your 7-day free trial ($0 due today).',
      checkoutUrl: '/signup'
    };
  }

  const subRes = await pool.query(
    `SELECT b.* FROM billing_subscriptions b
     LEFT JOIN crm_leads l ON l.id = b.lead_id
     WHERE b.user_id = $1 OR lower(l.email) = lower($2)
     ORDER BY b.created_at DESC LIMIT 1`,
    [userId, email || '']
  ).catch(() => ({ rows: [] }));

  const sub = subRes.rows[0] || null;

  if (sub && String(sub.status || '').toLowerCase() === 'canceled') {
    return {
      allowed: false,
      reason: 'canceled',
      message: 'Your subscription was canceled and portal access has ended. Contact Shipping Wish support to reactivate.',
      checkoutUrl: '/signup?reactivate=1'
    };
  }

  if (sub && ['past_due', 'unpaid'].includes(String(sub.status || '').toLowerCase())) {
    return {
      allowed: false,
      reason: 'past_due',
      message: 'Your latest subscription payment failed. Please pay your outstanding invoice or update your credit card to restore access.',
      checkoutUrl: '/checkout?plan=solo_weekly'
    };
  }

  if (sub && String(sub.status || '').toLowerCase() === 'frozen_dispute') {
    return {
      allowed: false,
      reason: 'disputed_frozen',
      message: 'Account access has been frozen due to a payment dispute. Contact billing support at +1 (800) 580-3101.',
      checkoutUrl: '/contact'
    };
  }

  if (sub && ACTIVE_SUB_STATUSES.includes(String(sub.status || '').toLowerCase())) {
    return {
      allowed: true,
      mode: 'subscription',
      subscription: sub,
      trialDays: TRIAL_DAYS
    };
  }

  const isLoadBoardPlan = user.weekly_plan && (
    user.weekly_plan.startsWith('loadboard_') ||
    user.weekly_plan === 'loadboard_pass' ||
    user.weekly_plan === 'loadboard_ai_pass' ||
    user.weekly_plan === 'loadboard_team_pass' ||
    user.weekly_plan === 'loadboard_fleet_pass'
  );
  if (isLoadBoardPlan && (!sub || ACTIVE_SUB_STATUSES.includes(String(sub.status || '').toLowerCase()))) {
    return {
      allowed: true,
      mode: 'loadboard_subscription',
      subscription: sub || { status: 'active', plan_key: user.weekly_plan },
      trialDays: 365
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
