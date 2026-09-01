require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { sendBrandedEmail } = require('./utils/mailer');
const { buildTemplate, COMPANY } = require('./utils/email-templates');
const { ensureGrowthSchema } = require('./utils/ensure-growth-schema');
const { purgeExpiredTrash } = require('./utils/trash');
const { webhookHandler } = require('./routes/billing');
const { requireAuth } = require('./middleware/auth');
const { requireCarrierSubscription } = require('./middleware/subscription');

const carrierApiGate = [requireAuth, requireCarrierSubscription];

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAILS = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean);

// Stripe signatures require the raw body. These must be registered BEFORE express.json().
app.post('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.post('/api/invoices/stripe-webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

function requestQuery(req) {
  const q = req.url.indexOf('?');
  return q >= 0 ? req.url.slice(q) : '';
}

// /login.html → /login (and /index.html → /). Static files stay as .html on disk.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const p = req.path;
  if (p.startsWith('/api') || p.startsWith('/uploads')) return next();
  if (p === '/index.html') return res.redirect(301, '/' + requestQuery(req));
  if (p.endsWith('.html')) return res.redirect(301, p.slice(0, -5) + requestQuery(req));
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- Health & DB Diagnostic Endpoint ----------
app.get('/api/health', async (req, res) => {
  const pool = require('./db');
  const envKeys = Object.keys(process.env).filter(k => 
    k.toUpperCase().includes('POSTGRES') || 
    k.toUpperCase().includes('DATABASE') || 
    k.toUpperCase().includes('NEON') || 
    k.toUpperCase().includes('STORAGE') || 
    k.toUpperCase().includes('PG')
  );

  let dbStatus = 'connecting';
  let dbError = null;
  let userCount = 0;

  try {
    const qRes = await pool.query('SELECT count(*) FROM users');
    userCount = parseInt(qRes.rows[0].count, 10);
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error';
    dbError = err.message;
  }

  res.json({
    status: 'ok',
    db_status: dbStatus,
    db_error: dbError,
    users_in_db: userCount,
    env_keys_found: envKeys,
    timestamp: new Date().toISOString()
  });
});

// ---------- Enterprise TMS API Routes ----------
app.use('/api', require('./routes/auth'));                // /api/signup, /api/login, /api/me, /api/users, /api/carriers
app.use('/api/loads', carrierApiGate, require('./routes/loads'));
app.use('/api/brokers', carrierApiGate, require('./routes/brokers'));
app.use('/api/fleet', carrierApiGate, require('./routes/fleet'));
app.use('/api/documents', carrierApiGate, require('./routes/documents'));
app.use('/api/accessorials', carrierApiGate, require('./routes/accessorials'));
app.use('/api/fuel', carrierApiGate, require('./routes/fuel'));
app.use('/api/ifta', carrierApiGate, require('./routes/ifta'));
app.use('/api/invoices', carrierApiGate, require('./routes/invoices'));
app.use('/api/portal', carrierApiGate, require('./routes/portal'));
app.use('/api/loadboard', carrierApiGate, require('./routes/loadboard'));
app.use('/api/crm', require('./routes/crm'));             // CRM Carrier Leads, Dispositions & Daily Tasks
app.use('/api/email', require('./routes/email'));         // 1-Click branded outreach, inbound replies, unsubscribe
app.use('/api/billing', require('./routes/billing'));     // Weekly Stripe retainers + checkout links
app.use('/api/voip', require('./routes/voip'));           // Click-to-call, Twilio SMS, webhooks
app.use('/api/employees', require('./routes/employees')); // Admin HR Employee Management, Salaries & Multi-Dispatcher Assignment
app.use('/api/load-planning', carrierApiGate, require('./routes/load_planning'));
app.use('/api/notifications', carrierApiGate, require('./routes/notifications'));
app.use('/api/tracking', carrierApiGate, require('./routes/tracking'));
app.use('/api/audit-logs', require('./routes/audit'));            // System security audit log viewer
app.use('/api/trash', require('./routes/trash'));                 // Admin-only soft-delete trash & restore
app.use('/api/messages', carrierApiGate, require('./routes/messages'));
app.use('/api/routes', require('./routes/routes'));              // Google Route Optimization API, Truck Miles, RPM & Fuel Calculator
app.use('/api/settings', require('./routes/settings'));          // Website CMS Settings & Contact Info
app.use('/api/blog', require('./routes/blog'));                  // SEO Freight Blog & Admin Articles Manager
app.use('/api/public', require('./routes/public-tools'));        // Public FMCSA carrier lookup (rate limited)

// ---------- Public Contact / Service Request Form ----------
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Detect bot gibberish like ZTFKFQOTXIAcgvdFKNMXw / Evasolwtck */
function looksLikeGibberish(str) {
  const s = String(str || '').trim();
  if (!s) return false;
  const compact = s.replace(/[^a-zA-Z]/g, '');
  if (compact.length < 8) return false;
  // Long run of consonants / mixed case random tokens
  if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(compact)) return true;
  const vowels = (compact.match(/[aeiou]/gi) || []).length;
  const ratio = vowels / compact.length;
  if (compact.length >= 12 && ratio < 0.18) return true;
  // Mostly random alphanumerics with almost no spaces (name/company should have spaces or words)
  if (/^[A-Za-z0-9]{16,}$/.test(s.replace(/\s/g, '')) && !/\s/.test(s) && ratio < 0.28) return true;
  return false;
}

function isDisposableOrSuspiciousEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return true;
  // Bot-style dotted local parts like brpa.r.adis.1.5@gmail.com + random
  const local = e.split('@')[0];
  if ((local.match(/\./g) || []).length >= 3 && /[0-9]/.test(local)) return true;
  if (looksLikeGibberish(local.replace(/\./g, ''))) return true;
  return false;
}

const contactHits = new Map();
function contactRateLimited(ip) {
  const key = String(ip || 'unknown');
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 5;
  const hits = (contactHits.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  contactHits.set(key, hits);
  return hits.length > max;
}

function isLikelyBotContact(body) {
  const { name, company, phone, email, loadDetails, message, website, company_url } = body || {};
  // Honeypot fields — real users leave empty
  if (website || company_url) return { bot: true, reason: 'honeypot' };
  if (looksLikeGibberish(name) || looksLikeGibberish(company) || looksLikeGibberish(loadDetails) || looksLikeGibberish(message)) {
    return { bot: true, reason: 'gibberish' };
  }
  if (isDisposableOrSuspiciousEmail(email)) return { bot: true, reason: 'bad_email' };
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return { bot: true, reason: 'bad_phone' };
  // Same digit repeated (0000000000) or sequential spam
  if (/^(\d)\1{9,}$/.test(digits)) return { bot: true, reason: 'bad_phone' };
  return { bot: false };
}

app.post('/api/contact', async (req, res) => {
  const { name, company, phone, email, role, serviceType, loadDetails, message } = req.body || {};
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }

  // Silent OK for bots — do NOT email (protects domain reputation)
  if (contactRateLimited(ip) || isLikelyBotContact(req.body).bot) {
    console.warn('[CONTACT] Dropped likely bot submission', {
      ip,
      email: String(email || '').slice(0, 80),
      name: String(name || '').slice(0, 40)
    });
    return res.json({ ok: true, message: 'Request received.' });
  }

  const safeName = String(name).trim().slice(0, 80);
  const safeCompany = String(company || '').trim().slice(0, 100);
  const subjectCompany = safeCompany || safeName;

  const adminHtml = `
    <h2>New operations request — Shipping Wish LLC</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
      <tr><td><b>Name</b></td><td>${escapeHtml(safeName)}</td></tr>
      <tr><td><b>Company</b></td><td>${escapeHtml(safeCompany || '-')}</td></tr>
      <tr><td><b>Role</b></td><td>${escapeHtml(role || '-')}</td></tr>
      <tr><td><b>Phone</b></td><td>${escapeHtml(phone)}</td></tr>
      <tr><td><b>Email</b></td><td>${escapeHtml(email)}</td></tr>
      <tr><td><b>Service Needed</b></td><td>${escapeHtml(serviceType || '-')}</td></tr>
      <tr><td><b>Load Details</b></td><td>${escapeHtml(loadDetails || '-')}</td></tr>
      <tr><td valign="top"><b>Message</b></td><td>${escapeHtml(message || '-')}</td></tr>
    </table>
  `;

  const ack = buildTemplate('contact_ack', { name: safeName, recipientEmail: email });

  try {
    if (ADMIN_EMAILS.length) {
      await sendBrandedEmail({
        to: ADMIN_EMAILS[0],
        cc: ADMIN_EMAILS.slice(1),
        subject: `New ops request — ${subjectCompany}`,
        html: adminHtml,
        text: `${safeName} / ${safeCompany} / ${phone} / ${email} / ${serviceType || ''} / ${message || ''}`,
        emailType: 'internal_lead',
        templateKey: 'internal_lead',
        transactional: true
      });
    }

    // Never auto-ack to addresses that look fake (bounces hurt reputation)
    if (!isDisposableOrSuspiciousEmail(email)) {
      await sendBrandedEmail({
        to: email,
        subject: ack.subject,
        html: ack.html,
        text: ack.text,
        emailType: 'contact_ack',
        templateKey: 'contact_ack',
        transactional: true
      });
    }

    try {
      const pool = require('./db');
      await pool.query(
        `INSERT INTO crm_leads (company_name, owner_name, phone, email, notes, status)
         VALUES ($1,$2,$3,$4,$5,'new')
         ON CONFLICT DO NOTHING`,
        [safeCompany || safeName, safeName, phone, email.toLowerCase(), `Website form. Service: ${serviceType || '-'}. ${message || ''}`]
      );
    } catch (crmErr) {
      console.warn('[CONTACT] CRM insert skipped:', crmErr.message);
    }

    res.json({ ok: true, message: 'Request received.' });
  } catch (err) {
    console.error('Contact email error:', err);
    res.status(500).json({ error: `Could not send request right now. Please call ${COMPANY.phone}.` });
  }
});

// Automatic Super Admin Account Initializer
async function backfillCarrierTrials() {
  const days = parseInt(process.env.PORTAL_TRIAL_DAYS || process.env.STRIPE_TRIAL_DAYS || '7', 10);
  try {
    const pool = require('./db');
    await pool.query(
      `UPDATE users
       SET trial_ends_at = created_at + ($1 || ' days')::interval
       WHERE role = 'carrier' AND trial_ends_at IS NULL`,
      [String(days)]
    );
  } catch (err) {
    console.warn('[TRIAL] backfill skipped:', err.message);
  }
}

async function seedAdminUsers() {
  try {
    const pool = require('./db');
    const bcrypt = require('bcryptjs');
    const adminCheck = await pool.query("SELECT id FROM users WHERE role IN ('super_admin', 'admin') LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const superPass = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin2026!';
      const hash = await bcrypt.hash(superPass, 10);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, company_name, phone)
         VALUES 
          ('Super Admin', 'admin@shippingwish.com', $1, 'super_admin', 'Shipping Wish HQ', '+1 (917) 737-0021'),
          ('Company Owner', 'owner@shippingwish.com', $1, 'super_admin', 'Shipping Wish HQ', '+1 (917) 737-0021')
         ON CONFLICT (email) DO NOTHING`,
        [hash]
      );
      console.log('[SEED] Default Super Admin accounts created: admin@shippingwish.com & owner@shippingwish.com');
    }
  } catch (err) {
    console.error('[SEED] Admin seed check:', err.message);
  }
}

function runTrashAutoPurge() {
  return purgeExpiredTrash()
    .then((result) => {
      const p = result.purged;
      const total = p.loads + p.drivers + p.emails + p.users;
      if (total > 0) {
        console.log(`[TRASH] Auto-purged ${total} expired item(s) (>${result.retentionDays} days)`);
      }
    })
    .catch((err) => console.warn('[TRASH] startup purge skipped:', err.message));
}

if (require.main === module) {
  ensureGrowthSchema()
    .then(backfillCarrierTrials)
    .then(seedAdminUsers)
    .then(runTrashAutoPurge)
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Shipping Wish Enterprise TMS running at http://localhost:${PORT}`);
      });
    });
} else {
  ensureGrowthSchema()
    .then(backfillCarrierTrials)
    .then(runTrashAutoPurge)
    .catch((err) => console.warn('[GROWTH] schema:', err.message));
  seedAdminUsers();
}

module.exports = app;
