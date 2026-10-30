import type { LedgerQuery } from '@/services/api/wallet';

/** Query keys (src/README.md convention). */
export const walletKeys = {
  all: ['wallet'] as const,
  wallet: ['wallet', 'current'] as const,
  rates: ['wallet', 'rates'] as const,
  ledger: (query: Omit<LedgerQuery, 'cursor'>) => ['wallet', 'ledger', query] as const,
  ledgerAll: ['wallet', 'ledger'] as const,
  ledgerEntry: (id: string) => ['wallet', 'ledger-entry', id] as const,
  usage: (query: { from?: string; to?: string }) => ['wallet', 'usage', query] as const,
  usageAll: ['wallet', 'usage'] as const,
  topup: (id: string) => ['wallet', 'topup', id] as const,
};

export const billingKeys = {
  profile: ['billing', 'profile'] as const,
  states: ['billing', 'states'] as const,
};

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (query: { page?: number; limit?: number }) => ['invoices', 'list', query] as const,
};

export const notificationKeys = {
  all: ['notifications'] as const,
  unread: ['notifications', 'unread-count'] as const,
  latest: ['notifications', 'latest'] as const,
};

export const adminBillingKeys = {
  all: ['admin-billing'] as const,
  config: ['admin-billing', 'config'] as const,
  defaultCard: ['admin-billing', 'default-card'] as const,
  defaultHistory: ['admin-billing', 'default-history'] as const,
  accountCards: (id: string) => ['admin-billing', 'account-cards', id] as const,
  wallet: (id: string) => ['admin-billing', 'wallet', id] as const,
  ledger: (id: string, query: object) => ['admin-billing', 'ledger', id, query] as const,
  ledgerAll: (id: string) => ['admin-billing', 'ledger', id] as const,
  summary: (month: string) => ['admin-billing', 'summary', month] as const,
  payments: (query: object) => ['admin-billing', 'payments', query] as const,
  paymentEvents: (query: object) => ['admin-billing', 'payment-events', query] as const,
};
