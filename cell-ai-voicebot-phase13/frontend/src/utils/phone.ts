import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/**
 * Client-side phone check (same rules as the server's `normalizePhone`, which
 * stays the authority): any typed format → E.164, or undefined when invalid.
 */
export const toE164 = (raw: string, country: CountryCode = 'IN'): string | undefined => {
  const text = raw.trim().replace(/^'+/, '');
  if (!text || /[a-z]/i.test(text)) return undefined;
  let compact = text.replace(/\(0\)/g, '').replace(/[\s\-.()/]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  for (const candidate of compact.startsWith('+') ? [compact] : [compact, `+${compact}`]) {
    const parsed = candidate.startsWith('+')
      ? parsePhoneNumberFromString(candidate)
      : parsePhoneNumberFromString(candidate, country);
    if (parsed?.isValid()) return parsed.number;
  }
  return undefined;
};

export const isValidPhone = (raw: string, country: CountryCode = 'IN'): boolean =>
  toE164(raw, country) !== undefined;

/** `+919876543210` → `+91 98765 43210` (international, readable). */
export const formatPhone = (e164: string): string =>
  parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
