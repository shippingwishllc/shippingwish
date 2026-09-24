/**
 * AI Deal Maker & Autonomous Closer Engine
 * Powered by OpenAI gpt-4o-mini
 * 
 * Supports dual-brand sales & objection handling:
 * 1. ShippingWish LLC: 24/7 Truck Dispatch & Operations Desk (7-day free trial, high RPM, keep 100% pay)
 * 2. LoadsNexus™: Next-Gen AI Freight Load Board ($19/mo carrier plan, free broker load posting, anti-double-brokering, DTP credit ratings)
 */

const pool = require('../db');

const SHIPPINGWISH_SYSTEM_PROMPT = `You are Alex, an elite truck dispatch manager and operations specialist at Shipping Wish LLC (shippingwish.com, phone: +1 917-737-0021).
Your mission: Help U.S. motor carriers and owner-operators make more money per mile, eliminate deadhead, and guide them to start their 7-Day $0 Free Trial.

CORE VALUE PROPOSITION:
- Dedicated 24/7 personal dispatcher assigned to each carrier.
- We aggressively negotiate top spot rates with brokers (average $3.00+/mile).
- Invoicing, broker setup packets, detention collection, and RateCon review included.
- Carrier keeps 100% of broker gross pay directly (no percentage taken from freight checks).
- Pricing is a flat weekly retainer: $149/wk (1 truck), $350/wk (2-5 trucks), $500/wk (fleet).
- 7-DAY FREE TRIAL ($0 TODAY) — test our dispatch desk for 1 week at zero cost!
- Zero forced dispatch — carrier always has final say on loads.
- Equipment handled: 53' Dry Van, 53' Reefer, Flatbed, 26' Box Truck (under 10,000 lbs payload), Sprinters, Hotshots.

OBJECTION HANDLING:
- "Why should I pay a dispatcher?": "Most carriers lose $800-$1,500/wk by booking low spot rates or deadheading. Our desk pays for itself on your first load. Plus test us free for 7 days."
- "Do you take 8% or 10%?": "Never! We charge a flat weekly retainer ($149/wk). You keep 100% of your freight money directly from the broker."
- "I only have a box truck": "We specialize in 26' box truck freight across high-demand corridors (Midwest, Southeast, Texas) with 5,000-9,500 lbs payloads."
- "Is it really free?": "Yes, 7 days completely free ($0 today). If you don't love our loads, cancel before week 2 and pay $0."`;

const LOADSNEXUS_SYSTEM_PROMPT = `You are Jordan, Senior Freight Network Specialist at LoadsNexus™ (loadsnexus.com, powered by Shipping Wish LLC).
Your mission: Onboard motor carriers to the $19/mo AI load board, and onboard freight brokers/shippers to post loads for FREE with anti-double-brokering protection.

CORE VALUE PROPOSITION FOR CARRIERS:
- Only $19/month (DAT One is $45-$150/mo, Truckstop is $40-$150/mo). Free if carrier uses ShippingWish dispatch!
- Real Broker Days-To-Pay (DTP) credit ratings and $75,000 BMC-84 bond checks on every load.
- Instant Carrier Lane Alerts via SMS and Email matching your exact corridor & equipment.
- 100% verified freight — Zero double-brokering scams or ghost loads.
- Instant 1-click Rate Confirmation PDF generator.
- Equipment: 53' Dry Van, 53' Reefer, Flatbed, 26' Box Truck, Cargo Van, Power Only, Hotshot.

CORE VALUE PROPOSITION FOR BROKERS:
- 100% FREE load posting to thousands of vetted carriers.
- Automated Anti-Double-Brokering Guard checks carrier MC authority & FMCSA safety in real-time.
- Instant digital carrier onboarding & RateCon signing.

OBJECTION HANDLING:
- "Why should I switch from DAT?": "LoadsNexus is only $19/mo, gives you real broker Days-To-Pay credit scores, instant Twilio SMS lane alerts, and protects you from ghost freight."
- "Is broker posting really free?": "Yes, 100% free spot load posting with instant FMCSA carrier vetting."`;

/**
 * Call OpenAI gpt-4o-mini
 */
async function callOpenAiMini(messages, maxTokens = 250, temperature = 0.3) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!res.ok) {
      console.warn(`[AI Deal Maker] OpenAI error ${res.status}:`, await res.text());
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[AI Deal Maker] Fetch error:', err.message);
    return null;
  }
}

/**
 * Detect brand intent from message text
 */
function detectBrand(text = '', defaultBrand = 'shippingwish') {
  const lower = String(text).toLowerCase();
  if (lower.includes('loadsnexus') || lower.includes('load board') || lower.includes('loadboard') || lower.includes('$19') || lower.includes('post load')) {
    return 'loadsnexus';
  }
  if (lower.includes('dispatch') || lower.includes('shipping wish') || lower.includes('shippingwish') || lower.includes('manager') || lower.includes('free trial')) {
    return 'shippingwish';
  }
  return defaultBrand;
}

/**
 * Generate intelligent SMS reply for an inbound carrier inquiry
 * Strict requirement: Output <= 160 characters (1 SMS segment) for 100% delivery + STOP footer
 */
async function generateSmsReply({
  fromPhone,
  incomingText,
  leadInfo = {},
  brand = null
}) {
  const selectedBrand = brand || detectBrand(incomingText, 'shippingwish');
  const isLoadsNexus = selectedBrand === 'loadsnexus';

  const systemPrompt = isLoadsNexus ? LOADSNEXUS_SYSTEM_PROMPT : SHIPPINGWISH_SYSTEM_PROMPT;

  const userPrompt = `A motor carrier sent this SMS: "${incomingText}".
Carrier Info: Company: ${leadInfo.company_name || 'Carrier'}, Equipment: ${leadInfo.equipment_type || "Truck"}, State: ${leadInfo.state || "US"}.

Generate a friendly, high-converting, deal-closing SMS reply.
MANDATORY RULES:
1. Length: MAXIMUM 140 CHARACTERS (excluding the STOP footer).
2. Directly answer their question or overcome their objection.
3. Include clear Call-To-Action (e.g., visit shippingwish.com or loadsnexus.com).
4. Tone: Helpful, professional American truck dispatcher.
5. DO NOT include "Reply STOP to opt out" in your output; the system will append it automatically.`;

  const aiReply = await callOpenAiMini([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 80, 0.3);

  if (aiReply) {
    let clean = aiReply.replace(/reply stop to opt out/gi, '').trim();
    if (clean.length > 135) clean = clean.slice(0, 132) + '...';
    return clean;
  }

  // Fallback if OpenAI is unavailable
  if (isLoadsNexus) {
    return `LoadsNexus has verified spot loads with real broker credit scores. Get started for only $19/mo at https://www.loadsnexus.com`;
  }
  return `Shipping Wish provides 24/7 dedicated dispatch & top spot rates. Try 7 days free ($0 today): https://www.shippingwish.com`;
}

/**
 * Generate high-converting Email reply for an inbound carrier or broker inquiry
 */
async function generateEmailReply({
  fromEmail,
  subject,
  incomingBody,
  leadInfo = {},
  brand = 'shippingwish'
}) {
  const isLoadsNexus = brand === 'loadsnexus';
  const systemPrompt = isLoadsNexus ? LOADSNEXUS_SYSTEM_PROMPT : SHIPPINGWISH_SYSTEM_PROMPT;

  const userPrompt = `Inbound Email from: ${fromEmail}
Subject: ${subject}
Message Body:
"${incomingBody}"

Lead Details: Name: ${leadInfo.owner_name || 'Fleet Manager'}, Company: ${leadInfo.company_name || 'Motor Carrier'}, Equipment: ${leadInfo.equipment_type || '53ft Dry Van'}.

Generate a complete, professional, high-converting sales email reply:
1. Address the sender warmly by name if known.
2. Directly answer all questions and overcome objections with clarity.
3. Highlight key differentiators (e.g. 7-day free trial or $19/mo AI load board).
4. Include a clear closing call to action with a link.
5. Professional sign-off.
Format response as clean HTML body (paragraphs and bullet points).`;

  const aiHtml = await callOpenAiMini([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 500, 0.3);

  if (aiHtml) {
    return {
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      html: aiHtml,
      text: aiHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    };
  }

  // Fallback email
  if (isLoadsNexus) {
    return {
      subject: `Re: ${subject} — LoadsNexus™ AI Load Board`,
      html: `<p>Hi ${leadInfo.owner_name || 'Partner'},</p><p>Thank you for reaching out to LoadsNexus™. Our AI freight exchange connects verified motor carriers with top-paying spot freight starting at just $19/month.</p><p><a href="https://www.loadsnexus.com" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Access Live LoadsNexus™ Exchange &rarr;</a></p><p>Best regards,<br>LoadsNexus™ Team<br>https://www.loadsnexus.com</p>`,
      text: `Hi, LoadsNexus AI freight exchange connects verified carriers with top spot freight for $19/mo. Visit https://www.loadsnexus.com`
    };
  }

  return {
    subject: `Re: ${subject} — Shipping Wish Dedicated Truck Dispatch`,
    html: `<p>Hi ${leadInfo.owner_name || 'Carrier Partner'},</p><p>Thank you for contacting Shipping Wish LLC. We assign a dedicated 24/7 manager to your fleet to book high-paying spot loads, handle all broker negotiations, and provide full TMS software—with $0 due today on your 7-day free trial.</p><p><a href="https://www.shippingwish.com/services" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Start Your 7-Day Free Week ($0) &rarr;</a></p><p>Best regards,<br>Shipping Wish Operations Desk<br>+1 (917) 737-0021<br>https://www.shippingwish.com</p>`,
    text: `Hi, Shipping Wish provides dedicated 24/7 truck dispatch. Try 7 days free at https://www.shippingwish.com or call +1 917-737-0021.`
  };
}

/**
 * AI Carrier Negotiation Copilot:
 * Helps a carrier evaluate a load and negotiate with a broker for higher pay.
 */
async function generateCarrierNegotiationCopilot({
  loadDetails,
  carrierDetails = {}
}) {
  const {
    origin, destination, miles, rate, rpm, equipment_type, weight, broker_name
  } = loadDetails;

  const currentRate = Number(rate) || 2000;
  const currentMiles = Number(miles) || 600;
  const currentRpm = Number(rpm) || (currentRate / currentMiles);

  const targetRate = Math.round(currentRate * 1.12 / 25) * 25; // Target ~12% increase rounded to $25
  const targetRpm = (targetRate / currentMiles).toFixed(2);

  const prompt = `You are an elite freight broker negotiator working on behalf of a motor carrier.
Load Details:
- Corridor: ${origin} ➔ ${destination}
- Equipment: ${equipment_type}
- Weight: ${weight}
- Miles: ${currentMiles} mi
- Broker's Listed Rate: $${currentRate} ($${currentRpm.toFixed(2)}/mi)
- Broker Name: ${broker_name || 'Freight Broker'}

Carrier Request: Wants to negotiate up to $${targetRate} ($${targetRpm}/mi).

Generate:
1. A concise phone call pitch script the carrier can read directly to the broker.
2. A ready-to-send SMS or email message to the broker offering immediate capacity for $${targetRate}.
3. 3 strong negotiating leverage points (e.g. clean equipment, immediate loading, clean FMCSA safety record, deadhead justification).

Output valid JSON:
{
  "recommended_bid": ${targetRate},
  "recommended_rpm": "${targetRpm}",
  "profit_estimate": {
    "gross_revenue": ${targetRate},
    "est_fuel_cost": ${Math.round(currentMiles / 6.5 * 3.85)},
    "est_net_profit": ${targetRate - Math.round(currentMiles / 6.5 * 3.85)}
  },
  "phone_script": "string",
  "broker_email_text": "string",
  "leverage_points": ["point 1", "point 2", "point 3"]
}`;

  const aiJson = await callOpenAiMini([
    { role: 'system', content: 'You are an expert freight rate negotiation analyst. Always return strict valid JSON.' },
    { role: 'user', content: prompt }
  ], 600, 0.2);

  try {
    if (aiJson) {
      return JSON.parse(aiJson.replace(/```json/gi, '').replace(/```/g, '').trim());
    }
  } catch (e) {
    console.warn('[AI Deal Maker] JSON parse error in negotiation copilot:', e.message);
  }

  // Fallback calculation
  const estFuel = Math.round(currentMiles / 6.5 * 3.85);
  return {
    recommended_bid: targetRate,
    recommended_rpm: targetRpm,
    profit_estimate: {
      gross_revenue: targetRate,
      est_fuel_cost: estFuel,
      est_net_profit: targetRate - estFuel
    },
    phone_script: `Hi ${broker_name || 'Dispatch'}, I have a clean ${equipment_type} empty and ready near ${origin}. We can pick up on time and deliver direct to ${destination} for $${targetRate} all-in. Can you lock that in and send the RateCon?`,
    broker_email_text: `Hi ${broker_name || 'Dispatch'},\n\nWe have immediate ${equipment_type} capacity near ${origin} for your load to ${destination}. Ready to roll today.\n\nOur rate is $${targetRate} all-in ($${targetRpm}/mi). Please confirm and send Rate Confirmation.\n\nThank you,\nCarrier Dispatch Desk`,
    leverage_points: [
      `Immediate empty capacity ready at ${origin}`,
      `Guaranteed on-time pickup and direct single-driver transit to ${destination}`,
      `Zero cargo claims record and $100k cargo insurance verified`
    ]
  };
}

module.exports = {
  detectBrand,
  generateSmsReply,
  generateEmailReply,
  generateCarrierNegotiationCopilot,
  SHIPPINGWISH_SYSTEM_PROMPT,
  LOADSNEXUS_SYSTEM_PROMPT
};
