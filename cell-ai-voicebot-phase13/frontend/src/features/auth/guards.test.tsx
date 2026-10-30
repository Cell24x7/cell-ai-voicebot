import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { signInAs } from '@/test/auth';

import { RedirectIfAuthed, RequireAuth, RequirePermission, RequirePlatformAdmin } from './guards';
import { useAuthStatus, useCan, useIsPlatformAdmin, usePermission, useSession } from './hooks';
import { useAuthStore } from './store';

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

const mount = (path: string) => {
  const router = createMemoryRouter(
    [
      {
        path: '/private',
        element: (
          <RequireAuth>
            <p>private</p>
          </RequireAuth>
        ),
      },
      {
        path: '/login',
        element: (
          <RedirectIfAuthed>
            <Where />
          </RedirectIfAuthed>
        ),
      },
      {
        path: '/team',
        element: (
          <RequirePermission perm="team.read">
            <p>team</p>
          </RequirePermission>
        ),
      },
      {
        path: '/any',
        element: (
          <RequirePermission anyOf={['apikeys.read', 'calls.read']}>
            <p>any</p>
          </RequirePermission>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequirePlatformAdmin>
            <p>admin</p>
          </RequirePlatformAdmin>
        ),
      },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
};

describe('route guards', () => {
  it('RequireAuth sends signed-out users to /login with next', () => {
    mount('/private?x=1');
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fprivate%3Fx%3D1');
  });

  it('RedirectIfAuthed sends signed-in users to a safe next', () => {
    signInAs('viewer');
    mount('/login?next=/team');
    expect(screen.getByTestId('where')).toHaveTextContent('/403');
  });

  it('RedirectIfAuthed ignores external next values', () => {
    signInAs('viewer');
    mount('/login?next=//evil.example');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('RequirePermission / anyOf / platform admin', () => {
    signInAs('manager');
    mount('/team');
    expect(screen.getByText('team')).toBeInTheDocument();
  });

  it('shows 403 without the permission', () => {
    signInAs('agent');
    mount('/team');
    expect(screen.getByTestId('where')).toHaveTextContent('/403');
  });

  it('anyOf passes with one permission; superadmin only for /admin', () => {
    signInAs('viewer');
    mount('/any');
    expect(screen.getByText('any')).toBeInTheDocument();
  });

  it('blocks /admin for owners and allows superadmins', () => {
    signInAs('owner');
    mount('/admin');
    expect(screen.getByTestId('where')).toHaveTextContent('/403');
  });

  it('allows superadmins on /admin', () => {
    signInAs('superadmin');
    mount('/admin');
    expect(screen.getByText('admin')).toBeInTheDocument();
  });
});

describe('permission hooks', () => {
  function Probe() {
    const canInvite = usePermission('team.invite');
    const can = useCan();
    const admin = useIsPlatformAdmin();
    const status = useAuthStatus();
    const session = useSession();
    return (
      <p data-testid="probe">{`${canInvite}|${can('calls.read')}|${admin}|${status}|${session?.role.key ?? '-'}`}</p>
    );
  }

  it('reflect the session and update with it', () => {
    signInAs('viewer');
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false|true|false|authenticated|viewer');
    act(() => {
      signInAs('superadmin');
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('true|true|true|authenticated|owner');
    act(() => {
      useAuthStore.getState().setAnonymous();
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('false|false|false|anonymous|-');
  });
});
