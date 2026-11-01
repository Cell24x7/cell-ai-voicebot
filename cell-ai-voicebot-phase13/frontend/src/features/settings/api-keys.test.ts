import { describe, expect, it } from 'vitest';

import { API_KEY_SCOPES } from '@/services/api/api-keys';

import { expiryIso, isCidr, keyProblem, parseAllowlist, scopesByGroup } from './api-keys';

const ok = { name: 'CRM', scopes: ['calls:read' as const], allowlist: '', expires: '' };

describe('API key helpers', () => {
  it('groups every scope once, in the UI order', () => {
    const groups = scopesByGroup();
    expect(groups.map((g) => g.group)).toEqual([
      'Calls',
      'Contacts',
      'Campaigns',
      'WhatsApp',
      'Reports',
      'Webhooks',
    ]);
    expect(groups.flatMap((g) => g.scopes)).toHaveLength(API_KEY_SCOPES.length);
    expect(groups[0]?.scopes.map((s) => s.key)).toEqual([
      'calls:read',
      'calls:write',
      'whatsapp-calls:write',
    ]);
  });

  it('accepts IPs and ranges (v4 / v6) and refuses the rest', () => {
    for (const good of ['203.0.113.7', '203.0.113.0/24', '0.0.0.0/0', '2001:db8::/32', '::1'])
      expect(isCidr(good)).toBe(true);
    for (const bad of [
      '256.1.1.1',
      '203.0.113.0/33',
      '2001:db8::/129',
      '1.2.3.4/x',
      '1.2.3.4/8/9',
      'example.com',
      '',
    ])
      expect(isCidr(bad)).toBe(false);
    expect(parseAllowlist(' 203.0.113.7\n10.0.0.0/8, bad ')).toEqual({
      entries: ['203.0.113.7', '10.0.0.0/8', 'bad'],
      bad: ['bad'],
    });
    expect(parseAllowlist('')).toEqual({ entries: [], bad: [] });
  });

  it('expiry is the end of the chosen local day', () => {
    expect(expiryIso('')).toBeNull();
    expect(new Date(expiryIso('2027-01-31') ?? '').getDate()).toBe(31);
    expect(new Date(expiryIso('2027-01-31') ?? '').getHours()).toBe(23);
  });

  it('finds what is wrong with a draft', () => {
    const now = new Date('2026-10-30T10:00:00');
    expect(keyProblem(ok, now)).toBeNull();
    expect(keyProblem({ ...ok, name: ' ' }, now)).toBe('Give the key a name');
    expect(keyProblem({ ...ok, scopes: [] }, now)).toBe('Choose at least one scope');
    expect(keyProblem({ ...ok, allowlist: 'nope' }, now)).toBe('Not an IP or range: nope');
    const many = Array.from({ length: 21 }, (_v, i) => `10.0.0.${String(i)}`).join('\n');
    expect(keyProblem({ ...ok, allowlist: many }, now)).toBe('At most 20 IPs or ranges');
    expect(keyProblem({ ...ok, expires: '2026-10-29' }, now)).toBe('Choose a date in the future');
    expect(keyProblem({ ...ok, expires: '2026-10-30' }, now)).toBeNull();
  });
});
