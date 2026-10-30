import type { TeamQuery } from '@/services/api/team';

export const teamKeys = {
  all: ['team'] as const,
  list: (query: TeamQuery) => ['team', 'list', query] as const,
};
