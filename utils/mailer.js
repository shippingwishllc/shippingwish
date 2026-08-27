const { Resend } = require('resend');
const pool = require('../db');
const { COMPANY, unsubscribeUrl } = require('./email-templates');

let resendClient = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

function mailFrom() {
  return process.env.MAIL_FROM || `Shipping Wish LLC <${COMPANY.email}>`;
}

function replyToAddress(leadId) {
  const inbound = process.env.MAIL_REPLY_TO || COMPANY.operationsEmail;
  if (!leadId) return inbound;
  // Resend inbound: replies+LEADID@yourdomain.com when inbound domain is configured
  const tagged = process.env.MAIL_REPLY_TAG_DOMAIN;
  if (tagged) return `replies+${leadId}@${tagged.replace(/^@/, '')}`;
  return inbound;
}

async function isUnsubscribed(email) {
  if (!email) return false;
  try {
    const r = await pool.query('SELECT 1 FROM unsubscribes WHERE lower(email) = lower($1) LIMIT 1', [email.trim()]);
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Send a branded, inbox-oriented email.
 * Always includes a text part, List-Unsubscribe, and Reply-To.
 */
async function sendBrandedEmail({
  to,
  subject,
  html,
  text,
  leadId,
  sentBy,
  emailType,
  templateKey,
  cc,
  transactional
}) {
  if (!to) throw new Error('Recipient email is required');
  const isTx = Boolean(transactional) ||
    ['contact_ack', 'trial_welcome', 'subscription_started', 'load_booked', 'onboarding', 'internal_lead', 'internal_checkout'].includes(templateKey || emailType);
  if (!isTx && await isUnsubscribed(to)) {
    return { skipped: true, reason: 'unsubscribed', id: null };
  }

  const resend = getResend();
  const from = isTx
    ? (process.env.MAIL_FROM_TRANSACTIONAL || mailFrom())
    : mailFrom();
  const replyTo = replyToAddress(leadId);
  const headers = isTx
    ? undefined
    : {
      'List-Unsubscribe': `<${unsubscribeUrl(to)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };

  let providerId = null;
  let status = 'logged';

  if (resend) {
    const payload = {
      from,
      to: [to],
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      reply_to: replyTo
    };
    if (headers) payload.headers = headers;
    if (cc && cc.length) payload.cc = cc;
    const result = await resend.emails.send(payload);
    if (result.error) {
      throw new Error(result.error.message || 'Resend send failed');
    }
    providerId = (result.data && result.data.id) || result.id || null;
    status = 'sent';
  } else {
    providerId = 'dev_' + Date.now();
    status = 'logged_no_resend_key';
    console.log('[MAILER] RESEND_API_KEY missing — logged only:', { to, subject });
  }

  try {
    await pool.query(
      `INSERT INTO email_logs (lead_id, recipient_email, subject, email_type, status, resend_id, sent_by, template_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [leadId || null, to, subject, emailType || templateKey || 'outreach', status, providerId, sentBy || null, templateKey || emailType || null]
    );
  } catch (err) {
    // template_key column may not exist yet — fall back
    try {
      await pool.query(
        `INSERT INTO email_logs (lead_id, recipient_email, subject, email_type, status, resend_id, sent_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [leadId || null, to, subject, emailType || 'outreach', status, providerId, sentBy || null]
      );
    } catch (e2) {
      console.warn('[MAILER] email_logs insert failed:', e2.message);
    }
  }

  try {
    await pool.query(
      `INSERT INTO outreach_sends (lead_id, channel, template_key, recipient, subject, body_preview, provider_id, status, sent_by)
       VALUES ($1, 'email', $2, $3, $4, $5, $6, $7, $8)`,
      [leadId || null, templateKey || emailType || 'outreach', to, subject, (text || '').slice(0, 280), providerId, status, sentBy || null]
    );
  } catch (err) {
    console.warn('[MAILER] outreach_sends insert failed:', err.message);
  }

  return { skipped: false, id: providerId, status, from, replyTo };
}

/**
 * Resend webhooks only send metadata. Fetch full received email (html/text/headers).
 * Uses REST so it works even if the installed SDK is older than receiving.get.
 */
async function fetchReceivedEmail(emailId) {
  if (!emailId || !process.env.RESEND_API_KEY) return null;
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[MAILER] fetchReceivedEmail failed', res.status, errText.slice(0, 200));
    return null;
  }
  return res.json();
}

module.exports = {
  getResend,
  mailFrom,
  replyToAddress,
  isUnsubscribed,
  sendBrandedEmail,
  fetchReceivedEmail
};
