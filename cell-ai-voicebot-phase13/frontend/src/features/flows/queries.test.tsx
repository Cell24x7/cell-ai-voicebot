import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flowAudioApi } from '@/services/api/flow-audio';
import { flowSimulatorApi } from '@/services/api/flow-simulator';
import { flowsApi } from '@/services/api/flows';
import { RealtimeContext } from '@/services/realtime/context';
import { signInAs } from '@/test/auth';
import { FAKE_FLOW_CATALOG, fakeFlow, fakeRun } from '@/test/flows';
import { fakeRealtime } from '@/test/realtime';

import {
  useCanPublishFlows,
  useCanWriteFlows,
  useCatalogMap,
  useFlow,
  useFlowAudio,
  useFlowLiveUpdates,
  useFlowStats,
  useFlowTemplates,
  useFlowVariables,
  useFlowVersion,
  useFlowVersions,
  useFlows,
  useSimulation,
  useSimulations,
} from './queries';

vi.mock('@/services/api/flows', () => ({
  flowsApi: {
    list: vi.fn(),
    get: vi.fn(),
    catalog: vi.fn(),
    templates: vi.fn(),
    variables: vi.fn(),
    versions: vi.fn(),
    version: vi.fn(),
    stats: vi.fn(),
  },
}));
vi.mock('@/services/api/flow-audio', () => ({ flowAudioApi: { list: vi.fn() } }));
vi.mock('@/services/api/flow-simulator', () => ({
  flowSimulatorApi: { list: vi.fn(), get: vi.fn() },
}));

const api = vi.mocked(flowsApi);
const rt = fakeRealtime();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <RealtimeContext value={rt.client}>{children}</RealtimeContext>
  </QueryClientProvider>
);

beforeEach(() => {
  client.clear();
  api.list.mockResolvedValue({
    success: true,
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  api.get.mockResolvedValue(fakeFlow());
  api.catalog.mockResolvedValue(FAKE_FLOW_CATALOG);
  api.templates.mockResolvedValue([]);
  api.variables.mockResolvedValue([]);
  api.versions.mockResolvedValue([]);
  api.version.mockResolvedValue({} as never);
  api.stats.mockResolvedValue([]);
  vi.mocked(flowAudioApi.list).mockResolvedValue([]);
  vi.mocked(flowSimulatorApi.list).mockResolvedValue([]);
  vi.mocked(flowSimulatorApi.get).mockResolvedValue(fakeRun());
});

describe('flow queries', () => {
  it('permissions: managers write + publish, viewers neither', () => {
    signInAs('manager');
    expect(
      renderHook(() => [useCanWriteFlows(), useCanPublishFlows()], { wrapper }).result.current,
    ).toEqual([true, true]);
    signInAs('viewer');
    expect(
      renderHook(() => [useCanWriteFlows(), useCanPublishFlows()], { wrapper }).result.current,
    ).toEqual([false, false]);
  });

  it('loads lists, details, catalog map and the rest', async () => {
    signInAs('owner');
    const hooks = renderHook(
      () => ({
        flows: useFlows({ q: 'x' }),
        flow: useFlow('f1'),
        catalog: useCatalogMap(),
        templates: useFlowTemplates(),
        variables: useFlowVariables('f1'),
        versions: useFlowVersions('f1'),
        version: useFlowVersion('f1', 2),
        noVersion: useFlowVersion('f1', null),
        stats: useFlowStats('f1', {}, true),
        audio: useFlowAudio(),
        sims: useSimulations('f1'),
        sim: useSimulation('f1', 'r1'),
      }),
      { wrapper },
    );
    await waitFor(() => expect(hooks.result.current.sim.isSuccess).toBe(true));
    await waitFor(() => expect(hooks.result.current.catalog.map.get('speak')?.label).toBe('Speak'));
    expect(hooks.result.current.noVersion.fetchStatus).toBe('idle');
    expect(api.version).toHaveBeenCalledWith('f1', 2);
  });

  it('live updates refresh lists and tell the open flow', async () => {
    const onUpdated = vi.fn();
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useFlowLiveUpdates({ flowId: 'f1', onUpdated }), { wrapper });
    rt.emit('flow.updated', { flowId: 'f1', revision: 4, by: 'u2' });
    rt.emit('flow.updated', { flowId: 'other', revision: 1, by: null });
    rt.emit('flow.published', { flowId: 'f1', version: 2 });
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith(4, 'u2');
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: ['flows', 'versions', 'f1'] }),
    );
    renderHook(() => useFlowLiveUpdates(), { wrapper });
    rt.emit('flow.updated', { flowId: 'f1', revision: 5, by: null });
  });
});
