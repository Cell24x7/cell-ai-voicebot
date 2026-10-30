import type {
  WhatsAppCallHoliday,
  WhatsAppCallHours,
  WhatsAppCallHoursEntry,
} from '@/services/api/types';

/** Meta's call hours rules (same as the backend — shared cases in src/test/fixtures). */
export const CALL_HOURS_LIMITS = { entriesPerDayMax: 2, holidaysMax: 20 } as const;

export const WEEK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const satisfies readonly WhatsAppCallHoursEntry['day'][];

export const DAY_LABELS: Record<WhatsAppCallHoursEntry['day'], string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

export const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;

/** `0930` ⇄ `09:30` (the time input works in HH:mm). */
export const toInputTime = (hhmm: string): string =>
  HHMM.test(hhmm) ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : '';
export const fromInputTime = (value: string): string => value.replace(':', '');

/** Problems of a call hours set — exactly the backend's messages, in the same order. */
export const callHoursProblems = (
  hours: Pick<WhatsAppCallHours, 'weekly' | 'holidays'>,
): string[] => {
  const problems: string[] = [];
  for (const day of WEEK_DAYS) {
    const entries = hours.weekly.filter((e) => e.day === day);
    if (entries.length > CALL_HOURS_LIMITS.entriesPerDayMax) {
      problems.push(`At most ${String(CALL_HOURS_LIMITS.entriesPerDayMax)} time ranges on ${day}`);
    }
    const sorted = [...entries].sort((a, b) => a.open.localeCompare(b.open));
    for (const [i, e] of sorted.entries()) {
      if (e.open >= e.close)
        problems.push(`${day}: the opening time must be before the closing time`);
      const next = sorted[i + 1];
      if (next && next.open < e.close) problems.push(`${day}: time ranges overlap`);
    }
  }
  if (hours.holidays.length > CALL_HOURS_LIMITS.holidaysMax) {
    problems.push(`At most ${String(CALL_HOURS_LIMITS.holidaysMax)} holidays`);
  }
  const dates = new Set<string>();
  for (const h of hours.holidays) {
    if (h.start >= h.end) problems.push(`${h.date}: the start time must be before the end time`);
    if (dates.has(h.date)) problems.push(`${h.date} is listed twice`);
    dates.add(h.date);
  }
  return problems;
};

/** Editor-only checks the server makes too (a time that is not HHMM, a past holiday, none at all). */
export const callHoursFormProblems = (hours: WhatsAppCallHours, today: string): string[] => {
  const problems: string[] = [];
  const bad = (t: string) => !HHMM.test(t);
  if (
    hours.weekly.some((e) => bad(e.open) || bad(e.close)) ||
    hours.holidays.some((h) => bad(h.start) || bad(h.end))
  )
    problems.push('Every time needs hours and minutes');
  if (hours.enabled && hours.weekly.length === 0) problems.push('Add at least one time range');
  if (hours.holidays.some((h: WhatsAppCallHoliday) => h.date < today))
    problems.push('Holidays must be today or later');
  return [...problems, ...callHoursProblems(hours)];
};

/** Today's date (`YYYY-MM-DD`) in a time zone (holidays are in the number's zone). */
export const todayIn = (timeZone: string, now: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
};
