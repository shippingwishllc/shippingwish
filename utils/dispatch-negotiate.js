const MIN_FLAT = 500;
const MAX_FLAT = 15000;
const MAX_ASK_RATIO = 1.15;
const MAX_ASK_DOLLARS = 300;

function money(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

function parseMoneyToken(raw) {
  const n = Number(String(raw || '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function looksLikeZip(raw) {
  return /^\d{5}$/.test(String(raw || '').replace(/,/g, ''));
}

// Reads "NEED 2600", "1 need $2,600", "ask 2.80 a mile", "too cheap". Never invents a number.
function parseNegotiateText(text) {
  const body = String(text || '').trim();
  if (!body) return null;
  const lower = body.toLowerCase();
  const choiceMatch = lower.match(/\b(?:load\s*)?#?\s*([1-3])\b/);
  const choice = choiceMatch ? Number(choiceMatch[1]) : null;

  const rpm = body.match(/(?:need|ask|want|looking for|can you (?:get|do)|get me)\s*\$?\s*(\d(?:\.\d{1,2})?)\s*(?:\/\s*mi|per\s*mile|a\s*mile|rpm)\b/i)
    || (/\b(need|ask|too cheap|too low|lowball|rate)\b/i.test(lower)
      ? body.match(/\$?\s*(\d(?:\.\d{1,2})?)\s*(?:\/\s*mi|per\s*mile|a\s*mile|rpm)\b/i)
      : null);
  if (rpm) {
    const n = Number(rpm[1]);
    if (n >= 1 && n <= 12) return { intent: 'negotiate', choice, ask: n, unit: 'rpm' };
  }

  const tagged = body.match(/(?:need|ask|want|looking for|can you (?:get|do)|get me|for)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const dollar = body.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  const raw = tagged ? tagged[1] : (dollar ? dollar[1] : null);
  if (raw && !looksLikeZip(raw)) {
    const n = parseMoneyToken(raw);
    if (n >= MIN_FLAT && n <= MAX_FLAT && (tagged || dollar)) {
      return { intent: 'negotiate', choice, ask: Math.round(n), unit: 'flat' };
    }
  }

  if (/\b(too cheap|too low|low ?ball|rate is low|that'?s low|cheap)\b/i.test(lower)) {
    return { intent: 'negotiate', choice, ask: null, unit: null };
  }
  return null;
}

function askCap(posted) {
  const p = Number(posted) || 0;
  if (!p) return 0;
  return Math.min(Math.round(p * MAX_ASK_RATIO), p + MAX_ASK_DOLLARS);
}

function toFlat(ask, unit, loaded, deadhead) {
  if (ask == null) return null;
  if (unit !== 'rpm') return Math.round(Number(ask));
  const miles = (Number(loaded) || 0) + (Number(deadhead) || 0);
  if (miles < 50) return null;
  return Math.round(Number(ask) * miles);
}

function guardAsk({ posted, ask, unit, loaded, deadhead, estimated, minRpm }) {
  const postedRate = Number(posted) || 0;
  if (!postedRate) {
    return { ok: false, code: 'no_posted', message: 'That load has no posted rate, so a dispatcher has to call the broker.' };
  }
  if (ask == null) {
    return { ok: false, code: 'need_number', message: `Posted is ${money(postedRate)}. What rate do you need? Example: NEED ${Math.round(postedRate + 100)}` };
  }
  const flat = toFlat(ask, unit, loaded, deadhead);
  if (flat == null && unit === 'rpm') {
    return { ok: false, code: 'need_flat', message: 'Tell us the dollar amount you need on this load. Example: NEED 2600' };
  }
  if (flat == null || flat < MIN_FLAT || flat > MAX_FLAT) {
    return { ok: false, code: 'need_number', message: `What rate do you need? Example: NEED ${Math.round(postedRate + 100)}` };
  }
  if (flat <= postedRate) {
    return {
      ok: false,
      code: 'not_higher',
      flat,
      message: `Posted is already ${money(postedRate)}. Reply 1-3 to take it at that rate, or NEED a higher dollar amount.`
    };
  }
  const cap = askCap(postedRate);
  if (flat > cap) {
    return {
      ok: false,
      code: 'over_cap',
      flat,
      cap,
      message: `We can ask the broker up to ${money(cap)} without a dispatcher (${money(postedRate)} posted). A person will look at ${money(flat)}.`
    };
  }
  const miles = (Number(loaded) || 0) + (Number(deadhead) || 0);
  const allIn = miles ? Math.round((flat / miles) * 100) / 100 : null;
  if (minRpm && allIn != null && allIn + 0.001 < Number(minRpm)) {
    return {
      ok: false,
      code: 'below_min',
      flat,
      message: `That is below your minimum $${Number(minRpm).toFixed(2)}/mi all-in.`
    };
  }
  return { ok: true, flat, cap, allIn, estimated: Boolean(estimated) };
}

// Pull a dollar amount the broker actually wrote. Ignores zips, years, and phone fragments.
function parseBrokerRate(text) {
  const raw = String(text || '');
  const found = [];
  for (const m of raw.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)) {
    if (looksLikeZip(m[1])) continue;
    const n = parseMoneyToken(m[1]);
    if (n >= MIN_FLAT && n <= MAX_FLAT) found.push(n);
  }
  if (!found.length) {
    const labeled = raw.match(/(?:can do|best(?:\s+\w+){0,5}\s+is|offer(?:ing)?|pay)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (labeled && !looksLikeZip(labeled[1])) {
      const n = parseMoneyToken(labeled[1]);
      if (n >= MIN_FLAT && n <= MAX_FLAT) found.push(n);
    }
  }
  return found.length ? Math.round(found[found.length - 1]) : null;
}

function expectedRate(offer, load) {
  const n = (offer && offer.negotiation) || {};
  if (n.agreed) return Number(n.agreed);
  if (n.driver_ask) return Number(n.driver_ask);
  return load && load.rate != null ? Number(load.rate) : null;
}

function awaitingDriverCounter(offer) {
  const n = (offer && offer.negotiation) || {};
  return offer && offer.status === 'requested' && n.broker_offer && !n.agreed;
}

module.exports = {
  MIN_FLAT,
  MAX_FLAT,
  MAX_ASK_RATIO,
  MAX_ASK_DOLLARS,
  money,
  parseNegotiateText,
  parseBrokerRate,
  parseMoneyToken,
  askCap,
  guardAsk,
  toFlat,
  expectedRate,
  awaitingDriverCounter
};
