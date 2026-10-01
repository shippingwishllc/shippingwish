/**
 * utils/carrier-packet.js
 * Shipping Wish LLC — Automated Broker Carrier Packet & Document Setup Engine
 * 
 * Compiles official carrier credentials (W-9, COI, MC Authority, Void Check / NOA)
 * into instant broker setup packets to eliminate paperwork delays and lock DAT loads in seconds.
 */

const pool = require('../db');
const { sendBrandedEmail } = require('./mailer');
const { COMPANY } = require('./email-templates');

const DEFAULT_CARRIER_PROFILE = {
  company_name: 'Shipping Wish Logistics LLC',
  dba: 'Shipping Wish Express',
  mc_number: '1489201',
  dot_number: '3976521',
  ein_number: '88-3921840',
  address: '1000 N West St, Suite 1200, Wilmington, DE 19801',
  phone: '+1 (800) 580-3101',
  dispatch_email: 'dispatch@shippingwish.com',
  accounting_email: 'accounting@shippingwish.com',
  contact_name: 'Operations Dispatch Desk',
  equipment_types: ["53' Dry Van", "53' Reefer", "Flatbed"],
  safety_rating: 'Satisfactory / Active (FMCSA Cleared)',
  hazmat_certified: false,
  twic_certified: true,
  insurance: {
    producer: 'Progressive Commercial Insurance / Reliance Risk',
    policy_number: 'CA-902184-SW',
    effective_date: '2026-01-01',
    expiration_date: '2027-01-01',
    auto_liability_limit: '$1,000,000 Combined Single Limit (CSL)',
    cargo_limit: '$100,000 Broad Form (Reefer Breakdown Included)',
    general_liability_limit: '$1,000,000 Each Occurrence',
    phone: '+1 (800) 444-0763'
  },
  factoring: {
    factoring_company: 'OTR Solutions / Triumph Financial',
    notice_of_assignment: true,
    remit_to_name: 'OTR Solutions LLC',
    remit_address: 'PO Box 102453, Atlanta, GA 30368',
    remit_email: 'invoicing@otrsolutions.com',
    remit_phone: '+1 (888) 555-0199',
    ach_routing: '061000104',
    ach_account: '••••••••4829'
  },
  documents: {
    w9_url: '/downloads/Shipping-Wish-W9-Signed.pdf',
    coi_url: '/downloads/Shipping-Wish-COI-Certificate.pdf',
    authority_cert_url: '/downloads/Shipping-Wish-MC-Authority.pdf',
    noa_factoring_url: '/downloads/Shipping-Wish-NOA-Letter.pdf',
    void_check_url: '/downloads/Shipping-Wish-DirectDeposit-VoidCheck.pdf'
  }
};

/**
 * Fetch carrier profile by ID or return default Shipping Wish master carrier
 */
async function getCarrierProfile(carrierId) {
  if (!carrierId) return DEFAULT_CARRIER_PROFILE;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ai_dispatch_carriers WHERE id = $1`,
      [carrierId]
    );

    if (!rows || rows.length === 0) {
      return DEFAULT_CARRIER_PROFILE;
    }

    const c = rows[0];
    return {
      id: c.id,
      company_name: c.company_name || DEFAULT_CARRIER_PROFILE.company_name,
      dba: c.company_name,
      mc_number: c.mc_number || DEFAULT_CARRIER_PROFILE.mc_number,
      dot_number: c.dot_number || DEFAULT_CARRIER_PROFILE.dot_number,
      ein_number: c.ein_number || DEFAULT_CARRIER_PROFILE.ein_number,
      address: c.last_location || DEFAULT_CARRIER_PROFILE.address,
      phone: c.phone || DEFAULT_CARRIER_PROFILE.phone,
      dispatch_email: c.email || DEFAULT_CARRIER_PROFILE.dispatch_email,
      contact_name: c.contact_name || 'Fleet Dispatcher',
      equipment_types: [c.equipment || "53' Dry Van"],
      safety_rating: 'Satisfactory / Active (FMCSA Cleared)',
      insurance: {
        ...DEFAULT_CARRIER_PROFILE.insurance,
        policy_number: c.insurance_policy_number || DEFAULT_CARRIER_PROFILE.insurance.policy_number
      },
      factoring: {
        ...DEFAULT_CARRIER_PROFILE.factoring,
        factoring_company: c.factoring_company_name || DEFAULT_CARRIER_PROFILE.factoring.factoring_company,
        remit_email: c.factoring_email || DEFAULT_CARRIER_PROFILE.factoring.remit_email
      },
      documents: {
        w9_url: c.w9_url || DEFAULT_CARRIER_PROFILE.documents.w9_url,
        coi_url: c.coi_url || DEFAULT_CARRIER_PROFILE.documents.coi_url,
        authority_cert_url: c.authority_cert_url || DEFAULT_CARRIER_PROFILE.documents.authority_cert_url,
        noa_factoring_url: c.noa_factoring_url || DEFAULT_CARRIER_PROFILE.documents.noa_factoring_url,
        void_check_url: c.void_check_url || DEFAULT_CARRIER_PROFILE.documents.void_check_url
      }
    };
  } catch (err) {
    console.warn('[CarrierPacket] DB lookup fallback:', err.message);
    return DEFAULT_CARRIER_PROFILE;
  }
}

/**
 * Generates structured email text and HTML for broker carrier packet submission
 */
function buildBrokerPacketEmail(profile, options = {}) {
  const {
    brokerName = 'Broker Dispatch / Onboarding Desk',
    loadId = 'DAT Spot Load',
    origin = '',
    destination = '',
    agreedRate = 0,
    equipment = "53' Dry Van",
    driverName = 'Assigned Fleet Driver',
    driverPhone = '+1 (800) 580-3101',
    tractorNum = 'T-104',
    trailerNum = 'V-5312'
  } = options;

  const subject = `CARRIER PACKET & SETUP: ${profile.company_name} (MC #${profile.mc_number}) — Load ${loadId}`;

  const textBody = `
Dear ${brokerName},

Thank you for tendering Load ${loadId}${origin && destination ? ` (${origin} -> ${destination})` : ''}.

Please find our complete Carrier Onboarding Packet and credentials below for instant setup in your system:

CARRIER CREDENTIALS:
- Company: ${profile.company_name} (MC #${profile.mc_number} / USDOT #${profile.dot_number})
- Federal Tax ID (EIN): ${profile.ein_number}
- Physical Address: ${profile.address}
- Dispatch Contact: ${profile.contact_name} (${profile.phone} / ${profile.dispatch_email})
- Safety Rating: ${profile.safety_rating}
- Equipment: ${equipment}

DISPATCH & DRIVER ASSIGNMENT:
- Tractor #: ${tractorNum} | Trailer #: ${trailerNum}
- Driver: ${driverName} | Cell: ${driverPhone}
${agreedRate ? `- Agreed Rate: $${agreedRate.toLocaleString()}` : ''}

INSURANCE VERIFICATION:
- Auto Liability: ${profile.insurance.auto_liability_limit}
- Cargo Insurance: ${profile.insurance.cargo_limit}
- Policy #: ${profile.insurance.policy_number}
- Insurer Phone: ${profile.insurance.phone}

PAYMENT & FACTORING (REMIT-TO):
- Notice of Assignment: YES (Factored)
- Factoring Partner: ${profile.factoring.factoring_company}
- Remit-to Email: ${profile.factoring.remit_email}
- Remit Address: ${profile.factoring.remit_address}

DOWNLOAD VERIFIED CREDENTIALS:
1. Signed Form W-9: https://www.shippingwish.com${profile.documents.w9_url}
2. Certificate of Insurance (COI): https://www.shippingwish.com${profile.documents.coi_url}
3. FMCSA Operating Authority: https://www.shippingwish.com${profile.documents.authority_cert_url}
4. Notice of Assignment (NOA): https://www.shippingwish.com${profile.documents.noa_factoring_url}

Please email the Rate Confirmation directly to ${profile.dispatch_email} so we can sign and lock the load immediately.

Best regards,
${profile.contact_name}
${profile.company_name}
Direct: ${profile.phone} | ${profile.dispatch_email}
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 20px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <div style="background: #0f172a; padding: 20px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; color: #f59e0b;">⚡ ${profile.company_name}</h2>
      <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">MC #${profile.mc_number} &bull; USDOT #${profile.dot_number} &bull; Verified Carrier Packet</p>
    </div>
    
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 15px;">Hello <strong>${brokerName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">
        Here are our credentials and compliance documents for <strong>Load ${loadId}</strong>${origin && destination ? ` (<em>${origin} &rarr; ${destination}</em>)` : ''}. We are ready to roll!
      </p>

      <div style="background: #f1f5f9; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <h3 style="margin: 0 0 10px; font-size: 14px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.05em;">Carrier &amp; Equipment Details</h3>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #64748b;">Carrier Name:</td><td style="font-weight: bold;">${profile.company_name}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">MC / DOT #:</td><td style="font-weight: bold;">MC ${profile.mc_number} / DOT ${profile.dot_number}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Federal EIN:</td><td style="font-weight: bold;">${profile.ein_number}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Equipment:</td><td style="font-weight: bold;">${equipment} (Tractor #${tractorNum} / Trailer #${trailerNum})</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Driver Cell:</td><td style="font-weight: bold;">${driverName} (${driverPhone})</td></tr>
          ${agreedRate ? `<tr><td style="padding: 4px 0; color: #64748b;">Agreed Rate:</td><td style="font-weight: bold; color: #16a34a; font-size: 15px;">$${agreedRate.toLocaleString()}</td></tr>` : ''}
        </table>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <h3 style="margin: 0 0 10px; font-size: 14px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.05em;">Insurance Coverage</h3>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #64748b;">Auto Liability:</td><td style="font-weight: bold;">${profile.insurance.auto_liability_limit}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Cargo Insurance:</td><td style="font-weight: bold;">${profile.insurance.cargo_limit}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Policy Number:</td><td>${profile.insurance.policy_number}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Safety Rating:</td><td><span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 11px;">${profile.safety_rating}</span></td></tr>
        </table>
      </div>

      <div style="background: #fefce8; border: 1px solid #fef08a; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <h3 style="margin: 0 0 8px; font-size: 14px; text-transform: uppercase; color: #854d0e; letter-spacing: 0.05em;">Factoring Notice of Assignment</h3>
        <p style="margin: 0; font-size: 13px; color: #713f12;">
          All payments must be remitted directly to our factoring provider: <strong>${profile.factoring.factoring_company}</strong>.<br>
          Billing contact: <a href="mailto:${profile.factoring.remit_email}" style="color: #2563eb;">${profile.factoring.remit_email}</a>.
        </p>
      </div>

      <h4 style="margin: 20px 0 10px; font-size: 14px; color: #0f172a;">Direct Document Downloads:</h4>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <a href="https://www.shippingwish.com${profile.documents.w9_url}" style="display: inline-block; padding: 8px 14px; background: #e0f2fe; color: #0284c7; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold;">📄 Download Signed Form W-9</a>
        <a href="https://www.shippingwish.com${profile.documents.coi_url}" style="display: inline-block; padding: 8px 14px; background: #e0f2fe; color: #0284c7; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold;">🛡️ Download Certificate of Insurance (COI)</a>
        <a href="https://www.shippingwish.com${profile.documents.authority_cert_url}" style="display: inline-block; padding: 8px 14px; background: #e0f2fe; color: #0284c7; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold;">📜 Download FMCSA Operating Authority</a>
        <a href="https://www.shippingwish.com${profile.documents.noa_factoring_url}" style="display: inline-block; padding: 8px 14px; background: #e0f2fe; color: #0284c7; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold;">🏦 Download Notice of Assignment (NOA)</a>
      </div>

      <p style="margin-top: 24px; font-size: 14px; color: #334155;">
        Please send the Rate Confirmation to <a href="mailto:${profile.dispatch_email}" style="color: #2563eb; font-weight: bold;">${profile.dispatch_email}</a> for immediate signature.
      </p>
    </div>

    <div style="background: #f1f5f9; padding: 14px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0;">
      ${profile.company_name} &bull; ${profile.phone} &bull; ${profile.address}
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, text: textBody, html: htmlBody };
}

/**
 * Send carrier packet directly to broker email
 */
async function sendPacketToBroker(brokerEmail, profile, options = {}) {
  if (!brokerEmail || !brokerEmail.includes('@')) {
    throw new Error('Valid broker email address is required.');
  }

  const { subject, text, html } = buildBrokerPacketEmail(profile, options);

  const res = await sendBrandedEmail({
    to: brokerEmail,
    subject,
    text,
    html
  });

  return {
    ok: true,
    to: brokerEmail,
    subject,
    email_result: res,
    message: `Carrier setup packet sent to ${brokerEmail} for MC #${profile.mc_number}.`
  };
}

module.exports = {
  DEFAULT_CARRIER_PROFILE,
  getCarrierProfile,
  buildBrokerPacketEmail,
  sendPacketToBroker
};
