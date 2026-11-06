import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminAccountDetail } from '@/services/api/types';
import type * as VoiceApiModule from '@/services/api/voice-api';
import { voiceAdminApi, type VoiceCredentials } from '@/services/api/voice-api';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { VoiceApiCard } from './VoiceApiCard';

/** Superadmin: an account's own Cell24x7 token, caller ID and webhook. */

vi.mock('@/services/api/voice-api', async (importOriginal) => ({
  ...(await importOriginal<typeof VoiceApiModule>()),
  voiceAdminApi: {
    ivrs: vi.fn(),
    setAccount: vi.fn(),
    setCredentials: vi.fn(),
    registerAccountWebhook: vi.fn(),
  },
}));
const api = vi.mocked(voiceAdminApi);

const creds = (over: Partial<VoiceCredentials> = {}): VoiceCredentials => ({
  mode: 'platform',
  tokenHint: null,
  callerId: null,
  verifiedAt: null,
  webhookRegisteredAt: null,
  ...over,
});
const show = (credentials: VoiceCredentials) =>
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <VoiceApiCard
            detail={
              {
                account: { id: 'acc1' },
                voiceApi: { enabled: true, ivrIds: [], ivrEstimateSec: 60, credentials },
              } as unknown as AdminAccountDetail
            }
          />
        ),
      },
    ],
  });

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
  api.ivrs.mockResolvedValue([]);
  api.setCredentials.mockResolvedValue(creds({ mode: 'own', tokenHint: '9876' }));
  api.registerAccountWebhook.mockResolvedValue(
    creds({ mode: 'own', tokenHint: '9876', webhookRegisteredAt: '2026-11-06T10:00:00Z' }),
  );
});

describe('Cell24x7 login per account', () => {
  it('switches to the account’s own token with a caller ID', async () => {
    show(creds());
    const login = await screen.findByRole('region', { name: 'Cell24x7 login' });
    expect(within(login).getByText('Platform token')).toBeInTheDocument();
    await userEvent.click(within(login).getByDisplayValue('own'));
    const save = within(login).getByRole('button', { name: 'Check and save login' });
    expect(save).toBeDisabled(); // no token yet
    await userEvent.type(within(login).getByLabelText('API token'), 'tok-9876');
    await userEvent.type(within(login).getByLabelText('Caller ID (10 digits)'), '9876543210');
    await userEvent.click(save);
    await waitFor(() =>
      expect(api.setCredentials).toHaveBeenCalledWith('acc1', {
        mode: 'own',
        token: 'tok-9876',
        callerId: '9876543210',
      }),
    );
  });

  it('a saved own token: masked, webhook warning, register webhook', async () => {
    show(creds({ mode: 'own', tokenHint: '9876', callerId: '9876543210' }));
    const login = await screen.findByRole('region', { name: 'Cell24x7 login' });
    expect(within(login).getByText('Own token ••••9876')).toBeInTheDocument();
    expect(within(login).getByText('Webhook not registered')).toBeInTheDocument();
    expect(screen.queryByLabelText('IVR menus this account may use')).not.toBeInTheDocument();
    await userEvent.click(within(login).getByRole('button', { name: 'Register webhook' }));
    await waitFor(() => expect(api.registerAccountWebhook).toHaveBeenCalledWith('acc1'));
  });
});
