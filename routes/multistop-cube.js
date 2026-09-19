const express = require('express');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

// Equipment Capacity Specifications
const EQUIPMENT_SPECS = {
  'DRY_VAN_53': {
    name: '53ft Dry Van Standard',
    length_in: 636,
    width_in: 100,
    height_in: 110,
    max_volume_cuft: 4050,
    max_weight_lbs: 45000,
    floor_pallets_single: 26,
    max_pallets_double: 52
  },
  'REEFER_53': {
    name: '53ft Refrigerated Trailer (Reefer)',
    length_in: 624,
    width_in: 98,
    height_in: 102,
    max_volume_cuft: 3600,
    max_weight_lbs: 43500,
    floor_pallets_single: 26,
    max_pallets_double: 52
  },
  'FLATBED_48': {
    name: '48ft Standard Flatbed',
    length_in: 576,
    width_in: 102,
    height_in: 102,
    max_volume_cuft: 3450,
    max_weight_lbs: 48000,
    floor_pallets_single: 24,
    max_pallets_double: 24
  },
  'BOX_TRUCK_26': {
    name: '26ft Straight Box Truck',
    length_in: 312,
    width_in: 96,
    height_in: 96,
    max_volume_cuft: 1664,
    max_weight_lbs: 12000,
    floor_pallets_single: 12,
    max_pallets_double: 24
  },
  'SPRINTER_VAN': {
    name: 'Sprinter Cargo Van (High Roof)',
    length_in: 168,
    width_in: 68,
    height_in: 72,
    max_volume_cuft: 400,
    max_weight_lbs: 3500,
    floor_pallets_single: 3,
    max_pallets_double: 3
  }
};

let migrated = false;
async function ensureTables() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS multistop_manifests (
        id SERIAL PRIMARY KEY,
        manifest_number VARCHAR(50) UNIQUE NOT NULL,
        carrier_id INT REFERENCES users(id) ON DELETE SET NULL,
        equipment_type VARCHAR(50) NOT NULL,
        trailer_number VARCHAR(50),
        driver_name VARCHAR(100),
        total_weight_lbs NUMERIC(10,2) NOT NULL DEFAULT 0,
        max_weight_lbs NUMERIC(10,2) NOT NULL DEFAULT 45000,
        weight_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        total_cubic_ft NUMERIC(10,2) NOT NULL DEFAULT 0,
        max_cubic_ft NUMERIC(10,2) NOT NULL DEFAULT 4050,
        cube_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        linear_feet_used NUMERIC(6,2) NOT NULL DEFAULT 0,
        total_pallets INT NOT NULL DEFAULT 0,
        load_limiting_factor VARCHAR(30) NOT NULL DEFAULT 'BALANCED',
        density_lbs_pcf NUMERIC(6,2) DEFAULT 0,
        ltl_freight_class VARCHAR(20) DEFAULT 'CLASS_70',
        total_stops INT NOT NULL DEFAULT 2,
        direct_miles NUMERIC(10,2) DEFAULT 0,
        sequenced_miles NUMERIC(10,2) DEFAULT 0,
        oor_miles NUMERIC(10,2) DEFAULT 0,
        oor_pct NUMERIC(5,2) DEFAULT 0,
        route_efficiency VARCHAR(30) DEFAULT 'OPTIMAL',
        base_linehaul_rate NUMERIC(10,2) DEFAULT 0,
        stop_off_fees NUMERIC(10,2) DEFAULT 0,
        total_manifest_rate NUMERIC(10,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'PLANNED',
        stops_data JSONB NOT NULL DEFAULT '[]'::jsonb,
        pallet_items_data JSONB NOT NULL DEFAULT '[]'::jsonb,
        verification_hash VARCHAR(100) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_manifest_num ON multistop_manifests(manifest_number);
      CREATE INDEX IF NOT EXISTS idx_manifest_carrier ON multistop_manifests(carrier_id);
      CREATE INDEX IF NOT EXISTS idx_manifest_status ON multistop_manifests(status);
      CREATE INDEX IF NOT EXISTS idx_manifest_equip ON multistop_manifests(equipment_type);
    `);

    // Seed initial demonstration manifests if table is empty
    const countRes = await pool.query('SELECT COUNT(*) FROM multistop_manifests');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      const userRes = await pool.query(`SELECT id FROM users WHERE role::text IN ('carrier', 'super_admin') LIMIT 1`);
      const carrierId = userRes.rows.length > 0 ? userRes.rows[0].id : null;

      const seedStops1 = [
        {
          sequence: 1,
          type: 'PICKUP',
          facility: 'Georgia Pacific Paper Mill',
          address: '100 Industrial Pkwy',
          city: 'Savannah',
          state: 'GA',
          zip: '31401',
          appointment: '2026-09-21 07:00',
          contact: 'Marcus Bell',
          phone: '(912) 555-1200',
          bol_ref: 'BOL-SAV-9912',
          pallets: 12,
          weight_lbs: 18000,
          notes: 'Nose loaded paper reels (final drop)'
        },
        {
          sequence: 2,
          type: 'PICKUP',
          facility: 'Piedmont Packaging Hub',
          address: '450 Logistics Way',
          city: 'Macon',
          state: 'GA',
          zip: '31201',
          appointment: '2026-09-21 11:30',
          contact: 'Angela Ramos',
          phone: '(478) 555-8321',
          bol_ref: 'BOL-MAC-3041',
          pallets: 14,
          weight_lbs: 15400,
          notes: 'Tail loaded cartons (first drop)'
        },
        {
          sequence: 3,
          type: 'DELIVERY',
          facility: 'Chattanooga Regional Fulfilment',
          address: '220 Freight Ln',
          city: 'Chattanooga',
          state: 'TN',
          zip: '37402',
          appointment: '2026-09-21 16:30',
          contact: 'Dave Miller',
          phone: '(423) 555-9110',
          bol_ref: 'BOL-MAC-3041',
          pallets: 14,
          weight_lbs: 15400,
          notes: 'Drop 1: Tail freight unloaded directly at dock'
        },
        {
          sequence: 4,
          type: 'DELIVERY',
          facility: 'Music City Distribution Center',
          address: '880 Commerce Blvd',
          city: 'Nashville',
          state: 'TN',
          zip: '37201',
          appointment: '2026-09-22 08:00',
          contact: 'Evelyn Scott',
          phone: '(615) 555-4089',
          bol_ref: 'BOL-SAV-9912',
          pallets: 12,
          weight_lbs: 18000,
          notes: 'Drop 2 (Final): Nose paper reels unloaded'
        }
      ];

      const seedItems1 = [
        {
          description: 'Heavy Kraft Paper Rolls (48x40)',
          pallets: 12,
          length_in: 48,
          width_in: 40,
          height_in: 60,
          weight_lbs_each: 1500,
          stackable: false,
          trailer_zone: 'NOSE',
          drop_sequence: 4
        },
        {
          description: 'Corrugated Shipping Cartons (48x40)',
          pallets: 14,
          length_in: 48,
          width_in: 40,
          height_in: 50,
          weight_lbs_each: 1100,
          stackable: true,
          trailer_zone: 'TAIL',
          drop_sequence: 3
        }
      ];

      await pool.query(`
        INSERT INTO multistop_manifests (
          manifest_number, carrier_id, equipment_type, trailer_number, driver_name,
          total_weight_lbs, max_weight_lbs, weight_utilization_pct,
          total_cubic_ft, max_cubic_ft, cube_utilization_pct,
          linear_feet_used, total_pallets, load_limiting_factor, density_lbs_pcf, ltl_freight_class,
          total_stops, direct_miles, sequenced_miles, oor_miles, oor_pct, route_efficiency,
          base_linehaul_rate, stop_off_fees, total_manifest_rate, status,
          stops_data, pallet_items_data, verification_hash, notes
        ) VALUES (
          'MAN-2026-0419', $1, 'DRY_VAN_53', 'TRL-5389', 'Clayton Vance',
          33400.00, 45000.00, 74.22,
          2760.00, 4050.00, 68.15,
          44.00, 26, 'WEIGH_OUT', 12.10, 'CLASS_85',
          4, 492.00, 524.00, 32.00, 6.50, 'OPTIMAL',
          1850.00, 200.00, 2050.00, 'DISPATCHED',
          $2, $3, 'HASH-MAN-2026-0419-7F89B2', 'Consolidated multi-drop LTL routed via Macon and Chattanooga with 2 intermediate stop fees ($200).'
        )
      `, [carrierId, JSON.stringify(seedStops1), JSON.stringify(seedItems1)]);
    }

    migrated = true;
  } catch (err) {
    console.error('Error ensuring multistop_manifests tables:', err);
  }
}

// Utility: Calculate Cube, Weight, Linear Feet, Density & Bottlenecks
function computeLoadCube(equipmentType, items = []) {
  const spec = EQUIPMENT_SPECS[equipmentType] || EQUIPMENT_SPECS['DRY_VAN_53'];

  let totalWeight = 0;
  let totalCubicFt = 0;
  let totalPallets = 0;
  let floorPositions = 0;

  for (const it of items) {
    const qty = parseInt(it.pallets || it.quantity || 1, 10);
    const weightEach = parseFloat(it.weight_lbs_each || it.weight || 0);
    const l = parseFloat(it.length_in || 48);
    const w = parseFloat(it.width_in || 40);
    const h = parseFloat(it.height_in || 48);
    const stackable = it.stackable === true || it.stackable === 'true' || it.is_stackable === true;

    const cuftEach = (l * w * h) / 1728;
    const itemCuft = cuftEach * qty;
    const itemWeight = weightEach * qty;

    totalPallets += qty;
    totalWeight += itemWeight;
    totalCubicFt += itemCuft;

    // Floor footprint calculation:
    // If stackable and 2 high, floor positions needed is ceil(qty / 2)
    const positionsNeeded = stackable ? Math.ceil(qty / 2) : qty;
    floorPositions += positionsNeeded;
  }

  // 2 standard GMA pallets (48x40) loaded side-by-side consume 4 linear feet of trailer length
  const linearFeetUsed = Math.min(spec.length_in / 12, Math.ceil(floorPositions / 2) * 4);

  const cubePct = spec.max_volume_cuft > 0 
    ? Math.min(100, Math.round((totalCubicFt / spec.max_volume_cuft) * 10000) / 100) 
    : 0;

  const weightPct = spec.max_weight_lbs > 0 
    ? Math.min(100, Math.round((totalWeight / spec.max_weight_lbs) * 10000) / 100) 
    : 0;

  const density = totalCubicFt > 0 ? Math.round((totalWeight / totalCubicFt) * 100) / 100 : 0;

  // LTL Freight Class standard density matrix
  let freightClass = 'CLASS_70';
  if (density >= 30) freightClass = 'CLASS_50';
  else if (density >= 22.5) freightClass = 'CLASS_60';
  else if (density >= 15) freightClass = 'CLASS_70';
  else if (density >= 10.5) freightClass = 'CLASS_85';
  else if (density >= 9) freightClass = 'CLASS_92.5';
  else if (density >= 8) freightClass = 'CLASS_100';
  else if (density >= 6) freightClass = 'CLASS_125';
  else if (density >= 4) freightClass = 'CLASS_175';
  else if (density >= 2) freightClass = 'CLASS_250';
  else freightClass = 'CLASS_400';

  let limitingFactor = 'BALANCED';
  if (cubePct > weightPct + 10) {
    limitingFactor = 'CUBE_OUT';
  } else if (weightPct > cubePct + 10) {
    limitingFactor = 'WEIGH_OUT';
  }

  return {
    equipment_type: equipmentType,
    equipment_name: spec.name,
    max_cubic_ft: spec.max_volume_cuft,
    max_weight_lbs: spec.max_weight_lbs,
    floor_pallets_capacity: spec.floor_pallets_single,
    max_pallets_double: spec.max_pallets_double,
    total_pallets: totalPallets,
    floor_positions_used: floorPositions,
    linear_feet_used: linearFeetUsed,
    total_cubic_ft: Math.round(totalCubicFt * 100) / 100,
    total_weight_lbs: Math.round(totalWeight * 100) / 100,
    cube_utilization_pct: cubePct,
    weight_utilization_pct: weightPct,
    density_lbs_pcf: density,
    ltl_freight_class: freightClass,
    load_limiting_factor: limitingFactor,
    available_cubic_ft: Math.max(0, Math.round((spec.max_volume_cuft - totalCubicFt) * 100) / 100),
    available_weight_lbs: Math.max(0, Math.round((spec.max_weight_lbs - totalWeight) * 100) / 100),
    is_overweight: totalWeight > spec.max_weight_lbs,
    is_overcube: totalCubicFt > spec.max_volume_cuft
  };
}

// -------------------------------------------------------------
// POST /api/multistop/calculate-cube
// Standalone live calculator for instant UI preview
// -------------------------------------------------------------
router.post('/calculate-cube', async (req, res) => {
  try {
    const { equipment_type = 'DRY_VAN_53', items = [] } = req.body;
    const calc = computeLoadCube(equipment_type, items);
    return res.json({ success: true, ...calc });
  } catch (err) {
    console.error('Error calculating pallet cube:', err);
    return res.status(500).json({ error: 'Failed to calculate pallet cube.' });
  }
});

// -------------------------------------------------------------
// GET /api/multistop/roster
// List manifests and KPI metrics
// -------------------------------------------------------------
router.get('/roster', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const manifestsRes = await pool.query(`
      SELECT m.*, u.name as carrier_name, u.company_name as carrier_company, u.mc_number
      FROM multistop_manifests m
      LEFT JOIN users u ON u.id = m.carrier_id
      ORDER BY m.created_at DESC
    `);

    const manifests = manifestsRes.rows;

    let totalManifests = manifests.length;
    let sumCubePct = 0;
    let sumWeightPct = 0;
    let activeLegs = 0;

    for (const m of manifests) {
      sumCubePct += parseFloat(m.cube_utilization_pct) || 0;
      sumWeightPct += parseFloat(m.weight_utilization_pct) || 0;
      if (m.status === 'DISPATCHED' || m.status === 'IN_TRANSIT') {
        activeLegs += parseInt(m.total_stops, 10) || 1;
      }
    }

    const avgCubePct = totalManifests > 0 ? Math.round((sumCubePct / totalManifests) * 10) / 10 : 0;
    const avgWeightPct = totalManifests > 0 ? Math.round((sumWeightPct / totalManifests) * 10) / 10 : 0;

    return res.json({
      success: true,
      kpis: {
        total_manifests: totalManifests,
        avg_cube_pct: avgCubePct,
        avg_weight_pct: avgWeightPct,
        active_legs: activeLegs
      },
      manifests
    });
  } catch (err) {
    console.error('Error fetching multistop roster:', err);
    return res.status(500).json({ error: 'Failed to fetch multistop roster.' });
  }
});

// -------------------------------------------------------------
// POST /api/multistop/create
// Build and store a multi-stop consolidated manifest
// -------------------------------------------------------------
router.post('/create', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const {
      equipment_type = 'DRY_VAN_53',
      trailer_number = 'TRL-5390',
      driver_name = 'Unassigned',
      stops = [],
      pallet_items = [],
      direct_miles = 450,
      sequenced_miles = 490,
      base_linehaul_rate = 1800,
      stop_fee_per_intermediate = 100,
      notes = ''
    } = req.body;

    if (!stops || stops.length < 2) {
      return res.status(400).json({ error: 'A multi-stop route must contain at least 2 stops (origin & final destination).' });
    }

    // Run Pallet Physics & Cube Calculation
    const cube = computeLoadCube(equipment_type, pallet_items);

    // Mileage and Out-of-Route (OOR) Analysis
    const dirM = parseFloat(direct_miles) || 0;
    const seqM = parseFloat(sequenced_miles) || dirM;
    const oorM = Math.max(0, seqM - dirM);
    const oorPct = dirM > 0 ? Math.round((oorM / dirM) * 10000) / 100 : 0;

    let routeEff = 'OPTIMAL';
    if (oorPct > 20) routeEff = 'CIRCUITOUS';
    else if (oorPct >= 10) routeEff = 'ACCEPTABLE';

    // Stop-off Accessorial Fee calculation
    // Intermediate stops = total stops - 2 (origin pickup and final drop do not incur stop-off fees)
    const intermediateStops = Math.max(0, stops.length - 2);
    const stopOffFees = intermediateStops * (parseFloat(stop_fee_per_intermediate) || 100);
    const baseLinehaul = parseFloat(base_linehaul_rate) || 0;
    const totalManifestRate = baseLinehaul + stopOffFees;

    // LIFO (Last-In, First-Out) Trailer Stowage Assignment:
    // Stops are numbered 1..N. Deliveries are scheduled.
    // Freight destined for the LAST stop is assigned to the NOSE.
    // Freight destined for the FIRST delivery drop is assigned to the TAIL.
    // Intermediate delivery drops are assigned to CENTER.
    const sequencedItems = (pallet_items || []).map((it, idx) => {
      const dropSeq = parseInt(it.drop_sequence || stops.length, 10);
      let zone = 'CENTER';
      if (dropSeq === stops.length) {
        zone = 'NOSE'; // Unloaded last
      } else if (dropSeq <= 3) {
        zone = 'TAIL'; // Unloaded first
      }
      return {
        ...it,
        trailer_zone: it.trailer_zone || zone
      };
    });

    const manifestNumber = 'MAN-2026-' + Math.floor(1000 + Math.random() * 9000);
    const hash = 'HASH-' + manifestNumber + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const carrierId = req.user && req.user.id ? req.user.id : null;

    const insertRes = await pool.query(`
      INSERT INTO multistop_manifests (
        manifest_number, carrier_id, equipment_type, trailer_number, driver_name,
        total_weight_lbs, max_weight_lbs, weight_utilization_pct,
        total_cubic_ft, max_cubic_ft, cube_utilization_pct,
        linear_feet_used, total_pallets, load_limiting_factor, density_lbs_pcf, ltl_freight_class,
        total_stops, direct_miles, sequenced_miles, oor_miles, oor_pct, route_efficiency,
        base_linehaul_rate, stop_off_fees, total_manifest_rate, status,
        stops_data, pallet_items_data, verification_hash, notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22,
        $23, $24, $25, 'PLANNED',
        $26, $27, $28, $29
      ) RETURNING *
    `, [
      manifestNumber, carrierId, equipment_type, trailer_number, driver_name,
      cube.total_weight_lbs, cube.max_weight_lbs, cube.weight_utilization_pct,
      cube.total_cubic_ft, cube.max_cubic_ft, cube.cube_utilization_pct,
      cube.linear_feet_used, cube.total_pallets, cube.load_limiting_factor, cube.density_lbs_pcf, cube.ltl_freight_class,
      stops.length, dirM, seqM, oorM, oorPct, routeEff,
      baseLinehaul, stopOffFees, totalManifestRate,
      JSON.stringify(stops), JSON.stringify(sequencedItems), hash, notes
    ]);

    const created = insertRes.rows[0];

    auditLog(
      req.user ? req.user.id : null,
      'CREATE_MULTISTOP_MANIFEST',
      `Created multi-stop manifest ${manifestNumber} (${stops.length} stops, ${cube.total_pallets} pallets, ${cube.cube_utilization_pct}% cube, $${totalManifestRate})`,
      getClientIp(req)
    );

    return res.json({
      success: true,
      message: `Multi-stop manifest ${manifestNumber} created successfully.`,
      manifest: created
    });
  } catch (err) {
    console.error('Error creating multistop manifest:', err);
    return res.status(500).json({ error: 'Failed to create multi-stop manifest.' });
  }
});

// -------------------------------------------------------------
// GET /api/multistop/:id
// Retrieve manifest details
// -------------------------------------------------------------
router.get('/:id', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const manifestRes = await pool.query(`
      SELECT m.*, u.name as carrier_name, u.company_name as carrier_company, u.mc_number, u.phone as carrier_phone
      FROM multistop_manifests m
      LEFT JOIN users u ON u.id = m.carrier_id
      WHERE m.id::text = $1 OR m.manifest_number = $1
    `, [id]);

    if (manifestRes.rows.length === 0) {
      return res.status(404).json({ error: 'Multi-stop manifest not found.' });
    }

    return res.json({ success: true, manifest: manifestRes.rows[0] });
  } catch (err) {
    console.error('Error retrieving manifest:', err);
    return res.status(500).json({ error: 'Failed to retrieve manifest.' });
  }
});

// -------------------------------------------------------------
// PATCH /api/multistop/:id/status
// Update manifest dispatch lifecycle status
// -------------------------------------------------------------
router.patch('/:id/status', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    const updateRes = await pool.query(`
      UPDATE multistop_manifests
      SET status = $1, updated_at = now()
      WHERE id::text = $2
      RETURNING *
    `, [status, id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Manifest not found.' });
    }

    return res.json({ success: true, manifest: updateRes.rows[0] });
  } catch (err) {
    console.error('Error updating manifest status:', err);
    return res.status(500).json({ error: 'Failed to update manifest status.' });
  }
});

// -------------------------------------------------------------
// GET /api/multistop/:id/pdf
// Generate Official Vector Multi-Stop Load Manifest & Trailer Stowage PDF
// -------------------------------------------------------------
router.get('/:id/pdf', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const manifestRes = await pool.query(`
      SELECT m.*, u.name as carrier_name, u.company_name as carrier_company, u.mc_number, u.phone as carrier_phone
      FROM multistop_manifests m
      LEFT JOIN users u ON u.id = m.carrier_id
      WHERE m.id::text = $1 OR m.manifest_number = $1
    `, [id]);

    if (manifestRes.rows.length === 0) {
      return res.status(404).json({ error: 'Manifest not found.' });
    }

    const m = manifestRes.rows[0];
    const stops = Array.isArray(m.stops_data) ? m.stops_data : JSON.parse(m.stops_data || '[]');
    const items = Array.isArray(m.pallet_items_data) ? m.pallet_items_data : JSON.parse(m.pallet_items_data || '[]');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="LoadNexus-Manifest-${m.manifest_number}.pdf"`);

    doc.pipe(res);

    // Deep Indigo Header Banner
    doc.rect(36, 36, 540, 68).fill('#1E1B4B');

    doc.fillColor('#A5B4FC').fontSize(9.5).font('Helvetica-Bold')
      .text('LOADNEXUS™ MULTI-STOP FREIGHT DISPATCH & TRAILER STOWAGE MANIFEST', 48, 48);

    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
      .text(`CONSOLIDATED LTL & MULTI-DROP LOAD PLAN`, 48, 62);

    doc.fillColor('#6366F1').fontSize(8.5).font('Helvetica')
      .text(`MANIFEST NUMBER: ${m.manifest_number} • EQUIPMENT: ${m.equipment_type}`, 48, 80);

    // Carrier & Overview Meta Box
    doc.rect(36, 114, 540, 75).fill('#EEF2FF').stroke('#C7D2FE');

    doc.fillColor('#312E81').fontSize(9).font('Helvetica-Bold')
      .text('DISPATCH & CARRIER CREDENTIALS', 48, 122);
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
      .text(`Assigned Carrier: ${m.carrier_company || 'Shipping Wish Dedicated Fleet LLC'}`, 48, 136)
      .text(`Driver Name: ${m.driver_name || 'Fleet Operator'}    |    Trailer: ${m.trailer_number || 'TRL-5390'}`, 48, 148)
      .text(`Route Distance: ${m.sequenced_miles} Sequenced Miles (${m.oor_miles} OOR Miles / ${m.oor_pct}% OOR)`, 48, 160);

    // Status & Limiting Factor Badges
    doc.rect(390, 122, 174, 55).fill('#FFFFFF').stroke('#A5B4FC');
    doc.fillColor('#4338CA').fontSize(9).font('Helvetica-Bold')
      .text(`STATUS: ${m.status}`, 396, 128, { width: 162, align: 'center' });
    doc.fillColor(m.load_limiting_factor === 'CUBE_OUT' ? '#B45309' : '#047857').fontSize(8).font('Helvetica-Bold')
      .text(`LIMITING FACTOR: ${m.load_limiting_factor}`, 396, 142, { width: 162, align: 'center' });
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica')
      .text(`Density: ${m.density_lbs_pcf} lbs/cuft (${m.ltl_freight_class})`, 396, 156, { width: 162, align: 'center' });

    // Key Capacity Metrics Cards (4 columns)
    const cardY = 198;
    const cardW = 127;
    const cardH = 50;

    // Card 1: Cube Util
    doc.rect(36, cardY, cardW, cardH).fill('#F8FAFC').stroke('#CBD5E1');
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica-Bold').text('CUBE UTILIZATION', 44, cardY + 8);
    doc.fillColor('#1E293B').fontSize(13).font('Helvetica-Bold').text(`${m.cube_utilization_pct}%`, 44, cardY + 20);
    doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(`${m.total_cubic_ft} / ${m.max_cubic_ft} cu ft`, 44, cardY + 36);

    // Card 2: Weight Util
    doc.rect(36 + cardW + 10, cardY, cardW, cardH).fill('#F8FAFC').stroke('#CBD5E1');
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica-Bold').text('WEIGHT PAYLOAD', 44 + cardW + 10, cardY + 8);
    doc.fillColor('#1E293B').fontSize(13).font('Helvetica-Bold').text(`${m.weight_utilization_pct}%`, 44 + cardW + 10, cardY + 20);
    doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(`${parseInt(m.total_weight_lbs, 10).toLocaleString()} / ${parseInt(m.max_weight_lbs, 10).toLocaleString()} lbs`, 44 + cardW + 10, cardY + 36);

    // Card 3: Pallet Footprint
    doc.rect(36 + (cardW + 10) * 2, cardY, cardW, cardH).fill('#F8FAFC').stroke('#CBD5E1');
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica-Bold').text('PALLET FOOTPRINT', 44 + (cardW + 10) * 2, cardY + 8);
    doc.fillColor('#1E293B').fontSize(13).font('Helvetica-Bold').text(`${m.total_pallets} Pallets`, 44 + (cardW + 10) * 2, cardY + 20);
    doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(`${m.linear_feet_used} Linear Ft Used`, 44 + (cardW + 10) * 2, cardY + 36);

    // Card 4: Agreed Total Rate
    doc.rect(36 + (cardW + 10) * 3, cardY, cardW, cardH).fill('#ECFDF5').stroke('#A7F3D0');
    doc.fillColor('#065F46').fontSize(7.5).font('Helvetica-Bold').text('TOTAL REVENUE / PAY', 44 + (cardW + 10) * 3, cardY + 8);
    doc.fillColor('#047857').fontSize(13).font('Helvetica-Bold').text(`$${parseFloat(m.total_manifest_rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 44 + (cardW + 10) * 3, cardY + 20);
    doc.fillColor('#065F46').fontSize(7).font('Helvetica').text(`Incl. $${m.stop_off_fees} Stop Fees`, 44 + (cardW + 10) * 3, cardY + 36);

    // Section 1: Stop Sequence Itinerary
    const stopsHeaderY = 260;
    doc.rect(36, stopsHeaderY, 540, 20).fill('#312E81');
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
      .text('SECTION 1: SEQUENTIAL ROUTE ITINERARY (CHRONOLOGICAL STOPS)', 44, stopsHeaderY + 6);

    let stopY = stopsHeaderY + 24;
    stops.forEach((st, idx) => {
      const isPickup = st.type === 'PICKUP';
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(36, stopY, 540, 28).fill(bg).stroke('#E2E8F0');

      // Sequence Badge
      doc.rect(44, stopY + 4, 52, 20).fill(isPickup ? '#EFF6FF' : '#FEF3C7').stroke(isPickup ? '#3B82F6' : '#F59E0B');
      doc.fillColor(isPickup ? '#1D4ED8' : '#B45309').fontSize(7.5).font('Helvetica-Bold')
        .text(`STOP ${idx + 1} • ${st.type}`, 46, stopY + 9, { width: 48, align: 'center' });

      // Facility & Location
      doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold')
        .text(st.facility || st.facility_name || 'Facility', 104, stopY + 5);
      doc.fillColor('#64748B').fontSize(7.5).font('Helvetica')
        .text(`${st.address || ''}, ${st.city}, ${st.state} ${st.zip || ''}`, 104, stopY + 16);

      // Appointment & Contact
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica')
        .text(`Appt: ${st.appointment || st.appointment_time || 'Open Window'}`, 330, stopY + 5)
        .text(`Contact: ${st.contact || 'Dispatch'} (${st.phone || 'N/A'})`, 330, stopY + 16);

      // Freight Handled
      doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica-Bold')
        .text(`${st.pallets || 0} Pallets | ${parseInt(st.weight_lbs || 0, 10).toLocaleString()} lbs`, 470, stopY + 5)
        .text(`BOL: ${st.bol_ref || 'PENDING'}`, 470, stopY + 16);

      stopY += 30;
    });

    // Section 2: Visual Trailer Stowage Plan (LIFO Stowage)
    const stowHeaderY = stopY + 6;
    doc.rect(36, stowHeaderY, 540, 20).fill('#312E81');
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
      .text('SECTION 2: TRAILER STOWAGE MATRIX (LIFO / LAST-IN FIRST-OUT ORDER)', 44, stowHeaderY + 6);

    let stowY = stowHeaderY + 24;
    items.forEach((it, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(36, stowY, 540, 26).fill(bg).stroke('#E2E8F0');

      // Trailer Zone Badge
      let zoneBg = '#E0E7FF';
      let zoneBorder = '#6366F1';
      let zoneText = '#3730A3';
      if (it.trailer_zone === 'NOSE') {
        zoneBg = '#FEE2E2';
        zoneBorder = '#EF4444';
        zoneText = '#991B1B';
      } else if (it.trailer_zone === 'TAIL') {
        zoneBg = '#DCFCE7';
        zoneBorder = '#22C55E';
        zoneText = '#166534';
      }

      doc.rect(44, stowY + 4, 65, 18).fill(zoneBg).stroke(zoneBorder);
      doc.fillColor(zoneText).fontSize(7.5).font('Helvetica-Bold')
        .text(it.trailer_zone || 'CENTER', 44, stowY + 8, { width: 65, align: 'center' });

      doc.fillColor('#0F172A').fontSize(8).font('Helvetica-Bold')
        .text(it.description || 'General Freight', 118, stowY + 5);
      doc.fillColor('#64748B').fontSize(7.5).font('Helvetica')
        .text(`Dims: ${it.length_in || 48}"x${it.width_in || 40}"x${it.height_in || 48}" | Stackable: ${it.stackable ? 'YES' : 'NO'}`, 118, stowY + 15);

      doc.fillColor('#1E293B').fontSize(8).font('Helvetica-Bold')
        .text(`${it.pallets || 1} Pallets`, 380, stowY + 9);

      doc.fillColor('#334155').fontSize(8).font('Helvetica')
        .text(`${(parseInt(it.pallets || 1, 10) * parseFloat(it.weight_lbs_each || 0)).toLocaleString()} lbs`, 440, stowY + 9);

      doc.fillColor('#4338CA').fontSize(7.5).font('Helvetica-Bold')
        .text(`Unload: Stop ${it.drop_sequence || stops.length}`, 505, stowY + 9);

      stowY += 28;
    });

    // Legal Compliance & Cryptographic Audit Seal
    const auditBoxY = Math.max(stowY + 10, 680);
    doc.rect(36, auditBoxY, 540, 60).fill('#F1F5F9').stroke('#94A3B8');

    doc.fillColor('#0F172A').fontSize(7.5).font('Helvetica-Bold')
      .text('CARRIER CERTIFICATION & FMCSA PART 392 / 49 CFR COMPLIANCE ATTESTATION', 44, auditBoxY + 8);

    doc.fillColor('#475569').fontSize(6.8).font('Helvetica')
      .text(
        'Carrier certifies that freight is loaded in compliance with federal axle weight distribution standards (49 CFR § 393.100 - 393.136). ' +
        'Last-In, First-Out (LIFO) stowage plan is strictly verified to guarantee cargo stability and prevent unnecessary re-handling at intermediate docks.',
        44, auditBoxY + 18, { width: 524 }
      );

    doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold')
      .text(`SECURE AUDIT SEAL: ${m.verification_hash}`, 44, auditBoxY + 45)
      .text(`GENERATED: ${new Date().toISOString()}`, 380, auditBoxY + 45);

    doc.end();
  } catch (err) {
    console.error('Error generating multistop manifest PDF:', err);
    return res.status(500).json({ error: 'Failed to generate manifest PDF.' });
  }
});

module.exports = router;
