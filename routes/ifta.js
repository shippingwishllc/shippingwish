const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function quarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// GET /api/ifta/report?year=2026&quarter=3&carrierId=5
router.get('/report', requireAuth, async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getUTCFullYear();
  const quarter = parseInt(req.query.quarter, 10) || Math.floor(now.getUTCMonth() / 3) + 1;
  const { start, end } = quarterRange(year, quarter);

  const loadParams = [start, end];
  let carrierFilterLoads = '';
  let carrierFilterFuel = '';
  const fuelParams = [start, end];

  if (req.user.role === 'carrier') {
    carrierFilterLoads = 'AND l.carrier_id = $3';
    loadParams.push(req.user.id);

    carrierFilterFuel = 'AND carrier_id = $3';
    fuelParams.push(req.user.id);
  } else if (req.query.carrierId) {
    carrierFilterLoads = 'AND l.carrier_id = $3';
    loadParams.push(req.query.carrierId);

    carrierFilterFuel = 'AND carrier_id = $3';
    fuelParams.push(req.query.carrierId);
  }

  try {
    // 1. Miles by State
    const milesRes = await pool.query(
      `SELECT m.state, SUM(m.miles) AS total_miles, COUNT(DISTINCT l.id) AS load_count
       FROM load_state_miles m
       JOIN loads l ON l.id = m.load_id
       WHERE l.delivery_date >= $1 AND l.delivery_date < $2 ${carrierFilterLoads}
       GROUP BY m.state`,
      loadParams
    );

    // 2. Fuel Gallons & Cost by State
    const fuelRes = await pool.query(
      `SELECT state, SUM(gallons) AS total_gallons, SUM(cost) AS total_cost
       FROM fuel_purchases
       WHERE purchase_date >= $1 AND purchase_date < $2 ${carrierFilterFuel}
       GROUP BY state`,
      fuelParams
    );

    // Combine Miles and Fuel by State
    const stateMap = {};

    milesRes.rows.forEach(r => {
      stateMap[r.state] = {
        state: r.state,
        total_miles: parseFloat(r.total_miles || 0),
        load_count: parseInt(r.load_count || 0, 10),
        total_gallons: 0,
        total_cost: 0
      };
    });

    fuelRes.rows.forEach(r => {
      if (!stateMap[r.state]) {
        stateMap[r.state] = {
          state: r.state,
          total_miles: 0,
          load_count: 0,
          total_gallons: 0,
          total_cost: 0
        };
      }
      stateMap[r.state].total_gallons = parseFloat(r.total_gallons || 0);
      stateMap[r.state].total_cost = parseFloat(r.total_cost || 0);
    });

    const statesList = Object.values(stateMap).sort((a, b) => b.total_miles - a.total_miles);
    const overallMiles = statesList.reduce((sum, s) => sum + s.total_miles, 0);
    const overallGallons = statesList.reduce((sum, s) => sum + s.total_gallons, 0);
    const overallFuelCost = statesList.reduce((sum, s) => sum + s.total_cost, 0);
    const overallMPG = overallGallons > 0 ? (overallMiles / overallGallons).toFixed(2) : 0;

    res.json({
      year,
      quarter,
      start,
      end,
      states: statesList,
      totalMiles: overallMiles,
      totalGallons: overallGallons,
      totalFuelCost: overallFuelCost,
      avgMPG: overallMPG
    });
  } catch (err) {
    console.error('IFTA report error:', err);
    res.status(500).json({ error: 'Could not generate IFTA report.' });
  }
});

module.exports = router;
