import type { FieldType } from '@/services/api/types';

/** Problem reason codes → words (same texts as the server's error report). */
const REASONS: Record<string, string> = {
  phone_missing: 'Phone is missing',
  phone_invalid: 'Phone is not valid',
  phone_lost_digits: 'Phone lost digits in Excel — format the column as Text',
  email_invalid: 'E-mail is not valid',
  tags_invalid: 'Tags are not valid',
  external_id_taken: 'External id belongs to another contact',
};

export const describeReason = (reason: string): string => {
  if (REASONS[reason]) return REASONS[reason];
  const [code, detail] = reason.split(':');
  switch (code) {
    case 'type_invalid':
      return `${detail ?? ''}: wrong format`;
    case 'too_long':
      return `${detail ?? ''}: too long`;
    case 'missing_required':
      return `${detail ?? ''}: required`;
    case 'duplicate_of_row':
      return `Same phone as row ${detail ?? ''}`;
    case 'duplicate_external_id':
      return `Same external id as row ${detail ?? ''}`;
    default:
      return reason;
  }
};

export const WARNINGS: Record<string, string> = {
  encoding_fallback:
    'The file was not UTF-8 — read as Windows-1252. Check names with special characters.',
  ragged_rows: 'Some rows have more or fewer cells than the header.',
};

export const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Uploaded',
  mapped: 'Mapped',
  validating: 'Checking',
  validated: 'Checked',
  importing: 'Importing',
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
};

export const RESERVED_KEYS = [
  'name',
  'phone',
  'email',
  'tags',
  'lists',
  'id',
  'account',
  'contact',
  'external_id',
  'created_at',
  'updated_at',
  'dnd',
  'opted_out',
  'consent',
  'source',
];

export const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Field key from a label (same as the server's suggestion): `Loan Amt (Rs)` → `loan_amt_rs`. */
export const slugKey = (label: string): string => {
  let key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!key) key = 'field';
  if (!/^[a-z]/.test(key)) key = `f_${key}`.slice(0, 40);
  return key;
};

export const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  currency: 'Amount (₹)',
  date: 'Date',
  phone: 'Phone',
};
