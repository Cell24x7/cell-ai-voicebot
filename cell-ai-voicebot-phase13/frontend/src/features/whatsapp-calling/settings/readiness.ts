import type { WhatsAppCallingReadiness } from '@/services/api/types';

export type ReadinessItem = WhatsAppCallingReadiness['items'][number];

/** Plain names of the readiness items (backend `whatsapp-calling/readiness.ts`). */
export const READINESS_LABELS: Record<ReadinessItem['key'], string> = {
  cloud_api: 'Cloud API number',
  messaging_limit: 'Messaging limit',
  business_verified: 'Business verification',
  calls_webhook: 'Call events from WhatsApp',
  app_permission: 'Access to the number',
  meta_status: 'Calling at WhatsApp',
  restrictions: 'Restrictions',
  last_calls_webhook: 'Last call event',
  media: 'Call audio on our server',
  prices: 'Calling prices',
};

/** Items that keep calling off while they fail (backend `BLOCKING_KEYS`). */
export const BLOCKING: readonly ReadinessItem['key'][] = [
  'cloud_api',
  'messaging_limit',
  'calls_webhook',
  'media',
];

/** The first failing must-have item, or null. */
export const firstBlocking = (r: WhatsAppCallingReadiness | undefined): ReadinessItem | null =>
  r?.items.find((i) => BLOCKING.includes(i.key) && i.ok === false) ?? null;
