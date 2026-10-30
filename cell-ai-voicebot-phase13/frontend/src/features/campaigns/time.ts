import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import type { CampaignWindow } from '@/services/api/types';

/** TRAI: commercial calls 09:00–21:00 (live campaigns). */
export const TRAI_BOUND = { start: '09:00', end: '21:00' } as const;
/** RBI recovery conduct: 08:00–19:00 (live recovery campaigns). */
export const RBI_RECOVERY_BOUND = { start: '08:00', end: '19:00' } as const;

/** ISO → `YYYY-MM-DDTHH:mm` for a `datetime-local` input, in `timezone`. */
export const toLocalInput = (iso: string | null | undefined, timezone: string): string =>
  iso ? format(new TZDate(new Date(iso).getTime(), timezone), "yyyy-MM-dd'T'HH:mm") : '';

/** `YYYY-MM-DDTHH:mm` typed in `timezone` → ISO (UTC); `null` when empty or invalid. */
export const fromLocalInput = (value: string, timezone: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(new TZDate(y, m - 1, d, h, min, timezone).getTime()).toISOString();
};

/** "Mon 21 Oct, 09:00" in `timezone`. */
export const formatInZone = (iso: string, timezone: string): string =>
  format(new TZDate(new Date(iso).getTime(), timezone), 'EEE d MMM, HH:mm');

/** Window ∩ window (days in both, the later start, the earlier end); `null` when empty. */
export const intersectWindows = (
  a: CampaignWindow,
  b: Pick<CampaignWindow, 'start' | 'end'> & { days?: number[] },
): CampaignWindow | null => {
  const days = b.days ? a.days.filter((d) => b.days?.includes(d)) : [...a.days];
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  if (!days.length || start >= end) return null;
  return { start, end, days };
};
