import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeWebSocket } from '@/test/fake-websocket';

import { useWsEvent, useWsStatus, useWsTopic } from './hooks';
import { RealtimeProvider } from './RealtimeProvider';
import { RealtimeClient, type RealtimeClientOptions } from './ws-client';

const getTicket = () => Promise.resolve('wst_test');
const createClient = (options: RealtimeClientOptions) =>
  new RealtimeClient({
    ...options,
    WebSocketImpl: FakeWebSocket,
    url: (t) => `ws://test?ticket=${t}`,
  });

function Wrapper({
  children,
  ticket = getTicket,
  queryClient = new QueryClient(),
}: {
  children: ReactNode;
  ticket?: (() => Promise<string>) | null;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider getTicket={ticket} createClient={createClient}>
        {children}
      </RealtimeProvider>
    </QueryClientProvider>
  );
}

function Status() {
  return <span data-testid="status">{useWsStatus()}</span>;
}

function Wallet() {
  const [balance, setBalance] = useState<number | null>(null);
  useWsEvent('wallet.updated', (e) => setBalance(e.data.balanceMicros));
  return <span data-testid="balance">{balance ?? '-'}</span>;
}

function Topic({ topic }: { topic: string | null }) {
  useWsTopic(topic);
  return null;
}

const openSocket = async () => {
  await act(async () => {
    await Promise.resolve();
  });
  const ws = FakeWebSocket.last();
  act(() => {
    ws.serverOpen();
    ws.serverMessage({ type: 'pong' });
  });
  return ws;
};

beforeEach(() => FakeWebSocket.reset());
afterEach(() => vi.restoreAllMocks());

describe('RealtimeProvider + hooks', () => {
  it('stays idle and opens no socket while getTicket is null', async () => {
    render(
      <Wrapper ticket={null}>
        <Status />
        <Wallet />
      </Wrapper>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('connects, reports status and delivers typed events', async () => {
    render(
      <Wrapper>
        <Status />
        <Wallet />
      </Wrapper>,
    );
    const ws = await openSocket();
    expect(screen.getByTestId('status')).toHaveTextContent('open');
    act(() =>
      ws.serverMessage({
        id: 'evt_1',
        type: 'wallet.updated',
        ts: '2026-10-08T00:00:00Z',
        data: { balanceMicros: 5_000_000, holdMicros: 0, currency: 'INR' },
      }),
    );
    expect(screen.getByTestId('balance')).toHaveTextContent('5000000');
  });

  it('subscribes on mount and unsubscribes on unmount / topic change', async () => {
    const queryClient = new QueryClient();
    const { rerender, unmount } = render(
      <Wrapper queryClient={queryClient}>
        <Topic topic="call:1" />
      </Wrapper>,
    );
    const ws = await openSocket();
    expect(ws.sentOfType('subscribe')).toEqual([{ type: 'subscribe', topics: ['call:1'] }]);
    rerender(
      <Wrapper queryClient={queryClient}>
        <Topic topic="call:2" />
      </Wrapper>,
    );
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(ws.sentOfType('unsubscribe')).toEqual([{ type: 'unsubscribe', topics: ['call:1'] }]);
    expect(ws.sentOfType('subscribe')).toContainEqual({ type: 'subscribe', topics: ['call:2'] });
    unmount();
    expect(ws.closedWith).toBe(1000);
  });

  it('invalidates all queries after a reconnect', async () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      render(
        <Wrapper queryClient={queryClient}>
          <Status />
        </Wrapper>,
      );
      const ws = await openSocket();
      expect(invalidate).not.toHaveBeenCalled();
      act(() => ws.serverClose(1006));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });
      const next = FakeWebSocket.last();
      act(() => {
        next.serverOpen();
        next.serverMessage({ type: 'pong' });
      });
      expect(invalidate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
