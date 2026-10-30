import type { PickerVariable } from '@/components/fields/VariablePicker';
import type { FlowCatalog, FlowVariable } from '@/services/api/types';

/** What every step form gets. `set` merges a patch into the config. */
export interface StepFormProps {
  config: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  errors: Record<string, string>;
  /** Variables for `{{…}}` pickers (contact, flow, system). */
  variables: PickerVariable[];
  /** Flow variables (targets of saveAs / set variable / pass to AI). */
  flowVariables: FlowVariable[];
  /** Every variable name a condition may test. */
  allNames: string[];
  catalog: FlowCatalog;
  readOnly: boolean;
}

export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
export const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
export const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;
export const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    : [];
export const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Moves an item up / down. */
export const move = <T>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
};

export const LANGUAGE_LABELS: Record<string, string> = {
  flow: 'Flow default',
  hi: 'Hindi',
  en: 'English',
  hinglish: 'Hinglish',
  auto: 'Auto-detect',
};

/** SMS parts (160 GSM chars per part, 153 when split). */
export const smsParts = (text: string): number =>
  text.length <= 160 ? 1 : Math.ceil(text.length / 153);

/** Plain-language condition operators. */
export const OPERATOR_LABELS: Record<string, string> = {
  equals: 'is',
  not_equals: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  in_list: 'is one of (comma separated)',
  date_before: 'is before date',
  date_after: 'is after date',
};
