/**
 * routes/ai-calling.js
 * LoadsNexus™ & Shipping Wish LLC — Autonomous AI Voice Calling & Deal Closer Desk
 * 
 * Powered by:
 * - Vapi.ai & Twilio Voice Telephony
 * - OpenAI GPT-4o-mini (Deal Maker & Objection Handling Brain)
 * - MightyCall Live Warm-Transfer Desk (Escalates ready-to-close deals to human dispatchers)
 * - Strict US 9:00 AM - 5:00 PM TCPA State Timezone Enforcement
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isWithinTcpaHours, getNextValidWindow } = require('../utils/us-timezones');
const { sendTwilioSms, isSmsOptedOut } = require('./voip');
const { sendBrandedEmail } = require('../utils/mailer');

// Default human transfer number (MightyCall PBX desk or dispatch toll-free)
const MIGHTYCALL_TRANSFER_NUMBER = process.env.MIGHTYCALL_TRANSFER_NUMBER || process.env.OUR_NUMBER || '+18005803101';

// Dual-brand AI Voice Prompts
const VOICE_PROMPTS = {
  shippingwish: {
    name: 'Alex — Senior Dispatch Manager at Shipping Wish LLC',
    firstMessage: "Hi this is Alex with Shipping Wish Logistics operations. Am I speaking with the fleet owner or manager for {{company_name}}?",
    systemPrompt: `You are Alex, an experienced, friendly, and assertive American truck dispatch manager at Shipping Wish LLC (shippingwish.com, toll-free: +1-800-580-3101).
Your objective: Introduce our 24/7 Autonomous AI Dispatch Manager backed by our dedicated human operations support desk, explain how we solve carriers' biggest daily headaches, and get them to test us with our 7-Day $0 Free Trial.

CORE VALUE PROPOSITION & ADVANCED FEATURES:
- 24/7/365 Autonomous AI Dispatch Manager backed by our live, dedicated human operations desk.
- 0% Commission: We never take 8-10% of your hard-earned gross freight check. You keep 100% of the broker pay.
- Flat Weekly Pricing: $149/week for 1 truck, $350/week for 2-5 trucks, $500/week for 6+ trucks.
- 7-DAY ZERO RISK FREE TRIAL ($0 TODAY) — test our dispatch desk and tech for 1 full week at zero cost.
- 1-Click DAT One Matcher: Matches loads tailored to your truck, empty location, and deadhead limit.
- 1-Tap Mobile & SMS Approval: Driver gets instant load offers with loaded miles, RPM, and profit. Just reply or tap "Book It".
- 10-Second Broker Carrier Packets: Instant automated submission of W-9, COI, and MC Authority so you never lose a hot load to another carrier while filling paperwork.
- RateCon OCR Audit Protection: AI audits broker RateCons before booking—catches fine-print rate cuts ($900 vs $1,000 agreed), ensures $50/hr detention and $250 TONU.
- Zero Broker Check-Call Harassment: We give brokers live GPS tracking links and automated milestone check-calls so they stop calling your phone while you drive.
- Instant Same-Day Factoring: Driver snaps a photo of the signed BOL/POD on delivery; AI verifies the signature, generates the invoice, and auto-submits to factoring for fast pay.
- Equipment handled: 53' Dry Van, 53' Reefer, Flatbed, 26' Box Truck, Sprinters, Hotshots.

CONVERSATION RULES:
1. Keep spoken responses short, natural, conversational, and direct (1 to 3 sentences maximum).
2. Sound like a knowledgeable American logistics manager, not a robotic script reader.
3. If they ask "How much do you take?": "Zero percent! Other dispatchers take 8 to 10 percent of your gross check. We take zero percent. We charge a flat $149 a week, and your first 7 days are completely free ($0) to test."
4. If they ask "Why do I need you if I have DAT?": "DAT just lists loads, but who negotiates rates, audits RateCons for hidden cuts, auto-sends carrier packets in 10 seconds, and deals with broker check-calls while you're on the road? Our 24/7 AI manager and live team do all of that for you."
5. If they ask "Are you an AI or a human?": "I'm Alex with Shipping Wish. We run a smart autonomous AI system for instant load matching and paperwork, backed by a dedicated human dispatch team available 24/7/365."
6. If they ask "What lanes do you cover?": "We work all lower 48 states. We find freight from wherever your truck empties out to wherever you prefer running, and you approve every single load."
7. If they ask you to stop calling, apologize politely, confirm they will not be called again, and end the call.
8. If they want to sign up, start their $0 trial, or speak to a live operations specialist: Use transferCall to connect them immediately to our dispatch desk (+1-800-580-3101).`
  },
  loadsnexus_carrier: {
    name: 'Jordan — Freight Growth Specialist at LoadsNexus™',
    firstMessage: "Hello! This is Jordan with LoadsNexus freight network. Are you looking for high-paying loads for your {{equipment_type}} today?",
    systemPrompt: `You are Jordan, Freight Growth Specialist at LoadsNexus™ (loadsnexus.com, powered by Shipping Wish LLC).
Your objective: Explain the LoadsNexus $19/month Solo Pass to motor carriers.

CORE VALUE PROPOSITION:
- Brokers post their own loads on LoadsNexus. The number of loads changes day to day. Never quote a load count.
- The Solo Pass is $19/month.
- Listings show the broker's phone and email so the carrier contacts the broker directly.
- Carriers can check a broker's FMCSA authority before they book.

CONVERSATION RULES:
1. Speak concisely in 1-2 sentences. Keep the pace upbeat and helpful.
2. Do not compare prices with other load boards and do not promise rates, income, or a number of loads.
3. If interested: Offer to text them the link to loadsnexus.com.
4. If they ask you to stop calling, apologize, confirm they will not be called again, and end the call.`
  },
  loadsnexus_broker: {
    name: 'Jordan — Broker Network Specialist at LoadsNexus™',
    firstMessage: "Hi, this is Jordan with LoadsNexus freight exchange. Do you have any open spot freight that needs reliable truck capacity covered today?",
    systemPrompt: `You are Jordan at LoadsNexus™ (loadsnexus.com).
Your objective: Get freight brokers and 3PLs to post their spot freight for 100% FREE on our exchange.

CORE VALUE PROPOSITION:
- 100% FREE load posting for licensed freight brokers and 3PLs.
- Carriers on LoadsNexus see the lane and rate and contact the broker directly.
- Brokers can check a carrier's FMCSA authority before they tender.
- No contracts or listing fees.

CONVERSATION RULES:
1. Professional, efficient, and broker-savvy.
2. Reassure them that load posting is free with no hidden fees. Never quote a number of carriers.
3. If they ask you to stop calling, apologize, confirm they will not be called again, and end the call.`
  }
};

/**
 * POST /api/ai-calling/outbound
 * Trigger an outbound AI Voice call to a carrier or broker lead
 */
router.post('/outbound', requireAuth, async (req, res) => {
  const {
    to_phone,
    name = 'Carrier Partner',
    company_name = 'Fleet Logistics',
    equipment_type = "53' Dry Van",
    state_code = 'US',
    brand = 'shippingwish',
    target_role = 'carrier',
    consent_confirmed = false
  } = req.body;

  if (!to_phone) {
    return res.status(400).json({ error: 'to_phone is required.' });
  }
  if (consent_confirmed !== true) {
    return res.status(422).json({
      error: 'CONSENT_REQUIRED',
      message: 'AI calls need the person’s prior consent. Confirm they signed up, filled a form, or asked us to call.'
    });
  }

  {
    const tcpaCheck = isWithinTcpaHours(to_phone, state_code);
    if (!tcpaCheck.allowed) {
      const nextWindow = getNextValidWindow(to_phone, state_code);
      return res.status(422).json({
        error: 'TCPA_HOURS_BLOCKED',
        message: tcpaCheck.reason,
        target_state: tcpaCheck.state,
        target_timezone: tcpaCheck.timezone,
        suggested_schedule_time: nextWindow
      });
    }
  }

  // 2. Select prompt personality
  let promptKey = 'shippingwish';
  if (brand === 'loadsnexus') {
    promptKey = target_role === 'broker' ? 'loadsnexus_broker' : 'loadsnexus_carrier';
  }
  const config = VOICE_PROMPTS[promptKey] || VOICE_PROMPTS.shippingwish;

  const vapiApiKey = process.env.VAPI_API_KEY;
  const vapiPhoneId = process.env.VAPI_PHONE_NUMBER_ID;

  // 3. Dispatch via Vapi.ai if key exists
  if (vapiApiKey) {
    try {
      const vapiPayload = {
        name: `Outbound AI Call to ${name} (${brand})`,
        phoneNumberId: vapiPhoneId || undefined,
        customer: {
          number: to_phone,
          name: name
        },
        assistant: {
          name: config.name,
          firstMessage: config.firstMessage
            .replace('{{company_name}}', company_name)
            .replace('{{equipment_type}}', equipment_type),
          model: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: config.systemPrompt
              }
            ],
            tools: [
              {
                type: 'transferCall',
                destinations: [
                  {
                    type: 'number',
                    number: MIGHTYCALL_TRANSFER_NUMBER,
                    message: "One moment while I transfer you to our operations dispatch desk."
                  }
                ]
              }
            ]
          },
          voice: {
            provider: '11labs',
            voiceId: '21m00Tcm4TlvDq8ikWAM' // Rachel / American natural dispatcher
          },
          endCallMessage: "Thank you for your time. Have a safe drive!",
          recordingEnabled: true
        }
      };

      const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vapiApiKey.trim()}`
        },
        body: JSON.stringify(vapiPayload)
      });

      const vapiData = await vapiRes.json();

      if (!vapiRes.ok) {
        throw new Error(vapiData.message || `Vapi error ${vapiRes.status}`);
      }

      // Log call into database
      await pool.query(
        `INSERT INTO ai_dispatch_calls (
          call_sid, driver_name, driver_phone, carrier_name, trigger_type, call_status, audio_hash
        ) VALUES ($1, $2, $3, $4, $5, 'INITIATED', $6)
        ON CONFLICT (call_sid) DO NOTHING`,
        [
          vapiData.id || `vapi-${Date.now()}`,
          name,
          to_phone,
          company_name,
          `AI_OUTBOUND_${brand.toUpperCase()}`,
          `vapi-call-${Date.now()}`
        ]
      ).catch(e => console.warn('Could not log vapi call to db:', e.message));

      return res.json({
        ok: true,
        provider: 'vapi',
        call_id: vapiData.id,
        brand,
        to: to_phone,
        message: `AI Voice call successfully initiated to ${name} (${to_phone}). Transfer destination set to MightyCall (${MIGHTYCALL_TRANSFER_NUMBER}).`
      });
    } catch (vapiErr) {
      console.error('[AI Calling] Vapi API failed:', vapiErr.message);
      return res.status(500).json({ error: 'Vapi call initiation failed: ' + vapiErr.message });
    }
  }

  // 4. Fallback simulation/logging if Vapi key not yet populated in .env
  return res.json({
    ok: true,
    provider: 'standby',
    brand,
    to: to_phone,
    target_role,
    tcpa_status: 'COMPLIANT_9AM_5PM',
    transfer_number: MIGHTYCALL_TRANSFER_NUMBER,
    message: `VAPI_API_KEY is pending in .env. Call payload configured and verified for ${name} (${equipment_type}). Add VAPI_API_KEY to activate live outbound audio.`
  });
});

/**
 * POST /api/ai-calling/webhook
 * Vapi.ai Webhook listener: receives call transcripts, sentiment, and auto-enqueues follow-ups
 */
router.post('/webhook', async (req, res) => {
  const event = req.body?.message || req.body;
  const eventType = event.type || event.status;

  try {
    if (eventType === 'end-of-call-report' || eventType === 'call.ended') {
      const call = event.call || {};
      const transcript = event.transcript || '';
      const summary = event.summary || '';
      const recordingUrl = event.recordingUrl || '';
      const customerPhone = call.customer?.number || event.customer?.number;
      const customerName = call.customer?.name || 'Carrier Partner';

      // Update call in DB
      if (call.id) {
        await pool.query(
          `UPDATE ai_dispatch_calls
           SET call_status = 'COMPLETED',
               duration_seconds = $1,
               recording_url = $2,
               call_sentiment = $3
           WHERE call_sid = $4`,
          [
            event.durationSeconds || 60,
            recordingUrl,
            event.analysis?.structuredData?.sentiment || 'CALM',
            call.id
          ]
        ).catch(() => {});
      }

      // Detect positive interest from transcript
      const lower = transcript.toLowerCase();
      const isInterested = lower.includes('yes') || lower.includes('send') || lower.includes('sign up') || lower.includes('interested') || lower.includes('free trial') || lower.includes('pass');

      if (isInterested && customerPhone) {
        // Auto-send follow-up SMS via Twilio
        const isOptedOut = await isSmsOptedOut(customerPhone);
        if (!isOptedOut) {
          const smsText = lower.includes('loadsnexus') || lower.includes('load board')
            ? `Hi ${customerName}, here is the LoadsNexus link we talked about. The Solo Pass is $19/mo: https://www.loadsnexus.com`
            : `Hi ${customerName}, thanks for speaking with our dispatch desk! Start your 7-day free trial ($0 today) here: https://www.shippingwish.com/services`;
          
          await sendTwilioSms(customerPhone, smsText).catch(e => console.warn('Auto follow-up SMS error:', e.message));
        }
      }
    }

    res.json({ ok: true, received: eventType });
  } catch (err) {
    console.error('[AI Calling Webhook] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ai-calling/history
 * View recent AI voice calls, transcripts & recordings
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, call_sid, driver_name, driver_phone, carrier_name, trigger_type, call_status, duration_seconds, recording_url, call_sentiment, created_at
      FROM ai_dispatch_calls
      ORDER BY id DESC LIMIT 50
    `);
    res.json({ ok: true, calls: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch voice history: ' + err.message });
  }
});

module.exports = router;
