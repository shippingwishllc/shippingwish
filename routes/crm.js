const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

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

// POST /api/crm/leads - Add a new carrier lead
router.post('/leads', requireAuth, async (req, res) => {
  try {
    const {
      company_name,
      owner_name,
      phone,
      email,
      mc_number,
      dot_number,
      equipment_type,
      num_trucks,
      target_lanes,
      notes
    } = req.body;

    if (!company_name || !phone) {
      return res.status(400).json({ error: 'Company name and phone number are required' });
    }

    const sales_rep_id = req.body.sales_rep_id || (req.user.role === 'sales_rep' ? req.user.id : null);

    const result = await pool.query(
      `INSERT INTO crm_leads (
        company_name, owner_name, phone, email, mc_number, dot_number,
        equipment_type, num_trucks, target_lanes, status, sales_rep_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11)
      RETURNING *`,
      [
        company_name,
        owner_name || '',
        phone,
        email || '',
        mc_number || '',
        dot_number || '',
        equipment_type || '53ft Dry Van',
        num_trucks || 1,
        target_lanes || '',
        sales_rep_id,
        notes || ''
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

// PUT /api/crm/leads/:id/status - Update lead stage & notes
router.put('/leads/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['new', 'contacted', 'interested', 'packet_sent', 'active', 'dead'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid lead status' });
    }

    const result = await pool.query(
      `UPDATE crm_leads
       SET status = $1, notes = COALESCE($2, notes), last_contacted_at = now()
       WHERE id = $3
       RETURNING *`,
      [status, notes, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ message: 'Lead status updated', lead: result.rows[0] });
  } catch (err) {
    console.error('Error updating lead status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/crm/tasks - Get daily To-Do list for assigned rep
router.get('/tasks', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT t.*, l.company_name, l.owner_name, l.phone, l.email, l.status as lead_status
      FROM lead_tasks t
      JOIN crm_leads l ON t.lead_id = l.id
      WHERE t.assigned_to = $1 AND t.due_date <= CURRENT_DATE
      ORDER BY t.is_completed ASC, t.id DESC
    `;
    const result = await pool.query(query, [req.user.id]);
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('Error fetching CRM tasks:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/crm/tasks/:id/toggle - Toggle task completion
router.put('/tasks/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE lead_tasks SET is_completed = NOT is_completed WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error('Error toggling task:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
