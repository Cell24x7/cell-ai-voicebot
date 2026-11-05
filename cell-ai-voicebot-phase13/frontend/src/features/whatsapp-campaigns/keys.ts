import type {
  ListWaCampaignsQuery,
  ListWaRecipientsQuery,
} from '@/services/api/whatsapp-campaigns';

/** Query keys for WhatsApp campaigns (src/README.md convention). */
export const waCampaignKeys = {
  all: ['whatsapp-campaigns'] as const,
  lists: ['whatsapp-campaigns', 'list'] as const,
  list: (query: ListWaCampaignsQuery) => ['whatsapp-campaigns', 'list', query] as const,
  detail: (id: string) => ['whatsapp-campaigns', 'detail', id] as const,
  estimate: (id: string) => ['whatsapp-campaigns', 'estimate', id] as const,
  report: (id: string) => ['whatsapp-campaigns', 'report', id] as const,
  recipientLists: (id: string) => ['whatsapp-campaigns', 'recipients', id] as const,
  recipients: (id: string, query: ListWaRecipientsQuery) =>
    ['whatsapp-campaigns', 'recipients', id, query] as const,
};
