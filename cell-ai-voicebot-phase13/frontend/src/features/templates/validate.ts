import type {
  WhatsAppParameterFormat,
  WhatsAppTemplateCategory,
  WhatsAppTemplatePurpose,
} from '@/services/api/types';

import { TEMPLATE_LIMITS } from './limits';
import { placeholdersIn } from './variables';

/**
 * Mirror of the backend `validateTemplate` (src/modules/templates/validate.ts): every
 * Meta rule checked before submitting, one error per field path, the same paths and
 * texts as the server's 422 `details`. Shared cases: src/test/fixtures/template-validate-cases.json.
 */
export const LANGUAGE_PATTERN = /^[a-z]{2,3}(_[A-Za-z]{2,4})?$/;

export interface TemplateDraft {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  parameterFormat: WhatsAppParameterFormat;
  components: readonly Record<string, unknown>[];
  purpose?: WhatsAppTemplatePurpose;
  ttlSeconds?: number | null;
}

export interface FieldError {
  path: string;
  message: string;
}

const NAMED_KEY = /^[a-z_][a-z0-9_]*$/;
const EDGE_VARIABLE = /^\s*\{\{[^}]+\}\}|\{\{[^}]+\}\}\s*$/;
const ADJACENT = /\}\}\s*\{\{/;
const PHONE = /^\+?\d{6,19}$/;
const KNOWN_TYPES = new Set(['HEADER', 'BODY', 'FOOTER', 'BUTTONS', 'call_permission_request']);
const BUTTON_TYPES = new Set(['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'VOICE_CALL']);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const isUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const keysOk = (keys: string[], format: WhatsAppParameterFormat): boolean =>
  format === 'named'
    ? keys.every((k) => NAMED_KEY.test(k) && !/^\d+$/.test(k))
    : keys.every((k, i) => k === String(i + 1));

const length = (text: string, max: number) => text.length >= 1 && text.length <= max;

export const validateTemplate = (input: TemplateDraft): FieldError[] => {
  const errors: FieldError[] = [];
  const add = (path: string, message: string) => {
    if (!errors.some((e) => e.path === path)) errors.push({ path, message });
  };
  const format = input.parameterFormat;
  const purpose = input.purpose ?? 'general';
  const L = TEMPLATE_LIMITS;

  if (!input.name || input.name.length > L.nameMax)
    add('name', `1–${String(L.nameMax)} characters`);
  else if (!L.namePattern.test(input.name))
    add('name', 'Use lower-case letters, numbers and _ only');
  if (!LANGUAGE_PATTERN.test(input.language)) add('language', 'Not a WhatsApp language code');
  if (input.category === 'AUTHENTICATION')
    add('category', 'Authentication templates are created in WhatsApp Manager');
  const ttl = input.ttlSeconds;
  if (
    ttl !== undefined &&
    ttl !== null &&
    (!Number.isInteger(ttl) || ttl < L.ttlMinSeconds || ttl > L.ttlMaxSeconds)
  )
    add('ttlSeconds', `Between ${String(L.ttlMinSeconds)} seconds and 30 days`);

  const components = input.components;
  if (!components.length) add('components', 'A template needs exactly one message body');
  if (components.length > 6) add('components', 'At most 6 components');
  if (components.some((c) => !KNOWN_TYPES.has(str(c.type))))
    add('components', 'Unsupported component');
  const count = (type: string) => components.filter((c) => c.type === type).length;
  for (const type of ['HEADER', 'FOOTER', 'BUTTONS', 'call_permission_request']) {
    if (count(type) > 1) add('components', `Only one ${type.toLowerCase()} component`);
  }
  if (count('BODY') !== 1) add('components.body', 'A template needs exactly one message body');

  let variables = 0;
  const header = components.find((c) => c.type === 'HEADER');
  const headerFormat = str(header?.format);
  if (header && headerFormat === 'TEXT') {
    const text = str(header.text);
    if (!length(text, L.headerTextMax))
      add('components.header.text', `1–${String(L.headerTextMax)} characters`);
    const keys = placeholdersIn(text);
    variables += keys.length;
    if (keys.length > L.headerVariablesMax)
      add('components.header.text', 'The header can have one variable');
    else if (keys.length) {
      const ex = obj(header.example);
      const example =
        format === 'named'
          ? str(obj(arr(ex.header_text_named_params)[0]).example)
          : str(arr(ex.header_text)[0]);
      if (!keysOk(keys, format)) add('components.header.text', 'Variable name format');
      if (!example) add('components.header.example', 'Add an example for the header variable');
    }
  } else if (header && !['IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].includes(headerFormat)) {
    add('components.header.format', 'Choose a header type');
  }
  if (headerFormat === 'LOCATION' && !['UTILITY', 'MARKETING'].includes(input.category))
    add('components.header.format', 'A location header needs a utility or marketing template');

  const body = components.find((c) => c.type === 'BODY');
  if (body) {
    const text = str(body.text);
    if (!length(text, L.bodyMax)) add('components.body.text', `1–${String(L.bodyMax)} characters`);
    const unique = [...new Set(placeholdersIn(text))];
    variables += unique.length;
    if (unique.length) {
      if (!keysOk(unique, format)) {
        add(
          'components.body.text',
          format === 'named'
            ? 'Named variables use lower-case letters, numbers and _ (not a number)'
            : 'Number the variables {{1}}, {{2}}… in order',
        );
      }
      if (EDGE_VARIABLE.test(text))
        add('components.body.text', "The message can't start or end with a variable");
      if (ADJACENT.test(text)) add('components.body.text', 'Put text between two variables');
      const ex = obj(body.example);
      const named = new Set(
        arr(ex.body_text_named_params)
          .map(obj)
          .filter((p) => str(p.example))
          .map((p) => str(p.param_name)),
      );
      const positional = arr(arr(ex.body_text)[0]).filter((v) => str(v));
      const missing =
        format === 'named' ? unique.some((k) => !named.has(k)) : positional.length < unique.length;
      if (missing) add('components.body.example', 'Add an example for every variable');
    }
  }
  const footer = components.find((c) => c.type === 'FOOTER');
  if (footer) {
    const text = str(footer.text);
    if (!length(text, L.footerMax))
      add('components.footer.text', `1–${String(L.footerMax)} characters`);
    if (placeholdersIn(text).length)
      add('components.footer.text', "The footer can't have variables");
  }

  const buttonsComponent = components.find((c) => c.type === 'BUTTONS');
  const buttons = arr(buttonsComponent?.buttons).map(obj);
  if (buttonsComponent && !buttons.length) add('components.buttons', 'Add a button');
  if (buttons.length > L.buttonsMax)
    add('components.buttons', `At most ${String(L.buttonsMax)} buttons`);
  const n = (type: string) => buttons.filter((b) => b.type === type).length;
  const caps: [string, number, string][] = [
    ['QUICK_REPLY', L.quickRepliesMax, 'quick replies'],
    ['URL', L.urlButtonsMax, 'website buttons'],
    ['PHONE_NUMBER', L.phoneButtonsMax, 'phone buttons'],
    ['COPY_CODE', L.copyCodeButtonsMax, 'copy code buttons'],
    ['VOICE_CALL', L.voiceCallButtonsMax, 'WhatsApp call buttons'],
  ];
  for (const [type, max, text] of caps) {
    if (n(type) > max) add('components.buttons', `At most ${String(max)} ${text}`);
  }
  const kinds = buttons.map((b) => (b.type === 'QUICK_REPLY' ? 'q' : 'o')).join('');
  if (/q+o+q+|o+q+o+/.test(kinds))
    add('components.buttons', 'Keep quick replies together, before or after the other buttons');
  buttons.forEach((b, i) => {
    const at = `components.buttons.${String(i)}`;
    const type = str(b.type);
    if (!BUTTON_TYPES.has(type)) {
      add(`${at}.type`, 'Unsupported button');
      return;
    }
    if (type !== 'COPY_CODE' && !length(str(b.text), L.buttonTextMax))
      add(`${at}.text`, `1–${String(L.buttonTextMax)} characters`);
    if (type === 'PHONE_NUMBER' && !PHONE.test(str(b.phone_number)))
      add(`${at}.phone_number`, 'A phone number with the country code');
    if (type === 'COPY_CODE' && !length(str(b.example), L.copyCodeExampleMax))
      add(`${at}.example`, `1–${String(L.copyCodeExampleMax)} characters`);
    if (type !== 'URL') return;
    const url = str(b.url);
    if (!isUrl(url.replace(/\{\{[^}]*\}\}/g, 'x')) || url.length > L.urlMax)
      add(`${at}.url`, 'A full web address (https://…)');
    const keys = placeholdersIn(url);
    if (!keys.length) return;
    variables += 1;
    if (keys.length > 1 || !/\{\{\s*1\s*\}\}$/.test(url))
      add(`${at}.url`, 'One variable {{1}}, at the end of the URL');
    const example = str(arr(b.example)[0]);
    if (!example) add(`${at}.example`, 'Add an example URL');
    else if (!isUrl(example)) add(`${at}.example`, 'A full web address (https://…)');
  });
  variables += n('COPY_CODE');
  if (variables > L.variablesMax) add('components', `At most ${String(L.variablesMax)} variables`);

  const hasPermission = count('call_permission_request') > 0;
  if (purpose === 'call_permission') {
    if (!hasPermission) add('components', 'A call permission template needs the call request');
    if (input.category !== 'UTILITY') add('category', 'Call permission templates are utility');
    if (buttons.length) add('components.buttons', "Call permission templates can't have buttons");
  } else if (hasPermission) {
    add('components', 'Use "Create call permission template" for call requests');
  }
  return errors;
};

/** Errors as `{ path: message }` (first per path). */
export const errorMap = (errors: readonly FieldError[]): Record<string, string> =>
  Object.fromEntries(errors.map((e) => [e.path, e.message]));
