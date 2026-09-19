const express = require('express');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

let migrated = false;
async function ensureTables() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dvir_inspections (
        id SERIAL PRIMARY KEY,
        driver_id INT REFERENCES users(id) ON DELETE CASCADE,
        carrier_id INT REFERENCES users(id) ON DELETE CASCADE,
        inspection_type VARCHAR(20) NOT NULL,
        vehicle_truck_number VARCHAR(50) NOT NULL,
        vehicle_trailer_number VARCHAR(50),
        odometer_miles INT NOT NULL,
        location_city VARCHAR(100),
        location_state VARCHAR(10),
        defects_found BOOLEAN DEFAULT FALSE,
        is_safe_to_operate BOOLEAN DEFAULT TRUE,
        checklist_json JSONB NOT NULL,
        defect_details TEXT,
        driver_signature_hash VARCHAR(128),
        mechanic_signed BOOLEAN DEFAULT FALSE,
        mechanic_name VARCHAR(100),
        mechanic_repair_notes TEXT,
        repaired_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_dvir_driver ON dvir_inspections(driver_id);
      CREATE INDEX IF NOT EXISTS idx_dvir_truck ON dvir_inspections(vehicle_truck_number);
      CREATE INDEX IF NOT EXISTS idx_dvir_defects ON dvir_inspections(defects_found);
    `);

    // Seed sample DVIR inspection if empty for demonstration
    const checkDvir = await pool.query('SELECT COUNT(*) FROM dvir_inspections');
    if (parseInt(checkDvir.rows[0].count, 10) === 0) {
      let driver = await pool.query(`SELECT id FROM users WHERE role::text IN ('carrier', 'super_admin') LIMIT 1`);
      const driverId = driver.rows.length > 0 ? driver.rows[0].id : null;
      if (driverId) {
        const initialChecklist = {
          service_brakes: true,
          parking_brake: true,
          steering_mechanism: true,
          lighting_reflectors: true,
          tires_wheels: true,
          horn: true,
          windshield_wipers: true,
          mirrors: true,
          coupling_devices: true,
          emergency_equipment: true,
          exhaust_system: true
        };

        await pool.query(`
          INSERT INTO dvir_inspections (
            driver_id, carrier_id, inspection_type, vehicle_truck_number, vehicle_trailer_number,
            odometer_miles, location_city, location_state, defects_found, is_safe_to_operate,
            checklist_json, defect_details, driver_signature_hash, created_at
          ) VALUES 
            ($1, $1, 'PRE_TRIP', 'SW-TRK-104', 'SW-TRL-5301', 184520, 'Dallas', 'TX', FALSE, TRUE, $2, '', 'SIG-PRE-98214', now() - interval '4 hours'),
            ($1, $1, 'POST_TRIP', 'SW-TRK-108', 'SW-TRL-5304', 219400, 'Atlanta', 'GA', TRUE, FALSE, $2, 'Right steer tire pressure low at 85 PSI; air brake glad-hand seal worn.', 'SIG-POST-44109', now() - interval '1 day');
        `, [driverId, JSON.stringify(initialChecklist)]);
      }
    }

    migrated = true;
  } catch (err) {
    console.error('[DVIR Migration] Error:', err.message);
  }
}
ensureTables();

// POST /api/dvir/submit — Submit new DVIR
router.post('/submit', requireAuth, async (req, res) => {
  await ensureTables();
  const {
    inspection_type = 'PRE_TRIP',
    vehicle_truck_number,
    vehicle_trailer_number = 'SW-TRL-5301',
    odometer_miles,
    location_city = 'Dallas',
    location_state = 'TX',
    defects_found = false,
    is_safe_to_operate = true,
    checklist_json = {},
    defect_details = '',
    driver_id = null
  } = req.body;

  if (!vehicle_truck_number || !vehicle_truck_number.trim()) {
    return res.status(400).json({ error: 'vehicle_truck_number is required.' });
  }

  const odo = parseInt(odometer_miles, 10);
  if (isNaN(odo) || odo <= 0) {
    return res.status(400).json({ error: 'Valid odometer_miles is required.' });
  }

  const targetDriverId = (driver_id && ['super_admin', 'admin', 'dispatcher'].includes(req.user.role))
    ? parseInt(driver_id, 10)
    : req.user.id;

  const validTypes = ['PRE_TRIP', 'POST_TRIP', 'INTERMITTENT'];
  const cleanType = validTypes.includes(inspection_type) ? inspection_type : 'PRE_TRIP';

  // Standard 11 safety categories fallback
  const defaultChecklist = {
    service_brakes: true,
    parking_brake: true,
    steering_mechanism: true,
    lighting_reflectors: true,
    tires_wheels: true,
    horn: true,
    windshield_wipers: true,
    mirrors: true,
    coupling_devices: true,
    emergency_equipment: true,
    exhaust_system: true
  };
  const finalChecklist = { ...defaultChecklist, ...checklist_json };

  const hasDefects = Boolean(defects_found);
  const safe = hasDefects ? Boolean(is_safe_to_operate) : true;

  // Driver digital signature hash
  const sigPayload = `${targetDriverId}-${vehicle_truck_number}-${odo}-${Date.now()}`;
  const driverSigHash = 'SIG-DVIR-' + crypto.createHash('sha256').update(sigPayload).digest('hex').slice(0, 16).toUpperCase();

  try {
    const insertRes = await pool.query(`
      INSERT INTO dvir_inspections (
        driver_id, carrier_id, inspection_type, vehicle_truck_number, vehicle_trailer_number,
        odometer_miles, location_city, location_state, defects_found, is_safe_to_operate,
        checklist_json, defect_details, driver_signature_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
      RETURNING *
    `, [
      targetDriverId,
      targetDriverId,
      cleanType,
      vehicle_truck_number.trim().toUpperCase(),
      vehicle_trailer_number ? vehicle_trailer_number.trim().toUpperCase() : null,
      odo,
      location_city.trim(),
      location_state.trim().toUpperCase(),
      hasDefects,
      safe,
      JSON.stringify(finalChecklist),
      defect_details.trim(),
      driverSigHash
    ]);

    await auditLog({
      action: 'DVIR_SUBMITTED',
      userId: req.user.id,
      details: { id: insertRes.rows[0].id, truck: vehicle_truck_number, type: cleanType, defects: hasDefects },
      ipAddress: getClientIp(req)
    });

    res.json({
      ok: true,
      message: `${cleanType} inspection recorded for Truck #${vehicle_truck_number.toUpperCase()}.`,
      inspection: insertRes.rows[0]
    });
  } catch (err) {
    console.error('[DVIR Submit] Error:', err);
    res.status(500).json({ error: 'Could not submit DVIR inspection.' });
  }
});

// GET /api/dvir/history — Retrieve inspection records
router.get('/history', requireAuth, async (req, res) => {
  await ensureTables();
  const { defects_only, truck_number, limit = 50 } = req.query;

  let query = `
    SELECT d.*, u.name as driver_name, u.company_name, u.mc_number, u.dot_number
    FROM dvir_inspections d
    LEFT JOIN users u ON u.id = d.driver_id
    WHERE 1=1
  `;
  const params = [];

  if (defects_only === 'true') {
    query += ` AND d.defects_found = TRUE`;
  }

  if (truck_number) {
    params.push(`%${truck_number.trim().toUpperCase()}%`);
    query += ` AND d.vehicle_truck_number ILIKE $${params.length}`;
  }

  query += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit, 10) || 50);

  try {
    const listRes = await pool.query(query, params);

    // Calculate metrics
    let total = listRes.rows.length;
    let withDefects = 0;
    let outOfService = 0;
    let clean = 0;

    listRes.rows.forEach(r => {
      if (r.defects_found) {
        withDefects++;
        if (!r.is_safe_to_operate && !r.mechanic_signed) outOfService++;
      } else {
        clean++;
      }
    });

    res.json({
      ok: true,
      count: total,
      metrics: {
        total,
        clean,
        with_defects: withDefects,
        out_of_service: outOfService
      },
      inspections: listRes.rows
    });
  } catch (err) {
    console.error('[DVIR History] Error:', err);
    res.status(500).json({ error: 'Could not fetch DVIR history.' });
  }
});

// GET /api/dvir/:id — Single inspection details
router.get('/:id', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid inspection ID.' });

  try {
    const dvirRes = await pool.query(`
      SELECT d.*, u.name as driver_name, u.company_name, u.mc_number, u.dot_number, u.phone
      FROM dvir_inspections d
      LEFT JOIN users u ON u.id = d.driver_id
      WHERE d.id = $1
    `, [id]);

    if (dvirRes.rows.length === 0) {
      return res.status(404).json({ error: 'DVIR record not found.' });
    }

    res.json({ ok: true, inspection: dvirRes.rows[0] });
  } catch (err) {
    console.error('[DVIR Detail] Error:', err);
    res.status(500).json({ error: 'Could not fetch DVIR record.' });
  }
});

// POST /api/dvir/:id/mechanic-signoff — Mechanic certifies defects corrected
router.post('/:id/mechanic-signoff', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid inspection ID.' });

  const {
    mechanic_name = 'Certified Fleet Tech',
    mechanic_repair_notes = 'Defects inspected and repaired according to manufacturer specifications.',
    repair_unnecessary = false
  } = req.body;

  try {
    const updateRes = await pool.query(`
      UPDATE dvir_inspections
      SET mechanic_signed = TRUE,
          mechanic_name = $1,
          mechanic_repair_notes = $2,
          is_safe_to_operate = TRUE,
          repaired_at = now()
      WHERE id = $3
      RETURNING *
    `, [mechanic_name.trim(), mechanic_repair_notes.trim(), id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'DVIR record not found.' });
    }

    await auditLog({
      action: 'DVIR_MECHANIC_SIGNOFF',
      userId: req.user.id,
      details: { id, mechanic: mechanic_name, repaired: true },
      ipAddress: getClientIp(req)
    });

    res.json({
      ok: true,
      message: `Mechanic sign-off completed for DVIR #${id}. Vehicle cleared safe to operate.`,
      inspection: updateRes.rows[0]
    });
  } catch (err) {
    console.error('[DVIR Mechanic Signoff] Error:', err);
    res.status(500).json({ error: 'Could not sign off DVIR repair.' });
  }
});

// GET /api/dvir/:id/pdf — Official Vector FMCSA Part 396 DVIR Report PDF
router.get('/:id/pdf', requireAuth, async (req, res) => {
  await ensureTables();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid inspection ID.' });

  try {
    const dvirRes = await pool.query(`
      SELECT d.*, u.name as driver_name, u.company_name, u.mc_number, u.dot_number, u.phone
      FROM dvir_inspections d
      LEFT JOIN users u ON u.id = d.driver_id
      WHERE d.id = $1
    `, [id]);

    if (dvirRes.rows.length === 0) {
      return res.status(404).json({ error: 'DVIR record not found.' });
    }

    const d = dvirRes.rows[0];
    const carrierName = d.company_name || 'Shipping Wish LLC / LoadNexus Fleet';
    const dotNumber = d.dot_number ? `USDOT-${d.dot_number}` : 'USDOT-4091823';
    const mcNumber = d.mc_number ? `MC-${d.mc_number}` : 'MC-1594821';
    const checklist = d.checklist_json || {};

    const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="DVIR_Inspection_${d.id}_${d.vehicle_truck_number}.pdf"`);
    doc.pipe(res);

    // Header Banner
    doc.rect(36, 36, 540, 68).fill('#0B192C');

    doc.fillColor('#FFFFFF').fontSize(15).font('Helvetica-Bold')
       .text("DRIVER VEHICLE INSPECTION REPORT (DVIR)", 50, 48);
    doc.fillColor('#38BDF8').fontSize(10).font('Helvetica')
       .text("FMCSA 49 CFR § 396.11 & § 396.13 SAFETY COMPLIANCE", 50, 68);
    doc.fillColor('#94A3B8').fontSize(9)
       .text(`Inspection ID: DVIR-${d.id.toString().padStart(5, '0')}  •  Type: ${d.inspection_type.replace(/_/g, ' ')}`, 50, 82);

    const statusTitle = d.defects_found ? (d.mechanic_signed ? 'REPAIRED / SAFE' : 'DEFECT FLAGGED') : 'SAFE TO OPERATE';
    const statusColor = d.defects_found ? (d.mechanic_signed ? '#34D399' : '#F87171') : '#10B981';

    doc.fillColor(statusColor).fontSize(12).font('Helvetica-Bold')
       .text(statusTitle, 400, 48, { align: 'right', width: 165 });
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica')
       .text(`Date: ${new Date(d.created_at).toISOString().split('T')[0]}\nOdometer: ${d.odometer_miles.toLocaleString()} mi`, 400, 65, { align: 'right', width: 165 });

    // Carrier & Equipment Details Card
    let y = 114;
    doc.rect(36, y, 540, 58).fill('#0E1A2D');
    doc.rect(36, y, 540, 58).stroke('#1E3E62');

    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica')
       .text('MOTOR CARRIER OPERATING ENTITY', 46, y + 8);
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
       .text(carrierName, 46, y + 20);
    doc.fillColor('#94A3B8').fontSize(9).font('Helvetica')
       .text(`${dotNumber}  •  ${mcNumber}  •  Driver: ${d.driver_name || 'Fleet Driver'}`, 46, y + 36);

    doc.fillColor('#94A3B8').fontSize(8)
       .text('EQUIPMENT & LOCATION', 390, y + 8, { align: 'right', width: 175 });
    doc.fillColor('#38BDF8').fontSize(10).font('Helvetica-Bold')
       .text(`Tractor #${d.vehicle_truck_number}  •  Trailer #${d.vehicle_trailer_number || 'N/A'}`, 390, y + 20, { align: 'right', width: 175 });
    doc.fillColor('#10B981').fontSize(8.5).font('Helvetica')
       .text(`Location: ${d.location_city || 'Dallas'}, ${d.location_state || 'TX'}`, 390, y + 36, { align: 'right', width: 175 });

    // 11 Safety Categories Checklist Table
    y = 184;
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
       .text('MANDATORY FMCSA 49 CFR PART 396 VEHICLE SAFETY AUDIT', 36, y);
    y += 18;

    doc.rect(36, y, 540, 20).fill('#1E3E62');
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
    doc.text('#', 44, y + 6);
    doc.text('SAFETY COMPLIANCE CATEGORY', 70, y + 6);
    doc.text('SYSTEM AUDIT SPECIFICATION', 230, y + 6);
    doc.text('STATUS', 500, y + 6, { align: 'right', width: 65 });

    y += 20;

    const safetyItems = [
      { key: 'service_brakes', title: 'Service Brakes (Including Trailer Brake Connections)', desc: 'Air pressure build, brake lines, chambers, lining & pads' },
      { key: 'parking_brake', title: 'Parking (Hand) Brake', desc: 'Holding mechanism, spring brakes, yellow dash control valve' },
      { key: 'steering_mechanism', title: 'Steering Mechanism', desc: 'Steering box, lash, drag link, tie rods, power steering fluid' },
      { key: 'lighting_reflectors', title: 'Lighting Devices & Reflectors', desc: 'Headlights, brake lights, turn signals, clearance & hazard lamps' },
      { key: 'tires_wheels', title: 'Tires, Wheels & Rims', desc: 'Tread depth (min 4/32 steer, 2/32 drive), inflation, lug nuts, rims' },
      { key: 'horn', title: 'Horn Mechanism', desc: 'Electric city horn & pneumatic highway air horn operating' },
      { key: 'windshield_wipers', title: 'Windshield Wipers & Washers', desc: 'Wiper blades, motor cycle speeds, fluid reservoir filled' },
      { key: 'mirrors', title: 'Rear-Vision Mirrors', desc: 'West Coast convex & flat mirrors clean, secured & aligned' },
      { key: 'coupling_devices', title: 'Coupling Devices & Fifth Wheel', desc: 'Kingpin lock, locking jaws engaged, release arm, air hoses' },
      { key: 'emergency_equipment', title: 'Emergency Equipment', desc: 'Fire extinguisher charged (10 B:C), 3 reflective triangles, spare fuses' },
      { key: 'exhaust_system', title: 'Exhaust & Fuel Systems', desc: 'Manifold leaks, DPF, DEF level, fuel tank caps & straps tight' }
    ];

    doc.font('Helvetica').fontSize(8);
    safetyItems.forEach((item, idx) => {
      const isPass = checklist[item.key] !== false;
      const rowBg = idx % 2 === 0 ? '#0B192C' : '#070F1E';
      doc.rect(36, y, 540, 18).fill(rowBg);

      doc.fillColor('#94A3B8').font('Helvetica').text((idx + 1).toString(), 44, y + 5);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').text(item.title, 70, y + 5, { width: 155 });
      doc.fillColor('#94A3B8').font('Helvetica').text(item.desc, 230, y + 5, { width: 260 });

      if (isPass) {
        doc.fillColor('#10B981').font('Helvetica-Bold').text('PASS ✓', 500, y + 5, { align: 'right', width: 65 });
      } else {
        doc.fillColor('#F87171').font('Helvetica-Bold').text('DEFECT ✕', 500, y + 5, { align: 'right', width: 65 });
      }

      y += 18;
    });

    // Defect & Repair Remarks Box
    y += 12;
    doc.rect(36, y, 540, 60).fill('#0E1A2D');
    doc.rect(36, y, 540, 60).stroke('#1E3E62');

    doc.fillColor('#FBBF24').fontSize(8.5).font('Helvetica-Bold')
       .text('DEFECT DISCOVERY & REPAIR REMARKS', 46, y + 8);

    const defectText = d.defects_found 
      ? `Reported Defect: ${d.defect_details || 'Defect flagged in inspection items above.'}` 
      : 'No safety defects or vehicle deficiencies discovered. Vehicle is in certified safe operating condition.';
    
    doc.fillColor(d.defects_found ? '#FCA5A5' : '#10B981').fontSize(8).font('Helvetica')
       .text(defectText, 46, y + 22, { width: 520 });

    if (d.mechanic_signed) {
      doc.fillColor('#34D399').fontSize(7.5).font('Helvetica-Bold')
         .text(`Certified Repair Sign-off: ${d.mechanic_repair_notes || 'All reported defects corrected. Vehicle safe to dispatch.'}`, 46, y + 42, { width: 520 });
    }

    // Dual Signatures Section (Driver Certification & Mechanic Repair Sign-Off)
    y += 72;

    // Driver Box
    doc.rect(36, y, 262, 85).fill('#070F1E');
    doc.rect(36, y, 262, 85).stroke('#1E3E62');

    doc.fillColor('#38BDF8').fontSize(8.5).font('Helvetica-Bold')
       .text("DRIVER'S SIGNATURE CERTIFICATION", 46, y + 8);
    doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
       .text("I certify that I have conducted this vehicle inspection in accordance with FMCSA 49 CFR Part 396 and that all statements are true and correct.", 46, y + 22, { width: 242 });
    
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
       .text(`Driver: ${d.driver_name || 'Fleet Commercial Driver'}`, 46, y + 54);
    doc.fillColor('#10B981').fontSize(7.5).font('Helvetica')
       .text(`Digital Seal: ${d.driver_signature_hash || 'SIG-DVIR-CERTIFIED'}`, 46, y + 68);

    // Mechanic Box
    doc.rect(314, y, 262, 85).fill('#070F1E');
    doc.rect(314, y, 262, 85).stroke('#1E3E62');

    doc.fillColor('#FBBF24').fontSize(8.5).font('Helvetica-Bold')
       .text("MECHANIC / REPAIR CERTIFICATION", 324, y + 8);
    
    if (d.mechanic_signed) {
      doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
         .text("I certify that all defects listed above have been repaired or certified that repair is not necessary for safe operation.", 324, y + 22, { width: 242 });
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
         .text(`Certified Tech: ${d.mechanic_name || 'Fleet Safety Mechanic'}`, 324, y + 54);
      doc.fillColor('#10B981').fontSize(7.5).font('Helvetica')
         .text(`Sign-off Date: ${new Date(d.repaired_at).toISOString().split('T')[0]} • SAFE TO DISPATCH ✓`, 324, y + 68);
    } else if (d.defects_found) {
      doc.fillColor('#F87171').fontSize(8).font('Helvetica-Bold')
         .text("ACTION REQUIRED: AWAITING MECHANIC SIGN-OFF", 324, y + 26, { width: 242 });
      doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
         .text("Vehicle must not be operated until corrective action is certified by an authorized fleet maintenance technician.", 324, y + 42, { width: 242 });
    } else {
      doc.fillColor('#10B981').fontSize(8.5).font('Helvetica-Bold')
         .text("NO REPAIRS REQUIRED", 324, y + 30, { width: 242 });
      doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica')
         .text("No defects reported. Mechanic corrective sign-off waived under 49 CFR § 396.11(a)(2).", 324, y + 46, { width: 242 });
    }

    // Bottom Watermark
    doc.fillColor('#64748B').fontSize(7).font('Helvetica')
       .text(`LoadNexus™ Fleet Safety OS  •  Shipping Wish LLC  •  https://shippingwish.com  •  49 CFR § 396 Certified  •  Document: DVIR-${d.id}`, 36, 745, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[DVIR PDF] Error:', err);
    res.status(500).json({ error: 'Could not generate DVIR inspection PDF.' });
  }
});

module.exports = router;
