import { apiClient, unwrap } from './client';
import type { ListEnvelope, OffsetPageMeta, SuccessEnvelope, TeamMember } from './types';

export type AssignableRole = 'admin' | 'manager' | 'agent' | 'viewer';

export interface TeamQuery {
  page?: number;
  limit?: number;
  status?: 'invited' | 'active' | 'disabled';
  roleKey?: 'owner' | AssignableRole;
  search?: string;
}

/** `/api/v1/team/*`. */
export const teamApi = {
  list: async (query: TeamQuery) =>
    (
      await apiClient.get<ListEnvelope<TeamMember, OffsetPageMeta>>('/team/users', {
        params: query,
      })
    ).data,
  invite: (body: { email: string; name: string; roleKey: AssignableRole }) =>
    unwrap(apiClient.post<SuccessEnvelope<TeamMember>>('/team/invites', body)),
  resendInvite: (userId: string) =>
    apiClient.post(`/team/invites/${userId}/resend`).then(() => undefined),
  revokeInvite: (userId: string) =>
    apiClient.delete(`/team/invites/${userId}`).then(() => undefined),
  update: (id: string, body: { roleKey?: AssignableRole; status?: 'active' | 'disabled' }) =>
    unwrap(apiClient.patch<SuccessEnvelope<TeamMember>>(`/team/users/${id}`, body)),
  remove: (id: string) => apiClient.delete(`/team/users/${id}`).then(() => undefined),
  transferOwnership: (body: { userId: string; password: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<{ ownerId: string }>>('/team/transfer-ownership', body)),
};
