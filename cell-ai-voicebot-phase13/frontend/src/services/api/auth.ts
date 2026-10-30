import { apiClient, unwrap } from './client';
import type {
  AuthMe,
  AuthSession,
  InviteInfo,
  RbacCatalog,
  Session,
  SuccessEnvelope,
  WsTicket,
} from './types';

interface Message {
  message: string;
}

export interface SignupInput {
  businessName: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  timezone?: string;
}

/** Auth endpoints (`/api/v1/auth/*`, backend ADR 0009). */
export const authApi = {
  signup: (body: SignupInput) =>
    unwrap(apiClient.post<SuccessEnvelope<Message>>('/auth/signup', body)),
  verifyEmail: (body: { email: string; code: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/verify-email', body)),
  resendVerification: (email: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Message>>('/auth/verify-email/resend', { email })),
  login: (body: { email: string; password: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/login', body)),
  refresh: () => unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/refresh')),
  logout: () => apiClient.post('/auth/logout').then(() => undefined),
  logoutAll: () => apiClient.post('/auth/logout-all').then(() => undefined),
  me: () => unwrap(apiClient.get<SuccessEnvelope<AuthMe>>('/auth/me')),
  forgotPassword: (email: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Message>>('/auth/forgot-password', { email })),
  resetPassword: (body: { token: string; password: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<Message>>('/auth/reset-password', body)),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/change-password', body)),
  sessions: () => unwrap(apiClient.get<SuccessEnvelope<Session[]>>('/auth/sessions')),
  revokeSession: (id: string) =>
    apiClient.delete(`/auth/sessions/${encodeURIComponent(id)}`).then(() => undefined),
  inviteInfo: (token: string) =>
    unwrap(apiClient.get<SuccessEnvelope<InviteInfo>>('/auth/invite-info', { params: { token } })),
  acceptInvite: (body: { token: string; password: string; name?: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/accept-invite', body)),
  issueWsTicket: () => unwrap(apiClient.post<SuccessEnvelope<WsTicket>>('/ws/tickets', {})),
  rbacCatalog: () => unwrap(apiClient.get<SuccessEnvelope<RbacCatalog>>('/rbac/permissions')),
};
