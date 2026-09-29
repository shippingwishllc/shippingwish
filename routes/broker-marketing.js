const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { US_STATES } = require('../utils/fmcsa-equipment');
const desk = require('../utils/broker-marketing');

const router = express.Router();
const staff = [requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep')];

router.use(...staff);

function userId(req) {
  return req.user && req.user.id;
}

router.get('/meta', (req, res) => {
  res.json({
    ok: true,
    states: US_STATES,
    page_size: desk.PAGE_SIZE,
    caps: { email: desk.EMAIL_CAP, sms: desk.SMS_CAP, vapi: desk.VAPI_CAP },
    source: 'FMCSA Company Census (data.transportation.gov az4n-8mr2)',
    note: 'classdef contains BROKER and/or carship token B. Census Desk stays on for-hire carriers (carship C).'
  });
});

router.get('/stats', async (req, res) => {
  try {
    res.json({ ok: true, stats: await desk.stats() });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load stats.' });
  }
});

router.post('/next', async (req, res) => {
  try {
    const filters = desk.normalizeFilters(req.body || {});
    const result = await desk.nextBrokers(filters, userId(req));
    const stats = await desk.stats();
    res.json({
      ok: true,
      count: result.brokers.length,
      ...result,
      stats,
      source: 'FMCSA Company Census brokers',
      disclaimer: 'Public FMCSA census. Verify authority on SAFER before booking. Next skips companies already shown or contacted.'
    });
  } catch (err) {
    console.error('Broker marketing next:', err);
    res.status(err.status >= 400 && err.status < 500 ? err.status : 502).json({
      error: err.message || 'Broker census failed.'
    });
  }
});

router.post('/reset-shown', async (req, res) => {
  try {
    const cleared = await desk.resetShownKeepContacted();
    res.json({
      ok: true,
      cleared,
      stats: await desk.stats(),
      note: 'Shown-only rows were cleared. Emailed / SMS / Vapi brokers stay skipped.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not reset shown rows.' });
  }
});

router.post('/outreach', async (req, res) => {
  try {
    const body = req.body || {};
    const dots = Array.isArray(body.dots) ? body.dots : [];
    const channel = String(body.channel || '').toLowerCase();
    const result = await desk.outreachBrokers({
      dots,
      channel,
      user: req.user,
      consentConfirmed: body.consent_confirmed === true || body.consentConfirmed === true,
      customMessage: body.custom_message || body.customMessage
    });
    if (!result.ok && result.error) {
      return res.status(400).json({ error: result.error });
    }
    result.stats = await desk.stats();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not send outreach.' });
  }
});

module.exports = router;
