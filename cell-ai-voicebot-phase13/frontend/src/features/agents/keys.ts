import type { ListAgentsQuery } from '@/services/api/agents';

/** Query keys (src/README.md convention). */
export const agentKeys = {
  all: ['agents'] as const,
  lists: ['agents', 'list'] as const,
  list: (query: ListAgentsQuery) => ['agents', 'list', query] as const,
  detail: (id: string) => ['agents', 'detail', id] as const,
  usage: (id: string) => ['agents', 'usage', id] as const,
  templates: ['agents', 'templates'] as const,
  catalog: ['agents', 'catalog'] as const,
};

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  list: ['knowledge', 'list'] as const,
  detail: (id: string) => ['knowledge', 'detail', id] as const,
  sources: (id: string) => ['knowledge', 'sources', id] as const,
};

export const playgroundKeys = {
  all: ['playground'] as const,
  sessions: (agentId: string) => ['playground', 'sessions', agentId] as const,
  session: (agentId: string, sid: string) => ['playground', 'session', agentId, sid] as const,
};

export const adminAiKeys = {
  config: ['admin-ai', 'config'] as const,
};
