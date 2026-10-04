const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { sendTwilioSms } = require('./voip');
const { logSmsMessage, OUR_NUMBER } = require('../utils/sms-inbox');
const { assertPublicHttps, ensureBoardSchema, syncSource, syncDueSources } = require('../utils/loadboard-sync');
const { isWithinTcpaHours } = require('../utils/us-timezones');
const { parseHomeDays, formatHomeDays } = require('../utils/dispatch-home-time');
const brain = require('../utils/dispatch-brain');
const { parseDatInput, formatDriverSms } = require('../utils/dat-load-parser');
const { sendBrandedEmail } = require('../utils/mailer');
const { COMPANY } = require('../utils/email-templates');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });
const { parseRateCon, auditRateCon } = require('../utils/ratecon-audit');
const { getCarrierProfile, buildBrokerPacketEmail, sendPacketToBroker } = require('../utils/carrier-packet');
const { scanPodDocument, generateCarrierInvoice, submitToFactoring } = require('../utils/pod-scanner');
const { generateTrackingToken } = require('./broker-tracking');

const router = express.Router();
const staff = [requireAuth, requireRole('admin', 'super_admin', 'dispatcher')];
const driverOrStaff = [requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'driver', 'carrier')];

function maskKey(value) {
  const text = String(value || '');
  if (!text) return '';
  return `••••${text.slice(-4)}`;
}

function morningText(carrier) {
  const where = carrier.empty_zip ? ` Last empty ZIP on file: ${carrier.empty_zip}.` : '';
  return `Shipping Wish: Good morning ${carrier.contact_name || carrier.company_name}. Reply with the ZIP you are empty in and where you want to go. Example: 75201 to Atlanta.${where}`;
}

router.get('/sources', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { rows } = await pool.query(
      `SELECT id, name, base_url, header_name, enabled, last_sync_at, last_status, last_error, created_at,
              CASE WHEN api_key IS NULL OR api_key = '' THEN '' ELSE 'set' END AS key_state,
              api_key
       FROM loadboard_api_sources ORDER BY id DESC`
    );
    res.json({
      ok: true,
      sources: rows.map((row) => ({ ...row, api_key: maskKey(row.api_key) }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load load-board API sources.' });
  }
});

router.post('/sources', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const name = String(req.body.name || '').trim();
    const headerName = String(req.body.header_name || 'Authorization').trim().slice(0, 60) || 'Authorization';
    const apiKey = String(req.body.api_key || '').trim();
    if (!/^[A-Za-z0-9-]{1,60}$/.test(headerName) || /[\r\n]/.test(apiKey)) {
      return res.status(400).json({ error: 'Header name must be letters, numbers, or hyphens, and the API key must be one line.' });
    }
    if (!name) return res.status(400).json({ error: 'Name the load board.' });
    const baseUrl = assertPublicHttps(req.body.base_url);
    const { rows } = await pool.query(
      `INSERT INTO loadboard_api_sources (name, base_url, api_key, header_name)
       VALUES ($1, $2, $3, $4) RETURNING id, name, base_url, header_name, enabled`,
      [name, baseUrl, apiKey || null, headerName]
    );
    res.json({ ok: true, source: rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save this API.' });
  }
});

router.post('/sources/sync-due', ...staff, async (req, res) => {
  try {
    const results = await syncDueSources();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: 'Could not refresh load-board APIs.' });
  }
});

router.post('/sources/:id/sync', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { rows } = await pool.query('SELECT * FROM loadboard_api_sources WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Source not found.' });
    const result = await syncSource(rows[0], { force: true });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Could not sync this API.' });
  }
});

router.delete('/sources/:id', ...staff, async (req, res) => {
  try {
    await pool.query('DELETE FROM loadboard_api_sources WHERE id = $1', [req.params.id]);
    await pool.query(`UPDATE loads SET status = 'expired', updated_at = now() WHERE source_type = 'api' AND source_id = $1 AND status = 'new'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove this API.' });
  }
});

router.get('/carriers', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    await sendDueMorningTexts().catch(() => {});
    await brain.sendDueEmptySoonOffers().catch(() => {});
    const { rows } = await pool.query('SELECT * FROM ai_dispatch_carriers ORDER BY created_at DESC');
    res.json({ ok: true, carriers: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load AI dispatch carriers.' });
  }
});

router.post('/carriers', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const company = String(req.body.company_name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const truckNumber = String(req.body.truck_number || '').trim() || '101';
    const status = String(req.body.status || 'active').trim();
    if (!company || !phone) return res.status(400).json({ error: 'Company and phone are required.' });
    const consent = [true, 'true', 'on', '1', 'yes'].includes(req.body.sms_consent);
    const prefs = carrierPrefs(req.body);
    const { rows } = await pool.query(
      `INSERT INTO ai_dispatch_carriers (company_name, truck_number, contact_name, phone, email, equipment, empty_zip, prefer_destination, status, sms_consent, sms_consent_at,
         mc_number, dot_number, min_rpm, max_deadhead, home_state, avoid_states, home_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $10 THEN now() ELSE NULL END, $11,$12,$13, COALESCE($14, 150), $15,$16,$17) RETURNING *`,
      [
        company,
        truckNumber,
        String(req.body.contact_name || '').trim() || null,
        phone,
        String(req.body.email || '').trim() || null,
        String(req.body.equipment || '').trim() || null,
        String(req.body.empty_zip || '').trim() || null,
        String(req.body.prefer_destination || '').trim() || null,
        status,
        consent,
        prefs.mc_number, prefs.dot_number, prefs.min_rpm, prefs.max_deadhead, prefs.home_state, prefs.avoid_states, prefs.home_days
      ]
    );

    // Also auto-sync to trucks table for Load Planning & Fleet ERP
    try {
      const existingUser = await pool.query('SELECT id FROM users WHERE company_name ILIKE $1 OR name ILIKE $1 LIMIT 1', [company]);
      const carrierUserId = existingUser.rows[0] ? existingUser.rows[0].id : null;
      if (carrierUserId) {
        await pool.query(
          `INSERT INTO trucks (carrier_id, truck_number, status)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [carrierUserId, truckNumber, status]
        ).catch(() => {});
      }
    } catch (_) {}

    res.json({ ok: true, carrier: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not add this carrier: ' + err.message });
  }
});

function carrierPrefs(body) {
  const digits = (v) => String(v || '').replace(/\D/g, '').slice(0, 10) || null;
  const states = (v) => String(v || '').toUpperCase().split(/[^A-Z]+/).filter((s) => s.length === 2).slice(0, 20).join(',') || null;
  const minRpm = Number(body.min_rpm);
  const maxDeadhead = Number(body.max_deadhead);
  return {
    mc_number: digits(body.mc_number),
    dot_number: digits(body.dot_number),
    min_rpm: Number.isFinite(minRpm) && minRpm > 0 && minRpm < 20 ? Math.round(minRpm * 100) / 100 : null,
    max_deadhead: Number.isFinite(maxDeadhead) && maxDeadhead >= 10 && maxDeadhead <= 600 ? Math.round(maxDeadhead) : null,
    home_state: states(body.home_state) ? states(body.home_state).slice(0, 2) : null,
    avoid_states: states(body.avoid_states),
    home_days: formatHomeDays(parseHomeDays(body.home_days)) || null
  };
}

router.patch('/carriers/:id', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const prefs = carrierPrefs(req.body);
    const text = (key) => (key in req.body ? String(req.body[key] || '').trim() || null : undefined);
    const fields = {
      contact_name: text('contact_name'),
      email: text('email'),
      equipment: text('equipment'),
      empty_zip: text('empty_zip'),
      prefer_destination: text('prefer_destination'),
      mc_number: 'mc_number' in req.body ? prefs.mc_number : undefined,
      dot_number: 'dot_number' in req.body ? prefs.dot_number : undefined,
      min_rpm: 'min_rpm' in req.body ? prefs.min_rpm : undefined,
      max_deadhead: 'max_deadhead' in req.body ? (prefs.max_deadhead || 150) : undefined,
      home_state: 'home_state' in req.body ? prefs.home_state : undefined,
      avoid_states: 'avoid_states' in req.body ? prefs.avoid_states : undefined,
      home_days: 'home_days' in req.body ? prefs.home_days : undefined
    };
    const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update.' });
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE ai_dispatch_carriers SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...keys.map((k) => fields[k])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Carrier not found.' });
    res.json({ ok: true, carrier: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update this carrier.' });
  }
});

router.get('/carriers/:id/messages', ...staff, async (req, res) => {
  try {
    res.json({ ok: true, messages: await brain.carrierMessages(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load the conversation.' });
  }
});

router.post('/preview', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const text = String(req.body.text || '').trim().slice(0, 600);
    if (!text) return res.status(400).json({ error: 'Type a carrier message to test.' });
    let carrier = { id: 0, company_name: 'Test carrier', equipment: 'Dry Van', max_deadhead: 150 };
    if (req.body.carrier_id) {
      const { rows } = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE id = $1', [req.body.carrier_id]);
      if (!rows[0]) return res.status(404).json({ error: 'Carrier not found.' });
      carrier = rows[0];
    }
    res.json({ ok: true, ...(await brain.preview(carrier, text)) });
  } catch (err) {
    res.status(500).json({ error: 'Could not run the preview.' });
  }
});

/**
 * GET /api/dispatch-desk/roster
 * Merged Operational Roster: Fleet Trucks, Assigned Drivers, Active Carriers, and Real-time Status
 */
router.get('/roster', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();

    // 1. Fetch AI dispatch carriers
    let carriers = [];
    try {
      const carriersRes = await pool.query(`
        SELECT c.*, COALESCE(c.truck_number, '101') AS truck_number
        FROM ai_dispatch_carriers c
        ORDER BY c.id DESC
      `);
      carriers = carriersRes.rows;
    } catch (e) {
      console.warn('[Roster] Carriers fetch error:', e.message);
    }

    // 2. Fetch fleet trucks with assigned driver & carrier company
    let trucks = [];
    try {
      const trucksRes = await pool.query(`
        SELECT t.id AS truck_id, t.truck_number, t.vin, t.plate, t.status AS truck_status,
               t.mileage, t.carrier_id,
               u.company_name, u.name AS owner_name, u.phone AS company_phone, u.mc_number, u.dot_number,
               d.id AS driver_id, d.name AS driver_name, d.phone AS driver_phone
        FROM trucks t
        LEFT JOIN users u ON u.id = t.carrier_id
        LEFT JOIN drivers d ON d.assigned_truck_id = t.id AND d.deleted_at IS NULL
        ORDER BY t.truck_number ASC
      `);
      trucks = trucksRes.rows;
    } catch (e) {
      console.warn('[Roster] Trucks fetch error:', e.message);
    }

    // 3. Count board stats
    const openLoadsCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM loads WHERE status = 'new'`).catch(() => ({ rows: [{ count: 0 }] }));
    const bookedTodayRes = await pool.query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(rate), 0)::numeric AS revenue 
      FROM loads 
      WHERE status = 'booked' AND updated_at >= CURRENT_DATE
    `).catch(() => ({ rows: [{ count: 0, revenue: 0 }] }));

    // 4. Merge into unified operational units
    const roster = [];
    for (const c of carriers) {
      const matchedTruck = trucks.find(t => 
        (t.truck_number && c.truck_number && String(t.truck_number) === String(c.truck_number)) || 
        (t.company_name && c.company_name && t.company_name.toLowerCase() === c.company_name.toLowerCase())
      );

      roster.push({
        id: c.id,
        carrier_id: c.id,
        truck_id: matchedTruck ? matchedTruck.truck_id : null,
        company_name: c.company_name,
        contact_name: c.contact_name || (matchedTruck ? matchedTruck.driver_name : 'Primary Driver'),
        phone: c.phone || (matchedTruck ? matchedTruck.driver_phone : ''),
        driver_name: matchedTruck ? matchedTruck.driver_name : (c.contact_name || 'Driver'),
        driver_phone: matchedTruck ? (matchedTruck.driver_phone || c.phone) : c.phone,
        truck_number: c.truck_number || (matchedTruck ? matchedTruck.truck_number : '101'),
        equipment: c.equipment || '26ft Box Truck',
        empty_zip: c.empty_zip || c.last_location || 'Hopkinsville, KY',
        prefer_destination: c.prefer_destination || 'Anywhere (High RPM)',
        mc_number: c.mc_number || (matchedTruck ? matchedTruck.mc_number : ''),
        dot_number: c.dot_number || (matchedTruck ? matchedTruck.dot_number : ''),
        min_rpm: parseFloat(c.min_rpm) || 2.00,
        max_deadhead: parseInt(c.max_deadhead, 10) || 150,
        status: c.status || 'active',
        sms_consent: Boolean(c.sms_consent),
        last_sms_at: c.last_sms_at
      });
    }

    // Add standalone trucks not yet linked to an ai_dispatch_carrier record
    for (const t of trucks) {
      const exists = roster.some(r => String(r.truck_number) === String(t.truck_number));
      if (!exists) {
        roster.push({
          id: `truck_${t.truck_id}`,
          carrier_id: null,
          truck_id: t.truck_id,
          company_name: t.company_name || 'Fleet Truck Unit',
          contact_name: t.driver_name || 'Driver',
          phone: t.driver_phone || t.company_phone || '',
          driver_name: t.driver_name || 'Driver',
          driver_phone: t.driver_phone || t.company_phone || '',
          truck_number: t.truck_number || '101',
          equipment: 'Dry Van',
          empty_zip: 'Dallas, TX',
          prefer_destination: 'Anywhere',
          mc_number: t.mc_number || '',
          dot_number: t.dot_number || '',
          min_rpm: 2.00,
          max_deadhead: 150,
          status: t.truck_status || 'active',
          sms_consent: true,
          last_sms_at: null
        });
      }
    }

    // If completely empty (e.g. dev environment), provide primary unit
    if (!roster.length) {
      roster.push({
        id: 1,
        carrier_id: 1,
        truck_id: 101,
        company_name: 'Shipping Wish Fleet Operations',
        contact_name: 'Primary Driver',
        phone: '+1 (555) 019-2834',
        driver_name: 'Primary Driver',
        driver_phone: '+1 (555) 019-2834',
        truck_number: '101',
        equipment: '26ft Box Truck',
        empty_zip: 'Hopkinsville, KY',
        prefer_destination: 'DIBERSVILLE, MS',
        mc_number: '1692841',
        dot_number: '4319852',
        min_rpm: 2.00,
        max_deadhead: 150,
        status: 'active',
        sms_consent: true,
        last_sms_at: null
      });
    }

    res.json({
      ok: true,
      roster,
      stats: {
        total_trucks: roster.length,
        ready_empty: roster.filter(r => r.status === 'active' || r.status === 'ready' || r.status === 'waiting').length,
        open_loads: openLoadsCountRes.rows[0]?.count || 0,
        booked_today: bookedTodayRes.rows[0]?.count || 0,
        revenue_today: parseFloat(bookedTodayRes.rows[0]?.revenue || 0)
      }
    });
  } catch (err) {
    console.error('[Roster Error]', err);
    res.status(500).json({ error: 'Could not load dispatch roster: ' + err.message });
  }
});

/**
 * POST /api/dispatch-desk/match-truck
 * AI Match Engine: Matches specific truck/carrier specs against live DAT & board loads
 */
router.post('/match-truck', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { carrier_id, truck_number, origin, destination, equipment, min_rpm, max_deadhead, limit } = req.body;

    let carrier = null;
    if (carrier_id && !String(carrier_id).startsWith('truck_')) {
      const cRes = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE id = $1', [carrier_id]);
      carrier = cRes.rows[0];
    }
    if (!carrier) {
      carrier = {
        id: 0,
        company_name: 'Fleet Unit',
        equipment: equipment || 'Box Truck',
        empty_zip: origin || 'Hopkinsville, KY',
        prefer_destination: destination || 'Anywhere',
        min_rpm: min_rpm ? parseFloat(min_rpm) : 2.00,
        max_deadhead: max_deadhead ? parseInt(max_deadhead, 10) : 200,
        truck_number: truck_number || '101'
      };
    }

    const effectiveOrigin = origin || carrier.empty_zip || carrier.last_location || 'Hopkinsville, KY';
    const effectiveDest = destination || carrier.prefer_destination || 'Anywhere';
    const effectiveEquip = equipment || carrier.equipment || 'Box Truck';

    const parsedOrigin = brain.parseOrigin(effectiveOrigin) || { city: effectiveOrigin };
    const parsedDest = brain.parseDestination(effectiveDest, carrier);

    // Call findMatches from brain
    const matchResult = await brain.findMatches(carrier, {
      origin: parsedOrigin,
      destination: parsedDest,
      equipment: effectiveEquip,
      limit: limit || 15
    });

    let matchedLoads = (matchResult.matches || []).concat(matchResult.others || []);

    // If zero matches found, fallback to active loads ordered by date/rate
    if (!matchedLoads.length) {
      const fallbackLoadsRes = await pool.query(`
        SELECT * FROM loads 
        WHERE status = 'new' AND rate > 0
        ORDER BY created_at DESC 
        LIMIT 10
      `);
      matchedLoads = fallbackLoadsRes.rows.map(l => ({
        load: l,
        deadhead: 35,
        loaded: l.miles || 500,
        allInRpm: l.miles ? parseFloat((l.rate / (l.miles + 35)).toFixed(2)) : 2.50,
        loadedRpm: l.miles ? parseFloat((l.rate / l.miles).toFixed(2)) : 2.75,
        estimated: true
      }));
    }

    // Format loads for presentation & 1-click dispatching
    const enriched = matchedLoads.map((m, idx) => {
      const l = m.load || m;
      const deadhead = m.deadhead != null ? m.deadhead : 35;
      const loaded = m.loaded || l.miles || 500;
      const allInRpm = m.allInRpm || (loaded + deadhead > 0 ? parseFloat((l.rate / (loaded + deadhead)).toFixed(2)) : 2.25);
      const loadedRpm = m.loadedRpm || (loaded > 0 ? parseFloat((l.rate / loaded).toFixed(2)) : 2.50);

      const brokerEmail = l.broker_email || (l.broker_contact && l.broker_contact.includes('@') ? l.broker_contact.split('|')[0].trim() : 'broker@freightdesk.com');
      const brokerPhone = l.broker_phone || (l.broker_contact && /\d{3}/.test(l.broker_contact) ? l.broker_contact.match(/[\d(). -]{10,}/)?.[0]?.trim() : '(800) 555-0199');

      const loadObj = {
        load_id: l.id,
        load_number: l.load_number || `DAT-${l.id || (1000 + idx)}`,
        origin: l.pickup_location,
        destination: l.delivery_location,
        pickup_date: l.pickup_date,
        pickup_time: l.pickup_time || 'Today Before 5PM',
        delivery_time: l.delivery_time || 'Tomorrow 8AM - 3PM',
        rate: parseFloat(l.rate) || 0,
        dho: deadhead,
        deadhead_miles: deadhead,
        loaded_miles: loaded,
        all_in_rpm: allInRpm,
        loaded_rpm: loadedRpm,
        weight: l.weight || 5000,
        equipment_type: l.equipment_type || effectiveEquip,
        broker_name: l.broker_name || 'Verified Freight Broker',
        broker_email: brokerEmail,
        broker_phone: brokerPhone,
        notes: l.notes || '',
        suggested_carrier_id: carrier.id || null,
        suggested_truck_number: truck_number || carrier.truck_number || '101'
      };

      loadObj.formatted_sms = formatDriverSms(loadObj, loadObj.suggested_truck_number);
      return loadObj;
    });

    res.json({
      ok: true,
      count: enriched.length,
      truck_number: truck_number || carrier.truck_number || '101',
      origin: effectiveOrigin,
      destination: effectiveDest,
      equipment: effectiveEquip,
      loads: enriched
    });
  } catch (err) {
    console.error('[Match Truck Error]', err);
    res.status(500).json({ error: 'Could not match loads for truck: ' + err.message });
  }
});

/**
 * POST /api/dispatch-desk/update-truck-status
 * Live Status & Location Synchronizer for Roster Units
 */
router.post('/update-truck-status', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const {
      carrier_id,
      truck_id,
      truck_number,
      company_name,
      empty_zip,
      prefer_destination,
      equipment,
      min_rpm,
      max_deadhead,
      status,
      driver_name,
      driver_phone
    } = req.body;

    let updatedCarrier = false;

    // 1. Try to update existing ai_dispatch_carriers record
    if (carrier_id && !String(carrier_id).startsWith('truck_') && !isNaN(Number(carrier_id))) {
      const updateRes = await pool.query(`
        UPDATE ai_dispatch_carriers
        SET empty_zip = COALESCE($2, empty_zip),
            prefer_destination = COALESCE($3, prefer_destination),
            equipment = COALESCE($4, equipment),
            min_rpm = COALESCE($5, min_rpm),
            max_deadhead = COALESCE($6, max_deadhead),
            status = COALESCE($7, status),
            last_location = COALESCE($2, last_location),
            truck_number = COALESCE($8, truck_number),
            company_name = COALESCE($9, company_name),
            contact_name = COALESCE($10, contact_name),
            phone = COALESCE($11, phone)
        WHERE id = $1
        RETURNING id
      `, [
        carrier_id,
        empty_zip || null,
        prefer_destination || null,
        equipment || null,
        min_rpm ? parseFloat(min_rpm) : null,
        max_deadhead ? parseInt(max_deadhead, 10) : null,
        status || null,
        truck_number || null,
        company_name || null,
        driver_name || null,
        driver_phone || null
      ]);
      if (updateRes.rows.length > 0) {
        updatedCarrier = true;
      }
    }

    // If carrier record wasn't updated (e.g. was fallback demo unit or standalone truck), insert real record
    if (!updatedCarrier && (company_name || truck_number)) {
      await pool.query(`
        INSERT INTO ai_dispatch_carriers (company_name, truck_number, contact_name, phone, equipment, empty_zip, prefer_destination, status, min_rpm, max_deadhead, sms_consent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        RETURNING id
      `, [
        company_name || 'Shipping Wish Fleet Operations',
        truck_number || '101',
        driver_name || 'Driver',
        driver_phone || '+1 (555) 019-2834',
        equipment || '26ft Box Truck',
        empty_zip || 'Hopkinsville, KY',
        prefer_destination || 'Anywhere (High RPM)',
        status || 'active',
        min_rpm ? parseFloat(min_rpm) : 2.00,
        max_deadhead ? parseInt(max_deadhead, 10) : 150
      ]).catch(() => {});
    }

    // 2. Also update trucks table if truck_id exists, or if truck_number exists
    if (truck_id && !String(truck_id).startsWith('101')) {
      await pool.query(`
        UPDATE trucks
        SET status = COALESCE($2, status)
        WHERE id = $1
      `, [truck_id, status || null]).catch(() => {});

      if (driver_name || driver_phone) {
        await pool.query(`
          UPDATE drivers
          SET name = COALESCE($2, name),
              phone = COALESCE($3, phone)
          WHERE assigned_truck_id = $1
        `, [truck_id, driver_name || null, driver_phone || null]).catch(() => {});
      }
    }

    if (truck_number) {
      await pool.query(`
        UPDATE trucks
        SET status = COALESCE($2, status)
        WHERE truck_number = $1
      `, [truck_number, status || null]).catch(() => {});
    }

    res.json({ ok: true, message: 'Truck status and location updated successfully.' });
  } catch (err) {
    console.error('[Update Truck Status Error]', err);
    res.status(500).json({ error: 'Could not update truck status: ' + err.message });
  }
});

router.post('/carriers/:id/send-loads', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { rows } = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE id = $1', [req.params.id]);
    const carrier = rows[0];
    if (!carrier) return res.status(404).json({ error: 'Carrier not found.' });
    if (!carrier.sms_consent) return res.status(422).json({ error: 'This carrier has not agreed to texts.' });
    if (!isWithinTcpaHours(carrier.phone).allowed) return res.status(422).json({ error: "Outside the carrier's local 9am–5pm texting hours." });
    const result = await brain.sendLoadsNow(carrier);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Could not send loads to this carrier.' });
  }
});

router.post('/carriers/:id/empty-soon', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { rows } = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE id = $1', [req.params.id]);
    const carrier = rows[0];
    if (!carrier) return res.status(404).json({ error: 'Carrier not found.' });
    if (!carrier.sms_consent) return res.status(422).json({ error: 'This carrier has not agreed to texts.' });
    if (!isWithinTcpaHours(carrier.phone).allowed) return res.status(422).json({ error: "Outside the carrier's local 9am–5pm texting hours." });
    const result = await brain.sendEmptySoonNow(carrier);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Could not send the empty-soon loads.' });
  }
});

router.get('/offers', ...driverOrStaff, async (req, res) => {
  try {
    let offers = await brain.listOffers();
    const carrierId = req.query.carrier_id || (req.user && req.user.carrier_id);
    if (carrierId) {
      offers = offers.filter(o => String(o.carrier_id) === String(carrierId));
    }
    res.json({ ok: true, offers });
  } catch (err) {
    res.status(500).json({ error: 'Could not load dispatch offers.' });
  }
});

router.post('/offers/:id/booked', ...driverOrStaff, async (req, res) => {
  try {
    const isDriver = req.user && (req.user.role === 'driver' || req.user.role === 'carrier');
    const note = req.body.note || (isDriver ? `Driver locked load via Mobile App (${req.user.name || req.user.email || 'Driver'})` : '');
    const result = await brain.markBooked(req.params.id, String(note).slice(0, 200));
    if (!result) return res.status(404).json({ error: 'Offer not found.' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not mark this booked.' });
  }
});

router.post('/offers/:id/release', ...driverOrStaff, async (req, res) => {
  try {
    const isDriver = req.user && (req.user.role === 'driver' || req.user.role === 'carrier');
    const reason = req.body.reason || (isDriver ? `Driver passed load via Mobile App (${req.user.name || req.user.email || 'Driver'})` : 'Released by staff');
    const result = await brain.releaseOffer(req.params.id, String(reason).slice(0, 200));
    if (!result) return res.status(404).json({ error: 'Offer not found.' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not release this offer.' });
  }
});

async function deliverMorning(carrier) {
  const text = morningText(carrier);
  let smsStatus = 'logged';
  try {
    const sent = await sendTwilioSms(carrier.phone, text);
    smsStatus = sent.status || 'sent';
    if (smsStatus === 'sent' || smsStatus === 'logged') {
      await logSmsMessage({
        direction: 'outbound',
        from_number: OUR_NUMBER,
        to_number: carrier.phone,
        body: sent.body || text,
        twilio_sid: sent.sid,
        disposition: smsStatus,
        is_read: true
      }).catch(() => {});
    }
  } catch (err) {
    smsStatus = 'error';
  }
  const updated = await pool.query(
    `UPDATE ai_dispatch_carriers
     SET status = 'active', last_sms_at = now(), last_sms_status = $2
     WHERE id = $1 RETURNING *`,
    [carrier.id, smsStatus]
  );
  return updated.rows[0];
}

async function startCarrier(id) {
  const { rows } = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE id = $1', [id]);
  const carrier = rows[0];
  if (!carrier) return null;
  if (!carrier.sms_consent) {
    const updated = await pool.query(
      `UPDATE ai_dispatch_carriers SET last_sms_status = $2 WHERE id = $1 RETURNING *`,
      [id, 'Needs text consent before Start']
    );
    return updated.rows[0];
  }
  const tcpa = isWithinTcpaHours(carrier.phone);
  if (!tcpa.allowed) {
    const updated = await pool.query(
      `UPDATE ai_dispatch_carriers
       SET status = 'active', last_sms_status = $2
       WHERE id = $1 RETURNING *`,
      [id, 'Waiting for local 9am–5pm']
    );
    return updated.rows[0];
  }
  return deliverMorning(carrier);
}

async function sendDueMorningTexts() {
  await ensureBoardSchema();
  const { rows } = await pool.query(
    `SELECT * FROM ai_dispatch_carriers
     WHERE status = 'active' AND sms_consent = TRUE
       AND (off_until IS NULL OR off_until < now())
       AND (last_sms_at IS NULL OR last_sms_at < now() - interval '20 hours')
     ORDER BY id`
  );
  const sent = [];
  for (const carrier of rows) {
    const tcpa = isWithinTcpaHours(carrier.phone);
    if (!tcpa.allowed) continue;
    sent.push(await deliverMorning(carrier));
  }
  return sent;
}

router.post('/carriers/start-all', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { rows } = await pool.query(`SELECT id FROM ai_dispatch_carriers ORDER BY id`);
    const carriers = [];
    for (const row of rows) carriers.push(await startCarrier(row.id));
    res.json({ ok: true, carriers });
  } catch (err) {
    res.status(500).json({ error: 'Could not start AI dispatch.' });
  }
});

router.post('/carriers/:id/start', ...staff, async (req, res) => {
  try {
    const carrier = await startCarrier(req.params.id);
    if (!carrier) return res.status(404).json({ error: 'Carrier not found.' });
    res.json({ ok: true, carrier });
  } catch (err) {
    res.status(500).json({ error: 'Could not start AI dispatch for this carrier.' });
  }
});

router.post('/carriers/:id/consent', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { rows } = await pool.query(
      `UPDATE ai_dispatch_carriers SET sms_consent = TRUE, sms_consent_at = now(), last_sms_status = 'Consent recorded' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Carrier not found.' });
    res.json({ ok: true, carrier: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not record consent.' });
  }
});

router.post('/carriers/:id/pause', ...staff, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ai_dispatch_carriers SET status = 'paused' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Carrier not found.' });
    res.json({ ok: true, carrier: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not pause this carrier.' });
  }
});

/**
 * POST /api/dispatch/parse-dat-loads
 * Parses raw text copied from DAT One / load boards (Key-Value or Table Rows)
 * and matches against available fleet trucks and carriers.
 */
router.post('/parse-dat-loads', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const text = String(req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Please provide copied DAT load text to parse.' });
    }

    const parsedLoads = parseDatInput(text);
    if (!parsedLoads.length) {
      return res.status(422).json({ error: 'Could not detect origin/destination or loads in the pasted text. Please verify the text.' });
    }

    // Fetch active carriers
    const carriersRes = await pool.query('SELECT * FROM ai_dispatch_carriers ORDER BY id DESC');
    const carriers = carriersRes.rows;

    // Fetch fleet trucks with assigned drivers if available
    let trucks = [];
    try {
      const trucksRes = await pool.query(
        `SELECT t.*, d.name as driver_name, d.phone as driver_phone
         FROM trucks t
         LEFT JOIN drivers d ON d.assigned_truck_id = t.id
         ORDER BY t.truck_number ASC`
      );
      trucks = trucksRes.rows;
    } catch {
      // trucks table might be empty or unassigned
    }

    // Enrich each parsed load with best-match fleet vehicle and SMS preview
    const enriched = parsedLoads.map((load) => {
      // Find candidate carrier
      let bestCarrier = null;
      if (carriers.length > 0) {
        // First look for equipment match
        bestCarrier = carriers.find(c => {
          if (!c.equipment) return true;
          const eq = c.equipment.toLowerCase();
          const loadEq = (load.equipment_type || '').toLowerCase();
          return loadEq.includes(eq) || eq.includes(loadEq) || (eq.includes('box') && loadEq.includes('box'));
        }) || carriers[0];
      }

      const defaultTruckNumber = trucks.length > 0 ? (trucks[0].truck_number || '101') : '101';
      const formattedSms = formatDriverSms(load, defaultTruckNumber);

      return {
        ...load,
        suggested_carrier_id: bestCarrier ? bestCarrier.id : null,
        suggested_truck_number: defaultTruckNumber,
        formatted_sms: formattedSms
      };
    });

    res.json({
      ok: true,
      count: enriched.length,
      loads: enriched,
      carriers,
      trucks
    });
  } catch (err) {
    console.error('[DAT Parse] Error:', err);
    res.status(500).json({ error: 'Could not parse DAT load text: ' + err.message });
  }
});

/**
 * POST /api/dispatch/sync-dat-bulk (and /api/dispatch-desk/sync-dat-bulk)
 * Autonomous Bulk Ingestion & Live Sync from DAT One / Extension
 */
router.post('/sync-dat-bulk', optionalAuth, async (req, res) => {
  try {
    await ensureBoardSchema();
    let loadsToProcess = [];

    if (Array.isArray(req.body.loads) && req.body.loads.length > 0) {
      loadsToProcess = req.body.loads;
    } else if (req.body.rawText || req.body.text) {
      loadsToProcess = parseDatInput(String(req.body.rawText || req.body.text || ''));
    }

    if (!loadsToProcess.length) {
      return res.status(400).json({ error: 'No loads found to sync. Provide an array of loads or raw text.' });
    }

    // Fetch active carriers & trucks for automated fleet matching
    let carriers = [];
    try {
      const carriersRes = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE paused = false ORDER BY id DESC');
      carriers = carriersRes.rows;
    } catch {}

    let trucks = [];
    try {
      const trucksRes = await pool.query(
        `SELECT t.*, d.name as driver_name, d.phone as driver_phone
         FROM trucks t
         LEFT JOIN drivers d ON d.assigned_truck_id = t.id
         ORDER BY t.truck_number ASC`
      );
      trucks = trucksRes.rows;
    } catch {}

    const insertedLoads = [];
    let skippedCount = 0;
    const matchedOffers = [];

    for (const load of loadsToProcess) {
      const origin = String(load.origin || load.pickup_location || '').trim();
      const dest = String(load.destination || load.delivery_location || '').trim();
      const rate = parseFloat(load.rate) || 0;
      const miles = parseInt(load.loaded_miles || load.miles, 10) || 0;
      const rpm = miles > 0 && rate > 0 ? parseFloat((rate / miles).toFixed(2)) : (parseFloat(load.rpm) || 0);
      const broker = String(load.broker_name || 'DAT Verified Broker').trim();
      const email = load.broker_email || null;
      const phone = load.broker_phone || null;
      const dho = parseInt(load.dho, 10) || 0;
      const weight = parseInt(load.weight, 10) || 5000;
      const equipment = load.equipment_type || '26ft Box Truck';
      const notes = load.notes || null;
      const pickupDate = load.pickup_date || new Date().toISOString().slice(0, 10);

      if (!origin || !dest) {
        skippedCount++;
        continue;
      }

      // Check deduplication (look for identical origin, destination, rate, and broker within the last 48 hours)
      const existing = await pool.query(
        `SELECT id, load_number FROM loads 
         WHERE pickup_location = $1 AND delivery_location = $2 AND rate = $3 
           AND (broker_name = $4 OR broker_contact LIKE $5)
           AND created_at > NOW() - INTERVAL '48 hours'
         LIMIT 1`,
        [origin, dest, rate, broker, email ? `%${email}%` : '%']
      );

      let loadRow = null;
      if (existing.rows.length > 0) {
        skippedCount++;
        loadRow = existing.rows[0];
      } else {
        const loadNum = load.load_id || `DAT-${Math.floor(100000 + Math.random() * 900000)}`;
        const ins = await pool.query(
          `INSERT INTO loads (
            load_number, broker_name, broker_contact, pickup_location, pickup_state,
            delivery_location, delivery_state, pickup_date, pickup_time, delivery_time,
            equipment_type, weight, miles, rate, rpm, status, source_type, notes
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'new','dat_sync',$16)
          RETURNING *`,
          [
            loadNum,
            broker,
            [email, phone].filter(Boolean).join(' | ') || null,
            origin,
            load.origin_state || null,
            dest,
            load.destination_state || null,
            pickupDate,
            load.pickup_time || 'Ready Today',
            load.delivery_time || 'Next Day',
            equipment,
            weight,
            miles,
            rate,
            rpm,
            notes
          ]
        );
        loadRow = ins.rows[0];
        insertedLoads.push(loadRow);
      }

      // Fleet Matching
      if (carriers.length > 0 && loadRow) {
        let bestCarrier = null;
        for (const c of carriers) {
          if (c.equipment) {
            const eq = c.equipment.toLowerCase();
            const loadEq = equipment.toLowerCase();
            if (loadEq.includes(eq) || eq.includes(loadEq) || (eq.includes('box') && loadEq.includes('box'))) {
              bestCarrier = c;
              break;
            }
          } else {
            bestCarrier = c;
            break;
          }
        }
        if (!bestCarrier) bestCarrier = carriers[0];

        const defaultTruck = trucks.find(t => t.truck_number === bestCarrier.truck_number) || trucks[0];
        const truckNum = defaultTruck?.truck_number || bestCarrier.truck_number || '101';
        const formattedSms = formatDriverSms(load, truckNum);

        matchedOffers.push({
          load_id: loadRow.id,
          load_number: loadRow.load_number,
          origin,
          destination: dest,
          rate,
          rpm,
          carrier_id: bestCarrier.id,
          carrier_name: bestCarrier.company_name || bestCarrier.contact_name,
          driver_phone: bestCarrier.phone,
          truck_number: truckNum,
          formatted_sms: formattedSms
        });
      }
    }

    // Broadcast newly inserted loads to LoadsNexus real-time board
    try {
      const loadboardRouter = require('./loadboard');
      if (typeof loadboardRouter.broadcastLoadboardEvent === 'function') {
        for (const l of insertedLoads) {
          loadboardRouter.broadcastLoadboardEvent('load_posted', l);
        }
      }
    } catch (e) {
      console.warn('[DAT Bulk Sync] Real-time broadcast warning:', e.message);
    }

    // Auto-cover & deduct stale DAT loads that are no longer active on the exchange
    let coveredStaleCount = 0;
    try {
      const loadboardRouter = require('./loadboard');
      const staleRes = await pool.query(
        `UPDATE loads 
         SET status = 'covered', updated_at = NOW() 
         WHERE source_type = 'dat_sync' 
           AND status = 'new' 
           AND updated_at < NOW() - INTERVAL '15 minutes'
         RETURNING id, load_number`
      );
      coveredStaleCount = staleRes.rows.length;
      if (coveredStaleCount > 0 && typeof loadboardRouter.broadcastLoadboardEvent === 'function') {
        staleRes.rows.forEach(r => {
          loadboardRouter.broadcastLoadboardEvent('load_covered', { id: r.load_number || r.id, status: 'covered', covered_at: Date.now() });
        });
      }
    } catch (e) {
      console.warn('[DAT Bulk Sync] Stale cover check warning:', e.message);
    }

    res.json({
      ok: true,
      total_received: loadsToProcess.length,
      inserted_count: insertedLoads.length,
      skipped_duplicate_count: skippedCount,
      covered_stale_count: coveredStaleCount,
      matched_count: matchedOffers.length,
      inserted_loads: insertedLoads,
      matched_offers: matchedOffers,
      message: `Successfully processed ${loadsToProcess.length} loads (${insertedLoads.length} new published to LoadsNexus, ${coveredStaleCount} covered/deducted, ${matchedOffers.length} matched to fleet).`
    });
  } catch (err) {
    console.error('[DAT Bulk Sync] Error:', err);
    res.status(500).json({ error: 'Could not sync bulk DAT loads: ' + err.message });
  }
});

/**
 * POST /api/dispatch/send-driver-offer
 * Sends the structured SMS offer directly to the driver's phone
 * and registers the offer in the AI dispatch pipeline.
 */
router.post('/send-driver-offer', ...staff, async (req, res) => {
  try {
    await ensureBoardSchema();
    const { load, carrier_id, truck_number = '101', custom_sms } = req.body;
    if (!load) return res.status(400).json({ error: 'Load details are required.' });
    if (!carrier_id) return res.status(400).json({ error: 'Target carrier is required.' });

    const carrierRes = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE id = $1', [carrier_id]);
    const carrier = carrierRes.rows[0];
    if (!carrier) return res.status(404).json({ error: 'Carrier not found.' });
    if (!carrier.phone) return res.status(400).json({ error: 'Carrier has no phone number on file.' });

    // Save or link load in loads table
    const loadNum = load.load_id || `DAT-${Math.floor(100000 + Math.random() * 900000)}`;
    let loadRow;
    const existing = await pool.query('SELECT * FROM loads WHERE load_number = $1 LIMIT 1', [loadNum]);
    if (existing.rows[0]) {
      loadRow = existing.rows[0];
    } else {
      const ins = await pool.query(
        `INSERT INTO loads (
          load_number, broker_name, broker_contact, pickup_location, pickup_state,
          delivery_location, delivery_state, pickup_time, delivery_time,
          equipment_type, weight, miles, rate, rpm, status, source_type, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'new','dat_pasted',$15) RETURNING *`,
        [
          loadNum,
          load.broker_name || 'DAT Verified Broker',
          [load.broker_email, load.broker_phone].filter(Boolean).join(' | ') || null,
          load.origin || 'Origin',
          load.origin_state || null,
          load.destination || 'Destination',
          load.destination_state || null,
          load.pickup_time || 'Ready Today',
          load.delivery_time || 'Next Day',
          load.equipment_type || '26ft Box Truck',
          load.weight || 0,
          load.loaded_miles || 0,
          load.rate || 0,
          load.rpm || 0,
          load.notes || null
        ]
      );
      loadRow = ins.rows[0];
    }

    // Insert into ai_dispatch_offers
    const offerRes = await pool.query(
      `INSERT INTO ai_dispatch_offers (
        carrier_id, load_id, batch, slot, status, origin_label, deadhead_miles, loaded_miles, all_in_rpm, broker_email, expires_at
      ) VALUES ($1, $2, $3, 1, 'offered', $4, $5, $6, $7, $8, now() + interval '3 hours') RETURNING *`,
      [
        carrier.id,
        loadRow.id,
        `dat-${Date.now()}`,
        load.origin || 'Origin',
        load.dho || 0,
        load.loaded_miles || 0,
        load.rpm || 0,
        load.broker_email || null
      ]
    );
    const offer = offerRes.rows[0];

    // Format final SMS
    const smsText = custom_sms || formatDriverSms(load, truck_number);

    // Send SMS via Twilio or fallback simulator
    let smsStatus = 'sent';
    try {
      const sent = await sendTwilioSms(carrier.phone, smsText);
      smsStatus = sent.status || 'sent';
      await logSmsMessage({
        direction: 'outbound',
        from_number: OUR_NUMBER,
        to_number: carrier.phone,
        body: smsText,
        twilio_sid: sent.sid,
        disposition: smsStatus,
        is_read: true
      }).catch(() => {});
    } catch (err) {
      smsStatus = 'simulated';
    }

    // Log in dispatch conversation
    await pool.query(
      `INSERT INTO ai_dispatch_messages (carrier_id, direction, body, intent)
       VALUES ($1, 'outbound', $2, 'dat_load_offer')`,
      [carrier.id, smsText]
    ).catch(() => {});

    await pool.query(
      `UPDATE ai_dispatch_carriers SET last_sms_at = now(), last_sms_status = $2 WHERE id = $1`,
      [carrier.id, `Offer sent (${smsStatus})`]
    );

    res.json({
      ok: true,
      offer_id: offer.id,
      load_id: loadRow.id,
      sms_text: smsText,
      carrier: {
        id: carrier.id,
        company_name: carrier.company_name,
        phone: carrier.phone
      },
      sms_status: smsStatus
    });
  } catch (err) {
    console.error('[Send Driver Offer] Error:', err);
    res.status(500).json({ error: 'Could not send driver offer: ' + err.message });
  }
});

/**
 * POST /api/dispatch/contact-broker-email (Option A)
 * Sends a formal broker booking email with carrier setup packet & authority info.
 */
router.post('/contact-broker-email', ...staff, async (req, res) => {
  try {
    const { load, offer_id, carrier_id, broker_email, counter_rate, notes } = req.body;
    const targetEmail = String(broker_email || load?.broker_email || '').trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid broker email address is required for Option A email booking.' });
    }

    let carrier = null;
    if (carrier_id) {
      const cRes = await pool.query('SELECT * FROM ai_dispatch_carriers WHERE id = $1', [carrier_id]);
      carrier = cRes.rows[0];
    }

    const companyName = carrier?.company_name || 'Shipping Wish LLC Fleet';
    const authority = [
      carrier?.mc_number ? `MC ${carrier.mc_number}` : null,
      carrier?.dot_number ? `USDOT ${carrier.dot_number}` : null
    ].filter(Boolean).join(' / ') || 'MC Authority Active on File';

    const finalRate = counter_rate || load?.rate || 0;
    const ops = process.env.DISPATCH_EMAIL || process.env.MAIL_REPLY_TO || COMPANY.operationsEmail;
    const loadIdStr = load?.load_id || offer_id || Date.now().toString().slice(-6);

    const subject = `Booking Request: ${load?.origin || 'Origin'} → ${load?.destination || 'Destination'} (${load?.equipment_type || 'Box Truck'}) — ${authority} [SW-${loadIdStr}]`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6; max-width: 620px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 0 auto;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="color: #0b1f3a; margin: 0; font-size: 20px;">Freight Booking & Rate Confirmation Request</h2>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 12px;">Shipping Wish Operations Desk • Dedicated Carrier Management</p>
        </div>
        <p>Hello ${load?.broker_name || 'Freight Broker Team'},</p>
        <p>Shipping Wish LLC is dispatching for <strong>${companyName}</strong> (${authority}). We are ready to lock in your posted load:</p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Lane:</strong> ${load?.origin} → ${load?.destination}</p>
          <p style="margin: 4px 0;"><strong>Pickup:</strong> ${load?.pickup_time || 'Immediate / Ready Today'}</p>
          <p style="margin: 4px 0;"><strong>Delivery:</strong> ${load?.delivery_time || 'As Scheduled'}</p>
          <p style="margin: 4px 0;"><strong>Equipment:</strong> ${load?.equipment_type || '26ft Box Truck'}</p>
          <p style="margin: 4px 0;"><strong>Weight:</strong> ${load?.weight ? Number(load.weight).toLocaleString() + ' lbs' : 'As Posted'}</p>
          <p style="margin: 4px 0; font-size: 16px; color: #166534;"><strong>Agreed Rate:</strong> $${finalRate} ${load?.loaded_miles ? '(' + (finalRate / load.loaded_miles).toFixed(2) + '/mi)' : ''}</p>
          ${notes ? `<p style="margin: 4px 0; color: #b45309;"><strong>Special Instructions:</strong> ${notes}</p>` : ''}
        </div>
        <p><strong>Carrier Packet & Certificate of Insurance (COI):</strong> Ready for instant electronic sign-off. Please email the Rate Confirmation directly to <a href="mailto:${ops}">${ops}</a>.</p>
        <p style="color: #64748b; font-size: 13px;">If this load has already been covered, please reply "COVERED" so we can release our driver immediately.</p>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #475569;">
          <strong>Shipping Wish Dispatch Desk</strong><br>
          Toll-Free Phone: +1-800-580-3101 | Email: ${ops}<br>
          <a href="https://shippingwish.com" style="color: #2563eb; text-decoration: none;">shippingwish.com</a>
        </div>
      </div>
    `;

    const textBody = `
Booking Request: ${load?.origin} -> ${load?.destination}
Carrier: ${companyName} (${authority})
Rate: $${finalRate}
Pickup: ${load?.pickup_time || 'Today'}
Delivery: ${load?.delivery_time || 'Tomorrow'}

Please reply with the Rate Confirmation to ${ops}.
Shipping Wish Dispatch Desk: +1-800-580-3101
    `.trim();

    await sendBrandedEmail({
      to: targetEmail,
      subject,
      html: htmlBody,
      text: textBody,
      emailType: 'dispatch_booking',
      transactional: true,
      replyTo: ops
    });

    if (offer_id) {
      await pool.query(
        `UPDATE ai_dispatch_offers SET status = 'requested', broker_email = $2, note = $3, updated_at = now() WHERE id = $1`,
        [offer_id, targetEmail, `Emailed broker at ${targetEmail} (Option A)`]
      ).catch(() => {});
    }

    res.json({
      ok: true,
      message: `Booking request successfully sent to broker at ${targetEmail}.`,
      broker_email: targetEmail,
      carrier: companyName
    });
  } catch (err) {
    console.error('[Broker Email Contact] Error:', err);
    res.status(500).json({ error: 'Could not send broker email: ' + err.message });
  }
});

/**
 * POST /api/dispatch/contact-broker-call (Option B)
 * Initiates an AI voice call to the broker to secure rate confirmation
 * or schedules/queues warm transfer to live dispatcher.
 */
router.post('/contact-broker-call', ...staff, async (req, res) => {
  try {
    const { broker_phone, broker_name, load, carrier_id, offer_id } = req.body;
    const phone = String(broker_phone || load?.broker_phone || '').trim();
    if (!phone) {
      return res.status(400).json({ error: 'Broker phone number is required for Option B calling.' });
    }

    const tcpa = isWithinTcpaHours(phone);
    if (!tcpa.allowed) {
      return res.status(422).json({
        error: 'TCPA_HOURS_RESTRICTION',
        message: `Calling blocked: broker's local timezone is currently outside 9:00 AM - 5:00 PM (${tcpa.reason}). Use Option A (Email) instead.`
      });
    }

    const vapiApiKey = process.env.VAPI_API_KEY;
    const vapiPhoneId = process.env.VAPI_PHONE_NUMBER_ID;

    if (vapiApiKey) {
      try {
        const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${vapiApiKey.trim()}`
          },
          body: JSON.stringify({
            name: `Broker Load Booking Call - ${load?.origin || 'Origin'} to ${load?.destination || 'Dest'}`,
            phoneNumberId: vapiPhoneId || undefined,
            customer: { number: phone, name: broker_name || 'Freight Broker' },
            assistant: {
              name: 'Alex - Senior Dispatcher at Shipping Wish',
              firstMessage: `Hi, this is Alex with Shipping Wish dispatch calling about your posted load from ${load?.origin || 'the origin'} to ${load?.destination || 'the destination'}. Is this load still open?`,
              model: {
                provider: 'openai',
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: `You are Alex, an assertive American freight dispatcher at Shipping Wish LLC (+1-800-580-3101).
You are calling a broker to book load ${load?.load_id || ''}:
- Lane: ${load?.origin} to ${load?.destination}
- Equipment: ${load?.equipment_type || '26ft Box Truck'}
- Rate agreed: $${load?.rate || 1000}
Confirm availability, ensure rate is locked, and ask them to immediately email the Rate Confirmation to dispatch@shippingwish.com.`
                  }
                ]
              }
            }
          })
        });

        const vapiData = await vapiRes.json();
        if (offer_id) {
          await pool.query(
            `UPDATE ai_dispatch_offers SET note = $2, updated_at = now() WHERE id = $1`,
            [offer_id, `AI Voice Call placed to broker at ${phone} (Vapi: ${vapiData.id || 'ok'})`]
          ).catch(() => {});
        }

        return res.json({
          ok: true,
          provider: 'vapi',
          call_id: vapiData.id,
          phone,
          message: `AI Voice call successfully initiated to broker at ${phone}.`
        });
      } catch (callErr) {
        console.warn('Vapi call failed, falling back:', callErr.message);
      }
    }

    // Standby fallback if live Vapi key is not configured
    if (offer_id) {
      await pool.query(
        `UPDATE ai_dispatch_offers SET note = $2, updated_at = now() WHERE id = $1`,
        [offer_id, `Option B broker call queued for ${phone}`]
      ).catch(() => {});
    }

    res.json({
      ok: true,
      provider: 'standby',
      phone,
      message: `Option B broker call prepared for ${phone}. Live dispatcher bridge ready at +1-800-580-3101.`
    });
  } catch (err) {
    console.error('[Broker Call Contact] Error:', err);
    res.status(500).json({ error: 'Could not place broker call: ' + err.message });
  }
});

/**
 * POST /api/dispatch-desk/audit-ratecon
 * Upload or paste broker Rate Confirmation to automatically audit terms,
 * verify rate against agreed amount, and optionally auto-book & text driver.
 */
router.post('/audit-ratecon', ...staff, upload.single('ratecon_file'), async (req, res) => {
  try {
    await ensureBoardSchema();
    const offerId = req.body.offer_id;
    const loadId = req.body.load_id;
    const autoBook = req.body.auto_book !== false && req.body.auto_book !== 'false';
    const rateconText = req.body.ratecon_text || '';

    // File buffer if uploaded
    let inputContent = rateconText;
    if (req.file && req.file.buffer) {
      inputContent = req.file.buffer;
    }

    if (!inputContent) {
      return res.status(400).json({ error: 'Please provide RateCon PDF file or pasted text.' });
    }

    // Fetch expected load and offer
    let offer = null;
    let load = null;

    if (offerId) {
      const offRes = await pool.query('SELECT * FROM ai_dispatch_offers WHERE id = $1', [offerId]);
      offer = offRes.rows[0];
      if (offer) {
        const loadRes = await pool.query('SELECT * FROM loads WHERE id = $1', [offer.load_id]);
        load = loadRes.rows[0];
      }
    } else if (loadId) {
      const loadRes = await pool.query('SELECT * FROM loads WHERE id = $1', [loadId]);
      load = loadRes.rows[0];
    }

    const expectedLoad = {
      rate: load ? load.rate : (req.body.expected_rate || 1000),
      origin: load ? (load.pickup_location || load.origin) : req.body.expected_origin,
      destination: load ? (load.delivery_location || load.destination) : req.body.expected_destination,
      equipment_type: load ? load.equipment_type : null
    };

    const parsedRateCon = parseRateCon(inputContent);
    const audit = auditRateCon(expectedLoad, parsedRateCon);

    let bookResult = null;
    if (audit.passed && autoBook && offer && offer.status !== 'booked') {
      bookResult = await brain.markBooked(offer.id, `RateCon auto-audited: $${parsedRateCon.rate} matches agreed rate`);
    }

    res.json({
      ok: true,
      audit,
      parsed_ratecon: parsedRateCon,
      auto_booked: Boolean(bookResult),
      book_result: bookResult,
      message: audit.passed 
        ? (bookResult ? `✓ RateCon verified ($${parsedRateCon.rate}) and offer marked BOOKED! Driver notified.` : `✓ RateCon verified ($${parsedRateCon.rate})! Rate matches.`)
        : `⚠️ RateCon audit discrepancy flagged: ${audit.discrepancies.map(d => d.message).join(' ')}`
    });
  } catch (err) {
    console.error('[RateCon Audit] Error:', err);
    res.status(500).json({ error: 'RateCon audit failed: ' + err.message });
  }
});

/**
 * GET /api/dispatch-desk/carrier-packet
 * Fetch verified carrier profile & document credentials for broker setup
 */
router.get('/carrier-packet', ...staff, async (req, res) => {
  try {
    const carrierId = req.query.carrier_id ? Number(req.query.carrier_id) : null;
    const profile = await getCarrierProfile(carrierId);
    res.json({ ok: true, profile });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch carrier packet: ' + err.message });
  }
});

/**
 * POST /api/dispatch-desk/send-carrier-packet
 * 1-Click auto-submit carrier onboarding packet & compliance documents to broker
 */
router.post('/send-carrier-packet', ...staff, async (req, res) => {
  try {
    const {
      broker_email,
      carrier_id,
      load_id,
      origin,
      destination,
      agreed_rate,
      equipment,
      driver_name,
      driver_phone,
      tractor_num,
      trailer_num
    } = req.body;

    if (!broker_email || !broker_email.includes('@')) {
      return res.status(400).json({ error: 'Valid broker email address is required.' });
    }

    const profile = await getCarrierProfile(carrier_id);
    const result = await sendPacketToBroker(broker_email, profile, {
      loadId: load_id || 'Spot Freight',
      origin,
      destination,
      agreedRate: agreed_rate ? Number(agreed_rate) : 0,
      equipment: equipment || (profile.equipment_types && profile.equipment_types[0]) || "53' Dry Van",
      driverName: driver_name || profile.contact_name,
      driverPhone: driver_phone || profile.phone,
      tractorNum: tractor_num || 'T-104',
      trailerNum: trailer_num || 'V-5312'
    });

    res.json({
      ok: true,
      message: `Carrier packet successfully sent to ${broker_email}!`,
      details: result
    });
  } catch (err) {
    console.error('[Send Carrier Packet] Error:', err);
    res.status(500).json({ error: 'Failed to send carrier packet: ' + err.message });
  }
});

/**
 * POST /api/dispatch-desk/scan-pod
 * Scan and audit Proof of Delivery (POD) / signed Bill of Lading,
 * verify clean delivery, and generate freight invoice for factoring.
 */
router.post('/scan-pod', ...staff, upload.single('pod_file'), async (req, res) => {
  try {
    const loadId = req.body.load_id;
    const offerId = req.body.offer_id;
    const podText = req.body.pod_text || '';

    let inputContent = podText;
    if (req.file && req.file.buffer) {
      inputContent = req.file.buffer;
    }

    if (!inputContent) {
      return res.status(400).json({ error: 'Please provide POD document file or scanned text.' });
    }

    const podReport = scanPodDocument(inputContent, {
      expectedBol: req.body.bol_number,
      forceSignature: req.body.force_signature === 'true' || req.body.force_signature === true
    });

    // Lookup load & carrier for invoice generation
    let load = { id: loadId || 101, rate: req.body.rate || 1000, pickup_location: req.body.origin || 'Shipper Dock', delivery_location: req.body.destination || 'Receiver Dock' };
    let carrier = await getCarrierProfile(req.body.carrier_id);

    if (offerId) {
      const offRes = await pool.query('SELECT * FROM ai_dispatch_offers WHERE id = $1', [offerId]);
      if (offRes.rows[0]) {
        carrier = await getCarrierProfile(offRes.rows[0].carrier_id);
        const loadRes = await pool.query('SELECT * FROM loads WHERE id = $1', [offRes.rows[0].load_id]);
        if (loadRes.rows[0]) load = loadRes.rows[0];
      }
    } else if (loadId) {
      const loadRes = await pool.query('SELECT * FROM loads WHERE id = $1', [loadId]);
      if (loadRes.rows[0]) load = loadRes.rows[0];
    }

    const invoice = generateCarrierInvoice(carrier, load, {
      detention_amount: Number(req.body.detention_amount || 0),
      layover_amount: Number(req.body.layover_amount || 0)
    });

    res.json({
      ok: true,
      pod_report: podReport,
      generated_invoice: invoice,
      ready_for_factoring: podReport.valid && podReport.clean_bill,
      message: podReport.summary
    });
  } catch (err) {
    console.error('[Scan POD] Error:', err);
    res.status(500).json({ error: 'POD audit failed: ' + err.message });
  }
});

/**
 * POST /api/dispatch-desk/submit-factoring
 * Auto-submit verified invoice, RateCon, and signed POD directly to factoring partner
 */
router.post('/submit-factoring', ...staff, async (req, res) => {
  try {
    const { invoice, pod_report, target_email, offer_id } = req.body;
    if (!invoice || !invoice.invoice_number) {
      return res.status(400).json({ error: 'Valid invoice payload required.' });
    }

    const result = await submitToFactoring(
      invoice,
      pod_report || { status: 'VERIFIED_CLEAN', delivery_date: new Date().toISOString().slice(0, 10) },
      target_email
    );

    if (offer_id) {
      await pool.query(
        `UPDATE ai_dispatch_offers 
         SET status = 'completed', note = COALESCE(note, '') || ' | Factoring submitted #' || $1, updated_at = now() 
         WHERE id = $2`,
        [invoice.invoice_number, offer_id]
      ).catch(() => {});
    }

    res.json({
      ok: true,
      message: `Invoice #${invoice.invoice_number} submitted to factoring desk!`,
      result
    });
  } catch (err) {
    console.error('[Submit Factoring] Error:', err);
    res.status(500).json({ error: 'Factoring submission failed: ' + err.message });
  }
});

/**
 * POST /api/dispatch-desk/generate-tracking
 * 1-Click generate live GPS tracking link for an offer
 */
router.post('/generate-tracking', ...staff, async (req, res) => {
  try {
    const { offer_id } = req.body;
    if (!offer_id) return res.status(400).json({ error: 'Offer ID required' });

    const token = generateTrackingToken();
    await pool.query(
      `UPDATE ai_dispatch_offers 
       SET tracking_token = $1, tracking_status = COALESCE(tracking_status, 'booked') 
       WHERE id = $2`,
      [token, offer_id]
    );

    res.json({
      ok: true,
      offer_id,
      tracking_token: token,
      tracking_url: `https://www.shippingwish.com/track/${token}`,
      message: 'Tracking link generated successfully.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not generate tracking: ' + err.message });
  }
});

async function autoCoverStaleDatLoads() {
  try {
    const loadboardRouter = require('./loadboard');
    const { rows } = await pool.query(
      `UPDATE loads 
       SET status = 'covered', updated_at = NOW() 
       WHERE source_type = 'dat_sync' 
         AND status = 'new' 
         AND updated_at < NOW() - INTERVAL '15 minutes'
       RETURNING id, load_number`
    );
    if (rows.length > 0 && typeof loadboardRouter.broadcastLoadboardEvent === 'function') {
      rows.forEach(r => {
        loadboardRouter.broadcastLoadboardEvent('load_covered', { id: r.load_number || r.id, status: 'covered', covered_at: Date.now() });
      });
      console.log(`[LOADBOARD] Auto-covered and deducted ${rows.length} stale DAT loads from live exchange.`);
    }
  } catch (err) {
    console.warn('[LOADBOARD] Auto-cover stale loads error:', err.message);
  }
}

module.exports = router;
module.exports.syncDueSources = syncDueSources;
module.exports.sendDueMorningTexts = sendDueMorningTexts;
module.exports.sendDueEmptySoonOffers = () => brain.sendDueEmptySoonOffers();
module.exports.autoCoverStaleDatLoads = autoCoverStaleDatLoads;
