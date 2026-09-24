/**
 * utils/ai-safe-drip-engine.js
 * Autonomous Anti-Spam / Anti-Ban Safe Drip Engine
 * 
 * Features:
 * - Enforces strict TCPA 9:00 AM - 5:00 PM local time across all 50 US States & Area Codes
 * - Sunday strictly embargoed
 * - Supports Voice Calls (Vapi / MightyCall), SMS (Twilio 10DLC), and Email (Resend)
 * - Anti-ban drip pacing with randomized human-like jitter (3 to 6 minute delays)
 * - Distinct, high-converting value propositions for Shipping Wish LLC vs LoadsNexus™
 */

const pool = require('../db');
const { sendTwilioSms, isSmsOptedOut } = require('../routes/voip');
const { sendBrandedEmail, isUnsubscribed } = require('./mailer');
const { isWithinTcpaHours, getNextValidWindow } = require('./us-timezones');

// Safe rate limits to protect telecom numbers and email domains from spam classification
const LIMITS = {
  MAX_SMS_PER_HOUR: 12,     // 10DLC compliant batching
  MAX_EMAIL_PER_HOUR: 25,   // Inbox reputation warmup
  MAX_CALL_PER_HOUR: 6,     // High-touch conversational calls
  MIN_INTERVAL_SECONDS: 180 // 3 minutes minimum spacing
};

let dripEngineActive = true;

async function ensureDripQueueTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_outreach_queue (
      id SERIAL PRIMARY KEY,
      brand TEXT DEFAULT 'shippingwish',
      channel TEXT NOT NULL,
      target_role TEXT DEFAULT 'carrier',
      recipient_name TEXT,
      recipient_phone TEXT,
      recipient_email TEXT,
      equipment_type TEXT,
      state_code TEXT,
      custom_data JSONB DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      scheduled_for TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      disposition TEXT,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_queue_status_sched ON ai_outreach_queue (status, scheduled_for);
  `).catch(e => console.warn('Drip queue table ensure notice:', e.message));
}

/**
 * Enqueue leads safely with randomized staggered schedule
 */
async function enqueueLeads(leads, options = {}) {
  await ensureDripQueueTable();
  const {
    brand = 'shippingwish',
    channel = 'sms',
    targetRole = 'carrier'
  } = options;

  let queuedCount = 0;
  const now = Date.now();

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    const phone = l.phone || l.raw_phone || '';
    const email = l.email || l.raw_email || '';
    const name = l.owner_name || l.company_name || 'Fleet Manager';
    const state = l.state || l.state_code || 'US';
    const equip = l.equipment_type || "53' Dry Van";

    if (!phone && !email) continue;

    // Check if within TCPA 9 AM - 5 PM recipient local hours
    let scheduledTime;
    const tcpaCheck = isWithinTcpaHours(phone, state);
    if (tcpaCheck.allowed) {
      // Add staggered jitter: 3 to 6 minutes between each lead
      const staggerMinutes = (i + 1) * 4 + Math.floor(Math.random() * 3);
      scheduledTime = new Date(now + staggerMinutes * 60 * 1000);
    } else {
      // Schedule precisely for next valid business morning at 09:15 AM
      scheduledTime = getNextValidWindow(phone, state);
    }

    await pool.query(
      `INSERT INTO ai_outreach_queue (
        brand, channel, target_role, recipient_name, recipient_phone, recipient_email,
        equipment_type, state_code, custom_data, status, scheduled_for
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)`,
      [
        brand,
        channel,
        targetRole,
        name,
        phone,
        email,
        equip,
        state,
        JSON.stringify(l),
        scheduledTime
      ]
    );
    queuedCount++;
  }

  return {
    queued: queuedCount,
    message: `Safely enqueued ${queuedCount} leads with staggered delivery compliant with US 9 AM - 5 PM local business hours.`
  };
}

/**
 * Check hourly rate limits
 */
async function checkHourlySafety(channel) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const res = await pool.query(
    `SELECT COUNT(*) as count FROM ai_outreach_queue WHERE channel = $1 AND status = 'sent' AND sent_at >= $2`,
    [channel, oneHourAgo]
  );
  const count = parseInt(res.rows[0]?.count, 10) || 0;

  if (channel === 'sms' && count >= LIMITS.MAX_SMS_PER_HOUR) {
    return { allowed: false, reason: `Hourly SMS limit reached (${count}/${LIMITS.MAX_SMS_PER_HOUR}). Throttling to protect telecom reputation.` };
  }
  if (channel === 'email' && count >= LIMITS.MAX_EMAIL_PER_HOUR) {
    return { allowed: false, reason: `Hourly Email limit reached (${count}/${LIMITS.MAX_EMAIL_PER_HOUR}). Throttling to protect inbox delivery.` };
  }
  if (channel === 'call' && count >= LIMITS.MAX_CALL_PER_HOUR) {
    return { allowed: false, reason: `Hourly Voice Call limit reached (${count}/${LIMITS.MAX_CALL_PER_HOUR}). Throttling to maintain high live response rate.` };
  }
  return { allowed: true, currentCount: count };
}

/**
 * Process a single drip queue tick safely
 */
async function processDripQueueTick() {
  if (!dripEngineActive) {
    return { processed: false, reason: 'Drip engine is currently paused by admin.' };
  }

  await ensureDripQueueTable();

  // Find next pending item scheduled for <= NOW()
  const candidateRes = await pool.query(
    `SELECT * FROM ai_outreach_queue
     WHERE status = 'pending' AND scheduled_for <= NOW()
     ORDER BY scheduled_for ASC LIMIT 1`
  );

  if (!candidateRes.rows.length) {
    return { processed: false, reason: 'No pending outreach leads due at this moment.' };
  }

  const item = candidateRes.rows[0];

  // 1. Strict TCPA Business Hours Gatekeeper (9:00 AM - 5:00 PM recipient local time)
  const tcpaCheck = isWithinTcpaHours(item.recipient_phone, item.state_code);
  if (!tcpaCheck.allowed) {
    const nextWindow = getNextValidWindow(item.recipient_phone, item.state_code);
    await pool.query(
      `UPDATE ai_outreach_queue SET scheduled_for = $1, disposition = $2 WHERE id = $3`,
      [nextWindow, `Postponed: ${tcpaCheck.reason}`, item.id]
    );
    return {
      processed: false,
      reason: `Lead #${item.id} (${tcpaCheck.state}) postponed to ${nextWindow.toISOString()}: ${tcpaCheck.reason}`
    };
  }

  // 2. Hourly Safety Limit Check
  const safety = await checkHourlySafety(item.channel);
  if (!safety.allowed) {
    return { processed: false, reason: safety.reason };
  }

  // 3. Mark processing
  await pool.query(`UPDATE ai_outreach_queue SET status = 'processing', attempts = attempts + 1 WHERE id = $1`, [item.id]);

  try {
    // ---------- A. SMS OUTREACH CHANNEL ----------
    if (item.channel === 'sms') {
      if (!item.recipient_phone) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'failed', disposition = 'No phone number' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Missing phone' };
      }

      if (await isSmsOptedOut(item.recipient_phone)) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'skipped_optout', disposition = 'Recipient opted out' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Opted out' };
      }

      // High-converting, brand-specific message (<150 chars + STOP)
      const smsBody = item.brand === 'loadsnexus'
        ? (item.target_role === 'broker'
            ? `Hi ${item.recipient_name}, post freight 100% free with verified anti-double-brokering protection at LoadsNexus: https://www.loadsnexus.com`
            : `Hi ${item.recipient_name}, LoadsNexus has top-dollar ${item.equipment_type} spot loads & verified broker credit scores for $19/mo: https://www.loadsnexus.com`)
        : `Hi ${item.recipient_name}, Shipping Wish provides dedicated 24/7 truck dispatch. Avg $8.5k/wk gross. Test 7 days free ($0 today): https://www.shippingwish.com`;

      const sendRes = await sendTwilioSms(item.recipient_phone, smsBody);

      await pool.query(
        `UPDATE ai_outreach_queue SET status = 'sent', sent_at = NOW(), disposition = $1 WHERE id = $2`,
        [sendRes.status || 'sent', item.id]
      );
      return { processed: true, item_id: item.id, channel: 'sms', to: item.recipient_phone };
    }

    // ---------- B. EMAIL OUTREACH CHANNEL ----------
    if (item.channel === 'email') {
      if (!item.recipient_email) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'failed', disposition = 'No email address' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Missing email' };
      }

      if (await isUnsubscribed(item.recipient_email)) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'skipped_optout', disposition = 'Recipient unsubscribed' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Unsubscribed' };
      }

      const isLn = item.brand === 'loadsnexus';
      const isBroker = item.target_role === 'broker';

      let emailSubject = '';
      let emailHtml = '';
      let fromAddress = '';

      if (isLn) {
        fromAddress = 'LoadsNexus Deals <deals@loadsnexus.com>';
        if (isBroker) {
          emailSubject = `Cover Spot Freight Fast (100% Free) — LoadsNexus™ Anti-Double-Brokering Exchange`;
          emailHtml = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
              <div style="background:#0f172a;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
                <span style="color:#3b82f6;font-weight:800;font-size:18px;">LOADSNEXUS™</span>
                <span style="color:#94a3b8;font-size:12px;margin-left:8px;">by Shipping Wish LLC</span>
              </div>
              <h2 style="color:#0f172a;font-size:20px;margin-top:0;">Post Freight Free &amp; Eliminate Double-Brokering</h2>
              <p>Hi ${item.recipient_name},</p>
              <p>Are you looking for verified motor carrier capacity for your ${item.equipment_type} shipments? LoadsNexus™ allows licensed freight brokers to post spot freight <strong>100% free</strong> with zero listing fees.</p>
              <ul style="color:#334155;line-height:1.6;">
                <li><strong>Proprietary Anti-Double-Brokering Guard:</strong> Real-time FMCSA authority checks, IP telemetry, and authorized dispatch verification.</li>
                <li><strong>50,000+ Vetted Motor Carriers:</strong> Instant capacity matches across all 50 states.</li>
                <li><strong>1-Click Digital RateCon:</strong> Seamless automated booking workflow.</li>
              </ul>
              <div style="margin:25px 0;">
                <a href="https://www.loadsnexus.com/?action=post-load" style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Post Free Spot Freight &rarr;</a>
              </div>
              <p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px;">
                Shipping Wish LLC (dba LoadsNexus™) · 19266 Coastal Hwy, Rehoboth Beach, DE 19971 · Phone: +1 (800) 580-3101
              </p>
            </div>
          `;
        } else {
          emailSubject = `⚡ Verified ${item.equipment_type} Spot Loads ($19/mo) — LoadsNexus™ Freight Exchange`;
          emailHtml = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
              <div style="background:#0f172a;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
                <span style="color:#3b82f6;font-weight:800;font-size:18px;">LOADSNEXUS™</span>
                <span style="color:#94a3b8;font-size:12px;margin-left:8px;">by Shipping Wish LLC</span>
              </div>
              <h2 style="color:#0f172a;font-size:20px;margin-top:0;">Access 4,850+ Verified Loads for Only $19/Month</h2>
              <p>Hi ${item.recipient_name},</p>
              <p>Why pay $49 to $149/month for legacy load boards? LoadsNexus™ connects you directly with top spot freight for just <strong>$19/month</strong> with zero commissions.</p>
              <ul style="color:#334155;line-height:1.6;">
                <li><strong>Direct Broker Contacts:</strong> Unmasked dispatch phone numbers and emails.</li>
                <li><strong>Real Days-To-Pay (DTP) Credit Scores:</strong> Know broker payment health before you roll.</li>
                <li><strong>AI Rate Negotiation Copilot:</strong> Counter-offer scripts to maximize your RPM.</li>
                <li><strong>1-Click RateCon PDF:</strong> Download official rate confirmations instantly.</li>
              </ul>
              <div style="margin:25px 0;">
                <a href="https://www.loadsnexus.com/?action=checkout" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Unlock Carrier Pass ($19/mo) &rarr;</a>
              </div>
              <p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px;">
                Shipping Wish LLC (dba LoadsNexus™) · 19266 Coastal Hwy, Rehoboth Beach, DE 19971 · Phone: +1 (800) 580-3101
              </p>
            </div>
          `;
        }
      } else {
        fromAddress = 'Shipping Wish Operations <dispatch@shippingwish.com>';
        emailSubject = `Dedicated 24/7 Truck Dispatch for ${item.recipient_name} — 7-Day $0 Free Trial`;
        emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
            <div style="background:#0f172a;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
              <span style="color:#f59e0b;font-weight:800;font-size:18px;">SHIPPING WISH LLC</span>
              <span style="color:#94a3b8;font-size:12px;margin-left:8px;">24/7 Dedicated Operations Desk</span>
            </div>
            <h2 style="color:#0f172a;font-size:20px;margin-top:0;">Keep Your Trucks Moving at $7,500 – $12,000+ Gross/Week</h2>
            <p>Hi ${item.recipient_name},</p>
            <p>Stop wasting time negotiating with brokers, chasing paperwork, and deadheading. Shipping Wish LLC pairs your fleet with a dedicated 24/7 personal dispatcher.</p>
            <ul style="color:#334155;line-height:1.6;">
              <li><strong>Zero Percentage Cut:</strong> You keep 100% of your freight payments. Flat $149/wk retainer.</li>
              <li><strong>Top Spot Rates:</strong> Aggressive broker negotiations ($3.00 – $4.50+ per mile).</li>
              <li><strong>Complete Back-Office:</strong> Broker packets, RateCon audits, detention collection, and IFTA mileage.</li>
              <li><strong>7-Day Free Trial ($0 Today):</strong> Test our operations desk for a full week with zero obligation.</li>
            </ul>
            <div style="margin:25px 0;">
              <a href="https://www.shippingwish.com/services" style="background:#f59e0b;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Start 7-Day Free Week ($0) &rarr;</a>
            </div>
            <p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px;">
              Shipping Wish LLC · 19266 Coastal Hwy, Rehoboth Beach, DE 19971 · Dispatch Desk: +1 (800) 580-3101
            </p>
          </div>
        `;
      }

      await sendBrandedEmail({
        to: item.recipient_email,
        from: fromAddress,
        subject: emailSubject,
        html: emailHtml,
        text: `Freight opportunity for ${item.recipient_name}. Visit ${isLn ? 'https://www.loadsnexus.com' : 'https://www.shippingwish.com'}`
      });

      await pool.query(
        `UPDATE ai_outreach_queue SET status = 'sent', sent_at = NOW(), disposition = 'delivered' WHERE id = $1`,
        [item.id]
      );
      return { processed: true, item_id: item.id, channel: 'email', to: item.recipient_email };
    }

    // ---------- C. VOICE CALL OUTREACH CHANNEL ----------
    if (item.channel === 'call') {
      if (!item.recipient_phone) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'failed', disposition = 'No phone number' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Missing phone' };
      }

      if (await isSmsOptedOut(item.recipient_phone)) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'skipped_optout', disposition = 'Phone opted out' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Opted out' };
      }

      const vapiApiKey = process.env.VAPI_API_KEY;
      if (vapiApiKey) {
        // Trigger live outbound call via Vapi
        const fetch = globalThis.fetch || require('node-fetch');
        const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${vapiApiKey.trim()}`
          },
          body: JSON.stringify({
            name: `Safe Drip AI Call to ${item.recipient_name}`,
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || undefined,
            customer: {
              number: item.recipient_phone,
              name: item.recipient_name
            },
            assistant: {
              name: item.brand === 'loadsnexus' ? 'Jordan — LoadsNexus Specialist' : 'Alex — Shipping Wish Dispatcher',
              model: {
                provider: 'openai',
                model: 'gpt-4o-mini'
              }
            }
          })
        });

        const vapiData = await vapiRes.json();
        await pool.query(
          `UPDATE ai_outreach_queue SET status = 'sent', sent_at = NOW(), disposition = $1 WHERE id = $2`,
          [vapiData.id ? `vapi:${vapiData.id}` : 'initiated', item.id]
        );
        return { processed: true, item_id: item.id, channel: 'call', vapi_id: vapiData.id };
      } else {
        // Standby log
        await pool.query(
          `UPDATE ai_outreach_queue SET status = 'sent', sent_at = NOW(), disposition = 'logged_standby_vapi_key_pending' WHERE id = $1`,
          [item.id]
        );
        return { processed: true, item_id: item.id, channel: 'call', note: 'Vapi key pending, logged successfully' };
      }
    }
  } catch (err) {
    console.error('[Safe Drip Engine] Processing error:', err);
    await pool.query(
      `UPDATE ai_outreach_queue SET status = 'failed', disposition = $1 WHERE id = $2`,
      [err.message.slice(0, 200), item.id]
    );
    return { processed: false, error: err.message };
  }

  return { processed: false, reason: 'Unsupported channel' };
}

/**
 * Get queue metrics
 */
async function getDripQueueStats() {
  await ensureDripQueueTable();
  const [countsRes, recentRes] = await Promise.all([
    pool.query(`
      SELECT status, channel, COUNT(*) as count
      FROM ai_outreach_queue
      GROUP BY status, channel
    `),
    pool.query(`
      SELECT id, brand, channel, recipient_name, recipient_phone, recipient_email, status, scheduled_for, sent_at, disposition
      FROM ai_outreach_queue
      ORDER BY id DESC LIMIT 25
    `)
  ]);

  return {
    is_active: dripEngineActive,
    limits: LIMITS,
    tcpa_policy: 'Strict US 9:00 AM - 5:00 PM recipient local time (Sunday prohibited)',
    summary: countsRes.rows,
    recent: recentRes.rows
  };
}

module.exports = {
  ensureDripQueueTable,
  enqueueLeads,
  processDripQueueTick,
  getDripQueueStats,
  setDripEngineActive: (active) => { dripEngineActive = Boolean(active); }
};
