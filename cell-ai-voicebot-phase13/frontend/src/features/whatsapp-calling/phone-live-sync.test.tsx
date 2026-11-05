import { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { callsApi } from '@/services/api/calls';
import { signInAs } from '@/test/auth';
import { fakeCall } from '@/test/calls';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { CallMounts } from './live/CallMounts';
import { clearCall } from './live/controller';
import { newActiveCall, useLiveCallStore } from './live/store';
vi.mock('@/services/api/calls', () => ({ callsApi: { get: vi.fn() } }));
vi.mock('./live/CallBar', () => ({ default: () => null }));
vi.mock('./live/IncomingPopup', () => ({ default: () => null }));
beforeEach(() => {
  signInAs('agent');
  useLiveCallStore.setState({ active: null, incoming: [] });
  vi.mocked(callsApi.get).mockResolvedValue(
    fakeCall({ id: 'sip1', provider: 'sip', mode: 'human', status: 'ringing' }),
  );
});
afterEach(() => {
  clearCall();
  vi.clearAllMocks();
});
const mount = () => {
  const realtime = fakeRealtime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderWithProviders({
    queryClient: client,
    realtime: realtime.client,
    routes: [{ path: '/', element: <CallMounts /> }],
  });
  return { ...view, client, realtime };
};
it('follows SIP call events on the same global call bar', async () => {
  useLiveCallStore.getState().setActive(
    newActiveCall({
      transport: 'sip',
      mode: 'human',
      direction: 'outbound',
      label: 'Asha',
      conversationId: null,
      callId: 'sip1',
    }),
  );
  const { realtime, unmount, client } = mount();
  await waitFor(() => expect(callsApi.get).toHaveBeenCalledWith('sip1'));
  act(() =>
    realtime.emit('call.status', { callId: 'sip1', provider: 'sip', status: 'in_progress' }),
  );
  expect(useLiveCallStore.getState().active?.phase).toBe('in_call');
  act(() =>
    realtime.emit('call.ended', {
      callId: 'sip1',
      provider: 'sip',
      status: 'completed',
      endReason: 'customer_hangup',
      durationSec: 12,
      disposition: null,
      costMicros: 100,
    }),
  );
  expect(useLiveCallStore.getState().active).toMatchObject({
    phase: 'ended',
    ended: { durationSec: 12 },
  });
  unmount();
  client.clear();
});
