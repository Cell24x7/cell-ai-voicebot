import type {
  InboxConfig,
  InboxContactPanel,
  InboxConversation,
  InboxConversationDetail,
  InboxMessage,
  InboxMessageType,
  InboxSettings,
  InboxSummary,
  InboxUpload,
  WhatsAppBusinessProfile,
} from '@/services/api/types';

const AT = '2026-10-22T09:00:00.000Z';

/** An open conversation with one unread inbound text (override what the test needs). */
export const fakeConversation = (
  overrides: Partial<InboxConversation> = {},
): InboxConversation => ({
  id: 'cv1',
  channelId: 'wa1',
  contact: {
    id: 'ct1',
    name: 'Asha Verma',
    phoneE164: '+919000077001',
    deleted: false,
    optedOut: false,
  },
  label: 'Asha Verma',
  phoneE164: '+919000077001',
  profileName: 'Asha',
  status: 'open',
  assignedTo: null,
  unreadCount: 1,
  lastMessage: {
    id: 'm1',
    direction: 'in',
    type: 'text',
    preview: 'Namaste',
    at: AT,
    status: 'received',
  },
  windowExpiresAt: '2026-10-23T09:00:00.000Z',
  windowOpen: true,
  blocked: false,
  source: 'inbound',
  closedAt: null,
  createdAt: AT,
  match: null,
  ...overrides,
});

export const fakeConversationDetail = (
  overrides: Partial<InboxConversationDetail> = {},
): InboxConversationDetail => ({
  ...fakeConversation(),
  channel: {
    id: 'wa1',
    label: 'Support line',
    displayPhoneNumber: '+91 90000 12345',
    status: 'connected',
    mode: 'cloud_api',
  },
  lastReadAt: null,
  ...overrides,
});

const base = (type: InboxMessageType): InboxMessage => ({
  id: `m_${type}`,
  conversationId: 'cv1',
  channelId: 'wa1',
  direction: 'in',
  origin: 'customer',
  type,
  text: null,
  media: null,
  location: null,
  contacts: null,
  interactive: null,
  reaction: null,
  context: null,
  replyTo: null,
  reactions: [],
  order: null,
  button: null,
  system: null,
  call: null,
  status: 'received',
  statusHistory: [{ status: 'received', at: AT }],
  error: null,
  clientId: null,
  sentBy: null,
  retryOf: null,
  template: null,
  billing: null,
  at: AT,
  createdAt: AT,
});

const media = (
  mimeType: string,
  extra: Partial<NonNullable<InboxMessage['media']>> = {},
): NonNullable<InboxMessage['media']> => ({
  status: 'ready',
  mimeType,
  size: 2048,
  fileName: null,
  durationSec: null,
  voice: false,
  animated: false,
  ...extra,
});

const interactive = (
  kind: NonNullable<InboxMessage['interactive']>['kind'],
  extra: Partial<NonNullable<InboxMessage['interactive']>> = {},
): NonNullable<InboxMessage['interactive']> => ({
  kind,
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
  callPermission: null,
  voiceCall: null,
  requestState: null,
  ...extra,
});

/** The typical content of each message type (inbound unless the type is outgoing-only). */
const CONTENT: Record<InboxMessageType, Partial<InboxMessage>> = {
  text: { text: 'Namaste, meri EMI ki date kya hai?' },
  image: { text: 'Payment ka screenshot', media: media('image/jpeg') },
  video: { media: media('video/mp4', { size: 1_048_576 }) },
  audio: { media: media('audio/mpeg', { durationSec: 42 }) },
  document: {
    text: 'Statement',
    media: media('application/pdf', { fileName: 'statement.pdf', size: 245_760 }),
  },
  sticker: { media: media('image/webp', { animated: false }) },
  location: {
    location: {
      latitude: 26.9124,
      longitude: 75.7873,
      name: 'Jaipur branch',
      address: 'MI Road, Jaipur',
      url: null,
    },
  },
  contacts: {
    contacts: [
      {
        name: 'Ravi Kumar',
        phones: [{ phone: '+91 90000 66001', type: 'CELL', waId: '919000066001' }],
        emails: [{ email: 'ravi@example.com', type: 'WORK' }],
        org: 'Example Pvt Ltd',
      },
    ],
  },
  interactive: {
    interactive: interactive('button_reply', {
      reply: { id: 'pay_yes', title: 'Yes, pay now', description: null },
    }),
  },
  button: { button: { payload: 'CONFIRM', text: 'Confirm' } },
  reaction: { reaction: { targetMessageId: 'm_text', emoji: '👍' } },
  order: { order: { catalogId: 'cat1', itemsCount: 2, total: 1499, currency: 'INR' } },
  system: { system: { kind: 'customer_changed_number', newWaIdLast4: '7001' } },
  unsupported: {},
  note: { direction: 'out', origin: 'agent', text: 'Called the customer back', status: 'sent' },
  call: {
    direction: 'out',
    origin: 'system',
    status: 'sent',
    call: { callId: 'c1', direction: 'out', outcome: 'completed', durationSec: 134, mode: 'human' },
  },
  template: {
    direction: 'out',
    origin: 'agent',
    status: 'delivered',
    text: 'Namaste Asha, your EMI of ₹12,500.00 is due on 05 Nov 2026.',
    template: {
      templateId: 'tpl1',
      name: 'emi_reminder',
      language: 'en',
      category: 'UTILITY',
    },
    billing: {
      payer: 'platform',
      category: 'utility',
      market: 'IN',
      priceMicros: 140_000,
      status: 'held',
    },
  },
};

/** One message of `type` (override direction / origin / status / content as needed). */
export const fakeMessage = (
  type: InboxMessageType = 'text',
  overrides: Partial<InboxMessage> = {},
): InboxMessage => ({ ...base(type), ...CONTENT[type], ...overrides });

/** An agent's outgoing message in `status` (queued → read, failed). */
export const fakeOutgoing = (
  status: InboxMessage['status'] = 'sent',
  overrides: Partial<InboxMessage> = {},
): InboxMessage =>
  fakeMessage('text', {
    id: `out_${status}`,
    direction: 'out',
    origin: 'agent',
    text: 'Aapki EMI 5 tareekh ko due hai.',
    status,
    statusHistory: [{ status, at: AT }],
    sentBy: { id: 'u1', name: 'Owner' },
    clientId: `client-${status}`,
    ...(status === 'failed'
      ? {
          error: {
            code: 131047,
            reason: 'More than 24 hours have passed since the customer last replied.',
          },
        }
      : {}),
    ...overrides,
  });

/** Outgoing interactive messages the composer builds. */
export const fakeOutgoingInteractive = (
  kind: 'button' | 'list' | 'cta_url',
  overrides: Partial<InboxMessage> = {},
): InboxMessage =>
  fakeMessage('interactive', {
    id: `out_${kind}`,
    direction: 'out',
    origin: 'agent',
    status: 'sent',
    interactive: interactive(kind, {
      body: 'Choose one',
      footer: 'Demo Finance',
      ...(kind === 'button'
        ? {
            buttons: [
              { id: 'yes', title: 'Yes' },
              { id: 'no', title: 'No' },
            ],
          }
        : {}),
      ...(kind === 'list'
        ? {
            listButton: 'Plans',
            sections: [
              { title: 'Loans', rows: [{ id: 'r1', title: 'Home loan', description: '8.5%' }] },
            ],
          }
        : {}),
      ...(kind === 'cta_url'
        ? { cta: { displayText: 'Pay', url: 'https://pay.example.com' } }
        : {}),
    }),
    ...overrides,
  });

export const fakeInboxConfig = (overrides: Partial<InboxConfig> = {}): InboxConfig => ({
  retentionDays: 90,
  fakeProvider: true,
  limits: {
    textMax: 4096,
    captionMax: 1024,
    imageMaxBytes: 5 * 1024 * 1024,
    videoMaxBytes: 16 * 1024 * 1024,
    audioMaxBytes: 16 * 1024 * 1024,
    stickerMaxBytes: 100 * 1024,
    documentMaxBytes: 100 * 1024 * 1024,
    buttonsMax: 3,
    buttonTitleMax: 20,
    listRowsMax: 10,
    listSectionsMax: 10,
    rowTitleMax: 24,
    rowDescriptionMax: 72,
    headerTextMax: 60,
    footerMax: 60,
    bodyMax: 1024,
    ctaTextMax: 20,
    contactsMax: 10,
    voiceNoteMaxSeconds: 600,
    voiceNoteMinMs: 1000,
    typingThrottleMs: 10_000,
  },
  ...overrides,
});

export const fakeInboxSettings = (overrides: Partial<InboxSettings> = {}): InboxSettings => ({
  sendReadReceipts: true,
  optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'BAND KARO', 'बंद करो'],
  optInKeywords: ['START', 'SHURU'],
  optOutReply: true,
  optOutReplyText: 'You will not get more messages from us. Reply START to subscribe again.',
  optInReply: true,
  optInReplyText: 'You are subscribed again.',
  notifyOnNewMessage: 'assigned_or_all',
  retentionDays: 90,
  ...overrides,
});

export const fakeInboxSummary = (overrides: Partial<InboxSummary> = {}): InboxSummary => ({
  unreadConversations: 3,
  assignedToMeUnread: 1,
  open: 5,
  ...overrides,
});

export const fakeContactPanel = (
  overrides: Partial<InboxContactPanel> = {},
): InboxContactPanel => ({
  contact: {
    id: 'ct1',
    name: 'Asha Verma',
    phoneE164: '+919000077001',
    email: null,
    tags: ['vip'],
    lists: [{ id: 'l1', name: 'EMI due' }],
    variables: { city: 'Jaipur' },
    dnd: false,
    optedOutAt: null,
    deleted: false,
    whatsapp: { profileName: 'Asha', lastInboundAt: AT, blocked: false },
  },
  recentCalls: [
    { id: 'call1', status: 'completed', at: AT, durationSec: 64, disposition: 'interested' },
  ],
  callPermission: null,
  otherConversations: [],
  ...overrides,
});

export const fakeUpload = (overrides: Partial<InboxUpload> = {}): InboxUpload => ({
  mediaToken: 'up1',
  kind: 'image',
  mimeType: 'image/jpeg',
  size: 2048,
  fileName: 'photo.jpg',
  durationSec: null,
  voice: false,
  expiresAt: '2026-10-23T09:00:00.000Z',
  ...overrides,
});

export const fakeBusinessProfile = (
  overrides: Partial<WhatsAppBusinessProfile> = {},
): WhatsAppBusinessProfile => ({
  about: 'Loans made simple',
  address: 'MI Road, Jaipur',
  description: 'Demo Finance',
  email: 'support@example.com',
  profilePictureUrl: null,
  websites: ['https://example.com'],
  vertical: 'FINANCE',
  ...overrides,
});
