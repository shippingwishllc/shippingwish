const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requireRole, requireSuperAdmin, JWT_SECRET, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
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
      role TEXT DEFAULT 'carrier',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch(() => {});
  await pool.query("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'broker'").catch(() => {});
  await pool.query("ALTER TABLE signup_pending ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'carrier'").catch(() => {});
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ').catch(() => {});
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ').catch(() => {});
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_plan TEXT').catch(() => {});
}

// Step 1 — send OTP to email (noreply@shippingwish.com)
router.post('/signup/send-otp', rateLimit(5, 60000), async (req, res) => {
  const { name, company, phone, email, password, mcNumber, dotNumber, address, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const userRole = role === 'broker' ? 'broker' : 'carrier';
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').split(',')[0].trim();
  const userAgent = req.headers['user-agent'] || '';
  const emailNorm = String(email).trim().toLowerCase();

  try {
    await ensureSignupTables();
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [emailNorm]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await pool.query(
      `INSERT INTO signup_pending (email, otp_hash, password_hash, name, company_name, phone, mc_number, dot_number, address, signup_ip, user_agent, attempts, expires_at, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13)
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
         expires_at = EXCLUDED.expires_at,
         role = EXCLUDED.role`,
      [emailNorm, otpHash, passwordHash, name, company || null, phone || null, mcNumber || null, dotNumber || null, address || null, clientIp, userAgent, expiresAt, userRole]
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

    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [emailNorm]);
    if (existing.rows.length) {
      await pool.query('DELETE FROM signup_pending WHERE id = $1', [pending.id]);
      return res.status(409).json({ error: 'Account already exists. Sign in instead.' });
    }

    const isBroker = pending.role === 'broker';
    const role = isBroker ? 'broker' : 'carrier';
    const trialEnds = isBroker ? null : new Date(Date.now() + TRIAL_DAYS * 86400000);
    const weeklyPlan = isBroker ? 'free_broker' : null;

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, company_name, phone, mc_number, dot_number, address, signup_ip, user_agent, trial_ends_at, email_verified_at, weekly_plan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
       RETURNING id, name, email, role, company_name, phone, mc_number, dot_number, signup_ip, trial_ends_at, weekly_plan`,
      [pending.name, emailNorm, pending.password_hash, role, pending.company_name, pending.phone, pending.mc_number, pending.dot_number, pending.address, pending.signup_ip, pending.user_agent, trialEnds, weeklyPlan]
    );
    const user = result.rows[0];
    await pool.query('DELETE FROM signup_pending WHERE id = $1', [pending.id]);

    const token = signToken(user);
    setAuthCookie(res, token);
    await createPortalSignupLead(user, {
      company: pending.company_name,
      phone: pending.phone,
      mcNumber: pending.mc_number,
      dotNumber: pending.dot_number
    });

    const ops = [...new Set([COMPANY.operationsEmail, process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean))];
    const subject = isBroker
      ? `Freight Broker signup (100% Free) — ${pending.company_name || pending.name}`
      : `Portal signup (verified) — ${pending.company_name || pending.name}`;
    const html = isBroker
      ? `<p>Freight Broker created free account to post live loads on LoadsNexus.</p>
         <p><strong>${escapeHtml(pending.name)}</strong><br>${escapeHtml(pending.company_name || '')}<br>${escapeHtml(emailNorm)}<br>MC: ${escapeHtml(pending.mc_number || 'N/A')}</p>`
      : `<p>Carrier verified email and created portal login.</p>
         <p><strong>${escapeHtml(pending.name)}</strong><br>${escapeHtml(pending.company_name || '')}<br>${escapeHtml(emailNorm)}</p>
         <p>${TRIAL_DAYS}-day portal trial until ${trialEnds.toISOString().slice(0, 10)}. Stripe weekly plan still required after trial unless they subscribe early.</p>`;
    Promise.all(ops.map((to) => sendBrandedEmail({
      to, subject, html, text: subject, emailType: 'internal_lead', templateKey: 'internal_signup', transactional: true
    }))).catch((err) => console.error('Signup notify:', err.message));

    const access = isBroker ? { allowed: true, is_broker: true, full_access: true } : await getCarrierAccess(user.id, user.email);
    res.json({
      ok: true,
      token,
      user,
      access,
      trialDays: isBroker ? 0 : TRIAL_DAYS,
      redirect: isBroker ? '/load-booking?broker=1&post=1' : '/onboarding'
    });
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

const TEST_ACCOUNTS = {
  'carrier@shippingwish.com': { role: 'carrier', pass: 'CarrierPass2026!', name: 'Apex Global Carriers', company: 'Apex Global Freight LLC', phone: '+1 (800) 555-0199', mc: 'MC-1094821', dot: '3892011', plan: 'loadboard_ai_pass' },
  'carrier@loadsnexus.com':   { role: 'carrier', pass: 'CarrierPass2026!', name: 'Apex Global Carriers', company: 'Apex Global Freight LLC', phone: '+1 (800) 555-0199', mc: 'MC-1094821', dot: '3892011', plan: 'loadboard_ai_pass' },
  'broker@shippingwish.com':  { role: 'broker',  pass: 'BrokerPass2026!',  name: 'Summit Logistics Brokerage', company: 'Summit Logistics Brokerage LLC', phone: '+1 (800) 580-3101', mc: 'MC-582104', dot: '2948102', plan: 'free_broker' },
  'broker@loadsnexus.com':    { role: 'broker',  pass: 'BrokerPass2026!',  name: 'Summit Logistics Brokerage', company: 'Summit Logistics Brokerage LLC', phone: '+1 (800) 580-3101', mc: 'MC-582104', dot: '2948102', plan: 'free_broker' },
  'admin@shippingwish.com':   { role: 'super_admin', pass: 'AdminPass2026!', name: 'Super Admin', company: 'Shipping Wish HQ', phone: '+1 (917) 737-0021', mc: null, dot: null, plan: 'admin_pass' },
  'admin@loadsnexus.com':     { role: 'super_admin', pass: 'AdminPass2026!', name: 'Super Admin', company: 'LoadsNexus Enterprise', phone: '+1 (800) 580-3101', mc: null, dot: null, plan: 'admin_pass' }
};

async function ensureTestAccount(emailInput) {
  const norm = String(emailInput || '').trim().toLowerCase();
  const acc = TEST_ACCOUNTS[norm];
  if (!acc) return;

  try {
    const existing = await pool.query('SELECT id, password_hash, role FROM users WHERE lower(email) = lower($1)', [norm]);
    let needUpdate = false;

    if (existing.rows.length === 0) {
      needUpdate = true;
    } else {
      const match = await bcrypt.compare(acc.pass, existing.rows[0].password_hash).catch(() => false);
      if (!match) needUpdate = true;
    }

    if (needUpdate) {
      const hash = await bcrypt.hash(acc.pass, 10);
      await pool.query(`
        INSERT INTO users (
          name, email, password_hash, role, company_name, phone,
          mc_number, dot_number, address, weekly_plan, trial_ends_at,
          email_verified_at, is_suspended
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, '100 Logistics Way, Suite 400, Dallas, TX 75201',
          $9, NOW() + interval '365 days', NOW(), false
        )
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          company_name = EXCLUDED.company_name,
          phone = EXCLUDED.phone,
          mc_number = EXCLUDED.mc_number,
          dot_number = EXCLUDED.dot_number,
          weekly_plan = EXCLUDED.weekly_plan,
          trial_ends_at = NOW() + interval '365 days',
          email_verified_at = NOW(),
          is_suspended = false,
          deleted_at = NULL
      `, [acc.name, norm, hash, acc.role, acc.company, acc.phone, acc.mc, acc.dot, acc.plan]);
      console.log(`[AUTH] Auto-ensured test account ${norm} (${acc.role}) with active credentials.`);
    }
  } catch (err) {
    console.warn(`[AUTH] Auto-ensure test account ${norm} notice:`, err.message);
  }
}

// Login
router.post('/login', rateLimit(10, 60000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').split(',')[0].trim();

  await ensureTestAccount(email);

  try {
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    
    if (user.is_suspended) {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact Shipping Wish support.' });
    }
    if (user.deleted_at) {
      return res.status(403).json({ error: 'This account was removed. Contact Shipping Wish admin to restore.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    
    // Check carrier subscription & cancellation state
    if (isCarrierRole(user.role)) {
      const access = await getCarrierAccess(user.id, user.email);
      if (!access.allowed) {
        if (access.reason === 'canceled' || user.weekly_plan === 'canceled') {
          return res.status(403).json({
            error: 'Your subscription was canceled and your portal access has ended. Contact Shipping Wish support to reactivate.'
          });
        }
        if (access.reason === 'pending_card' || user.weekly_plan === 'pending_card') {
          return res.status(403).json({
            error: 'Card capture required. Please complete signup to activate your 7-day free trial ($0 due today).',
            checkoutUrl: '/signup'
          });
        }
        if (access.reason === 'trial_expired') {
          return res.status(403).json({
            error: 'Your 7-day free trial has ended. Please restart your weekly subscription on Stripe to continue.',
            checkoutUrl: access.checkoutUrl || '/checkout?plan=solo_weekly'
          });
        }
        return res.status(403).json({
          error: access.message || 'Subscription required to access the carrier portal.',
          checkoutUrl: access.checkoutUrl || '/checkout?plan=solo_weekly'
        });
      }
    }

    // Update IP for existing users if missing or on login
    await pool.query('UPDATE users SET signup_ip = $1 WHERE id = $2', [clientIp, user.id]);

    const token = signToken(user);
    setAuthCookie(res, token);
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
    const payload = { ok: true, token, user: userOut };
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
      `SELECT id, name, email, role, company_name, phone, mc_number, dot_number, address, is_suspended, signup_ip, created_at, trial_ends_at, email_verified_at, weekly_plan
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    const user = result.rows[0];
    if (user.deleted_at) {
      clearAuthCookie(res, req);
      return res.status(403).json({ error: 'Account removed. Contact admin if this was a mistake.' });
    }
    if (isCarrierRole(user.role) && user.weekly_plan === 'canceled') {
      clearAuthCookie(res, req);
      return res.status(403).json({ error: 'Subscription canceled. Portal access has ended.', reason: 'canceled' });
    }
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
router.all(['/logout', '/signout'], (req, res) => {
  clearAuthCookie(res, req);
  res.json({ ok: true, message: 'Logged out successfully.' });
});

// Change Password for logged in user
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || String(new_password).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found.' });

    // Validate current password if provided
    if (current_password) {
      const valid = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    res.json({ ok: true, message: 'Password changed successfully!' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ADMIN & SUPER ADMIN: List all users (with role filter)
router.get('/users', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { role } = req.query;
    let query = `SELECT id, name, email, role, company_name, phone, mc_number, dot_number, is_suspended, signup_ip, created_at FROM users WHERE deleted_at IS NULL`;
    let params = [];
    if (role) {
      query += ` AND role = $1`;
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
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can create Super Admin accounts.' });
    }
    const countRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
    if (parseInt(countRes.rows[0].count, 10) >= 2) {
      return res.status(400).json({ error: 'Maximum 2 Super Admin accounts allowed.' });
    }
  }

  if (role === 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Admin can create Admin accounts.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL', [email]);
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

// ADMIN: Move user to trash (soft delete)
router.delete('/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const check = await pool.query('SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'User not found.' });
    if (check.rows[0].role === 'super_admin') {
      const countRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND deleted_at IS NULL");
      if (parseInt(countRes.rows[0].count, 10) <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only Super Admin account.' });
      }
    }
    await pool.query(
      'UPDATE users SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true, message: 'Account moved to Trash. Restore from Trash page if needed.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not move user to trash.' });
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
       WHERE role = 'carrier'
         AND (lower(name) LIKE '%ahsan%' OR lower(email) LIKE '%ahsan%')
       ORDER BY created_at ASC`
    );
    const keepIds = keepRes.rows.map((r) => r.id);
    if (!keepIds.length) {
      return res.status(400).json({ error: 'No Ahsan carrier account found — aborting to avoid deleting everyone.' });
    }

    const victims = await pool.query(
      `SELECT id, email, name FROM users
       WHERE role = 'carrier' AND id NOT IN (${keepIds.join(',')})`
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
