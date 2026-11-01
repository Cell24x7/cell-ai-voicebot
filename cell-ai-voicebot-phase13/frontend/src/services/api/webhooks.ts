import { apiClient, unwrap } from './client';
import type {
  SuccessEnvelope,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from './types';

/** The v1 event catalogue (backend `modules/webhooks/events.ts`). */
export const WEBHOOK_EVENTS = [
  { key: 'call.started', label: 'Call answered' },
  { key: 'call.completed', label: 'Call finished (result + cost)' },
  { key: 'call.insights.ready', label: 'AI summary / outcome ready' },
  { key: 'campaign.completed', label: 'Campaign finished' },
  { key: 'whatsapp.message.received', label: 'WhatsApp message received' },
  { key: 'whatsapp.message.status', label: 'WhatsApp message sent / delivered / read' },
  { key: 'whatsapp.call.started', label: 'WhatsApp call answered' },
  { key: 'whatsapp.call.ended', label: 'WhatsApp call ended' },
  { key: 'whatsapp.call.missed', label: 'WhatsApp call missed' },
  { key: 'contact.opted_out', label: 'Contact opted out' },
  { key: 'contact.opted_in', label: 'Contact opted in' },
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]['key'];

export interface EndpointInput {
  url: string;
  description?: string;
  events: (WebhookEventType | '*')[];
  includePersonalData?: boolean;
}

export interface DeliveriesQuery {
  status?: WebhookDelivery['status'];
  type?: WebhookEventType;
  from?: string;
  to?: string;
  cursor?: string;
}

/** `/api/v1/webhook-endpoints` + `/webhook-deliveries` (Phase 15). Secrets only in create / rotate. */
export const webhooksApi = {
  list: () => unwrap(apiClient.get<SuccessEnvelope<WebhookEndpoint[]>>('/webhook-endpoints')),
  create: (body: EndpointInput) =>
    unwrap(apiClient.post<SuccessEnvelope<WebhookEndpointWithSecret>>('/webhook-endpoints', body)),
  update: (id: string, body: Partial<EndpointInput> & { active?: false }) =>
    unwrap(apiClient.patch<SuccessEnvelope<WebhookEndpoint>>(`/webhook-endpoints/${id}`, body)),
  remove: async (id: string) => {
    await apiClient.delete(`/webhook-endpoints/${id}`);
  },
  test: (id: string, type: WebhookEventType) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ ok: boolean; delivery: WebhookDelivery }>>(
        `/webhook-endpoints/${id}/test`,
        { type },
      ),
    ),
  rotateSecret: (id: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WebhookEndpointWithSecret>>(
        `/webhook-endpoints/${id}/rotate-secret`,
      ),
    ),
  enable: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WebhookEndpoint>>(`/webhook-endpoints/${id}/enable`)),
  deliveries: (id: string, query: DeliveriesQuery = {}) =>
    unwrap(
      apiClient.get<SuccessEnvelope<{ items: WebhookDelivery[]; nextCursor: string | null }>>(
        `/webhook-endpoints/${id}/deliveries`,
        { params: { limit: 50, ...query } },
      ),
    ),
  /** DEV ONLY: the backend's own test receiver (404 when the mock APIs are off). */
  devReceiver: () => apiClient.get<{ url: string }>('/mock/dev-receiver').then((r) => r.data.url),
  replay: (deliveryId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WebhookDelivery>>(`/webhook-deliveries/${deliveryId}/replay`),
    ),
};
