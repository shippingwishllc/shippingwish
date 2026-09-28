const crypto = require('crypto');
const pool = require('../db');
const { ensureBoardSchema } = require('./loadboard-sync');
const { isWithinTcpaHours } = require('./us-timezones');
const {
  STATE_CENTERS, STATE_NAMES, REGIONS, AMBIGUOUS_CODES, KNOWN_CITIES,
  milesBetween, roadMiles, stateOf, stateCenter, parsePlace, placeLabel, geocode
} = require('./geo');
const { checkBrokerAuthority, cachedBlockedKeys, keyFor, summarize: summarizeAuthority } = require('./broker-authority');

const OFFER_TTL_HOURS = 3;
const MAX_OUTBOUND_PER_DAY = 12;
const CANDIDATE_LIMIT = 400;
const GEOCODE_LIMIT = 60;
const DEFAULT_MAX_DEADHEAD = 150;

const EQUIPMENT = [
  ['reefer', /\b(reefer|refrigerated|temp(erature)? control)/i],
  ['flatbed', /\bflat ?bed\b/i],
  ['step deck', /\b(step ?deck|drop ?deck)\b/i],
  ['power only', /\bpower ?only\b/i],
  ['hotshot', /\bhot ?shot\b/i],
  ['box truck', /\b(box truck|straight truck|26 ?ft)\b/i],
  ['van', /\b(dry ?van|van|53)\b/i]
];

function equipmentKind(text) {
  const value = String(text || '');
  for (const [kind, re] of EQUIPMENT) if (re.test(value)) return kind;
  return null;
}

function phoneTail(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function money(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

function shortDate(value) {
  if (!value) return 'date open';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'date open';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
}

function statesIn(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const found = [];
  const add = (code) => { if (code && STATE_CENTERS[code] && !found.includes(code)) found.push(code); };
  for (const [name, code] of Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) add(code);
  }
  for (const [region, codes] of Object.entries(REGIONS)) {
    if (new RegExp(`\\b${region}\\b`).test(lower)) codes.forEach(add);
  }
  for (const token of raw.match(/\b[A-Za-z]{2}\b/g) || []) {
    const code = token.toUpperCase();
    if (!STATE_CENTERS[code]) continue;
    if (AMBIGUOUS_CODES.has(code) && token !== code) continue;
    add(code);
  }
  return found;
}

// Only standalone state codes, so "Kansas City" still counts as a city name.
function codesIn(text) {
  return (String(text || '').match(/\b[A-Za-z]{2}\b/g) || []).filter((t) => {
    const code = t.toUpperCase();
    return STATE_CENTERS[code] && (!AMBIGUOUS_CODES.has(code) || t === code);
  });
}

function citiesIn(text) {
  const lower = String(text || '').toLowerCase();
  const found = [];
  for (const [name, info] of Object.entries(KNOWN_CITIES)) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) found.push(info);
  }
  return found;
}

function parseDestination(text, carrier) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (/\b(any ?where|any|all 48|open)\b/i.test(raw)) return { any: true, states: [], label: 'anywhere' };
  const states = [];
  let point = null;
  if (/\bhome\b/i.test(raw) && carrier && carrier.home_state) states.push(carrier.home_state);
  const zip = raw.match(/\b(\d{5})\b/);
  if (zip) point = { zip: zip[1] };
  const namedStates = statesIn(raw);
  const place = !zip && codesIn(raw).length <= 1 ? parsePlace(raw) : null;
  if (place && place.city && !codesIn(place.city).length) point = place;
  for (const city of citiesIn(raw)) {
    if (!point) point = { city: city.city, state: city.state };
    if (!states.includes(city.state)) states.push(city.state);
  }
  for (const code of namedStates) if (!states.includes(code)) states.push(code);
  if (point && point.state && !states.includes(point.state)) states.push(point.state);
  if (!states.length && !point) return null;
  return { any: false, states, point, label: point && point.city ? placeLabel(point) : states.join('/') };
}

function parseOrigin(text) {
  const raw = String(text || '').replace(/\b(empty|i am|i'm|im|in|at|near|around|out of|from|currently)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const zip = raw.match(/\b(\d{5})\b/);
  if (zip) return { zip: zip[1] };
  const place = parsePlace(raw.replace(/[,.]+$/, ''));
  if (place && place.city && codesIn(place.city).length) return null;
  if (place && (place.city || place.zip)) return place;
  const cities = citiesIn(raw);
  if (cities.length) return { city: cities[0].city, state: cities[0].state };
  if (place && place.state) return place;
  return null;
}

// Reads a carrier text like "75201 to Atlanta", "empty in Dallas TX want GA or FL reefer",
// "2", "more", or "off today". Deterministic rules first; the model is only a fallback.
function parseCarrierText(text, carrier = {}) {
  const body = String(text || '').trim();
  const lower = body.toLowerCase();
  const out = { intent: 'unknown', origin: null, destination: null, equipment: equipmentKind(body), choice: null };
  const pick = lower.match(/^(?:yes|y|book|take|want|ok)?\s*#?\s*([1-3])\s*[.!]?$/);
  if (pick) return { ...out, intent: 'book', choice: Number(pick[1]) };
  if (/^(no|nope|none|pass|more|other|others|next|not those|something else)\b/.test(lower)) return { ...out, intent: 'more' };
  if (/\b(off today|day off|home time|not working|no loads today|taking (a|the) day|resting|on break|done for (the )?day)\b/.test(lower)) {
    return { ...out, intent: 'off' };
  }
  if (/^(help|\?|what|how)\b/.test(lower) && !/\d{5}/.test(lower)) return { ...out, intent: 'question' };

  const destLead = body.match(/^(?:i\s+)?(?:want to go to|want to go|wanna go to|wanna go|going to|heading to|headed to|looking for|wants|want|prefer|going|heading|to)\s+(.+)$/i);
  if (destLead) {
    out.destination = parseDestination(destLead[1], carrier);
    if (out.destination) out.intent = 'loads';
    return out;
  }
  const split = body.split(/\s+(?:going to|heading to|headed to|want to go to|want to go|wanna go to|wanna go|looking for|wants|want|prefer|to|going|heading)\s+|\s*(?:->|→)\s*/i);
  const left = split[0];
  const right = split.slice(1).join(' ');
  out.origin = parseOrigin(left);
  out.destination = parseDestination(right, carrier);
  if (out.origin || out.destination) out.intent = 'loads';
  if (/\?$/.test(body) && out.intent === 'unknown') out.intent = 'question';
  return out;
}

async function askModelToParse(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      model: process.env.OUTREACH_AI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You read one text message from a US truck driver to a dispatcher. Return JSON: {"intent":"loads|book|more|off|question|other","origin":"ZIP or City, ST or empty","destination":"City, ST or state codes or anywhere or empty","equipment":"van|reefer|flatbed|step deck|power only|hotshot|box truck or empty","choice":1-3 or null}. Never guess a place the driver did not write.'
        },
        { role: 'user', content: String(text || '').slice(0, 600) }
      ]
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  try { return JSON.parse(data.choices[0].message.content); } catch { return null; }
}

async function understand(text, carrier) {
  const parsed = parseCarrierText(text, carrier);
  if (parsed.intent !== 'unknown') return { ...parsed, via: 'rules' };
  const ai = await askModelToParse(text).catch(() => null);
  if (!ai) return { ...parsed, via: 'rules' };
  const result = {
    intent: ['loads', 'book', 'more', 'off', 'question'].includes(ai.intent) ? ai.intent : 'unknown',
    origin: ai.origin ? parseOrigin(String(ai.origin)) : null,
    destination: ai.destination ? parseDestination(String(ai.destination), carrier) : null,
    equipment: equipmentKind(ai.equipment) || parsed.equipment,
    choice: [1, 2, 3].includes(Number(ai.choice)) ? Number(ai.choice) : null,
    via: 'ai'
  };
  if (result.intent === 'book' && !result.choice) result.intent = 'unknown';
  if (result.intent === 'loads' && !result.origin && !result.destination) result.intent = 'unknown';
  return result;
}

function listStates(value) {
  return String(value || '').toUpperCase().split(/[^A-Z]+/).filter((code) => STATE_CENTERS[code]);
}

// Real average $/mile on our own board for a state-to-state lane, only when enough loads exist.
async function laneBenchmark(fromState, toState) {
  if (!fromState || !toState) return null;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n, ROUND(AVG(rate / NULLIF(miles, 0))::numeric, 2) AS rpm
       FROM loads
      WHERE miles > 0 AND rate > 0 AND created_at > now() - interval '30 days'
        AND upper(COALESCE(pickup_state, substring(pickup_location from ',\\s*([A-Za-z]{2})'))) = $1
        AND upper(COALESCE(delivery_state, substring(delivery_location from ',\\s*([A-Za-z]{2})'))) = $2`,
    [fromState, toState]
  );
  const row = rows[0];
  return row && row.n >= 5 ? { loads: row.n, rpm: Number(row.rpm) } : null;
}

async function findMatches(carrier, { origin, destination, equipment, excludeLoadIds = [], limit = 3 } = {}) {
  await ensureBoardSchema();
  const originPt = origin ? await geocode(origin) : null;
  if (!originPt) return { originPt: null, matches: [], others: [], reasons: { no_origin: 1 } };
  const maxDeadhead = Number(carrier.max_deadhead) || DEFAULT_MAX_DEADHEAD;
  const minRpm = Number(carrier.min_rpm) || 0;
  const wantKind = equipmentKind(equipment || carrier.equipment);
  const avoid = listStates(carrier.avoid_states);
  const dest = destination && !destination.any ? destination : null;
  const destPt = dest && dest.point ? await geocode(dest.point) : null;

  const { rows } = await pool.query(
    `SELECT l.id, l.load_number, l.pickup_location, l.delivery_location, l.pickup_state, l.delivery_state,
            l.pickup_date, l.rate, l.miles, l.equipment_type, l.weight, l.commodity,
            l.broker_name, l.broker_mc, l.broker_contact, l.source_type
       FROM loads l
      WHERE l.status = 'new' AND l.rate > 0
        AND (l.pickup_date IS NULL OR l.pickup_date >= CURRENT_DATE)
        AND NOT (l.id = ANY($1::int[]))
        AND NOT EXISTS (SELECT 1 FROM ai_dispatch_offers o WHERE o.load_id = l.id AND o.status IN ('requested', 'booked'))
      ORDER BY l.created_at DESC
      LIMIT $2`,
    [excludeLoadIds.map(Number).filter(Number.isFinite), CANDIDATE_LIMIT]
  );

  const reasons = { equipment: 0, too_far: 0, below_min_rpm: 0, avoided_state: 0, broker_failed_fmcsa: 0 };
  const blocked = await cachedBlockedKeys().catch(() => new Set());
  const rough = [];
  for (const load of rows) {
    const brokerKey = keyFor({ mc: load.broker_mc });
    if (brokerKey && blocked.has(brokerKey)) { reasons.broker_failed_fmcsa++; continue; }
    const pState = (load.pickup_state || stateOf(load.pickup_location) || '').toUpperCase().trim();
    const dState = (load.delivery_state || stateOf(load.delivery_location) || '').toUpperCase().trim();
    const loadKind = equipmentKind(load.equipment_type);
    if (wantKind && loadKind && wantKind !== loadKind && !(wantKind === 'power only')) { reasons.equipment++; continue; }
    if (dState && avoid.includes(dState)) { reasons.avoided_state++; continue; }
    const center = stateCenter(pState);
    const guess = center ? milesBetween(originPt, center) : null;
    // A state center can sit a few hundred miles from its border, so this only drops the obvious misses.
    if (guess != null && guess > maxDeadhead + 400) { reasons.too_far++; continue; }
    rough.push({ load, pState, dState, guess: guess == null ? 9999 : guess });
  }
  rough.sort((a, b) => a.guess - b.guess);

  const scored = [];
  for (const item of rough.slice(0, GEOCODE_LIMIT)) {
    const { load, pState, dState } = item;
    const pickupPt = await geocode(load.pickup_location);
    if (!pickupPt) continue;
    const deadhead = roadMiles(originPt, pickupPt);
    if (deadhead == null || deadhead > maxDeadhead) { reasons.too_far++; continue; }
    let loaded = Number(load.miles) || 0;
    let estimated = false;
    if (!loaded) {
      const deliveryPt = await geocode(load.delivery_location);
      loaded = deliveryPt ? roadMiles(pickupPt, deliveryPt) || 0 : 0;
      estimated = true;
    }
    if (!loaded) continue;
    estimated = estimated || pickupPt.approx || originPt.approx;
    const rate = Number(load.rate);
    const allIn = rate / (loaded + deadhead);
    if (minRpm && allIn < minRpm) { reasons.below_min_rpm++; continue; }
    let destMatch = !dest;
    let destNear = false;
    if (dest) {
      destMatch = dest.states.includes(dState);
      if (destPt) {
        const deliveryPt = await geocode(load.delivery_location);
        const off = deliveryPt ? milesBetween(destPt, deliveryPt) : null;
        destNear = off != null && off <= 120;
        destMatch = destMatch || destNear;
      }
    }
    const homeBonus = carrier.home_state && dState === String(carrier.home_state).toUpperCase() ? 15 : 0;
    const score = allIn * 100 - deadhead * 0.25 + (destNear ? 60 : destMatch && dest ? 40 : 0) + homeBonus;
    scored.push({
      load,
      pickupState: pState,
      deliveryState: dState,
      deadhead,
      loaded,
      estimated,
      allInRpm: Math.round(allIn * 100) / 100,
      loadedRpm: Math.round((rate / loaded) * 100) / 100,
      destMatch,
      score: Math.round(score * 100) / 100
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const matches = scored.filter((s) => s.destMatch).slice(0, limit);
  const others = dest ? scored.filter((s) => !s.destMatch).slice(0, limit) : [];
  return { originPt, matches, others, reasons, considered: rows.length };
}

function offerLine(slot, m) {
  const approx = m.estimated ? '~' : '';
  const equip = m.load.equipment_type ? ` | ${String(m.load.equipment_type).slice(0, 18)}` : '';
  return `${slot}) ${m.load.pickup_location} → ${m.load.delivery_location} | ${money(m.load.rate)} | ${approx}${m.loaded} mi | ${approx}$${m.allInRpm.toFixed(2)}/mi all-in | ${approx}${m.deadhead} mi empty | ${shortDate(m.load.pickup_date)}${equip}`;
}

async function logMessage(carrierId, direction, body, intent) {
  await pool.query(
    'INSERT INTO ai_dispatch_messages (carrier_id, direction, body, intent) VALUES ($1,$2,$3,$4)',
    [carrierId, direction, String(body || '').slice(0, 1600), intent || null]
  );
}

async function outboundToday(carrierId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ai_dispatch_messages
      WHERE carrier_id = $1 AND direction = 'outbound' AND created_at > now() - interval '24 hours'`,
    [carrierId]
  );
  return rows[0].n;
}

async function saveOffers(carrier, list, originLabel) {
  const batch = crypto.randomBytes(6).toString('hex');
  await pool.query(
    `UPDATE ai_dispatch_offers SET status = 'expired', updated_at = now() WHERE carrier_id = $1 AND status = 'offered'`,
    [carrier.id]
  );
  const saved = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const { rows } = await pool.query(
      `INSERT INTO ai_dispatch_offers (carrier_id, load_id, batch, slot, origin_label, deadhead_miles, loaded_miles, miles_estimated, all_in_rpm, score, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + make_interval(hours => $11::int)) RETURNING *`,
      [carrier.id, m.load.id, batch, i + 1, originLabel, m.deadhead, m.loaded, m.estimated, m.allInRpm, m.score, OFFER_TTL_HOURS]
    );
    saved.push(rows[0]);
  }
  return saved;
}

function whyNone(reasons) {
  if (reasons.too_far) return ' Nothing within your empty-mile limit right now.';
  if (reasons.below_min_rpm) return ' Some loads were below your minimum rate per mile.';
  if (reasons.equipment) return ' Loads nearby need different equipment.';
  return '';
}

async function offerLoads(carrier, { origin, destination, equipment, excludeLoadIds = [] }) {
  const result = await findMatches(carrier, { origin, destination, equipment, excludeLoadIds });
  const originLabel = placeLabel(origin) || carrier.last_location || carrier.empty_zip || '';
  const destLabel = destination && !destination.any ? destination.label : '';
  if (!result.originPt) {
    return { reply: 'Shipping Wish: Send the ZIP or city you are empty in, and where you want to go. Example: 75201 to Atlanta.', offers: [] };
  }
  let list = result.matches;
  let header = `Shipping Wish loads near ${originLabel}${destLabel ? ` → ${destLabel}` : ''}:`;
  if (!list.length && result.others.length) {
    list = result.others;
    header = `Nothing to ${destLabel} right now. Closest other loads near ${originLabel}:`;
  }
  if (!list.length) {
    return {
      reply: `Shipping Wish: No posted loads fit near ${originLabel}${destLabel ? ` to ${destLabel}` : ''} yet.${whyNone(result.reasons)} We will check again when you text a new ZIP, or reply ANY for all directions.`,
      offers: []
    };
  }
  const offers = await saveOffers(carrier, list, originLabel);
  const lines = list.map((m, i) => offerLine(i + 1, m));
  const slots = list.map((_, i) => i + 1);
  const choices = slots.length > 1 ? `${slots.slice(0, -1).join(', ')} or ${slots[slots.length - 1]}` : '1';
  const reply = `${header}\n${lines.join('\n')}\nReply ${choices} to request one, or MORE. Rates are the broker's posted rate; ~ means estimated miles.`;
  return { reply, offers, matches: list };
}

function brokerEmailOf(load) {
  const m = String(load.broker_contact || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

function brokerPhoneOf(load) {
  const m = String(load.broker_contact || '').match(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return m ? m[0].trim() : null;
}

async function notify(title, message, type, link) {
  try {
    await require('./notifications').notifyAdmins(title, message, type || 'info', link || '/ai-dispatch');
  } catch { /* notifications are best effort */ }
}

async function requestBooking(carrier, offer) {
  const loadRes = await pool.query('SELECT * FROM loads WHERE id = $1', [offer.load_id]);
  const load = loadRes.rows[0];
  const held = await pool.query(
    `SELECT 1 FROM ai_dispatch_offers WHERE load_id = $1 AND status IN ('requested','booked') AND id <> $2 LIMIT 1`,
    [offer.load_id, offer.id]
  );
  if (!load || load.status !== 'new' || held.rows.length) {
    await pool.query(`UPDATE ai_dispatch_offers SET status = 'expired', note = 'taken before request', updated_at = now() WHERE id = $1`, [offer.id]);
    return { taken: true, load };
  }

  const brokerEmail = brokerEmailOf(load);
  const brokerCheck = await checkBrokerAuthority({ mc: load.broker_mc, contactEmail: brokerEmail, contactPhone: brokerPhoneOf(load) })
    .catch(() => ({ verdict: 'unknown', flags: [{ level: 'caution', code: 'check_failed', text: 'The FMCSA check failed. Check SAFER before booking.' }] }));
  const brokerNote = summarizeAuthority(brokerCheck);
  if (brokerCheck.verdict === 'block') {
    await pool.query(
      `UPDATE ai_dispatch_offers SET status = 'declined', note = $2, broker_authority = $3::jsonb, updated_at = now() WHERE id = $1`,
      [offer.id, `Not requested. ${brokerNote}`.slice(0, 500), JSON.stringify(brokerCheck)]
    );
    await notify(
      `Skipped ${load.load_number}: broker failed FMCSA check`,
      `${load.broker_name || 'Broker'} ${load.broker_mc || ''} — ${brokerNote} ${carrier.company_name} asked for it; no email was sent.`,
      'warning'
    );
    return { taken: false, blocked: true, load, note: brokerNote };
  }

  const authority = [carrier.mc_number ? `MC ${carrier.mc_number}` : null, carrier.dot_number ? `USDOT ${carrier.dot_number}` : null].filter(Boolean).join(' / ');
  let note;
  if (brokerEmail && authority) {
    const lane = `${load.pickup_location} → ${load.delivery_location}`;
    const ops = process.env.DISPATCH_EMAIL || process.env.MAIL_REPLY_TO || require('./email-templates').COMPANY.operationsEmail;
    const text = [
      `Hello ${load.broker_name || 'team'},`,
      '',
      `Shipping Wish dispatches for ${carrier.company_name} (${authority}). They want load ${load.load_number} on LoadsNexus:`,
      `Lane: ${lane}`,
      `Pickup: ${shortDate(load.pickup_date)}`,
      `Posted rate: ${money(load.rate)}`,
      `Equipment: ${carrier.equipment || load.equipment_type || 'as posted'}`,
      `Truck is empty about ${offer.deadhead_miles} miles from pickup${offer.miles_estimated ? ' (estimated)' : ''}.`,
      '',
      `If it is still open, reply to confirm and send the rate confirmation${ops ? ` to ${ops}` : ''}. If it is covered, just reply "covered" and we will stop.`,
      '',
      'Shipping Wish Dispatch'
    ].join('\n');
    try {
      await require('./mailer').sendBrandedEmail({
        to: brokerEmail,
        subject: `Booking request ${load.load_number}: ${lane} [SWD-${offer.id}]`,
        text,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`,
        transactional: true,
        emailType: 'dispatch_booking',
        replyTo: ops || undefined
      });
      note = `Emailed ${brokerEmail}`;
    } catch (err) {
      note = 'Broker email failed; call the broker';
    }
  } else if (!authority) {
    note = 'Add the carrier MC or DOT, then call the broker';
  } else {
    note = `No broker email; call ${brokerPhoneOf(load) || load.broker_name || 'the broker'}`;
  }
  if (brokerCheck.verdict !== 'ok') note = `${note}. ${brokerNote}`;

  await pool.query(
    `UPDATE ai_dispatch_offers SET status = 'requested', requested_at = now(), broker_email = $2, note = $3, broker_authority = $4::jsonb, updated_at = now() WHERE id = $1`,
    [offer.id, brokerEmail, note.slice(0, 500), JSON.stringify(brokerCheck)]
  );
  await pool.query(
    `UPDATE ai_dispatch_offers SET status = 'expired', updated_at = now() WHERE carrier_id = $1 AND status = 'offered' AND id <> $2`,
    [carrier.id, offer.id]
  );
  await notify(
    `Carrier wants ${load.load_number}: ${carrier.company_name}`,
    `${load.pickup_location} → ${load.delivery_location} ${money(load.rate)}. ${note}`,
    brokerCheck.verdict === 'ok' ? 'success' : 'warning'
  );
  return { taken: false, load, note };
}

async function findCarrierByPhone(phone) {
  const tail = phoneTail(phone);
  if (tail.length < 10) return null;
  const { rows } = await pool.query(
    `SELECT * FROM ai_dispatch_carriers WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 ORDER BY id DESC LIMIT 1`,
    [tail]
  );
  return rows[0] || null;
}

async function latestOrigin(carrier) {
  const text = carrier.last_location || carrier.empty_zip;
  return text ? parseOrigin(text) : null;
}

async function shownLoadIds(carrierId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT load_id FROM ai_dispatch_offers WHERE carrier_id = $1 AND created_at > now() - interval '12 hours'`,
    [carrierId]
  );
  return rows.map((r) => r.load_id);
}

// Handles a text from a carrier on the AI dispatch desk. Returns null when the phone isn't a
// desk carrier so the regular SMS flow can answer instead.
async function handleCarrierSms(fromPhone, body) {
  await ensureBoardSchema();
  const carrier = await findCarrierByPhone(fromPhone);
  if (!carrier) return null;
  const parsed = await understand(body, carrier);
  await logMessage(carrier.id, 'inbound', body, parsed.intent);
  await pool.query('UPDATE ai_dispatch_carriers SET last_inbound_at = now() WHERE id = $1', [carrier.id]);

  if (await outboundToday(carrier.id) >= MAX_OUTBOUND_PER_DAY) {
    await notify(`Dispatch desk: ${carrier.company_name} needs a person`, String(body).slice(0, 160), 'warning');
    const reply = 'Shipping Wish: A dispatcher will text you shortly.';
    await logMessage(carrier.id, 'outbound', reply, 'handoff');
    return { carrier, parsed, reply, action: 'handoff' };
  }

  let reply;
  let action = parsed.intent;
  if (parsed.intent === 'book') {
    const { rows } = await pool.query(
      `SELECT * FROM ai_dispatch_offers WHERE carrier_id = $1 AND slot = $2 AND status = 'offered' AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [carrier.id, parsed.choice]
    );
    const offer = rows[0];
    if (!offer) {
      const origin = await latestOrigin(carrier);
      const fresh = origin ? await offerLoads(carrier, { origin, destination: parseDestination(carrier.prefer_destination, carrier) }) : null;
      reply = fresh && fresh.offers.length
        ? `That list expired.\n${fresh.reply}`
        : 'Shipping Wish: That list expired. Text the ZIP you are empty in to get fresh loads.';
      action = 'book_expired';
    } else {
      const result = await requestBooking(carrier, offer);
      if (result.taken) {
        const origin = await latestOrigin(carrier);
        const fresh = origin ? await offerLoads(carrier, { origin, destination: parseDestination(carrier.prefer_destination, carrier), excludeLoadIds: [offer.load_id] }) : null;
        reply = `Load ${result.load ? result.load.load_number : ''} was just taken.` + (fresh && fresh.offers.length ? `\n${fresh.reply}` : ' Text your ZIP for more.');
        action = 'book_taken';
      } else if (result.blocked) {
        const origin = await latestOrigin(carrier);
        const fresh = origin ? await offerLoads(carrier, { origin, destination: parseDestination(carrier.prefer_destination, carrier), excludeLoadIds: [...await shownLoadIds(carrier.id), offer.load_id] }) : null;
        reply = `Shipping Wish: We won't request ${result.load.load_number}. That broker did not pass our FMCSA authority check.` + (fresh && fresh.offers.length ? `\n${fresh.reply}` : ' Text your ZIP for other loads.');
        action = 'book_blocked';
      } else {
        reply = `Shipping Wish: Requesting ${result.load.load_number} (${result.load.pickup_location} → ${result.load.delivery_location}, ${money(result.load.rate)}) from the broker now. Do not roll until we text BOOKED with the rate confirmation.`;
        action = 'book_requested';
      }
    }
  } else if (parsed.intent === 'more') {
    const origin = await latestOrigin(carrier);
    if (!origin) {
      reply = 'Shipping Wish: Text the ZIP you are empty in and where you want to go. Example: 75201 to Atlanta.';
    } else {
      const res = await offerLoads(carrier, {
        origin,
        destination: parseDestination(carrier.prefer_destination, carrier),
        excludeLoadIds: await shownLoadIds(carrier.id)
      });
      reply = res.offers.length ? res.reply : `Shipping Wish: No other loads near ${placeLabel(origin)} right now. Reply ANY for all directions, or text a new ZIP later.`;
    }
  } else if (parsed.intent === 'off') {
    await pool.query(`UPDATE ai_dispatch_carriers SET off_until = now() + interval '20 hours' WHERE id = $1`, [carrier.id]);
    await pool.query(`UPDATE ai_dispatch_offers SET status = 'expired', updated_at = now() WHERE carrier_id = $1 AND status = 'offered'`, [carrier.id]);
    reply = 'Shipping Wish: Got it, no loads today. We will check in on the next workday morning.';
  } else if (parsed.intent === 'loads') {
    const origin = parsed.origin || await latestOrigin(carrier);
    const destination = parsed.destination || parseDestination(carrier.prefer_destination, carrier);
    await pool.query(
      `UPDATE ai_dispatch_carriers
          SET last_location = COALESCE($2, last_location),
              empty_zip = COALESCE($3, empty_zip),
              prefer_destination = COALESCE($4, prefer_destination),
              equipment = COALESCE(equipment, $5),
              off_until = NULL,
              status = CASE WHEN status = 'paused' THEN status ELSE 'active' END
        WHERE id = $1`,
      [carrier.id, parsed.origin ? placeLabel(parsed.origin) : null, parsed.origin && parsed.origin.zip ? parsed.origin.zip : null,
        parsed.destination ? parsed.destination.label : null, parsed.equipment]
    );
    if (!origin) {
      reply = `Shipping Wish: Noted${destination ? ` ${destination.label}` : ''}. What ZIP or city are you empty in?`;
    } else {
      const res = await offerLoads({ ...carrier, equipment: parsed.equipment || carrier.equipment }, { origin, destination, equipment: parsed.equipment });
      reply = res.reply;
    }
  } else {
    reply = 'Shipping Wish dispatch: text the ZIP or city you are empty in and where you want to go (example: 75201 to Atlanta). Reply 1-3 to request a load we sent, MORE for others, or OFF TODAY. A dispatcher reads every message.';
    await notify(`Dispatch desk message: ${carrier.company_name}`, String(body).slice(0, 160), 'info');
  }

  await logMessage(carrier.id, 'outbound', reply, action);
  return { carrier, parsed, reply, action };
}

async function textCarrier(carrier, text, intent) {
  const { sendTwilioSms } = require('../routes/voip');
  let status = 'error';
  try {
    const sent = await sendTwilioSms(carrier.phone, text);
    status = sent.status || 'sent';
    if (status === 'sent' || status === 'logged') {
      const { logSmsMessage, OUR_NUMBER } = require('./sms-inbox');
      await logSmsMessage({ direction: 'outbound', from_number: OUR_NUMBER, to_number: carrier.phone, body: sent.body || text, twilio_sid: sent.sid, disposition: 'ai_dispatch', is_read: true }).catch(() => {});
    }
  } catch { /* status stays error */ }
  await logMessage(carrier.id, 'outbound', text, intent);
  return status;
}

async function sendLoadsNow(carrier) {
  await ensureBoardSchema();
  const origin = await latestOrigin(carrier);
  if (!origin) return { sent: false, reason: 'No empty ZIP or city on file for this carrier.' };
  const res = await offerLoads(carrier, { origin, destination: parseDestination(carrier.prefer_destination, carrier) });
  if (!res.offers.length) return { sent: false, reason: res.reply };
  const sms = await textCarrier(carrier, res.reply, 'staff_sent_loads');
  return { sent: sms === 'sent' || sms === 'logged', sms, offers: res.offers.length, text: res.reply };
}

async function loadOffer(offerId) {
  const { rows } = await pool.query(
    `SELECT o.*, row_to_json(c) AS carrier, row_to_json(l) AS load
       FROM ai_dispatch_offers o
       JOIN ai_dispatch_carriers c ON c.id = o.carrier_id
       LEFT JOIN loads l ON l.id = o.load_id
      WHERE o.id = $1`,
    [offerId]
  );
  return rows[0] || null;
}

async function markBooked(offerId, staffNote, { force = false } = {}) {
  await ensureBoardSchema();
  const offer = await loadOffer(offerId);
  if (!offer) return null;
  if (!offer.load) throw new Error('The load for this offer no longer exists.');
  if (!['requested', 'offered'].includes(offer.status)) throw new Error(`This offer is already ${offer.status}.`);
  if (!force && offer.ratecon && offer.ratecon.status === 'mismatch') {
    const err = new Error(`The rate confirmation does not match: ${(offer.ratecon.issues || []).join(' ')}`);
    err.code = 'RATECON_MISMATCH';
    throw err;
  }
  if (offer.ratecon && offer.ratecon.status === 'mismatch') {
    staffNote = [staffNote, 'booked over a rate confirmation mismatch'].filter(Boolean).join('; ');
  }
  const load = offer.load;
  await pool.query(
    `UPDATE loads SET status = 'booked', updated_at = now(),
            dispatcher_notes = concat_ws(E'\\n', NULLIF(dispatcher_notes, ''), $2::text)
      WHERE id = $1`,
    [load.id, `AI dispatch: booked for ${offer.carrier.company_name}${offer.carrier.mc_number ? ` (MC ${offer.carrier.mc_number})` : ''}${staffNote ? ` — ${staffNote}` : ''}`]
  );
  await pool.query(`UPDATE ai_dispatch_offers SET status = 'booked', updated_at = now() WHERE id = $1`, [offer.id]);
  await pool.query(`UPDATE ai_dispatch_offers SET status = 'expired', updated_at = now() WHERE load_id = $1 AND id <> $2 AND status IN ('offered','requested')`, [load.id, offer.id]);
  const text = `Shipping Wish: BOOKED ${load.load_number}. ${load.pickup_location} → ${load.delivery_location}, pickup ${shortDate(load.pickup_date)}, ${money(load.rate)}. The rate confirmation and pickup details follow. Reply here with any question.`;
  const sms = await textCarrier(offer.carrier, text, 'booked');
  return { offer: { ...offer, status: 'booked' }, sms };
}

// Broker said no, or staff released it: free the carrier and send the next best loads.
async function releaseOffer(offerId, reason) {
  await ensureBoardSchema();
  const offer = await loadOffer(offerId);
  if (!offer) return null;
  if (offer.status === 'booked') throw new Error('This load is already booked.');
  await pool.query(`UPDATE ai_dispatch_offers SET status = 'declined', note = $2, updated_at = now() WHERE id = $1`, [offer.id, String(reason || 'released').slice(0, 200)]);
  const carrier = offer.carrier;
  const origin = await latestOrigin(carrier);
  const loadNumber = offer.load ? offer.load.load_number : 'That load';
  let text = `Shipping Wish: ${loadNumber} is no longer available.`;
  if (origin) {
    const res = await offerLoads(carrier, {
      origin,
      destination: parseDestination(carrier.prefer_destination, carrier),
      excludeLoadIds: [...await shownLoadIds(carrier.id), offer.load_id]
    });
    text += res.offers.length ? `\n${res.reply}` : ' Text your ZIP again for fresh loads.';
  }
  let sms = 'held_for_hours';
  if (carrier.sms_consent && isWithinTcpaHours(carrier.phone).allowed) sms = await textCarrier(carrier, text, 'released');
  else await notify(`Tell ${carrier.company_name}: ${loadNumber} fell through`, 'Outside their texting hours or no text consent on file.', 'warning');
  return { offer: { ...offer, status: 'declined' }, sms };
}

function withoutQuotedEmail(text) {
  return String(text || '').split(/\n\s*(?:on .+ wrote:|from:|-----original)/i)[0].trim();
}

function classifyBrokerReply(text) {
  const t = withoutQuotedEmail(text).toLowerCase();
  if (/\b(covered|no longer available|not available|already (booked|covered|gone)|been (booked|covered)|gone|taken|sorry|pass)\b/.test(t)) return 'declined';
  if (/\b(confirm(ed)?|booked|rate ?con|ratecon|attached|sending (it|the)|it'?s yours|go ahead|approved|yes)\b/.test(t)) return 'confirmed';
  return 'question';
}

async function handleBrokerBookingReply({ fromEmail, subject, bodyText, resendId, attachments }) {
  const m = String(subject || '').match(/\[SWD-(\d+)\]/i);
  if (!m) return null;
  await ensureBoardSchema();
  const offer = await loadOffer(Number(m[1]));
  if (!offer || offer.status !== 'requested') return offer ? { offer: offer.id, action: 'ignored_' + offer.status } : null;
  const sender = String(fromEmail || '').trim().toLowerCase();
  if (!offer.broker_email || sender !== String(offer.broker_email).toLowerCase()) {
    await notify(`Reply about ${offer.load ? offer.load.load_number : `offer ${offer.id}`} from another address`, `${sender} — check it before acting.`, 'warning', '/inbox.html');
    return { offer: offer.id, action: 'sender_mismatch' };
  }
  const kind = classifyBrokerReply(bodyText);
  await pool.query(`UPDATE ai_dispatch_offers SET broker_reply = $2, updated_at = now() WHERE id = $1`, [offer.id, `${kind}: ${withoutQuotedEmail(bodyText).slice(0, 500)}`]);
  const loadNumber = offer.load ? offer.load.load_number : `offer ${offer.id}`;
  if (kind === 'declined') {
    await releaseOffer(offer.id, `Broker replied covered (${fromEmail})`);
    return { offer: offer.id, action: 'declined' };
  }
  if (kind === 'confirmed') {
    const load = offer.load || {};
    const ratecon = await require('./ratecon-reader').checkRateCon({
      resendId,
      attachments,
      bodyText,
      expected: {
        rate: load.rate,
        carrierMc: offer.carrier.mc_number,
        carrierDot: offer.carrier.dot_number,
        pickup: load.pickup_location,
        delivery: load.delivery_location
      }
    }).catch((err) => ({ status: 'unreadable', issues: [`Could not read it: ${err.message}`], checks: [] }));
    await pool.query('UPDATE ai_dispatch_offers SET ratecon = $2::jsonb, updated_at = now() WHERE id = $1', [offer.id, JSON.stringify(ratecon)]);
    const message = ratecon.status === 'match'
      ? `Rate confirmation matches (${ratecon.checks.join(' ')}). Press Booked on the AI dispatch desk.`
      : ratecon.status === 'mismatch'
        ? `Rate confirmation does not match: ${ratecon.issues.join(' ')} Fix it with the broker before booking.`
        : 'No readable rate confirmation came with the reply. Get it before pressing Booked.';
    await notify(`Broker confirmed ${loadNumber} for ${offer.carrier.company_name}`, message, ratecon.status === 'match' ? 'success' : 'warning');
    return { offer: offer.id, action: 'confirmed', ratecon: ratecon.status };
  }
  await notify(`Broker question on ${loadNumber}`, String(bodyText || '').slice(0, 160), 'warning', '/inbox.html');
  return { offer: offer.id, action: 'question' };
}

async function optOutPhone(phone) {
  const tail = phoneTail(phone);
  if (tail.length < 10) return;
  await ensureBoardSchema();
  await pool.query(
    `UPDATE ai_dispatch_carriers SET sms_consent = FALSE, status = 'paused', last_sms_status = 'Replied STOP'
      WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1`,
    [tail]
  );
  await pool.query(
    `UPDATE ai_dispatch_offers SET status = 'expired', updated_at = now()
      WHERE status = 'offered' AND carrier_id IN (SELECT id FROM ai_dispatch_carriers WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1)`,
    [tail]
  );
}

// Staff "try it" box: shows how the AI reads a message and which loads it would pick, without texting anyone.
async function preview(carrier, text) {
  await ensureBoardSchema();
  const parsed = await understand(text, carrier);
  const origin = parsed.origin || await latestOrigin(carrier);
  const destination = parsed.destination || parseDestination(carrier.prefer_destination, carrier);
  let matches = { matches: [], others: [], reasons: {} };
  if (origin && ['loads', 'more', 'unknown'].includes(parsed.intent)) {
    matches = await findMatches({ ...carrier, equipment: parsed.equipment || carrier.equipment }, { origin, destination, equipment: parsed.equipment });
  }
  const shape = async (m) => ({
    load_id: m.load.id,
    load_number: m.load.load_number,
    lane: `${m.load.pickup_location} → ${m.load.delivery_location}`,
    rate: Number(m.load.rate),
    loaded_miles: m.loaded,
    deadhead_miles: m.deadhead,
    estimated: m.estimated,
    all_in_rpm: m.allInRpm,
    loaded_rpm: m.loadedRpm,
    pickup_date: m.load.pickup_date,
    equipment: m.load.equipment_type,
    broker: m.load.broker_name,
    lane_benchmark: await laneBenchmark(m.pickupState, m.deliveryState).catch(() => null),
    sms_line: offerLine(1, m).slice(3)
  });
  return {
    parsed: {
      intent: parsed.intent,
      via: parsed.via,
      origin: origin ? placeLabel(origin) : null,
      destination: destination ? destination.label : null,
      equipment: parsed.equipment || carrier.equipment || null,
      choice: parsed.choice
    },
    matches: await Promise.all(matches.matches.map(shape)),
    others: await Promise.all(matches.others.map(shape)),
    filtered: matches.reasons,
    considered: matches.considered || 0
  };
}

async function listOffers(limit = 50) {
  await ensureBoardSchema();
  const { rows } = await pool.query(
    `SELECT o.id, o.status, o.slot, o.deadhead_miles, o.loaded_miles, o.miles_estimated, o.all_in_rpm, o.note, o.broker_email,
            o.broker_reply, o.requested_at, o.created_at, o.updated_at, o.ratecon, o.broker_authority,
            c.id AS carrier_id, c.company_name, c.phone, c.mc_number,
            l.load_number, l.pickup_location, l.delivery_location, l.rate, l.pickup_date, l.broker_name, l.broker_contact
       FROM ai_dispatch_offers o
       JOIN ai_dispatch_carriers c ON c.id = o.carrier_id
       LEFT JOIN loads l ON l.id = o.load_id
      WHERE o.status IN ('requested', 'booked', 'declined') OR o.created_at > now() - interval '24 hours'
      ORDER BY CASE o.status WHEN 'requested' THEN 0 WHEN 'offered' THEN 1 ELSE 2 END, o.updated_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

async function carrierMessages(carrierId, limit = 40) {
  await ensureBoardSchema();
  const { rows } = await pool.query(
    'SELECT id, direction, body, intent, created_at FROM ai_dispatch_messages WHERE carrier_id = $1 ORDER BY created_at DESC LIMIT $2',
    [carrierId, limit]
  );
  return rows.reverse();
}

module.exports = {
  parseCarrierText,
  parseDestination,
  parseOrigin,
  equipmentKind,
  understand,
  findMatches,
  offerLoads,
  laneBenchmark,
  handleCarrierSms,
  handleBrokerBookingReply,
  classifyBrokerReply,
  withoutQuotedEmail,
  markBooked,
  releaseOffer,
  sendLoadsNow,
  optOutPhone,
  preview,
  listOffers,
  carrierMessages,
  findCarrierByPhone
};
