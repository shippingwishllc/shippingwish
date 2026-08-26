const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function carrierIdFor(user) {
  if (user.role === 'carrier' || user.role === 'carrier_admin') return user.id;
  return user.organization_id || null;
}

router.get('/home', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'driver') {
      return res.status(403).json({ error: 'Use the driver app.', redirect: '/driver-app' });
    }
    if (req.user.role !== 'carrier' && req.user.role !== 'carrier_admin') {
      return res.status(403).json({ error: 'Carrier portal only.' });
    }

    const id = req.user.id;
    const userRes = await pool.query(
      `SELECT id, name, email, role, company_name, phone, mc_number, dot_number, address, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    const user = userRes.rows[0];

    const [
      loadsRes,
      offersRes,
      trucksRes,
      driversRes,
      docsRes,
      invoicesRes,
      subRes,
      dispatcherRes,
      milesRes
    ] = await Promise.all([
      pool.query(
        `SELECT * FROM loads WHERE carrier_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id]
      ),
      pool.query(
        `SELECT * FROM load_offers WHERE carrier_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [id]
      ).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM trucks WHERE carrier_id = $1`, [id]),
      pool.query(`SELECT * FROM drivers WHERE carrier_id = $1`, [id]),
      pool.query(
        `SELECT category, COUNT(*)::int AS n FROM documents WHERE carrier_id = $1 GROUP BY category`,
        [id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT i.status, COUNT(*)::int AS n, COALESCE(SUM(i.total_amount),0)::float AS amount
         FROM invoices i JOIN loads l ON l.id = i.load_id
         WHERE l.carrier_id = $1 GROUP BY i.status`,
        [id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT b.* FROM billing_subscriptions b
         LEFT JOIN crm_leads l ON l.id = b.lead_id
         WHERE lower(l.email) = lower($1) OR b.user_id = $2
         ORDER BY b.created_at DESC LIMIT 1`,
        [user.email, id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT d.id, d.name, d.phone, d.email
         FROM users d
         JOIN dispatcher_carriers dc ON dc.dispatcher_id = d.id
         WHERE dc.carrier_id = $1
         LIMIT 1`,
        [id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT COALESCE(SUM(miles),0)::float AS miles,
                COALESCE(SUM(rate),0)::float AS broker_pay,
                COALESCE(SUM(COALESCE(NULLIF(carrier_pay,0), rate)),0)::float AS you_keep
         FROM loads WHERE carrier_id = $1 AND status NOT IN ('cancelled')`,
        [id]
      )
    ]);

    const loads = loadsRes.rows;
    const activeStatuses = ['booked', 'dispatched', 'at_pickup', 'loaded', 'in_transit', 'at_delivery'];
    const activeLoads = loads.filter((l) => activeStatuses.includes(l.status));
    const nextPickup = activeLoads
      .filter((l) => l.pickup_date)
      .sort((a, b) => String(a.pickup_date).localeCompare(String(b.pickup_date)))[0] || activeLoads[0] || null;

    const docCats = {};
    (docsRes.rows || []).forEach((r) => { docCats[r.category] = r.n; });

    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const compliance = [];
    trucksRes.rows.forEach((t) => {
      ['insurance_expiry', 'registration_expiry', 'inspection_expiry'].forEach((k) => {
        if (t[k] && new Date(t[k]) <= soon) {
          compliance.push({
            kind: 'truck',
            label: `${t.truck_number} ${k.replace('_expiry', '').replace('_', ' ')}`,
            date: t[k]
          });
        }
      });
    });
    driversRes.rows.forEach((d) => {
      ['cdl_expiry', 'medical_expiry'].forEach((k) => {
        if (d[k] && new Date(d[k]) <= soon) {
          compliance.push({
            kind: 'driver',
            label: `${d.name} ${k.replace('_expiry', '').replace('_', ' ')}`,
            date: d[k]
          });
        }
      });
    });

    const checklist = [
      { key: 'mc', label: 'MC / USDOT on file', done: Boolean(user.mc_number || user.dot_number) },
      { key: 'truck', label: 'At least one truck', done: trucksRes.rows.length > 0 },
      { key: 'driver', label: 'At least one driver', done: driversRes.rows.length > 0 },
      { key: 'insurance', label: 'Certificate of insurance uploaded', done: Boolean(docCats.insurance) },
      { key: 'w9', label: 'W-9 uploaded', done: Boolean(docCats.w9) },
      { key: 'trial', label: 'Weekly operations trial / subscription', done: Boolean(subRes.rows[0]) }
    ];

    const pendingOffers = (offersRes.rows || []).filter((o) => o.status === 'pending');
    const invoicePending = (invoicesRes.rows || [])
      .filter((r) => r.status !== 'paid')
      .reduce((s, r) => s + (r.amount || 0), 0);

    res.json({
      user,
      manager: dispatcherRes.rows[0] || {
        name: 'Shipping Wish Operations',
        phone: process.env.COMPANY_PHONE || '+1 (917) 737-0021',
        email: process.env.OPERATIONS_EMAIL || 'operations@shippingwish.com'
      },
      subscription: subRes.rows[0] || null,
      kpis: {
        brokerPay: milesRes.rows[0].broker_pay || 0,
        youKeep: milesRes.rows[0].you_keep || 0,
        miles: milesRes.rows[0].miles || 0,
        activeLoads: activeLoads.length,
        pendingBrokerPay: invoicePending,
        pendingOffers: pendingOffers.length
      },
      checklist,
      compliance,
      nextPickup,
      loads,
      offers: offersRes.rows || [],
      payNote: 'You keep 100% of freight the broker pays. Shipping Wish bills a weekly operations retainer on Stripe — not a cut of the load.'
    });
  } catch (err) {
    console.error('portal home:', err);
    res.status(500).json({ error: 'Could not load carrier home.' });
  }
});

module.exports = router;
module.exports.carrierIdFor = carrierIdFor;
