import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { metaPublicApi } from '@/services/api/meta-public';
import type { WhatsAppChannelList } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { RealtimeContext } from '@/services/realtime/context';
import { signInAs } from '@/test/auth';
import esV4 from '@/test/fixtures/meta-es-v4.json';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';
import { fakeChannel, fakeChannelDetail, fakeWhatsAppConfig } from '@/test/whatsapp';

import { loginOptions, runEmbeddedSignup, useEmbeddedSignup } from './embedded-signup';
import { buildFakeCode, fakeSessionInfo } from './fake-signup';
import { whatsappKeys } from './keys';
import {
  channelStatusColor,
  nameStatusLabel,
  qualityColor,
  tierLabel,
  whatsappErrorMessage,
} from './labels';
import {
  loadMetaSdk,
  META_SDK_SCRIPT_ID,
  parseSessionMessage,
  resetMetaSdk,
  SDK_FAILED_MESSAGE,
  type FacebookSdk,
  type FbLoginResponse,
} from './meta-sdk';
import {
  storeChannel,
  useCanManageWhatsApp,
  useChannel,
  useChannels,
  useConnectWhatsApp,
  useCoexistenceSync,
  useDisconnectChannel,
  useRegisterPin,
  useRenameChannel,
  useRetrySetup,
  useSimulateEvent,
  useSyncChannel,
  useWhatsAppConfig,
  useWhatsAppLiveUpdates,
  WHATSAPP_POLL_MS,
} from './queries';
import { TestSignupDialog } from './TestSignupDialog';

vi.mock('@/services/api/whatsapp', () => ({
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
}));
vi.mock('@/services/api/meta-public', () => ({ metaPublicApi: { deletionStatus: vi.fn() } }));

const api = vi.mocked(whatsappApi);
const list = (items = [fakeChannel()]): WhatsAppChannelList => ({
  items,
  counts: { connected: items.length },
  limit: 10,
});
const httpError = (code: string, message = 'Server said no', details: ApiError['details'] = []) =>
  new ApiError({ status: 422, code, message, kind: 'http', details });

describe('labels', () => {
  it('status / quality colors, tiers, names, errors', () => {
    expect(
      (
        [
          'connected',
          'connecting',
          'action_needed',
          'disconnected',
          'needs_reconnect',
          'restricted',
        ] as const
      ).map(channelStatusColor),
    ).toEqual(['success', 'info', 'warning', 'default', 'error', 'error']);
    expect((['GREEN', 'YELLOW', 'RED', 'UNKNOWN'] as const).map(qualityColor)).toEqual([
      'success',
      'warning',
      'error',
      'default',
    ]);
    expect(tierLabel('TIER_1K')).toBe('1K / day');
    expect(tierLabel(null)).toBe('Not set');
    expect(nameStatusLabel('APPROVED')).toBe('Name approved');
    expect(nameStatusLabel(null)).toBe('No display name review');
    expect(nameStatusLabel('NONE')).toBe('No display name review');
    expect(nameStatusLabel('AVAILABLE_WITHOUT_REVIEW')).toBe('available without review');
    expect(whatsappErrorMessage(httpError('WHATSAPP_NUMBER_IN_USE'))).toMatch(/another account/);
    expect(whatsappErrorMessage(httpError('WHATSAPP_CHANNEL_LIMIT'))).toMatch(/maximum/);
    expect(whatsappErrorMessage(httpError('WHATSAPP_NOT_CONFIGURED'))).toMatch(/isn't set up/);
    expect(
      whatsappErrorMessage(
        httpError('META_API_ERROR', 'x', [{ path: 'meta', message: 'Bad thing' }]),
      ),
    ).toBe('Meta returned an error: Bad thing');
    expect(whatsappErrorMessage(httpError('META_API_ERROR'))).toBe(
      'Meta returned an error. Try again.',
    );
    expect(whatsappErrorMessage(httpError('RATE_LIMITED'))).toMatch(/wait a minute/);
    expect(whatsappErrorMessage(httpError('AUTH_IMPERSONATION_BLOCKED'))).toMatch(
      /viewing as a user/,
    );
    expect(
      whatsappErrorMessage(httpError('WHATSAPP_SIGNUP_FAILED', 'The Meta signup expired')),
    ).toBe('The Meta signup expired');
  });
});

describe('queries', () => {
  const rt = fakeRealtime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RealtimeContext value={rt.client}>{children}</RealtimeContext>
    </QueryClientProvider>
  );
  beforeEach(() => {
    client.clear();
    for (const fn of Object.values(api)) fn.mockReset();
    api.config.mockResolvedValue(fakeWhatsAppConfig());
    api.channels.mockResolvedValue(list());
    api.channel.mockResolvedValue(fakeChannelDetail());
  });
  afterEach(() => vi.useRealTimers());

  it('config, list and detail', async () => {
    const config = renderHook(() => useWhatsAppConfig(), { wrapper });
    await waitFor(() => expect(config.result.current.data?.provider).toBe('fake'));
    const channels = renderHook(() => useChannels(), { wrapper });
    await waitFor(() => expect(channels.result.current.data?.items).toHaveLength(1));
    const detail = renderHook(() => useChannel('wa1'), { wrapper });
    await waitFor(() => expect(detail.result.current.data?.events24h.total).toBe(3));
    const none = renderHook(() => useChannel(null), { wrapper });
    expect(none.result.current.fetchStatus).toBe('idle');
    expect(renderHook(() => useWhatsAppConfig(false), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
  });

  it('polls while a number is settling, stops when final', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.channels.mockResolvedValue(list([fakeChannel({ status: 'action_needed' })]));
    api.channel.mockResolvedValue(fakeChannelDetail({ status: 'connecting' }));
    renderHook(() => useChannels(), { wrapper });
    renderHook(() => useChannel('wa1'), { wrapper });
    await waitFor(() => expect(api.channels).toHaveBeenCalledTimes(1));
    api.channels.mockResolvedValue(list());
    api.channel.mockResolvedValue(fakeChannelDetail());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WHATSAPP_POLL_MS + 10);
    });
    await waitFor(() => expect(api.channels).toHaveBeenCalledTimes(2));
    expect(api.channel).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WHATSAPP_POLL_MS * 2);
    });
    expect(api.channels).toHaveBeenCalledTimes(2);
  });

  it('live updates patch the list and the detail', () => {
    renderHook(() => useWhatsAppLiveUpdates(), { wrapper });
    client.setQueryData(whatsappKeys.channels, list());
    client.setQueryData(whatsappKeys.channel('wa1'), fakeChannelDetail());
    rt.emit('whatsapp.channel.updated', {
      channelId: 'wa1',
      status: 'restricted',
      qualityRating: 'RED',
      messagingLimitTier: 'TIER_250',
      nameStatus: 'APPROVED',
    });
    expect(client.getQueryData<WhatsAppChannelList>(whatsappKeys.channels)?.items[0]).toMatchObject(
      {
        status: 'restricted',
        qualityRating: 'RED',
      },
    );
    expect(client.getQueryData(whatsappKeys.channel('wa1'))).toMatchObject({
      messagingLimitTier: 'TIER_250',
    });
    // other channels untouched; nothing cached → nothing to patch
    client.setQueryData(whatsappKeys.channels, list([fakeChannel({ id: 'other' })]));
    client.removeQueries({ queryKey: whatsappKeys.channel('wa1') });
    rt.emit('whatsapp.channel.updated', {
      channelId: 'wa1',
      status: 'connected',
      qualityRating: 'GREEN',
      messagingLimitTier: null,
      nameStatus: null,
    });
    expect(client.getQueryData<WhatsAppChannelList>(whatsappKeys.channels)?.items[0]?.id).toBe(
      'other',
    );
    client.removeQueries({ queryKey: whatsappKeys.channels });
    rt.emit('whatsapp.channel.updated', {
      channelId: 'wa1',
      status: 'connected',
      qualityRating: 'GREEN',
      messagingLimitTier: null,
      nameStatus: null,
    });
    expect(client.getQueryData(whatsappKeys.channels)).toBeUndefined();
  });

  it('storeChannel adds / replaces and recounts', () => {
    storeChannel(client, fakeChannel());
    expect(client.getQueryData(whatsappKeys.channels)).toBeUndefined();
    client.setQueryData(whatsappKeys.channels, list());
    client.setQueryData(whatsappKeys.channel('wa1'), fakeChannelDetail());
    storeChannel(client, fakeChannel({ status: 'disconnected' }));
    storeChannel(client, fakeChannel({ id: 'wa2' }));
    expect(client.getQueryData<WhatsAppChannelList>(whatsappKeys.channels)).toMatchObject({
      counts: { connected: 1, disconnected: 1 },
    });
    expect(client.getQueryData(whatsappKeys.channel('wa1'))).toMatchObject({
      status: 'disconnected',
      events24h: { total: 3 },
    });
  });

  it('mutations call the API and store the channel', async () => {
    client.setQueryData(whatsappKeys.channels, list([]));
    const result = { channel: fakeChannel(), outcome: 'connected' as const };
    api.signup.mockResolvedValue({ ...result, reconnected: false });
    api.rename.mockResolvedValue(fakeChannel({ label: 'Sales' }));
    api.sync.mockResolvedValue(result);
    api.retrySetup.mockResolvedValue(result);
    api.register.mockResolvedValue(result);
    api.coexistenceSync.mockResolvedValue({ channel: fakeChannel() });
    api.disconnect.mockResolvedValue(fakeChannel({ status: 'disconnected' }));
    const hooks = renderHook(
      () => ({
        connect: useConnectWhatsApp(),
        rename: useRenameChannel(),
        sync: useSyncChannel(),
        retry: useRetrySetup(),
        pin: useRegisterPin(),
        coex: useCoexistenceSync(),
        disconnect: useDisconnectChannel(),
      }),
      { wrapper },
    );
    await act(async () => {
      await hooks.result.current.connect.mutateAsync({ code: 'c', mode: 'cloud_api' });
      await hooks.result.current.rename.mutateAsync({ id: 'wa1', label: 'Sales' });
      await hooks.result.current.sync.mutateAsync('wa1');
      await hooks.result.current.retry.mutateAsync('wa1');
      await hooks.result.current.pin.mutateAsync({ id: 'wa1', pin: '123456' });
      await hooks.result.current.coex.mutateAsync('wa1');
      await hooks.result.current.disconnect.mutateAsync('wa1');
    });
    expect(api.rename).toHaveBeenCalledWith('wa1', 'Sales');
    expect(api.register).toHaveBeenCalledWith('wa1', '123456');
    expect(client.getQueryData<WhatsAppChannelList>(whatsappKeys.channels)?.items[0]?.status).toBe(
      'disconnected',
    );
  });

  it('the simulator refetches shortly after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.simulate.mockResolvedValue({
      kind: 'flagged',
      field: 'x',
      received: 1,
      duplicates: 0,
      ignored: false,
    });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => useSimulateEvent(), { wrapper });
    await act(async () => {
      await hook.result.current.mutateAsync({ id: 'wa1', kind: 'flagged' });
      await vi.advanceTimersByTimeAsync(1_600);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: whatsappKeys.channel('wa1') });
  });

  it('who can manage WhatsApp', () => {
    signInAs('owner');
    expect(renderHook(() => useCanManageWhatsApp(), { wrapper }).result.current).toBe(true);
    signInAs('manager');
    expect(renderHook(() => useCanManageWhatsApp(), { wrapper }).result.current).toBe(false);
    signInAs('owner', { impersonation: { by: 'x' } as never });
    expect(renderHook(() => useCanManageWhatsApp(), { wrapper }).result.current).toBe(false);
    const session = signInAs('owner');
    signInAs('owner', { account: { ...session.account, status: 'suspended' } });
    expect(renderHook(() => useCanManageWhatsApp(), { wrapper }).result.current).toBe(false);
  });
});

describe('Meta SDK loader', () => {
  const fakeSdk = () => ({ init: vi.fn(), login: vi.fn() }) satisfies FacebookSdk;
  beforeEach(() => {
    resetMetaSdk();
    delete window.FB;
    delete window.fbAsyncInit;
    document.getElementById(META_SDK_SCRIPT_ID)?.remove();
  });
  afterEach(() => vi.useRealTimers());

  it('injects the script once and initialises the SDK once', async () => {
    const first = loadMetaSdk({ appId: '1', version: 'v26.0' });
    const second = loadMetaSdk({ appId: '1', version: 'v26.0' });
    expect(document.querySelectorAll(`#${META_SDK_SCRIPT_ID}`)).toHaveLength(1);
    expect(document.getElementById(META_SDK_SCRIPT_ID)?.getAttribute('src')).toBe(
      'https://connect.facebook.net/en_US/sdk.js',
    );
    const sdk = fakeSdk();
    window.FB = sdk;
    window.fbAsyncInit?.();
    expect(await first).toBe(sdk);
    expect(await second).toBe(sdk);
    await loadMetaSdk({ appId: '1', version: 'v26.0' });
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith({
      appId: '1',
      autoLogAppEvents: false,
      xfbml: true,
      version: 'v26.0',
    });
  });

  it('times out, fails on script errors or a missing FB, and can retry', async () => {
    vi.useFakeTimers();
    const slow = loadMetaSdk({ appId: '1', version: 'v26.0', timeoutMs: 100 });
    vi.advanceTimersByTime(101);
    await expect(slow).rejects.toThrow(SDK_FAILED_MESSAGE);
    vi.useRealTimers();
    document.getElementById(META_SDK_SCRIPT_ID)?.remove();
    const broken = loadMetaSdk({ appId: '1', version: 'v26.0' });
    document.getElementById(META_SDK_SCRIPT_ID)?.dispatchEvent(new Event('error'));
    await expect(broken).rejects.toThrow(SDK_FAILED_MESSAGE);
    const empty = loadMetaSdk({ appId: '1', version: 'v26.0' });
    window.fbAsyncInit?.();
    await expect(empty).rejects.toThrow(SDK_FAILED_MESSAGE);
  });
});

describe('session messages', () => {
  const msg = (data: unknown, origin = 'https://www.facebook.com') => ({ origin, data });
  it.each([
    [
      { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '1', phone_number_id: '2' } },
      { kind: 'finish', wabaId: '1', phoneNumberId: '2' },
    ],
    [
      { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_ONLY_WABA', data: { waba_id: '1' } },
      { kind: 'finish', wabaId: '1' },
    ],
    [
      { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: {} },
      { kind: 'finish' },
    ],
    [
      { type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error_message: 'Boom' } },
      { kind: 'error', message: 'Boom' },
    ],
    [
      { type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR' },
      { kind: 'error', message: 'Meta reported an error' },
    ],
    [
      { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE_NUMBER_SETUP' } },
      { kind: 'cancel', step: 'PHONE_NUMBER_SETUP' },
    ],
    [{ type: 'WA_EMBEDDED_SIGNUP', data: {} }, null],
  ])('%j', (data, expected) => {
    expect(parseSessionMessage(msg(JSON.stringify(data)))).toEqual(expected);
  });

  it.each(esV4.cases)(
    "Embedded Signup v4 sample from Meta's docs: $name",
    ({ message, expected }) => {
      expect(parseSessionMessage(msg(JSON.stringify(message)))).toEqual(expected);
    },
  );

  it('accepts https facebook.com origins only', () => {
    const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: {} };
    for (const origin of [
      'https://www.facebook.com',
      'https://web.facebook.com',
      'https://business.facebook.com',
      'https://facebook.com',
    ])
      expect(parseSessionMessage(msg(finish, origin))).toEqual({ kind: 'finish' });
    for (const origin of [
      'http://www.facebook.com',
      'https://evilfacebook.com',
      'https://facebook.com.evil.example',
      'https://www.facebook.com:8443',
      'not an origin',
      '',
    ])
      expect(parseSessionMessage(msg(finish, origin))).toBeNull();
  });

  it('ignores other origins, other types and bad JSON', () => {
    const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: {} };
    expect(parseSessionMessage(msg(JSON.stringify(finish), 'https://evil.example'))).toBeNull();
    expect(parseSessionMessage(msg(finish, 'https://web.facebook.com'))).toEqual({
      kind: 'finish',
    });
    expect(parseSessionMessage(msg('{not json'))).toBeNull();
    expect(
      parseSessionMessage(msg({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_UNKNOWN' })),
    ).toBeNull();
    expect(parseSessionMessage(msg(null))).toBeNull();
    expect(parseSessionMessage(msg(JSON.stringify({ type: 'OTHER' })))).toBeNull();
  });
});

describe('Embedded Signup run', () => {
  const config = fakeWhatsAppConfig({ provider: 'meta', appId: '1', configId: '99' });
  let respond: (r: FbLoginResponse) => void;
  const login = vi.fn((cb: (r: FbLoginResponse) => void, _options: Record<string, unknown>) => {
    respond = cb;
  });
  beforeEach(() => {
    resetMetaSdk();
    login.mockClear();
    const sdk: FacebookSdk = { init: vi.fn(), login };
    window.FB = sdk;
  });
  const post = (event: string, data: Record<string, unknown>) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.facebook.com',
        data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data }),
      }),
    );

  it('login options per mode', () => {
    expect(loginOptions('99', 'cloud_api')).toEqual({
      config_id: '99',
      response_type: 'code',
      override_default_response_type: true,
      extras: {},
    });
    expect(loginOptions('99', 'coexistence')).toEqual({
      config_id: '99',
      response_type: 'code',
      override_default_response_type: true,
      extras: { featureType: 'whatsapp_business_app_onboarding' },
    });
  });

  it('finished with session info (before or after the code), or without it after the wait', async () => {
    const run = runEmbeddedSignup(config, 'coexistence', { sessionWaitMs: 50 });
    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(login.mock.calls[0]?.[1]).toEqual(loginOptions('99', 'coexistence'));
    post('FINISH', { waba_id: '1', phone_number_id: '2' });
    respond({ authResponse: { code: 'CODE' } });
    expect(await run).toEqual({
      kind: 'finished',
      code: 'CODE',
      sessionInfo: { wabaId: '1', phoneNumberId: '2' },
    });
    const late = runEmbeddedSignup(config, 'cloud_api', { sessionWaitMs: 1_000 });
    await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
    respond({ authResponse: { code: 'C2' } });
    post('FINISH_ONLY_WABA', { waba_id: '7' });
    expect(await late).toEqual({ kind: 'finished', code: 'C2', sessionInfo: { wabaId: '7' } });
    const none = runEmbeddedSignup(config, 'cloud_api', { sessionWaitMs: 20 });
    await waitFor(() => expect(login).toHaveBeenCalledTimes(3));
    respond({ authResponse: { code: 'C3' } });
    expect(await none).toEqual({ kind: 'finished', code: 'C3', sessionInfo: {} });
  });

  it('error, cancel, popup blocked, plain cancel, SDK failure', async () => {
    const err = runEmbeddedSignup(config, 'cloud_api');
    await waitFor(() => expect(login).toHaveBeenCalled());
    post('ERROR', { error_message: 'Bad' });
    respond({ authResponse: null, status: 'unknown' });
    expect(await err).toEqual({ kind: 'error', message: 'Bad' });

    const cancel = runEmbeddedSignup(config, 'cloud_api');
    await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
    post('CANCEL', { current_step: 'BUSINESS' });
    respond({ authResponse: null });
    expect(await cancel).toEqual({ kind: 'cancelled', step: 'BUSINESS' });

    const blocked = runEmbeddedSignup(config, 'cloud_api', { now: () => 0 });
    await waitFor(() => expect(login).toHaveBeenCalledTimes(3));
    respond({ status: 'unknown' });
    expect(await blocked).toEqual({ kind: 'popup_blocked' });

    let t = 0;
    const closed = runEmbeddedSignup(config, 'cloud_api', { now: () => (t += 1_000) });
    await waitFor(() => expect(login).toHaveBeenCalledTimes(4));
    respond({ status: 'unknown' });
    expect(await closed).toEqual({ kind: 'cancelled', step: null });

    delete window.FB;
    resetMetaSdk();
    vi.useFakeTimers();
    const failed = runEmbeddedSignup({ ...config, appId: null, configId: null }, 'cloud_api');
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await failed).toEqual({ kind: 'sdk_failed', message: SDK_FAILED_MESSAGE });
    vi.useRealTimers();
  });

  it('the hook waits for the config', async () => {
    const hook = renderHook(({ c }) => useEmbeddedSignup(c), {
      initialProps: { c: undefined as typeof config | undefined },
    });
    expect(await hook.result.current('cloud_api')).toMatchObject({ kind: 'sdk_failed' });
    hook.rerender({ c: config });
    const run = hook.result.current('cloud_api');
    await waitFor(() => expect(login).toHaveBeenCalled());
    respond({ authResponse: { code: 'X' } });
    expect((await run).kind).toBe('finished');
  });
});

describe('fake signup', () => {
  const input = {
    businessName: ' Test Co ',
    phone: '+91 90000 00010',
    displayName: 'Test Co',
    mode: 'cloud_api' as const,
    outcome: 'finish' as const,
  };

  it('builds fake.<base64url JSON> codes with a nonce', () => {
    const code = buildFakeCode(input);
    expect(code).toMatch(/^fake\.[A-Za-z0-9_-]+$/);
    const json = JSON.parse(atob(code.slice(5).replace(/-/g, '+').replace(/_/g, '/'))) as Record<
      string,
      unknown
    >;
    expect(json).toMatchObject({ ...input });
    expect(json.nonce).toMatch(/^[0-9a-f]{12}$/);
    expect(buildFakeCode(input)).not.toBe(code);
  });

  it('session ids hash like the backend fake (business trimmed + digits)', async () => {
    const ids = await fakeSessionInfo(input);
    expect(ids.wabaId).toMatch(/^fake_waba_[0-9a-f]{12}$/);
    expect(ids.phoneNumberId).toBe(ids.wabaId?.replace('waba', 'phone'));
    expect(
      await fakeSessionInfo({ ...input, businessName: 'Test Co', phone: '919000000010' }),
    ).toEqual(ids);
    expect(await fakeSessionInfo({ ...input, outcome: 'only_waba' })).toEqual({
      wabaId: ids.wabaId,
    });
  });

  it('the Test signup dialog validates and reports outcomes', async () => {
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(<TestSignupDialog open mode="coexistence" onClose={onClose} onDone={onDone} />);
    expect(
      screen.getByRole('dialog', { name: 'Test signup (Meta is simulated)' }),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Phone number'));
    await userEvent.type(screen.getByLabelText('Phone number'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Finish signup' }));
    expect(
      await screen.findByText('Enter a phone number like +91 90000 12345'),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Phone number'));
    await userEvent.type(screen.getByLabelText('Phone number'), '+91 90000 54321');
    await userEvent.click(screen.getByRole('button', { name: 'Finish signup' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const finished = onDone.mock.calls[0]?.[0] as {
      kind: string;
      code: string;
      sessionInfo: { wabaId: string };
    };
    expect(finished.kind).toBe('finished');
    expect(finished.code.startsWith('fake.')).toBe(true);
    expect(finished.sessionInfo.wabaId).toMatch(/^fake_waba_/);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Outcome' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cancel at a step' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish signup' }));
    await waitFor(() =>
      expect(onDone).toHaveBeenLastCalledWith({ kind: 'cancelled', step: 'Test signup' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('routes', () => {
  it('/whatsapp → numbers (whatsapp.read); viewers see it', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/whatsapp' });
    expect(await screen.findByRole('heading', { level: 1, name: 'WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Numbers' })).toBeInTheDocument();
  });

  it('/data-deletion: public status lookup and instructions', async () => {
    const api2 = vi.mocked(metaPublicApi);
    api2.deletionStatus.mockResolvedValueOnce({
      status: 'completed',
      receivedAt: '2026-10-22T08:00:00Z',
      completedAt: '2026-10-22T08:00:05Z',
    });
    renderWithProviders({ route: '/data-deletion?code=ABCDEFGHIJKLMNOP' });
    expect(await screen.findByText(/completed/)).toBeInTheDocument();
    expect(screen.getByText(/Remove the.*app/, { exact: false })).toBeInTheDocument();
  });

  it('/data-deletion: received, unknown, no code', async () => {
    const api2 = vi.mocked(metaPublicApi);
    api2.deletionStatus.mockResolvedValueOnce({
      status: 'received',
      receivedAt: '2026-10-22T08:00:00Z',
      completedAt: null,
    });
    const first = renderWithProviders({ route: '/data-deletion?code=A' });
    expect(await screen.findByText(/being processed/)).toBeInTheDocument();
    first.unmount();
    api2.deletionStatus.mockRejectedValueOnce(httpError('RESOURCE_NOT_FOUND'));
    const second = renderWithProviders({ route: '/data-deletion?code=B' });
    expect(await screen.findByText(/couldn't find a deletion request/)).toBeInTheDocument();
    second.unmount();
    api2.deletionStatus.mockResolvedValueOnce({
      status: 'completed',
      receivedAt: '2026-10-22T08:00:00Z',
      completedAt: null,
    });
    const third = renderWithProviders({ route: '/data-deletion?code=C' });
    expect(await screen.findByText(/completed/)).toBeInTheDocument();
    third.unmount();
    renderWithProviders({ route: '/data-deletion' });
    expect(await screen.findByRole('heading', { name: 'Data deletion' })).toBeInTheDocument();
    expect(api2.deletionStatus).toHaveBeenCalledTimes(3);
  });
});
