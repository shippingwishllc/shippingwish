const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendTwilioSms } = require('./voip');
const { logSmsMessage, OUR_NUMBER } = require('../utils/sms-inbox');
const { assertPublicHttps, ensureBoardSchema, syncSource, syncDueSources } = require('../utils/loadboard-sync');
const { isWithinTcpaHours } = require('../utils/us-timezones');
const brain = require('../utils/dispatch-brain');

const router = express.Router();
const staff = [requireAuth, requireRole('admin', 'super_admin')];

function maskKey(value) {
  const text = String(value || '');
  if (!text) return '';
  return `••••${text.slice(-4)}`;
}

function morningText(carrier) {
  const lang = carrier.sms_lang === 'es' ? 'es' : 'en';
  const { t } = require('../utils/dispatch-i18n');
  const where = carrier.empty_zip ? t(lang, 'morning_zip', { zip: carrier.empty_zip }) : '';
  return t(lang, 'morning', { name: carrier.contact_name || carrier.company_name, where });
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
         mc_number, dot_number, min_rpm, max_deadhead, home_state, avoid_states)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 THEN now() ELSE NULL END, $9,$10,$11, COALESCE($12, 150), $13,$14) RETURNING *`,
      [
        company,
        String(req.body.contact_name || '').trim() || null,
        phone,
        String(req.body.email || '').trim() || null,
        String(req.body.equipment || '').trim() || null,
        String(req.body.empty_zip || '').trim() || null,
        String(req.body.prefer_destination || '').trim() || null,
        consent,
        prefs.mc_number, prefs.dot_number, prefs.min_rpm, prefs.max_deadhead, prefs.home_state, prefs.avoid_states
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
    avoid_states: states(body.avoid_states)
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
      avoid_states: 'avoid_states' in req.body ? prefs.avoid_states : undefined
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

router.get('/offers', ...staff, async (req, res) => {
  try {
    res.json({ ok: true, offers: await brain.listOffers() });
  } catch (err) {
    res.status(500).json({ error: 'Could not load dispatch offers.' });
  }
});

router.get('/metrics', ...staff, async (req, res) => {
  try {
    res.json({ ok: true, metrics: await require('../utils/dispatch-metrics').deskMetrics() });
  } catch (err) {
    res.status(500).json({ error: 'Could not load desk activity counts.' });
  }
});

router.post('/offers/:id/booked', ...staff, async (req, res) => {
  try {
    const result = await brain.markBooked(req.params.id, String(req.body.note || '').slice(0, 200), { force: req.body.force === true });
    if (!result) return res.status(404).json({ error: 'Offer not found.' });
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err.code === 'RATECON_MISMATCH') return res.status(409).json({ error: err.message, code: err.code });
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

router.get('/pods/:id', ...staff, async (req, res) => {
  try {
    const pod = await brain.getPod(req.params.id);
    if (!pod) return res.status(404).json({ error: 'Photo not found.' });
    res.set('Content-Type', pod.content_type || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=300');
    res.send(pod.bytes);
  } catch (err) {
    res.status(500).json({ error: 'Could not load this photo.' });
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
      await pool.query(
        'INSERT INTO ai_dispatch_messages (carrier_id, direction, body, intent) VALUES ($1,$2,$3,$4)',
        [carrier.id, 'outbound', text, 'morning']
      ).catch(() => {});
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

module.exports = router;
module.exports.syncDueSources = syncDueSources;
module.exports.sendDueMorningTexts = sendDueMorningTexts;
module.exports.runCheckCalls = () => brain.runCheckCalls();
