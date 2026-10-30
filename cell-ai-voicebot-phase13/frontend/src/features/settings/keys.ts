import type { AuditQuery } from '@/services/api/audit';

export const settingsKeys = {
  account: ['settings', 'account'] as const,
  sessions: ['settings', 'sessions'] as const,
  apiKeys: ['settings', 'api-keys'] as const,
  audit: (query: Omit<AuditQuery, 'cursor'>) => ['settings', 'audit', query] as const,
};
