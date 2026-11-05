import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { authApi } from '@/services/api/auth';
import { ApiError } from '@/services/api/errors';
import { fakeSession } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
    signupOptions: vi.fn(() => Promise.resolve({ open: true, resellerSignup: 'open' })),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    inviteInfo: vi.fn(),
    acceptInvite: vi.fn(),
    refresh: vi.fn(() => Promise.reject(new Error('no session'))),
    issueWsTicket: vi.fn(),
  },
}));
vi.mock('@/services/api/system', () => ({
  getSystemInfo: vi.fn(() => new Promise(() => undefined)),
}));

const api = vi.mocked(authApi);
const httpError = (
  status: number,
  code: string,
  extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {},
) => new ApiError({ status, code, kind: 'http', message: `msg ${code}`, ...extra });

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('LoginPage', () => {
  it('signs in and goes to next', async () => {
    api.login.mockResolvedValue(fakeSession('manager'));
    renderWithProviders({ route: '/login?next=/dev/realtime' });
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'blue-tiger-river-42');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(api.login).toHaveBeenCalledWith({
      email: 'asha@example.com',
      password: 'blue-tiger-river-42',
    });
    expect(await screen.findByRole('heading', { name: 'Realtime (dev)' })).toBeInTheDocument();
  });

  it('validates fields before calling the API', async () => {
    renderWithProviders({ route: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('shows wrong credentials and the lockout time', async () => {
    renderWithProviders({ route: '/login' });
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    api.login.mockRejectedValueOnce(httpError(401, 'AUTH_INVALID_CREDENTIALS'));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('msg AUTH_INVALID_CREDENTIALS')).toBeInTheDocument();
    api.login.mockRejectedValueOnce(
      httpError(429, 'AUTH_TOO_MANY_ATTEMPTS', { retryAfterSec: 600 }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByText('Too many failed sign-ins. Try again in 10 minutes.'),
    ).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    renderWithProviders({ route: '/login' });
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});

describe('SignupPage (Phase 19: no e-mail)', () => {
  const fill = async () => {
    await userEvent.type(screen.getByLabelText('Business name'), 'Demo Finance');
    await userEvent.type(screen.getByLabelText('Your name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Work email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'blue-tiger-river-42');
    await userEvent.click(screen.getByRole('checkbox'));
  };

  it('Business: pick the type, fill the form, signed in and sent home', async () => {
    api.signup.mockResolvedValue(fakeSession('owner'));
    renderWithProviders({ route: '/signup' });
    await userEvent.click(await screen.findByRole('button', { name: 'Business' }));
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(api.signup).toHaveBeenCalledWith(
      expect.objectContaining({
        accountType: 'business',
        businessName: 'Demo Finance',
        email: 'asha@example.com',
        acceptTerms: true,
        timezone: expect.any(String) as string,
      }),
    );
    expect(api.signup.mock.calls[0]?.[0]).not.toHaveProperty('website');
  });

  it('Reseller: sends accountType reseller and opens the reseller panel', async () => {
    const base = fakeSession('owner');
    api.signup.mockResolvedValue({
      ...base,
      account: {
        ...base.account,
        kind: 'reseller',
        reseller: { status: 'active', customersCanTopUp: false },
      },
    });
    renderWithProviders({ route: '/signup' });
    await userEvent.click(await screen.findByRole('button', { name: 'Reseller' }));
    expect(
      screen.getByRole('heading', { name: 'Create your reseller account' }),
    ).toBeInTheDocument();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(api.signup).toHaveBeenCalledWith(expect.objectContaining({ accountType: 'reseller' })),
    );
    expect(await screen.findByRole('heading', { name: 'Reseller', level: 1 })).toBeVisible();
  });

  it('needs the terms tick; shows client rules, server field errors and a taken e-mail', async () => {
    renderWithProviders({ route: '/signup' });
    await userEvent.click(await screen.findByRole('button', { name: 'Business' }));
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.type(screen.getByLabelText('Phone (optional)'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('At least 10 characters')).toBeInTheDocument();
    expect(
      screen.getByText('Use the international format, e.g. +919876543210'),
    ).toBeInTheDocument();
    expect(screen.getByText('Accept the terms to continue')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Phone (optional)'));
    await userEvent.clear(screen.getByLabelText('Password'));
    await fill();
    api.signup.mockRejectedValueOnce(httpError(409, 'AUTH_EMAIL_TAKEN'));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('link', { name: 'Log in instead' })).toBeInTheDocument();
    api.signup.mockRejectedValueOnce(
      httpError(422, 'VALIDATION_FAILED', {
        details: [{ path: 'body.password', message: 'This password is too common.' }],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument();
  });

  it('closed states: reseller card hidden; all signups closed', async () => {
    api.signupOptions.mockResolvedValueOnce({ open: true, resellerSignup: 'closed' });
    const { unmount } = renderWithProviders({ route: '/signup' });
    expect(await screen.findByRole('button', { name: 'Business' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reseller' })).not.toBeInTheDocument();
    unmount();
    api.signupOptions.mockResolvedValueOnce({ open: false, resellerSignup: 'open' });
    renderWithProviders({ route: '/signup' });
    expect(await screen.findByText(/Signups are closed/)).toBeInTheDocument();
  });

  it('/verify-email now goes to sign in', async () => {
    renderWithProviders({ route: '/verify-email?email=a%40b.co' });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('Forgot / reset password', () => {
  it('always shows the neutral confirmation', async () => {
    api.forgotPassword.mockResolvedValue({ message: 'ok' });
    renderWithProviders({ route: '/forgot-password' });
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account exists for this email/)).toBeInTheDocument();
  });

  it('resets with matching passwords and goes to sign in', async () => {
    api.resetPassword.mockResolvedValue({ message: 'ok' });
    renderWithProviders({ route: '/reset-password?token=tok123' });
    await userEvent.type(screen.getByLabelText('New password'), 'green-falcon-lake-77');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'green-falcon-lake-7');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Repeat new password'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(api.resetPassword).toHaveBeenCalledWith({
      token: 'tok123',
      password: 'green-falcon-lake-77',
    });
  });

  it('explains invalid / missing reset links', () => {
    renderWithProviders({ route: '/reset-password' });
    expect(screen.getByText('This reset link is invalid or has expired.')).toBeInTheDocument();
  });
});

describe('AcceptInvitePage', () => {
  it('shows the invitation and signs the member in', async () => {
    api.inviteInfo.mockResolvedValue({
      email: 'new@example.com',
      name: 'New Person',
      accountName: 'Demo Finance',
      inviterName: 'Asha',
      roleName: 'Manager',
    });
    api.acceptInvite.mockResolvedValue(fakeSession('manager'));
    renderWithProviders({ route: '/accept-invite?token=tok' });
    expect(await screen.findByText('Demo Finance')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Your name')).toHaveValue('New Person'));
    await userEvent.type(screen.getByLabelText('Password'), 'teal-canyon-river-81');
    await userEvent.type(screen.getByLabelText('Repeat password'), 'teal-canyon-river-81');
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(useAuthStore.getState().session?.role.key).toBe('manager'));
    expect(api.acceptInvite).toHaveBeenCalledWith({
      token: 'tok',
      password: 'teal-canyon-river-81',
      name: 'New Person',
    });
  });

  it('explains invalid invitations', async () => {
    api.inviteInfo.mockRejectedValue(httpError(422, 'AUTH_CODE_INVALID'));
    renderWithProviders({ route: '/accept-invite?token=bad' });
    expect(
      await screen.findByRole('heading', { name: 'Invitation not valid' }),
    ).toBeInTheDocument();
  });
});
