import type { FlowListItem } from '@/services/api/types';

/** "Draft", "Published v3", "Archived". */
export const statusLabel = (f: Pick<FlowListItem, 'status' | 'publishedVersion'>): string =>
  f.status === 'published'
    ? `Published v${String(f.publishedVersion ?? 1)}`
    : f.status === 'archived'
      ? 'Archived'
      : 'Draft';

export const statusColor = (status: FlowListItem['status']) =>
  status === 'published'
    ? ('success' as const)
    : status === 'archived'
      ? ('default' as const)
      : ('info' as const);

export const IMPORT_WARNING_LABELS: Record<string, string> = {
  agent_unmapped: 'AI agent not found — pick one',
  audio_unmapped: 'Audio file not found — pick one',
  secret_removed: 'Secret header removed — enter it again',
};

/** `agent_unmapped:ai` → "AI agent not found — pick one (ai)". */
export const importWarningText = (w: string): string => {
  const [code = '', where = ''] = w.split(':');
  return `${IMPORT_WARNING_LABELS[code] ?? code}${where ? ` (${where})` : ''}`;
};
