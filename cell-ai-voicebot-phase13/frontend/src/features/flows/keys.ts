import type { ListFlowsQuery, StatsQuery } from '@/services/api/flows';

/** Query keys (src/README.md convention). */
export const flowKeys = {
  all: ['flows'] as const,
  lists: ['flows', 'list'] as const,
  list: (query: ListFlowsQuery) => ['flows', 'list', query] as const,
  detail: (id: string) => ['flows', 'detail', id] as const,
  versions: (id: string) => ['flows', 'versions', id] as const,
  version: (id: string, version: number) => ['flows', 'version', id, version] as const,
  variables: (id: string) => ['flows', 'variables', id] as const,
  stats: (id: string, query: StatsQuery) => ['flows', 'stats', id, query] as const,
  templates: ['flows', 'templates'] as const,
  catalog: ['flows', 'catalog'] as const,
};

export const flowAudioKeys = {
  all: ['flow-audio'] as const,
  list: ['flow-audio', 'list'] as const,
};

export const simulationKeys = {
  all: ['flow-simulations'] as const,
  list: (flowId: string) => ['flow-simulations', 'list', flowId] as const,
  run: (flowId: string, runId: string) => ['flow-simulations', 'run', flowId, runId] as const,
};
