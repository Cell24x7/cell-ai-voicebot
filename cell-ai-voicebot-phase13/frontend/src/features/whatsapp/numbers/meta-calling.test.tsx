import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type { MetaCalling, WhatsAppChannel } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeChannel, fakeWhatsAppConfig } from '@/test/whatsapp';

import { ChannelCard } from './ChannelCard';
import { MetaCallingSection } from './MetaCallingSection';

vi.mock('@/services/api/whatsapp', () => ({
  whatsappApi: {
    enableMetaCalling: vi.fn(),
    disableMetaCalling: vi.fn(),
    checkMetaCalling: vi.fn(),
  },
}));
afterEach(() => vi.clearAllMocks());

const HOUR = 3_600_000;
const meta = (over: Partial<MetaCalling> = {}): MetaCalling => ({
  ...fakeChannel().metaCalling,
  ...over,
});
const managed = (m: Partial<MetaCalling> = {}): WhatsAppChannel =>
  fakeChannel({ managed: true, provider: 'pinnacle', metaCalling: meta(m) });
const onMeta = () =>
  managed({
    status: 'on',
    method: 'embedded_signup',
    tokenLast4: 'ab12',
    webhookCheck: { ...fakeChannel().webhookCheck, status: 'ok' },
  });
const show = (channel: WhatsAppChannel) =>
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: <MetaCallingSection channel={channel} config={fakeWhatsAppConfig()} />,
      },
    ],
  });
const steps = (ok = true) =>
  (['token', 'verify', 'app_subscribed', 'fields', 'calling_on'] as const).map((key, i) => ({
    key,
    ok: ok || i < 2,
    detail: ok || i < 2 ? null : 'Callback verification failed',
  }));
const fullAccess = () =>
  signInAs('owner', {
    impersonation: {
      impersonatorId: 'sa1',
      expiresAt: new Date(Date.now() + 3 * HOUR).toISOString(),
      mode: 'full',
      kind: 'superadmin',
      returnTo: '/admin/accounts/a1',
      startedAt: new Date(Date.now() - HOUR).toISOString(),
      maxUntil: new Date(Date.now() + 11 * HOUR).toISOString(),
      ringMeToo: false,
    },
  });

describe('Calling on karo (Meta direct) — PMC-T8', () => {
  it('off: explains, runs the (test) signup, posts the code and shows every step', async () => {
    signInAs('owner');
    vi.mocked(whatsappApi.enableMetaCalling).mockResolvedValue({
      channel: onMeta(),
      steps: steps(),
    });
    show(managed());
    expect(screen.getByText('Calls off (partner)')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Calling on karo (Meta direct)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Calling on karo (Meta direct)' });
    expect(within(dialog).getByText(/credit line Pinnacle par hi rahenge/)).toBeVisible();
    // an owner never sees the token field
    expect(within(dialog).queryByText(/System User token/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue with Facebook' }));
    const signup = await screen.findByRole('dialog', { name: 'Test signup (Meta is simulated)' });
    await userEvent.click(within(signup).getByRole('button', { name: 'Finish signup' }));
    await waitFor(() => expect(whatsappApi.enableMetaCalling).toHaveBeenCalled());
    const [id, body] = vi.mocked(whatsappApi.enableMetaCalling).mock.calls[0]!;
    expect(id).toBe('wa1');
    expect('code' in body && body.code).toBeTruthy();
    expect(await screen.findByText(/Calling on — ab is number par call aayegi/)).toBeVisible();
    expect(screen.getByText(/Calling ON at WhatsApp/)).toBeVisible();
  });

  it('a failed step shows ❌ with its reason; a server error lets the user try again', async () => {
    signInAs('owner');
    vi.mocked(whatsappApi.enableMetaCalling).mockResolvedValueOnce({
      channel: managed({
        status: 'error',
        error: { code: 'step_failed', step: 'webhook', message: 'Callback verification failed' },
      }),
      steps: steps(false),
    });
    show(managed());
    await userEvent.click(screen.getByRole('button', { name: 'Calling on karo (Meta direct)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Calling on karo (Meta direct)' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue with Facebook' }));
    const signup = await screen.findByRole('dialog', { name: 'Test signup (Meta is simulated)' });
    await userEvent.click(within(signup).getByRole('button', { name: 'Finish signup' }));
    expect(await screen.findAllByText(/Callback verification failed/)).not.toHaveLength(0);
    expect(screen.getByText(/❌ Hamara app/)).toBeVisible();

    vi.mocked(whatsappApi.enableMetaCalling).mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'WHATSAPP_META_CALLING_MISMATCH',
        message: 'x',
        kind: 'http',
        details: [],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Calling on karo (Meta direct)' }));
    const again = await screen.findByRole('dialog', { name: 'Calling on karo (Meta direct)' });
    await userEvent.click(within(again).getByRole('button', { name: 'Continue with Facebook' }));
    const signup2 = await screen.findByRole('dialog', { name: 'Test signup (Meta is simulated)' });
    await userEvent.click(within(signup2).getByRole('button', { name: 'Finish signup' }));
    expect(await screen.findByText(/dusra WhatsApp account/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('a superadmin in Full access can paste a System User token', async () => {
    fullAccess();
    vi.mocked(whatsappApi.enableMetaCalling).mockResolvedValue({
      channel: onMeta(),
      steps: steps(),
    });
    show(managed());
    await userEvent.click(screen.getByRole('button', { name: 'Calling on karo (Meta direct)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Calling on karo (Meta direct)' });
    await userEvent.click(within(dialog).getByText(/Advanced \(superadmin\)/));
    await userEvent.type(
      within(dialog).getByLabelText('System User token'),
      'EAAG-system-user-token-123456',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use this token' }));
    await waitFor(() =>
      expect(whatsappApi.enableMetaCalling).toHaveBeenCalledWith('wa1', {
        accessToken: 'EAAG-system-user-token-123456',
      }),
    );
  });

  it('on: status, Check / Fix with steps, Calling off with "at WhatsApp too"', async () => {
    signInAs('owner');
    vi.mocked(whatsappApi.checkMetaCalling).mockResolvedValue({
      channel: onMeta(),
      steps: steps(),
    });
    vi.mocked(whatsappApi.disableMetaCalling).mockResolvedValue({
      channel: managed(),
      turnedOffAtWhatsApp: true,
      unsubscribed: true,
    });
    show(onMeta());
    expect(screen.getByText('Calls via Meta')).toBeVisible();
    expect(screen.getByText(/token …ab12/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Calling on karo (Meta direct)' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Check / Fix' }));
    await waitFor(() => expect(whatsappApi.checkMetaCalling).toHaveBeenCalledWith('wa1'));
    expect(await screen.findByText(/✅ Meta access mila/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Calling off' }));
    const confirm = await screen.findByRole('dialog', { name: 'Calling off (Meta direct)?' });
    await userEvent.click(within(confirm).getByLabelText('Turn calling off at WhatsApp too'));
    await userEvent.click(within(confirm).getByRole('button', { name: 'Calling off' }));
    await waitFor(() =>
      expect(whatsappApi.disableMetaCalling).toHaveBeenCalledWith('wa1', {
        turnOffAtWhatsApp: true,
      }),
    );
  });

  it('broken: the reason and Retry check; viewers see no buttons', () => {
    signInAs('viewer');
    show(
      managed({
        status: 'error',
        error: { code: 'token_invalid', step: 'verify', message: 'Meta no longer accepts it' },
      }),
    );
    expect(screen.getByText(/Meta no longer accepts it/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry check' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Calling on karo (Meta direct)' })).toBeNull();
  });

  it('the number card shows the calls chip of a managed number', () => {
    signInAs('owner');
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <ChannelCard
              channel={{ ...onMeta(), status: 'restricted' }}
              canManage
              onDetails={vi.fn()}
              onRename={vi.fn()}
              onPin={vi.fn()}
              onReconnect={vi.fn()}
            />
          ),
        },
      ],
    });
    expect(screen.getByText('Calls via Meta')).toBeVisible();
  });
});
