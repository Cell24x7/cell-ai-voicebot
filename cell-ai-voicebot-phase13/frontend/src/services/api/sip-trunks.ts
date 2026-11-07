import { apiClient, unwrap } from './client';
import type { SuccessEnvelope } from './types';

/** An account's own SIP trunk as the API shows it (never the password). */
export interface SipTrunkView {
  configured: boolean;
  trunk: {
    host: string;
    port: number;
    transport: 'udp' | 'tcp';
    auth: 'ip' | 'register';
    username: string | null;
    passwordSet: boolean;
    trunkIps: string[];
    callerId: string;
    codecs: ('ulaw' | 'alaw')[];
    updatedAt: string;
  } | null;
  /** `online` / `offline` / `unknown`, `not_loaded`, `line_down`. */
  state: string | null;
  lineConnected: boolean;
}

export interface SipTrunkInput {
  host: string;
  port: number;
  transport: 'udp' | 'tcp';
  auth: 'ip' | 'register';
  username?: string | null;
  /** Omit to keep the saved password. */
  password?: string;
  trunkIps: string[];
  callerId: string;
  codecs: ('ulaw' | 'alaw')[];
}

export const sipTrunkKeys = { account: (id: string) => ['admin', 'sip-trunk', id] as const };

/** Superadmin: an account's own SIP trunk (saved in the app, connected without env changes). */
export const sipTrunksApi = {
  get: (accountId: string) =>
    unwrap(apiClient.get<SuccessEnvelope<SipTrunkView>>(`/admin/accounts/${accountId}/sip-trunk`)),
  save: (accountId: string, body: SipTrunkInput) =>
    unwrap(
      apiClient.put<SuccessEnvelope<SipTrunkView>>(`/admin/accounts/${accountId}/sip-trunk`, body),
    ),
  remove: (accountId: string) =>
    unwrap(
      apiClient.delete<SuccessEnvelope<SipTrunkView>>(`/admin/accounts/${accountId}/sip-trunk`),
    ),
};
