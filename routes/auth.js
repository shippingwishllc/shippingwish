const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requireRole, requireSuperAdmin, JWT_SECRET, setAuthCookie } = require('../middleware/auth');

const router = express.Router();

// Simple in-memory rate limiter for auth endpoints
// In production, replace with Redis-backed limiter (e.g., express-rate-limit)
const rateLimitMap = new Map();
function rateLimit(maxAttempts = 10, windowMs = 60000) {
  return (req, res, next) => {
    const key = (req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count++;
    rateLimitMap.set(key, entry);
    if (entry.count > maxAttempts) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a minute before trying again.' });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, company_name: user.company_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Public signup — creates a carrier account by default
router.post('/signup', rateLimit(5, 60000), async (req, res) => {
  const { name, company, phone, email, password, mcNumber, dotNumber, address } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').split(',')[0].trim();
  const userAgent = req.headers['user-agent'] || '';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, address, signup_ip, user_agent)
       VALUES ($1, $2, $3, 'carrier', $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, email, role, company_name, phone, mc_number, dot_number, signup_ip`,
      [name, email, passwordHash, company || null, phone || null, mcNumber || null, dotNumber || null, address || null, clientIp, userAgent]
    );
    const user = result.rows[0];
    setAuthCookie(res, signToken(user));
    res.json({ ok: true, user });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Could not create account right now.' });
  }
});

// Login
router.post('/login', rateLimit(10, 60000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').split(',')[0].trim();

  try {
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    
    if (user.is_suspended) {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact Shipping Wish support.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    
    // Update IP for existing users if missing or on login
    await pool.query('UPDATE users SET signup_ip = $1 WHERE id = $2', [clientIp, user.id]);

    setAuthCookie(res, signToken(user));
    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_name: user.company_name,
        phone: user.phone,
        mc_number: user.mc_number,
        signup_ip: clientIp
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Could not sign in right now.' });
  }
});

// Get current user info
router.get('/me', requireAuth, async (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').split(',')[0].trim();
  try {
    await pool.query('UPDATE users SET signup_ip = $1 WHERE id = $2 AND signup_ip IS NULL', [clientIp, req.user.id]);
    const result = await pool.query(
      `SELECT id, name, email, role, company_name, phone, mc_number, dot_number, address, is_suspended, signup_ip, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not load account.' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('sw_token');
  res.json({ ok: true });
});

// SUPER ADMIN: List all users (with role filter)
router.get('/users', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.query;
    let query = `SELECT id, name, email, role, company_name, phone, mc_number, dot_number, is_suspended, signup_ip, created_at FROM users`;
    let params = [];
    if (role) {
      query += ` WHERE role = $1`;
      params.push(role);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load users.' });
  }
});

// SUPER ADMIN: Create Dispatcher or Carrier account
router.post('/users', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, email, password, role, company_name, phone, mc_number, dot_number, address } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required.' });
  }
  
  if (role === 'super_admin') {
    const countRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
    if (parseInt(countRes.rows[0].count, 10) >= 2) {
      return res.status(400).json({ error: 'Maximum 2 Super Admin accounts allowed.' });
    }
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'User email already exists.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, email, role, company_name, phone`,
      [name, email, hash, role, company_name || null, phone || null, mc_number || null, dot_number || null, address || null]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Could not create user.' });
  }
});

// SUPER ADMIN: Suspend/Unsuspend user
router.patch('/users/:id/suspend', requireAuth, requireSuperAdmin, async (req, res) => {
  const { suspended } = req.body;
  try {
    await pool.query('UPDATE users SET is_suspended = $1 WHERE id = $2', [Boolean(suspended), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not update user status.' });
  }
});

// SUPER ADMIN: Delete user
router.delete('/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const check = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (check.rows.length && check.rows[0].role === 'super_admin') {
      const countRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
      if (parseInt(countRes.rows[0].count, 10) <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only Super Admin account.' });
      }
    }
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete user.' });
  }
});

// List carriers — dispatchers see assigned carriers (or all if admin/super_admin)
router.get('/carriers', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'dispatcher') {
      // Return carriers assigned to this dispatcher, or unassigned ones
      query = `
        SELECT u.id, u.name, u.company_name, u.phone, u.email, u.mc_number, u.dot_number
        FROM users u
        LEFT JOIN dispatcher_carriers dc ON dc.carrier_id = u.id
        WHERE u.role = 'carrier' AND (dc.dispatcher_id = $1 OR dc.dispatcher_id IS NULL)
        ORDER BY u.name`;
      params = [req.user.id];
    } else {
      query = `SELECT id, name, company_name, phone, email, mc_number, dot_number FROM users WHERE role = 'carrier' ORDER BY name`;
      params = [];
    }
    const result = await pool.query(query, params);
    res.json({ carriers: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load carriers.' });
  }
});

// SUPER ADMIN: Assign carrier to dispatcher
router.post('/dispatcher-assignments', requireAuth, requireSuperAdmin, async (req, res) => {
  const { dispatcherId, carrierId } = req.body;
  if (!dispatcherId || !carrierId) {
    return res.status(400).json({ error: 'dispatcherId and carrierId are required.' });
  }
  try {
    await pool.query(
      `INSERT INTO dispatcher_carriers (dispatcher_id, carrier_id) VALUES ($1, $2)
       ON CONFLICT (dispatcher_id, carrier_id) DO NOTHING`,
      [dispatcherId, carrierId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not assign carrier to dispatcher.' });
  }
});

module.exports = router;
