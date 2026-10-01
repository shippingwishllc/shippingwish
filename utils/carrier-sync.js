/**
 * utils/carrier-sync.js
 * Shipping Wish LLC — End-to-End Carrier, Fleet & AI Dispatch Synchronization Engine
 * 
 * Bridges Users, Subscriptions, Fleet Trucks, Route Planning, and the AI Dispatch Brain:
 * 1. Enforces truck limits per subscription plan (Solo = 1 truck, Fleet = 5 trucks, Command = Unlimited).
 * 2. Automatically syncs carriers from Portal Signups, SuperAdmin Onboarding & Digital Packets into ai_dispatch_carriers.
 * 3. Keeps empty ZIPs and preferred lanes in sync from Route Planning & Fleet management into the AI Dispatch Matcher.
 */

const pool = require('../db');

/**
 * Plan definitions and maximum trucks allowed per tier
 */
const TIER_TRUCK_LIMITS = {
  solo_weekly: { maxTrucks: 1, name: 'Owner Operator ($149/wk)', upgradeKey: 'fleet_weekly' },
  fleet_weekly: { maxTrucks: 5, name: 'Small Fleet ($350/wk)', upgradeKey: 'command_weekly' },
  command_weekly: { maxTrucks: 999, name: 'Fleet Command ($500/wk)', upgradeKey: null },
  custom_weekly: { maxTrucks: 999, name: 'Fleet Command ($500/wk)', upgradeKey: null },
  // Load board plans (if used for TMS access)
  loadboard_fleet_pass: { maxTrucks: 5, name: 'LoadsNexus Fleet ($69/mo)', upgradeKey: 'command_weekly' },
  loadboard_team_pass: { maxTrucks: 3, name: 'LoadsNexus Team ($39/mo)', upgradeKey: 'loadboard_fleet_pass' },
  loadboard_pass: { maxTrucks: 1, name: 'LoadsNexus Solo ($19/mo)', upgradeKey: 'loadboard_team_pass' }
};

/**
 * Extract 5-digit US ZIP code from an address string or return original clean string
 */
function extractZipCode(text) {
  if (!text) return null;
  const str = String(text).trim();
  const zipMatch = str.match(/\b\d{5}\b/);
  return zipMatch ? zipMatch[0] : (str.length <= 10 ? str : null);
}

/**
 * Check if carrier can add another truck based on their active subscription tier
 */
async function enforceTruckSubscriptionLimit(carrierId, userRole = 'carrier') {
  // Staff roles have unlimited truck allocation
  if (['super_admin', 'admin', 'dispatcher'].includes(userRole)) {
    return { allowed: true, maxAllowed: 999, currentCount: 0, planName: 'Staff Override' };
  }

  // Count current trucks for this carrier
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM trucks WHERE carrier_id = $1 AND (status IS NULL OR status != 'deleted')`,
    [carrierId]
  );
  const currentCount = (countRes.rows[0] && countRes.rows[0].count) || 0;

  // Fetch carrier user & active billing subscription
  const userRes = await pool.query(
    `SELECT u.id, u.role, u.weekly_plan, u.trial_ends_at, u.is_suspended,
            b.plan_key, b.status AS sub_status
     FROM users u
     LEFT JOIN billing_subscriptions b ON b.user_id = u.id AND b.status IN ('trialing', 'active')
     WHERE u.id = $1
     ORDER BY b.id DESC LIMIT 1`,
    [carrierId]
  );

  if (!userRes.rows.length) {
    return { allowed: false, reason: 'Carrier user account not found.' };
  }

  const u = userRes.rows[0];

  // If suspended or canceled
  if (u.is_suspended || u.weekly_plan === 'canceled' || u.sub_status === 'canceled') {
    return {
      allowed: false,
      reason: 'Your subscription was canceled or suspended. Please reactivate your account at /pricing.'
    };
  }

  // If past due / unpaid
  if (u.weekly_plan === 'past_due' || u.sub_status === 'past_due' || u.sub_status === 'unpaid') {
    return {
      allowed: false,
      reason: 'Your subscription payment is past due. Please update your payment method at /checkout to add vehicles.'
    };
  }

  // Determine active plan tier
  const activePlanKey = u.plan_key || u.weekly_plan || 'solo_weekly';
  const tierConfig = TIER_TRUCK_LIMITS[activePlanKey] || TIER_TRUCK_LIMITS.solo_weekly;
  const maxAllowed = tierConfig.maxTrucks;

  // Check 7-day trial fallback if no explicit plan key
  const isTrialActive = u.trial_ends_at && new Date(u.trial_ends_at) > new Date();
  if (!u.plan_key && !isTrialActive && !u.weekly_plan) {
    return {
      allowed: false,
      reason: 'Your 7-day free trial has expired. Please choose a subscription plan at /pricing to continue adding fleet vehicles.'
    };
  }

  if (currentCount >= maxAllowed) {
    if (activePlanKey === 'solo_weekly') {
      return {
        allowed: false,
        maxAllowed,
        currentCount,
        planName: tierConfig.name,
        reason: `Your ${tierConfig.name} allows 1 truck. You currently have 1 truck on file. Upgrade to Small Fleet ($350/wk for 2–5 trucks) to add more vehicles.`,
        upgradeUrl: '/checkout?plan=fleet_weekly'
      };
    } else if (activePlanKey === 'fleet_weekly') {
      return {
        allowed: false,
        maxAllowed,
        currentCount,
        planName: tierConfig.name,
        reason: `Your ${tierConfig.name} allows up to 5 trucks. You currently have 5 trucks on file. Upgrade to Fleet Command ($500/wk for 6+ trucks) to add more vehicles.`,
        upgradeUrl: '/checkout?plan=command_weekly'
      };
    }
  }

  return {
    allowed: true,
    maxAllowed,
    currentCount,
    planName: tierConfig.name
  };
}

/**
 * Upsert carrier into ai_dispatch_carriers so the AI Dispatch Brain can immediately service them
 */
async function syncCarrierToAiDispatch(carrierData) {
  if (!carrierData) return null;

  const {
    userId,
    company_name,
    contact_name,
    phone,
    email,
    mc_number,
    dot_number,
    equipment = "53' Dry Van",
    empty_zip = null,
    prefer_destination = null,
    min_rpm = 2.00,
    max_deadhead = 150,
    sms_consent = true,
    status = 'active'
  } = carrierData;

  const cleanPhone = String(phone || '').trim();
  const cleanCompany = String(company_name || 'Carrier Partner').trim();
  if (!cleanPhone && !cleanCompany) return null;

  try {
    // Check if carrier already exists in ai_dispatch_carriers by phone or MC or email
    const existing = await pool.query(
      `SELECT id FROM ai_dispatch_carriers 
       WHERE (phone = $1 AND phone != '') 
          OR (mc_number = $2 AND mc_number IS NOT NULL AND mc_number != '')
          OR (email = $3 AND email IS NOT NULL AND email != '')
       LIMIT 1`,
      [cleanPhone, mc_number || null, email ? email.toLowerCase() : null]
    );

    if (existing.rows.length > 0) {
      const carrierId = existing.rows[0].id;
      const updateRes = await pool.query(
        `UPDATE ai_dispatch_carriers 
         SET company_name = COALESCE($1, company_name),
             contact_name = COALESCE($2, contact_name),
             email = COALESCE($3, email),
             equipment = COALESCE($4, equipment),
             empty_zip = COALESCE($5, empty_zip),
             prefer_destination = COALESCE($6, prefer_destination),
             mc_number = COALESCE($7, mc_number),
             dot_number = COALESCE($8, dot_number),
             sms_consent = COALESCE($9, sms_consent),
             status = COALESCE($10, status)
         WHERE id = $11 RETURNING *`,
        [
          cleanCompany,
          contact_name || null,
          email ? email.toLowerCase() : null,
          equipment || null,
          extractZipCode(empty_zip),
          prefer_destination || null,
          mc_number || null,
          dot_number || null,
          sms_consent,
          status,
          carrierId
        ]
      );
      return updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        `INSERT INTO ai_dispatch_carriers (
           company_name, contact_name, phone, email, equipment, empty_zip,
           prefer_destination, mc_number, dot_number, min_rpm, max_deadhead,
           sms_consent, sms_consent_at, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
         RETURNING *`,
        [
          cleanCompany,
          contact_name || cleanCompany,
          cleanPhone,
          email ? email.toLowerCase() : null,
          equipment || "53' Dry Van",
          extractZipCode(empty_zip),
          prefer_destination || null,
          mc_number || null,
          dot_number || null,
          min_rpm || 2.00,
          max_deadhead || 150,
          sms_consent,
          status || 'active'
        ]
      );
      return insertRes.rows[0];
    }
  } catch (err) {
    console.warn('[CarrierSync] Sync to ai_dispatch_carriers failed:', err.message);
    return null;
  }
}

/**
 * Synchronize truck location, empty ZIP, or preferred destination into AI Dispatch Brain
 */
async function syncTruckLocationToAiDispatch(carrierId, locationData = {}) {
  if (!carrierId) return null;

  const { empty_zip, location, equipment, prefer_destination, status = 'active' } = locationData;
  const zip = extractZipCode(empty_zip || location);

  try {
    // 1. Find carrier user info
    const uRes = await pool.query(
      `SELECT id, name, company_name, phone, email, mc_number, dot_number FROM users WHERE id = $1`,
      [carrierId]
    );

    if (uRes.rows.length > 0) {
      const u = uRes.rows[0];
      return await syncCarrierToAiDispatch({
        userId: u.id,
        company_name: u.company_name || u.name,
        contact_name: u.name,
        phone: u.phone,
        email: u.email,
        mc_number: u.mc_number,
        dot_number: u.dot_number,
        equipment: equipment || "53' Dry Van",
        empty_zip: zip,
        prefer_destination: prefer_destination || null,
        status
      });
    }

    // Fallback: direct update on ai_dispatch_carriers if carrierId refers to ai_dispatch_carriers.id
    if (zip || prefer_destination || equipment) {
      await pool.query(
        `UPDATE ai_dispatch_carriers
         SET empty_zip = COALESCE($1, empty_zip),
             prefer_destination = COALESCE($2, prefer_destination),
             equipment = COALESCE($3, equipment),
             last_location = COALESCE($4, last_location),
             status = 'active'
         WHERE id = $5`,
        [zip, prefer_destination || null, equipment || null, location || zip, carrierId]
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[CarrierSync] Truck location sync failed:', err.message);
  }
}

module.exports = {
  TIER_TRUCK_LIMITS,
  extractZipCode,
  enforceTruckSubscriptionLimit,
  syncCarrierToAiDispatch,
  syncTruckLocationToAiDispatch
};
