import type { TeamAgentState, TeamNext } from '@/services/api/campaigns';

export const AGENT_STATE_LABELS: Record<TeamAgentState, string> = {
  ready: 'Ready',
  on_call: 'On a call',
  wrap_up: 'Wrapping up',
  paused: 'Paused',
  away: 'Away',
};
export const STATE_COLOR: Record<TeamAgentState, 'success' | 'primary' | 'warning' | 'default'> = {
  ready: 'success',
  on_call: 'primary',
  wrap_up: 'warning',
  paused: 'default',
  away: 'default',
};
export const WAIT_TEXT: Record<Extract<TeamNext, { kind: 'wait' }>['reason'], string> = {
  not_running: 'The campaign is not running.',
  window: 'Outside the calling window — calls start again when it opens.',
  wallet: 'The wallet is empty — add money to keep calling.',
  no_contacts: 'Nobody left to call right now (retries come back later).',
  line: 'The calling line is not ready for this account.',
  busy: 'Nobody can be called right now — trying again shortly.',
};
export const HEARTBEAT_MS = 10_000;
export const WAIT_RETRY_MS = 15_000;

export const sessionKey = (id: string) => ['campaigns', 'session', id] as const;
