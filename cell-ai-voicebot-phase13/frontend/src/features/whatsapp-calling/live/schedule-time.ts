import { TZDate } from '@date-fns/tz';

/** `YYYY-MM-DDTHH:mm` (a datetime-local value) of `at` in the timezone. */
export const localInputOf = (at: Date, timeZone: string): string => {
  const z = new TZDate(at.getTime(), timeZone);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(z.getFullYear())}-${p(z.getMonth() + 1)}-${p(z.getDate())}T${p(z.getHours())}:${p(z.getMinutes())}`;
};

/** A datetime-local value read in the timezone → the instant. */
export const instantOf = (value: string, timeZone: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, timeZone).getTime());
};

/** When, in the account timezone. */
export const dueText = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
