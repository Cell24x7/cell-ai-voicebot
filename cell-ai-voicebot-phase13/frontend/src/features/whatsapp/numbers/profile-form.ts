import type { BusinessProfilePatch } from '@/services/api/whatsapp';

export interface ProfileDraft {
  about: string;
  description: string;
  address: string;
  email: string;
  website1: string;
  website2: string;
  vertical: string;
}

const LIMITS: Record<Exclude<keyof ProfileDraft, 'vertical'>, number> = {
  about: 139,
  description: 512,
  address: 256,
  email: 128,
  website1: 256,
  website2: 256,
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE = /^https?:\/\/[^\s]+$/i;

/** Meta's limits (same as the API): about required ≤ 139, e-mail, http(s) websites. */
export const profileProblems = (d: ProfileDraft): Partial<Record<keyof ProfileDraft, string>> => {
  const out: Partial<Record<keyof ProfileDraft, string>> = {};
  for (const [key, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    if (d[key].trim().length > max) out[key] = `At most ${String(max)} characters`;
  }
  if (!d.about.trim()) out.about = 'Required';
  if (d.email.trim() && !EMAIL.test(d.email.trim())) out.email = 'Not an e-mail address';
  for (const key of ['website1', 'website2'] as const) {
    if (d[key].trim() && !WEBSITE.test(d[key].trim()))
      out[key] = 'Must start with http:// or https://';
  }
  return out;
};

/** Only the changed fields (Meta rejects empty patches). */
export const toProfilePatch = (d: ProfileDraft, before: ProfileDraft): BusinessProfilePatch => {
  const patch: BusinessProfilePatch = {};
  if (d.about !== before.about) patch.about = d.about.trim();
  if (d.description !== before.description) patch.description = d.description.trim();
  if (d.address !== before.address) patch.address = d.address.trim();
  if (d.email !== before.email) patch.email = d.email.trim();
  if (d.website1 !== before.website1 || d.website2 !== before.website2)
    patch.websites = [d.website1, d.website2].map((w) => w.trim()).filter(Boolean);
  if (d.vertical !== before.vertical) patch.vertical = d.vertical;
  return patch;
};

/** `PROF_SERVICES` → "Prof services"; `UNDEFINED` → "Not set". */
export const verticalLabel = (v: string): string =>
  v === 'UNDEFINED'
    ? 'Not set'
    : v === 'NOT_A_BIZ'
      ? 'Not a business'
      : (v.charAt(0) + v.slice(1).toLowerCase()).replace(/_/g, ' ');
