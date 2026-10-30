import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callsApi } from '@/services/api/calls';
import type { Call } from '@/services/api/types';
import { RealtimeContext } from '@/services/realtime/context';
import { signInAs } from '@/test/auth';
import { fakeCall } from '@/test/calls';
import { fakeRealtime } from '@/test/realtime';

import { callKeys } from './keys';
import {
  useActiveCalls,
  useCall,
  useCallEvents,
  useCallLiveUpdates,
  useCalls,
  useCallTranscript,
  useCanListenCalls,
  useCanTriggerCalls,
} from './queries';

vi.mock('@/services/api/calls', () => ({
  callsApi: {
    list: vi.fn(),
    active: vi.fn(),
    get: vi.fn(),
    transcript: vi.fn(),
    events: vi.fn(),
  },
}));

describe('call queries', () => {
  const rt = fakeRealtime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RealtimeContext value={rt.client}>{children}</RealtimeContext>
    </QueryClientProvider>
  );
  const api = vi.mocked(callsApi);
  beforeEach(() => {
    client.clear();
    api.list
      .mockReset()
      .mockResolvedValueOnce({
        success: true,
        data: [fakeCall()],
        meta: { hasMore: true, nextCursor: 'n1' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [fakeCall({ id: 'c2' })],
        meta: { hasMore: false, nextCursor: null },
      });
    api.active.mockResolvedValue([]);
    api.get.mockResolvedValue(fakeCall({ status: 'in_progress' }));
    api.transcript.mockResolvedValue([]);
    api.events.mockResolvedValue([]);
  });

  it('permissions: agents trigger + listen; viewers neither; impersonators neither', () => {
    signInAs('agent');
    expect(
      renderHook(() => [useCanTriggerCalls(), useCanListenCalls()], { wrapper }).result.current,
    ).toEqual([true, true]);
    signInAs('viewer');
    expect(
      renderHook(() => [useCanTriggerCalls(), useCanListenCalls()], { wrapper }).result.current,
    ).toEqual([false, false]);
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-08T01:00:00Z' },
    });
    expect(
      renderHook(() => [useCanTriggerCalls(), useCanListenCalls()], { wrapper }).result.current,
    ).toEqual([false, false]);
  });

  it('pages with the cursor; detail, transcript, events and active calls load', async () => {
    signInAs('owner');
    const list = renderHook(() => useCalls({ limit: 1 }), { wrapper });
    await waitFor(() => expect(list.result.current.data?.pages).toHaveLength(1));
    expect(list.result.current.hasNextPage).toBe(true);
    await act(() => list.result.current.fetchNextPage());
    expect(api.list).toHaveBeenLastCalledWith({ limit: 1, cursor: 'n1' });
    await waitFor(() => expect(list.result.current.hasNextPage).toBe(false));
    expect(list.result.current.data?.pages).toHaveLength(2);
    const all = renderHook(
      () => [useCall('c1'), useCallTranscript('c1'), useCallEvents('c1'), useActiveCalls()],
      { wrapper },
    );
    await waitFor(() => expect(all.result.current.every((q) => q.isSuccess)).toBe(true));
    const idle = renderHook(() => [useCall(''), useActiveCalls(false)], { wrapper });
    expect(idle.result.current.every((q) => q.fetchStatus === 'idle')).toBe(true);
  });

  it('live updates: created / status / ended refresh lists; status patches the detail; ended refreshes it', async () => {
    signInAs('owner');
    const detail = renderHook(() => useCall('c1'), { wrapper });
    await waitFor(() => expect(detail.result.current.data?.status).toBe('in_progress'));
    renderHook(() => useCallLiveUpdates(), { wrapper });
    const spy = vi.spyOn(client, 'invalidateQueries');
    rt.emit('call.created', { callId: 'c9', isTest: true });
    expect(spy).toHaveBeenCalledWith({ queryKey: callKeys.lists });
    expect(spy).toHaveBeenCalledWith({ queryKey: callKeys.active });
    rt.emit('call.status', { callId: 'c1', status: 'ringing' });
    expect(client.getQueryData<Call>(callKeys.detail('c1'))?.status).toBe('ringing');
    rt.emit('call.status', { callId: 'unknown', status: 'ringing' });
    expect(client.getQueryData(callKeys.detail('unknown'))).toBeUndefined();
    rt.emit('call.ended', {
      callId: 'c1',
      status: 'completed',
      endReason: 'hangup_node',
      durationSec: 9,
      disposition: null,
      costMicros: 1,
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: callKeys.detail('c1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: callKeys.transcript('c1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: callKeys.events('c1') });
  });
});
