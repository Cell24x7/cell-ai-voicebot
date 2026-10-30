import type { FieldType } from '@/services/api/types';

const MICROS = 1_000_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const rupeeFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 });

/** Integer micros → `₹12,500.10` (Indian grouping, ADR 0016). */
export const formatCurrencyMicros = (micros: number): string => rupeeFormat.format(micros / MICROS);

/** Integer micros → `12500.10` / `12500` for form inputs (exact to the paisa). */
export const microsToRupees = (micros: number): string => {
  const sign = micros < 0 ? '-' : '';
  const abs = Math.abs(micros);
  const rupees = Math.trunc(abs / MICROS);
  const paise = Math.round((abs % MICROS) / 10_000);
  return paise ? `${sign}${rupees}.${String(paise).padStart(2, '0')}` : `${sign}${rupees}`;
};

/** `2026-10-05` → `05 Oct 2026` — date only, never shifted by a timezone. */
export const formatDateOnly = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3] ?? ''} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1] ?? ''}`;
};

export const formatNumber = (n: number): string => numberFormat.format(n);

/** A stored variable value for display (currency micros, date-only, numbers en-IN). */
export const formatFieldValue = (
  type: FieldType,
  value: string | number | null | undefined,
  formatPhone: (e164: string) => string = (p) => p,
): string => {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency':
      return typeof value === 'number' ? formatCurrencyMicros(value) : String(value);
    case 'number':
      return typeof value === 'number' ? formatNumber(value) : String(value);
    case 'date':
      return formatDateOnly(String(value));
    case 'phone':
      return formatPhone(String(value));
    default:
      return String(value);
  }
};

/** A stored value → the text a form input shows (currency in rupees). */
export const fieldInputValue = (type: FieldType, value: string | number | undefined): string => {
  if (value === undefined) return '';
  if (type === 'currency' && typeof value === 'number') return microsToRupees(value);
  return String(value);
};

/** Bytes → `500 B` / `2 KB` / `3.0 MB`. */
export const formatBytes = (n: number): string =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;
