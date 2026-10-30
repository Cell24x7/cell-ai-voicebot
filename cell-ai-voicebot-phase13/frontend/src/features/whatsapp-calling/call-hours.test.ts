import { describe, expect, it } from 'vitest';

import type { WhatsAppCallHours } from '@/services/api/types';
import shared from '@/test/fixtures/call-hours-cases.json';

import {
  callHoursFormProblems,
  callHoursProblems,
  fromInputTime,
  toInputTime,
  todayIn,
} from './call-hours';

type Case = {
  name: string;
  input: Pick<WhatsAppCallHours, 'weekly' | 'holidays'>;
  problems: string[];
};

/** The same cases run against the backend validator (tests/fixtures/call-hours-cases.json). */
describe('call hours rules (shared with the backend)', () => {
  const cases = shared.cases as Case[];
  it('has the shared cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
  });
  for (const c of cases) {
    it(c.name, () => {
      expect(callHoursProblems(c.input)).toEqual(c.problems);
    });
  }
});

describe('call hours editor checks', () => {
  const hours = (over: Partial<WhatsAppCallHours> = {}): WhatsAppCallHours => ({
    enabled: true,
    timezone: 'Asia/Kolkata',
    weekly: [{ day: 'MONDAY', open: '0900', close: '1800' }],
    holidays: [],
    ...over,
  });

  it('needs a range when on, full times, and holidays from today', () => {
    expect(callHoursFormProblems(hours(), '2030-01-01')).toEqual([]);
    expect(callHoursFormProblems(hours({ weekly: [] }), '2030-01-01')).toEqual([
      'Add at least one time range',
    ]);
    expect(callHoursFormProblems(hours({ enabled: false, weekly: [] }), '2030-01-01')).toEqual([]);
    expect(
      callHoursFormProblems(
        hours({ weekly: [{ day: 'MONDAY', open: '09', close: '1800' }] }),
        '2030-01-01',
      ),
    ).toContain('Every time needs hours and minutes');
    expect(
      callHoursFormProblems(
        hours({ holidays: [{ date: '2029-12-31', start: '0000', end: '2359' }] }),
        '2030-01-01',
      ),
    ).toEqual(['Holidays must be today or later']);
  });

  it('converts HHMM ⇄ the time input and reads today in a zone', () => {
    expect(toInputTime('0930')).toBe('09:30');
    expect(toInputTime('930')).toBe('');
    expect(fromInputTime('18:05')).toBe('1805');
    expect(todayIn('Asia/Kolkata', new Date('2030-01-01T20:00:00Z'))).toBe('2030-01-02');
    expect(todayIn('Not/AZone', new Date('2030-01-01T20:00:00Z'))).toBe('2030-01-01');
  });
});
