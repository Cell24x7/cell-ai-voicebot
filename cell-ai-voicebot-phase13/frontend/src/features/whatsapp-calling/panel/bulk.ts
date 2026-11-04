import type { CallPermissionSkipReason } from '@/services/api/types';

/** The run's fixed skip reasons, in the order the job applies them (PHASE_18B_PROMPT §1). */
export const SKIP_REASON_LABELS: Record<CallPermissionSkipReason, string> = {
  suppressed: 'Erased or blocked for outreach',
  dnd: 'On the do-not-call list',
  opted_out: 'Opted out',
  no_whatsapp: 'Not reachable on WhatsApp',
  already_allowed: 'Already allowed calls',
  declined_recently: 'Declined in the last 7 days',
  meta_limit: "WhatsApp's request limit reached",
  wallet_empty: 'Not sent: wallet empty',
};

export const BULK_PERMISSION_MAX = 5_000;
