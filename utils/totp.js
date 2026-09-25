const crypto = require('crypto');

/**
 * Standard RFC 6238 TOTP Engine for Google Authenticator & Microsoft Authenticator
 * Fully standalone - 0 external dependencies
 */

function generateBase32Secret(length = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    secret += chars[bytes[i] % chars.length];
  }
  return secret;
}

function decodeBase32(base32Str) {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = String(base32Str || '').toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  for (let i = 0; i < clean.length; i++) {
    const val = base32chars.indexOf(clean.charAt(i));
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const keyBytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    keyBytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(keyBytes);
}

function computeTotp(base32Secret, timeOffset = 0) {
  const keyBuffer = decodeBase32(base32Secret);
  const epoch = Math.floor(Date.now() / 1000) + timeOffset;
  const currentStep = Math.floor(epoch / 30);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(currentStep));
  const hmac = crypto.createHmac('sha1', keyBuffer).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}

function verifyTotp(base32Secret, code, window = 1) {
  if (!base32Secret || !code) return false;
  const cleanCode = String(code).trim().replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const generated = computeTotp(base32Secret, errorWindow * 30);
    if (generated === cleanCode) {
      return true;
    }
  }
  return false;
}

function getOtpAuthUrl(secret, email, issuer = 'ShippingWish SuperAdmin') {
  const cleanEmail = encodeURIComponent(email);
  const cleanIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateBase32Secret,
  computeTotp,
  verifyTotp,
  getOtpAuthUrl
};
