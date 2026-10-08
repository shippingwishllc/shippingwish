/**
 * utils/campaign-auto-responder.js
 * 100% Autonomous Omnichannel Campaign Auto-Responder Desk
 * 
 * Channels Handled:
 * 1. Cold Email Campaigns (Inbound reply from carrier / broker via Resend)
 * 2. Twilio SMS Outreach (Instant SMS deal-closer reply)
 * 3. Twilio / Meta WhatsApp Outreach (Rich WhatsApp instant reply)
 * 4. Vapi.ai Voice Call Campaigns (Instant post-call SMS & Email packet dispatch)
 * 
 * Powered by OpenAI GPT-4o-mini + Shipping Wish Carrier Knowledge Base
 */

const pool = require('../db');
const { sendBrandedEmail, getResend } = require('./mailer');
const { sendTwilioSms, sendTwilioWhatsApp } = require('../routes/voip');
const { notifyAdmins, createNotification } = require('./notifications');

const CARRIER_PACKET_URL = 'https://www.shippingwish.com/carrier-setup';
const TRIAL_URL = 'https://www.shippingwish.com/services';
const LOADSNEXUS_URL = 'https://www.loadsnexus.com';
const DISPATCH_PHONE = '+1 (917) 737-0021';

/**
 * Call OpenAI Mini for fast, reliable auto-reply generation
 */
async function callAiBrain(messages, maxTokens = 450, temperature = 0.3) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

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
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn('[CAMPAIGN AUTO-RESPONDER] OpenAI fetch error:', err.message);
    return null;
  }
}

/**
 * 1. Handle Inbound Campaign Email Reply
 */
async function handleCampaignEmailReply({ fromEmail, subject, bodyText, leadId = null }) {
  const cleanFrom = String(fromEmail || '').trim().toLowerCase();
  const text = String(bodyText || '').trim();
  if (!cleanFrom || !text) return { handled: false, reason: 'missing_content' };

  // Avoid replying to automated mailer-daemons, bounces, DMARC reports, or noreply addresses
  if (
    cleanFrom.includes('dmarc') ||
    cleanFrom.includes('noreply') ||
    cleanFrom.includes('no-reply') ||
    cleanFrom.includes('mailer-daemon') ||
    cleanFrom.includes('postmaster') ||
    cleanFrom.includes('notifications@') ||
    cleanFrom.includes('squareup.com')
  ) {
    return { handled: false, reason: 'automated_sender_ignored' };
  }

  // Check if lead opted out or replied STOP
  const lowerText = text.toLowerCase();
  if (lowerText === 'stop' || lowerText === 'unsubscribe' || lowerText.includes('remove me') || lowerText.includes('take me off')) {
    await pool.query(`INSERT INTO unsubscribes (email, reason) VALUES ($1, 'email stop') ON CONFLICT (email) DO NOTHING`, [cleanFrom]);
    if (leadId) {
      await pool.query(`UPDATE crm_leads SET status = 'lost' WHERE id = $1`, [leadId]).catch(() => {});
    }
    return { handled: true, action: 'unsubscribed' };
  }

  // Lookup lead details
  let lead = null;
  if (leadId) {
    const r = await pool.query(`SELECT * FROM crm_leads WHERE id = $1`, [leadId]);
    if (r.rows.length) lead = r.rows[0];
  }
  if (!lead) {
    const r = await pool.query(`SELECT * FROM crm_leads WHERE lower(email) = $1 ORDER BY id DESC LIMIT 1`, [cleanFrom]);
    if (r.rows.length) lead = r.rows[0];
  }

  const companyName = lead?.company_name || 'Carrier Partner';
  const ownerName = lead?.owner_name || 'Fleet Owner';
  const equipment = lead?.equipment_type || "53' Dry Van";

  // Classify intent & generate customized reply
  const prompt = `A motor carrier replied to our outreach campaign:
From: ${cleanFrom}
Company: ${companyName}
Owner: ${ownerName}
Equipment: ${equipment}
Subject: ${subject}
Message Body:
"${text}"

Your task:
1. Classify intent:
   - "request_packet" (carrier wants packet, setup form, agreement)
   - "pricing_inquiry" (how much do you charge, what are your rates, commission)
   - "trial_inquiry" (how does 7-day free trial work)
   - "equipment_inquiry" (asking about box truck, reefer, flatbed lanes)
   - "general_interest" (wants more info, call me, sounds good)
   - "not_interested" (no thanks, covered, don't need dispatch)

2. If interested, generate a persuasive, professional HTML email reply:
   - 0% Commission (we never take 8-10% of gross check, carrier keeps 100% of broker gross pay)
   - Flat weekly pricing: $149/wk (1 truck), $350/wk (2-5 trucks), $500/wk (fleet)
   - 7-DAY ZERO RISK FREE TRIAL ($0 TODAY) — test us for 1 full week at zero cost
   - 10-Second Carrier Packet setup: ${CARRIER_PACKET_URL}
   - Free Trial signup: ${TRIAL_URL}
   - Dedicated 24/7 Operations Desk Phone: ${DISPATCH_PHONE}
   - Address the carrier by name warmly.

Respond in strict JSON:
{
  "intent": "request_packet" | "pricing_inquiry" | "trial_inquiry" | "equipment_inquiry" | "general_interest" | "not_interested",
  "should_reply": true | false,
  "reply_subject": "string",
  "reply_html": "string",
  "reply_text": "string"
}`;

  const aiRes = await callAiBrain([
    { role: 'system', content: 'You are Alex, Senior Operations Director at Shipping Wish LLC. Return valid JSON only.' },
    { role: 'user', content: prompt }
  ], 600, 0.2);

  let plan = null;
  try {
    if (aiRes) plan = JSON.parse(aiRes.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch (e) {
    console.warn('[CAMPAIGN AUTO-RESPONDER] JSON parse note:', e.message);
  }

  if (!plan || !plan.should_reply) {
    return { handled: false, reason: 'ai_decided_no_reply' };
  }

  const replySubj = plan.reply_subject || (/^re:/i.test(subject) ? subject : `Re: ${subject || 'Shipping Wish Dispatch Services'}`);
  const replyHtml = plan.reply_html || `
    <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;">
      <p>Hi ${ownerName},</p>
      <p>Thank you for getting back to us! At Shipping Wish LLC, we assign a dedicated 24/7 dispatch manager to your fleet with <strong>0% commission</strong>—you keep 100% of the broker freight check, and we charge a flat $149/week.</p>
      <p>Your first 7 days are completely <strong>FREE ($0 today)</strong> to test our load booking, rate negotiation, and RateCon auditing.</p>
      <p style="margin:24px 0;">
        <a href="${CARRIER_PACKET_URL}" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Complete Carrier Packet &rarr;</a>
        &nbsp;&nbsp;
        <a href="${TRIAL_URL}" style="background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Start 7-Day Free Trial ($0) &rarr;</a>
      </p>
      <p>Feel free to call our dispatch desk directly at <strong>${DISPATCH_PHONE}</strong>.</p>
      <p>Best regards,<br><strong>Shipping Wish Operations Desk</strong><br>shippingwish.com</p>
    </div>
  `;
  const replyText = plan.reply_text || `Hi ${ownerName}, Thanks for reaching out. Shipping Wish provides 24/7 dedicated dispatch for 0% commission ($149/wk flat). Try 7 days free ($0 today): ${TRIAL_URL} or complete our packet: ${CARRIER_PACKET_URL}. Call us at ${DISPATCH_PHONE}.`;

  // Dispatch email via Resend
  const sent = await sendBrandedEmail({
    to: cleanFrom,
    subject: replySubj,
    html: replyHtml,
    text: replyText,
    from: 'Shipping Wish Operations <operations@shippingwish.com>',
    emailType: 'campaign_ai_auto_reply',
    templateKey: 'campaign_ai_auto_reply'
  });

  // Log in email_logs
  await pool.query(`
    INSERT INTO email_logs (
      lead_id, recipient_email, subject, email_type, status, resend_id, from_email, body_text
    ) VALUES ($1, $2, $3, 'ai_campaign_reply', 'sent', $4, 'operations@shippingwish.com', $5)
  `, [lead?.id || null, cleanFrom, replySubj, sent?.data?.id || null, replyText]).catch(() => {});

  // Update CRM lead
  if (lead?.id) {
    const newStatus = plan.intent === 'request_packet' ? 'packet_sent' : 'interested';
    await pool.query(`
      UPDATE crm_leads
      SET status = $2, last_reply_at = now(), updated_at = now()
      WHERE id = $1
    `, [lead.id, newStatus]).catch(() => {});
  }

  await notifyAdmins(
    `🤖 AI Auto-Replied to Carrier: ${companyName}`,
    `Email reply dispatched to ${cleanFrom} (Intent: ${plan.intent})`,
    'success',
    '/inbox.html'
  ).catch(() => {});

  return { handled: true, action: 'sent', intent: plan.intent, to: cleanFrom };
}

/**
 * 2. Handle Inbound Campaign SMS Reply
 */
async function handleCampaignSmsReply({ fromPhone, incomingText, lead = null }) {
  const cleanPhone = String(fromPhone || '').replace(/^whatsapp:/, '').trim();
  const text = String(incomingText || '').trim();
  if (!cleanPhone || !text) return null;

  const { generateSmsReply } = require('./ai-deal-maker');
  const replyText = await generateSmsReply({
    fromPhone: cleanPhone,
    incomingText: text,
    leadInfo: lead || {}
  });

  if (replyText) {
    await sendTwilioSms(cleanPhone, replyText);
    return { replied: true, text: replyText };
  }
  return null;
}

/**
 * 3. Handle Inbound Campaign WhatsApp Reply
 */
async function handleCampaignWhatsAppReply({ fromPhone, incomingText, lead = null }) {
  const cleanPhone = String(fromPhone || '').replace(/^whatsapp:/, '').trim();
  const text = String(incomingText || '').trim();
  if (!cleanPhone || !text) return null;

  const prompt = `A carrier messaged our WhatsApp desk: "${text}".
Carrier: ${lead?.company_name || 'Carrier'}, Equipment: ${lead?.equipment_type || 'Truck'}.
Generate a friendly, concise WhatsApp reply (max 200 words).
Include bullet points:
- 0% Commission (keep 100% broker gross)
- $149/wk flat rate
- 7-Day Free Trial ($0 today): ${TRIAL_URL}
- Onboarding Packet: ${CARRIER_PACKET_URL}
- Phone: ${DISPATCH_PHONE}`;

  const replyText = await callAiBrain([
    { role: 'system', content: 'You are Alex with Shipping Wish Logistics. Output clean WhatsApp message with emojis.' },
    { role: 'user', content: prompt }
  ], 200, 0.3) || `Hello! Thanks for contacting Shipping Wish. We offer 24/7 dedicated dispatch with 0% commission ($149/wk flat). Start your 7-day free trial ($0 today) at ${TRIAL_URL} or complete your carrier packet at ${CARRIER_PACKET_URL}. Call us: ${DISPATCH_PHONE}`;

  await sendTwilioWhatsApp(cleanPhone, replyText);
  return { replied: true, text: replyText };
}

/**
 * 4. Handle Vapi AI Voice Call Follow-Up
 */
async function handleVapiVoiceFollowUp({ customerPhone, customerName, transcript, leadEmail = null }) {
  if (!customerPhone) return;
  const cleanPhone = String(customerPhone).trim();

  // Instant follow-up SMS
  const smsText = `Hi ${customerName || 'Partner'}, thanks for speaking with Alex at Shipping Wish! Start your 7-Day Free Trial ($0 today) here: ${TRIAL_URL} or complete packet: ${CARRIER_PACKET_URL}. Call us 24/7 at ${DISPATCH_PHONE}`;
  await sendTwilioSms(cleanPhone, smsText).catch(() => {});

  // If lead email is known, dispatch onboarding packet email immediately
  if (leadEmail && leadEmail.includes('@')) {
    await sendBrandedEmail({
      to: leadEmail,
      subject: `Your 7-Day Free Dispatch Trial & Carrier Packet — Shipping Wish LLC`,
      html: `
        <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;">
          <p>Hi ${customerName || 'Carrier Partner'},</p>
          <p>Thank you for taking our call today! As discussed, here is your direct link to start our <strong>7-Day Zero-Risk Free Trial ($0 Today)</strong> and lock in dedicated 24/7 truck dispatch for your fleet.</p>
          <p style="margin:20px 0;">
            <a href="${CARRIER_PACKET_URL}" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Complete Digital Carrier Packet &rarr;</a>
          </p>
          <p>We look forward to booking high-paying loads for your equipment!</p>
          <p>Best regards,<br>Shipping Wish Operations Team<br>${DISPATCH_PHONE}</p>
        </div>
      `,
      text: `Hi ${customerName}, thanks for taking our call! Start your 7-day free trial and complete your carrier packet here: ${CARRIER_PACKET_URL}. Phone: ${DISPATCH_PHONE}`,
      from: 'Shipping Wish Operations <operations@shippingwish.com>',
      emailType: 'voice_call_packet_followup'
    }).catch(() => {});
  }

  await notifyAdmins(
    `📞 Voice Call Follow-Up Sent: ${customerName || cleanPhone}`,
    `Automated SMS & Packet dispatched after voice call conversation.`,
    'info',
    '/crm-sales.html'
  ).catch(() => {});
}

module.exports = {
  handleCampaignEmailReply,
  handleCampaignSmsReply,
  handleCampaignWhatsAppReply,
  handleVapiVoiceFollowUp,
  CARRIER_PACKET_URL,
  TRIAL_URL,
  DISPATCH_PHONE
};
