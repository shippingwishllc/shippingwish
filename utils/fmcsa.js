const FMCSA_HOST = 'mobile.fmcsa.dot.gov';
const SAFER_HOST = 'safer.fmcsa.dot.gov';
const { sanitizeEmail } = require('./email-valid');

async function httpsRequest(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/json, text/html;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const body = await resp.text();
    return { status: resp.status, body, contentType: String(resp.headers.get('content-type') || '') };
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('FMCSA timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function textVal(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (Array.isArray(v)) return textVal(v[0]);
  if (typeof v === 'object') return textVal(v.value || v.content || v.text || v.legalName || v.dbaName);
  return '';
}

function parseQcXml(xml) {
  const grab = (tag) => {
    const m = String(xml).match(new RegExp(`<${tag}[^>]*>([^<]+)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const legalName = grab('legalName');
  const dbaName = grab('dbaName');
  const dotNumber = grab('dotNumber');
  const docketNumber = grab('docketNumber');
  if (!legalName && !dotNumber) return {};
  return {
    content: {
      carrier: {
        legalName,
        dbaName,
        dotNumber,
        docketNumber,
        telephone: grab('telephone') || grab('phone'),
        phyStreet: grab('phyStreet'),
        phyCity: grab('phyCity'),
        phyState: grab('phyState'),
        phyZipcode: grab('phyZipcode') || grab('phyZip'),
        totalPowerUnits: grab('totalPowerUnits'),
        totalDrivers: grab('totalDrivers')
      }
    }
  };
}

function parseQcBody(body) {
  const t = String(body || '').trim();
  if (!t) return {};
  if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
  if (t.startsWith('<')) return parseQcXml(t);
  throw new Error('FMCSA returned non-JSON');
}

async function httpsJson(url, timeoutMs = 18000) {
  const { status, body } = await httpsRequest(url, timeoutMs);
  if (status >= 400) {
    const err = new Error(`FMCSA HTTP ${status}`);
    err.status = status;
    throw err;
  }
  return parseQcBody(body);
}

function apiKey() {
  return String(process.env.FMCSA_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
}

function qcUrl(path) {
  // FMCSA WebKeys often contain "+". encodeURIComponent turns that into %2B
  // and QCMobile then returns auth-failure / empty content.
  const key = encodeURIComponent(apiKey()).replace(/%2B/g, '+');
  const clean = String(path).replace(/^\/+/, '');
  return `https://${FMCSA_HOST}/qc/services/${clean}${clean.includes('?') ? '&' : '?'}webKey=${key}`;
}

function looksLikeAuthFailure(data, body) {
  const blob = `${typeof data === 'string' ? data : JSON.stringify(data || {})}\n${body || ''}`;
  return /authentication failure|invalid web.?key|not authenticated|unauthorized/i.test(blob);
}

async function probeQc(path) {
  const { status, body } = await httpsRequest(qcUrl(path));
  let data = {};
  let parseErr = '';
  if (status < 400) {
    try {
      data = parseQcBody(body);
    } catch (err) {
      parseErr = err.message;
    }
  }
  const authFail = status === 401 || (status !== 403 && looksLikeAuthFailure(data, body));
  const nodes = (!authFail && status < 400 && !parseErr) ? extractNodes(data) : [];
  const hint = typeof data.content === 'string'
    ? String(data.content).slice(0, 80)
    : (parseErr || (nodes.length ? 'hit' : (Object.keys(data).join(',') || `http ${status}`)));
  return { path, status, nodes, authFail, hint };
}

function digits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function classifyQuery(q) {
  const raw = String(q || '').trim();
  const num = digits(raw);
  if (/^(MC[-\s]?)?\d{4,8}$/i.test(raw) && num.length >= 4 && num.length <= 8) {
    return { type: 'mc', value: num };
  }
  if (/^(USDOT|DOT)[-\s]?\d{5,8}$/i.test(raw) || (num.length >= 6 && num.length <= 8 && !/[a-z]/i.test(raw))) {
    return { type: 'dot', value: num };
  }
  if (/^[A-Z]{2}$/i.test(raw)) {
    return { type: 'state', value: raw.toUpperCase() };
  }
  return { type: 'name', value: raw };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unwrapCarrier(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return unwrapCarrier(node[0]);
  if (node.carrier) return unwrapCarrier(node.carrier);
  if (node.content && typeof node.content !== 'string') return unwrapCarrier(node.content);
  if (textVal(node.legalName) || textVal(node.dbaName) || textVal(node.dotNumber) || textVal(node.docketNumber)) return node;
  return null;
}

function extractNodes(data) {
  if (!data) return [];
  if (typeof data.content === 'string') return [];
  if (Array.isArray(data)) return data.map(unwrapCarrier).filter(Boolean);
  if (data.content && data.content.carrier) return asArray(data.content.carrier).map(unwrapCarrier).filter(Boolean);
  if (data.content) return asArray(data.content).map(unwrapCarrier).filter(Boolean);
  const one = unwrapCarrier(data);
  return one ? [one] : [];
}

function pickCarrier(node) {
  return unwrapCarrier(node) || (node && typeof node === 'object' && !Array.isArray(node) ? node : {});
}

function operationLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.carrierOperationDesc || value.description || '';
  return '';
}

function normalizeCarrier(raw, extras = {}) {
  const c = pickCarrier(raw) || {};
  const census = extras.census || {};
  const basics = extras.basics || {};
  const authority = extras.authority || {};
  const src = { ...c, ...census };

  const phyCity = src.phyCity || src.phy_city || extras.phy_city || '';
  const phyState = src.phyState || src.phy_state || extras.state || extras.phy_state || '';
  const phyZip = src.phyZipcode || src.phyZip || src.phy_zipcode || extras.phy_zip || '';
  const street = src.phyStreet || src.phy_street || extras.phy_street || '';
  const trucks = src.totalPowerUnits || src.totalTrucks || src.nbrPowerUnit || extras.num_trucks || null;
  const drivers = src.totalDrivers || src.totalDriver || extras.num_drivers || null;
  const docket = src.docketNumber || src.docket || extras.mc || '';
  const mc = docket
    ? (String(docket).toUpperCase().startsWith('MC') ? String(docket).toUpperCase().replace(/\s+/g, '') : `MC-${digits(docket)}`)
    : (extras.mc ? `MC-${digits(extras.mc)}` : '');

  const cargo = extras.equipment_type || src.cargoCarried || '';
  const op = operationLabel(src.carrierOperation);

  return {
    company_name: textVal(src.legalName) || textVal(src.dbaName) || textVal(src.legal_name) || extras.company_name || '',
    dba_name: textVal(src.dbaName) || textVal(src.dba_name) || extras.dba_name || '',
    owner_name: textVal(src.officer1) || textVal(src.officerName) || extras.owner_name || textVal(src.dbaName) || '',
    officer_name: textVal(src.officer1) || textVal(src.officerName) || extras.officer_name || '',
    mc_number: mc,
    dot_number: textVal(src.dotNumber) || textVal(src.dot_number) || String(extras.dot || extras.dot_number || ''),
    phone: textVal(src.telephone) || textVal(src.phone) || extras.phone || '',
    email: sanitizeEmail(String(src.emailAddress || src.email || extras.email || '')),
    phy_address: [street, phyCity, phyState, phyZip].filter(Boolean).join(', '),
    address: [phyCity, phyState, phyZip].filter(Boolean).join(', '),
    phy_city: phyCity,
    phy_state: phyState,
    phy_zip: String(phyZip || ''),
    equipment_type: cargo || extras.equipment_type || op || '53ft Dry Van',
    num_trucks: trucks ? parseInt(trucks, 10) || 1 : 1,
    num_drivers: drivers ? parseInt(drivers, 10) || null : null,
    safety_rating: basics.safetyRating || basics.rating || extras.safety_rating || '',
    authority_status: extras.authority_status || authority.commonAuthorityStatus || authority.brokerAuthorityStatus || extras.usdot_status || '',
    usdot_status: extras.usdot_status || src.allowToOperate || src.statusCode || '',
    insurance_onfile: !!(authority.bipdInsuranceOnFile || authority.cargoInsuranceOnFile),
    state: phyState,
    already_in_crm: false,
    source: extras.source || 'FMCSA QC API'
  };
}

async function fetchQcNodes(path, attempts) {
  const probe = await probeQc(path);
  if (attempts) {
    attempts.push({ path: probe.path, status: probe.status, result: probe.authFail ? 'auth' : (probe.nodes.length ? 'hit' : probe.hint) });
  }
  if (probe.authFail && probe.status === 401) {
    const err = new Error('FMCSA WebKey rejected. In Vercel use My WebKeys → WebKey, not Client Secret.');
    err.status = 401;
    throw err;
  }
  return probe.nodes;
}

async function fetchCarrierByDot(dot, attempts) {
  const d = digits(dot);
  if (!d) return [];
  let nodes = await fetchQcNodes(`carriers/${d}`, attempts);
  if (!nodes.length) nodes = await fetchQcNodes(`carriers/${d}/`, attempts);
  return nodes;
}

async function fetchCarrierByMc(mc, attempts) {
  const m = digits(mc);
  if (!m) return [];
  const paths = [
    `carriers/search/docket-number/${m}`,
    `carriers/docket-number/${m}`,
    `carriers/docket-number/${m}/`,
    `carriers/docket-number/MC${m}`,
    `carriers/docket-number/MC-${m}`
  ];
  for (const path of paths) {
    const nodes = await fetchQcNodes(path, attempts);
    if (nodes.length) return nodes;
  }
  return [];
}

async function fetchCarrierByName(name, attempts) {
  return fetchQcNodes(`carriers/name/${encodeURIComponent(name)}`, attempts);
}

async function fetchBasics(dot) {
  try {
    return await httpsJson(qcUrl(`carriers/${digits(dot)}/basics`));
  } catch {
    return {};
  }
}

async function fetchAuthority(dot) {
  try {
    return await httpsJson(qcUrl(`carriers/${digits(dot)}/authority`));
  } catch {
    return {};
  }
}

async function fetchCargo(dot) {
  try {
    const data = await httpsJson(qcUrl(`carriers/${digits(dot)}/cargo-carried`));
    const rows = extractNodes(data).length ? extractNodes(data) : asArray(data.content || data.cargoCarried);
    const labels = rows.map((r) => r && (r.cargoClassDesc || r.description || r.cargoCarried)).filter(Boolean);
    return labels.slice(0, 4).join(', ');
  } catch {
    return '';
  }
}

async function enrichOne(node, extras = {}) {
  const base = normalizeCarrier(node, extras);
  const dot = base.dot_number;
  if (!dot || !apiKey()) return base;
  try {
    const [basics, authority, cargo] = await Promise.all([
      fetchBasics(dot),
      fetchAuthority(dot),
      fetchCargo(dot)
    ]);
    return normalizeCarrier(node, {
      ...extras,
      basics: pickCarrier(basics) || basics,
      authority: pickCarrier(authority) || authority,
      equipment_type: cargo || extras.equipment_type
    });
  } catch {
    return base;
  }
}

function saferField(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const td = html.match(new RegExp(escaped + '[\\s\\S]{0,120}?<TD[^>]*>\\s*([^<]+)', 'i'));
  if (td && td[1].trim()) return td[1].replace(/\s+/g, ' ').trim();
  const row = html.match(new RegExp(escaped + '\\s*\\|\\s*([^|<\\n]+)', 'i'));
  return row ? row[1].replace(/\s+/g, ' ').trim() : '';
}

function parseSaferHtml(html, extras = {}) {
  if (!html || /record not found|no records matching/i.test(html)) return null;
  const company = saferField(html, 'Legal Name:');
  const dba = saferField(html, 'DBA Name:');
  const dot = digits(saferField(html, 'USDOT Number:'));
  const mcRaw = saferField(html, 'MC/MX/FF Number(s):') || saferField(html, 'MC/MX Number');
  const phone = saferField(html, 'Phone:');
  const address = saferField(html, 'Physical Address:');
  const units = digits(saferField(html, 'Power Units:'));
  const drivers = digits(saferField(html, 'Drivers:'));
  const status = saferField(html, 'USDOT Status:');
  const authority = saferField(html, 'Operating Authority Status:');
  if (!company && !dot) return null;

  let phy_city = '';
  let phy_state = '';
  let phy_zip = '';
  let phy_street = address;
  const loc = address.match(/^(.*?)([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (loc) {
    phy_street = loc[1].trim();
    phy_city = loc[2].trim();
    phy_state = loc[3];
    phy_zip = loc[4];
  }

  return normalizeCarrier({}, {
    source: 'FMCSA SAFER',
    company_name: company,
    dba_name: dba && dba !== '--' ? dba : '',
    mc: digits(mcRaw) || extras.mc,
    dot,
    phone,
    phy_street,
    phy_city,
    phy_state,
    phy_zip,
    num_trucks: units || 1,
    num_drivers: drivers || null,
    usdot_status: status,
    authority_status: authority
  });
}

async function fetchSafer(kind, value) {
  const param = kind === 'dot' ? 'USDOT' : kind === 'name' ? 'NAME' : 'MC_MX';
  const url = `https://${SAFER_HOST}/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=${param}&query_string=${encodeURIComponent(value)}`;
  const { status, body } = await httpsRequest(url, 15000);
  if (status >= 400 || !body) return null;
  return parseSaferHtml(body, kind === 'mc' ? { mc: value } : { dot: value });
}

function formatPhone(value) {
  const d = digits(value);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(value || '').trim();
}

function cargoFromCensus(row) {
  const map = {
    crgo_genfreight: 'General Freight',
    crgo_produce: 'Produce',
    crgo_coldfood: 'Refrigerated Food',
    crgo_beverages: 'Beverages',
    crgo_meat: 'Meat',
    crgo_logs: 'Logs',
    crgo_building: 'Building Materials',
    crgo_drybulk: 'Dry Bulk'
  };
  return Object.entries(map)
    .filter(([key]) => row[key] === 'X' || row[key] === 'Y')
    .map(([, label]) => label)
    .slice(0, 4)
    .join(', ');
}

function soqlLike(name) {
  return String(name || '')
    .replace(/'/g, "''")
    .replace(/[^\w .&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 60);
}

function censusToCarrier(row) {
  if (!row) return null;
  return normalizeCarrier({}, {
    source: 'FMCSA Census',
    company_name: row.legal_name || row.dba_name || '',
    dba_name: row.dba_name || '',
    owner_name: row.company_officer_1 || '',
    officer_name: row.company_officer_1 || '',
    mc: row.docket1 || '',
    dot: row.dot_number || '',
    phone: formatPhone(row.phone),
    email: sanitizeEmail(row.email_address || ''),
    phy_street: row.phy_street || '',
    phy_city: row.phy_city || '',
    phy_state: row.phy_state || '',
    phy_zip: row.phy_zip || '',
    num_trucks: row.power_units || row.truck_units || 1,
    num_drivers: row.total_drivers || null,
    usdot_status: row.status_code === 'A' ? 'ACTIVE' : (row.status_code || ''),
    authority_status: row.classdef || row.docket1_status_code || '',
    equipment_type: cargoFromCensus(row) || '53ft Dry Van'
  });
}

async function censusQuery(params) {
  const u = new URL('https://data.transportation.gov/resource/az4n-8mr2.json');
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') u.searchParams.set(key, String(value));
  });
  const { status, body } = await httpsRequest(u.toString(), 12000);
  if (status >= 400) {
    const err = new Error(`Census HTTP ${status}`);
    err.status = status;
    throw err;
  }
  const data = JSON.parse(body || '[]');
  return Array.isArray(data) ? data : [];
}

async function searchCensusRows(classified) {
  let rows = [];
  let label = 'census';
  if (classified.type === 'mc') {
    label = `census/mc/${classified.value}`;
    rows = await censusQuery({ docket1: classified.value, docket1prefix: 'MC', $limit: '10' });
    if (!rows.length) rows = await censusQuery({ docket1: classified.value, $limit: '10' });
  } else if (classified.type === 'dot') {
    label = `census/dot/${classified.value}`;
    rows = await censusQuery({ dot_number: classified.value, $limit: '10' });
  } else if (classified.type === 'state') {
    label = `census/state/${classified.value}`;
    rows = await censusQuery({
      phy_state: classified.value,
      status_code: 'A',
      $order: 'power_units DESC',
      $limit: '25'
    });
  } else {
    const q = soqlLike(classified.value);
    if (q.length < 3) return { rows: [], label: 'census/name-too-short' };
    label = `census/name/${q}`;
    rows = await censusQuery({
      $where: `upper(legal_name) like '%${q}%'`,
      $limit: '20'
    });
  }
  return { rows, label };
}

async function searchCensus(classified, attempts) {
  const { rows, label } = await searchCensusRows(classified);
  if (attempts) attempts.push({ path: label, status: 200, result: rows.length ? `hit ${rows.length}` : 'empty' });
  return rows.map(censusToCarrier).filter((c) => c && c.company_name);
}

async function lookupCensusRow(query) {
  const classified = classifyQuery(query);
  const { rows } = await searchCensusRows(classified);
  return rows[0] || null;
}

const STATE_SEED_NAMES = [
  'Transport',
  'Trucking',
  'Logistics',
  'Freight',
  'Express',
  'Carrier'
];

async function searchFmcsa(query) {
  const classified = classifyQuery(query);
  const attempts = [];
  const keyPresent = !!apiKey();

  try {
    const censusHits = await searchCensus(classified, attempts);
    if (censusHits.length) {
      return {
        source: 'FMCSA Census',
        query: classified,
        keyPresent,
        attempts,
        carriers: censusHits
      };
    }
  } catch (err) {
    attempts.push({ path: 'census', status: err.status || 0, result: err.message });
  }

  if (!keyPresent) {
    return {
      source: attempts.length ? 'FMCSA Census' : 'unconfigured',
      keyPresent: false,
      query: classified,
      attempts,
      carriers: [],
      message: attempts.length
        ? `No FMCSA census record for ${classified.type.toUpperCase()} ${classified.value}. Try the legal name or USDOT.`
        : 'Add FMCSA_API_KEY (free at https://mobile.fmcsa.dot.gov/QCDevsite/) to search live U.S. motor carriers.'
    };
  }

  let nodes = [];
  let lastError = '';

  try {
    if (classified.type === 'mc') {
      nodes = await fetchCarrierByMc(classified.value, attempts);
    } else if (classified.type === 'dot') {
      nodes = await fetchCarrierByDot(classified.value, attempts);
    } else if (classified.type === 'state') {
      const found = [];
      for (const seed of STATE_SEED_NAMES) {
        try {
          const list = await fetchCarrierByName(seed);
          for (const n of list || []) {
            const norm = normalizeCarrier(n, { state: classified.value });
            if ((norm.phy_state || '').toUpperCase() === classified.value) found.push(n);
          }
        } catch {
          // continue other seeds
        }
        if (found.length >= 25) break;
      }
      nodes = found.slice(0, 25);
    } else {
      nodes = await fetchCarrierByName(classified.value, attempts);
    }
  } catch (err) {
    lastError = err.message;
  }

  const limited = (nodes || []).slice(0, 20);
  const carriers = [];
  for (const n of limited) {
    carriers.push(await enrichOne(n, classified.type === 'state' ? { state: classified.value } : {
      mc: classified.type === 'mc' ? classified.value : '',
      dot: classified.type === 'dot' ? classified.value : ''
    }));
  }

  let found = carriers.filter((c) => c.company_name);
  if (!found.length && (classified.type === 'mc' || classified.type === 'dot')) {
    try {
      const safer = await fetchSafer(classified.type, classified.value);
      if (safer && safer.company_name) found = [safer];
    } catch {
      // keep QC result
    }
  }

  if (!found.length) {
    return {
      source: lastError ? 'fmcsa_error' : 'FMCSA Census',
      query: classified,
      keyPresent: true,
      attempts,
      carriers: [],
      message: lastError
        ? `FMCSA lookup failed (${lastError}). QCMobile is often blocked from cloud servers; census had no match for ${classified.type.toUpperCase()} ${classified.value}.`
        : `No FMCSA record for ${classified.type.toUpperCase()} ${classified.value}. Try the legal name or USDOT.`
    };
  }

  return {
    source: found[0].source || 'FMCSA QC API',
    query: classified,
    keyPresent: true,
    attempts,
    carriers: found
  };
}

module.exports = {
  classifyQuery,
  searchFmcsa,
  lookupCensusRow,
  normalizeCarrier,
  enrichOne,
  digits
};
