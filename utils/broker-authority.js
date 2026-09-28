const pool = require('../db');
const { digits } = require('./fmcsa');
const reliability = require('./broker-reliability');

const CACHE_HOURS = 24;
const NEW_AUTHORITY_DAYS = 180;
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'protonmail.com', 'ymail.com']);

let schemaReady = null;
function ensureAuthoritySchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS broker_authority_checks (
        key TEXT PRIMARY KEY,
        verdict TEXT NOT NULL,
        result JSONB NOT NULL,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `).catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

function censusDate(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function domainOf(email) {
  const m = String(email || '').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  return m ? m[1] : null;
}

function rootDomain(domain) {
  const parts = String(domain || '').split('.');
  return parts.slice(-2).join('.');
}

function keyFor({ mc, dot }) {
  const m = digits(mc);
  const d = digits(dot);
  if (m.length >= 4) return `mc:${m}`;
  if (d.length >= 4) return `dot:${d}`;
  return null;
}

// Facts from the FMCSA census only. Nothing here is a credit score; a clean result means the
// authority looks right, not that the broker will pay.
function assess(row, { contactEmail, contactPhone } = {}) {
  const flags = [];
  if (!row) {
    return { found: false, verdict: 'block', flags: [{ level: 'block', code: 'not_found', text: 'No FMCSA record for this MC or USDOT.' }] };
  }
  const carship = String(row.carship || '').toUpperCase();
  const isBroker = carship.includes('B');
  const usdotActive = String(row.status_code || '').toUpperCase() === 'A';
  const docketStatus = String(row.docket1_status_code || '').toUpperCase();
  const added = censusDate(row.add_date);
  const ageDays = added ? Math.floor((Date.now() - added.getTime()) / 86400000) : null;

  if (!usdotActive) flags.push({ level: 'block', code: 'usdot_inactive', text: 'USDOT status is not active.' });
  if (docketStatus && docketStatus !== 'A') flags.push({ level: 'block', code: 'docket_inactive', text: `MC docket status is ${docketStatus}, not active.` });
  if (!isBroker) flags.push({ level: 'block', code: 'not_broker', text: 'FMCSA does not list broker authority on this record. A carrier re-posting loads is a double-brokering risk.' });
  if (ageDays != null && ageDays < NEW_AUTHORITY_DAYS) flags.push({ level: 'caution', code: 'new_authority', text: `Registered ${ageDays} days ago. New authorities carry more fraud risk.` });

  const fmcsaDomain = domainOf(row.email_address);
  const contactDomain = domainOf(contactEmail);
  if (contactDomain) {
    if (FREE_MAIL.has(contactDomain)) {
      flags.push({ level: 'caution', code: 'free_email', text: `The load contact uses ${contactDomain}, not a company domain.` });
    } else if (fmcsaDomain && !FREE_MAIL.has(fmcsaDomain) && rootDomain(fmcsaDomain) !== rootDomain(contactDomain)) {
      flags.push({ level: 'caution', code: 'email_domain_mismatch', text: `The load contact email (${contactDomain}) does not match the FMCSA email domain (${fmcsaDomain}).` });
    }
  }
  const fmcsaPhone = digits(row.phone).slice(-10);
  const loadPhone = digits(contactPhone).slice(-10);
  if (fmcsaPhone.length === 10 && loadPhone.length === 10 && fmcsaPhone !== loadPhone) {
    flags.push({ level: 'info', code: 'phone_differs', text: 'The load phone differs from the FMCSA phone. Call the FMCSA number to confirm if unsure.' });
  }

  const verdict = flags.some((f) => f.level === 'block') ? 'block' : flags.some((f) => f.level === 'caution') ? 'caution' : 'ok';
  return {
    found: true,
    verdict,
    flags,
    legalName: row.legal_name || row.dba_name || null,
    dotNumber: row.dot_number ? String(row.dot_number) : null,
    mcNumber: row.docket1 ? `${String(row.docket1prefix || 'MC').toUpperCase()}-${digits(row.docket1)}` : null,
    isBroker,
    usdotActive,
    docketStatus: docketStatus || null,
    registeredOn: added ? added.toISOString().slice(0, 10) : null,
    authorityAgeDays: ageDays,
    fmcsaPhone: fmcsaPhone || null,
    fmcsaEmailDomain: fmcsaDomain,
    city: row.phy_city || null,
    state: row.phy_state || null
  };
}

// Returns a verdict for a broker before we ask them for a load: 'ok', 'caution', 'block', or
// 'unknown' when FMCSA couldn't be reached. Census results are cached for a day; contact-based
// flags are recomputed on each call because they depend on the load.
async function checkBrokerAuthority({ mc, dot, contactEmail, contactPhone, force = false } = {}) {
  const key = keyFor({ mc, dot });
  if (!key) {
    return { verdict: 'caution', found: false, flags: [{ level: 'caution', code: 'no_mc', text: 'The load has no broker MC or USDOT, so FMCSA authority could not be checked.' }] };
  }
  await ensureAuthoritySchema();
  let row = null;
  let fromCache = false;
  if (!force) {
    const cached = await pool.query(
      `SELECT result FROM broker_authority_checks WHERE key = $1 AND checked_at > now() - make_interval(hours => $2::int)`,
      [key, CACHE_HOURS]
    );
    if (cached.rows[0]) {
      row = cached.rows[0].result.census || null;
      fromCache = true;
    }
  }
  if (!fromCache) {
    try {
      const [type, value] = key.split(':');
      row = await require('./fmcsa').lookupCensusRow(type === 'mc' ? `MC ${value}` : `USDOT ${value}`);
    } catch (err) {
      return { verdict: 'unknown', found: false, flags: [{ level: 'caution', code: 'fmcsa_unreachable', text: 'FMCSA could not be reached. Check SAFER before booking.' }] };
    }
    const base = assess(row);
    await pool.query(
      `INSERT INTO broker_authority_checks (key, verdict, result) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (key) DO UPDATE SET verdict = EXCLUDED.verdict, result = EXCLUDED.result, checked_at = now()`,
      [key, base.verdict, JSON.stringify({ census: row || null })]
    );
  }
  const result = assess(row, { contactEmail, contactPhone });
  result.history = await reliability.historyFor({
    broker_mc: key.startsWith('mc:') ? key.slice(3) : digits(result.mcNumber)
  });
  result.saferUrl = result.dotNumber
    ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(result.dotNumber)}`
    : 'https://safer.fmcsa.dot.gov/';
  result.cached = fromCache;
  return result;
}

// Only uses what's already cached, so load matching stays fast and never waits on FMCSA.
async function cachedBlockedKeys() {
  await ensureAuthoritySchema();
  const { rows } = await pool.query(
    `SELECT key FROM broker_authority_checks WHERE verdict = 'block' AND checked_at > now() - make_interval(hours => $1::int)`,
    [CACHE_HOURS * 7]
  );
  return new Set(rows.map((r) => r.key));
}

function summarize(result) {
  if (!result) return '';
  const lead = { ok: 'FMCSA authority looks right', caution: 'FMCSA check needs a look', block: 'Failed FMCSA check', unknown: 'FMCSA not reachable' }[result.verdict] || result.verdict;
  const notes = (result.flags || []).filter((f) => f.level !== 'info').map((f) => f.text);
  return notes.length ? `${lead}: ${notes.join(' ')}` : lead + '.';
}

module.exports = { checkBrokerAuthority, cachedBlockedKeys, assess, keyFor, summarize, ensureAuthoritySchema };
