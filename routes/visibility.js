const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');
const { listPartners, getPartner, previewPayload } = require('../utils/visibility-partners');
const store = require('../utils/visibility-connect');

const router = express.Router();
const deskRoles = [
  requireAuth,
  requireRole('admin', 'super_admin', 'dispatcher', 'carrier', 'carrier_admin', 'broker')
];

router.get('/partners', ...deskRoles, (req, res) => {
  res.json({
    ok: true,
    how: 'Become a location source on broker visibility networks by connecting official partner credentials. We push real SW Track / ELD GPS. We do not scrape MacroPoint, FourKites, or Trucker Tools.',
    partners: listPartners()
  });
});

router.get('/desk', ...deskRoles, async (req, res) => {
  try {
    const desk = await store.deskPayload(req.user);
    res.json({ ok: true, ...desk });
  } catch (err) {
    console.error('[Visibility desk]', err.message);
    res.status(500).json({ error: 'Could not load visibility desk.' });
  }
});

router.post('/connect', ...deskRoles, async (req, res) => {
  const partner = String(req.body.partner || '').toLowerCase();
  const spec = getPartner(partner);
  if (!spec) return res.status(400).json({ error: 'Pick fourkites, macropoint, or truckertools.' });
  if (!req.body.consent) {
    return res.status(400).json({
      error: 'Confirm you received these credentials from the partner (FourKites carrier ops, MacroPoint activations, or Trucker Tools integrations).'
    });
  }
  try {
    let authMode = 'basic';
    const extra = {
      default_shipper: String(req.body.default_shipper || '').trim() || null,
      default_mpid: String(req.body.default_mpid || '').trim() || null,
      default_scac: String(req.body.default_scac || '').trim() || null,
      account_id: String(req.body.account_id || '').trim() || null,
      partner_id: String(req.body.partner_id || '').trim() || null,
      client_id: String(req.body.client_id || '').trim() || null,
      push_url: String(req.body.push_url || '').trim() || null,
      secret: String(req.body.secret || '').trim() || null
    };
    if (extra.push_url && !/^https:\/\//i.test(extra.push_url)) {
      return res.status(400).json({ error: 'Partner API URL must be HTTPS from the official packet.' });
    }
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const apiKey = String(req.body.api_key || '').trim();

    if (partner === 'fourkites') {
      if (extra.client_id && extra.secret) authMode = 'nonce';
      else if (username && password) authMode = 'basic';
      else {
        return res.status(400).json({
          error: 'FourKites needs Basic username/password or Nonce client id + secret from support@fourkites.com / carrier ops.'
        });
      }
    } else if (partner === 'macropoint') {
      if (!username || !password) {
        return res.status(400).json({
          error: 'MacroPoint needs HTTP Basic from MPActivations@descartes.com.'
        });
      }
    } else if (partner === 'truckertools') {
      authMode = 'api_key';
      if (!apiKey) {
        return res.status(400).json({
          error: 'Trucker Tools needs the API key from integrations@truckertools.com plus the HTTPS URL they issued.'
        });
      }
      if (!extra.push_url) {
        return res.status(400).json({
          error: 'Paste the HTTPS API URL from the Trucker Tools partner packet. Their endpoint is not public.'
        });
      }
    }

    const row = await store.saveConnection({
      userId: req.user.id,
      partner,
      authMode,
      username: username || null,
      password: password || null,
      apiKey: apiKey || null,
      extra,
      consentIp: getClientIp(req),
      accountLabel: String(req.body.account_label || spec.name).slice(0, 200)
    });
    auditLog(req.user.id, 'VISIBILITY_CONNECT', 'visibility_connections', row.id, { partner, auth_mode: authMode }, getClientIp(req));
    res.json({
      ok: true,
      connection: store.publicConnection(row),
      next: 'On Broker tracking, check this partner when you send tracking. After the driver Accepts, GPS pings POST to the official API.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save partner connection.' });
  }
});

router.post('/connections/:id/disconnect', ...deskRoles, async (req, res) => {
  const row = await store.getConnection(parseInt(req.params.id, 10), req.user);
  if (!row) return res.status(404).json({ error: 'Partner connection not found.' });
  await store.disconnectConnection(row.id);
  auditLog(req.user.id, 'VISIBILITY_DISCONNECT', 'visibility_connections', row.id, { partner: row.partner }, getClientIp(req));
  res.json({ ok: true });
});

router.post('/preview', ...deskRoles, (req, res) => {
  try {
    const partner = String(req.body.partner || '').toLowerCase();
    if (!getPartner(partner)) return res.status(400).json({ error: 'Unknown partner.' });
    const preview = previewPayload(partner, {
      lat: req.body.latitude ?? req.body.lat,
      lon: req.body.longitude ?? req.body.lon,
      locatedAt: req.body.locatedAt,
      load_number: req.body.load_number,
      billOfLading: req.body.billOfLading || req.body.bol,
      shipper: req.body.shipper,
      fourkites_shipper: req.body.shipper,
      operatingCarrierScac: req.body.scac,
      truckNumber: req.body.truckNumber,
      trailerNumber: req.body.trailerNumber,
      driverPhone: req.body.driverPhone,
      macropoint_mpid: req.body.macropoint_mpid,
      macropoint_sender_load_id: req.body.macropoint_sender_load_id,
      macropoint_requestor_load_id: req.body.macropoint_requestor_load_id,
      truckertools_order_id: req.body.truckertools_order_id
    }, {
      accountId: req.body.account_id,
      partnerId: req.body.partner_id
    });
    res.json({ ok: true, partner, preview });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not build preview.' });
  }
});

router.post('/push-test', ...deskRoles, async (req, res) => {
  const row = await store.getConnection(parseInt(req.body.connection_id, 10), req.user);
  if (!row) return res.status(404).json({ error: 'Partner connection not found.' });
  const share = {
    id: null,
    created_by: req.user.id,
    load_id: req.body.load_id || null,
    load_number: req.body.load_number,
    driver_phone: req.body.driver_phone,
    last_lat: req.body.latitude,
    last_lon: req.body.longitude,
    last_ping_at: new Date().toISOString(),
    visibility_json: {
      partners: [row.partner],
      shipper: req.body.shipper,
      billOfLading: req.body.billOfLading || req.body.load_number,
      scac: req.body.scac,
      truckNumber: req.body.truckNumber,
      macropoint_mpid: req.body.macropoint_mpid,
      macropoint_sender_load_id: req.body.macropoint_sender_load_id,
      macropoint_requestor_load_id: req.body.macropoint_requestor_load_id,
      truckertools_order_id: req.body.truckertools_order_id
    }
  };
  try {
    const results = await store.pushShareToConnections(req.user, share, {
      lat: req.body.latitude,
      lon: req.body.longitude,
      dryRun: Boolean(req.body.dry_run)
    });
    res.json({ ok: true, results });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Push failed.' });
  }
});

module.exports = router;
