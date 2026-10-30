import type { ReportUnit } from '@/services/api/reports';
import { formatCurrencyMicros, formatNumber } from '@/utils/format';

/** Metric names + the one-line definitions of docs/analytics/METRICS.md (backend). */
export const METRICS: Record<string, { label: string; help: string }> = {
  calls_attempted: {
    label: 'Calls',
    help: 'Finished calls, except calls canceled before dialing.',
  },
  calls_answered: { label: 'Answered', help: 'Calls the customer picked up.' },
  answer_rate: { label: 'Answer rate', help: 'Answered ÷ calls.' },
  talk_time: { label: 'Talk time', help: 'Total length of answered calls.' },
  avg_duration: { label: 'Average length', help: 'Talk time ÷ answered calls.' },
  median_duration: {
    label: 'Typical length',
    help: 'Half of the answered calls were at least this long (from duration buckets).',
  },
  p90_duration: { label: 'Long calls', help: 'One in ten answered calls was at least this long.' },
  ptp_count: {
    label: 'Promises to pay',
    help: 'Answered calls where the AI found a promise date.',
  },
  ptp_amount: { label: 'Promised amount', help: 'Sum of the promised amounts the AI found.' },
  calls_inbound: { label: 'Incoming', help: 'Calls the customer made.' },
  calls_outbound: { label: 'Outgoing', help: 'Calls the business made.' },
  calls_ai: { label: 'By AI', help: 'Calls handled by a flow or an AI agent.' },
  calls_human: { label: 'By team', help: 'WhatsApp calls answered by a team member.' },
  sentiment_positive: { label: 'Positive mood', help: 'Answered calls the AI rated positive.' },
  sentiment_neutral: { label: 'Neutral mood', help: 'Answered calls the AI rated neutral.' },
  sentiment_negative: { label: 'Negative mood', help: 'Answered calls the AI rated negative.' },
  messages_sent: {
    label: 'Messages sent',
    help: 'Business messages that reached WhatsApp (sent or later).',
  },
  messages_delivered: { label: 'Delivered', help: 'Messages delivered to the phone.' },
  messages_read: { label: 'Read', help: 'Messages the customer read.' },
  messages_failed: { label: 'Failed', help: 'Messages that failed.' },
  messages_inbound: {
    label: 'Customer messages',
    help: 'Messages from customers (not reactions).',
  },
  delivered_rate: { label: 'Delivered', help: 'Delivered ÷ sent.' },
  read_rate: { label: 'Read rate', help: 'Read ÷ sent.' },
  templates_sent: { label: 'Templates sent', help: 'Sent messages that were templates.' },
  replied: { label: 'Replies', help: 'Templates the customer answered within 24 hours.' },
  reply_rate: { label: 'Reply rate', help: 'Replies ÷ templates sent.' },
  responses: { label: 'Answered chats', help: 'Times the team replied to a waiting customer.' },
  first_response_median: {
    label: 'Typical reply time',
    help: 'Half of the first replies came at least this fast (from buckets).',
  },
  first_response_p90: {
    label: 'Slow replies',
    help: 'One in ten first replies took at least this long.',
  },
  spend: { label: 'Spend', help: 'Charges captured from the wallet (calls, AI, WhatsApp).' },
  cost_per_answered: { label: 'Cost per answered call', help: 'Spend ÷ answered calls.' },
  calls: { label: 'Calls', help: 'Answered calls with this outcome.' },
  share: { label: 'Share', help: 'Of the answered calls.' },
  entered: { label: 'Reached', help: 'Times calls reached this step.' },
  errors: { label: 'Errors', help: 'Times this step failed.' },
  avg_time: { label: 'Average time', help: 'Average time spent in this step.' },
};

export const metricLabel = (key: string): string => METRICS[key]?.label ?? key.replace(/_/g, ' ');
export const metricHelp = (key: string): string => METRICS[key]?.help ?? '';

/** `95` → "1m 35s", `3700` → "1h 1m". */
export const formatDuration = (sec: number): string => {
  const s = Math.round(sec);
  if (s < 60) return `${String(s)}s`;
  if (s < 3600) return `${String(Math.floor(s / 60))}m${s % 60 ? ` ${String(s % 60)}s` : ''}`;
  const m = Math.floor((s % 3600) / 60);
  return `${String(Math.floor(s / 3600))}h${m ? ` ${String(m)}m` : ''}`;
};

/** A report value in its unit; `null` (nothing to divide by) → "—". */
export const formatMetric = (value: number | null | undefined, unit: ReportUnit): string => {
  if (value === null || value === undefined) return '—';
  switch (unit) {
    case 'percent':
      return `${String(value)}%`;
    case 'seconds':
      return formatDuration(value);
    case 'micros':
      return formatCurrencyMicros(value);
    default:
      return formatNumber(value);
  }
};

/** Change against the previous period: `+12%`, `−5%`, `new`, or `null` when it can't be said. */
export const deltaOf = (
  value: number | null | undefined,
  previous: number | null | undefined,
): { text: string; direction: 'up' | 'down' | 'same' } | null => {
  if (value === null || value === undefined || previous === null || previous === undefined)
    return null;
  if (previous === 0)
    return value === 0 ? { text: '0%', direction: 'same' } : { text: 'new', direction: 'up' };
  const pct = Math.round(((value - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return { text: '0%', direction: 'same' };
  return {
    text: `${pct > 0 ? '+' : '−'}${String(Math.abs(pct))}%`,
    direction: pct > 0 ? 'up' : 'down',
  };
};
