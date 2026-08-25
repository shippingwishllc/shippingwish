const https = require('https');

const FMCSA_HOST = 'mobile.fmcsa.dot.gov';
const SAFER_HOST = 'safer.fmcsa.dot.gov';

function httpsRequest(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json, text/html;q=0.9', 'User-Agent': 'Mozilla/5.0 ShippingWishTMS' } }, (resp) => {
      let body = '';
      resp.on('data', (d) => { body += d; });
      resp.on('end', () => {
        resolve({ status: resp.statusCode || 0, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('FMCSA timeout'));
    });
  });
}

async function httpsJson(url, timeoutMs = 15000) {
  const { status, body } = await httpsRequest(url, timeoutMs);
  if (status >= 400) {
    const err = new Error(`FMCSA HTTP ${status}`);
    err.status = status;
    throw err;
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch (e) {
    throw new Error('FMCSA returned non-JSON');
  }
}

function apiKey() {
  return String(process.env.FMCSA_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
}

function qcUrl(path) {
  const key = encodeURIComponent(apiKey());
  const clean = String(path).replace(/^\/+/, '');
  return `https://${FMCSA_HOST}/qc/services/${clean}${clean.includes('?') ? '&' : '?'}webKey=${key}`;
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
  if (node.carrier && typeof node.carrier === 'object' && !Array.isArray(node.carrier)) return node.carrier;
  if (node.content) return unwrapCarrier(node.content);
  if (node.legalName || node.dbaName || node.dotNumber || node.docketNumber) return node;
  return null;
}

function extractNodes(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.map(unwrapCarrier).filter(Boolean);
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
    company_name: src.legalName || src.dbaName || src.legal_name || extras.company_name || '',
    dba_name: src.dbaName || src.dba_name || extras.dba_name || '',
    owner_name: src.officer1 || src.officerName || extras.owner_name || src.dbaName || '',
    officer_name: src.officer1 || src.officerName || extras.officer_name || '',
    mc_number: mc,
    dot_number: String(src.dotNumber || src.dot_number || extras.dot || extras.dot_number || ''),
    phone: src.telephone || src.phone || extras.phone || '',
    email: String(src.emailAddress || src.email || extras.email || '').toLowerCase(),
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

async function fetchQcNodes(path) {
  try {
    const data = await httpsJson(qcUrl(path));
    return extractNodes(data);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

async function fetchCarrierByDot(dot) {
  const d = digits(dot);
  if (!d) return [];
  return fetchQcNodes(`carriers/${d}`);
}

async function fetchCarrierByMc(mc) {
  const m = digits(mc);
  if (!m) return [];
  let nodes = await fetchQcNodes(`carriers/docket-number/${m}/`);
  if (!nodes.length) nodes = await fetchQcNodes(`carriers/docket-number/${m}`);
  return nodes;
}

async function fetchCarrierByName(name) {
  return fetchQcNodes(`carriers/name/${encodeURIComponent(name)}`);
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

const STATE_SEED_NAMES = [
  'Transport',
  'Trucking',
  'Logistics',
  'Freight',
  'Express',
  'Carrier'
];

async function searchFmcsa(query) {
  if (!apiKey()) {
    const classified = classifyQuery(query);
    if (classified.type === 'mc' || classified.type === 'dot') {
      try {
        const safer = await fetchSafer(classified.type, classified.value);
        if (safer && safer.company_name) {
          return { source: 'FMCSA SAFER', query: classified, carriers: [safer] };
        }
      } catch {
        // fall through to unconfigured message
      }
    }
    return { source: 'unconfigured', carriers: [], message: 'Add FMCSA_API_KEY (free at https://mobile.fmcsa.dot.gov/QCDevsite/) to search live U.S. motor carriers.' };
  }

  const classified = classifyQuery(query);
  let nodes = [];
  let lastError = '';

  try {
    if (classified.type === 'mc') {
      nodes = await fetchCarrierByMc(classified.value);
      if (!nodes.length) nodes = await fetchCarrierByDot(classified.value);
    } else if (classified.type === 'dot') {
      nodes = await fetchCarrierByDot(classified.value);
      if (!nodes.length) nodes = await fetchCarrierByMc(classified.value);
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
      nodes = await fetchCarrierByName(classified.value);
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
      source: lastError ? 'fmcsa_error' : 'FMCSA QC API',
      query: classified,
      carriers: [],
      message: lastError
        ? `FMCSA lookup failed (${lastError}). Check the WebKey in Vercel, then Redeploy.`
        : `No FMCSA record for ${classified.type.toUpperCase()} ${classified.value}. Confirm the number on SAFER, or try the company name.`
    };
  }

  return {
    source: found[0].source || 'FMCSA QC API',
    query: classified,
    carriers: found
  };
}

module.exports = {
  classifyQuery,
  searchFmcsa,
  normalizeCarrier,
  enrichOne,
  digits
};
