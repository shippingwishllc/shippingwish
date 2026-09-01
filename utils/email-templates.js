const crypto = require('crypto');

const APP_URL = (process.env.APP_URL || 'https://www.shippingwish.com').replace(/\/$/, '');
const COMPANY = {
  name: 'Shipping Wish LLC',
  legal: 'Shipping Wish LLC',
  phone: process.env.COMPANY_PHONE || '+1 (917) 737-0021',
  email: process.env.COMPANY_EMAIL || 'info@shippingwish.com',
  operationsEmail: process.env.OPERATIONS_EMAIL || 'operations@shippingwish.com',
  address: '19266 Coastal Hwy, Rehoboth Beach, DE 19971, USA',
  site: APP_URL
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unsubscribeToken(email) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const payload = Buffer.from(String(email).trim().toLowerCase()).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 24);
  return `${payload}.${sig}`;
}

function verifyUnsubscribeToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 24);
  if (sig !== expected) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function unsubscribeUrl(email) {
  return `${APP_URL}/unsubscribe?t=${encodeURIComponent(unsubscribeToken(email))}`;
}


function wrapCorporateEmail({
  preheader,
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  recipientEmail,
  transactional
}) {
  const unsub = recipientEmail ? unsubscribeUrl(recipientEmail) : `${APP_URL}/unsubscribe`;
  const footerNote = transactional
    ? `<p style="margin:0;">This is a service message about your fleet operations account with ${escapeHtml(COMPANY.legal)}. Reply to this email if anything is wrong.</p>`
    : `<p style="margin:0;">This message was sent to ${escapeHtml(recipientEmail || 'you')} regarding fleet operations support for U.S. motor carriers.
              <a href="${escapeHtml(unsub)}" style="color:#64748b;">Unsubscribe</a>.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#0f172a;padding:18px 28px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#f59e0b;font-weight:700;">Shipping Wish LLC</p>
              <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#cbd5e1;">Dedicated fleet operations · You keep the freight pay</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1e293b;">
              <h1 style="margin:0 0 18px;font-size:22px;line-height:1.35;font-weight:normal;color:#0f172a;">${escapeHtml(heading)}</h1>
              ${bodyHtml}
            </td>
          </tr>
          ${ctaLabel && ctaUrl ? `
          <tr>
            <td style="padding:8px 28px 28px;">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;padding:12px 22px;border-radius:4px;">${escapeHtml(ctaLabel)}</a>
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">
              <p style="margin:0 0 8px;"><strong style="color:#0f172a;">${escapeHtml(COMPANY.legal)}</strong><br>
              ${escapeHtml(COMPANY.address)}<br>
              ${escapeHtml(COMPANY.phone)} · ${escapeHtml(COMPANY.operationsEmail)}</p>
              ${footerNote}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function firstName(ownerName, companyName) {
  const raw = (ownerName || '').trim();
  if (raw && raw.toLowerCase() !== 'owner' && raw.toLowerCase() !== 'n/a') {
    return raw.split(/\s+/)[0];
  }
  return companyName || 'there';
}

function dedicatedManagerEmail({ ownerName, companyName, recipientEmail }) {
  const name = firstName(ownerName, companyName);
  const company = companyName || 'your fleet';
  const heading = `Dedicated operations manager for ${company}`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      I am writing from <strong>Shipping Wish LLC</strong>. We place a
      <strong>Dedicated Fleet Operations Manager</strong> with small motor carriers.
    </p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      That person works your trucks only: finding freight, talking to brokers, booking loads you approve,
      and handling the paperwork so the equipment keeps moving. You collect the freight pay from the broker.
      We invoice a flat weekly amount for the manager — not a cut of your load.
    </p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">If this would help ${escapeHtml(company)}, reply to this email with:</p>
    <ol style="margin:0 0 14px;padding-left:20px;font-size:16px;line-height:1.7;">
      <li>Equipment type and how many trucks</li>
      <li>Preferred lanes or home time</li>
      <li>Whether you want a weekly dedicated manager</li>
    </ol>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Or call ${escapeHtml(COMPANY.phone)}. I will not waste your time if you already have this covered.
    </p>
    <p style="margin:0;font-size:16px;line-height:1.7;">Respectfully,<br>
    Operations Desk<br>${escapeHtml(COMPANY.name)}</p>
  `;
  const text = `Hello ${name},

I am writing from Shipping Wish LLC. We place a Dedicated Fleet Operations Manager with small motor carriers.

That person works your trucks only: finding freight, talking to brokers, booking loads you approve, and handling paperwork. You collect freight pay from the broker. We invoice a flat weekly amount for the manager — not a cut of your load.

If this would help ${company}, reply with equipment type, truck count, and preferred lanes — or call ${COMPANY.phone}.

Shipping Wish LLC
${COMPANY.address}
${COMPANY.phone} · ${COMPANY.operationsEmail}

Unsubscribe: ${unsubscribeUrl(recipientEmail)}`;

  return {
    subject: `Operations manager for ${company}`,
    html: wrapCorporateEmail({
      preheader: 'A dedicated operations manager for your trucks. Weekly retainer. You keep the freight pay.',
      heading,
      bodyHtml,
      ctaLabel: 'Reply to this email',
      ctaUrl: `mailto:${COMPANY.operationsEmail}?subject=${encodeURIComponent('Re: ' + company)}`,
      recipientEmail
    }),
    text
  };
}

function followUpEmail({ ownerName, companyName, recipientEmail }) {
  const name = firstName(ownerName, companyName);
  const company = companyName || 'your fleet';
  const heading = `Following up — ${company}`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Checking in on my note about a Dedicated Fleet Operations Manager for ${escapeHtml(company)}.
    </p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      If you already have someone booking freight full-time, you can ignore this.
      If you do not, I can have a manager start looking at loads for your equipment this week.
    </p>
    <p style="margin:0;font-size:16px;line-height:1.7;">Reply to this email and I will send the one-page setup and weekly billing link.<br><br>
    Operations Desk · ${escapeHtml(COMPANY.name)} · ${escapeHtml(COMPANY.phone)}</p>
  `;
  const text = `Hello ${name},

Checking in on a Dedicated Fleet Operations Manager for ${company}. If you already have this covered, ignore this. If not, reply and I will send the setup and weekly billing link.

${COMPANY.name} · ${COMPANY.phone}
Unsubscribe: ${unsubscribeUrl(recipientEmail)}`;
  return {
    subject: `Following up — ${company}`,
    html: wrapCorporateEmail({
      preheader: 'If you already have freight covered, ignore this. If not, reply to this email.',
      heading,
      bodyHtml,
      ctaLabel: 'Reply to this email',
      ctaUrl: `mailto:${COMPANY.operationsEmail}?subject=${encodeURIComponent('Re: ' + company)}`,
      recipientEmail
    }),
    text
  };
}

function onboardingEmail({ ownerName, companyName, recipientEmail, billingUrl }) {
  const name = firstName(ownerName, companyName);
  const heading = `Setup for ${companyName || 'your fleet'}`;
  const payBlock = billingUrl
    ? `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Complete weekly billing (Stripe) here so we can assign your manager: <a href="${escapeHtml(billingUrl)}">${escapeHtml(billingUrl)}</a></p>`
    : '';
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Welcome. To assign a Dedicated Fleet Operations Manager to ${escapeHtml(companyName || 'your company')}, we need:
    </p>
    <ol style="margin:0 0 14px;padding-left:20px;font-size:16px;line-height:1.7;">
      <li>MC / USDOT and certificate of insurance</li>
      <li>Equipment type, truck count, and preferred lanes</li>
      <li>Who approves loads (owner, safety, or dispatcher on your side)</li>
      <li>Weekly Stripe billing so the retainer is clear and small</li>
    </ol>
    ${payBlock}
    <p style="margin:0;font-size:16px;line-height:1.7;">Reply with those items, or call ${escapeHtml(COMPANY.phone)}.<br><br>
    Operations Desk · ${escapeHtml(COMPANY.name)}</p>
  `;
  const text = `Hello ${name},

To assign a Dedicated Fleet Operations Manager to ${companyName || 'your company'}, send MC/DOT, COI, equipment, lanes, load-approval contact, and complete weekly Stripe billing${billingUrl ? ': ' + billingUrl : ''}.

${COMPANY.name} · ${COMPANY.phone}
Unsubscribe: ${unsubscribeUrl(recipientEmail)}`;
  return {
    subject: `Dedicated Operations Manager setup — ${companyName || 'Shipping Wish LLC'}`,
    html: wrapCorporateEmail({
      preheader: 'One-page setup. Weekly Stripe retainer. Then we start looking for freight.',
      heading,
      bodyHtml,
      ctaLabel: billingUrl ? 'Complete weekly billing' : 'Reply with setup details',
      ctaUrl: billingUrl || `mailto:${COMPANY.operationsEmail}`,
      recipientEmail,
      transactional: true
    }),
    text
  };
}

function trialWelcomeEmail({
  ownerName,
  companyName,
  recipientEmail,
  planName,
  weeklyAmount,
  trucks,
  trialDays,
  portalCreated,
  portalTempPassword
}) {
  const name = firstName(ownerName, companyName);
  const days = trialDays || parseInt(process.env.STRIPE_TRIAL_DAYS || '7', 10);
  const amount = weeklyAmount || '$149';
  const heading = 'Your 7-day operations trial is on';
  const loginUrl = `${APP_URL}/login`;
  const portalHtml = portalCreated && portalTempPassword
    ? `<p style="margin:0 0 8px;font-size:16px;line-height:1.7;"><strong>Your TMS login is ready</strong></p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Sign in at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a><br>
      Email: ${escapeHtml(recipientEmail || '')}<br>
      Temporary password: <strong>${escapeHtml(portalTempPassword)}</strong><br>
      Change it after first login. Add trucks, drivers, COI, and W-9 so we can book.
    </p>`
    : `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Open your TMS at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a> with this email.
      If you already had a password, keep using it.
    </p>`;
  const portalText = portalCreated && portalTempPassword
    ? `TMS login: ${loginUrl}\nEmail: ${recipientEmail || ''}\nTemporary password: ${portalTempPassword}\nChange it after first login.\n\n`
    : `TMS login: ${loginUrl} (use this email).\n\n`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Thank you. <strong>${escapeHtml(companyName || 'Your company')}</strong> started a Dedicated Fleet Operations trial with Shipping Wish LLC.
    </p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      You agreed to a weekly operations retainer after a ${escapeHtml(String(days))}-day free trial.
      <strong>Nothing is charged today.</strong> If you keep the desk, the weekly amount is
      <strong>${escapeHtml(amount)} per week</strong> for ${escapeHtml(planName || 'your plan')}
      ${trucks ? `(${escapeHtml(String(trucks))})` : ''}. Cancel in the Stripe email or portal before the trial ends and you pay $0.
    </p>
    ${portalHtml}
    <p style="margin:0 0 8px;font-size:16px;line-height:1.7;"><strong>What we do this week</strong></p>
    <ol style="margin:0 0 14px;padding-left:20px;font-size:16px;line-height:1.7;">
      <li>Assign a named operations manager to your trucks only</li>
      <li>Collect MC / USDOT, insurance, equipment, and preferred lanes</li>
      <li>Start finding freight you approve — you keep 100% of broker pay</li>
    </ol>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Reply to this email with truck count, equipment, and home time. Or call ${escapeHtml(COMPANY.phone)}.
      This is a service email, not a promotion.
    </p>
    <p style="margin:0;font-size:16px;line-height:1.7;">Respectfully,<br>
    Operations Desk<br>${escapeHtml(COMPANY.name)}</p>
  `;
  const text = `Hello ${name},

Thank you. ${companyName || 'Your company'} started a Dedicated Fleet Operations trial with Shipping Wish LLC.

Nothing is charged today. After ${days} free days, weekly billing is ${amount} if you keep the desk. Cancel before the trial ends and you pay $0.

${portalText}This week we assign a named manager, collect MC/DOT + insurance + lanes, and start finding freight you approve. You keep 100% of broker pay.

Reply with equipment and home time, or call ${COMPANY.phone}.

${COMPANY.name}
${COMPANY.address}
${COMPANY.phone}`;
  return {
    subject: `Trial started — Dedicated Operations Manager for ${companyName || 'your fleet'}`,
    html: wrapCorporateEmail({
      preheader: `$${0} due today. Named operations manager assigned this week. Weekly retainer starts after ${days} days unless you cancel.`,
      heading,
      bodyHtml,
      ctaLabel: 'Open your carrier portal',
      ctaUrl: `${APP_URL}/login`,
      recipientEmail,
      transactional: true
    }),
    text,
    transactional: true
  };
}

function loadBookedEmail({ ownerName, companyName, recipientEmail, loadSummary }) {
  const name = firstName(ownerName, companyName);
  const heading = 'Load booked — please confirm';
  const summary = loadSummary || 'Your operations manager booked a load. Details are in this email and your portal.';
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">${escapeHtml(summary)}</p>
    <p style="margin:0;font-size:16px;line-height:1.7;">Rate confirmation will follow. Call ${escapeHtml(COMPANY.phone)} if anything is wrong.<br><br>
    Operations Desk · ${escapeHtml(COMPANY.name)}</p>
  `;
  const text = `Hello ${name},\n\n${summary}\n\n${COMPANY.name} · ${COMPANY.phone}`;
  return {
    subject: `Load booked for ${companyName || 'your truck'} — Shipping Wish LLC`,
    html: wrapCorporateEmail({
      preheader: 'Load booked. Confirm details and watch for the rate confirmation.',
      heading,
      bodyHtml,
      ctaLabel: 'Open carrier portal',
      ctaUrl: `${APP_URL}/login`,
      recipientEmail,
      transactional: true
    }),
    text
  };
}

function contactAckEmail({ name, recipientEmail }) {
  const heading = 'We received your request';
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hello ${escapeHtml(name || 'there')},</p>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
      Shipping Wish LLC received your request. An operations manager will contact you at the number you provided.
      If it is urgent, call ${escapeHtml(COMPANY.phone)}.
    </p>
    <p style="margin:0;font-size:16px;line-height:1.7;">— Operations Desk</p>
  `;
  return {
    subject: 'We received your request — Shipping Wish LLC',
    html: wrapCorporateEmail({
      preheader: 'An operations manager will contact you shortly.',
      heading,
      bodyHtml,
      recipientEmail,
      transactional: true
    }),
    text: `Hello ${name || 'there'},\n\nShipping Wish LLC received your request. Call ${COMPANY.phone} if urgent.\n\nOperations Desk`
  };
}

function signupOtpEmail({ name, otp, trialDays }) {
  const days = trialDays || parseInt(process.env.PORTAL_TRIAL_DAYS || process.env.STRIPE_TRIAL_DAYS || '7', 10);
  const heading = 'Verify your email — Shipping Wish carrier portal';
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
      Hi ${escapeHtml(name || 'there')},
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
      Use this one-time code to finish creating your carrier portal account. It expires in <strong>10 minutes</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;padding:20px;background:#0f172a;border-radius:12px;">
      <div style="font-size:32px;font-weight:900;letter-spacing:0.35em;color:#f59e0b;font-family:monospace;">${escapeHtml(String(otp))}</div>
    </div>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#64748b;">
      After verification you get <strong>${days} days</strong> of full TMS access. Then weekly Stripe billing keeps your desk active ($0 due today when you add your card).
    </p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">If you did not request this, ignore this email.</p>
  `;
  const text = `Shipping Wish LLC — Your signup code: ${otp}\n\nExpires in 10 minutes. After verify: ${days}-day portal trial then weekly Stripe plan.\n\n${COMPANY.phone}`;
  return wrapCorporateEmail({
    preheader: `Your verification code: ${otp}`,
    heading,
    bodyHtml,
    text
  });
}

function buildTemplate(templateKey, vars) {
  switch (templateKey) {
    case 'signup_otp':
      return signupOtpEmail(vars);
    case 'follow_up':
      return followUpEmail(vars);
    case 'onboarding_packet':
    case 'onboarding':
      return onboardingEmail(vars);
    case 'load_booked':
      return loadBookedEmail(vars);
    case 'contact_ack':
      return contactAckEmail(vars);
    case 'trial_welcome':
    case 'subscription_started':
      return trialWelcomeEmail(vars);
    case 'dedicated_manager':
    case 'outreach':
    default:
      return dedicatedManagerEmail(vars);
  }
}

const SMS_TEMPLATES = {
  dedicated_manager: ({ companyName }) =>
    `Shipping Wish LLC: Dedicated ops manager for ${companyName || 'your trucks'}? Weekly fee, you keep freight pay. Reply YES or call ${COMPANY.phone}.`,
  follow_up: ({ companyName }) =>
    `Shipping Wish LLC: still want a Dedicated Operations Manager for ${companyName || 'your fleet'}? Reply YES or call ${COMPANY.phone}.`,
  load_booked: ({ loadSummary }) =>
    `Shipping Wish LLC: load booked. ${loadSummary || 'Details in email.'} Call ${COMPANY.phone} if wrong.`,
  onboarding: () =>
    `Shipping Wish LLC: complete weekly Stripe from your email so we assign your operations manager. ${COMPANY.phone}`,
  trial_welcome: ({ companyName }) =>
    `Shipping Wish LLC: ${companyName || 'your'} 7-day ops trial is on. $0 today. Reply with trucks + lanes, or call ${COMPANY.phone}.`
};

module.exports = {
  COMPANY,
  APP_URL,
  escapeHtml,
  unsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
  buildTemplate,
  SMS_TEMPLATES,
  dedicatedManagerEmail,
  followUpEmail,
  onboardingEmail,
  trialWelcomeEmail,
  signupOtpEmail
};
