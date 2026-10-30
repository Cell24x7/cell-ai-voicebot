import { describe, expect, it } from 'vitest';

import {
  formatBps,
  formatRupeeLabel,
  formatRupeesInput,
  gstPreview,
  parsePercentToBps,
  parseRupeesInput,
  TOPUP_MAX_MICROS,
  TOPUP_MIN_MICROS,
} from './money';

const R = 1_000_000;

describe('parseRupeesInput', () => {
  it.each([
    ['1500', 1500 * R],
    ['1,500', 1500 * R],
    ['1,25,000', 125_000 * R],
    ['125,000', 125_000 * R],
    ['1,25,000.50', 125_000 * R + 500_000],
    ['0.5', 500_000],
    ['0.05', 50_000],
    ['12.', 12 * R],
    ['₹ 500', 500 * R],
    ['₹500.99', 500 * R + 990_000],
    ['  7  ', 7 * R],
    ['999999999', 999_999_999 * R],
  ])('%s → %d micros', (input, micros) => {
    expect(parseRupeesInput(input)).toEqual({ ok: true, micros });
  });

  it.each([
    ['', 'Enter an amount'],
    ['abc', 'Enter an amount like 1,500 or 1500.50'],
    ['1.234', 'Enter an amount like 1,500 or 1500.50'],
    ['-5', 'Enter an amount like 1,500 or 1500.50'],
    ['1,2,3', 'Enter an amount like 1,500 or 1500.50'],
    ['1e5', 'Enter an amount like 1,500 or 1500.50'],
    ['1000000000', 'Amount is too large'],
  ])('refuses %j', (input, message) => {
    expect(parseRupeesInput(input)).toEqual({ ok: false, message });
  });

  it('applies whole-rupee and min / max rules', () => {
    const top = { wholeRupees: true, minMicros: TOPUP_MIN_MICROS, maxMicros: TOPUP_MAX_MICROS };
    expect(parseRupeesInput('100.50', top)).toEqual({ ok: false, message: 'Whole rupees only' });
    expect(parseRupeesInput('100.00', top)).toEqual({ ok: true, micros: 100 * R });
    expect(parseRupeesInput('99', top)).toEqual({ ok: false, message: 'Minimum is ₹100' });
    expect(parseRupeesInput('5,00,001', top)).toEqual({
      ok: false,
      message: 'Maximum is ₹5,00,000',
    });
  });

  it('treats empty as 0 when allowed', () => {
    expect(parseRupeesInput(' ', { allowEmpty: true })).toEqual({ ok: true, micros: 0 });
  });
});

describe('formatRupeesInput / formatRupeeLabel', () => {
  it.each([
    [0, '0'],
    [1500 * R, '1,500'],
    [125_000 * R + 500_000, '1,25,000.50'],
    [12_345_678 * R, '1,23,45,678'],
    [-2 * R - 50_000, '-2.05'],
    [1_234, '0'],
  ])('%d → %s', (micros, text) => {
    expect(formatRupeesInput(micros)).toBe(text);
  });

  it('round-trips through the parser', () => {
    for (const micros of [0, 5 * R, 99 * R + 990_000, 1_00_000 * R + 10_000]) {
      expect(parseRupeesInput(formatRupeesInput(micros))).toEqual({ ok: true, micros });
    }
  });

  it('labels with ₹', () => {
    expect(formatRupeeLabel(500_000 * R)).toBe('₹5,00,000');
  });
});

describe('gstPreview', () => {
  it('splits CGST + SGST within the seller state', () => {
    expect(gstPreview(1000 * R, '08', '08')).toEqual({
      baseMicros: 1000 * R,
      cgstMicros: 90 * R,
      sgstMicros: 90 * R,
      igstMicros: 0,
      taxMicros: 180 * R,
      totalMicros: 1180 * R,
      intraState: true,
    });
  });

  it('uses IGST across states and rounds to paise like the API', () => {
    expect(gstPreview(999 * R, '08', '27')).toMatchObject({
      igstMicros: 179_820_000,
      taxMicros: 179_820_000,
      totalMicros: 1_178_820_000,
      intraState: false,
    });
    // ₹1,234 intra → 9 % = ₹111.06 each
    expect(gstPreview(1234 * R, '27', '27')).toMatchObject({
      cgstMicros: 111_060_000,
      sgstMicros: 111_060_000,
    });
    // half-paisa rounds up: 9 % of ₹0.05 = 0.45 paise → 0; of ₹0.17 = 1.53 → 2 paise
    expect(gstPreview(170_000, '08', '08').cgstMicros).toBe(20_000);
  });
});

describe('percent ⇄ basis points', () => {
  it.each([
    [0, '0%'],
    [1000, '10%'],
    [250, '2.5%'],
    [205, '2.05%'],
    [10_000, '100%'],
  ])('%d bps → %s', (bps, text) => {
    expect(formatBps(bps)).toBe(text);
  });

  it.each([
    ['10', 1000],
    ['2.5', 250],
    ['2.05', 205],
    ['100', 10_000],
    ['0', 0],
  ])('%s %% → %d bps', (input, bps) => {
    expect(parsePercentToBps(input)).toBe(bps);
  });

  it.each(['101', '-1', '1.234', 'ten', ''])('refuses %j', (input) => {
    expect(parsePercentToBps(input)).toBeNull();
  });
});
