const crypto = require('crypto');

function keyBytes() {
  const raw = process.env.ELD_TOKEN_KEY || process.env.JWT_SECRET || 'dev-eld-token-key';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encryptSecret(plain) {
  const text = String(plain || '');
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(blob) {
  if (!blob) return null;
  const buf = Buffer.from(String(blob), 'base64');
  if (buf.length < 29) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function hashWebhookSecret(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hmacSha256Hex(secret, body) {
  return crypto.createHmac('sha256', String(secret || '')).update(body).digest('hex');
}

module.exports = {
  encryptSecret,
  decryptSecret,
  hashWebhookSecret,
  timingSafeEqual,
  hmacSha256Hex
};
