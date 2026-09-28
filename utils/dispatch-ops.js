const pool = require('../db');
const { ensureBoardSchema } = require('./loadboard-sync');
const { isWithinTcpaHours } = require('./us-timezones');

const CHECK_AFTER_BOOK_MS = 2 * 60 * 60 * 1000;
const CHECK_GAP_MS = 4 * 60 * 60 * 1000;
const INBOUND_QUIET_MS = 30 * 60 * 1000;
const MAX_POD_BYTES = 5 * 1024 * 1024;
const DEFAULT_FREE_MINUTES = 120;

function iso(ms) {
  return new Date(ms).toISOString();
}

function parseFreeTimeMinutes(ratecon) {
  const hay = JSON.stringify(ratecon || '');
  const hour = hay.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+free/i)
    || hay.match(/free\s+(?:time\s*)?(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  if (hour) return { minutes: Math.round(Number(hour[1]) * 60), assumed: false };
  const mins = hay.match(/(\d+)\s*(?:minutes?|mins?)\s+free/i)
    || hay.match(/free\s+(?:time\s*)?(?:of\s*)?(\d+)\s*(?:minutes?|mins?)/i);
  if (mins) return { minutes: Number(mins[1]), assumed: false };
  return { minutes: DEFAULT_FREE_MINUTES, assumed: true };
}

// Operational texts from a driver who is already booked. Reload / next-load stay with parseCarrierText.
function parseTransitText(text) {
  const body = String(text || '').trim();
  if (!body) return null;
  const lower = body.toLowerCase();
  if (/\b(arrived(?:\s+at)?\s+(?:the\s+)?shipper|at\s+(?:the\s+)?shipper|at\s+pickup|checked\s+in(?:\s+at)?\s+(?:the\s+)?(?:shipper|pickup)|here\s+at\s+(?:the\s+)?(?:shipper|pickup))\b/.test(lower)) {
    return { intent: 'arrived_shipper' };
  }
  if (/\b(arrived(?:\s+at)?\s+(?:the\s+)?(?:receiver|consignee|delivery|dest(?:ination)?)|at\s+(?:the\s+)?(?:receiver|consignee|delivery))\b/.test(lower)) {
    return { intent: 'arrived_receiver' };
  }
  if (/\b(loaded|rolling|departed(?:\s+the)?\s+shipper|left(?:\s+the)?\s+shipper)\b/.test(lower)) {
    return { intent: 'loaded' };
  }
  if (/\b(waiting|detention|sitting|been\s+here)\b/.test(lower)) {
    return { intent: 'waiting' };
  }
  if (/\b(departed(?:\s+the)?\s+receiver|left(?:\s+the)?\s+receiver)\b/.test(lower)) {
    return { intent: 'departed' };
  }
  if (/\b(delivered|unloaded|empty\s+now|i'?m\s+empty|i\s+am\s+empty)\b/.test(lower)) {
    return { intent: 'delivered' };
  }
  if (/\b(pod|proof\s+of\s+delivery|bill\s+of\s+lading|\bbol\b|paperwork)\b/.test(lower)) {
    return { intent: 'pod' };
  }
  return null;
}

function initBookedOps(now = Date.now(), ratecon = null) {
  const free = parseFreeTimeMinutes(ratecon);
  return {
    transit: {
      status: 'booked',
      booked_at: iso(now),
      last_check_at: null,
      last_driver_update_at: null,
      next_check_at: iso(now + CHECK_AFTER_BOOK_MS),
      history: [{ at: iso(now), status: 'booked' }]
    },
    detention: {
      free_time_minutes: free.minutes,
      assumed_2h_until_ratecon_says: free.assumed,
      billed_amount: null,
      hourly_rate: null,
      shipper: null,
      receiver: null,
      notified_at: null,
      notified_stop: null
    }
  };
}

function minutesBetween(fromIso, toMs) {
  if (!fromIso) return 0;
  const start = new Date(fromIso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round((toMs - start) / 60000));
}

function closeStop(stop, at, freeMinutes) {
  if (!stop || !stop.arrived_at) return stop;
  if (stop.departed_at) {
    const minutes = stop.minutes || minutesBetween(stop.arrived_at, new Date(stop.departed_at).getTime());
    return { ...stop, minutes, over_free_minutes: Math.max(0, minutes - freeMinutes) };
  }
  const minutes = minutesBetween(stop.arrived_at, at);
  return {
    ...stop,
    departed_at: iso(at),
    minutes,
    over_free_minutes: Math.max(0, minutes - freeMinutes)
  };
}

function openStop(existing, at, assumed) {
  if (existing && existing.arrived_at && !existing.departed_at) return existing;
  return {
    arrived_at: iso(at),
    departed_at: null,
    minutes: 0,
    over_free_minutes: 0,
    assumed: Boolean(assumed)
  };
}

function liveStop(stop, now, freeMinutes) {
  if (!stop || !stop.arrived_at) return null;
  const end = stop.departed_at ? new Date(stop.departed_at).getTime() : now;
  const minutes = minutesBetween(stop.arrived_at, end);
  return { ...stop, minutes, over_free_minutes: Math.max(0, minutes - freeMinutes) };
}

function overFree(stop, now, freeMinutes) {
  const live = liveStop(stop, now, freeMinutes);
  return live && live.over_free_minutes > 0 ? live : null;
}

function applyTransit(offer, intent, at = Date.now()) {
  const seeded = initBookedOps(at, offer && offer.ratecon);
  const transit = { ...seeded.transit, ...(offer && offer.transit ? offer.transit : {}) };
  transit.history = Array.isArray(transit.history) ? transit.history.slice() : [];
  const detention = { ...seeded.detention, ...(offer && offer.detention ? offer.detention : {}) };
  const free = Number(detention.free_time_minutes) || DEFAULT_FREE_MINUTES;
  const prev = transit.status || 'booked';
  let status = prev;
  let emailStop = null;

  if (intent === 'arrived_shipper') {
    detention.shipper = openStop(detention.shipper, at, false);
    status = 'arrived_shipper';
  } else if (intent === 'loaded') {
    detention.shipper = closeStop(detention.shipper, at, free);
    status = 'loaded';
  } else if (intent === 'arrived_receiver') {
    if (detention.shipper && detention.shipper.arrived_at && !detention.shipper.departed_at) {
      detention.shipper = closeStop(detention.shipper, at, free);
    }
    detention.receiver = openStop(detention.receiver, at, false);
    status = 'arrived_receiver';
  } else if (intent === 'waiting') {
    if (prev === 'arrived_shipper' || (detention.shipper && detention.shipper.arrived_at && !detention.shipper.departed_at)) {
      status = 'waiting';
    } else if (prev === 'arrived_receiver' || (detention.receiver && detention.receiver.arrived_at && !detention.receiver.departed_at)) {
      status = 'waiting';
    } else {
      detention.receiver = openStop(detention.receiver, at, true);
      status = 'waiting';
    }
  } else if (intent === 'departed' || intent === 'delivered') {
    if (detention.shipper && detention.shipper.arrived_at && !detention.shipper.departed_at) {
      detention.shipper = closeStop(detention.shipper, at, free);
    }
    if (detention.receiver && detention.receiver.arrived_at && !detention.receiver.departed_at) {
      detention.receiver = closeStop(detention.receiver, at, free);
    }
    status = 'delivered';
  } else if (intent === 'pod') {
    if (prev === 'arrived_receiver' || prev === 'waiting' || prev === 'loaded') status = 'delivered';
    if (status === 'delivered' && detention.receiver && detention.receiver.arrived_at && !detention.receiver.departed_at) {
      detention.receiver = closeStop(detention.receiver, at, free);
    }
  }

  if (intent !== 'pod' || status !== prev) {
    transit.status = status;
    transit.last_driver_update_at = iso(at);
    transit.next_check_at = iso(at + CHECK_GAP_MS);
    transit.history.push({ at: iso(at), status, intent });
  }

  const shipperOver = overFree(detention.shipper, at, free);
  const receiverOver = overFree(detention.receiver, at, free);
  if (!detention.notified_at && (shipperOver || receiverOver)) {
    emailStop = receiverOver ? 'receiver' : 'shipper';
  }

  return { transit, detention, emailStop, status: transit.status };
}

function isTwilioMediaUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && (u.hostname === 'api.twilio.com' || u.hostname.endsWith('.twilio.com'));
  } catch {
    return false;
  }
}

async function fetchTwilioMedia(url) {
  if (!isTwilioMediaUrl(url)) throw new Error('Photo URL is not from Twilio.');
  const headers = {};
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (sid && token) headers.Authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new Error('Could not download the photo.');
  const contentType = String(res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  if (!/^image\//i.test(contentType)) throw new Error('That file is not a photo.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_POD_BYTES) throw new Error('That photo is empty or too large.');
  const twilioSid = String(url).match(/\/Media\/(ME[A-Za-z0-9]+)/i);
  return { buffer: buf, contentType, twilioSid: twilioSid ? twilioSid[1] : null };
}

async function storePod({ offerId, carrierId, buffer, contentType, twilioSid, note }) {
  const { rows } = await pool.query(
    `INSERT INTO ai_dispatch_pods (offer_id, carrier_id, content_type, bytes, twilio_sid, note)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, offer_id, carrier_id, content_type, twilio_sid, note, created_at`,
    [offerId, carrierId, contentType, buffer, twilioSid || null, note ? String(note).slice(0, 200) : null]
  );
  return rows[0];
}

async function getPod(id) {
  const { rows } = await pool.query(
    'SELECT id, offer_id, carrier_id, content_type, bytes, twilio_sid, note, created_at FROM ai_dispatch_pods WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function currentBookedOffer(carrierId) {
  await ensureBoardSchema();
  const { rows } = await pool.query(
    `SELECT o.*, row_to_json(c) AS carrier, row_to_json(l) AS load
       FROM ai_dispatch_offers o
       JOIN ai_dispatch_carriers c ON c.id = o.carrier_id
       LEFT JOIN loads l ON l.id = o.load_id
      WHERE o.carrier_id = $1 AND o.status = 'booked'
        AND COALESCE(o.transit->>'status', 'booked') <> 'delivered'
      ORDER BY o.updated_at DESC LIMIT 1`,
    [carrierId]
  );
  return rows[0] || null;
}

async function saveOfferOps(offerId, transit, detention) {
  await pool.query(
    'UPDATE ai_dispatch_offers SET transit = $2::jsonb, detention = $3::jsonb, updated_at = now() WHERE id = $1',
    [offerId, JSON.stringify(transit), JSON.stringify(detention)]
  );
}

function moneyNone() {
  return null;
}

function detentionEmailBody({ carrier, load, detention, stop, offerId }) {
  const free = Number(detention.free_time_minutes) || DEFAULT_FREE_MINUTES;
  const live = liveStop(detention[stop], Date.now(), free);
  const minutes = live ? live.minutes : 0;
  const over = live ? live.over_free_minutes : 0;
  const assumed = detention.assumed_2h_until_ratecon_says
    ? ' (assumed 2 hours until the rate confirmation says otherwise)'
    : '';
  const lane = load ? `${load.pickup_location} → ${load.delivery_location}` : '';
  return [
    `Hello ${load && load.broker_name ? load.broker_name : 'team'},`,
    '',
    `Shipping Wish dispatches for ${carrier.company_name}. On load ${load && load.load_number ? load.load_number : ''} (${lane}) the driver reported they have been waiting at the ${stop} for ${minutes} minutes.`,
    `Free time on file is ${free} minutes${assumed}. That is ${over} minutes past free time.`,
    '',
    'We are not billing a dollar amount. Reply with the detention rate if it applies, or call us.',
    '',
    'Shipping Wish Dispatch'
  ].join('\n');
}

async function emailDetention(offer, stop) {
  const load = offer.load || {};
  const carrier = offer.carrier || {};
  const m = String(load.broker_contact || offer.broker_email || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const brokerEmail = offer.broker_email || (m ? m[0].toLowerCase() : null);
  const text = detentionEmailBody({ carrier, load, detention: offer.detention, stop, offerId: offer.id });
  if (!brokerEmail) return { sent: false, reason: 'no_broker_email' };
  try {
    const ops = process.env.DISPATCH_EMAIL || process.env.MAIL_REPLY_TO || require('./email-templates').COMPANY.operationsEmail;
    await require('./mailer').sendBrandedEmail({
      to: brokerEmail,
      subject: `Waiting past free time ${load.load_number || ''}: ${load.pickup_location || ''} → ${load.delivery_location || ''} [SWD-${offer.id}]`,
      text,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`,
      transactional: true,
      emailType: 'dispatch_detention',
      replyTo: ops || undefined
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

async function persistTransit(offer, intent, at = Date.now()) {
  const result = applyTransit(offer, intent, at);
  if (result.emailStop && !result.detention.notified_at) {
    const mailed = await emailDetention({ ...offer, detention: result.detention, load: offer.load, carrier: offer.carrier }, result.emailStop);
    if (mailed.sent) {
      result.detention.notified_at = iso(at);
      result.detention.notified_stop = result.emailStop;
    }
  }
  await saveOfferOps(offer.id, result.transit, result.detention);
  return result;
}

function transitReply(intent, load, status) {
  const number = load && load.load_number ? load.load_number : 'the load';
  if (intent === 'arrived_shipper') return `Shipping Wish: Noted, arrived at shipper on ${number}. Reply LOADED when you roll, or WAITING if they hold you.`;
  if (intent === 'loaded') return `Shipping Wish: Noted, loaded on ${number}. Reply ARRIVED RECEIVER when you get there.`;
  if (intent === 'arrived_receiver') return `Shipping Wish: Noted, arrived at receiver on ${number}. Reply WAITING if they hold you, DELIVERED when empty, and photo the POD.`;
  if (intent === 'waiting') return `Shipping Wish: Noted, waiting on ${number}. We are clocking minutes. No dollar amount is billed until a dispatcher sets the rate. Photo the POD when you unload.`;
  if (intent === 'pod') return `Shipping Wish: POD photo saved for ${number}. Reply RELOAD when you want the next load.`;
  if (status === 'delivered' || intent === 'delivered' || intent === 'departed') {
    return `Shipping Wish: ${number} marked delivered. Reply RELOAD for the next load from delivery.`;
  }
  return `Shipping Wish: Update saved for ${number}.`;
}

async function saveMediaPods(offer, carrier, media, note) {
  const saved = [];
  const errors = [];
  for (const item of media || []) {
    try {
      const file = await fetchTwilioMedia(item.url);
      const row = await storePod({
        offerId: offer.id,
        carrierId: carrier.id,
        buffer: file.buffer,
        contentType: file.contentType || item.contentType || 'image/jpeg',
        twilioSid: file.twilioSid,
        note
      });
      saved.push(row);
    } catch (err) {
      errors.push(err.message);
    }
  }
  return { saved, errors };
}

async function runCheckCalls({ textCarrier, outboundToday, maxOutbound }) {
  await ensureBoardSchema();
  const { rows } = await pool.query(
    `SELECT o.*, row_to_json(c) AS carrier, row_to_json(l) AS load
       FROM ai_dispatch_offers o
       JOIN ai_dispatch_carriers c ON c.id = o.carrier_id
       LEFT JOIN loads l ON l.id = o.load_id
      WHERE o.status = 'booked'
        AND COALESCE(o.transit->>'status', 'booked') <> 'delivered'
        AND c.sms_consent = TRUE
        AND c.status = 'active'
      ORDER BY o.id`
  );
  const sent = [];
  const skipped = [];
  for (const offer of rows) {
    const carrier = offer.carrier;
    const hours = isWithinTcpaHours(carrier.phone);
    if (!hours.allowed) {
      skipped.push({ id: offer.id, skipped: 'hours', reason: hours.reason });
      continue;
    }
    if (await outboundToday(carrier.id) >= maxOutbound) {
      skipped.push({ id: offer.id, skipped: 'cap' });
      continue;
    }
    if (carrier.last_inbound_at && Date.now() - new Date(carrier.last_inbound_at).getTime() < INBOUND_QUIET_MS) {
      skipped.push({ id: offer.id, skipped: 'recent_inbound' });
      continue;
    }
    const transit = offer.transit || {};
    if (transit.last_check_at && Date.now() - new Date(transit.last_check_at).getTime() < CHECK_GAP_MS) {
      skipped.push({ id: offer.id, skipped: 'gap' });
      continue;
    }
    if (transit.next_check_at && new Date(transit.next_check_at).getTime() > Date.now()) {
      skipped.push({ id: offer.id, skipped: 'not_due' });
      continue;
    }
    const load = offer.load || {};
    const text = `Shipping Wish check-call on ${load.load_number || 'your load'} (${load.pickup_location || ''} → ${load.delivery_location || ''}). Where are you? Reply ARRIVED SHIPPER, LOADED, WAITING, ARRIVED RECEIVER, or DELIVERED. Photo the POD when you unload.`;
    const sms = await textCarrier(carrier, text, 'check_call');
    const next = {
      ...transit,
      last_check_at: iso(Date.now()),
      next_check_at: iso(Date.now() + CHECK_GAP_MS)
    };
    await pool.query(
      'UPDATE ai_dispatch_offers SET transit = $2::jsonb, updated_at = now() WHERE id = $1',
      [offer.id, JSON.stringify(next)]
    );
    sent.push({ id: offer.id, sms });
  }
  return { sent: sent.length, details: sent, skipped };
}

function summarizeTransit(transit) {
  if (!transit || !transit.status) return null;
  return {
    status: transit.status,
    last_driver_update_at: transit.last_driver_update_at || null,
    last_check_at: transit.last_check_at || null,
    next_check_at: transit.next_check_at || null
  };
}

function summarizeDetention(detention, now = Date.now()) {
  if (!detention) return null;
  const free = Number(detention.free_time_minutes) || DEFAULT_FREE_MINUTES;
  const shipper = liveStop(detention.shipper, now, free);
  const receiver = liveStop(detention.receiver, now, free);
  return {
    free_time_minutes: free,
    assumed_2h_until_ratecon_says: Boolean(detention.assumed_2h_until_ratecon_says),
    billed_amount: detention.billed_amount == null ? moneyNone() : detention.billed_amount,
    hourly_rate: detention.hourly_rate == null ? null : detention.hourly_rate,
    notified_at: detention.notified_at || null,
    shipper,
    receiver
  };
}

module.exports = {
  CHECK_AFTER_BOOK_MS,
  CHECK_GAP_MS,
  INBOUND_QUIET_MS,
  DEFAULT_FREE_MINUTES,
  parseTransitText,
  parseFreeTimeMinutes,
  initBookedOps,
  applyTransit,
  liveStop,
  persistTransit,
  transitReply,
  saveMediaPods,
  currentBookedOffer,
  saveOfferOps,
  runCheckCalls,
  getPod,
  storePod,
  fetchTwilioMedia,
  summarizeTransit,
  summarizeDetention,
  emailDetention
};
