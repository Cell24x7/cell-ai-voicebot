import type { CustomField, FieldType, ImportColumnMapping, ImportJob } from '@/services/api/types';

import { FIELD_KEY, RESERVED_KEYS, slugKey } from './import-text';

/** One column's choice on the mapping screen. */
export interface ColumnChoice {
  index: number;
  header: string;
  samples: string[];
  /** `name` | `phone` | … | `field:<key>` | `new` | `ignore` */
  target: string;
  newKey: string;
  newLabel: string;
  newType: FieldType;
  dateFormat: 'DMY' | 'MDY' | 'YMD';
}

export const BASE_TARGETS = {
  contacts: [
    { value: 'phone', label: 'Phone' },
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'E-mail' },
    { value: 'external_id', label: 'External id' },
    { value: 'tags', label: 'Tags' },
    { value: 'consent_at', label: 'Consent date' },
  ],
  dnd: [
    { value: 'phone', label: 'Phone' },
    { value: 'reason', label: 'Reason' },
  ],
} as const;

/** Server mapping (saved or suggested) → editable choices. */
export const initialChoices = (job: ImportJob): ColumnChoice[] => {
  const mapping = job.mapping?.columns ?? job.suggestedMapping ?? [];
  return job.columns.map((col) => {
    const m = mapping.find((x) => x.index === col.index);
    const target =
      !m || m.target === 'ignore'
        ? 'ignore'
        : m.target === 'field'
          ? `field:${m.key ?? ''}`
          : m.target === 'new_field'
            ? 'new'
            : m.target;
    return {
      index: col.index,
      header: col.header,
      samples: col.samples,
      target,
      newKey: m?.target === 'new_field' ? (m.key ?? slugKey(col.header)) : slugKey(col.header),
      newLabel: m?.target === 'new_field' ? (m.label ?? col.header) : col.header,
      newType: m?.type ?? 'text',
      dateFormat: m?.dateFormat ?? 'DMY',
    };
  });
};

/** Is this choice a date column (date-format select shown)? */
export const isDateChoice = (c: ColumnChoice, fields: CustomField[]): boolean =>
  c.target === 'consent_at' ||
  (c.target === 'new' && c.newType === 'date') ||
  (c.target.startsWith('field:') &&
    fields.find((f) => `field:${f.key}` === c.target)?.type === 'date');

/** Client rules (the server checks the same): per-column messages + a global one. */
export const checkChoices = (
  choices: ColumnChoice[],
  fields: CustomField[],
): { columns: Record<number, string>; global: string | null } => {
  const columns: Record<number, string> = {};
  const seen = new Map<string, number>();
  const existing = new Set(fields.map((f) => f.key));
  for (const c of choices) {
    if (c.target === 'ignore') continue;
    const id = c.target === 'new' ? `field:${c.newKey}` : c.target;
    if (seen.has(id)) columns[c.index] = 'Already used by another column';
    seen.set(id, c.index);
    if (c.target === 'new') {
      if (!c.newLabel.trim()) columns[c.index] = 'Enter a name for the new field';
      else if (!FIELD_KEY.test(c.newKey) || RESERVED_KEYS.includes(c.newKey))
        columns[c.index] = 'Key: lower-case letters, digits, _ (not a reserved word)';
      else if (existing.has(c.newKey))
        columns[c.index] = 'A field with this key exists — choose it instead';
    }
  }
  return {
    columns,
    global: seen.has('phone') ? null : 'Choose which column has the phone numbers',
  };
};

/** Choices → API mapping columns. */
export const toMapping = (choices: ColumnChoice[], fields: CustomField[]): ImportColumnMapping[] =>
  choices.map((c) => {
    const date = isDateChoice(c, fields) ? { dateFormat: c.dateFormat } : {};
    if (c.target === 'new') {
      return {
        index: c.index,
        target: 'new_field',
        key: c.newKey,
        label: c.newLabel.trim(),
        type: c.newType,
        ...date,
      };
    }
    if (c.target.startsWith('field:'))
      return { index: c.index, target: 'field', key: c.target.slice(6), ...date };
    return { index: c.index, target: c.target as ImportColumnMapping['target'], ...date };
  });
