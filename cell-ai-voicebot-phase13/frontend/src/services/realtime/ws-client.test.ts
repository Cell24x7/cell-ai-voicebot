import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeWebSocket } from '@/test/fake-websocket';

import { buildWsUrl } from './url';
import {
  MAX_AUTH_FAILURES,
  PING_INTERVAL_MS,
  RealtimeClient,
  type RealtimeClientOptions,
} from './ws-client';

const flush = () => vi.advanceTimersByTimeAsync(0);

const event = (id: string, type = 'wallet.updated', data: unknown = { balanceMicros: 1 }) => ({
  id,
  type,
  ts: '2026-10-08T00:00:00.000Z',
  data,
});

const target = () => {
  const listeners = new Map<string, () => void>();
  return {
    addEventListener: vi.fn((name: string, fn: () => void) => listeners.set(name, fn)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    fire: (name: string) => listeners.get(name)?.(),
    has: (name: string) => listeners.has(name),
  };
};

const setup = (overrides: Partial<RealtimeClientOptions> = {}) => {
  let n = 0;
  const getTicket = vi.fn(() => Promise.resolve(`wst_${++n}`));
  const eventTarget = target();
  const logger = { debug: vi.fn(), warn: vi.fn() };
  const client = new RealtimeClient({
    getTicket,
    url: (t) => `ws://test/ws/events?ticket=${t}`,
    WebSocketImpl: FakeWebSocket,
    random: () => 1,
    logger,
    eventTarget,
    ...overrides,
  });
  return { client, getTicket, eventTarget, logger };
};

/** connect → socket open → server pong (verified). */
const connectVerified = async (client: RealtimeClient) => {
  client.connect();
  await flush();
  const ws = FakeWebSocket.last();
  ws.serverOpen();
  ws.serverMessage({ type: 'pong' });
  return ws;
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RealtimeClient — connecting', () => {
  it('fetches a ticket, connects and reports status transitions', async () => {
    const { client, getTicket } = setup();
    const statuses: string[] = [];
    client.onStatus(() => statuses.push(client.getStatus()));
    expect(client.getStatus()).toBe('idle');
    client.connect();
    expect(client.getStatus()).toBe('connecting');
    await flush();
    expect(getTicket).toHaveBeenCalledTimes(1);
    const ws = FakeWebSocket.last();
    expect(ws.url).toBe('ws://test/ws/events?ticket=wst_1');
    ws.serverOpen();
    expect(client.getStatus()).toBe('open');
    expect(statuses).toEqual(['connecting', 'open']);
    expect(ws.sentOfType('ping')).toHaveLength(1); // immediate ping
  });

  it('is a no-op when already connecting/open', async () => {
    const { client, getTicket } = setup();
    client.connect();
    client.connect();
    await flush();
    expect(getTicket).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('stays idle (no retry loop) when the ticket provider fails', async () => {
    const { client } = setup({ getTicket: () => Promise.reject(new Error('no auth yet')) });
    client.connect();
    await flush();
    expect(client.getStatus()).toBe('idle');
    expect(client.getLastError()).toBe('ticket_unavailable');
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('RealtimeClient — keepalive', () => {
  it('pings every 25 s and stops after close', async () => {
    const { client } = setup();
    const ws = await connectVerified(client);
    expect(ws.sentOfType('ping')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(ws.sentOfType('ping')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 2);
    expect(ws.sentOfType('ping')).toHaveLength(4);
    client.disconnect();
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 3);
    expect(ws.sentOfType('ping')).toHaveLength(4);
  });
});

describe('RealtimeClient — reconnect backoff', () => {
  it('doubles the delay up to 30 s (random = 1)', async () => {
    const { client, getTicket } = setup();
    client.connect();
    await flush();
    const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const delay of delays) {
      FakeWebSocket.last().serverClose(1006);
      expect(client.getStatus()).toBe('reconnecting');
      const calls = getTicket.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(getTicket).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(getTicket).toHaveBeenCalledTimes(calls + 1);
    }
  });

  it('applies full jitter (random = 0.5 → half the cap)', async () => {
    const { client, getTicket } = setup({ random: () => 0.5 });
    client.connect();
    await flush();
    FakeWebSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(499);
    expect(getTicket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getTicket).toHaveBeenCalledTimes(2);
  });

  it('resets the backoff once a connection is verified', async () => {
    const { client, getTicket } = setup();
    client.connect();
    await flush();
    FakeWebSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    FakeWebSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(2_000);
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverMessage({ type: 'pong' });
    ws.serverClose(1001);
    const calls = getTicket.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getTicket).toHaveBeenCalledTimes(calls + 1);
  });
});

describe('RealtimeClient — close codes', () => {
  it('1000 → closed, no reconnect', async () => {
    const { client } = setup();
    const ws = await connectVerified(client);
    ws.serverClose(1000);
    expect(client.getStatus()).toBe('closed');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('4003 → closed with forbidden', async () => {
    const { client } = setup();
    const ws = await connectVerified(client);
    ws.serverClose(4003);
    expect(client.getStatus()).toBe('closed');
    expect(client.getLastError()).toBe('forbidden');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it(`4001 / 4010 → new ticket each time, ${MAX_AUTH_FAILURES} in a row → closed`, async () => {
    const { client, getTicket } = setup();
    client.connect();
    await flush();
    FakeWebSocket.last().serverOpen();
    FakeWebSocket.last().serverClose(4001);
    expect(client.getStatus()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.last().url).toContain('wst_2');
    FakeWebSocket.last().serverOpen();
    FakeWebSocket.last().serverClose(4010);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeWebSocket.last().url).toContain('wst_3');
    FakeWebSocket.last().serverOpen();
    FakeWebSocket.last().serverClose(4001);
    expect(client.getStatus()).toBe('closed');
    expect(client.getLastError()).toBe('unauthorized');
    expect(getTicket).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getTicket).toHaveBeenCalledTimes(3);
  });

  it('a verified connection resets the auth-failure count', async () => {
    const { client } = setup();
    client.connect();
    await flush();
    FakeWebSocket.last().serverClose(4001);
    await vi.advanceTimersByTimeAsync(1_000);
    FakeWebSocket.last().serverClose(4001);
    await vi.advanceTimersByTimeAsync(2_000);
    const ws = FakeWebSocket.last();
    ws.serverOpen();
    ws.serverMessage({ type: 'pong' });
    ws.serverClose(4010);
    expect(client.getStatus()).toBe('reconnecting');
  });

  it('4009 → waits the maximum delay (30 s)', async () => {
    const { client, getTicket } = setup({ random: () => 0 });
    const ws = await connectVerified(client);
    ws.serverClose(4009);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(getTicket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getTicket).toHaveBeenCalledTimes(2);
  });

  it.each([4008, 1001, 1006, 1011])('%i → reconnects with backoff', async (code) => {
    const { client, getTicket } = setup();
    const ws = await connectVerified(client);
    ws.serverClose(code);
    expect(client.getStatus()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getTicket).toHaveBeenCalledTimes(2);
  });
});

describe('RealtimeClient — topics', () => {
  it('ref-counts subscriptions and sends one frame per change', async () => {
    const { client } = setup();
    const ws = await connectVerified(client);
    const offA = client.subscribe('call:abc');
    const offB = client.subscribe('call:abc');
    expect(ws.sentOfType('subscribe')).toEqual([{ type: 'subscribe', topics: ['call:abc'] }]);
    offA();
    offA(); // idempotent
    expect(ws.sentOfType('unsubscribe')).toHaveLength(0);
    offB();
    expect(ws.sentOfType('unsubscribe')).toEqual([{ type: 'unsubscribe', topics: ['call:abc'] }]);
  });

  it('sends topics subscribed before open and re-sends them after a reconnect', async () => {
    const { client } = setup();
    client.subscribe('campaign:1');
    client.subscribe('call:2');
    const first = await connectVerified(client);
    expect(first.sentOfType('subscribe')).toEqual([
      { type: 'subscribe', topics: ['campaign:1', 'call:2'] },
    ]);
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.last();
    second.serverOpen();
    expect(second.sentOfType('subscribe')).toEqual([
      { type: 'subscribe', topics: ['campaign:1', 'call:2'] },
    ]);
  });
});

describe('RealtimeClient — events', () => {
  it('delivers typed events and supports off()', async () => {
    const { client } = setup();
    const ws = await connectVerified(client);
    const handler = vi.fn();
    const off = client.on('wallet.updated', handler);
    ws.serverMessage(event('evt_1'));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_1', data: { balanceMicros: 1 } }),
    );
    off();
    ws.serverMessage(event('evt_2'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates by event id', async () => {
    const { client } = setup();
    const ws = await connectVerified(client);
    const handler = vi.fn();
    client.on('call.status', handler);
    const e = event('evt_dup', 'call.status', { callId: 'c', status: 'ringing' });
    ws.serverMessage(e);
    ws.serverMessage(e);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('forgets ids beyond the dedupe window (200)', async () => {
    const { client } = setup();
    const ws = await connectVerified(client);
    const handler = vi.fn();
    client.on('wallet.updated', handler);
    for (let i = 0; i <= 200; i += 1) ws.serverMessage(event(`evt_${i}`));
    ws.serverMessage(event('evt_0'));
    expect(handler).toHaveBeenCalledTimes(202);
  });

  it('passes unknown types to onAny only and ignores invalid frames', async () => {
    const { client, logger } = setup();
    const ws = await connectVerified(client);
    const any = vi.fn();
    const typed = vi.fn();
    client.onAny(any);
    client.on('wallet.updated', typed);
    ws.serverMessage(event('evt_x', 'future.thing', {}));
    ws.serverMessage('not json {');
    ws.serverMessage({ hello: 'world' });
    expect(any).toHaveBeenCalledTimes(1);
    expect(typed).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(3);
  });
});

describe('RealtimeClient — lifecycle', () => {
  it('reconnects immediately on the browser online event', async () => {
    const { client, getTicket, eventTarget } = setup();
    const ws = await connectVerified(client);
    ws.serverClose(1006);
    await vi.advanceTimersByTimeAsync(500);
    eventTarget.fire('online');
    await flush();
    expect(getTicket).toHaveBeenCalledTimes(2);
  });

  it('retries a failed ticket fetch on online', async () => {
    let fail = true;
    const { client, eventTarget } = setup({
      getTicket: () => (fail ? Promise.reject(new Error('x')) : Promise.resolve('wst_ok')),
    });
    client.connect();
    await flush();
    expect(client.getStatus()).toBe('idle');
    fail = false;
    eventTarget.fire('online');
    await flush();
    expect(FakeWebSocket.last().url).toContain('wst_ok');
  });

  it('disconnect() closes with 1000, removes listeners and timers', async () => {
    const { client, eventTarget } = setup();
    const ws = await connectVerified(client);
    expect(eventTarget.has('online')).toBe(true);
    client.disconnect();
    expect(ws.closedWith).toBe(1000);
    expect(client.getStatus()).toBe('closed');
    expect(eventTarget.has('online')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disconnect() during a pending reconnect cancels it', async () => {
    const { client, getTicket } = setup();
    const ws = await connectVerified(client);
    ws.serverClose(1006);
    client.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getTicket).toHaveBeenCalledTimes(1);
  });

  it('can connect again after disconnect (StrictMode remount)', async () => {
    const { client } = setup();
    client.connect();
    client.disconnect();
    client.connect();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.last().serverOpen();
    expect(client.getStatus()).toBe('open');
  });

  it('calls onReconnected only for later verified connections', async () => {
    const onReconnected = vi.fn();
    const { client } = setup({ onReconnected });
    const ws = await connectVerified(client);
    expect(onReconnected).not.toHaveBeenCalled();
    ws.serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    const next = FakeWebSocket.last();
    next.serverOpen();
    next.serverMessage({ type: 'pong' });
    expect(onReconnected).toHaveBeenCalledTimes(1);
  });
});

describe('buildWsUrl', () => {
  it('appends /events and encodes the ticket', () => {
    expect(buildWsUrl('wst_a+b', 'ws://localhost:3100/ws/')).toBe(
      'ws://localhost:3100/ws/events?ticket=wst_a%2Bb',
    );
  });

  it('derives the base from the page origin', () => {
    expect(buildWsUrl('t', '', { protocol: 'https:', host: 'app.example.com' })).toBe(
      'wss://app.example.com/ws/events?ticket=t',
    );
    expect(buildWsUrl('t', undefined, { protocol: 'http:', host: 'localhost:3100' })).toBe(
      'ws://localhost:3100/ws/events?ticket=t',
    );
  });
});
