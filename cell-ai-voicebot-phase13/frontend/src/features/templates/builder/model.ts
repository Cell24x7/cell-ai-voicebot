import type {
  WhatsAppParameterFormat,
  WhatsAppTemplate,
  WhatsAppTemplateCategory,
  WhatsAppTemplatePurpose,
} from '@/services/api/types';

import { TEMPLATE_LIMITS } from '../limits';
import { componentOf, placeholdersIn } from '../variables';

/**
 * The builder's form state and its conversion to / from Meta's component JSON
 * (the backend stores and validates the JSON — `validate.ts` mirrors it).
 */
export type HeaderKind = 'none' | 'text' | 'image' | 'video' | 'document' | 'location';
export type MediaKind = 'image' | 'video' | 'document';
export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'VOICE_CALL';

export interface ButtonDraft {
  id: string;
  type: ButtonType;
  text: string;
  /** URL buttons: the address (without the `{{1}}` suffix when `dynamic`). */
  url: string;
  /** URL buttons: a `{{1}}` suffix the sender fills in (e.g. a loan number). */
  dynamic: boolean;
  /** URL suffix example / copy code example. */
  example: string;
  phone: string;
}

export interface BuilderState {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  parameterFormat: WhatsAppParameterFormat;
  headerKind: HeaderKind;
  headerText: string;
  /** Sample value of the header's variable. */
  headerExample: string;
  body: string;
  /** Sample value per body variable key. */
  examples: Record<string, string>;
  footer: string;
  buttons: ButtonDraft[];
  purpose: WhatsAppTemplatePurpose;
  ttlSeconds: number | null;
}

export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'video', 'document'];
export const isMediaHeader = (kind: HeaderKind): kind is MediaKind =>
  (MEDIA_KINDS as readonly string[]).includes(kind);

export const BUTTON_LABELS: Record<ButtonType, string> = {
  QUICK_REPLY: 'Quick reply',
  URL: 'Website',
  PHONE_NUMBER: 'Phone number',
  COPY_CODE: 'Copy code',
  VOICE_CALL: 'Call on WhatsApp',
};

export const BUTTON_CAPS: Record<ButtonType, number> = {
  QUICK_REPLY: TEMPLATE_LIMITS.quickRepliesMax,
  URL: TEMPLATE_LIMITS.urlButtonsMax,
  PHONE_NUMBER: TEMPLATE_LIMITS.phoneButtonsMax,
  COPY_CODE: TEMPLATE_LIMITS.copyCodeButtonsMax,
  VOICE_CALL: TEMPLATE_LIMITS.voiceCallButtonsMax,
};

let seq = 0;
const nextId = () => {
  seq += 1;
  return `b${String(seq)}`;
};

export const emptyButton = (type: ButtonType): ButtonDraft => ({
  id: nextId(),
  type,
  text: type === 'VOICE_CALL' ? 'Call us' : '',
  url: '',
  dynamic: false,
  example: '',
  phone: '',
});

export const emptyState = (over: Partial<BuilderState> = {}): BuilderState => ({
  name: '',
  language: 'en',
  category: 'UTILITY',
  parameterFormat: 'positional',
  headerKind: 'none',
  headerText: '',
  headerExample: '',
  body: '',
  examples: {},
  footer: '',
  buttons: [],
  purpose: 'general',
  ttlSeconds: null,
  ...over,
});

/** Typed text → a valid template name: lower case, `_` for spaces and other characters. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, TEMPLATE_LIMITS.nameMax);

/** Unique body variable keys in order of appearance. */
export const bodyKeys = (body: string): string[] => [...new Set(placeholdersIn(body))];

/** The text to insert for a new body variable. */
export const nextVariable = (
  body: string,
  format: WhatsAppParameterFormat,
  name?: string,
): string => {
  if (format === 'named') {
    const keys = new Set(bodyKeys(body));
    const base = slugify(name?.trim() ?? '').replace(/^_+|_+$/g, '') || 'variable';
    let key = /^\d/.test(base) ? `v_${base}` : base;
    for (let i = 2; keys.has(key); i += 1) key = `${base}_${String(i)}`;
    return `{{${key}}}`;
  }
  const numbers = bodyKeys(body)
    .map(Number)
    .filter((n) => Number.isInteger(n));
  return `{{${String(Math.max(0, ...numbers) + 1)}}}`;
};

/** Inserts `snippet` at `at` (the caret), keeping a space on both sides. */
export const insertAt = (text: string, snippet: string, at = text.length): string => {
  const before = text.slice(0, at);
  const after = text.slice(at);
  const left = before && !/\s$/.test(before) ? ' ' : '';
  const right = after && !/^\s/.test(after) ? ' ' : '';
  return `${before}${left}${snippet}${right}${after}`;
};

const kinds = (buttons: readonly { type: string }[]) =>
  buttons.map((b) => (b.type === 'QUICK_REPLY' ? 'q' : 'o')).join('');
/** Quick replies sit together, before or after all other buttons (Meta's rule). */
export const groupingOk = (buttons: readonly { type: string }[]): boolean =>
  !/q+o+q+|o+q+o+/.test(kinds(buttons));

/** A new button goes where the grouping rule stays true. */
export const addButton = (buttons: readonly ButtonDraft[], type: ButtonType): ButtonDraft[] => {
  const button = emptyButton(type);
  const quick = buttons.map((b) => b.type === 'QUICK_REPLY');
  const firstQuick = quick.indexOf(true);
  if (firstQuick === -1) return [...buttons, button];
  const lastQuick = quick.lastIndexOf(true);
  if (type === 'QUICK_REPLY') {
    return [...buttons.slice(0, lastQuick + 1), button, ...buttons.slice(lastQuick + 1)];
  }
  // quick replies first → others after them; others first → before the quick replies
  return firstQuick === 0
    ? [...buttons, button]
    : [...buttons.slice(0, firstQuick), button, ...buttons.slice(firstQuick)];
};

export const moveButton = (
  buttons: readonly ButtonDraft[],
  index: number,
  by: -1 | 1,
): ButtonDraft[] | null => {
  const to = index + by;
  if (to < 0 || to >= buttons.length) return null;
  const next = [...buttons];
  const a = next[index];
  const b = next[to];
  if (!a || !b) return null;
  next[index] = b;
  next[to] = a;
  return groupingOk(next) ? next : null;
};

export const canAddButton = (buttons: readonly ButtonDraft[], type: ButtonType): boolean =>
  buttons.length < TEMPLATE_LIMITS.buttonsMax &&
  buttons.filter((b) => b.type === type).length < BUTTON_CAPS[type];

const namedParams = (keys: string[], examples: Record<string, string>) =>
  keys.map((k) => ({ param_name: k, example: examples[k] ?? '' }));

/** Form state → Meta's component JSON (what the API takes). */
export const toComponents = (s: BuilderState): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];
  const named = s.parameterFormat === 'named';
  if (s.headerKind === 'text') {
    const keys = placeholdersIn(s.headerText);
    const header: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: s.headerText };
    if (keys.length) {
      header.example = named
        ? {
            header_text_named_params: namedParams(keys.slice(0, 1), {
              [keys[0] ?? '']: s.headerExample,
            }),
          }
        : { header_text: [s.headerExample] };
    }
    out.push(header);
  } else if (s.headerKind !== 'none') {
    out.push({ type: 'HEADER', format: s.headerKind.toUpperCase() });
  }
  const keys = bodyKeys(s.body);
  const body: Record<string, unknown> = { type: 'BODY', text: s.body };
  if (keys.length) {
    body.example = named
      ? { body_text_named_params: namedParams(keys, s.examples) }
      : { body_text: [keys.map((k) => s.examples[k] ?? '')] };
  }
  out.push(body);
  if (s.footer) out.push({ type: 'FOOTER', text: s.footer });
  if (s.purpose === 'call_permission') out.push({ type: 'call_permission_request' });
  else if (s.buttons.length) {
    out.push({
      type: 'BUTTONS',
      buttons: s.buttons.map((b) => {
        switch (b.type) {
          case 'QUICK_REPLY':
          case 'VOICE_CALL':
            return { type: b.type, text: b.text };
          case 'PHONE_NUMBER':
            return { type: b.type, text: b.text, phone_number: b.phone };
          case 'COPY_CODE':
            return { type: b.type, example: b.example };
          case 'URL':
            return b.dynamic
              ? {
                  type: b.type,
                  text: b.text,
                  url: `${b.url}{{1}}`,
                  example: [`${b.url}${b.example}`],
                }
              : { type: b.type, text: b.text, url: b.url };
        }
      }),
    });
  }
  return out;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** A stored template → form state (the builder only opens editable templates). */
export const fromTemplate = (t: WhatsAppTemplate): BuilderState => {
  const c = t.components as Record<string, unknown>[];
  const named = t.parameterFormat === 'named';
  const header = componentOf(c, 'HEADER');
  const format = str(header?.format).toLowerCase();
  const headerKind: HeaderKind = header
    ? ((['text', 'image', 'video', 'document', 'location'].includes(format)
        ? format
        : 'none') as HeaderKind)
    : 'none';
  const hEx = obj(header?.example);
  const headerExample = named
    ? str(obj(arr(hEx.header_text_named_params)[0]).example)
    : str(arr(hEx.header_text)[0]);
  const bodyC = componentOf(c, 'BODY');
  const body = str(bodyC?.text);
  const bEx = obj(bodyC?.example);
  const examples: Record<string, string> = {};
  if (named) {
    for (const p of arr(bEx.body_text_named_params).map(obj))
      examples[str(p.param_name)] = str(p.example);
  } else {
    arr(arr(bEx.body_text)[0]).forEach((v, i) => {
      examples[String(i + 1)] = str(v);
    });
  }
  const buttons = arr(componentOf(c, 'BUTTONS')?.buttons)
    .map(obj)
    .map((b): ButtonDraft => {
      const type = str(b.type).toUpperCase() as ButtonType;
      const draft = { ...emptyButton(type), text: str(b.text) };
      if (type === 'PHONE_NUMBER') return { ...draft, phone: str(b.phone_number) };
      if (type === 'COPY_CODE') return { ...draft, text: '', example: str(b.example) };
      if (type !== 'URL') return draft;
      const url = str(b.url);
      if (!placeholdersIn(url).length) return { ...draft, url };
      const base = url.replace(/\{\{\s*1\s*\}\}$/, '');
      const ex = str(arr(b.example)[0]);
      return {
        ...draft,
        url: base,
        dynamic: true,
        example: ex.startsWith(base) ? ex.slice(base.length) : ex,
      };
    });
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    parameterFormat: t.parameterFormat,
    headerKind,
    headerText: headerKind === 'text' ? str(header?.text) : '',
    headerExample,
    body,
    examples,
    footer: str(componentOf(c, 'FOOTER')?.text),
    buttons,
    purpose: t.purpose,
    ttlSeconds: t.ttlSeconds,
  };
};

/** The call permission template's starting point (backend `CALL_PERMISSION_BODY`). */
export const CALL_PERMISSION_BODY =
  'Kya hum aapko WhatsApp par call kar sakte hain? Aapke loan / account ke baare mein baat karni hai.';

export const callPermissionState = (language = 'en'): BuilderState =>
  emptyState({
    name: `call_permission_${language.toLowerCase()}`,
    language,
    category: 'UTILITY',
    body: CALL_PERMISSION_BODY,
    purpose: 'call_permission',
  });
