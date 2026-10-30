import { MICROS_PER_RUPEE, type ParseResult } from '@/utils/money';

/**
 * Meta's per-message rates have up to 4–6 decimals (₹0.8631), so rate inputs use
 * their own string math (no floats); wallet amounts keep `utils/money.ts`.
 */
const RATE = /^\d{1,6}(\.\d{0,6})?$/;

/** `863100` → `0.8631` (no ₹, trailing zeros trimmed, at least 2 decimals). */
export const formatRateInput = (micros: number): string => {
  const whole = Math.floor(micros / MICROS_PER_RUPEE);
  const fraction = String(micros % MICROS_PER_RUPEE)
    .padStart(6, '0')
    .replace(/0+$/, '')
    .padEnd(2, '0');
  return `${String(whole)}.${fraction}`;
};

/** `₹0.8631`. */
export const formatRate = (micros: number | null): string =>
  micros === null ? '—' : `₹${formatRateInput(micros)}`;

/** `"0.8631"` / `"₹1.5"` → micros (≤ 6 decimals). */
export const parseRateInput = (input: string): ParseResult => {
  const text = input.trim().replace(/^₹\s*/, '');
  if (!text) return { ok: false, message: 'Enter a price' };
  if (!RATE.test(text)) return { ok: false, message: 'Use a price like 0.8631' };
  const [whole = '0', fraction = ''] = text.split('.');
  return { ok: true, micros: Number(whole) * MICROS_PER_RUPEE + Number(fraction.padEnd(6, '0')) };
};

/** 1500 → `15%`, 1250 → `12.5%`. */
export const formatBpsPercent = (bps: number): string => `${String(bps / 100)}%`;

/** `"15"` / `"12.5"` → 1500 / 1250 bps (≤ 2 decimals, 0–1000 %). */
export const parsePercentInput = (input: string): ParseResult => {
  const text = input.trim().replace(/%$/, '');
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(text)) return { ok: false, message: 'Use a percent like 15' };
  const [whole = '0', fraction = ''] = text.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (bps > 100_000) return { ok: false, message: 'At most 1000%' };
  return { ok: true, micros: bps };
};

/** The current month as `YYYY-MM` in India. */
export const thisMonth = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .format(now)
    .slice(0, 7);

export const RATE_FIELDS = [
  ['marketingMicros', 'Marketing'],
  ['utilityMicros', 'Utility'],
  ['authenticationMicros', 'Authentication'],
  ['serviceMicros', 'Service'],
] as const;
