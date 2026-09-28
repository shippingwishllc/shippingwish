const pool = require('../db');

const MAX_PAYLOAD = {
  "26' Box Truck": 10000,
  'Cargo Van / Sprinter': 3500,
  "53' Reefer": 45000,
  '48ft Flatbed': 48000,
  '53ft Step Deck': 48000,
  '40ft Hotshot': 16500,
  "53' Dry Van": 45000
};

// Maps free-text equipment to our labels. Weight is only ever what the broker gave; a missing or
// impossible weight comes back as null (with weightIssue set) instead of a made-up number.
function normalizeEquipmentAndWeight(equipStr, weightInput, lengthInput) {
  const str = String(equipStr || '').toLowerCase();
  let equipment_type = "53' Dry Van";
  let length = lengthInput || '53 ft';
  const given = parseInt(String(weightInput || '').replace(/[^0-9]/g, ''), 10) || 0;

  if (str.includes('box') || str.includes('straight') || str.includes('26')) {
    equipment_type = "26' Box Truck";
    length = '26 ft';
  } else if (str.includes('van') && (str.includes('cargo') || str.includes('sprinter'))) {
    equipment_type = 'Cargo Van / Sprinter';
    length = '14 ft';
  } else if (str.includes('reefer') || str.includes('refrigerat') || str.includes('temp') || str.includes('frozen')) {
    equipment_type = "53' Reefer";
    length = '53 ft';
  } else if (str.includes('flat') || str.includes('step') || str.includes('deck')) {
    equipment_type = str.includes('step') ? '53ft Step Deck' : '48ft Flatbed';
    length = str.includes('step') ? '53 ft' : '48 ft';
  } else if (str.includes('hotshot') || str.includes('hot shot')) {
    equipment_type = '40ft Hotshot';
    length = '40 ft';
  } else if (str.includes('power') || str.includes('tow')) {
    return { equipment_type: 'Power Only', length: 'Tractor Only', weight: null, weightIssue: null };
  }

  const max = MAX_PAYLOAD[equipment_type];
  if (!given) return { equipment_type, length, weight: null, weightIssue: 'missing' };
  if (max && given > max) return { equipment_type, length, weight: null, weightIssue: `stated ${given} lbs is over the ${max} lbs limit for ${equipment_type}` };
  return { equipment_type, length, weight: given, weightIssue: null };
}

/**
 * Fallback regex/heuristic parser when OpenAI API is offline or quota exceeded
 */
function heuristicFallbackParse(rawText, defaultBroker = {}) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const extractedLoads = [];

  const cityStateRegex = /([A-Z][a-zA-Z\s\.\-]{2,20}),?\s+([A-Z]{2})\b/g;
  const rateRegex = /\$\s*(\d[\d,]{2,5})|(\d{3,5})\s*(?:usd|\$|all\s*in)/i;
  const milesRegex = /(\d{2,4})\s*(?:mi|miles|mls)\b/i;
  const equipRegex = /(dry\s*van|reefer|refrigerated|flatbed|step\s*deck|box\s*truck|straight\s*truck|sprinter|cargo\s*van|hotshot|power\s*only)/i;
  const weightRegex = /(\d{1,2}[,\.]?\d{3})\s*(?:lbs|lb|pounds|k\b)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cities = [];
    let match;
    const rCopy = new RegExp(cityStateRegex);
    while ((match = rCopy.exec(line)) !== null) {
      cities.push(`${match[1].trim()}, ${match[2].trim()}`);
    }

    if (cities.length >= 2) {
      const origin = cities[0];
      const destination = cities[1];
      const rateMatch = line.match(rateRegex);
      const rate = rateMatch ? parseInt((rateMatch[1] || rateMatch[2]).replace(/,/g, ''), 10) : 0;
      const milesMatch = line.match(milesRegex);
      const miles = milesMatch ? parseInt(milesMatch[1], 10) : 0;
      const equipMatch = line.match(equipRegex);
      const rawEquip = equipMatch ? equipMatch[1] : (line.toLowerCase().includes('box') ? 'box truck' : "53' Dry Van");
      const weightMatch = line.match(weightRegex);
      const rawWeight = weightMatch ? parseInt(weightMatch[1].replace(/[,k]/gi, ''), 10) : 0;

      const norm = normalizeEquipmentAndWeight(rawEquip, rawWeight);

      extractedLoads.push({
        origin,
        destination,
        equipment_type: norm.equipment_type,
        weight: norm.weight,
        rate,
        miles,
        rpm: miles > 0 && rate > 0 ? (rate / miles).toFixed(2) : null,
        commodity: null,
        pickup_date: null,
        broker_name: defaultBroker.name || null,
        broker_mc: defaultBroker.mc || null,
        broker_phone: defaultBroker.phone || null,
        broker_email: defaultBroker.email || null,
        notes: norm.weightIssue && norm.weightIssue !== 'missing' ? `Weight not saved: ${norm.weightIssue}.` : null
      });
    }
  }

  return extractedLoads;
}

/**
 * Parse raw broker email / sheets using OpenAI ChatGPT API (gpt-4o-mini)
 */
async function parseFreightWithAI(rawText, defaultBroker = {}) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 15) {
    throw new Error('Please provide at least 1-2 lines of broker freight text to parse.');
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('[AI Extractor] No OPENAI_API_KEY found in environment. Using smart heuristic parser.');
    const fallbackLoads = heuristicFallbackParse(rawText, defaultBroker);
    if (fallbackLoads.length > 0) return fallbackLoads;
    throw new Error('OPENAI_API_KEY is not configured and heuristic parser found no matching city-state corridors.');
  }

  const prompt = `You are a high-speed US freight load board data extraction engine.
Parse the following unstructured broker email / load list text into an array of freight loads.

MANDATORY PHYSICAL & FREIGHT RULES:
1. Origin and Destination MUST be "City, 2-letter-State" (e.g. "Dallas, TX", "Chicago, IL").
2. Equipment Types allowed: "53' Dry Van", "53' Reefer", "48ft Flatbed", "53ft Step Deck", "26' Box Truck", "Cargo Van / Sprinter", "40ft Hotshot", "Power Only".
3. Only copy values that are written in the text. Never guess, estimate, or "fix" a weight, rate, miles, date, or commodity. Use null for anything not stated.
4. rpm = rate / miles only when both are stated; otherwise null.
5. Extract broker name, MC number, phone number, and email if present in the text, otherwise use null.

Output format MUST be valid JSON matching this schema:
{
  "loads": [
    {
      "origin": "City, ST",
      "destination": "City, ST",
      "equipment_type": "string",
      "weight": 8500,
      "rate": 2450,
      "miles": 780,
      "rpm": "3.14",
      "commodity": "string",
      "pickup_date": "YYYY-MM-DD",
      "broker_name": "string",
      "broker_mc": "string",
      "broker_phone": "string",
      "broker_email": "string",
      "notes": "string"
    }
  ]
}

Raw Text to parse:
${rawText.slice(0, 8000)}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert logistics data extractor. Always output strict valid JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI Extractor] OpenAI API error (${response.status}):`, errText);
      console.log('[AI Extractor] Falling back to heuristic parser...');
      return heuristicFallbackParse(rawText, defaultBroker);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content || '{}');
    const loadsArray = Array.isArray(parsed.loads) ? parsed.loads : [];

    // Run final sanity check on physics
    return loadsArray.map(l => {
      const norm = normalizeEquipmentAndWeight(l.equipment_type, l.weight);
      const miles = parseInt(l.miles, 10) || 0;
      const rate = parseInt(l.rate, 10) || 0;
      const rpm = miles > 0 && rate > 0 ? (rate / miles).toFixed(2) : null;

      return {
        ...l,
        broker_name: l.broker_name || defaultBroker.name || null,
        broker_mc: l.broker_mc || defaultBroker.mc || null,
        broker_phone: l.broker_phone || defaultBroker.phone || null,
        broker_email: l.broker_email || defaultBroker.email || null,
        equipment_type: norm.equipment_type,
        weight: norm.weight,
        miles,
        rate,
        rpm,
        pickup_date: l.pickup_date || null
      };
    });
  } catch (err) {
    console.error('[AI Extractor] OpenAI call failed:', err.message);
    return heuristicFallbackParse(rawText, defaultBroker);
  }
}

/**
 * Save extracted loads into PostgreSQL database
 */
async function saveLoadsToDatabase(loadsArray) {
  if (!loadsArray || !loadsArray.length) return [];

  const { geocode, roadMiles } = require('./geo');
  const saved = [];
  for (const l of loadsArray) {
    const loadNumber = 'SW-AI-' + Math.floor(100000 + Math.random() * 900000);
    const rate = parseInt(l.rate, 10) || 0;
    let miles = parseInt(l.miles, 10) || 0;
    let milesNote = null;
    if (!miles) {
      const [from, to] = await Promise.all([geocode(l.origin).catch(() => null), geocode(l.destination).catch(() => null)]);
      const estimate = from && to ? roadMiles(from, to) : null;
      if (estimate) { miles = estimate; milesNote = `Miles estimated at ${estimate} (not stated by the broker).`; }
    }
    const rpm = miles && rate ? Number((rate / miles).toFixed(2)) : 0;
    const contact = [l.broker_phone, l.broker_email].filter(Boolean).join(' | ') || null;

    try {
      const ins = await pool.query(
        `INSERT INTO loads (
          load_number, status, rate, pickup_location, delivery_location,
          pickup_date, delivery_date, equipment_type, weight, commodity,
          notes, broker_name, broker_mc, broker_contact, miles, rpm, created_at, updated_at
        ) VALUES ($1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        RETURNING *`,
        [
          loadNumber,
          rate,
          l.origin,
          l.destination,
          l.pickup_date || null,
          l.delivery_date || null,
          l.equipment_type,
          parseInt(l.weight, 10) || null,
          l.commodity || null,
          [l.notes, milesNote].filter(Boolean).join(' ') || null,
          l.broker_name || null,
          l.broker_mc || null,
          contact,
          miles,
          rpm
        ]
      );
      saved.push(ins.rows[0]);
    } catch (e) {
      console.error('[AI Extractor] Error inserting load into DB:', e.message);
    }
  }

  return saved;
}

module.exports = {
  normalizeEquipmentAndWeight,
  heuristicFallbackParse,
  parseFreightWithAI,
  saveLoadsToDatabase
};
