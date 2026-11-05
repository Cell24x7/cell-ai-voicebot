/** ₹ text → micros (two decimals); null when not a positive amount. */
export const rupeesToMicros = (text: string): number | null => {
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) * 10_000;
};

/** A password the reseller can copy (letters + digits, 14 chars, no look-alikes). */
export const generatePassword = (): string => {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};
