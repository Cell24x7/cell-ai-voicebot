import { act } from '@testing-library/react';

import type { RealtimeStatus } from '@/services/realtime';
import type { RealtimeClient } from '@/services/realtime/ws-client';

/** A RealtimeClient double: tests `emit` events; status is fixed. */
export const fakeRealtime = (status: RealtimeStatus = 'open') => {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const topics: string[] = [];
  const client = {
    subscribe: (topic: string) => {
      topics.push(topic);
      return () => {
        const at = topics.indexOf(topic);
        if (at >= 0) topics.splice(at, 1);
      };
    },
    on: (type: string, handler: (e: unknown) => void) => {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
      return () => set.delete(handler);
    },
    getStatus: () => status,
    onStatus: () => () => undefined,
  } as unknown as RealtimeClient;
  const emit = (type: string, data: unknown) =>
    act(() => {
      for (const h of handlers.get(type) ?? []) h({ id: `e${Math.random()}`, type, ts: 'x', data });
    });
  return { client, emit, topics };
};
