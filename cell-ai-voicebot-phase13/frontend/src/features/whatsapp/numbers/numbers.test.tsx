import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type { WhatsAppChannel, WhatsAppChannelList } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';
import { fakeChannel, fakeChannelDetail, fakeWhatsAppConfig } from '@/test/whatsapp';

import type { SignupOutcome } from '../embedded-signup';

import { showSimulator } from './texts';

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
const launch = vi.fn<(mode: string) => Promise<SignupOutcome>>();
vi.mock('../embedded-signup', () => ({ useEmbeddedSignup: () => launch }));

const api = vi.mocked(whatsappApi);
const list = (items: WhatsAppChannel[], limit = 10): WhatsAppChannelList => {
  const counts: Record<string, number> = {};
  for (const c of items) counts[c.status] = (counts[c.status] ?? 0) + 1;
  return { items, counts, limit };
};
const httpError = (
  status: number,
  code: string,
  message = 'Server said no',
  details: ApiError['details'] = [],
) => new ApiError({ status, code, message, kind: 'http', details });
const open = (
  items: WhatsAppChannel[] = [fakeChannel()],
  role: Parameters<typeof signInAs>[0] = 'owner',
) => {
  signInAs(role);
  api.channels.mockResolvedValue(list(items));
  return renderWithProviders({ route: '/whatsapp/numbers' });
};
const card = async (label = 'Support line') =>
  screen.findByRole('region', { name: `WhatsApp number ${label}` });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  launch.mockReset();
  api.config.mockResolvedValue(fakeWhatsAppConfig());
  api.channel.mockResolvedValue(fakeChannelDetail());
});

describe('page states', () => {
  it('server without WhatsApp (503 or disabled), other config errors', async () => {
    signInAs('owner');
    api.config.mockRejectedValueOnce(httpError(503, 'WHATSAPP_NOT_CONFIGURED'));
    const a = renderWithProviders({ route: '/whatsapp' });
    expect(await screen.findByText(/WhatsApp isn't set up on this server/)).toBeInTheDocument();
    a.unmount();
    api.config.mockResolvedValueOnce(fakeWhatsAppConfig({ enabled: false }));
    const b = renderWithProviders({ route: '/whatsapp/numbers' });
    expect(await screen.findByText(/WhatsApp isn't set up on this server/)).toBeInTheDocument();
    b.unmount();
    api.config.mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR'));
    renderWithProviders({ route: '/whatsapp/numbers' });
    expect(await screen.findByText(/Couldn't load the WhatsApp settings/)).toBeInTheDocument();
  });

  it('empty state: requirements + Connect for owners; a hint for read-only roles', async () => {
    const a = open([]);
    expect(await screen.findByText('No WhatsApp number connected yet')).toBeInTheDocument();
    expect(screen.getByText(/receive an SMS or voice call/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect WhatsApp' })).toBeEnabled();
    a.unmount();
    open([], 'viewer');
    expect(
      await screen.findByText('Only owners and admins can change WhatsApp numbers.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect WhatsApp' })).not.toBeInTheDocument();
  });

  it('the account limit disables Connect', async () => {
    signInAs('owner');
    api.channels.mockResolvedValue(list([fakeChannel()], 1));
    renderWithProviders({ route: '/whatsapp/numbers' });
    expect(await screen.findByText(/1 of 1 numbers connected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect WhatsApp' })).toBeDisabled();
  });
});

describe('connect wizard (fake provider)', () => {
  const finishTestSignup = async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Test signup (Meta is simulated)' });
    await userEvent.clear(within(dialog).getByLabelText('Phone number'));
    await userEvent.type(within(dialog).getByLabelText('Phone number'), '+91 90000 54321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish signup' }));
  };

  it('Cloud API → test signup → progress → Connected', async () => {
    open([]);
    let resolve: (v: Awaited<ReturnType<typeof whatsappApi.signup>>) => void = () => undefined;
    api.signup.mockImplementation(() => new Promise((r) => (resolve = r)));
    await userEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
    const wizard = await screen.findByRole('dialog', { name: 'Connect WhatsApp' });
    expect(within(wizard).getByText('Test mode — Meta signup is simulated.')).toBeInTheDocument();
    expect(
      within(wizard).getByRole('radio', { name: /New or Cloud API number \(recommended\)/ }),
    ).toBeChecked();
    await userEvent.click(within(wizard).getByRole('button', { name: 'Continue' }));
    await finishTestSignup();
    expect(await screen.findByText('Exchanging the Meta code…')).toBeInTheDocument();
    const body = api.signup.mock.calls[0]?.[0];
    expect(body?.mode).toBe('cloud_api');
    expect(body?.code).toMatch(/^fake\./);
    expect(body?.sessionInfo?.phoneNumberId).toMatch(/^fake_phone_/);
    resolve({ channel: fakeChannel(), outcome: 'connected', reconnected: false });
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText(/Support line · \+91 90000 12345/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Connect WhatsApp' })).not.toBeInTheDocument(),
    );
  });

  it('coexistence warning + mode; action needed / reconnected results', async () => {
    open([]);
    api.signup.mockResolvedValueOnce({
      channel: fakeChannel({
        status: 'action_needed',
        statusReason: { code: 'pin_required', message: 'Enter the PIN.', step: 'register' },
      }),
      outcome: 'action_needed',
      reconnected: true,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
    await userEvent.click(
      screen.getByRole('radio', { name: /Number on the WhatsApp Business app/ }),
    );
    expect(screen.getByText(/Calling won't work on this number/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await finishTestSignup();
    const wizard = await screen.findByRole('dialog', { name: 'Connect WhatsApp' });
    expect(await within(wizard).findByText('Action needed')).toBeInTheDocument();
    expect(within(wizard).getByText(/Enter the PIN\./)).toBeInTheDocument();
    expect(api.signup.mock.calls[0]?.[0].mode).toBe('coexistence');
  });

  it('errors (number in use, Meta) and cancel → try again', async () => {
    open([]);
    api.signup
      .mockRejectedValueOnce(httpError(409, 'WHATSAPP_NUMBER_IN_USE'))
      .mockRejectedValueOnce(
        httpError(502, 'META_API_ERROR', 'x', [{ path: 'meta', message: 'Bad token' }]),
      );
    await userEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await finishTestSignup();
    expect(
      await screen.findByText('This number is already connected to another account.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await finishTestSignup();
    expect(await screen.findByText('Meta returned an error: Bad token')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Test signup (Meta is simulated)' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(
      await screen.findByText(/Signup cancelled at Test signup\. Nothing was saved\./),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    // closing from the first step
    await userEvent.click(screen.getByRole('button', { name: 'Connect WhatsApp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('connect wizard (real Meta provider)', () => {
  beforeEach(() => {
    api.config.mockResolvedValue(
      fakeWhatsAppConfig({ provider: 'meta', appId: '1', configId: '2' }),
    );
  });

  it.each<[SignupOutcome, RegExp]>([
    [{ kind: 'cancelled', step: 'PHONE_NUMBER_SETUP' }, /Signup cancelled at PHONE_NUMBER_SETUP/],
    [{ kind: 'cancelled', step: null }, /^Signup cancelled\. Nothing was saved\.$/],
    [{ kind: 'error', message: 'Bad business' }, /Meta: Bad business/],
    [{ kind: 'popup_blocked' }, /Allow pop-ups for this site/],
    [{ kind: 'sdk_failed', message: "Couldn't load Meta's signup" }, /Couldn't load Meta's signup/],
  ])('%j', async (outcome, text) => {
    open([]);
    launch.mockResolvedValueOnce(outcome);
    await userEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
    expect(screen.queryByText('Test mode — Meta signup is simulated.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(api.signup).not.toHaveBeenCalled();
  });

  it('finished → the code goes to the backend (session info only when given)', async () => {
    open([]);
    let done: (o: SignupOutcome) => void = () => undefined;
    launch.mockImplementationOnce(() => new Promise((r) => (done = r)));
    api.signup.mockResolvedValue({
      channel: fakeChannel(),
      outcome: 'needs_reconnect',
      reconnected: false,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Finish the signup in Meta's window/)).toBeInTheDocument();
    done({ kind: 'finished', code: 'REAL', sessionInfo: {} });
    expect(await screen.findByText('Needs reconnect')).toBeInTheDocument();
    expect(api.signup).toHaveBeenCalledWith({ code: 'REAL', mode: 'cloud_api' });
  });
});

describe('number cards', () => {
  it('connected card: facts, billing, sync / rename / disconnect', async () => {
    open();
    const region = await card();
    expect(within(region).getByText('Connected')).toBeInTheDocument();
    expect(within(region).getByText('High quality')).toBeInTheDocument();
    expect(within(region).getByText('Cloud API')).toBeInTheDocument();
    expect(within(region).getByText(/Limit 1K \/ day/)).toBeInTheDocument();
    expect(within(region).getByText('Meta billed to: platform credit line ✓')).toBeInTheDocument();
    api.sync.mockResolvedValueOnce({ channel: fakeChannel(), outcome: 'connected' });
    await userEvent.click(within(region).getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('Number is connected')).toBeInTheDocument();
    api.sync.mockRejectedValueOnce(httpError(429, 'RATE_LIMITED'));
    await userEvent.click(within(region).getByRole('button', { name: 'Sync now' }));
    expect(
      await screen.findByText('Please wait a minute before trying again.'),
    ).toBeInTheDocument();

    api.rename.mockResolvedValueOnce(fakeChannel({ label: 'Sales' }));
    await userEvent.click(within(region).getByRole('button', { name: 'Rename' }));
    const rename = await screen.findByRole('dialog', { name: 'Rename number' });
    await userEvent.clear(within(rename).getByLabelText('Name in this app'));
    await userEvent.click(within(rename).getByRole('button', { name: 'Save' }));
    expect(await within(rename).findByText('Enter a name')).toBeInTheDocument();
    await userEvent.type(within(rename).getByLabelText('Name in this app'), 'Sales');
    await userEvent.click(within(rename).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Number renamed')).toBeInTheDocument();
    expect(api.rename).toHaveBeenCalledWith('wa1', 'Sales');

    api.disconnect.mockResolvedValueOnce(fakeChannel({ label: 'Sales', status: 'disconnected' }));
    await userEvent.click(within(await card('Sales')).getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByText(/The number keeps working on WhatsApp/)).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect' }),
    );
    expect(await screen.findByText('Number disconnected')).toBeInTheDocument();
    expect(
      await within(await card('Sales')).findByRole('button', { name: 'Connect again' }),
    ).toBeInTheDocument();
  });

  it('rename errors; disconnect cancelled; disconnect failure', async () => {
    open();
    const region = await card();
    api.rename.mockRejectedValueOnce(httpError(403, 'AUTH_IMPERSONATION_BLOCKED'));
    await userEvent.click(within(region).getByRole('button', { name: 'Rename' }));
    const rename = await screen.findByRole('dialog', { name: 'Rename number' });
    await userEvent.click(within(rename).getByRole('button', { name: 'Save' }));
    expect(await within(rename).findByText(/viewing as a user/)).toBeInTheDocument();
    await userEvent.click(within(rename).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Rename number' })).not.toBeInTheDocument(),
    );
    await userEvent.click(within(region).getByRole('button', { name: 'Disconnect' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.disconnect).not.toHaveBeenCalled();
    api.disconnect.mockRejectedValueOnce(httpError(409, 'CONFLICT_INVALID_STATE', 'Nope'));
    await userEvent.click(within(region).getByRole('button', { name: 'Disconnect' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Disconnect' }),
    );
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });

  it('PIN needed → Enter PIN (wrong, then right)', async () => {
    open([
      fakeChannel({
        status: 'action_needed',
        statusReason: {
          code: 'pin_required',
          message: 'Two-step verification PIN is already set.',
          step: 'register',
        },
      }),
    ]);
    const region = await card();
    expect(
      within(region).getByText('Two-step verification PIN is already set.'),
    ).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Retry setup' })).not.toBeInTheDocument();
    api.register
      .mockRejectedValueOnce(
        httpError(422, 'VALIDATION_FAILED', 'x', [
          { path: 'pin', message: "That PIN doesn't match" },
        ]),
      )
      .mockRejectedValueOnce(httpError(502, 'META_API_ERROR'))
      .mockResolvedValueOnce({ channel: fakeChannel(), outcome: 'connected' });
    await userEvent.click(within(region).getByRole('button', { name: 'Enter PIN' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enter PIN' });
    await userEvent.type(within(dialog).getByLabelText('6-digit PIN'), '12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish' }));
    expect(await within(dialog).findByText('The PIN has 6 digits')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('6-digit PIN'), '3456');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish' }));
    expect(await within(dialog).findByText("That PIN doesn't match")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish' }));
    expect(
      await within(dialog).findByText('Meta returned an error. Try again.'),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('Number connected')).toBeInTheDocument();
    expect(api.register).toHaveBeenLastCalledWith('wa1', '123456');
  });

  it('PIN dialog: a saved PIN that still needs attention; cancel', async () => {
    open([
      fakeChannel({
        status: 'action_needed',
        statusReason: { code: 'pin_required', message: 'PIN', step: 'register' },
      }),
    ]);
    api.register.mockResolvedValueOnce({
      channel: fakeChannel({
        status: 'action_needed',
        statusReason: { code: 'pin_required', message: 'PIN', step: 'register' },
      }),
      outcome: 'action_needed',
    });
    await userEvent.click(within(await card()).getByRole('button', { name: 'Enter PIN' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enter PIN' });
    await userEvent.type(within(dialog).getByLabelText('6-digit PIN'), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('PIN saved')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Enter PIN' })).not.toBeInTheDocument(),
    );
    await userEvent.click(within(await card()).getByRole('button', { name: 'Enter PIN' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Enter PIN' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Enter PIN' })).not.toBeInTheDocument(),
    );
  });

  it('action needed → Retry setup (still needs attention / error)', async () => {
    open([
      fakeChannel({
        status: 'action_needed',
        statusReason: {
          code: 'subscribe_failed',
          message: "Couldn't subscribe",
          step: 'subscribe',
        },
      }),
    ]);
    const region = await card();
    api.retrySetup
      .mockResolvedValueOnce({
        channel: fakeChannel({
          status: 'action_needed',
          statusReason: {
            code: 'subscribe_failed',
            message: "Couldn't subscribe",
            step: 'subscribe',
          },
        }),
        outcome: 'action_needed',
      })
      .mockRejectedValueOnce(httpError(502, 'META_API_ERROR'));
    await userEvent.click(within(region).getByRole('button', { name: 'Retry setup' }));
    expect(await screen.findByText('Number still needs attention')).toBeInTheDocument();
    await userEvent.click(within(await card()).getByRole('button', { name: 'Retry setup' }));
    expect(await screen.findByText('Meta returned an error. Try again.')).toBeInTheDocument();
  });

  it('needs reconnect → Reconnect opens the wizard for that number', async () => {
    open([
      fakeChannel({
        status: 'needs_reconnect',
        mode: 'coexistence',
        statusReason: { code: 'token_invalid', message: 'Meta access was removed', step: null },
      }),
    ]);
    const region = await card();
    expect(within(region).getByText('Meta access was removed')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: 'Reconnect' }));
    const wizard = await screen.findByRole('dialog', { name: 'Connect WhatsApp' });
    expect(within(wizard).getByText(/Reconnect Support line: sign up again/)).toBeInTheDocument();
    expect(
      within(wizard).getByRole('radio', { name: /Number on the WhatsApp Business app/ }),
    ).toBeChecked();
  });

  it('restricted, connecting, no number yet, other qualities', async () => {
    open([
      fakeChannel({
        id: 'a',
        label: 'A',
        status: 'restricted',
        qualityRating: 'RED',
        statusReason: { code: 'x', message: 'Meta restricted this account', step: null },
      }),
      fakeChannel({
        id: 'b',
        label: 'B',
        status: 'connecting',
        statusReason: null,
        qualityRating: 'UNKNOWN',
        messagingLimitTier: null,
        displayPhoneNumber: null,
        verifiedName: null,
        nameStatus: null,
        wabaName: null,
      }),
    ]);
    const a = await card('A');
    expect(within(a).getByText('Meta restricted this account')).toBeInTheDocument();
    expect(within(a).getByText('Low quality')).toBeInTheDocument();
    expect(within(a).getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    const b = await card('B');
    expect(within(b).getByText('Connecting')).toBeInTheDocument();
    expect(within(b).getByText('No phone number yet')).toBeInTheDocument();
    expect(within(b).getByText(/Limit Not set/)).toBeInTheDocument();
    expect(within(b).getByText(/fake_waba_aaaaaaaaaaaa/)).toBeInTheDocument();
    expect(within(b).queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(within(b).getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });

  it('billing lines', async () => {
    open([
      fakeChannel({
        id: 'a',
        label: 'A',
        billing: {
          metaPayer: 'customer',
          creditLine: { status: 'not_needed' },
          paymentMethodOk: false,
        },
      }),
      fakeChannel({
        id: 'b',
        label: 'B',
        billing: {
          metaPayer: 'customer',
          creditLine: { status: 'not_needed' },
          paymentMethodOk: true,
        },
      }),
      fakeChannel({
        id: 'c',
        label: 'C',
        billing: { metaPayer: 'platform', creditLine: { status: 'failed' }, paymentMethodOk: null },
      }),
      fakeChannel({
        id: 'd',
        label: 'D',
        billing: {
          metaPayer: 'platform',
          creditLine: { status: 'not_needed' },
          paymentMethodOk: null,
        },
      }),
    ]);
    const link = within(await card('A')).getByRole('link', {
      name: /Add a payment method in WhatsApp Manager/,
    });
    expect(link).toHaveAttribute('href', 'https://business.facebook.com/wa/manage/');
    expect(
      within(await card('B')).getByText(/your WhatsApp Manager payment method ✓/),
    ).toBeInTheDocument();
    expect(within(await card('C')).getByText(/not attached yet/)).toBeInTheDocument();
    expect(within(await card('D')).getByText(/set up during connect/)).toBeInTheDocument();
  });

  it('coexistence section + Retry sync', async () => {
    open([
      fakeChannel({
        mode: 'coexistence',
        isOnBizApp: true,
        coexistence: {
          contactsSync: 'failed',
          historySync: 'requested',
          historyProgress: 55,
          echoesAt: null,
        },
      }),
      fakeChannel({
        id: 'b',
        label: 'B',
        mode: 'coexistence',
        coexistence: {
          contactsSync: 'received',
          historySync: 'received',
          historyProgress: 100,
          echoesAt: null,
        },
      }),
      fakeChannel({
        id: 'c',
        label: 'C',
        mode: 'coexistence',
        coexistence: {
          contactsSync: 'received',
          historySync: 'requested',
          historyProgress: null,
          echoesAt: null,
        },
      }),
    ]);
    const region = await card();
    expect(
      within(region).getByText('Messages from your phone appear in this app.'),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(/Contacts sync: Failed · Chat history: Requested \(55%\)/),
    ).toBeInTheDocument();
    api.coexistenceSync
      .mockResolvedValueOnce({
        channel: fakeChannel({
          mode: 'coexistence',
          coexistence: {
            contactsSync: 'requested',
            historySync: 'requested',
            historyProgress: 55,
            echoesAt: null,
          },
        }),
      })
      .mockRejectedValueOnce(httpError(429, 'RATE_LIMITED'));
    await userEvent.click(within(region).getByRole('button', { name: 'Retry sync' }));
    expect(await screen.findByText('Sync requested')).toBeInTheDocument();
    expect(
      within(await card('B')).queryByRole('button', { name: 'Retry sync' }),
    ).not.toBeInTheDocument();
    expect(within(await card('C')).getByText(/Chat history: Requested$/)).toBeInTheDocument();
  });

  it('a failed sync retry is reported', async () => {
    open([
      fakeChannel({
        mode: 'coexistence',
        coexistence: {
          contactsSync: 'declined',
          historySync: 'received',
          historyProgress: 100,
          echoesAt: null,
        },
      }),
    ]);
    api.coexistenceSync.mockRejectedValueOnce(httpError(429, 'RATE_LIMITED'));
    await userEvent.click(within(await card()).getByRole('button', { name: 'Retry sync' }));
    expect(
      await screen.findByText('Please wait a minute before trying again.'),
    ).toBeInTheDocument();
  });

  it('read only for viewers and impersonators', async () => {
    const a = open([fakeChannel()], 'viewer');
    const region = await card();
    expect(
      screen.getByText(/Only owners and admins can change WhatsApp numbers/),
    ).toBeInTheDocument();
    for (const name of ['Sync now', 'Rename', 'Disconnect']) {
      expect(within(region).queryByRole('button', { name })).not.toBeInTheDocument();
    }
    a.unmount();
    signInAs('owner', { impersonation: { by: 'x' } as never });
    api.channels.mockResolvedValue(list([fakeChannel()]));
    renderWithProviders({ route: '/whatsapp/numbers' });
    expect(
      within(await card()).queryByRole('button', { name: 'Disconnect' }),
    ).not.toBeInTheDocument();
  });

  it('live updates change the card', async () => {
    signInAs('owner');
    api.channels.mockResolvedValue(list([fakeChannel()]));
    const rt = fakeRealtime();
    renderWithProviders({ route: '/whatsapp/numbers', realtime: rt.client });
    await card();
    api.channels.mockResolvedValue(list([fakeChannel({ qualityRating: 'YELLOW' })]));
    rt.emit('whatsapp.channel.updated', {
      channelId: 'wa1',
      status: 'connected',
      qualityRating: 'YELLOW',
      messagingLimitTier: 'TIER_250',
      nameStatus: 'APPROVED',
    });
    expect(await within(await card()).findByText('Medium quality')).toBeInTheDocument();
  });
});

describe('number details drawer', () => {
  it('ids, webhook health, history, test events', async () => {
    open();
    api.simulate
      .mockResolvedValueOnce({
        kind: 'flagged',
        field: 'x',
        received: 1,
        duplicates: 0,
        ignored: false,
      })
      .mockRejectedValueOnce(httpError(404, 'RESOURCE_NOT_FOUND', 'Gone'));
    await userEvent.click(within(await card()).getByRole('button', { name: 'Details' }));
    const drawer = await screen.findByRole('dialog', { name: 'Number details' });
    expect(await within(drawer).findByText('fake_biz_aaaaaaaaaaaa')).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: 'Copy WhatsApp account id' }),
    ).toBeInTheDocument();
    expect(within(drawer).getByText('messages: 2')).toBeInTheDocument();
    const history = within(drawer).getByRole('list', { name: 'History' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send test event' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Number flagged' }));
    expect(await screen.findByText('Test event sent: Number flagged')).toBeInTheDocument();
    expect(api.simulate).toHaveBeenCalledWith('wa1', 'flagged');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send test event' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Incoming message' }));
    expect(await screen.findByText('Gone')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send test event' }));
    fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' });
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close details' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Number details' })).not.toBeInTheDocument(),
    );
  });

  it('history reasons; no test events with the real provider; loading', async () => {
    api.config.mockResolvedValue(
      fakeWhatsAppConfig({ provider: 'meta', appId: '1', configId: '2' }),
    );
    api.channel.mockResolvedValue(
      fakeChannelDetail({
        history: [
          {
            status: 'needs_reconnect',
            reason: 'Token gone',
            at: '2026-10-22T09:00:00.000Z',
            by: null,
          },
        ],
      }),
    );
    open();
    await userEvent.click(within(await card()).getByRole('button', { name: 'Details' }));
    const drawer = await screen.findByRole('dialog', { name: 'Number details' });
    expect(await within(drawer).findByText('Needs reconnect — Token gone')).toBeInTheDocument();
    expect(
      within(drawer).queryByRole('button', { name: 'Send test event' }),
    ).not.toBeInTheDocument();
    expect(showSimulator(fakeWhatsAppConfig(), true)).toBe(false);
    expect(showSimulator(undefined)).toBe(false);
  });
});
