import type {
  WhatsAppParameterFormat,
  WhatsAppTemplateComponent,
  WhatsAppTemplateVariable,
} from '@/services/api/types';

/**
 * Mirror of the backend `src/modules/templates/variables.ts`: `{{1}}` / `{{first_name}}`
 * placeholders, our variable keys and the rendered text.
 */
export const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export const placeholdersIn = (text: string): string[] =>
  [...text.matchAll(PLACEHOLDER)].map((m) => (m[1] ?? '').toLowerCase());

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

type Components = readonly Record<string, unknown>[] | readonly WhatsAppTemplateComponent[];

export const componentOf = (
  components: Components,
  kind: string,
): Record<string, unknown> | undefined =>
  (components as readonly Record<string, unknown>[]).find(
    (c) => str(c.type).toUpperCase() === kind,
  );

/** `TEXT` / `IMAGE` / `VIDEO` / `DOCUMENT` / `LOCATION`, or '' without a header. */
export const headerFormat = (components: Components): string =>
  str(componentOf(components, 'HEADER')?.format).toUpperCase();

/** Our unique variable keys: body = Meta's key; header = `header_<key>`; buttons by index. */
export const headerKey = (raw: string, format: WhatsAppParameterFormat) =>
  format === 'named' ? raw : `header_${raw}`;
export const urlButtonKey = (index: number) => `button_${String(index)}`;
export const copyCodeKey = (index: number) => `copy_code_${String(index)}`;

const namedExamples = (example: unknown, field: string): Map<string, string> =>
  new Map(
    arr(obj(example)[field]).map((p) => [str(obj(p).param_name), str(obj(p).example)] as const),
  );

export type ExtractedVariable = Omit<WhatsAppTemplateVariable, 'defaultSource'>;

/** Variables of a template (header text, body, URL suffix, copy code) with Meta's examples. */
export const extractVariables = (
  components: Components,
  format: WhatsAppParameterFormat,
): ExtractedVariable[] => {
  const out: ExtractedVariable[] = [];
  const seen = new Set<string>();
  const add = (v: ExtractedVariable) => {
    if (seen.has(v.key)) return;
    seen.add(v.key);
    out.push(v);
  };
  const header = componentOf(components, 'HEADER');
  if (header && str(header.format).toUpperCase() === 'TEXT') {
    const names = placeholdersIn(str(header.text));
    const ex = obj(header.example);
    const named = namedExamples(header.example, 'header_text_named_params');
    names.forEach((raw, i) => {
      add({
        key: headerKey(raw, format),
        component: 'header',
        index: 0,
        example: format === 'named' ? (named.get(raw) ?? '') : str(arr(ex.header_text)[i]),
      });
    });
  }
  const body = componentOf(components, 'BODY');
  if (body) {
    const positional = arr(arr(obj(body.example).body_text)[0]);
    const named = namedExamples(body.example, 'body_text_named_params');
    for (const raw of placeholdersIn(str(body.text))) {
      add({
        key: raw,
        component: 'body',
        index: 0,
        example: format === 'named' ? (named.get(raw) ?? '') : str(positional[Number(raw) - 1]),
      });
    }
  }
  arr(componentOf(components, 'BUTTONS')?.buttons)
    .map(obj)
    .forEach((b, index) => {
      const type = str(b.type).toUpperCase();
      if (type === 'URL' && placeholdersIn(str(b.url)).length) {
        const example = str(arr(b.example)[0]);
        const prefix = str(b.url).split('{{')[0] ?? '';
        add({
          key: urlButtonKey(index),
          component: 'button',
          index,
          // the example is a full URL: the variable is its suffix
          example: example.startsWith(prefix) ? example.slice(prefix.length) : example,
        });
      }
      if (type === 'COPY_CODE') {
        add({ key: copyCodeKey(index), component: 'button', index, example: str(b.example) });
      }
    });
  return out;
};

/** Text with values filled in (missing → the placeholder stays). */
export const renderText = (
  text: string,
  values: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  keyOf: (raw: string) => string = (raw) => raw,
): string => {
  const get = (k: string): string | undefined =>
    values instanceof Map
      ? (values as ReadonlyMap<string, string>).get(k)
      : (values as Readonly<Record<string, string>>)[k];
  return text.replace(PLACEHOLDER, (whole: string, raw: string): string => {
    const v = get(keyOf(raw.toLowerCase()));
    return v === undefined || v === '' ? whole : v;
  });
};

/** Every variable → its example (Meta's sample values). */
export const sampleValues = (variables: readonly ExtractedVariable[]): Record<string, string> =>
  Object.fromEntries(variables.map((v) => [v.key, v.example]));
