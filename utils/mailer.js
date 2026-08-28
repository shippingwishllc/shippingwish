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

function receivingApiKey() {
  return process.env.RESEND_RECEIVING_API_KEY || process.env.RESEND_API_KEY || null;
}

async function resendApiGet(path, apiKey) {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

function normalizeEmail(addr) {
  const raw = String(addr || '').trim().toLowerCase();
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

/**
 * Resend webhooks only send metadata. Fetch full received email (html/text/headers).
 * Sending-only API keys cannot call receiving endpoints — use RESEND_RECEIVING_API_KEY (full access).
 */
async function fetchReceivedEmail(emailId, hints = {}) {
  const key = receivingApiKey();
  if (!key) {
    return { ok: false, error: 'Resend API key missing', hint: 'Set RESEND_API_KEY in Vercel.' };
  }

  const permissionHint =
    'Create a Resend API key with Full access (Sending only cannot read inbox). ' +
    'Add it in Vercel as RESEND_RECEIVING_API_KEY, redeploy, then click Reload body again.';

  async function loadById(id) {
    if (!id) return null;
    const r = await resendApiGet(`/emails/receiving/${encodeURIComponent(id)}`, key);
    if (r.ok && r.json) return { data: r.json, emailId: id };
    if (r.status === 401 || r.status === 403) {
      return { permissionError: true, status: r.status, detail: r.text.slice(0, 200) };
    }
    return null;
  }

  let loaded = await loadById(emailId);
  if (loaded && loaded.permissionError) {
    return { ok: false, error: 'API key cannot read inbound emails', hint: permissionHint, status: loaded.status };
  }

  if (!loaded) {
    const list = await resendApiGet('/emails/receiving?limit=50', key);
    if (!list.ok) {
      if (list.status === 401 || list.status === 403) {
        return { ok: false, error: 'API key cannot read inbound emails', hint: permissionHint, status: list.status };
      }
      return {
        ok: false,
        error: 'Could not list received emails from Resend',
        detail: (list.json && list.json.message) || list.text.slice(0, 200)
      };
    }
    const items = (list.json && list.json.data) || [];
    const from = normalizeEmail(hints.fromEmail);
    const subj = String(hints.subject || '').trim().toLowerCase();
    let match = items.find((e) => e.id === emailId);
    if (!match && from) {
      match = items.find((e) => normalizeEmail(e.from) === from);
    }
    if (!match && from && subj) {
      match = items.find((e) => normalizeEmail(e.from) === from && String(e.subject || '').toLowerCase() === subj);
    }
    if (match) loaded = await loadById(match.id);
  }

  if (!loaded) {
    return {
      ok: false,
      error: 'Received email not found in Resend',
      hint: 'Check resend.com → Emails → Receiving. If missing, inbound MX/webhook may not have captured it.'
    };
  }
  if (loaded.permissionError) {
    return { ok: false, error: 'API key cannot read inbound emails', hint: permissionHint, status: loaded.status };
  }

  return { ok: true, data: loaded.data, emailId: loaded.emailId };
}

/** List attachments for a received email (signed download_url expires ~1h). */
async function fetchReceivedAttachments(emailId) {
  const key = receivingApiKey();
  if (!key) {
    return { ok: false, error: 'Resend API key missing', hint: 'Set RESEND_RECEIVING_API_KEY (Full access) in Vercel.' };
  }
  if (!emailId) return { ok: false, error: 'Missing received email id' };

  const r = await resendApiGet(`/emails/receiving/${encodeURIComponent(emailId)}/attachments`, key);
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        error: 'API key cannot read inbound attachments',
        hint: 'Use RESEND_RECEIVING_API_KEY with Full access.'
      };
    }
    return { ok: false, error: (r.json && r.json.message) || 'Could not list attachments' };
  }
  const items = (r.json && r.json.data) || [];
  return { ok: true, attachments: items };
}

function formatReplyFromAddress(toEmail) {
  const addr = normalizeEmail(toEmail);
  if (!addr) return mailFrom();
  const mapRaw = process.env.INBOUND_REPLY_FROM || '';
  if (mapRaw) {
    try {
      const map = JSON.parse(mapRaw);
      if (map[addr]) return map[addr];
    } catch (_) { /* ignore bad JSON */ }
  }
  if (addr === normalizeEmail(process.env.OPERATIONS_EMAIL || COMPANY.operationsEmail)) {
    return process.env.MAIL_FROM_TRANSACTIONAL || mailFrom();
  }
  const local = addr.split('@')[0] || 'Shipping Wish';
  const name = local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `${name} <${addr}>`;
}

module.exports = {
  getResend,
  mailFrom,
  replyToAddress,
  isUnsubscribed,
  sendBrandedEmail,
  fetchReceivedEmail,
  fetchReceivedAttachments,
  formatReplyFromAddress,
  receivingApiKey,
  normalizeEmail
};
