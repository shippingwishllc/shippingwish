const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

// Major Freight High-Density Corridors
const FREIGHT_CORRIDORS = {
  'SOUTHEAST_TO_MIDWEST': {
    name: 'Southeast to Midwest Corridor (I-75 / I-65)',
    origin_states: ['GA', 'FL', 'SC', 'NC', 'AL', 'TN'],
    dest_states: ['KY', 'OH', 'IN', 'IL', 'MI'],
    typical_linehaul_rpm: 2.35
  },
  'MIDWEST_TO_NORTHEAST': {
    name: 'Midwest to Northeast Corridor (I-80 / I-90)',
    origin_states: ['IL', 'IN', 'OH', 'MI', 'WI'],
    dest_states: ['PA', 'NY', 'NJ', 'MA', 'CT', 'MD'],
    typical_linehaul_rpm: 2.65
  },
  'SOUTHEAST_TO_NORTHEAST': {
    name: 'Southeast to Mid-Atlantic / Northeast (I-95)',
    origin_states: ['FL', 'GA', 'SC', 'NC'],
    dest_states: ['VA', 'MD', 'PA', 'NJ', 'NY'],
    typical_linehaul_rpm: 2.45
  },
  'TEXAS_TRIANGLE_REGIONAL': {
    name: 'Texas Triangle & Gulf Coast (I-35 / I-10 / I-45)',
    origin_states: ['TX', 'LA', 'OK', 'AR'],
    dest_states: ['TX', 'LA', 'OK', 'AR', 'TN'],
    typical_linehaul_rpm: 2.20
  },
  'WEST_COAST_I5': {
    name: 'Pacific Coast Corridor (I-5)',
    origin_states: ['CA', 'AZ', 'NV'],
    dest_states: ['OR', 'WA', 'NV', 'UT'],
    typical_linehaul_rpm: 2.80
  }
};

let migrated = false;
async function ensureTables() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ltl_consolidation_pools (
        id SERIAL PRIMARY KEY,
        pool_number VARCHAR(50) UNIQUE NOT NULL,
        corridor_code VARCHAR(60) NOT NULL,
        corridor_name VARCHAR(120) NOT NULL,
        equipment_type VARCHAR(50) NOT NULL DEFAULT 'DRY_VAN_53',
        total_orders_count INT NOT NULL DEFAULT 0,
        total_pallets INT NOT NULL DEFAULT 0,
        total_weight_lbs NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_cubic_ft NUMERIC(10,2) NOT NULL DEFAULT 0,
        cube_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        weight_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        total_shipper_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
        carrier_target_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
        gross_profit_margin NUMERIC(10,2) NOT NULL DEFAULT 0,
        margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'SUGGESTED',
        converted_manifest_id INT REFERENCES multistop_manifests(id) ON DELETE SET NULL,
        load_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        orders_data JSONB NOT NULL DEFAULT '[]'::jsonb,
        stops_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
        pool_notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_pool_num ON ltl_consolidation_pools(pool_number);
      CREATE INDEX IF NOT EXISTS idx_pool_status ON ltl_consolidation_pools(status);
      CREATE INDEX IF NOT EXISTS idx_pool_corridor ON ltl_consolidation_pools(corridor_code);
    `);

    // Seed demonstration pool if empty
    const countRes = await pool.query('SELECT COUNT(*) FROM ltl_consolidation_pools');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      const sampleOrders = [
        {
          order_id: 'LTL-ORD-101',
          shipper: 'Georgia Chemical & Plastics',
          origin_city: 'Atlanta',
          origin_state: 'GA',
          dest_city: 'Nashville',
          dest_state: 'TN',
          pallets: 8,
          weight_lbs: 11200,
          shipper_billed_rate: 980.00
        },
        {
          order_id: 'LTL-ORD-102',
          shipper: 'Piedmont Automotive Components',
          origin_city: 'Chattanooga',
          origin_state: 'TN',
          dest_city: 'Louisville',
          dest_state: 'KY',
          pallets: 10,
          weight_lbs: 13500,
          shipper_billed_rate: 1250.00
        },
        {
          order_id: 'LTL-ORD-103',
          shipper: 'Southern Medical Packaging',
          origin_city: 'Macon',
          origin_state: 'GA',
          dest_city: 'Indianapolis',
          dest_state: 'IN',
          pallets: 6,
          weight_lbs: 7200,
          shipper_billed_rate: 920.00
        }
      ];

      const sampleStops = [
        { sequence: 1, type: 'PICKUP', facility: 'Macon Southern Packaging', city: 'Macon', state: 'GA', pallets: 6, weight_lbs: 7200, bol: 'BOL-MCN-1' },
        { sequence: 2, type: 'PICKUP', facility: 'Atlanta Chemical Whse', city: 'Atlanta', state: 'GA', pallets: 8, weight_lbs: 11200, bol: 'BOL-ATL-1' },
        { sequence: 3, type: 'PICKUP', facility: 'Chattanooga Auto Dock', city: 'Chattanooga', state: 'TN', pallets: 10, weight_lbs: 13500, bol: 'BOL-CHA-1' },
        { sequence: 4, type: 'DELIVERY', facility: 'Nashville Regional DC', city: 'Nashville', state: 'TN', pallets: 8, weight_lbs: 11200, bol: 'BOL-ATL-1' },
        { sequence: 5, type: 'DELIVERY', facility: 'Louisville Transit Hub', city: 'Louisville', state: 'KY', pallets: 10, weight_lbs: 13500, bol: 'BOL-CHA-1' },
        { sequence: 6, type: 'DELIVERY', facility: 'Indy Gateway Terminal', city: 'Indianapolis', state: 'IN', pallets: 6, weight_lbs: 7200, bol: 'BOL-MCN-1' }
      ];

      await pool.query(`
        INSERT INTO ltl_consolidation_pools (
          pool_number, corridor_code, corridor_name, equipment_type,
          total_orders_count, total_pallets, total_weight_lbs, total_cubic_ft,
          cube_utilization_pct, weight_utilization_pct,
          total_shipper_revenue, carrier_target_pay, gross_profit_margin, margin_pct,
          status, orders_data, stops_sequence, pool_notes
        ) VALUES (
          'POOL-2026-0501', 'SOUTHEAST_TO_MIDWEST', 'Southeast to Midwest Corridor (I-75 / I-65)', 'DRY_VAN_53',
          3, 24, 31900.00, 2650.00,
          65.43, 70.89,
          3150.00, 2200.00, 950.00, 30.16,
          'CONFIRMED', $1, $2, 'High-margin 3-shipper consolidation along I-75 with 4 intermediate drops/pickups.'
        )
      `, [JSON.stringify(sampleOrders), JSON.stringify(sampleStops)]);
    }

    migrated = true;
  } catch (err) {
    console.error('Error ensuring ltl_consolidation_pools table:', err);
  }
}

// Utility: Evaluate Corridor Match and Calculate Consolidated Profit Economics
function evaluateLtlPool(orders = [], corridorCode = 'SOUTHEAST_TO_MIDWEST', equipmentType = 'DRY_VAN_53') {
  const corridor = FREIGHT_CORRIDORS[corridorCode] || FREIGHT_CORRIDORS['SOUTHEAST_TO_MIDWEST'];

  let totalPallets = 0;
  let totalWeight = 0;
  let totalShipperRevenue = 0;

  const maxVolume = equipmentType === 'REEFER_53' ? 3600 : 4050;
  const maxWeight = equipmentType === 'REEFER_53' ? 43500 : 45000;
  const maxPallets = 26;

  for (const ord of orders) {
    totalPallets += parseInt(ord.pallets || 1, 10);
    totalWeight += parseFloat(ord.weight_lbs || 0);
    totalShipperRevenue += parseFloat(ord.shipper_billed_rate || ord.rate || 0);
  }

  // Estimate total cubic feet based on average 95 cu ft per standard pallet
  const totalCubicFt = Math.round(totalPallets * 95 * 100) / 100;
  const cubePct = Math.min(100, Math.round((totalCubicFt / maxVolume) * 10000) / 100);
  const weightPct = Math.min(100, Math.round((totalWeight / maxWeight) * 10000) / 100);

  // Total stops = pickups + deliveries (orders.length * 2)
  const totalStops = Math.max(2, orders.length * 2);
  const intermediateStops = Math.max(0, totalStops - 2);
  const stopFees = intermediateStops * 100; // $100 per intermediate stop

  // Target carrier pay: Estimated base linehaul ($1,800 standard corridor) + stop fees
  const baseLinehaul = 1800;
  const carrierTargetPay = baseLinehaul + stopFees;

  const grossProfit = Math.max(0, totalShipperRevenue - carrierTargetPay);
  const marginPct = totalShipperRevenue > 0 
    ? Math.round((grossProfit / totalShipperRevenue) * 10000) / 100 
    : 0;

  const isCapacityFeasible = totalPallets <= maxPallets && totalWeight <= maxWeight;

  return {
    corridor_code: corridorCode,
    corridor_name: corridor.name,
    equipment_type: equipmentType,
    total_orders_count: orders.length,
    total_pallets: totalPallets,
    max_pallets_capacity: maxPallets,
    total_weight_lbs: totalWeight,
    max_weight_lbs: maxWeight,
    total_cubic_ft: totalCubicFt,
    max_cubic_ft: maxVolume,
    cube_utilization_pct: cubePct,
    weight_utilization_pct: weightPct,
    total_shipper_revenue: totalShipperRevenue,
    carrier_target_pay: carrierTargetPay,
    gross_profit_margin: grossProfit,
    margin_pct: marginPct,
    total_stops: totalStops,
    intermediate_stops: intermediateStops,
    stop_off_fees: stopFees,
    is_capacity_feasible: isCapacityFeasible,
    feasibility_status: isCapacityFeasible ? 'FEASIBLE' : 'OVER_CAPACITY'
  };
}

// -------------------------------------------------------------
// POST /api/ltl-pools/analyze
// Interactive analyzer evaluating candidate partial shipments for consolidation
// -------------------------------------------------------------
router.post('/analyze', async (req, res) => {
  try {
    const { orders = [], corridor_code = 'SOUTHEAST_TO_MIDWEST', equipment_type = 'DRY_VAN_53' } = req.body;
    const analysis = evaluateLtlPool(orders, corridor_code, equipment_type);
    return res.json({ success: true, ...analysis });
  } catch (err) {
    console.error('Error analyzing LTL pool:', err);
    return res.status(500).json({ error: 'Failed to analyze LTL pool.' });
  }
});

// -------------------------------------------------------------
// GET /api/ltl-pools/roster
// Fetch all consolidation pools and KPI metrics
// -------------------------------------------------------------
router.get('/roster', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const poolsRes = await pool.query(`
      SELECT p.*, m.manifest_number as linked_manifest_number
      FROM ltl_consolidation_pools p
      LEFT JOIN multistop_manifests m ON m.id = p.converted_manifest_id
      ORDER BY p.created_at DESC
    `);

    const pools = poolsRes.rows;

    let totalPools = pools.length;
    let sumProfit = 0;
    let sumMarginPct = 0;
    let activePools = 0;

    for (const p of pools) {
      sumProfit += parseFloat(p.gross_profit_margin) || 0;
      sumMarginPct += parseFloat(p.margin_pct) || 0;
      if (p.status === 'SUGGESTED' || p.status === 'CONFIRMED') {
        activePools++;
      }
    }

    const avgMarginPct = totalPools > 0 ? Math.round((sumMarginPct / totalPools) * 10) / 10 : 0;

    return res.json({
      success: true,
      kpis: {
        total_pools: totalPools,
        active_pools: activePools,
        total_profit_potential: Math.round(sumProfit * 100) / 100,
        avg_margin_pct: avgMarginPct
      },
      corridors: FREIGHT_CORRIDORS,
      pools
    });
  } catch (err) {
    console.error('Error fetching LTL pools roster:', err);
    return res.status(500).json({ error: 'Failed to fetch LTL pools roster.' });
  }
});

// -------------------------------------------------------------
// POST /api/ltl-pools/create
// Store a new consolidation pool
// -------------------------------------------------------------
router.post('/create', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const {
      corridor_code = 'SOUTHEAST_TO_MIDWEST',
      equipment_type = 'DRY_VAN_53',
      orders = [],
      stops_sequence = [],
      pool_notes = ''
    } = req.body;

    if (!orders || orders.length < 2) {
      return res.status(400).json({ error: 'An LTL consolidation pool must contain at least 2 partial shipments.' });
    }

    const evalRes = evaluateLtlPool(orders, corridor_code, equipment_type);

    const poolNumber = 'POOL-2026-' + Math.floor(1000 + Math.random() * 9000);

    const insertRes = await pool.query(`
      INSERT INTO ltl_consolidation_pools (
        pool_number, corridor_code, corridor_name, equipment_type,
        total_orders_count, total_pallets, total_weight_lbs, total_cubic_ft,
        cube_utilization_pct, weight_utilization_pct,
        total_shipper_revenue, carrier_target_pay, gross_profit_margin, margin_pct,
        status, orders_data, stops_sequence, pool_notes
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10,
        $11, $12, $13, $14,
        'CONFIRMED', $15, $16, $17
      ) RETURNING *
    `, [
      poolNumber, evalRes.corridor_code, evalRes.corridor_name, evalRes.equipment_type,
      evalRes.total_orders_count, evalRes.total_pallets, evalRes.total_weight_lbs, evalRes.total_cubic_ft,
      evalRes.cube_utilization_pct, evalRes.weight_utilization_pct,
      evalRes.total_shipper_revenue, evalRes.carrier_target_pay, evalRes.gross_profit_margin, evalRes.margin_pct,
      JSON.stringify(orders), JSON.stringify(stops_sequence), pool_notes
    ]);

    const createdPool = insertRes.rows[0];

    auditLog(
      req.user ? req.user.id : null,
      'CREATE_LTL_POOL',
      `Assembled LTL pool ${poolNumber} with ${orders.length} orders (${evalRes.total_pallets} pallets, $${evalRes.gross_profit_margin} margin)`,
      getClientIp(req)
    );

    return res.json({
      success: true,
      message: `Consolidation Pool ${poolNumber} assembled successfully.`,
      pool: createdPool
    });
  } catch (err) {
    console.error('Error creating LTL pool:', err);
    return res.status(500).json({ error: 'Failed to create LTL pool.' });
  }
});

// -------------------------------------------------------------
// POST /api/ltl-pools/:id/convert-manifest
// 1-Click Conversion: Converts an LTL pool into a formal Multi-Stop Manifest
// -------------------------------------------------------------
router.post('/:id/convert-manifest', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;

    const poolQuery = await pool.query(`
      SELECT * FROM ltl_consolidation_pools
      WHERE id::text = $1 OR pool_number = $1
    `, [id]);

    if (poolQuery.rows.length === 0) {
      return res.status(404).json({ error: 'LTL Consolidation Pool not found.' });
    }

    const p = poolQuery.rows[0];
    if (p.status === 'CONVERTED_TO_MANIFEST' && p.converted_manifest_id) {
      return res.status(400).json({ error: 'Pool has already been converted into a manifest.' });
    }

    const orders = Array.isArray(p.orders_data) ? p.orders_data : JSON.parse(p.orders_data || '[]');
    let stops = Array.isArray(p.stops_sequence) ? p.stops_sequence : JSON.parse(p.stops_sequence || '[]');

    // If stops not pre-built, synthesize chronological LIFO sequence
    if (stops.length === 0 && orders.length > 0) {
      let seq = 1;
      // All pickups first
      for (const ord of orders) {
        stops.push({
          sequence: seq++,
          type: 'PICKUP',
          facility: ord.shipper || 'Shipper Dock',
          city: ord.origin_city || 'Atlanta',
          state: ord.origin_state || 'GA',
          pallets: ord.pallets || 1,
          weight_lbs: ord.weight_lbs || 1000,
          bol_ref: ord.order_id || ('BOL-' + seq)
        });
      }
      // All drops sequenced (last pickup drop first, or reverse for LIFO)
      for (let i = orders.length - 1; i >= 0; i--) {
        const ord = orders[i];
        stops.push({
          sequence: seq++,
          type: 'DELIVERY',
          facility: 'Consignee Receiver Hub',
          city: ord.dest_city || 'Chicago',
          state: ord.dest_state || 'IL',
          pallets: ord.pallets || 1,
          weight_lbs: ord.weight_lbs || 1000,
          bol_ref: ord.order_id || ('BOL-' + seq)
        });
      }
    }

    // Synthesize pallet items with LIFO zones
    const palletItems = orders.map((ord, idx) => {
      const isFinal = idx === 0; // Loaded in nose for the final drop
      return {
        description: `Consolidated Freight (${ord.shipper || 'LTL Commercial'})`,
        pallets: ord.pallets || 1,
        length_in: 48,
        width_in: 40,
        height_in: 50,
        weight_lbs_each: Math.round(ord.weight_lbs / (ord.pallets || 1)),
        stackable: true,
        trailer_zone: isFinal ? 'NOSE' : (idx === orders.length - 1 ? 'TAIL' : 'CENTER'),
        drop_sequence: stops.length - idx
      };
    });

    const manifestNumber = 'MAN-2026-' + Math.floor(1000 + Math.random() * 9000);
    const hash = 'HASH-' + manifestNumber + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const intermediateStops = Math.max(0, stops.length - 2);
    const stopFees = intermediateStops * 100;
    const baseLinehaul = parseFloat(p.carrier_target_pay) - stopFees > 0 
      ? parseFloat(p.carrier_target_pay) - stopFees 
      : 1800;

    const manifestRes = await pool.query(`
      INSERT INTO multistop_manifests (
        manifest_number, equipment_type, trailer_number, driver_name,
        total_weight_lbs, max_weight_lbs, weight_utilization_pct,
        total_cubic_ft, max_cubic_ft, cube_utilization_pct,
        linear_feet_used, total_pallets, load_limiting_factor, density_lbs_pcf, ltl_freight_class,
        total_stops, direct_miles, sequenced_miles, oor_miles, oor_pct, route_efficiency,
        base_linehaul_rate, stop_off_fees, total_manifest_rate, status,
        stops_data, pallet_items_data, verification_hash, notes
      ) VALUES (
        $1, $2, 'TRL-CONSOL-53', 'Fleet Dispatch Operator',
        $3, 45000, $4,
        $5, 4050, $6,
        $7, $8, 'BALANCED', 14.50, 'CLASS_85',
        $9, 520, 560, 40, 7.69, 'OPTIMAL',
        $10, $11, $12, 'PLANNED',
        $13, $14, $15, $16
      ) RETURNING *
    `, [
      manifestNumber, p.equipment_type,
      p.total_weight_lbs, p.weight_utilization_pct,
      p.total_cubic_ft, p.cube_utilization_pct,
      Math.ceil(p.total_pallets / 2) * 4, p.total_pallets,
      stops.length,
      baseLinehaul, stopFees, p.carrier_target_pay,
      JSON.stringify(stops), JSON.stringify(palletItems), hash,
      `Converted from LTL Consolidation Pool ${p.pool_number} (${p.corridor_name}). Total Shipper Rev: $${p.total_shipper_revenue}, Carrier Pay: $${p.carrier_target_pay}, Margin: $${p.gross_profit_margin} (${p.margin_pct}%).`
    ]);

    const createdManifest = manifestRes.rows[0];

    // Update pool status to CONVERTED_TO_MANIFEST
    await pool.query(`
      UPDATE ltl_consolidation_pools
      SET status = 'CONVERTED_TO_MANIFEST',
          converted_manifest_id = $1,
          updated_at = now()
      WHERE id = $2
    `, [createdManifest.id, p.id]);

    auditLog(
      req.user ? req.user.id : null,
      'CONVERT_LTL_POOL_TO_MANIFEST',
      `Converted LTL pool ${p.pool_number} into multi-stop manifest ${manifestNumber}`,
      getClientIp(req)
    );

    return res.json({
      success: true,
      message: `Pool ${p.pool_number} successfully converted to Multi-Stop Manifest ${manifestNumber}.`,
      manifest: createdManifest
    });
  } catch (err) {
    console.error('Error converting LTL pool to manifest:', err);
    return res.status(500).json({ error: 'Failed to convert LTL pool to manifest.' });
  }
});

module.exports = router;
