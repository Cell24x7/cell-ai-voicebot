import { useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { onAuthEvent } from '@/services/api/auth-events';
import { useWsEvent } from '@/services/realtime';

import { FullPageLoader } from './FullPageLoader';
import { bootstrapSession, installClientAuth, reloadMe } from './session';
import { useAuthStore } from './store';

/**
 * Root of the app routes: restores the session on load, wires the HTTP client,
 * and reacts to "session ended" signals (HTTP 401 after refresh, WS events).
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.session?.user.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => installClientAuth(), []);

  useEffect(() => {
    if (useAuthStore.getState().status === 'loading') void bootstrapSession();
  }, []);

  useEffect(
    () =>
      onAuthEvent((event) => {
        queryClient.clear();
        if (event.type === 'impersonation-ended') {
          enqueueSnackbar('Impersonation ended.', { variant: 'info' });
          void navigate('/admin/accounts');
          return;
        }
        enqueueSnackbar('Your session ended. Please sign in again.', { variant: 'warning' });
        void navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      }),
    [queryClient, navigate, location.pathname, location.search],
  );

  useWsEvent('session.revoked', () => {
    useAuthStore.getState().setAnonymous();
    queryClient.clear();
    enqueueSnackbar('You were signed out.', { variant: 'warning' });
    void navigate('/login');
  });
  useWsEvent('user.updated', (event) => {
    if (event.data.userId === userId) void reloadMe().catch(() => undefined);
  });
  useWsEvent('account.updated', () => void reloadMe().catch(() => undefined));
  useWsEvent('account.suspended', () => void reloadMe().catch(() => undefined));
  useWsEvent('account.enabled', () => void reloadMe().catch(() => undefined));

  if (status === 'loading') return <FullPageLoader label="Restoring your session" />;
  return <>{children}</>;
}
