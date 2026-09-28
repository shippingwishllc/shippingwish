const pool = require('../db');
const { EXACT_ZIP_FREIGHT_MAP, lookupZip } = require('./us-zipcodes');

const STATE_CENTERS = {
  AL: [32.8, -86.8], AK: [64.7, -152.0], AZ: [34.3, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.5],
  CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4],
  GA: [32.7, -83.4], HI: [20.8, -156.3], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3],
  IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2],
  MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7],
  MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6],
  NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5],
  OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7],
  VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.9],
  WY: [43.0, -107.6]
};

const STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY'
};

const REGIONS = {
  midwest: ['IL', 'IN', 'OH', 'MI', 'WI', 'IA', 'MO', 'MN', 'KS', 'NE'],
  southeast: ['GA', 'FL', 'NC', 'SC', 'TN', 'AL', 'MS'],
  northeast: ['NY', 'NJ', 'PA', 'MA', 'CT', 'RI', 'NH', 'VT', 'ME', 'MD', 'DE'],
  'east coast': ['ME', 'NH', 'MA', 'RI', 'CT', 'NY', 'NJ', 'DE', 'MD', 'VA', 'NC', 'SC', 'GA', 'FL'],
  'west coast': ['CA', 'OR', 'WA'],
  southwest: ['TX', 'OK', 'NM', 'AZ'],
  northwest: ['WA', 'OR', 'ID', 'MT'],
  mountain: ['CO', 'WY', 'MT', 'UT', 'ID', 'NM'],
  south: ['TX', 'OK', 'AR', 'LA', 'MS', 'AL', 'TN', 'GA', 'FL']
};

// Codes that are also ordinary English words only count when written in capitals.
const AMBIGUOUS_CODES = new Set(['OR', 'IN', 'OK', 'ME', 'HI', 'OH', 'LA', 'CO', 'AL', 'PA', 'MA', 'ID', 'DE', 'MO', 'MI', 'WA']);

const KNOWN_CITIES = {};
for (const info of Object.values(EXACT_ZIP_FREIGHT_MAP)) {
  const key = info.city.toLowerCase();
  if (!KNOWN_CITIES[key]) KNOWN_CITIES[key] = { city: info.city, state: info.state, zip: info.zip };
}

function toRad(deg) { return (deg * Math.PI) / 180; }

function milesBetween(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Road miles run longer than straight-line distance; 1.2 is a common planning factor.
function roadMiles(a, b) {
  const straight = milesBetween(a, b);
  return straight == null ? null : Math.round(straight * 1.2);
}

function stateOf(location) {
  const text = String(location || '');
  const m = text.match(/,\s*([A-Za-z]{2})\b(?:\s+\d{5})?\s*$/) || text.match(/\b([A-Z]{2})\s*(?:\d{5})?\s*$/);
  const code = m ? m[1].toUpperCase() : '';
  return STATE_CENTERS[code] ? code : null;
}

function stateCenter(code) {
  const c = STATE_CENTERS[String(code || '').toUpperCase()];
  return c ? { lat: c[0], lng: c[1], state: String(code).toUpperCase(), approx: true } : null;
}

function parsePlace(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const zip = raw.match(/\b(\d{5})\b/);
  if (zip) return { zip: zip[1] };
  const cleaned = raw.replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
  const comma = cleaned.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (comma && STATE_CENTERS[comma[2].toUpperCase()]) return { city: comma[1].trim(), state: comma[2].toUpperCase() };
  const spaced = cleaned.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (spaced && STATE_CENTERS[spaced[2].toUpperCase()] && !AMBIGUOUS_CODES.has(spaced[2].toUpperCase())) {
    return { city: spaced[1].trim(), state: spaced[2].toUpperCase() };
  }
  if (spaced && STATE_CENTERS[spaced[2]]) return { city: spaced[1].trim(), state: spaced[2] };
  const lower = cleaned.toLowerCase();
  if (STATE_NAMES[lower]) return { state: STATE_NAMES[lower] };
  if (KNOWN_CITIES[lower]) return { ...KNOWN_CITIES[lower] };
  return null;
}

function placeLabel(place) {
  if (!place) return '';
  if (place.city && place.state) return `${place.city}, ${place.state}`;
  if (place.zip) return place.zip;
  return place.state || '';
}

let schemaReady = false;
async function ensureGeoSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS geo_cache (
      key TEXT PRIMARY KEY,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      city TEXT,
      state TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  schemaReady = true;
}

const memory = new Map();

async function lookupRemote(place) {
  const path = place.zip
    ? `us/${place.zip}`
    : `us/${encodeURIComponent(place.state.toLowerCase())}/${encodeURIComponent(place.city.toLowerCase())}`;
  const res = await fetch(`https://api.zippopotam.us/${path}`, { signal: AbortSignal.timeout(4000) });
  if (res.status === 404) return { lat: null, lng: null };
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data = await res.json();
  const first = (data.places || [])[0];
  if (!first) return { lat: null, lng: null };
  return {
    lat: Number(first.latitude),
    lng: Number(first.longitude),
    city: first['place name'] || place.city || null,
    state: first['state abbreviation'] || data['state abbreviation'] || place.state || null
  };
}

// Returns { lat, lng, city, state, approx } or null. Falls back to the state center when a
// town can't be found, and marks that result approx so callers can show "~" miles.
async function geocode(input) {
  const place = typeof input === 'string' ? parsePlace(input) : input;
  if (!place) return null;
  if (!place.zip && !place.city) return place.state ? stateCenter(place.state) : null;
  const key = place.zip ? `zip:${place.zip}` : `city:${place.city.toLowerCase()},${place.state}`;
  if (memory.has(key)) return memory.get(key);

  await ensureGeoSchema();
  const cached = await pool.query('SELECT lat, lng, city, state, created_at FROM geo_cache WHERE key = $1', [key]);
  let hit = cached.rows[0];
  const staleMiss = hit && hit.lat == null && Date.now() - new Date(hit.created_at).getTime() > 7 * 86400000;
  if (!hit || staleMiss) {
    try {
      const remote = await lookupRemote(place);
      await pool.query(
        `INSERT INTO geo_cache (key, lat, lng, city, state) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (key) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, city = EXCLUDED.city, state = EXCLUDED.state, created_at = now()`,
        [key, remote.lat, remote.lng, remote.city || null, remote.state || null]
      );
      hit = remote;
    } catch {
      hit = null;
    }
  }
  let result;
  if (hit && Number.isFinite(Number(hit.lat)) && hit.lat != null) {
    result = { lat: Number(hit.lat), lng: Number(hit.lng), city: hit.city || place.city || null, state: hit.state || place.state || null, zip: place.zip || null, approx: false };
  } else {
    const fallbackState = place.state || (place.zip && lookupZip(place.zip)?.state);
    result = fallbackState ? { ...stateCenter(fallbackState), city: place.city || null, zip: place.zip || null } : null;
  }
  if (result) memory.set(key, result);
  return result;
}

module.exports = {
  STATE_CENTERS,
  STATE_NAMES,
  REGIONS,
  AMBIGUOUS_CODES,
  KNOWN_CITIES,
  milesBetween,
  roadMiles,
  stateOf,
  stateCenter,
  parsePlace,
  placeLabel,
  geocode,
  ensureGeoSchema
};
