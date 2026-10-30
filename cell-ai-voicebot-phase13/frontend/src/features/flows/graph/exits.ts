import type { DraftNode, FlowExitInfo, FlowNodeCatalogEntry } from '@/services/api/types';

const items = (config: Record<string, unknown>, key: string): Record<string, unknown>[] => {
  const list = config[key];
  return Array.isArray(list)
    ? list.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    : [];
};
const str = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;
const exit = (handle: string, label: string, required: boolean): FlowExitInfo => ({
  handle,
  label,
  required,
  kind: handle === 'error' ? 'error' : 'normal',
});

/** Exits of a node — mirrors the backend `exitsOf` (dynamic keys / intents / rules first). */
export const nodeExits = (
  node: Pick<DraftNode, 'type' | 'config'>,
  entry: Pick<FlowNodeCatalogEntry, 'staticExits'> | undefined,
): FlowExitInfo[] => {
  const statics = entry?.staticExits ?? [];
  const c = node.config;
  if (node.type === 'gather_dtmf') {
    const head =
      c.mode === 'digits'
        ? [exit('next', 'Next', true)]
        : items(c, 'keys').map((k) =>
            exit(
              `key_${String(k.id)}`,
              `Press ${str(k.key, '?')}${str(k.label, '') ? ` · ${str(k.label, '')}` : ''}`,
              true,
            ),
          );
    return [...head, ...statics];
  }
  if (node.type === 'gather_speech') {
    const intents = items(c, 'intents');
    const head = intents.length
      ? [
          ...intents.map((i) => exit(`intent_${String(i.id)}`, str(i.label, String(i.id)), true)),
          exit('no_match', 'No match', false),
        ]
      : [exit('next', 'Next', true)];
    return [...head, ...statics];
  }
  if (node.type === 'condition_router') {
    const rules = items(c, 'rules').map((r, i) =>
      exit(`rule_${String(r.id)}`, str(r.label, `Rule ${String(i + 1)}`), true),
    );
    return [...rules, ...statics];
  }
  return [...statics];
};
