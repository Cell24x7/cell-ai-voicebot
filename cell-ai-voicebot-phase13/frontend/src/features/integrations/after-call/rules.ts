import type { RuleInput, RuleParam } from '@/services/api/outcome-rules';
import type { OutcomeRule } from '@/services/api/types';

export const TIMING_LABELS: Record<OutcomeRule['timing']['mode'], string> = {
  now: 'Right after the call',
  after: 'After some minutes',
  next_window_hour: 'Next full hour inside calling hours',
};

export const SOURCE_LABELS: Record<RuleParam['from'], string> = {
  contact: 'Contact field',
  call: 'Call value',
  insights: 'AI insight',
  text: 'Fixed text',
};

/** Keys offered for each source (contact fields come from the account's fields). */
export const CALL_KEYS = ['disposition', 'duration_sec'] as const;
export const INSIGHT_KEYS = ['promise_date', 'promise_amount', 'callback_at'] as const;

/** Sample values for the live preview (never real customer data). */
export const SAMPLE_VALUE: Record<string, string> = {
  name: 'Asha',
  phone_last4: '3210',
  disposition: 'promise_to_pay',
  duration_sec: '94',
  promise_date: '2026-11-05',
  promise_amount: '₹2,500',
  callback_at: '2026-11-04 16:00',
};

export const sampleFor = (p: RuleParam): string =>
  p.from === 'text' ? (p.value ?? '') : (SAMPLE_VALUE[p.key ?? ''] ?? `[${p.key ?? '…'}]`);

export interface RuleDraft {
  name: string;
  dispositions: string[];
  sentiment: ('positive' | 'neutral' | 'negative')[];
  hasPromise: 'any' | 'yes' | 'no';
  notAnsweredInARow: number | null;
  callKinds: ('phone' | 'whatsapp')[];
  channelId: string | null;
  templateId: string;
  params: RuleParam[];
  mode: OutcomeRule['timing']['mode'];
  delayMinutes: number | null;
}

export const emptyDraft = (): RuleDraft => ({
  name: '',
  dispositions: [],
  sentiment: [],
  hasPromise: 'any',
  notAnsweredInARow: null,
  callKinds: [],
  channelId: null,
  templateId: '',
  params: [],
  mode: 'now',
  delayMinutes: null,
});

export const draftOf = (r: OutcomeRule): RuleDraft => ({
  name: r.name,
  dispositions: [...r.when.dispositions],
  sentiment: [...r.when.sentiment],
  hasPromise: r.when.hasPromise === null ? 'any' : r.when.hasPromise ? 'yes' : 'no',
  notAnsweredInARow: r.when.notAnsweredInARow,
  callKinds: [...r.when.callKinds],
  channelId: r.send.channelId,
  templateId: r.send.templateId,
  params: r.send.params.map((p) => ({ ...p })),
  mode: r.timing.mode,
  delayMinutes: r.timing.delayMinutes,
});

export const inputOf = (d: RuleDraft): RuleInput => ({
  name: d.name.trim(),
  when: {
    dispositions: d.dispositions,
    sentiment: d.sentiment,
    hasPromise: d.hasPromise === 'any' ? null : d.hasPromise === 'yes',
    notAnsweredInARow: d.notAnsweredInARow,
    callKinds: d.callKinds,
  },
  send: { channelId: d.channelId, templateId: d.templateId, params: d.params },
  timing: { mode: d.mode, delayMinutes: d.mode === 'after' ? d.delayMinutes : null },
});

/** What is wrong with a draft, or null. */
export const ruleProblem = (d: RuleDraft, variablesCount: number): string | null => {
  if (!d.name.trim()) return 'Give the rule a name';
  if (!d.templateId) return 'Choose an approved template';
  if (d.mode === 'after' && (!d.delayMinutes || d.delayMinutes < 1 || d.delayMinutes > 1440))
    return 'Choose 1–1440 minutes';
  if (d.notAnsweredInARow !== null && (d.notAnsweredInARow < 1 || d.notAnsweredInARow > 10))
    return 'Not answered: 1–10 calls';
  if (d.params.length < variablesCount) return 'Give every template variable a value';
  if (d.params.some((p) => (p.from === 'text' ? !p.value : !p.key))) return 'Fill every value';
  return null;
};

/** One line of what the rule waits for. */
export const whenLabel = (w: OutcomeRule['when']): string => {
  const parts: string[] = [];
  if (w.dispositions.length) parts.push(`outcome ${w.dispositions.join(' / ')}`);
  if (w.sentiment.length) parts.push(`${w.sentiment.join(' / ')} customer`);
  if (w.hasPromise !== null) parts.push(w.hasPromise ? 'a promise to pay' : 'no promise');
  if (w.notAnsweredInARow) parts.push(`not answered ${String(w.notAnsweredInARow)}× in a row`);
  if (w.callKinds.length === 1) parts.push(`${w.callKinds[0] ?? ''} calls`);
  return parts.length ? `When ${parts.join(', ')}` : 'After every call';
};

export const timingLabel = (t: OutcomeRule['timing']): string =>
  t.mode === 'after' ? `${String(t.delayMinutes ?? 0)} min after the call` : TIMING_LABELS[t.mode];
