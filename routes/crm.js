const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { searchFmcsa } = require('../utils/fmcsa');
const { sanitizeEmail, emailValidationError } = require('../utils/email-valid');
const { ensureCrmLeadsTable } = require('../utils/ensure-growth-schema');
const { ensureSmsMessagesTable } = require('../utils/sms-inbox');

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
    const result = await searchFmcsa(q, { mode });
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
      equipment_types = ['53ft Dry Van', 'Reefer', 'Flatbed', 'Box Truck'],
      limit = 10,
      send_email = true,
      send_sms = true
    } = req.body;

    const maxLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const targetStates = Array.isArray(states) && states.length ? states : ['TX', 'FL', 'GA', 'IL', 'CA'];

    let scrapedCount = 0;
    let skippedDuplicates = 0;
    let excludedBanned = 0;
    let importedLeads = [];
    let emailsSent = 0;
    let smsSent = 0;

    for (const stateCode of targetStates) {
      if (importedLeads.length >= maxLimit) break;

      let fmcsaRes;
      try {
        fmcsaRes = await searchFmcsa(stateCode, { mode: 'state' });
      } catch (err) {
        console.warn(`FMCSA search for state ${stateCode} failed:`, err.message);
        continue;
      }

      const rawCarriers = fmcsaRes.carriers || [];

      for (const c of rawCarriers) {
        if (importedLeads.length >= maxLimit) break;
        scrapedCount++;

        // Filter 1: Authority Status MUST be Active Authorized
        const statusStr = String(c.authority_status || c.status || '').toUpperCase();
        if (statusStr.includes('INACTIVE') || statusStr.includes('REVOKED') || statusStr.includes('SUSPENDED')) {
          excludedBanned++;
          continue;
        }

        // Filter 2: Banned Equipment Exclusions (Buses, Agriculture, Hazmat Liquid Tankers, Household Movers)
        const compName = String(c.company_name || '').toLowerCase();
        const cargoDesc = String(c.equipment_type || c.cargo_carried || '').toLowerCase();

        const isBannedCategory = 
          compName.includes('bus') || compName.includes('limo') || compName.includes('charter') || compName.includes('tours') ||
          compName.includes('farm') || compName.includes('ranch') || compName.includes('cattle') || compName.includes('livestock') ||
          compName.includes('moving') || compName.includes('movers') || compName.includes('van lines') ||
          cargoDesc.includes('passenger') || cargoDesc.includes('school bus') || cargoDesc.includes('farm supp') || cargoDesc.includes('household');

        if (isBannedCategory) {
          excludedBanned++;
          continue;
        }

        // Filter 3: Check Duplicate in CRM Database
        const exists = await pool.query(
          `SELECT id FROM crm_leads 
           WHERE (mc_number <> '' AND mc_number = $1)
              OR (phone <> '' AND phone = $2)
              OR (email <> '' AND lower(email) = lower($3))
              OR (dot_number <> '' AND dot_number = $4)
           LIMIT 1`,
          [c.mc_number || '', c.phone || '', c.email || '', c.dot_number || '']
        );

        if (exists.rows.length > 0) {
          skippedDuplicates++;
          continue;
        }

        // Filter 4: Check if Phone or Email is Opted Out / Unsubscribed (TCPA Guard)
        if (c.phone) {
          const { isPhoneOptedOut } = require('../utils/sms-inbox');
          if (await isPhoneOptedOut(c.phone)) {
            excludedBanned++;
            continue;
          }
        }
        if (c.email) {
          const { isUnsubscribed } = require('../utils/mailer');
          if (await isUnsubscribed(c.email)) {
            excludedBanned++;
            continue;
          }
        }

        // Map equipment type to standard target freight equipment
        let matchedEquip = '53ft Dry Van';
        if (cargoDesc.includes('reefer') || cargoDesc.includes('cold') || cargoDesc.includes('frozen') || compName.includes('reefer')) {
          matchedEquip = 'Reefer';
        } else if (cargoDesc.includes('flatbed') || cargoDesc.includes('step') || cargoDesc.includes('heavy') || compName.includes('flatbed')) {
          matchedEquip = 'Flatbed';
        } else if (cargoDesc.includes('box') || compName.includes('box') || compName.includes('expedit')) {
          matchedEquip = 'Box Truck';
        } else if (cargoDesc.includes('power') || compName.includes('power')) {
          matchedEquip = 'Power Only';
        }

        // AI Personalized Copy Generation
        const stateName = c.state || stateCode;
        const ownerName = c.owner_name || 'Fleet Manager';
        const numUnits = c.num_trucks || 1;

        const emailSubject = `Dedicated Freight & Load Booking for ${c.company_name} (${matchedEquip} Fleet)`;
        const emailBodyText = `Hi ${ownerName},\n\n` +
          `Shipping Wish LLC dispatch team noticed ${c.company_name} is actively operating ${numUnits} ${matchedEquip} unit(s) out of ${stateName}.\n\n` +
          `We provide 24/7 dedicated dispatch, high-paying freight rate negotiation ($3.20/mile avg), and load board booking — you keep 100% of your gross pay with $0 upfront fees.\n\n` +
          `Would you be open to reviewing our current load availability for ${stateName}?\n\n` +
          `Best regards,\nShipping Wish Operations Team\nhttps://www.shippingwish.com`;

        const smsText = `Hi ${ownerName}, Shipping Wish LLC has premium ${matchedEquip} freight out of ${stateName}. We book loads 24/7 & you keep 100% pay. Check rates: https://www.shippingwish.com or reply YES.`;

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
            c.phone || '',
            c.email || '',
            c.mc_number || '',
            c.dot_number || '',
            matchedEquip,
            numUnits,
            stateName,
            req.user ? req.user.id : null,
            `Imported via AI Auto-Prospecting Bot for ${stateName} (${matchedEquip})`
          ]
        );

        const newLead = insertRes.rows[0];

        // Send Email Outreach if enabled and email present
        let emailSentStatus = false;
        if (send_email && c.email) {
          try {
            const { sendBrandedEmail } = require('../utils/mailer');
            await sendBrandedEmail({
              to: c.email,
              subject: emailSubject,
              text: emailBodyText,
              html: `<p>Hi <strong>${ownerName}</strong>,</p><p>Shipping Wish LLC dispatch team noticed <strong>${c.company_name}</strong> is actively operating ${numUnits} ${matchedEquip} unit(s) out of <strong>${stateName}</strong>.</p><p>We provide 24/7 dedicated dispatch, high-paying freight rate negotiation ($3.20/mile avg), and load board booking — you keep 100% of your gross pay with $0 upfront fees.</p><p><a href="https://www.shippingwish.com/services" style="background:#f59e0b;color:#0f172a;padding:10px 18px;border-radius:6px;font-weight:bold;text-decoration:none;display:inline-block;">View Dispatch Services &amp; Load Rates →</a></p>`,
              leadId: newLead.id,
              sentBy: req.user ? req.user.id : null,
              emailType: 'ai_prospecting'
            });
            emailSentStatus = true;
            emailsSent++;
          } catch (eErr) {
            console.warn('AI Campaign email error:', eErr.message);
          }
        }

        // Send SMS Outreach if enabled and phone present
        let smsSentStatus = false;
        if (send_sms && c.phone) {
          try {
            const { sendTwilioSms } = require('./voip');
            const { logSmsMessage, OUR_NUMBER } = require('../utils/sms-inbox');
            const smsRes = await sendTwilioSms(c.phone, smsText);
            if (smsRes.status === 'sent' || smsRes.status === 'logged') {
              smsSentStatus = true;
              smsSent++;
              await logSmsMessage({
                direction: 'outbound',
                from_number: OUR_NUMBER,
                to_number: c.phone,
                body: smsRes.body || smsText,
                lead_id: newLead.id,
                sent_by: req.user ? req.user.id : null,
                twilio_sid: smsRes.sid,
                disposition: smsRes.status,
                is_read: true
              }).catch(() => {});
            }
          } catch (sErr) {
            console.warn('AI Campaign SMS error:', sErr.message);
          }
        }

        importedLeads.push({
          id: newLead.id,
          company_name: newLead.company_name,
          mc_number: newLead.mc_number,
          dot_number: newLead.dot_number,
          state: stateName,
          equipment_type: matchedEquip,
          phone: newLead.phone,
          email: newLead.email,
          email_sent: emailSentStatus,
          sms_sent: smsSentStatus
        });
      }
    }

    res.json({
      ok: true,
      processed: scrapedCount,
      imported: importedLeads.length,
      emails_sent: emailsSent,
      sms_sent: smsSent,
      skipped_duplicates: skippedDuplicates,
      filtered_out: excludedBanned,
      leads: importedLeads
    });
  } catch (err) {
    console.error('AI Prospecting Campaign error:', err);
    res.status(500).json({ error: 'AI Prospecting Campaign failed: ' + err.message });
  }
});


// GET /api/crm/leads - Get all leads (Super Admin & Admin see all, Sales Rep sees assigned)
router.get('/leads', requireAuth, async (req, res) => {
  try {
    await ensureCrmLeadsTable().catch(() => {});
    await ensureSmsMessagesTable().catch(() => {});
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
        ) AS sms_opted_out
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

router.delete('/leads/:id', requireAuth, requireRole('admin', 'super_admin', 'dispatcher', 'sales_rep'), async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_leads WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
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

module.exports = router;

