import type { Retention } from '@/services/api/types';

export type RetentionKind = 'recordingsDays' | 'callsDays' | 'inboxDays';
/** Each field as typed: `''` = the platform default. */
export type RetentionDraft = Record<RetentionKind, string>;

export const RETENTION_KINDS: { key: RetentionKind; label: string; what: string }[] = [
  {
    key: 'recordingsDays',
    label: 'Call recordings',
    what: 'The audio file only — the call, its transcript and AI summary stay.',
  },
  {
    key: 'callsDays',
    label: 'Call records',
    what: 'Calls with their transcripts, timelines, AI summaries and recordings.',
  },
  {
    key: 'inboxDays',
    label: 'WhatsApp chats',
    what: 'Messages, photos, files and chat summaries (contacts and conversations stay).',
  },
];

export const draftOf = (r: Retention): RetentionDraft => ({
  recordingsDays: r.settings.recordingsDays === null ? '' : String(r.settings.recordingsDays),
  callsDays: r.settings.callsDays === null ? '' : String(r.settings.callsDays),
  inboxDays: r.settings.inboxDays === null ? '' : String(r.settings.inboxDays),
});

const valueOf = (text: string): number | null => (text.trim() === '' ? null : Number(text));

export const bodyOf = (d: RetentionDraft) => ({
  recordingsDays: valueOf(d.recordingsDays),
  callsDays: valueOf(d.callsDays),
  inboxDays: valueOf(d.inboxDays),
});

/** The platform default shown for an empty field (chats may be kept forever). */
export const defaultOf = (r: Retention, key: RetentionKind): number | null => {
  const max = r.bounds[key].max;
  if (key === 'inboxDays') return r.cap.inboxDays ?? r.platform.inboxDays;
  return max;
};

export const daysText = (days: number | null): string =>
  days === null ? 'kept forever' : `${String(days)} day${days === 1 ? '' : 's'}`;

/** What the purge would use with this draft (mirrors the backend clamp). */
export const effectiveOf = (r: Retention, d: RetentionDraft) => {
  const b = bodyOf(d);
  const callsDays = Math.min(b.callsDays ?? r.bounds.callsDays.max, r.bounds.callsDays.max);
  const inboxDefault = defaultOf(r, 'inboxDays');
  return {
    callsDays,
    recordingsDays: Math.min(b.recordingsDays ?? callsDays, callsDays),
    inboxDays:
      b.inboxDays === null
        ? inboxDefault
        : inboxDefault === null
          ? b.inboxDays
          : Math.min(b.inboxDays, inboxDefault),
  };
};

/** What is wrong with one field, or `null`. */
export const fieldProblem = (r: Retention, d: RetentionDraft, key: RetentionKind) => {
  const text = d[key].trim();
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isInteger(n)) return 'Whole days only';
  const { min } = r.bounds[key];
  const max =
    key === 'recordingsDays'
      ? Math.min(
          r.bounds.recordingsDays.max,
          effectiveOf(r, { ...d, recordingsDays: '' }).callsDays,
        )
      : r.bounds[key].max;
  if (n < min || n > max) return `Between ${String(min)} and ${String(max)} days`;
  return null;
};

/** Sentences for the confirm dialog: each kind that would now keep less. */
export const shorteningOf = (r: Retention, d: RetentionDraft): string[] => {
  const next = effectiveOf(r, d);
  const now = r.effective;
  const lines: string[] = [];
  const shorter = (a: number | null, b: number | null) => a !== null && (b === null || a < b);
  if (shorter(next.recordingsDays, now.recordingsDays))
    lines.push(
      `Recordings older than ${String(next.recordingsDays)} days will be deleted tonight.`,
    );
  if (shorter(next.callsDays, now.callsDays))
    lines.push(`Call records older than ${String(next.callsDays)} days will be deleted tonight.`);
  if (next.inboxDays !== null && shorter(next.inboxDays, now.inboxDays))
    lines.push(
      `WhatsApp messages older than ${String(next.inboxDays)} days will be deleted tonight.`,
    );
  return lines;
};
