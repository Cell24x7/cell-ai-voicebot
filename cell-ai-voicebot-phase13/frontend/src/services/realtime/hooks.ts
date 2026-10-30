import { useContext, useEffect, useEffectEvent, useSyncExternalStore } from 'react';

import { RealtimeContext } from './context';
import type { WsEvent, WsEventType } from './events';
import type { RealtimeClient, RealtimeStatus } from './ws-client';

const noopSubscribe = () => () => undefined;

/** The app's realtime client, or `null` while realtime is disabled. */
export const useRealtimeClient = (): RealtimeClient | null => useContext(RealtimeContext);

/** Connection status (`idle` while disabled). */
export const useWsStatus = (): RealtimeStatus => {
  const client = useRealtimeClient();
  return useSyncExternalStore(
    client ? (listener) => client.onStatus(listener) : noopSubscribe,
    () => client?.getStatus() ?? 'idle',
  );
};

/** Runs `handler` for every event of `type` (latest handler, stable subscription). */
export const useWsEvent = <K extends WsEventType>(
  type: K,
  handler: (event: WsEvent<K>) => void,
): void => {
  const client = useRealtimeClient();
  const onEvent = useEffectEvent((event: WsEvent<K>) => handler(event));
  useEffect(() => {
    if (!client) return undefined;
    return client.on(type, (event) => onEvent(event));
  }, [client, type]);
};

/** Subscribes to a topic (`call:<id>` / `campaign:<id>`) while mounted; `null` = none. */
export const useWsTopic = (topic: string | null): void => {
  const client = useRealtimeClient();
  useEffect(() => {
    if (!client || !topic) return undefined;
    return client.subscribe(topic);
  }, [client, topic]);
};
