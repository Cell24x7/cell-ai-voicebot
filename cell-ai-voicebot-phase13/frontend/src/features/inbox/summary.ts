import { useQuery, useQueryClient } from '@tanstack/react-query';

import { inboxApi } from '@/services/api/inbox';
import type { InboxSummary } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';

import { inboxKeys } from './keys';

/** Fallback refresh of the counts while live updates are off. */
export const INBOX_SUMMARY_POLL_MS = 60_000;

/**
 * Unread totals for the nav badge + dashboard card (kept small: it is in the
 * main bundle). Live from `inbox.summary.updated`; 503 (WhatsApp off) stays silent.
 */
export const useInboxSummary = (enabled = true) => {
  const client = useQueryClient();
  useWsEvent('inbox.summary.updated', (event) => {
    client.setQueryData<InboxSummary>(inboxKeys.summary, (s) =>
      s ? { ...s, unreadConversations: event.data.unreadConversations } : s,
    );
    // "assigned to me" is per user — the event only carries the account count
    void client.invalidateQueries({ queryKey: inboxKeys.summary });
  });
  return useQuery({
    queryKey: inboxKeys.summary,
    queryFn: inboxApi.summary,
    enabled,
    refetchInterval: INBOX_SUMMARY_POLL_MS,
    meta: { silent: true },
  });
};
