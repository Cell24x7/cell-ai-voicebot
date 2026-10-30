import { QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inboxKeys } from '@/features/inbox/keys';
import { callsApi } from '@/services/api/calls';
import { signInAs } from '@/test/auth';
import { fakeWaCall } from '@/test/calls-wa';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { callingKeys } from './keys';
import { CallMounts } from './live/CallMounts';
import { clearCall } from './live/controller';
import { newActiveCall, useLiveCallStore } from './live/store';

vi.mock('@/services/api/calls', () => ({ callsApi: { get: vi.fn() } }));
vi.mock('./live/CallBar', () => ({ default: () => null }));
vi.mock('./live/IncomingPopup', () => ({ default: () => null }));

beforeEach(() => {
  signInAs('agent');
  useLiveCallStore.setState({ active: null, incoming: [] });
  vi.mocked(callsApi.get).mockResolvedValue(fakeWaCall('ringing'));
});
afterEach(() => {
  clearCall();
  vi.useRealTimers();
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

describe('calling updates in the app shell', () => {
  it('refreshes permissions, number settings and conversation-keyed contact panels on live events', () => {
    const { client, realtime } = mount();
    client.setQueryData(inboxKeys.contact('conversation-1'), { contactId: 'contact-1' });
    client.setQueryData(callingKeys.permission('wa1', 'contact-1'), {});
    client.setQueryData(callingKeys.settings('wa1'), {});
    realtime.emit('whatsapp.call_permission.updated', {
      channelId: 'wa1',
      contactId: 'contact-1',
      status: 'permanent',
      expiresAt: null,
    });
    expect(client.getQueryState(callingKeys.permission('wa1', 'contact-1'))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(inboxKeys.contact('conversation-1'))?.isInvalidated).toBe(true);
    realtime.emit('whatsapp.channel.updated', { channelId: 'wa1' });
    expect(client.getQueryState(callingKeys.settings('wa1'))?.isInvalidated).toBe(true);
    expect(callsApi.get).not.toHaveBeenCalled();
  });

  it('recovers missed answered and ended events by polling, then stops when the call ends', async () => {
    vi.useFakeTimers();
    useLiveCallStore.getState().setActive({
      ...newActiveCall({
        mode: 'ai',
        direction: 'outbound',
        label: 'Customer',
        conversationId: null,
        callId: 'wc1',
      }),
      phase: 'ringing',
    });
    const { unmount } = mount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(callsApi.get).toHaveBeenCalledWith('wc1');
    vi.mocked(callsApi.get).mockResolvedValue(fakeWaCall('in_progress'));
    await act(() => vi.advanceTimersByTimeAsync(2_010));
    expect(useLiveCallStore.getState().active?.phase).toBe('in_call');
    vi.mocked(callsApi.get).mockResolvedValue(
      fakeWaCall('completed', 'ai', 'outbound', { durationSec: 7 }),
    );
    await act(() => vi.advanceTimersByTimeAsync(2_010));
    expect(useLiveCallStore.getState().active).toMatchObject({
      phase: 'ended',
      ended: { durationSec: 7 },
    });
    const count = vi.mocked(callsApi.get).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(callsApi.get).toHaveBeenCalledTimes(count);
    unmount();
  });
});
