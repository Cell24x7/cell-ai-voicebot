import { describe, expect, it } from 'vitest';

import { describeReason, slugKey } from './import-text';

describe('describeReason', () => {
  it('words every reason code', () => {
    expect(describeReason('phone_missing')).toBe('Phone is missing');
    expect(describeReason('type_invalid:due_date')).toBe('due_date: wrong format');
    expect(describeReason('too_long:name')).toBe('name: too long');
    expect(describeReason('missing_required:loan_amount')).toBe('loan_amount: required');
    expect(describeReason('duplicate_of_row:4')).toBe('Same phone as row 4');
    expect(describeReason('duplicate_external_id:7')).toBe('Same external id as row 7');
    expect(describeReason('something_new')).toBe('something_new');
  });

  it('survives codes without a detail', () => {
    expect(describeReason('type_invalid')).toBe(': wrong format');
    expect(describeReason('too_long')).toBe(': too long');
    expect(describeReason('missing_required')).toBe(': required');
    expect(describeReason('duplicate_of_row')).toBe('Same phone as row ');
    expect(describeReason('duplicate_external_id')).toBe('Same external id as row ');
  });
});

describe('slugKey', () => {
  it('matches the server suggestion', () => {
    expect(slugKey('Loan Amt (Rs)')).toBe('loan_amt_rs');
    expect(slugKey('  ')).toBe('field');
    expect(slugKey('2nd EMI')).toBe('f_2nd_emi');
    expect(slugKey('x'.repeat(60))).toHaveLength(40);
  });
});
