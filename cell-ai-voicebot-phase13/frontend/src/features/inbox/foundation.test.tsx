import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import {
  useBusinessProfile,
  useUpdateBusinessProfile,
  useUploadProfilePhoto,
} from '@/features/whatsapp/profile';
import { ApiError } from '@/services/api/errors';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi, type ConversationPage, type MessagePage } from '@/services/api/inbox';
import type { InboxConversationDetail, InboxMessage, InboxSummary } from '@/services/api/types';
import type * as WhatsAppModule from '@/services/api/whatsapp';
import { whatsappApi } from '@/services/api/whatsapp';
import { RealtimeContext } from '@/services/realtime/context';
import { fakeSession, signInAs } from '@/test/auth';
import {
  fakeBusinessProfile,
  fakeContactPanel,
  fakeConversation,
  fakeConversationDetail,
  fakeInboxConfig,
  fakeInboxSettings,
  fakeInboxSummary,
  fakeMessage,
  fakeOutgoing,
  fakeUpload,
} from '@/test/inbox';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { inboxKeys } from './keys';
import { flattenMessages, type ConversationsData, type MessagesData } from './optimistic';
import { channelCanReply } from './permissions';
import {
  conversationRows,
  conversationTopic,
  INBOX_CHAT_POLL_MS,
  INBOX_LIST_POLL_MS,
  storeConversation,
  storeMessage,
  TYPING_VISIBLE_MS,
  useAssignConversation,
  useBlockConversation,
  useCanAssign,
  useCanReply,
  useCloseConversation,
  useContactPanel,
  useConversation,
  useConversations,
  useConversationTopic,
  useInboxConfig,
  useInboxLimits,
  useInboxLiveUpdates,
  useInboxSettings,
  useInboxSummary,
  useMarkRead,
  useMarkUnread,
  useMediaLink,
  useMessages,
  useReopenConversation,
  useRetryMedia,
  useRetryMessage,
  useSendMessage,
  useSimulateCustomer,
  useStartConversation,
  useTypingPing,
  useUnblockConversation,
  useUpdateInboxSettings,
  useUploadMedia,
} from './queries';

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
    assign: vi.fn(),
    close: vi.fn(),
    reopen: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
    start: vi.fn(),
    upload: vi.fn(),
    mediaLink: vi.fn(),
    retry: vi.fn(),
    retryMedia: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    simulate: vi.fn(),
    fakeSent: vi.fn(),
  },
}));
vi.mock('@/services/api/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof WhatsAppModule>()),
  whatsappApi: { profile: vi.fn(), updateProfile: vi.fn(), uploadProfilePhoto: vi.fn() },
}));

const api = vi.mocked(inboxApi);
const wa = vi.mocked(whatsappApi);

const convPage = (
  rows = [fakeConversation()],
  nextCursor: string | null = null,
): ConversationPage => ({
  success: true,
  data: rows,
  meta: { nextCursor },
});
const msgPage = (rows: InboxMessage[], olderCursor: string | null = null): MessagePage => ({
  success: true,
  data: rows,
  meta: { olderCursor, hasNewer: false },
});

/** Hooks rerendered with `null` later (typed as nullable). */
const openId = (): string | null => 'cv1';

let client: QueryClient;
let rt: ReturnType<typeof fakeRealtime>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <RealtimeContext value={rt.client}>{children}</RealtimeContext>
  </QueryClientProvider>
);
const messagesOf = (id = 'cv1', around: string | null = null) =>
  flattenMessages(client.getQueryData<MessagesData>(inboxKeys.messages(id, around)));
const listOf = () =>
  client.getQueryData<ConversationsData>(inboxKeys.list({ status: 'open', filter: 'all' }));

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  rt = fakeRealtime();
  api.config.mockResolvedValue(fakeInboxConfig());
  api.summary.mockResolvedValue(fakeInboxSummary());
  api.conversations.mockResolvedValue(convPage());
  api.conversation.mockResolvedValue(fakeConversationDetail());
  api.messages.mockResolvedValue(msgPage([fakeMessage('text', { id: 'm1' })]));
  api.contact.mockResolvedValue(fakeContactPanel());
  api.read.mockResolvedValue(undefined);
  api.unread.mockResolvedValue(undefined);
  api.typing.mockResolvedValue({ sent: true });
  api.retryMedia.mockResolvedValue(undefined);
  api.settings.mockResolvedValue(fakeInboxSettings());
  wa.profile.mockResolvedValue(fakeBusinessProfile());
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('config, summary, lists', () => {
  it('config + limits (defaults until loaded)', async () => {
    signInAs('owner');
    api.config.mockResolvedValue(fakeInboxConfig({ limits: { textMax: 99 } }));
    const limits = renderHook(() => useInboxLimits(), { wrapper });
    expect(limits.result.current.textMax).toBe(4096);
    await waitFor(() => expect(limits.result.current.textMax).toBe(99));
    const disabled = renderHook(() => useInboxConfig(false), { wrapper });
    expect(disabled.result.current.fetchStatus).toBe('idle');
  });

  it('summary is patched by inbox.summary.updated, then refetched', async () => {
    signInAs('owner');
    const { result } = renderHook(() => useInboxSummary(), { wrapper });
    await waitFor(() => expect(result.current.data?.unreadConversations).toBe(3));
    api.summary.mockResolvedValue(
      fakeInboxSummary({ unreadConversations: 7, assignedToMeUnread: 2 }),
    );
    rt.emit('inbox.summary.updated', { unreadConversations: 7 });
    expect(client.getQueryData<InboxSummary>(inboxKeys.summary)?.unreadConversations).toBe(7);
    await waitFor(() => expect(result.current.data?.assignedToMeUnread).toBe(2));
    // before the first fetch the event has nothing to patch
    client.clear();
    const off = renderHook(() => useInboxSummary(false), { wrapper });
    rt.emit('inbox.summary.updated', { unreadConversations: 1 });
    expect(off.result.current.data).toBeUndefined();
  });

  it('conversation pages: filters in the request, Load more, polling every 15 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInAs('owner');
    api.conversations
      .mockResolvedValueOnce(convPage([fakeConversation({ id: 'a' })], 'next1'))
      .mockResolvedValueOnce(convPage([fakeConversation({ id: 'b' })]));
    const { result } = renderHook(
      () => useConversations({ status: 'open', filter: 'unread', q: 'as' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.conversations).toHaveBeenLastCalledWith({
      status: 'open',
      filter: 'unread',
      q: 'as',
    });
    expect(result.current.hasNextPage).toBe(true);
    await act(() => result.current.fetchNextPage());
    expect(api.conversations).toHaveBeenLastCalledWith({
      status: 'open',
      filter: 'unread',
      q: 'as',
      cursor: 'next1',
    });
    await waitFor(() =>
      expect(conversationRows(result.current.data).map((c) => c.id)).toEqual(['a', 'b']),
    );
    expect(result.current.hasNextPage).toBe(false);
    const calls = api.conversations.mock.calls.length;
    api.conversations.mockResolvedValue(convPage([fakeConversation({ id: 'a' })]));
    await act(() => vi.advanceTimersByTimeAsync(INBOX_LIST_POLL_MS + 50));
    expect(api.conversations.mock.calls.length).toBeGreaterThan(calls);
    expect(conversationRows(undefined)).toEqual([]);
    const disabled = renderHook(() => useConversations({ status: 'closed' }, false), { wrapper });
    expect(disabled.result.current.fetchStatus).toBe('idle');
  });

  it('account events patch + re-sort rows and the open conversation', async () => {
    signInAs('owner');
    api.conversations.mockResolvedValue(
      convPage([
        fakeConversation({
          id: 'a',
          lastMessage: { ...fakeConversation().lastMessage!, at: '2026-10-22T10:00:00.000Z' },
        }),
        fakeConversation({
          id: 'b',
          lastMessage: { ...fakeConversation().lastMessage!, at: '2026-10-22T09:00:00.000Z' },
        }),
      ]),
    );
    api.conversation.mockResolvedValue(fakeConversationDetail({ id: 'b' }));
    const list = renderHook(() => useConversations({ status: 'open', filter: 'all' }), { wrapper });
    const detail = renderHook(() => useConversation('b'), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    renderHook(() => useInboxLiveUpdates(), { wrapper });
    api.conversations.mockReturnValue(new Promise(() => undefined));
    api.conversation.mockReturnValue(new Promise(() => undefined));
    const spy = vi.spyOn(client, 'invalidateQueries');
    rt.emit('inbox.conversation.updated', {
      conversationId: 'b',
      status: 'open',
      unreadCount: 5,
      assignedTo: null,
      lastMessageAt: '2026-10-22T11:00:00.000Z',
      lastMessageDirection: 'in',
    });
    expect(conversationRows(listOf()).map((c) => [c.id, c.unreadCount])).toEqual([
      ['b', 5],
      ['a', 1],
    ]);
    expect(
      client.getQueryData<InboxConversationDetail>(inboxKeys.conversation('b'))?.unreadCount,
    ).toBe(5);
    expect(spy).toHaveBeenCalledWith({ queryKey: inboxKeys.lists });
    expect(spy).toHaveBeenCalledWith({ queryKey: inboxKeys.conversation('b') });
    // opt-out / block / name changes show in the open contact panel
    expect(spy).toHaveBeenCalledWith({ queryKey: inboxKeys.contact('b') });
    // messages that arrive without their own event (imported history) show in the open chat
    expect(spy).toHaveBeenCalledWith({ queryKey: inboxKeys.messagesOf('b') });
    // a conversation not on screen: only refetches
    spy.mockClear();
    rt.emit('inbox.conversation.updated', {
      conversationId: 'zz',
      status: 'open',
      unreadCount: 1,
      assignedTo: null,
      lastMessageAt: null,
      lastMessageDirection: null,
    });
    expect(conversationRows(listOf())).toHaveLength(2);
    expect(spy).toHaveBeenCalledWith({ queryKey: inboxKeys.lists });
    expect(client.getQueryData(inboxKeys.conversation('zz'))).toBeUndefined();
  });

  it('detail, contact panel and media link queries wait for an id', async () => {
    signInAs('owner');
    api.mediaLink.mockResolvedValue({
      url: 'https://x',
      mimeType: 'image/jpeg',
      fileName: null,
      expiresInSec: 300,
    });
    expect(renderHook(() => useConversation(null), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
    expect(renderHook(() => useContactPanel(null), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
    expect(renderHook(() => useMediaLink(null), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
    expect(
      renderHook(() => useMediaLink('m1', false), { wrapper }).result.current.fetchStatus,
    ).toBe('idle');
    expect(renderHook(() => useMessages(null), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
    const panel = renderHook(() => useContactPanel('cv1'), { wrapper });
    const link = renderHook(() => useMediaLink('m1'), { wrapper });
    await waitFor(() => expect(panel.result.current.data?.contact?.name).toBe('Asha Verma'));
    await waitFor(() => expect(link.result.current.data?.url).toBe('https://x'));
    expect(api.contact).toHaveBeenCalledWith('cv1');
    expect(api.mediaLink).toHaveBeenCalledWith('m1');
  });
});

describe('messages + topic merges', () => {
  it('pages older messages up; jumps with around; polls only while a send is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInAs('owner');
    api.messages
      .mockResolvedValueOnce(msgPage([fakeOutgoing('queued', { id: 'q1' })], 'older1'))
      .mockResolvedValueOnce(msgPage([fakeMessage('text', { id: 'm0' })]));
    const { result } = renderHook(() => useMessages('cv1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.messages).toHaveBeenLastCalledWith('cv1', {});
    await act(() => result.current.fetchNextPage());
    expect(api.messages).toHaveBeenLastCalledWith('cv1', { before: 'older1' });
    expect(messagesOf().map((m) => m.id)).toEqual(['m0', 'q1']);
    // pending → polls
    api.messages.mockResolvedValue(msgPage([fakeOutgoing('queued', { id: 'q1' })], 'older1'));
    const before = api.messages.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(INBOX_CHAT_POLL_MS + 50));
    expect(api.messages.mock.calls.length).toBeGreaterThan(before);
    // final → stops
    api.messages.mockResolvedValue(msgPage([fakeOutgoing('read', { id: 'q1' })]));
    await act(() => result.current.refetch());
    const settled = api.messages.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(INBOX_CHAT_POLL_MS * 3));
    expect(api.messages).toHaveBeenCalledTimes(settled);

    api.messages.mockResolvedValue(msgPage([fakeMessage('text', { id: 'quoted' })]));
    const jump = renderHook(() => useMessages('cv1', 'quoted'), { wrapper });
    await waitFor(() => expect(jump.result.current.isSuccess).toBe(true));
    expect(api.messages).toHaveBeenLastCalledWith('cv1', { around: 'quoted' });
    // a live message goes to the latest page set only (the jump set lacks it)
    storeMessage(client, fakeMessage('text', { id: 'live1', at: '2026-10-22T10:00:00.000Z' }));
    expect(messagesOf('cv1', 'quoted').map((m) => m.id)).toEqual(['quoted']);
    expect(messagesOf().map((m) => m.id)).toContain('live1');
  });

  it('topic: subscribe, created (dedupe + optimistic replace), updated (also before created), other chats ignored', async () => {
    signInAs('owner');
    api.messages.mockResolvedValue(msgPage([fakeMessage('text', { id: 'm1' })]));
    const msgs = renderHook(() => useMessages('cv1'), { wrapper });
    await waitFor(() => expect(msgs.result.current.isSuccess).toBe(true));
    const topic = renderHook(({ id }: { id: string | null }) => useConversationTopic(id), {
      wrapper,
      initialProps: { id: openId() },
    });
    expect(rt.topics).toEqual([conversationTopic('cv1')]);

    const inbound = fakeMessage('text', { id: 'm2', at: '2026-10-22T09:01:00.000Z' });
    rt.emit('inbox.message.created', { message: inbound });
    rt.emit('inbox.message.created', { message: inbound });
    expect(messagesOf().map((m) => m.id)).toEqual(['m1', 'm2']);
    // another conversation's event
    rt.emit('inbox.message.created', { message: { ...inbound, id: 'x', conversationId: 'cv2' } });
    expect(messagesOf()).toHaveLength(2);

    // update for a known message
    const out = fakeOutgoing('sent', { id: 'o1', at: '2026-10-22T09:02:00.000Z' });
    rt.emit('inbox.message.created', { message: out });
    rt.emit('inbox.message.updated', {
      messageId: 'o1',
      status: 'delivered',
      error: null,
      media: null,
      reactions: [],
    });
    expect(messagesOf().find((m) => m.id === 'o1')?.status).toBe('delivered');
    // update before its message → applied when the message arrives
    rt.emit('inbox.message.updated', {
      messageId: 'o2',
      status: 'read',
      error: null,
      media: null,
      reactions: [{ emoji: '🙏', by: 'customer' }],
    });
    rt.emit('inbox.message.created', {
      message: fakeOutgoing('sent', { id: 'o2', clientId: 'c-o2', at: '2026-10-22T09:03:00.000Z' }),
    });
    const o2 = messagesOf().find((m) => m.id === 'o2');
    expect(o2?.status).toBe('read');
    expect(o2?.reactions.map((r) => r.emoji)).toEqual(['🙏']);

    // closing the chat unsubscribes; null id = no topic, events ignored
    topic.rerender({ id: null });
    expect(rt.topics).toEqual([]);
    rt.emit('inbox.message.created', { message: { ...inbound, id: 'm9' } });
    rt.emit('inbox.message.updated', {
      messageId: 'm1',
      status: 'deleted',
      error: null,
      media: null,
      reactions: [],
    });
    rt.emit('inbox.typing', { conversationId: 'cv1', userId: 'u2', name: 'Ravi' });
    expect(messagesOf().map((m) => m.id)).not.toContain('m9');
    expect(topic.result.current.typingName).toBeNull();
  });

  it('typing indicator: other agents only, expires, cleared by an inbound message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInAs('owner');
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useConversationTopic(id),
      {
        wrapper,
        initialProps: { id: openId() },
      },
    );
    rt.emit('inbox.typing', { conversationId: 'cv1', userId: 'u1', name: 'Me' });
    expect(result.current.typingName).toBeNull();
    rt.emit('inbox.typing', { conversationId: 'cv2', userId: 'u2', name: 'Ravi' });
    expect(result.current.typingName).toBeNull();
    rt.emit('inbox.typing', { conversationId: 'cv1', userId: 'u2', name: 'Ravi' });
    expect(result.current.typingName).toBe('Ravi');
    await act(() => vi.advanceTimersByTimeAsync(TYPING_VISIBLE_MS + 10));
    expect(result.current.typingName).toBeNull();
    rt.emit('inbox.typing', { conversationId: 'cv1', userId: 'u2', name: 'Ravi' });
    // an outgoing message keeps it, an inbound one clears it
    rt.emit('inbox.message.created', { message: fakeOutgoing('sent', { id: 'z1' }) });
    expect(result.current.typingName).toBe('Ravi');
    rt.emit('inbox.message.created', { message: fakeMessage('text', { id: 'z2' }) });
    expect(result.current.typingName).toBeNull();
    // switching chats hides the other chat's indicator
    rt.emit('inbox.typing', { conversationId: 'cv1', userId: 'u2', name: 'Ravi' });
    rerender({ id: 'cv2' });
    expect(result.current.typingName).toBeNull();
  });
});

describe('sending', () => {
  const seed = async () => {
    api.messages.mockResolvedValue(msgPage([fakeMessage('text', { id: 'm1' })]));
    const msgs = renderHook(() => useMessages('cv1'), { wrapper });
    await waitFor(() => expect(msgs.result.current.isSuccess).toBe(true));
    api.messages.mockReturnValue(new Promise(() => undefined));
  };

  it('optimistic queued bubble → replaced by the server message', async () => {
    signInAs('owner');
    await seed();
    let resolve!: (m: InboxMessage) => void;
    api.send.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useSendMessage('cv1'), { wrapper });
    act(() => result.current.mutate({ clientId: 'k1', type: 'text', text: 'Hello' }));
    await waitFor(() => expect(messagesOf().map((m) => m.id)).toEqual(['m1', 'tmp_k1']));
    expect(messagesOf()[1]).toMatchObject({
      status: 'queued',
      sentBy: { id: 'u1', name: 'Asha Verma' },
    });
    await act(async () => {
      resolve(fakeOutgoing('accepted', { id: 'srv1', clientId: 'k1' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(messagesOf().map((m) => m.id)).toEqual(['m1', 'srv1']));
    expect(api.send).toHaveBeenCalledWith('cv1', { clientId: 'k1', type: 'text', text: 'Hello' });
  });

  it('a send that never reached the server → failed bubble → Retry resends the same body', async () => {
    signInAs('owner');
    await seed();
    api.send.mockRejectedValueOnce(
      new ApiError({
        status: 0,
        code: 'NETWORK',
        message: 'Offline',
        kind: 'network',
        details: [],
      }),
    );
    const send = renderHook(() => useSendMessage('cv1'), { wrapper });
    await act(async () => {
      await send.result.current
        .mutateAsync({ clientId: 'k2', type: 'text', text: 'Hi' })
        .catch(() => undefined);
    });
    const failed = messagesOf().find((m) => m.id === 'tmp_k2');
    expect(failed).toMatchObject({ status: 'failed', error: { reason: 'Offline' } });
    api.send.mockResolvedValueOnce(fakeOutgoing('accepted', { id: 'srv2', clientId: 'k2' }));
    const retry = renderHook(() => useRetryMessage('cv1'), { wrapper });
    await act(() => retry.result.current.mutateAsync(failed!));
    expect(api.send).toHaveBeenLastCalledWith('cv1', { clientId: 'k2', type: 'text', text: 'Hi' });
    expect(api.retry).not.toHaveBeenCalled();
    expect(messagesOf().map((m) => m.id)).toEqual(['m1', 'srv2']);
  });

  it('a non-Error failure still marks the bubble; reactions get no bubble', async () => {
    signInAs('owner');
    await seed();
    api.send.mockRejectedValueOnce('boom');
    const send = renderHook(() => useSendMessage('cv1'), { wrapper });
    await act(async () => {
      await send.result.current
        .mutateAsync({ clientId: 'k3', type: 'note', text: 'n' })
        .catch(() => undefined);
    });
    expect(messagesOf().find((m) => m.id === 'tmp_k3')?.error?.reason).toBe('Not sent');
    api.send.mockResolvedValueOnce(
      fakeMessage('reaction', { id: 'r1', direction: 'out', origin: 'agent' }),
    );
    await act(() =>
      send.result.current.mutateAsync({
        clientId: 'k4',
        type: 'reaction',
        messageId: 'm1',
        emoji: '👍',
      }),
    );
    expect(messagesOf().map((m) => m.id)).not.toContain('tmp_k4');
    // the reaction itself is not a row
    expect(messagesOf().map((m) => m.id)).not.toContain('r1');
  });

  it('server-side failure → POST /messages/:id/retry; no session → no sender', async () => {
    signInAs('owner');
    await seed();
    api.retry.mockResolvedValue(fakeOutgoing('accepted', { id: 'srv3', clientId: 'k5' }));
    const retry = renderHook(() => useRetryMessage('cv1'), { wrapper });
    await act(() =>
      retry.result.current.mutateAsync(fakeOutgoing('failed', { id: 'f1', clientId: 'old' })),
    );
    expect(api.retry).toHaveBeenCalledWith('f1');
    expect(messagesOf().map((m) => m.id)).toContain('srv3');
    // a local failure whose body is gone (page reloaded) goes to the server too
    await act(() =>
      retry.result.current.mutateAsync(
        fakeOutgoing('failed', { id: 'tmp_gone', clientId: 'gone' }),
      ),
    );
    expect(api.retry).toHaveBeenLastCalledWith('tmp_gone');

    useAuthStore.setState({ session: null });
    api.send.mockReturnValue(new Promise(() => undefined));
    const send = renderHook(() => useSendMessage('cv1'), { wrapper });
    act(() => send.result.current.mutate({ clientId: 'k6', type: 'text', text: 'x' }));
    await waitFor(() => expect(messagesOf().find((m) => m.id === 'tmp_k6')?.sentBy).toBeNull());
  });

  it('read marker on open (not for impersonators, not when nothing is unread)', async () => {
    signInAs('owner');
    const list = renderHook(() => useConversations({ status: 'open', filter: 'all' }), { wrapper });
    const detail = renderHook(() => useConversation('cv1'), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    api.conversations.mockReturnValue(new Promise(() => undefined));
    const read = renderHook(
      ({ id, unread }: { id: string | null; unread: number }) => useMarkRead(id, unread),
      {
        wrapper,
        initialProps: { id: openId(), unread: 1 },
      },
    );
    await waitFor(() => expect(api.read).toHaveBeenCalledWith('cv1'));
    await waitFor(() => expect(conversationRows(listOf())[0]?.unreadCount).toBe(0));
    expect(
      client.getQueryData<InboxConversationDetail>(inboxKeys.conversation('cv1'))?.unreadCount,
    ).toBe(0);
    api.read.mockClear();
    read.rerender({ id: 'cv1', unread: 0 });
    read.rerender({ id: null, unread: 3 });
    expect(api.read).not.toHaveBeenCalled();
    // a conversation that is not cached
    read.rerender({ id: 'other', unread: 2 });
    await waitFor(() => expect(api.read).toHaveBeenCalledWith('other'));

    api.read.mockClear();
    useAuthStore.getState().startImpersonation(
      fakeSession('owner', {
        impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-22T10:00:00Z' },
      }),
    );
    renderHook(() => useMarkRead('cv9', 4), { wrapper });
    await act(() => Promise.resolve());
    expect(api.read).not.toHaveBeenCalled();
  });

  it('typing ping is throttled; nothing without a conversation; errors ignored', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInAs('owner');
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useTypingPing(id), {
      wrapper,
      initialProps: { id: openId() },
    });
    act(() => result.current());
    act(() => result.current());
    expect(api.typing).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(10_001));
    api.typing.mockRejectedValueOnce(new Error('x'));
    act(() => result.current());
    expect(api.typing).toHaveBeenCalledTimes(2);
    // another chat pings at once
    rerender({ id: 'cv2' });
    act(() => result.current());
    expect(api.typing).toHaveBeenLastCalledWith('cv2');
    rerender({ id: null });
    act(() => result.current());
    expect(api.typing).toHaveBeenCalledTimes(3);
  });
});

describe('conversation actions', () => {
  it('assign / close / reopen / block / unblock / start store the result everywhere', async () => {
    signInAs('owner');
    const list = renderHook(() => useConversations({ status: 'open', filter: 'all' }), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    api.conversations.mockReturnValue(new Promise(() => undefined));
    api.summary.mockReturnValue(new Promise(() => undefined));
    const assigned = fakeConversationDetail({ assignedTo: { id: 'u2', name: 'Ravi' } });
    api.assign.mockResolvedValue(assigned);
    api.close.mockResolvedValue(fakeConversationDetail({ status: 'closed' }));
    api.reopen.mockResolvedValue(fakeConversationDetail({ status: 'open' }));
    api.block.mockResolvedValue(fakeConversationDetail({ blocked: true }));
    api.unblock.mockResolvedValue(fakeConversationDetail({ blocked: false }));
    api.start.mockResolvedValue(fakeConversationDetail({ id: 'new1', created: true }));
    const hooks = renderHook(
      () => ({
        assign: useAssignConversation(),
        close: useCloseConversation(),
        reopen: useReopenConversation(),
        block: useBlockConversation(),
        unblock: useUnblockConversation(),
        start: useStartConversation(),
        unread: useMarkUnread(),
      }),
      { wrapper },
    );
    await act(() => hooks.result.current.assign.mutateAsync({ id: 'cv1', assignedTo: 'u2' }));
    expect(api.assign).toHaveBeenCalledWith('cv1', 'u2');
    expect(conversationRows(listOf())[0]?.assignedTo).toEqual({ id: 'u2', name: 'Ravi' });
    expect(
      client.getQueryData<InboxConversationDetail>(inboxKeys.conversation('cv1'))?.assignedTo?.name,
    ).toBe('Ravi');
    await act(() => hooks.result.current.close.mutateAsync('cv1'));
    expect(
      client.getQueryData<InboxConversationDetail>(inboxKeys.conversation('cv1'))?.status,
    ).toBe('closed');
    await act(() => hooks.result.current.reopen.mutateAsync('cv1'));
    await act(() => hooks.result.current.block.mutateAsync('cv1'));
    expect(conversationRows(listOf())[0]?.blocked).toBe(true);
    await act(() => hooks.result.current.unblock.mutateAsync('cv1'));
    await act(() => hooks.result.current.start.mutateAsync({ channelId: 'wa1', contactId: 'ct1' }));
    expect(api.start).toHaveBeenCalledWith({ channelId: 'wa1', contactId: 'ct1' });
    expect(
      client.getQueryData<InboxConversationDetail>(inboxKeys.conversation('new1'))?.created,
    ).toBe(true);
    await act(() => hooks.result.current.unread.mutateAsync('cv1'));
    expect(api.unread).toHaveBeenCalledWith('cv1');
    expect(conversationRows(listOf())[0]?.unreadCount).toBe(1);
    expect(
      client.getQueryData<InboxConversationDetail>(inboxKeys.conversation('cv1'))?.unreadCount,
    ).toBe(1);
    // unread on a conversation that is not cached
    await act(() => hooks.result.current.unread.mutateAsync('nope'));
    expect(client.getQueryData(inboxKeys.conversation('nope'))).toBeUndefined();
  });

  it('storeConversation merges into an existing detail', () => {
    client.setQueryData(inboxKeys.conversation('cv1'), fakeConversationDetail({ lastReadAt: 'x' }));
    storeConversation(client, { ...fakeConversationDetail({ status: 'closed' }), lastReadAt: 'y' });
    expect(
      client.getQueryData<InboxConversationDetail>(inboxKeys.conversation('cv1')),
    ).toMatchObject({
      status: 'closed',
      lastReadAt: 'y',
    });
  });

  it('media retry marks the message pending', async () => {
    signInAs('owner');
    const image = fakeMessage('image', { id: 'img1' });
    client.setQueryData<MessagesData>(inboxKeys.messages('cv1'), {
      pages: [msgPage([image, fakeMessage('text', { id: 't1' })])],
      pageParams: [''],
    });
    const { result } = renderHook(() => useRetryMedia('cv1'), { wrapper });
    await act(() => result.current.mutateAsync('img1'));
    expect(api.retryMedia).toHaveBeenCalledWith('img1');
    expect(messagesOf().find((m) => m.id === 'img1')?.media?.status).toBe('pending');
    await act(() => result.current.mutateAsync('t1'));
    expect(messagesOf().find((m) => m.id === 't1')?.media).toBeNull();
  });
});

describe('uploads, settings, profile, simulator', () => {
  it('upload reports progress; cancel / a new upload / unmount abort the request', async () => {
    signInAs('owner');
    const signals: AbortSignal[] = [];
    api.upload.mockImplementation(({ signal, onProgress }) => {
      if (signal) signals.push(signal);
      onProgress?.(40);
      return new Promise(() => undefined);
    });
    const { result, unmount } = renderHook(() => useUploadMedia(), { wrapper });
    const file = new Blob(['x'], { type: 'image/jpeg' });
    act(() => result.current.mutate({ file, kind: 'image' }));
    await waitFor(() => expect(result.current.progress).toBe(40));
    act(() => result.current.mutate({ file, kind: 'image' }));
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]?.aborted).toBe(true);
    act(() => result.current.cancel());
    expect(signals[1]?.aborted).toBe(true);
    expect(result.current.progress).toBe(0);
    act(() => result.current.mutate({ file, kind: 'image' }));
    await waitFor(() => expect(signals).toHaveLength(3));
    unmount();
    expect(signals[2]?.aborted).toBe(true);
  });

  it('a finished upload returns the token', async () => {
    signInAs('owner');
    api.upload.mockResolvedValue(fakeUpload());
    const { result } = renderHook(() => useUploadMedia(), { wrapper });
    const done = await act(() =>
      result.current.mutateAsync({ file: new Blob(['x']), kind: 'image' }),
    );
    expect(done.mediaToken).toBe('up1');
    act(() => result.current.cancel());
  });

  it('inbox settings read + update', async () => {
    signInAs('owner');
    api.updateSettings.mockResolvedValue(fakeInboxSettings({ sendReadReceipts: false }));
    const get = renderHook(() => useInboxSettings(), { wrapper });
    await waitFor(() => expect(get.result.current.data?.sendReadReceipts).toBe(true));
    const update = renderHook(() => useUpdateInboxSettings(), { wrapper });
    await act(() => update.result.current.mutateAsync({ sendReadReceipts: false }));
    expect(api.updateSettings).toHaveBeenCalledWith({ sendReadReceipts: false });
    await waitFor(() => expect(get.result.current.data?.sendReadReceipts).toBe(false));
    expect(renderHook(() => useInboxSettings(false), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
  });

  it('business profile read / update / photo', async () => {
    signInAs('owner');
    wa.updateProfile.mockResolvedValue(fakeBusinessProfile({ about: 'New' }));
    wa.uploadProfilePhoto.mockResolvedValue(
      fakeBusinessProfile({ profilePictureUrl: 'https://p' }),
    );
    const get = renderHook(() => useBusinessProfile('wa1'), { wrapper });
    await waitFor(() => expect(get.result.current.data?.about).toBe('Loans made simple'));
    const update = renderHook(() => useUpdateBusinessProfile('wa1'), { wrapper });
    await act(() => update.result.current.mutateAsync({ about: 'New' }));
    expect(wa.updateProfile).toHaveBeenCalledWith('wa1', { about: 'New' });
    await waitFor(() => expect(get.result.current.data?.about).toBe('New'));
    const photo = renderHook(() => useUploadProfilePhoto('wa1'), { wrapper });
    const file = new File(['p'], 'logo.png', { type: 'image/png' });
    await act(() => photo.result.current.mutateAsync(file));
    expect(wa.uploadProfilePhoto).toHaveBeenCalledWith('wa1', file);
    await waitFor(() => expect(get.result.current.data?.profilePictureUrl).toBe('https://p'));
    expect(renderHook(() => useBusinessProfile(null), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
  });

  it('simulate customer refreshes the inbox shortly after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInAs('owner');
    api.simulate.mockResolvedValue({ kind: 'inbound_text', field: 'messages' } as never);
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSimulateCustomer(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        channelId: 'wa1',
        kind: 'inbound_text',
        options: { text: 'Hi' },
      }),
    );
    expect(api.simulate).toHaveBeenCalledWith('wa1', 'inbound_text', { text: 'Hi' });
    expect(spy).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1_600));
    expect(spy).toHaveBeenCalledWith({ queryKey: inboxKeys.all });
  });
});

describe('permissions', () => {
  const channel = fakeConversationDetail().channel;

  it('reply: inbox.reply, not impersonating, account active, number can send', () => {
    signInAs('agent');
    expect(renderHook(() => useCanReply(), { wrapper }).result.current).toBe(true);
    expect(renderHook(() => useCanReply(channel), { wrapper }).result.current).toBe(true);
    expect(
      renderHook(() => useCanReply(channel && { ...channel, status: 'restricted' }), { wrapper })
        .result.current,
    ).toBe(true);
    expect(
      renderHook(() => useCanReply(channel && { ...channel, status: 'disconnected' }), { wrapper })
        .result.current,
    ).toBe(false);
    expect(renderHook(() => useCanReply(null), { wrapper }).result.current).toBe(false);
    expect(channelCanReply(null)).toBe(false);
    signInAs('viewer');
    expect(renderHook(() => useCanReply(), { wrapper }).result.current).toBe(false);
    const base = fakeSession('owner');
    signInAs('owner', { account: { ...base.account, status: 'suspended' } });
    expect(renderHook(() => useCanReply(), { wrapper }).result.current).toBe(false);
    signInAs('owner');
    useAuthStore.getState().startImpersonation(
      fakeSession('owner', {
        impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-22T10:00:00Z' },
      }),
    );
    expect(renderHook(() => useCanReply(), { wrapper }).result.current).toBe(false);
  });

  it('assign: managers and owners, not agents', () => {
    signInAs('agent');
    expect(renderHook(() => useCanAssign(), { wrapper }).result.current).toBe(false);
    signInAs('manager');
    expect(renderHook(() => useCanAssign(), { wrapper }).result.current).toBe(true);
    useAuthStore.setState({ session: null });
    expect(renderHook(() => useCanAssign(), { wrapper }).result.current).toBe(false);
  });
});

describe('Inbox route', () => {
  it('opens /inbox and /inbox/:id for inbox.read', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/inbox/cv1' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
  });
});
