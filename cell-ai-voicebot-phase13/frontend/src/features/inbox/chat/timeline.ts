import type { InboxMessage } from '@/services/api/types';

import { dayLabel } from '../format';

export type TimelineItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'unread'; key: string }
  | { kind: 'message'; key: string; message: InboxMessage };

/** How long a jumped-to message stays outlined. */
export const HIGHLIGHT_MS = 2_000;

/** Before any message: everything inbound is unread. */
export const NEVER_READ = '1970-01-01T00:00:00.000Z';

/**
 * Messages (oldest → newest) with date separators and one "Unread messages"
 * divider before the first inbound message after `unreadAfter` (null = none).
 * Keys use the clientId, so an optimistic bubble and its saved message are the
 * same row.
 */
export const buildTimeline = (
  messages: InboxMessage[],
  timezone: string,
  now: number,
  unreadAfter: string | null,
): TimelineItem[] => {
  const items: TimelineItem[] = [];
  const after = unreadAfter === null ? null : Date.parse(unreadAfter);
  let lastDay: string | null = null;
  let unreadPlaced = false;
  for (const m of messages) {
    const day = dayLabel(m.at, timezone, now);
    if (day !== lastDay) {
      items.push({ kind: 'day', key: `day-${m.id}`, label: day });
      lastDay = day;
    }
    if (!unreadPlaced && after !== null && m.direction === 'in' && Date.parse(m.at) > after) {
      items.push({ kind: 'unread', key: 'unread' });
      unreadPlaced = true;
    }
    items.push({ kind: 'message', key: m.clientId ?? m.id, message: m });
  }
  return items;
};
