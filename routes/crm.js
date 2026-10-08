const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { searchFmcsa } = require('../utils/fmcsa');
const { normalizeEquipmentKeys } = require('../utils/fmcsa-equipment');
const { sanitizeEmail, emailValidationError } = require('../utils/email-valid');
const { ensureCrmLeadsTable } = require('../utils/ensure-growth-schema');
const { ensureSmsMessagesTable } = require('../utils/sms-inbox');
const outreach = require('../utils/crm-outreach');
const { getFallbackCarriers } = require('../utils/fmcsa-fallback-carriers');

// Security: CRM is strictly an internal company operations tool — Carriers & Drivers are Forbidden
router.use(requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep'));

// ============================================================
// FMCSA API — Search US Carriers by Name, MC#, or DOT#
// Free government API: ai.fmcsa.dot.gov
// Returns: company_name, mc_number, dot_number, phone, email,
//          address, equipment type, number of trucks, state
// Set FMCSA_API_KEY in .env (register free at ai.fmcsa.dot.gov)
// ============================================================
async function tagCrmDuplicates(carriers) {
  for (const c of carriers) {
    if (!c.mc_number && !c.phone && !c.email && !c.dot_number) continue;
    const exists = await pool.query(
      `SELECT id, sales_rep_id, status,
              (SELECT name FROM users WHERE id = crm_leads.sales_rep_id) AS owned_by
       FROM crm_leads
       WHERE ($1 <> '' AND mc_number = $1)
          OR ($2 <> '' AND phone = $2)
          OR ($3 <> '' AND lower(email) = lower($3))
          OR ($4 <> '' AND dot_number = $4)
       LIMIT 1`,
      [c.mc_number || '', c.phone || '', c.email || '', c.dot_number || '']
    );
    if (exists.rows.length) {
      c.already_in_crm = true;
      c.crm_lead_id = exists.rows[0].id;
      c.crm_status = exists.rows[0].status;
      c.owned_by = exists.rows[0].owned_by || 'Unassigned';
    }
  }
  return carriers;
}

router.get('/fmcsa/search', requireAuth, async (req, res) => {
  const q = (req.query.q || req.query.name || req.query.mc || req.query.dot || req.query.phone || req.query.email || '').trim();
  const mode = String(req.query.mode || 'auto').trim().toLowerCase();
  if (!q) {
    return res.status(400).json({ error: 'Provide q (MC, DOT, name, phone, or email) to search.' });
  }

  try {
    const result = await searchFmcsa(q, {
      mode,
      equipment: req.query.equipment,
      minUnits: req.query.minUnits || req.query.min_units,
      maxUnits: req.query.maxUnits || req.query.max_units,
      hasEmail: req.query.hasEmail === 'true' || req.query.has_email === 'true',
      state: req.query.state
    });
    try {
      result.carriers = await tagCrmDuplicates(result.carriers || []);
    } catch (tagErr) {
      result.tagWarning = 'Could not check CRM duplicates';
    }
    res.json(result);
  } catch (err) {
    console.error('FMCSA search error:', err);
    res.json({
      source: 'fmcsa_error',
      keyPresent: !!String(process.env.FMCSA_API_KEY || '').trim(),
      carriers: [],
      error: err.message,
      message: 'FMCSA search failed: ' + err.message
    });
  }
});

router.get('/fmcsa/carrier/:mc', requireAuth, async (req, res) => {
  try {
    const result = await searchFmcsa(req.params.mc);
    result.carriers = await tagCrmDuplicates(result.carriers || []);
    res.json(result.carriers[0] || result);
  } catch (err) {
    res.status(500).json({ error: 'FMCSA lookup failed: ' + err.message });
  }
});

// POST /api/crm/ai-prospect-campaign - AI Autonomous FMCSA Freight Carrier Prospecting & Outreach Bot
router.post('/ai-prospect-campaign', requireAuth, async (req, res) => {
  try {
    await ensureCrmLeadsTable().catch(() => {});
    await ensureSmsMessagesTable().catch(() => {});

    const {
      states = ['TX', 'FL', 'GA', 'IL', 'CA'],
      equipment_types = ['dry_van'],
      limit = 10,
      send_email = true,
      send_sms = false,
      send_vapi = false,
      consent_confirmed = false,
      brand = 'shippingwish',
      campaign_target = 'carrier'
    } = req.body;

    let normalizedBrand = String(brand || 'shippingwish').toLowerCase();
    let normalizedTarget = String(campaign_target || '').toLowerCase();

    if (normalizedBrand.includes('loadsnexus')) {
      if (normalizedBrand.includes('broker') || normalizedTarget === 'broker') {
        normalizedBrand = 'loadsnexus';
        normalizedTarget = 'broker';
      } else {
        normalizedBrand = 'loadsnexus';
        normalizedTarget = 'carrier';
      }
    } else if (normalizedBrand.includes('nyclimo')) {
      if (normalizedBrand.includes('corporate') || normalizedTarget === 'corporate') {
        normalizedBrand = 'nyclimowish';
        normalizedTarget = 'corporate';
      } else {
        normalizedBrand = 'nyclimowish';
        normalizedTarget = 'partner';
      }
    } else if (normalizedBrand.includes('buywish')) {
      normalizedBrand = 'buywish';
      normalizedTarget = 'consumer';
    } else {
      normalizedBrand = 'shippingwish';
      normalizedTarget = 'carrier';
    }

    const maxLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    // ============================================================
    // BRAND 4: BUYWISH ONLINE (E-COMMERCE ABANDONED CART RECOVERY)
    // Note: Automated outbound robocalls are strictly illegal for retail e-commerce under US TCPA.
    // Safe & compliant: Abandoned cart recovery emails + opt-in SMS with 10% discount promo code.
    // ============================================================
    if (normalizedBrand === 'buywish') {
      await pool.query(`ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ`).catch(() => {});

      const abandonedRes = await pool.query(`
        SELECT id, order_number, customer_name, customer_email, customer_phone,
               shipping_city, shipping_state, items, total_amount, created_at
        FROM ecommerce_orders
        WHERE payment_status = 'pending'
          AND recovery_sent_at IS NULL
          AND customer_email IS NOT NULL AND customer_email <> ''
        ORDER BY created_at DESC
        LIMIT $1
      `, [maxLimit]);

      let emailsSent = 0;
      let smsSent = 0;
      const processedOrders = [];
      const skippedOutreach = [];

      for (const order of abandonedRes.rows) {
        const orderNum = order.order_number || `ORD-${order.id}`;
        const custName = order.customer_name || 'Valued Customer';
        const custEmail = String(order.customer_email || '').trim();
        const custPhone = String(order.customer_phone || '').trim();
        const orderTotal = parseFloat(order.total_amount || 0).toFixed(2);

        let emailSent = false;
        let smsSentOrder = false;

        if (send_email && custEmail) {
          try {
            const recoverySubject = `Complete your BuyWish Online order (${orderNum}) — Take 10% OFF with code SAVE10`;
            const recoveryHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;">
                  <h1 style="color: #4f46e5; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">BuyWish Online</h1>
                  <p style="color: #64748b; margin-top: 4px; font-size: 14px;">Your order has been reserved</p>
                </div>
                <p style="font-size: 16px;">Hi <strong>${custName}</strong>,</p>
                <p style="font-size: 15px; color: #334155; line-height: 1.6;">You left items in your shopping cart! We are holding your items for a limited time so they don't sell out.</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0 0 6px; font-weight: 600; color: #0f172a; font-size: 14px;">Order Number: <span style="font-family: monospace;">${orderNum}</span></p>
                  <p style="margin: 0; color: #475569; font-size: 14px;">Subtotal: <strong style="color: #0f172a;">$${orderTotal}</strong></p>
                </div>
                <div style="background: #ecfdf5; border: 1px dashed #10b981; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
                  <p style="margin: 0 0 6px; color: #065f46; font-size: 13px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Exclusive 10% Off Voucher</p>
                  <p style="margin: 0; font-size: 26px; font-weight: 900; color: #047857; letter-spacing: 2px;">SAVE10</p>
                  <p style="margin: 6px 0 0; font-size: 12px; color: #065f46;">Apply code at checkout to claim your instant discount.</p>
                </div>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="https://buywishonline.com/checkout.html?order=${encodeURIComponent(orderNum)}" style="background: #4f46e5; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px; text-decoration: none; display: inline-block;">Complete Your Checkout &rarr;</a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; line-height: 1.5;">
                  Need assistance? Our 24/7 AI Concierge & Support desk is available at <strong>+1 (800) 580-3101</strong> or reply to this email.<br>
                  BuyWish Online &bull; Safe, Verified & Encrypted Checkout
                </p>
              </div>
            `;
            const recoveryText = `Hi ${custName},\n\nYou left items in your BuyWish Online cart (Order: ${orderNum}, Total: $${orderTotal}).\nComplete your checkout with promo code SAVE10 for 10% off: https://buywishonline.com/checkout.html?order=${orderNum}\n\nQuestions? Call 24/7 at +1 (800) 580-3101.`;

            const { sendBrandedEmail } = require('../utils/mailer');
            await sendBrandedEmail({
              to: custEmail,
              subject: recoverySubject,
              html: recoveryHtml,
              text: recoveryText,
              emailType: 'buywish_cart_recovery'
            });
            emailSent = true;
            emailsSent++;
          } catch (eErr) {
            skippedOutreach.push({ id: order.id, channel: 'email', reason: eErr.message });
          }
        }

        if (send_sms && custPhone && consent_confirmed) {
          try {
            const smsText = `BuyWish: Hi ${custName}, your cart is waiting! Use code SAVE10 for 10% off your order ${orderNum}. Checkout here: https://buywishonline.com/checkout.html?order=${orderNum} Reply STOP to opt out.`;
            const { sendTwilioSms } = require('../routes/voip');
            const sRes = await sendTwilioSms(custPhone, smsText);
            if (sRes && (sRes.status === 'sent' || sRes.status === 'logged')) {
              smsSentOrder = true;
              smsSent++;
            }
          } catch (sErr) {
            skippedOutreach.push({ id: order.id, channel: 'sms', reason: sErr.message });
          }
        }

        await pool.query(`UPDATE ecommerce_orders SET recovery_sent_at = NOW() WHERE id = $1`, [order.id]).catch(() => {});

        processedOrders.push({
          id: order.id,
          company_name: `BuyWish Customer: ${custName}`,
          owner_name: custName,
          email: custEmail,
          phone: custPhone,
          state: order.shipping_state || 'US',
          equipment_type: 'E-Commerce Cart',
          email_sent: emailSent,
          sms_sent: smsSentOrder,
          vapi_sent: false,
          brand: 'buywish',
          campaign_target: 'consumer'
        });
      }

      return res.json({
        ok: true,
        brand: 'buywish',
        campaign_target: 'consumer',
        processed: abandonedRes.rows.length,
        imported: processedOrders.length,
        emails_sent: emailsSent,
        sms_sent: smsSent,
        vapi_sent: 0,
        tcpa_notice: 'Outbound automated phone calls are strictly blocked for retail e-commerce under US TCPA regulations. BuyWish AI voice is active for 24/7 inbound customer support at +1 (800) 580-3101.',
        skipped_duplicates: 0,
        filtered_out: 0,
        skipped_outreach: skippedOutreach,
        leads: processedOrders
      });
    }

    // ============================================================
    // BRANDS 1, 2, 3: SHIPPING WISH, LOADSNEXUS, NYC LIMO WISH
    // ============================================================
    const targetStates = Array.isArray(states) && states.length ? states : ['TX', 'FL', 'GA', 'IL', 'CA'];
    const equipmentKeys = normalizeEquipmentKeys(equipment_types).length
      ? normalizeEquipmentKeys(equipment_types)
      : ['dry_van'];
    await outreach.ensureSmsOptInColumn().catch(() => {});

    // Pre-load all existing leads into in-memory Sets for ultra-fast deduplication
    const existingRows = await pool.query(`
      SELECT LOWER(TRIM(mc_number)) AS mc, LOWER(TRIM(dot_number)) AS dot, 
             LOWER(TRIM(phone)) AS phone, LOWER(TRIM(email)) AS email 
      FROM crm_leads
    `);
    const existingMcs = new Set(existingRows.rows.map(r => r.mc).filter(Boolean));
    const existingDots = new Set(existingRows.rows.map(r => r.dot).filter(Boolean));
    const existingPhones = new Set(existingRows.rows.map(r => r.phone).filter(Boolean));
    const existingEmails = new Set(existingRows.rows.map(r => r.email).filter(Boolean));

    let scrapedCount = 0;
    let skippedDuplicates = 0;
    let excludedBanned = 0;
    let importedLeads = [];
    let pendingOutreach = [];
    let fmcsaRateLimited = false;

    // Helper to evaluate and ingest a candidate carrier record
    async function ingestCarrierCandidate(c, sourceState) {
      if (importedLeads.length >= maxLimit) return false;
      scrapedCount++;

      // Filter 1: USDOT Status MUST NOT be Inactive, Revoked or Suspended
      const statusStr = String(c.authority_status || c.status || c.usdot_status || '').toUpperCase();
      if (statusStr.includes('INACTIVE') || statusStr.includes('REVOKED') || statusStr.includes('SUSPENDED')) {
        excludedBanned++;
        return false;
      }

      // Filter 2: Must have at least a phone number or email address
      const cleanPhone = String(c.phone || '').trim();
      const cleanEmail = String(c.email || '').trim();
      if (!cleanPhone && !cleanEmail) {
        excludedBanned++;
        return false;
      }

      // Filter 3: Banned Category Exclusions
      const compName = String(c.company_name || '').toLowerCase();
      const cargoDesc = String(c.equipment_type || c.cargo_carried || '').toLowerCase();
      
      let isBannedCategory = false;
      if (normalizedBrand === 'nyclimowish') {
        // NYC Limo Wish targets executive chauffeur / livery / black car fleets; ban cattle, farm, waste, moving
        isBannedCategory = 
          compName.includes('farm') || compName.includes('ranch') || compName.includes('cattle') || compName.includes('livestock') ||
          compName.includes('moving') || compName.includes('movers') || compName.includes('van lines') ||
          cargoDesc.includes('farm supp') || cargoDesc.includes('household');
      } else {
        // Freight operations (Shipping Wish & LoadsNexus): ban passenger, bus, tours, farm, movers
        isBannedCategory = 
          compName.includes('bus') || compName.includes('limo') || compName.includes('charter') || compName.includes('tours') ||
          compName.includes('farm') || compName.includes('ranch') || compName.includes('cattle') || compName.includes('livestock') ||
          compName.includes('moving') || compName.includes('movers') || compName.includes('van lines') ||
          cargoDesc.includes('passenger') || cargoDesc.includes('school bus') || cargoDesc.includes('farm supp') || cargoDesc.includes('household');
      }

      if (isBannedCategory) {
        excludedBanned++;
        return false;
      }

      // Filter 4: In-Memory Deduplication Check
      const lowerMc = String(c.mc_number || '').trim().toLowerCase();
      const lowerDot = String(c.dot_number || '').trim().toLowerCase();
      const lowerPhone = cleanPhone.toLowerCase();
      const lowerEmail = cleanEmail.toLowerCase();

      if ((lowerMc && existingMcs.has(lowerMc)) ||
          (lowerDot && existingDots.has(lowerDot)) ||
          (lowerPhone && existingPhones.has(lowerPhone)) ||
          (lowerEmail && existingEmails.has(lowerEmail))) {
        skippedDuplicates++;
        return false;
      }

      // Filter 5: TCPA Opt-Out Guard & Email Unsubscribe Check
      if (cleanPhone) {
        try {
          const { isPhoneOptedOut } = require('../utils/sms-inbox');
          if (await isPhoneOptedOut(cleanPhone)) {
            excludedBanned++;
            return false;
          }
        } catch {}
      }
      if (cleanEmail) {
        try {
          const { isUnsubscribed } = require('../utils/mailer');
          if (await isUnsubscribed(cleanEmail)) {
            excludedBanned++;
            return false;
          }
        } catch {}
      }

      function cleanPrimaryEquipment(raw) {
        if (!raw) return 'Dry Van';
        const str = String(raw).trim();
        if (/dry van/i.test(str)) return 'Dry Van';
        if (/reefer/i.test(str)) return 'Reefer';
        if (/flatbed/i.test(str)) return 'Flatbed';
        if (/box truck/i.test(str)) return 'Box Truck';
        if (/auto hauler|car hauler/i.test(str)) return 'Auto Hauler';
        if (/hotshot/i.test(str)) return 'Hotshot';
        if (/power only/i.test(str)) return 'Power Only';
        return str.split(',')[0].trim() || 'Dry Van';
      }

      function formatFirstName(raw) {
        if (!raw) return 'there';
        let str = String(raw).trim();
        if (/^(owner|manager|president|ceo|n\/a|none|unknown)$/i.test(str)) return 'there';
        let first = str.split(/\s+/)[0];
        if (first.length <= 1 && str.split(/\s+/)[1]) first = str.split(/\s+/)[1];
        return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
      }

      const matchedEquip = cleanPrimaryEquipment(c.equipment_type);
      const stateName = c.state || sourceState || 'TX';
      const ownerName = c.owner_name || 'Fleet Manager';
      const firstName = formatFirstName(c.owner_name);
      const numUnits = c.num_trucks || 1;

      let emailSubject = '';
      let emailBodyText = '';
      let emailHtml = '';
      let smsText = '';

      // Tailored multi-brand copy
      if (normalizedBrand === 'loadsnexus') {
        if (normalizedTarget === 'broker') {
          emailSubject = `Post Spot Loads for Free on LoadsNexus™ — Reach 10,000+ Verified Carriers`;
          emailBodyText = `Hi ${firstName},\n\n` +
            `LoadsNexus™ (loadsnexus.com) connects freight brokers directly with verified motor carriers across ${stateName} and all 48 states.\n\n` +
            `100% free load posting. No booking fees. Direct carrier dispatch with automated FMCSA safety verification.\n\n` +
            `Post your freight today:\nhttps://loadsnexus.com\n\n` +
            `Best regards,\nLoadsNexus Broker Relations`;

          emailHtml = `<p>Hi <strong>${firstName}</strong>,</p>` +
            `<p>LoadsNexus&trade; (<a href="https://loadsnexus.com">loadsnexus.com</a>) connects freight brokers directly with verified motor carriers across <strong>${stateName}</strong> and nationwide.</p>` +
            `<p><strong>100% Free Load Posting:</strong> Zero subscription fees for brokers, direct carrier contact, and automated FMCSA safety & insurance checks.</p>` +
            `<p><a href="https://loadsnexus.com" style="background:#0284c7;color:#ffffff;padding:10px 18px;border-radius:6px;font-weight:bold;text-decoration:none;display:inline-block;">Post Loads on LoadsNexus &rarr;</a></p>`;

          smsText = `Hi ${firstName}, LoadsNexus offers 100% free load posting for brokers with instant carrier matching in ${stateName}. Post free at loadsnexus.com. Reply STOP to opt out.`;
        } else {
          // Carrier
          emailSubject = `LoadsNexus™ Solo Pass ($19/mo) — Direct Broker Loads for ${c.company_name}`;
          emailBodyText = `Hi ${firstName},\n\n` +
            `Looking for higher-paying direct broker freight for your ${numUnits} ${matchedEquip} unit(s) in ${stateName}?\n\n` +
            `The LoadsNexus™ Solo Pass is just $19/month — unlimited direct broker loads, zero per-load booking fees, and live DAT/Truckstop lane parity.\n\n` +
            `Activate your carrier pass:\nhttps://loadsnexus.com\n\n` +
            `Best regards,\nLoadsNexus Carrier Support`;

          emailHtml = `<p>Hi <strong>${firstName}</strong>,</p>` +
            `<p>Looking for higher-paying direct freight for <strong>${c.company_name}</strong> (${numUnits} ${matchedEquip} units in <strong>${stateName}</strong>)?</p>` +
            `<p>The <strong>LoadsNexus&trade; Solo Pass</strong> gives your trucks direct access to verified broker freight for only <strong>$19/month</strong>. No commission cuts, no middlemen.</p>` +
            `<p><a href="https://loadsnexus.com" style="background:#0284c7;color:#ffffff;padding:10px 18px;border-radius:6px;font-weight:bold;text-decoration:none;display:inline-block;">Get Your $19/mo Solo Pass &rarr;</a></p>`;

          smsText = `Hi ${firstName}, LoadsNexus gives your ${matchedEquip} fleet direct broker loads for only $19/mo. Check it out at loadsnexus.com. Reply YES for info, STOP to opt out.`;
        }
      } else if (normalizedBrand === 'nyclimowish') {
        if (normalizedTarget === 'corporate') {
          emailSubject = `Executive Corporate Transportation & Airport Transfers — NYC Limo Wish`;
          emailBodyText = `Hi ${firstName},\n\n` +
            `NYC Limo Wish provides premium black car, executive SUV, and luxury chauffeur services across the Greater New York tri-state area.\n\n` +
            `Corporate accounts receive dedicated 24/7 dispatch, guaranteed on-time pickups, and flat rates to JFK, LGA, and EWR.\n\n` +
            `Book corporate travel or open an account:\nhttps://nyclimowish.com\n\n` +
            `Warm regards,\nNYC Limo Wish Corporate Travel Desk`;

          emailHtml = `<p>Hi <strong>${firstName}</strong>,</p>` +
            `<p>NYC Limo Wish (<a href="https://nyclimowish.com">nyclimowish.com</a>) provides executive black car and luxury chauffeur services across Manhattan, Brooklyn, Westchester, and the tri-state area.</p>` +
            `<p><strong>Corporate Perks:</strong> Dedicated account manager, 24/7 executive dispatch, flight tracking, and flat rates to JFK, LGA, and EWR airports.</p>` +
            `<p><a href="https://nyclimowish.com" style="background:#0f172a;color:#f59e0b;padding:10px 18px;border-radius:6px;font-weight:bold;text-decoration:none;display:inline-block;">Open Corporate Account &rarr;</a></p>`;

          smsText = `Hi ${firstName}, NYC Limo Wish offers executive black car & flat airport rates in NYC. Book corporate travel at nyclimowish.com or call 24/7. Reply STOP to opt out.`;
        } else {
          // Partner (Chauffeur / Fleet Operator)
          emailSubject = `Chauffeur Affiliate Network — Join NYC Limo Wish Luxury Fleet`;
          emailBodyText = `Hi ${firstName},\n\n` +
            `NYC Limo Wish invites licensed TLC chauffeurs and luxury vehicle operators to join our premium reservation network.\n\n` +
            `High-yield airport transfers, corporate roadshows, weekly direct deposits, and zero monthly platform fees.\n\n` +
            `Join our affiliate fleet:\nhttps://nyclimowish.com\n\n` +
            `Best regards,\nNYC Limo Wish Fleet Operations`;

          emailHtml = `<p>Hi <strong>${firstName}</strong>,</p>` +
            `<p>NYC Limo Wish invites professional luxury chauffeurs and fleet operators for <strong>${c.company_name}</strong> to join our premier affiliate network.</p>` +
            `<p><strong>Why Drive With Us:</strong> Premium airport & corporate bookings, weekly instant payouts, zero monthly fees, and dedicated 24/7 support.</p>` +
            `<p><a href="https://nyclimowish.com" style="background:#0f172a;color:#f59e0b;padding:10px 18px;border-radius:6px;font-weight:bold;text-decoration:none;display:inline-block;">Join Chauffeur Network &rarr;</a></p>`;

          smsText = `Hi ${firstName}, NYC Limo Wish is onboarding luxury chauffeurs in NY for high-paying airport reservations. Join free at nyclimowish.com. Reply STOP to opt out.`;
        }
      } else {
        // Shipping Wish LLC (Default Freight Dispatch)
        emailSubject = `Spot loads & dedicated dispatch for your ${matchedEquip} out of ${stateName}`;
        emailBodyText = `Hi ${firstName},\n\n` +
          `Saw your fleet (${c.company_name}) registered on FMCSA running ${matchedEquip} out of ${stateName}.\n\n` +
          `Are you tired of dispatchers taking 8-10% of your gross freight check? At Shipping Wish LLC, we take 0% commission ($149 flat/week) and negotiate top spot rates ($2.85–$3.25/mile avg) with verified brokers.\n\n` +
          `• 100% of broker gross pay is yours (keep every dollar)\n` +
          `• 1-Click RateCon auditing & 10-second broker setup packets\n` +
          `• 7-Day $0 Free Trial — test our dedicated dispatch desk for 1 full week at zero cost.\n\n` +
          `Do you have trucks rolling or looking for loads out of ${stateName} this week?\n\n` +
          `Best regards,\nAlex — Shipping Wish Dispatch Desk\nDirect: +1 (917) 737-0021\nhttps://www.shippingwish.com/services`;

        emailHtml = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;">` +
          `<p>Hi <strong>${firstName}</strong>,</p>` +
          `<p>Saw your fleet (<strong>${c.company_name}</strong>) registered on FMCSA running <strong>${matchedEquip}</strong> out of <strong>${stateName}</strong>.</p>` +
          `<p>Are you tired of dispatchers taking <strong>8% to 10%</strong> of your gross freight check? At <strong>Shipping Wish LLC</strong>, we take <strong>0% commission</strong>—just a flat $149/week retainer—and our dispatchers negotiate top spot rates (<strong>$2.85 – $3.25/mile</strong>).</p>` +
          `<ul style="padding-left:20px;margin:12px 0;">` +
            `<li><strong>Keep 100% of the freight pay:</strong> You collect directly from the broker.</li>` +
            `<li><strong>Zero paperwork headache:</strong> We audit RateCons for hidden fines, handle broker packets, and manage check-calls.</li>` +
            `<li><strong>7-Day Free Trial ($0 Today):</strong> Test our dispatch desk for 1 full week at zero risk.</li>` +
          `</ul>` +
          `<p style="margin:20px 0;">` +
            `<a href="https://www.shippingwish.com/services" style="background:#2563eb;color:#ffffff;padding:11px 22px;border-radius:6px;font-weight:bold;text-decoration:none;display:inline-block;">Start 7-Day Free Week ($0) &rarr;</a>` +
            `&nbsp;&nbsp;` +
            `<a href="https://www.shippingwish.com/carrier-setup" style="background:#0f172a;color:#ffffff;padding:11px 22px;border-radius:6px;font-weight:bold;text-decoration:none;display:inline-block;">Complete Carrier Packet &rarr;</a>` +
          `</p>` +
          `<p>Do you have trucks looking for freight this week? Reply to this email or call our desk at <strong>+1 (917) 737-0021</strong>.</p>` +
          `<p>Best regards,<br><strong>Alex — Operations Desk</strong><br>Shipping Wish LLC · shippingwish.com</p>` +
        `</div>`;

        smsText = `Hi ${firstName}, Alex with Shipping Wish. Got your ${matchedEquip} in ${stateName}. We book top spot freight ($2.85+/mi) with 0% commission ($149 flat). Looking for loads this week? Reply STOP to opt out.`;
      }

      // Save lead in PostgreSQL CRM table
      const insertRes = await pool.query(
        `INSERT INTO crm_leads (
          company_name, owner_name, phone, email,
          mc_number, dot_number, equipment_type, num_trucks,
          target_lanes, sales_rep_id, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'contacted', $11)
        RETURNING *`,
        [
          c.company_name,
          ownerName,
          cleanPhone,
          cleanEmail,
          c.mc_number || '',
          c.dot_number || '',
          matchedEquip,
          numUnits,
          stateName,
          req.user ? req.user.id : null,
          `Imported via AI Auto-Prospecting Bot for ${stateName} (${matchedEquip}) [${normalizedBrand.toUpperCase()}:${normalizedTarget.toUpperCase()}]`
        ]
      );

      const newLead = insertRes.rows[0];

      if (lowerMc) existingMcs.add(lowerMc);
      if (lowerDot) existingDots.add(lowerDot);
      if (lowerPhone) existingPhones.add(lowerPhone);
      if (lowerEmail) existingEmails.add(lowerEmail);

      const leadItem = {
        id: newLead.id,
        company_name: newLead.company_name,
        owner_name: ownerName,
        mc_number: newLead.mc_number,
        dot_number: newLead.dot_number,
        state: stateName,
        equipment_type: matchedEquip,
        phone: newLead.phone,
        email: newLead.email,
        email_sent: false,
        sms_sent: false,
        vapi_sent: false,
        vapi_standby: false,
        raw_email: cleanEmail,
        raw_phone: cleanPhone,
        email_subject: emailSubject,
        email_text: emailBodyText,
        email_html: emailHtml,
        sms_text: smsText,
        brand: normalizedBrand,
        campaign_target: normalizedTarget
      };

      importedLeads.push(leadItem);
      pendingOutreach.push(leadItem);
      return true;
    }

    // 1. Try Live FMCSA Census (with fast circuit breaker)
    for (const stateCode of targetStates) {
      if (importedLeads.length >= maxLimit || fmcsaRateLimited) break;

      try {
        const fmcsaRes = await Promise.race([
          searchFmcsa(stateCode, {
            mode: 'state',
            offset: Math.floor(Math.random() * 20),
            equipment: equipmentKeys,
            exclusive: true,
            activeOnly: true,
            forHire: true,
            excludePassengers: normalizedBrand !== 'nyclimowish',
            hasPhone: true,
            limit: 25
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('FMCSA timeout')), 3500))
        ]);

        const rawCarriers = (fmcsaRes && fmcsaRes.carriers) || [];
        if (!rawCarriers.length && (fmcsaRes.attempts || []).some(a => a.status === 429)) {
          console.warn(`[AI CAMPAIGN] Socrata FMCSA API returned 429 Rate Limit. Engaging circuit breaker.`);
          fmcsaRateLimited = true;
          break;
        }

        for (const c of rawCarriers) {
          if (importedLeads.length >= maxLimit) break;
          await ingestCarrierCandidate(c, stateCode);
        }
      } catch (err) {
        console.warn(`[AI CAMPAIGN] FMCSA query for ${stateCode} failed (${err.message}). Engaging fallback.`);
        fmcsaRateLimited = true;
        break;
      }
    }

    // 2. Fallback to Verified Directory if live census rate-limited or yielded too few
    if (importedLeads.length < maxLimit) {
      const needed = maxLimit - importedLeads.length;
      const fallbackList = getFallbackCarriers(targetStates, equipmentKeys, needed + 10, normalizedBrand);
      for (const fc of fallbackList) {
        if (importedLeads.length >= maxLimit) break;
        await ingestCarrierCandidate(fc, fc.state);
      }
    }

    let emailsSent = 0;
    let smsSent = 0;
    let vapiSent = 0;
    const skippedOutreach = [];

    // 3. Process Outreach Concurrently across all channels with bounded 4s timeout
    await Promise.allSettled(pendingOutreach.map(async (leadItem) => {
      const leadRow = {
        id: leadItem.id,
        company_name: leadItem.company_name,
        owner_name: leadItem.owner_name || 'Fleet Manager',
        email: leadItem.raw_email,
        phone: leadItem.raw_phone,
        phy_state: leadItem.state,
        equipment_type: leadItem.equipment_type,
        brand: leadItem.brand
      };

      // Email
      if (send_email && leadItem.raw_email) {
        try {
          const result = await Promise.race([
            outreach.sendLeadEmail(leadRow, req.user, 'dedicated_manager', {
              customSubject: leadItem.email_subject,
              customHtml: leadItem.email_html,
              customText: leadItem.email_text
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Email timeout')), 4000))
          ]);
          if (result && result.ok) {
            leadItem.email_sent = true;
            emailsSent += 1;
          } else {
            skippedOutreach.push({ id: leadItem.id, channel: 'email', reason: (result && result.reason) || 'Email skipped' });
          }
        } catch (eErr) {
          skippedOutreach.push({ id: leadItem.id, channel: 'email', reason: eErr.message });
        }
      } else if (send_email) {
        skippedOutreach.push({ id: leadItem.id, channel: 'email', reason: 'No email on record' });
      }

      // SMS
      if (send_sms && leadItem.raw_phone) {
        try {
          const result = await Promise.race([
            outreach.sendLeadSms(leadRow, req.user, {
              consentConfirmed: consent_confirmed === true,
              customMessage: leadItem.sms_text
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SMS timeout')), 4000))
          ]);
          if (result && result.ok) {
            leadItem.sms_sent = true;
            smsSent += 1;
          } else {
            skippedOutreach.push({ id: leadItem.id, channel: 'sms', reason: (result && result.reason) || 'SMS skipped' });
          }
        } catch (sErr) {
          skippedOutreach.push({ id: leadItem.id, channel: 'sms', reason: sErr.message });
        }
      }

      // Vapi AI Call (Multi-brand persona & TCPA guarded)
      if (send_vapi && leadItem.raw_phone) {
        try {
          const result = await Promise.race([
            outreach.sendLeadVapi(leadRow, req.user, {
              consentConfirmed: consent_confirmed === true,
              brand: normalizedBrand,
              targetRole: normalizedTarget
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Vapi timeout')), 4000))
          ]);
          if (result && result.ok && !result.logged_only) {
            leadItem.vapi_sent = true;
            vapiSent += 1;
          } else if (result && result.logged_only) {
            leadItem.vapi_standby = true;
            skippedOutreach.push({ id: leadItem.id, channel: 'vapi', reason: result.message });
          } else {
            skippedOutreach.push({ id: leadItem.id, channel: 'vapi', reason: (result && result.reason) || 'Vapi skipped' });
          }
        } catch (vErr) {
          skippedOutreach.push({ id: leadItem.id, channel: 'vapi', reason: vErr.message });
        }
      }
    }));

    const clientLeads = importedLeads.map(({ raw_email, raw_phone, email_subject, email_text, email_html, sms_text, ...rest }) => rest);

    res.json({
      ok: true,
      brand: normalizedBrand,
      campaign_target: normalizedTarget,
      processed: scrapedCount,
      imported: clientLeads.length,
      emails_sent: emailsSent,
      sms_sent: smsSent,
      vapi_sent: vapiSent,
      skipped_duplicates: skippedDuplicates,
      filtered_out: excludedBanned,
      skipped_outreach: skippedOutreach,
      equipment: equipmentKeys,
      leads: clientLeads
    });
  } catch (err) {
    console.error('AI Prospecting Campaign error:', err);
    res.status(500).json({ error: 'AI Prospecting Campaign failed: ' + err.message });
  }
});


// POST /api/crm/leads/bulk-outreach — select rows, then email / SMS / Vapi / packet / click-to-call
router.post('/leads/bulk-outreach', requireAuth, async (req, res) => {
  const leadIds = req.body.lead_ids || req.body.ids || [];
  const channel = String(req.body.channel || '').trim().toLowerCase();
  const allowed = ['email', 'sms', 'vapi', 'voip', 'packet'];
  if (!allowed.includes(channel)) {
    return res.status(400).json({ error: 'channel must be email, sms, vapi, voip, or packet.' });
  }
  try {
    await ensureCrmLeadsTable().catch(() => {});
    const result = await outreach.bulkOutreach({
      leadIds,
      channel,
      user: req.user,
      consentConfirmed: req.body.consent_confirmed === true,
      customMessage: req.body.custom_message || req.body.message || '',
      templateKey: req.body.template_key || 'dedicated_manager'
    });
    if (!result.ok && result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('CRM bulk outreach:', err);
    res.status(500).json({ error: err.message || 'Could not send.' });
  }
});

router.patch('/leads/:id/consent', requireAuth, async (req, res) => {
  try {
    const leadId = parseInt(req.params.id, 10);
    if (!leadId) return res.status(400).json({ error: 'Invalid lead id' });
    await outreach.recordPriorConsent(leadId);
    res.json({ ok: true, message: 'Consent recorded for this lead. SMS and Vapi can now go to that number.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not record consent.' });
  }
});

// GET /api/crm/leads - Get all leads (Super Admin & Admin see all, Sales Rep sees assigned)
router.get('/leads', requireAuth, async (req, res) => {
  try {
    await ensureCrmLeadsTable().catch(() => {});
    await ensureSmsMessagesTable().catch(() => {});
    await outreach.ensureSmsOptInColumn();
    let query = `
      SELECT l.*, u.name as sales_rep_name,
        COALESCE((
          SELECT COUNT(*)::int FROM sms_messages sm
          WHERE sm.lead_id = l.id AND sm.direction = 'outbound'
        ), 0) AS sms_sent_count,
        COALESCE((
          SELECT COUNT(*)::int FROM sms_messages sm
          WHERE sm.lead_id = l.id AND sm.direction = 'inbound'
        ), 0) AS sms_reply_count,
        EXISTS (
          SELECT 1 FROM sms_optouts o
          WHERE regexp_replace(o.phone, '\\D', '', 'g') LIKE '%' || right(regexp_replace(l.phone, '\\D', '', 'g'), 10)
        ) AS sms_opted_out,
        COALESCE(l.sms_opt_in, FALSE) AS sms_opt_in
      FROM crm_leads l
      LEFT JOIN users u ON l.sales_rep_id = u.id
    `;
    const params = [];

    if (req.user.role === 'sales_rep') {
      query += ` WHERE l.sales_rep_id = $1`;
      params.push(req.user.id);
    }

    query += ` ORDER BY l.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ leads: result.rows });
  } catch (err) {
    console.error('Error fetching CRM leads:', err);
    res.status(500).json({ error: 'Server error fetching leads' });
  }
});

// POST /api/crm/leads - Create new lead
router.get('/leads/stats', requireAuth, async (req, res) => {
  try {
    const totalLeads = await pool.query('SELECT COUNT(*) FROM crm_leads');
    const newLeads = await pool.query("SELECT COUNT(*) FROM crm_leads WHERE status = 'new'");
    const interested = await pool.query("SELECT COUNT(*) FROM crm_leads WHERE status = 'interested'");
    const activeCarriers = await pool.query("SELECT COUNT(*) FROM crm_leads WHERE status = 'active'");

    res.json({
      total: parseInt(totalLeads.rows[0].count),
      new: parseInt(newLeads.rows[0].count),
      interested: parseInt(interested.rows[0].count),
      active: parseInt(activeCarriers.rows[0].count)
    });
  } catch (err) {
    console.error('Error fetching CRM stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/crm/leads - Add a new carrier lead (with duplicate protection)
router.post('/leads', requireAuth, async (req, res) => {
  try {
    const company_name = String(req.body.company_name || '').trim();
    const owner_name = String(req.body.owner_name || req.body.officer_name || '').trim();
    let phone = String(req.body.phone || '').trim();
    let email = sanitizeEmail(req.body.email);
    if (String(req.body.email || '').trim() && !email) {
      return res.status(400).json({
        error: 'INVALID_EMAIL',
        message: emailValidationError(req.body.email)
      });
    }
    let mc_number = String(req.body.mc_number || '').trim().toUpperCase().replace(/\s+/g, '');
    const dot_number = String(req.body.dot_number || '').replace(/[^0-9]/g, '');
    const equipment_type = String(req.body.equipment_type || '53ft Dry Van').trim().slice(0, 120);
    const num_trucks = Math.max(1, parseInt(req.body.num_trucks, 10) || 1);
    const target_lanes = String(req.body.target_lanes || '').trim();
    const notes = String(req.body.notes || '').trim();

    if (mc_number && !mc_number.startsWith('MC')) {
      mc_number = `MC-${mc_number.replace(/^MC-?/i, '')}`;
    }
    if (!phone) phone = 'unknown';

    if (!company_name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Production may never have run schema.sql — create CRM tables on first import
    await ensureCrmLeadsTable();

    // Ensure FMCSA enrichment columns exist (safe on every import)
    const enrichCols = [
      'phy_address TEXT',
      'phy_city TEXT',
      'phy_state TEXT',
      'phy_zip TEXT',
      'officer_name TEXT',
      'safety_rating TEXT',
      'authority_status TEXT',
      'num_drivers INTEGER'
    ];
    for (const col of enrichCols) {
      await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
    }

    // Duplicate check — MC digits, phone, or email (one owner per carrier)
    const mcDigits = mc_number.replace(/[^0-9]/g, '');
    const dupChecks = [];
    const dupParams = [];
    if (mcDigits) {
      dupParams.push(mcDigits);
      dupChecks.push(`regexp_replace(COALESCE(l.mc_number,''), '[^0-9]', '', 'g') = $${dupParams.length}`);
    }
    if (phone && phone !== 'unknown') {
      dupParams.push(phone);
      dupChecks.push(`l.phone = $${dupParams.length}`);
    }
    if (email) {
      dupParams.push(email);
      dupChecks.push(`lower(COALESCE(l.email,'')) = $${dupParams.length}`);
    }

    if (dupChecks.length > 0) {
      const dupResult = await pool.query(
        `SELECT l.id, l.company_name, l.mc_number, l.phone, l.status,
                u.name AS owned_by, u.id AS owner_id
         FROM crm_leads l
         LEFT JOIN users u ON l.sales_rep_id = u.id
         WHERE ${dupChecks.join(' OR ')}
         LIMIT 1`,
        dupParams
      );

      if (dupResult.rows.length > 0) {
        const dup = dupResult.rows[0];
        return res.status(409).json({
          error: 'DUPLICATE_LEAD',
          message: `This carrier is already in the CRM${dup.owned_by ? ' and owned by ' + dup.owned_by : ' (unassigned)'}.`,
          existing_lead: {
            id: dup.id,
            company_name: dup.company_name,
            mc_number: dup.mc_number,
            phone: dup.phone,
            status: dup.status,
            owned_by: dup.owned_by || 'Unassigned',
            owner_id: dup.owner_id
          }
        });
      }
    }

    // Sales reps own what they import. Admin/super_admin leave unassigned unless they pass sales_rep_id.
    const sales_rep_id = req.body.sales_rep_id
      || (req.user.role === 'sales_rep' ? req.user.id : null);

    const phy_address = String(req.body.phy_address || req.body.address || '').trim();
    const phy_city = String(req.body.phy_city || '').trim();
    const phy_state = String(req.body.phy_state || req.body.state || '').trim().slice(0, 2).toUpperCase();
    const phy_zip = String(req.body.phy_zip || '').trim();
    const officer_name = String(req.body.officer_name || owner_name || '').trim();
    const safety_rating = String(req.body.safety_rating || '').trim().slice(0, 80);
    const authority_status = String(req.body.authority_status || '').trim().slice(0, 120);
    const num_drivers = req.body.num_drivers != null && req.body.num_drivers !== ''
      ? (parseInt(req.body.num_drivers, 10) || null)
      : null;

    let result;
    try {
      result = await pool.query(
        `INSERT INTO crm_leads (
          company_name, owner_name, phone, email, mc_number, dot_number,
          equipment_type, num_trucks, target_lanes, status, sales_rep_id, notes,
          phy_address, phy_city, phy_state, phy_zip, officer_name, safety_rating,
          authority_status, num_drivers
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING *`,
        [
          company_name, owner_name, phone, email, mc_number, dot_number,
          equipment_type, num_trucks, target_lanes, sales_rep_id, notes,
          phy_address, phy_city, phy_state, phy_zip, officer_name, safety_rating,
          authority_status, num_drivers
        ]
      );
    } catch (richErr) {
      console.warn('CRM rich insert failed, using base columns:', richErr.message);
      result = await pool.query(
        `INSERT INTO crm_leads (
          company_name, owner_name, phone, email, mc_number, dot_number,
          equipment_type, num_trucks, target_lanes, status, sales_rep_id, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11)
        RETURNING *`,
        [
          company_name, owner_name, phone, email, mc_number, dot_number,
          equipment_type, num_trucks, target_lanes, sales_rep_id, notes
        ]
      );
    }

    try {
      await pool.query(
        `INSERT INTO lead_tasks (lead_id, assigned_to, task_title, due_date)
         VALUES ($1, $2, $3, CURRENT_DATE)`,
        [
          result.rows[0].id,
          sales_rep_id || req.user.id,
          `Initial Cold Call & Intro Email to ${company_name}`.slice(0, 200)
        ]
      );
    } catch (taskErr) {
      console.warn('CRM lead task skipped:', taskErr.message);
    }

    res.status(201).json({ message: 'Lead created successfully', lead: result.rows[0] });
  } catch (err) {
    console.error('Error creating CRM lead:', err);
    res.status(500).json({
      error: 'Server error',
      message: err.message || 'Could not import this carrier. Check company name and try again.'
    });
  }
});

// ============================================================
// POST /api/crm/leads/import-fmcsa
// Bulk import carriers from FMCSA search results into CRM
// Body: { carriers: [...], sales_rep_id: 5 }
// Skips duplicates automatically
// ============================================================
router.post('/leads/import-fmcsa', requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep'), async (req, res) => {
  const { carriers, sales_rep_id } = req.body;
  if (!Array.isArray(carriers) || carriers.length === 0) {
    return res.status(400).json({ error: 'carriers[] array is required.' });
  }

  const repId = sales_rep_id || req.user.id;
  let imported = 0, skipped = 0;
  const skipReasons = [];

  for (const c of carriers) {
    if (!c.company_name) { skipped++; continue; }
    if (!c.phone) c.phone = 'unknown';
    c.email = sanitizeEmail(c.email);

    // Duplicate check
    const dup = await pool.query(
      `SELECT id FROM crm_leads WHERE mc_number = $1 OR phone = $2 OR (email != '' AND lower(email) = lower($3)) LIMIT 1`,
      [c.mc_number || '', c.phone || '', c.email || '']
    );
    if (dup.rows.length) {
      skipped++;
      skipReasons.push(`${c.company_name} (MC: ${c.mc_number}) — already in CRM`);
      continue;
    }

    let ins;
    try {
      ins = await pool.query(
        `INSERT INTO crm_leads (company_name, owner_name, phone, email, mc_number, dot_number, equipment_type, num_trucks, status, sales_rep_id, notes,
          phy_address, phy_city, phy_state, phy_zip, officer_name, safety_rating, authority_status, num_drivers)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [
          c.company_name, c.owner_name || '', c.phone || 'unknown', (c.email || '').toLowerCase(),
          c.mc_number || '', c.dot_number || '', c.equipment_type || '53ft Dry Van', c.num_trucks || 1, repId,
          `Imported from FMCSA. State: ${c.state || 'N/A'}. Address: ${c.address || c.phy_address || 'N/A'}. Safety: ${c.safety_rating || 'N/A'}. Authority: ${c.authority_status || 'N/A'}`,
          c.phy_address || c.address || '', c.phy_city || '', c.phy_state || c.state || '', c.phy_zip || '',
          c.officer_name || '', c.safety_rating || '', c.authority_status || '', c.num_drivers || null
        ]
      );
    } catch (colErr) {
      ins = await pool.query(
        `INSERT INTO crm_leads (company_name, owner_name, phone, email, mc_number, dot_number, equipment_type, num_trucks, status, sales_rep_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$10) RETURNING id`,
        [c.company_name, c.owner_name || '', c.phone, (c.email || '').toLowerCase(), c.mc_number || '', c.dot_number || '', c.equipment_type || '53ft Dry Van', c.num_trucks || 1, repId, `Imported from FMCSA. State: ${c.state || 'N/A'}`]
      );
    }
    await pool.query(
      `INSERT INTO lead_tasks (lead_id, assigned_to, task_title, due_date) VALUES ($1,$2,$3,CURRENT_DATE)`,
      [ins.rows[0].id, repId, `Cold Call & Intro Email to ${c.company_name}`]
    );
    imported++;
  }

  res.json({ ok: true, imported, skipped, skipReasons });
});

// ============================================================
// POST /api/crm/leads/:id/claim
// Sales rep "claims" an unassigned lead — locks it to them
// Prevents another rep from stealing it
// ============================================================
router.post('/leads/:id/claim', requireAuth, async (req, res) => {
  try {
    const leadRes = await pool.query(
      `SELECT id, company_name, sales_rep_id,
              (SELECT name FROM users WHERE id = crm_leads.sales_rep_id) AS owned_by
       FROM crm_leads WHERE id = $1`,
      [req.params.id]
    );
    if (!leadRes.rows.length) return res.status(404).json({ error: 'Lead not found.' });
    const lead = leadRes.rows[0];

    // Already owned by someone else?
    if (lead.sales_rep_id && lead.sales_rep_id !== req.user.id) {
      return res.status(409).json({
        error: 'ALREADY_CLAIMED',
        message: `This lead is already owned by ${lead.owned_by}. Contact admin to reassign.`,
        owned_by: lead.owned_by
      });
    }

    await pool.query(
      `UPDATE crm_leads SET sales_rep_id = $1 WHERE id = $2`,
      [req.user.id, req.params.id]
    );

    res.json({ ok: true, message: `Lead "${lead.company_name}" claimed by ${req.user.name}` });
  } catch (err) {
    res.status(500).json({ error: 'Could not claim lead.' });
  }
});

router.patch('/leads/:id/contact', requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep'), async (req, res) => {
  try {
    const leadId = parseInt(req.params.id, 10);
    if (!leadId) return res.status(400).json({ error: 'Invalid lead id' });

    const lr = await pool.query('SELECT id, sales_rep_id, company_name FROM crm_leads WHERE id = $1', [leadId]);
    if (!lr.rows.length) return res.status(404).json({ error: 'Lead not found' });
    const lead = lr.rows[0];

    if (req.user.role === 'sales_rep' && lead.sales_rep_id && lead.sales_rep_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit leads you own.' });
    }

    const owner_name = req.body.owner_name != null ? String(req.body.owner_name).trim() : null;
    const phone = req.body.phone != null ? String(req.body.phone).trim() : null;
    let email = null;
    if (req.body.email != null) {
      email = sanitizeEmail(req.body.email);
      if (String(req.body.email).trim() && !email) {
        return res.status(400).json({
          error: 'INVALID_EMAIL',
          message: emailValidationError(req.body.email)
        });
      }
    }

    const sets = [];
    const params = [];
    if (owner_name !== null) {
      params.push(owner_name);
      sets.push(`owner_name = $${params.length}`);
    }
    if (phone !== null) {
      params.push(phone || 'unknown');
      sets.push(`phone = $${params.length}`);
    }
    if (email !== null) {
      params.push(email);
      sets.push(`email = $${params.length}`);
    }
    if (!sets.length) {
      return res.status(400).json({ error: 'Nothing to update. Pass email, phone, or owner_name.' });
    }

    params.push(leadId);
    const result = await pool.query(
      `UPDATE crm_leads SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, company_name, owner_name, phone, email`,
      params
    );
    res.json({ ok: true, message: 'Contact updated.', lead: result.rows[0] });
  } catch (err) {
    console.error('Lead contact update error:', err);
    res.status(500).json({ error: 'Could not update contact.' });
  }
});

// ============================================================
// PATCH /api/crm/leads/:id/reassign
// Admin only — move a lead from one sales rep to another
// ============================================================
router.patch('/leads/:id/reassign', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const { new_sales_rep_id } = req.body;
  if (!new_sales_rep_id) return res.status(400).json({ error: 'new_sales_rep_id is required.' });

  try {
    const repRes = await pool.query('SELECT id, name FROM users WHERE id = $1', [new_sales_rep_id]);
    if (!repRes.rows.length) return res.status(404).json({ error: 'Sales rep not found.' });

    const result = await pool.query(
      `UPDATE crm_leads SET sales_rep_id = $1 WHERE id = $2
       RETURNING id, company_name, sales_rep_id`,
      [new_sales_rep_id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found.' });

    res.json({
      ok: true,
      message: `Lead reassigned to ${repRes.rows[0].name}`,
      lead: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not reassign lead.' });
  }
});

// ============================================================
// GET /api/crm/leads/ownership-report
// Admin view: see all leads grouped by sales rep + their stats
// ============================================================
router.get('/leads/ownership-report', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id AS rep_id, u.name AS rep_name, u.email AS rep_email,
        COUNT(l.id) AS total_leads,
        COUNT(l.id) FILTER (WHERE l.status = 'new') AS new_leads,
        COUNT(l.id) FILTER (WHERE l.status = 'contacted') AS contacted,
        COUNT(l.id) FILTER (WHERE l.status = 'interested') AS interested,
        COUNT(l.id) FILTER (WHERE l.status = 'active') AS active_carriers,
        COUNT(l.id) FILTER (WHERE l.status = 'dead') AS dead_leads,
        MAX(l.last_contacted_at) AS last_activity
      FROM users u
      LEFT JOIN crm_leads l ON l.sales_rep_id = u.id
      WHERE u.role IN ('sales_rep', 'dispatcher', 'admin')
      GROUP BY u.id, u.name, u.email
      ORDER BY total_leads DESC
    `);

    const unassigned = await pool.query(
      `SELECT COUNT(*) FROM crm_leads WHERE sales_rep_id IS NULL`
    );

    res.json({
      reps: result.rows,
      unassigned_leads: parseInt(unassigned.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch ownership report.' });
  }
});

router.put('/leads/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const allowed = ['new', 'contacted', 'interested', 'packet_sent', 'active', 'dead'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const result = await pool.query(
      `UPDATE crm_leads SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });
    res.json({ ok: true, lead: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update status' });
  }
});

// ADMIN & SUPER ADMIN: Delete lead
router.delete('/leads/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_leads WHERE id = $1', [req.params.id]);
    res.json({ ok: true, message: 'Lead deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete lead' });
  }
});

router.get('/leads/:id/activity', requireAuth, async (req, res) => {
  try {
    const emails = await pool.query(
      `SELECT * FROM email_logs WHERE lead_id = $1 ORDER BY sent_at DESC LIMIT 50`,
      [req.params.id]
    );
    let inbound = { rows: [] };
    try {
      inbound = await pool.query(
        `SELECT * FROM email_inbound WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.params.id]
      );
    } catch { /* schema not applied */ }
    const calls = await pool.query(
      `SELECT * FROM voip_call_logs WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ emails: emails.rows, inbound: inbound.rows, calls: calls.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load activity' });
  }
});

router.get('/tasks', requireAuth, async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'sales_rep') {
      params.push(req.user.id);
      where = 'WHERE t.assigned_to = $1';
    }
    const result = await pool.query(
      `SELECT t.*, l.company_name
       FROM lead_tasks t
       LEFT JOIN crm_leads l ON l.id = t.lead_id
       ${where}
       ORDER BY t.is_completed ASC, t.due_date ASC
       LIMIT 100`,
      params
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load tasks' });
  }
});

router.put('/tasks/:id/toggle', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE lead_tasks SET is_completed = NOT is_completed WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ ok: true, task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not toggle task' });
  }
});

router.get('/script', requireAuth, (req, res) => {
  res.json({
    call_openers: [
      'Hi, this is {name} with Shipping Wish LLC. I am not calling to book a random load. We place a Dedicated Fleet Operations Manager with small carriers — someone who works your trucks only. Do you already have that person in-house?',
      'Quick question — who currently books freight for your trucks, you or a dedicated manager?',
      'I will be brief. We invoice a small weekly retainer. You keep 100% of the broker pay. Would that model even be useful, or are you fully covered?'
    ],
    never_say: [
      'We are a dispatch company',
      'I can get you high-paying loads',
      'No upfront fees / 0% setup',
      'DAT AI / $4.00 per mile'
    ],
    email_subject: 'Dedicated Operations Manager for {company} — Shipping Wish LLC',
    sms_note: 'Do not cold-SMS without consent. TCPA fines are severe. Use email first; SMS after they reply YES.'
  });
});

// ==========================================
// AI SAFE DRIP QUEUE & ANTI-SPAM THROTTLE
// ==========================================

const {
  getDripQueueStats,
  enqueueLeads,
  processDripQueueTick,
  setDripEngineActive
} = require('../utils/ai-safe-drip-engine');

// GET /api/crm/ai-drip/stats — View drip queue health, hourly rates & recent deliveries
router.get('/ai-drip/stats', requireAuth, async (req, res) => {
  try {
    const stats = await getDripQueueStats();
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch drip queue stats: ' + err.message });
  }
});

// POST /api/crm/ai-drip/enqueue — Safely enqueue FMCSA leads into staggered anti-spam queue
router.post('/ai-drip/enqueue', requireAuth, async (req, res) => {
  const { leads, brand = 'shippingwish', channel = 'sms', target_role = 'carrier' } = req.body;
  if (!leads || !Array.isArray(leads) || !leads.length) {
    return res.status(400).json({ error: 'Array of leads is required to enqueue.' });
  }

  try {
    const result = await enqueueLeads(leads, {
      brand,
      channel,
      targetRole: target_role
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Could not enqueue leads: ' + err.message });
  }
});

// POST /api/crm/ai-drip/tick — Trigger single safe tick
router.post('/ai-drip/tick', requireAuth, async (req, res) => {
  try {
    const result = await processDripQueueTick();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Drip tick error: ' + err.message });
  }
});

// POST /api/crm/ai-drip/toggle — Pause or resume automated queue processing
router.post('/ai-drip/toggle', requireAuth, async (req, res) => {
  const { active } = req.body;
  setDripEngineActive(Boolean(active));
  res.json({ ok: true, is_active: Boolean(active), message: `AI Safe Drip Engine is now ${active ? 'ACTIVE' : 'PAUSED'}.` });
});

module.exports = router;

