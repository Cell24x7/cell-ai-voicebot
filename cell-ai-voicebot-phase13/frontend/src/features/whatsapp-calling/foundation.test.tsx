import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InteractiveContent } from '@/features/inbox/chat/MessageCards';
import { callsApi } from '@/services/api/calls';
import { ApiError } from '@/services/api/errors';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { RealtimeContext } from '@/services/realtime/context';
import { signInAs } from '@/test/auth';
import { fakeCallingSettings, fakeCallPermission, fakeWaCall } from '@/test/calls-wa';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { CallBubbleContent } from './bubbles';
import { callingKeys } from './keys';
import {
  callBubbleText,
  cannotCallText,
  formatCallDuration,
  permissionText,
  unavailableText,
} from './labels';
import { CallingPanelSection } from './panel/CallingPanelSection';
import {
  PERMISSION_POLL_MS,
  useCallingLiveUpdates,
  useCallPermission,
  useCanAnswer,
  useCanCall,
  useCanManageCalling,
  useCanRequestPermission,
} from './queries';

vi.mock('@/services/api/whatsapp-calling', () => ({
  whatsappCallingApi: {
    getSettings: vi.fn(),
    permission: vi.fn(),
    requestPermission: vi.fn(),
  },
}));
vi.mock('@/services/api/calls', () => ({ callsApi: { list: vi.fn() } }));
const api = vi.mocked(whatsappCallingApi);
const page = (data: unknown[]) => ({
  success: true as const,
  data,
  meta: { hasMore: false, nextCursor: null },
});

beforeEach(() => {
  signInAs('owner');
  api.getSettings.mockResolvedValue(fakeCallingSettings());
  api.permission.mockResolvedValue(fakeCallPermission('none'));
  api.requestPermission.mockResolvedValue({ messageId: 'm1', kind: 'interactive' });
  vi.mocked(callsApi.list).mockResolvedValue(page([]) as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const showPanel = (
  windowExpiresAt: string | null = new Date(Date.now() + 3_600_000).toISOString(),
) =>
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <CallingPanelSection
            channelId="wa1"
            contactId="k1"
            windowExpiresAt={windowExpiresAt}
            initial={null}
          />
        ),
      },
    ],
  });

describe('contact panel → WhatsApp calling', () => {
  it('no permission: asks inside the window with the number text (interactive)', async () => {
    showPanel();
    expect(await screen.findByText('No permission')).toBeInTheDocument();
    expect(screen.getByText('The customer has not allowed calls yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask to allow calls' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ask to allow calls' });
    const text = await within(dialog).findByRole('textbox', { name: 'Message' });
    await waitFor(() =>
      expect(text).toHaveValue('Kya hum aapko WhatsApp par call kar sakte hain?'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(api.requestPermission).toHaveBeenCalledWith({ channelId: 'wa1', contactId: 'k1' }),
    );
  });

  it('an edited text goes with the request; outside the window the template is explained', async () => {
    showPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to allow calls' }));
    const dialog = await screen.findByRole('dialog');
    const text = within(dialog).getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(text).not.toHaveValue(''));
    await userEvent.clear(text);
    await userEvent.type(text, 'Can we call you about your EMI?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(api.requestPermission).toHaveBeenCalledWith({
        channelId: 'wa1',
        contactId: 'k1',
        body: 'Can we call you about your EMI?',
      }),
    );
  });

  it('closed window: the approved template is sent (no text box)', async () => {
    showPanel(null);
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to allow calls' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/approved call permission template is sent/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('a refused request shows the reason', async () => {
    api.requestPermission.mockRejectedValue(
      new ApiError({
        status: 429,
        code: 'WHATSAPP_CALL_PERMISSION_LIMIT',
        message: 'x',
        kind: 'http',
        details: [],
      }),
    );
    showPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to allow calls' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('textbox')).not.toHaveValue(''));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText(/request was sent recently/)).toBeInTheDocument();
  });

  it('allowed: until when, history, last WhatsApp calls; no request button', async () => {
    api.permission.mockResolvedValue(fakeCallPermission('temporary'));
    vi.mocked(callsApi.list).mockResolvedValue(
      page([
        fakeWaCall('completed', 'human', 'outbound'),
        fakeWaCall('failed', 'human', 'inbound', { id: 'wc2', durationSec: 0 }),
      ]) as never,
    );
    showPanel();
    expect(await screen.findByText('Can call until 30 Oct 2026, 15:30')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to allow calls' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Permission history' })).getByText(/Can call/),
    ).toBeInTheDocument();
    const recent = await screen.findByLabelText('Recent WhatsApp calls');
    expect(within(recent).getByRole('link', { name: 'Outgoing · 0:26' })).toHaveAttribute(
      'href',
      '/calls/wc1',
    );
    expect(
      within(recent).getByRole('link', { name: 'Incoming · Missed call' }),
    ).toBeInTheDocument();
    expect(callsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'k1', provider: 'whatsapp', limit: 5 }),
    );
  });

  it('declined: the reason, no button; viewers never get the request button', async () => {
    api.permission.mockResolvedValue(fakeCallPermission('declined'));
    showPanel();
    expect(await screen.findByText('The customer declined calls.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to allow calls' })).not.toBeInTheDocument();
  });

  it('viewer: no request button even when allowed by the server', async () => {
    signInAs('viewer');
    showPanel();
    expect(await screen.findByText('No permission')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to allow calls' })).not.toBeInTheDocument();
  });
});

describe('permission queries', () => {
  const wrapper = (client: QueryClient, realtime = fakeRealtime()) =>
    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          <RealtimeContext value={realtime.client}>{children}</RealtimeContext>
        </QueryClientProvider>
      );
    };

  it('polls while requested and stops once answered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.permission
      .mockResolvedValueOnce(fakeCallPermission('requested'))
      .mockResolvedValue(fakeCallPermission('temporary'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCallPermission('wa1', 'k1'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.data?.status).toBe('requested'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PERMISSION_POLL_MS + 10);
    });
    await waitFor(() => expect(result.current.data?.status).toBe('temporary'));
    const calls = api.permission.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PERMISSION_POLL_MS * 3);
    });
    expect(api.permission.mock.calls.length).toBe(calls);
  });

  it('a live permission change refreshes that contact', () => {
    const realtime = fakeRealtime();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useCallingLiveUpdates(), { wrapper: wrapper(client, realtime) });
    realtime.emit('whatsapp.call_permission.updated', {
      contactId: 'k1',
      channelId: 'wa1',
      status: 'temporary',
      expiresAt: null,
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: callingKeys.permission('wa1', 'k1') });
    realtime.emit('whatsapp.channel.updated', {
      channelId: 'wa1',
      status: 'connected',
      qualityRating: 'GREEN',
      messagingLimitTier: 'TIER_2K',
      nameStatus: null,
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: callingKeys.settings('wa1') });
  });
});

describe('who can do what', () => {
  const can = () =>
    renderHook(() => ({
      call: useCanCall(),
      answer: useCanAnswer(),
      manage: useCanManageCalling(),
      request: useCanRequestPermission(),
    })).result.current;
  it.each([
    ['owner', { call: true, answer: true, manage: true, request: true }],
    ['admin', { call: true, answer: true, manage: true, request: true }],
    ['manager', { call: true, answer: true, manage: false, request: true }],
    ['agent', { call: true, answer: true, manage: false, request: true }],
    ['viewer', { call: false, answer: false, manage: false, request: false }],
  ] as const)('%s', (role, expected) => {
    signInAs(role);
    expect(can()).toEqual(expected);
  });
  it('impersonating or suspended: nothing', () => {
    signInAs('owner', { impersonation: { superadminId: 'sa' } as never });
    expect(can()).toEqual({ call: false, answer: false, manage: false, request: false });
  });
});

describe('call bubbles and labels', () => {
  const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
  it('request bubble: text stays text, state chip, the answer', () => {
    inRouter(
      <InteractiveContent
        interactive={{
          kind: 'call_permission_request',
          header: null,
          body: '<b>Call?</b>',
          footer: null,
          buttons: [],
          listButton: null,
          sections: [],
          cta: null,
          reply: null,
          nfmResponse: null,
          nfmTruncated: false,
          callPermission: {
            response: 'accept',
            isPermanent: false,
            expiresAt: null,
            source: 'user_action',
          },
          voiceCall: null,
          requestState: 'answered',
        }}
      />,
    );
    expect(screen.getByText('<b>Call?</b>')).toBeInTheDocument();
    expect(screen.getByText('Answered')).toBeInTheDocument();
    expect(screen.getByText('Allowed calls for 7 days')).toBeInTheDocument();
  });

  it('reply bubbles: accepted always / declined / after calling', () => {
    const base = {
      header: null,
      body: null,
      footer: null,
      buttons: [],
      listButton: null,
      sections: [],
      cta: null,
      reply: null,
      nfmResponse: null,
      nfmTruncated: false,
      voiceCall: null,
      requestState: null,
    };
    const { rerender } = inRouter(
      <InteractiveContent
        interactive={{
          ...base,
          kind: 'call_permission_reply',
          callPermission: {
            response: 'accept',
            isPermanent: true,
            expiresAt: null,
            source: 'automatic',
          },
        }}
      />,
    );
    expect(screen.getByText('Allowed calls (always)')).toBeInTheDocument();
    expect(screen.getByText('after calling you')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <InteractiveContent
          interactive={{
            ...base,
            kind: 'call_permission_reply',
            callPermission: {
              response: 'reject',
              isPermanent: false,
              expiresAt: null,
              source: 'user_action',
            },
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Declined calls')).toBeInTheDocument();
  });

  it('call bubbles link to the call', () => {
    inRouter(
      <CallBubbleContent
        call={{ callId: 'c9', direction: 'in', outcome: 'missed', durationSec: 0, mode: 'human' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Missed call' })).toHaveAttribute('href', '/calls/c9');
  });

  it('labels', () => {
    expect(formatCallDuration(134)).toBe('2:14');
    expect(formatCallDuration(5)).toBe('0:05');
    expect(formatCallDuration(undefined)).toBe('0:00');
    expect(formatCallDuration(Number.NaN)).toBe('0:00');
    expect(
      callBubbleText({
        callId: 'c',
        direction: 'out',
        outcome: 'completed',
        durationSec: 45,
        mode: 'ai',
      }),
    ).toBe('AI call · 0:45');
    expect(
      callBubbleText({
        callId: 'c',
        direction: 'out',
        outcome: 'rejected',
        durationSec: 0,
        mode: 'human',
      }),
    ).toBe('Call declined');
    expect(permissionText({ status: 'permanent', expiresAt: null }, 'Asia/Kolkata')).toBe(
      'Can call (always)',
    );
    expect(cannotCallText('dnd')).toMatch(/Do-not-disturb/);
    expect(cannotCallText('weird')).toBe("You can't call this customer now.");
    expect(unavailableText('messaging_limit')).toMatch(/2,000/);
    expect(unavailableText(null)).toBe('Calling is not available on this number.');
  });
});
