import type {
  WhatsAppCampaignPauseReason,
  WhatsAppCampaignRecipientStatus,
  WhatsAppCampaignStatus,
} from '@/services/api/types';

/** Campaign statuses (backend `WA_CAMPAIGN_STATUSES`). */
export const WA_CAMPAIGN_STATUS_LABELS: Record<WhatsAppCampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  running: 'Running',
  waiting_for_limit: 'Waiting for limit',
  paused: 'Paused',
  completed: 'Completed',
  stopped: 'Stopped',
  failed: 'Failed',
};

export const waCampaignStatusColor = (
  status: WhatsAppCampaignStatus,
): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  if (status === 'running') return 'info';
  if (status === 'completed') return 'success';
  if (status === 'waiting_for_limit') return 'warning';
  if (status === 'paused' || status === 'scheduled') return 'warning';
  if (status === 'failed' || status === 'stopped') return 'error';
  return 'default';
};

/** Recipient statuses (backend `WA_RECIPIENT_STATUSES`). */
export const WA_RECIPIENT_STATUS_LABELS: Record<WhatsAppCampaignRecipientStatus, string> = {
  pending: 'Pending',
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  skipped: 'Skipped',
};

export const waRecipientStatusColor = (
  status: WhatsAppCampaignRecipientStatus,
): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  if (status === 'sent') return 'info';
  if (status === 'delivered' || status === 'read') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'skipped') return 'warning';
  return 'default';
};

/** Why a recipient got nothing (backend `WA_CAMPAIGN_SKIP_REASONS`). */
export const WA_SKIP_REASON_LABELS: Record<string, string> = {
  dnd: 'Do-not-call',
  opted_out: 'Opted out',
  suppressed: 'Suppressed',
  no_whatsapp: 'No WhatsApp',
  marketing_stopped: 'Stopped marketing',
  sent_recently: 'Sent recently',
  missing_variable: 'Missing variable',
  invalid_phone: 'Invalid phone',
  stopped: 'Stopped',
  limit_reached: 'Limit reached',
  already_allowed: 'Already allowed calls',
  declined_recently: 'Declined recently',
  meta_limit: 'Meta limit',
};

export const waSkipReasonLabel = (value: string | null | undefined): string | null =>
  value ? (WA_SKIP_REASON_LABELS[value] ?? value) : null;

/** Why the campaign paused on its own (backend `WA_CAMPAIGN_PAUSE_REASONS`). */
export const WA_PAUSE_REASON_LABELS: Record<WhatsAppCampaignPauseReason, string> = {
  user: 'Paused',
  wallet_empty: 'The wallet ran out',
  template_paused: 'WhatsApp paused or disabled a template',
  quality_red: "The number's quality is red",
  channel_down: 'The WhatsApp number is not connected',
};

/** Meta error codes (the retryable ones get a friendly note). */
export const WA_META_CODE_LABELS: Record<string, string> = {
  '130429': 'Rate limit (try again)',
  '131000': 'Temporary error',
  '131016': 'Session expired (try again)',
  '131048': 'Session lock (try again)',
  '131056': 'Throttled (try again)',
  '2': 'Unspecified error',
  '4': 'Internal error',
  '80007': 'Recipient is not a valid WhatsApp user',
};

export const waMetaCodeLabel = (code: number | null | undefined): string | null =>
  code === null || code === undefined
    ? 'Send error'
    : (WA_META_CODE_LABELS[String(code)] ?? `Meta code ${String(code)}`);

/** The wizard's variant letters. */
export const VARIANT_KEYS = ['A', 'B', 'C'] as const;
export type VariantKey = (typeof VARIANT_KEYS)[number];

/** The variable sources a template value can come from (backend `WA_VARIABLE_KINDS`). */
export const WA_VARIABLE_KIND_LABELS = {
  field: 'Contact field',
  'contact.name': 'Contact name',
  'contact.phone': 'Contact phone',
  static: 'Fixed text',
} as const;
