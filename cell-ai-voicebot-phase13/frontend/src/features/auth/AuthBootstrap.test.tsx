import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitAuthEvent } from '@/services/api/auth-events';
import { RealtimeContext } from '@/services/realtime/context';
import type { RealtimeClient } from '@/services/realtime/ws-client';
import { fakeSession, resetAuthStore, signInAs } from '@/test/auth';

import { AuthBootstrap } from './AuthBootstrap';
import * as session from './session';
import { useAuthStore } from './store';

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

const fakeRealtime = () => {
  const handlers = new Map<string, (e: unknown) => void>();
  const client = {
    on: (type: string, handler: (e: unknown) => void) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    },
  } as unknown as RealtimeClient;
  return {
    client,
    emit: (type: string, data: unknown) => handlers.get(type)?.({ id: 'e', type, ts: 'x', data }),
  };
};

const mount = (path = '/team', realtime = fakeRealtime()) => {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthBootstrap>
            <Where />
          </AuthBootstrap>
        ),
        children: [{ path: '*', element: null }],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <RealtimeContext value={realtime.client}>
          <RouterProvider router={router} />
        </RealtimeContext>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return realtime;
};

afterEach(() => vi.restoreAllMocks());

describe('AuthBootstrap', () => {
  it('shows a loader while restoring the session, then the app', async () => {
    resetAuthStore();
    let resolve: () => void = () => undefined;
    vi.spyOn(session, 'bootstrapSession').mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = () => {
            useAuthStore.getState().setSession(fakeSession('owner'));
            r();
          };
        }),
    );
    mount();
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    act(() => resolve());
    await Promise.resolve();
    expect(screen.getByTestId('where')).toHaveTextContent('/team');
  });

  it('goes to /login with next when the session ends', async () => {
    signInAs('owner');
    mount('/settings/account');
    act(() => {
      emitAuthEvent({ type: 'signed-out', reason: 'x' });
    });
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fsettings%2Faccount');
    expect(
      await screen.findByText('Your session ended. Please sign in again.'),
    ).toBeInTheDocument();
  });

  it('returns to the admin page when impersonation ends', () => {
    signInAs('owner');
    mount('/team');
    act(() => {
      emitAuthEvent({ type: 'impersonation-ended' });
    });
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/accounts');
  });

  it('signs out on WS session.revoked and reloads me on user / account events', () => {
    signInAs('owner');
    const reload = vi.spyOn(session, 'reloadMe').mockResolvedValue();
    const rt = mount('/team');
    act(() => {
      rt.emit('user.updated', { userId: 'someone-else' });
    });
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      rt.emit('user.updated', { userId: 'u1' });
    });
    act(() => {
      rt.emit('account.suspended', { reason: 'x' });
    });
    act(() => {
      rt.emit('account.enabled', {});
    });
    act(() => {
      rt.emit('account.updated', { fields: ['name'] });
    });
    expect(reload).toHaveBeenCalledTimes(4);
    act(() => {
      rt.emit('session.revoked', { reason: 'disabled' });
    });
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
  });
});
