import type { DraftNode } from '@/services/api/types';

const cut = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    : [];

export interface SummaryNames {
  agents: ReadonlyMap<string, string>;
  audios: ReadonlyMap<string, string>;
}

/** One line under the node title: what the step does. */
export const nodeSummary = (
  node: Pick<DraftNode, 'type' | 'config'>,
  names: SummaryNames,
): string => {
  const c = node.config;
  const prompt = (p: unknown) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return o.kind === 'audio'
      ? `▶ ${names.audios.get(str(o.audioId)) ?? 'audio'}`
      : cut(str(o.text));
  };
  switch (node.type) {
    case 'start': {
      const t = Array.isArray(c.triggers) ? (c.triggers as string[]) : [];
      return t.length ? `Starts on: ${t.join(', ')}` : 'Starts every call';
    }
    case 'speak':
      return cut(str(c.text)) || 'Nothing to say yet';
    case 'play_audio':
      return names.audios.get(str(c.audioId)) ?? 'Pick an audio file';
    case 'gather_dtmf':
      return c.mode === 'digits'
        ? `Collect ${String(num(c.minDigits, 1))}–${String(num(c.maxDigits, 4))} digits`
        : list(c.keys).length
          ? `Press ${list(c.keys)
              .map((k) => str(k.key))
              .join(' / ')}`
          : prompt(c.prompt) || 'Add keys';
    case 'gather_speech': {
      const intents = list(c.intents);
      return intents.length
        ? `Intents: ${intents.map((i) => str(i.label)).join(', ')}`
        : prompt(c.prompt) || 'Listen';
    }
    case 'ai_agent':
      return names.agents.get(str(c.agentId)) ?? 'Pick an AI agent';
    case 'api_request': {
      const url = str(c.url);
      const host = /^[a-z]+:\/\/([^/?#]+)/i.exec(url)?.[1];
      return url ? `${str(c.method) || 'GET'} ${host ?? cut(url, 40)}` : 'Set the address';
    }
    case 'condition_router': {
      const n = list(c.rules).length;
      return `${String(n)} rule${n === 1 ? '' : 's'} + else`;
    }
    case 'set_variable':
      return (
        list(c.assignments)
          .map((a) =>
            `${str(a.variable) || '?'} ${a.op === 'increment' ? '+=' : a.op === 'clear' ? '∅' : '='} ${str(a.value)}`.trim(),
          )
          .join(', ') || 'Add an assignment'
      );
    case 'set_disposition':
      return str(c.disposition).replace(/_/g, ' ') || 'Pick a disposition';
    case 'transfer_to_agent':
      return str(c.phone) ? `To ${str(c.phone)}` : 'Set the phone number';
    case 'send_sms':
      return cut(str(c.text)) || 'Write the SMS';
    case 'send_whatsapp':
      return str(c.templateName) || 'Pick a template';
    case 'wait':
      return `${String(num(c.seconds, 5))} s pause`;
    case 'hangup':
      return cut(str(c.text)) || 'End the call';
  }
};
