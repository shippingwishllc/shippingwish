const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Standard IFTA Fuel Tax Rates ($/gallon) benchmarked for US jurisdictions
const IFTA_TAX_RATES = {
  AL: 0.29, AZ: 0.26, AR: 0.285, CA: 0.441, CO: 0.205, CT: 0.492, DE: 0.22, FL: 0.352,
  GA: 0.35, ID: 0.32, IL: 0.545, IN: 0.55, IA: 0.325, KS: 0.26, KY: 0.26, LA: 0.20,
  ME: 0.312, MD: 0.477, MA: 0.24, MI: 0.485, MN: 0.285, MS: 0.18, MO: 0.22, MT: 0.2975,
  NE: 0.29, NV: 0.27, NH: 0.222, NJ: 0.485, NM: 0.21, NY: 0.395, NC: 0.405, ND: 0.23,
  OH: 0.47, OK: 0.19, OR: 0.38, PA: 0.741, RI: 0.37, SC: 0.28, SD: 0.28, TN: 0.27,
  TX: 0.20, UT: 0.364, VT: 0.32, VA: 0.298, WA: 0.494, WV: 0.357, WI: 0.329, WY: 0.24
};
const DEFAULT_TAX_RATE = 0.28;

function quarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function buildIftaData(req) {
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

  const stateMap = {};

  milesRes.rows.forEach((r) => {
    const st = (r.state || '').toUpperCase().trim();
    if (!st) return;
    stateMap[st] = {
      state: st,
      total_miles: parseFloat(r.total_miles || 0),
      load_count: parseInt(r.load_count || 0, 10),
      total_gallons: 0,
      total_cost: 0
    };
  });

  fuelRes.rows.forEach((r) => {
    const st = (r.state || '').toUpperCase().trim();
    if (!st) return;
    if (!stateMap[st]) {
      stateMap[st] = {
        state: st,
        total_miles: 0,
        load_count: 0,
        total_gallons: 0,
        total_cost: 0
      };
    }
    stateMap[st].total_gallons = parseFloat(r.total_gallons || 0);
    stateMap[st].total_cost = parseFloat(r.total_cost || 0);
  });

  const rawStatesList = Object.values(stateMap).sort((a, b) => b.total_miles - a.total_miles);
  const overallMiles = parseFloat(rawStatesList.reduce((sum, s) => sum + s.total_miles, 0).toFixed(2));
  const overallGallons = parseFloat(rawStatesList.reduce((sum, s) => sum + s.total_gallons, 0).toFixed(2));
  const overallFuelCost = parseFloat(rawStatesList.reduce((sum, s) => sum + s.total_cost, 0).toFixed(2));
  const numericAvgMPG = overallGallons > 0 ? overallMiles / overallGallons : 0;
  const overallMPG = numericAvgMPG > 0 ? parseFloat(numericAvgMPG.toFixed(2)) : 0;

  // Calculate detailed IFTA tax liability per state
  let totalNetTaxDue = 0;
  const statesList = rawStatesList.map((s) => {
    const taxableGallons = overallMPG > 0 ? parseFloat((s.total_miles / overallMPG).toFixed(2)) : 0;
    const paidGallons = parseFloat((s.total_gallons || 0).toFixed(2));
    const netTaxableGallons = parseFloat((taxableGallons - paidGallons).toFixed(2));
    const taxRate = IFTA_TAX_RATES[s.state] || DEFAULT_TAX_RATE;
    const taxDue = parseFloat((netTaxableGallons * taxRate).toFixed(2));
    totalNetTaxDue += taxDue;

    return {
      ...s,
      taxable_gallons: taxableGallons,
      paid_gallons: paidGallons,
      net_taxable_gallons: netTaxableGallons,
      tax_rate: taxRate,
      tax_due: taxDue
    };
  });

  return {
    year,
    quarter,
    start,
    end,
    states: statesList,
    totalMiles: overallMiles,
    totalGallons: overallGallons,
    totalFuelCost: overallFuelCost,
    avgMPG: overallMPG,
    totalTaxDue: parseFloat(totalNetTaxDue.toFixed(2))
  };
}

function generateIftaCsv(reportData) {
  const { year, quarter, start, end, states, totalMiles, totalGallons, totalFuelCost, avgMPG, totalTaxDue } = reportData;
  const lines = [
    `"SHIPPING WISH LLC - IFTA QUARTERLY FUEL TAX REPORT"`,
    `"Period","Q${quarter} ${year} (${start} to ${end})"`,
    `"Fleet Total Miles",${totalMiles}`,
    `"Total Gallons Purchased",${totalGallons}`,
    `"Total Fuel Cost ($)",${totalFuelCost}`,
    `"Average Fleet MPG",${avgMPG}`,
    `"Net Estimated Tax Due ($)",${totalTaxDue}`,
    ``,
    `"Jurisdiction","Total Miles","Taxable Miles %","Taxable Gallons","Gallons Purchased","Fuel Spend ($)","Net Taxable Gallons","Tax Rate ($/gal)","Estimated Tax Due ($)"`
  ];

  states.forEach((s) => {
    const pct = totalMiles > 0 ? (((s.total_miles || 0) / totalMiles) * 100).toFixed(1) + '%' : '0.0%';
    lines.push([
      `"${s.state}"`,
      s.total_miles.toFixed(1),
      `"${pct}"`,
      s.taxable_gallons.toFixed(2),
      s.total_gallons.toFixed(2),
      s.total_cost.toFixed(2),
      s.net_taxable_gallons.toFixed(2),
      s.tax_rate.toFixed(4),
      s.tax_due.toFixed(2)
    ].join(','));
  });

  lines.push([
    `"TOTAL"`,
    totalMiles.toFixed(1),
    `"100.0%"`,
    (avgMPG > 0 ? totalMiles / avgMPG : 0).toFixed(2),
    totalGallons.toFixed(2),
    totalFuelCost.toFixed(2),
    ((avgMPG > 0 ? totalMiles / avgMPG : 0) - totalGallons).toFixed(2),
    `"-"`,
    totalTaxDue.toFixed(2)
  ].join(','));

  return lines.join('\r\n');
}

// GET /api/ifta/export — Download IFTA CSV report directly
router.get('/export', requireAuth, async (req, res) => {
  try {
    const data = await buildIftaData(req);
    const csv = generateIftaCsv(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="IFTA_Report_Q${data.quarter}_${data.year}.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('IFTA export error:', err);
    res.status(500).json({ error: 'Could not export IFTA CSV report.' });
  }
});

// GET /api/ifta/report?year=2026&quarter=3&carrierId=5&format=csv
router.get('/report', requireAuth, async (req, res) => {
  try {
    const data = await buildIftaData(req);
    if (req.query.format === 'csv') {
      const csv = generateIftaCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="IFTA_Report_Q${data.quarter}_${data.year}.csv"`);
      return res.status(200).send(csv);
    }
    res.json(data);
  } catch (err) {
    console.error('IFTA report error:', err);
    res.status(500).json({ error: 'Could not generate IFTA report.' });
  }
});

module.exports = router;
