import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import { dispositionLabel } from '@/features/calls/labels';
import type { DryRunOutcome, RetryOn, ScenarioKey } from '@/services/api/campaigns';
import type {
  CampaignContactRow,
  CampaignContactStatus,
  CampaignPauseReason,
  CampaignStatus,
} from '@/services/api/types';

export { dispositionLabel };

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  canceled: 'Canceled',
  failed: 'Failed',
};

export const campaignStatusColor = (
  status: CampaignStatus,
): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  if (status === 'running') return 'info';
  if (status === 'completed') return 'success';
  if (status === 'paused' || status === 'scheduled') return 'warning';
  if (status === 'failed') return 'error';
  return 'default';
};

/** "Campaign … paused: <reason>" (backend notifications use the same words). */
export const PAUSE_REASON_LABELS: Record<CampaignPauseReason, string> = {
  manual: 'Paused by a team member',
  wallet_empty: 'The wallet ran out',
  budget_reached: 'The campaign budget was reached',
  account_suspended: 'The account is suspended',
  too_many_failures: 'Too many calls failed in a row',
  admin: 'Paused by the platform team',
  flow_not_runnable: 'Its flow can no longer run (an AI agent is off or audio is missing)',
};

/** What to do about a pause (shown under the banner). */
export const PAUSE_REASON_HINTS: Partial<Record<CampaignPauseReason, string>> = {
  wallet_empty: 'Add money to the wallet — it resumes by itself when auto-resume is on.',
  budget_reached: 'Raise the budget to resume.',
  too_many_failures: 'Check the flow and the recent failed calls, then resume.',
  admin: 'Only the platform team can resume it.',
  flow_not_runnable: 'Switch the flow’s AI agent back on (or restore its audio), then resume.',
  account_suspended: 'The account has to be enabled again by the platform team.',
};

export const CONTACT_STATUS_LABELS: Record<CampaignContactStatus, string> = {
  pending: 'Pending',
  queued: 'Queued',
  calling: 'Calling',
  retry_wait: 'Retry later',
  callback_wait: 'Callback',
  completed: 'Completed',
  failed: 'Not reached',
  skipped: 'Skipped',
  canceled: 'Canceled',
};

export const contactStatusColor = (
  status: CampaignContactStatus,
): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'queued' || status === 'calling') return 'info';
  if (status === 'retry_wait' || status === 'callback_wait') return 'warning';
  return 'default';
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  contact_deleted: 'Contact deleted',
  dnd: 'On the do-not-call list',
  opted_out: 'Opted out',
  invalid_phone: 'Invalid phone',
  duplicate_phone: 'Duplicate phone',
  in_active_campaign: 'In another active campaign',
  missing_values: 'Missing values',
  cap_reached: 'Call limit reached',
  campaign_ended: 'Campaign ended',
};
/** Why a contact waits for its next attempt (the dispatcher's dial guard). */
export const WAIT_REASON_LABELS: Record<NonNullable<CampaignContactRow['waitReason']>, string> = {
  window: 'Waiting for the calling window',
  daily_cap: 'Daily call limit reached',
  weekly_cap: 'Weekly call limit reached',
  min_gap: 'Called a short while ago',
};

export const skipReasonLabel = (value: string | null | undefined): string | null =>
  value ? (SKIP_REASON_LABELS[value] ?? value) : null;

export const RESULT_LABELS: Record<NonNullable<CampaignContactRow['lastResult']>, string> = {
  answered: 'Answered',
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Failed',
  invalid_number: 'Invalid number',
};

export const RETRY_ON_LABELS: Record<RetryOn, string> = {
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Failed',
  no_outcome: 'Answered without an outcome',
};

export const OUTCOME_LABELS: Record<DryRunOutcome, string> = {
  answered: 'Answered',
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Failed',
  invalid_number: 'Invalid number',
};

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  paid: 'Already paid',
  promise: 'Promises to pay',
  refuse: 'Refuses',
  callback: 'Asks for a callback',
  silence: 'Stays silent',
  wrong_number: 'Wrong number',
  hangup_early: 'Hangs up early',
  wrong_keys: 'Presses wrong keys',
};

export const PRIORITY_LABELS = { high: 'High', normal: 'Normal', low: 'Low' } as const;

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Statuses the dispatcher may still change (poll the detail while one of these). */
export const ACTIVE_CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  'scheduled',
  'running',
  'paused',
];

/** "Waiting for the calling window — calls resume Mon 09:00" (account timezone). */
export const waitingText = (waitingUntil: string, timezone: string): string =>
  `Waiting for the calling window — calls resume ${format(
    new TZDate(new Date(waitingUntil).getTime(), timezone),
    'EEE HH:mm',
  )}`;
