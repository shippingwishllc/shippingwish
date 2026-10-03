const { COMPANY } = require('./email-templates');

/** CTIA / TCPA footer for US A2P SMS. Keep short — Twilio concatenates after 160 chars. */
const SMS_LEGAL_FOOTER =
  `Msg & data rates may apply. Reply STOP to opt out, HELP for help. ${COMPANY.legal}`;

const STOP_WORDS = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout', 'opt-out'
]);
const START_WORDS = new Set(['start', 'yes', 'unstop', 'subscribe']);
const HELP_WORDS = new Set(['help', 'info']);

function normalizePhone(raw) {
  const trimmed = String(raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 11 && digits.startsWith('03')) return '+92' + digits.slice(1);
  if (digits.length === 12 && digits.startsWith('92')) return '+' + digits;
  if (trimmed.startsWith('+')) return '+' + digits;
  return '+' + digits;
}

function firstToken(body) {
  return String(body || '')
    .trim()
    .split(/[\s,]+/)[0]
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
}

function isStopKeyword(body) {
  return STOP_WORDS.has(firstToken(body));
}

function isStartKeyword(body) {
  return START_WORDS.has(firstToken(body));
}

function isHelpKeyword(body) {
  return HELP_WORDS.has(firstToken(body));
}

function hasLegalFooter(text) {
  return /reply stop/i.test(text) || /\bSTOP to\b/i.test(text);
}

function appendLegalFooter(body) {
  const text = String(body || '').trim();
  if (!text) return SMS_LEGAL_FOOTER;
  if (hasLegalFooter(text)) {
    if (/msg\s*&?\s*data rates/i.test(text)) return text;
    return `${text} Msg & data rates may apply.`;
  }
  return `${text}\n\n${SMS_LEGAL_FOOTER}`;
}

function helpReply() {
  return appendLegalFooter(
    `${COMPANY.name}: Dedicated fleet operations. Call ${COMPANY.phone} or email ${COMPANY.operationsEmail}.`
  );
}

function stopConfirmReply() {
  return `${COMPANY.name}: You are unsubscribed from SMS. No more texts. Call ${COMPANY.phone} if you still need us.`;
}

function startConfirmReply() {
  return appendLegalFooter(
    `${COMPANY.name}: You are opted in to operational texts. Reply YES if you want a Dedicated Operations Manager.`
  );
}

function isInvalidOrFakeNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits || digits.length < 10) return true;
  // All repeating digits (e.g. 0000000000, 1111111111, 5555555555, 9999999999)
  if (/^(\d)\1+$/.test(digits)) return true;
  // Sequential dummy test digits
  if (digits.includes('1234567890') || digits.includes('0123456789')) return true;
  // Fictitious 555 exchange numbers in NANP
  const tail = digits.slice(-10);
  if (tail.startsWith('555') || tail.slice(3, 6) === '555') return true;
  // In US NANP, valid area codes never start with 0 or 1
  if (digits.length === 10 && (digits[0] === '0' || digits[0] === '1')) return true;
  if (digits.length === 11 && digits[0] === '1' && (digits[1] === '0' || digits[1] === '1')) return true;
  return false;
}

module.exports = {
  SMS_LEGAL_FOOTER,
  normalizePhone,
  isInvalidOrFakeNumber,
  isStopKeyword,
  isStartKeyword,
  isHelpKeyword,
  appendLegalFooter,
  helpReply,
  stopConfirmReply,
  startConfirmReply
};
