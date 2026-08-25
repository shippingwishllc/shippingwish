const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function withSummary(payload) {
  payload.summary = {
    totalGrossRevenue: payload.totalRevenue || payload.totalEarned || 0,
    activeLoadsCount: payload.activeLoads || 0,
    totalCarriers: payload.totalCarriers || 0,
    unpaidInvoicesSum: payload.pendingRevenue || payload.pendingPayment || 0,
    deliveredPendingPod: payload.pendingDocs || 0,
    totalMiles: payload.totalMiles || 0
  };
  return payload;
}

async function sendDashboard(req, res) {
  const { role, id: userId } = req.user;

  try {
    if (role === 'super_admin' || role === 'admin') {
      // Super Admin Overall Financial & Operational Metrics
      const totalLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads`);
      const todayLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE DATE(created_at) = CURRENT_DATE`);
      const activeLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE status IN ('booked', 'dispatched', 'at_pickup', 'loaded', 'in_transit', 'at_delivery')`);
      const revenueRes = await pool.query(`SELECT SUM(rate) AS total_revenue, SUM(carrier_pay) AS total_carrier_pay FROM loads`);
      const invoiceStatsRes = await pool.query(`
        SELECT
          SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) AS paid_amount,
          SUM(CASE WHEN status = 'unpaid' OR status = 'pending' THEN total_amount ELSE 0 END) AS pending_amount,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
          COUNT(CASE WHEN status = 'unpaid' OR status = 'pending' THEN 1 END) AS pending_count
        FROM invoices`);
      
      const dispatcherPerfRes = await pool.query(`
        SELECT d.id, d.name, COUNT(l.id) AS load_count, COALESCE(SUM(l.rate),0) AS gross_booked
        FROM users d
        LEFT JOIN loads l ON l.dispatcher_id = d.id
        WHERE d.role = 'dispatcher'
        GROUP BY d.id, d.name ORDER BY gross_booked DESC`);

      const carrierPerfRes = await pool.query(`
        SELECT c.id, c.name, c.company_name, COUNT(l.id) AS load_count, COALESCE(SUM(l.carrier_pay),0) AS total_paid
        FROM users c
        LEFT JOIN loads l ON l.carrier_id = c.id
        WHERE c.role = 'carrier'
        GROUP BY c.id, c.name, c.company_name ORDER BY load_count DESC LIMIT 10`);
      const carrierCountRes = await pool.query(`SELECT COUNT(*) FROM users WHERE role = 'carrier'`);

      return res.json(withSummary({
        role: 'super_admin',
        totalLoads: parseInt(totalLoadsRes.rows[0].count, 10),
        todayLoads: parseInt(todayLoadsRes.rows[0].count, 10),
        activeLoads: parseInt(activeLoadsRes.rows[0].count, 10),
        totalCarriers: parseInt(carrierCountRes.rows[0].count, 10),
        totalRevenue: parseFloat(revenueRes.rows[0].total_revenue || 0),
        totalCarrierPay: parseFloat(revenueRes.rows[0].total_carrier_pay || 0),
        grossMargin: parseFloat(revenueRes.rows[0].total_revenue || 0) - parseFloat(revenueRes.rows[0].total_carrier_pay || 0),
        paidRevenue: parseFloat(invoiceStatsRes.rows[0].paid_amount || 0),
        pendingRevenue: parseFloat(invoiceStatsRes.rows[0].pending_amount || 0),
        paidInvoicesCount: parseInt(invoiceStatsRes.rows[0].paid_count || 0, 10),
        pendingInvoicesCount: parseInt(invoiceStatsRes.rows[0].pending_count || 0, 10),
        dispatcherPerformance: dispatcherPerfRes.rows,
        carrierPerformance: carrierPerfRes.rows
      }));

    } else if (role === 'dispatcher') {
      // Dispatcher Specific Board & Performance Metrics
      const todayLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE dispatcher_id = $1 AND DATE(created_at) = CURRENT_DATE`, [userId]);
      const activeLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE dispatcher_id = $1 AND status IN ('booked', 'dispatched', 'at_pickup', 'loaded', 'in_transit', 'at_delivery')`, [userId]);
      const completedLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE dispatcher_id = $1 AND status IN ('delivered', 'pod_uploaded', 'invoiced', 'paid')`, [userId]);
      const upcomingPickupsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE dispatcher_id = $1 AND pickup_date = CURRENT_DATE`, [userId]);
      const upcomingDeliveriesRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE dispatcher_id = $1 AND delivery_date = CURRENT_DATE`, [userId]);
      const pendingDocsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE dispatcher_id = $1 AND status = 'delivered'`, [userId]); // Needs POD/invoice
      let fleetCount = 0;
      try {
        const fleetsRes = await pool.query(`SELECT COUNT(*) FROM dispatcher_carriers WHERE dispatcher_id = $1`, [userId]);
        fleetCount = parseInt(fleetsRes.rows[0].count, 10);
      } catch (e) { /* table optional */ }

      return res.json(withSummary({
        role: 'dispatcher',
        todayLoads: parseInt(todayLoadsRes.rows[0].count, 10),
        activeLoads: parseInt(activeLoadsRes.rows[0].count, 10),
        completedLoads: parseInt(completedLoadsRes.rows[0].count, 10),
        upcomingPickups: parseInt(upcomingPickupsRes.rows[0].count, 10),
        upcomingDeliveries: parseInt(upcomingDeliveriesRes.rows[0].count, 10),
        pendingDocs: parseInt(pendingDocsRes.rows[0].count, 10),
        totalCarriers: fleetCount
      }));

    } else {
      // Carrier Specific Dashboard & Revenue Summary
      const activeLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE carrier_id = $1 AND status IN ('booked', 'dispatched', 'at_pickup', 'loaded', 'in_transit', 'at_delivery')`, [userId]);
      const completedLoadsRes = await pool.query(`SELECT COUNT(*) FROM loads WHERE carrier_id = $1 AND status IN ('delivered', 'pod_uploaded', 'invoiced', 'paid')`, [userId]);
      const revenueRes = await pool.query(`SELECT SUM(carrier_pay) AS total_earned FROM loads WHERE carrier_id = $1 AND status IN ('delivered', 'pod_uploaded', 'invoiced', 'paid')`, [userId]);
      const pendingPaymentRes = await pool.query(`
        SELECT SUM(i.total_amount) AS pending_amount
        FROM invoices i JOIN loads l ON l.id = i.load_id
        WHERE l.carrier_id = $1 AND i.status != 'paid'`, [userId]);

      const dispatcherInfoRes = await pool.query(`
        SELECT DISTINCT d.name, d.phone, d.email
        FROM users d
        JOIN dispatcher_carriers dc ON dc.dispatcher_id = d.id
        WHERE dc.carrier_id = $1 LIMIT 1`, [userId]);

      return res.json(withSummary({
        role: 'carrier',
        activeLoads: parseInt(activeLoadsRes.rows[0].count, 10),
        completedLoads: parseInt(completedLoadsRes.rows[0].count, 10),
        totalEarned: parseFloat(revenueRes.rows[0].total_earned || 0),
        pendingPayment: parseFloat(pendingPaymentRes.rows[0].pending_amount || 0),
        dispatcherContact: dispatcherInfoRes.rows[0] || { name: 'Shipping Wish Dispatch', phone: '+1 917 737 0021', email: 'info@shippingwish.com' }
      }));
    }
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Could not load dashboard metrics.' });
  }
}

router.get('/', requireAuth, sendDashboard);
router.get('/stats', requireAuth, sendDashboard);

module.exports = router;
