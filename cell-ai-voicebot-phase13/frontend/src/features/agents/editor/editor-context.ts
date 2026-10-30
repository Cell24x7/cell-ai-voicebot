import type { UseFormReturn } from 'react-hook-form';

import type { Agent, AgentCatalog } from '@/services/api/types';

import type { AgentForm } from '../agent-form';

/** What every editor tab receives. */
export interface EditorTabProps {
  agent: Agent;
  catalog: AgentCatalog | undefined;
  form: UseFormReturn<AgentForm>;
  readOnly: boolean;
  /** A tab that saved on its own (functions, tools, knowledge) reports the new agent. */
  onAgentChange: (agent: Agent) => void;
}

/** Number of error messages inside a react-hook-form error object. */
export const countErrors = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0;
  if ('message' in value && typeof (value as { message?: unknown }).message === 'string') return 1;
  return Object.values(value).reduce<number>((sum, v) => sum + countErrors(v), 0);
};

/** `missing_variable:amount` → readable text. */
export const warningText = (w: string): string => {
  if (w.startsWith('missing_variable:'))
    return `No value for {{${w.slice('missing_variable:'.length)}}} — it is left empty`;
  if (w === 'persona_truncated') return 'The persona was cut to fit the instruction limit';
  return w;
};
