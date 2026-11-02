import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The current 6-digit code for a base32 setup key (RFC 6238, SHA-1, 30 s). */
export function totpCode(setupKey: string, now = Date.now()): string {
  const bits = [...setupKey.replace(/[\s=]/g, '').toUpperCase()]
    .map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const bytes = (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const at = (mac[mac.length - 1] ?? 0) & 0xf;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
