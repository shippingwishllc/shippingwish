// utils/form-antispam.js
// Multi-layer zero-dependency Anti-Bot Shield for public NYC Limo Wish & Shipping Wish forms:
// 1. Signed HMAC human math challenge + minimum fill-time check (>= 3s)
// 2. Invisible honeypot trap
// 3. Per-IP hourly rate limiter
// 4. Gibberish / random mixed-case / Gmail dot-trick spam fingerprint detector

const crypto = require('crypto');

const SECRET = String(
  process.env.ANTISPAM_SECRET ||
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  'nyclimowish-antispam-shield-2026'
);

// In-memory per-IP rate limiter (per Vercel instance; backed by DB duplicate checks)
const ipBuckets = new Map();

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 64);
}

function checkIpRateLimit(req, bucketName = 'partner_apply', maxHits = 3, windowMs = 60 * 60 * 1000) {
  const key = `${bucketName}:${getClientIp(req)}`;
  const now = Date.now();
  const entry = ipBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    ipBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxHits - 1 };
  }
  entry.count += 1;
  if (entry.count > maxHits) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: maxHits - entry.count };
}

function signPayload(payloadB64) {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
}

function createChallenge() {
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(1, 10);
  const payload = JSON.stringify({ ans: a + b, iat: Date.now() });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = signPayload(payloadB64);
  return {
    token: `${payloadB64}.${sig}`,
    question: `What is ${a} + ${b}?`
  };
}

function verifyChallenge(token, userAnswer, { minAgeMs = 2500, maxAgeMs = 45 * 60 * 1000 } = {}) {
  const rawToken = String(token || '').trim();
  const ansStr = String(userAnswer ?? '').trim();
  if (!rawToken || !rawToken.includes('.') || !ansStr) {
    return { ok: false, reason: 'Please complete the human verification math check.' };
  }
  const [payloadB64, sig] = rawToken.split('.');
  if (!payloadB64 || !sig) {
    return { ok: false, reason: 'Invalid verification token. Please refresh the page and try again.' };
  }
  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'Verification signature mismatch. Please refresh the page.' };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const age = Date.now() - Number(parsed.iat || 0);
    if (age < minAgeMs) {
      return { ok: false, reason: 'Submission was too fast. Please verify your details and try again.' };
    }
    if (age > maxAgeMs) {
      return { ok: false, reason: 'Verification expired. Please refresh and submit again.' };
    }
    if (parseInt(ansStr, 10) !== Number(parsed.ans)) {
      return { ok: false, reason: 'Incorrect verification answer. Please check the math question.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Corrupted verification token. Please refresh the page.' };
  }
}

function countCaseTransitions(token) {
  let transitions = 0;
  let prev = 0; // 1 = lower, 2 = upper
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    const cur = ch >= 'a' && ch <= 'z' ? 1 : (ch >= 'A' && ch <= 'Z' ? 2 : 0);
    if (cur && prev && cur !== prev) transitions++;
    if (cur) prev = cur;
  }
  return transitions;
}

function isRandomMixedCaseGibberish(str) {
  const s = String(str || '').trim();
  if (!s) return false;
  const words = s.split(/\s+/);
  for (const w of words) {
    const lettersOnly = w.replace(/[^A-Za-z]/g, '');
    if (lettersOnly.length >= 10 && countCaseTransitions(lettersOnly) >= 4) {
      return true;
    }
  }
  return false;
}

function hasConsonantSoup(word) {
  const clean = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length < 5) return false;
  if (!/[aeiouy]/.test(clean)) return true;
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(clean)) return true;
  return false;
}

function isGmailDotTrickSpam(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at <= 0) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const dots = (local.match(/\./g) || []).length;
    if (dots >= 3) return true;
  }
  return false;
}

function isLikelyBotApplication(fields = {}) {
  const reasons = [];

  // 1. Invisible honeypot filled by bot
  if (String(fields.honeypot || fields.website_url || fields.fax_number || '').trim().length > 0) {
    reasons.push('honeypot_filled');
  }

  // 2. Name check: real applicants provide First & Last name (not single gibberish word like "Hkdzes")
  const fullName = String(fields.fullName || fields.full_name || '').trim();
  const nameWords = fullName.split(/\s+/).filter(Boolean);
  if (nameWords.length < 2) {
    if (hasConsonantSoup(fullName) || fullName.length < 4) {
      reasons.push('gibberish_single_name');
    }
  }
  if (isRandomMixedCaseGibberish(fullName)) {
    reasons.push('mixed_case_name');
  }

  // 3. Random mixed-case gibberish in vehicle / license / company
  for (const [label, val] of [
    ['vehicle_name', fields.vehicleName || fields.vehicle_name],
    ['vehicle_color', fields.vehicleColor || fields.vehicle_color],
    ['license_number', fields.licenseNumber || fields.license_number],
    ['company_name', fields.companyName || fields.company_name]
  ]) {
    if (isRandomMixedCaseGibberish(val)) {
      reasons.push(`gibberish_${label}`);
    }
  }

  // 4. Gmail dot-trick spam (e.g., b.j.b.e.e.n.ken@gmail.com)
  if (isGmailDotTrickSpam(fields.email)) {
    reasons.push('gmail_dot_trick');
  }

  // 5. Phone check (10-15 digits, not all same digit)
  const phoneDigits = String(fields.phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15 || /^(\d)\1+$/.test(phoneDigits)) {
    reasons.push('invalid_phone');
  }

  return {
    isSpam: reasons.length > 0,
    reasons
  };
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  createChallenge,
  verifyChallenge,
  checkIpRateLimit,
  isRandomMixedCaseGibberish,
  isGmailDotTrickSpam,
  isLikelyBotApplication,
  escapeHtml
};
