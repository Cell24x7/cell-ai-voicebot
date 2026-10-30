import type { ChipProps } from '@mui/material/Chip';

import type {
  InboxMessage,
  WhatsAppCallPermissionStatus,
  WhatsAppChannelCalling,
  WhatsAppInboundRoute,
} from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';

type ChipColor = ChipProps['color'];

export const PERMISSION_STATUS_LABELS: Record<WhatsAppCallPermissionStatus, string> = {
  none: 'No permission',
  requested: 'Requested · waiting',
  temporary: 'Can call',
  permanent: 'Can call (always)',
  declined: 'Declined',
  expired: 'Expired',
  revoked: 'Revoked',
};

export const permissionColor = (status: WhatsAppCallPermissionStatus): ChipColor =>
  status === 'temporary' || status === 'permanent'
    ? 'success'
    : status === 'requested'
      ? 'info'
      : status === 'declined' || status === 'revoked'
        ? 'error'
        : 'default';

/** "Can call until 02 Nov 2026, 10:15" / "Can call (always)" / the status (account time zone). */
export const permissionText = (
  p: { status: WhatsAppCallPermissionStatus; expiresAt: string | null },
  timezone: string,
): string =>
  p.status === 'temporary' && p.expiresAt
    ? `Can call until ${formatInAccountTz(p.expiresAt, timezone)}`
    : PERMISSION_STATUS_LABELS[p.status];

/** Why the business can't call / ask now (the panel's `reason`). */
export const CANNOT_CALL_TEXT: Record<string, string> = {
  not_connected: 'The WhatsApp number is not connected.',
  calling_disabled: 'Calling is off on this number.',
  calling_unavailable: 'Calling is not available on this number.',
  country: "WhatsApp doesn't allow business calls from this number's country.",
  restricted: 'WhatsApp paused calls from this number for a while.',
  dnd: 'The number is on the Do-not-disturb list.',
  opted_out: 'The customer opted out of messages.',
  blocked: 'This chat is blocked.',
  check_failed: "WhatsApp didn't answer. Try again in a minute.",
  no_permission: 'The customer has not allowed calls yet.',
  call_limit: 'The call limit for this customer is reached. Try again later.',
  declined: 'The customer declined calls.',
  request_limit: 'A permission request was sent recently. Try again later.',
  requested: 'Waiting for the customer to answer the request.',
};

export const cannotCallText = (reason: string | null | undefined): string =>
  (reason && CANNOT_CALL_TEXT[reason]) || "You can't call this customer now.";

/** Why calling is unavailable on a number (settings / numbers list). */
export const UNAVAILABLE_TEXT: Record<
  NonNullable<WhatsAppChannelCalling['unavailableReason']>,
  string
> = {
  coexistence: 'Calling is not available on WhatsApp Business app numbers (coexistence).',
  messaging_limit:
    'WhatsApp needs a messaging limit of at least 2,000 conversations a day for calling.',
  not_cloud_api: 'Calling works on Cloud API numbers only.',
  country: "WhatsApp doesn't offer calling for this number's country yet.",
};

export const unavailableText = (reason: string | null | undefined): string =>
  (reason && UNAVAILABLE_TEXT[reason as keyof typeof UNAVAILABLE_TEXT]) ||
  'Calling is not available on this number.';

export const CALLING_STATUS_LABELS: Record<WhatsAppChannelCalling['status'], string> = {
  enabled: 'Calling on',
  disabled: 'Calling off',
  unavailable: 'Calling unavailable',
};

/** Meta's calling restrictions (account_update) in plain words. */
export const RESTRICTION_TEXT: Record<string, string> = {
  RESTRICTED_BUSINESS_INITIATED_CALLING:
    'WhatsApp paused calls from your business to customers after low call quality.',
  RESTRICTED_USER_INITIATED_CALLING: 'WhatsApp paused customer calls to this number.',
  RESTRICTED_USER_INITIATED_CALLING_CALL_BUTTON_HIDDEN:
    'WhatsApp hid the call button for customers on this number.',
};

export const restrictionText = (type: string): string =>
  RESTRICTION_TEXT[type] ?? 'WhatsApp restricted calling on this number.';

export const ROUTE_LABELS: Record<WhatsAppInboundRoute, string> = {
  team: 'Ring the team',
  ai: 'AI answers',
  ai_then_team: 'AI first, then the team',
};

type CallBubble = NonNullable<InboxMessage['call']>;

export const CALL_OUTCOME_LABELS: Record<CallBubble['outcome'], string> = {
  completed: 'Call',
  missed: 'Missed call',
  rejected: 'Call declined',
  failed: 'Call failed',
  no_answer: 'No answer',
};

/** `2:14` (minutes:seconds). */
export const formatCallDuration = (sec: number | null | undefined): string => {
  const s = typeof sec === 'number' && Number.isFinite(sec) ? Math.max(0, Math.round(sec)) : 0;
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
};

/** "Call · 2:14" / "Missed call" / "AI call · 0:45". */
export const callBubbleText = (c: CallBubble): string => {
  const label =
    c.outcome === 'completed' && c.mode === 'ai' ? 'AI call' : CALL_OUTCOME_LABELS[c.outcome];
  return c.outcome === 'completed' ? `${label} · ${formatCallDuration(c.durationSec)}` : label;
};

export const REQUEST_STATE_LABELS: Record<
  NonNullable<NonNullable<InboxMessage['interactive']>['requestState']>,
  string
> = {
  sent: 'Waiting for the answer',
  answered: 'Answered',
  expired: 'No answer',
  failed: 'Not delivered',
};

/** Call / permission errors per code (the server message is the fallback). */
export const CALL_ERROR_TEXT: Record<string, string> = {
  WHATSAPP_CALLING_DISABLED: 'Calling is off on this number.',
  WHATSAPP_CALLING_UNAVAILABLE: 'Calling is not available on this number.',
  WHATSAPP_CALLING_RESTRICTED: 'WhatsApp paused calls from this number for a while.',
  WHATSAPP_CALL_PERMISSION_MISSING: 'The customer has not allowed calls.',
  WHATSAPP_CALL_PERMISSION_CHECK_FAILED: "WhatsApp didn't answer. Try again in a minute.",
  WHATSAPP_CALL_PERMISSION_LIMIT: 'A permission request was sent recently. Try again later.',
  WHATSAPP_CALL_PERMISSION_EXISTS: 'This customer already allows calls.',
  WHATSAPP_CALL_PERMISSION_TEMPLATE_MISSING:
    'The 24-hour chat window is closed and the call permission template is not approved yet.',
  WHATSAPP_CALL_LIMIT_REACHED: 'The call limit for this customer is reached. Try again later.',
  WHATSAPP_CALL_ACTIVE: 'This customer is already on a call.',
  WHATSAPP_CALL_TAKEN: 'Someone else answered this call.',
  WHATSAPP_CALL_NOT_RINGING: 'This call is no longer ringing.',
  WHATSAPP_CALL_FAILED: 'WhatsApp could not place the call. Try again.',
  CALL_AGENT_UNAVAILABLE: 'You are already on a call.',
  CALL_NOT_ALLOWED: "This customer can't be called (Do-not-disturb, opted out or blocked).",
  CALL_OUTSIDE_WINDOW: 'Calls are not allowed at this time.',
  CALL_LIMIT_REACHED: 'Too many calls at the same time. Try again when one ends.',
  CALL_CAPACITY: 'The server is busy. Try again in a minute.',
  CALL_NOT_ACTIVE: 'This call has ended.',
  WALLET_INSUFFICIENT_BALANCE: 'Add money to your wallet to make calls.',
  WALLET_BUDGET_EXCEEDED: 'The monthly call budget is reached. Raise it in Wallet → Settings.',
  RATE_LIMITED: 'Too many tries. Wait a minute and try again.',
};
