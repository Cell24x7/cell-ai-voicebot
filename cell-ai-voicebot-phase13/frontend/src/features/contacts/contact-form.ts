import { z } from 'zod';

import type { ContactInput, VariablesInput } from '@/services/api/contacts';
import type { Contact, CustomField } from '@/services/api/types';
import { fieldInputValue } from '@/utils/format';
import { isValidPhone } from '@/utils/phone';

const MONEY = /^-?\d+(\.\d{1,2})?$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** zod for one field's text input (empty = no value). */
const fieldSchema = (f: CustomField) => {
  const base = z.string().trim().max(1000, 'Too long (max 1000)');
  const required = (s: z.ZodString) => (f.required ? s.min(1, 'Required') : s);
  switch (f.type) {
    case 'currency':
      return required(base).refine(
        (v) => !v || MONEY.test(v.replace(/,/g, '')),
        'Amount in rupees, e.g. 12500.50',
      );
    case 'number':
      return required(base).refine((v) => !v || NUMBER.test(v.replace(/,/g, '')), 'Enter a number');
    case 'date':
      return required(base).refine((v) => !v || DATE.test(v), 'Choose a date');
    case 'phone':
      return required(base).refine((v) => !v || isValidPhone(v), 'Not a valid phone number');
    default:
      return required(base);
  }
};

/** Form schema built from the account's field definitions. */
export const buildContactSchema = (fields: CustomField[]) =>
  z.object({
    phone: z
      .string()
      .trim()
      .min(1, 'Enter a phone number')
      .refine((v) => isValidPhone(v), 'Not a valid phone number'),
    name: z.string().trim().max(120),
    email: z.union([z.literal(''), z.email('Not a valid e-mail address')]),
    externalId: z.string().trim().max(100),
    tags: z.array(z.string()).max(20, 'At most 20 tags'),
    listIds: z.array(z.string()).max(50),
    consentSource: z.string().trim().max(120),
    variables: z.object(Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)]))),
  });

export type ContactFormValues = z.infer<ReturnType<typeof buildContactSchema>>;

export const contactDefaults = (fields: CustomField[], contact?: Contact): ContactFormValues => ({
  phone: contact?.phoneE164 ?? '',
  name: contact?.name ?? '',
  email: contact?.email ?? '',
  externalId: contact?.externalId ?? '',
  tags: contact?.tags ?? [],
  listIds: contact?.listIds ?? [],
  consentSource: contact?.consent?.source ?? '',
  variables: Object.fromEntries(
    fields.map((f) => [f.key, fieldInputValue(f.type, contact?.variables[f.key])]),
  ),
});

/**
 * Form values → API body. On edit, emptied values become `null` (clear) and
 * unchanged consent keeps its original date.
 */
export const toContactInput = (
  values: ContactFormValues,
  fields: CustomField[],
  contact?: Contact,
): ContactInput & { phone: string } => {
  const variables: VariablesInput = {};
  for (const f of fields) {
    // Sent as text — the server parses every type (no float rounding on rupees).
    const raw = (values.variables[f.key] ?? '').trim();
    if (raw) variables[f.key] = raw;
    else if (contact && contact.variables[f.key] !== undefined) variables[f.key] = null;
  }
  const consentChanged = values.consentSource !== (contact?.consent?.source ?? '');
  return {
    phone: values.phone,
    name: values.name || null,
    email: values.email || null,
    externalId: values.externalId || null,
    tags: values.tags,
    listIds: values.listIds,
    variables,
    ...(consentChanged
      ? {
          consent: values.consentSource
            ? { source: values.consentSource, at: new Date().toISOString() }
            : null,
        }
      : {}),
  };
};
