import type { InfiniteData } from '@tanstack/react-query';

import type { ConversationPage, MessagePage } from '@/services/api/inbox';
import type {
  InboxConversation,
  InboxMessage,
  InboxMessageStatus,
  InboxSendMessage,
} from '@/services/api/types';
import type { WsEventMap } from '@/services/realtime/events';

export type MessagesData = InfiniteData<MessagePage>;
export type ConversationsData = InfiniteData<ConversationPage>;
export type MessageUpdate = WsEventMap['inbox.message.updated'];
export type ConversationEvent = WsEventMap['inbox.conversation.updated'];

/** Ids of bubbles that exist only in this browser (not saved yet). */
export const OPTIMISTIC_PREFIX = 'tmp_';
export const isOptimistic = (m: Pick<InboxMessage, 'id'>): boolean =>
  m.id.startsWith(OPTIMISTIC_PREFIX);

/** Outgoing order; -1 = not part of the forward chain. */
const RANK: Record<InboxMessageStatus, number> = {
  received: -1,
  queued: 0,
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: -1,
  deleted: -1,
};

/**
 * Same rule as the backend (`status-rank.ts`): forward only; `failed` overrides
 * anything below `delivered`; a failed message moves only to delivered / read;
 * `deleted` only for inbound. Late or repeated events never move a tick back.
 */
export const canMoveTo = (
  current: InboxMessageStatus,
  next: InboxMessageStatus,
  direction: 'in' | 'out',
): boolean => {
  if (current === next) return false;
  if (direction === 'in') return next === 'deleted' && current === 'received';
  if (next === 'deleted' || next === 'received') return false;
  const from = RANK[current];
  const to = RANK[next];
  if (next === 'failed') return from >= 0 && from < RANK.delivered;
  if (current === 'failed') return to >= RANK.delivered;
  return from >= 0 && to > from;
};

/** Original bodies of optimistic sends (Retry of a send that never reached the server). */
const pendingBodies = new Map<string, InboxSendMessage>();
export const rememberBody = (body: InboxSendMessage): void => {
  pendingBodies.set(body.clientId, body);
};
export const bodyFor = (clientId: string | null): InboxSendMessage | undefined =>
  clientId ? pendingBodies.get(clientId) : undefined;
export const forgetBody = (clientId: string): void => {
  pendingBodies.delete(clientId);
};

const textOf = (body: InboxSendMessage): string | null => {
  switch (body.type) {
    case 'text':
    case 'note':
      return body.text;
    case 'image':
    case 'video':
    case 'document':
      return body.caption?.trim() || null;
    default:
      return null;
  }
};

const textHeader = (text: string | null | undefined) =>
  text ? { type: 'text' as const, text, fileName: null } : null;

/** Outgoing interactive preview (same shape the server stores). */
const interactiveOf = (body: InboxSendMessage): InboxMessage['interactive'] => {
  if (body.type === 'voice_call') {
    // Phase 12: the "Call us" button message
    return {
      kind: 'voice_call',
      header: null,
      body: body.body,
      footer: null,
      buttons: [],
      listButton: null,
      sections: [],
      cta: null,
      reply: null,
      nfmResponse: null,
      nfmTruncated: false,
      callPermission: null,
      voiceCall: {
        displayText: body.displayText?.trim() || 'Call now',
        ttlMinutes: body.ttlMinutes ?? null,
      },
      requestState: null,
    };
  }
  if (body.type !== 'buttons' && body.type !== 'list' && body.type !== 'cta_url') return null;
  const header =
    body.type === 'buttons'
      ? body.header?.type === 'text'
        ? textHeader(body.header.text)
        : body.header
          ? { type: body.header.type, text: null, fileName: null }
          : null
      : textHeader(body.header);
  return {
    kind: body.type === 'buttons' ? 'button' : body.type,
    header,
    body: body.body,
    footer: body.footer?.trim() || null,
    buttons: body.type === 'buttons' ? body.buttons : [],
    listButton: body.type === 'list' ? body.button : null,
    sections:
      body.type === 'list'
        ? body.sections.map((sec) => ({
            title: sec.title?.trim() || null,
            rows: sec.rows.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description?.trim() || null,
            })),
          }))
        : [],
    cta: body.type === 'cta_url' ? { displayText: body.displayText, url: body.url } : null,
    reply: null,
    nfmResponse: null,
    nfmTruncated: false,
    callPermission: null,
    voiceCall: null,
    requestState: null,
  };
};

/** The bubble shown right away (status `queued`) until the server's message replaces it. */
export const buildOptimistic = (
  conversationId: string,
  body: InboxSendMessage,
  sender: { id: string; name: string } | null,
  now: Date = new Date(),
): InboxMessage => {
  const at = now.toISOString();
  const note = body.type === 'note';
  const type: InboxMessage['type'] =
    body.type === 'voice'
      ? 'audio'
      : body.type === 'buttons' ||
          body.type === 'list' ||
          body.type === 'cta_url' ||
          body.type === 'voice_call'
        ? 'interactive'
        : body.type;
  return {
    id: `${OPTIMISTIC_PREFIX}${body.clientId}`,
    conversationId,
    channelId: '',
    direction: 'out',
    origin: 'agent',
    type,
    text: textOf(body),
    media:
      'mediaToken' in body
        ? {
            status: 'ready',
            mimeType: null,
            size: null,
            fileName: body.type === 'document' ? (body.fileName ?? null) : null,
            durationSec: null,
            voice: body.type === 'voice',
            animated: false,
          }
        : null,
    location:
      body.type === 'location'
        ? {
            latitude: body.latitude,
            longitude: body.longitude,
            name: body.name?.trim() || null,
            address: body.address?.trim() || null,
            url: null,
          }
        : null,
    contacts: null,
    interactive: interactiveOf(body),
    reaction:
      body.type === 'reaction' ? { targetMessageId: body.messageId, emoji: body.emoji } : null,
    context: null,
    replyTo: null,
    reactions: [],
    order: null,
    button: null,
    system: null,
    call: null,
    status: note ? 'sent' : 'queued',
    statusHistory: [{ status: note ? 'sent' : 'queued', at }],
    error: null,
    clientId: body.clientId,
    sentBy: sender,
    retryOf: null,
    template: null,
    billing: null,
    at,
    createdAt: at,
  };
};

/** Messages oldest → newest across pages (page 0 = newest page). */
export const flattenMessages = (data: MessagesData | undefined): InboxMessage[] =>
  data ? [...data.pages].reverse().flatMap((p) => p.data) : [];

export const hasPendingOutgoing = (data: MessagesData | undefined): boolean =>
  flattenMessages(data).some(
    (m) => m.direction === 'out' && (m.status === 'queued' || m.status === 'accepted'),
  );

const mergeInto = (existing: InboxMessage, incoming: InboxMessage): InboxMessage => {
  if (isOptimistic(existing)) return incoming;
  const keepStatus =
    existing.status !== incoming.status &&
    !canMoveTo(existing.status, incoming.status, existing.direction);
  return keepStatus
    ? {
        ...incoming,
        status: existing.status,
        error: existing.error,
        statusHistory: existing.statusHistory,
      }
    : incoming;
};

const insertByTime = (list: InboxMessage[], message: InboxMessage): InboxMessage[] => {
  const at = Date.parse(message.at);
  let index = list.length;
  for (; index > 0; index -= 1) {
    const previous = list[index - 1] as InboxMessage;
    if (Date.parse(previous.at) <= at) break;
  }
  return [...list.slice(0, index), message, ...list.slice(index)];
};

/**
 * Adds a message (WS `created`, send / retry response) — deduped by id and by
 * `clientId` (replaces its optimistic bubble), never moving a status back.
 * Reaction messages are skipped (the list API leaves them out too).
 */
export const upsertMessage = (
  data: MessagesData | undefined,
  message: InboxMessage,
): MessagesData | undefined => {
  // reactions are not rows: they show on their target (`reactions`, via `updated`)
  if (!data || message.type === 'reaction') return data;
  let found = false;
  const pages = data.pages.map((page) => {
    const index = page.data.findIndex(
      (m) => m.id === message.id || (message.clientId !== null && m.clientId === message.clientId),
    );
    if (index < 0 || found) return page;
    found = true;
    const existing = page.data[index] as InboxMessage;
    const next = [...page.data];
    next[index] = mergeInto(existing, message);
    return { ...page, data: next };
  });
  if (found) return { ...data, pages };
  const [newest, ...older] = data.pages;
  if (!newest) return data;
  return { ...data, pages: [{ ...newest, data: insertByTime(newest.data, message) }, ...older] };
};

/** Replaces one message by id (e.g. a local failure of an optimistic send). */
export const replaceMessage = (
  data: MessagesData | undefined,
  id: string,
  patch: (m: InboxMessage) => InboxMessage,
): MessagesData | undefined =>
  data && {
    ...data,
    pages: data.pages.map((page) =>
      page.data.some((m) => m.id === id)
        ? { ...page, data: page.data.map((m) => (m.id === id ? patch(m) : m)) }
        : page,
    ),
  };

export const findMessage = (data: MessagesData | undefined, id: string): InboxMessage | undefined =>
  flattenMessages(data).find((m) => m.id === id);

/** WS `inbox.message.updated` → status (monotonic) / error / media status / reactions. */
export const applyUpdate = (m: InboxMessage, update: MessageUpdate): InboxMessage => {
  const move = canMoveTo(m.status, update.status, m.direction);
  return {
    ...m,
    ...(move
      ? {
          status: update.status,
          error: update.error,
          statusHistory: [
            ...m.statusHistory,
            { status: update.status, at: new Date().toISOString() },
          ],
        }
      : {}),
    media: m.media && update.media ? { ...m.media, status: update.media.status } : m.media,
    reactions: update.reactions.map((r) => {
      const known = m.reactions.find((x) => x.emoji === r.emoji && x.by === r.by);
      return known ?? { ...r, at: new Date().toISOString() };
    }),
  };
};

const rowTime = (c: InboxConversation): number =>
  c.lastMessage ? Date.parse(c.lastMessage.at) : Date.parse(c.createdAt);

/** Newest activity first (same order as the server: last message time, then id). */
export const sortConversations = (rows: InboxConversation[]): InboxConversation[] =>
  [...rows].sort((a, b) => rowTime(b) - rowTime(a) || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));

/** Patches rows across pages, re-sorts, keeps each page's size. */
const mapRows = (
  data: ConversationsData | undefined,
  fn: (row: InboxConversation) => InboxConversation,
): ConversationsData | undefined => {
  if (!data) return data;
  const rows = sortConversations(data.pages.flatMap((p) => p.data).map(fn));
  let offset = 0;
  return {
    ...data,
    pages: data.pages.map((page) => {
      const slice = rows.slice(offset, offset + page.data.length);
      offset += page.data.length;
      return { ...page, data: slice };
    }),
  };
};

export const hasConversation = (data: ConversationsData | undefined, id: string): boolean =>
  Boolean(data?.pages.some((p) => p.data.some((c) => c.id === id)));

/** Account event (ids + counts only) → the row's counters / status / order. */
export const patchConversationRow = (
  data: ConversationsData | undefined,
  event: ConversationEvent,
): ConversationsData | undefined =>
  mapRows(data, (row) => {
    if (row.id !== event.conversationId) return row;
    const lastAt = event.lastMessageAt;
    const newer = lastAt && row.lastMessage && Date.parse(lastAt) > Date.parse(row.lastMessage.at);
    return {
      ...row,
      status: event.status,
      unreadCount: event.unreadCount,
      assignedTo:
        event.assignedTo === null
          ? null
          : row.assignedTo?.id === event.assignedTo
            ? row.assignedTo
            : { id: event.assignedTo, name: '' },
      lastMessage:
        row.lastMessage && newer
          ? {
              ...row.lastMessage,
              at: lastAt,
              direction: event.lastMessageDirection ?? row.lastMessage.direction,
            }
          : row.lastMessage,
    };
  });

/** A conversation returned by an action (assign / close / block…) → its row. */
export const storeConversationRow = (
  data: ConversationsData | undefined,
  conversation: InboxConversation,
): ConversationsData | undefined =>
  mapRows(data, (row) =>
    row.id === conversation.id
      ? { ...row, ...conversation, match: row.match ?? conversation.match ?? null }
      : row,
  );

export const markRowRead = (
  data: ConversationsData | undefined,
  id: string,
  unreadCount = 0,
): ConversationsData | undefined =>
  mapRows(data, (row) => (row.id === id ? { ...row, unreadCount } : row));
