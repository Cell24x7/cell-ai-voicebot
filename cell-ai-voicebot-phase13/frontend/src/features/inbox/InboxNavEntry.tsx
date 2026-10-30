import { NavEntry, type NavEntryProps } from '@/layout/NavEntry';

import { useInboxSummary } from './summary';

/** The Inbox menu item with its live unread-conversations badge (lazy chunk). */
export function InboxNavEntry(props: Omit<NavEntryProps, 'count'>) {
  const count = useInboxSummary().data?.unreadConversations ?? 0;
  return <NavEntry {...props} count={count} />;
}
