// utils/email-load-pipeline.js
// Module B: AI Email-to-Load Ingestion Pipeline (Resend Inbound / SendGrid / Mailgun -> LLM Extractor -> LoadsNexus)
// Automatically matches sender domain to verified FMCSA Broker MC#, extracts 1-50 loads, deduplicates & publishes live!

const pool = require('../db');
const { parseFreightWithAI } = require('./ai-freight-extractor');
const { parseDatInput } = require('./dat-load-parser');
const { lookupCensusRow, digits } = require('./fmcsa');
const { sanitizeEmail } = require('./email-valid');
const { upsertStandardLoad, parseCsvFreightText } = require('./load-ingest');

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'live.com', 'msn.com', 'protonmail.com', 'me.com', 'mail.com'
]);

const INGEST_RECIPIENT_REGEX = /\b(loads|freight|ingest|dispatch-loads)@(loadsnexus\.com|shippingwish\.com)\b/i;

async function ensureEmailIngestLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_load_ingest_logs (
      id SERIAL PRIMARY KEY,
      from_email TEXT,
      to_email TEXT,
      subject TEXT,
      matched_broker_name TEXT,
      matched_broker_mc TEXT,
      broker_verified BOOLEAN DEFAULT FALSE,
      loads_detected INT DEFAULT 0,
      loads_inserted INT DEFAULT 0,
      loads_updated INT DEFAULT 0,
      status TEXT DEFAULT 'processed',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(() => {});
}

function isFreightIngestRecipient(toEmail) {
  return INGEST_RECIPIENT_REGEX.test(String(toEmail || ''));
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(?:tr|p|div|li|br|h[1-6])>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function resolveSenderBroker(fromEmail) {
  const email = sanitizeEmail(fromEmail || '');
  if (!email) {
    return {
      broker_company_name: 'Verified Email Broker',
      broker_mc_number: null,
      broker_dot_number: null,
      broker_contact_email: null,
      broker_contact_phone: null,
      broker_verified: false,
      domain: null
    };
  }
  const domain = email.split('@')[1]?.toLowerCase() || '';
  const isCorpDomain = Boolean(domain && !FREE_EMAIL_DOMAINS.has(domain));

  // 1. Exact email match in brokers directory
  try {
    const exact = await pool.query(
      `SELECT company_name, mc_number, dot_number, phone, email
       FROM brokers
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );
    if (exact.rows.length) {
      const b = exact.rows[0];
      return {
        broker_company_name: b.company_name,
        broker_mc_number: b.mc_number || null,
        broker_dot_number: b.dot_number || null,
        broker_contact_email: email,
        broker_contact_phone: b.phone || null,
        broker_verified: Boolean(b.mc_number),
        domain
      };
    }

    // 2. Corporate domain match in brokers directory (e.g. dispatch@tql.com matches any @tql.com broker)
    if (isCorpDomain) {
      const domRes = await pool.query(
        `SELECT company_name, mc_number, dot_number, phone, email
         FROM brokers
         WHERE lower(email) LIKE $1
         ORDER BY (CASE WHEN mc_number IS NOT NULL THEN 0 ELSE 1 END), id DESC
         LIMIT 1`,
        [`%@${domain}`]
      );
      if (domRes.rows.length) {
        const b = domRes.rows[0];
        return {
          broker_company_name: b.company_name,
          broker_mc_number: b.mc_number || null,
          broker_dot_number: b.dot_number || null,
          broker_contact_email: email,
          broker_contact_phone: b.phone || null,
          broker_verified: Boolean(b.mc_number),
          domain
        };
      }

      // 3. Match registered broker user by corporate domain
      const userRes = await pool.query(
        `SELECT id, company_name, mc_number, dot_number, phone, email
         FROM users
         WHERE role = 'broker' AND deleted_at IS NULL AND lower(email) LIKE $1
         LIMIT 1`,
        [`%@${domain}`]
      );
      if (userRes.rows.length) {
        const u = userRes.rows[0];
        return {
          broker_user_id: u.id,
          broker_company_name: u.company_name || domain.toUpperCase(),
          broker_mc_number: u.mc_number || null,
          broker_dot_number: u.dot_number || null,
          broker_contact_email: email,
          broker_contact_phone: u.phone || null,
          broker_verified: Boolean(u.mc_number),
          domain
        };
      }
    }
  } catch (_) {}

  // 4. Fallback: Live US DOT FMCSA Census lookup by sender email
  try {
    const row = await lookupCensusRow(email);
    if (row && (row.legal_name || row.dba_name)) {
      const mcDigits = digits(row.docket1) || digits(row.docket2);
      const isBrokerAuth = String(row.carship || '').toUpperCase().includes('B') && String(row.status_code || '').toUpperCase() === 'A';
      return {
        broker_company_name: row.legal_name || row.dba_name,
        broker_mc_number: mcDigits ? `MC-${mcDigits}` : null,
        broker_dot_number: String(row.dot_number || '') || null,
        broker_contact_email: email,
        broker_contact_phone: row.phone || null,
        broker_verified: Boolean(isBrokerAuth && mcDigits),
        domain
      };
    }
  } catch (_) {}

  const fallbackName = isCorpDomain
    ? domain.replace(/\.[a-z]{2,}$/i, '').replace(/[-_]/g, ' ').toUpperCase() + ' Logistics'
    : 'Email Freight Broker';

  return {
    broker_company_name: fallbackName,
    broker_mc_number: null,
    broker_dot_number: null,
    broker_contact_email: email,
    broker_contact_phone: null,
    broker_verified: false,
    domain
  };
}

/**
 * Process an inbound freight email (SendGrid, Mailgun, Resend, or manual test payload)
 */
async function processInboundFreightEmail({ fromEmail, toEmail, subject, bodyText, bodyHtml, attachments = [], dryRun = false }) {
  await ensureEmailIngestLogTable();

  const cleanFrom = sanitizeEmail(fromEmail || '') || String(fromEmail || '').trim();
  const brokerCtx = await resolveSenderBroker(cleanFrom);
  const plainBody = (bodyText && String(bodyText).trim()) || stripHtmlToText(bodyHtml || '');
  const fullText = [subject ? `Subject: ${subject}` : '', plainBody].filter(Boolean).join('\n\n').trim();

  let extracted = [];

  // 1. Check CSV attachments first if present
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      const fname = String(att?.filename || att?.name || '').toLowerCase();
      if (fname.endsWith('.csv') && (att.content || att.text)) {
        const csvStr = att.text || (Buffer.isBuffer(att.content) ? att.content.toString('utf8') : Buffer.from(String(att.content), 'base64').toString('utf8'));
        const parsedCsv = parseCsvFreightText(csvStr);
        parsedCsv.validRows.forEach((vr) => extracted.push(vr.raw));
      }
    }
  }

  // 2. Parse email body with LLM (gpt-4o-mini) / heuristic parser + multi-row table parser fallback
  if (fullText.length >= 15) {
    try {
      const aiRes = await parseFreightWithAI(fullText, {
        name: brokerCtx.broker_company_name,
        mc: brokerCtx.broker_mc_number,
        phone: brokerCtx.broker_contact_phone,
        email: brokerCtx.broker_contact_email
      });
      if (aiRes && Array.isArray(aiRes.loads) && aiRes.loads.length) {
        extracted = extracted.concat(aiRes.loads);
      }
    } catch (_) {}

    if (extracted.length === 0) {
      try {
        const tableRes = parseDatInput(fullText);
        if (Array.isArray(tableRes) && tableRes.length) {
          extracted = extracted.concat(tableRes);
        }
      } catch (_) {}
    }
  }

  // Cap single email burst at 50 loads to prevent abuse
  const capped = extracted.slice(0, 50);

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      broker: brokerCtx,
      loads_detected: capped.length,
      loads_preview: capped
    };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const publishedLoads = [];

  for (const item of capped) {
    const res = await upsertStandardLoad(item, {
      ...brokerCtx,
      source_channel: 'EMAIL_PARSER'
    });
    if (res.ok) {
      if (res.action === 'inserted') {
        inserted++;
        publishedLoads.push(res.load);
      } else if (res.action === 'updated') {
        updated++;
        publishedLoads.push(res.load);
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  await pool.query(
    `INSERT INTO email_load_ingest_logs (
      from_email, to_email, subject, matched_broker_name, matched_broker_mc,
      broker_verified, loads_detected, loads_inserted, loads_updated, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      cleanFrom,
      String(toEmail || 'loads@loadsnexus.com'),
      String(subject || '').slice(0, 240),
      brokerCtx.broker_company_name,
      brokerCtx.broker_mc_number,
      brokerCtx.broker_verified,
      capped.length,
      inserted,
      updated,
      capped.length ? 'published' : 'no_loads_detected'
    ]
  ).catch(() => {});

  return {
    ok: true,
    broker: brokerCtx,
    loads_detected: capped.length,
    loads_inserted: inserted,
    loads_updated: updated,
    loads_skipped: skipped,
    published_loads: publishedLoads
  };
}

module.exports = {
  isFreightIngestRecipient,
  resolveSenderBroker,
  processInboundFreightEmail,
  ensureEmailIngestLogTable
};
