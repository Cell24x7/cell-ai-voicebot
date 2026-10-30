import { apiClient, unwrap } from './client';
import type {
  InboxConfig,
  InboxContactPanel,
  InboxConversation,
  InboxConversationDetail,
  InboxConversationStatus,
  InboxMessage,
  InboxSendMessage,
  InboxSettings,
  InboxSummary,
  InboxTemplateSend,
  InboxUpload,
  InboxUploadKind,
  ListEnvelope,
  MetaWebhookReceipt,
  SuccessEnvelope,
} from './types';

export type InboxFilter = 'all' | 'unread' | 'mine' | 'unassigned';

export interface ListConversationsQuery {
  status?: InboxConversationStatus;
  filter?: InboxFilter;
  channelId?: string;
  /** ≥ 2 characters: contact name / number and message text. */
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface ListMessagesQuery {
  /** `meta.olderCursor` of the previous page. */
  before?: string;
  /** A message id: the page around it (jump to a quoted message). */
  around?: string;
  limit?: number;
}

export type ConversationPage = ListEnvelope<InboxConversation, { nextCursor: string | null }>;
export type MessagePage = ListEnvelope<
  InboxMessage,
  { olderCursor: string | null; hasNewer: boolean }
>;

export interface UploadInput {
  file: Blob;
  fileName?: string;
  kind: InboxUploadKind;
  /** Voice notes: the recorded length. */
  durationSec?: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface InboxMediaLink {
  /** Signed, short-lived link to the file. */
  url: string;
  mimeType: string | null;
  fileName: string | null;
  expiresInSec: number;
}

export type InboxSettingsPatch = Partial<Omit<InboxSettings, 'retentionDays'>>;

/** Dev simulator kinds of the inbox (backend `INBOX_SIMULATOR_KINDS`). */
export const INBOX_SIMULATOR_KINDS = [
  'inbound_text',
  'inbound_image',
  'inbound_video',
  'inbound_audio',
  'inbound_voice',
  'inbound_document',
  'inbound_sticker',
  'inbound_location',
  'inbound_contacts',
  'inbound_button_reply',
  'inbound_list_reply',
  'inbound_template_button',
  'inbound_reaction',
  'inbound_reply',
  'inbound_forwarded',
  'inbound_ad_referral',
  'inbound_order',
  'inbound_nfm_reply',
  'inbound_unsupported',
  'inbound_number_changed',
  'inbound_deleted',
  'inbound_stop',
  'inbound_start',
  'inbound_stop_hinglish',
  'inbound_stop_hindi',
  'status_failed',
  'window_expired',
  'age_messages',
  'run_retention',
] as const;
export type InboxSimulatorKind = (typeof INBOX_SIMULATOR_KINDS)[number];

export interface InboxSimulateOptions {
  /** Customer number (default: a test number). */
  from?: string;
  text?: string;
  conversationId?: string;
  /** `age_messages`: move the conversation's messages this many days back. */
  days?: number;
}

export interface FakeSentLog {
  sent: {
    waMessageId: string;
    phoneNumberId: string;
    toLast4: string;
    type: string;
    interactiveType: string | null;
    mediaId: string | null;
    replyTo: boolean;
    voiceValid: boolean | null;
    at: string;
  }[];
  readReceipts: { waMessageId: string; typing: boolean; at: string }[];
}

const conv = (id: string, action = '') => `/inbox/conversations/${id}${action}`;
const msg = (id: string, action = '') => `/inbox/messages/${id}${action}`;
const post = (url: string) => unwrap(apiClient.post<SuccessEnvelope<InboxConversationDetail>>(url));

/** `/api/v1/inbox` + `/account/inbox-settings` (PHASE_10_PLAN §1n). */
export const inboxApi = {
  config: () => unwrap(apiClient.get<SuccessEnvelope<InboxConfig>>('/inbox/config')),
  summary: () => unwrap(apiClient.get<SuccessEnvelope<InboxSummary>>('/inbox/summary')),
  conversations: async (query: ListConversationsQuery) =>
    (await apiClient.get<ConversationPage>('/inbox/conversations', { params: query })).data,
  conversation: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<InboxConversationDetail>>(conv(id))),
  messages: async (id: string, query: ListMessagesQuery = {}) =>
    (await apiClient.get<MessagePage>(conv(id, '/messages'), { params: query })).data,
  contact: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<InboxContactPanel>>(conv(id, '/contact'))),
  /** Same `clientId` twice → the first message (200 instead of 201). */
  send: (id: string, body: InboxSendMessage) =>
    unwrap(apiClient.post<SuccessEnvelope<InboxMessage>>(conv(id, '/messages'), body)),
  read: async (id: string) => {
    await apiClient.post(conv(id, '/read'));
  },
  unread: async (id: string) => {
    await apiClient.post(conv(id, '/unread'));
  },
  typing: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<{ sent: boolean }>>(conv(id, '/typing'))),
  assign: (id: string, assignedTo: string | null) =>
    unwrap(apiClient.patch<SuccessEnvelope<InboxConversationDetail>>(conv(id), { assignedTo })),
  close: (id: string) => post(conv(id, '/close')),
  reopen: (id: string) => post(conv(id, '/reopen')),
  block: (id: string) => post(conv(id, '/block')),
  unblock: (id: string) => post(conv(id, '/unblock')),
  /**
   * Existing conversation of the contact on that number, or a new one (`created`);
   * with `template` the template is sent too (Phase 11 — the window can be closed).
   */
  start: (body: { channelId: string; contactId: string; template?: InboxTemplateSend }) =>
    unwrap(
      apiClient.post<SuccessEnvelope<InboxConversationDetail>>('/inbox/conversations/start', body),
    ),
  /** Multipart upload → `mediaToken` for one send (24 h). No timeout: big files, user can cancel. */
  upload: ({ file, fileName, kind, durationSec, onProgress, signal }: UploadInput) => {
    const form = new FormData();
    form.append('kind', kind);
    if (durationSec !== undefined) form.append('durationSec', String(durationSec));
    if (fileName === undefined) form.append('file', file);
    else form.append('file', file, fileName);
    return unwrap(
      apiClient.post<SuccessEnvelope<InboxUpload>>('/inbox/media', form, {
        timeout: 0,
        ...(signal ? { signal } : {}),
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }),
    );
  },
  mediaLink: (messageId: string) =>
    unwrap(apiClient.get<SuccessEnvelope<InboxMediaLink>>(msg(messageId, '/media'))),
  /** A failed outgoing message → a new message (the old one stays failed). */
  retry: (messageId: string) =>
    unwrap(apiClient.post<SuccessEnvelope<InboxMessage>>(msg(messageId, '/retry'))),
  retryMedia: async (messageId: string) => {
    await apiClient.post(msg(messageId, '/media/retry'));
  },
  settings: () => unwrap(apiClient.get<SuccessEnvelope<InboxSettings>>('/account/inbox-settings')),
  updateSettings: (patch: InboxSettingsPatch) =>
    unwrap(apiClient.patch<SuccessEnvelope<InboxSettings>>('/account/inbox-settings', patch)),
  /** DEV ONLY — a simulated customer event (`POST /dev/meta/webhooks`, absent in production). */
  simulate: (channelId: string, kind: InboxSimulatorKind, options: InboxSimulateOptions = {}) =>
    unwrap(
      apiClient.post<SuccessEnvelope<MetaWebhookReceipt & { kind: string; field: string }>>(
        '/dev/meta/webhooks',
        { channelId, kind, ...options },
      ),
    ),
  /** DEV ONLY — what the fake Meta "sent" for a number. */
  fakeSent: (channelId: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<FakeSentLog>>('/dev/meta/sent', { params: { channelId } }),
    ),
};
