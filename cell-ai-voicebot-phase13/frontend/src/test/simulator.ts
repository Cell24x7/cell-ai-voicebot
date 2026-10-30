import type { FlowRun, FlowSimulationStep, FlowTranscriptEntry } from '@/services/api/types';

import { fakeRun } from './flows';

let seq = 0;
/** One transcript line. */
export const line = (
  role: FlowTranscriptEntry['role'],
  kind: FlowTranscriptEntry['kind'],
  text: string,
  extra: Partial<FlowTranscriptEntry> = {},
): FlowTranscriptEntry => ({
  seq: ++seq,
  role,
  kind,
  text,
  nodeId: role === 'bot' ? 'greet' : null,
  at: '2026-10-12T00:00:00.000Z',
  ...extra,
});

export const step = (
  run: Partial<FlowRun>,
  added: FlowTranscriptEntry[],
  replay = false,
): FlowSimulationStep => ({ run: fakeRun(run), added, replay });
