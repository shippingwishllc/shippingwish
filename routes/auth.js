const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requireRole, requireSuperAdmin, JWT_SECRET, setAuthCookie } = require('../middleware/auth');
const { sendBrandedEmail } = require('../utils/mailer');
const { COMPANY, APP_URL, escapeHtml, buildTemplate } = require('../utils/email-templates');
const { getCarrierAccess, TRIAL_DAYS, isCarrierRole } = require('../middleware/subscription');

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

router.get('/debug-db', async (req, res) => {
  const envKeys = Object.keys(process.env).filter(k => 
    k.toLowerCase().includes('postg') || 
    k.toLowerCase().includes('data') || 
    k.toLowerCase().includes('neon') || 
    k.toLowerCase().includes('stor') || 
    k.toLowerCase().includes('pg')
  );
  
  try {
    const testRes = await pool.query('SELECT current_database(), current_user, now()');
    const userCount = await pool.query('SELECT count(*) FROM users');
    const sampleUsers = await pool.query('SELECT id, email, role FROM users LIMIT 5');
    res.json({
      ok: true,
      connected_db: testRes.rows[0],
      users_in_db: parseInt(userCount.rows[0].count, 10),
      users_sample: sampleUsers.rows,
      detected_env_keys: envKeys
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error_message: err.message,
      error_code: err.code,
      error_detail: err.detail,
      detected_env_keys: envKeys
    });
  }
});

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company_name: user.company_name,
      organization_id: user.organization_id || null,
      carrier_id: user.role === 'carrier' || user.role === 'carrier_admin' ? user.id : (user.organization_id || null)
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function createPortalSignupLead(user, meta) {
  const { company, phone, mcNumber, dotNumber } = meta;
  try {
    const dup = await pool.query(
      `SELECT id FROM crm_leads
       WHERE lower(email) = lower($1)
          OR ($2 != '' AND mc_number = $2)
       LIMIT 1`,
      [user.email, mcNumber || '']
    );
    if (dup.rows.length) return dup.rows[0].id;

    const notes = 'Portal signup — assign dispatcher, send onboarding packet. Stripe weekly plan not started yet unless they complete checkout.';
    let ins;
    try {
      ins = await pool.query(
        `INSERT INTO crm_leads (company_name, owner_name, phone, email, mc_number, dot_number, equipment_type, num_trucks, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,'dry_van',1,'new',$7) RETURNING id`,
        [company || user.name, user.name, phone || '', user.email, mcNumber || '', dotNumber || '', notes]
      );
    } catch (colErr) {
      ins = await pool.query(
        `INSERT INTO crm_leads (company_name, owner_name, phone, email, mc_number, dot_number, equipment_type, num_trucks, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,'53ft Dry Van',1,'new',$7) RETURNING id`,
        [company || user.name, user.name, phone || '', user.email, mcNumber || '', dotNumber || '', notes]
      );
    }
    return ins.rows[0].id;
  } catch (err) {
    console.warn('Portal signup CRM lead skipped:', err.message);
    return null;
  }
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const NOREPLY_FROM = process.env.MAIL_FROM_NOREPLY || 'Shipping Wish LLC <noreply@shippingwish.com>';

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function ensureSignupTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signup_pending (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      otp_hash TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      company_name TEXT,
      phone TEXT,
      mc_number TEXT,
      dot_number TEXT,
      address TEXT,
      signup_ip TEXT,
      user_agent TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ').catch(() => {});
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ').catch(() => {});
}

// Step 1 — send OTP to email (noreply@shippingwish.com)
router.post('/signup/send-otp', rateLimit(5, 60000), async (req, res) => {
  const { name, company, phone, email, password, mcNumber, dotNumber, address } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').split(',')[0].trim();
  const userAgent = req.headers['user-agent'] || '';
  const emailNorm = String(email).trim().toLowerCase();

  try {
    await ensureSignupTables();
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [emailNorm]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await pool.query(
      `INSERT INTO signup_pending (email, otp_hash, password_hash, name, company_name, phone, mc_number, dot_number, address, signup_ip, user_agent, attempts, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12)
       ON CONFLICT (email) DO UPDATE SET
         otp_hash = EXCLUDED.otp_hash,
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         company_name = EXCLUDED.company_name,
         phone = EXCLUDED.phone,
         mc_number = EXCLUDED.mc_number,
         dot_number = EXCLUDED.dot_number,
         address = EXCLUDED.address,
         signup_ip = EXCLUDED.signup_ip,
         user_agent = EXCLUDED.user_agent,
         attempts = 0,
         expires_at = EXCLUDED.expires_at`,
      [emailNorm, otpHash, passwordHash, name, company || null, phone || null, mcNumber || null, dotNumber || null, address || null, clientIp, userAgent, expiresAt]
    );

    const tpl = buildTemplate('signup_otp', { name, otp, trialDays: TRIAL_DAYS });
    await sendBrandedEmail({
      to: emailNorm,
      subject: `Your Shipping Wish verification code: ${otp}`,
      html: tpl.html,
      text: tpl.text,
      emailType: 'signup_otp',
      templateKey: 'signup_otp',
      transactional: true,
      from: NOREPLY_FROM
    });

    res.json({ ok: true, message: 'Verification code sent.', expiresInMinutes: 10 });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ error: 'Could not send verification code. Try again in a minute.' });
  }
});

// Step 2 — verify OTP and create account with 7-day portal trial
router.post('/signup/verify-otp', rateLimit(10, 60000), async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const otpClean = String(otp).trim().replace(/\s/g, '');

  try {
    await ensureSignupTables();
    const pendingRes = await pool.query('SELECT * FROM signup_pending WHERE lower(email) = lower($1)', [emailNorm]);
    if (!pendingRes.rows.length) {
      return res.status(400).json({ error: 'No pending signup for this email. Request a new code.' });
    }
    const pending = pendingRes.rows[0];

    if (new Date(pending.expires_at) < new Date()) {
      await pool.query('DELETE FROM signup_pending WHERE id = $1', [pending.id]);
      return res.status(400).json({ error: 'Code expired. Request a new verification code.' });
    }

    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    }

    const otpOk = await bcrypt.compare(otpClean, pending.otp_hash);
    if (!otpOk) {
      await pool.query('UPDATE signup_pending SET attempts = attempts + 1 WHERE id = $1', [pending.id]);
      return res.status(400).json({ error: 'Incorrect code. Check your email and try again.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [emailNorm]);
    if (existing.rows.length) {
      await pool.query('DELETE FROM signup_pending WHERE id = $1', [pending.id]);
      return res.status(409).json({ error: 'Account already exists. Sign in instead.' });
    }

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, address, signup_ip, user_agent, trial_ends_at, email_verified_at)
       VALUES ($1, $2, $3, 'carrier', $4, $5, $6, $7, $8, $9, $10, $11, now())
       RETURNING id, name, email, role, company_name, phone, mc_number, dot_number, signup_ip, trial_ends_at`,
      [pending.name, emailNorm, pending.password_hash, pending.company_name, pending.phone, pending.mc_number, pending.dot_number, pending.address, pending.signup_ip, pending.user_agent, trialEnds]
    );
    const user = result.rows[0];
    await pool.query('DELETE FROM signup_pending WHERE id = $1', [pending.id]);

    setAuthCookie(res, signToken(user));
    await createPortalSignupLead(user, {
      company: pending.company_name,
      phone: pending.phone,
      mcNumber: pending.mc_number,
      dotNumber: pending.dot_number
    });

    const ops = [...new Set([COMPANY.operationsEmail, process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean))];
    const subject = `Portal signup (verified) — ${pending.company_name || pending.name}`;
    const html = `<p>Carrier verified email and created portal login.</p>
      <p><strong>${escapeHtml(pending.name)}</strong><br>${escapeHtml(pending.company_name || '')}<br>${escapeHtml(emailNorm)}</p>
      <p>${TRIAL_DAYS}-day portal trial until ${trialEnds.toISOString().slice(0, 10)}. Stripe weekly plan still required after trial unless they subscribe early.</p>`;
    Promise.all(ops.map((to) => sendBrandedEmail({
      to, subject, html, text: subject, emailType: 'internal_lead', templateKey: 'internal_signup', transactional: true
    }))).catch((err) => console.error('Signup notify:', err.message));

    const access = await getCarrierAccess(user.id, user.email);
    res.json({ ok: true, user, access, trialDays: TRIAL_DAYS });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Could not verify code right now.' });
  }
});

// Legacy direct signup — disabled (OTP required)
router.post('/signup', rateLimit(5, 60000), async (req, res) => {
  return res.status(400).json({
    error: 'Email verification is required. Enter your details and use the code we email you.',
    code: 'OTP_REQUIRED'
  });
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
    const userOut = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company_name: user.company_name,
      phone: user.phone,
      mc_number: user.mc_number,
      signup_ip: clientIp
    };
    const payload = { ok: true, user: userOut };
    if (isCarrierRole(user.role)) {
      payload.access = await getCarrierAccess(user.id, user.email);
    }
    res.json(payload);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Could not sign in right now.' });
  }
});

// Get current user info
router.get('/me', requireAuth, async (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').split(',')[0].trim();
  try {
    await pool.query('UPDATE users SET signup_ip = $1 WHERE id = $2 AND signup_ip IS NULL', [clientIp, req.user.id]);
    const result = await pool.query(
      `SELECT id, name, email, role, company_name, phone, mc_number, dot_number, address, is_suspended, signup_ip, created_at, organization_id, trial_ends_at, email_verified_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    const user = result.rows[0];
    const payload = { ok: true, user };
    if (isCarrierRole(user.role)) {
      payload.access = await getCarrierAccess(user.id, user.email);
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Could not load account.' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('sw_token');
  res.json({ ok: true });
});

// ADMIN & SUPER ADMIN: List all users (with role filter)
router.get('/users', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
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

// ADMIN & SUPER ADMIN: Create Dispatcher, Sales Rep, Admin, or Carrier account
router.post('/users', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
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
      query = `
        SELECT u.id, u.name, u.company_name, u.phone, u.email, u.mc_number, u.dot_number,
               u.dispatch_fee_percent, u.equipment_category, u.billing_notes
        FROM users u
        LEFT JOIN dispatcher_carriers dc ON dc.carrier_id = u.id
        WHERE u.role = 'carrier' AND (dc.dispatcher_id = $1 OR dc.dispatcher_id IS NULL)
        ORDER BY u.name`;
      params = [req.user.id];
    } else {
      query = `SELECT id, name, company_name, phone, email, mc_number, dot_number,
               dispatch_fee_percent, equipment_category, billing_notes
               FROM users WHERE role = 'carrier' ORDER BY name`;
      params = [];
    }
    const result = await pool.query(query, params);
    res.json({ carriers: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load carriers.' });
  }
});

// ADMIN: Set per-carrier dispatch commission rate
// PATCH /api/carriers/:id/commission
// Body: { dispatch_fee_percent: 5.5, equipment_category: 'box_truck', billing_notes: 'Negotiated rate' }
router.patch('/carriers/:id/commission', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const { dispatch_fee_percent, equipment_category, billing_notes } = req.body;
  const carrierId = req.params.id;

  if (dispatch_fee_percent === undefined || dispatch_fee_percent === null) {
    return res.status(400).json({ error: 'dispatch_fee_percent is required.' });
  }

  const feeNum = parseFloat(dispatch_fee_percent);
  if (isNaN(feeNum) || feeNum < 0 || feeNum > 50) {
    return res.status(400).json({ error: 'dispatch_fee_percent must be a number between 0 and 50.' });
  }

  // Validate equipment_category
  const validCategories = ['box_truck', 'dry_van', 'reefer', 'flatbed', 'other'];
  const cat = equipment_category || 'dry_van';
  if (!validCategories.includes(cat)) {
    return res.status(400).json({ error: `equipment_category must be one of: ${validCategories.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET dispatch_fee_percent = $1, equipment_category = $2, billing_notes = $3
       WHERE id = $4 AND role = 'carrier'
       RETURNING id, name, company_name, dispatch_fee_percent, equipment_category, billing_notes`,
      [feeNum, cat, billing_notes || null, carrierId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Carrier not found.' });
    }

    res.json({
      ok: true,
      message: `Commission rate updated to ${feeNum}% for ${result.rows[0].company_name || result.rows[0].name}`,
      carrier: result.rows[0]
    });
  } catch (err) {
    console.error('Update commission error:', err);
    res.status(500).json({ error: 'Could not update commission rate.' });
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

// GET /api/carriers/:id/commission — Get a carrier's current commission rate
router.get('/carriers/:id/commission', requireAuth, requireRole('dispatcher', 'admin', 'super_admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, company_name, mc_number, dispatch_fee_percent, equipment_category, billing_notes
       FROM users WHERE id = $1 AND role = 'carrier'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Carrier not found.' });
    res.json({ carrier: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch carrier commission.' });
  }
});

// Super admin: remove fake carrier signups (keeps Muhammad Ahsan / email containing ahsan)
router.post('/admin/cleanup-fake-carriers', requireAuth, requireSuperAdmin, async (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'DELETE_FAKE_CARRIERS_EXCEPT_AHSAN') {
    return res.status(400).json({
      error: 'Confirmation required.',
      hint: 'POST with body { "confirm": "DELETE_FAKE_CARRIERS_EXCEPT_AHSAN" }'
    });
  }

  try {
    const keepRes = await pool.query(
      `SELECT id, email, name FROM users
       WHERE role IN ('carrier','carrier_admin')
         AND (lower(name) LIKE '%ahsan%' OR lower(email) LIKE '%ahsan%')
       ORDER BY created_at ASC`
    );
    const keepIds = keepRes.rows.map((r) => r.id);
    if (!keepIds.length) {
      return res.status(400).json({ error: 'No Ahsan carrier account found — aborting to avoid deleting everyone.' });
    }

    const victims = await pool.query(
      `SELECT id, email, name FROM users
       WHERE role IN ('carrier','carrier_admin') AND id NOT IN (${keepIds.join(',')})`
    );

    const deleted = [];
    for (const u of victims.rows) {
      const id = u.id;
      await pool.query('DELETE FROM loads WHERE carrier_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM trucks WHERE carrier_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM drivers WHERE carrier_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM trailers WHERE carrier_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM documents WHERE carrier_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM dispatcher_carriers WHERE carrier_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM billing_subscriptions WHERE user_id = $1', [id]).catch(() => {});
      await pool.query('DELETE FROM signup_pending WHERE lower(email) = lower($1)', [u.email]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      deleted.push({ id: u.id, email: u.email, name: u.name });
    }

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
    for (const k of keepRes.rows) {
      await pool.query(
        `UPDATE users SET trial_ends_at = $1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $2`,
        [trialEnds, k.id]
      );
    }

    await pool.query(
      `DELETE FROM crm_leads WHERE status = 'new' AND lower(email) NOT IN (SELECT unnest($1::text[]))`,
      [keepRes.rows.map((r) => String(r.email).toLowerCase())]
    ).catch(() => {});

    res.json({
      ok: true,
      kept: keepRes.rows,
      deletedCount: deleted.length,
      deleted,
      trialResetUntil: trialEnds.toISOString()
    });
  } catch (err) {
    console.error('cleanup-fake-carriers:', err);
    res.status(500).json({ error: 'Cleanup failed.', detail: err.message });
  }
});

module.exports = router;
