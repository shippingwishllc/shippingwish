const MAX_PDF_BYTES = 8 * 1024 * 1024;

async function pdfText(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || '');
}

function amount(text) {
  const n = Number(String(text || '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const RATE_LABELS = [
  /total\s+(?:carrier\s+)?(?:pay|rate|amount|charges?)\s*(?:\(usd\))?\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:agreed|confirmed|carrier)\s+(?:rate|pay)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /line\s*haul\s*(?:rate)?\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /\btotal\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i
];

// Pulls the fields a dispatcher checks on a rate confirmation. Plain regex so it works without
// an AI key; anything it can't find stays null rather than guessed.
function parseRateCon(rawText) {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  let rate = null;
  for (const re of RATE_LABELS) {
    const m = text.match(re);
    if (m && amount(m[1]) && amount(m[1]) >= 100) { rate = amount(m[1]); break; }
  }
  const mcNumbers = [...new Set((text.match(/\bMC\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{4,8})\b/gi) || []).map((s) => s.replace(/\D/g, '')))];
  const dotNumbers = [...new Set((text.match(/\b(?:US\s*)?DOT\s*(?:#|No\.?|Number)?\s*[:\-]?\s*(\d{5,8})\b/gi) || []).map((s) => s.replace(/\D/g, '')))];
  const loadRef = (text.match(/\b(?:load|order|pro|reference|ref|confirmation|shipment)\s*(?:#|no\.?|number|id)\s*[:\-]?\s*([A-Z0-9][A-Z0-9-]{3,})/i) || [])[1] || null;
  const date = (text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/) || [])[1] || null;
  return { rate, mcNumbers, dotNumbers, loadRef, firstDate: date, length: text.length };
}

function cityOf(location) {
  return String(location || '').split(',')[0].trim().toLowerCase();
}

function compareRateCon(parsed, text, expected) {
  const haystack = String(text || '').replace(/\s+/g, ' ').toLowerCase();
  const issues = [];
  const checks = [];
  if (!parsed || !parsed.length) {
    return { status: 'unreadable', issues: ['No readable text in the rate confirmation.'], checks };
  }
  if (expected.rate) {
    if (parsed.rate == null) issues.push('Could not find the total rate.');
    else if (Math.abs(parsed.rate - Number(expected.rate)) > 1) issues.push(`Rate is $${parsed.rate.toLocaleString('en-US')}, but the carrier approved $${Number(expected.rate).toLocaleString('en-US')}.`);
    else checks.push(`Rate $${parsed.rate.toLocaleString('en-US')} matches.`);
  }
  const mc = String(expected.carrierMc || '').replace(/\D/g, '');
  const dot = String(expected.carrierDot || '').replace(/\D/g, '');
  if (mc || dot) {
    const hasMc = mc && parsed.mcNumbers.includes(mc);
    const hasDot = dot && parsed.dotNumbers.includes(dot);
    if (hasMc || hasDot) checks.push(`Carrier ${hasMc ? `MC ${mc}` : `USDOT ${dot}`} is on it.`);
    else issues.push(`Carrier ${mc ? `MC ${mc}` : `USDOT ${dot}`} is not on the rate confirmation.`);
  }
  for (const [label, loc] of [['Pickup', expected.pickup], ['Delivery', expected.delivery]]) {
    const city = cityOf(loc);
    if (!city) continue;
    if (haystack.includes(city)) checks.push(`${label} ${loc} found.`);
    else issues.push(`${label} city ${loc} is not on the rate confirmation.`);
  }
  return { status: issues.length ? 'mismatch' : 'match', issues, checks };
}

async function rateConText({ resendId, attachments, bodyText }) {
  const pdfs = (attachments || []).filter((a) => /pdf/i.test(a.content_type || '') || /\.pdf$/i.test(a.filename || ''));
  if (pdfs.length && resendId) {
    try {
      const { fetchReceivedAttachments } = require('./mailer');
      const listed = await fetchReceivedAttachments(resendId);
      const items = listed.ok ? listed.attachments : [];
      for (const meta of pdfs) {
        const item = items.find((i) => i.id === meta.id) || items.find((i) => i.filename === meta.filename);
        if (!item || !item.download_url) continue;
        const res = await fetch(item.download_url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_PDF_BYTES) continue;
        const text = await pdfText(buf);
        if (text.trim().length > 40) return { text, source: `pdf:${item.filename || meta.filename || 'attachment'}` };
      }
    } catch (err) {
      console.warn('[RATECON] could not read PDF:', err.message);
    }
  }
  return { text: String(bodyText || ''), source: pdfs.length ? 'email_body_pdf_unreadable' : 'email_body', hadPdf: pdfs.length > 0 };
}

// Reads the rate confirmation from a broker reply and compares it with what the carrier approved.
async function checkRateCon({ resendId, attachments, bodyText, expected }) {
  const { text, source, hadPdf } = await rateConText({ resendId, attachments, bodyText });
  const parsed = parseRateCon(text);
  const comparison = compareRateCon(parsed, text, expected);
  if (!hadPdf && source === 'email_body' && parsed.rate == null) {
    return { status: 'none', source, parsed, issues: [], checks: [] };
  }
  return { ...comparison, source, parsed, checkedAt: new Date().toISOString() };
}

module.exports = { pdfText, parseRateCon, compareRateCon, checkRateCon };
