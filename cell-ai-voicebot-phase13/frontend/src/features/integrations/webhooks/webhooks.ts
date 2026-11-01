import type { WebhookDelivery, WebhookEndpoint } from '@/services/api/types';
import type { WebhookEventType } from '@/services/api/webhooks';

export interface EndpointDraft {
  url: string;
  description: string;
  events: (WebhookEventType | '*')[];
  includePersonalData: boolean;
}

/** What is wrong with a draft (the server checks the address again), or null. */
export const endpointProblem = (d: EndpointDraft): string | null => {
  let url: URL;
  try {
    url = new URL(d.url.trim());
  } catch {
    return 'Enter the full address, starting with https://';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return 'Enter the full address, starting with https://';
  if (url.username || url.password) return "Don't put a user name or password in the address";
  if (!d.events.length) return 'Choose at least one event';
  return null;
};

/** Active, paused by a person, or turned off after failures. */
export const endpointState = (e: Pick<WebhookEndpoint, 'active' | 'disabledReason'>) =>
  e.active ? 'active' : e.disabledReason === 'failing' ? 'failing' : 'paused';

export const STATE_LABELS: Record<ReturnType<typeof endpointState>, string> = {
  active: 'Active',
  paused: 'Paused',
  failing: 'Turned off (failing)',
};

export const DELIVERY_LABELS: Record<WebhookDelivery['status'], string> = {
  pending: 'Retrying',
  succeeded: 'Delivered',
  failed: 'Failed',
  gave_up: 'Gave up',
};

/** Any finished delivery (never a test or a pending one) can be sent again. */
export const canReplay = (d: Pick<WebhookDelivery, 'status' | 'test'>) =>
  !d.test && (d.status === 'failed' || d.status === 'gave_up' || d.status === 'succeeded');

export const eventsLabel = (events: string[]) =>
  events.includes('*')
    ? 'All events'
    : events.length === 1
      ? (events[0] ?? '')
      : `${String(events.length)} events`;
