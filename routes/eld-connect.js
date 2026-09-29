const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');
const { decryptSecret, hmacSha256Hex, timingSafeEqual } = require('../utils/eld-crypto');
const {
  listProviders,
  getProvider,
  oauthRedirectUri,
  oauthAuthorizeUrl,
  exchangeOauthToken,
  geotabAuthenticate,
  applyWebhookLocation
} = require('../utils/eld-providers');
const store = require('../utils/eld-connect');

const router = express.Router();
const staffOrCarrier = [
  requireAuth,
  requireRole('admin', 'super_admin', 'dispatcher', 'carrier', 'carrier_admin')
];

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signOauthState(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

function readOauthState(token) {
  return jwt.verify(token, JWT_SECRET);
}

router.get('/providers', ...staffOrCarrier, (req, res) => {
  res.json({
    ok: true,
    how: 'Shipping Wish is a dispatch platform. Motive-class ELD work means the carrier connects their existing registered ELD (Motive, Samsara, or Geotab) with fleet-admin consent. Official APIs only. Shipping Wish is not Motive, does not sell ELD hardware, and does not claim FMCSA ELD certification.',
    providers: listProviders()
  });
});

router.get('/desk', ...staffOrCarrier, async (req, res) => {
  try {
    const desk = await store.deskPayload(req.user);
    res.json({
      ok: true,
      how: 'Live GPS and HOS here come from a connected ELD account or from driver GPS pings. Empty means nothing has been connected or pinged yet.',
      ...desk
    });
  } catch (err) {
    console.error('[ELD desk]', err.message);
    res.status(500).json({ error: 'Could not load ELD desk.' });
  }
});

router.get('/connections', ...staffOrCarrier, async (req, res) => {
  try {
    const rows = await store.connectionsForUser(req.user);
    res.json({ ok: true, connections: rows.map(store.publicConnection) });
  } catch (err) {
    res.status(500).json({ error: 'Could not list ELD connections.' });
  }
});

router.post('/oauth/:provider/start', ...staffOrCarrier, async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const spec = getProvider(provider);
  if (!spec || !spec.oauthAuthorize) {
    return res.status(400).json({ error: 'This provider uses an API key or MyGeotab sign-in, not OAuth.' });
  }
  if (!req.body?.consent) {
    return res.status(400).json({
      error: 'Fleet-admin consent is required before Shipping Wish can read GPS, vehicles, or HOS from this ELD account.'
    });
  }
  const clientId = process.env[spec.envId];
  if (!clientId) {
    return res.status(409).json({
      error: `${spec.name} OAuth is not configured yet. A developer must set ${spec.envId} (and the matching secret) from the official ${spec.name} developer portal, or connect with the carrier’s own API key.`
    });
  }
  const state = signOauthState({
    uid: req.user.id,
    provider,
    ip: getClientIp(req)
  });
  const url = oauthAuthorizeUrl(provider, { clientId, state });
  auditLog(req.user.id, 'ELD_OAUTH_START', 'eld_connections', null, { provider }, getClientIp(req));
  res.json({ ok: true, url });
});

router.get('/oauth/:provider/callback', async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const spec = getProvider(provider);
  if (!spec) return res.redirect('/eld-desk?error=unknown_provider');
  if (req.query.error) {
    return res.redirect(`/eld-desk?error=${encodeURIComponent(String(req.query.error))}`);
  }
  try {
    const state = readOauthState(String(req.query.state || ''));
    if (state.provider !== provider) throw new Error('OAuth state provider mismatch.');
    const token = await exchangeOauthToken(provider, {
      code: String(req.query.code || ''),
      redirectUri: oauthRedirectUri(provider)
    });
    const row = await store.saveOauthConnection({
      userId: state.uid,
      provider,
      token,
      consentIp: state.ip
    });
    try {
      await store.syncConnection(row);
    } catch (syncErr) {
      await store.markConnectionError(row.id, syncErr.message);
    }
    return res.redirect(`/eld-desk?connected=${encodeURIComponent(provider)}`);
  } catch (err) {
    console.error('[ELD OAuth callback]', err.message);
    return res.redirect(`/eld-desk?error=${encodeURIComponent(err.message.slice(0, 120))}`);
  }
});

router.post('/api-key', ...staffOrCarrier, async (req, res) => {
  const provider = String(req.body?.provider || '').toLowerCase();
  const spec = getProvider(provider);
  if (!spec) return res.status(400).json({ error: 'Pick Motive, Samsara, or Geotab.' });
  if (!req.body?.consent) {
    return res.status(400).json({
      error: 'Check the consent box. Only a fleet admin may connect this ELD account.'
    });
  }

  try {
    let row;
    if (provider === 'geotab') {
      const session = await geotabAuthenticate({
        server: req.body.geotab_server,
        database: req.body.geotab_database,
        username: req.body.geotab_username,
        password: req.body.geotab_password
      });
      row = await store.saveGeotabConnection({
        userId: req.user.id,
        session,
        consentIp: getClientIp(req)
      });
    } else {
      const apiKey = String(req.body.api_key || '').trim();
      if (apiKey.length < 12) {
        return res.status(400).json({ error: 'Paste the API key from the carrier’s own ELD dashboard. Do not type a password here.' });
      }
      row = await store.saveApiKeyConnection({
        userId: req.user.id,
        provider,
        apiKey,
        consentIp: getClientIp(req)
      });
    }

    let synced = null;
    try {
      synced = await store.syncConnection(row);
    } catch (syncErr) {
      await store.markConnectionError(row.id, syncErr.message);
      return res.status(502).json({
        ok: false,
        error: syncErr.message,
        connection: store.publicConnection(Object.assign({}, row, { status: 'error', last_error: syncErr.message }))
      });
    }

    auditLog(req.user.id, 'ELD_CONNECT', 'eld_connections', row.id, { provider, auth_mode: row.auth_mode }, getClientIp(req));
    res.json({
      ok: true,
      connection: store.publicConnection(Object.assign({}, row, {
        status: 'connected',
        account_label: synced.account_label,
        last_sync_at: new Date().toISOString()
      })),
      synced
    });
  } catch (err) {
    console.error('[ELD api-key]', err.message);
    res.status(400).json({ error: err.message || 'Could not connect ELD account.' });
  }
});

router.post('/connections/:id/sync', ...staffOrCarrier, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await store.getConnection(id, req.user);
  if (!row) return res.status(404).json({ error: 'ELD connection not found.' });
  try {
    const synced = await store.syncConnection(row);
    res.json({ ok: true, synced });
  } catch (err) {
    await store.markConnectionError(row.id, err.message);
    res.status(502).json({ error: err.message || 'ELD sync failed.' });
  }
});

router.post('/connections/:id/disconnect', ...staffOrCarrier, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await store.getConnection(id, req.user);
  if (!row) return res.status(404).json({ error: 'ELD connection not found.' });
  await store.disconnectConnection(row.id);
  auditLog(req.user.id, 'ELD_DISCONNECT', 'eld_connections', row.id, { provider: row.provider }, getClientIp(req));
  res.json({ ok: true });
});

async function webhookHandler(req, res) {
  const provider = String(req.params.provider || '').toLowerCase();
  const connectionId = parseInt(req.params.connectionId, 10);
  if (!getProvider(provider) || !Number.isFinite(connectionId)) {
    return res.status(400).json({ error: 'Bad webhook path.' });
  }
  try {
    await store.ensureEldConnectTables();
    const pool = require('../db');
    const { rows } = await pool.query(`SELECT * FROM eld_connections WHERE id = $1 AND provider = $2`, [connectionId, provider]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Unknown connection.' });

    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
    const secret = decryptSecret(row.extra_json?.encrypted_webhook_secret);
    const sig = req.get('X-KT-Webhook-Signature') || req.get('X-Samsara-Signature') || req.get('Samsara-Signature') || '';
    if (secret && sig && !timingSafeEqual(hmacSha256Hex(secret, raw), sig.replace(/^sha256=/i, ''))) {
      return res.status(403).json({ error: 'Bad webhook signature.' });
    }

    let parsed = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch (_) { parsed = {}; }
    const mapped = applyWebhookLocation(provider, parsed);
    if (mapped) {
      mapped.provider = provider;
      await store.applyVehiclePing(connectionId, mapped);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[ELD webhook]', err.message);
    res.status(500).json({ error: 'Webhook failed.' });
  }
}

router.post('/webhooks/:provider/:connectionId', webhookHandler);

module.exports = router;
module.exports.webhookHandler = webhookHandler;
