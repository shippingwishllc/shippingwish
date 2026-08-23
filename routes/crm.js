const express = require('express');
const router = express.Router();
const pool = require('../db');
const https = require('https');
const { requireAuth, requireRole } = require('../middleware/auth');

// ============================================================
// FMCSA API — Search US Carriers by Name, MC#, or DOT#
// Free government API: ai.fmcsa.dot.gov
// Returns: company_name, mc_number, dot_number, phone, email,
//          address, equipment type, number of trucks, state
// Set FMCSA_API_KEY in .env (register free at ai.fmcsa.dot.gov)
// ============================================================
router.get('/fmcsa/search', requireAuth, async (req, res) => {
  const { mc, dot, name } = req.query;

  if (!mc && !dot && !name) {
    return res.status(400).json({ error: 'Provide mc, dot, or name to search.' });
  }

  const apiKey = process.env.FMCSA_API_KEY;

  // --- LIVE FMCSA API ---
  if (apiKey) {
    try {
      let fmcsaUrl = '';
      if (mc) {
        fmcsaUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${encodeURIComponent(mc)}?webKey=${apiKey}`;
      } else if (dot) {
        fmcsaUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${encodeURIComponent(dot)}?webKey=${apiKey}`;
      } else {
        fmcsaUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/name/${encodeURIComponent(name)}?webKey=${apiKey}`;
      }

      const data = await new Promise((resolve, reject) => {
        https.get(fmcsaUrl, (resp) => {
          let body = '';
          resp.on('data', d => body += d);
          resp.on('end', () => {
            try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
          });
        }).on('error', reject);
      });

      // Normalize FMCSA response into our carrier lead format
      const carriers = (data.content || (data.carrier ? [data] : [])).map(c => {
        const carrier = c.carrier || c;
        return {
          company_name:   carrier.legalName  || carrier.dbaName || '',
          owner_name:     carrier.dbaName    || '',
          mc_number:      carrier.dotNumber  ? '' : (mc || ''),
          dot_number:     carrier.dotNumber  || dot || '',
          phone:          carrier.telephone  || '',
          email:          carrier.email      || '',
          address:        `${carrier.phyCity || ''}, ${carrier.phyState || ''} ${carrier.phyZipcode || ''}`.trim(),
          equipment_type: carrier.carrierOperation || '53ft Dry Van',
          num_trucks:     carrier.totalTrucks || 1,
          state:          carrier.phyState   || '',
          // Check if already in our CRM
          already_in_crm: false
        };
      });

      // Check which ones are already in CRM (by MC or phone)
      for (const c of carriers) {
        if (c.mc_number || c.phone) {
          const exists = await pool.query(
            `SELECT id, sales_rep_id, status,
                    (SELECT name FROM users WHERE id = crm_leads.sales_rep_id) AS owned_by
             FROM crm_leads
             WHERE mc_number = $1 OR phone = $2 LIMIT 1`,
            [c.mc_number || '', c.phone || '']
          );
          if (exists.rows.length) {
            c.already_in_crm = true;
            c.crm_lead_id    = exists.rows[0].id;
            c.crm_status     = exists.rows[0].status;
            c.owned_by       = exists.rows[0].owned_by || 'Unassigned';
          }
        }
      }

      return res.json({ source: 'FMCSA Live API', carriers });
    } catch (fmcsaErr) {
      console.warn('FMCSA API error, using fallback:', fmcsaErr.message);
    }
  }

  // --- FALLBACK: Simulated demo data when no API key ---
  const mockCarriers = [
    { company_name: 'Eagle Transport LLC',    owner_name: 'James Rodriguez', mc_number: 'MC-882341', dot_number: '3841220', phone: '+12145550192', email: 'james@eagletransport.com', address: 'Dallas, TX 75201',   equipment_type: '53ft Dry Van',  num_trucks: 3, state: 'TX', already_in_crm: false },
    { company_name: 'BlueStar Freight Inc',   owner_name: 'Maria Chen',      mc_number: 'MC-774511', dot_number: '3729100', phone: '+17135550384', email: 'maria@bluestarfreight.com', address: 'Houston, TX 77001',  equipment_type: 'Box Truck',     num_trucks: 1, state: 'TX', already_in_crm: false },
    { company_name: 'Alpha Reefer Solutions', owner_name: 'Kevin Brown',     mc_number: 'MC-991203', dot_number: '4012887', phone: '+14695550821', email: 'kevin@alphareefer.com',    address: 'Atlanta, GA 30301',  equipment_type: 'Reefer',        num_trucks: 2, state: 'GA', already_in_crm: false },
    { company_name: 'Rio Grande Trucking',    owner_name: 'Carlos Vasquez',  mc_number: 'MC-663478', dot_number: '3560021', phone: '+12105550673', email: 'carlos@riogrande.com',    address: 'San Antonio, TX 78201', equipment_type: 'Flatbed',      num_trucks: 4, state: 'TX', already_in_crm: false },
    { company_name: 'Apex Road Carriers',     owner_name: 'Linda Park',      mc_number: 'MC-558829', dot_number: '3301447', phone: '+13125550149', email: 'linda@apexroad.com',      address: 'Chicago, IL 60601',  equipment_type: '53ft Dry Van',  num_trucks: 2, state: 'IL', already_in_crm: false },
  ].filter(c =>
    !name || c.company_name.toLowerCase().includes(name.toLowerCase()) ||
    c.owner_name.toLowerCase().includes(name.toLowerCase())
  );

  // Check CRM duplicates even for mock data
  for (const c of mockCarriers) {
    const exists = await pool.query(
      `SELECT id, status, (SELECT name FROM users WHERE id = crm_leads.sales_rep_id) AS owned_by
       FROM crm_leads WHERE mc_number = $1 OR phone = $2 LIMIT 1`,
      [c.mc_number, c.phone]
    );
    if (exists.rows.length) {
      c.already_in_crm = true;
      c.crm_lead_id    = exists.rows[0].id;
      c.crm_status     = exists.rows[0].status;
      c.owned_by       = exists.rows[0].owned_by || 'Unassigned';
    }
  }

  res.json({
    source: 'Demo Data (Add FMCSA_API_KEY in Vercel to get live US carrier data)',
    carriers: mockCarriers
  });
});

// GET /api/crm/fmcsa/carrier/:mc - Get single carrier full details by MC#
router.get('/fmcsa/carrier/:mc', requireAuth, async (req, res) => {
  const mc = req.params.mc.replace(/[^0-9]/g, ''); // strip 'MC-' prefix
  const apiKey = process.env.FMCSA_API_KEY;
  if (!apiKey) return res.json({ message: 'FMCSA_API_KEY not configured. Add it in Vercel ENV.' });

  try {
    const data = await new Promise((resolve, reject) => {
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${mc}?webKey=${apiKey}`;
      https.get(url, (resp) => {
        let body = '';
        resp.on('data', d => body += d);
        resp.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'FMCSA lookup failed: ' + err.message });
  }
});


// GET /api/crm/leads - Get all leads (Super Admin & Admin see all, Sales Rep sees assigned)
router.get('/leads', requireAuth, async (req, res) => {
  try {
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
    const {
      company_name, owner_name, phone, email,
      mc_number, dot_number, equipment_type,
      num_trucks, target_lanes, notes
    } = req.body;

    if (!company_name || !phone) {
      return res.status(400).json({ error: 'Company name and phone number are required' });
    }

    // ============================================================
    // DUPLICATE CHECK — Prevent 2 sales reps calling same carrier
    // Check by MC number, phone number, OR email address
    // ============================================================
    const dupChecks = [];
    const dupParams = [];

    if (mc_number && mc_number.trim()) {
      dupParams.push(mc_number.trim());
      dupChecks.push(`mc_number = $${dupParams.length}`);
    }
    if (phone && phone.trim()) {
      dupParams.push(phone.trim());
      dupChecks.push(`phone = $${dupParams.length}`);
    }
    if (email && email.trim()) {
      dupParams.push(email.trim().toLowerCase());
      dupChecks.push(`lower(email) = $${dupParams.length}`);
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
            id:           dup.id,
            company_name: dup.company_name,
            mc_number:    dup.mc_number,
            phone:        dup.phone,
            status:       dup.status,
            owned_by:     dup.owned_by || 'Unassigned',
            owner_id:     dup.owner_id
          }
        });
      }
    }

    // No duplicate — safe to create
    const sales_rep_id = req.body.sales_rep_id || (req.user.role === 'sales_rep' ? req.user.id : null);

    const result = await pool.query(
      `INSERT INTO crm_leads (
        company_name, owner_name, phone, email, mc_number, dot_number,
        equipment_type, num_trucks, target_lanes, status, sales_rep_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11)
      RETURNING *`,
      [
        company_name, owner_name || '', phone,
        email ? email.toLowerCase() : '',
        mc_number || '', dot_number || '',
        equipment_type || '53ft Dry Van',
        num_trucks || 1, target_lanes || '',
        sales_rep_id, notes || ''
      ]
    );

    // Auto-create initial follow-up task
    await pool.query(
      `INSERT INTO lead_tasks (lead_id, assigned_to, task_title, due_date)
       VALUES ($1, $2, $3, CURRENT_DATE)`,
      [result.rows[0].id, sales_rep_id || req.user.id, `Initial Cold Call & Intro Email to ${company_name}`]
    );

    res.status(201).json({ message: 'Lead created successfully', lead: result.rows[0] });
  } catch (err) {
    console.error('Error creating CRM lead:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// POST /api/crm/leads/import-fmcsa
// Bulk import carriers from FMCSA search results into CRM
// Body: { carriers: [...], sales_rep_id: 5 }
// Skips duplicates automatically
// ============================================================
router.post('/leads/import-fmcsa', requireAuth, requireRole('admin', 'super_admin', 'dispatcher'), async (req, res) => {
  const { carriers, sales_rep_id } = req.body;
  if (!Array.isArray(carriers) || carriers.length === 0) {
    return res.status(400).json({ error: 'carriers[] array is required.' });
  }

  const repId = sales_rep_id || req.user.id;
  let imported = 0, skipped = 0;
  const skipReasons = [];

  for (const c of carriers) {
    if (!c.company_name || !c.phone) { skipped++; continue; }

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

    const ins = await pool.query(
      `INSERT INTO crm_leads (company_name, owner_name, phone, email, mc_number, dot_number, equipment_type, num_trucks, status, sales_rep_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$10) RETURNING id`,
      [c.company_name, c.owner_name||'', c.phone, (c.email||'').toLowerCase(), c.mc_number||'', c.dot_number||'', c.equipment_type||'53ft Dry Van', c.num_trucks||1, repId, `Imported from FMCSA. State: ${c.state||'N/A'}. Address: ${c.address||'N/A'}`]
    );
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

module.exports = router;

module.exports = router;

