import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';

import { RealtimeContext } from './context';
import { RealtimeClient, type RealtimeClientOptions } from './ws-client';

interface RealtimeProviderProps {
  /** Ticket provider; `null` keeps realtime off. Must be stable (memoised). */
  getTicket: (() => Promise<string>) | null;
  /** Test hook: build the client (defaults to `new RealtimeClient`). */
  createClient?: (options: RealtimeClientOptions) => RealtimeClient;
  children: ReactNode;
}

const defaultCreateClient = (options: RealtimeClientOptions) => new RealtimeClient(options);

/**
 * One `/ws/events` connection for the app. Connects on mount, disconnects on
 * unmount (StrictMode-safe); after a reconnect every query is invalidated so
 * screens refetch what they missed (websocket.md §6).
 */
export function RealtimeProvider({
  getTicket,
  createClient = defaultCreateClient,
  children,
}: RealtimeProviderProps) {
  const queryClient = useQueryClient();
  const client = useMemo(
    () =>
      getTicket
        ? createClient({
            getTicket,
            onReconnected: () => {
              void queryClient.invalidateQueries();
            },
          })
        : null,
    [getTicket, createClient, queryClient],
  );

  useEffect(() => {
    if (!client) return undefined;
    client.connect();
    return () => client.disconnect();
  }, [client]);

  return <RealtimeContext value={client}>{children}</RealtimeContext>;
}
