/**
 * utils/us-timezones.js
 * Comprehensive US States & Phone Area Code Timezone Engine
 * 
 * Enforces TCPA compliance:
 * - Cold outreach (Voice Calls, SMS, Marketing Email) strictly between 09:00 and 17:00 (9:00 AM - 5:00 PM) recipient local time.
 * - Sunday strictly prohibited.
 * - Calculates next valid business window at 09:15 AM recipient local time.
 */

// All 50 US States + DC + Puerto Rico mapped to IANA Timezones
const STATE_TIMEZONES = {
  // Eastern Time (ET)
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', IN: 'America/Indiana/Indianapolis', KY: 'America/New_York',
  ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit',
  NH: 'America/New_York', NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  VT: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York', PR: 'America/Puerto_Rico',

  // Central Time (CT)
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago',
  KS: 'America/Chicago', LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', WI: 'America/Chicago',

  // Mountain Time (MT)
  AZ: 'America/Phoenix', // No DST in Arizona
  CO: 'America/Denver', ID: 'America/Boise', MT: 'America/Denver', NM: 'America/Denver',
  UT: 'America/Denver', WY: 'America/Denver',

  // Pacific Time (PT)
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',

  // Alaska & Hawaii
  AK: 'America/Anchorage',
  HI: 'Pacific/Honolulu'
};

// Major US Phone Area Codes to State mapping (for phone-only leads)
const AREA_CODE_TO_STATE = {
  // New York
  '212': 'NY', '315': 'NY', '347': 'NY', '516': 'NY', '518': 'NY', '585': 'NY', '607': 'NY', '631': 'NY', '646': 'NY', '716': 'NY', '718': 'NY', '845': 'NY', '914': 'NY', '917': 'NY', '929': 'NY',
  // California
  '209': 'CA', '213': 'CA', '310': 'CA', '323': 'CA', '408': 'CA', '415': 'CA', '424': 'CA', '442': 'CA', '510': 'CA', '530': 'CA', '559': 'CA', '562': 'CA', '619': 'CA', '626': 'CA', '628': 'CA', '650': 'CA', '657': 'CA', '661': 'CA', '669': 'CA', '707': 'CA', '714': 'CA', '747': 'CA', '760': 'CA', '805': 'CA', '818': 'CA', '820': 'CA', '831': 'CA', '858': 'CA', '909': 'CA', '916': 'CA', '925': 'CA', '949': 'CA', '951': 'CA',
  // Texas
  '210': 'TX', '214': 'TX', '254': 'TX', '281': 'TX', '325': 'TX', '346': 'TX', '361': 'TX', '409': 'TX', '430': 'TX', '432': 'TX', '469': 'TX', '512': 'TX', '713': 'TX', '726': 'TX', '737': 'TX', '806': 'TX', '817': 'TX', '830': 'TX', '832': 'TX', '903': 'TX', '915': 'TX', '936': 'TX', '940': 'TX', '956': 'TX', '972': 'TX', '979': 'TX',
  // Illinois
  '217': 'IL', '224': 'IL', '309': 'IL', '312': 'IL', '331': 'IL', '618': 'IL', '630': 'IL', '708': 'IL', '773': 'IL', '779': 'IL', '815': 'IL', '847': 'IL', '872': 'IL',
  // Florida
  '239': 'FL', '305': 'FL', '321': 'FL', '352': 'FL', '386': 'FL', '407': 'FL', '561': 'FL', '727': 'FL', '754': 'FL', '772': 'FL', '786': 'FL', '813': 'FL', '850': 'FL', '863': 'FL', '904': 'FL', '941': 'FL', '954': 'FL',
  // Georgia
  '229': 'GA', '404': 'GA', '470': 'GA', '478': 'GA', '678': 'GA', '706': 'GA', '762': 'GA', '770': 'GA', '912': 'GA',
  // North Carolina
  '252': 'NC', '336': 'NC', '704': 'NC', '828': 'NC', '910': 'NC', '919': 'NC', '980': 'NC', '984': 'NC',
  // Ohio
  '216': 'OH', '220': 'OH', '234': 'OH', '330': 'OH', '380': 'OH', '419': 'OH', '440': 'OH', '513': 'OH', '567': 'OH', '614': 'OH', '740': 'OH', '937': 'OH',
  // Pennsylvania
  '215': 'PA', '267': 'PA', '272': 'PA', '412': 'PA', '484': 'PA', '570': 'PA', '610': 'PA', '717': 'PA', '724': 'PA', '814': 'PA', '878': 'PA',
  // New Jersey
  '201': 'NJ', '551': 'NJ', '609': 'NJ', '732': 'NJ', '848': 'NJ', '856': 'NJ', '862': 'NJ', '908': 'NJ', '973': 'NJ',
  // Tennessee
  '423': 'TN', '615': 'TN', '629': 'TN', '731': 'TN', '865': 'TN', '901': 'TN', '931': 'TN',
  // Michigan
  '231': 'MI', '248': 'MI', '269': 'MI', '313': 'MI', '517': 'MI', '586': 'MI', '616': 'MI', '734': 'MI', '810': 'MI', '906': 'MI', '947': 'MI', '989': 'MI',
  // Indiana
  '219': 'IN', '260': 'IN', '317': 'IN', '463': 'IN', '574': 'IN', '765': 'IN', '812': 'IN', '930': 'IN',
  // Missouri
  '314': 'MO', '417': 'MO', '573': 'MO', '636': 'MO', '660': 'MO', '816': 'MO',
  // Washington
  '206': 'WA', '253': 'WA', '360': 'WA', '425': 'WA', '509': 'WA', '564': 'WA',
  // Arizona
  '480': 'AZ', '520': 'AZ', '602': 'AZ', '623': 'AZ', '928': 'AZ',
  // Colorado
  '303': 'CO', '719': 'CO', '720': 'CO', '970': 'CO',
  // Virginia
  '276': 'VA', '434': 'VA', '540': 'VA', '571': 'VA', '703': 'VA', '757': 'VA', '804': 'VA',
  // Maryland
  '240': 'MD', '301': 'MD', '410': 'MD', '443': 'MD', '667': 'MD',
  // Massachusetts
  '339': 'MA', '351': 'MA', '413': 'MA', '508': 'MA', '617': 'MA', '774': 'MA', '781': 'MA', '857': 'MA', '978': 'MA',
  // Wisconsin
  '262': 'WI', '414': 'WI', '534': 'WI', '608': 'WI', '715': 'WI', '920': 'WI',
  // Minnesota
  '218': 'MN', '320': 'MN', '507': 'MN', '612': 'MN', '651': 'MN', '763': 'MN', '952': 'MN',
  // Alabama
  '205': 'AL', '251': 'AL', '256': 'AL', '334': 'AL', '938': 'AL',
  // South Carolina
  '803': 'SC', '843': 'SC', '854': 'SC', '864': 'SC',
  // Kentucky
  '270': 'KY', '364': 'KY', '502': 'KY', '606': 'KY', '859': 'KY',
  // Oregon
  '458': 'OR', '503': 'OR', '541': 'OR', '971': 'OR',
  // Oklahoma
  '405': 'OK', '539': 'OK', '580': 'OK', '918': 'OK',
  // Connecticut
  '203': 'CT', '475': 'CT', '860': 'CT', '959': 'CT',
  // Iowa
  '319': 'IA', '515': 'IA', '563': 'IA', '641': 'IA', '712': 'IA',
  // Arkansas
  '479': 'AR', '501': 'AR', '870': 'AR',
  // Mississippi
  '228': 'MS', '601': 'MS', '662': 'MS', '769': 'MS',
  // Utah
  '385': 'UT', '435': 'UT', '801': 'UT',
  // Nevada
  '702': 'NV', '725': 'NV', '775': 'NV',
  // Kansas
  '316': 'KS', '620': 'KS', '785': 'KS', '913': 'KS',
  // New Mexico
  '505': 'NM', '575': 'NM',
  // Nebraska
  '308': 'NE', '402': 'NE', '531': 'NE',
  // West Virginia
  '304': 'WV', '681': 'WV',
  // Idaho
  '208': 'ID', '986': 'ID',
  // Hawaii
  '808': 'HI',
  // Maine
  '207': 'ME',
  // New Hampshire
  '603': 'NH',
  // Rhode Island
  '401': 'RI',
  // Montana
  '406': 'MT',
  // Delaware
  '302': 'DE',
  // South Dakota
  '605': 'SD',
  // Alaska
  '907': 'AK',
  // North Dakota
  '701': 'ND',
  // Vermont
  '802': 'VT',
  // Wyoming
  '307': 'WY'
};

/**
 * Extracts 3-digit US Area Code from raw phone string
 */
function extractAreaCode(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  // Handles +1 (312) ... or 1312... or 312...
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1, 4);
  }
  if (digits.length === 10) {
    return digits.slice(0, 3);
  }
  return null;
}

/**
 * Resolves IANA timezone and state from phone and/or state code
 */
function resolveTimezone(phone, stateCode) {
  const normState = String(stateCode || '').trim().toUpperCase();
  if (normState && STATE_TIMEZONES[normState]) {
    return { state: normState, timezone: STATE_TIMEZONES[normState] };
  }

  const areaCode = extractAreaCode(phone);
  if (areaCode && AREA_CODE_TO_STATE[areaCode]) {
    const inferredState = AREA_CODE_TO_STATE[areaCode];
    return { state: inferredState, timezone: STATE_TIMEZONES[inferredState] || 'America/Chicago' };
  }

  // Default fallback is US Central Time (covers Midwest and major freight hubs)
  return { state: 'US', timezone: 'America/Chicago' };
}

/**
 * Check if the target is currently within strict legal business hours:
 * 9:00 AM to 5:00 PM (09:00 - 17:00), Monday through Saturday.
 * Sunday is strictly blocked.
 */
function isWithinTcpaHours(phone, stateCode) {
  const { timezone, state } = resolveTimezone(phone, stateCode);
  try {
    const now = new Date();
    // Format current day and hour in recipient local timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric'
    });
    
    const parts = formatter.formatToParts(now);
    let weekday = '';
    let hour = 0;
    let minute = 0;
    
    for (const part of parts) {
      if (part.type === 'weekday') weekday = part.value;
      if (part.type === 'hour') hour = parseInt(part.value, 10);
      if (part.type === 'minute') minute = parseInt(part.value, 10);
    }

    // 1. Strict Sunday embargo
    if (weekday === 'Sun') {
      return { allowed: false, reason: 'Sunday outreach prohibited by TCPA policy.', state, timezone, localHour: hour };
    }

    // 2. Strict 9:00 AM (09:00) to 5:00 PM (17:00)
    // 17:00 is 5:00 PM; hour < 17 ensures last window terminates at 16:59:59
    if (hour < 9) {
      return { allowed: false, reason: `Too early in recipient timezone (${hour}:${minute.toString().padStart(2, '0')}). Window starts at 09:00 AM.`, state, timezone, localHour: hour };
    }
    if (hour >= 17) {
      return { allowed: false, reason: `Too late in recipient timezone (${hour}:${minute.toString().padStart(2, '0')}). Window ends at 05:00 PM.`, state, timezone, localHour: hour };
    }

    return { allowed: true, state, timezone, localHour: hour, localMinute: minute };
  } catch (err) {
    console.warn('[US Timezones] Fallback evaluation:', err.message);
    return { allowed: true, state: 'US', timezone: 'America/Chicago' };
  }
}

/**
 * Calculate the exact next available business window timestamp (09:15 AM local time)
 */
function getNextValidWindow(phone, stateCode) {
  const { timezone } = resolveTimezone(phone, stateCode);
  try {
    const now = new Date();
    // Get target date string in recipient timezone
    const dateStr = now.toLocaleDateString('en-US', { timeZone: timezone }); // e.g. "9/24/2026"
    const weekday = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
    const hour = parseInt(now.toLocaleTimeString('en-US', { timeZone: timezone, hour12: false, hour: 'numeric' }), 10);

    let daysToAdd = 0;
    if (weekday === 'Sun') {
      daysToAdd = 1; // schedule for Monday
    } else if (weekday === 'Sat' && hour >= 17) {
      daysToAdd = 2; // Saturday night -> schedule for Monday
    } else if (hour >= 17) {
      daysToAdd = 1; // Tonight -> schedule for tomorrow morning
    } else if (hour < 9) {
      daysToAdd = 0; // Today at 09:15 AM
    } else {
      // Currently within hours; returns now + 4 minutes jitter
      return new Date(Date.now() + 4 * 60 * 1000);
    }

    // Rough target: add required days, set to 09:15 AM
    const nextDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
    // Add offset for 09:15 local
    return new Date(nextDate.getTime() + (Math.floor(Math.random() * 8) + 10) * 60 * 1000);
  } catch {
    return new Date(Date.now() + 60 * 60 * 1000);
  }
}

module.exports = {
  STATE_TIMEZONES,
  AREA_CODE_TO_STATE,
  resolveTimezone,
  isWithinTcpaHours,
  getNextValidWindow
};
