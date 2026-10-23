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
 * Extract 5-digit US ZIP code or clean City, State string from an address/location string
 */
function extractZipCode(text) {
  if (!text) return null;
  const str = String(text).trim();
  const zipMatch = str.match(/\b\d{5}\b/);
  return zipMatch ? zipMatch[0] : (str.length <= 64 ? str : str.slice(0, 64));
}

function normalizeEquipmentLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '53ft Dry Van';
  const low = s.toLowerCase();
  if (low === 'dry_van' || low === 'dry van' || low === "53' dry van") return '53ft Dry Van';
  if (low === 'reefer' || low === "53' reefer") return '53ft Reefer';
  if (low === 'flatbed') return '48ft Flatbed';
  if (low === 'step_deck' || low === 'step deck') return 'Step Deck';
  if (low === 'box_truck' || low === 'box truck') return '26ft Box Truck';
  if (low === 'sprinter' || low === 'cargo_van') return 'Sprinter Van';
  if (low === 'power_only') return 'Power Only';
  if (low === 'hotshot_30' || (low.includes('30') && low.includes('hotshot'))) return '30ft Hotshot';
  if (low === 'hotshot_35' || (low.includes('35') && low.includes('hotshot'))) return '35ft Hotshot';
  if (low === 'hotshot_40' || (low.includes('40') && low.includes('hotshot'))) return '40ft Hotshot';
  if (low === 'hotshot') return '30ft Hotshot';
  return s;
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
      await upsertCarrierToUsersTable({
        company_name: cleanCompany,
        contact_name: contact_name || cleanCompany,
        phone: cleanPhone,
        email: email ? email.toLowerCase() : null,
        mc_number: mc_number || null,
        dot_number: dot_number || null,
        equipment: equipment || "53' Dry Van"
      }).catch(() => {});
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
      await upsertCarrierToUsersTable({
        company_name: cleanCompany,
        contact_name: contact_name || cleanCompany,
        phone: cleanPhone,
        email: email ? email.toLowerCase() : null,
        mc_number: mc_number || null,
        dot_number: dot_number || null,
        equipment: equipment || "53' Dry Van"
      }).catch(() => {});
      return insertRes.rows[0];
    }
  } catch (err) {
    console.warn('[CarrierSync] Sync to ai_dispatch_carriers failed:', err.message);
    return null;
  }
}

let fleetSchemaEnsured = false;
async function ensureFleetTablesSchema() {
  if (fleetSchemaEnsured) return;
  try {
    await pool.query(`ALTER TABLE trucks ADD COLUMN IF NOT EXISTS equipment_type TEXT DEFAULT '53ft Dry Van'`).catch(() => {});
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS equipment_type TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_by INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS equipment_category TEXT`).catch(() => {});
    fleetSchemaEnsured = true;
  } catch (_) {}
}

/**
 * Ensure a carrier user has at least 1 Truck and 1 Driver in `trucks` and `drivers`
 * with their equipment_type synced so Load Planning & Fleet Hub work immediately.
 */
async function ensureCarrierDefaultFleet(carrierId, info = {}) {
  if (!carrierId) return;
  await ensureFleetTablesSchema();
  const company = String(info.company_name || info.name || 'Carrier Fleet').trim();
  const driverName = String(info.contact_name || info.name || company).trim();
  const phone = String(info.phone || '').trim() || null;
  const email = String(info.email || '').trim().toLowerCase() || null;
  const equip = normalizeEquipmentLabel(info.equipment || info.equipment_category || '53ft Dry Van');

  try {
    // 1. Ensure at least one truck exists for this carrier
    const tRes = await pool.query(
      `SELECT id, truck_number, equipment_type FROM trucks WHERE carrier_id = $1 ORDER BY id ASC LIMIT 1`,
      [carrierId]
    );
    let truckId = null;
    if (tRes.rows.length > 0) {
      truckId = tRes.rows[0].id;
      const curEq = normalizeEquipmentLabel(tRes.rows[0].equipment_type || '');
      // If current equipment was generic dry van or empty, update to the carrier's specified equipment
      const isCurGeneric = !curEq || curEq.toLowerCase().includes('dry_van') || curEq === '53ft Dry Van';
      const isNewSpecific = equip && !equip.toLowerCase().includes('dry_van') && equip !== '53ft Dry Van';
      if (isNewSpecific && isCurGeneric) {
        await pool.query(`UPDATE trucks SET equipment_type = $1 WHERE id = $2`, [equip, truckId]).catch(() => {});
      }
    } else {
      const insT = await pool.query(
        `INSERT INTO trucks (carrier_id, truck_number, equipment_type, status)
         VALUES ($1, '101', $2, 'active')
         RETURNING id`,
        [carrierId, equip]
      ).catch(() => ({ rows: [] }));
      if (insT.rows[0]) truckId = insT.rows[0].id;
    }

    // 2. Ensure at least one active driver exists for this carrier
    const dRes = await pool.query(
      `SELECT id, assigned_truck_id, equipment_type FROM drivers WHERE carrier_id = $1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
      [carrierId]
    );
    if (dRes.rows.length > 0) {
      const dRow = dRes.rows[0];
      const nextTruckId = dRow.assigned_truck_id || truckId;
      const curDrvEq = normalizeEquipmentLabel(dRow.equipment_type || '');
      const isDrvGeneric = !curDrvEq || curDrvEq.toLowerCase().includes('dry_van') || curDrvEq === '53ft Dry Van';
      const isNewSpecific = equip && !equip.toLowerCase().includes('dry_van') && equip !== '53ft Dry Van';
      const nextEq = (isNewSpecific && isDrvGeneric) ? equip : (curDrvEq || equip);

      if (nextTruckId !== dRow.assigned_truck_id || nextEq !== dRow.equipment_type) {
        await pool.query(
          `UPDATE drivers SET assigned_truck_id = COALESCE(assigned_truck_id, $1), equipment_type = COALESCE($2, equipment_type) WHERE id = $3`,
          [nextTruckId, nextEq, dRow.id]
        ).catch(() => {});
      }
    } else {
      await pool.query(
        `INSERT INTO drivers (carrier_id, name, phone, email, assigned_truck_id, equipment_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
        [carrierId, driverName, phone, email, truckId, equip]
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[CarrierSync] ensureCarrierDefaultFleet warning:', err.message);
  }
}

/**
 * Ensure a carrier also exists in the core `users` table (role = 'carrier')
 * so Load Booking (`GET /api/carriers`), Fleet Management, and Load Offers work with 0 delay.
 */
async function upsertCarrierToUsersTable(c = {}) {
  await ensureFleetTablesSchema();
  const company = String(c.company_name || c.name || '').trim();
  const name = String(c.contact_name || c.name || company || 'Carrier Partner').trim();
  const phone = String(c.phone || '').trim();
  const mc = String(c.mc_number || '').replace(/^MC-?/i, '').trim() || null;
  const dot = String(c.dot_number || '').replace(/^DOT-?/i, '').trim() || null;
  const equip = String(c.equipment || c.equipment_category || '53ft Dry Van').trim();
  if (!company && !name) return null;

  const slug = (mc || phone.replace(/\D/g, '') || company.toLowerCase().replace(/[^a-z0-9]+/g, '') || Date.now()).slice(0, 24);
  const rawEmail = String(c.email || '').trim().toLowerCase();
  const email = (rawEmail && rawEmail.includes('@')) ? rawEmail : `carrier.${slug}@shippingwish.local`;

  const existing = await pool.query(
    `SELECT id, role FROM users
     WHERE deleted_at IS NULL
       AND (
         lower(email) = lower($1)
         OR ($2::text IS NOT NULL AND $2 <> '' AND mc_number = $2)
         OR ($3::text IS NOT NULL AND $3 <> '' AND phone = $3)
         OR lower(COALESCE(company_name, name, '')) = lower($4)
       )
     ORDER BY CASE WHEN role = 'carrier' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [email, mc, phone || null, company]
  );

  if (existing.rows.length > 0) {
    const uid = existing.rows[0].id;
    await pool.query(
      `UPDATE users
       SET company_name = COALESCE(NULLIF($1, ''), company_name),
           phone = COALESCE(NULLIF($2, ''), phone),
           mc_number = COALESCE(NULLIF($3, ''), mc_number),
           dot_number = COALESCE(NULLIF($4, ''), dot_number),
           equipment_category = COALESCE(NULLIF($5, ''), equipment_category)
       WHERE id = $6`,
      [company, phone, mc || '', dot || '', equip, uid]
    ).catch(() => {});
    await ensureCarrierDefaultFleet(uid, { company_name: company, contact_name: name, phone, email, equipment: equip });
    return uid;
  }

  // Insert a new carrier user record with a placeholder password hash
  const ins = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, equipment_category)
     VALUES ($1, $2, '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'carrier', $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO UPDATE
       SET company_name = COALESCE(EXCLUDED.company_name, users.company_name),
           mc_number = COALESCE(EXCLUDED.mc_number, users.mc_number),
           equipment_category = COALESCE(EXCLUDED.equipment_category, users.equipment_category)
     RETURNING id`,
    [name, email, company || name, phone || null, mc, dot, equip]
  ).catch(() => ({ rows: [] }));
  const newUid = ins.rows[0] ? ins.rows[0].id : null;
  if (newUid) {
    await ensureCarrierDefaultFleet(newUid, { company_name: company, contact_name: name, phone, email, equipment: equip });
  }
  return newUid;
}

/**
 * Backfill any carriers in `ai_dispatch_carriers` or `customer_carriers` into `users (role = 'carrier')`
 * so `GET /api/carriers` on Load Booking, Fleet Hub, and Load Planning are always 100% up-to-date with 0 delay.
 */
async function ensureCarriersSyncedToUsers() {
  try {
    await ensureFleetTablesSchema();
    const adcRes = await pool.query(
      `SELECT company_name, contact_name, phone, email, mc_number, dot_number, equipment
       FROM ai_dispatch_carriers
       ORDER BY created_at DESC LIMIT 100`
    ).catch(() => ({ rows: [] }));
    for (const row of adcRes.rows) {
      await upsertCarrierToUsersTable(row).catch(() => {});
    }
    const custRes = await pool.query(
      `SELECT company_name, contact_name, contact_phone AS phone, contact_email AS email, mc_number, dot_number, equipment_type AS equipment
       FROM customer_carriers
       ORDER BY created_at DESC LIMIT 100`
    ).catch(() => ({ rows: [] }));
    for (const row of custRes.rows) {
      await upsertCarrierToUsersTable(row).catch(() => {});
    }
    const carrierUsers = await pool.query(
      `SELECT id, name, company_name, phone, email, equipment_category
       FROM users
       WHERE role = 'carrier' AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 100`
    ).catch(() => ({ rows: [] }));
    for (const u of carrierUsers.rows) {
      await ensureCarrierDefaultFleet(u.id, {
        company_name: u.company_name || u.name,
        contact_name: u.name,
        phone: u.phone,
        email: u.email,
        equipment: u.equipment_category || '53ft Dry Van'
      }).catch(() => {});
    }
  } catch (_) {}
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
  syncTruckLocationToAiDispatch,
  upsertCarrierToUsersTable,
  ensureCarriersSyncedToUsers,
  ensureFleetTablesSchema,
  ensureCarrierDefaultFleet
};
