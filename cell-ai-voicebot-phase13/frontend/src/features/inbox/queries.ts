import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSession } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';
import {
  inboxApi,
  type InboxSettingsPatch,
  type InboxSimulateOptions,
  type InboxSimulatorKind,
  type ListConversationsQuery,
  type UploadInput,
} from '@/services/api/inbox';
import type {
  InboxConversation,
  InboxConversationDetail,
  InboxMessage,
  InboxSendMessage,
} from '@/services/api/types';
import { useWsEvent, useWsTopic } from '@/services/realtime';

import { inboxKeys } from './keys';
import { resolveLimits } from './limits';
import {
  applyUpdate,
  bodyFor,
  buildOptimistic,
  findMessage,
  forgetBody,
  hasConversation,
  hasPendingOutgoing,
  markRowRead,
  patchConversationRow,
  rememberBody,
  replaceMessage,
  storeConversationRow,
  upsertMessage,
  type ConversationsData,
  type MessagesData,
  type MessageUpdate,
} from './optimistic';

export { useCanAssign, useCanReply } from './permissions';
export { useInboxSummary } from './summary';

/** The list refetches this often while the page is visible (live updates can be off). */
export const INBOX_LIST_POLL_MS = 15_000;
/** The open chat refetches this often while an outgoing message waits for Meta. */
export const INBOX_CHAT_POLL_MS = 5_000;
/** "Asha is typing…" disappears after this long without a new ping. */
export const TYPING_VISIBLE_MS = 6_000;

export const conversationTopic = (id: string): string => `conversation:${id}`;

/** Limits / retention / fake provider; 503 `WHATSAPP_NOT_CONFIGURED` when WhatsApp is off. */
export const useInboxConfig = (enabled = true) =>
  useQuery({
    queryKey: inboxKeys.config,
    queryFn: inboxApi.config,
    enabled,
    staleTime: Infinity,
    meta: { silent: true },
  });

export const useInboxLimits = () => resolveLimits(useInboxConfig().data);

/** Cursor pages ("Load more"); filters + search are part of the key. */
export const useConversations = (query: Omit<ListConversationsQuery, 'cursor'>, enabled = true) =>
  useInfiniteQuery({
    queryKey: inboxKeys.list(query),
    queryFn: ({ pageParam }: { pageParam: string }) =>
      inboxApi.conversations({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled,
    refetchInterval: INBOX_LIST_POLL_MS,
  });

/** Applies `fn` to every cached conversation list. */
const forEachList = (
  client: QueryClient,
  fn: (data: ConversationsData | undefined) => ConversationsData | undefined,
) => {
  client.setQueriesData<ConversationsData>({ queryKey: inboxKeys.lists }, fn);
};

/** Puts a conversation returned by an action into its detail and every list row. */
export const storeConversation = (client: QueryClient, c: InboxConversationDetail): void => {
  client.setQueryData<InboxConversationDetail>(inboxKeys.conversation(c.id), (old) =>
    old ? { ...old, ...c } : c,
  );
  forEachList(client, (data) => storeConversationRow(data, c));
  void client.invalidateQueries({ queryKey: inboxKeys.lists });
  void client.invalidateQueries({ queryKey: inboxKeys.summary });
};

/**
 * Account events (mounted on the Inbox page): patch the row at once (counters,
 * status, order), then refetch lists for previews / new rows. No text in events.
 */
export const useInboxLiveUpdates = (): void => {
  const client = useQueryClient();
  useWsEvent('inbox.conversation.updated', (event) => {
    const lists = client.getQueriesData<ConversationsData>({ queryKey: inboxKeys.lists });
    const known = lists.some(([, data]) => hasConversation(data, event.data.conversationId));
    if (known) forEachList(client, (data) => patchConversationRow(data, event.data));
    client.setQueryData<InboxConversationDetail>(
      inboxKeys.conversation(event.data.conversationId),
      (c) => (c ? { ...c, status: event.data.status, unreadCount: event.data.unreadCount } : c),
    );
    void client.invalidateQueries({ queryKey: inboxKeys.lists });
    // assignee names / window come with the full conversation; opt-out, block and
    // name changes with the contact panel
    void client.invalidateQueries({ queryKey: inboxKeys.conversation(event.data.conversationId) });
    void client.invalidateQueries({ queryKey: inboxKeys.contact(event.data.conversationId) });
    // messages stored without their own event (coexistence history) show in an open chat;
    // only a chat on screen refetches (inactive pages are just marked stale)
    void client.invalidateQueries({ queryKey: inboxKeys.messagesOf(event.data.conversationId) });
  });
};

export const useConversation = (id: string | null) =>
  useQuery({
    queryKey: inboxKeys.conversation(id ?? ''),
    queryFn: id ? () => inboxApi.conversation(id) : skipToken,
  });

export const useContactPanel = (id: string | null) =>
  useQuery({
    queryKey: inboxKeys.contact(id ?? ''),
    queryFn: id ? () => inboxApi.contact(id) : skipToken,
  });

/**
 * Messages of a conversation: page 0 = the newest (or the page `around` a
 * jumped-to message), older pages fetched upwards. Polls while an outgoing
 * message waits for Meta; stops once every status is final.
 */
export const useMessages = (id: string | null, around: string | null = null) =>
  useInfiniteQuery({
    queryKey: inboxKeys.messages(id ?? '', around),
    queryFn: id
      ? ({ pageParam }: { pageParam: string }) =>
          inboxApi.messages(id, pageParam ? { before: pageParam } : around ? { around } : {})
      : skipToken,
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.olderCursor ?? undefined,
    refetchInterval: (query) => (hasPendingOutgoing(query.state.data) ? INBOX_CHAT_POLL_MS : false),
  });

/** Applies `fn` to the latest page set and every `around` page set of a conversation. */
const forEachMessages = (
  client: QueryClient,
  id: string,
  fn: (data: MessagesData | undefined) => MessagesData | undefined,
) => {
  client.setQueriesData<MessagesData>({ queryKey: inboxKeys.messagesOf(id) }, fn);
};

/** Adds / replaces a message in the open chat (deduped by id and clientId). */
export const storeMessage = (client: QueryClient, message: InboxMessage): void => {
  client.setQueryData<MessagesData>(inboxKeys.messages(message.conversationId), (data) =>
    upsertMessage(data, message),
  );
  client.setQueriesData<MessagesData>(
    { queryKey: inboxKeys.messagesOf(message.conversationId) },
    (data) => (findMessage(data, message.id) ? upsertMessage(data, message) : data),
  );
};

/**
 * Subscribes to `conversation:<id>` while the chat is open and merges its events:
 * `created` (full message, deduped against optimistic bubbles), `updated`
 * (monotonic; an update that arrives before its message waits for it), typing.
 * Returns the name of another agent who is typing.
 */
export const useConversationTopic = (id: string | null): { typingName: string | null } => {
  const client = useQueryClient();
  const myId = useSession()?.user.id;
  const early = useRef(new Map<string, MessageUpdate>());
  const [typing, setTyping] = useState<{
    conversationId: string;
    name: string;
    until: number;
  } | null>(null);
  useWsTopic(id ? conversationTopic(id) : null);

  useEffect(() => {
    early.current.clear();
  }, [id]);

  useWsEvent('inbox.message.created', (event) => {
    const message = event.data.message;
    if (!id || message.conversationId !== id) return;
    const pending = early.current.get(message.id);
    early.current.delete(message.id);
    storeMessage(client, pending ? applyUpdate(message, pending) : message);
    if (message.direction === 'in') setTyping(null);
  });
  useWsEvent('inbox.message.updated', (event) => {
    if (!id) return;
    const update = event.data;
    let found = false;
    forEachMessages(client, id, (data) => {
      if (!findMessage(data, update.messageId)) return data;
      found = true;
      return replaceMessage(data, update.messageId, (m) => applyUpdate(m, update));
    });
    if (!found) early.current.set(update.messageId, update);
  });
  useWsEvent('inbox.typing', (event) => {
    if (!id || event.data.conversationId !== id || event.data.userId === myId) return;
    setTyping({ conversationId: id, name: event.data.name, until: Date.now() + TYPING_VISIBLE_MS });
  });

  useEffect(() => {
    if (!typing) return undefined;
    const timer = setTimeout(() => setTyping(null), Math.max(0, typing.until - Date.now()));
    return () => clearTimeout(timer);
  }, [typing]);

  return { typingName: typing && typing.conversationId === id ? typing.name : null };
};

/**
 * Send with an optimistic `queued` bubble keyed by `clientId`; the server's
 * message replaces it. A send that never reached the server turns the bubble
 * `failed` (Retry resends the same body + clientId — idempotent).
 */
export const useSendMessage = (conversationId: string) => {
  const client = useQueryClient();
  const user = useSession()?.user;
  return useMutation({
    mutationFn: (body: InboxSendMessage) => inboxApi.send(conversationId, body),
    meta: { silent: true },
    onMutate: (body) => {
      rememberBody(body);
      if (body.type === 'reaction') {
        // our reaction shows on the target at once (one per sender; '' removes it)
        forEachMessages(client, conversationId, (data) =>
          replaceMessage(data, body.messageId, (m) => ({
            ...m,
            reactions: [
              ...m.reactions.filter((r) => r.by !== 'agent'),
              ...(body.emoji
                ? [{ emoji: body.emoji, by: 'agent' as const, at: new Date().toISOString() }]
                : []),
            ],
          })),
        );
        return;
      }
      const bubble = buildOptimistic(
        conversationId,
        body,
        user ? { id: user.id, name: user.name } : null,
      );
      storeMessage(client, bubble);
    },
    onSuccess: (message, body) => {
      forgetBody(body.clientId);
      storeMessage(client, message);
      void client.invalidateQueries({ queryKey: inboxKeys.lists });
    },
    onError: (err, body) => {
      const reason = err instanceof Error ? err.message : 'Not sent';
      forEachMessages(client, conversationId, (data) =>
        replaceMessage(data, `tmp_${body.clientId}`, (m) => ({
          ...m,
          status: 'failed',
          error: { code: null, reason },
        })),
      );
    },
  });
};

/**
 * Retry a failed message: a server-side failure → `POST /messages/:id/retry`
 * (new message); a local failure → the same body again.
 */
export const useRetryMessage = (conversationId: string) => {
  const client = useQueryClient();
  const send = useSendMessage(conversationId);
  return useMutation({
    mutationFn: async (message: InboxMessage) => {
      const body = bodyFor(message.clientId);
      if (message.id.startsWith('tmp_') && body) return send.mutateAsync(body);
      return inboxApi.retry(message.id);
    },
    onSuccess: (message) => {
      storeMessage(client, message);
    },
  });
};

/** Read marker on open — skipped for impersonators (read only, no receipts). */
export const useMarkRead = (conversationId: string | null, unreadCount: number) => {
  const client = useQueryClient();
  const impersonating = useImpersonating();
  const mutation = useMutation({
    mutationFn: (id: string) => inboxApi.read(id),
    meta: { silent: true },
    onSuccess: (_r, id) => {
      forEachList(client, (data) => markRowRead(data, id));
      client.setQueryData<InboxConversationDetail>(inboxKeys.conversation(id), (c) =>
        c ? { ...c, unreadCount: 0 } : c,
      );
      void client.invalidateQueries({ queryKey: inboxKeys.summary });
    },
  });
  const { mutate } = mutation;
  useEffect(() => {
    if (conversationId && unreadCount > 0 && !impersonating) mutate(conversationId);
  }, [conversationId, unreadCount, impersonating, mutate]);
  return mutation;
};

/** Typing ping to the customer, at most once per `typingThrottleMs`. */
export const useTypingPing = (conversationId: string | null) => {
  const { typingThrottleMs } = useInboxLimits();
  const last = useRef(0);
  useEffect(() => {
    last.current = 0;
  }, [conversationId]);
  return useCallback(() => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - last.current < typingThrottleMs) return;
    last.current = now;
    void inboxApi.typing(conversationId).catch(() => undefined);
  }, [conversationId, typingThrottleMs]);
};

const useConversationAction = <TArgs>(fn: (args: TArgs) => Promise<InboxConversationDetail>) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (c) => {
      storeConversation(client, c);
    },
  });
};

export const useAssignConversation = () =>
  useConversationAction(({ id, assignedTo }: { id: string; assignedTo: string | null }) =>
    inboxApi.assign(id, assignedTo),
  );
export const useCloseConversation = () => useConversationAction((id: string) => inboxApi.close(id));
export const useReopenConversation = () =>
  useConversationAction((id: string) => inboxApi.reopen(id));
export const useBlockConversation = () => useConversationAction((id: string) => inboxApi.block(id));
export const useUnblockConversation = () =>
  useConversationAction((id: string) => inboxApi.unblock(id));

/** "Mark as unread" (team only — WhatsApp has no unread receipt). */
export const useMarkUnread = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboxApi.unread(id),
    onSuccess: (_r, id) => {
      forEachList(client, (data) => markRowRead(data, id, 1));
      client.setQueryData<InboxConversationDetail>(inboxKeys.conversation(id), (c) =>
        c ? { ...c, unreadCount: 1 } : c,
      );
      void client.invalidateQueries({ queryKey: inboxKeys.summary });
    },
  });
};

/** Contact page "Start chat" / "Open chat" → the conversation (new or existing). */
export const useStartConversation = () =>
  useConversationAction((body: { channelId: string; contactId: string }) => inboxApi.start(body));

/** Upload with progress + cancel; `cancel()` aborts the request in flight. */
export const useUploadMedia = () => {
  const controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: (input: Omit<UploadInput, 'signal' | 'onProgress'>) => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      setProgress(0);
      return inboxApi.upload({ ...input, signal: ac.signal, onProgress: setProgress });
    },
    meta: { silent: true },
    onSettled: () => {
      controller.current = null;
    },
  });
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setProgress(0);
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  return { ...mutation, progress, cancel };
};

/** Signed link (5 min) — refetched before it expires. */
export const useMediaLink = (messageId: string | null, enabled = true) =>
  useQuery({
    queryKey: inboxKeys.mediaLink(messageId ?? ''),
    queryFn: messageId && enabled ? () => inboxApi.mediaLink(messageId) : skipToken,
    staleTime: 4 * 60_000,
    gcTime: 4 * 60_000,
    meta: { silent: true },
  });

export const useRetryMedia = (conversationId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => inboxApi.retryMedia(messageId),
    onSuccess: (_r, messageId) => {
      forEachMessages(client, conversationId, (data) =>
        replaceMessage(data, messageId, (m) =>
          m.media ? { ...m, media: { ...m.media, status: 'pending' } } : m,
        ),
      );
    },
  });
};

export const useInboxSettings = (enabled = true) =>
  useQuery({ queryKey: inboxKeys.settings, queryFn: inboxApi.settings, enabled });

export const useUpdateInboxSettings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: InboxSettingsPatch) => inboxApi.updateSettings(patch),
    onSuccess: (settings) => {
      client.setQueryData(inboxKeys.settings, settings);
    },
  });
};

/** DEV ONLY — a simulated customer; the effect arrives through the worker + WS / polling. */
export const useSimulateCustomer = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      channelId,
      kind,
      options,
    }: {
      channelId: string;
      kind: InboxSimulatorKind;
      options?: InboxSimulateOptions;
    }) => inboxApi.simulate(channelId, kind, options),
    onSuccess: () => {
      // the worker needs a moment; refetch soon after
      setTimeout(() => {
        void client.invalidateQueries({ queryKey: inboxKeys.all });
      }, 1_500);
    },
  });
};

/** Rows of every loaded page (newest first). */
export const conversationRows = (data: ConversationsData | undefined): InboxConversation[] =>
  data ? data.pages.flatMap((p) => p.data) : [];
