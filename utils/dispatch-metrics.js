const pool = require('../db');
const { ensureBoardSchema } = require('./loadboard-sync');

const SMS_CAP = 12;
const NOTE = 'Counts from this AI dispatch desk only. Not a DAT or Truckstop report, and not a company-wide load count. Detention is minutes; no dollar amount is billed unless a dispatcher sets a rate.';

function n(row, key) {
  return Number(row && row[key]) || 0;
}

async function deskMetrics() {
  await ensureBoardSchema();
  const [carriers, offers7, open, messages, cap, detention, pods, negotiate] = await Promise.all([
    pool.query(
      `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
          COUNT(*) FILTER (WHERE sms_consent = TRUE)::int AS with_consent,
          COUNT(*) FILTER (WHERE sms_lang = 'es')::int AS spanish
         FROM ai_dispatch_carriers`
    ),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'offered')::int AS offered,
          COUNT(*) FILTER (WHERE status = 'requested')::int AS requested,
          COUNT(*) FILTER (WHERE status = 'booked')::int AS booked,
          COUNT(*) FILTER (WHERE status = 'declined')::int AS declined
         FROM ai_dispatch_offers
        WHERE created_at > now() - interval '7 days'`
    ),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'offered' AND expires_at > now())::int AS offered_live,
          COUNT(*) FILTER (WHERE status = 'requested')::int AS requested,
          COUNT(*) FILTER (
            WHERE status = 'booked' AND COALESCE(transit->>'status', 'booked') <> 'delivered'
          )::int AS booked_in_transit
         FROM ai_dispatch_offers`
    ),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at > now() - interval '24 hours')::int AS in_24h,
          COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at > now() - interval '24 hours')::int AS out_24h,
          COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at > now() - interval '7 days')::int AS in_7d,
          COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at > now() - interval '7 days')::int AS out_7d,
          COUNT(*) FILTER (WHERE direction = 'outbound' AND intent = 'check_call' AND created_at > now() - interval '7 days')::int AS check_calls_7d,
          COUNT(*) FILTER (WHERE direction = 'outbound' AND intent = 'morning' AND created_at > now() - interval '7 days')::int AS morning_7d,
          COUNT(DISTINCT carrier_id) FILTER (WHERE direction = 'inbound' AND created_at > now() - interval '24 hours')::int AS drivers_texted_24h
         FROM ai_dispatch_messages`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM (
          SELECT carrier_id FROM ai_dispatch_messages
           WHERE direction = 'outbound' AND created_at > now() - interval '24 hours'
           GROUP BY carrier_id HAVING COUNT(*) >= $1
        ) s`,
      [SMS_CAP]
    ),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE over_free > 0)::int AS loads_over_free,
          COALESCE(SUM(over_free), 0)::int AS minutes_over_free
         FROM (
           SELECT GREATEST(COALESCE((detention #>> '{shipper,over_free_minutes}')::int, 0), 0)
                + GREATEST(COALESCE((detention #>> '{receiver,over_free_minutes}')::int, 0), 0) AS over_free
             FROM ai_dispatch_offers
            WHERE status = 'booked'
         ) s`
    ),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last_7d,
          COUNT(*)::int AS all_time
         FROM ai_dispatch_pods`
    ),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE NULLIF(negotiation->>'driver_ask', '') IS NOT NULL)::int AS asked,
          COUNT(*) FILTER (WHERE NULLIF(negotiation->>'broker_offer', '') IS NOT NULL)::int AS countered,
          COUNT(*) FILTER (WHERE NULLIF(negotiation->>'agreed', '') IS NOT NULL)::int AS accepted
         FROM ai_dispatch_offers
        WHERE updated_at > now() - interval '7 days'`
    )
  ]);

  const c = carriers.rows[0] || {};
  const o7 = offers7.rows[0] || {};
  const op = open.rows[0] || {};
  const m = messages.rows[0] || {};
  const d = detention.rows[0] || {};
  const p = pods.rows[0] || {};
  const g = negotiate.rows[0] || {};

  return {
    as_of: new Date().toISOString(),
    note: NOTE,
    sms_cap: SMS_CAP,
    carriers: {
      total: n(c, 'total'),
      active: n(c, 'active'),
      paused: n(c, 'paused'),
      with_consent: n(c, 'with_consent'),
      spanish: n(c, 'spanish'),
      at_sms_cap_24h: n(cap.rows[0], 'n')
    },
    offers: {
      last_7d: {
        offered: n(o7, 'offered'),
        requested: n(o7, 'requested'),
        booked: n(o7, 'booked'),
        declined: n(o7, 'declined')
      },
      open: {
        offered_live: n(op, 'offered_live'),
        requested: n(op, 'requested'),
        booked_in_transit: n(op, 'booked_in_transit')
      }
    },
    messages: {
      last_24h: {
        inbound: n(m, 'in_24h'),
        outbound: n(m, 'out_24h'),
        drivers_texted: n(m, 'drivers_texted_24h')
      },
      last_7d: {
        inbound: n(m, 'in_7d'),
        outbound: n(m, 'out_7d'),
        check_calls: n(m, 'check_calls_7d'),
        morning: n(m, 'morning_7d')
      }
    },
    detention: {
      loads_over_free: n(d, 'loads_over_free'),
      minutes_over_free: n(d, 'minutes_over_free'),
      billed_amount: null
    },
    pods: {
      last_7d: n(p, 'last_7d'),
      all: n(p, 'all_time')
    },
    negotiate: {
      last_7d: {
        asked: n(g, 'asked'),
        countered: n(g, 'countered'),
        accepted: n(g, 'accepted')
      }
    }
  };
}

module.exports = { deskMetrics, SMS_CAP, NOTE };
