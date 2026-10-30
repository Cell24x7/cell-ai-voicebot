import type { CallInsights } from '@/services/api/types';

/** Why there are no insights (plain words; unknown reasons shown as they are). */
export const REASON_TEXT: Record<string, string> = {
  not_answered: 'The call was not answered.',
  too_short: 'The call was too short to review.',
  disabled: 'AI insights are turned off in Settings.',
  low_balance: 'There was not enough wallet balance.',
  no_transcript: 'No transcript — turn on call transcription in Settings to review team calls.',
  no_recording: 'There is no recording to transcribe.',
  before_insights: 'This call ended before AI insights were available.',
  invalid_output: "The AI's answer could not be read.",
  provider_error: 'The AI service was not available.',
  stt_failed: 'The recording could not be transcribed.',
  empty: 'There were no new messages.',
};

export const reasonText = (reason: string | null | undefined): string =>
  reason ? (REASON_TEXT[reason] ?? reason.replace(/_/g, ' ')) : 'No reason given.';

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export const SENTIMENT_LABELS: Record<SentimentLabel, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
};

export const sentimentColor = (s: SentimentLabel): 'success' | 'default' | 'error' =>
  s === 'positive' ? 'success' : s === 'negative' ? 'error' : 'default';

export const SOURCE_TEXT: Record<NonNullable<CallInsights['dispositionSource']>, string> = {
  flow: 'Set by the flow',
  agent: 'Set by the AI agent',
  user: 'Set by a team member',
  ai: 'Suggested by AI',
};

export const STATUS_TEXT: Record<NonNullable<CallInsights['status']>, string> = {
  pending: 'Working on it',
  done: 'Ready',
  skipped: 'Not made',
  failed: 'Failed',
};

/** Below this the key facts are marked "AI — unsure" (backend INSIGHTS_LIMITS.lowConfidence). */
export const LOW_CONFIDENCE = 0.6;

/** A new outcome key from its label (`Paid in full` → `paid_in_full`). */
export const keyFromLabel = (label: string, taken: string[]): string => {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'outcome';
  let key = base;
  for (let i = 2; taken.includes(key); i += 1) key = `${base}_${String(i)}`;
  return key;
};
