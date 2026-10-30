import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
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

  it('shows wrong credentials, lockout time, and sends unverified users to the code screen', async () => {
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
    api.login.mockRejectedValueOnce(httpError(403, 'AUTH_EMAIL_NOT_VERIFIED'));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    renderWithProviders({ route: '/login' });
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});

describe('SignupPage', () => {
  it('creates the account and opens the code screen', async () => {
    api.signup.mockResolvedValue({ message: 'ok' });
    renderWithProviders({ route: '/signup' });
    await userEvent.type(screen.getByLabelText('Business name'), 'Demo Finance');
    await userEvent.type(screen.getByLabelText('Your name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Work email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'blue-tiger-river-42');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(api.signup).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: 'Demo Finance',
        email: 'asha@example.com',
        phone: undefined,
        timezone: expect.any(String) as string,
      }),
    );
  });

  it('shows client rules and server field errors', async () => {
    renderWithProviders({ route: '/signup' });
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.type(screen.getByLabelText('Phone (optional)'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('At least 10 characters')).toBeInTheDocument();
    expect(
      screen.getByText('Use the international format, e.g. +919876543210'),
    ).toBeInTheDocument();

    api.signup.mockRejectedValueOnce(
      httpError(422, 'VALIDATION_FAILED', {
        details: [{ path: 'body.password', message: 'This password is too common.' }],
      }),
    );
    await userEvent.clear(screen.getByLabelText('Phone (optional)'));
    await userEvent.type(screen.getByLabelText('Business name'), 'Demo');
    await userEvent.type(screen.getByLabelText('Your name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Work email'), 'a@example.com');
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'passwordpassword');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument();
  });
});

describe('VerifyEmailPage', () => {
  it('fills all boxes on paste and verifies automatically', async () => {
    api.verifyEmail.mockResolvedValue(fakeSession('owner'));
    renderWithProviders({ route: '/verify-email?email=asha%40example.com' });
    fireEvent.paste(screen.getByLabelText('Digit 1'), {
      clipboardData: { getData: () => '04 29 17' },
    });
    await waitFor(() =>
      expect(api.verifyEmail).toHaveBeenCalledWith({ email: 'asha@example.com', code: '042917' }),
    );
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
  });

  it('auto-advances while typing and shows a wrong-code message', async () => {
    api.verifyEmail.mockRejectedValue(httpError(422, 'AUTH_CODE_INVALID'));
    renderWithProviders({ route: '/verify-email?email=asha%40example.com' });
    const first = screen.getByLabelText('Digit 1');
    await userEvent.click(first);
    await userEvent.keyboard('123456');
    expect(await screen.findByText('That code is wrong or has expired.')).toBeInTheDocument();
    expect(api.verifyEmail).toHaveBeenCalledWith({ email: 'asha@example.com', code: '123456' });
  });

  it('enables resend after the 60 s countdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.resendVerification.mockResolvedValue({ message: 'ok' });
    renderWithProviders({ route: '/verify-email?email=asha%40example.com' });
    expect(screen.getByRole('button', { name: 'Resend code in 60s' })).toBeDisabled();
    for (let i = 0; i < 60; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    const resend = screen.getByRole('button', { name: 'Resend code' });
    fireEvent.click(resend);
    await waitFor(() => expect(api.resendVerification).toHaveBeenCalledWith('asha@example.com'));
    expect(
      await screen.findByText('If your email still needs verifying, a new code is on its way.'),
    ).toBeInTheDocument();
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
