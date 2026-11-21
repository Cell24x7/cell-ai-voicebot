import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeChannel, fakeWhatsAppConfig } from '@/test/whatsapp';

import { SwitchToMetaDialog } from './SwitchToMetaDialog';

vi.mock('@/services/api/whatsapp', () => ({ whatsappApi: { switchToMeta: vi.fn() } }));
afterEach(() => vi.clearAllMocks());

const managed = (status: 'partner_active' | 'partner_pending' = 'partner_active') =>
  fakeChannel({
    managed: true,
    provider: 'pinnacle',
    billing: {
      metaPayer: 'platform',
      creditLine: { status },
      paymentMethodOk: null,
    } as never,
  });
const show = (channel = managed(), onClose = vi.fn()) => {
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <SwitchToMetaDialog channel={channel} config={fakeWhatsAppConfig()} onClose={onClose} />
        ),
      },
    ],
  });
  return onClose;
};

describe('Switch to Meta direct (SAC-T11)', () => {
  it('explains, runs the (test) signup and posts the code with the ids', async () => {
    signInAs('owner');
    vi.mocked(whatsappApi.switchToMeta).mockResolvedValue({
      channel: fakeChannel(),
      outcome: 'connected',
      partnerWebhookCleared: true,
    });
    show();
    expect(screen.getByText(/Billing stays on the partner/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Test signup (Meta is simulated)' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish signup' }));
    await waitFor(() => expect(whatsappApi.switchToMeta).toHaveBeenCalled());
    const [id, body] = vi.mocked(whatsappApi.switchToMeta).mock.calls[0]!;
    expect(id).toBe('wa1');
    expect(body.code).toBeTruthy();
    expect(body.wabaId).toBeTruthy();
    expect(await screen.findByText(/calls and messages now go through Meta/)).toBeVisible();
  });

  it('a partner credit line not active yet: Continue is off', () => {
    signInAs('owner');
    show(managed('partner_pending'));
    expect(screen.getByText(/Activate the partner credit line first/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('shows the server error (another number) and lets the user try again', async () => {
    signInAs('owner');
    vi.mocked(whatsappApi.switchToMeta).mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'WHATSAPP_SWITCH_MISMATCH',
        message: 'The number from the Meta popup is not this managed number.',
        kind: 'http',
        details: [],
      }),
    );
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Test signup (Meta is simulated)' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish signup' }));
    expect(await screen.findByText(/not this managed number/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
