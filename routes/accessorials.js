const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// List accessorials for a load
router.get('/load/:loadId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM load_accessorials WHERE load_id = $1 ORDER BY created_at ASC`,
      [req.params.loadId]
    );
    res.json({ accessorials: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load accessorials.' });
  }
});

// Request / Add accessorial (Detention, TONU, Layover, Lumper, Fuel Advance)
router.post('/load/:loadId', requireAuth, async (req, res) => {
  const { loadId } = req.params;
  const { type, amount, notes } = req.body;
  const validTypes = ['detention', 'tonu', 'layover', 'lumper', 'fuel_advance', 'other'];

  if (!type || !validTypes.includes(type) || !amount) {
    return res.status(400).json({ error: 'Valid type and amount are required.' });
  }

  try {
    const loadCheck = await pool.query('SELECT carrier_id FROM loads WHERE id = $1', [loadId]);
    if (!loadCheck.rows.length) return res.status(404).json({ error: 'Load not found.' });

    if (req.user.role === 'carrier' && loadCheck.rows[0].carrier_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this load.' });
    }

    const result = await pool.query(
      `INSERT INTO load_accessorials (load_id, type, amount, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [loadId, type, amount, notes || null]
    );
    res.json({ ok: true, accessorial: result.rows[0] });
  } catch (err) {
    console.error('Add accessorial error:', err);
    res.status(500).json({ error: 'Could not add accessorial request.' });
  }
});

// Approve/Reject accessorial — dispatcher/admin only
router.patch('/:id/approve', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  const { approved } = req.body;
  try {
    const result = await pool.query(
      `UPDATE load_accessorials SET approved = $1 WHERE id = $2 RETURNING *`,
      [Boolean(approved), req.params.id]
    );
    res.json({ ok: true, accessorial: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not update accessorial status.' });
  }
});

// Delete accessorial
router.delete('/:id', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM load_accessorials WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete accessorial.' });
  }
});

module.exports = router;
