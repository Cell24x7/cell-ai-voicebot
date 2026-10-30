/** GSTIN checks (same rules as the API's `shared/gstin.ts`) — for instant form hints. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Check character of the first 14 characters (mod-36, weights 1 / 2 alternating). */
export const gstinCheckChar = (first14: string): string => {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = CHARSET.indexOf(first14.charAt(i)) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET.charAt((36 - (sum % 36)) % 36);
};

/** `null` when fine, else a message for the form. */
export const gstinHint = (value: string, stateCode?: string): string | null => {
  const gstin = value.trim().toUpperCase();
  if (!gstin) return null;
  if (!GSTIN_PATTERN.test(gstin)) return 'Not a valid GSTIN (15 characters, e.g. 08AABCD1234E1Z5)';
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin.charAt(14)) return 'GSTIN check digit is wrong';
  if (stateCode && gstin.slice(0, 2) !== stateCode) return 'GSTIN belongs to a different state';
  return null;
};

/** Latin letters only — the invoice PDF can't print Devanagari (mirrors the API). */
export const LATIN_TEXT = /^[A-Za-z0-9 .,\-/&()'#]+$/;
export const LATIN_MESSAGE = 'Use English letters, as on your GST registration';
