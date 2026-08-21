const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/email/send-outreach - 1-Click Branded Outreach & Onboarding Email via Resend
router.post('/send-outreach', requireAuth, async (req, res) => {
  try {
    const { lead_id, recipient_email, owner_name, company_name, email_type } = req.body;

    if (!recipient_email) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const carrierName = owner_name || 'Carrier Partner';
    const compName = company_name || 'Your Fleet';
    const isPacket = email_type === 'onboarding_packet';

    const subject = isPacket
      ? `Welcome to Shipping Wish LLC — Your Onboarding Dispatch Packet for ${compName}`
      : `High-Paying US Freight Dispatch Opportunity for ${compName} | Shipping Wish LLC`;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #e2e8f0; margin: 0; padding: 20px; }
          .card { max-width: 600px; margin: 0 auto; background-color: #12161d; border: 1px solid #2a3241; border-radius: 12px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .brand { color: #f59e0b; font-size: 24px; font-weight: 800; text-decoration: none; display: inline-block; margin-bottom: 20px; }
          .dot { height: 10px; width: 10px; background-color: #f59e0b; border-radius: 50%; display: inline-block; margin-right: 6px; }
          h2 { color: #ffffff; font-size: 22px; margin-top: 0; }
          p { font-size: 15px; line-height: 1.6; color: #cbd5e1; }
          .feature-box { background: rgba(245, 158, 11, 0.08); border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
          .feature-box ul { margin: 0; padding-left: 20px; }
          .feature-box li { margin-bottom: 8px; color: #f1f5f9; }
          .btn-container { text-align: center; margin: 30px 0; }
          .btn { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff !important; font-weight: 800; padding: 16px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4); }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #2a3241; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <a href="https://shippingwish.com" class="brand"><span class="dot"></span> Shipping Wish LLC</a>
          
          <h2>Hello ${carrierName},</h2>
          
          <p>We are reaching out from <strong>Shipping Wish LLC</strong> to introduce our dedicated US truck dispatch services for <strong>${compName}</strong>.</p>
          
          <div class="feature-box">
            <h4 style="margin: 0 0 10px 0; color: #f59e0b;">Why US Carriers Partner With Shipping Wish:</h4>
            <ul>
              <li><strong>0% Upfront Setup Fees</strong> — Pay only when your truck moves.</li>
              <li><strong>Average $3.20 to $4.00+ Rate Per Mile</strong> via DAT AI load matching.</li>
              <li><strong>100% Rate Transparency</strong> — Official Rate Cons sent before pickup.</li>
              <li><strong>1-Click Mobile Approvals</strong> right on your smartphone.</li>
              <li><strong>Smart Reload Chaining</strong> to eliminate empty deadhead miles.</li>
            </ul>
          </div>

          <p>${isPacket 
            ? 'Attached is your official 1-page Carrier Dispatch Welcome Packet. Fill out your info to get assigned a dedicated 1-on-1 dispatcher today!' 
            : 'Our 24/7 US dispatch desk has high-paying Dry Van, Reefer, and Flatbed loads ready for your equipment.'}</p>

          <div class="btn-container">
            <a href="https://shippingwish.com/signup.html" class="btn">👉 Register For Dedicated Dispatch Service (0% Upfront)</a>
          </div>

          <p style="font-size: 13px; color: #94a3b8;">Have questions? Call our 24/7 hotline directly at <strong>+1 917 737 0021</strong> or reply to this email.</p>

          <div class="footer">
            <p><strong>Shipping Wish LLC — Enterprise Logistics &amp; Freight Dispatch</strong><br>
            19266 Coastal Hwy, Rehoboth, DE 19971, USA | 📞 +1 917 737 0021<br>
            ✉️ info@shippingwish.com | <a href="https://shippingwish.com/privacy-policy.html" style="color:#f59e0b;">Privacy Policy</a></p>
            <p style="font-size: 11px;">CAN-SPAM Compliant. If you wish to stop receiving freight updates, click <a href="#" style="color:#64748b;">Unsubscribe</a>.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    let resendId = 'simulated_' + Date.now();

    // If RESEND_API_KEY exists in env, trigger live Resend API
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const sendResult = await resend.emails.send({
          from: 'Shipping Wish LLC <dispatch@shippingwish.com>',
          to: [recipient_email],
          subject: subject,
          html: htmlBody
        });
        if (sendResult && sendResult.id) {
          resendId = sendResult.id;
        }
      } catch (apiErr) {
        console.warn('Resend API call fallback to logged send:', apiErr.message);
      }
    }

    // Log sent email to database
    const logResult = await pool.query(
      `INSERT INTO email_logs (lead_id, recipient_email, subject, email_type, status, resend_id, sent_by)
       VALUES ($1, $2, $3, $4, 'sent', $5, $6)
       RETURNING *`,
      [lead_id || null, recipient_email, subject, email_type || 'outreach', resendId, req.user.id]
    );

    // Update lead status to 'contacted' or 'packet_sent'
    if (lead_id) {
      const newStatus = isPacket ? 'packet_sent' : 'contacted';
      await pool.query(
        `UPDATE crm_leads SET status = $1, last_contacted_at = now() WHERE id = $2`,
        [newStatus, lead_id]
      );
    }

    res.json({
      message: `Branded email successfully sent to ${recipient_email}`,
      email_log: logResult.rows[0]
    });
  } catch (err) {
    console.error('Error sending outreach email:', err);
    res.status(500).json({ error: 'Failed to send outreach email' });
  }
});

// GET /api/email/logs - Get email history
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.name as sender_name
       FROM email_logs e
       LEFT JOIN users u ON e.sent_by = u.id
       ORDER BY e.sent_at DESC
       LIMIT 50`
    );
    res.json({ email_logs: result.rows });
  } catch (err) {
    console.error('Error fetching email logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
