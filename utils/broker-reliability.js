const pool = require('../db');

const FREE_MAIL = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com',
  'live.com', 'msn.com', 'protonmail.com', 'ymail.com'
]);

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function emailOf(load) {
  const hay = [load && load.broker_email, load && load.broker_contact].filter(Boolean).join(' ');
  const m = String(hay).toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return m ? m[0] : null;
}

function identity(load) {
  const mc = digits(load && load.broker_mc);
  if (mc.length >= 4) return { by: 'mc', mc, email: null, name: null, label: `MC ${mc}` };
  const email = emailOf(load);
  const domain = email && email.split('@')[1];
  if (email && domain && !FREE_MAIL.has(domain)) {
    return { by: 'email', mc: null, email, name: null, label: email };
  }
  const name = String((load && load.broker_name) || '').trim().toLowerCase();
  if (name.length >= 4) return { by: 'name', mc: null, email: null, name, label: String(load.broker_name).trim() };
  return null;
}

function cacheKey(ident) {
  if (!ident) return 'none';
  return `${ident.by}:${ident.mc || ident.email || ident.name}`;
}

function empty(ident) {
  return {
    by: ident ? ident.by : null,
    label: ident ? ident.label : null,
    asked: 0,
    booked: 0,
    declined: 0,
    counters: 0,
    waits_over_free: 0,
    pods: 0,
    paidLoads: 0,
    avgDaysToPay: null,
    source: 'our_records'
  };
}

function whereFor(ident) {
  if (!ident) return { sql: 'FALSE', params: [] };
  if (ident.by === 'mc') {
    return {
      sql: `regexp_replace(coalesce(l.broker_mc, ''), '[^0-9]', '', 'g') = $1`,
      params: [ident.mc]
    };
  }
  if (ident.by === 'email') {
    return {
      sql: `(regexp_replace(coalesce(l.broker_mc, ''), '[^0-9]', '', 'g') = '' OR length(regexp_replace(coalesce(l.broker_mc, ''), '[^0-9]', '', 'g')) < 4)
            AND (lower(coalesce(o.broker_email, '')) = $1
                 OR position($1 in lower(coalesce(l.broker_contact, ''))) > 0)`,
      params: [ident.email]
    };
  }
  return {
    sql: `(regexp_replace(coalesce(l.broker_mc, ''), '[^0-9]', '', 'g') = '' OR length(regexp_replace(coalesce(l.broker_mc, ''), '[^0-9]', '', 'g')) < 4)
          AND lower(trim(coalesce(l.broker_name, ''))) = $1`,
    params: [ident.name]
  };
}

async function offerCounts(ident) {
  const { sql, params } = whereFor(ident);
  const { rows } = await pool.query(
    `SELECT
        COUNT(DISTINCT o.id) FILTER (
          WHERE o.requested_at IS NOT NULL OR o.status IN ('requested', 'booked', 'declined')
        )::int AS asked,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'booked')::int AS booked,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'declined')::int AS declined,
        COUNT(DISTINCT o.id) FILTER (
          WHERE NULLIF(o.negotiation->>'broker_offer', '') IS NOT NULL
        )::int AS counters,
        COUNT(DISTINCT o.id) FILTER (
          WHERE COALESCE((o.detention #>> '{shipper,over_free_minutes}')::int, 0) > 0
             OR COALESCE((o.detention #>> '{receiver,over_free_minutes}')::int, 0) > 0
        )::int AS waits_over_free,
        COUNT(DISTINCT p.id)::int AS pods
       FROM ai_dispatch_offers o
       JOIN loads l ON l.id = o.load_id
       LEFT JOIN ai_dispatch_pods p ON p.offer_id = o.id
      WHERE ${sql}`,
    params
  );
  return rows[0] || {};
}

async function paidCounts(ident) {
  if (!ident || ident.by !== 'mc') return { paidLoads: 0, avgDaysToPay: null };
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS paid_count,
              ROUND(AVG(EXTRACT(EPOCH FROM (i.paid_date::timestamp - COALESCE(l.delivery_date, i.issued_date)::timestamp)) / 86400.0))::int AS avg_days
         FROM invoices i JOIN loads l ON l.id = i.load_id
        WHERE i.status = 'paid' AND i.paid_date IS NOT NULL
          AND regexp_replace(coalesce(l.broker_mc, ''), '[^0-9]', '', 'g') = $1`,
      [ident.mc]
    );
    const row = rows[0];
    return row && row.paid_count
      ? { paidLoads: row.paid_count, avgDaysToPay: row.avg_days }
      : { paidLoads: 0, avgDaysToPay: null };
  } catch {
    return { paidLoads: 0, avgDaysToPay: null };
  }
}

function summarize(history) {
  if (!history) return 'No loads booked with this broker yet. Our records only, not a DAT or Truckstop credit score.';
  const none = !history.asked && !history.booked && !history.paidLoads;
  if (none) {
    return 'No loads booked with this broker yet. Our records only, not a DAT or Truckstop credit score.';
  }
  const bits = [];
  if (history.asked) bits.push(`asked ${history.asked}`);
  if (history.booked) bits.push(`booked ${history.booked}`);
  if (history.declined) bits.push(`${history.declined} fell through`);
  if (history.counters) bits.push(`${history.counters} broker counter${history.counters === 1 ? '' : 's'}`);
  if (history.waits_over_free) bits.push(`${history.waits_over_free} wait${history.waits_over_free === 1 ? '' : 's'} over free time`);
  if (history.pods) bits.push(`${history.pods} POD photo${history.pods === 1 ? '' : 's'}`);
  if (history.paidLoads) {
    const days = history.avgDaysToPay != null ? `, avg ${history.avgDaysToPay} days from delivery` : '';
    bits.push(`${history.paidLoads} paid invoice${history.paidLoads === 1 ? '' : 's'}${days}`);
  }
  const who = history.label ? ` (${history.label})` : '';
  return `With us${who}: ${bits.join(', ')}. Our records only, not a DAT or Truckstop credit score.`;
}

function smsBit(history, lang) {
  if (!history || !history.booked) return '';
  const n = history.booked;
  return lang === 'es' ? ` | ${n} BOOKED con nosotros` : ` | ${n} booked with us`;
}

function scoreBump(history) {
  if (!history) return 0;
  return Math.min(Number(history.booked) || 0, 5) * 3 + Math.min(Number(history.paidLoads) || 0, 5) * 2;
}

async function fetchHistory(ident) {
  const base = empty(ident);
  if (!ident) return { ...base, summary: summarize(base) };
  try {
    const [offers, paid] = await Promise.all([offerCounts(ident), paidCounts(ident)]);
    const history = {
      ...base,
      asked: offers.asked || 0,
      booked: offers.booked || 0,
      declined: offers.declined || 0,
      counters: offers.counters || 0,
      waits_over_free: offers.waits_over_free || 0,
      pods: offers.pods || 0,
      paidLoads: paid.paidLoads || 0,
      avgDaysToPay: paid.avgDaysToPay == null ? null : paid.avgDaysToPay
    };
    return { ...history, summary: summarize(history) };
  } catch {
    return { ...base, summary: summarize(base) };
  }
}

async function historyFor(load, cache) {
  const ident = identity(load);
  const key = cacheKey(ident);
  if (cache && cache.has(key)) return cache.get(key);
  const history = await fetchHistory(ident);
  if (cache) cache.set(key, history);
  return history;
}

async function attachToMatches(matches, cache = new Map()) {
  const list = Array.isArray(matches) ? matches : [];
  for (const m of list) {
    if (!m || !m.load) continue;
    m.history = await historyFor(m.load, cache);
    m.score = Math.round(((Number(m.score) || 0) + scoreBump(m.history)) * 100) / 100;
  }
  return cache;
}

module.exports = {
  identity,
  historyFor,
  attachToMatches,
  summarize,
  smsBit,
  scoreBump,
  empty
};
