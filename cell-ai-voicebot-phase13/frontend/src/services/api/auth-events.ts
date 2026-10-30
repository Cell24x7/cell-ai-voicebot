/**
 * Auth signals from the HTTP layer to the app (no router / store imports in
 * the client): the session is gone, or an impersonation ended.
 */
export type AuthEvent = { type: 'signed-out'; reason: string } | { type: 'impersonation-ended' };

type Listener = (event: AuthEvent) => void;
const listeners = new Set<Listener>();

export const onAuthEvent = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitAuthEvent = (event: AuthEvent): void => {
  for (const listener of listeners) listener(event);
};
