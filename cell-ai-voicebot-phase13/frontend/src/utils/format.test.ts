import { describe, expect, it } from 'vitest';

import {
  fieldInputValue,
  formatCurrencyMicros,
  formatDateOnly,
  formatFieldValue,
  formatNumber,
  microsToRupees,
} from './format';
import { formatPhone, isValidPhone, toE164 } from './phone';

describe('format', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatCurrencyMicros(12_500_100_000)).toBe('₹12,500.10');
    expect(formatCurrencyMicros(125_000_000_000)).toBe('₹1,25,000.00');
    expect(formatCurrencyMicros(-500_000_000)).toBe('-₹500.00');
  });

  it('converts micros back to form values exactly', () => {
    expect(microsToRupees(12_500_100_000)).toBe('12500.10');
    expect(microsToRupees(12_500_000_000)).toBe('12500');
    expect(microsToRupees(10_000)).toBe('0.01');
    expect(microsToRupees(-505_000_000)).toBe('-505');
  });

  it('formats date-only values from the string (no Date, so no timezone shift)', () => {
    expect(formatDateOnly('2026-10-05')).toBe('05 Oct 2026');
    expect(formatDateOnly('2026-01-31')).toBe('31 Jan 2026');
    expect(formatDateOnly('5 Oct')).toBe('5 Oct');
  });

  it('formats numbers and every field type', () => {
    expect(formatNumber(1250000)).toBe('12,50,000');
    expect(formatFieldValue('currency', 1_000_000)).toBe('₹1.00');
    expect(formatFieldValue('currency', 'x')).toBe('x');
    expect(formatFieldValue('number', 45)).toBe('45');
    expect(formatFieldValue('number', '45')).toBe('45');
    expect(formatFieldValue('date', '2026-10-05')).toBe('05 Oct 2026');
    expect(formatFieldValue('phone', '+919876543210', formatPhone)).toBe('+91 98765 43210');
    expect(formatFieldValue('phone', '+919876543210')).toBe('+919876543210');
    expect(formatFieldValue('text', 'Pune')).toBe('Pune');
    expect(formatFieldValue('text', null)).toBe('—');
    expect(formatFieldValue('text', '')).toBe('—');
    expect(formatFieldValue('text', undefined)).toBe('—');
    expect(fieldInputValue('currency', 12_500_500_000)).toBe('12500.50');
    expect(fieldInputValue('date', '2026-10-05')).toBe('2026-10-05');
    expect(fieldInputValue('number', 3)).toBe('3');
    expect(fieldInputValue('text', undefined)).toBe('');
  });
});

describe('phone', () => {
  it.each([
    ['098765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['0091 98765 43210', '+919876543210'],
    ["'9876543210", '+919876543210'],
    ['+1 415 555 2671', '+14155552671'],
  ])('%s → %s', (raw, e164) => {
    expect(toE164(raw)).toBe(e164);
    expect(isValidPhone(raw)).toBe(true);
  });

  it.each(['', '12345', 'call me', '9.87654E+09'])('%j is invalid', (raw) => {
    expect(toE164(raw)).toBeUndefined();
  });

  it('formats E.164 for display', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('not-a-phone')).toBe('not-a-phone');
    expect(toE164('020 7946 0958', 'GB')).toBe('+442079460958');
  });
});
