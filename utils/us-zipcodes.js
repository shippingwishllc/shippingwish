/**
 * Shipping Wish LLC — Freight Zip Code Database & Mapper
 * Resolves US 5-digit Zip codes to City, State & Freight Metropolitan Areas.
 * Supports bidirectional lookup: Zip -> City/State, and City/State -> Zip.
 */

// Major US Freight Hub Cities and their canonical 5-digit Postal Codes
const EXACT_ZIP_FREIGHT_MAP = {
  // Texas
  '75201': { city: 'Dallas', state: 'TX', zip: '75201' },
  '75001': { city: 'Dallas', state: 'TX', zip: '75001' },
  '75247': { city: 'Dallas', state: 'TX', zip: '75247' },
  '76102': { city: 'Fort Worth', state: 'TX', zip: '76102' },
  '77002': { city: 'Houston', state: 'TX', zip: '77002' },
  '77015': { city: 'Houston', state: 'TX', zip: '77015' },
  '78205': { city: 'San Antonio', state: 'TX', zip: '78205' },
  '78701': { city: 'Austin', state: 'TX', zip: '78701' },
  '78040': { city: 'Laredo', state: 'TX', zip: '78040' },
  '79901': { city: 'El Paso', state: 'TX', zip: '79901' },
  '79101': { city: 'Amarillo', state: 'TX', zip: '79101' },
  '76010': { city: 'Arlington', state: 'TX', zip: '76010' },

  // Wyoming
  '82001': { city: 'Cheyenne', state: 'WY', zip: '82001' },
  '82601': { city: 'Casper', state: 'WY', zip: '82601' },
  '82070': { city: 'Laramie', state: 'WY', zip: '82070' },
  '82716': { city: 'Gillette', state: 'WY', zip: '82716' },
  '82901': { city: 'Rock Springs', state: 'WY', zip: '82901' },

  // Illinois
  '60601': { city: 'Chicago', state: 'IL', zip: '60601' },
  '60638': { city: 'Chicago', state: 'IL', zip: '60638' },
  '60431': { city: 'Joliet', state: 'IL', zip: '60431' },
  '61101': { city: 'Rockford', state: 'IL', zip: '61101' },
  '61602': { city: 'Peoria', state: 'IL', zip: '61602' },
  '62701': { city: 'Springfield', state: 'IL', zip: '62701' },

  // Georgia
  '30301': { city: 'Atlanta', state: 'GA', zip: '30301' },
  '30336': { city: 'Atlanta', state: 'GA', zip: '30336' },
  '31401': { city: 'Savannah', state: 'GA', zip: '31401' },
  '30901': { city: 'Augusta', state: 'GA', zip: '30901' },
  '31201': { city: 'Macon', state: 'GA', zip: '31201' },
  '30060': { city: 'Marietta', state: 'GA', zip: '30060' },

  // California
  '90001': { city: 'Los Angeles', state: 'CA', zip: '90001' },
  '90058': { city: 'Los Angeles', state: 'CA', zip: '90058' },
  '91761': { city: 'Ontario', state: 'CA', zip: '91761' },
  '93301': { city: 'Bakersfield', state: 'CA', zip: '93301' },
  '93701': { city: 'Fresno', state: 'CA', zip: '93701' },
  '95202': { city: 'Stockton', state: 'CA', zip: '95202' },
  '95814': { city: 'Sacramento', state: 'CA', zip: '95814' },
  '92101': { city: 'San Diego', state: 'CA', zip: '92101' },
  '94102': { city: 'San Francisco', state: 'CA', zip: '94102' },

  // Colorado
  '80202': { city: 'Denver', state: 'CO', zip: '80202' },
  '80012': { city: 'Aurora', state: 'CO', zip: '80012' },
  '80903': { city: 'Colorado Springs', state: 'CO', zip: '80903' },
  '81003': { city: 'Pueblo', state: 'CO', zip: '81003' },
  '81501': { city: 'Grand Junction', state: 'CO', zip: '81501' },

  // Florida
  '32202': { city: 'Jacksonville', state: 'FL', zip: '32202' },
  '32801': { city: 'Orlando', state: 'FL', zip: '32801' },
  '33602': { city: 'Tampa', state: 'FL', zip: '33602' },
  '33101': { city: 'Miami', state: 'FL', zip: '33101' },
  '33801': { city: 'Lakeland', state: 'FL', zip: '33801' },

  // Pennsylvania
  '19104': { city: 'Philadelphia', state: 'PA', zip: '19104' },
  '15222': { city: 'Pittsburgh', state: 'PA', zip: '15222' },
  '18101': { city: 'Allentown', state: 'PA', zip: '18101' },
  '17101': { city: 'Harrisburg', state: 'PA', zip: '17101' },
  '17050': { city: 'Mechanicsburg', state: 'PA', zip: '17050' },

  // Ohio
  '43215': { city: 'Columbus', state: 'OH', zip: '43215' },
  '44114': { city: 'Cleveland', state: 'OH', zip: '44114' },
  '45202': { city: 'Cincinnati', state: 'OH', zip: '45202' },
  '43604': { city: 'Toledo', state: 'OH', zip: '43604' },
  '44308': { city: 'Akron', state: 'OH', zip: '44308' },

  // Indiana
  '46204': { city: 'Indianapolis', state: 'IN', zip: '46204' },
  '46241': { city: 'Indianapolis', state: 'IN', zip: '46241' },
  '46802': { city: 'Fort Wayne', state: 'IN', zip: '46802' },
  '46601': { city: 'South Bend', state: 'IN', zip: '46601' },
  '47708': { city: 'Evansville', state: 'IN', zip: '47708' },
  '46402': { city: 'Gary', state: 'IN', zip: '46402' },

  // Michigan
  '48226': { city: 'Detroit', state: 'MI', zip: '48226' },
  '49503': { city: 'Grand Rapids', state: 'MI', zip: '49503' },
  '48089': { city: 'Warren', state: 'MI', zip: '48089' },
  '48502': { city: 'Flint', state: 'MI', zip: '48502' },

  // Tennessee
  '37201': { city: 'Nashville', state: 'TN', zip: '37201' },
  '38103': { city: 'Memphis', state: 'TN', zip: '38103' },
  '37902': { city: 'Knoxville', state: 'TN', zip: '37902' },
  '37402': { city: 'Chattanooga', state: 'TN', zip: '37402' },

  // North Carolina
  '28202': { city: 'Charlotte', state: 'NC', zip: '28202' },
  '27601': { city: 'Raleigh', state: 'NC', zip: '27601' },
  '27401': { city: 'Greensboro', state: 'NC', zip: '27401' },
  '27101': { city: 'Winston-Salem', state: 'NC', zip: '27101' },

  // South Carolina
  '29401': { city: 'Charleston', state: 'SC', zip: '29401' },
  '29201': { city: 'Columbia', state: 'SC', zip: '29201' },
  '29601': { city: 'Greenville', state: 'SC', zip: '29601' },

  // Missouri
  '64106': { city: 'Kansas City', state: 'MO', zip: '64106' },
  '63101': { city: 'St. Louis', state: 'MO', zip: '63101' },
  '65806': { city: 'Springfield', state: 'MO', zip: '65806' },
  '64801': { city: 'Joplin', state: 'MO', zip: '64801' },

  // New Jersey
  '07102': { city: 'Newark', state: 'NJ', zip: '07102' },
  '07302': { city: 'Jersey City', state: 'NJ', zip: '07302' },
  '08817': { city: 'Edison', state: 'NJ', zip: '08817' },
  '08608': { city: 'Trenton', state: 'NJ', zip: '08608' },

  // New York
  '10001': { city: 'New York', state: 'NY', zip: '10001' },
  '14202': { city: 'Buffalo', state: 'NY', zip: '14202' },
  '14604': { city: 'Rochester', state: 'NY', zip: '14604' },
  '12207': { city: 'Albany', state: 'NY', zip: '12207' },
  '13202': { city: 'Syracuse', state: 'NY', zip: '13202' },

  // Arizona
  '85001': { city: 'Phoenix', state: 'AZ', zip: '85001' },
  '85701': { city: 'Tucson', state: 'AZ', zip: '85701' },
  '85364': { city: 'Yuma', state: 'AZ', zip: '85364' },
  '86001': { city: 'Flagstaff', state: 'AZ', zip: '86001' },

  // Utah
  '84101': { city: 'Salt Lake City', state: 'UT', zip: '84101' },
  '84601': { city: 'Provo', state: 'UT', zip: '84601' },
  '84401': { city: 'Ogden', state: 'UT', zip: '84401' },

  // Washington
  '98101': { city: 'Seattle', state: 'WA', zip: '98101' },
  '99201': { city: 'Spokane', state: 'WA', zip: '99201' },
  '98402': { city: 'Tacoma', state: 'WA', zip: '98402' },

  // Oregon
  '97201': { city: 'Portland', state: 'OR', zip: '97201' },
  '97401': { city: 'Eugene', state: 'OR', zip: '97401' },
  '97301': { city: 'Salem', state: 'OR', zip: '97301' },

  // Wisconsin
  '53202': { city: 'Milwaukee', state: 'WI', zip: '53202' },
  '53703': { city: 'Madison', state: 'WI', zip: '53703' },
  '54301': { city: 'Green Bay', state: 'WI', zip: '54301' },

  // Minnesota
  '55401': { city: 'Minneapolis', state: 'MN', zip: '55401' },
  '55101': { city: 'Saint Paul', state: 'MN', zip: '55101' },

  // Iowa
  '50309': { city: 'Des Moines', state: 'IA', zip: '50309' },
  '52401': { city: 'Cedar Rapids', state: 'IA', zip: '52401' },
  '52801': { city: 'Davenport', state: 'IA', zip: '52801' },

  // Nebraska
  '68102': { city: 'Omaha', state: 'NE', zip: '68102' },
  '68508': { city: 'Lincoln', state: 'NE', zip: '68508' },

  // Kansas
  '66101': { city: 'Kansas City', state: 'KS', zip: '66101' },
  '67202': { city: 'Wichita', state: 'KS', zip: '67202' },

  // Oklahoma
  '73102': { city: 'Oklahoma City', state: 'OK', zip: '73102' },
  '74103': { city: 'Tulsa', state: 'OK', zip: '74103' },

  // Arkansas
  '72201': { city: 'Little Rock', state: 'AR', zip: '72201' },
  '72901': { city: 'Fort Smith', state: 'AR', zip: '72901' },

  // Louisiana
  '70112': { city: 'New Orleans', state: 'LA', zip: '70112' },
  '70801': { city: 'Baton Rouge', state: 'LA', zip: '70801' },
  '71101': { city: 'Shreveport', state: 'LA', zip: '71101' },

  // Alabama
  '35203': { city: 'Birmingham', state: 'AL', zip: '35203' },
  '36602': { city: 'Mobile', state: 'AL', zip: '36602' },
  '36104': { city: 'Montgomery', state: 'AL', zip: '36104' },
  '35801': { city: 'Huntsville', state: 'AL', zip: '35801' },

  // Mississippi
  '39201': { city: 'Jackson', state: 'MS', zip: '39201' },
  '39501': { city: 'Gulfport', state: 'MS', zip: '39501' },

  // Kentucky
  '40202': { city: 'Louisville', state: 'KY', zip: '40202' },
  '40507': { city: 'Lexington', state: 'KY', zip: '40507' },

  // Nevada
  '89101': { city: 'Las Vegas', state: 'NV', zip: '89101' },
  '89501': { city: 'Reno', state: 'NV', zip: '89501' },

  // New Mexico
  '87102': { city: 'Albuquerque', state: 'NM', zip: '87102' },
  '88001': { city: 'Las Cruces', state: 'NM', zip: '88001' },

  // Idaho
  '83702': { city: 'Boise', state: 'ID', zip: '83702' },
  '83401': { city: 'Idaho Falls', state: 'ID', zip: '83401' },

  // Montana
  '59101': { city: 'Billings', state: 'MT', zip: '59101' },
  '59801': { city: 'Missoula', state: 'MT', zip: '59801' },

  // North Dakota
  '58102': { city: 'Fargo', state: 'ND', zip: '58102' },
  '58501': { city: 'Bismarck', state: 'ND', zip: '58501' },

  // South Dakota
  '57104': { city: 'Sioux Falls', state: 'SD', zip: '57104' },
  '57701': { city: 'Rapid City', state: 'SD', zip: '57701' },

  // Virginia
  '23219': { city: 'Richmond', state: 'VA', zip: '23219' },
  '23510': { city: 'Norfolk', state: 'VA', zip: '23510' },

  // Maryland & DC
  '21201': { city: 'Baltimore', state: 'MD', zip: '21201' },
  '20001': { city: 'Washington', state: 'DC', zip: '20001' },

  // Massachusetts & New England
  '02108': { city: 'Boston', state: 'MA', zip: '02108' },
  '06103': { city: 'Hartford', state: 'CT', zip: '06103' },
  '02903': { city: 'Providence', state: 'RI', zip: '02903' },
  '04101': { city: 'Portland', state: 'ME', zip: '04101' },
  '03101': { city: 'Manchester', state: 'NH', zip: '03101' },
  '05401': { city: 'Burlington', state: 'VT', zip: '05401' },
  '19801': { city: 'Wilmington', state: 'DE', zip: '19801' },
  '25301': { city: 'Charleston', state: 'WV', zip: '25301' }
};

// 3-digit ZIP Prefix range table covering entire United States (00501 - 99950)
const ZIP3_PREFIX_RANGES = [
  { min: 10, max: 27, state: 'MA', hub: 'Boston' },
  { min: 28, max: 29, state: 'RI', hub: 'Providence' },
  { min: 30, max: 38, state: 'NH', hub: 'Manchester' },
  { min: 39, max: 49, state: 'ME', hub: 'Portland' },
  { min: 50, max: 59, state: 'VT', hub: 'Burlington' },
  { min: 60, max: 69, state: 'CT', hub: 'Hartford' },
  { min: 70, max: 89, state: 'NJ', hub: 'Newark' },
  { min: 100, max: 149, state: 'NY', hub: 'New York' },
  { min: 150, max: 196, state: 'PA', hub: 'Philadelphia' },
  { min: 197, max: 199, state: 'DE', hub: 'Wilmington' },
  { min: 200, max: 205, state: 'DC', hub: 'Washington' },
  { min: 206, max: 219, state: 'MD', hub: 'Baltimore' },
  { min: 220, max: 246, state: 'VA', hub: 'Richmond' },
  { min: 247, max: 268, state: 'WV', hub: 'Charleston' },
  { min: 270, max: 289, state: 'NC', hub: 'Charlotte' },
  { min: 290, max: 299, state: 'SC', hub: 'Charleston' },
  { min: 300, max: 319, state: 'GA', hub: 'Atlanta' },
  { min: 320, max: 349, state: 'FL', hub: 'Jacksonville' },
  { min: 350, max: 369, state: 'AL', hub: 'Birmingham' },
  { min: 370, max: 385, state: 'TN', hub: 'Nashville' },
  { min: 386, max: 397, state: 'MS', hub: 'Jackson' },
  { min: 398, max: 399, state: 'GA', hub: 'Atlanta' },
  { min: 400, max: 427, state: 'KY', hub: 'Louisville' },
  { min: 430, max: 459, state: 'OH', hub: 'Columbus' },
  { min: 460, max: 479, state: 'IN', hub: 'Indianapolis' },
  { min: 480, max: 499, state: 'MI', hub: 'Detroit' },
  { min: 500, max: 528, state: 'IA', hub: 'Des Moines' },
  { min: 530, max: 549, state: 'WI', hub: 'Milwaukee' },
  { min: 550, max: 567, state: 'MN', hub: 'Minneapolis' },
  { min: 570, max: 577, state: 'SD', hub: 'Sioux Falls' },
  { min: 580, max: 588, state: 'ND', hub: 'Fargo' },
  { min: 590, max: 599, state: 'MT', hub: 'Billings' },
  { min: 600, max: 629, state: 'IL', hub: 'Chicago' },
  { min: 630, max: 658, state: 'MO', hub: 'St. Louis' },
  { min: 660, max: 679, state: 'KS', hub: 'Kansas City' },
  { min: 680, max: 693, state: 'NE', hub: 'Omaha' },
  { min: 700, max: 714, state: 'LA', hub: 'New Orleans' },
  { min: 716, max: 729, state: 'AR', hub: 'Little Rock' },
  { min: 730, max: 749, state: 'OK', hub: 'Oklahoma City' },
  { min: 750, max: 799, state: 'TX', hub: 'Dallas' },
  { min: 800, max: 816, state: 'CO', hub: 'Denver' },
  { min: 820, max: 831, state: 'WY', hub: 'Cheyenne' },
  { min: 832, max: 838, state: 'ID', hub: 'Boise' },
  { min: 840, max: 847, state: 'UT', hub: 'Salt Lake City' },
  { min: 850, max: 865, state: 'AZ', hub: 'Phoenix' },
  { min: 870, max: 884, state: 'NM', hub: 'Albuquerque' },
  { min: 889, max: 898, state: 'NV', hub: 'Las Vegas' },
  { min: 900, max: 961, state: 'CA', hub: 'Los Angeles' },
  { min: 967, max: 968, state: 'HI', hub: 'Honolulu' },
  { min: 970, max: 979, state: 'OR', hub: 'Portland' },
  { min: 980, max: 994, state: 'WA', hub: 'Seattle' },
  { min: 995, max: 999, state: 'AK', hub: 'Anchorage' }
];

/**
 * Look up a 5-digit US ZIP Code
 * @param {string|number} rawZip 
 * @returns {object|null}
 */
function lookupZip(rawZip) {
  if (!rawZip) return null;
  const digits = String(rawZip).replace(/\D/g, '');
  if (digits.length < 5) return null;
  const zip5 = digits.slice(0, 5);

  // 1. Direct match in freight hubs
  if (EXACT_ZIP_FREIGHT_MAP[zip5]) {
    const item = EXACT_ZIP_FREIGHT_MAP[zip5];
    return {
      found: true,
      zip: zip5,
      city: item.city,
      state: item.state,
      formatted: `${item.city}, ${item.state} ${zip5}`,
      short: `${item.city}, ${item.state}`
    };
  }

  // 2. 3-digit prefix lookup
  const p3 = parseInt(zip5.slice(0, 3), 10);
  const matched = ZIP3_PREFIX_RANGES.find(r => p3 >= r.min && p3 <= r.max);
  if (matched) {
    return {
      found: true,
      zip: zip5,
      city: matched.hub,
      state: matched.state,
      formatted: `${matched.hub}, ${matched.state} ${zip5}`,
      short: `${matched.hub}, ${matched.state}`
    };
  }

  return null;
}

/**
 * Reverse lookup: get primary postal code for a City and State
 */
function getZipForCityState(city, state) {
  if (!state) return '75201';
  const stUpper = String(state).trim().toUpperCase().slice(0, 2);
  const cityLower = String(city || '').trim().toLowerCase();

  // Search exact map first
  for (const [z, info] of Object.entries(EXACT_ZIP_FREIGHT_MAP)) {
    if (info.state === stUpper && info.city.toLowerCase() === cityLower) {
      return z;
    }
  }

  // Fallback to any zip in that state
  for (const [z, info] of Object.entries(EXACT_ZIP_FREIGHT_MAP)) {
    if (info.state === stUpper) return z;
  }

  // Fallback by prefix
  const range = ZIP3_PREFIX_RANGES.find(r => r.state === stUpper);
  if (range) {
    return String(range.min).padStart(3, '0') + '01';
  }

  return '75201';
}

/**
 * Parse any origin string (can be "75201", "75201, Dallas, TX", "Dallas, TX", etc.)
 */
function parseOriginWithZip(originStr) {
  const str = String(originStr || 'Dallas, TX').trim();
  const zipMatch = str.match(/\b\d{5}\b/);

  if (zipMatch) {
    const zipInfo = lookupZip(zipMatch[0]);
    if (zipInfo) {
      return {
        city: zipInfo.city,
        state: zipInfo.state,
        zip: zipInfo.zip,
        formatted: zipInfo.formatted
      };
    }
  }

  // Otherwise parse as City, State
  const parts = str.split(',').map(s => s.trim());
  let city = parts[0] || 'Dallas';
  let state = (parts[1] || '').toUpperCase().slice(0, 2);

  if (!state || state.length < 2) {
    const upper = str.toUpperCase();
    for (const r of ZIP3_PREFIX_RANGES) {
      if (upper.includes(r.state)) { state = r.state; break; }
    }
  }
  if (!state) state = 'TX';
  const zip = getZipForCityState(city, state);

  return {
    city,
    state,
    zip,
    formatted: `${city}, ${state} ${zip}`
  };
}

/**
 * Extract destination states, cities, and zip codes from a query string
 */
function parseDestinationsWithZip(destStr) {
  if (!destStr) return { states: ['WY', 'CO', 'TX'], zips: [], specificDest: null };
  const str = String(destStr).trim();
  const upper = str.toUpperCase();

  const foundZips = [];
  const zipMatches = str.match(/\b\d{5}\b/g);
  if (zipMatches) {
    for (const zm of zipMatches) {
      const zInfo = lookupZip(zm);
      if (zInfo) foundZips.push(zInfo);
    }
  }

  const states = [];
  // Add states from found zips
  for (const z of foundZips) {
    if (!states.includes(z.state)) states.push(z.state);
  }

  // Add states from 2-letter tokens
  const tokens = upper.split(/[\s,+/]+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length === 2 && ZIP3_PREFIX_RANGES.some(r => r.state === t)) {
      if (!states.includes(t)) states.push(t);
    }
  }

  // Regional keywords
  if (upper.includes('MIDWEST')) ['IL', 'IN', 'OH', 'MI', 'WI', 'IA', 'MO'].forEach(s => { if (!states.includes(s)) states.push(s); });
  if (upper.includes('SOUTHEAST')) ['GA', 'FL', 'NC', 'SC', 'TN', 'AL', 'MS'].forEach(s => { if (!states.includes(s)) states.push(s); });
  if (upper.includes('WEST')) ['CA', 'OR', 'WA', 'NV', 'AZ', 'UT', 'ID'].forEach(s => { if (!states.includes(s)) states.push(s); });
  if (upper.includes('MOUNTAIN')) ['CO', 'WY', 'MT', 'UT', 'NM'].forEach(s => { if (!states.includes(s)) states.push(s); });
  if (upper.includes('SOUTHWEST')) ['TX', 'OK', 'AR', 'LA', 'NM'].forEach(s => { if (!states.includes(s)) states.push(s); });
  if (upper.includes('ALL 48') || upper.includes('ANYWHERE')) ['TX', 'WY', 'CO', 'IL', 'GA', 'PA', 'OH', 'CA', 'FL', 'TN', 'MO'].forEach(s => { if (!states.includes(s)) states.push(s); });

  if (!states.length) {
    states.push('WY', 'CO', 'TX');
  }

  return {
    states,
    zips: foundZips,
    specificDest: foundZips.length ? foundZips[0] : null
  };
}

module.exports = {
  lookupZip,
  getZipForCityState,
  parseOriginWithZip,
  parseDestinationsWithZip,
  EXACT_ZIP_FREIGHT_MAP,
  ZIP3_PREFIX_RANGES
};
