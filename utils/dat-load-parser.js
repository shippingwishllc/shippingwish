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
  str = str.replace(/^(?:mi|miles|k|to)\s+/i, '').trim();
  const match = str.match(/([A-Za-z\s.]+?)(?:,\s*|\s+)([A-Za-z]{2})$/i);
  if (match) {
    let city = match[1].trim().replace(/^[^\w]+/, '');
    city = city.replace(/^to\s+/i, '').trim();
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
 * Extract phone number with extension from load post text
 * Examples: (813) 518-4918 ext 104, 888-374-5138 x22, (800) 555-0199 #304
 */
function extractPhoneWithExt(str) {
  if (!str) return null;
  const phoneMatch = str.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
  if (!phoneMatch) return null;

  let phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;

  const afterPhone = str.slice(phoneMatch.index + phoneMatch[0].length, phoneMatch.index + phoneMatch[0].length + 35);
  const extMatch = afterPhone.match(/^(?:[\s,·\-|/]*)(?:ext(?:ension)?\.?|x|#)\s*([0-9]{1,6})\b/i) ||
                   str.match(/\b(?:ext(?:ension)?\.?|x)\s*#?([0-9]{1,6})\b/i);
  if (extMatch && extMatch[1]) {
    phone += ` ext ${extMatch[1]}`;
  }
  return phone;
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
  const phone = extractPhoneWithExt(text);
  if (phone) data.broker_phone = phone;

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

      const phone = extractPhoneWithExt(line);

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
 * Parse DAT One Detail Card / Side Drawer (Multi-line copied view)
 */
function parseDatCard(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const data = {};

  // 1. Origin & Destination from City, ST patterns
  const cityStateRegex = /^([A-Za-z\s.]+),\s*([A-Za-z]{2})(?:\s*\((\d+)\))?$/;
  const cityStateMatches = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(cityStateRegex);
    if (m) {
      cityStateMatches.push({ lineIdx: i, city: m[1].trim(), state: m[2].toUpperCase(), dho: m[3] ? parseInt(m[3], 10) : null });
    }
  }

  if (cityStateMatches.length >= 2) {
    data.origin = `${cityStateMatches[0].city}, ${cityStateMatches[0].state}`;
    data.destination = `${cityStateMatches[1].city}, ${cityStateMatches[1].state}`;
    if (cityStateMatches[0].dho) data.dho = cityStateMatches[0].dho;
  }

  // Check for lines with explicit DHO or (147)
  const dhoInline = text.match(/\bDH-?O:?\s*(\d+)/i) || text.match(/,\s*[A-Z]{2}\s*\((\d+)\)/);
  if (dhoInline && !data.dho) {
    data.dho = parseInt(dhoInline[1], 10);
  }

  // 2. Trip Miles: e.g. "454 mi"
  const tripMatch = text.match(/(\d{2,5})\s*(?:mi|miles)\b/i);
  if (tripMatch) {
    data.loaded_miles = parseInt(tripMatch[1], 10);
  }

  // 3. Weight: e.g. "42,827 lbs" or "Weight\n42,827 lbs"
  const weightMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*lbs/i);
  if (weightMatch) {
    data.weight = parseWeight(weightMatch[1]);
  } else {
    for (let i = 0; i < lines.length; i++) {
      if (/^weight$/i.test(lines[i]) && lines[i + 1]) {
        data.weight = parseWeight(lines[i + 1]);
        break;
      }
    }
  }

  // 4. Equipment: Van, Reefer, Flatbed, 53 ft, Box Truck
  let lengthStr = '';
  let typeStr = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^truck$/i.test(lines[i]) && lines[i + 1]) typeStr = lines[i + 1];
    if (/^length$/i.test(lines[i]) && lines[i + 1]) lengthStr = lines[i + 1];
    if (/^equipment$/i.test(lines[i]) && lines[i + 1]) typeStr = lines[i + 1];
  }
  if (typeStr || lengthStr) {
    data.equipment = mapEquipment(`${lengthStr} ${typeStr}`);
  } else {
    const eqMatch = text.match(/\b(Van|Reefer|Flatbed|Box Truck|Hotshot|Step Deck|Power Only)\b/i);
    if (eqMatch) data.equipment = mapEquipment(eqMatch[1]);
  }

  // 5. Company / Broker
  for (let i = 0; i < lines.length; i++) {
    if (/^company$/i.test(lines[i]) && lines[i + 1]) {
      data.broker_name = lines[i + 1];
      break;
    }
  }
  if (!data.broker_name) {
    const compMatch = text.match(/Company\s*[:\n]\s*([^\n\r]+)/i);
    if (compMatch) data.broker_name = compMatch[1].trim();
  }

  // 6. Phone & Extension
  data.broker_phone = extractPhoneWithExt(text);

  // 7. Email
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    data.broker_email = emailMatch[1].toLowerCase();
  }

  // 8. MC Number
  const mcMatch = text.match(/MC\s*#?\s*(\d{5,8})/i);
  if (mcMatch) {
    data.mc_number = mcMatch[1];
  }

  // 9. Rate: look for posted rate or SPOT RATE benchmark
  const spotRateMatch = text.match(/SPOT\s+RATE[\s\S]*?\$([0-9,]+)/i);
  const explicitRateMatch = text.match(/(?:Rate|Pay|Total)\s*[:\n]\s*\$([0-9,]+)/i);
  if (explicitRateMatch) {
    data.rate = parseMoney(explicitRateMatch[1]);
  } else if (spotRateMatch) {
    data.rate = parseMoney(spotRateMatch[1]);
    data.is_spot_benchmark = true;
  }

  // 10. Pickup / Delivery times
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
  if (dateMatch) {
    data.pickup_time = dateMatch[1];
  }

  // 11. Comments / Notes
  for (let i = 0; i < lines.length; i++) {
    if (/^comments$/i.test(lines[i]) && lines[i + 1]) {
      data.notes = lines[i + 1];
      break;
    }
  }

  if (data.origin && data.destination) {
    const orig = cleanLocation(data.origin);
    const dest = cleanLocation(data.destination);
    const miles = data.loaded_miles || 500;
    const rate = data.rate || 0;
    const rpm = miles > 0 && rate > 0 ? parseFloat((rate / miles).toFixed(2)) : 0;

    return {
      load_id: data.mc_number ? `DAT-MC${data.mc_number}` : `DAT-${Math.floor(100000 + Math.random() * 900000)}`,
      dho: data.dho || 0,
      loaded_miles: miles,
      origin: orig.full || data.origin,
      origin_city: orig.city,
      origin_state: orig.state,
      destination: dest.full || data.destination,
      destination_city: dest.city,
      destination_state: dest.state,
      pickup_time: data.pickup_time || 'Ready Today',
      delivery_time: data.delivery_time || 'Standard Delivery',
      weight: data.weight || 40000,
      equipment_type: data.equipment || '53ft Dry Van',
      rate: rate,
      rpm: rpm,
      notes: data.notes || (data.is_spot_benchmark ? `DAT Spot benchmark rate ($${rate})` : ''),
      broker_name: data.broker_name || 'Verified Freight Broker',
      broker_email: data.broker_email || null,
      broker_phone: data.broker_phone || null,
      mc_number: data.mc_number || null,
      raw_source: text.slice(0, 400)
    };
  }

  return null;
}

/**
 * Universal Multi-Row Table Parser (Supports TAL One / DAT One Virtual Tables & Multi-Line Rows)
 */
function parseUniversalDat(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Strategy A: Split by Age indicator at row start (e.g. 0m, 15m, 1m, 2h, 3d, <1m)
  const ageRowRegex = /^(?:\[\s*\]\s*)?(\d+[mhsd]|<1m|\d+\s*mins?)\b/i;
  const ageLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (ageRowRegex.test(lines[i])) {
      ageLineIndices.push(i);
    }
  }

  const chunks = [];
  if (ageLineIndices.length >= 2) {
    for (let k = 0; k < ageLineIndices.length; k++) {
      const start = ageLineIndices[k];
      const end = (k + 1 < ageLineIndices.length) ? ageLineIndices[k + 1] : lines.length;
      chunks.push(lines.slice(start, end).join('\n'));
    }
  }

  // Strategy B: If no age indicators, check if each line has 2 cities
  if (chunks.length === 0) {
    for (const l of lines) {
      const cities = Array.from(l.matchAll(/([A-Za-z\s.]+),\s*([A-Za-z]{2})/g));
      if (cities.length >= 2) {
        chunks.push(l);
      }
    }
  }

  // Strategy C: Split by sequential pairs of City, ST in full text
  if (chunks.length === 0) {
    const cityRegex = /\b([A-Za-z\s.]+),\s*([A-Za-z]{2})\b/g;
    const allCities = Array.from(text.matchAll(cityRegex));
    if (allCities.length >= 4) {
      for (let i = 0; i < allCities.length; i += 2) {
        if (i + 1 < allCities.length) {
          const startIdx = Math.max(0, allCities[i].index - 60);
          const nextStart = (i + 2 < allCities.length) ? allCities[i + 2].index : text.length;
          chunks.push(text.slice(startIdx, nextStart));
        }
      }
    }
  }

  const results = [];
  for (const chunk of chunks) {
    const cityMatches = Array.from(chunk.matchAll(/\b([A-Za-z\s.]+),\s*([A-Za-z]{2})\b/g));
    if (cityMatches.length < 2) continue;

    const orig = cleanLocation(`${cityMatches[0][1].trim()}, ${cityMatches[0][2].trim()}`);
    const dest = cleanLocation(`${cityMatches[1][1].trim()}, ${cityMatches[1][2].trim()}`);

    const rateMatch = chunk.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
    const rate = rateMatch ? parseMoney(rateMatch[1]) : 0;

    const milesMatch = chunk.match(/\b([0-9,]{2,5})\s*(?:mi|miles)\b/i) || chunk.match(/(?:^|\s|\t)([0-9]{2,4})(?:\s|\t|$)/);
    const miles = milesMatch ? parseInt(milesMatch[1].replace(/,/g, ''), 10) : 500;

    const dhoMatch = chunk.match(/\(([0-9]{1,3})\)/) || chunk.match(/DH-?O:?\s*([0-9]{1,3})/i);
    const dho = dhoMatch ? parseInt(dhoMatch[1], 10) : 0;

    const weightMatch = chunk.match(/([0-9,]+)\s*(?:lbs|lb)\b/i);
    const weight = weightMatch ? parseInt(weightMatch[1].replace(/,/g, ''), 10) : 40000;

    let eq = '53ft Dry Van';
    if (/\b(VR|REEFER|R)\b/i.test(chunk)) eq = '53ft Reefer';
    else if (/\b(F|FLATBED|FLAT)\b/i.test(chunk)) eq = 'Flatbed';
    else if (/\b(SB|BOX|STRAIGHT)\b/i.test(chunk)) eq = '26ft Box Truck';
    else if (/\b(SD|STEP)\b/i.test(chunk)) eq = 'Step Deck';
    else if (/\b(V|VAN)\b/i.test(chunk)) eq = '53ft Dry Van';

    const phone = extractPhoneWithExt(chunk);

    const emailMatch = chunk.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1].toLowerCase() : null;

    let broker = 'DAT Verified Broker';
    const brokerMatch = chunk.match(/(?:Full|Partial|53 ft|26 ft)[\s\t]+([A-Za-z0-9\s.,&'-]+?)(?:[\s\t]+\([0-9]{3}\)|[\s\t]+[0-9]{2}\s+CS|[\s\t]+[a-zA-Z0-9._%+-]+@|$)/i);
    if (brokerMatch && brokerMatch[1].trim().length > 3) {
      broker = brokerMatch[1].replace(/^(?:-\s*)?(?:Full|Partial)\s*[\t\s]*/i, '').trim();
    } else if (email) {
      const domain = email.split('@')[1]?.replace(/\.[a-z]{2,}$/i, '');
      if (domain) broker = domain.toUpperCase() + ' Logistics';
    }

    // Extract any notes, comments, commodity, or special instructions from chunk
    let notes = '';
    const noteMatches = chunk.match(/(?:commodity|comments?|notes?|ref(?:erence)?\s*#?|details?|special instructions?|dock|hours|appointment|appt)[:\s]+([^\n\r]+)/i);
    if (noteMatches) {
      notes = noteMatches[0].trim();
    } else if (chunk.includes('Partial')) {
      notes = 'Partial load';
    }

    const rpm = miles > 0 && rate > 0 ? parseFloat((rate / miles).toFixed(2)) : 0;

    results.push({
      load_id: `DAT-${Math.floor(100000 + Math.random() * 900000)}`,
      origin: orig.full,
      origin_city: orig.city,
      origin_state: orig.state,
      destination: dest.full,
      destination_city: dest.city,
      destination_state: dest.state,
      rate,
      miles,
      loaded_miles: miles,
      dho,
      weight,
      equipment_type: eq,
      broker_name: broker,
      broker_phone: phone,
      broker_email: email,
      rpm,
      pickup_time: 'Ready Today',
      delivery_time: 'Standard Delivery',
      notes: notes,
      raw_source: chunk.slice(0, 300)
    });
  }

  return results;
}

/**
 * Universal Master Parse Function
 * Handles DAT One detail cards, key-value pasted text, and tabular DAT data
 */
function parseDatInput(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Prioritize Multi-Row Tables (handles TAL One virtualized tables & copied search results)
  const universalLoads = parseUniversalDat(trimmed);
  if (universalLoads.length > 0) {
    return universalLoads;
  }

  // 2. Try Tabular DAT table rows
  const tableResults = parseDatTableRows(trimmed);
  if (tableResults.length > 0) {
    return tableResults;
  }

  // 3. Try Key-Value format (like DHO / Loaded Miles / From / To)
  const kvResults = parseKeyValueFormat(trimmed);
  if (kvResults.length > 0) {
    return kvResults;
  }

  // 4. Try DAT One single detail card / side drawer format
  const cardResult = parseDatCard(trimmed);
  if (cardResult) {
    return [cardResult];
  }

  // 4. Fallback: Extract from any text containing city/state pairs
  const stateRegex = /\b([A-Za-z\s]+),\s*([A-Za-z]{2})\b/g;
  const pairs = Array.from(trimmed.matchAll(stateRegex));
  if (pairs.length >= 2) {
    const orig = cleanLocation(`${pairs[0][1].trim()}, ${pairs[0][2].trim()}`);
    const dest = cleanLocation(`${pairs[1][1].trim()}, ${pairs[1][2].trim()}`);
    
    const tripMatch = trimmed.match(/(\d{2,5})\s*(?:mi|miles)\b/i);
    const miles = tripMatch ? parseInt(tripMatch[1], 10) : 500;

    const weightMatch = trimmed.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*lbs/i);
    const weight = weightMatch ? parseWeight(weightMatch[1]) : 40000;

    const rateMatch = trimmed.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
    const rate = rateMatch ? parseMoney(rateMatch[1]) : 0;
    const rpm = miles > 0 && rate > 0 ? parseFloat((rate / miles).toFixed(2)) : 0;

    const phone = extractPhoneWithExt(trimmed);
    const emailMatch = trimmed.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1].toLowerCase() : null;

    return [{
      load_id: `DAT-${Math.floor(100000 + Math.random() * 900000)}`,
      dho: 50,
      loaded_miles: miles,
      origin: orig.full,
      origin_city: orig.city,
      origin_state: orig.state,
      destination: dest.full,
      destination_city: dest.city,
      destination_state: dest.state,
      pickup_time: 'Ready Today',
      delivery_time: 'Standard Delivery',
      weight: weight,
      equipment_type: '53ft Dry Van',
      rate: rate,
      rpm: rpm,
      notes: 'Pasted load board corridor',
      broker_name: 'Verified Freight Broker',
      broker_email: email,
      broker_phone: phone,
      raw_source: trimmed.slice(0, 300)
    }];
  }

  return [];
}

/**
 * Format Driver SMS Message in User's exact required format
 */
function formatDriverSms(load, truckNumber = '101') {
  const dho = Math.round(parseFloat(load.dho ?? load.deadhead_miles ?? 0) || 0);
  const miles = Math.round(parseFloat(load.loaded_miles ?? load.miles ?? 0) || 0);
  const rpm = miles > 0 && load.rate > 0 ? (load.rate / miles).toFixed(2) : '0.00';
  let cleanNotes = String(load.notes || '').trim();
  // Filter out internal system & background engine sync tags so driver SMS is 100% clean
  if (/24\/7 DAT|Cloud Sync|DAT Spot Match|Verified.*Freight|Eden Prairie|Direct from DAT/i.test(cleanNotes)) {
    cleanNotes = '';
  }
  const notesLine = cleanNotes ? `\n𝗡𝗢𝗧𝗘𝗦: ${cleanNotes.toUpperCase()}` : '';

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
  cleanLocation,
  extractPhoneWithExt
};
