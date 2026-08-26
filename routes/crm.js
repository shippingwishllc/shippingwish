const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { searchFmcsa } = require('../utils/fmcsa');
const { ensureCrmLeadsTable } = require('../utils/ensure-growth-schema');

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
  const q = (req.query.q || req.query.name || req.query.mc || req.query.dot || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Provide q, name, mc, or dot to search.' });
  }

  try {
    const result = await searchFmcsa(q);
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


// GET /api/crm/leads - Get all leads (Super Admin & Admin see all, Sales Rep sees assigned)
router.get('/leads', requireAuth, async (req, res) => {
  try {
    await ensureCrmLeadsTable().catch(() => {});
    let query = `
      SELECT l.*, u.name as sales_rep_name
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
    const email = String(req.body.email || '').trim().toLowerCase();
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
      dupChecks.push(`regexp_replace(COALESCE(mc_number,''), '[^0-9]', '', 'g') = $${dupParams.length}`);
    }
    if (phone && phone !== 'unknown') {
      dupParams.push(phone);
      dupChecks.push(`phone = $${dupParams.length}`);
    }
    if (email) {
      dupParams.push(email);
      dupChecks.push(`lower(COALESCE(email,'')) = $${dupParams.length}`);
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

