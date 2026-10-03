/**
 * utils/driver-assistant.js
 * 
 * Shipping Wish & LoadsNexus — Autonomous AI Driver Assistant & Fleet Lifecycle Engine
 * 
 * Features:
 * 1. Morning Driver Assistant (Timezone-Aware across all US states):
 *    - Loaded Drivers: Morning greeting, destination reminder, safe journey wishes,
 *      and notification that dispatch is already hunting/booking their reload at destination.
 *    - Empty Drivers: Morning check-in asking for current empty ZIP/City & preferred destination.
 * 2. Load Booked / Dispatch Pickup Reminder (When load is created or assigned).
 * 3. In-Transit Journey & Milestone Update (When status changes to in_transit).
 * 4. Delivery Completion & Next Load Auto-Transition (When status changes to delivered/completed).
 * 5. Multi-channel delivery: WhatsApp primary (with approved formatting), automatic SMS fallback.
 * 6. Vapi AI Voice Call hook for autonomous voice check-calls and wake-ups.
 */

const pool = require('../db');
const { resolveTimezone, isWithinTcpaHours } = require('./us-timezones');
const { logSmsMessage, OUR_NUMBER } = require('./sms-inbox');
const { sendTwilioSms, sendTwilioWhatsApp, isSmsOptedOut } = require('../routes/voip');

let schemaEnsured = false;

/**
 * Ensures table exists for tracking driver assistant automation events
 */
async function ensureDriverAssistantSchema() {
  if (schemaEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_automation_events (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER,
        carrier_id INTEGER,
        load_id INTEGER,
        phone TEXT NOT NULL,
        event_type TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'whatsapp',
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_driver_auto_lookup 
        ON driver_automation_events(phone, event_type, created_at DESC);
    `);
    schemaEnsured = true;
  } catch (err) {
    console.warn('[Driver Assistant] Schema ensure note:', err.message);
  }
}

/**
 * Normalizes US phone number
 */
function cleanPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits.length >= 10 ? '+' + digits : '';
}

/**
 * Checks if a specific automation event was already triggered for this phone within N hours
 */
async function wasRecentlySent(phone, eventType, hours = 18) {
  try {
    await ensureDriverAssistantSchema();
    const res = await pool.query(
      `SELECT id FROM driver_automation_events
       WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($1, '\\D', '', 'g'), 10)
         AND event_type = $2
         AND created_at > now() - ($3 || ' hours')::interval
       LIMIT 1`,
      [phone, eventType, hours]
    );
    return res.rows.length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Sends message through WhatsApp with automatic SMS fallback if needed
 */
async function sendAssistantMessage({ phone, body, eventType, driverId = null, carrierId = null, loadId = null, metadata = {} }) {
  const targetPhone = cleanPhone(phone);
  if (!targetPhone) return { status: 'skipped', reason: 'Invalid phone' };
  if (await isSmsOptedOut(targetPhone)) return { status: 'opted_out', reason: 'Phone has opted out' };

  await ensureDriverAssistantSchema();

  let sentChannel = 'whatsapp';
  let deliveryStatus = 'sent';
  let twilioSid = null;
  let finalError = null;

  // 1. Try WhatsApp first
  try {
    const waRes = await sendTwilioWhatsApp(targetPhone, body);
    if (waRes && waRes.status === 'sent') {
      sentChannel = 'whatsapp';
      deliveryStatus = 'sent';
      twilioSid = waRes.sid;
    } else {
      // Fallback to SMS if WhatsApp failed or outside session window
      console.log(`[Driver Assistant] WhatsApp not accepted (${waRes.error || waRes.status}), falling back to SMS for ${targetPhone}`);
      const smsRes = await sendTwilioSms(targetPhone, body);
      sentChannel = 'sms';
      deliveryStatus = smsRes.status || 'sent';
      twilioSid = smsRes.sid;
      finalError = smsRes.error || null;
    }
  } catch (err) {
    console.warn(`[Driver Assistant] Outbound send error, trying SMS:`, err.message);
    try {
      const smsRes = await sendTwilioSms(targetPhone, body);
      sentChannel = 'sms';
      deliveryStatus = smsRes.status || 'sent';
      twilioSid = smsRes.sid;
    } catch (smsErr) {
      deliveryStatus = 'error';
      finalError = smsErr.message;
    }
  }

  // 2. Log in central sms_messages table so it appears in unified Inbox & chat threads
  try {
    await logSmsMessage({
      direction: 'outbound',
      from_number: sentChannel === 'whatsapp' ? (process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:' + OUR_NUMBER) : OUR_NUMBER,
      to_number: sentChannel === 'whatsapp' ? ('whatsapp:' + targetPhone) : targetPhone,
      body,
      disposition: deliveryStatus,
      twilio_sid: twilioSid,
      is_read: true,
      channel: sentChannel
    });
  } catch (logErr) {
    // Non-fatal logging
  }

  // 3. Record in driver_automation_events table
  try {
    await pool.query(
      `INSERT INTO driver_automation_events (
        driver_id, carrier_id, load_id, phone, event_type, channel, message, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        driverId,
        carrierId,
        loadId,
        targetPhone,
        eventType,
        sentChannel,
        body,
        deliveryStatus,
        JSON.stringify({ ...metadata, twilio_sid: twilioSid, error: finalError })
      ]
    );
  } catch (err) {
    console.warn('[Driver Assistant] Event log note:', err.message);
  }

  return { ok: true, status: deliveryStatus, channel: sentChannel, sid: twilioSid };
}

/**
 * Checks whether the recipient's local time is currently within their morning window (7:15 AM to 8:45 AM).
 */
function isLocalMorningWindow(phone, stateCode) {
  const { timezone, state } = resolveTimezone(phone, stateCode);
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric'
    });
    const parts = formatter.formatToParts(now);
    let weekday = '';
    let hour = 0;
    let minute = 0;
    for (const part of parts) {
      if (part.type === 'weekday') weekday = part.value;
      if (part.type === 'hour') hour = parseInt(part.value, 10);
      if (part.type === 'minute') minute = parseInt(part.value, 10);
    }

    // Skip Sunday morning automated check-ins unless urgent
    if (weekday === 'Sun') return false;

    // Morning window: 7:15 AM to 8:45 AM local time
    if ((hour === 7 && minute >= 15) || (hour === 8 && minute <= 45)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 1. Morning Automated Driver Check-in Sweep (Runs periodically in background)
 */
async function runMorningDriverCheckins() {
  await ensureDriverAssistantSchema();

  // A. Fetch active ERP Drivers
  const driversRes = await pool.query(`
    SELECT d.id AS driver_id, d.name AS driver_name, d.phone AS driver_phone, d.status AS driver_status,
           c.id AS carrier_id, c.name AS carrier_name, c.company_name, c.state AS carrier_state
    FROM drivers d
    LEFT JOIN users c ON c.id = d.carrier_id
    WHERE d.phone IS NOT NULL AND TRIM(d.phone) != ''
      AND d.status != 'inactive'
    ORDER BY d.id ASC
  `).catch(() => ({ rows: [] }));

  // B. Fetch ERP Carriers without drivers registered
  const carriersRes = await pool.query(`
    SELECT u.id AS carrier_id, u.name AS carrier_name, u.company_name, u.phone AS carrier_phone, u.state AS carrier_state
    FROM users u
    WHERE u.role IN ('carrier', 'owner_operator', 'fleet_owner')
      AND u.phone IS NOT NULL AND TRIM(u.phone) != ''
      AND NOT EXISTS (
        SELECT 1 FROM drivers d WHERE d.carrier_id = u.id AND d.phone IS NOT NULL
      )
    ORDER BY u.id ASC
  `).catch(() => ({ rows: [] }));

  const targets = [];
  for (const d of driversRes.rows) {
    targets.push({
      driverId: d.driver_id,
      carrierId: d.carrier_id,
      name: d.driver_name || d.company_name || 'Driver',
      phone: d.driver_phone,
      state: d.carrier_state || 'TX'
    });
  }
  for (const c of carriersRes.rows) {
    targets.push({
      driverId: null,
      carrierId: c.carrier_id,
      name: c.company_name || c.carrier_name || 'Fleet Owner',
      phone: c.carrier_phone,
      state: c.carrier_state || 'TX'
    });
  }

  const results = [];

  for (const target of targets) {
    const rawPhone = target.phone;
    if (!rawPhone) continue;

    // Check if recipient is currently in their local 7:15 AM - 8:45 AM morning window
    if (!isLocalMorningWindow(rawPhone, target.state)) {
      continue;
    }

    // Check if already received a morning message today (last 18 hours)
    if (await wasRecentlySent(rawPhone, 'morning_greeting', 18)) {
      continue;
    }

    // Check if driver has an active load (loaded / on route)
    const activeLoadRes = await pool.query(`
      SELECT id, load_number, pickup_location, delivery_location, delivery_date, delivery_time,
             delivery_state, miles, status
      FROM loads
      WHERE (
        ($1::int IS NOT NULL AND driver_id = $1::int)
        OR ($2::int IS NOT NULL AND carrier_id = $2::int)
      )
      AND status IN ('booked', 'assigned', 'dispatched', 'in_transit')
      ORDER BY delivery_date ASC, id DESC
      LIMIT 1
    `, [target.driverId, target.carrierId]).catch(() => ({ rows: [] }));

    const activeLoad = activeLoadRes.rows[0] || null;

    if (activeLoad) {
      // ==========================================
      // SCENARIO 1: DRIVER IS LOADED / IN-TRANSIT
      // ==========================================
      const delLoc = activeLoad.delivery_location || 'Destination';
      const delTime = activeLoad.delivery_time ? ` by ${activeLoad.delivery_time}` : '';
      const delDateStr = activeLoad.delivery_date ? new Date(activeLoad.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today';

      const msg = `🚛 *Good morning, ${target.name}!*

*Load:* #${activeLoad.load_number}
*Destination:* ${delLoc}
*Delivery:* ${delDateStr}${delTime}

Working on your reload now. Drive safe!
Dispatch: (917) 737-0021`;

      const res = await sendAssistantMessage({
        phone: rawPhone,
        body: msg,
        eventType: 'morning_greeting',
        driverId: target.driverId,
        carrierId: target.carrierId,
        loadId: activeLoad.id,
        metadata: { scenario: 'loaded', load_number: activeLoad.load_number }
      });
      results.push({ target: target.name, phone: rawPhone, scenario: 'loaded', res });

    } else {
      // ==========================================
      // SCENARIO 2: DRIVER IS EMPTY / AVAILABLE
      // ==========================================
      const msg = `📍 *Morning Check-in | Shipping Wish*

Good morning, ${target.name}! Empty today?

Reply with your *Current ZIP* and *where you want to go*. Freight is ready!
Dispatch: (917) 737-0021`;

      const res = await sendAssistantMessage({
        phone: rawPhone,
        body: msg,
        eventType: 'morning_greeting',
        driverId: target.driverId,
        carrierId: target.carrierId,
        loadId: null,
        metadata: { scenario: 'empty_checkin' }
      });
      results.push({ target: target.name, phone: rawPhone, scenario: 'empty', res });
    }
  }

  return results;
}

/**
 * 2. Load Booked / Dispatch Pickup Reminder
 * Triggered when a load is created or status set to 'booked' or 'dispatched'
 */
async function onLoadBooked(loadId) {
  if (!loadId) return null;
  await ensureDriverAssistantSchema();

  const { rows } = await pool.query(`
    SELECT l.*, 
           d.name AS driver_name, d.phone AS driver_phone,
           c.name AS carrier_name, c.company_name, c.phone AS carrier_phone
    FROM loads l
    LEFT JOIN drivers d ON d.id = l.driver_id
    LEFT JOIN users c ON c.id = l.carrier_id
    WHERE l.id = $1
  `, [loadId]).catch(() => ({ rows: [] }));

  const load = rows[0];
  if (!load) return null;

  const phone = load.driver_phone || load.carrier_phone;
  if (!phone) return null;

  const recipientName = load.driver_name || load.company_name || 'Driver';
  const pickupTime = load.pickup_time ? ` at ${load.pickup_time}` : '';
  const pickupDateStr = load.pickup_date ? new Date(load.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today';

  const body = `📋 *Load Assigned: #${load.load_number}*

*Pickup:* ${load.pickup_location} (${pickupDateStr}${pickupTime})
*Shipper:* ${load.pickup_company || 'Shipper'}
*Delivery:* ${load.delivery_location}
*Weight:* ${load.weight ? Number(load.weight).toLocaleString() + ' lbs' : 'Standard'}

Reply *CONFIRMED* when rolling. Safe drive!
Dispatch: (917) 737-0021`;

  return sendAssistantMessage({
    phone,
    body,
    eventType: 'load_assigned',
    driverId: load.driver_id,
    carrierId: load.carrier_id,
    loadId: load.id,
    metadata: { load_number: load.load_number }
  });
}

/**
 * 3. In-Transit Journey & Milestone Reminder
 * Triggered when load status transitions to 'in_transit'
 */
async function onLoadInTransit(loadId) {
  if (!loadId) return null;
  await ensureDriverAssistantSchema();

  const { rows } = await pool.query(`
    SELECT l.*, 
           d.name AS driver_name, d.phone AS driver_phone,
           c.name AS carrier_name, c.company_name, c.phone AS carrier_phone
    FROM loads l
    LEFT JOIN drivers d ON d.id = l.driver_id
    LEFT JOIN users c ON c.id = l.carrier_id
    WHERE l.id = $1
  `, [loadId]).catch(() => ({ rows: [] }));

  const load = rows[0];
  if (!load) return null;

  const phone = load.driver_phone || load.carrier_phone;
  if (!phone) return null;

  const recipientName = load.driver_name || load.company_name || 'Driver';
  const delTime = load.delivery_time ? ` by ${load.delivery_time}` : '';
  const delDateStr = load.delivery_date ? new Date(load.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Scheduled';
  const milesText = load.miles ? `\n*Miles:* ${Math.round(Number(load.miles))} mi` : '';

  const body = `🚚 *In-Transit | Load #${load.load_number}*

*To:* ${load.delivery_location}
*Delivery:* ${delDateStr}${delTime}${milesText}

Drive safe! Reply with any road delays or ETA update.
Dispatch: (917) 737-0021`;

  return sendAssistantMessage({
    phone,
    body,
    eventType: 'load_in_transit',
    driverId: load.driver_id,
    carrierId: load.carrier_id,
    loadId: load.id,
    metadata: { load_number: load.load_number }
  });
}

/**
 * 4. Delivery Completed & Next Load Transition
 * Triggered when load status transitions to 'delivered' or 'completed'
 */
async function onLoadDelivered(loadId) {
  if (!loadId) return null;
  await ensureDriverAssistantSchema();

  const { rows } = await pool.query(`
    SELECT l.*, 
           d.name AS driver_name, d.phone AS driver_phone,
           c.name AS carrier_name, c.company_name, c.phone AS carrier_phone
    FROM loads l
    LEFT JOIN drivers d ON d.id = l.driver_id
    LEFT JOIN users c ON c.id = l.carrier_id
    WHERE l.id = $1
  `, [loadId]).catch(() => ({ rows: [] }));

  const load = rows[0];
  if (!load) return null;

  const phone = load.driver_phone || load.carrier_phone;
  if (!phone) return null;

  const recipientName = load.driver_name || load.company_name || 'Driver';

  // Check if driver or carrier has a NEXT load already booked
  const nextLoadRes = await pool.query(`
    SELECT * FROM loads
    WHERE (
      ($1::int IS NOT NULL AND driver_id = $1::int)
      OR ($2::int IS NOT NULL AND carrier_id = $2::int)
    )
    AND status IN ('booked', 'assigned', 'dispatched')
    AND id != $3
    ORDER BY pickup_date ASC, id ASC
    LIMIT 1
  `, [load.driver_id, load.carrier_id, load.id]).catch(() => ({ rows: [] }));

  const nextLoad = nextLoadRes.rows[0] || null;

  let body = '';

  if (nextLoad) {
    const nextPickTime = nextLoad.pickup_time ? ` at ${nextLoad.pickup_time}` : '';
    const nextPickDate = nextLoad.pickup_date ? new Date(nextLoad.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Upcoming';

    body = `🎉 *Delivered! Good job ${recipientName}.*

*Next Load #${nextLoad.load_number} is Ready:*
*Pickup:* ${nextLoad.pickup_location} (${nextPickDate}${nextPickTime})
*Delivery:* ${nextLoad.delivery_location}

Roll safe to next shipper!
Dispatch: (917) 737-0021`;

  } else {
    body = `🎉 *Delivered! Good job ${recipientName}.*

Reply with your *Empty ZIP & Time* so we can book your reload now!
Dispatch: (917) 737-0021`;
  }

  return sendAssistantMessage({
    phone,
    body,
    eventType: 'load_delivered',
    driverId: load.driver_id,
    carrierId: load.carrier_id,
    loadId: load.id,
    metadata: {
      load_number: load.load_number,
      has_next_load: Boolean(nextLoad),
      next_load_number: nextLoad ? nextLoad.load_number : null
    }
  });
}

/**
 * Dispatches the right lifecycle notification based on status transition
 */
async function onLoadStatusChanged(loadId, newStatus, oldStatus) {
  if (!loadId || !newStatus) return null;
  const s = String(newStatus).toLowerCase();
  const prev = String(oldStatus || '').toLowerCase();
  if (s === prev) return null;

  if (s === 'in_transit') {
    return onLoadInTransit(loadId);
  } else if (s === 'delivered' || s === 'completed') {
    return onLoadDelivered(loadId);
  } else if ((s === 'booked' || s === 'dispatched') && (!prev || prev === 'new' || prev === 'quoted')) {
    return onLoadBooked(loadId);
  }
  return null;
}

/**
 * Optional Vapi AI Voice Call trigger hook
 */
async function triggerVapiCall({ phone, driverName, scenario = 'morning_checkin', details = {} }) {
  let vapiApiKey = String(process.env.VAPI_API_KEY || '').trim();
  let vapiPhoneId = String(process.env.VAPI_PHONE_NUMBER_ID || '').trim();

  // If not in env, check database site_settings (saved via Settings dashboard)
  if (!vapiApiKey || !vapiPhoneId) {
    try {
      const { rows } = await pool.query(
        "SELECT key, value FROM site_settings WHERE key IN ('vapi_api_key', 'vapi_phone_number_id')"
      );
      for (const r of rows) {
        if (r.key === 'vapi_api_key' && r.value && !vapiApiKey) vapiApiKey = r.value.trim();
        if (r.key === 'vapi_phone_number_id' && r.value && !vapiPhoneId) vapiPhoneId = r.value.trim();
      }
    } catch (_) {}
  }

  const targetPhone = cleanPhone(phone);

  if (!targetPhone) return { ok: false, error: 'Invalid phone number format.' };
  if (!vapiApiKey) {
    return { ok: false, reason: 'VAPI_API_KEY is not set. Please save it in ERP Settings (Settings > AI Calling) first.' };
  }

  // Setup persona and prompt based on scenario (Keep names <= 30 chars for Vapi)
  let assistantName = 'Sarah - Dispatch';
  let firstMessage = `Good morning ${driverName || ''}! This is Sarah with Shipping Wish operations desk checking in. Are you empty today and ready for your next load?`;
  let systemPrompt = `You are Sarah, an energetic and polite logistics assistant at Shipping Wish LLC dispatch desk (shippingwish.com, phone: +1-917-737-0021).
You are calling driver ${driverName || 'driver'}.
Purpose: Morning status check-in to confirm if they are empty today, what their current ZIP code or city is, and what lane or destination they want to run to next.
Our dispatch team is ready to book their next load. Speak naturally, keep sentences short and conversational (1 to 2 sentences max).`;

  if (scenario === 'carrier_pitch') {
    assistantName = 'Alex - Closer';
    firstMessage = `Hi! This is Alex with Shipping Wish Logistics operations. Am I speaking with the fleet owner or manager?`;
    systemPrompt = `You are Alex, an experienced and friendly truck dispatch manager at Shipping Wish LLC (shippingwish.com, toll-free: +1-800-580-3101).
Your objective: Introduce our 24/7 Autonomous AI Dispatch Manager backed by our dedicated human operations desk, explain our 0% commission service, and get them to test us with our 7-Day $0 Free Trial.
Speak naturally, keep sentences short and conversational (1 to 2 sentences max).`;
  } else if (scenario === 'loadsnexus_broker') {
    assistantName = 'Jordan - Broker';
    firstMessage = `Hi, this is Jordan with LoadsNexus freight exchange. Do you have any open spot freight that needs reliable truck capacity covered today?`;
    systemPrompt = `You are Jordan at LoadsNexus (loadsnexus.com).
Your objective: Get freight brokers and 3PLs to post their spot freight for 100% FREE on our exchange.
Speak concisely in 1 to 2 sentences.`;
  }

  const buildPayload = (useVoice = true) => ({
    name: `SW Test Call`.slice(0, 38),
    phoneNumberId: vapiPhoneId || undefined,
    customer: { number: targetPhone, name: String(driverName || 'Partner').slice(0, 38) },
    assistant: {
      name: assistantName.slice(0, 38),
      firstMessage: firstMessage,
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }]
      },
      ...(useVoice ? {
        voice: {
          provider: '11labs',
          voiceId: '21m00Tcm4TlvDq8ikWAM' // Rachel / American natural dispatcher
        }
      } : {}),
      endCallMessage: 'Thank you for your time. Have a safe day!',
      artifactPlan: { recordingEnabled: true }
    }
  });

  try {
    let res = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vapiApiKey}`
      },
      body: JSON.stringify(buildPayload(true))
    });

    let data = await res.json().catch(() => ({}));
    const msgOf = (d) => Array.isArray(d.message) ? d.message.join('; ') : String(d.message || d.error || '');
    
    // If voice provider failed (e.g. ElevenLabs not linked in Vapi account), retry with Vapi default voice
    if (!res.ok && /voice|elevenlabs|11labs/i.test(msgOf(data))) {
      res = await fetch('https://api.vapi.ai/call/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vapiApiKey}`
        },
        body: JSON.stringify(buildPayload(false))
      });
      data = await res.json().catch(() => ({}));
    }

    if (!res.ok) throw new Error(`Vapi ${res.status}: ${msgOf(data) || 'unknown error'}`);

    return { ok: true, callId: data.id, provider: 'vapi', assistant: assistantName, phone: targetPhone };
  } catch (err) {
    console.error('[Driver Assistant] Vapi call error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * 5. Afternoon In-Transit Check-Call Sweep
 * Automatically reminds drivers rolling on active loads to provide their mile marker and ETA.
 * Runs in early afternoon (1:00 PM - 3:30 PM driver local time) if no check-call in last 8 hours.
 */
async function runInTransitCheckCallSweeps() {
  await ensureDriverAssistantSchema();
  const { rows } = await pool.query(`
    SELECT l.*,
           d.name AS driver_name, d.phone AS driver_phone,
           c.name AS carrier_name, c.company_name, c.phone AS carrier_phone,
           c.state AS carrier_state
    FROM loads l
    LEFT JOIN drivers d ON d.id = l.driver_id
    LEFT JOIN users c ON c.id = l.carrier_id
    WHERE l.status = 'in_transit'
      AND (d.phone IS NOT NULL OR c.phone IS NOT NULL)
  `).catch(() => ({ rows: [] }));

  for (const load of rows) {
    const phone = load.driver_phone || load.carrier_phone;
    if (!phone) continue;

    const { timezone } = resolveTimezone(phone, load.carrier_state || load.delivery_state || 'TX');
    const now = new Date();
    const hour = parseInt(now.toLocaleTimeString('en-US', { timeZone: timezone, hour12: false, hour: 'numeric' }), 10);

    // Early afternoon window: 1:00 PM - 3:30 PM recipient local time
    if (hour < 13 || hour > 15) continue;

    // Do not repeat if a check-call was sent in the last 8 hours
    if (await wasRecentlySent(phone, 'checkcall_ping', 8)) continue;

    const msg = `🚚 *In-Transit Check-Call | Load #${load.load_number}*

Heading to ${load.delivery_location}.
Please reply with your current *mile marker / city* and estimated *ETA*.
Dispatch: (917) 737-0021`;

    await sendAssistantMessage({
      phone,
      body: msg,
      eventType: 'checkcall_ping',
      driverId: load.driver_id,
      carrierId: load.carrier_id,
      loadId: load.id,
      metadata: { load_number: load.load_number }
    });
  }
}

/**
 * Cron tick handler (called from server.js every minute)
 */
async function tick() {
  try {
    await runMorningDriverCheckins();
    await runInTransitCheckCallSweeps();
  } catch (err) {
    console.warn('[Driver Assistant] Tick error:', err.message);
  }
}

/**
 * Fetch live status of a Vapi call (status + endedReason) for diagnostics
 */
async function getVapiCallStatus(callId) {
  let vapiApiKey = String(process.env.VAPI_API_KEY || '').trim();
  if (!vapiApiKey) {
    try {
      const { rows } = await pool.query("SELECT value FROM site_settings WHERE key = 'vapi_api_key'");
      if (rows[0] && rows[0].value) vapiApiKey = rows[0].value.trim();
    } catch (_) {}
  }
  if (!vapiApiKey) return { ok: false, error: 'Vapi API key not configured.' };

  const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
    headers: { Authorization: `Bearer ${vapiApiKey}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || `Vapi error ${res.status}` };
  return {
    ok: true,
    id: data.id,
    status: data.status,
    endedReason: data.endedReason || null,
    cost: data.cost,
    startedAt: data.startedAt,
    endedAt: data.endedAt
  };
}

module.exports = {
  ensureDriverAssistantSchema,
  runMorningDriverCheckins,
  runInTransitCheckCallSweeps,
  onLoadBooked,
  onLoadInTransit,
  onLoadDelivered,
  onLoadStatusChanged,
  sendAssistantMessage,
  triggerVapiCall,
  getVapiCallStatus,
  tick
};
