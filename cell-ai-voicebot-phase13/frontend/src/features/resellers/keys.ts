import type { ResellerCustomersQuery } from '@/services/api/resellers';

/** Query keys (src/README.md convention). */
export const resellerKeys = {
  all: ['reseller'] as const,
  summary: ['reseller', 'summary'] as const,
  customers: (q: ResellerCustomersQuery) => ['reseller', 'customers', q] as const,
  customer: (id: string) => ['reseller', 'customer', id] as const,
  statement: (q: { from?: string; to?: string }) => ['reseller', 'statement', q] as const,
  settings: ['reseller', 'settings'] as const,
  provider: ['wallet', 'provider'] as const,
};
