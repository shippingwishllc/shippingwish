/**
 * Map FMCSA Company Census cargo flags to the equipment types dispatchers search.
 * Census does not store "53ft Dry Van" — it stores cargo (general freight, refrigerated food, etc.).
 */
const EQUIPMENT = {
  dry_van: {
    key: 'dry_van',
    label: 'Dry Van',
    hint: 'General freight',
    flags: ['crgo_genfreight', 'crgo_paperprod', 'crgo_beverages']
  },
  reefer: {
    key: 'reefer',
    label: 'Reefer',
    hint: 'Refrigerated food, meat, produce',
    flags: ['crgo_coldfood', 'crgo_meat', 'crgo_produce']
  },
  flatbed: {
    key: 'flatbed',
    label: 'Flatbed',
    hint: 'Building materials, machinery, logs',
    flags: ['crgo_bldgmat', 'crgo_metalsheet', 'crgo_machlrge', 'crgo_logpole', 'crgo_construct']
  },
  hopper: {
    key: 'hopper',
    label: 'Hopper / Dry Bulk',
    hint: 'Grain, dry bulk',
    flags: ['crgo_drybulk', 'crgo_grainfeed', 'crgo_coalcoke']
  },
  tanker: {
    key: 'tanker',
    label: 'Tanker',
    hint: 'Liquid / chemicals',
    flags: ['crgo_liqgas', 'crgo_chem']
  },
  auto: {
    key: 'auto',
    label: 'Auto Hauler',
    hint: 'Motor vehicles',
    flags: ['crgo_motveh', 'crgo_drivetow']
  },
  intermodal: {
    key: 'intermodal',
    label: 'Intermodal',
    hint: 'Containers / piggyback',
    flags: ['crgo_intermodal']
  }
};

const FLAG_LABELS = {
  crgo_genfreight: 'General Freight',
  crgo_paperprod: 'Paper Products',
  crgo_beverages: 'Beverages',
  crgo_coldfood: 'Refrigerated Food',
  crgo_meat: 'Meat',
  crgo_produce: 'Produce',
  crgo_bldgmat: 'Building Materials',
  crgo_metalsheet: 'Metal Sheet',
  crgo_machlrge: 'Large Machinery',
  crgo_logpole: 'Logs / Poles',
  crgo_construct: 'Construction',
  crgo_drybulk: 'Dry Bulk',
  crgo_grainfeed: 'Grain / Feed',
  crgo_coalcoke: 'Coal / Coke',
  crgo_liqgas: 'Liquid / Gas',
  crgo_chem: 'Chemicals',
  crgo_motveh: 'Motor Vehicles',
  crgo_drivetow: 'Driveaway / Towaway',
  crgo_intermodal: 'Intermodal',
  crgo_household: 'Household Goods',
  crgo_passengers: 'Passengers'
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY'
];

function soqlEscape(value) {
  return String(value || '').replace(/'/g, "''");
}

function flagOn(row, flag) {
  const v = row && row[flag];
  return v === 'X' || v === 'Y' || v === true || v === 'true';
}

function normalizeEquipmentKeys(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(',');
  const keys = [];
  for (const item of raw) {
    const token = String(item || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (EQUIPMENT[token]) {
      if (!keys.includes(token)) keys.push(token);
      continue;
    }
    if (/reefer|refrigerat|cold/.test(token)) {
      if (!keys.includes('reefer')) keys.push('reefer');
    } else if (/flat|step|lowboy|rgn/.test(token)) {
      if (!keys.includes('flatbed')) keys.push('flatbed');
    } else if (/hopper|bulk|grain/.test(token)) {
      if (!keys.includes('hopper')) keys.push('hopper');
    } else if (/tank/.test(token)) {
      if (!keys.includes('tanker')) keys.push('tanker');
    } else if (/auto|car.?haul|motveh/.test(token)) {
      if (!keys.includes('auto')) keys.push('auto');
    } else if (/intermodal|container/.test(token)) {
      if (!keys.includes('intermodal')) keys.push('intermodal');
    } else if (/van|gen.?freight|dry/.test(token)) {
      if (!keys.includes('dry_van')) keys.push('dry_van');
    }
  }
  return keys;
}

function cargoLabelsFromRow(row) {
  return Object.keys(FLAG_LABELS)
    .filter((flag) => flagOn(row, flag))
    .map((flag) => FLAG_LABELS[flag]);
}

const PRIORITY = ['reefer', 'tanker', 'auto', 'hopper', 'intermodal', 'flatbed', 'dry_van'];

function equipmentFromRow(row) {
  return PRIORITY
    .filter((key) => EQUIPMENT[key].flags.some((flag) => flagOn(row, flag)))
    .map((key) => EQUIPMENT[key].label);
}

function primaryEquipmentLabel(row) {
  const hits = equipmentFromRow(row);
  return hits[0] || '';
}

function equipmentWhere(keys) {
  const list = normalizeEquipmentKeys(keys);
  if (!list.length) return '';
  const groups = list.map((key) => {
    const flags = EQUIPMENT[key].flags;
    return '(' + flags.map((flag) => `${flag} = 'X'`).join(' OR ') + ')';
  });
  return '(' + groups.join(' OR ') + ')';
}

function parseUnits(value) {
  const n = parseInt(String(value == null ? '' : value).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function buildCensusWhere(filters = {}) {
  const parts = [];
  if (filters.activeOnly !== false) parts.push("status_code = 'A'");
  if (filters.forHire !== false) parts.push("carship like '%C%'");
  if (filters.authorizedHire) parts.push("upper(classdef) like '%AUTHORIZED FOR HIRE%'");
  if (filters.excludePassengers !== false) {
    parts.push("(crgo_passengers IS NULL OR crgo_passengers != 'X')");
    parts.push("upper(coalesce(classdef,'')) not like '%PASSENGER%'");
  }
  const state = String(filters.state || '').trim().toUpperCase();
  if (state && US_STATES.includes(state)) {
    parts.push(`phy_state = '${soqlEscape(state)}'`);
  }
  const minUnits = parseUnits(filters.minUnits);
  const maxUnits = parseUnits(filters.maxUnits);
  if (minUnits) parts.push(`power_units::number >= ${minUnits}`);
  if (maxUnits) parts.push(`power_units::number <= ${maxUnits}`);
  if (filters.hasEmail) parts.push('email_address IS NOT NULL');
  if (filters.hasPhone) parts.push('phone IS NOT NULL');
  const eq = equipmentWhere(filters.equipment);
  if (eq) parts.push(eq);
  const keys = normalizeEquipmentKeys(filters.equipment);
  if (filters.exclusive !== false && keys.length === 1 && keys[0] === 'dry_van') {
    parts.push("(crgo_coldfood IS NULL OR crgo_coldfood != 'X')");
    parts.push("(crgo_meat IS NULL OR crgo_meat != 'X')");
  }
  return parts.join(' AND ');
}

function matrixForUi() {
  return Object.values(EQUIPMENT).map((spec) => ({
    key: spec.key,
    label: spec.label,
    hint: spec.hint
  }));
}

module.exports = {
  EQUIPMENT,
  FLAG_LABELS,
  US_STATES,
  soqlEscape,
  flagOn,
  normalizeEquipmentKeys,
  cargoLabelsFromRow,
  equipmentFromRow,
  primaryEquipmentLabel,
  equipmentWhere,
  parseUnits,
  buildCensusWhere,
  matrixForUi
};
