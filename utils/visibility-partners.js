/**
 * Official broker-visibility partner APIs.
 * MacroPoint, FourKites, and Trucker Tools credentials come from those companies
 * after partner/carrier onboarding. This module never scrapes their sites.
 */

const crypto = require('crypto');

const PARTNERS = {
  fourkites: {
    key: 'fourkites',
    name: 'FourKites',
    docs: 'https://fourkites.my.site.com/publicKB/s/tms-locations-api-integration',
    connect: 'https://fourkites.com/fourkites-connect/',
    support: 'support@fourkites.com',
    pushUrl: 'https://tracking-api.fourkites.com/api/v1/tracking/dispatcher_updates',
    authModes: ['basic', 'nonce'],
    cadence: '15 minutes preferred',
    note: 'Carrier ops at FourKites issues Basic (username/password) or Nonce (client id + secret). POST Dispatcher Updates with real lat/lng from SW Track or a connected ELD. Shipping Wish is not FourKites.'
  },
  macropoint: {
    key: 'macropoint',
    name: 'Descartes MacroPoint',
    docs: 'https://carrierdocs.macropoint.com/',
    connect: 'https://carrier.descartesconnect.com/tms',
    support: 'MPActivations@descartes.com',
    pushUrl: 'https://macropoint-lite.com/api/1.0/tms/data/location',
    authModes: ['basic'],
    cadence: 'in-transit pings',
    note: 'Official TMS Location Update XML at macropoint-lite.com. HTTP Basic from MacroPoint activations. Do not scrape MacroPoint. Phone Accept tracking is the same method; this push is how a listed TMS feeds their network.'
  },
  truckertools: {
    key: 'truckertools',
    name: 'Trucker Tools',
    docs: 'https://info.truckertools.com/tms-integration',
    connect: 'https://www.truckertools.com/eld-carrier-integration/',
    support: 'integrations@truckertools.com',
    eldSetup: 'eldsetup@truckertools.com',
    pushUrl: null,
    authModes: ['api_key'],
    cadence: 'partner-defined',
    note: 'Trucker Tools does not publish an open developer portal. Email integrations@truckertools.com (TMS) or eldsetup@truckertools.com (ELD partner). Paste the API URL, API key, account ID, and partner ID they issue. CSV/SFTP is also supported. We do not invent their endpoint.'
  }
};

function listPartners() {
  return Object.values(PARTNERS).map((p) => ({
    key: p.key,
    name: p.name,
    docs: p.docs,
    connect: p.connect,
    support: p.support,
    eldSetup: p.eldSetup || null,
    pushUrl: p.pushUrl,
    authModes: p.authModes,
    cadence: p.cadence,
    note: p.note
  }));
}

function getPartner(key) {
  return PARTNERS[String(key || '').toLowerCase()] || null;
}

function visibilityFromBody(body) {
  const src = body && typeof body === 'object' ? body : {};
  const partners = (Array.isArray(src.visibility_partners) ? src.visibility_partners : [])
    .map((p) => String(p || '').toLowerCase())
    .filter((p) => ['fourkites', 'macropoint', 'truckertools'].includes(p));
  if (!partners.length && !src.shipper && !src.macropoint_mpid && !src.billOfLading) return {};
  return {
    partners,
    shipper: String(src.shipper || src.fourkites_shipper || '').trim() || null,
    fourkites_shipper: String(src.fourkites_shipper || src.shipper || '').trim() || null,
    billOfLading: String(src.billOfLading || src.bol || '').trim() || null,
    scac: String(src.scac || src.operatingCarrierScac || '').trim() || null,
    truckNumber: String(src.truckNumber || src.truck_number || '').trim() || null,
    trailerNumber: String(src.trailerNumber || src.trailer_number || '').trim() || null,
    macropoint_mpid: String(src.macropoint_mpid || '').trim() || null,
    macropoint_sender_load_id: String(src.macropoint_sender_load_id || '').trim() || null,
    macropoint_requestor_load_id: String(src.macropoint_requestor_load_id || src.billOfLading || '').trim() || null,
    truckertools_order_id: String(src.truckertools_order_id || '').trim() || null,
    city: String(src.city || '').trim() || null,
    state: String(src.state || '').trim() || null
  };
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function realCoord(value) {
  if (value == null || value === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function fourkitesLocatedAt(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return fourkitesLocatedAt(new Date().toISOString());
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}.${p(d.getUTCMinutes())}.${p(d.getUTCSeconds())}`;
}

function buildFourkitesPayload(ping) {
  const lat = realCoord(ping.lat);
  const lon = realCoord(ping.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('FourKites push needs real latitude and longitude.');
  }
  const update = {
    shipper: String(ping.shipper || ping.fourkites_shipper || '').trim(),
    billOfLading: String(ping.billOfLading || ping.bol || ping.load_number || '').trim(),
    operatingCarrierScac: String(ping.operatingCarrierScac || ping.scac || '').trim() || undefined,
    truckNumber: ping.truckNumber || undefined,
    trailerNumber: ping.trailerNumber || undefined,
    driverPhone: ping.driverPhone || undefined,
    city: ping.city || undefined,
    state: ping.state || undefined,
    country: ping.country || 'USA',
    latitude: String(lat),
    longitude: String(lon),
    locatedAt: fourkitesLocatedAt(ping.locatedAt)
  };
  if (!update.shipper || !update.billOfLading) {
    throw new Error('FourKites requires shipper (external ID) and billOfLading from the load / partner mapping.');
  }
  Object.keys(update).forEach((k) => { if (update[k] == null || update[k] === '') delete update[k]; });
  return { updates: [update] };
}

function buildMacropointXml(ping) {
  const lat = realCoord(ping.lat);
  const lon = realCoord(ping.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('MacroPoint push needs real latitude and longitude.');
  }
  const senderLoad = String(ping.macropoint_sender_load_id || ping.load_number || ping.billOfLading || '').trim();
  const mpid = String(ping.macropoint_mpid || ping.mpid || '').trim();
  const requestorLoad = String(ping.macropoint_requestor_load_id || ping.billOfLading || ping.load_number || '').trim();
  if (!senderLoad || !mpid || !requestorLoad) {
    throw new Error('MacroPoint requires Sender LoadID, Requestor MPID, and Requestor LoadID from activations.');
  }
  const when = ping.locatedAt ? new Date(ping.locatedAt) : new Date();
  const iso = Number.isNaN(when.getTime()) ? new Date().toISOString() : when.toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TMSLocationData xmlns="http://macropoint-lite.com/xml/1.0">',
    '  <Sender>',
    `    <LoadID>${xmlEscape(senderLoad)}</LoadID>`,
    '  </Sender>',
    '  <Requestor>',
    `    <MPID>${xmlEscape(mpid)}</MPID>`,
    `    <LoadID>${xmlEscape(requestorLoad)}</LoadID>`,
    '  </Requestor>',
    '  <AllowAccessFrom>',
    `    <MPID>${xmlEscape(mpid)}</MPID>`,
    '  </AllowAccessFrom>',
    '  <Location>',
    '    <Coordinates>',
    `      <Latitude>${lat.toFixed(6)}</Latitude>`,
    `      <Longitude>${lon.toFixed(6)}</Longitude>`,
    '    </Coordinates>',
    `    <CreatedDateTime>${xmlEscape(iso)}</CreatedDateTime>`,
    '  </Location>',
    '</TMSLocationData>'
  ].join('');
}

function buildTruckerToolsPayload(ping, extra) {
  const lat = realCoord(ping.lat);
  const lon = realCoord(ping.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Trucker Tools push needs real latitude and longitude.');
  }
  return {
    accountId: extra.accountId || extra.account_id || undefined,
    partnerId: extra.partnerId || extra.partner_id || undefined,
    orderId: ping.truckertools_order_id || ping.load_number || ping.billOfLading || undefined,
    loadNumber: ping.load_number || undefined,
    driverPhone: ping.driverPhone || undefined,
    latitude: lat,
    longitude: lon,
    locatedAt: ping.locatedAt || new Date().toISOString(),
    source: 'shippingwish_sw_track'
  };
}

function truckerToolsCsv(ping) {
  const lat = realCoord(ping.lat);
  const lon = realCoord(ping.lon);
  const header = 'LoadNumber,DriverPhone,Latitude,Longitude,LocatedAt,TruckNumber,TrailerNumber';
  const row = [
    ping.load_number || ping.billOfLading || '',
    ping.driverPhone || '',
    Number.isFinite(lat) ? lat : '',
    Number.isFinite(lon) ? lon : '',
    ping.locatedAt || new Date().toISOString(),
    ping.truckNumber || '',
    ping.trailerNumber || ''
  ].map((c) => {
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
  return `${header}\n${row}\n`;
}

function parseDigestChallenge(header) {
  const out = {};
  String(header || '').replace(/([a-zA-Z0-9_-]+)=(?:"([^"]+)"|([^\s,]+))/g, (_, k, q, u) => {
    out[k.toLowerCase()] = q != null ? q : u;
    return '';
  });
  return out;
}

function digestAuthorization({ username, password, method, uri, challenge, nc, cnonce }) {
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = (challenge.qop || '').split(',')[0].trim();
  const algo = (challenge.algorithm || 'MD5').toUpperCase();
  if (algo !== 'MD5') throw new Error(`FourKites digest algorithm ${algo} is not implemented.`);
  const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  const ncVal = nc || '00000001';
  const cn = cnonce || crypto.randomBytes(8).toString('hex');
  let response;
  if (qop) {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ncVal}:${cn}:${qop}:${ha2}`).digest('hex');
  } else {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (qop) parts.push(`qop=${qop}`, `nc=${ncVal}`, `cnonce="${cn}"`);
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  return `Digest ${parts.join(', ')}`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    const res = await fetch(url, Object.assign({ signal: ctrl.signal }, options || {}));
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
    return { ok: res.ok, status: res.status, headers: res.headers, text, json };
  } finally {
    clearTimeout(t);
  }
}

function basicHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

async function postFourkites(creds, payload) {
  const url = creds.pushUrl || PARTNERS.fourkites.pushUrl;
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (creds.username && creds.password) {
    headers.Authorization = basicHeader(creds.username, creds.password);
    return fetchWithTimeout(url, { method: 'POST', headers, body });
  }
  if (creds.clientId && creds.secret) {
    const first = await fetchWithTimeout(url, { method: 'POST', headers, body });
    const www = first.headers && first.headers.get && first.headers.get('www-authenticate');
    if (first.status !== 401 || !www || !/digest/i.test(www)) return first;
    const challenge = parseDigestChallenge(www);
    const uri = new URL(url).pathname;
    headers.Authorization = digestAuthorization({
      username: creds.clientId,
      password: creds.secret,
      method: 'POST',
      uri,
      challenge
    });
    return fetchWithTimeout(url, { method: 'POST', headers, body });
  }
  throw new Error('FourKites needs Basic username/password or Nonce client id + secret from carrier ops.');
}

async function postMacropoint(creds, xml) {
  const url = creds.pushUrl || PARTNERS.macropoint.pushUrl;
  if (!creds.username || !creds.password) {
    throw new Error('MacroPoint needs HTTP Basic credentials from MPActivations@descartes.com.');
  }
  return fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(creds.username, creds.password),
      'Content-Type': 'application/xml',
      Accept: 'application/xml'
    },
    body: xml
  });
}

async function postTruckerTools(creds, payload) {
  const url = String(creds.pushUrl || '').trim();
  if (!url || !/^https:\/\//i.test(url)) {
    throw new Error('Paste the HTTPS API URL Trucker Tools issued (integrations@truckertools.com). It is not public.');
  }
  if (!creds.apiKey) {
    throw new Error('Paste the API key Trucker Tools issued with the partner packet.');
  }
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-API-Key': creds.apiKey,
    Authorization: `Bearer ${creds.apiKey}`
  };
  if (creds.partnerId) headers['X-Partner-Id'] = String(creds.partnerId);
  if (creds.accountId) headers['X-Account-Id'] = String(creds.accountId);
  return fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(payload) });
}

async function pushLocation(partnerKey, creds, ping) {
  const key = String(partnerKey || '').toLowerCase();
  if (key === 'fourkites') {
    const payload = buildFourkitesPayload(ping);
    const res = await postFourkites(creds, payload);
    return { partner: key, payload, status: res.status, ok: res.ok, response: res.json || res.text.slice(0, 400) };
  }
  if (key === 'macropoint') {
    const payload = buildMacropointXml(ping);
    const res = await postMacropoint(creds, payload);
    return { partner: key, payload, status: res.status, ok: res.ok, response: (res.text || '').slice(0, 400) };
  }
  if (key === 'truckertools') {
    const payload = buildTruckerToolsPayload(ping, creds);
    const res = await postTruckerTools(creds, payload);
    return { partner: key, payload, status: res.status, ok: res.ok, response: res.json || res.text.slice(0, 400) };
  }
  throw new Error('Unknown visibility partner.');
}

function previewPayload(partnerKey, ping, extra) {
  const key = String(partnerKey || '').toLowerCase();
  if (key === 'fourkites') return { contentType: 'application/json', body: buildFourkitesPayload(ping) };
  if (key === 'macropoint') return { contentType: 'application/xml', body: buildMacropointXml(ping) };
  if (key === 'truckertools') {
    return {
      contentType: 'application/json',
      body: buildTruckerToolsPayload(ping, extra || {}),
      csv: truckerToolsCsv(ping)
    };
  }
  throw new Error('Unknown visibility partner.');
}

module.exports = {
  PARTNERS,
  listPartners,
  getPartner,
  xmlEscape,
  realCoord,
  fourkitesLocatedAt,
  buildFourkitesPayload,
  buildMacropointXml,
  buildTruckerToolsPayload,
  truckerToolsCsv,
  parseDigestChallenge,
  digestAuthorization,
  pushLocation,
  previewPayload,
  visibilityFromBody
};
