import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/services/api/auth';
import { ApiError } from '@/services/api/errors';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { MfaPrompt, MfaSection } from './MfaSection';

vi.mock('@/services/api/auth', () => ({
  authApi: {
    refresh: vi.fn(() => Promise.reject(new Error('x'))),
    mfaStatus: vi.fn(),
    mfaSetup: vi.fn(),
    mfaConfirm: vi.fn(),
    mfaVerify: vi.fn(),
    mfaDisable: vi.fn(),
  },
}));

const api = vi.mocked(authApi);
const wrong = new ApiError({
  status: 422,
  code: 'MFA_INVALID',
  message: 'That code is not correct.',
  kind: 'http',
});
const show = (element: React.ReactNode) =>
  renderWithProviders({ routes: [{ path: '/', element }] });

beforeEach(() => {
  sessionStorage.clear();
  signInAs('superadmin');
});
afterEach(() => vi.clearAllMocks());

describe('MfaSection', () => {
  it('is only for a superadmin', async () => {
    signInAs('owner');
    show(<MfaSection />);
    await waitFor(() => expect(api.mfaStatus).not.toHaveBeenCalled());
    expect(screen.queryByText('Two-step sign-in')).toBeNull();
  });

  it('sets up: key, wrong code, right code, recovery codes shown once', async () => {
    api.mfaStatus.mockResolvedValue({ enabled: false, enforced: true });
    api.mfaSetup.mockResolvedValue({ secret: 'ABC123', otpauthUrl: 'otpauth://totp/x' });
    api.mfaConfirm
      .mockRejectedValueOnce(wrong)
      .mockResolvedValueOnce({ recoveryCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'] });
    show(<MfaSection />);
    expect(await screen.findByText(/This platform requires it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set up' }));
    expect(await screen.findByDisplayValue('ABC123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in authenticator app' })).toHaveAttribute(
      'href',
      'otpauth://totp/x',
    );
    const on = screen.getByRole('button', { name: 'Turn on' });
    expect(on).toBeDisabled();
    await userEvent.type(screen.getByLabelText('6-digit code'), '123456');
    await userEvent.click(on);
    expect(await screen.findByText('That code is not correct.')).toBeInTheDocument();
    await userEvent.click(on);
    expect(await screen.findByText(/aaaaa-bbbbb/)).toBeInTheDocument();
    const write = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText: write } });
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(write).toHaveBeenCalledWith('aaaaa-bbbbb\nccccc-ddddd');
    await userEvent.click(screen.getByRole('button', { name: 'I saved them' }));
    await waitFor(() => expect(screen.queryByText(/aaaaa-bbbbb/)).toBeNull());
  });

  it('shows a setup error, and Cancel closes', async () => {
    api.mfaStatus.mockResolvedValue({ enabled: false, enforced: false });
    api.mfaSetup.mockRejectedValue(wrong);
    show(<MfaSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    expect(await screen.findByText('That code is not correct.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('turns off with the password and a code', async () => {
    api.mfaStatus.mockResolvedValue({ enabled: true, enforced: false });
    api.mfaDisable.mockRejectedValueOnce(wrong).mockResolvedValueOnce({ disabled: true });
    show(<MfaSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    const buttons = screen.getAllByRole('button', { name: 'Turn off' });
    const confirm = buttons.at(-1) as HTMLElement;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Your password/), 'pass-word-1');
    await userEvent.type(screen.getByLabelText(/recovery code/), '123456');
    await userEvent.click(confirm);
    expect(await screen.findByText('That code is not correct.')).toBeInTheDocument();
    await userEvent.click(confirm);
    expect(api.mfaDisable).toHaveBeenLastCalledWith({ password: 'pass-word-1', code: '123456' });
    expect(await screen.findByText('Two-step sign-in is off')).toBeInTheDocument();
  });
});

describe('MfaPrompt', () => {
  it('asks only when on and enforced; a good code stays good for this tab', async () => {
    api.mfaStatus.mockResolvedValue({ enabled: true, enforced: true });
    api.mfaVerify.mockRejectedValueOnce(wrong).mockResolvedValueOnce({ verified: true });
    const first = show(<MfaPrompt />);
    expect(await screen.findByText('Enter your two-step code')).toBeInTheDocument();
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/recovery code/), '123456');
    await userEvent.click(go);
    expect(await screen.findByText('That code is not correct.')).toBeInTheDocument();
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    first.unmount();
    show(<MfaPrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Later closes it; not asked when off', async () => {
    api.mfaStatus.mockResolvedValue({ enabled: true, enforced: true });
    const first = show(<MfaPrompt />);
    await userEvent.click(await screen.findByRole('button', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    first.unmount();
    api.mfaStatus.mockResolvedValue({ enabled: false, enforced: true });
    show(<MfaPrompt />);
    await waitFor(() => expect(api.mfaStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
