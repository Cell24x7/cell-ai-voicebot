import type { FlowRun, FlowTranscriptEntry } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

export const END_REASON_LABELS: Record<NonNullable<FlowRun['endReason']>, string> = {
  hangup_node: 'Hung up by the flow',
  transferred: 'Transferred',
  customer_hangup: 'Customer hung up',
  max_duration: 'Longest call time reached',
  loop_guard: 'Stopped: the flow looped too often',
  error_handler: 'Ended by the error message',
  engine_error: 'Ended by an error',
  inputs_exhausted: 'Too many inputs',
};

export const STATUS_LABELS: Record<FlowRun['status'], string> = {
  running: 'Running',
  waiting: 'Waiting for the customer',
  ended: 'Ended',
};

export const versionLabel = (ref: FlowRun['versionRef']): string =>
  ref === 'draft' ? 'Draft' : `v${String(ref)}`;

/** `promise_to_pay` → "Promise to pay". */
export const dispositionLabel = (d: string): string => {
  const t = d.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Wallet / spend-cap problems seen in AI replies of a run. */
export const aiFallbacks = (entries: FlowTranscriptEntry[]) => {
  const seen = new Set(
    entries
      .filter((e) => e.kind === 'ai')
      .map((e) => e.meta?.fallback)
      .filter((f): f is string => typeof f === 'string'),
  );
  return { walletEmpty: seen.has('walletEmpty'), capReached: seen.has('capReached') };
};

/** Outcome lines (disposition, promise, callback, transfer, messages). */
export const outcomeLines = (o: FlowRun['outcome']): string[] => [
  ...(o.disposition
    ? [
        `Disposition: ${dispositionLabel(o.disposition)}${o.dispositionNote ? ` — ${o.dispositionNote}` : ''}`,
      ]
    : []),
  ...(o.promiseToPay
    ? [
        `Promise to pay: ${o.promiseToPay.date}${
          o.promiseToPay.amountMicros !== null
            ? ` · ${formatCurrencyMicros(o.promiseToPay.amountMicros)}`
            : ''
        }`,
      ]
    : []),
  ...(o.callback
    ? [`Callback: ${o.callback.date}${o.callback.time ? ` ${o.callback.time}` : ''}`]
    : []),
  ...(o.transfer ? [`Transfer: ${o.transfer.result.replace(/_/g, ' ')}`] : []),
  ...o.messages.map(
    (m) => `${m.channel === 'sms' ? 'SMS' : 'WhatsApp'} queued: ${m.text ?? m.templateName ?? ''}`,
  ),
];
