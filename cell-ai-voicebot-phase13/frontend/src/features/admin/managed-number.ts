import type { ManagedNumberInput } from '@/services/api/admin-whatsapp';

const DIGITS = /^\d+$/;

/** Field problems before we ask the server (empty = ready). */
export const managedNumberProblems = (
  f: ManagedNumberInput,
): Partial<Record<keyof ManagedNumberInput, string>> => {
  const out: Partial<Record<keyof ManagedNumberInput, string>> = {};
  if (!f.label.trim()) out.label = 'Enter a label';
  if (!DIGITS.test(f.wabaId)) out.wabaId = 'Digits only';
  if (!DIGITS.test(f.phoneNumberId)) out.phoneNumberId = 'Digits only';
  if (f.apiKey.length < 8 || /\s/.test(f.apiKey)) out.apiKey = 'At least 8 characters, no spaces';
  return out;
};
