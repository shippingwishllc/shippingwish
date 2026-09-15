require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const pool = require('../db');

async function main() {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const packetPdfPath = path.join(__dirname, '../public/downloads/Shipping-Wish-Carrier-Onboarding-Packet.pdf');
  const agreementPath = path.join(__dirname, '../public/downloads/Signed-Partner-Agreement-TruckdUp-ShippingWish.png');

  const attachments = [];
  if (fs.existsSync(packetPdfPath)) {
    attachments.push({
      filename: 'Shipping-Wish-Carrier-Onboarding-Packet.pdf',
      content: fs.readFileSync(packetPdfPath)
    });
  }

  if (fs.existsSync(agreementPath)) {
    attachments.push({
      filename: 'Signed-Dispatch-Agreement-TruckdUp-ShippingWish.png',
      content: fs.readFileSync(agreementPath)
    });
  }

  const recipient = 'truckdup.operations@gmail.com';
  const from = 'Shipping Wish Operations <operations@shippingwish.com>';
  const subject = 'Executed Partner Agreement & Carrier Onboarding Packet — Shipping Wish LLC';

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 650px; margin: 0 auto; padding: 24px;">
    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px;">
      <h2 style="color: #0f172a; margin: 0 0 6px;">Shipping Wish LLC · Dispatch Operations</h2>
      <p style="color: #64748b; margin: 0; font-size: 14px;">Dedicated Carrier Operations & Freight Dispatch Desk</p>
    </div>

    <p>Dear Sam &amp; the Truck'd Up Operations Team,</p>

    <p>Thank you for executing the <strong>Dispatch Fulfillment Partner Agreement</strong> with <strong>Shipping Wish LLC</strong> at the agreed <strong>4% gross freight dispatch rate</strong>. We are thrilled to partner with you and look forward to booking high-paying freight for your motor carrier fleet.</p>

    <p>Per your request, we have attached our official <strong>Carrier Onboarding Packet (PDF)</strong> along with a copy of our <strong>Signed Partner Agreement</strong>.</p>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 24px 0;">
      <h3 style="margin: 0 0 12px; color: #0f172a; font-size: 16px;">📋 6-Point Carrier Compliance Checklist:</h3>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 10px;">Before our dispatch desk books the first load under any carrier's MC#, please ensure they provide:</p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #334155;">
        <li style="margin-bottom: 6px;"><strong>FMCSA Operating Authority Certificate</strong> (Active MC/FF certificate)</li>
        <li style="margin-bottom: 6px;"><strong>Certificate of Insurance (COI)</strong> ($1,000,000 Auto Liability &amp; $100,000 Cargo Liability with <em>Shipping Wish LLC</em> as Certificate Holder)</li>
        <li style="margin-bottom: 6px;"><strong>Signed Form W-9</strong> (Current year)</li>
        <li style="margin-bottom: 6px;"><strong>Factoring Notice of Assignment (NOA)</strong> (or voided check if direct ACH)</li>
        <li style="margin-bottom: 6px;"><strong>Completed Carrier Equipment Profile</strong> (Page 2 of attached packet)</li>
        <li style="margin-bottom: 6px;"><strong>Signed Limited Power of Attorney (POA)</strong> (Page 3 of attached packet)</li>
      </ol>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <h4 style="margin: 0 0 8px; color: #1e40af; font-size: 15px;">📎 Attached Documents in this Email:</h4>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #1e3a8a;">
        <li><strong>Shipping-Wish-Carrier-Onboarding-Packet.pdf</strong> (3 pages, printable & fillable)</li>
        <li><strong>Signed-Dispatch-Agreement-TruckdUp-ShippingWish.png</strong> (Counter-signed fulfillment agreement)</li>
      </ul>
      <p style="margin: 10px 0 0; font-size: 12px; color: #475569;">You can also access the online checklist anytime at: <a href="https://www.shippingwish.com/carrier-packet" style="color: #2563eb;">https://www.shippingwish.com/carrier-packet</a></p>
    </div>

    <p><strong>⚡ 2-Hour SLA:</strong> As soon as your drivers or owner-operators email their packet back to <a href="mailto:operations@shippingwish.com">operations@shippingwish.com</a>, our safety desk clears their file and assigns their dedicated dispatcher within 2 hours.</p>

    <p>Please feel free to call our direct dispatch line at <strong>(917) 737-0021</strong> if you have any questions.</p>

    <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 13px; color: #64748b;">
      <strong style="color: #0f172a;">Shipping Wish LLC · Dispatch Operations Desk</strong><br>
      🌐 <a href="https://www.shippingwish.com" style="color: #2563eb;">www.shippingwish.com</a><br>
      ✉️ <a href="mailto:operations@shippingwish.com" style="color: #2563eb;">operations@shippingwish.com</a><br>
      📞 +1 (917) 737-0021<br>
      📍 1007 N Orange St, 4th Floor, Suite 1228, Wilmington, DE 19801
    </div>
  </body>
  </html>
  `;

  console.log(`Sending email to ${recipient} with ${attachments.length} attachments...`);
  const result = await resend.emails.send({
    from,
    to: [recipient],
    reply_to: 'operations@shippingwish.com',
    subject,
    html,
    attachments
  });

  if (result.error) {
    console.error('Resend error:', result.error);
    process.exit(1);
  }

  console.log('Email successfully sent! Resend ID:', result.data?.id || result.id);
  
  try {
    const leadRes = await pool.query("SELECT id FROM crm_leads WHERE email = $1", [recipient]);
    const leadId = leadRes.rows[0]?.id || null;
    await pool.query(
      `INSERT INTO email_logs (lead_id, recipient_email, subject, email_type, status, resend_id, template_key)
       VALUES ($1, $2, $3, 'onboarding_packet_with_attachments', 'sent', $4, 'onboarding')`,
      [leadId, recipient, subject, result.data?.id || result.id]
    );
    if (leadId) {
      await pool.query("UPDATE crm_leads SET status = 'packet_sent', last_contacted_at = NOW() WHERE id = $1", [leadId]);
    }
    console.log('Logged to email_logs and updated lead status in database.');
  } catch (dbErr) {
    console.warn('DB log note:', dbErr.message);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
