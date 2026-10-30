import type { ContactsQuery } from '@/services/api/contacts';
import type { ContactFilter } from '@/services/api/types';

/** Query keys (src/README.md convention). */
export const contactKeys = {
  all: ['contacts'] as const,
  list: (query: ContactsQuery) => ['contacts', 'list', query] as const,
  search: (body: { filter: ContactFilter; page: number; limit: number; sort?: string }) =>
    ['contacts', 'search', body] as const,
  detail: (id: string) => ['contacts', 'detail', id] as const,
  tags: ['contacts', 'tags'] as const,
};

export const listKeys = {
  all: ['contact-lists'] as const,
  list: (query: { page?: number; limit?: number; q?: string }) =>
    ['contact-lists', 'list', query] as const,
};

export const segmentKeys = {
  all: ['segments'] as const,
  list: (withCounts: boolean) => ['segments', 'list', withCounts] as const,
  preview: (filter: ContactFilter) => ['segments', 'preview', filter] as const,
};

export const dndKeys = {
  all: ['dnd'] as const,
  list: (query: { page?: number; limit?: number; q?: string }) => ['dnd', 'list', query] as const,
};

export const fieldKeys = {
  all: ['custom-fields'] as const,
  list: (withUsage: boolean) => ['custom-fields', withUsage] as const,
};

export const importKeys = {
  all: ['contact-imports'] as const,
  list: (query: object) => ['contact-imports', 'list', query] as const,
  detail: (id: string) => ['contact-imports', 'detail', id] as const,
};

export const exportKeys = {
  all: ['contact-exports'] as const,
  list: (query: object) => ['contact-exports', 'list', query] as const,
  detail: (id: string) => ['contact-exports', 'detail', id] as const,
};
