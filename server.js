require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const MAIL_FROM = process.env.MAIL_FROM || 'Shipping Wish <onboarding@resend.dev>';
const ADMIN_EMAILS = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2].filter(Boolean);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/email', require('./routes/email'));         // Resend 1-Click Branded Outreach & Onboarding Email Packets
app.use('/api/voip', require('./routes/voip'));           // OpenPhone & MightyCall 1-Click Call, SMS & Webhook Logger
app.use('/api/employees', require('./routes/employees')); // Admin HR Employee Management, Salaries & Multi-Dispatcher Assignment
app.use('/api/load-planning', require('./routes/load_planning')); // Driver Availability & Load Planning Schedule
app.use('/api/notifications', require('./routes/notifications')); // In-app user notifications & bell counter
app.use('/api/tracking', require('./routes/tracking'));           // Driver GPS pings & load tracking history
app.use('/api/audit-logs', require('./routes/audit'));            // System security audit log viewer
app.use('/api/messages', require('./routes/messages'));            // Load chat & dispatcher-driver messaging
app.use('/api/routes', require('./routes/routes'));              // Google Route Optimization API, Truck Miles, RPM & Fuel Calculator

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
    <h2>New Service Request — Shipping Wish</h2>
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

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;">
      <h2 style="color:#14181F;">Thanks, ${escapeHtml(name)} — we've received your dispatch request.</h2>
      <p style="color:#333;line-height:1.6;">
        A Shipping Wish dispatcher will contact you at <b>${escapeHtml(phone)}</b> shortly to go over available freight and setup details.
        If urgent, call us directly at <b>+1 917 737 0021</b>.
      </p>
      <p style="color:#333;line-height:1.6;">— The Shipping Wish LLC Dispatch Team</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
      <p style="color:#888;font-size:12px;">Shipping Wish LLC · info@shippingwish.com · +1 917 737 0021</p>
    </div>
  `;

  try {
    if (resend && ADMIN_EMAILS.length) {
      await resend.emails.send({
        from: MAIL_FROM,
        to: ADMIN_EMAILS,
        reply_to: email,
        subject: `New Service Request — ${name}${company ? ' (' + company + ')' : ''}`,
        html: adminHtml
      });

      await resend.emails.send({
        from: MAIL_FROM,
        to: email,
        subject: 'We received your request — Shipping Wish LLC',
        html: customerHtml
      });
    } else {
      console.log('[DEV MODE] RESEND_API_KEY missing — email notification logged:', req.body);
    }

    res.json({ ok: true, message: 'Request received.' });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Could not send request right now. Please call +1 917 737 0021.' });
  }
});

app.listen(PORT, () => {
  console.log(`Shipping Wish Enterprise TMS running at http://localhost:${PORT}`);
});
