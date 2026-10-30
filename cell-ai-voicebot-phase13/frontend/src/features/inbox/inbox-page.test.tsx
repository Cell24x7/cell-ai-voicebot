import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { ApiError } from '@/services/api/errors';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi, type ConversationPage, type MessagePage } from '@/services/api/inbox';
import type { InboxConversation, InboxMessage, WhatsAppChannelList } from '@/services/api/types';
import type * as WhatsAppModule from '@/services/api/whatsapp';
import { whatsappApi } from '@/services/api/whatsapp';
import { fakeSession, signInAs } from '@/test/auth';
import {
  fakeContactPanel,
  fakeConversation,
  fakeConversationDetail,
  fakeInboxConfig,
  fakeInboxSummary,
  fakeMessage,
  fakeOutgoing,
} from '@/test/inbox';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';
import { mockViewport } from '@/test/viewport';
import { fakeChannel } from '@/test/whatsapp';

import { buildTimeline, HIGHLIGHT_MS, NEVER_READ } from './chat/timeline';
import { useAccountTimezone, useNow } from './hooks';

vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: {
    config: vi.fn(),
    summary: vi.fn(),
    conversations: vi.fn(),
    conversation: vi.fn(),
    messages: vi.fn(),
    contact: vi.fn(),
    send: vi.fn(),
    read: vi.fn(),
    unread: vi.fn(),
    typing: vi.fn(),
    retry: vi.fn(),
    mediaLink: vi.fn(),
    retryMedia: vi.fn(),
  },
}));
vi.mock('@/services/api/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof WhatsAppModule>()),
  whatsappApi: { channels: vi.fn(), config: vi.fn() },
}));

const api = vi.mocked(inboxApi);
const wa = vi.mocked(whatsappApi);

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const page = (rows: InboxConversation[], nextCursor: string | null = null): ConversationPage => ({
  success: true,
  data: rows,
  meta: { nextCursor },
});
const msgs = (rows: InboxMessage[], meta: Partial<MessagePage['meta']> = {}): MessagePage => ({
  success: true,
  data: rows,
  meta: { olderCursor: null, hasNewer: false, ...meta },
});
const channels = (items = [fakeChannel()]): WhatsAppChannelList => ({
  items,
  counts: { connected: items.length },
  limit: 10,
});
const conv = (over: Partial<InboxConversation> = {}) =>
  fakeConversation({
    windowExpiresAt: iso(5 * HOUR),
    lastMessage: { ...fakeConversation().lastMessage!, at: iso(-60_000) },
    ...over,
  });
const http = (status: number, code: string, message = 'Server said no') =>
  new ApiError({ status, code, message, kind: 'http', details: [] });

let rt: ReturnType<typeof fakeRealtime>;
const open = (route = '/inbox/cv1') => renderWithProviders({ route, realtime: rt.client });
const scrollIntoView = vi.fn();

beforeEach(() => {
  rt = fakeRealtime();
  signInAs('owner');
  mockViewport(1400);
  Element.prototype.scrollIntoView = scrollIntoView;
  api.config.mockResolvedValue(fakeInboxConfig());
  api.summary.mockResolvedValue(fakeInboxSummary());
  api.conversations.mockResolvedValue(page([conv()]));
  api.conversation.mockResolvedValue(
    fakeConversationDetail({ windowExpiresAt: iso(5 * HOUR), unreadCount: 1 }),
  );
  api.messages.mockResolvedValue(msgs([fakeMessage('text', { id: 'm1', at: iso(-60_000) })]));
  api.contact.mockResolvedValue(fakeContactPanel());
  api.read.mockResolvedValue(undefined);
  api.typing.mockResolvedValue({ sent: false });
  api.mediaLink.mockResolvedValue({
    url: 'https://files.example/x',
    mimeType: null,
    fileName: null,
    expiresInSec: 300,
  });
  wa.channels.mockResolvedValue(channels());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('page states', () => {
  it('WhatsApp off on the server', async () => {
    api.config.mockRejectedValue(http(503, 'WHATSAPP_NOT_CONFIGURED'));
    open('/inbox');
    expect(await screen.findByText("WhatsApp isn't set up on this server")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
  });

  it('no number connected → link to Numbers', async () => {
    wa.channels.mockResolvedValue(channels([]));
    open('/inbox');
    expect(await screen.findByText('Connect a WhatsApp number first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect a number' })).toHaveAttribute(
      'href',
      '/whatsapp/numbers',
    );
  });

  it('the numbers list failing does not block the inbox', async () => {
    wa.channels.mockRejectedValue(http(500, 'INTERNAL'));
    open('/inbox');
    expect(
      await screen.findByRole('listitem', { name: 'Conversation with Asha Verma' }),
    ).toBeInTheDocument();
  });

  it('loading, and other config errors do not block the page', async () => {
    api.config.mockRejectedValue(http(500, 'INTERNAL'));
    let resolve!: (v: WhatsAppChannelList) => void;
    wa.channels.mockReturnValue(new Promise((r) => (resolve = r)));
    open('/inbox');
    expect(await screen.findByLabelText('Loading inbox')).toBeInTheDocument();
    await act(async () => {
      resolve(channels());
      await Promise.resolve();
    });
    expect(await screen.findByRole('region', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
  });
});

describe('layouts', () => {
  it('≥ 1200 px: list · chat · contact details; read marker on open', async () => {
    open();
    expect(await screen.findByRole('region', { name: 'Conversations' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Chat with Asha Verma' })).toBeInTheDocument();
    const details = await screen.findByRole('region', { name: 'Contact details' });
    expect(await within(details).findByText('Asha Verma')).toBeInTheDocument();
    expect(within(details).getByText('WhatsApp name: Asha')).toBeInTheDocument();
    await waitFor(() => expect(api.read).toHaveBeenCalledWith('cv1'));
    expect(screen.queryByRole('button', { name: 'Back to conversations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contact details' })).toBeNull();
    expect(
      screen.getByRole('listitem', { name: 'Conversation with Asha Verma' }).querySelector('a'),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('900–1199 px: list + chat; details in a drawer', async () => {
    mockViewport(1000);
    open();
    await screen.findByRole('region', { name: 'Chat with Asha Verma' });
    expect(screen.queryByRole('region', { name: 'Contact details' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Contact details' }));
    const details = await screen.findByRole('region', { name: 'Contact details' });
    await userEvent.click(within(details).getByRole('button', { name: 'Close contact details' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Contact details' })).toBeNull(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Contact details' }));
    await screen.findByRole('region', { name: 'Contact details' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Contact details' })).toBeNull(),
    );
  });

  it('< 900 px: list → chat → back', async () => {
    mockViewport(600);
    open('/inbox');
    const row = await screen.findByRole('listitem', { name: 'Conversation with Asha Verma' });
    expect(screen.queryByText('Select a conversation')).toBeNull();
    await userEvent.click(within(row).getByRole('link'));
    expect(await screen.findByRole('region', { name: 'Chat with Asha Verma' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Conversations' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(await screen.findByRole('region', { name: 'Conversations' })).toBeInTheDocument();
  });
});

describe('conversation list', () => {
  it('rows: name, preview prefixes, unread, window, assignee, time; match snippet while searching', async () => {
    api.conversations.mockResolvedValue(
      page([
        conv(),
        conv({
          id: 'cv2',
          label: '+91 ••••• 7002',
          unreadCount: 0,
          windowExpiresAt: null,
          assignedTo: { id: 'u2', name: 'Ravi Kumar' },
          lastMessage: {
            id: 'x',
            direction: 'out',
            type: 'image',
            preview: 'Chart',
            at: '2026-10-01T09:00:00.000Z',
            status: 'read',
          },
        }),
        conv({
          id: 'cv3',
          label: 'Note row',
          unreadCount: 0,
          assignedTo: { id: 'u3', name: '' },
          lastMessage: {
            ...conv().lastMessage!,
            type: 'note',
            direction: 'out',
            preview: 'Call back',
          },
        }),
        conv({ id: 'cv4', label: 'Fresh', unreadCount: 0, lastMessage: null, status: 'closed' }),
      ]),
    );
    open('/inbox');
    const first = await screen.findByRole('listitem', { name: 'Conversation with Asha Verma' });
    expect(within(first).getByText('Namaste')).toBeInTheDocument();
    expect(within(first).getByLabelText('1 unread')).toBeInTheDocument();
    expect(within(first).getByRole('img', { name: 'Window open' })).toBeInTheDocument();
    const second = screen.getByRole('listitem', { name: 'Conversation with +91 ••••• 7002' });
    expect(within(second).getByText('You: Chart')).toBeInTheDocument();
    expect(within(second).getByLabelText('Assigned to Ravi Kumar')).toHaveTextContent('RK');
    expect(within(second).getByText('01 Oct')).toBeInTheDocument();
    expect(within(second).queryByRole('img', { name: 'Window open' })).toBeNull();
    const third = screen.getByRole('listitem', { name: 'Conversation with Note row' });
    expect(within(third).getByText('Note: Call back')).toBeInTheDocument();
    expect(within(third).getByLabelText('Assigned to a teammate')).toBeInTheDocument();
    const fourth = screen.getByRole('listitem', { name: 'Conversation with Fresh' });
    expect(within(fourth).queryByRole('img', { name: 'Window open' })).toBeNull();

    api.conversations.mockResolvedValue(
      page([conv({ match: { messageId: 'm1', snippet: '…meri EMI…' } })]),
    );
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'e');
    expect(api.conversations).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'e' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'mi');
    await waitFor(() =>
      expect(api.conversations).toHaveBeenLastCalledWith({
        status: 'open',
        filter: 'all',
        q: 'emi',
      }),
    );
    expect(await screen.findByText('…meri EMI…')).toBeInTheDocument();
    api.conversations.mockResolvedValue(page([]));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'zz');
    expect(await screen.findByText('No conversations match your search')).toBeInTheDocument();
  });

  it('tabs, number select, Load more, empty states', async () => {
    let releaseNext = () => undefined as void;
    wa.channels.mockResolvedValue(
      channels([
        fakeChannel(),
        fakeChannel({ id: 'wa2', label: 'Sales', displayPhoneNumber: null }),
        fakeChannel({ id: 'wa3', label: 'Old', status: 'disconnected' }),
      ]),
    );
    api.conversations.mockResolvedValueOnce(page([conv()], 'next1')).mockReturnValueOnce(
      new Promise((r) => {
        releaseNext = () => r(page([conv({ id: 'cv9', label: 'Second page' })]));
      }),
    );
    open('/inbox');
    await screen.findByRole('listitem', { name: 'Conversation with Asha Verma' });
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('button', { name: 'Loading…' })).toBeDisabled();
    act(() => releaseNext());
    expect(
      await screen.findByRole('listitem', { name: 'Conversation with Second page' }),
    ).toBeInTheDocument();
    expect(api.conversations).toHaveBeenLastCalledWith({
      status: 'open',
      filter: 'all',
      cursor: 'next1',
    });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();

    api.conversations.mockResolvedValue(page([]));
    await userEvent.click(screen.getByRole('tab', { name: 'Unread' }));
    expect(await screen.findByText('Nothing here')).toBeInTheDocument();
    expect(api.conversations).toHaveBeenLastCalledWith({ status: 'open', filter: 'unread' });
    await userEvent.click(screen.getByRole('tab', { name: 'Closed' }));
    await waitFor(() =>
      expect(api.conversations).toHaveBeenLastCalledWith({ status: 'closed', filter: 'all' }),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Number' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All numbers', 'Support line · +91 90000 12345', 'Sales']);
    await userEvent.click(screen.getByRole('option', { name: 'Sales' }));
    await waitFor(() =>
      expect(api.conversations).toHaveBeenLastCalledWith({
        status: 'open',
        filter: 'all',
        channelId: 'wa2',
      }),
    );
  });

  it('one number: no select; list error → Retry; loading skeleton', async () => {
    api.conversations.mockRejectedValueOnce(http(500, 'INTERNAL', 'List failed'));
    open('/inbox');
    expect(screen.queryByRole('combobox', { name: 'Number' })).toBeNull();
    expect(await screen.findByText('List failed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('listitem', { name: 'Conversation with Asha Verma' }),
    ).toBeInTheDocument();
  });

  it('loading state', async () => {
    api.conversations.mockReturnValue(new Promise(() => undefined));
    open('/inbox');
    expect(await screen.findByLabelText('Loading conversations')).toBeInTheDocument();
  });

  it('live: an account event moves a row to the top', async () => {
    api.conversations.mockResolvedValue(
      page([
        conv({ id: 'a', label: 'First' }),
        conv({ id: 'b', label: 'Second', lastMessage: { ...conv().lastMessage!, at: iso(-HOUR) } }),
      ]),
    );
    open('/inbox');
    await screen.findByRole('listitem', { name: 'Conversation with Second' });
    api.conversations.mockReturnValue(new Promise(() => undefined));
    rt.emit('inbox.conversation.updated', {
      conversationId: 'b',
      status: 'open',
      unreadCount: 3,
      assignedTo: null,
      lastMessageAt: iso(0),
      lastMessageDirection: 'in',
    });
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Conversation list' }))
          .getAllByRole('listitem')
          .map((li) => li.getAttribute('aria-label')),
      ).toEqual(['Conversation with Second', 'Conversation with First']),
    );
    expect(screen.getByLabelText('3 unread')).toBeInTheDocument();
  });
});

describe('chat', () => {
  it('header: number, profile name, number label, window countdown, assignee, closed', async () => {
    api.conversation.mockResolvedValue(
      fakeConversationDetail({
        windowExpiresAt: iso(3 * HOUR + 12 * 60_000 + 30_000),
        status: 'closed',
        assignedTo: { id: 'u2', name: 'Ravi' },
        unreadCount: 0,
      }),
    );
    open();
    const chat = await screen.findByRole('region', { name: 'Chat with Asha Verma' });
    expect(within(chat).getByRole('heading', { level: 2, name: 'Asha Verma' })).toBeInTheDocument();
    expect(
      within(chat).getByText('+91 90000 77001 · ~Asha · via Support line'),
    ).toBeInTheDocument();
    expect(within(chat).getByLabelText('Window Open · 3 h 12 m left')).toBeInTheDocument();
    expect(within(chat).getByText('Closed')).toBeInTheDocument();
    expect(within(chat).getByRole('combobox', { name: 'Assigned to' })).toHaveTextContent('Ravi');
    expect(api.read).not.toHaveBeenCalled();
  });

  it('header without a name / profile / number; closed window', async () => {
    api.conversation.mockResolvedValue(
      fakeConversationDetail({
        label: '+91 90000 77001',
        profileName: null,
        channel: null,
        windowExpiresAt: null,
      }),
    );
    open();
    const chat = await screen.findByRole('region', { name: 'Chat with +91 90000 77001' });
    expect(within(chat).getByText('Number removed')).toBeInTheDocument();
    expect(within(chat).getByLabelText('Window Closed')).toBeInTheDocument();
    expect(within(chat).getByRole('combobox', { name: 'Assigned to' })).toHaveTextContent(
      'Unassigned',
    );
  });

  it('not found / other errors with Retry', async () => {
    api.conversation.mockRejectedValueOnce(http(404, 'RESOURCE_NOT_FOUND'));
    open();
    expect(await screen.findByText('This conversation was not found.')).toBeInTheDocument();
  });

  it('a load error offers Retry', async () => {
    api.conversation.mockRejectedValueOnce(http(500, 'INTERNAL', 'Boom'));
    open();
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Chat with Asha Verma' })).toBeInTheDocument();
  });

  it('messages: day separators, unread divider, every bubble, older page, typing', async () => {
    let releaseOlder = () => undefined as void;
    api.conversation.mockResolvedValue(
      fakeConversationDetail({ unreadCount: 2, lastReadAt: iso(-2 * HOUR) }),
    );
    api.messages
      .mockResolvedValueOnce(
        msgs(
          [
            fakeMessage('text', { id: 'y1', text: 'Yesterday msg', at: iso(-26 * HOUR) }),
            fakeOutgoing('read', { id: 'o1', at: iso(-3 * HOUR) }),
            fakeMessage('text', { id: 'n1', text: 'New one', at: iso(-HOUR) }),
            fakeMessage('image', { id: 'i1', at: iso(-30 * 60_000) }),
          ],
          { olderCursor: 'older1' },
        ),
      )
      .mockReturnValueOnce(
        new Promise((r) => {
          releaseOlder = () =>
            r(
              msgs([
                fakeMessage('text', {
                  id: 'old1',
                  text: 'Very old',
                  at: '2026-01-05T09:00:00.000Z',
                }),
              ]),
            );
        }),
      );
    open();
    const log = await screen.findByRole('log', { name: 'Messages' });
    expect(await within(log).findByText('Yesterday msg')).toBeInTheDocument();
    const text = log.textContent ?? '';
    expect(text.indexOf('Unread messages')).toBeGreaterThan(text.indexOf('Aapki EMI'));
    expect(text.indexOf('Unread messages')).toBeLessThan(text.indexOf('New one'));
    expect(within(log).getByRole('img', { name: 'Read' })).toBeInTheDocument();
    await userEvent.click(within(log).getByRole('button', { name: 'Load older messages' }));
    expect(within(log).getByRole('button', { name: 'Loading…' })).toBeDisabled();
    act(() => releaseOlder());
    expect(await within(log).findByText('Very old')).toBeInTheDocument();
    expect(api.messages).toHaveBeenLastCalledWith('cv1', { before: 'older1' });
    expect(within(log).getByText('05 Jan 2026')).toBeInTheDocument();
    expect(within(log).queryByRole('button', { name: 'Load older messages' })).toBeNull();

    rt.emit('inbox.typing', { conversationId: 'cv1', userId: 'u2', name: 'Ravi' });
    expect(await screen.findByText('Ravi is typing…')).toBeInTheDocument();
  });

  it('empty chat; message load error → Retry', async () => {
    api.messages.mockRejectedValueOnce(http(500, 'INTERNAL', 'Messages failed'));
    open();
    expect(await screen.findByText('Messages failed')).toBeInTheDocument();
    api.messages.mockResolvedValue(msgs([]));
    await userEvent.click(
      within(screen.getByRole('log', { name: 'Messages' })).getByRole('button', { name: 'Retry' }),
    );
    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
  });

  it('jump to a quoted message on the page, then to one on another page and back', async () => {
    const latest = msgs([
      fakeMessage('text', { id: 'q1', text: 'Question', at: iso(-2 * HOUR) }),
      fakeMessage('text', {
        id: 'r1',
        text: 'Answer',
        at: iso(-HOUR),
        replyTo: { id: 'q1', type: 'text', direction: 'in', preview: 'Question' },
      }),
      fakeMessage('text', {
        id: 'r2',
        text: 'About an old one',
        at: iso(-30 * 60_000),
        replyTo: { id: 'far1', type: 'text', direction: 'in', preview: 'Far away' },
      }),
    ]);
    api.messages.mockResolvedValue(latest);
    open();
    await screen.findByText('Answer');
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to the quoted message: Question' }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
    const quoted = document.querySelector('[data-message-id="q1"]');
    expect(quoted).toHaveAttribute('data-highlighted', 'true');
    await waitFor(() => expect(quoted).not.toHaveAttribute('data-highlighted'), {
      timeout: HIGHLIGHT_MS + 1500,
    });

    api.messages.mockResolvedValue(
      msgs(
        [
          fakeMessage('text', {
            id: 'far1',
            text: 'Far away text',
            at: '2026-09-01T09:00:00.000Z',
          }),
        ],
        {
          hasNewer: true,
        },
      ),
    );
    scrollIntoView.mockClear();
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to the quoted message: Far away' }),
    );
    expect(await screen.findByText('Far away text')).toBeInTheDocument();
    expect(api.messages).toHaveBeenLastCalledWith('cv1', { around: 'far1' });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    api.messages.mockResolvedValue(latest);
    await userEvent.click(screen.getByRole('button', { name: 'Load newer messages' }));
    expect(await screen.findByText('Answer')).toBeInTheDocument();
  });

  it('a quote whose target is gone does nothing visible', async () => {
    api.messages
      .mockResolvedValueOnce(
        msgs([
          fakeMessage('text', {
            id: 'r1',
            text: 'Answer',
            at: iso(-HOUR),
            replyTo: { id: 'gone', type: 'text', direction: 'in', preview: 'Gone' },
          }),
        ]),
      )
      .mockResolvedValueOnce(msgs([]));
    open();
    await screen.findByText('Answer');
    scrollIntoView.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Go to the quoted message: Gone' }));
    await waitFor(() => expect(api.messages).toHaveBeenLastCalledWith('cv1', { around: 'gone' }));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('"New messages" when scrolled up; scrolling near the top loads older', async () => {
    api.messages
      .mockResolvedValueOnce(
        msgs([fakeMessage('text', { id: 'm1', at: iso(-HOUR) })], { olderCursor: 'c1' }),
      )
      .mockResolvedValueOnce(
        msgs([fakeMessage('text', { id: 'm0', text: 'Older one', at: iso(-2 * HOUR) })]),
      );
    open();
    const log = await screen.findByRole('log', { name: 'Messages' });
    await within(log).findByText(/EMI ki date/);
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 400 });
    log.scrollTop = 600;
    fireEvent.scroll(log);
    rt.emit('inbox.message.created', {
      message: fakeMessage('text', { id: 'live1', text: 'Live hello', at: iso(0) }),
    });
    expect(await screen.findByText('Live hello')).toBeInTheDocument();
    const pill = await screen.findByRole('button', { name: 'New messages' });
    await userEvent.click(pill);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'New messages' })).toBeNull());
    expect(log.scrollTop).toBe(2000);

    // our own message always scrolls down
    log.scrollTop = 600;
    fireEvent.scroll(log);
    rt.emit('inbox.message.created', {
      message: fakeOutgoing('sent', { id: 'own1', at: iso(1000) }),
    });
    await screen.findAllByText('Aapki EMI 5 tareekh ko due hai.');
    expect(screen.queryByRole('button', { name: 'New messages' })).toBeNull();

    // back at the bottom clears the pill; near the top loads older
    log.scrollTop = 1600;
    fireEvent.scroll(log);
    log.scrollTop = 10;
    fireEvent.scroll(log);
    expect(await screen.findByText('Older one')).toBeInTheDocument();
    expect(api.messages).toHaveBeenLastCalledWith('cv1', { before: 'c1' });
  });

  it('Retry a failed send; a failing retry shows why', async () => {
    api.messages.mockResolvedValue(msgs([fakeOutgoing('failed', { id: 'f1', at: iso(-60_000) })]));
    api.retry.mockRejectedValueOnce(http(409, 'WHATSAPP_WINDOW_CLOSED'));
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText(/You can reply when the customer writes again/),
    ).toBeInTheDocument();
    expect(api.retry).toHaveBeenCalledWith('f1');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText(/You can reply when the customer writes again/)).toBeNull(),
    );
  });

  it('Add contact from a shared card opens the contact form prefilled', async () => {
    api.messages.mockResolvedValue(msgs([fakeMessage('contacts', { at: iso(-60_000) })]));
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a contact' });
    expect(within(dialog).getByRole('textbox', { name: /Phone/ })).toHaveValue('+91 90000 66001');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Ravi Kumar');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a card without email still prefills', async () => {
    api.messages.mockResolvedValue(
      msgs([
        fakeMessage('contacts', {
          at: iso(-60_000),
          contacts: [
            {
              name: 'No mail',
              phones: [{ phone: '+919000066002', type: null, waId: null }],
              emails: [],
              org: null,
            },
          ],
        }),
      ]),
    );
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a contact' });
    expect(within(dialog).getByRole('textbox', { name: 'E-mail' })).toHaveValue('');
  });

  it('viewers read only: no Add contact, no Retry; impersonators send no read marker', async () => {
    signInAs('viewer');
    api.messages.mockResolvedValue(
      msgs([
        fakeMessage('contacts', { at: iso(-60_000) }),
        fakeOutgoing('failed', { id: 'f1', at: iso(-30_000) }),
      ]),
    );
    open();
    await screen.findByText('Ravi Kumar');
    expect(screen.queryByRole('button', { name: 'Add contact' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await waitFor(() => expect(api.read).toHaveBeenCalled());
  });

  it('impersonation: no read marker', async () => {
    signInAs('superadmin');
    useAuthStore
      .getState()
      .startImpersonation(
        fakeSession('owner', { impersonation: { impersonatorId: 'sa', expiresAt: iso(HOUR) } }),
      );
    open();
    await screen.findByRole('region', { name: 'Chat with Asha Verma' });
    await screen.findByText(/EMI ki date/);
    expect(api.read).not.toHaveBeenCalled();
  });

  it('Reply and React (toggle) on messages; none on notes / system lines', async () => {
    api.messages.mockResolvedValue(
      msgs([
        fakeMessage('text', { id: 'm1', at: iso(-60_000) }),
        fakeMessage('note', { id: 'n1', at: iso(-50_000) }),
        fakeMessage('system', { id: 's1', at: iso(-40_000) }),
      ]),
    );
    api.send.mockImplementation((_id, body) =>
      Promise.resolve(
        body.type === 'reaction'
          ? fakeMessage('reaction', {
              id: `rx-${body.clientId}`,
              direction: 'out',
              origin: 'agent',
            })
          : fakeOutgoing('accepted', { id: `srv-${body.clientId}`, clientId: body.clientId }),
      ),
    );
    open();
    await screen.findByText(/EMI ki date/);
    expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByLabelText('Replying to')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'On it{Enter}');
    await waitFor(() =>
      expect(api.send).toHaveBeenCalledWith(
        'cv1',
        expect.objectContaining({ type: 'text', text: 'On it', replyToMessageId: 'm1' }),
      ),
    );
    expect(screen.queryByLabelText('Replying to')).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'React' })[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: 'React 👍' }));
    await waitFor(() =>
      expect(api.send).toHaveBeenCalledWith(
        'cv1',
        expect.objectContaining({ type: 'reaction', messageId: 'm1', emoji: '👍' }),
      ),
    );
    expect(within(screen.getByLabelText('Reactions')).getByTitle('You reacted')).toHaveTextContent(
      '👍',
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'React' })[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove 👍' }));
    await waitFor(() =>
      expect(api.send).toHaveBeenLastCalledWith(
        'cv1',
        expect.objectContaining({ type: 'reaction', messageId: 'm1', emoji: '' }),
      ),
    );
    await waitFor(() => expect(screen.queryByLabelText('Reactions')).toBeNull());
    // the reaction popover closes on Escape too
    await userEvent.click(screen.getAllByRole('button', { name: 'React' })[0] as HTMLElement);
    await screen.findByRole('group', { name: 'Reactions to send' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Reactions to send' })).toBeNull(),
    );
  });

  it('no Reply / React when the window is closed', async () => {
    api.conversation.mockResolvedValue(
      fakeConversationDetail({ windowExpiresAt: iso(-HOUR), unreadCount: 0 }),
    );
    open();
    await screen.findByText(/EMI ki date/);
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.getByText(/The 24-hour window is closed\./)).toBeInTheDocument();
  });

  it('contact panel: loading, deleted contact', async () => {
    api.contact.mockResolvedValue(fakeContactPanel({ contact: null }));
    open();
    expect(await screen.findByText(/This contact was deleted/)).toBeInTheDocument();
  });

  it('contact panel without a WhatsApp name / contact name', async () => {
    const base = fakeContactPanel();
    api.contact.mockResolvedValue({
      ...base,
      contact: { ...base.contact!, name: null, whatsapp: null },
    });
    open();
    expect(await screen.findByText('No name')).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp name/)).toBeNull();
  });
});

describe('inbox hooks', () => {
  it('timezone falls back to India; now ticks every minute', async () => {
    useAuthStore.setState({ session: null });
    expect(renderHook(() => useAccountTimezone()).result.current).toBe('Asia/Kolkata');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useNow(1000));
    const first = result.current;
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current).toBeGreaterThan(first);
    vi.useRealTimers();
  });
});

describe('timeline', () => {
  const tz = 'Asia/Kolkata';
  const now = Date.parse('2026-10-22T12:00:00+05:30');
  it('days, one unread divider before the first unread inbound, clientId keys', () => {
    const items = buildTimeline(
      [
        fakeMessage('text', { id: 'a', at: '2026-10-21T05:00:00.000Z' }),
        fakeOutgoing('sent', { id: 'b', clientId: 'k-b', at: '2026-10-22T05:00:00.000Z' }),
        fakeMessage('text', { id: 'c', at: '2026-10-22T06:00:00.000Z' }),
        fakeMessage('text', { id: 'd', at: '2026-10-22T06:30:00.000Z' }),
      ],
      tz,
      now,
      '2026-10-22T04:00:00.000Z',
    );
    expect(
      items.map((i) => (i.kind === 'message' ? i.key : i.kind === 'day' ? i.label : 'UNREAD')),
    ).toEqual(['Yesterday', 'a', 'Today', 'k-b', 'UNREAD', 'c', 'd']);
    expect(
      buildTimeline([fakeMessage('text', { at: '2026-10-22T05:00:00.000Z' })], tz, now, null),
    ).toHaveLength(2);
    expect(
      buildTimeline(
        [fakeMessage('text', { at: '2026-10-22T05:00:00.000Z' })],
        tz,
        now,
        NEVER_READ,
      ).map((i) => i.kind),
    ).toEqual(['day', 'unread', 'message']);
  });
});
