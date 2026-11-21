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

export type SignupAccountType = 'business' | 'reseller';

export interface SignupInput {
  accountType: SignupAccountType;
  acceptTerms: true;
  /** Honeypot (always empty from people). */
  website?: string;
  businessName: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  timezone?: string;
}

/** Auth endpoints (`/api/v1/auth/*`, backend ADR 0009). */
export const authApi = {
  /** Phase 19: no e-mail — the answer is a signed-in session. */
  signup: (body: SignupInput) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/signup', body)),
  signupOptions: () =>
    unwrap(
      apiClient.get<
        SuccessEnvelope<{ open: boolean; resellerSignup: 'open' | 'approval' | 'closed' }>
      >('/auth/signup-options'),
    ),
  login: (body: { email: string; password: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/login', body)),
  mfaStatus: () =>
    unwrap(
      apiClient.get<SuccessEnvelope<{ enabled: boolean; enforced: boolean }>>('/auth/mfa/status'),
    ),
  mfaSetup: () =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ secret: string; otpauthUrl: string }>>('/auth/mfa/setup'),
    ),
  mfaConfirm: (code: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ recoveryCodes: string[] }>>('/auth/mfa/confirm', { code }),
    ),
  mfaVerify: (code: string) =>
    unwrap(apiClient.post<SuccessEnvelope<{ verified: true }>>('/auth/mfa/verify', { code })),
  mfaDisable: (body: { password: string; code: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<{ disabled: true }>>('/auth/mfa/disable', body)),
  refresh: () => unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/refresh')),
  logout: () => apiClient.post('/auth/logout').then(() => undefined),
  logoutAll: () => apiClient.post('/auth/logout-all').then(() => undefined),
  me: () => unwrap(apiClient.get<SuccessEnvelope<AuthMe>>('/auth/me')),
  forgotPassword: (email: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Message>>('/auth/forgot-password', { email })),
  resetPassword: (body: { token: string; password: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<Message>>('/auth/reset-password', body)),
  /** `currentPassword` is left out only in superadmin Full access (after a step-up). */
  changePassword: (body: { currentPassword?: string; newPassword: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/change-password', body)),
  sessions: () => unwrap(apiClient.get<SuccessEnvelope<Session[]>>('/auth/sessions')),
  /** SAC Full access: 4 more hours (at most 12 h from the start). */
  extendLoginAs: () =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/login-as/extend')),
  /** SAC Full access: the superadmin's own password (+ code) for 5 minutes of danger actions. */
  stepUpLoginAs: (body: { password: string; code?: string }) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ stepUpUntil: string }>>('/auth/login-as/step-up', body),
    ),
  /** SAC Full access: incoming calls of this account ring this session too. */
  setRingMeToo: (on: boolean) =>
    unwrap(
      apiClient.put<SuccessEnvelope<{ ringMeToo: boolean }>>('/auth/login-as/ring-me-too', { on }),
    ),
  revokeSession: (id: string) =>
    apiClient.delete(`/auth/sessions/${encodeURIComponent(id)}`).then(() => undefined),
  inviteInfo: (token: string) =>
    unwrap(apiClient.get<SuccessEnvelope<InviteInfo>>('/auth/invite-info', { params: { token } })),
  acceptInvite: (body: { token: string; password: string; name?: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>('/auth/accept-invite', body)),
  issueWsTicket: () => unwrap(apiClient.post<SuccessEnvelope<WsTicket>>('/ws/tickets', {})),
  rbacCatalog: () => unwrap(apiClient.get<SuccessEnvelope<RbacCatalog>>('/rbac/permissions')),
};
