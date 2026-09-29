const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

let migrated = false;
async function ensureTable() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eld_duty_events (
        id SERIAL PRIMARY KEY,
        driver_id INT REFERENCES users(id) ON DELETE CASCADE,
        duty_status VARCHAR(30) NOT NULL,
        started_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        duration_minutes INT DEFAULT 0,
        location_city VARCHAR(100),
        location_state VARCHAR(10),
        gps_lat NUMERIC(10, 6),
        gps_lon NUMERIC(10, 6),
        odometer_miles INT DEFAULT 0,
        engine_hours NUMERIC(8, 1) DEFAULT 0.0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_eld_driver_id ON eld_duty_events(driver_id);
      CREATE INDEX IF NOT EXISTS idx_eld_duty_status ON eld_duty_events(duty_status);

      CREATE TABLE IF NOT EXISTS eld_daily_certifications (
        id SERIAL PRIMARY KEY,
        driver_id INT REFERENCES users(id) ON DELETE CASCADE,
        log_date DATE NOT NULL,
        total_miles INT DEFAULT 0,
        certified BOOLEAN DEFAULT TRUE,
        signature_hash VARCHAR(128),
        created_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_eld_cert_driver_date ON eld_daily_certifications(driver_id, log_date);
    `);
    migrated = true;
  } catch (err) {
    console.error('[ELD Migration] Error:', err.message);
  }
}
ensureTable();

// Calculate HOS Clocks for a driver
async function calculateDriverClocks(driverId) {
  // Query today's events (UTC day or last 24h)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventsRes = await pool.query(`
    SELECT * FROM eld_duty_events 
    WHERE driver_id = $1 AND started_at >= $2 
    ORDER BY started_at ASC
  `, [driverId, today]);

  let drivingMinutesToday = 0;
  let onDutyMinutesToday = 0;
  let currentStatus = 'OFF_DUTY';
  let currentEvent = null;

  const now = new Date();

  eventsRes.rows.forEach(e => {
    const start = new Date(e.started_at);
    const end = e.ended_at ? new Date(e.ended_at) : now;
    const duration = Math.max(0, Math.round((end - start) / 60000));

    if (e.duty_status === 'DRIVING') {
      drivingMinutesToday += duration;
      onDutyMinutesToday += duration;
    } else if (e.duty_status === 'ON_DUTY_NOT_DRIVING') {
      onDutyMinutesToday += duration;
    }

    if (!e.ended_at) {
      currentStatus = e.duty_status;
      currentEvent = e;
    }
  });

  // Query rolling 8-day on duty total for 70-hour clock
  const eightDaysAgo = new Date(now.getTime() - (8 * 24 * 3600 * 1000));
  const cycleRes = await pool.query(`
    SELECT duty_status, started_at, ended_at FROM eld_duty_events
    WHERE driver_id = $1 AND started_at >= $2
  `, [driverId, eightDaysAgo]);

  let cycleOnDutyMinutes = 0;
  cycleRes.rows.forEach(e => {
    if (['DRIVING', 'ON_DUTY_NOT_DRIVING'].includes(e.duty_status)) {
      const start = new Date(e.started_at);
      const end = e.ended_at ? new Date(e.ended_at) : now;
      cycleOnDutyMinutes += Math.max(0, Math.round((end - start) / 60000));
    }
  });

  // Limits under FMCSA 49 CFR Part 395:
  // 11h Driving = 660 mins
  // 14h Shift = 840 mins
  // 70h 8-Day Cycle = 4200 mins
  // 8h Break = 480 mins
  const driveLimit = 660;
  const shiftLimit = 840;
  const cycleLimit = 4200;

  const driveRemaining = Math.max(0, driveLimit - drivingMinutesToday);
  const shiftRemaining = Math.max(0, shiftLimit - onDutyMinutesToday);
  const cycleRemaining = Math.max(0, cycleLimit - cycleOnDutyMinutes);
  const breakRemaining = Math.max(0, 480 - (drivingMinutesToday % 480));

  return {
    current_status: currentStatus,
    clocks: {
      driving_11h: {
        limit_hours: 11,
        used_minutes: drivingMinutesToday,
        remaining_minutes: driveRemaining,
        remaining_formatted: `${Math.floor(driveRemaining / 60)}h ${driveRemaining % 60}m`,
        percent_used: Math.min(100, Math.round((drivingMinutesToday / driveLimit) * 100))
      },
      shift_14h: {
        limit_hours: 14,
        used_minutes: onDutyMinutesToday,
        remaining_minutes: shiftRemaining,
        remaining_formatted: `${Math.floor(shiftRemaining / 60)}h ${shiftRemaining % 60}m`,
        percent_used: Math.min(100, Math.round((onDutyMinutesToday / shiftLimit) * 100))
      },
      cycle_70h: {
        limit_hours: 70,
        used_minutes: cycleOnDutyMinutes,
        remaining_minutes: cycleRemaining,
        remaining_formatted: `${Math.floor(cycleRemaining / 60)}h ${cycleRemaining % 60}m`,
        percent_used: Math.min(100, Math.round((cycleOnDutyMinutes / cycleLimit) * 100))
      },
      break_8h: {
        limit_hours: 8,
        remaining_minutes: breakRemaining,
        remaining_formatted: `${Math.floor(breakRemaining / 60)}h ${breakRemaining % 60}m`
      }
    },
    violations: {
      has_violation: driveRemaining === 0 || shiftRemaining === 0 || cycleRemaining === 0,
      count: 0
    }
  };
}

// POST /api/eld/status-change — Switch duty status
router.post('/status-change', requireAuth, async (req, res) => {
  await ensureTable();
  const {
    duty_status,
    location_city = null,
    location_state = null,
    gps_lat = null,
    gps_lon = null,
    odometer_miles = null,
    engine_hours = null,
    notes = '',
    driver_id = null
  } = req.body;

  const validStatuses = ['OFF_DUTY', 'SLEEPER_BERTH', 'DRIVING', 'ON_DUTY_NOT_DRIVING'];
  if (!validStatuses.includes(duty_status)) {
    return res.status(400).json({ error: 'Valid duty_status required: ' + validStatuses.join(', ') });
  }

  const lat = gps_lat == null || gps_lat === '' ? null : Number(gps_lat);
  const lon = gps_lon == null || gps_lon === '' ? null : Number(gps_lon);
  if ((gps_lat != null && gps_lat !== '' && !Number.isFinite(lat)) || (gps_lon != null && gps_lon !== '' && !Number.isFinite(lon))) {
    return res.status(400).json({ error: 'GPS must be real coordinates from the device, or left blank.' });
  }

  const targetDriverId = (driver_id && ['super_admin', 'admin', 'dispatcher'].includes(req.user.role))
    ? parseInt(driver_id, 10)
    : req.user.id;

  try {
    // 1. Close active duty event
    const activeRes = await pool.query(
      `SELECT * FROM eld_duty_events WHERE driver_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      [targetDriverId]
    );

    const now = new Date();
    if (activeRes.rows.length > 0) {
      const active = activeRes.rows[0];
      const duration = Math.max(0, Math.round((now - new Date(active.started_at)) / 60000));
      await pool.query(
        `UPDATE eld_duty_events SET ended_at = $1, duration_minutes = $2 WHERE id = $3`,
        [now, duration, active.id]
      );
    }

    // 2. Insert new event
    const insertRes = await pool.query(`
      INSERT INTO eld_duty_events 
        (driver_id, duty_status, started_at, location_city, location_state, gps_lat, gps_lon, odometer_miles, engine_hours, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      RETURNING *
    `, [targetDriverId, duty_status, now, location_city, location_state, Number.isFinite(lat) ? lat : null, Number.isFinite(lon) ? lon : null, odometer_miles || 0, engine_hours || 0, notes]);

    const newEvent = insertRes.rows[0];
    const clocks = await calculateDriverClocks(targetDriverId);

    auditLog(req.user.id, 'ELD_STATUS_CHANGE', 'eld_duty_events', newEvent.id, { duty_status, odometer_miles }, getClientIp(req));

    res.json({
      ok: true,
      message: `Duty status updated to ${duty_status.replace(/_/g, ' ')}.`,
      event: newEvent,
      ...clocks
    });
  } catch (err) {
    console.error('[ELD Status Change] Error:', err);
    res.status(500).json({ error: 'Could not change duty status.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  await ensureTable();
  try {
    const clocks = await calculateDriverClocks(req.user.id);
    res.json({
      ok: true,
      driver_id: req.user.id,
      source: 'software_logbook',
      note: 'These clocks are from Shipping Wish duty events, not a registered ELD unless an ELD account is connected on ELD Desk.',
      ...clocks
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not calculate HOS clocks.' });
  }
});

// GET /api/eld/clocks/:driverId — Get live HOS clocks
router.get('/clocks/:driverId', requireAuth, async (req, res) => {
  await ensureTable();
  const driverId = parseInt(req.params.driverId, 10);
  if (isNaN(driverId)) return res.status(400).json({ error: 'Invalid driver ID.' });

  try {
    const clocks = await calculateDriverClocks(driverId);
    res.json({ ok: true, driver_id: driverId, ...clocks });
  } catch (err) {
    console.error('[Get Clocks] Error:', err);
    res.status(500).json({ error: 'Could not calculate HOS clocks.' });
  }
});

// GET /api/eld/fleet-status — Fleet roster of active duty statuses
router.get('/fleet-status', requireAuth, async (req, res) => {
  await ensureTable();
  try {
    const driversRes = await pool.query(`
      SELECT u.id, u.name, u.email, u.company_name, u.mc_number, u.phone
      FROM users u
      WHERE u.role::text IN ('carrier', 'super_admin', 'admin')
      ORDER BY u.id ASC
      LIMIT 20
    `);

    const fleet = [];
    for (const d of driversRes.rows) {
      const clocks = await calculateDriverClocks(d.id);
      fleet.push({
        id: d.id,
        name: d.name,
        company: d.company_name || '',
        mc_number: d.mc_number || '',
        phone: d.phone,
        current_status: clocks.current_status,
        driving_remaining: clocks.clocks.driving_11h.remaining_formatted,
        shift_remaining: clocks.clocks.shift_14h.remaining_formatted,
        cycle_remaining: clocks.clocks.cycle_70h.remaining_formatted,
        violations: clocks.violations.count
      });
    }

    const { rows: providerDrivers } = await pool.query(`
      SELECT d.*, c.provider, c.account_label
      FROM eld_drivers d
      JOIN eld_connections c ON c.id = d.connection_id
      ORDER BY d.updated_at DESC
      LIMIT 100
    `).catch(() => ({ rows: [] }));

    providerDrivers.forEach((d) => {
      fleet.push({
        id: 'eld-' + d.id,
        name: d.name,
        company: d.account_label || '',
        mc_number: '',
        phone: d.phone,
        current_status: d.duty_status || 'OFF_DUTY',
        driving_remaining: d.drive_remaining_minutes != null ? `${Math.floor(d.drive_remaining_minutes / 60)}h ${d.drive_remaining_minutes % 60}m` : '—',
        shift_remaining: d.shift_remaining_minutes != null ? `${Math.floor(d.shift_remaining_minutes / 60)}h ${d.shift_remaining_minutes % 60}m` : '—',
        cycle_remaining: d.cycle_remaining_minutes != null ? `${Math.floor(d.cycle_remaining_minutes / 60)}h ${d.cycle_remaining_minutes % 60}m` : '—',
        violations: 0,
        source: d.provider
      });
    });

    res.json({ ok: true, count: fleet.length, drivers: fleet, note: 'Logbook rows are software duty events. Rows with a source are from a connected ELD API.' });
  } catch (err) {
    console.error('[Fleet Status] Error:', err);
    res.status(500).json({ error: 'Could not fetch fleet ELD status.' });
  }
});

function codeForDuty(status) {
  if (status === 'DRIVING') return 'D';
  if (status === 'ON_DUTY_NOT_DRIVING') return 'ON';
  if (status === 'SLEEPER_BERTH') return 'SB';
  return 'OFF';
}

function hoursLabel(hours) {
  return `${(Math.round(hours * 10) / 10).toFixed(1)}h`;
}

// GET /api/eld/logs/daily/:driverId/pdf — software logbook sheet from recorded duty events
router.get('/logs/daily/:driverId/pdf', requireAuth, async (req, res) => {
  await ensureTable();
  const driverId = parseInt(req.params.driverId, 10);
  if (isNaN(driverId)) return res.status(400).json({ error: 'Invalid driver ID.' });

  try {
    const driverRes = await pool.query(
      `SELECT id, name, email, company_name, mc_number, dot_number, phone FROM users WHERE id = $1`,
      [driverId]
    );
    if (!driverRes.rows.length) return res.status(404).json({ error: 'Driver not found.' });
    const driver = driverRes.rows[0];
    const clocks = await calculateDriverClocks(driverId);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const eventsRes = await pool.query(
      `SELECT duty_status, started_at, ended_at, location_city, location_state, gps_lat, gps_lon, odometer_miles
       FROM eld_duty_events WHERE driver_id = $1 AND started_at >= $2 ORDER BY started_at ASC`,
      [driverId, start]
    );
    const now = new Date();
    const dayMs = 24 * 3600 * 1000;
    const segments = eventsRes.rows.map((e) => {
      const from = Math.max(0, new Date(e.started_at) - start);
      const to = Math.min(dayMs, (e.ended_at ? new Date(e.ended_at) : now) - start);
      return {
        code: codeForDuty(e.duty_status),
        startHour: from / 3600000,
        endHour: Math.max(from, to) / 3600000
      };
    }).filter((s) => s.endHour > s.startHour);

    const hours = { OFF: 0, SB: 0, D: 0, ON: 0 };
    segments.forEach((s) => { hours[s.code] = (hours[s.code] || 0) + (s.endHour - s.startHour); });

    const doc = new PDFDocument({ margin: 28, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="SW_Logbook_${driverId}.pdf"`);
    doc.pipe(res);

    doc.rect(28, 28, 556, 50).fill('#0B192C');
    doc.fontSize(15).fillColor('#FFFFFF').font('Helvetica-Bold').text("DRIVER'S DAILY LOG — SOFTWARE LOGBOOK", 38, 38);
    doc.fontSize(8.5).fillColor('#93C5FD').font('Helvetica').text('Shipping Wish duty events. Not a registered ELD transfer unless a Motive/Samsara/Geotab account is connected.', 38, 56);
    doc.fontSize(10).fillColor('#FBBF24').font('Helvetica-Bold').text(`DATE: ${new Date().toISOString().slice(0, 10)}`, 430, 44, { align: 'right', width: 140 });

    let y = 86;
    doc.rect(28, y, 274, 80).fillAndStroke('#FFFFFF', '#CBD5E1');
    doc.rect(310, y, 274, 80).fillAndStroke('#FFFFFF', '#CBD5E1');
    doc.fontSize(7.5).fillColor('#2563EB').font('Helvetica-Bold').text('MOTOR CARRIER INFORMATION', 34, y + 6);
    doc.fontSize(9).fillColor('#1E293B').font('Helvetica-Bold').text(driver.company_name || '—', 34, y + 18);
    doc.fontSize(7.5).fillColor('#64748B').font('Helvetica')
       .text(`USDOT: ${driver.dot_number || '—'} • MC/MX: ${driver.mc_number || '—'}`, 34, y + 30)
       .text('Blank fields were not on file. Nothing here is invented.', 34, y + 42)
       .text(`Events today: ${eventsRes.rows.length}`, 34, y + 54);

    doc.fontSize(7.5).fillColor('#2563EB').font('Helvetica-Bold').text('DRIVER', 316, y + 6);
    doc.fontSize(9).fillColor('#1E293B').font('Helvetica-Bold').text(driver.name || '—', 316, y + 18);
    doc.fontSize(7.5).fillColor('#64748B').font('Helvetica')
       .text(driver.email || '', 316, y + 30)
       .text(`Current status: ${(clocks.current_status || 'OFF_DUTY').replace(/_/g, ' ')}`, 316, y + 42)
       .text(`11h remaining: ${clocks.clocks.driving_11h.remaining_formatted}`, 316, y + 54);

    y = 175;
    doc.fontSize(10).fillColor('#0B192C').font('Helvetica-Bold').text('24-HOUR DUTY STATUS GRID (FROM RECORDED EVENTS)', 28, y);
    y += 16;

    const gridX = 140;
    const gridWidth = 400;
    const hourWidth = gridWidth / 24;
    const rowHeight = 26;
    const statuses = [
      { label: '1. OFF DUTY', code: 'OFF', color: '#94A3B8' },
      { label: '2. SLEEPER BERTH', code: 'SB', color: '#8B5CF6' },
      { label: '3. DRIVING', code: 'D', color: '#34D399' },
      { label: '4. ON DUTY (NOT DRIVING)', code: 'ON', color: '#FBBF24' }
    ];

    doc.rect(gridX, y, gridWidth, 14).fill('#0E1A2D');
    doc.fontSize(6).fillColor('#FFFFFF').font('Helvetica-Bold');
    for (let h = 0; h <= 24; h++) {
      const hx = gridX + (h * hourWidth);
      doc.text(h === 0 ? 'M' : h === 12 ? 'N' : String(h), hx - 4, y + 4, { width: 8, align: 'center' });
    }
    y += 14;

    statuses.forEach((st, idx) => {
      const rowY = y + (idx * rowHeight);
      doc.rect(28, rowY, gridX - 28, rowHeight).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fontSize(7.5).fillColor('#1E293B').font('Helvetica-Bold').text(st.label, 34, rowY + 8);
      doc.rect(gridX, rowY, gridWidth, rowHeight).fillAndStroke('#FFFFFF', '#E2E8F0');
      for (let h = 1; h < 24; h++) {
        const hx = gridX + (h * hourWidth);
        doc.moveTo(hx, rowY).lineTo(hx, rowY + rowHeight).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
      }
      segments.filter((s) => s.code === st.code).forEach((s) => {
        const x = gridX + (s.startHour * hourWidth);
        const w = Math.max(1, (s.endHour - s.startHour) * hourWidth);
        doc.rect(x, rowY + 6, w, rowHeight - 12).fill(st.color);
      });
      doc.rect(gridX + gridWidth + 2, rowY, 40, rowHeight).fillAndStroke('#F1F5F9', '#CBD5E1');
      doc.fontSize(8).fillColor('#0F172A').font('Helvetica-Bold').text(hoursLabel(hours[st.code] || 0), gridX + gridWidth + 4, rowY + 8, { width: 36, align: 'center' });
    });

    y += (statuses.length * rowHeight) + 16;
    doc.fontSize(10).fillColor('#0B192C').font('Helvetica-Bold').text('HOURS OF SERVICE RECAP (SOFTWARE CLOCKS)', 28, y);
    y += 16;
    doc.rect(28, y, 556, 68).fillAndStroke('#FFFFFF', '#CBD5E1');
    const driveH = (hours.D || 0).toFixed(1);
    const onH = ((hours.D || 0) + (hours.ON || 0)).toFixed(1);
    doc.fontSize(8).fillColor('#475569').font('Helvetica')
       .text(`A. Driving today: ${driveH} hours`, 36, y + 8)
       .text(`B. On-duty today (drive + on duty): ${onH} hours`, 36, y + 22)
       .text(`C. 70-hour cycle used: ${clocks.clocks.cycle_70h.used_minutes} minutes`, 36, y + 36)
       .text(eventsRes.rows.length ? 'D. Grid is drawn from saved duty events only.' : 'D. No duty events saved today — grid is blank on purpose.', 36, y + 50);
    doc.fontSize(8).fillColor('#334155').font('Helvetica-Bold')
       .text(`11h remaining: ${clocks.clocks.driving_11h.remaining_formatted}`, 320, y + 8)
       .text(`14h remaining: ${clocks.clocks.shift_14h.remaining_formatted}`, 320, y + 22)
       .text(`70h remaining: ${clocks.clocks.cycle_70h.remaining_formatted}`, 320, y + 36)
       .text('Not a roadside ELD transfer', 320, y + 50);

    y += 84;
    doc.rect(28, y, 556, 80).fillAndStroke('#FFF7ED', '#FDBA74');
    doc.fontSize(9.5).fillColor('#9A3412').font('Helvetica-Bold').text('WHAT THIS PDF IS', 36, y + 10);
    doc.fontSize(8).fillColor('#7C2D12').font('Helvetica')
       .text('This is a Shipping Wish software logbook printout. A registered ELD (Motive, Samsara, Geotab, or other FMCSA-registered device) is still required when the ELD rule applies. Connect that account on ELD Desk to show live GPS and vendor HOS clocks.', 36, y + 26, { width: 520 })
       .text(`Driver on file: ${driver.name || '—'}`, 36, y + 56);

    doc.fontSize(7).fillColor('#94A3B8').font('Helvetica')
       .text('Shipping Wish LLC software logbook • Connect an official ELD API for live GPS/HOS', 28, 750, { align: 'center', width: 556 });

    doc.end();
  } catch (err) {
    console.error('[ELD PDF] Error:', err);
    res.status(500).json({ error: 'Could not generate Driver Daily Log PDF.' });
  }
});

module.exports = router;
