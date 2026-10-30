import type {
  AudiencePreviewInput,
  ListCampaignContactsQuery,
  ListCampaignsQuery,
} from '@/services/api/campaigns';

/** Query keys (src/README.md convention). */
export const campaignKeys = {
  all: ['campaigns'] as const,
  summary: ['campaigns', 'summary'] as const,
  lists: ['campaigns', 'list'] as const,
  list: (query: Omit<ListCampaignsQuery, 'cursor'>) => ['campaigns', 'list', query] as const,
  detail: (id: string) => ['campaigns', 'detail', id] as const,
  contacts: (id: string) => ['campaigns', 'contacts', id] as const,
  contactsList: (id: string, query: Omit<ListCampaignContactsQuery, 'cursor'>) =>
    ['campaigns', 'contacts', id, query] as const,
  runs: (id: string) => ['campaigns', 'runs', id] as const,
  estimate: (id: string) => ['campaigns', 'estimate', id] as const,
  preview: (body: AudiencePreviewInput | null) => ['campaigns', 'preview', body] as const,
};
