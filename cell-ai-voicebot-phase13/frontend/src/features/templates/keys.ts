import type { ListTemplatesQuery } from '@/services/api/templates';

/** Query keys (src/README.md convention). Filters are part of the list key. */
export const templateKeys = {
  all: ['templates'] as const,
  lists: ['templates', 'list'] as const,
  list: (query: ListTemplatesQuery) => ['templates', 'list', query] as const,
  detail: (id: string) => ['templates', 'detail', id] as const,
  pricePreview: (key: readonly unknown[]) => ['whatsapp', 'price-preview', ...key] as const,
};

/** Superadmin WhatsApp billing keys. */
export const whatsappBillingKeys = {
  all: ['admin', 'whatsapp-billing'] as const,
  rates: ['admin', 'whatsapp-billing', 'rates'] as const,
  callingRates: ['admin', 'whatsapp-billing', 'calling-rates'] as const,
  settings: ['admin', 'whatsapp-billing', 'settings'] as const,
  margin: (month: string, accountId?: string) =>
    ['admin', 'whatsapp-billing', 'margin', month, accountId ?? 'all'] as const,
  reconciliation: (month: string, accountId?: string) =>
    ['admin', 'whatsapp-billing', 'reconciliation', month, accountId ?? 'all'] as const,
};
