/** Resend-compatible email check — rejects truncated FMCSA values like name@gm */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidEmail(raw) {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

/** Drop bad scraped emails instead of storing unusable addresses */
function sanitizeEmail(raw) {
  const email = normalizeEmail(raw);
  return isValidEmail(email) ? email : '';
}

function emailValidationError(raw) {
  const email = normalizeEmail(raw);
  if (!email) return 'No email address on this lead.';
  if (!email.includes('@')) return `Invalid email "${email}" — missing @ symbol.`;
  const domain = email.split('@')[1] || '';
  if (!domain.includes('.')) {
    return `Invalid email "${email}" — domain looks incomplete (FMCSA often truncates emails). Use a full address like name@gmail.com.`;
  }
  return `Invalid email "${email}". Use format name@company.com before sending.`;
}

module.exports = { normalizeEmail, isValidEmail, sanitizeEmail, emailValidationError };
