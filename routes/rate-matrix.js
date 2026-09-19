/**
 * routes/rate-matrix.js
 * LoadNexus™ Phase 26: Enterprise Shipper Rate Matrix & Instant Contract RFP Bidding Engine
 * 
 * Capabilities:
 * - 5-Band Mileage Pricing Engine (Short-Haul Flat Min, Regional, Intermediate, Long-Haul, Transcon)
 * - Equipment Surcharge Multipliers (Dry Van, Reefer, Flatbed, Step Deck, Conestoga)
 * - EIA/DOE National On-Highway Diesel Fuel Surcharge (FSC) formula pegging
 * - High-Volume Contract Commitment Discount Tiers (>=10 loads/wk, >=20 loads/wk)
 * - Instant Multi-Lane Contract Quoting & Annual Pipeline Valuation ($/yr run-rate)
 * - Multi-Lane Formal Shipper RFP Proposal Builder with Cryptographic SHA-256 Hashes
 * - Vector PDF Enterprise Shipper Contract Rate Proposal & SLA Agreement generator via PDFKit
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

// Audit logger helper
function auditLog(userId, action, details, ip) {
  pool.query(
    `INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)`,
    [userId, action, details, ip]
  ).catch(err => console.error('Audit log error in rate-matrix:', err.message));
}

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
}

// -------------------------------------------------------------
// Core Algorithmic Rating Engine Helpers
// -------------------------------------------------------------
const EQUIPMENT_MULTIPLIERS = {
  '53ft Dry Van': 1.00,
  '53ft Reefer': 1.22,
  '48ft Flatbed': 1.15,
  '53ft Flatbed': 1.18,
  'Step Deck': 1.28,
  'Conestoga': 1.32
};

function getMileageBand(miles) {
  const m = parseInt(miles, 10) || 0;
  if (m <= 100) return { band: 'SHORT_HAUL_MIN', label: 'Short-Haul (0 - 100 mi)', baseRpm: 4.85, minCharge: 550.00 };
  if (m <= 250) return { band: 'REGIONAL', label: 'Regional Metro (101 - 250 mi)', baseRpm: 3.85, minCharge: 750.00 };
  if (m <= 500) return { band: 'INTERMEDIATE', label: 'Intermediate Trunk (251 - 500 mi)', baseRpm: 3.15, minCharge: 1100.00 };
  if (m <= 1000) return { band: 'LONG_HAUL', label: 'Long-Haul (501 - 1,000 mi)', baseRpm: 2.65, minCharge: 1600.00 };
  return { band: 'TRANSCON', label: 'Transcontinental (1,001+ mi)', baseRpm: 2.25, minCharge: 2400.00 };
}

function calculateFuelSurcharge(dieselPrice = 3.85, basePeg = 1.20, mpg = 6.0) {
  const price = parseFloat(dieselPrice) || 3.85;
  const peg = parseFloat(basePeg) || 1.20;
  const m = parseFloat(mpg) || 6.0;
  if (price <= peg) return 0.000;
  return Math.round(((price - peg) / m) * 1000) / 1000; // $/mile
}

function calculateLaneRate(miles, equipmentType = '53ft Dry Van', weeklyVolume = 5, dieselPrice = 3.85) {
  const m = parseInt(miles, 10) || 100;
  const bandInfo = getMileageBand(m);
  const equipMult = EQUIPMENT_MULTIPLIERS[equipmentType] || 1.00;
  const vol = parseInt(weeklyVolume, 10) || 1;

  // Volume Commitment Discount
  let volDiscountPct = 0;
  if (vol >= 20) {
    volDiscountPct = 0.07; // 7% volume discount
  } else if (vol >= 10) {
    volDiscountPct = 0.04; // 4% volume discount
  }

  // Base Linehaul RPM adjusted
  const adjustedLinehaulRpm = Math.round((bandInfo.baseRpm * equipMult * (1 - volDiscountPct)) * 100) / 100;
  const fuelSurchargeCpm = calculateFuelSurcharge(dieselPrice, 1.20, 6.0);
  const allInRpm = Math.round((adjustedLinehaulRpm + fuelSurchargeCpm) * 100) / 100;

  // Total Load Charge
  let rawTotal = allInRpm * m;
  const totalPerLoad = Math.max(bandInfo.minCharge, Math.round(rawTotal * 100) / 100);
  const weeklyTotal = Math.round(totalPerLoad * vol * 100) / 100;
  const annualTotal = Math.round(weeklyTotal * 52 * 100) / 100;

  return {
    miles: m,
    mileage_band: bandInfo.band,
    band_label: bandInfo.label,
    equipment_type: equipmentType,
    equipment_multiplier: equipMult,
    weekly_volume: vol,
    volume_discount_pct: Math.round(volDiscountPct * 100),
    base_linehaul_rpm: adjustedLinehaulRpm,
    fuel_surcharge_cpm: fuelSurchargeCpm,
    all_in_rate_per_mile: allInRpm,
    min_charge: bandInfo.minCharge,
    total_rate_per_load: totalPerLoad,
    weekly_spend: weeklyTotal,
    annual_contract_value: annualTotal
  };
}

// Database Schema Initialization
let migrated = false;
async function ensureTables() {
  if (migrated) return;
  try {
    // 1. Enterprise Rate Matrix Lanes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS enterprise_rate_matrix_lanes (
        id SERIAL PRIMARY KEY,
        lane_code VARCHAR(60) UNIQUE NOT NULL,
        origin_city VARCHAR(100) NOT NULL,
        origin_state VARCHAR(10) NOT NULL,
        origin_zip VARCHAR(20),
        destination_city VARCHAR(100) NOT NULL,
        destination_state VARCHAR(10) NOT NULL,
        destination_zip VARCHAR(20),
        corridor_name VARCHAR(150),
        mileage INT NOT NULL,
        mileage_band VARCHAR(50) NOT NULL,
        equipment_type VARCHAR(50) DEFAULT '53ft Dry Van',
        base_linehaul_rpm NUMERIC(6,2) NOT NULL,
        fuel_surcharge_cpm NUMERIC(6,3) DEFAULT 0.442,
        all_in_rpm NUMERIC(6,2) NOT NULL,
        total_rate_per_load NUMERIC(10,2) NOT NULL,
        typical_transit_days INT DEFAULT 2,
        weekly_committed_volume INT DEFAULT 5,
        annual_contract_value NUMERIC(12,2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);

    // 2. Contract RFP Proposals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contract_rfp_proposals (
        id SERIAL PRIMARY KEY,
        proposal_code VARCHAR(60) UNIQUE NOT NULL,
        shipper_name VARCHAR(150) NOT NULL,
        shipper_contact VARCHAR(100) NOT NULL,
        shipper_email VARCHAR(150) NOT NULL,
        shipper_phone VARCHAR(50) NOT NULL,
        commodity VARCHAR(150) DEFAULT 'General Commercial Freight',
        effective_date DATE DEFAULT CURRENT_DATE,
        expiration_date DATE DEFAULT (CURRENT_DATE + INTERVAL '365 days'),
        fuel_peg_base NUMERIC(6,2) DEFAULT 1.20,
        current_fuel_price NUMERIC(6,2) DEFAULT 3.85,
        quoted_lanes JSONB NOT NULL,
        total_weekly_loads INT DEFAULT 10,
        annual_contract_value NUMERIC(12,2) NOT NULL,
        avg_rate_per_mile NUMERIC(6,2) NOT NULL,
        ontime_delivery_commitment_pct NUMERIC(5,2) DEFAULT 98.5,
        proposal_status VARCHAR(40) DEFAULT 'SUBMITTED_TO_SHIPPER',
        proposal_hash VARCHAR(100) NOT NULL,
        special_notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);

    // Seed benchmark lanes if empty
    const checkRes = await pool.query('SELECT COUNT(*) FROM enterprise_rate_matrix_lanes');
    if (parseInt(checkRes.rows[0].count, 10) === 0) {
      const benchmarkLanes = [
        {
          code: 'LANE-CHI-ATL-01', origCity: 'Chicago', origState: 'IL', origZip: '60608',
          destCity: 'Atlanta', destState: 'GA', destZip: '30336', corridor: 'Midwest to Southeast Express Corridor',
          miles: 715, equip: '53ft Dry Van', vol: 5
        },
        {
          code: 'LANE-DFW-LAX-02', origCity: 'Dallas', origState: 'TX', origZip: '75201',
          destCity: 'Los Angeles', destState: 'CA', destZip: '90001', corridor: 'I-10 / I-20 Southern Transcon Reefer',
          miles: 1435, equip: '53ft Reefer', vol: 4
        },
        {
          code: 'LANE-ABE-RIC-03', origCity: 'Allentown', origState: 'PA', origZip: '18101',
          destCity: 'Richmond', destState: 'VA', destZip: '23219', corridor: 'Mid-Atlantic I-95 Dedicated Shuttle',
          miles: 285, equip: '53ft Dry Van', vol: 8
        },
        {
          code: 'LANE-SAV-BNA-04', origCity: 'Savannah', origState: 'GA', origZip: '31401',
          destCity: 'Nashville', destState: 'TN', destZip: '37201', corridor: 'Port of Savannah Inbound Flatbed Corridor',
          miles: 490, equip: '48ft Flatbed', vol: 3
        },
        {
          code: 'LANE-MKE-ORD-05', origCity: 'Milwaukee', origState: 'WI', origZip: '53202',
          destCity: 'Chicago', destState: 'IL', destZip: '60666', corridor: 'Great Lakes High-Frequency Cross-Metro Shuttle',
          miles: 92, equip: '53ft Dry Van', vol: 12
        }
      ];

      for (const lane of benchmarkLanes) {
        const quote = calculateLaneRate(lane.miles, lane.equip, lane.vol, 3.85);
        const transitDays = Math.max(1, Math.ceil(lane.miles / 500));
        await pool.query(`
          INSERT INTO enterprise_rate_matrix_lanes (
            lane_code, origin_city, origin_state, origin_zip,
            destination_city, destination_state, destination_zip, corridor_name,
            mileage, mileage_band, equipment_type, base_linehaul_rpm, fuel_surcharge_cpm,
            all_in_rpm, total_rate_per_load, typical_transit_days, weekly_committed_volume,
            annual_contract_value, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'ACTIVE');
        `, [
          lane.code, lane.origCity, lane.origState, lane.origZip,
          lane.destCity, lane.destState, lane.destZip, lane.corridor,
          lane.miles, quote.mileage_band, lane.equip, quote.base_linehaul_rpm, quote.fuel_surcharge_cpm,
          quote.all_in_rate_per_mile, quote.total_rate_per_load, transitDays, lane.vol,
          quote.annual_contract_value
        ]);
      }

      // Seed benchmark proposal for Target Corporation
      const targetLanes = [
        {
          lane_code: 'LANE-CHI-ATL-01', origin: 'Chicago, IL', destination: 'Atlanta, GA',
          miles: 715, equipment: '53ft Dry Van', weekly_volume: 5,
          base_linehaul_rpm: 2.65, fuel_surcharge_cpm: 0.442, all_in_rate_per_load: 2210.80,
          annual_lane_value: 574808.00
        },
        {
          lane_code: 'LANE-ABE-RIC-03', origin: 'Allentown, PA', destination: 'Richmond, VA',
          miles: 285, equipment: '53ft Dry Van', weekly_volume: 8,
          base_linehaul_rpm: 3.15, fuel_surcharge_cpm: 0.442, all_in_rate_per_load: 1023.72,
          annual_lane_value: 425867.52
        }
      ];

      await pool.query(`
        INSERT INTO contract_rfp_proposals (
          proposal_code, shipper_name, shipper_contact, shipper_email, shipper_phone,
          commodity, quoted_lanes, total_weekly_loads, annual_contract_value, avg_rate_per_mile,
          ontime_delivery_commitment_pct, proposal_status, proposal_hash, special_notes
        ) VALUES (
          'RFP-PROP-2026-8812', 'Target Corporation Logistics', 'David Chen - Director of Transportation',
          'freightrfp@target.com', '+1 (612) 555-0144', 'Retail Consumer Goods & Electronics',
          $1, 13, 1000675.52, 3.24, 98.5, 'SUBMITTED_TO_SHIPPER',
          'HASH-TARGET-RFP-2026-991204', 'Multi-lane dedicated capacity award proposal covering Midwest & Mid-Atlantic networks.'
        );
      `, [JSON.stringify(targetLanes)]);
    }

    migrated = true;
  } catch (err) {
    console.error('Error initializing rate matrix tables:', err);
  }
}

// -------------------------------------------------------------
// GET /api/rate-matrix/roster
// Returns matrix lanes, aggregate KPIs & active proposals
// -------------------------------------------------------------
router.get('/roster', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const lanesRes = await pool.query(`
      SELECT * FROM enterprise_rate_matrix_lanes
      ORDER BY annual_contract_value DESC
    `);

    const proposalsRes = await pool.query(`
      SELECT * FROM contract_rfp_proposals
      ORDER BY created_at DESC
    `);

    const lanes = lanesRes.rows;
    const proposals = proposalsRes.rows;

    let totalLanes = lanes.length;
    let totalWeeklyVolume = 0;
    let totalAnnualRunrate = 0;
    let sumRpm = 0;

    lanes.forEach(l => {
      totalWeeklyVolume += parseInt(l.weekly_committed_volume, 10) || 0;
      totalAnnualRunrate += parseFloat(l.annual_contract_value) || 0;
      sumRpm += parseFloat(l.all_in_rpm) || 0;
    });

    const avgRpm = totalLanes > 0
      ? Math.round((sumRpm / totalLanes) * 100) / 100
      : 3.10;

    return res.json({
      success: true,
      kpis: {
        active_contract_lanes: totalLanes,
        total_weekly_committed_volume: totalWeeklyVolume,
        annual_contract_runrate: totalAnnualRunrate,
        avg_contract_rate_per_mile: avgRpm,
        total_proposals_count: proposals.length
      },
      lanes,
      proposals
    });
  } catch (err) {
    console.error('Error fetching rate matrix roster:', err);
    return res.status(500).json({ error: 'Failed to fetch rate matrix roster.' });
  }
});

// -------------------------------------------------------------
// POST /api/rate-matrix/quote-lane
// Algorithmic contract rate calculation for any lane
// -------------------------------------------------------------
router.post('/quote-lane', requireAuth, (req, res) => {
  const {
    origin_city = 'Chicago',
    origin_state = 'IL',
    destination_city = 'Atlanta',
    destination_state = 'GA',
    mileage,
    equipment_type = '53ft Dry Van',
    weekly_volume = 5,
    diesel_price = 3.85
  } = req.body;

  if (!mileage || isNaN(mileage) || parseFloat(mileage) <= 0) {
    return res.status(400).json({ error: 'Valid mileage (> 0) is required to calculate contract rates.' });
  }

  const quote = calculateLaneRate(mileage, equipment_type, weekly_volume, diesel_price);

  return res.json({
    success: true,
    lane: {
      origin: `${origin_city}, ${origin_state}`,
      destination: `${destination_city}, ${destination_state}`,
      ...quote
    }
  });
});

// -------------------------------------------------------------
// POST /api/rate-matrix/proposals/generate
// Compiles multi-lane enterprise proposal with SHA-256 hash
// -------------------------------------------------------------
router.post('/proposals/generate', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const {
      shipper_name,
      shipper_contact = 'Transportation Procurement Manager',
      shipper_email = 'freightrfp@shipper.com',
      shipper_phone = '+1 (555) 019-2041',
      commodity = 'General Commercial Freight',
      lanes = [],
      fuel_peg_base = 1.20,
      current_fuel_price = 3.85,
      ontime_delivery_commitment_pct = 98.5,
      special_notes = 'Dedicated contract pricing valid for 365 calendar days.'
    } = req.body;

    if (!shipper_name || !Array.isArray(lanes) || lanes.length === 0) {
      return res.status(400).json({ error: 'shipper_name and at least one quoted lane are required.' });
    }

    let totalWeeklyLoads = 0;
    let totalAnnualValue = 0;
    let sumWeightedRpm = 0;
    let totalMiles = 0;

    const processedLanes = lanes.map((l, idx) => {
      const miles = parseInt(l.miles, 10) || 500;
      const equip = l.equipment_type || '53ft Dry Van';
      const vol = parseInt(l.weekly_volume, 10) || 1;
      const calc = calculateLaneRate(miles, equip, vol, current_fuel_price);

      totalWeeklyLoads += vol;
      totalAnnualValue += calc.annual_contract_value;
      sumWeightedRpm += (calc.all_in_rate_per_mile * miles * vol);
      totalMiles += (miles * vol);

      return {
        id: idx + 1,
        lane_code: l.lane_code || `LANE-${miles}M-${idx + 1}`,
        origin: l.origin || 'Chicago, IL',
        destination: l.destination || 'Atlanta, GA',
        miles,
        equipment_type: equip,
        weekly_volume: vol,
        base_linehaul_rpm: calc.base_linehaul_rpm,
        fuel_surcharge_cpm: calc.fuel_surcharge_cpm,
        all_in_rate_per_mile: calc.all_in_rate_per_mile,
        rate_per_load: calc.total_rate_per_load,
        weekly_spend: calc.weekly_spend,
        annual_lane_value: calc.annual_contract_value
      };
    });

    const avgRpm = totalMiles > 0
      ? Math.round((sumWeightedRpm / totalMiles) * 100) / 100
      : 3.10;

    const proposalCode = `RFP-PROP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const hashPayload = `${proposalCode}|${shipper_name}|${totalAnnualValue}|${totalWeeklyLoads}|${Date.now()}`;
    const proposalHash = `HASH-${crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 24).toUpperCase()}`;

    const insertRes = await pool.query(`
      INSERT INTO contract_rfp_proposals (
        proposal_code, shipper_name, shipper_contact, shipper_email, shipper_phone,
        commodity, quoted_lanes, total_weekly_loads, annual_contract_value, avg_rate_per_mile,
        ontime_delivery_commitment_pct, proposal_status, proposal_hash, special_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SUBMITTED_TO_SHIPPER', $12, $13)
      RETURNING *;
    `, [
      proposalCode, shipper_name, shipper_contact, shipper_email, shipper_phone,
      commodity, JSON.stringify(processedLanes), totalWeeklyLoads, totalAnnualValue, avgRpm,
      ontime_delivery_commitment_pct, proposalHash, special_notes
    ]);

    const createdProposal = insertRes.rows[0];

    auditLog(
      req.user ? req.user.id : null,
      'GENERATE_RFP_PROPOSAL',
      `Generated contract proposal ${proposalCode} for ${shipper_name} ($${totalAnnualValue.toLocaleString()} / yr)`,
      getClientIp(req)
    );

    return res.status(201).json({
      success: true,
      proposal: createdProposal,
      lanes: processedLanes
    });
  } catch (err) {
    console.error('Error generating contract RFP proposal:', err);
    return res.status(500).json({ error: 'Failed to generate contract RFP proposal.' });
  }
});

// -------------------------------------------------------------
// POST /api/rate-matrix/proposals/:id/status
// Updates proposal status (e.g. ACCEPTED_AWARDED, EXPIRED)
// -------------------------------------------------------------
router.post('/proposals/:id/status', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const { proposal_status, notes = '' } = req.body;

    const allowed = ['DRAFT', 'SUBMITTED_TO_SHIPPER', 'UNDER_NEGOTIATION', 'ACCEPTED_AWARDED', 'EXPIRED', 'REJECTED'];
    if (!allowed.includes(proposal_status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const updateRes = await pool.query(`
      UPDATE contract_rfp_proposals
      SET proposal_status = $1::varchar,
          special_notes = CASE WHEN $2::text != '' THEN $2::text ELSE special_notes END,
          updated_at = now()
      WHERE id::text = $3 OR proposal_code = $3
      RETURNING *;
    `, [proposal_status, notes, id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal record not found.' });
    }

    const updated = updateRes.rows[0];

    auditLog(
      req.user ? req.user.id : null,
      'UPDATE_RFP_PROPOSAL_STATUS',
      `Updated proposal ${updated.proposal_code} to ${proposal_status}`,
      getClientIp(req)
    );

    return res.json({
      success: true,
      proposal: updated
    });
  } catch (err) {
    console.error('Error updating proposal status:', err);
    return res.status(500).json({ error: 'Failed to update proposal status.' });
  }
});

// -------------------------------------------------------------
// GET /api/rate-matrix/proposals/:id
// Retrieves single proposal specification
// -------------------------------------------------------------
router.get('/proposals/:id', requireAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const proposalRes = await pool.query(`
      SELECT * FROM contract_rfp_proposals
      WHERE id::text = $1 OR proposal_code = $1
    `, [id]);

    if (proposalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found.' });
    }

    return res.json({
      success: true,
      proposal: proposalRes.rows[0]
    });
  } catch (err) {
    console.error('Error fetching proposal details:', err);
    return res.status(500).json({ error: 'Failed to fetch proposal details.' });
  }
});

// -------------------------------------------------------------
// GET /api/rate-matrix/proposals/:id/proposal-pdf
// Vector PDF Enterprise Contract Proposal & SLA Agreement
// -------------------------------------------------------------
router.get('/proposals/:id/proposal-pdf', optionalAuth, async (req, res) => {
  await ensureTables();
  try {
    const { id } = req.params;
    const proposalRes = await pool.query(`
      SELECT * FROM contract_rfp_proposals
      WHERE id::text = $1 OR proposal_code = $1
    `, [id]);

    if (proposalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal record not found.' });
    }

    const p = proposalRes.rows[0];
    const filename = `Contract_Proposal_${p.proposal_code}.pdf`;

    const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    doc.pipe(res);

    // Document Header
    doc.rect(36, 36, 540, 60).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text('LOADNEXUS™ ENTERPRISE SHIPPER CONTRACT PROPOSAL', 50, 48);
    doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('DEDICATED CAPACITY TENDER & SERVICE LEVEL AGREEMENT (SLA)', 50, 68);
    doc.fillColor('#38bdf8').fontSize(10).font('Helvetica-Bold').text(`REF: ${p.proposal_code}`, 380, 50, { align: 'right', width: 180 });
    doc.fillColor('#34d399').fontSize(8).font('Helvetica').text(`STATUS: ${p.proposal_status}`, 380, 68, { align: 'right', width: 180 });

    let y = 110;

    // Parties Box
    doc.rect(36, y, 540, 55).fill('#f8fafc').stroke('#cbd5e1');
    doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica-Bold').text('CLIENT SHIPPER:', 46, y + 8);
    doc.fillColor('#0f172a').font('Helvetica').text(`${p.shipper_name} (${p.shipper_contact})`, 150, y + 8);
    doc.fillColor('#1e293b').font('Helvetica-Bold').text('COMMODITY / CLASS:', 360, y + 8);
    doc.fillColor('#0f172a').font('Helvetica').text(p.commodity, 480, y + 8);

    doc.fillColor('#1e293b').font('Helvetica-Bold').text('CONTACT EMAIL / TEL:', 46, y + 24);
    doc.fillColor('#0f172a').font('Helvetica').text(`${p.shipper_email} · ${p.shipper_phone}`, 170, y + 24);

    doc.fillColor('#1e293b').font('Helvetica-Bold').text('EFFECTIVE PERIOD:', 46, y + 40);
    doc.fillColor('#059669').font('Helvetica-Bold').text(
      `${new Date(p.effective_date).toISOString().split('T')[0]} to ${new Date(p.expiration_date).toISOString().split('T')[0]} (365 Days)`, 150, y + 40
    );

    y += 70;

    // Section 1: Quoted Dedicated Corridors Table
    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('1. DEDICATED FREIGHT LANES & PRICING MATRIX', 36, y);
    doc.rect(36, y + 14, 540, 1).fill('#cbd5e1');

    y += 22;

    // Table Header
    doc.rect(36, y, 540, 18).fill('#e2e8f0');
    doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold');
    doc.text('ORIGIN → DESTINATION', 42, y + 5);
    doc.text('EQUIPMENT', 210, y + 5);
    doc.text('MILES', 290, y + 5);
    doc.text('VOL/WK', 335, y + 5);
    doc.text('ALL-IN $/MI', 385, y + 5);
    doc.text('RATE/LOAD', 445, y + 5);
    doc.text('ANNUAL ($)', 505, y + 5);

    y += 22;
    const lanesList = Array.isArray(p.quoted_lanes) ? p.quoted_lanes : [];

    doc.font('Helvetica').fontSize(8);
    lanesList.slice(0, 5).forEach((l, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(36, y - 3, 540, 18).fill(rowBg);
      doc.fillColor('#0f172a');
      doc.text(`${l.origin} → ${l.destination}`, 42, y + 2, { width: 165 });
      doc.text(l.equipment_type || '53ft Dry Van', 210, y + 2);
      doc.text(String(l.miles), 290, y + 2);
      doc.text(String(l.weekly_volume), 335, y + 2);
      doc.text(`$${parseFloat(l.all_in_rate_per_mile).toFixed(2)}`, 385, y + 2);
      doc.text(`$${parseFloat(l.rate_per_load).toFixed(2)}`, 445, y + 2);
      doc.fillColor('#059669').font('Helvetica-Bold').text(`$${parseFloat(l.annual_lane_value).toLocaleString()}`, 505, y + 2);
      doc.font('Helvetica');
      y += 18;
    });

    // Summary Row
    doc.rect(36, y, 540, 20).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
    doc.text('TOTAL COMMITTED CONTRACT VALUE:', 42, y + 6);
    doc.text(`${p.total_weekly_loads} Loads / Wk`, 310, y + 6);
    doc.text(`Avg: $${parseFloat(p.avg_rate_per_mile).toFixed(2)}/mi`, 400, y + 6);
    doc.fillColor('#38bdf8').text(`$${parseFloat(p.annual_contract_value).toLocaleString()} USD / YR`, 475, y + 6);

    y += 32;

    // Section 2: Fuel Surcharge Pegging Scale & Accessorials
    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('2. DOE DIESEL FUEL SURCHARGE SCALE & ACCESSORIAL TERMS', 36, y);
    doc.rect(36, y + 14, 540, 1).fill('#cbd5e1');

    y += 20;
    doc.fillColor('#334155').fontSize(8).font('Helvetica').text(
      `• Fuel Surcharge Baseline: $${parseFloat(p.fuel_peg_base).toFixed(2)}/gal pegged to EIA/DOE National Diesel Average.\n` +
      `• Standard 6.0 MPG Fleet Efficiency Ratio with $0.01/mile adjustment per $0.05/gal fuel index movement.\n` +
      `• Free Time: Standard 2 Hours included at Origin Shipper and Destination Consignee.\n` +
      `• Detention Rate: $75.00/hour billed in 15-minute increments with GPS geofence timestamp verification.\n` +
      `• Layover: $350.00/day · Truck Ordered Not Used (TONU): $250.00 · Extra Stop / Drop: $85.00/stop.`,
      42, y, { width: 520, lineGap: 3 }
    );

    y += 55;

    // Section 3: Service Level Commitments (SLA)
    doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('3. CARRIER PERFORMANCE & SERVICE LEVEL GUARANTEE (SLA)', 36, y);
    doc.rect(36, y + 14, 540, 1).fill('#cbd5e1');

    y += 20;
    doc.fillColor('#334155').fontSize(8).font('Helvetica').text(
      `• On-Time Delivery (OTD) Guarantee: ${p.ontime_delivery_commitment_pct}% target with automated root-cause reporting.\n` +
      `• Real-Time Telematics & Tracking: 100% live GPS satellite visibility via AdvanceTrack™ and MacroPoint.\n` +
      `• Electronic Freight Integration: Full EDI 204 (Tender), 214 (Milestone Tracking), and 210 (Invoice) support.\n` +
      `• Security & Anti-Fraud Shield: $1,000,000 Auto Liability CSL, $100,000 Cargo, and zero double-brokering warranty.`,
      42, y, { width: 520, lineGap: 3 }
    );

    y += 55;

    // Execution & Signature Block
    doc.rect(36, y, 540, 65).fill('#f1f5f9').stroke('#cbd5e1');
    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text('EXECUTION & BINDING CONTRACT ACCEPTANCE', 46, y + 8);
    doc.fillColor('#475569').fontSize(8).font('Helvetica').text(
      'ACCEPTED AND AGREED: Authorized representatives of Shipper and Shipping Wish LLC / LoadNexus™ hereby execute this Dedicated Freight Rate Contract.',
      46, y + 20, { width: 520 }
    );

    doc.text('FOR SHIPPER: _____________________________   DATE: ________', 46, y + 44);
    doc.text('FOR CARRIER (SHIPPING WISH LLC): ____________________   DATE: ________', 300, y + 44);

    y += 75;

    // Cryptographic Seal
    doc.rect(36, y, 540, 36).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('LOADNEXUS™ CRYPTOGRAPHIC CONTRACT VERIFICATION', 46, y + 8);
    doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(`INTEGRITY HASH: ${p.proposal_hash} · AUTHORIZED FREIGHT TENDER SYSTEM`, 46, y + 20);

    doc.end();
  } catch (err) {
    console.error('Error generating contract proposal PDF:', err);
    return res.status(500).json({ error: 'Failed to generate contract proposal PDF.' });
  }
});

module.exports = router;
