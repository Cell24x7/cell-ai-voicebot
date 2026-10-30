import { apiClient, unwrap } from './client';
import type {
  MetaWebhookEventRow,
  SuccessEnvelope,
  WhatsAppAdminStatus,
  WhatsAppChannel,
  WhatsAppConnectResult,
  WhatsAppMetaPayer,
} from './types';

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
};
