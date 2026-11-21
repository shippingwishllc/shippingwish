// routes/cron.js
// Serverless-safe Cron Job endpoints invoked by Vercel Cron (protected by CRON_SECRET).
// Replaces side effects previously triggered inside GET page requests!

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

function requireCronAuth(req, res, next) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : String(req.headers['x-cron-secret'] || '').trim();

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'CRON_SECRET is not configured in production.' });
    }
    return next();
  }

  if (provided.length === secret.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized cron trigger.' });
}

// GET /api/cron/loadboard-sync — Sync due loadboard API sources & expire stale DAT loads
router.get('/loadboard-sync', requireCronAuth, async (req, res) => {
  const results = {};
  try {
    const dispatchDesk = require('./dispatch-desk');
    if (typeof dispatchDesk.syncDueSources === 'function') {
      results.sources = await dispatchDesk.syncDueSources().catch((e) => ({ error: e.message }));
    }
    if (typeof dispatchDesk.autoCoverStaleDatLoads === 'function') {
      await dispatchDesk.autoCoverStaleDatLoads().catch(() => {});
      results.staleCleaned = true;
    }
    try {
      const { expireStaleLoads } = require('../utils/load-ingest');
      results.expired24h = await expireStaleLoads();
    } catch (e) {
      results.expired24h = { error: e.message };
    }
    try {
      const { pollConfiguredAdapters } = require('../utils/broker-adapters');
      results.brokerAdapters = await pollConfiguredAdapters();
    } catch (e) {
      results.brokerAdapters = { error: e.message };
    }
    res.json({ ok: true, job: 'loadboard-sync', timestamp: new Date().toISOString(), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron/dispatch-automations — Morning carrier check-ins & empty-soon reload offers
router.get('/dispatch-automations', requireCronAuth, async (req, res) => {
  const results = {};
  try {
    const dispatchDesk = require('./dispatch-desk');
    if (typeof dispatchDesk.sendDueMorningTexts === 'function') {
      await dispatchDesk.sendDueMorningTexts().catch((e) => { results.morningError = e.message; });
      results.morningChecked = true;
    }
    if (typeof dispatchDesk.sendDueEmptySoonOffers === 'function') {
      await dispatchDesk.sendDueEmptySoonOffers().catch((e) => { results.emptySoonError = e.message; });
      results.emptySoonChecked = true;
    }
    res.json({ ok: true, job: 'dispatch-automations', timestamp: new Date().toISOString(), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
