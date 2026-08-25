require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { sendBrandedEmail } = require('./utils/mailer');
const { buildTemplate, COMPANY } = require('./utils/email-templates');
const { ensureGrowthSchema } = require('./utils/ensure-growth-schema');
const { webhookHandler } = require('./routes/billing');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAILS = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean);

// Stripe signatures require the raw body. These must be registered BEFORE express.json().
app.post('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.post('/api/invoices/stripe-webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
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
app.use('/api/loads', require('./routes/loads'));         // Load CRUD, status pipeline, accessorials, state miles
app.use('/api/brokers', require('./routes/brokers'));     // Broker CRUD, credit rating, search
app.use('/api/fleet', require('./routes/fleet'));         // Trucks, Trailers, Drivers, expiries
app.use('/api/documents', require('./routes/documents')); // File upload & download (Rate Conf, BOL, POD, Packets)
app.use('/api/accessorials', require('./routes/accessorials')); // Detention, TONU, Layover, Lumper, Fuel Advances
app.use('/api/fuel', require('./routes/fuel'));           // Fuel purchases logging
app.use('/api/ifta', require('./routes/ifta'));           // Quarterly IFTA mileage & fuel report
app.use('/api/invoices', require('./routes/invoices'));   // Itemized PDF Freight Invoices & payment status
app.use('/api/dashboard', require('./routes/dashboard')); // Real-time metrics for Super Admin, Dispatcher, Carrier
app.use('/api/loadboard', require('./routes/loadboard')); // DAT Load Finder, OpenAI Matcher & Carrier Offers Approval Flow
app.use('/api/crm', require('./routes/crm'));             // CRM Carrier Leads, Dispositions & Daily Tasks
app.use('/api/email', require('./routes/email'));         // 1-Click branded outreach, inbound replies, unsubscribe
app.use('/api/billing', require('./routes/billing'));     // Weekly Stripe retainers + checkout links
app.use('/api/voip', require('./routes/voip'));           // Click-to-call, Twilio SMS, webhooks
app.use('/api/employees', require('./routes/employees')); // Admin HR Employee Management, Salaries & Multi-Dispatcher Assignment
app.use('/api/load-planning', require('./routes/load_planning')); // Driver Availability & Load Planning Schedule
app.use('/api/notifications', require('./routes/notifications')); // In-app user notifications & bell counter
app.use('/api/tracking', require('./routes/tracking'));           // Driver GPS pings & load tracking history
app.use('/api/audit-logs', require('./routes/audit'));            // System security audit log viewer
app.use('/api/messages', require('./routes/messages'));            // Load chat & dispatcher-driver messaging
app.use('/api/routes', require('./routes/routes'));              // Google Route Optimization API, Truck Miles, RPM & Fuel Calculator
app.use('/api/settings', require('./routes/settings'));          // Website CMS Settings & Contact Info
app.use('/api/blog', require('./routes/blog'));                  // SEO Freight Blog & Admin Articles Manager

// ---------- Public Contact / Service Request Form ----------
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.post('/api/contact', async (req, res) => {
  const { name, company, phone, email, role, serviceType, loadDetails, message } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }

  const adminHtml = `
    <h2>New operations request — Shipping Wish LLC</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
      <tr><td><b>Name</b></td><td>${escapeHtml(name)}</td></tr>
      <tr><td><b>Company</b></td><td>${escapeHtml(company || '-')}</td></tr>
      <tr><td><b>Role</b></td><td>${escapeHtml(role || '-')}</td></tr>
      <tr><td><b>Phone</b></td><td>${escapeHtml(phone)}</td></tr>
      <tr><td><b>Email</b></td><td>${escapeHtml(email)}</td></tr>
      <tr><td><b>Service Needed</b></td><td>${escapeHtml(serviceType || '-')}</td></tr>
      <tr><td><b>Load Details</b></td><td>${escapeHtml(loadDetails || '-')}</td></tr>
      <tr><td valign="top"><b>Message</b></td><td>${escapeHtml(message || '-')}</td></tr>
    </table>
  `;

  const ack = buildTemplate('contact_ack', { name, recipientEmail: email });

  try {
    if (ADMIN_EMAILS.length) {
      await sendBrandedEmail({
        to: ADMIN_EMAILS[0],
        cc: ADMIN_EMAILS.slice(1),
        subject: `New operations request — ${name}${company ? ' (' + company + ')' : ''}`,
        html: adminHtml,
        text: `${name} / ${company} / ${phone} / ${email} / ${serviceType || ''} / ${message || ''}`,
        emailType: 'internal_lead',
        templateKey: 'internal_lead'
      });
    }

    await sendBrandedEmail({
      to: email,
      subject: ack.subject,
      html: ack.html,
      text: ack.text,
      emailType: 'contact_ack',
      templateKey: 'contact_ack'
    });

    try {
      const pool = require('./db');
      await pool.query(
        `INSERT INTO crm_leads (company_name, owner_name, phone, email, notes, status)
         VALUES ($1,$2,$3,$4,$5,'new')
         ON CONFLICT DO NOTHING`,
        [company || name, name, phone, email.toLowerCase(), `Website form. Service: ${serviceType || '-'}. ${message || ''}`]
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

if (require.main === module) {
  ensureGrowthSchema().then(seedAdminUsers).then(() => {
    app.listen(PORT, () => {
      console.log(`Shipping Wish Enterprise TMS running at http://localhost:${PORT}`);
    });
  });
} else {
  ensureGrowthSchema().catch((err) => console.warn('[GROWTH] schema:', err.message));
  seedAdminUsers();
}

module.exports = app;
