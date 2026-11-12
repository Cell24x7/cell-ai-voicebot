import type { ApiError } from '@/services/api/errors';
import type {
  WhatsAppChannelStatus,
  WhatsAppConnectStep,
  WhatsAppLimitTier,
  WhatsAppMode,
  WhatsAppQuality,
  WhatsAppSyncStatus,
} from '@/services/api/types';

type ChipColor = 'default' | 'info' | 'success' | 'warning' | 'error';

export const CHANNEL_STATUS_LABELS: Record<WhatsAppChannelStatus, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  action_needed: 'Action needed',
  needs_reconnect: 'Needs reconnect',
  restricted: 'Restricted',
  disconnected: 'Disconnected',
};

export const channelStatusColor = (status: WhatsAppChannelStatus): ChipColor => {
  if (status === 'connected') return 'success';
  if (status === 'connecting') return 'info';
  if (status === 'action_needed') return 'warning';
  if (status === 'disconnected') return 'default';
  return 'error';
};

/** Statuses that change on their own soon — the page polls while one is shown. */
export const SETTLING_STATUSES: readonly WhatsAppChannelStatus[] = ['connecting', 'action_needed'];

export const QUALITY_LABELS: Record<WhatsAppQuality, string> = {
  GREEN: 'High quality',
  YELLOW: 'Medium quality',
  RED: 'Low quality',
  UNKNOWN: 'Quality unknown',
};

export const qualityColor = (quality: WhatsAppQuality): ChipColor =>
  quality === 'GREEN'
    ? 'success'
    : quality === 'YELLOW'
      ? 'warning'
      : quality === 'RED'
        ? 'error'
        : 'default';

const TIERS: Record<WhatsAppLimitTier, string> = {
  TIER_50: '50 / day',
  TIER_250: '250 / day',
  TIER_1K: '1K / day',
  TIER_2K: '2K / day',
  TIER_10K: '10K / day',
  TIER_100K: '100K / day',
  TIER_UNLIMITED: 'Unlimited',
};

/** Messaging limit (business-initiated conversations a day). */
export const tierLabel = (tier: WhatsAppLimitTier | null): string =>
  tier ? TIERS[tier] : 'Not set';

export const MODE_LABELS: Record<WhatsAppMode, string> = {
  cloud_api: 'Cloud API',
  coexistence: 'WhatsApp Business app',
};

export const SYNC_STATUS_LABELS: Record<WhatsAppSyncStatus, string> = {
  not_requested: 'Not requested',
  requested: 'Requested',
  received: 'Received',
  declined: 'Declined by the business',
  failed: 'Failed',
};

export const STEP_LABELS: Record<WhatsAppConnectStep, string> = {
  phone: 'Phone number',
  details: 'Number details',
  subscribe: 'Webhooks',
  billing: 'Billing',
  register: 'Registration',
};

/** Steps shown while a signup runs on the server. */
export const CONNECT_PROGRESS = [
  'Exchanging the Meta code…',
  'Checking access…',
  'Subscribing to events…',
  'Registering the number…',
] as const;

/** Name statuses Meta uses (raw enums) → words. */
export const nameStatusLabel = (status: string | null): string => {
  if (!status || status === 'NONE') return 'No display name review';
  const known: Record<string, string> = {
    APPROVED: 'Name approved',
    PENDING_REVIEW: 'Name in review',
    DECLINED: 'Name rejected',
    REJECTED: 'Name rejected',
    EXPIRED: 'Name expired',
    DEFERRED: 'Name review deferred',
  };
  return known[status] ?? status.replace(/_/g, ' ').toLowerCase();
};

/** What the user should read for a failed WhatsApp request. */
export const whatsappErrorMessage = (err: ApiError): string => {
  switch (err.code) {
    case 'WHATSAPP_NUMBER_IN_USE':
      return 'This number is already connected to another account.';
    case 'WHATSAPP_CHANNEL_LIMIT':
      return 'This account already has the maximum number of WhatsApp numbers. Disconnect one first.';
    case 'WHATSAPP_NOT_CONFIGURED':
      return "WhatsApp isn't set up on this server.";
    case 'META_API_ERROR': {
      const meta = err.details[0]?.message;
      return meta ? `Meta returned an error: ${meta}` : 'Meta returned an error. Try again.';
    }
    case 'RATE_LIMITED':
      return 'Please wait a minute before trying again.';
    case 'AUTH_IMPERSONATION_BLOCKED':
      return "You can't change WhatsApp numbers while viewing as a user.";
    // PN: managed numbers (Pinnacle partner API)
    case 'PINNACLE_KEY_INVALID':
      return 'The API key was rejected by the partner.';
    case 'PINNACLE_NUMBER_NOT_ON_KEY':
      return "This API key doesn't include that phone number ID / WABA ID.";
    case 'PINNACLE_WEBHOOK_NOT_SET':
      return "The partner didn't accept our webhook — try again or contact the partner.";
    case 'WA_PROVIDER_NOT_CONFIGURED':
      return 'Managed numbers are turned off on this server.';
    case 'WA_PROVIDER_BALANCE_LOW':
      return 'The WhatsApp partner balance is low — contact support.';
    case 'WA_PROVIDER_UNSUPPORTED':
      return "This isn't available for managed numbers.";
    case 'WA_PROVIDER_ERROR': {
      const partner = err.details[0]?.message;
      return partner
        ? `The WhatsApp partner refused: ${partner}`
        : 'The WhatsApp partner refused the request.';
    }
    default:
      return err.message;
  }
};

/** PN: what the owner sees for a managed number's partner-side problems (not the server text). */
export const MANAGED_REASON_TEXT: Record<string, string> = {
  partner_credit_line_pending:
    "Billing for this number is being activated. We'll let you know when it's ready.",
  provider_key_invalid: 'This number needs attention from support.',
  provider_number_missing: 'This number needs attention from support.',
  provider_webhook_mismatch: 'This number needs attention from support.',
  register_at_partner: 'This number is being registered. It will be ready soon.',
};

/** The reason line of a number (managed numbers: our owner-facing text). */
export const channelReasonText = (channel: {
  managed?: boolean;
  statusReason: { code: string; message: string } | null;
}): string | null => {
  if (!channel.statusReason) return null;
  return (
    (channel.managed ? MANAGED_REASON_TEXT[channel.statusReason.code] : undefined) ??
    channel.statusReason.message
  );
};
