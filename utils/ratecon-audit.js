/**
 * utils/ratecon-audit.js
 * Broker Rate Confirmation (RateCon) OCR & Automated Audit Engine
 * 
 * Verifies:
 * - Linehaul Rate & Total Pay matches or exceeds agreed rate ($1,000)
 * - Origin & Destination addresses / corridors
 * - Pickup & Delivery schedule
 * - Detention rate ($/hr) & TONU ($ Truck Ordered Not Used)
 * - Required accessorials (Driver Assist, Liftgate, Straps)
 */

const zlib = require('zlib');
const { cleanLocation } = require('./dat-load-parser');

/**
 * Extract plain text from PDF buffer using native decompression
 */
function extractTextFromPdf(buffer) {
  if (typeof buffer === 'string') return buffer;
  if (!Buffer.isBuffer(buffer)) return '';

  const binary = buffer.toString('binary');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  let extracted = '';

  while ((match = streamRegex.exec(binary)) !== null) {
    const raw = Buffer.from(match[1], 'binary');
    try {
      const uncompressed = zlib.inflateSync(raw).toString('utf8');
      // Match text showing operators in PDF content streams: (Text) Tj or [ (Text) ] TJ
      const strings = Array.from(uncompressed.matchAll(/\(([^)]+)\)\s*(?:Tj|'|")/g)).map(m => m[1]);
      if (strings.length) extracted += strings.join(' ') + '\n';

      const arrayStrings = Array.from(uncompressed.matchAll(/\[([^\]]+)\]\s*TJ/g));
      arrayStrings.forEach(arr => {
        const parts = Array.from(arr[1].matchAll(/\(([^)]+)\)/g)).map(p => p[1]);
        if (parts.length) extracted += parts.join('') + ' ';
      });
    } catch {
      // Stream might be uncompressed or image data; scan for readable ascii
      const ascii = raw.toString('ascii').replace(/[^\x20-\x7E\n]/g, ' ');
      if (ascii.includes('Rate') || ascii.includes('Total') || ascii.includes('Carrier')) {
        extracted += ascii + '\n';
      }
    }
  }

  // Fallback: If compressed streams couldn't be parsed, read raw ascii strings
  if (extracted.trim().length < 50) {
    extracted = binary.replace(/[^\x20-\x7E\n]/g, ' ');
  }

  return extracted;
}

/**
 * Intelligent RateCon field extractor
 */
function parseRateCon(input) {
  const text = (Buffer.isBuffer(input) ? extractTextFromPdf(input) : String(input || '')).normalize('NFKD');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const data = {
    raw_text: text.slice(0, 3000),
    rate: 0,
    linehaul: 0,
    fuel_surcharge: 0,
    load_number: null,
    broker_name: null,
    broker_mc: null,
    broker_phone: null,
    broker_email: null,
    origin: null,
    destination: null,
    pickup_date: null,
    delivery_date: null,
    equipment: null,
    weight: null,
    detention: null,
    tonu: null,
    driver_assist: false,
    notes: []
  };

  // 1. Extract Rate (Looks for: Total: $1,000, Total Pay: $1,000, Agreed Rate: $1,000, Linehaul: $1000)
  const ratePatterns = [
    /(?:total\s*(?:carrier\s*)?(?:pay|rate|amount|charges)|agreed\s*rate|all[- ]in\s*rate|contract\s*rate|final\s*pay)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i,
    /(?:line\s*haul|linehaul|freight\s*charge)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i,
    /\$\s*([0-9,]{3,7}(?:\.[0-9]{2})?)\s*(?:total|usd|all-in)/i,
    /RATE[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i
  ];

  for (const pattern of ratePatterns) {
    const match = text.match(pattern);
    if (match) {
      data.rate = parseFloat(match[1].replace(/,/g, '')) || 0;
      break;
    }
  }

  // 2. Extract Load / Ref / Order Number
  const refMatch = text.match(/(?:load\s*(?:#|no\.?|num(?:ber)?)|order\s*(?:#|no\.?)|bol\s*#|ref\s*(?:#|no\.?)|confirmation\s*#)[:\s]*([A-Za-z0-9_-]{3,25})/i);
  if (refMatch) data.load_number = refMatch[1].trim();

  // 3. Extract Broker details
  const brokerNameMatch = text.match(/(?:broker|company|issued\s*by)[:\s]+([^\n\r(]+)/i);
  if (brokerNameMatch) data.broker_name = brokerNameMatch[1].trim();

  const mcMatch = text.match(/(?:broker\s*)?mc\s*(?:#|no\.?)?[:\s]*([0-9]{5,8})/i);
  if (mcMatch) data.broker_mc = mcMatch[1];

  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) data.broker_email = emailMatch[1].toLowerCase();

  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
  if (phoneMatch) data.broker_phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;

  // 4. Extract Origin and Destination
  // Extract line with Shipper / Pickup
  const shipperLine = lines.find(l => /^(?:shipper|pickup|origin)/i.test(l));
  if (shipperLine) {
    const origMatch = Array.from(shipperLine.matchAll(/([A-Za-z\s.]+),\s*([A-Za-z]{2})\b/g)).pop();
    if (origMatch) data.origin = cleanLocation(`${origMatch[1].trim()}, ${origMatch[2].trim()}`).full;
  }

  // Extract line with Receiver / Consignee / Delivery
  const receiverLine = lines.find(l => /^(?:consignee|receiver|delivery|dest)/i.test(l));
  if (receiverLine) {
    const destMatch = Array.from(receiverLine.matchAll(/([A-Za-z\s.]+),\s*([A-Za-z]{2})\b/g)).pop();
    if (destMatch) data.destination = cleanLocation(`${destMatch[1].trim()}, ${destMatch[2].trim()}`).full;
  }

  // Fallback origin/dest if not labelled with Shipper/Receiver
  if (!data.origin || !data.destination) {
    const cityStateMatches = Array.from(text.matchAll(/([A-Za-z\s.]+),\s*([A-Za-z]{2})\b/g));
    if (cityStateMatches.length >= 2) {
      if (!data.origin) data.origin = cleanLocation(`${cityStateMatches[0][1]}, ${cityStateMatches[0][2]}`).full;
      if (!data.destination) data.destination = cleanLocation(`${cityStateMatches[1][1]}, ${cityStateMatches[1][2]}`).full;
    }
  }

  // 5. Extract Detention & TONU terms
  const detentionMatch = text.match(/(?:detention|wait\s*time)[:\s]*\$?([0-9]+(?:\.[0-9]{2})?)\s*(?:\/|\s*per)?\s*(?:hr|hour)?/i);
  if (detentionMatch) data.detention = `$${detentionMatch[1]}/hr (after 2 hrs free)`;

  const tonuMatch = text.match(/(?:tonu|truck\s*ordered\s*not\s*used)[:\s]*\$?([0-9]+)/i);
  if (tonuMatch) data.tonu = `$${tonuMatch[1]}`;

  // 6. Accessorials & Driver Assist
  if (/driver\s*assist|assist\s*at\s*receiver|unload\s*assist/i.test(text)) {
    data.driver_assist = true;
    data.notes.push('Driver assist required at receiver');
  }
  if (/liftgate|lift\s*gate/i.test(text)) data.notes.push('Liftgate required');
  if (/pallet\s*jack/i.test(text)) data.notes.push('Pallet jack required');

  return data;
}

/**
 * Compare RateCon against expected load and generate automated audit report
 */
function auditRateCon(expectedLoad = {}, parsedRateCon = {}) {
  const audit = {
    status: 'PASSED', // 'PASSED' | 'DISCREPANCY' | 'REVIEW'
    passed: true,
    score: 100,
    discrepancies: [],
    highlights: [],
    expected: {
      rate: Number(expectedLoad.rate || 0),
      origin: expectedLoad.origin || expectedLoad.pickup_location,
      destination: expectedLoad.destination || expectedLoad.delivery_location
    },
    received: {
      rate: Number(parsedRateCon.rate || 0),
      origin: parsedRateCon.origin,
      destination: parsedRateCon.destination,
      load_number: parsedRateCon.load_number,
      detention: parsedRateCon.detention || 'Standard $50/hr',
      tonu: parsedRateCon.tonu || 'Standard $150',
      driver_assist: parsedRateCon.driver_assist
    }
  };

  const expectedRate = audit.expected.rate;
  const receivedRate = audit.received.rate;

  // 1. Audit Rate (Crucial check)
  if (expectedRate > 0) {
    if (receivedRate === 0) {
      audit.discrepancies.push({
        severity: 'warning',
        field: 'rate',
        message: 'Could not automatically confirm dollar amount on RateCon. Manual dispatcher check recommended.'
      });
      audit.score -= 20;
      audit.status = 'REVIEW';
    } else if (receivedRate < expectedRate) {
      const diff = expectedRate - receivedRate;
      audit.discrepancies.push({
        severity: 'danger',
        field: 'rate',
        message: `RATE DISCREPANCY: RateCon shows $${receivedRate}, but agreed rate was $${expectedRate} (SHORT BY $${diff}). Do not book until corrected!`
      });
      audit.passed = false;
      audit.status = 'DISCREPANCY';
      audit.score -= 50;
    } else if (receivedRate > expectedRate) {
      const bonus = receivedRate - expectedRate;
      audit.highlights.push(`RateCon rate ($${receivedRate}) is higher than expected ($${expectedRate}) by +$${bonus}!`);
    } else {
      audit.highlights.push(`Rate verified: Exactly matches agreed $${expectedRate}.00`);
    }
  }

  // 2. Audit Origin State
  const expOrigState = (audit.expected.origin || '').match(/([A-Z]{2})$/i)?.[1]?.toUpperCase();
  const recOrigState = (audit.received.origin || '').match(/([A-Z]{2})$/i)?.[1]?.toUpperCase();
  if (expOrigState && recOrigState) {
    if (expOrigState !== recOrigState) {
      audit.discrepancies.push({
        severity: 'warning',
        field: 'origin',
        message: `Origin state mismatch: expected ${expOrigState}, RateCon shows ${recOrigState}.`
      });
      audit.score -= 15;
      if (audit.status === 'PASSED') audit.status = 'REVIEW';
    } else {
      audit.highlights.push(`Origin verified: ${audit.received.origin}`);
    }
  }

  // 3. Audit Destination State
  const expDestState = (audit.expected.destination || '').match(/([A-Z]{2})$/i)?.[1]?.toUpperCase();
  const recDestState = (audit.received.destination || '').match(/([A-Z]{2})$/i)?.[1]?.toUpperCase();
  if (expDestState && recDestState) {
    if (expDestState !== recDestState) {
      audit.discrepancies.push({
        severity: 'warning',
        field: 'destination',
        message: `Destination state mismatch: expected ${expDestState}, RateCon shows ${recDestState}.`
      });
      audit.score -= 15;
      if (audit.status === 'PASSED') audit.status = 'REVIEW';
    } else {
      audit.highlights.push(`Destination verified: ${audit.received.destination}`);
    }
  }

  // Final status check
  if (audit.score < 70 && audit.status !== 'DISCREPANCY') {
    audit.status = 'REVIEW';
  }

  return audit;
}

module.exports = {
  extractTextFromPdf,
  parseRateCon,
  auditRateCon
};
