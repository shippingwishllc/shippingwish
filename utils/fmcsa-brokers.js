/**
 * FMCSA Company Census brokers (az4n-8mr2).
 * Brokers are classdef containing BROKER and/or carship token B.
 * Census Desk stays on for-hire carriers (carship C). This filter is separate.
 */
const { soqlEscape, US_STATES } = require('./fmcsa-equipment');
const { sanitizeEmail } = require('./email-valid');

const BROKER_CLASS_SQL = "upper(coalesce(classdef,'')) like '%BROKER%'";
const BROKER_CARSHIP_SQL = "(upper(coalesce(carship,'')) like '%B%' OR upper(coalesce(carship,'')) like 'B;%' OR upper(coalesce(carship,'')) = 'B')";

function isBrokerRow(row) {
  const cls = String(row && row.classdef || '').toUpperCase();
  const ship = String(row && row.carship || '').toUpperCase();
  if (cls.includes('BROKER')) return true;
  const tokens = ship.split(/[;,/\s]+/).map((t) => t.trim()).filter(Boolean);
  return tokens.includes('B');
}

function isAlsoCarrier(row) {
  const ship = String(row && row.carship || '').toUpperCase();
  const tokens = ship.split(/[;,/\s]+/).map((t) => t.trim()).filter(Boolean);
  return tokens.includes('C');
}

function formatPhone(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.length === 11 && d.startsWith('1')) return `+1${d.slice(1)}`;
  if (d.length === 10) return `+1${d}`;
  return d ? String(raw).trim() : '';
}

function buildBrokerCensusWhere(filters = {}) {
  const parts = [];
  if (filters.activeOnly !== false) parts.push("status_code = 'A'");
  parts.push(`(${BROKER_CLASS_SQL} OR ${BROKER_CARSHIP_SQL})`);
  if (filters.excludePassengers !== false) {
    parts.push("upper(coalesce(classdef,'')) not like '%PASSENGER%'");
  }
  if (filters.brokerOnly) {
    parts.push("upper(coalesce(carship,'')) not like '%C%'");
  }
  const state = String(filters.state || '').trim().toUpperCase();
  if (state && US_STATES.includes(state)) {
    parts.push(`phy_state = '${soqlEscape(state)}'`);
  }
  if (filters.hasEmail) parts.push('email_address IS NOT NULL');
  if (filters.hasPhone) parts.push('phone IS NOT NULL');
  return parts.join(' AND ');
}

function censusToBroker(row) {
  if (!row || !isBrokerRow(row)) return null;
  const company = String(row.legal_name || row.dba_name || '').trim();
  if (!company) return null;
  const alsoCarrier = isAlsoCarrier(row);
  return {
    company_name: company,
    dba_name: row.dba_name || '',
    owner_name: row.company_officer_1 || '',
    mc_number: row.docket1 || '',
    docket_prefix: row.docket1prefix || '',
    dot_number: String(row.dot_number || '').trim(),
    phone: formatPhone(row.phone),
    email: sanitizeEmail(row.email_address || ''),
    phy_city: row.phy_city || '',
    phy_state: row.phy_state || '',
    phy_zip: row.phy_zip || '',
    classdef: row.classdef || '',
    carship: row.carship || '',
    usdot_status: row.status_code === 'A' ? 'ACTIVE' : (row.status_code || ''),
    also_carrier: alsoCarrier,
    source: 'FMCSA Census broker'
  };
}

function pickUnseenBrokers(rows, exclude, limit) {
  const cap = Number(limit) > 0 ? Number(limit) : 10;
  const out = [];
  const seen = exclude instanceof Set ? exclude : new Set();
  for (const row of rows || []) {
    if (!isBrokerRow(row)) continue;
    const broker = censusToBroker(row);
    if (!broker || !broker.dot_number) continue;
    if (seen.has(broker.dot_number)) continue;
    seen.add(broker.dot_number);
    out.push(broker);
    if (out.length >= cap) break;
  }
  return out;
}

module.exports = {
  BROKER_CLASS_SQL,
  BROKER_CARSHIP_SQL,
  isBrokerRow,
  isAlsoCarrier,
  buildBrokerCensusWhere,
  censusToBroker,
  pickUnseenBrokers,
  formatPhone
};
