import type { AgentPatch } from '@/services/api/agents';
import type { Agent, AgentLanguage, AgentVoice, Disposition, ToneRule } from '@/services/api/types';
import { formatRupeesInput, parseRupeesInput } from '@/utils/money';

/** What the editor edits (money as rupee text, everything else like the API). */
export interface AgentForm {
  name: string;
  description: string;
  persona: string;
  openingLine: string;
  closingLine: string;
  allowedVariables: string[];
  guardrails: {
    neverSay: string[];
    disclosureLine: string;
    complianceMode: 'recovery' | 'general';
  };
  voice: AgentVoice;
  languageMode: 'auto' | 'fixed';
  language: AgentLanguage;
  toneRules: { when: ToneRule['when']; customWhen: string; respond: string }[];
  callBehaviour: Agent['callBehaviour'];
  model: Agent['model'];
  limits: { daily: string; monthly: string; onCap: 'stop' | 'fallback' };
  fallback: Agent['fallback'];
}

export type EditorTab = 'basic' | 'voice' | 'limits';

/** Which tab shows a top-level form field. */
const TAB_OF: Record<keyof AgentForm, EditorTab> = {
  name: 'basic',
  description: 'basic',
  persona: 'basic',
  openingLine: 'basic',
  closingLine: 'basic',
  allowedVariables: 'basic',
  guardrails: 'basic',
  voice: 'voice',
  languageMode: 'voice',
  language: 'voice',
  toneRules: 'voice',
  callBehaviour: 'limits',
  model: 'limits',
  limits: 'limits',
  fallback: 'limits',
};

export const tabOfField = (field: string): EditorTab | null =>
  TAB_OF[field.split('.')[0] as keyof AgentForm] ?? null;

export const toForm = (a: Agent): AgentForm => ({
  name: a.name,
  description: a.description ?? '',
  persona: a.persona,
  openingLine: a.openingLine,
  closingLine: a.closingLine,
  allowedVariables: [...a.allowedVariables],
  guardrails: { ...a.guardrails, neverSay: [...a.guardrails.neverSay] },
  voice: a.voice,
  languageMode: a.languageMode,
  language: a.language,
  toneRules: a.toneRules.map((r) => ({
    when: r.when,
    customWhen: r.customWhen ?? '',
    respond: r.respond,
  })),
  callBehaviour: { ...a.callBehaviour },
  model: { ...a.model },
  limits: {
    daily: a.limits.dailySpendCapMicros ? formatRupeesInput(a.limits.dailySpendCapMicros) : '',
    monthly: a.limits.monthlySpendCapMicros
      ? formatRupeesInput(a.limits.monthlySpendCapMicros)
      : '',
    onCap: a.limits.onCap,
  },
  fallback: { ...a.fallback },
});

/** Spend caps: empty = no cap, at most ₹1,00,000. */
export const CAP_MAX_MICROS = 100_000_000_000;
const parseCap = (text: string) =>
  parseRupeesInput(text, { allowEmpty: true, maxMicros: CAP_MAX_MICROS });
const capMicros = (text: string): number | null => {
  const parsed = parseCap(text);
  return parsed.ok ? parsed.micros : null;
};

/** Client-side problems the server would also refuse (field → message). */
export const formProblems = (f: AgentForm): Record<string, string> => {
  const out: Record<string, string> = {};
  const daily = parseCap(f.limits.daily);
  if (!daily.ok) out['limits.daily'] = daily.message;
  const monthly = parseCap(f.limits.monthly);
  if (!monthly.ok) out['limits.monthly'] = monthly.message;
  f.toneRules.forEach((r, i) => {
    if (r.when === 'custom' && !r.customWhen.trim())
      out[`toneRules.${i}.customWhen`] = 'Describe when this applies';
  });
  return out;
};

const toApi = (f: AgentForm) => ({
  name: f.name.trim(),
  description: f.description.trim() || null,
  persona: f.persona,
  openingLine: f.openingLine,
  closingLine: f.closingLine,
  allowedVariables: f.allowedVariables,
  guardrails: f.guardrails,
  voice: f.voice,
  languageMode: f.languageMode,
  language: f.language,
  toneRules: f.toneRules.map((r) => ({
    when: r.when,
    ...(r.when === 'custom' ? { customWhen: r.customWhen.trim() } : {}),
    respond: r.respond,
  })),
  callBehaviour: f.callBehaviour,
  model: f.model,
  limits: {
    dailySpendCapMicros: capMicros(f.limits.daily) ?? 0,
    monthlySpendCapMicros: capMicros(f.limits.monthly) ?? 0,
    onCap: f.limits.onCap,
  },
  fallback: f.fallback,
});

/** Only the top-level fields that changed (nested objects are sent whole). */
export const toPatch = (initial: AgentForm, current: AgentForm): AgentPatch => {
  const before = toApi(initial) as Record<string, unknown>;
  const after = toApi(current) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key];
  }
  return patch;
};

/** Server error path → form field (`limits.dailySpendCapMicros` → `limits.daily`). */
export const formFieldOf = (path: string): string =>
  path
    .replace(/^(body|query|params)\./, '')
    .replace(/^limits\.dailySpendCapMicros/, 'limits.daily')
    .replace(/^limits\.monthlySpendCapMicros/, 'limits.monthly');

export const VOICE_LABELS: Record<AgentVoice, string> = {
  alloy: 'Alloy',
  ash: 'Ash',
  ballad: 'Ballad',
  coral: 'Coral',
  echo: 'Echo',
  sage: 'Sage',
  shimmer: 'Shimmer',
  verse: 'Verse',
  marin: 'Marin',
  cedar: 'Cedar',
};

export const LANGUAGE_LABELS: Record<AgentLanguage, string> = {
  hinglish: 'Hinglish',
  hi: 'Hindi',
  en: 'English',
};

export const TONE_LABELS: Record<ToneRule['when'], string> = {
  angry: 'Angry',
  confused: 'Confused',
  sad: 'Sad',
  in_a_hurry: 'In a hurry',
  abusive: 'Abusive',
  custom: 'Custom…',
};

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  paid: 'Paid',
  promise_to_pay: 'Promise to pay',
  callback_requested: 'Callback requested',
  wrong_number: 'Wrong number',
  refused_to_pay: 'Refused to pay',
  dispute: 'Dispute',
  not_interested: 'Not interested',
  language_barrier: 'Language barrier',
  other: 'Other',
};
