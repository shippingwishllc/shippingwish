const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');

const router = express.Router();

async function ensureBrokerTeamTables() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS team_role TEXT DEFAULT 'dispatcher';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `).catch(() => {});
}

// Ensure the caller is an authorized broker account
async function requireBrokerAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const role = req.user.role;
  if (!['broker', 'admin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: 'Only broker admin accounts can manage team sub-users.' });
  }
  next();
}

// GET /api/broker/team — List all sub-users under this broker's company
router.get(['/broker/team', '/team'], requireAuth, requireBrokerAdmin, async (req, res) => {
  await ensureBrokerTeamTables();
  try {
    const brokerId = req.user.id;
    const result = await pool.query(
      `SELECT id, name, email, role, team_role, phone, is_suspended, created_at
       FROM users
       WHERE parent_user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [brokerId]
    );

    res.json({
      ok: true,
      team: result.rows,
      broker: {
        id: req.user.id,
        name: req.user.name,
        company: req.user.company_name,
        mc: req.user.mc_number
      }
    });
  } catch (err) {
    console.error('Fetch broker team error:', err);
    res.status(500).json({ error: 'Could not fetch team members.' });
  }
});

// POST /api/broker/team — Create a new sub-user under this broker
router.post(['/broker/team', '/team'], requireAuth, requireBrokerAdmin, async (req, res) => {
  await ensureBrokerTeamTables();
  const { name, email, password, phone, role: subRole } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const validRole = subRole || 'Freight Dispatcher';

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
      [emailNorm]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'A user account with this email already exists.' });
    }

    const brokerRes = await pool.query(
      'SELECT id, name, company_name, mc_number, dot_number, phone FROM users WHERE id = $1',
      [req.user.id]
    );
    const broker = brokerRes.rows[0] || {};

    const passwordHash = await bcrypt.hash(password, 10);

    const insertRes = await pool.query(
      `INSERT INTO users (
        name, email, password_hash, role, company_name, phone,
        mc_number, dot_number, parent_user_id, team_role,
        email_verified_at, is_suspended, weekly_plan
      ) VALUES ($1, $2, $3, 'broker', $4, $5, $6, $7, $8, $9, NOW(), false, 'broker_subuser')
      RETURNING id, name, email, role, team_role, phone, is_suspended, created_at`,
      [
        name.trim(),
        emailNorm,
        passwordHash,
        broker.company_name || 'Brokerage',
        phone || broker.phone || null,
        broker.mc_number || null,
        broker.dot_number || null,
        req.user.id,
        validRole
      ]
    );

    const newUser = insertRes.rows[0];

    // Send welcome credentials email to new employee
    const company = broker.company_name || 'LoadsNexus Brokerage';
    sendBrandedEmail({
      to: emailNorm,
      from: 'LoadsNexus Team <dispatch@loadsnexus.com>',
      subject: `Welcome to ${company} on LoadsNexus — Your Login Credentials`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="background: #0f172a; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px;">
            <span style="color: #a855f7; font-weight: 800; font-size: 18px; letter-spacing: 0.05em;">LOADSNEXUS™ BROKER DESK</span>
          </div>
          <h2 style="color: #0f172a; margin-top: 0; font-size: 18px;">Welcome to ${company}!</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">
            Hello <strong>${name}</strong>,<br>
            Your broker admin (${broker.name || company}) has created a team account for you on the LoadsNexus Freight Cockpit.
          </p>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; color: #334155; line-height: 1.6;">
            <strong>Role:</strong> ${validRole}<br>
            <strong>Login Email:</strong> ${emailNorm}<br>
            <strong>Temporary Password:</strong> ${password}<br>
            <strong>Portal URL:</strong> <a href="https://www.loadsnexus.com" style="color: #7c3aed; font-weight: bold;">https://www.loadsnexus.com</a>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
            You can now sign in to post loads, respond to carrier inquiries, verify MC authority, and tender freight on behalf of ${company}.
          </p>
        </div>
      `,
      text: `Your LoadsNexus team account for ${company} is ready. Login: ${emailNorm} / Pass: ${password}`,
      emailType: 'team_subuser_invite',
      transactional: true
    }).catch(err => console.warn('Subuser invite email notice:', err.message));

    res.json({
      ok: true,
      user: newUser,
      message: `Team member ${name} created successfully. An invitation with login details has been sent to ${emailNorm}.`
    });
  } catch (err) {
    console.error('Create broker sub-user error:', err);
    res.status(500).json({ error: 'Could not create team member.' });
  }
});

// PUT /api/broker/team/:id/toggle — Suspend or Activate a sub-user
router.put(['/broker/team/:id/toggle', '/team/:id/toggle'], requireAuth, requireBrokerAdmin, async (req, res) => {
  await ensureBrokerTeamTables();
  const subUserId = req.params.id;

  try {
    const check = await pool.query(
      'SELECT id, is_suspended, name FROM users WHERE id = $1 AND parent_user_id = $2 AND deleted_at IS NULL',
      [subUserId, req.user.id]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Team member not found under your account.' });
    }

    const currentSuspended = check.rows[0].is_suspended;
    const newStatus = !currentSuspended;

    await pool.query(
      'UPDATE users SET is_suspended = $1 WHERE id = $2',
      [newStatus, subUserId]
    );

    res.json({
      ok: true,
      id: subUserId,
      is_suspended: newStatus,
      message: `${check.rows[0].name} has been ${newStatus ? 'deactivated' : 'activated'}.`
    });
  } catch (err) {
    console.error('Toggle sub-user error:', err);
    res.status(500).json({ error: 'Could not update team member status.' });
  }
});

// DELETE /api/broker/team/:id — Remove a sub-user (soft delete)
router.delete(['/broker/team/:id', '/team/:id'], requireAuth, requireBrokerAdmin, async (req, res) => {
  await ensureBrokerTeamTables();
  const subUserId = req.params.id;

  try {
    const check = await pool.query(
      'SELECT id, name FROM users WHERE id = $1 AND parent_user_id = $2 AND deleted_at IS NULL',
      [subUserId, req.user.id]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Team member not found under your account.' });
    }

    await pool.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1',
      [subUserId]
    );

    res.json({
      ok: true,
      message: `Team member ${check.rows[0].name} removed successfully.`
    });
  } catch (err) {
    console.error('Delete sub-user error:', err);
    res.status(500).json({ error: 'Could not remove team member.' });
  }
});

module.exports = router;
