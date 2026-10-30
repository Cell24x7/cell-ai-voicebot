import type { AuditEntry } from '@/services/api/types';

/** "Who" column of an audit entry. */
export const auditActorText = (e: AuditEntry): string => {
  if (e.actor.type === 'api_key') return 'API key';
  if (e.actor.type === 'system') return 'System';
  const who = e.actor.name ?? (e.actor.platform ? 'Platform admin' : 'User');
  return e.actor.impersonatorId ? `${who} (via support)` : who;
};

/** "Details" column — `key: value · key: a, b`. */
export const auditMetaText = (meta: AuditEntry['meta']): string =>
  meta
    ? Object.entries(meta)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join(' · ')
    : '';
