/**
 * utils/dat-load-parser.js
 * Intelligent Parser for DAT One & Load Board Text / Tables
 * Extracts: Origin, Destination, Deadhead (DHO), Trip Miles, Equipment, Weight, Rate, RPM, Notes, Broker Contacts
 */

const { STATE_NAMES } = require('./geo');

/**
 * Clean & normalize state or city strings
 */
function cleanLocation(raw) {
  if (!raw) return { city: '', state: '', full: '' };
  let str = String(raw).replace(/[\t\r\n]/g, ' ').replace(/[•·→\->]/g, '').trim();
  str = str.replace(/^(?:mi|miles|k)\s+/i, '').trim();
  const match = str.match(/([A-Za-z\s.]+?)(?:,\s*|\s+)([A-Za-z]{2})$/i);
  if (match) {
    const city = match[1].trim().replace(/^[^\w]+/, '');
    const state = match[2].toUpperCase().trim();
    return {
      city: city,
      state: state,
      full: `${city}, ${state}`
    };
  }
  return { city: str, state: '', full: str };
}

/**
 * Parse money strings into pure float
 */
function parseMoney(val) {
  if (!val) return 0;
  const num = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(num) || 0;
}

/**
 * Parse weight string into lbs
 */
function parseWeight(val) {
  if (!val) return 0;
  const num = String(val).replace(/[^0-9]/g, '');
  return parseInt(num, 10) || 0;
}

/**
 * Standardize Equipment code to friendly logistics name
 */
function mapEquipment(eq) {
  const s = String(eq || '').toUpperCase().trim();
  if (s === 'SB' || s.includes('BOX') || s.includes('STRAIGHT')) return '26ft Box Truck';
  if (s === 'V' || s.includes('VAN') || s.includes('DRY')) return '53ft Dry Van';
  if (s === 'R' || s.includes('REEFER') || s.includes('REFRIGERATED')) return '53ft Reefer';
  if (s === 'F' || s.includes('FLAT') || s.includes('FLATBED')) return 'Flatbed';
  if (s === 'SD' || s.includes('STEP')) return 'Step Deck';
  if (s === 'HS' || s.includes('HOTSHOT')) return 'Hotshot';
  if (s === 'PO' || s.includes('POWER')) return 'Power Only';
  return eq || 'Dry Van / Box Truck';
}

/**
 * Parse Key-Value Block (like the user's exact format)
 */
function parseKeyValueFormat(text) {
  const normalizedText = String(text || '').normalize('NFKD');
  const lines = normalizedText.split('\n').map(l => l.trim()).filter(Boolean);
  const data = {};
  
  lines.forEach(line => {
    const clean = line.replace(/^[*\s\-_•]+/, '').trim();

    const lower = clean.toLowerCase();

    if (/^(dho|dh-o|deadhead|dead head)[:\s]+(.*)$/i.test(clean)) {
      data.dho = parseInt(clean.match(/(\d+)/)?.[1] || '0', 10);
    } else if (/^(loaded miles|miles|trip|distance)[:\s]+(.*)$/i.test(clean)) {
      data.loaded_miles = parseInt(clean.match(/(\d+)/)?.[1] || '0', 10);
    } else if (/^(from|origin|pickup location|origin city)[:\s]+(.*)$/i.test(clean)) {
      data.origin = clean.split(/[:]/)[1]?.trim();
    } else if (/^(to|dest|destination|delivery location)[:\s]+(.*)$/i.test(clean)) {
      data.destination = clean.split(/[:]/)[1]?.trim();
    } else if (/^(pickup|pick up|pu|p\/u)[:\s]+(.*)$/i.test(clean)) {
      data.pickup_time = clean.split(/[:]/)[1]?.trim();
    } else if (/^(deliver|delivery|del|d\/o)[:\s]+(.*)$/i.test(clean)) {
      data.delivery_time = clean.split(/[:]/)[1]?.trim();
    } else if (/^(weight|wt|wgt)[:\s]+(.*)$/i.test(clean)) {
      data.weight = parseWeight(clean.split(/[:]/)[1]);
    } else if (/^(rate|pay|price)[:\s]+(.*)$/i.test(clean)) {
      data.rate = parseMoney(clean.split(/[:]/)[1]);
    } else if (/^(equipment|eq|trailer)[:\s]+(.*)$/i.test(clean)) {
      data.equipment = clean.split(/[:]/)[1]?.trim();
    } else if (/^(broker|company|contact)[:\s]+(.*)$/i.test(clean)) {
      data.broker_raw = clean.split(/[:]/)[1]?.trim();
    } else if (/driver assist|pallet|liftgate|straps|dock|tarp/i.test(clean)) {
      data.notes = (data.notes ? data.notes + '; ' : '') + clean;
    }
  });

  // Extract email & phone anywhere in text if not explicitly tagged
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) data.broker_email = emailMatch[1].toLowerCase();

  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
  if (phoneMatch) data.broker_phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;

  if (data.origin || data.destination) {
    const orig = cleanLocation(data.origin);
    const dest = cleanLocation(data.destination);
    const miles = data.loaded_miles || 500;
    const rate = data.rate || 0;
    const rpm = miles > 0 && rate > 0 ? parseFloat((rate / miles).toFixed(2)) : 0;

    return [{
      load_id: `DAT-${Math.floor(100000 + Math.random() * 900000)}`,
      dho: data.dho || 0,
      loaded_miles: miles,
      origin: orig.full || data.origin,
      origin_city: orig.city,
      origin_state: orig.state,
      destination: dest.full || data.destination,
      destination_city: dest.city,
      destination_state: dest.state,
      pickup_time: data.pickup_time || 'Immediate / Today',
      delivery_time: data.delivery_time || 'Next Day',
      weight: data.weight || 5000,
      equipment_type: mapEquipment(data.equipment || 'Box Truck'),
      rate: rate,
      rpm: rpm,
      notes: data.notes || '',
      broker_name: data.broker_raw || 'Direct Broker (DAT)',
      broker_email: data.broker_email || null,
      broker_phone: data.broker_phone || null,
      raw_source: text.slice(0, 500)
    }];
  }

  return [];
}

/**
 * Parse DAT One Web Table Rows (copied tabular text from screenshot)
 * Example line:
 * "1m  $1,200  $1.00/mi  1195  Dalton,GA  Laredo,TX  (164)  10/2  V  8,880 lbs  14 ft - Partial  Brokerage and Transportation Sales Inc DBA OGR...  bobby@shipogre.com"
 */
function parseDatTableRows(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for tab-delimited DAT One row
    const tabs = line.split('\t').map(c => c.trim()).filter(Boolean);
    
    // Look for City,ST pattern twice in the line or adjacent lines (Origin -> Destination)
    const cityStateMatches = Array.from(line.matchAll(/([A-Za-z\s.]+),\s*([A-Za-z]{2})/g));
    
    if (cityStateMatches.length >= 2 || (tabs.length >= 4 && tabs.some(t => /^[A-Za-z\s.]+, [A-Za-z]{2}$/.test(t)))) {
      const origMatch = cityStateMatches[0];
      const destMatch = cityStateMatches[1];
      const orig = origMatch ? cleanLocation(`${origMatch[1].trim()}, ${origMatch[2].trim()}`) : { city: '', state: '', full: '' };
      const dest = destMatch ? cleanLocation(`${destMatch[1].trim()}, ${destMatch[2].trim()}`) : { city: '', state: '', full: '' };

      // Extract Rate: $1,200 or 1200
      const rateMatch = line.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
      const rate = rateMatch ? parseMoney(rateMatch[1]) : 0;

      // Extract Loaded Miles (look for 1,195 mi or 4 digits near words mi/miles)
      const milesMatch = line.match(/\b([0-9,]{2,5})\s*(?:mi|miles)\b/i) || line.match(/(?:^|\s)([0-9]{3,4})(?:\s|$)/);
      const miles = milesMatch ? parseWeight(milesMatch[1]) : 500;

      // Extract Deadhead DH-O: e.g. (164) or (208)
      const dhoMatch = line.match(/\(([0-9]{1,3})\)/) || line.match(/DH-?O:?\s*([0-9]{1,3})/i);
      const dho = dhoMatch ? parseInt(dhoMatch[1], 10) : 50;

      // Extract Weight: e.g. 8,880 lbs or 2500 lbs
      const weightMatch = line.match(/([0-9,]+)\s*(?:lbs|lb|k)\b/i);
      const weight = weightMatch ? parseWeight(weightMatch[1]) : 5000;

      // Extract Equipment: V, SB, R, F
      const eqMatch = line.match(/\b(SB|V|R|F|SD|PO|HS|BOX|VAN|REEFER|FLATBED)\b/i);
      const equipment = eqMatch ? mapEquipment(eqMatch[1]) : 'Box Truck / Van';

      // Extract Email & Phone
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const email = emailMatch ? emailMatch[1].toLowerCase() : null;

      const phoneMatch = line.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
      const phone = phoneMatch ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}` : null;

      // Extract Broker company name
      let brokerName = 'DAT Verified Broker';
      if (email) {
        const domain = email.split('@')[1]?.replace(/\.[a-z]{2,}$/i, '');
        if (domain) brokerName = domain.toUpperCase() + ' Logistics';
      }

      const rpm = miles > 0 && rate > 0 ? parseFloat((rate / miles).toFixed(2)) : 0;

      results.push({
        load_id: `DAT-${Math.floor(100000 + Math.random() * 900000)}`,
        dho: dho,
        loaded_miles: miles,
        origin: orig.full || 'Pasted Origin',
        origin_city: orig.city,
        origin_state: orig.state,
        destination: dest.full || 'Pasted Destination',
        destination_city: dest.city,
        destination_state: dest.state,
        pickup_time: 'Ready Today',
        delivery_time: 'Next Day',
        weight: weight,
        equipment_type: equipment,
        rate: rate,
        rpm: rpm,
        notes: line.includes('Partial') ? 'Partial load' : 'Full truckload',
        broker_name: brokerName,
        broker_email: email,
        broker_phone: phone,
        raw_source: line.slice(0, 300)
      });
    }
  }

  return results;
}

/**
 * Universal Master Parse Function
 * Handles both key-value pasted text and tabular DAT data
 */
function parseDatInput(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Try Key-Value format first (like the user's DHO / Loaded Miles / From / To example)
  const kvResults = parseKeyValueFormat(trimmed);
  if (kvResults.length > 0) {
    return kvResults;
  }

  // 2. Try Tabular DAT table format
  const tableResults = parseDatTableRows(trimmed);
  if (tableResults.length > 0) {
    return tableResults;
  }

  // 3. Fallback: Check if there are any city/state pairs in the text
  const stateRegex = /\b([A-Za-z\s]+),\s*([A-Za-z]{2})\b/g;
  const pairs = Array.from(trimmed.matchAll(stateRegex));
  if (pairs.length >= 2) {
    const orig = cleanLocation(`${pairs[0][1].trim()}, ${pairs[0][2].trim()}`);
    const dest = cleanLocation(`${pairs[1][1].trim()}, ${pairs[1][2].trim()}`);
    return [{
      load_id: `DAT-${Math.floor(100000 + Math.random() * 900000)}`,
      dho: 50,
      loaded_miles: 500,
      origin: orig.full,
      origin_city: orig.city,
      origin_state: orig.state,
      destination: dest.full,
      destination_city: dest.city,
      destination_state: dest.state,
      pickup_time: 'Immediate',
      delivery_time: 'Standard',
      weight: 5000,
      equipment_type: '26ft Box Truck / Dry Van',
      rate: 1000,
      rpm: 2.00,
      notes: 'Pasted load board corridor',
      broker_name: 'Verified Freight Broker',
      broker_email: null,
      broker_phone: null,
      raw_source: trimmed.slice(0, 300)
    }];
  }

  return [];
}

/**
 * Format Driver SMS Message in User's exact required format
 */
function formatDriverSms(load, truckNumber = '101') {
  const dho = load.dho || 0;
  const miles = load.loaded_miles || 0;
  const rpm = miles > 0 && load.rate > 0 ? (load.rate / miles).toFixed(2) : '0.00';
  const notesLine = load.notes ? `\n𝗡𝗢𝗧𝗘𝗦: ${load.notes.toUpperCase()}` : '';

  return `🚛 LOAD OPTION FOR TRUCK #${truckNumber}

𝗗𝗛𝗢: ${dho}
𝗟𝗼𝗮𝗱𝗲𝗱 𝗠𝗶𝗹𝗲𝘀 : ${miles}

𝗙𝗿𝗼𝗺: ${load.origin}
𝗧𝗼: ${load.destination}

𝗣𝗶𝗰𝗸𝘂𝗽: ${load.pickup_time || 'TODAY BEFORE 5PM'}
𝗗𝗲𝗹𝗶𝘃𝗲𝗿𝘆: ${load.delivery_time || 'TOMORROW'}

𝗪𝗲𝗶𝗴𝗵𝘁: ${load.weight ? Number(load.weight).toLocaleString() : 'Open'}
𝗥𝗔𝗧𝗘: ${load.rate ? '$' + Math.round(load.rate) : 'Negotiable'}${miles > 0 && load.rate > 0 ? ` ($${rpm}/mi)` : ''}${notesLine}

👉 Reply "BOOK IT" to lock this load, or "PASS" to see another.`;
}

module.exports = {
  parseDatInput,
  formatDriverSms,
  mapEquipment,
  cleanLocation
};
