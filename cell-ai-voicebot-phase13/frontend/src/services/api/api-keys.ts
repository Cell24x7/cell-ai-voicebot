import { apiClient, unwrap } from './client';
import type { ApiKey, ApiRequestLog, CreatedApiKey, SuccessEnvelope } from './types';

/**
 * Scopes, groups + descriptions. Keep in sync with backend
 * `src/modules/api-keys/scopes.ts` (`GET /api-keys/scopes` serves the same list).
 */
export const API_KEY_SCOPES = [
  { key: 'calls:read', group: 'Calls', description: 'Read call records and results' },
  { key: 'calls:write', group: 'Calls', description: 'Trigger calls' },
  {
    key: 'whatsapp-calls:write',
    group: 'Calls',
    description: 'Start WhatsApp calls with an AI agent',
  },
  { key: 'contacts:read', group: 'Contacts', description: 'Read contacts' },
  { key: 'contacts:write', group: 'Contacts', description: 'Create and update contacts' },
  { key: 'campaigns:read', group: 'Campaigns', description: 'Read campaigns and their status' },
  { key: 'campaigns:write', group: 'Campaigns', description: 'Create and control campaigns' },
  {
    key: 'messages:read',
    group: 'WhatsApp',
    description: 'Read WhatsApp messages sent by the API',
  },
  {
    key: 'messages:write',
    group: 'WhatsApp',
    description: 'Send WhatsApp messages and templates',
  },
  { key: 'templates:read', group: 'WhatsApp', description: 'Read approved WhatsApp templates' },
  { key: 'reports:read', group: 'Reports', description: 'Read report numbers' },
  { key: 'exports:write', group: 'Reports', description: 'Create and download exports' },
  { key: 'webhooks:manage', group: 'Webhooks', description: 'Manage outbound webhooks' },
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]['key'];
export const SCOPE_GROUPS = [
  'Calls',
  'Contacts',
  'Campaigns',
  'WhatsApp',
  'Reports',
  'Webhooks',
] as const;

export interface ApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
  /** IPs / CIDR ranges; empty = any. */
  ipAllowlist?: string[];
  /** ISO time, or null = never. */
  expiresAt?: string | null;
}

export interface KeyRequestsPage {
  items: ApiRequestLog[];
  nextCursor: string | null;
}

/** `/api/v1/api-keys`. The full key only exists in the create response — never cache it. */
export const apiKeysApi = {
  list: () => unwrap(apiClient.get<SuccessEnvelope<ApiKey[]>>('/api-keys')),
  create: (body: ApiKeyInput) =>
    unwrap(apiClient.post<SuccessEnvelope<CreatedApiKey>>('/api-keys', body)),
  update: (id: string, body: Partial<ApiKeyInput>) =>
    unwrap(apiClient.patch<SuccessEnvelope<ApiKey>>(`/api-keys/${id}`, body)),
  revoke: (id: string) => apiClient.delete(`/api-keys/${id}`).then(() => undefined),
  requests: (id: string, cursor?: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<KeyRequestsPage>>(`/api-keys/${id}/requests`, {
        params: { limit: 50, ...(cursor ? { cursor } : {}) },
      }),
    ),
  /** "Test a key": `whoami` with a pasted key (sent once, never stored). */
  whoami: (key: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<{ accountId: string; apiKeyId: string; scopes: string[] }>>(
        '/api-keys/whoami',
        { headers: { 'X-API-Key': key } },
      ),
    ),
};
