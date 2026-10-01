const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendTwilioSms } = require('./voip');
const { logSmsMessage, OUR_NUMBER } = require('../utils/sms-inbox');
const { assertPublicHttps, ensureBoardSchema, syncSource, syncDueSources } = require('../utils/loadboard-sync');
const { isWithinTcpaHours } = require('../utils/us-timezones');
const { parseHomeDays, formatHomeDays } = require('../utils/dispatch-home-time');
const brain = require('../utils/dispatch-brain');
const { parseDatInput, formatDriverSms } = require('../utils/dat-load-parser');
const { sendBrandedEmail } = require('../utils/mailer');
const { COMPANY } = require('../utils/email-templates');

const router = express.Router();
const staff = [requireAuth, requireRole('admin', 'super_admin')];

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
    if (!company || !phone) return res.status(400).json({ error: 'Company and phone are required.' });
    const consent = [true, 'true', 'on', '1', 'yes'].includes(req.body.sms_consent);
    const prefs = carrierPrefs(req.body);
    const { rows } = await pool.query(
      `INSERT INTO ai_dispatch_carriers (company_name, contact_name, phone, email, equipment, empty_zip, prefer_destination, sms_consent, sms_consent_at,
         mc_number, dot_number, min_rpm, max_deadhead, home_state, avoid_states, home_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 THEN now() ELSE NULL END, $9,$10,$11, COALESCE($12, 150), $13,$14,$15) RETURNING *`,
      [
        company,
        String(req.body.contact_name || '').trim() || null,
        phone,
        String(req.body.email || '').trim() || null,
        String(req.body.equipment || '').trim() || null,
        String(req.body.empty_zip || '').trim() || null,
        String(req.body.prefer_destination || '').trim() || null,
        consent,
        prefs.mc_number, prefs.dot_number, prefs.min_rpm, prefs.max_deadhead, prefs.home_state, prefs.avoid_states, prefs.home_days
      ]
    );
    res.json({ ok: true, carrier: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not add this carrier.' });
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

router.get('/offers', ...staff, async (req, res) => {
  try {
    res.json({ ok: true, offers: await brain.listOffers() });
  } catch (err) {
    res.status(500).json({ error: 'Could not load dispatch offers.' });
  }
});

router.post('/offers/:id/booked', ...staff, async (req, res) => {
  try {
    const result = await brain.markBooked(req.params.id, String(req.body.note || '').slice(0, 200));
    if (!result) return res.status(404).json({ error: 'Offer not found.' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not mark this booked.' });
  }
});

router.post('/offers/:id/release', ...staff, async (req, res) => {
  try {
    const result = await brain.releaseOffer(req.params.id, String(req.body.reason || 'Released by staff').slice(0, 200));
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

module.exports = router;
module.exports.syncDueSources = syncDueSources;
module.exports.sendDueMorningTexts = sendDueMorningTexts;
module.exports.sendDueEmptySoonOffers = () => brain.sendDueEmptySoonOffers();
