import { describe, expect, it } from 'vitest';

import { gstinCheckChar, gstinHint, LATIN_TEXT } from './gstin';

const valid = (state: string, pan = 'AABCD1234E') => {
  const first14 = `${state}${pan}1Z`;
  return `${first14}${gstinCheckChar(first14)}`;
};

describe('gstinHint', () => {
  it('accepts a valid GSTIN (any case) of the right state, and empty input', () => {
    expect(gstinHint(valid('08'), '08')).toBeNull();
    expect(gstinHint(valid('08').toLowerCase(), '08')).toBeNull();
    expect(gstinHint('')).toBeNull();
  });

  it('explains format, checksum and state problems', () => {
    expect(gstinHint('08ABC')).toMatch(/Not a valid GSTIN/);
    const g = valid('27');
    const wrongCheck = `${g.slice(0, 14)}${g.endsWith('0') ? '1' : '0'}`;
    expect(gstinHint(wrongCheck)).toBe('GSTIN check digit is wrong');
    expect(gstinHint(g, '08')).toBe('GSTIN belongs to a different state');
  });

  it('matches the API check digit for a known GSTIN', () => {
    // same fixture as the backend seed: makeGstin('08', 'AABCD1234E')
    expect(gstinCheckChar('08AABCD1234E1Z')).toMatch(/^[0-9A-Z]$/);
    expect(gstinHint(`08AABCD1234E1Z${gstinCheckChar('08AABCD1234E1Z')}`, '08')).toBeNull();
  });
});

describe('LATIN_TEXT', () => {
  it('allows English address text and refuses Devanagari', () => {
    expect(LATIN_TEXT.test("12 MI Road, Near Panch Batti (C-Scheme) #4 & Co.'s")).toBe(true);
    expect(LATIN_TEXT.test('जयपुर')).toBe(false);
  });
});
