const PROVIDERS = {
  motive: {
    key: 'motive',
    name: 'Motive',
    formerName: 'KeepTruckin',
    docs: 'https://developer.gomotive.com',
    oauthAuthorize: 'https://gomotive.com/oauth/authorize',
    oauthToken: 'https://api.gomotive.com/oauth/token',
    apiBase: 'https://api.gomotive.com',
    scopes: 'vehicles.read locations.read hos.read users.read companies.read vehicle_gateways.read',
    envId: 'MOTIVE_CLIENT_ID',
    envSecret: 'MOTIVE_CLIENT_SECRET',
    authModes: ['oauth', 'api_key'],
    note: 'Carrier fleet admin installs Shipping Wish in Motive (OAuth) or pastes their own Motive API key. Shipping Wish is not Motive and does not sell ELD hardware.'
  },
  samsara: {
    key: 'samsara',
    name: 'Samsara',
    docs: 'https://developers.samsara.com',
    oauthAuthorize: 'https://api.samsara.com/oauth2/authorize',
    oauthToken: 'https://api.samsara.com/oauth2/token',
    apiBase: 'https://api.samsara.com',
    scopes: 'openid offline_access',
    envId: 'SAMSARA_CLIENT_ID',
    envSecret: 'SAMSARA_CLIENT_SECRET',
    authModes: ['oauth', 'api_key'],
    note: 'Carrier fleet admin connects Samsara with OAuth or a Samsara API token from their own dashboard.'
  },
  geotab: {
    key: 'geotab',
    name: 'Geotab',
    docs: 'https://developers.geotab.com',
    apiBase: 'https://my.geotab.com',
    authModes: ['session'],
    note: 'Carrier signs in to their own MyGeotab database. Password is used once to create a session and is not stored.'
  }
};

function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    key: p.key,
    name: p.name,
    formerName: p.formerName || null,
    docs: p.docs,
    authModes: p.authModes,
    oauthReady: Boolean(p.envId && process.env[p.envId] && process.env[p.envSecret]),
    note: p.note
  }));
}

function getProvider(key) {
  return PROVIDERS[String(key || '').toLowerCase()] || null;
}

function publicBaseUrl() {
  return String(process.env.APP_URL || process.env.PUBLIC_BASE_URL || 'https://shippingwish.com').replace(/\/$/, '');
}

function oauthRedirectUri(providerKey) {
  return `${publicBaseUrl()}/api/eld-connect/oauth/${providerKey}/callback`;
}

function oauthAuthorizeUrl(providerKey, { clientId, state, redirectUri }) {
  const p = getProvider(providerKey);
  if (!p || !p.oauthAuthorize) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri || oauthRedirectUri(providerKey),
    response_type: 'code',
    scope: p.scopes || ''
  });
  if (state) params.set('state', state);
  return `${p.oauthAuthorize}?${params.toString()}`;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(...values) {
  for (const v of values) {
    if (v == null || v === '') continue;
    return v;
  }
  return null;
}

function unwrapList(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    const val = payload[key];
    if (Array.isArray(val)) return val;
    if (val && Array.isArray(val.data)) return val.data;
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.result)) return payload.result;
  return [];
}

function unwrapRow(row, innerKeys) {
  if (!row || typeof row !== 'object') return {};
  for (const key of innerKeys) {
    if (row[key] && typeof row[key] === 'object') return Object.assign({}, row, row[key]);
  }
  return row;
}

function mapMotiveVehicle(row) {
  const v = unwrapRow(row, ['vehicle']);
  const loc = v.current_location || v.location || {};
  return {
    external_id: String(pick(v.id, v.identifier, v.number) || ''),
    name: pick(v.number, v.name, v.identifier) || 'Vehicle',
    vin: pick(v.vin, v.vin_number) || null,
    unit_number: pick(v.number, v.identifier) || null,
    make: v.make || null,
    model: v.model || null,
    year: num(v.year),
    gps_lat: num(pick(loc.lat, loc.latitude)),
    gps_lon: num(pick(loc.lon, loc.lng, loc.longitude)),
    speed: num(pick(loc.speed, loc.speed_miles_per_hour, v.speed)),
    heading: num(pick(loc.bearing, loc.heading, v.heading)),
    location_name: pick(loc.description, loc.address, loc.located_at_description) || null,
    located_at: pick(loc.located_at, loc.updated_at, loc.time) || null,
    engine_state: pick(v.current_status, loc.engine_state) || null,
    odometer_miles: num(pick(v.odometer, v.odometer_miles, loc.odometer))
  };
}

function mapSamsaraVehicle(row) {
  const v = unwrapRow(row, ['vehicle']);
  const gps = v.gps || v.location || {};
  return {
    external_id: String(pick(v.id, v.vehicleId) || ''),
    name: pick(v.name, v.nickname) || 'Vehicle',
    vin: pick(v.vin, v.vehicleVin) || null,
    unit_number: pick(v.name, v.serial) || null,
    make: pick(v.make, v.vehicleMake) || null,
    model: pick(v.model, v.vehicleModel) || null,
    year: num(v.year),
    gps_lat: num(pick(gps.latitude, gps.lat)),
    gps_lon: num(pick(gps.longitude, gps.lng, gps.lon)),
    speed: num(pick(gps.speedMilesPerHour, gps.speed)),
    heading: num(pick(gps.headingDegrees, gps.heading)),
    location_name: pick(gps.reverseGeo?.formattedLocation, gps.formattedLocation) || null,
    located_at: pick(gps.time, gps.timestamp) || null,
    engine_state: pick(v.engineState, gps.engineState) || null,
    odometer_miles: num(pick(v.obdOdometerMeters, gps.odometerMeters))
      ? Math.round(num(pick(v.obdOdometerMeters, gps.odometerMeters)) / 1609.34)
      : num(v.odometerMiles)
  };
}

function mapGeotabDevice(row) {
  const v = row || {};
  return {
    external_id: String(pick(v.id, v.hardwareId) || ''),
    name: pick(v.name, v.licensePlate) || 'Device',
    vin: pick(v.vehicleIdentificationNumber, v.vin) || null,
    unit_number: pick(v.name, v.serialNumber) || null,
    make: null,
    model: null,
    year: null,
    gps_lat: num(pick(v.latitude, v.lat)),
    gps_lon: num(pick(v.longitude, v.lng)),
    speed: num(v.speed),
    heading: num(pick(v.bearing, v.heading)),
    location_name: null,
    located_at: pick(v.dateTime, v.deviceDateTime) || null,
    engine_state: null,
    odometer_miles: num(v.odometer) ? Math.round(num(v.odometer) / 1609.34) : null
  };
}

function minutesFromClock(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 2000) return Math.round(value / 60000);
    if (value <= 200) return Math.round(value * 60);
    return Math.round(value);
  }
  const s = String(value);
  const hm = s.match(/^(\d+)h\s*(\d+)/i);
  if (hm) return (parseInt(hm[1], 10) * 60) + parseInt(hm[2], 10);
  const n = Number(s);
  return Number.isFinite(n) ? minutesFromClock(n) : null;
}

function mapMotiveDriver(row) {
  const d = unwrapRow(row, ['user', 'driver']);
  const clocks = d.current_log || d.hos_clocks || d.available_time || {};
  return {
    external_id: String(pick(d.id, d.driver_id) || ''),
    name: pick(d.full_name, [d.first_name, d.last_name].filter(Boolean).join(' '), d.email) || 'Driver',
    email: d.email || null,
    phone: pick(d.phone, d.phone_no) || null,
    duty_status: normalizeDuty(pick(d.duty_status, clocks.duty_status, d.current_state)),
    drive_remaining_minutes: minutesFromClock(pick(clocks.drive, clocks.driving, clocks.drive_remaining)),
    shift_remaining_minutes: minutesFromClock(pick(clocks.shift, clocks.duty, clocks.shift_remaining)),
    cycle_remaining_minutes: minutesFromClock(pick(clocks.cycle, clocks.cycle_remaining)),
    break_remaining_minutes: minutesFromClock(pick(clocks.break, clocks.break_remaining)),
    vehicle_external_id: d.current_vehicle_id ? String(d.current_vehicle_id) : null,
    gps_lat: num(pick(d.current_location?.lat, d.lat)),
    gps_lon: num(pick(d.current_location?.lon, d.lon)),
    located_at: pick(d.current_location?.located_at, d.updated_at) || null
  };
}

function mapSamsaraDriver(row) {
  const d = unwrapRow(row, ['driver']);
  const clocks = d.clocks || d.currentDutyStatus || {};
  const loc = d.gps || {};
  return {
    external_id: String(pick(d.id, d.driverId) || ''),
    name: pick(d.name, [d.firstName, d.lastName].filter(Boolean).join(' ')) || 'Driver',
    email: pick(d.email, d.username) || null,
    phone: d.phone || null,
    duty_status: normalizeDuty(pick(d.currentDutyStatus?.hosStatusType, clocks.hosStatusType, d.hosStatusType)),
    drive_remaining_minutes: minutesFromClock(pick(clocks.driveRemainingDurationMs, d.driveRemainingDurationMs)),
    shift_remaining_minutes: minutesFromClock(pick(clocks.shiftRemainingDurationMs, d.shiftRemainingDurationMs)),
    cycle_remaining_minutes: minutesFromClock(pick(clocks.cycleRemainingDurationMs, d.cycleRemainingDurationMs)),
    break_remaining_minutes: minutesFromClock(pick(clocks.timeUntilBreakDurationMs, d.timeUntilBreakDurationMs)),
    vehicle_external_id: d.vehicleId ? String(d.vehicleId) : null,
    gps_lat: num(loc.latitude),
    gps_lon: num(loc.longitude),
    located_at: loc.time || null
  };
}

function normalizeDuty(value) {
  const s = String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (['DRIVING', 'D', 'DRIVE'].includes(s)) return 'DRIVING';
  if (['ON_DUTY', 'ON_DUTY_NOT_DRIVING', 'ON', 'YM', 'YARD_MOVE'].includes(s)) return 'ON_DUTY_NOT_DRIVING';
  if (['SLEEPER', 'SLEEPER_BERTH', 'SB'].includes(s)) return 'SLEEPER_BERTH';
  if (['OFF', 'OFF_DUTY', 'OFFDUTY'].includes(s)) return 'OFF_DUTY';
  return s || 'OFF_DUTY';
}

function formatMinutes(mins) {
  if (mins == null || !Number.isFinite(Number(mins))) return '—';
  const m = Math.max(0, Math.round(Number(mins)));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function osmEmbedForPoints(points) {
  const usable = (Array.isArray(points) ? points : []).filter((p) => {
    const lat = p?.lat;
    const lng = p?.lng;
    return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  });
  if (!usable.length) return null;
  const lats = usable.map((p) => Number(p.lat));
  const lngs = usable.map((p) => Number(p.lng));
  const pad = usable.length > 1 ? 0.08 : 0.03;
  const minLng = Math.min(...lngs) - pad;
  const minLat = Math.min(...lats) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const maxLat = Math.max(...lats) + pad;
  const marker = `${usable[0].lat},${usable[0].lng}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
}

async function fetchJson(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    const res = await fetch(url, Object.assign({ signal: ctrl.signal }, options || {}));
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text.slice(0, 400) }; }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

function motiveHeaders(token, apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  else if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function samsaraHeaders(token) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`
  };
}

async function exchangeOauthToken(providerKey, { code, redirectUri, refreshToken }) {
  const p = getProvider(providerKey);
  if (!p || !p.oauthToken) throw new Error('This provider does not use OAuth.');
  const clientId = process.env[p.envId];
  const clientSecret = process.env[p.envSecret];
  if (!clientId || !clientSecret) throw new Error(`${p.name} OAuth app is not configured on the server.`);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri || oauthRedirectUri(providerKey)
  });
  if (refreshToken) {
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
  } else {
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
  }
  const res = await fetchJson(p.oauthToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString()
  });
  if (!res.ok || !res.json || !res.json.access_token) {
    const msg = res.json?.error_description || res.json?.error || `OAuth token exchange failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json;
}

async function pullMotive(creds) {
  const headers = motiveHeaders(creds.accessToken, creds.apiKey);
  const vehiclesRes = await fetchJson(`${PROVIDERS.motive.apiBase}/v1/vehicles?per_page=100`, { headers });
  if (!vehiclesRes.ok) {
    throw new Error(vehiclesRes.json?.error || vehiclesRes.json?.message || `Motive vehicles failed (${vehiclesRes.status})`);
  }
  const vehicles = unwrapList(vehiclesRes.json, ['vehicles']).map(mapMotiveVehicle).filter((v) => v.external_id);
  let drivers = [];
  const usersRes = await fetchJson(`${PROVIDERS.motive.apiBase}/v1/users?role=driver&per_page=100`, { headers });
  if (usersRes.ok) {
    drivers = unwrapList(usersRes.json, ['users', 'drivers']).map(mapMotiveDriver).filter((d) => d.external_id);
  }
  const clocksRes = await fetchJson(`${PROVIDERS.motive.apiBase}/v1/hos_available_time`, { headers });
  if (clocksRes.ok) {
    const clocks = unwrapList(clocksRes.json, ['available_time', 'hos_available_time', 'users']);
    const byId = new Map(drivers.map((d) => [d.external_id, d]));
    clocks.forEach((row) => {
      const mapped = mapMotiveDriver(row);
      if (!mapped.external_id) return;
      const existing = byId.get(mapped.external_id) || mapped;
      byId.set(mapped.external_id, Object.assign(existing, mapped, {
        name: existing.name || mapped.name
      }));
    });
    drivers = Array.from(byId.values());
  }
  return {
    account_label: pick(vehiclesRes.json?.company?.name, vehiclesRes.json?.pagination && 'Motive fleet') || 'Motive fleet',
    vehicles,
    drivers
  };
}

async function pullSamsara(creds) {
  const headers = samsaraHeaders(creds.accessToken || creds.apiKey);
  const vehiclesRes = await fetchJson(`${PROVIDERS.samsara.apiBase}/fleet/vehicles/stats?types=gps,engineStates`, { headers });
  if (!vehiclesRes.ok) {
    const fallback = await fetchJson(`${PROVIDERS.samsara.apiBase}/fleet/vehicles`, { headers });
    if (!fallback.ok) {
      throw new Error(fallback.json?.message || `Samsara vehicles failed (${fallback.status})`);
    }
    return {
      account_label: 'Samsara fleet',
      vehicles: unwrapList(fallback.json, ['data']).map(mapSamsaraVehicle).filter((v) => v.external_id),
      drivers: []
    };
  }
  const vehicles = unwrapList(vehiclesRes.json, ['data']).map(mapSamsaraVehicle).filter((v) => v.external_id);
  let drivers = [];
  const clocksRes = await fetchJson(`${PROVIDERS.samsara.apiBase}/fleet/hos/clocks`, { headers });
  if (clocksRes.ok) {
    drivers = unwrapList(clocksRes.json, ['data']).map(mapSamsaraDriver).filter((d) => d.external_id);
  }
  return { account_label: 'Samsara fleet', vehicles, drivers };
}

async function geotabCall(server, credentials, method, params) {
  const host = String(server || 'my.geotab.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const res = await fetchJson(`https://${host}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ method, params: Object.assign({}, params || {}, { credentials }) })
  });
  if (!res.ok || res.json?.error) {
    throw new Error(res.json?.error?.message || `Geotab ${method} failed (${res.status})`);
  }
  return res.json?.result;
}

async function geotabAuthenticate({ server, database, username, password }) {
  const host = String(server || 'my.geotab.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const res = await fetchJson(`https://${host}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      method: 'Authenticate',
      params: {
        database: String(database || '').trim(),
        userName: String(username || '').trim(),
        password: String(password || '')
      }
    })
  });
  const creds = res.json?.result?.credentials || res.json?.result;
  if (!res.ok || !creds || !creds.sessionId) {
    throw new Error(res.json?.error?.message || 'Geotab sign-in failed. Check database, username, and password.');
  }
  return {
    sessionId: creds.sessionId,
    database: creds.database || database,
    userName: creds.userName || username,
    server: res.json?.result?.path || host
  };
}

async function pullGeotab(creds) {
  const credentials = {
    database: creds.database,
    userName: creds.username,
    sessionId: creds.sessionId
  };
  const devices = await geotabCall(creds.server, credentials, 'Get', { typeName: 'Device' });
  const vehicles = (Array.isArray(devices) ? devices : []).map(mapGeotabDevice).filter((v) => v.external_id);
  let drivers = [];
  try {
    const users = await geotabCall(creds.server, credentials, 'Get', {
      typeName: 'User',
      search: { isDriver: true }
    });
    drivers = (Array.isArray(users) ? users : []).map((u) => ({
      external_id: String(u.id || ''),
      name: pick(u.name, u.firstName && `${u.firstName} ${u.lastName || ''}`.trim()) || 'Driver',
      email: u.name && String(u.name).includes('@') ? u.name : null,
      phone: null,
      duty_status: 'OFF_DUTY',
      drive_remaining_minutes: null,
      shift_remaining_minutes: null,
      cycle_remaining_minutes: null,
      break_remaining_minutes: null,
      vehicle_external_id: null,
      gps_lat: null,
      gps_lon: null,
      located_at: null
    })).filter((d) => d.external_id);
  } catch (_) { /* optional */ }
  return { account_label: `${creds.database || 'Geotab'} fleet`, vehicles, drivers };
}

async function pullProvider(providerKey, creds) {
  const key = String(providerKey || '').toLowerCase();
  if (key === 'motive') return pullMotive(creds);
  if (key === 'samsara') return pullSamsara(creds);
  if (key === 'geotab') return pullGeotab(creds);
  throw new Error('Unknown ELD provider.');
}

function applyWebhookLocation(providerKey, body) {
  const p = String(providerKey || '').toLowerCase();
  const payload = body && typeof body === 'object' ? body : {};
  const loc = payload.vehicle_location || payload.location || payload.data || payload;
  const vehicle = loc.vehicle || payload.vehicle || {};
  const mapped = p === 'samsara'
    ? mapSamsaraVehicle(Object.assign({}, vehicle, { gps: loc.gps || loc }))
    : mapMotiveVehicle(Object.assign({}, vehicle, { current_location: loc }));
  if (!mapped.external_id && loc.vehicle_id) mapped.external_id = String(loc.vehicle_id);
  return mapped.external_id ? mapped : null;
}

module.exports = {
  PROVIDERS,
  listProviders,
  getProvider,
  publicBaseUrl,
  oauthRedirectUri,
  oauthAuthorizeUrl,
  unwrapList,
  mapMotiveVehicle,
  mapSamsaraVehicle,
  mapGeotabDevice,
  mapMotiveDriver,
  mapSamsaraDriver,
  normalizeDuty,
  formatMinutes,
  minutesFromClock,
  osmEmbedForPoints,
  exchangeOauthToken,
  geotabAuthenticate,
  pullProvider,
  applyWebhookLocation
};
