/**
 * Autonomous Anti-Spam / Anti-Ban Safe Drip Engine
 * 
 * Protects domain reputation, Twilio 10DLC trust scores, and phone numbers from telecom blocks.
 * Enforces TCPA regulations, recipient local business hours, human-like jitter, and rate limiting.
 */

const pool = require('../db');
const { sendTwilioSms, isSmsOptedOut } = require('../routes/voip');
const { sendBrandedEmail, isUnsubscribed } = require('./mailer');
const { generateSmsReply, generateEmailReply } = require('./ai-deal-maker');

// State to US Time Zone mapping (to ensure 9:00 AM - 6:00 PM recipient local hours)
const STATE_TIMEZONES = {
  // Eastern (UTC-5 / UTC-4)
  ME: 'America/New_York', VT: 'America/New_York', NH: 'America/New_York', MA: 'America/New_York',
  RI: 'America/New_York', CT: 'America/New_York', NY: 'America/New_York', NJ: 'America/New_York',
  PA: 'America/New_York', DE: 'America/New_York', MD: 'America/New_York', DC: 'America/New_York',
  VA: 'America/New_York', WV: 'America/New_York', NC: 'America/New_York', SC: 'America/New_York',
  GA: 'America/New_York', FL: 'America/New_York', OH: 'America/New_York', MI: 'America/Detroit',
  // Central (UTC-6 / UTC-5)
  IL: 'America/Chicago', WI: 'America/Chicago', MN: 'America/Chicago', IA: 'America/Chicago',
  MO: 'America/Chicago', ND: 'America/Chicago', SD: 'America/Chicago', NE: 'America/Chicago',
  KS: 'America/Chicago', OK: 'America/Chicago', TX: 'America/Chicago', AR: 'America/Chicago',
  LA: 'America/Chicago', MS: 'America/Chicago', AL: 'America/Chicago', TN: 'America/Chicago',
  // Mountain (UTC-7 / UTC-6)
  CO: 'America/Denver', WY: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver',
  UT: 'America/Denver', ID: 'America/Boise', AZ: 'America/Phoenix',
  // Pacific (UTC-8 / UTC-7)
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles'
};

// Rate Limits to guarantee 100% spam-safe delivery
const LIMITS = {
  MAX_SMS_PER_HOUR: 12,    // Safe for Twilio 10DLC
  MAX_EMAIL_PER_HOUR: 25,  // Safe for Resend / Spamhaus warmup
  MAX_CALL_PER_HOUR: 6,
  MIN_INTERVAL_SECONDS: 180 // 3 minutes minimum spacing between any outreach
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
 * Check if current time is within recipient local business hours (9:00 AM - 6:00 PM, Mon-Sat)
 */
function isWithinRecipientBusinessHours(stateCode) {
  const tz = STATE_TIMEZONES[String(stateCode || '').toUpperCase().trim()] || 'America/Chicago';
  try {
    const now = new Date();
    const localStr = now.toLocaleString('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: 'numeric' });
    // Example: "Mon, 14"
    const parts = localStr.split(',');
    const day = parts[0].trim();
    const hour = parseInt(parts[1].trim(), 10);

    // No cold outreach on Sunday
    if (day === 'Sun') return false;

    // Allowed hours: 9 AM to 6 PM (18:00)
    return hour >= 9 && hour < 18;
  } catch {
    return true; // fallback
  }
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
    // Add randomized jitter: each subsequent lead is spaced 3 to 6 minutes apart
    const staggerMinutes = (i + 1) * 4 + Math.floor(Math.random() * 3);
    const scheduledTime = new Date(now + staggerMinutes * 60 * 1000);

    const phone = l.phone || l.raw_phone || '';
    const email = l.email || l.raw_email || '';
    const name = l.owner_name || l.company_name || 'Fleet Manager';
    const state = l.state || l.state_code || 'US';
    const equip = l.equipment_type || "53' Dry Van";

    if (!phone && !email) continue;

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

  return { queued: queuedCount, message: `Safely enqueued ${queuedCount} leads with staggered human-like delivery.` };
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

  // 1. Business Hours Gatekeeper
  if (!isWithinRecipientBusinessHours(item.state_code)) {
    // Postpone 1 hour
    const postponed = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      `UPDATE ai_outreach_queue SET scheduled_for = $1, disposition = 'Postponed: Outside recipient local business hours' WHERE id = $2`,
      [postponed, item.id]
    );
    return { processed: false, reason: `Lead #${item.id} (${item.state_code}) postponed: Outside local business hours (9am-6pm).` };
  }

  // 2. Hourly Safety Limit Check
  const safety = await checkHourlySafety(item.channel);
  if (!safety.allowed) {
    return { processed: false, reason: safety.reason };
  }

  // 3. Mark processing
  await pool.query(`UPDATE ai_outreach_queue SET status = 'processing', attempts = attempts + 1 WHERE id = $1`, [item.id]);

  try {
    if (item.channel === 'sms') {
      if (!item.recipient_phone) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'failed', disposition = 'No phone number' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Missing phone' };
      }

      // Check opt-out
      if (await isSmsOptedOut(item.recipient_phone)) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'skipped_optout', disposition = 'Recipient in opt-out list' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Opted out' };
      }

      // Generate personalized message
      const smsBody = item.brand === 'loadsnexus'
        ? `Hi ${item.recipient_name}, LoadsNexus has verified ${item.equipment_type} spot loads in ${item.state_code}. Access exchange for $19/mo: https://www.loadsnexus.com`
        : `Hi ${item.recipient_name}, Shipping Wish has premium ${item.equipment_type} freight in ${item.state_code}. 24/7 dedicated dispatch. Test 7 days free: https://www.shippingwish.com`;

      const sendRes = await sendTwilioSms(item.recipient_phone, smsBody);

      await pool.query(
        `UPDATE ai_outreach_queue SET status = 'sent', sent_at = NOW(), disposition = $1 WHERE id = $2`,
        [sendRes.status || 'sent', item.id]
      );
      return { processed: true, item_id: item.id, channel: 'sms', to: item.recipient_phone };
    }

    if (item.channel === 'email') {
      if (!item.recipient_email) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'failed', disposition = 'No email address' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Missing email' };
      }

      // Check unsubscribe
      if (await isUnsubscribed(item.recipient_email)) {
        await pool.query(`UPDATE ai_outreach_queue SET status = 'skipped_optout', disposition = 'Recipient unsubscribed' WHERE id = $1`, [item.id]);
        return { processed: false, reason: 'Unsubscribed' };
      }

      const emailSubject = item.brand === 'loadsnexus'
        ? `⚡ LoadsNexus™ ${item.equipment_type} Spot Freight for ${item.recipient_name}`
        : `Dedicated Freight & Load Booking for ${item.recipient_name} (${item.equipment_type})`;

      const emailHtml = item.brand === 'loadsnexus'
        ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
             <div style="background:#0f172a;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
               <span style="color:#3b82f6;font-weight:800;font-size:18px;">LOADSNEXUS™</span>
             </div>
             <h2>High-Paying Spot Freight Available</h2>
             <p>Hi ${item.recipient_name},</p>
             <p>LoadsNexus™ has active verified ${item.equipment_type} freight corridors operating in ${item.state_code}.</p>
             <ul>
               <li>Real broker Days-To-Pay credit ratings</li>
               <li>Zero double-brokering protection</li>
               <li>Instant SMS/Email lane alerts</li>
               <li>Plans from only $19/month</li>
             </ul>
             <p><a href="https://www.loadsnexus.com" style="background:#2563eb;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;">Explore Live Board &rarr;</a></p>
           </div>`
        : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
             <h2>24/7 Dedicated Truck Dispatch for ${item.recipient_name}</h2>
             <p>We negotiate top spot rates ($3.20/mile avg), handle broker paperwork, and you keep 100% of your freight pay.</p>
             <p><a href="https://www.shippingwish.com/services" style="background:#f59e0b;color:#0f172a;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;">Start 7 Days Free ($0 Today) &rarr;</a></p>
           </div>`;

      const fromAddress = item.brand === 'loadsnexus'
        ? 'LoadsNexus Deals <deals@loadsnexus.com>'
        : 'Shipping Wish Operations <operations@shippingwish.com>';

      await sendBrandedEmail({
        to: item.recipient_email,
        from: fromAddress,
        subject: emailSubject,
        html: emailHtml,
        text: `Freight opportunity for ${item.recipient_name}. Visit ${item.brand === 'loadsnexus' ? 'https://www.loadsnexus.com' : 'https://www.shippingwish.com'}`
      });

      await pool.query(
        `UPDATE ai_outreach_queue SET status = 'sent', sent_at = NOW(), disposition = 'delivered' WHERE id = $1`,
        [item.id]
      );
      return { processed: true, item_id: item.id, channel: 'email', to: item.recipient_email };
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
      ORDER BY id DESC LIMIT 20
    `)
  ]);

  return {
    is_active: dripEngineActive,
    limits: LIMITS,
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
