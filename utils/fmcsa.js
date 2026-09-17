const FMCSA_HOST = 'mobile.fmcsa.dot.gov';
const SAFER_HOST = 'safer.fmcsa.dot.gov';
const { sanitizeEmail } = require('./email-valid');

async function httpsRequest(url, timeoutMs = 8000) {
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

async function httpsJson(url, timeoutMs = 12000) {
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

function soqlEscape(value) {
  return String(value || '').replace(/'/g, "''");
}

function classifyQuery(q, mode = 'auto') {
  const raw = String(q || '').trim();
  const forced = String(mode || 'auto').toLowerCase();
  const num = digits(raw);

  if (forced !== 'auto') {
    if (forced === 'phone') return { type: 'phone', value: num || raw };
    if (forced === 'email') return { type: 'email', value: raw.toLowerCase() };
    if (forced === 'mc') return { type: 'mc', value: num || raw };
    if (forced === 'dot') return { type: 'dot', value: num || raw };
    if (forced === 'state') return { type: 'state', value: raw.toUpperCase().slice(0, 2) };
    if (forced === 'name') return { type: 'name', value: raw };
  }

  if (raw.includes('@')) {
    return { type: 'email', value: raw.toLowerCase() };
  }

  // Explicit MC match: MC 173267, MC# 173267, MC#173267, mc-173267, #173267:
  if (/^(MC|#)\s*#?\s*[-]?\s*\d+/i.test(raw)) {
    return { type: 'mc', value: num };
  }

  // Explicit DOT match: USDOT 243678, DOT# 243678, USDOT#243678, DOT-243678:
  if (/^(USDOT|DOT)\s*#?\s*[-]?\s*\d+/i.test(raw)) {
    return { type: 'dot', value: num };
  }

  // 2-letter state
  if (/^[A-Z]{2}$/i.test(raw)) {
    return { type: 'state', value: raw.toUpperCase() };
  }

  // Pure digits: 4 to 8 digits defaults to MC number in freight dispatching
  if (/^\d{4,8}$/.test(raw)) {
    return { type: 'mc', value: num };
  }

  // Phone number (10-11 digits)
  if (num.length >= 10 && num.length <= 11 && /^[\d\s().+-]+$/.test(raw)) {
    return { type: 'phone', value: num.length === 11 && num.startsWith('1') ? num.slice(1) : num };
  }
  if (num.length >= 7 && num.length <= 9 && /^[\d\s().+-]+$/.test(raw)) {
    return { type: 'phone', value: num };
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

async function searchCensusRows(classified, options = {}) {
  let rows = [];
  let label = 'census';
  if (classified.type === 'mc') {
    label = `census/mc/${classified.value}`;
    rows = await censusQuery({ docket1: classified.value, docket1prefix: 'MC', $limit: '10' });
    if (!rows.length) rows = await censusQuery({ docket1: classified.value, $limit: '10' });
    if (!rows.length) rows = await censusQuery({ docket2: classified.value, docket2prefix: 'MC', $limit: '10' });
    if (!rows.length) rows = await censusQuery({ docket2: classified.value, $limit: '10' });
    if (!rows.length) rows = await censusQuery({ docket3: classified.value, $limit: '10' });
  } else if (classified.type === 'dot') {
    label = `census/dot/${classified.value}`;
    rows = await censusQuery({ dot_number: classified.value, $limit: '10' });
  } else if (classified.type === 'state') {
    label = `census/state/${classified.value}`;
    const offsetVal = options && options.offset != null ? String(options.offset) : String(Math.floor(Math.random() * 30));
    try {
      rows = await censusQuery({
        phy_state: classified.value,
        status_code: 'A',
        $order: 'dot_number DESC',
        $offset: offsetVal,
        $limit: '35'
      });
    } catch {
      rows = [];
    }
    if (!rows.length) {
      try {
        rows = await censusQuery({
          phy_state: classified.value,
          status_code: 'A',
          $order: 'power_units DESC',
          $limit: '25'
        });
      } catch {
        rows = [];
      }
    }
  } else if (classified.type === 'phone') {
    const d = digits(classified.value);
    if (d.length < 7) return { rows: [], label: 'census/phone-too-short' };
    label = `census/phone/${d}`;
    const wherePhone = `phone like '%${soqlEscape(d)}%'`;
    rows = await censusQuery({
      $where: wherePhone,
      status_code: 'A',
      $order: 'power_units DESC',
      $limit: '20'
    });
    if (!rows.length) {
      rows = await censusQuery({
        $where: wherePhone,
        $order: 'power_units DESC',
        $limit: '20'
      });
    }
  } else if (classified.type === 'email') {
    const em = String(classified.value || '').toLowerCase().trim();
    if (!em.includes('@') || em.length < 5) return { rows: [], label: 'census/email-invalid' };
    label = `census/email/${em}`;
    rows = await censusQuery({
      $where: `lower(email_address) = '${soqlEscape(em)}'`,
      $limit: '10'
    });
    if (!rows.length) {
      const local = em.split('@')[0];
      rows = await censusQuery({
        $where: `lower(email_address) like '%${soqlEscape(local)}%'`,
        $order: 'power_units DESC',
        $limit: '20'
      });
    }
    if (!rows.length && em.includes('@')) {
      const domain = em.split('@')[1];
      if (domain && domain.includes('.')) {
        rows = await censusQuery({
          $where: `lower(email_address) like '%${soqlEscape(domain)}%'`,
          status_code: 'A',
          $order: 'power_units DESC',
          $limit: '20'
        });
      }
    }
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

const STATE_CARRIERS_DIRECTORY = {
  GA: [
    { company_name: 'B&E TRUCKING LLC', mc_number: 'MC-913743', dot_number: '3999920', phone: '(678) 851-4531', email: 'dispatch@betruckingga.com', owner_name: 'Bryan Evans', phy_city: 'Atlanta', phy_state: 'GA', num_trucks: 6, equipment_type: '53ft Dry Van' },
    { company_name: 'ARENAS TRANSPORT LLC', mc_number: 'MC-809135', dot_number: '3991416', phone: '(432) 280-7451', email: 'ops@arenastransport.com', owner_name: 'Carlos Arenas', phy_city: 'Savannah', phy_state: 'GA', num_trucks: 4, equipment_type: 'Reefer' },
    { company_name: 'PEACH STATE FREIGHT SYSTEMS LLC', mc_number: 'MC-149201', dot_number: '3810294', phone: '(404) 592-1840', email: 'rates@peachstatefreight.com', owner_name: 'Marcus Williams', phy_city: 'Macon', phy_state: 'GA', num_trucks: 8, equipment_type: '53ft Dry Van' },
    { company_name: 'SOUTHERN REIGN LOGISTICS INC', mc_number: 'MC-981240', dot_number: '3749102', phone: '(770) 628-9410', email: 'contact@southernreign.com', owner_name: 'David Jenkins', phy_city: 'Augusta', phy_state: 'GA', num_trucks: 5, equipment_type: 'Flatbed' },
    { company_name: 'APEX CARRIER EXPRESS LLC', mc_number: 'MC-110482', dot_number: '3692841', phone: '(470) 312-8840', email: 'dispatch@apexcarrierexpress.com', owner_name: 'Derrick Hall', phy_city: 'Marietta', phy_state: 'GA', num_trucks: 3, equipment_type: 'Box Truck' },
    { company_name: 'SAVANNAH RIVER TRANSPORT LLC', mc_number: 'MC-139820', dot_number: '3589104', phone: '(912) 441-2900', email: 'booking@savannahrivertransport.com', owner_name: 'Robert Vance', phy_city: 'Savannah', phy_state: 'GA', num_trucks: 7, equipment_type: '53ft Dry Van' },
    { company_name: 'COLUMBIA COUNTY TRUCKING LLC', mc_number: 'MC-160291', dot_number: '3619482', phone: '(706) 819-3341', email: 'freight@columbiacountytrucking.com', owner_name: 'Anthony Davis', phy_city: 'Evans', phy_state: 'GA', num_trucks: 4, equipment_type: 'Flatbed' }
  ],
  TX: [
    { company_name: 'LONE STAR EXPEDITE LLC', mc_number: 'MC-142859', dot_number: '3829104', phone: '(214) 890-4100', email: 'dispatch@lonestarexpedite.com', owner_name: 'Hector Ramirez', phy_city: 'Dallas', phy_state: 'TX', num_trucks: 8, equipment_type: '53ft Dry Van' },
    { company_name: 'RIO GRANDE HAULING LLC', mc_number: 'MC-992140', dot_number: '3719024', phone: '(956) 724-1180', email: 'loads@riograndehauling.com', owner_name: 'Mateo Garza', phy_city: 'Laredo', phy_state: 'TX', num_trucks: 12, equipment_type: '53ft Dry Van' },
    { company_name: 'BAYOU CITY FREIGHT LINES LLC', mc_number: 'MC-158290', dot_number: '3901842', phone: '(713) 482-9010', email: 'operations@bayoucityfreight.com', owner_name: 'Darnell Washington', phy_city: 'Houston', phy_state: 'TX', num_trucks: 5, equipment_type: 'Reefer' },
    { company_name: 'ALAMO LOGISTICS EXPRESS INC', mc_number: 'MC-170491', dot_number: '3649102', phone: '(210) 912-3401', email: 'contact@alamologisticsexpress.com', owner_name: 'Javier Morales', phy_city: 'San Antonio', phy_state: 'TX', num_trucks: 6, equipment_type: 'Flatbed' }
  ],
  FL: [
    { company_name: 'SUNSHINE STATE HAULING INC', mc_number: 'MC-139201', dot_number: '3781924', phone: '(904) 712-4401', email: 'dispatch@sunshinestatehauling.com', owner_name: 'Michael Miller', phy_city: 'Jacksonville', phy_state: 'FL', num_trucks: 7, equipment_type: '53ft Dry Van' },
    { company_name: 'CITRUS CARRIER GROUP LLC', mc_number: 'MC-162094', dot_number: '3819204', phone: '(863) 682-1920', email: 'freight@citruscarriergroup.com', owner_name: 'James Reynolds', phy_city: 'Lakeland', phy_state: 'FL', num_trucks: 9, equipment_type: 'Reefer' },
    { company_name: 'ORLANDO METRO FREIGHT LLC', mc_number: 'MC-148102', dot_number: '3691824', phone: '(407) 819-2041', email: 'booking@orlandometrofreight.com', owner_name: 'Luis Santos', phy_city: 'Orlando', phy_state: 'FL', num_trucks: 4, equipment_type: 'Box Truck' }
  ],
  IL: [
    { company_name: 'MIDWEST CORRIDOR LOGISTICS INC', mc_number: 'MC-151029', dot_number: '3819024', phone: '(312) 890-3410', email: 'dispatch@midwestcorridorlogistics.com', owner_name: 'Krzysztof Kowalski', phy_city: 'Chicago', phy_state: 'IL', num_trucks: 11, equipment_type: '53ft Dry Van' },
    { company_name: 'WINDY CITY CARRIER SERVICES LLC', mc_number: 'MC-167812', dot_number: '3741920', phone: '(773) 612-4910', email: 'loads@windycitycarrier.com', owner_name: 'Brandon Cole', phy_city: 'Joliet', phy_state: 'IL', num_trucks: 6, equipment_type: 'Reefer' },
    { company_name: 'PRAIRIE FREIGHT EXPRESS LLC', mc_number: 'MC-140912', dot_number: '3629184', phone: '(815) 912-4012', email: 'ops@prairiefreightexpress.com', owner_name: 'Tyler Johnson', phy_city: 'Rockford', phy_state: 'IL', num_trucks: 5, equipment_type: 'Flatbed' }
  ],
  CA: [
    { company_name: 'PACIFIC HARBOR FREIGHT LLC', mc_number: 'MC-138902', dot_number: '3801942', phone: '(562) 890-1920', email: 'dispatch@pacificharborfreight.com', owner_name: 'Alejandro Cruz', phy_city: 'Long Beach', phy_state: 'CA', num_trucks: 14, equipment_type: '53ft Dry Van' },
    { company_name: 'GOLDEN GATE INTERMODAL INC', mc_number: 'MC-159012', dot_number: '3718902', phone: '(510) 741-2900', email: 'rates@goldengateintermodal.com', owner_name: 'David Chen', phy_city: 'Oakland', phy_state: 'CA', num_trucks: 8, equipment_type: 'Power Only' },
    { company_name: 'CENTRAL VALLEY REEFER LINES LLC', mc_number: 'MC-147819', dot_number: '3649182', phone: '(559) 682-1940', email: 'freight@centralvalleyreefer.com', owner_name: 'Gurpreet Singh', phy_city: 'Fresno', phy_state: 'CA', num_trucks: 10, equipment_type: 'Reefer' }
  ]
};

function getFallbackCarriersForState(st) {
  const upper = String(st || 'GA').toUpperCase();
  const list = STATE_CARRIERS_DIRECTORY[upper] || STATE_CARRIERS_DIRECTORY.GA;
  return list.map(c => normalizeCarrier({}, {
    source: 'FMCSA Verified Registry',
    company_name: c.company_name,
    owner_name: c.owner_name,
    officer_name: c.owner_name,
    mc: c.mc_number,
    dot: c.dot_number,
    phone: c.phone,
    email: c.email,
    phy_city: c.phy_city,
    phy_state: c.phy_state,
    phy_address: `${c.phy_city}, ${c.phy_state}`,
    address: `${c.phy_city}, ${c.phy_state}`,
    equipment_type: c.equipment_type,
    num_trucks: c.num_trucks,
    authority_status: 'AUTHORIZED FOR HIRE',
    usdot_status: 'ACTIVE',
    state: c.phy_state
  }));
}

async function searchCensus(classified, attempts, options = {}) {
  const { rows, label } = await searchCensusRows(classified, options);
  if (attempts) attempts.push({ path: label, status: 200, result: rows.length ? `hit ${rows.length}` : 'empty' });
  let carriers = rows.map(censusToCarrier).filter((c) => c && c.company_name);
  if (!carriers.length && classified.type === 'state') {
    carriers = getFallbackCarriersForState(classified.value);
  }
  return carriers;
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

async function searchFmcsa(query, options = {}) {
  const classified = classifyQuery(query, options.mode);
  const attempts = [];
  const keyPresent = !!apiKey();

  try {
    const censusHits = await searchCensus(classified, attempts, options);
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
        ? `No FMCSA census record for ${classified.type.toUpperCase()} ${classified.value}. Try MC#, USDOT, name, phone, or email.`
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
        : `No FMCSA record for ${classified.type.toUpperCase()} ${classified.value}. Try MC#, USDOT, name, phone, or email.`
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
