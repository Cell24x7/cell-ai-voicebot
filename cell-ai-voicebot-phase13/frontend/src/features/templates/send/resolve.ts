import type {
  CustomField,
  WhatsAppTemplateVariable,
  WhatsAppVariableSourceKind,
} from '@/services/api/types';
import { formatFieldValue } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

/** The contact fields a template variable can come from (inbox panel or contact page). */
export interface SendContact {
  id: string;
  name: string | null;
  phoneE164: string;
  email: string | null;
  variables: Record<string, unknown>;
  dnd: boolean;
  optedOutAt: string | null;
  /** `undefined` when the screen doesn't know (the inbox panel). */
  consent?: { source: string; at: string } | null;
}

export interface VariableChoice {
  kind: WhatsAppVariableSourceKind;
  /** Custom field key (`field`) or the text (`static` / `ask`). */
  value: string;
}

const scalar = (v: unknown): string | number | null =>
  typeof v === 'string' || typeof v === 'number' ? v : null;

/**
 * The text a variable gets for this contact — the same formatting as the backend
 * (`formatVariableValue`, shared cases in template-format-cases.json). '' = missing.
 */
export const resolveVariable = (
  choice: VariableChoice,
  contact: SendContact,
  fields: readonly Pick<CustomField, 'key' | 'type'>[],
): string => {
  switch (choice.kind) {
    case 'contact.name':
      return contact.name?.trim() ?? '';
    case 'contact.phone':
      return formatPhone(contact.phoneE164);
    case 'contact.email':
      return contact.email ?? '';
    case 'field': {
      const type = fields.find((f) => f.key === choice.value)?.type ?? 'text';
      const raw = scalar(contact.variables[choice.value]);
      const text = formatFieldValue(type, raw, formatPhone);
      return raw === null || raw === '' ? '' : text;
    }
    case 'static':
    case 'ask':
      return choice.value.trim();
  }
};

/** The starting choice per variable: its remembered default source. */
export const initialChoices = (
  variables: readonly WhatsAppTemplateVariable[],
): Record<string, VariableChoice> =>
  Object.fromEntries(
    variables.map((v) => [
      v.key,
      { kind: v.defaultSource.kind, value: v.defaultSource.value ?? '' },
    ]),
  );

/** Why marketing can't go to this contact (known on screen); the server checks "stopped". */
export const marketingBlock = (contact: SendContact): 'dnd' | 'opted_out' | null =>
  contact.dnd ? 'dnd' : contact.optedOutAt ? 'opted_out' : null;
