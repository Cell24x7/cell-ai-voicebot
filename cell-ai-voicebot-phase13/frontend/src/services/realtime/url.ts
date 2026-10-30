/**
 * `/ws/events` URL for a ticket. `base` is the WS base (`VITE_WS_URL`, e.g.
 * `ws://localhost:3100/ws`); without it the page origin is used.
 */
export const buildWsUrl = (
  ticket: string,
  base: string | undefined = import.meta.env.VITE_WS_URL,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string => {
  const root =
    base && base.trim() !== ''
      ? base.trim().replace(/\/+$/, '')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return `${root}/events?ticket=${encodeURIComponent(ticket)}`;
};
