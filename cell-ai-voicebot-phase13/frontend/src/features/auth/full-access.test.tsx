import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { authApi } from '@/services/api/auth';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { FullAccessBanner } from './FullAccessBanner';
import { isLimitedImpersonation } from './hooks';

vi.mock('@/services/api/auth', () => ({
  authApi: {
    extendLoginAs: vi.fn(),
    setRingMeToo: vi.fn(() => Promise.resolve({ ringMeToo: true })),
    me: vi.fn(),
  },
}));
vi.mock('@/services/api/admin', () => ({
  adminApi: { stopImpersonation: vi.fn(() => Promise.resolve()) },
}));

afterEach(() => vi.clearAllMocks());

const HOUR = 3_600_000;
const fullSession = (extra: { expiresIn?: number; ringMeToo?: boolean } = {}) => {
  const startedAt = new Date(Date.now() - HOUR).toISOString();
  return fakeSession('owner', {
    accessToken: 'imp-full',
    expiresIn: extra.expiresIn ?? 3 * 3600,
    impersonation: {
      impersonatorId: 'sa1',
      expiresAt: new Date(Date.now() + 3 * HOUR).toISOString(),
      mode: 'full',
      kind: 'superadmin',
      returnTo: '/admin/accounts/a1',
      startedAt,
      maxUntil: new Date(Date.parse(startedAt) + 12 * HOUR).toISOString(),
      ringMeToo: extra.ringMeToo ?? false,
    },
  });
};
const render = () =>
  renderWithProviders({
    routes: [
      { path: '/', element: <FullAccessBanner /> },
      { path: '/admin/accounts/a1', element: <p>admin page</p> },
    ],
  });

describe('superadmin full access (SAC-T3)', () => {
  it('is not a limited login-as; view and act are', () => {
    expect(isLimitedImpersonation(fullSession())).toBe(false);
    expect(
      isLimitedImpersonation(
        fakeSession('owner', {
          impersonation: {
            impersonatorId: 'sa1',
            expiresAt: '2026-11-20T00:00:00Z',
            mode: 'act',
            kind: 'superadmin',
            returnTo: '/',
          },
        }),
      ),
    ).toBe(true);
    expect(isLimitedImpersonation(fakeSession('owner'))).toBe(false);
  });

  it('banner: time left, Extend swaps the token, Ring me too, Exit back to the admin', async () => {
    signInAs('superadmin');
    useAuthStore.getState().startImpersonation(fullSession());
    const extended = { ...fullSession({ expiresIn: 4 * 3600 }), accessToken: 'imp-full-2' };
    vi.mocked(authApi.extendLoginAs).mockResolvedValue(extended);
    vi.mocked(authApi.me).mockResolvedValue({
      ...fullSession({ ringMeToo: true }),
    });
    render();
    expect(screen.getByText(/Superadmin full access · Demo Finance · 2:59:5\d left/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    await waitFor(() => expect(useAuthStore.getState().session?.accessToken).toBe('imp-full-2'));
    // the superadmin session is still saved for Exit
    expect(useAuthStore.getState().savedSession?.user.platformRole).toBe('superadmin');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Ring me too' }));
    expect(authApi.setRingMeToo).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Ring me too' })).toBeChecked(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Exit' }));
    await screen.findByText('admin page');
    expect(useAuthStore.getState().session?.impersonation).toBeNull();
  });

  it('Extend is off once the 12-hour end is reached', () => {
    signInAs('superadmin');
    const s = fullSession({ expiresIn: 3600 });
    if (s.impersonation)
      s.impersonation.maxUntil = new Date(Date.now() + 3600 * 1000).toISOString();
    useAuthStore.getState().startImpersonation(s);
    render();
    expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
  });
});
