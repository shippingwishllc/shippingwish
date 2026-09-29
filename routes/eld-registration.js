const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');
const { sendBrandedEmail } = require('../utils/mailer');
const {
  buildRodsFile,
  registrationChecklist,
  packetReady,
  listingStatus
} = require('../utils/eld-rods');

const router = express.Router();
const staffOrCarrier = [
  requireAuth,
  requireRole('admin', 'super_admin', 'dispatcher', 'carrier', 'carrier_admin')
];

let migrated = false;
async function ensureTable() {
  if (migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eld_registration_packets (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      legal_name VARCHAR(200),
      usdot VARCHAR(20),
      mc_number VARCHAR(20),
      device_model VARCHAR(80),
      software_version VARCHAR(40),
      ecm_connected BOOLEAN NOT NULL DEFAULT FALSE,
      ecm_method VARCHAR(40),
      transfer_option VARCHAR(20),
      fmcsa_transfer_email VARCHAR(200),
      self_cert_statement BOOLEAN NOT NULL DEFAULT FALSE,
      file_validator_checked BOOLEAN NOT NULL DEFAULT FALSE,
      rods_generated_at TIMESTAMP,
      fmcsa_listing_id VARCHAR(80),
      notes TEXT,
      updated_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_eld_reg_user ON eld_registration_packets(user_id);
  `);
  migrated = true;
}

function publicPacket(row) {
  if (!row) {
    return {
      legal_name: '',
      usdot: '',
      mc_number: '',
      device_model: '',
      software_version: '',
      ecm_connected: false,
      ecm_method: '',
      transfer_option: '',
      fmcsa_transfer_email: '',
      self_cert_statement: false,
      file_validator_checked: false,
      rods_generated_at: null,
      fmcsa_listing_id: '',
      notes: ''
    };
  }
  return {
    id: row.id,
    legal_name: row.legal_name || '',
    usdot: row.usdot || '',
    mc_number: row.mc_number || '',
    device_model: row.device_model || '',
    software_version: row.software_version || '',
    ecm_connected: Boolean(row.ecm_connected),
    ecm_method: row.ecm_method || '',
    transfer_option: row.transfer_option || '',
    fmcsa_transfer_email: row.fmcsa_transfer_email || '',
    self_cert_statement: Boolean(row.self_cert_statement),
    file_validator_checked: Boolean(row.file_validator_checked),
    rods_generated_at: row.rods_generated_at,
    fmcsa_listing_id: row.fmcsa_listing_id || '',
    notes: row.notes || '',
    updated_at: row.updated_at
  };
}

async function packetFor(userId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM eld_registration_packets WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function driverRow(userId) {
  const { rows } = await pool.query(
    `SELECT id, name, email, company_name, mc_number, dot_number, phone FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function dutyEvents(driverId, days) {
  const start = new Date(Date.now() - (Math.max(1, days || 8) * 24 * 3600 * 1000));
  const { rows } = await pool.query(
    `SELECT duty_status, started_at, ended_at, location_city, location_state, gps_lat, gps_lon, odometer_miles, engine_hours, notes
     FROM eld_duty_events WHERE driver_id = $1 AND started_at >= $2 ORDER BY started_at ASC`,
    [driverId, start]
  );
  return rows;
}

router.get('/desk', ...staffOrCarrier, async (req, res) => {
  try {
    const packet = publicPacket(await packetFor(req.user.id));
    const user = await driverRow(req.user.id);
    if (user && !packet.legal_name) packet.legal_name = user.company_name || '';
    if (user && !packet.usdot) packet.usdot = user.dot_number || '';
    if (user && !packet.mc_number) packet.mc_number = user.mc_number || '';
    res.json({
      ok: true,
      how: 'FMCSA ELD listing is self-certification plus ECM hardware. This desk builds the Appendix A RODS file and the registration packet. SW Track phone GPS is not an ELD and cannot be listed. Shipping Wish does not invent a listing ID.',
      packet,
      checklist: registrationChecklist(packet),
      user: user ? { id: user.id, name: user.name, company_name: user.company_name, usdot: user.dot_number, mc_number: user.mc_number } : null
    });
  } catch (err) {
    console.error('[ELD register desk]', err.message);
    res.status(500).json({ error: 'Could not load FMCSA registration desk.' });
  }
});

router.post('/packet', ...staffOrCarrier, async (req, res) => {
  await ensureTable();
  const listingId = String(req.body.fmcsa_listing_id || '').trim();
  if (listingId && !/^[A-Za-z0-9._-]{4,80}$/.test(listingId)) {
    return res.status(400).json({ error: 'Listing ID must be the value FMCSA published. Leave it blank until they list you.' });
  }
  const ecm = Boolean(req.body.ecm_connected);
  const transfer = String(req.body.transfer_option || '').toLowerCase();
  if (transfer && !['telematics', 'local', ''].includes(transfer)) {
    return res.status(400).json({ error: 'Transfer option must be telematics (email + web services) or local (USB + Bluetooth).' });
  }
  const fields = {
    legal_name: String(req.body.legal_name || '').trim().slice(0, 200) || null,
    usdot: String(req.body.usdot || '').trim().slice(0, 20) || null,
    mc_number: String(req.body.mc_number || '').trim().slice(0, 20) || null,
    device_model: String(req.body.device_model || '').trim().slice(0, 80) || null,
    software_version: String(req.body.software_version || '').trim().slice(0, 40) || null,
    ecm_connected: ecm,
    ecm_method: String(req.body.ecm_method || '').trim().slice(0, 40) || null,
    transfer_option: transfer || null,
    fmcsa_transfer_email: String(req.body.fmcsa_transfer_email || '').trim().slice(0, 200) || null,
    self_cert_statement: Boolean(req.body.self_cert_statement),
    file_validator_checked: Boolean(req.body.file_validator_checked),
    fmcsa_listing_id: listingId || null,
    notes: String(req.body.notes || '').trim().slice(0, 2000) || null
  };
  try {
    const { rows } = await pool.query(`
      INSERT INTO eld_registration_packets (
        user_id, legal_name, usdot, mc_number, device_model, software_version,
        ecm_connected, ecm_method, transfer_option, fmcsa_transfer_email,
        self_cert_statement, file_validator_checked, fmcsa_listing_id, notes, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
      ON CONFLICT (user_id) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        usdot = EXCLUDED.usdot,
        mc_number = EXCLUDED.mc_number,
        device_model = EXCLUDED.device_model,
        software_version = EXCLUDED.software_version,
        ecm_connected = EXCLUDED.ecm_connected,
        ecm_method = EXCLUDED.ecm_method,
        transfer_option = EXCLUDED.transfer_option,
        fmcsa_transfer_email = EXCLUDED.fmcsa_transfer_email,
        self_cert_statement = EXCLUDED.self_cert_statement,
        file_validator_checked = EXCLUDED.file_validator_checked,
        fmcsa_listing_id = EXCLUDED.fmcsa_listing_id,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *
    `, [
      req.user.id, fields.legal_name, fields.usdot, fields.mc_number, fields.device_model, fields.software_version,
      fields.ecm_connected, fields.ecm_method, fields.transfer_option, fields.fmcsa_transfer_email,
      fields.self_cert_statement, fields.file_validator_checked, fields.fmcsa_listing_id, fields.notes
    ]);
    const packet = publicPacket(rows[0]);
    auditLog(req.user.id, 'ELD_REG_PACKET', 'eld_registration_packets', rows[0].id, {
      ecm_connected: packet.ecm_connected,
      listed: Boolean(packet.fmcsa_listing_id)
    }, getClientIp(req));
    res.json({
      ok: true,
      packet,
      checklist: registrationChecklist(packet),
      ready: packetReady(packet)
    });
  } catch (err) {
    console.error('[ELD register packet]', err.message);
    res.status(500).json({ error: 'Could not save registration packet.' });
  }
});

async function rodsForRequest(req) {
  const driverId = parseInt(req.query.driver_id || req.body?.driver_id || req.user.id, 10);
  if (!Number.isFinite(driverId)) {
    const err = new Error('Invalid driver.');
    err.status = 400;
    throw err;
  }
  if (driverId !== req.user.id && !['admin', 'super_admin', 'dispatcher'].includes(req.user.role)) {
    const err = new Error('You can only export your own log.');
    err.status = 403;
    throw err;
  }
  const packet = publicPacket(await packetFor(req.user.id));
  const driver = await driverRow(driverId);
  if (!driver) {
    const err = new Error('Driver not found.');
    err.status = 404;
    throw err;
  }
  const days = Math.min(8, Math.max(1, parseInt(req.query.days || req.body?.days || '8', 10) || 8));
  const events = await dutyEvents(driverId, days);
  const file = buildRodsFile({
    packet,
    driver: {
      id: driver.id,
      name: driver.name,
      email: driver.email,
      company_name: driver.company_name,
      license_number: '',
      license_state: ''
    },
    vehicle: {
      unit_number: req.query.unit || req.body?.unit || '',
      vin: req.query.vin || req.body?.vin || '',
      trailer_number: req.query.trailer || req.body?.trailer || ''
    },
    events
  });
  return { file, packet, driver, events };
}

router.get('/rods', ...staffOrCarrier, async (req, res) => {
  try {
    const { file, packet } = await rodsForRequest(req);
    await pool.query(
      `UPDATE eld_registration_packets SET rods_generated_at = now(), updated_at = now() WHERE user_id = $1`,
      [req.user.id]
    ).catch(() => {});
    res.json({
      ok: true,
      filename: file.filename,
      event_count: file.event_count,
      listed: file.listed,
      listing_id: file.listing_id,
      note: file.note,
      checklist: registrationChecklist(Object.assign({}, packet, { rods_generated_at: new Date().toISOString() })),
      body: file.body
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not build RODS file.' });
  }
});

router.get('/rods.csv', ...staffOrCarrier, async (req, res) => {
  try {
    const { file } = await rodsForRequest(req);
    await pool.query(
      `UPDATE eld_registration_packets SET rods_generated_at = now(), updated_at = now() WHERE user_id = $1`,
      [req.user.id]
    ).catch(() => {});
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not download RODS file.' });
  }
});

router.post('/transfer-email', ...staffOrCarrier, async (req, res) => {
  try {
    const packet = publicPacket(await packetFor(req.user.id));
    const to = String(req.body.to || packet.fmcsa_transfer_email || '').trim();
    if (!to.includes('@')) {
      return res.status(400).json({
        error: 'Paste the FMCSA ELD transfer email from the Provider Portal. We do not invent that address.'
      });
    }
    if (packet.transfer_option && packet.transfer_option !== 'telematics') {
      return res.status(409).json({ error: 'Email transfer is the telematics option. Set transfer option to telematics first.' });
    }
    const { file } = await rodsForRequest(req);
    await sendBrandedEmail({
      to,
      subject: `ELD output file ${file.filename}`,
      transactional: true,
      text: `${file.note}\nEvents: ${file.event_count}\nListed: ${file.listed ? file.listing_id : 'no — not on the FMCSA ELD list yet.'}`,
      html: `<p>${file.note}</p><p>Events in file: ${file.event_count}.</p><p>This is a software RODS export. ECM hardware is still required for a listed ELD.</p>`,
      attachments: [{ filename: file.filename, content: Buffer.from(file.body, 'utf8') }]
    });
    auditLog(req.user.id, 'ELD_RODS_EMAIL', 'eld_registration_packets', packet.id || null, { to }, getClientIp(req));
    res.json({ ok: true, sent_to: to, filename: file.filename, listed: file.listed });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not email RODS file.' });
  }
});

router.get('/status', ...staffOrCarrier, async (req, res) => {
  const packet = publicPacket(await packetFor(req.user.id));
  res.json({
    ok: true,
    listing: listingStatus(packet),
    ready: packetReady(packet),
    phone_gps_is_eld: false
  });
});

module.exports = router;
