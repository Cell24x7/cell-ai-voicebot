import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** Absolute time in the account timezone (ADR 0017), e.g. "08 Oct 2026, 14:05". */
export const formatInAccountTz = (iso: string, timezone: string): string =>
  format(new TZDate(iso, timezone), 'dd MMM yyyy, HH:mm');

/** Today as `YYYY-MM-DD` in `timezone`. */
export const todayInTz = (timezone: string, now: Date = new Date()): string =>
  format(new TZDate(now, timezone), 'yyyy-MM-dd');

/** `YYYY-MM-DD` ± days (calendar arithmetic, no timezone involved). */
export const shiftYmd = (ymd: string, days: number): string => {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

/** Midnight of `YYYY-MM-DD` in `timezone` as an ISO instant (API date filters). */
export const startOfDayIso = (ymd: string, timezone: string): string => {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number);
  return new Date(new TZDate(y, m - 1, d, timezone).getTime()).toISOString();
};

/** Inclusive day count between two `YYYY-MM-DD` dates. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
