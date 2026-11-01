import { API_KEY_SCOPES, SCOPE_GROUPS, type ApiKeyScope } from '@/services/api/api-keys';

/** Scopes by group, in the UI order. */
export const scopesByGroup = () =>
  SCOPE_GROUPS.map((group) => ({
    group,
    scopes: API_KEY_SCOPES.filter((s) => s.group === group),
  }));

const V4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const V6 = /^[0-9a-f:]+$/i;

/** One IP or CIDR range (`203.0.113.7`, `203.0.113.0/24`, `2001:db8::/32`) — the server checks again. */
export const isCidr = (entry: string): boolean => {
  const [ip = '', bits, extra] = entry.trim().split('/');
  if (extra !== undefined) return false;
  const v4 = V4.test(ip);
  const v6 = !v4 && ip.includes(':') && V6.test(ip);
  if (!v4 && !v6) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  return Number(bits) <= (v4 ? 32 : 128);
};

/** The allowlist text (one per line / comma) → entries + the bad ones. */
export const parseAllowlist = (text: string): { entries: string[]; bad: string[] } => {
  const entries = text
    .split(/[\s,]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  return { entries, bad: entries.filter((e) => !isCidr(e)) };
};

export interface KeyDraft {
  name: string;
  scopes: ApiKeyScope[];
  allowlist: string;
  /** `YYYY-MM-DD` (end of that day, local), '' = never. */
  expires: string;
}

/** `YYYY-MM-DD` → the end of that local day as ISO, '' → null. */
export const expiryIso = (day: string): string | null =>
  day ? new Date(`${day}T23:59:59`).toISOString() : null;

/** What is wrong with a draft, or null. */
export const keyProblem = (d: KeyDraft, now = new Date()): string | null => {
  if (!d.name.trim()) return 'Give the key a name';
  if (!d.scopes.length) return 'Choose at least one scope';
  const { entries, bad } = parseAllowlist(d.allowlist);
  if (bad.length) return `Not an IP or range: ${bad.join(', ')}`;
  if (entries.length > 20) return 'At most 20 IPs or ranges';
  const iso = expiryIso(d.expires);
  if (iso && new Date(iso) <= now) return 'Choose a date in the future';
  return null;
};
