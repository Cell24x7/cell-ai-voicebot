import type { ListCallsQuery } from '@/services/api/calls';

/** Query keys (src/README.md convention). */
export const callKeys = {
  all: ['calls'] as const,
  lists: ['calls', 'list'] as const,
  list: (query: ListCallsQuery) => ['calls', 'list', query] as const,
  active: ['calls', 'active'] as const,
  detail: (id: string) => ['calls', 'detail', id] as const,
  transcript: (id: string) => ['calls', 'transcript', id] as const,
  events: (id: string) => ['calls', 'events', id] as const,
  recording: (id: string) => ['calls', 'recording', id] as const,
};
