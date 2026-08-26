const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');
const { buildTemplate, COMPANY, APP_URL, escapeHtml } = require('../utils/email-templates');

const TRIAL_DAYS = parseInt(process.env.STRIPE_TRIAL_DAYS || '7', 10);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key)) return null;
  return require('stripe')(key);
}

const PLANS = {
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
  return {
    price_data: {
      currency: 'usd',
      product_data: {
        name: plan.name,
        description: `${plan.description} First ${TRIAL_DAYS} days free. Then billed weekly.`
      },
      unit_amount: amount,
      recurring: { interval: 'week' }
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
    subscription_data: {
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
        message: `Card is saved securely. $0 due today. Weekly billing starts after a ${TRIAL_DAYS}-day trial. Cancel before then and you are not charged.`
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
      trial_days: TRIAL_DAYS,
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
    if (!stripe) return res.json({ ok: false, simulated: true });
    const session = await stripe.checkout.sessions.retrieve(req.params.id, {
      expand: ['subscription', 'customer']
    });
    const sub = session.subscription && typeof session.subscription === 'object' ? session.subscription : null;
    const email = session.customer_details?.email || session.customer_email;
    let portalReady = false;
    if (email) {
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
    res.status(404).json({ error: 'Checkout session not found' });
  }
});

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

  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    const customerId = obj.customer;
    const subId = obj.subscription;
    if (subId) {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'active', updated_at = now() WHERE stripe_subscription_id = $1`,
        [String(subId)]
      );
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
    if (customerId) {
      await pool.query(
        `UPDATE billing_subscriptions SET status = 'active', updated_at = now() WHERE stripe_customer_id = $1`,
        [String(customerId)]
      );
    }
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const subId = obj.id;
    const status = obj.status === 'canceled' || type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
    const periodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000) : null;
    await pool.query(
      `UPDATE billing_subscriptions
       SET status = $2, current_period_end = $3, updated_at = now()
       WHERE stripe_subscription_id = $1`,
      [String(subId), status, periodEnd]
    );
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
