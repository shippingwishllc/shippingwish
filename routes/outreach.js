const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireRole } = require('../middleware/auth');
const engine = require('../utils/outreach-engine');

const router = express.Router();
const staff = [requireAuth, requireRole('admin', 'super_admin')];

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.query.key || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/status', ...staff, async (req, res) => {
  try {
    await engine.tick().catch(() => {});
    res.json({ ok: true, ...(await engine.status()) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load outreach status.' });
  }
});

router.post('/settings', ...staff, async (req, res) => {
  try {
    const body = req.body || {};
    const settings = await engine.updateSettings({
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      start_cap: body.start_cap,
      max_cap: body.max_cap
    });
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ error: 'Could not save outreach settings.' });
  }
});

router.post('/import', ...staff, async (req, res) => {
  try {
    const result = await engine.importFromFmcsa({
      kind: req.body.kind,
      state: req.body.state,
      limit: Number(req.body.limit) || 30
    });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not import from FMCSA.' });
  }
});

router.post('/run', ...staff, async (req, res) => {
  try {
    res.json({ ok: true, result: await engine.tick({ force: true }) });
  } catch (err) {
    res.status(500).json({ error: 'Outreach batch failed.' });
  }
});

router.all('/tick', async (req, res) => {
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const [outreach, dispatch] = await Promise.all([
      engine.tick(),
      Promise.resolve().then(() => {
        const desk = require('./dispatch-desk');
        return Promise.all([desk.syncDueSources(), desk.sendDueMorningTexts(), desk.runCheckCalls()]);
      }).catch((err) => ({ error: err.message }))
    ]);
    res.json({ ok: true, outreach, dispatch: Array.isArray(dispatch) ? 'ok' : dispatch });
  } catch (err) {
    res.status(500).json({ error: 'Tick failed.' });
  }
});

async function resendEventsHandler(req, res) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'RESEND_WEBHOOK_SECRET is not set.' });
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
  if (!engine.verifySvix(raw, req.headers, secret)) return res.status(401).json({ error: 'Invalid signature' });
  try {
    const result = await engine.handleResendEvent(JSON.parse(raw));
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Could not record the email event.' });
  }
}

module.exports = router;
module.exports.resendEventsHandler = resendEventsHandler;
