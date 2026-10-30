import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserTimezone, currentTimezoneName, timezoneOptions } from './timezone';

afterEach(() => vi.restoreAllMocks());

describe('timezone names', () => {
  it('maps legacy ICU names to current IANA names', () => {
    expect(currentTimezoneName('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(currentTimezoneName('Europe/Kiev')).toBe('Europe/Kyiv');
    expect(currentTimezoneName('Asia/Dubai')).toBe('Asia/Dubai');
  });

  it('lists current names, sorted and unique', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['UTC', 'Asia/Calcutta', 'Asia/Kolkata']);
    expect(timezoneOptions()).toEqual(['Asia/Kolkata', 'UTC']);
  });

  it('falls back when Intl is unavailable', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new Error('x');
    });
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('x');
    });
    expect(timezoneOptions()).toEqual(['Asia/Kolkata', 'UTC']);
    expect(browserTimezone()).toBe('Asia/Kolkata');
  });

  it("uses the browser's zone by its current name", () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Asia/Calcutta' }),
    } as Intl.DateTimeFormat);
    expect(browserTimezone()).toBe('Asia/Kolkata');
  });
});
