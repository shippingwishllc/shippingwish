const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// GET /api/employees - Get all internal staff (Dispatchers & Sales Reps) with HR info
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.name, u.email, u.role, u.is_suspended, u.created_at,
             hr.job_title, hr.salary, hr.pay_frequency, hr.join_date, hr.notes
      FROM users u
      LEFT JOIN employee_hr hr ON u.id = hr.user_id
      WHERE u.role IN ('dispatcher', 'sales_rep', 'admin')
      ORDER BY u.role, u.created_at DESC
    `;
    const result = await pool.query(query);
    res.json({ employees: result.rows });
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: 'Server error fetching employee ledger' });
  }
});

// POST /api/employees - Admin creates new internal employee (Dispatcher or Sales Rep)
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, password, role, job_title, salary, pay_frequency, join_date, notes } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    if (!['dispatcher', 'sales_rep', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid internal employee role' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role]
    );
    const user = userResult.rows[0];

    // Create HR Ledger entry
    await pool.query(
      `INSERT INTO employee_hr (user_id, job_title, salary, pay_frequency, join_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        job_title || (role === 'dispatcher' ? 'Freight Dispatcher' : 'Sales Representative'),
        salary || 0.00,
        pay_frequency || 'monthly',
        join_date || new Date().toISOString().split('T')[0],
        notes || ''
      ]
    );

    res.status(201).json({ message: 'Employee created successfully', user });
  } catch (err) {
    console.error('Error creating employee:', err);
    res.status(500).json({ error: 'Server error creating employee' });
  }
});

// PUT /api/employees/:id/toggle-active - Toggle suspension (Activate / Deactivate Kill-Switch)
router.put('/:id/toggle-active', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET is_suspended = NOT is_suspended WHERE id = $1 RETURNING id, name, is_suspended`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: `Employee status updated`, user: result.rows[0] });
  } catch (err) {
    console.error('Error toggling employee status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/employees/:id/reset-password - Admin resets employee password
router.put('/:id/reset-password', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const passwordHash = await bcrypt.hash(new_password, 10);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
    res.json({ message: 'Employee password reset successfully' });
  } catch (err) {
    console.error('Error resetting employee password:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/employees/:id/hr - Update HR salary & details
router.put('/:id/hr', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { job_title, salary, pay_frequency, join_date, notes } = req.body;

    await pool.query(
      `INSERT INTO employee_hr (user_id, job_title, salary, pay_frequency, join_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
       job_title = EXCLUDED.job_title,
       salary = EXCLUDED.salary,
       pay_frequency = EXCLUDED.pay_frequency,
       join_date = EXCLUDED.join_date,
       notes = EXCLUDED.notes,
       updated_at = now()`,
      [id, job_title, salary || 0.00, pay_frequency || 'monthly', join_date, notes]
    );

    res.json({ message: 'Employee HR record updated' });
  } catch (err) {
    console.error('Error updating HR record:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/employees/dispatcher-assignments - List truck/driver assignments per dispatcher
router.get('/dispatcher-assignments', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT dt.*, u.name as dispatcher_name, t.truck_number, d.name as driver_name, d.phone as driver_phone
      FROM dispatcher_trucks dt
      JOIN users u ON dt.dispatcher_id = u.id
      JOIN trucks t ON dt.truck_id = t.id
      LEFT JOIN drivers d ON dt.driver_id = d.id
      ORDER BY dt.created_at DESC
    `;
    const result = await pool.query(query);
    res.json({ assignments: result.rows });
  } catch (err) {
    console.error('Error fetching dispatcher assignments:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/employees/assign-truck - Assign truck/driver to dispatcher (supports multi-dispatcher assignment)
router.post('/assign-truck', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { dispatcher_id, truck_id, driver_id, shift_type } = req.body;
    if (!dispatcher_id || !truck_id) {
      return res.status(400).json({ error: 'Dispatcher ID and Truck ID are required' });
    }

    const result = await pool.query(
      `INSERT INTO dispatcher_trucks (dispatcher_id, truck_id, driver_id, shift_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dispatcher_id, truck_id) DO UPDATE SET
       driver_id = EXCLUDED.driver_id, shift_type = EXCLUDED.shift_type
       RETURNING *`,
      [dispatcher_id, truck_id, driver_id || null, shift_type || 'all']
    );

    res.json({ message: 'Truck assigned to dispatcher successfully', assignment: result.rows[0] });
  } catch (err) {
    console.error('Error assigning truck to dispatcher:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/employees/unassign-truck - Remove truck assignment from dispatcher
router.delete('/unassign-truck', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { dispatcher_id, truck_id } = req.body;
    await pool.query(
      `DELETE FROM dispatcher_trucks WHERE dispatcher_id = $1 AND truck_id = $2`,
      [dispatcher_id, truck_id]
    );
    res.json({ message: 'Truck unassigned from dispatcher' });
  } catch (err) {
    console.error('Error unassigning truck:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
