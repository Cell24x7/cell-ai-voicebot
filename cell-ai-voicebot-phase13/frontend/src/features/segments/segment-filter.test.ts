import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type { CustomField, FieldType } from '@/services/api/types';

import {
  checkConditions,
  describeFilter,
  filterErrors,
  filterSize,
  fromFilter,
  hasProblems,
  OPERATORS_BY_TYPE,
  toContactFilter,
  valueCount,
  type ConditionDraft,
} from './segment-filter';

const field = (key: string, type: FieldType): CustomField => ({
  id: key,
  key,
  label: key.toUpperCase(),
  type,
  required: false,
  defaultValue: null,
  order: 1,
  createdAt: 'x',
  updatedAt: 'x',
});
const FIELDS = [
  field('city', 'text'),
  field('dpd', 'number'),
  field('emi', 'currency'),
  field('due', 'date'),
  field('alt', 'phone'),
];
const row = (key: string, op: ConditionDraft['op'], value = '', value2 = ''): ConditionDraft => ({
  key,
  op,
  value,
  value2,
});

describe('segment filter helpers', () => {
  it('has the same operators per type as the server', () => {
    expect(OPERATORS_BY_TYPE.text).not.toContain('gt');
    expect(OPERATORS_BY_TYPE.phone).toEqual(['eq', 'exists', 'not_exists']);
    expect(OPERATORS_BY_TYPE.date).toContain('overdue_by_days');
    expect(valueCount('between')).toBe(2);
    expect(valueCount('exists')).toBe(0);
    expect(valueCount('')).toBe(0);
    expect(valueCount('eq')).toBe(1);
  });

  it('checks each row', () => {
    const problems = checkConditions(
      [
        row('', ''),
        row('gone', 'eq', 'x'),
        row('city', ''),
        row('city', 'gt', '1'),
        row('city', 'eq', ' '),
        row('dpd', 'gt', 'abc'),
        row('emi', 'between', '100.505', '1,00,000'),
        row('due', 'on', '05/10/2026'),
        row('due', 'within_next_days', '3651'),
        row('due', 'overdue_by_days', '1.5'),
        row('alt', 'exists'),
        row('dpd', 'gte', '30'),
      ],
      FIELDS,
    );
    expect(problems).toEqual([
      { key: 'Choose a field' },
      { key: 'This field no longer exists' },
      { op: 'Choose a condition' },
      { op: 'Choose a condition' },
      { value: 'Enter a value' },
      { value: 'Enter a number' },
      { value: 'Amount in rupees, up to 2 decimals' },
      { value: 'Pick a date' },
      { value: 'Whole days, 0–3650' },
      { value: 'Whole days, 0–3650' },
      {},
      {},
    ]);
    expect(hasProblems(problems)).toBe(true);
    expect(hasProblems([{}, {}])).toBe(false);
  });

  it('builds the API filter, leaving out rows with problems', () => {
    const state = fromFilter({});
    expect(toContactFilter(state, FIELDS)).toEqual({});
    const filter = toContactFilter(
      {
        ...state,
        conditions: [
          row('dpd', 'gt', '30'),
          row('emi', 'between', '1,000', '25000.50'),
          row('due', 'within_next_days', '7'),
          row('alt', 'not_exists'),
          row('city', 'contains', ' pune '),
          row('city', 'eq', ''),
        ],
        tags: ['march'],
        tagsMode: 'all',
        listIds: ['l1'],
        dnd: 'false',
        optedOut: 'true',
        rest: { q: 'asha' },
      },
      FIELDS,
    );
    expect(filter).toEqual({
      q: 'asha',
      listIds: ['l1'],
      tags: { mode: 'all', values: ['march'] },
      dnd: false,
      optedOut: true,
      conditions: [
        { key: 'dpd', op: 'gt', value: '30' },
        { key: 'emi', op: 'between', value: '1000', value2: '25000.50' },
        { key: 'due', op: 'within_next_days', value: 7 },
        { key: 'alt', op: 'not_exists' },
        { key: 'city', op: 'contains', value: 'pune' },
      ],
    });
    expect(fromFilter(filter)).toMatchObject({
      tagsMode: 'all',
      dnd: 'false',
      optedOut: 'true',
      rest: { q: 'asha' },
      conditions: expect.arrayContaining([
        row('due', 'within_next_days', '7'),
        row('alt', 'not_exists'),
      ]) as unknown,
    });
    expect(fromFilter({ dnd: true, createdFrom: 'a', createdTo: 'b' })).toMatchObject({
      dnd: 'true',
      rest: { createdFrom: 'a', createdTo: 'b' },
    });
    expect(filterSize(filter)).toBe(10);
    expect(filterSize({ createdTo: 'x' })).toBe(1);
  });

  it('describes filters in words', () => {
    expect(describeFilter({}, FIELDS)).toBe('All contacts');
    expect(
      describeFilter(
        {
          conditions: [
            { key: 'dpd', op: 'gt', value: 30 },
            { key: 'emi', op: 'between', value: 1, value2: 2 },
            { key: 'due', op: 'within_next_days', value: 7 },
            { key: 'due', op: 'overdue_by_days', value: 30 },
            { key: 'alt', op: 'exists' },
            { key: 'gone', op: 'eq', value: 'x' },
          ],
          tags: { mode: 'any', values: ['a', 'b'] },
          listIds: ['l1', 'l2'],
          dnd: true,
          optedOut: false,
          q: 'asha',
        },
        FIELDS,
      ),
    ).toBe(
      'DPD more than 30 · EMI between 1 and 2 · DUE in the next 7 days · DUE at least 30 days ago · ALT has a value · gone is x · tags any of a, b · in 2 lists · on do-not-call · not opted out · matching "asha"',
    );
    expect(
      describeFilter(
        { tags: { mode: 'all', values: ['x'] }, listIds: ['l'], dnd: false, optedOut: true },
        [],
      ),
    ).toBe('tags all of x · in 1 list · not on do-not-call · opted out');
  });

  it('maps server error paths to builder paths', () => {
    const err = new ApiError({
      status: 422,
      code: 'VALIDATION_FAILED',
      kind: 'http',
      message: 'bad',
      details: [
        { path: 'body.filter.conditions.0.value', message: 'Must be a number' },
        { path: 'filter.conditions.1.value2', message: 'Bad' },
        { path: 'body.name', message: 'Too long' },
      ],
    });
    expect(filterErrors(err)).toEqual({
      'conditions.0.value': 'Must be a number',
      'conditions.1.value2': 'Bad',
    });
  });
});
