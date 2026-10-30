/**
 * Money input helpers (ADR 0016): rupee text ⇄ integer micros using string
 * arithmetic only — no floats anywhere in a money path. Display formatting of
 * amounts stays in `utils/format.ts` (`formatCurrencyMicros`).
 */
export const MICROS_PER_RUPEE = 1_000_000;
export const MICROS_PER_PAISA = 10_000;

export type ParseResult = { ok: true; micros: number } | { ok: false; message: string };

export interface ParseOptions {
  /** Whole rupees only (top-ups). */
  wholeRupees?: boolean;
  /** Inclusive bounds in micros. */
  minMicros?: number;
  maxMicros?: number;
  /** Empty input allowed → 0 (optional fields such as budgets). */
  allowEmpty?: boolean;
}

/** Indian (`1,25,000`) or western (`125,000`) grouping, or none; up to 2 decimals. */
const RUPEES = /^(\d{1,3}(,\d{2})*,\d{3}|\d{1,3}(,\d{3})*|\d+)(\.\d{0,2})?$/;

const groupIndian = (digits: string): string => {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  return `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
};

/** Micros → `1,25,000` / `1,25,000.50` for an input box (no ₹, rounded to paise, Indian grouping). */
export const formatRupeesInput = (micros: number): string => {
  const sign = micros < 0 ? '-' : '';
  const paise = Math.round(Math.abs(micros) / MICROS_PER_PAISA);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `${sign}${groupIndian(String(rupees))}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
};

/** `"1,25,000.5"` / `"₹ 500"` → micros, validated. */
export const parseRupeesInput = (input: string, options: ParseOptions = {}): ParseResult => {
  const text = input.trim().replace(/^₹\s*/, '');
  if (!text) {
    return options.allowEmpty ? { ok: true, micros: 0 } : { ok: false, message: 'Enter an amount' };
  }
  if (!RUPEES.test(text)) {
    return { ok: false, message: 'Enter an amount like 1,500 or 1500.50' };
  }
  const [whole = '0', fraction = ''] = text.replace(/,/g, '').split('.');
  if (options.wholeRupees && /[1-9]/.test(fraction)) {
    return { ok: false, message: 'Whole rupees only' };
  }
  // ≤ 9 rupee digits (₹99 crore) keeps whole × 1,000,000 a safe integer
  if (whole.replace(/^0+/, '').length > 9) return { ok: false, message: 'Amount is too large' };
  const micros =
    Number(whole) * MICROS_PER_RUPEE + Number(fraction.padEnd(2, '0')) * MICROS_PER_PAISA;
  if (options.minMicros !== undefined && micros < options.minMicros) {
    return { ok: false, message: `Minimum is ${formatRupeeLabel(options.minMicros)}` };
  }
  if (options.maxMicros !== undefined && micros > options.maxMicros) {
    return { ok: false, message: `Maximum is ${formatRupeeLabel(options.maxMicros)}` };
  }
  return { ok: true, micros };
};

/** `₹1,25,000` (whole) / `₹12.50` — short labels for limits and presets. */
export const formatRupeeLabel = (micros: number): string => `₹${formatRupeesInput(micros)}`;

/** `micros × bps / 10,000` rounded half up to whole paise (GST lines). */
const percentToPaise = (micros: number, bps: number): number => {
  const paise = Math.round(micros / MICROS_PER_PAISA);
  return Math.floor((2 * paise * bps + 10_000) / 20_000) * MICROS_PER_PAISA;
};

export interface GstPreview {
  baseMicros: number;
  cgstMicros: number;
  sgstMicros: number;
  igstMicros: number;
  taxMicros: number;
  totalMicros: number;
  intraState: boolean;
}

/** 18 % GST on a top-up — CGST 9 + SGST 9 in the seller's state, else IGST 18 (same rule as the API). */
export const gstPreview = (
  baseMicros: number,
  sellerStateCode: string,
  buyerStateCode: string,
): GstPreview => {
  const intraState = sellerStateCode === buyerStateCode;
  const cgstMicros = intraState ? percentToPaise(baseMicros, 900) : 0;
  const sgstMicros = cgstMicros;
  const igstMicros = intraState ? 0 : percentToPaise(baseMicros, 1800);
  const taxMicros = cgstMicros + sgstMicros + igstMicros;
  return {
    baseMicros,
    cgstMicros,
    sgstMicros,
    igstMicros,
    taxMicros,
    totalMicros: baseMicros + taxMicros,
    intraState,
  };
};

/** Basis points → `10%` / `2.5%`. */
export const formatBps = (bps: number): string => {
  const whole = Math.floor(bps / 100);
  const rest = bps % 100;
  return `${whole}${rest ? `.${String(rest).padStart(2, '0').replace(/0$/, '')}` : ''}%`;
};

/** `"10"` / `"2.5"` (percent) → bps, or null. */
export const parsePercentToBps = (input: string): number | null => {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bps <= 10_000 ? bps : null;
};

/** Top-up limits (mirror backend BILLING_LIMITS). */
export const TOPUP_MIN_MICROS = 100 * MICROS_PER_RUPEE;
export const TOPUP_MAX_MICROS = 500_000 * MICROS_PER_RUPEE;
export const TOPUP_PRESETS_MICROS = [500, 1000, 2000, 5000].map((r) => r * MICROS_PER_RUPEE);
