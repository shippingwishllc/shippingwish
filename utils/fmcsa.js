const https = require('https');

const FMCSA_HOST = 'mobile.fmcsa.dot.gov';

function httpsJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' } }, (resp) => {
      let body = '';
      resp.on('data', (d) => { body += d; });
      resp.on('end', () => {
        if (resp.statusCode && resp.statusCode >= 400) {
          return reject(new Error(`FMCSA HTTP ${resp.statusCode}`));
        }
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('FMCSA returned non-JSON'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('FMCSA timeout'));
    });
  });
}

function apiKey() {
  return process.env.FMCSA_API_KEY || '';
}

function qcUrl(path) {
  const key = encodeURIComponent(apiKey());
  return `https://${FMCSA_HOST}/qc/services/${path}${path.includes('?') ? '&' : '?'}webKey=${key}`;
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

function pickCarrier(node) {
  return node && (node.carrier || node.content || node);
}

function normalizeCarrier(raw, extras = {}) {
  const c = pickCarrier(raw) || raw || {};
  const census = extras.census || {};
  const basics = extras.basics || {};
  const authority = extras.authority || {};
  const src = { ...c, ...census };

  const phyCity = src.phyCity || src.phy_city || '';
  const phyState = src.phyState || src.phy_state || extras.state || '';
  const phyZip = src.phyZipcode || src.phyZip || src.phy_zipcode || '';
  const street = src.phyStreet || src.phy_street || '';
  const trucks = src.totalPowerUnits || src.totalTrucks || src.nbrPowerUnit || extras.num_trucks || null;
  const drivers = src.totalDrivers || src.totalDriver || null;
  const docket = src.docketNumber || src.docket || extras.mc || '';
  const mc = docket ? (String(docket).startsWith('MC') ? String(docket) : `MC-${digits(docket)}`) : (extras.mc ? `MC-${digits(extras.mc)}` : '');

  return {
    company_name: src.legalName || src.dbaName || src.legal_name || extras.company_name || '',
    dba_name: src.dbaName || src.dba_name || '',
    owner_name: src.officer1 || src.officerName || extras.owner_name || src.dbaName || '',
    officer_name: src.officer1 || src.officerName || '',
    mc_number: mc,
    dot_number: String(src.dotNumber || src.dot_number || extras.dot || ''),
    phone: src.telephone || src.phone || extras.phone || '',
    email: (src.emailAddress || src.email || extras.email || '').toLowerCase(),
    phy_address: [street, phyCity, phyState, phyZip].filter(Boolean).join(', '),
    address: [phyCity, phyState, phyZip].filter(Boolean).join(', '),
    phy_city: phyCity,
    phy_state: phyState,
    phy_zip: String(phyZip || ''),
    equipment_type: extras.equipment_type || src.carrierOperation || '53ft Dry Van',
    num_trucks: trucks ? parseInt(trucks, 10) || 1 : 1,
    num_drivers: drivers ? parseInt(drivers, 10) || null : null,
    safety_rating: basics.safetyRating || basics.rating || extras.safety_rating || '',
    authority_status: authority.commonAuthorityStatus || authority.brokerAuthorityStatus || extras.authority_status || '',
    insurance_onfile: !!(authority.bipdInsuranceOnFile || authority.cargoInsuranceOnFile),
    state: phyState,
    already_in_crm: false
  };
}

async function fetchCarrierByDot(dot) {
  const d = digits(dot);
  if (!d) return null;
  const data = await httpsJson(qcUrl(`carriers/${d}`));
  const list = data.content || (data.carrier ? [data] : []);
  return list[0] || data;
}

async function fetchCarrierByMc(mc) {
  const m = digits(mc);
  if (!m) return null;
  const data = await httpsJson(qcUrl(`carriers/docket-number/${m}`));
  const list = data.content || (data.carrier ? [data] : []);
  return list[0] || data;
}

async function fetchCarrierByName(name) {
  const data = await httpsJson(qcUrl(`carriers/name/${encodeURIComponent(name)}`));
  return data.content || (data.carrier ? [data] : []);
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

async function enrichOne(node, extras = {}) {
  const base = normalizeCarrier(node, extras);
  const dot = base.dot_number;
  if (!dot || !apiKey()) return base;
  try {
    const [basics, authority] = await Promise.all([fetchBasics(dot), fetchAuthority(dot)]);
    return normalizeCarrier(node, { ...extras, basics: pickCarrier(basics) || basics, authority: pickCarrier(authority) || authority });
  } catch {
    return base;
  }
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
    return { source: 'unconfigured', carriers: [], message: 'Add FMCSA_API_KEY (free at https://mobile.fmcsa.dot.gov/QCDevsite/) to search live U.S. motor carriers.' };
  }

  const classified = classifyQuery(query);
  let nodes = [];

  try {
    if (classified.type === 'mc') {
      const one = await fetchCarrierByMc(classified.value);
      if (one) nodes = [one];
    } else if (classified.type === 'dot') {
      const one = await fetchCarrierByDot(classified.value);
      if (one) nodes = [one];
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
    return { source: 'fmcsa_error', carriers: [], message: err.message };
  }

  const limited = (nodes || []).slice(0, 20);
  const carriers = [];
  for (const n of limited) {
    carriers.push(await enrichOne(n, classified.type === 'state' ? { state: classified.value } : {}));
  }

  return {
    source: 'FMCSA QC API',
    query: classified,
    carriers: carriers.filter(c => c.company_name)
  };
}

module.exports = {
  classifyQuery,
  searchFmcsa,
  normalizeCarrier,
  enrichOne,
  digits
};
