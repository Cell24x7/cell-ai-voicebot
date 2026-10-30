import { toApiError } from '@/services/api/errors';
import type {
  ContactFilter,
  ContactFilterCondition,
  CustomField,
  FieldType,
} from '@/services/api/types';

export type FilterOp = ContactFilterCondition['op'];

/** Same table as the server (`filter.schema.ts`). */
export const OPERATORS_BY_TYPE: Record<FieldType, readonly FilterOp[]> = {
  text: ['eq', 'neq', 'contains', 'exists', 'not_exists'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'exists', 'not_exists'],
  currency: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'exists', 'not_exists'],
  date: [
    'on',
    'before',
    'after',
    'between',
    'within_next_days',
    'overdue_by_days',
    'exists',
    'not_exists',
  ],
  phone: ['eq', 'exists', 'not_exists'],
};

export const OP_LABEL: Record<FilterOp, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  gt: 'more than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  on: 'on',
  before: 'before',
  after: 'after',
  within_next_days: 'in the next … days',
  overdue_by_days: 'at least … days ago',
  within_last_days: 'in the last … days',
  exists: 'has a value',
  not_exists: 'is empty',
};

export const MAX_CONDITIONS = 20;
const MAX_DAYS = 3650;

export const valueCount = (op: FilterOp | ''): 0 | 1 | 2 =>
  op === '' || op === 'exists' || op === 'not_exists' ? 0 : op === 'between' ? 2 : 1;

export const isDaysOp = (op: FilterOp | ''): boolean =>
  op === 'within_next_days' || op === 'overdue_by_days';

export type Tri = '' | 'true' | 'false';

/** One condition row while it is being edited (values as typed). */
export interface ConditionDraft {
  key: string;
  op: FilterOp | '';
  value: string;
  value2: string;
}

/** The builder's editable state. Parts the builder doesn't edit are kept in `rest`. */
export interface BuilderState {
  conditions: ConditionDraft[];
  tagsMode: 'any' | 'all';
  tags: string[];
  listIds: string[];
  dnd: Tri;
  optedOut: Tri;
  rest: Pick<ContactFilter, 'q' | 'createdFrom' | 'createdTo'>;
}

export const emptyCondition = (): ConditionDraft => ({ key: '', op: '', value: '', value2: '' });

const tri = (v: boolean | undefined): Tri => (v === undefined ? '' : v ? 'true' : 'false');
const text = (v: string | number | undefined): string => (v === undefined ? '' : String(v));

export const fromFilter = (filter: ContactFilter = {}): BuilderState => ({
  conditions: (filter.conditions ?? []).map((c) => ({
    key: c.key,
    op: c.op,
    value: text(c.value),
    value2: text(c.value2),
  })),
  tagsMode: filter.tags?.mode ?? 'any',
  tags: filter.tags?.values ?? [],
  listIds: filter.listIds ?? [],
  dnd: tri(filter.dnd),
  optedOut: tri(filter.optedOut),
  rest: {
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.createdFrom ? { createdFrom: filter.createdFrom } : {}),
    ...(filter.createdTo ? { createdTo: filter.createdTo } : {}),
  },
});

const DECIMAL = /^-?\d+(\.\d+)?$/;
const RUPEES = /^-?\d+(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problem with one typed value, or `null`. */
const checkValue = (type: FieldType, op: FilterOp, raw: string): string | null => {
  const v = raw.trim().replace(/,/g, '');
  if (!v) return 'Enter a value';
  if (isDaysOp(op)) {
    const n = Number(v);
    return /^\d+$/.test(v) && n <= MAX_DAYS ? null : `Whole days, 0–${MAX_DAYS}`;
  }
  switch (type) {
    case 'number':
      return DECIMAL.test(v) ? null : 'Enter a number';
    case 'currency':
      return RUPEES.test(v) ? null : 'Amount in rupees, up to 2 decimals';
    case 'date':
      return DATE.test(v) ? null : 'Pick a date';
    default:
      return null;
  }
};

export interface ConditionProblem {
  key?: string;
  op?: string;
  value?: string;
  value2?: string;
}

/** Per-row problems (empty object = fine). */
export const checkConditions = (
  conditions: ConditionDraft[],
  fields: CustomField[],
): ConditionProblem[] =>
  conditions.map((c) => {
    const field = fields.find((f) => f.key === c.key);
    if (!field) return { key: c.key ? 'This field no longer exists' : 'Choose a field' };
    if (!c.op || !OPERATORS_BY_TYPE[field.type].includes(c.op)) return { op: 'Choose a condition' };
    const problem: ConditionProblem = {};
    if (valueCount(c.op) >= 1) {
      const p = checkValue(field.type, c.op, c.value);
      if (p) problem.value = p;
    }
    if (valueCount(c.op) === 2) {
      const p = checkValue(field.type, c.op, c.value2);
      if (p) problem.value2 = p;
    }
    return problem;
  });

export const hasProblems = (problems: ConditionProblem[]): boolean =>
  problems.some((p) => Object.keys(p).length > 0);

const operand = (type: FieldType, op: FilterOp, raw: string): string | number => {
  const v = raw.trim();
  if (isDaysOp(op)) return Number(v);
  return type === 'number' || type === 'currency' ? v.replace(/,/g, '') : v;
};

/** Builder state → API filter. Rows with problems are left out. */
export const toContactFilter = (state: BuilderState, fields: CustomField[]): ContactFilter => {
  const problems = checkConditions(state.conditions, fields);
  const conditions: ContactFilterCondition[] = [];
  state.conditions.forEach((c, i) => {
    const field = fields.find((f) => f.key === c.key);
    if (!field || !c.op || Object.keys(problems[i] ?? {}).length) return;
    const n = valueCount(c.op);
    conditions.push({
      key: c.key,
      op: c.op,
      ...(n >= 1 ? { value: operand(field.type, c.op, c.value) } : {}),
      ...(n === 2 ? { value2: operand(field.type, c.op, c.value2) } : {}),
    });
  });
  return {
    ...state.rest,
    ...(state.listIds.length ? { listIds: state.listIds } : {}),
    ...(state.tags.length ? { tags: { mode: state.tagsMode, values: state.tags } } : {}),
    ...(state.dnd ? { dnd: state.dnd === 'true' } : {}),
    ...(state.optedOut ? { optedOut: state.optedOut === 'true' } : {}),
    ...(conditions.length ? { conditions } : {}),
  };
};

/** Number of active parts in a filter (for "Advanced filter (3)"). */
export const filterSize = (filter: ContactFilter): number =>
  (filter.conditions?.length ?? 0) +
  (filter.listIds?.length ? 1 : 0) +
  (filter.tags ? 1 : 0) +
  (filter.dnd === undefined ? 0 : 1) +
  (filter.optedOut === undefined ? 0 : 1) +
  (filter.q ? 1 : 0) +
  (filter.createdFrom || filter.createdTo ? 1 : 0);

/** Short human summary: `days_past_due more than 30 · tags any of march`. */
export const describeFilter = (filter: ContactFilter, fields: CustomField[]): string => {
  const parts: string[] = [];
  for (const c of filter.conditions ?? []) {
    const label = fields.find((f) => f.key === c.key)?.label ?? c.key;
    const op =
      c.op === 'within_next_days'
        ? 'in the next'
        : c.op === 'overdue_by_days'
          ? 'at least'
          : OP_LABEL[c.op];
    const tail =
      c.op === 'between'
        ? ` ${text(c.value)} and ${text(c.value2)}`
        : c.value === undefined
          ? ''
          : ` ${text(c.value)}`;
    const days = isDaysOp(c.op) ? (c.op === 'overdue_by_days' ? ' days ago' : ' days') : '';
    parts.push(`${label} ${op}${tail}${days}`);
  }
  if (filter.tags)
    parts.push(
      `tags ${filter.tags.mode === 'all' ? 'all of' : 'any of'} ${filter.tags.values.join(', ')}`,
    );
  if (filter.listIds?.length)
    parts.push(`in ${filter.listIds.length} list${filter.listIds.length === 1 ? '' : 's'}`);
  if (filter.dnd !== undefined) parts.push(filter.dnd ? 'on do-not-call' : 'not on do-not-call');
  if (filter.optedOut !== undefined) parts.push(filter.optedOut ? 'opted out' : 'not opted out');
  if (filter.q) parts.push(`matching "${filter.q}"`);
  return parts.length ? parts.join(' · ') : 'All contacts';
};

/** Server detail paths (`body.filter.conditions.0.value`) → builder paths. */
export const filterErrors = (err: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const d of toApiError(err).details) {
    const path = d.path.replace(/^(body\.)?filter\./, '');
    if (path !== d.path) out[path] = d.message;
  }
  return out;
};
