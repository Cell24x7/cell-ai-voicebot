import { apiClient, unwrap } from './client';
import type {
  MetaWebhookEventRow,
  SuccessEnvelope,
  WhatsAppAdminStatus,
  WhatsAppChannel,
  WhatsAppConnectResult,
  WhatsAppMetaPayer,
} from './types';

/** PN: a number onboarded at the partner (Pinnacle) — what the partner panel shows. */
export interface ManagedNumberInput {
  label: string;
  wabaId: string;
  phoneNumberId: string;
  apiKey: string;
  creditLine: ManagedCreditLine;
}

export type ManagedCreditLine = 'partner_pending' | 'partner_active';

export interface ManualConnectInput {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

/** Superadmin WhatsApp tools (`/api/v1/admin/whatsapp/*`, account billing / manual connect). */
export const adminWhatsappApi = {
  status: () =>
    unwrap(apiClient.get<SuccessEnvelope<WhatsAppAdminStatus>>('/admin/whatsapp/status')),
  events: (status?: MetaWebhookEventRow['status']) =>
    unwrap(
      apiClient.get<SuccessEnvelope<MetaWebhookEventRow[]>>('/admin/whatsapp/events', {
        params: status ? { status } : {},
      }),
    ),
  replay: (eventId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ id: string; status: 'received' }>>(
        `/admin/whatsapp/events/${eventId}/replay`,
      ),
    ),
  disconnect: (channelId: string, reason: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppChannel>>(
        `/admin/whatsapp/channels/${channelId}/disconnect`,
        { reason },
      ),
    ),
  setBilling: (accountId: string, metaPayer: WhatsAppMetaPayer) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<{ metaPayer: WhatsAppMetaPayer }>>(
        `/admin/accounts/${accountId}/whatsapp-billing`,
        { metaPayer },
      ),
    ),
  manualConnect: (accountId: string, body: ManualConnectInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppConnectResult>>(
        `/admin/accounts/${accountId}/whatsapp/manual-connect`,
        body,
      ),
    ),
  // PN: managed numbers over the Pinnacle partner API
  addManagedNumber: (accountId: string, body: ManagedNumberInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppConnectResult>>(
        `/admin/accounts/${accountId}/whatsapp/managed-numbers`,
        body,
      ),
    ),
  replaceManagedKey: (channelId: string, apiKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppChannel>>(
        `/admin/whatsapp/channels/${channelId}/managed/api-key`,
        { apiKey },
      ),
    ),
  resetManagedWebhook: (channelId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppChannel>>(
        `/admin/whatsapp/channels/${channelId}/managed/webhook`,
      ),
    ),
  setManagedCreditLine: (channelId: string, status: ManagedCreditLine) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppChannel>>(
        `/admin/whatsapp/channels/${channelId}/managed/credit-line`,
        { status },
      ),
    ),
};
