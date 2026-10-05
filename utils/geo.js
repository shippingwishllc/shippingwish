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

const ADJACENT_STATES = {
  AL: ['MS', 'TN', 'GA', 'FL'],
  AK: [],
  AZ: ['CA', 'NV', 'UT', 'NM'],
  AR: ['MO', 'TN', 'MS', 'LA', 'TX', 'OK'],
  CA: ['OR', 'NV', 'AZ'],
  CO: ['WY', 'NE', 'KS', 'OK', 'NM', 'UT'],
  CT: ['NY', 'MA', 'RI'],
  DE: ['MD', 'PA', 'NJ'],
  FL: ['GA', 'AL'],
  GA: ['FL', 'AL', 'TN', 'NC', 'SC'],
  HI: [],
  ID: ['WA', 'OR', 'NV', 'UT', 'WY', 'MT'],
  IL: ['WI', 'IA', 'MO', 'KY', 'IN'],
  IN: ['MI', 'IL', 'KY', 'OH'],
  IA: ['MN', 'SD', 'NE', 'MO', 'IL', 'WI'],
  KS: ['NE', 'MO', 'OK', 'CO'],
  KY: ['IL', 'IN', 'OH', 'WV', 'VA', 'TN', 'MO'],
  LA: ['TX', 'AR', 'MS'],
  ME: ['NH'],
  MD: ['VA', 'WV', 'PA', 'DE', 'DC'],
  MA: ['RI', 'CT', 'NY', 'NH', 'VT'],
  MI: ['OH', 'IN', 'WI'],
  MN: ['ND', 'SD', 'IA', 'WI'],
  MS: ['LA', 'AR', 'TN', 'AL'],
  MO: ['IA', 'IL', 'KY', 'TN', 'AR', 'OK', 'KS', 'NE'],
  MT: ['ID', 'WY', 'SD', 'ND'],
  NE: ['SD', 'IA', 'MO', 'KS', 'CO', 'WY'],
  NV: ['CA', 'OR', 'ID', 'UT', 'AZ'],
  NH: ['ME', 'MA', 'VT'],
  NJ: ['NY', 'PA', 'DE'],
  NM: ['AZ', 'UT', 'CO', 'OK', 'TX'],
  NY: ['NJ', 'PA', 'CT', 'MA', 'VT'],
  NC: ['VA', 'TN', 'GA', 'SC'],
  ND: ['MT', 'SD', 'MN'],
  OH: ['PA', 'WV', 'KY', 'IN', 'MI'],
  OK: ['KS', 'MO', 'AR', 'TX', 'NM', 'CO'],
  OR: ['WA', 'ID', 'NV', 'CA'],
  PA: ['NY', 'NJ', 'DE', 'MD', 'WV', 'OH'],
  RI: ['CT', 'MA'],
  SC: ['NC', 'GA'],
  SD: ['ND', 'MN', 'IA', 'NE', 'WY', 'MT'],
  TN: ['KY', 'VA', 'NC', 'GA', 'AL', 'MS', 'AR', 'MO'],
  TX: ['NM', 'OK', 'AR', 'LA'],
  UT: ['ID', 'WY', 'CO', 'NM', 'AZ', 'NV'],
  VT: ['NY', 'MA', 'NH'],
  VA: ['MD', 'DC', 'NC', 'TN', 'KY', 'WV'],
  WA: ['ID', 'OR'],
  WV: ['OH', 'PA', 'MD', 'VA', 'KY'],
  WI: ['MI', 'MN', 'IA', 'IL'],
  WY: ['MT', 'SD', 'NE', 'CO', 'UT', 'ID']
};

const FREIGHT_COORDINATES = {
  // Georgia
  'rincon, ga': { lat: 32.2960, lng: -81.2354 },
  'savannah, ga': { lat: 32.0809, lng: -81.0912 },
  'pooler, ga': { lat: 32.1158, lng: -81.2493 },
  'midway, ga': { lat: 31.8055, lng: -81.4304 },
  'riceboro, ga': { lat: 31.7347, lng: -81.4390 },
  'augusta, ga': { lat: 33.4735, lng: -82.0105 },
  'macon, ga': { lat: 32.8407, lng: -83.6324 },
  'atlanta, ga': { lat: 33.7490, lng: -84.3880 },
  'mcintyre, ga': { lat: 32.8446, lng: -83.1979 },
  'sandersville, ga': { lat: 32.9818, lng: -82.8101 },
  'ellabell, ga': { lat: 32.1224, lng: -81.4884 },
  'douglas, ga': { lat: 31.5088, lng: -82.8499 },
  'tifton, ga': { lat: 31.4505, lng: -83.5085 },
  'lagrange, ga': { lat: 33.0393, lng: -85.0313 },
  // South Carolina
  'charleston, sc': { lat: 32.7765, lng: -79.9311 },
  'mt holly, sc': { lat: 33.0560, lng: -80.0381 },
  'summerville, sc': { lat: 33.0185, lng: -80.1757 },
  'goose creek, sc': { lat: 32.9810, lng: -80.0326 },
  'sumter, sc': { lat: 33.9204, lng: -80.3415 },
  'columbia, sc': { lat: 34.0007, lng: -81.0348 },
  'orangeburg, sc': { lat: 33.4918, lng: -80.8557 },
  'barnwell, sc': { lat: 33.2435, lng: -81.3637 },
  'greenville, sc': { lat: 34.8526, lng: -82.3940 },
  'spartanburg, sc': { lat: 34.9496, lng: -81.9320 },
  'myrtle beach, sc': { lat: 33.6891, lng: -78.8867 },
  // Florida
  'jacksonville, fl': { lat: 30.3322, lng: -81.6557 },
  'orlando, fl': { lat: 28.5383, lng: -81.3792 },
  'tampa, fl': { lat: 27.9506, lng: -82.4572 },
  'miami, fl': { lat: 25.7617, lng: -80.1918 },
  'lakeland, fl': { lat: 28.0395, lng: -81.9498 },
  'ft pierce, fl': { lat: 27.4467, lng: -80.3256 },
  'pompano beach, fl': { lat: 26.2379, lng: -80.1248 },
  // North Carolina
  'charlotte, nc': { lat: 35.2271, lng: -80.8431 },
  'raleigh, nc': { lat: 35.7796, lng: -78.6382 },
  'durham, nc': { lat: 35.9940, lng: -78.8986 },
  'greensboro, nc': { lat: 36.0726, lng: -79.7920 },
  // Tennessee
  'nashville, tn': { lat: 36.1627, lng: -86.7816 },
  'memphis, tn': { lat: 35.1495, lng: -90.0490 },
  'knoxville, tn': { lat: 35.9606, lng: -83.9207 },
  'chattanooga, tn': { lat: 35.0456, lng: -85.3097 },
  'cookeville, tn': { lat: 36.1628, lng: -85.5016 },
  // Alabama
  'birmingham, al': { lat: 33.5186, lng: -86.8104 },
  'mobile, al': { lat: 30.6954, lng: -88.0399 },
  'montgomery, al': { lat: 32.3792, lng: -86.3077 },
  'huntsville, al': { lat: 34.7304, lng: -86.5861 },
  // Ohio
  'columbus, oh': { lat: 39.9612, lng: -82.9988 },
  'cleveland, oh': { lat: 41.4993, lng: -81.6944 },
  'cincinnati, oh': { lat: 39.1031, lng: -84.5120 },
  'toledo, oh': { lat: 41.6528, lng: -83.5379 },
  'akron, oh': { lat: 41.0814, lng: -81.5190 },
  'fostoria, oh': { lat: 41.1578, lng: -83.4169 },
  'fairfield, oh': { lat: 39.3448, lng: -84.5613 },
  'uhrichsville, oh': { lat: 40.3956, lng: -81.3484 },
  'w jefferson, oh': { lat: 39.9609, lng: -83.2757 },
  // Pennsylvania
  'philadelphia, pa': { lat: 39.9526, lng: -75.1652 },
  'pittsburgh, pa': { lat: 40.4406, lng: -79.9959 },
  'allentown, pa': { lat: 40.6023, lng: -75.4714 },
  'harrisburg, pa': { lat: 40.2732, lng: -76.8867 },
  'reading, pa': { lat: 40.3356, lng: -75.9269 },
  'scranton, pa': { lat: 41.4090, lng: -75.6624 },
  'bethlehem, pa': { lat: 40.6259, lng: -75.3705 },
  // Texas
  'dallas, tx': { lat: 32.7767, lng: -96.7970 },
  'fort worth, tx': { lat: 32.7555, lng: -97.3308 },
  'houston, tx': { lat: 29.7604, lng: -95.3698 },
  'san antonio, tx': { lat: 29.4241, lng: -98.4936 },
  'austin, tx': { lat: 30.2672, lng: -97.7431 },
  'el paso, tx': { lat: 31.7619, lng: -106.4850 },
  'laredo, tx': { lat: 27.5036, lng: -99.5076 },
  'longview, tx': { lat: 32.5007, lng: -94.7405 },
  'mesquite, tx': { lat: 32.7668, lng: -96.5992 },
  'coppell, tx': { lat: 32.9546, lng: -97.0150 },
  'georgetown, tx': { lat: 30.6333, lng: -97.6778 },
  'sugar land, tx': { lat: 29.6197, lng: -95.6349 },
  // Illinois & Midwest
  'chicago, il': { lat: 41.8781, lng: -87.6298 },
  'joliet, il': { lat: 41.5250, lng: -88.0817 },
  'indianapolis, in': { lat: 39.7684, lng: -86.1581 },
  'detroit, mi': { lat: 42.3314, lng: -83.0458 },
  'grandview, mo': { lat: 38.8858, lng: -94.5330 },
  'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
  'st. louis, mo': { lat: 38.6270, lng: -90.1994 },
  'stevens point, wi': { lat: 44.5236, lng: -89.5746 },
  // Oklahoma
  'oklahoma city, ok': { lat: 35.4676, lng: -97.5164 },
  'tulsa, ok': { lat: 36.1540, lng: -95.9928 },
  'broken arrow, ok': { lat: 36.0609, lng: -95.7975 },
  // Colorado & West
  'denver, co': { lat: 39.7392, lng: -104.9903 },
  'cheyenne, wy': { lat: 41.1400, lng: -104.8202 },
  'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
  'taunton, ma': { lat: 41.9001, lng: -71.0898 }
};

function getFreightDeadhead(origPlace, destPlace) {
  if (!origPlace || !destPlace) return 15;
  const o = typeof origPlace === 'string' ? parsePlace(origPlace) : origPlace;
  const d = typeof destPlace === 'string' ? parsePlace(destPlace) : destPlace;
  if (!o || !d) return 20;

  if (o.city && d.city && o.city.toLowerCase() === d.city.toLowerCase()) {
    return 0;
  }

  const k1 = (o.city && o.state) ? `${o.city.toLowerCase()}, ${o.state.toLowerCase()}` : null;
  const k2 = (d.city && d.state) ? `${d.city.toLowerCase()}, ${d.state.toLowerCase()}` : null;

  if (k1 && k2 && FREIGHT_COORDINATES[k1] && FREIGHT_COORDINATES[k2]) {
    const dist = roadMiles(FREIGHT_COORDINATES[k1], FREIGHT_COORDINATES[k2]);
    if (dist != null) return dist;
  }

  const p1 = (k1 && FREIGHT_COORDINATES[k1]) || (o.state && stateCenter(o.state));
  const p2 = (k2 && FREIGHT_COORDINATES[k2]) || (d.state && stateCenter(d.state));

  if (p1 && p2) {
    const dist = roadMiles(p1, p2);
    if (dist != null) {
      if (o.state && d.state && o.state === d.state) {
        return Math.min(Math.max(dist, 10), 95);
      }
      return dist;
    }
  }

  if (o.state && d.state && o.state === d.state) return 30;
  return 85;
}

module.exports = {
  STATE_CENTERS,
  STATE_NAMES,
  REGIONS,
  AMBIGUOUS_CODES,
  KNOWN_CITIES,
  ADJACENT_STATES,
  FREIGHT_COORDINATES,
  getFreightDeadhead,
  milesBetween,
  roadMiles,
  stateOf,
  stateCenter,
  parsePlace,
  placeLabel,
  geocode,
  ensureGeoSchema
};
