const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireRole, JWT_SECRET, setAuthCookie } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');
const { buildTemplate, COMPANY, APP_URL, escapeHtml } = require('../utils/email-templates');

const TRIAL_DAYS = parseInt(process.env.STRIPE_TRIAL_DAYS || '7', 10);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) return null;
  return require('stripe')(key);
}

const PLANS = {
  loadboard_ai_pass: {
    key: 'loadboard_ai_pass',
    name: 'Carrier AI Load Board & FMCSA Authority Suite',
    trucks: 'Self-Dispatch',
    amount_cents: parseInt(process.env.STRIPE_PLAN_LOADBOARD_CENTS || '1900', 10),
    price_env: 'STRIPE_PRICE_LOADBOARD',
    interval: 'month',
    description: 'Instant self-dispatch access to 50-State Live Spot Freight AI Search, Direct Broker Contacts, and FMCSA Authority & Credit Score Check.',
    features: [
      'Unlimited 50-State Live Spot Freight AI Search',
      'Unmasked Direct Broker Phone Numbers & Emails',
      'Freight Brokers & FMCSA Authority Check (Credit Score, $75k Bond, DTP)',
      'Dynamic RPM & Deadhead Corridors Calculator',
      'Instant Self-Dispatch Carrier Cockpit'
    ]
  },
  solo_weekly: {
    key: 'solo_weekly',
    name: 'Owner Operator — Dedicated Fleet Manager',
    trucks: '1 truck',
    amount_cents: parseInt(process.env.STRIPE_PLAN_SOLO_CENTS || '14900', 10),
    price_env: 'STRIPE_PRICE_SOLO',
    description: 'Named operations manager for one truck. Load booking, broker handling, and TMS included. You keep freight pay.',
    features: [
      'Named 24/7 operations manager on your company',
      'Load finding and booking — you do not buy a load-board seat',
      'Full TMS portal included',
      'Broker packets, rate cons, BOL, POD follow-up',
      'You invoice the broker or factor directly'
    ]
  },
  fleet_weekly: {
    key: 'fleet_weekly',
    name: 'Small Fleet — Dedicated Operations Desk',
    trucks: '2–5 trucks',
    amount_cents: parseInt(process.env.STRIPE_PLAN_FLEET_CENTS || '35000', 10),
    price_env: 'STRIPE_PRICE_FLEET',
    description: 'Dedicated desk for a small fleet. Multi-truck planning, higher RPM, less deadhead.',
    features: [
      'Everything in Owner Operator',
      'Multi-truck load planning and reload strategy',
      'RPM and deadhead reporting',
      'IFTA mileage support',
      'Driver and equipment coordination'
    ]
  },
  command_weekly: {
    key: 'command_weekly',
    name: 'Fleet Command — Company Operations Team',
    trucks: '6+ trucks',
    amount_cents: parseInt(process.env.STRIPE_PLAN_COMMAND_CENTS || process.env.STRIPE_PLAN_CUSTOM_CENTS || '50000', 10),
    price_env: 'STRIPE_PRICE_COMMAND',
    description: 'A full operations team working as staff for your motor carrier. Lane strategy, compliance support, custom TMS.',
    features: [
      'Everything in Small Fleet',
      'Dedicated multi-person operations desk',
      'Preferred-lane and network strategy',
      'Compliance and insurance coordination',
      'Custom TMS setup for your company'
    ]
  }
};

PLANS.custom_weekly = PLANS.command_weekly;

function trucksCount(trucks) {
  const s = String(trucks == null ? '' : trucks).trim();
  if (s === '2-5') return 3;
  if (s === '6+') return 6;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function opsRecipients() {
  return [...new Set([
    COMPANY.operationsEmail,
    process.env.ADMIN_EMAIL_1,
    process.env.ADMIN_EMAIL_2
  ].filter(Boolean))];
}

async function notifyStaff({ subject, html, text }) {
  for (const to of opsRecipients()) {
    try {
      await sendBrandedEmail({
        to,
        subject,
        html,
        text,
        emailType: 'internal_lead',
        templateKey: 'internal_checkout'
      });
    } catch (err) {
      console.error('Staff notify:', err.message);
    }
  }
}

async function upsertWebsiteLead({
  email,
  name,
  company,
  phone,
  trucks,
  mcNumber,
  usdot,
  planKey,
  status,
  extraNote
}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  const plan = PLANS[planKey] || PLANS.solo_weekly;
  const note = extraNote || [
    `Website Stripe checkout — ${plan.name}`,
    `$${(plan.amount_cents / 100).toFixed(0)} / week after 7-day trial.`,
    `Trucks: ${trucks || '-'}.`,
    mcNumber ? `MC ${mcNumber}.` : '',
    usdot ? `USDOT ${usdot}.` : ''
  ].filter(Boolean).join(' ');

  try {
    const existing = await pool.query(
      `SELECT id FROM crm_leads WHERE email IS NOT NULL AND email != '' AND lower(email) = $1 ORDER BY id DESC LIMIT 1`,
      [cleanEmail]
    );
    if (existing.rows.length) {
      const id = existing.rows[0].id;
      await pool.query(
        `UPDATE crm_leads SET
           company_name = COALESCE(NULLIF($2,''), company_name),
           owner_name = COALESCE(NULLIF($3,''), owner_name),
           phone = COALESCE(NULLIF($4,''), phone),
           mc_number = COALESCE(NULLIF($5,''), mc_number),
           dot_number = COALESCE(NULLIF($6,''), dot_number),
           num_trucks = COALESCE($7, num_trucks),
           notes = TRIM(BOTH FROM COALESCE(notes,'') || E'\n' || $8),
           status = CASE WHEN $9 = 'active' THEN 'active' WHEN status = 'active' THEN status ELSE COALESCE(NULLIF($9,''), status) END,
           last_contacted_at = now()
         WHERE id = $1`,
        [
          id,
          company || '',
          name || '',
          phone || '',
          mcNumber || '',
          usdot || '',
          trucksCount(trucks),
          note,
          status || 'new'
        ]
      );
      return id;
    }

    const ins = await pool.query(
      `INSERT INTO crm_leads (company_name, owner_name, phone, email, mc_number, dot_number, num_trucks, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        company || name || 'Website checkout',
        name || '',
        phone || '',
        cleanEmail,
        mcNumber || '',
        usdot || '',
        trucksCount(trucks),
        status || 'new',
        note
      ]
    );
    const id = ins.rows[0].id;
    try {
      await pool.query(
        `INSERT INTO lead_tasks (lead_id, task_title, due_date)
         VALUES ($1, $2, CURRENT_DATE)`,
        [id, status === 'active' ? `Start operations desk — ${company || name}` : `Follow website checkout — ${company || name}`]
      );
    } catch (_) { /* tasks table optional */ }
    return id;
  } catch (err) {
    console.error('upsertWebsiteLead:', err.message);
    return null;
  }
}

function publicPlans() {
  return ['solo_weekly', 'fleet_weekly', 'command_weekly'].map((key) => {
    const p = PLANS[key];
    return {
      key: p.key,
      name: p.name,
      trucks: p.trucks,
      amount_cents: p.amount_cents,
      amount_display: `$${(p.amount_cents / 100).toFixed(0)}`,
      interval: 'week',
      trial_days: TRIAL_DAYS,
      description: p.description,
      features: p.features
    };
  });
}

function lineItemForPlan(plan, amount) {
  const priceId = process.env[plan.price_env];
  if (priceId) {
    return { price: priceId, quantity: 1 };
  }
  const interval = plan.interval || 'week';
  const desc = plan.interval === 'month'
    ? `${plan.description} First ${TRIAL_DAYS} days free. Then billed monthly.`
    : `${plan.description} First ${TRIAL_DAYS} days free. Then billed weekly.`;
  return {
    price_data: {
      currency: 'usd',
      product_data: {
        name: plan.name,
        description: desc
      },
      unit_amount: amount,
      recurring: { interval }
    },
    quantity: 1
  };
}

async function provisionCarrierPortal({
  email,
  name,
  company,
  phone,
  mcNumber,
  usdot,
  sessionId
}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return { user: null, created: false, tempPassword: null };

  try {
    const existing = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [cleanEmail]);
    if (existing.rows.length) {
      const user = existing.rows[0];
      if (user.role !== 'carrier' && user.role !== 'carrier_admin') {
        return { user: null, created: false, skipped: true, reason: 'email_in_use' };
      }
      await pool.query(
        `UPDATE users SET
           company_name = COALESCE(NULLIF($2,''), company_name),
           phone = COALESCE(NULLIF($3,''), phone),
           mc_number = COALESCE(NULLIF($4,''), mc_number),
           dot_number = COALESCE(NULLIF($5,''), dot_number)
         WHERE id = $1`,
        [user.id, company || '', phone || '', mcNumber || '', usdot || '']
      );
      if (sessionId) {
        await pool.query(
          `UPDATE billing_subscriptions SET user_id = $1, updated_at = now()
           WHERE stripe_checkout_session_id = $2`,
          [user.id, sessionId]
        );
      }
      return { user, created: false, tempPassword: null };
    }

    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const tempPassword = crypto.randomBytes(5).toString('hex') + 'Aa1';
    const hash = await bcrypt.hash(tempPassword, 10);
    const ins = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number)
       VALUES ($1,$2,$3,'carrier',$4,$5,$6,$7)
       RETURNING id, name, email, role, company_name, phone, mc_number, dot_number`,
      [
        name || company || cleanEmail,
        cleanEmail,
        hash,
        company || name || null,
        phone || null,
        mcNumber || null,
        usdot || null
      ]
    );
    const user = ins.rows[0];
    if (sessionId) {
      await pool.query(
        `UPDATE billing_subscriptions SET user_id = $1, updated_at = now()
         WHERE stripe_checkout_session_id = $2`,
        [user.id, sessionId]
      );
    }
    return { user, created: true, tempPassword };
  } catch (err) {
    console.error('provisionCarrierPortal:', err.message);
    return { user: null, created: false, tempPassword: null, error: err.message };
  }
}

async function recordSubscription({ userId, leadId, sessionId, planKey, amount, status }) {
  try {
    const ins = await pool.query(
      `INSERT INTO billing_subscriptions (user_id, lead_id, stripe_checkout_session_id, plan_key, amount_cents, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId || null, leadId || null, sessionId, planKey, amount, status || 'incomplete']
    );
    return ins.rows[0];
  } catch (err) {
    console.error('billing_subscriptions insert:', err.message);
    return null;
  }
}

async function createWeeklyCheckout({
  email,
  name,
  company,
  phone,
  trucks,
  mcNumber,
  usdot,
  planKey,
  leadId,
  userId,
  amountOverride,
  successUrl,
  cancelUrl
}) {
  const stripe = getStripe();
  const plan = PLANS[planKey] || PLANS.solo_weekly;
  const amount = amountOverride || plan.amount_cents;
  const success = successUrl || `${APP_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancel = cancelUrl || `${APP_URL}/checkout?plan=${plan.key}&canceled=1`;

  if (!stripe) {
    const fake = `https://checkout.stripe.com/c/pay/cs_test_simulated_${Date.now()}`;
    const row = await recordSubscription({
      userId,
      leadId,
      sessionId: 'sim_' + Date.now(),
      planKey: plan.key,
      amount,
      status: 'incomplete'
    });
    return { simulated: true, url: fake, subscription: row };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    client_reference_id: String(leadId || userId || email || ''),
    billing_address_collection: 'required',
    phone_number_collection: { enabled: true },
    payment_method_collection: 'always',
    allow_promotion_codes: true,
    line_items: [lineItemForPlan(plan, amount)],
    success_url: success,
    cancel_url: cancel,
    metadata: {
      lead_id: leadId ? String(leadId) : '',
      user_id: userId ? String(userId) : '',
      plan_key: plan.key,
      company: company || '',
      name: name || '',
      phone: phone || '',
      trucks: trucks != null ? String(trucks) : '',
      mc_number: mcNumber || '',
      usdot: usdot || ''
    },
    subscription_data: plan.key === 'loadboard_ai_pass'
      ? {
          metadata: {
            lead_id: leadId ? String(leadId) : '',
            plan_key: plan.key,
            company: company || ''
          }
        }
      : {
          trial_period_days: TRIAL_DAYS,
          trial_settings: {
            end_behavior: { missing_payment_method: 'cancel' }
          },
          metadata: {
            lead_id: leadId ? String(leadId) : '',
            plan_key: plan.key,
            company: company || ''
          }
        },
    custom_text: {
      submit: {
        message: plan.key === 'loadboard_ai_pass'
          ? `First charge of $${(amount / 100).toFixed(0)} is due today. Renews monthly at $${(amount / 100).toFixed(0)}/month. Cancel anytime.`
          : (plan.interval === 'month'
              ? `Card is saved securely. $0 due today. Monthly billing starts after a ${TRIAL_DAYS}-day trial ($${(amount / 100).toFixed(0)}/month). Cancel before then and you are not charged.`
              : `Card is saved securely. $0 due today. Weekly billing starts after a ${TRIAL_DAYS}-day trial. Cancel before then and you are not charged.`)
      }
    }
  });

  const row = await recordSubscription({
    userId,
    leadId,
    sessionId: session.id,
    planKey: plan.key,
    amount,
    status: 'incomplete'
  });

  return { simulated: false, url: session.url, session_id: session.id, subscription: row };
}

router.get('/plans', (req, res) => {
  res.json({
    plans: publicPlans(),
    trial_days: TRIAL_DAYS,
    currency: 'usd',
    interval: 'week',
    configured: Boolean(process.env.STRIPE_SECRET_KEY)
  });
});

const checkoutHits = new Map();
function checkoutLimited(ip) {
  const now = Date.now();
  const recent = (checkoutHits.get(ip) || []).filter((t) => now - t < 60 * 1000);
  recent.push(now);
  checkoutHits.set(ip, recent);
  return recent.length > 8;
}

router.post('/checkout', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || 'unknown';
    if (checkoutLimited(ip)) {
      return res.status(429).json({ error: 'Too many checkout attempts. Please wait a minute and try again.' });
    }

    const {
      plan_key,
      email,
      name,
      company,
      phone,
      trucks,
      mc_number,
      usdot
    } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid work email is required.' });
    }
    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    const plan = PLANS[plan_key] || PLANS.solo_weekly;
    const leadId = await upsertWebsiteLead({
      email: cleanEmail,
      name: String(name).trim(),
      company: String(company || '').trim(),
      phone: String(phone || '').trim(),
      trucks,
      mcNumber: String(mc_number || '').trim(),
      usdot: String(usdot || '').trim(),
      planKey: plan.key,
      status: 'new'
    });

    const checkout = await createWeeklyCheckout({
      email: cleanEmail,
      name: String(name).trim(),
      company: String(company || '').trim(),
      phone: String(phone || '').trim(),
      trucks,
      mcNumber: String(mc_number || '').trim(),
      usdot: String(usdot || '').trim(),
      planKey: plan.key,
      leadId
    });

    res.json({
      ok: true,
      url: checkout.url,
      simulated: checkout.simulated || false,
      trial_days: plan.key === 'loadboard_ai_pass' ? 0 : TRIAL_DAYS,
      message: checkout.simulated
        ? 'Stripe is not connected yet. Add STRIPE_SECRET_KEY on the server to accept live cards.'
        : 'Redirecting to secure Stripe Checkout.'
    });
  } catch (err) {
    console.error('Public checkout error:', err);
    res.status(500).json({ error: err.message || 'Could not start checkout' });
  }
});

router.get('/session/:id', async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.json({
        ok: true,
        simulated: true,
        plan_key: req.query.plan || 'loadboard_ai_pass',
        portal_ready: true
      });
    }

    const session = await stripe.checkout.sessions.retrieve(req.params.id, {
      expand: ['subscription', 'customer']
    });
    const sub = session.subscription && typeof session.subscription === 'object' ? session.subscription : null;
    const email = session.customer_details?.email || session.customer_email || (session.metadata && session.metadata.email);
    let portalReady = false;

    // Fulfill subscription immediately upon successful checkout return
    const planKey = (session.metadata && session.metadata.plan_key) || req.query.plan || 'solo_weekly';
    const subId = sub ? sub.id : session.subscription;
    const custId = session.customer && typeof session.customer === 'object' ? session.customer.id : session.customer;

    if (session.payment_status === 'paid' || session.status === 'complete' || (sub && (sub.status === 'active' || sub.status === 'trialing'))) {
      let userId = session.metadata && session.metadata.user_id ? parseInt(session.metadata.user_id, 10) : null;
      if (!userId && email) {
        const uRow = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
        if (uRow.rows.length) userId = uRow.rows[0].id;
      }

      const trialEndsAt = sub && sub.trial_end
        ? new Date(sub.trial_end * 1000)
        : (planKey === 'loadboard_ai_pass' ? null : new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000));
      const periodEnd = sub && sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : (planKey === 'loadboard_ai_pass' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : trialEndsAt);
      const subStatus = sub ? sub.status : (planKey === 'loadboard_ai_pass' ? 'active' : 'trialing');

      if (userId) {
        await pool.query(
          `UPDATE users SET
             weekly_plan = $1,
             role = 'carrier',
             email_verified_at = COALESCE(email_verified_at, now()),
             trial_ends_at = COALESCE($2, trial_ends_at),
             stripe_customer_id = COALESCE($3, stripe_customer_id)
           WHERE id = $4`,
          [planKey, trialEndsAt, custId ? String(custId) : null, userId]
        );
      } else if (email) {
        await pool.query(
          `UPDATE users SET
             weekly_plan = $1,
             role = 'carrier',
             email_verified_at = COALESCE(email_verified_at, now()),
             trial_ends_at = COALESCE($2, trial_ends_at),
             stripe_customer_id = COALESCE($3, stripe_customer_id)
           WHERE lower(email) = lower($4)`,
          [planKey, trialEndsAt, custId ? String(custId) : null, email]
        );
      }

      await pool.query(
        `UPDATE billing_subscriptions SET
           status = $1,
           stripe_subscription_id = COALESCE($2, stripe_subscription_id),
           stripe_customer_id = COALESCE($3, stripe_customer_id),
           current_period_end = $4,
           updated_at = now()
         WHERE stripe_checkout_session_id = $5`,
        [subStatus, subId ? String(subId) : null, custId ? String(custId) : null, periodEnd, req.params.id]
      );

      // Auto-login carrier directly via auth cookie
      if (email) {
        const u = await pool.query(`SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
        if (u.rows.length) {
          const userObj = u.rows[0];
          const token = jwt.sign(
            {
              id: userObj.id,
              email: userObj.email,
              role: userObj.role,
              name: userObj.name,
              weekly_plan: planKey,
              company_name: userObj.company_name,
              organization_id: userObj.organization_id || null,
              carrier_id: userObj.id
            },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          setAuthCookie(res, token);
          portalReady = true;
        }
      }
    } else if (email) {
      const u = await pool.query(
        `SELECT id FROM users WHERE lower(email) = lower($1) AND role IN ('carrier','carrier_admin') LIMIT 1`,
        [email]
      );
      portalReady = u.rows.length > 0;
    }

    res.json({
      ok: true,
      email,
      status: session.status,
      payment_status: session.payment_status,
      trial_end: sub && sub.trial_end ? sub.trial_end : null,
      plan_key: session.metadata && session.metadata.plan_key,
      portal_ready: portalReady
    });
  } catch (err) {
    console.error('Session retrieve error:', err);
    res.status(404).json({ error: 'Checkout session not found' });
  }
});

// Create Stripe Checkout or Direct Subscription for AI Load Board Pass ($19/mo)
async function handleLoadBoardCheckoutRequest(req, res) {
  try {
    const { name, company, phone, email, mc_number, dot_number, password } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    const cleanPassword = String(password || '').trim();
    if (!cleanPassword || cleanPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    const cleanName = String(name || company || cleanEmail.split('@')[0]).trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    const cleanPhone = String(phone || '').trim();
    if (!cleanPhone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    // 1. Check existing user
    let user;
    const existingUser = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [cleanEmail]);
    if (existingUser.rows.length) {
      user = existingUser.rows[0];
      if (['super_admin', 'admin', 'dispatcher', 'sales_rep'].includes(user.role)) {
        return res.status(400).json({
          error: 'This email is already registered to a staff account. Please sign in or use another email.'
        });
      }

      // Check if user already has an active load board subscription
      const subCheck = await pool.query(
        `SELECT status, plan_key FROM billing_subscriptions
         WHERE user_id = $1 AND plan_key = 'loadboard_ai_pass' AND status = 'active'
         ORDER BY id DESC LIMIT 1`,
        [user.id]
      );
      if (subCheck.rows.length && user.weekly_plan === 'loadboard_ai_pass') {
        return res.status(400).json({
          error: 'You already have an active $19/mo subscription! Please sign in at /login to use the Load Board.'
        });
      }

      // Update password and info for pending activation
      const hash = await bcrypt.hash(cleanPassword, 10);
      await pool.query(
        `UPDATE users SET
           password_hash = $1,
           company_name = COALESCE(NULLIF($2,''), company_name),
           phone = COALESCE(NULLIF($3,''), phone),
           mc_number = COALESCE(NULLIF($4,''), mc_number),
           dot_number = COALESCE(NULLIF($5,''), dot_number),
           weekly_plan = 'loadboard_ai_pass_pending'
         WHERE id = $6`,
        [hash, company || '', cleanPhone, mc_number || '', dot_number || '', user.id]
      );
    } else {
      // 2. Create new user with the carrier's specified password hash
      const hash = await bcrypt.hash(cleanPassword, 10);
      const insUser = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, weekly_plan, email_verified_at)
         VALUES ($1, $2, $3, 'carrier', $4, $5, $6, $7, 'loadboard_ai_pass_pending', now())
         RETURNING id, name, email, role, company_name, phone, mc_number, dot_number, weekly_plan`,
        [cleanName, cleanEmail, hash, company || cleanName, cleanPhone, mc_number || null, dot_number || null]
      );
      user = insUser.rows[0];
    }

    // 3. Upsert Lead in CRM
    const leadId = await upsertWebsiteLead({
      email: cleanEmail,
      name: cleanName,
      company: String(company || '').trim(),
      phone: cleanPhone,
      mcNumber: String(mc_number || '').trim(),
      usdot: String(dot_number || '').trim(),
      planKey: 'loadboard_ai_pass',
      status: 'new',
      extraNote: 'Carrier AI Load Board Pass signup ($19/mo). Stripe checkout initiated.'
    });

    // 4. Check Stripe Integration
    const stripe = getStripe();
    if (stripe) {
      // Create real Stripe Checkout Session for $19/mo subscription
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: cleanEmail,
        client_reference_id: String(user.id),
        billing_address_collection: 'auto',
        phone_number_collection: { enabled: true },
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Carrier AI Load Board & FMCSA Authority Suite',
              description: 'Instant self-dispatch access: Live spot market freight, direct unmasked broker contacts, and FMCSA credit score checks.'
            },
            unit_amount: 1900,
            recurring: { interval: 'month' }
          },
          quantity: 1
        }],
        success_url: `${APP_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}&plan=loadboard_ai_pass&email=${encodeURIComponent(cleanEmail)}`,
        cancel_url: `${APP_URL}/load-booking?canceled=1`,
        metadata: {
          user_id: String(user.id),
          lead_id: leadId ? String(leadId) : '',
          email: cleanEmail,
          plan_key: 'loadboard_ai_pass',
          company: String(company || ''),
          phone: cleanPhone,
          mc_number: String(mc_number || ''),
          dot_number: String(dot_number || '')
        },
        subscription_data: {
          metadata: {
            user_id: String(user.id),
            plan_key: 'loadboard_ai_pass',
            company: String(company || '')
          }
        },
        custom_text: {
          submit: {
            message: 'Billed at $19/month for self-dispatch load board & FMCSA authority check access. Cancel anytime.'
          }
        }
      });

      await pool.query(
        `INSERT INTO billing_subscriptions (user_id, lead_id, stripe_checkout_session_id, plan_key, amount_cents, interval, status)
         VALUES ($1, $2, $3, 'loadboard_ai_pass', 1900, 'month', 'incomplete')`,
        [user.id, leadId, session.id]
      );

      return res.json({
        ok: true,
        url: session.url,
        session_id: session.id,
        message: 'Redirecting to secure Stripe Checkout.'
      });
    }

    // 5. Fallback if Stripe key is not set or in test mode
    await pool.query(
      `UPDATE users SET weekly_plan = 'loadboard_ai_pass', email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO billing_subscriptions (user_id, lead_id, plan_key, amount_cents, interval, status, current_period_end)
       VALUES ($1, $2, 'loadboard_ai_pass', 1900, 'month', 'active', now() + interval '30 days')`,
      [user.id, leadId || null]
    );

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        weekly_plan: 'loadboard_ai_pass'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    setAuthCookie(res, token);

    // Send welcome email asynchronously
    try {
      await sendBrandedEmail({
        to: cleanEmail,
        subject: 'Your AI Load Board & FMCSA Authority Pass is Active!',
        html: `
          <div style="font-family:sans-serif;color:#0f172a;max-width:600px;margin:0 auto;">
            <h2 style="color:#f59e0b;">Welcome to Shipping Wish AI Load Board!</h2>
            <p>Hi ${escapeHtml(cleanName)},</p>
            <p>Your self-dispatch subscription to <strong>Carrier AI Load Board &amp; FMCSA Authority Suite ($19/mo)</strong> has been activated!</p>
            <p>You can sign in anytime at <a href="${APP_URL}/login">${APP_URL}/login</a> using:</p>
            <div style="background:#f8fafc;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;margin:12px 0;">
              <div><strong>Login Email:</strong> ${escapeHtml(cleanEmail)}</div>
              <div><strong>Password:</strong> The password you created at signup</div>
            </div>
            <ul style="line-height:1.8;">
              <li><strong>Live AI Load Board:</strong> <a href="${APP_URL}/load-booking">${APP_URL}/load-booking</a></li>
              <li><strong>Broker Credit &amp; FMCSA Authority Check:</strong> <a href="${APP_URL}/brokers">${APP_URL}/brokers</a></li>
            </ul>
            <p>You can now search all 50-state freight lanes and see direct broker contact info unmasked.</p>
          </div>
        `,
        text: `Welcome to Shipping Wish AI Load Board!\nYour pass is active. Login at ${APP_URL}/login using ${cleanEmail}. Tools: ${APP_URL}/load-booking and ${APP_URL}/brokers`
      });
    } catch (_) { /* non-fatal email */ }

    res.json({
      ok: true,
      simulated: true,
      redirect: `/checkout-success?plan=loadboard_ai_pass&email=${encodeURIComponent(cleanEmail)}&simulated=1`,
      message: 'Account created and pass activated!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_name: user.company_name,
        weekly_plan: 'loadboard_ai_pass'
      }
    });
  } catch (err) {
    console.error('handleLoadBoardCheckoutRequest error:', err);
    res.status(500).json({ error: err.message || 'Could not complete load board subscription.' });
  }
}

router.post('/subscribe-loadboard', handleLoadBoardCheckoutRequest);
router.post('/create-loadboard-checkout', handleLoadBoardCheckoutRequest);

// Create Stripe Checkout for 7-Day Free Trial ($0 Due Today) with Required Card Capture
async function handleTrialSignupCheckoutRequest(req, res) {
  try {
    const { name, company, phone, email, mc_number, mcNumber, dot_number, dotNumber, password, plan_key } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid business email address is required.' });
    }
    const cleanPassword = String(password || '').trim();
    if (!cleanPassword || cleanPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    const cleanName = String(name || company || cleanEmail.split('@')[0]).trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    const cleanPhone = String(phone || '').trim();
    if (!cleanPhone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    const mc = String(mc_number || mcNumber || '').trim();
    const isBrokerSignup = req.body.role === 'broker' || plan_key === 'free_broker';
    if (isBrokerSignup) {
      await pool.query("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'broker'").catch(() => {});
      const hash = await bcrypt.hash(cleanPassword, 10);
      let brokerUser;
      const ex = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [cleanEmail]);
      if (ex.rows.length) {
        brokerUser = ex.rows[0];
        await pool.query(
          `UPDATE users SET
             role = 'broker',
             weekly_plan = 'free_broker',
             password_hash = $1,
             company_name = COALESCE(NULLIF($2,''), company_name),
             phone = COALESCE(NULLIF($3,''), phone),
             mc_number = COALESCE(NULLIF($4,''), mc_number),
             dot_number = COALESCE(NULLIF($5,''), dot_number)
           WHERE id = $6`,
          [hash, company || cleanName, cleanPhone, mc || null, dot || null, brokerUser.id]
        );
      } else {
        const ins = await pool.query(
          `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, weekly_plan, email_verified_at)
           VALUES ($1, $2, $3, 'broker', $4, $5, $6, $7, 'free_broker', now())
           RETURNING id, name, email, role, company_name, phone, mc_number, dot_number, weekly_plan`,
          [cleanName, cleanEmail, hash, company || cleanName, cleanPhone, mc || null, dot || null]
        );
        brokerUser = ins.rows[0];
      }

      await upsertWebsiteLead({
        email: cleanEmail,
        name: cleanName,
        company: String(company || cleanName).trim(),
        phone: cleanPhone,
        mcNumber: mc,
        usdot: dot,
        planKey: 'free_broker',
        status: 'new',
        extraNote: 'Freight Broker registered (100% Free Load Posting).'
      });

      const token = jwt.sign(
        {
          id: brokerUser.id,
          name: brokerUser.name,
          email: brokerUser.email,
          role: 'broker',
          company_name: brokerUser.company_name,
          weekly_plan: 'free_broker'
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      setAuthCookie(res, token);

      return res.json({
        ok: true,
        free_broker: true,
        redirect: '/load-booking?broker=1&post=1',
        message: 'Broker account created successfully! You can now post loads 100% free.'
      });
    }

    const chosenPlanKey = PLANS[plan_key] ? plan_key : 'solo_weekly';
    const plan = PLANS[chosenPlanKey];

    // 1. Check existing user
    let user;
    const existingUser = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [cleanEmail]);
    if (existingUser.rows.length) {
      user = existingUser.rows[0];
      if (['super_admin', 'admin', 'dispatcher', 'sales_rep'].includes(user.role)) {
        return res.status(400).json({
          error: 'This email is already registered to a staff account. Please sign in or use another email.'
        });
      }

      // Check if user already has an active or trialing subscription
      const subCheck = await pool.query(
        `SELECT status, plan_key FROM billing_subscriptions
         WHERE user_id = $1 AND status IN ('trialing', 'active')
         ORDER BY id DESC LIMIT 1`,
        [user.id]
      );
      if (subCheck.rows.length && user.weekly_plan !== 'canceled' && user.weekly_plan !== 'pending_card') {
        return res.status(400).json({
          error: 'An active account already exists for this email. Please sign in at /login.'
        });
      }

      // Update password hash and carrier info for pending card verification
      const hash = await bcrypt.hash(cleanPassword, 10);
      await pool.query(
        `UPDATE users SET
           password_hash = $1,
           name = COALESCE(NULLIF($2,''), name),
           company_name = COALESCE(NULLIF($3,''), company_name),
           phone = COALESCE(NULLIF($4,''), phone),
           mc_number = COALESCE(NULLIF($5,''), mc_number),
           dot_number = COALESCE(NULLIF($6,''), dot_number),
           weekly_plan = 'pending_card'
         WHERE id = $7`,
        [hash, cleanName, company || cleanName, cleanPhone, mc || '', dot || '', user.id]
      );
    } else {
      // 2. Create new carrier user with chosen password and pending_card status
      const hash = await bcrypt.hash(cleanPassword, 10);
      const insUser = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, weekly_plan)
         VALUES ($1, $2, $3, 'carrier', $4, $5, $6, $7, 'pending_card')
         RETURNING id, name, email, role, company_name, phone, mc_number, dot_number, weekly_plan`,
        [cleanName, cleanEmail, hash, company || cleanName, cleanPhone, mc || null, dot || null]
      );
      user = insUser.rows[0];
    }

    // 3. Upsert Lead in CRM
    const leadId = await upsertWebsiteLead({
      email: cleanEmail,
      name: cleanName,
      company: String(company || cleanName).trim(),
      phone: cleanPhone,
      mcNumber: mc,
      usdot: dot,
      planKey: plan.key,
      status: 'new',
      extraNote: `Carrier 7-day free trial signup (${plan.name}). Stripe card verification initiated ($0 due today).`
    });

    // 4. Check Stripe Integration
    const stripe = getStripe();
    if (stripe) {
      // Create real Stripe Checkout Session for 7-Day Free Trial ($0 today) with required card capture
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: cleanEmail,
        client_reference_id: String(user.id),
        billing_address_collection: 'required',
        phone_number_collection: { enabled: true },
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Shipping Wish Dedicated Operations Desk & Full TMS Suite',
              description: '7-Day Free Trial ($0 due today). Includes Full TMS Portal, Dedicated Operations Desk, 50-State Spot Freight AI Load Board & FMCSA Authority Check. Then $149/week. Cancel anytime.'
            },
            unit_amount: plan.amount_cents,
            recurring: { interval: 'week' }
          },
          quantity: 1
        }],
        subscription_data: {
          trial_period_days: TRIAL_DAYS,
          trial_settings: {
            end_behavior: { missing_payment_method: 'cancel' }
          },
          metadata: {
            user_id: String(user.id),
            lead_id: leadId ? String(leadId) : '',
            plan_key: plan.key,
            company: String(company || cleanName)
          }
        },
        success_url: `${APP_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}&plan=${plan.key}&email=${encodeURIComponent(cleanEmail)}`,
        cancel_url: `${APP_URL}/signup?canceled=1`,
        metadata: {
          user_id: String(user.id),
          lead_id: leadId ? String(leadId) : '',
          email: cleanEmail,
          plan_key: plan.key,
          name: cleanName,
          company: String(company || cleanName),
          phone: cleanPhone,
          mc_number: mc,
          dot_number: dot
        },
        custom_text: {
          submit: {
            message: `Card is saved securely. $0 due today. Full TMS Portal, Dedicated Operations Desk, and AI Load Board access is free for ${TRIAL_DAYS} days. Cancel anytime in your portal before day ${TRIAL_DAYS} to never be charged.`
          }
        }
      });

      await pool.query(
        `INSERT INTO billing_subscriptions (user_id, lead_id, stripe_checkout_session_id, plan_key, amount_cents, interval, status)
         VALUES ($1, $2, $3, $4, $5, 'week', 'incomplete')`,
        [user.id, leadId, session.id, plan.key, plan.amount_cents]
      );

      return res.json({
        ok: true,
        url: session.url,
        session_id: session.id,
        message: 'Redirecting to secure Stripe Checkout.'
      });
    }

    // 5. Fallback simulation if Stripe key is not live/test
    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE users SET weekly_plan = $1, email_verified_at = COALESCE(email_verified_at, now()), trial_ends_at = $2 WHERE id = $3`,
      [plan.key, trialEnds, user.id]
    );
    await pool.query(
      `INSERT INTO billing_subscriptions (user_id, lead_id, plan_key, amount_cents, interval, status, current_period_end)
       VALUES ($1, $2, $3, $4, 'week', 'trialing', $5)`,
      [user.id, leadId || null, plan.key, plan.amount_cents, trialEnds]
    );

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'carrier',
        company_name: user.company_name,
        weekly_plan: plan.key
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    setAuthCookie(res, token);

    return res.json({
      ok: true,
      simulated: true,
      url: `${APP_URL}/checkout-success?plan=${plan.key}&email=${encodeURIComponent(cleanEmail)}&simulated=1`,
      redirect: `${APP_URL}/checkout-success?plan=${plan.key}&email=${encodeURIComponent(cleanEmail)}&simulated=1`,
      message: '7-day trial activated!'
    });
  } catch (err) {
    console.error('handleTrialSignupCheckoutRequest error:', err);
    res.status(500).json({ error: err.message || 'Could not start 7-day trial checkout.' });
  }
}

// Carrier In-Portal Subscription Cancellation
async function handleCancelSubscriptionRequest(req, res) {
  try {
    const userId = req.user.id;

    // 1. Fetch user and subscription
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userRes.rows[0];

    const subRes = await pool.query(
      `SELECT * FROM billing_subscriptions
       WHERE user_id = $1 AND status IN ('trialing', 'active', 'incomplete')
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    const sub = subRes.rows[0];
    const stripe = getStripe();

    // 2. If Stripe subscription exists, cancel on Stripe immediately
    if (stripe && sub && sub.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (stripeErr) {
        console.warn('Stripe subscription cancel warning:', stripeErr.message);
      }
    }

    // 3. Mark subscription as canceled in database
    if (sub) {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'canceled', updated_at = now() WHERE id = $1`,
        [sub.id]
      );
    } else {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'canceled', updated_at = now() WHERE user_id = $1`,
        [userId]
      );
    }

    // 4. Revoke carrier access on user record
    await pool.query(
      `UPDATE users SET weekly_plan = 'canceled', trial_ends_at = now() WHERE id = $1`,
      [userId]
    );

    // 5. Clear session cookie
    res.clearCookie('sw_token');

    // 6. Notify staff
    await notifyStaff({
      subject: `⚠️ Subscription Canceled — ${user.company_name || user.name} (${user.email})`,
      html: `<p>A carrier canceled their subscription from within their portal.</p>
             <p><strong>Company:</strong> ${escapeHtml(user.company_name || '')}<br>
             <strong>Name:</strong> ${escapeHtml(user.name || '')}<br>
             <strong>Email:</strong> ${escapeHtml(user.email)}<br>
             <strong>Phone:</strong> ${escapeHtml(user.phone || '')}<br>
             <strong>MC:</strong> ${escapeHtml(user.mc_number || '-')}<br>
             <strong>Status:</strong> Subscription canceled, access revoked, $0 future charges.</p>`,
      text: `Subscription Canceled: ${user.company_name || user.name} (${user.email}). Access revoked.`
    });

    res.json({
      ok: true,
      message: 'Your subscription has been canceled. Your card will not be charged, and your portal access has been revoked.'
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: err.message || 'Could not cancel subscription.' });
  }
}

router.post('/create-trial-checkout', handleTrialSignupCheckoutRequest);
router.post('/signup-trial', handleTrialSignupCheckoutRequest);
router.post('/cancel-mine', requireAuth, handleCancelSubscriptionRequest);


router.post('/weekly-link', requireAuth, requireRole('dispatcher', 'admin', 'super_admin', 'sales_rep'), async (req, res) => {
  try {
    const { lead_id, email, name, company, plan_key, amount_cents, send_email } = req.body;
    let targetEmail = email;
    let targetName = name;
    let targetCompany = company;

    if (lead_id) {
      const lr = await pool.query('SELECT * FROM crm_leads WHERE id = $1', [lead_id]);
      if (!lr.rows.length) return res.status(404).json({ error: 'Lead not found' });
      const lead = lr.rows[0];
      targetEmail = targetEmail || lead.email;
      targetName = targetName || lead.owner_name;
      targetCompany = targetCompany || lead.company_name;
    }

    if (!targetEmail) return res.status(400).json({ error: 'Carrier email is required' });

    let carrierUserId = null;
    try {
      const existingCarrier = await pool.query(
        `SELECT id FROM users WHERE lower(email) = lower($1) AND role IN ('carrier','carrier_admin') LIMIT 1`,
        [targetEmail]
      );
      if (existingCarrier.rows[0]) carrierUserId = existingCarrier.rows[0].id;
    } catch (_) { /* optional */ }

    const checkout = await createWeeklyCheckout({
      email: targetEmail,
      name: targetName,
      company: targetCompany,
      planKey: plan_key || 'solo_weekly',
      leadId: lead_id,
      userId: carrierUserId,
      amountOverride: amount_cents ? parseInt(amount_cents, 10) : null
    });

    if (send_email) {
      const tpl = buildTemplate('onboarding', {
        ownerName: targetName,
        companyName: targetCompany,
        recipientEmail: targetEmail,
        billingUrl: checkout.url
      });
      await sendBrandedEmail({
        to: targetEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        leadId: lead_id,
        sentBy: req.user.id,
        emailType: 'onboarding',
        templateKey: 'onboarding'
      });
      if (lead_id) {
        await pool.query(
          `UPDATE crm_leads SET status = CASE WHEN status = 'new' THEN 'packet_sent' ELSE status END, last_contacted_at = now() WHERE id = $1`,
          [lead_id]
        );
      }
    }

    res.json({
      ok: true,
      url: checkout.url,
      simulated: checkout.simulated || false,
      message: checkout.simulated
        ? 'Stripe key not set — simulated link stored. Add STRIPE_SECRET_KEY to send real weekly billing.'
        : `Weekly billing link ready for ${targetEmail}`,
      subscription: checkout.subscription
    });
  } catch (err) {
    console.error('Weekly link error:', err);
    res.status(500).json({ error: err.message || 'Could not create Stripe weekly link' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const me = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.user.id]);
    if (!me.rows.length) return res.status(404).json({ error: 'User not found' });
    const email = me.rows[0].email;
    const result = await pool.query(
      `SELECT b.* FROM billing_subscriptions b
       LEFT JOIN crm_leads l ON l.id = b.lead_id
       WHERE b.user_id = $1 OR lower(l.email) = lower($2)
       ORDER BY b.created_at DESC LIMIT 1`,
      [req.user.id, email]
    );
    res.json({ subscription: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Could not load subscription' });
  }
});

router.get('/subscriptions', requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, l.company_name, l.owner_name, l.email AS lead_email, l.phone, l.mc_number, l.num_trucks, l.status AS lead_status
       FROM billing_subscriptions b
       LEFT JOIN crm_leads l ON l.id = b.lead_id
       ORDER BY b.created_at DESC
       LIMIT 100`
    );
    res.json({ subscriptions: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load subscriptions' });
  }
});

async function handleStripeEvent(event) {
  const type = event.type;
  const obj = event.data && event.data.object ? event.data.object : {};

  if (type === 'checkout.session.completed') {
    const sessionId = obj.id;
    const subId = obj.subscription;
    const customerId = obj.customer;
    const meta = obj.metadata || {};
    let leadId = meta.lead_id ? parseInt(meta.lead_id, 10) : null;
    if (!Number.isFinite(leadId)) leadId = null;
    const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || '';
    let status = 'trialing';
    try {
      const stripe = getStripe();
      if (stripe && subId) {
        const sub = await stripe.subscriptions.retrieve(String(subId));
        status = sub.status || 'trialing';
      }
    } catch (err) {
      console.error('Stripe subscription retrieve:', err.message);
    }
    try {
      const resolvedLead = await upsertWebsiteLead({
        email: email || '',
        name: meta.name || '',
        company: meta.company || '',
        phone: meta.phone || (obj.customer_details && obj.customer_details.phone) || '',
        trucks: meta.trucks,
        mcNumber: meta.mc_number,
        usdot: meta.usdot,
        planKey: meta.plan_key,
        status: 'active',
        extraNote: `Stripe checkout completed. Trial/subscription status: ${status}. Session ${sessionId}.`
      });
      if (resolvedLead) leadId = resolvedLead;
      await pool.query(
        `UPDATE billing_subscriptions
         SET status = $4,
             stripe_subscription_id = COALESCE($1, stripe_subscription_id),
             stripe_customer_id = $2,
             lead_id = COALESCE($5, lead_id),
             updated_at = now()
         WHERE stripe_checkout_session_id = $3`,
        [subId ? String(subId) : null, customerId ? String(customerId) : null, sessionId, status, leadId]
      );
      if (leadId) {
        await pool.query(`UPDATE crm_leads SET status = 'active' WHERE id = $1`, [leadId]);
      }
    } catch (err) {
      console.error('billing checkout.session.completed db:', err.message);
    }

    if (meta.plan_key === 'loadboard_ai_pass') {
      try {
        let userId = meta.user_id ? parseInt(meta.user_id, 10) : null;
        if (userId) {
          await pool.query(
            `UPDATE users SET weekly_plan = 'loadboard_ai_pass', role = 'carrier', email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
            [userId]
          );
        } else if (email) {
          await pool.query(
            `UPDATE users SET weekly_plan = 'loadboard_ai_pass', role = 'carrier', email_verified_at = COALESCE(email_verified_at, now()) WHERE lower(email) = lower($1)`,
            [email]
          );
        }
        await pool.query(
          `UPDATE billing_subscriptions SET status = 'active', current_period_end = now() + interval '30 days', updated_at = now() WHERE stripe_checkout_session_id = $1`,
          [sessionId]
        );
        if (email) {
          await sendBrandedEmail({
            to: email,
            subject: 'Your AI Load Board & FMCSA Authority Pass is Active!',
            html: `
              <div style="font-family:sans-serif;color:#0f172a;max-width:600px;margin:0 auto;">
                <h2 style="color:#f59e0b;">Welcome to Shipping Wish AI Load Board!</h2>
                <p>Hi ${escapeHtml(meta.name || meta.company || 'Carrier')},</p>
                <p>Your self-dispatch subscription to <strong>Carrier AI Load Board &amp; FMCSA Authority Suite ($19/mo)</strong> is now active!</p>
                <p>You can sign in anytime at <a href="${APP_URL}/login">${APP_URL}/login</a> using your email and the password you created during signup.</p>
                <ul style="line-height:1.8;">
                  <li><strong>Live AI Load Board:</strong> <a href="${APP_URL}/load-booking">${APP_URL}/load-booking</a></li>
                  <li><strong>Broker Credit &amp; FMCSA Authority Check:</strong> <a href="${APP_URL}/brokers">${APP_URL}/brokers</a></li>
                </ul>
                <p>Direct broker phone numbers, live freight, and credit scores are unmasked.</p>
              </div>
            `,
            text: `Welcome to Shipping Wish AI Load Board!\nYour pass is active. Login at ${APP_URL}/login using ${email}. Tools: ${APP_URL}/load-booking and ${APP_URL}/brokers`
          });
        }
        await notifyStaff({
          subject: `New $19/mo AI Load Board Subscriber — ${meta.company || meta.name || email}`,
          html: `<p>A carrier subscribed to the $19/mo AI Load Board &amp; FMCSA Authority pass via Stripe.</p>
                 <p><strong>${escapeHtml(meta.name || '')}</strong> (${escapeHtml(meta.company || '')})<br>
                 Email: ${escapeHtml(email)} · Phone: ${escapeHtml(meta.phone || '')}<br>
                 MC: ${escapeHtml(meta.mc_number || '-')} · USDOT: ${escapeHtml(meta.usdot || '-')}</p>`,
          text: `New $19/mo AI Load Board subscriber: ${meta.name || ''} / ${meta.company || ''} / ${email} / ${meta.phone || ''}`
        });
      } catch (err) {
        console.error('loadboard_ai_pass webhook fulfillment error:', err.message);
      }
      return;
    }

    const plan = PLANS[meta.plan_key] || PLANS.solo_weekly;
    const company = meta.company || email;
    const weekly = `$${(plan.amount_cents / 100).toFixed(0)}`;
    let portal = { created: false, tempPassword: null };
    if (email) {
      portal = await provisionCarrierPortal({
        email,
        name: meta.name,
        company,
        phone: meta.phone || (obj.customer_details && obj.customer_details.phone) || '',
        mcNumber: meta.mc_number,
        usdot: meta.usdot,
        sessionId
      });
    }
    if (email) {
      try {
        const tpl = buildTemplate('trial_welcome', {
          ownerName: meta.name,
          companyName: company,
          recipientEmail: email,
          planName: plan.name,
          weeklyAmount: weekly,
          trucks: meta.trucks,
          trialDays: TRIAL_DAYS,
          portalCreated: portal.created,
          portalTempPassword: portal.tempPassword
        });
        await sendBrandedEmail({
          to: email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          leadId,
          emailType: 'trial_welcome',
          templateKey: 'trial_welcome',
          transactional: true
        });
      } catch (err) {
        console.error('trial welcome email:', err.message);
      }
    }
    const phone = meta.phone || (obj.customer_details && obj.customer_details.phone) || '';
    if (phone) {
      try {
        const voip = require('./voip');
        if (typeof voip.sendTemplatedSms === 'function') {
          await voip.sendTemplatedSms({
            lead_id: leadId,
            to_number: phone,
            template_key: 'trial_welcome',
            company_name: company,
            user: null
          });
        }
      } catch (err) {
        console.error('trial welcome sms:', err.message);
      }
    }
    const crmUrl = `${APP_URL}/crm-sales`;
    await notifyStaff({
      subject: `New paid trial — ${company || 'carrier'} (${plan.name})`,
      html: `<p>A carrier finished Stripe checkout. $0 today. First weekly charge after the free week.</p>
        <p><strong>${escapeHtml(meta.name || '')}</strong><br>
        ${escapeHtml(company || '')}<br>
        ${escapeHtml(email)} · ${escapeHtml(meta.phone || '')}<br>
        Plan: ${escapeHtml(plan.name)} — $${(plan.amount_cents / 100).toFixed(0)}/week<br>
        Trucks: ${escapeHtml(meta.trucks || '-')} · MC ${escapeHtml(meta.mc_number || '-')} · USDOT ${escapeHtml(meta.usdot || '-')}</p>
        <p>TMS portal: ${portal.created ? 'new carrier login emailed with a temporary password' : (portal.skipped ? 'email already belongs to a staff/driver account — link manually' : 'existing carrier login linked')}.</p>
        <p>Open in admin: <a href="${crmUrl}">Sales CRM &amp; Leads</a> — they show as <strong>Active</strong>.</p>`,
      text: `New Stripe checkout: ${meta.name || ''} / ${company} / ${email} / ${meta.phone || ''} / ${plan.name}. Portal: ${portal.created ? 'new login emailed' : 'linked or skipped'}. Open ${crmUrl}`
    });
  }

  // ---------- 1. PAYMENT SUCCEEDED (AUTO-REACTIVATE SERVICES) ----------
  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    const customerId = obj.customer;
    const subId = obj.subscription;

    if (subId) {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'active', updated_at = now() WHERE stripe_subscription_id = $1`,
        [String(subId)]
      );
      // Automatically restore active status for user if they were previously past_due
      await pool.query(
        `UPDATE users SET weekly_plan = 'active', is_suspended = false
         WHERE id = (SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = $1 LIMIT 1)
           AND (weekly_plan = 'past_due' OR weekly_plan = 'canceled')`,
        [String(subId)]
      ).catch(() => {});
    }

    if (customerId) {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'active', updated_at = now() WHERE stripe_customer_id = $1`,
        [String(customerId)]
      );
      await pool.query(
        `UPDATE users SET weekly_plan = 'active', is_suspended = false
         WHERE stripe_customer_id = $1 AND (weekly_plan = 'past_due' OR weekly_plan = 'canceled')`,
        [String(customerId)]
      ).catch(() => {});
    }

    if (obj.id) {
      const invRes = await pool.query('SELECT id, load_id FROM invoices WHERE stripe_invoice_id = $1', [obj.id]);
      if (invRes.rows.length) {
        const inv = invRes.rows[0];
        const paidDate = new Date().toISOString().slice(0, 10);
        await pool.query('UPDATE invoices SET status = \'paid\', paid_date = $1 WHERE id = $2', [paidDate, inv.id]);
        if (inv.load_id) {
          await pool.query('UPDATE loads SET status = \'paid\', updated_at = now() WHERE id = $1', [inv.load_id]);
        }
      }
    }
  }

  // ---------- 2. PAYMENT FAILED / CARD DECLINED (AUTO-DEACTIVATE TO PAST_DUE) ----------
  if (type === 'invoice.payment_failed') {
    const customerId = obj.customer;
    const subId = obj.subscription;
    const amountDue = obj.amount_due ? `$${(obj.amount_due / 100).toFixed(2)}` : '$19.00';
    const customerEmail = obj.customer_email || (obj.customer_details && obj.customer_details.email);

    if (subId) {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'past_due', updated_at = now() WHERE stripe_subscription_id = $1`,
        [String(subId)]
      );
    }

    if (customerId) {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'past_due', updated_at = now() WHERE stripe_customer_id = $1`,
        [String(customerId)]
      );
      await pool.query(
        `UPDATE users SET weekly_plan = 'past_due' WHERE stripe_customer_id = $1`,
        [String(customerId)]
      ).catch(() => {});
    }

    // Send payment failure notice to customer with direct recovery link
    if (customerEmail) {
      try {
        const hostedInvoiceUrl = obj.hosted_invoice_url || 'https://www.loadsnexus.com/?action=checkout';
        await sendBrandedEmail({
          to: customerEmail,
          subject: `⚠️ Payment Failed: Action Required to Avoid Service Suspension (${amountDue})`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #f87171;border-radius:12px;background:#ffffff;">
              <h2 style="color:#b91c1c;margin-top:0;">Subscription Payment Declined</h2>
              <p>Hi,</p>
              <p>Your scheduled recurring subscription payment of <strong>${amountDue}</strong> could not be processed. Your bank or card issuer declined the transaction.</p>
              <p>To avoid deactivation of your Load Board and Dispatch services, please update your payment method or pay your outstanding invoice immediately:</p>
              <div style="margin:25px 0;">
                <a href="${hostedInvoiceUrl}" style="background:#dc2626;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Pay Invoice &amp; Restore Access &rarr;</a>
              </div>
              <p style="font-size:12px;color:#64748b;">If you need assistance, contact our billing desk at billing@loadsnexus.com or call +1 (800) 580-3101.</p>
            </div>
          `,
          text: `Your subscription payment of ${amountDue} failed. Please pay your invoice or update your card at ${hostedInvoiceUrl} to avoid service disruption.`
        });
      } catch (err) {
        console.error('[Billing Webhook] Payment failed customer email notice error:', err.message);
      }
    }

    // Notify Operations / Billing Staff
    await notifyStaff({
      subject: `🚨 Payment Failed: ${customerEmail || customerId} (${amountDue})`,
      html: `<p>A subscription payment failed in Stripe. Account status set to <strong>past_due</strong>.</p>
             <p>Customer: ${escapeHtml(customerEmail || customerId)}<br>
             Amount: ${amountDue}<br>
             Invoice: ${obj.id}<br>
             Subscription: ${subId || '-'}</p>`,
      text: `Payment failed for ${customerEmail || customerId} (${amountDue}). Status: past_due.`
    }).catch(() => {});
  }

  // ---------- 3. SUBSCRIPTION UPDATED OR CANCELED ----------
  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const subId = obj.id;
    const customerId = obj.customer;
    const isCanceled = obj.status === 'canceled' || type === 'customer.subscription.deleted';
    const status = isCanceled ? 'canceled' : obj.status;
    const periodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000) : null;

    await pool.query(
      `UPDATE billing_subscriptions
       SET status = $2, current_period_end = $3, updated_at = now()
       WHERE stripe_subscription_id = $1`,
      [String(subId), status, periodEnd]
    );

    // Update user status
    if (isCanceled) {
      await pool.query(
        `UPDATE users SET weekly_plan = 'canceled'
         WHERE stripe_customer_id = $1 OR id = (SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = $2 LIMIT 1)`,
        [String(customerId), String(subId)]
      ).catch(() => {});
    } else if (status === 'past_due' || status === 'unpaid') {
      await pool.query(
        `UPDATE users SET weekly_plan = 'past_due'
         WHERE stripe_customer_id = $1 OR id = (SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = $2 LIMIT 1)`,
        [String(customerId), String(subId)]
      ).catch(() => {});
    } else if (status === 'active') {
      await pool.query(
        `UPDATE users SET weekly_plan = 'active', is_suspended = false
         WHERE stripe_customer_id = $1 OR id = (SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = $2 LIMIT 1)`,
        [String(customerId), String(subId)]
      ).catch(() => {});
    }
  }

  // ---------- 4. FRAUDULENT CHARGE / CHARGEBACK DISPUTE FREEZE ----------
  if (type === 'charge.dispute.created') {
    const disputeId = obj.id;
    const amount = obj.amount ? `$${(obj.amount / 100).toFixed(2)} ${String(obj.currency || 'usd').toUpperCase()}` : 'Unknown';
    const reason = obj.reason || 'unrecognized';
    const chargeId = obj.charge;
    const evidenceDue = obj.evidence_details?.due_by ? new Date(obj.evidence_details.due_by * 1000).toLocaleDateString() : 'Immediate';

    console.warn(`[SECURITY ALERT] Stripe chargeback dispute created: ${disputeId}, Amount: ${amount}, Reason: ${reason}`);

    // Lock and freeze the associated user account immediately
    try {
      const chargeRes = await pool.query(
        `SELECT u.id, u.email, u.company_name, u.phone
         FROM billing_subscriptions b
         JOIN users u ON u.id = b.user_id
         WHERE b.stripe_checkout_session_id = $1 OR b.stripe_customer_id = (
           SELECT customer FROM billing_subscriptions WHERE stripe_subscription_id = b.stripe_subscription_id LIMIT 1
         )
         LIMIT 1`,
        [chargeId]
      ).catch(() => ({ rows: [] }));

      if (chargeRes.rows.length) {
        const user = chargeRes.rows[0];
        await pool.query(
          `UPDATE users SET is_suspended = true, updated_at = now() WHERE id = $1`,
          [user.id]
        );
        await pool.query(
          `UPDATE billing_subscriptions SET status = 'frozen_dispute', updated_at = now() WHERE user_id = $1`,
          [user.id]
        );
      }
    } catch (freezeErr) {
      console.error('[SECURITY ALERT] Could not freeze user for dispute:', freezeErr.message);
    }

    // Send urgent high-priority alert to company leadership
    await notifyStaff({
      subject: `🚨 URGENT: Chargeback Dispute Filed — ${amount} (Reason: ${reason})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:2px solid #b91c1c;border-radius:12px;">
          <h2 style="color:#b91c1c;margin-top:0;">🚨 Chargeback / Fraud Dispute Received</h2>
          <p>A customer or cardholder has filed a chargeback dispute through their bank.</p>
          <table cellpadding="6" style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td><strong>Dispute ID:</strong></td><td>${escapeHtml(disputeId)}</td></tr>
            <tr><td><strong>Disputed Amount:</strong></td><td><strong style="color:#b91c1c;">${amount}</strong></td></tr>
            <tr><td><strong>Bank Reason:</strong></td><td>${escapeHtml(reason)}</td></tr>
            <tr><td><strong>Evidence Due Date:</strong></td><td>${evidenceDue}</td></tr>
            <tr><td><strong>Charge ID:</strong></td><td>${escapeHtml(chargeId || '-')}</td></tr>
          </table>
          <p><strong>Action Taken:</strong> The user account and portal services have been frozen automatically to prevent further fraudulent use or double-brokering.</p>
          <div style="margin:20px 0;">
            <a href="https://dashboard.stripe.com/disputes/${disputeId}" style="background:#0f172a;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View Dispute in Stripe Dashboard &rarr;</a>
          </div>
        </div>
      `,
      text: `URGENT: Stripe dispute filed for ${amount} (Reason: ${reason}). Evidence due: ${evidenceDue}. View: https://dashboard.stripe.com/disputes/${disputeId}`
    }).catch(() => {});
  }

  // ---------- 5. STRIPE RADAR EARLY FRAUD WARNING (STOLEN CARD ALERT) ----------
  if (type === 'radar.early_fraud_warning.created') {
    const chargeId = obj.charge;
    const fraudType = obj.fraud_type || 'card_reported_lost_or_stolen';
    const actionable = obj.actionable ? 'Yes (Refund proactively to avoid dispute fee)' : 'No';

    console.warn(`[SECURITY RADAR] Early Fraud Warning on charge ${chargeId}: ${fraudType}`);

    await notifyStaff({
      subject: `⚠️ STRIPE RADAR: Stolen Card Early Warning (${fraudType})`,
      html: `<p>Stripe Radar received an early fraud warning from Visa/Mastercard. A card was reported stolen.</p>
             <p>Charge: ${escapeHtml(chargeId)}<br>
             Fraud Type: ${escapeHtml(fraudType)}<br>
             Actionable: ${actionable}</p>
             <p><strong>Recommendation:</strong> Refund this charge immediately in Stripe to prevent a $15 dispute fee!</p>`,
      text: `Stripe Radar warning on charge ${chargeId}: ${fraudType}. Refund proactively in Stripe.`
    }).catch(() => {});
  }
}

async function webhookHandler(req, res) {
  const stripe = getStripe();
  let event = req.body;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && stripe) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else if (Buffer.isBuffer(req.body)) {
      event = JSON.parse(req.body.toString('utf8'));
    }
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
}

router.get('/stripe-webhook', (req, res) => {
  res.json({
    ok: true,
    message: 'Stripe webhook is live. Paste this URL in Stripe Dashboard → Developers → Webhooks. Do not open it in a browser — Stripe sends POST events here.',
    method: 'POST'
  });
});

router.post('/stripe-webhook', express.raw({ type: 'application/json' }), webhookHandler);

module.exports = router;
module.exports.webhookHandler = webhookHandler;
module.exports.createWeeklyCheckout = createWeeklyCheckout;
module.exports.PLANS = PLANS;
