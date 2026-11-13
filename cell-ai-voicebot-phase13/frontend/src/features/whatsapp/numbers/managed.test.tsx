import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type { WhatsAppChannel, WhatsAppChannelList } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeChannel, fakeChannelDetail, fakeWhatsAppConfig } from '@/test/whatsapp';

import { channelReasonText } from '../labels';

vi.mock('@/services/api/whatsapp', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    whatsappApi: {
      config: vi.fn(),
      channels: vi.fn(),
      channel: vi.fn(),
      signup: vi.fn(),
      rename: vi.fn(),
      sync: vi.fn(),
      retrySetup: vi.fn(),
      register: vi.fn(),
      coexistenceSync: vi.fn(),
      disconnect: vi.fn(),
      simulate: vi.fn(),
    },
  };
});
vi.mock('../embedded-signup', () => ({ useEmbeddedSignup: () => vi.fn() }));

const api = vi.mocked(whatsappApi);
const list = (items: WhatsAppChannel[]): WhatsAppChannelList => ({
  items,
  counts: {},
  limit: 10,
});
const managed = (over: Partial<WhatsAppChannel> = {}) =>
  fakeChannel({
    provider: 'pinnacle',
    managed: true,
    billing: {
      metaPayer: 'platform',
      creditLine: { status: 'partner_active' },
      paymentMethodOk: null,
    },
    ...over,
  });
const open = (items: WhatsAppChannel[]) => {
  signInAs('owner');
  api.channels.mockResolvedValue(list(items));
  return renderWithProviders({ route: '/whatsapp/numbers' });
};
const card = () => screen.findByRole('region', { name: 'WhatsApp number Support line' });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.config.mockResolvedValue(fakeWhatsAppConfig());
  api.channel.mockResolvedValue(fakeChannelDetail());
});

describe('managed numbers for the owner (PN-T10)', () => {
  it('connected: "Managed" badge and the platform billing line', async () => {
    open([managed()]);
    const region = await card();
    expect(within(region).getByText('Managed')).toBeInTheDocument();
    expect(
      within(region).getByText('Meta billed to: platform (managed number) ✓'),
    ).toBeInTheDocument();
  });

  it('credit line pending: our wording, no PIN / Reconnect actions', async () => {
    open([
      managed({
        status: 'action_needed',
        billing: {
          metaPayer: 'platform',
          creditLine: { status: 'partner_pending' },
          paymentMethodOk: null,
        },
        statusReason: {
          code: 'partner_credit_line_pending',
          message: 'Billing for this number is being activated at the partner.',
          step: null,
        },
      }),
    ]);
    const region = await card();
    expect(
      within(region).getByText(
        "Billing for this number is being activated. We'll let you know when it's ready.",
      ),
    ).toBeInTheDocument();
    expect(within(region).getByText(/being activated$/)).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Enter PIN' })).not.toBeInTheDocument();
  });

  it('partner key problem: support wording, no Reconnect (the platform team fixes it)', async () => {
    open([
      managed({
        status: 'needs_reconnect',
        statusReason: {
          code: 'provider_key_invalid',
          message: 'The partner API key was rejected — replace it.',
          step: null,
        },
      }),
    ]);
    const region = await card();
    expect(
      within(region).getByText('This number needs attention from support.'),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(/managed by the platform team — contact support/),
    ).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(within(region).queryByText(/replace it/)).not.toBeInTheDocument();
  });

  it('channelReasonText: managed codes get our text; others the server message', () => {
    expect(
      channelReasonText({
        managed: true,
        statusReason: { code: 'register_at_partner', message: 'server text' },
      }),
    ).toBe('This number is being registered. It will be ready soon.');
    expect(
      channelReasonText({
        managed: false,
        statusReason: { code: 'register_at_partner', message: 'server text' },
      }),
    ).toBe('server text');
    expect(channelReasonText({ managed: true, statusReason: null })).toBeNull();
  });
});

describe('"Register number" (number still pending at Meta)', () => {
  const pending = () =>
    fakeChannel({
      status: 'action_needed',
      phoneStatus: 'PENDING',
      canRegister: true,
      registration: { status: 'pending' },
      statusReason: {
        code: 'register_failed',
        message: "Meta couldn't register the number.",
        step: 'register',
      },
    } as Partial<WhatsAppChannel>);

  it('registers with the saved PIN (no PIN sent)', async () => {
    api.register.mockResolvedValue({ channel: fakeChannel(), outcome: 'connected' });
    open([pending()]);
    const region = await card();
    await userEvent.click(within(region).getByRole('button', { name: 'Register number' }));
    expect(api.register).toHaveBeenCalledWith(fakeChannel().id, undefined);
    expect(await screen.findByText('Number registered')).toBeInTheDocument();
  });

  it('the number has its own PIN: the PIN form opens', async () => {
    api.register.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        kind: 'http',
        message: 'Validation failed',
        details: [{ path: 'pin', message: 'Enter the 6-digit two-step verification PIN.' }],
      }),
    );
    open([pending()]);
    const region = await card();
    await userEvent.click(within(region).getByRole('button', { name: 'Register number' }));
    expect(await screen.findByRole('dialog', { name: 'Enter PIN' })).toBeInTheDocument();
  });

  it('hidden once the number is registered', async () => {
    open([fakeChannel()]);
    const region = await card();
    expect(
      within(region).queryByRole('button', { name: 'Register number' }),
    ).not.toBeInTheDocument();
  });
});
