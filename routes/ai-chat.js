/**
 * routes/ai-chat.js
 * 24/7 Interactive AI Support Chatbot Engine for Shipping Wish LLC & LoadsNexus™
 * Powered by OpenAI GPT-4o-mini
 */

const express = require('express');
const router = express.Router();

const SYSTEM_PROMPTS = {
  shippingwish: `You are Alex, the friendly and knowledgeable 24/7 Operations & Dispatch Assistant at Shipping Wish LLC (shippingwish.com).
Your goal: Help truck drivers, owner-operators, and fleet owners understand our truck dispatch services, answer questions, and encourage them to test our 7-Day $0 Free Trial.

COMPANY FACTS & DETAILS:
- Company Name: Shipping Wish LLC
- Office Address: 19266 Coastal Hwy, Rehoboth Beach, DE 19971
- Phone / Dispatch Desk: +1 (800) 580-3101 (Toll-Free, 24/7)
- Email: dispatch@shippingwish.com
- Pricing: Flat weekly retainer ($149/week for 1 truck, $350/week for 2-5 trucks).
- ZERO PERCENTAGE COMMISSION: The carrier keeps 100% of their freight checks directly from brokers. We never touch their money or take 8-10%.
- 7-DAY ZERO-RISK FREE TRIAL ($0 TODAY): New carriers can test our dedicated dispatch operations for 1 full week at zero cost. Cancel anytime before week 2 with zero penalties.
- Equipment Supported: 53' Dry Van, 53' Reefer, Flatbed / Step Deck, 26' Box Truck (under 10,000 lbs payload), Cargo Vans / Sprinters, Hotshot trailers, Power Only.
- Corridors & Lanes: Nationwide across all 50 US states, with strong high-paying freight in Midwest, Southeast, Texas, and East Coast corridors. Average gross: $7,500 - $12,000+ per week per truck ($3.00 - $4.50+ / mile).
- Back-Office Services: Dedicated personal dispatcher (no random call center), broker setup packets, Rate Confirmation reviews, unpaid detention collection, factoring setup, and quarterly IFTA fuel tax calculations.

GUIDELINES:
1. Always be polite, professional, encouraging, and helpful like a seasoned US freight dispatcher.
2. Keep responses concise, readable, and structured with bullet points where helpful.
3. If the user has a complex billing issue or wants to speak to a human dispatcher right now, advise them to call our toll-free line: +1 (800) 580-3101 or email dispatch@shippingwish.com.
4. Format markdown links naturally when relevant (e.g. [Start 7-Day Free Trial](https://www.shippingwish.com/services)).`,

  loadsnexus: `You are Jordan, the 24/7 Senior Freight Specialist and Support Copilot at LoadsNexus™ (loadsnexus.com, an enterprise freight product operated by Shipping Wish LLC).
Your goal: Assist motor carriers, owner-operators, and freight brokers with finding spot freight, understanding our $19/mo Carrier Pass, and posting loads for free.

COMPANY FACTS & DETAILS:
- Platform: LoadsNexus™ (Operated by Shipping Wish LLC)
- Headquarters: 19266 Coastal Hwy, Rehoboth Beach, DE 19971
- Toll-Free Phone: +1 (800) 580-3101
- Support Email: support@loadsnexus.com · Deals: deals@loadsnexus.com
- Carrier Subscription: Only $19/month (unlimited searches, direct unmasked broker contacts, RateCon downloads, and AI rate negotiation copilot). Zero contracts, cancel anytime with 1 click.
- Broker Load Posting: 100% FREE for licensed freight brokers and 3PLs with active FMCSA authority and BMC-84 bond.
- Anti-Double-Brokering: Proprietary 3-tier security guard checking real-time FMCSA authority, physical addresses, and IP telemetry.
- Days-To-Pay (DTP): Verified broker payment health scores (e.g. 16-18 days average DTP, A+ rating) displayed on every load.
- Equipment Supported: 53' Dry Van, 53' Reefer, Flatbed, 26' Box Truck, Cargo Van, Power Only, Hotshot.

GUIDELINES:
1. Be fast, direct, tech-savvy, and freight-literate.
2. If a carrier asks how to unlock loads: Explain that the top 3 loads are free to preview, and full broker contacts & RateCon downloads unlock for just $19/month at [loadsnexus.com](https://www.loadsnexus.com/?action=checkout).
3. If a broker wants to post: Direct them to [Post Free Freight](https://www.loadsnexus.com/?action=post-load).
4. If they need live phone support, provide our toll-free line: +1 (800) 580-3101.`
};

// Simple in-memory rate limiting: 30 messages per IP per 5 minutes
const chatRateLimitMap = new Map();
function isChatRateLimited(ip) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const max = 30;
  const record = chatRateLimitMap.get(ip) || [];
  const valid = record.filter(t => now - t < windowMs);
  valid.push(now);
  chatRateLimitMap.set(ip, valid);
  return valid.length > max;
}

/**
 * POST /api/chat/message
 */
router.post('/message', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';

  if (isChatRateLimited(ip)) {
    return res.status(429).json({
      error: 'RATE_LIMITED',
      reply: "You've sent quite a few messages! Please give our dispatch desk a moment or call us directly at +1 (800) 580-3101."
    });
  }

  const { message, brand = 'shippingwish', history = [] } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.json({
      ok: true,
      reply: brand === 'loadsnexus'
        ? "Thank you for reaching out to LoadsNexus™! Our AI freight exchange connects motor carriers with verified spot loads for $19/month, and brokers can post 100% free. For instant assistance, please call our toll-free support line at +1 (800) 580-3101 or email support@loadsnexus.com."
        : "Thank you for contacting Shipping Wish LLC! We provide dedicated 24/7 truck dispatch for a flat $149/wk with a 7-day $0 free trial. To speak with our dispatch team immediately, please call our toll-free desk at +1 (800) 580-3101 or email dispatch@shippingwish.com."
    });
  }

  const selectedPrompt = brand === 'loadsnexus' ? SYSTEM_PROMPTS.loadsnexus : SYSTEM_PROMPTS.shippingwish;

  // Build message history (capped at last 8 turns)
  const cleanHistory = (Array.isArray(history) ? history.slice(-8) : []).map(h => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: String(h.content || '').slice(0, 800)
  }));

  const messagesPayload = [
    { role: 'system', content: selectedPrompt },
    ...cleanHistory,
    { role: 'user', content: message.trim().slice(0, 1000) }
  ];

  try {
    const fetch = globalThis.fetch || require('node-fetch');
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messagesPayload,
        max_tokens: 450,
        temperature: 0.4
      })
    });

    if (!openAiRes.ok) {
      const errText = await openAiRes.text();
      console.warn('[AI Chat] OpenAI error:', openAiRes.status, errText);
      throw new Error(`OpenAI responded with status ${openAiRes.status}`);
    }

    const data = await openAiRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "Thank you for your message. Our operations desk is available 24/7 at +1 (800) 580-3101.";

    res.json({
      ok: true,
      reply,
      brand
    });
  } catch (err) {
    console.error('[AI Chat] Error processing chat message:', err.message);
    res.json({
      ok: true,
      reply: brand === 'loadsnexus'
        ? "I am currently connecting to our live freight stream. You can search live loads at [loadsnexus.com](https://www.loadsnexus.com) or call our desk directly at +1 (800) 580-3101."
        : "I am connecting with our dispatch desk. You can explore our dedicated dispatch services and start your 7-day free trial at [shippingwish.com/services](https://www.shippingwish.com/services) or call us at +1 (800) 580-3101."
    });
  }
});

module.exports = router;
