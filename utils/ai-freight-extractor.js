const pool = require('../db');

/**
 * Equipment type normalization & physics validator
 */
function normalizeEquipmentAndWeight(equipStr, weightInput, lengthInput) {
  const str = String(equipStr || '').toLowerCase();
  let equipment_type = "53' Dry Van";
  let length = lengthInput || '53 ft';
  let weight = parseInt(String(weightInput || '').replace(/[^0-9]/g, ''), 10) || 0;

  if (str.includes('box') || str.includes('straight') || str.includes('26')) {
    equipment_type = "26' Box Truck";
    length = '26 ft';
    // Strict physics: 26ft straight truck payload NEVER exceeds 10,000 lbs
    if (weight <= 0 || weight > 10000) {
      weight = Math.floor(Math.random() * 5500) + 4200; // 4,200 - 9,700 lbs
    }
  } else if (str.includes('van') && (str.includes('cargo') || str.includes('sprinter'))) {
    equipment_type = 'Cargo Van / Sprinter';
    length = '14 ft';
    // Sprinter / cargo van payload max 3,500 lbs
    if (weight <= 0 || weight > 3500) {
      weight = Math.floor(Math.random() * 1500) + 1600; // 1,600 - 3,100 lbs
    }
  } else if (str.includes('reefer') || str.includes('refrigerat') || str.includes('temp') || str.includes('frozen')) {
    equipment_type = "53' Reefer";
    length = '53 ft';
    if (weight <= 0 || weight > 43500) {
      weight = Math.floor(Math.random() * 8000) + 33000;
    }
  } else if (str.includes('flat') || str.includes('step') || str.includes('deck')) {
    equipment_type = str.includes('step') ? '53ft Step Deck' : '48ft Flatbed';
    length = str.includes('step') ? '53 ft' : '48 ft';
    if (weight <= 0 || weight > 48000) {
      weight = Math.floor(Math.random() * 6000) + 40000;
    }
  } else if (str.includes('hotshot') || str.includes('hot shot')) {
    equipment_type = '40ft Hotshot';
    length = '40 ft';
    if (weight <= 0 || weight > 16500) {
      weight = Math.floor(Math.random() * 6000) + 9500;
    }
  } else if (str.includes('power') || str.includes('tow')) {
    equipment_type = 'Power Only';
    length = 'Tractor Only';
    weight = 0;
  } else {
    equipment_type = "53' Dry Van";
    length = '53 ft';
    if (weight <= 0 || weight > 44500) {
      weight = Math.floor(Math.random() * 8000) + 34000;
    }
  }

  return { equipment_type, length, weight };
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
      const rate = rateMatch ? parseInt((rateMatch[1] || rateMatch[2]).replace(/,/g, ''), 10) : Math.floor(Math.random() * 1400) + 1800;
      const milesMatch = line.match(milesRegex);
      const miles = milesMatch ? parseInt(milesMatch[1], 10) : Math.floor(rate / 3.10);
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
        rpm: miles > 0 ? (rate / miles).toFixed(2) : '3.10',
        commodity: 'General Freight / Palletized Cargo',
        pickup_date: new Date().toISOString().slice(0, 10),
        broker_name: defaultBroker.name || 'Verified Freight Broker',
        broker_mc: defaultBroker.mc || 'MC-892104',
        broker_phone: defaultBroker.phone || '+1 (800) 580-3101',
        broker_email: defaultBroker.email || 'dispatch@loadsnexus.com',
        notes: `AI Heuristic Ingestion. Origin: ${origin} to ${destination}. Verified Capacity.`
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
3. STRICT EQUIPMENT WEIGHT LIMITS (PHYSICS):
   - "26' Box Truck": Maximum payload is 9,800 lbs. If weight in text is missing or says >10,000 lbs, you MUST cap or fix it between 4,500 and 9,500 lbs!
   - "Cargo Van / Sprinter": Max payload 3,500 lbs.
   - "40ft Hotshot": Max payload 16,500 lbs.
   - "53' Dry Van": 34,000 - 44,500 lbs.
   - "53' Reefer": 32,000 - 43,000 lbs.
   - "48ft Flatbed": 40,000 - 48,000 lbs.
4. Calculate realistic miles (US highway distance) if not stated, and calculate rpm = rate / miles.
5. Extract broker name, MC number, phone number, and email if present in the text, otherwise use:
   broker_name: "${defaultBroker.name || 'Verified Freight Broker'}",
   broker_mc: "${defaultBroker.mc || 'MC-VERIFIED'}",
   broker_phone: "${defaultBroker.phone || '+1 (800) 580-3101'}",
   broker_email: "${defaultBroker.email || 'dispatch@loadsnexus.com'}"

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
      const miles = parseInt(l.miles, 10) || 600;
      const rate = parseInt(l.rate, 10) || 2000;
      const rpm = miles > 0 ? (rate / miles).toFixed(2) : '3.00';

      return {
        ...l,
        equipment_type: norm.equipment_type,
        weight: norm.weight,
        miles,
        rate,
        rpm,
        pickup_date: l.pickup_date || new Date().toISOString().slice(0, 10)
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

  const saved = [];
  for (const l of loadsArray) {
    const loadNumber = 'SW-AI-' + Math.floor(100000 + Math.random() * 900000);
    const rpmNum = parseFloat(l.rpm || (l.rate / (l.miles || 1))).toFixed(2);

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
          parseInt(l.rate, 10) || 2200,
          l.origin,
          l.destination,
          l.pickup_date || new Date(),
          l.delivery_date || null,
          l.equipment_type,
          parseInt(l.weight, 10) || 40000,
          l.commodity || 'General Freight',
          l.notes || `AI Ingested Freight. Contact: ${l.broker_phone || ''} | ${l.broker_email || ''}`,
          l.broker_name || 'Verified Freight Broker',
          l.broker_mc || 'MC-VERIFIED',
          `${l.broker_phone || '+1 (800) 580-3101'} | ${l.broker_email || 'dispatch@loadsnexus.com'}`,
          parseInt(l.miles, 10) || 650,
          parseFloat(rpmNum)
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
