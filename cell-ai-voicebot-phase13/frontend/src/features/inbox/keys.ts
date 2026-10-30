import type { ListConversationsQuery } from '@/services/api/inbox';

/** Query keys (src/README.md convention). Filters / search are part of the list key. */
export const inboxKeys = {
  all: ['inbox'] as const,
  config: ['inbox', 'config'] as const,
  summary: ['inbox', 'summary'] as const,
  settings: ['inbox', 'settings'] as const,
  lists: ['inbox', 'conversations'] as const,
  list: (query: Omit<ListConversationsQuery, 'cursor'>) =>
    ['inbox', 'conversations', query] as const,
  conversation: (id: string) => ['inbox', 'conversation', id] as const,
  /** Every message page set of a conversation (latest + jumps). */
  messagesOf: (id: string) => ['inbox', 'messages', id] as const,
  /** `around` = jumped to a quoted message; `null` = the latest page. */
  messages: (id: string, around: string | null = null) =>
    ['inbox', 'messages', id, around ?? 'latest'] as const,
  contacts: ['inbox', 'contact'] as const,
  contact: (id: string) => ['inbox', 'contact', id] as const,
  mediaLink: (messageId: string) => ['inbox', 'media', messageId] as const,
};
