import crypto from 'crypto';

// Base32 decode
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

// Generate standard 6-digit TOTP (RFC 6238)
export function generateTOTP(secret, stepSec = 30) {
  if (!secret) return '';
  try {
    const key = base32Decode(secret);
    if (key.length === 0) return '';
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / stepSec);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buf);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0x0f;
    const code = (
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
  } catch (err) {
    return '';
  }
}

export function getRemainingSeconds(stepSec = 30) {
  const epoch = Math.floor(Date.now() / 1000);
  return stepSec - (epoch % stepSec);
}
