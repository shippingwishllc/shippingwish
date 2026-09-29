const express = require('express');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { auditLog, getClientIp } = require('../utils/audit');
const { sendBrandedEmail } = require('../utils/mailer');
const { isPhoneOptedOut } = require('../utils/sms-inbox');
const { isWithinTcpaHours } = require('../utils/us-timezones');
const store = require('../utils/track-share');

const router = express.Router();
const senders = [
  requireAuth,
  requireRole('admin', 'super_admin', 'dispatcher', 'carrier', 'carrier_admin', 'broker')
];

function tokenParam(req) {
  return String(req.params.token || req.query.t || '').trim();
}

router.post('/send', ...senders, async (req, res) => {
  try {
    const loadId = req.body.load_id || req.body.loadId;
    const row = await store.createShare({
      user: req.user,
      loadId,
      driverPhone: req.body.driver_phone,
      driverName: req.body.driver_name,
      driverEmail: req.body.driver_email,
      brokerEmail: req.body.broker_email,
      brokerName: req.body.broker_name
    });

    let sms = { sent: false, reason: 'not requested' };
    const wantSms = req.body.send_sms !== false;
    if (wantSms && row.driver_phone) {
      if (await isPhoneOptedOut(row.driver_phone)) {
        sms = { sent: false, reason: 'STOP on file' };
      } else if (!isWithinTcpaHours(row.driver_phone).allowed) {
        sms = { sent: false, reason: 'Outside 9am–5pm driver local time. In-app + email still work.' };
      } else {
        try {
          const { sendTwilioSms } = require('./voip');
          const body = `${row.broker_name || 'The broker'} sent tracking for ${row.pickup_location || 'pickup'} to ${row.delivery_location || 'delivery'}. Tap Accept to share this load’s GPS only: ${store.acceptUrl(row.accept_token)}`;
          const sent = await sendTwilioSms(row.driver_phone, body);
          sms = sent ? { sent: true } : { sent: false, reason: 'SMS provider did not send' };
        } catch (err) {
          sms = { sent: false, reason: err.message || 'SMS failed' };
        }
      }
      await store.markSms(row.id, { sent: sms.sent, reason: sms.reason });
    } else if (wantSms && !row.driver_phone) {
      sms = { sent: false, reason: 'No driver phone on the load' };
      await store.markSms(row.id, sms);
    }

    if (row.broker_email && String(row.broker_email).includes('@')) {
      try {
        await sendBrandedEmail({
          to: row.broker_email,
          subject: `Tracking link for load ${row.load_number || row.load_id}`,
          transactional: true,
          text: `Driver tracking for ${row.pickup_location} to ${row.delivery_location}.\nStatus: waiting for driver to Accept.\nWatch live GPS after they accept: ${store.viewUrl(row.view_token)}\nThis is Shipping Wish / LoadsNexus SW Track — not MacroPoint.`,
          html: `<p>Driver tracking for <strong>${row.pickup_location || ''} → ${row.delivery_location || ''}</strong>.</p><p>Status: waiting for the driver to tap Accept.</p><p><a href="${store.viewUrl(row.view_token)}">Open live map</a> (empty until the driver accepts and the phone sends GPS).</p><p>This is SW Track on Shipping Wish / LoadsNexus. It is not MacroPoint, FourKites, or an FMCSA ELD.</p>`
        });
        await store.markEmail(row.id);
      } catch (_) { /* email optional */ }
    }

    auditLog(req.user.id, 'TRACK_SHARE_SEND', 'load_tracking_shares', row.id, { load_id: row.load_id }, getClientIp(req));
    res.json({
      ok: true,
      how: 'Same method brokers use: driver gets a link, taps Accept, phone GPS is shared for this load only. Not MacroPoint and not an ELD device.',
      share: store.publicShare(row, { includeTokens: true }),
      sms
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not send tracking.' });
  }
});

router.get('/desk', ...senders, async (req, res) => {
  try {
    const rows = await store.sharesForUser(req.user, req.query.load_id);
    res.json({
      ok: true,
      shares: rows.map((r) => store.publicShare(r, { includeTokens: true }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load tracking desk.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const rows = await store.pendingForDriver(req.user);
    res.json({ ok: true, shares: rows.map((r) => store.publicShare(r, { includeTokens: true })) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load tracking requests.' });
  }
});

router.post('/:id/stop', ...senders, async (req, res) => {
  const ok = await store.stopShare(parseInt(req.params.id, 10), req.user);
  if (!ok) return res.status(404).json({ error: 'Tracking share not found.' });
  res.json({ ok: true });
});

router.get('/accept/:token', optionalAuth, async (req, res) => {
  const row = await store.byAcceptToken(tokenParam(req));
  if (!row) return res.status(404).json({ error: 'Tracking link not found.' });
  res.json({
    ok: true,
    share: store.publicShare(row),
    note: 'Accepting shares this phone’s GPS with the broker for this load only.'
  });
});

router.post('/accept/:token', optionalAuth, async (req, res) => {
  try {
    const row = await store.byAcceptToken(tokenParam(req));
    if (!row) return res.status(404).json({ error: 'Tracking link not found.' });
    const updated = await store.acceptShare(row, { userId: req.user && req.user.id });
    res.json({
      ok: true,
      share: store.publicShare(Object.assign(row, updated)),
      ping_path: `/api/track-share/ping/${row.accept_token}`
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not accept tracking.' });
  }
});

router.post('/decline/:token', optionalAuth, async (req, res) => {
  const row = await store.byAcceptToken(tokenParam(req));
  if (!row) return res.status(404).json({ error: 'Tracking link not found.' });
  await store.declineShare(row);
  res.json({ ok: true });
});

router.post('/ping/:token', optionalAuth, async (req, res) => {
  try {
    const row = await store.byAcceptToken(tokenParam(req));
    if (!row) return res.status(404).json({ error: 'Tracking link not found.' });
    const ping = await store.recordPing(row, {
      lat: req.body.latitude ?? req.body.gps_lat,
      lon: req.body.longitude ?? req.body.gps_lon,
      locationName: req.body.locationName
    });
    res.json({ ok: true, ...ping });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not save GPS ping.' });
  }
});

router.get('/view/:token', async (req, res) => {
  const row = await store.byViewToken(tokenParam(req));
  if (!row) return res.status(404).json({ error: 'Tracking link not found.' });
  res.json({
    ok: true,
    share: store.publicShare(row),
    note: row.status === 'accepted' && !row.last_lat
      ? 'Driver accepted. Waiting for a real GPS ping from the phone.'
      : null
  });
});

module.exports = router;
