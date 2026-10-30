import type { AdminAccountsQuery } from '@/services/api/admin';

export const adminKeys = {
  all: ['admin'] as const,
  accounts: (query: AdminAccountsQuery) => ['admin', 'accounts', query] as const,
  account: (id: string) => ['admin', 'account', id] as const,
};
