const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');
const { buildTemplate, COMPANY, APP_URL } = require('../utils/email-templates');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PLANS = {
  solo_weekly: {
    key: 'solo_weekly',
    name: 'Dedicated Operations Manager — 1 truck',
    amount_cents: parseInt(process.env.STRIPE_PLAN_SOLO_CENTS || '9900', 10),
    description: 'Weekly retainer. We find and book freight for one truck. You keep broker pay.'
  },
  fleet_weekly: {
    key: 'fleet_weekly',
    name: 'Dedicated Operations Manager — 2–5 trucks',
    amount_cents: parseInt(process.env.STRIPE_PLAN_FLEET_CENTS || '14900', 10),
    description: 'Weekly retainer for a small fleet. Dedicated manager, load booking, broker handling.'
  },
  custom_weekly: {
    key: 'custom_weekly',
    name: 'Dedicated Operations Manager — custom weekly',
    amount_cents: parseInt(process.env.STRIPE_PLAN_CUSTOM_CENTS || '19900', 10),
    description: 'Custom weekly retainer set by Shipping Wish LLC.'
  }
};

router.get('/plans', requireAuth, (req, res) => {
  res.json({ plans: PLANS, configured: Boolean(process.env.STRIPE_SECRET_KEY) });
});

async function createWeeklyCheckout({ email, name, company, planKey, leadId, userId, amountOverride }) {
  const stripe = getStripe();
  const plan = PLANS[planKey] || PLANS.solo_weekly;
  const amount = amountOverride || plan.amount_cents;
  const success = `${APP_URL}/dashboard.html?billing=success`;
  const cancel = `${APP_URL}/contact.html?billing=cancel`;

  if (!stripe) {
    const fake = `https://checkout.stripe.com/c/pay/cs_test_simulated_${Date.now()}`;
    const ins = await pool.query(
      `INSERT INTO billing_subscriptions (user_id, lead_id, plan_key, amount_cents, status, stripe_checkout_session_id)
       VALUES ($1,$2,$3,$4,'incomplete',$5) RETURNING *`,
      [userId || null, leadId || null, plan.key, amount, 'sim_' + Date.now()]
    );
    return { simulated: true, url: fake, subscription: ins.rows[0] };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    client_reference_id: String(leadId || userId || ''),
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: plan.name,
            description: plan.description
          },
          unit_amount: amount,
          recurring: { interval: 'week' }
        },
        quantity: 1
      }
    ],
    success_url: success,
    cancel_url: cancel,
    metadata: {
      lead_id: leadId ? String(leadId) : '',
      user_id: userId ? String(userId) : '',
      plan_key: plan.key,
      company: company || ''
    },
    subscription_data: {
      metadata: {
        lead_id: leadId ? String(leadId) : '',
        plan_key: plan.key
      }
    }
  });

  const ins = await pool.query(
    `INSERT INTO billing_subscriptions (user_id, lead_id, stripe_checkout_session_id, plan_key, amount_cents, status)
     VALUES ($1,$2,$3,$4,$5,'incomplete') RETURNING *`,
    [userId || null, leadId || null, session.id, plan.key, amount]
  );

  return { simulated: false, url: session.url, session_id: session.id, subscription: ins.rows[0] };
}

// Admin: create a weekly checkout link and optionally email it
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

    const checkout = await createWeeklyCheckout({
      email: targetEmail,
      name: targetName,
      company: targetCompany,
      planKey: plan_key || 'solo_weekly',
      leadId: lead_id,
      userId: req.user.id,
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

router.get('/subscriptions', requireAuth, requireRole('admin', 'super_admin', 'dispatcher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, l.company_name, l.email AS lead_email, l.phone
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
    const leadId = obj.metadata && obj.metadata.lead_id ? parseInt(obj.metadata.lead_id, 10) : null;
    await pool.query(
      `UPDATE billing_subscriptions
       SET status = 'active',
           stripe_subscription_id = COALESCE($1, stripe_subscription_id),
           stripe_customer_id = $2,
           updated_at = now()
       WHERE stripe_checkout_session_id = $3`,
      [subId ? String(subId) : null, customerId ? String(customerId) : null, sessionId]
    );
    if (leadId) {
      await pool.query(`UPDATE crm_leads SET status = 'active' WHERE id = $1`, [leadId]);
    }
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
    // Also mark freight invoices if this is a one-off Stripe invoice id
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

router.post('/stripe-webhook', express.raw({ type: 'application/json' }), webhookHandler);

module.exports = router;
module.exports.webhookHandler = webhookHandler;
module.exports.createWeeklyCheckout = createWeeklyCheckout;
module.exports.PLANS = PLANS;
