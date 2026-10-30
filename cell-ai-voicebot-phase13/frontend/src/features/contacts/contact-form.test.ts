import { describe, expect, it } from 'vitest';

import type { Contact, CustomField } from '@/services/api/types';

import { buildContactSchema, contactDefaults, toContactInput } from './contact-form';

const f = (key: string, type: CustomField['type'], required = false): CustomField => ({
  id: key,
  key,
  label: key,
  type,
  required,
  defaultValue: null,
  order: 1,
  createdAt: 'x',
  updatedAt: 'x',
});
const FIELDS = [
  f('dpd', 'number'),
  f('due', 'date'),
  f('alt', 'phone'),
  f('note', 'text', true),
  f('amt', 'currency'),
];
const base = {
  phone: '9876543210',
  name: '',
  email: '',
  externalId: '',
  tags: [],
  listIds: [],
  consentSource: '',
};

describe('contact form schema', () => {
  it.each([
    [{ dpd: 'x' }, 'variables.dpd', 'Enter a number'],
    [{ due: '05/10/2026' }, 'variables.due', 'Choose a date'],
    [{ alt: '123' }, 'variables.alt', 'Not a valid phone number'],
    [{ note: '' }, 'variables.note', 'Required'],
    [{ amt: '1.005' }, 'variables.amt', 'Amount in rupees, e.g. 12500.50'],
  ])('%j', (vars, path, message) => {
    const result = buildContactSchema(FIELDS).safeParse({
      ...base,
      variables: { dpd: '', due: '', alt: '', note: 'x', amt: '', ...vars },
    });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path.join('.') === path);
    expect(issue?.message).toBe(message);
  });

  it('accepts good values (Indian grouping allowed)', () => {
    expect(
      buildContactSchema(FIELDS).safeParse({
        ...base,
        variables: {
          dpd: '1,200',
          due: '2026-10-05',
          alt: '+91 98765 43211',
          note: 'ok',
          amt: '1,25,000.50',
        },
      }).success,
    ).toBe(true);
  });
});

describe('edit mode', () => {
  const contact = {
    id: 'c1',
    phoneE164: '+919876543210',
    name: 'Asha',
    email: null,
    externalId: 'LN-1',
    variables: { amt: 12_500_100_000, note: 'old', dpd: 3 },
    tags: ['vip'],
    listIds: ['l1'],
    consent: { source: 'Loan agreement', at: '2026-01-01T00:00:00Z' },
  } as unknown as Contact;

  it('prefills from the contact (currency in rupees)', () => {
    expect(contactDefaults(FIELDS, contact)).toMatchObject({
      phone: '+919876543210',
      name: 'Asha',
      externalId: 'LN-1',
      consentSource: 'Loan agreement',
      variables: { amt: '12500.10', note: 'old', dpd: '3', due: '' },
    });
    expect(contactDefaults(FIELDS).variables).toEqual({
      dpd: '',
      due: '',
      alt: '',
      note: '',
      amt: '',
    });
  });

  it('clears emptied values, keeps unchanged consent, records a new consent', () => {
    const values = {
      ...contactDefaults(FIELDS, contact),
      variables: { ...contactDefaults(FIELDS, contact).variables, dpd: '' },
    };
    const body = toContactInput(values, FIELDS, contact);
    expect(body.variables).toEqual({ amt: '12500.10', note: 'old', dpd: null });
    expect(body).not.toHaveProperty('consent');
    const changed = toContactInput({ ...values, consentSource: '' }, FIELDS, contact);
    expect(changed.consent).toBeNull();
  });
});
