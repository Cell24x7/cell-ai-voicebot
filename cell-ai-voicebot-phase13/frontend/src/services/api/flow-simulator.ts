import { apiClient, unwrap } from './client';
import type { FlowRun, FlowRunSummary, FlowSimulationStep, SuccessEnvelope } from './types';

export interface StartSimulationInput {
  version?: 'draft' | 'published' | number;
  contactId?: string;
  variables?: Record<string, string>;
  testPhone?: string;
}

export interface SimulationInput {
  clientInputId: string;
  kind: 'dtmf' | 'speech' | 'no_input' | 'transfer_result' | 'hangup';
  value?: string;
}

/** `/api/v1/flows/:id/simulations` — text simulator of a flow. */
export const flowSimulatorApi = {
  start: (flowId: string, body: StartSimulationInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<FlowSimulationStep>>(`/flows/${flowId}/simulations`, body),
    ),
  /** Idempotent by `clientInputId` (retry with the same id). */
  send: (flowId: string, runId: string, body: SimulationInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<FlowSimulationStep>>(
        `/flows/${flowId}/simulations/${runId}/inputs`,
        body,
      ),
    ),
  list: (flowId: string, mine = false) =>
    unwrap(
      apiClient.get<SuccessEnvelope<FlowRunSummary[]>>(`/flows/${flowId}/simulations`, {
        params: mine ? { mine: 'true' } : {},
      }),
    ),
  get: (flowId: string, runId: string) =>
    unwrap(apiClient.get<SuccessEnvelope<FlowRun>>(`/flows/${flowId}/simulations/${runId}`)),
};
