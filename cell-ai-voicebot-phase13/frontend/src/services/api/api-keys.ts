import { apiClient, unwrap } from './client';
import type { ApiKey, CreatedApiKey, SuccessEnvelope } from './types';

/**
 * Scopes + descriptions. Keep in sync with backend `src/modules/api-keys/scopes.ts`
 * (the OpenAPI enum types the values).
 */
export const API_KEY_SCOPES = [
  { key: 'calls:read', description: 'Read call records and results' },
  { key: 'calls:write', description: 'Trigger calls' },
  { key: 'contacts:read', description: 'Read contacts' },
  { key: 'contacts:write', description: 'Create and update contacts' },
  { key: 'campaigns:read', description: 'Read campaigns and their status' },
  { key: 'campaigns:write', description: 'Create and control campaigns' },
  { key: 'webhooks:manage', description: 'Manage outbound webhooks' },
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]['key'];

/** `/api/v1/api-keys`. The full key only exists in the create response — never cache it. */
export const apiKeysApi = {
  list: () => unwrap(apiClient.get<SuccessEnvelope<ApiKey[]>>('/api-keys')),
  create: (body: { name: string; scopes: ApiKeyScope[] }) =>
    unwrap(apiClient.post<SuccessEnvelope<CreatedApiKey>>('/api-keys', body)),
  revoke: (id: string) => apiClient.delete(`/api-keys/${id}`).then(() => undefined),
};
