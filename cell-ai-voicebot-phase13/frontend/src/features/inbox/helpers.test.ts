import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type { ConversationPage, MessagePage } from '@/services/api/inbox';
import type { InboxConversation, InboxMessage, InboxSendMessage } from '@/services/api/types';
import {
  fakeConversation,
  fakeConversationDetail,
  fakeInboxConfig,
  fakeMessage,
  fakeOutgoing,
} from '@/test/inbox';

import {
  dayLabel,
  formatBytes,
  formatDuration,
  initials,
  linkify,
  listTimeLabel,
  mapsUrl,
  maskPhone,
  timeLabel,
  windowLabel,
  windowState,
} from './format';
import { inboxKeys } from './keys';
import {
  INBOX_TABS,
  inboxErrorMessage,
  isPending,
  messageTypeLabel,
  NOTIFY_MODE_LABELS,
  originLabel,
  previewPrefix,
  statusLabel,
  systemText,
  tabQuery,
  tickKind,
} from './labels';
import { checkUpload, DEFAULT_INBOX_LIMITS, maxBytesFor, resolveLimits } from './limits';
import {
  applyUpdate,
  bodyFor,
  buildOptimistic,
  canMoveTo,
  findMessage,
  flattenMessages,
  forgetBody,
  hasConversation,
  hasPendingOutgoing,
  isOptimistic,
  markRowRead,
  patchConversationRow,
  rememberBody,
  replaceMessage,
  sortConversations,
  storeConversationRow,
  upsertMessage,
  type ConversationsData,
  type MessagesData,
} from './optimistic';

const TZ = 'Asia/Kolkata';
const NOW = Date.parse('2026-10-22T12:00:00+05:30');

const messagePage = (data: InboxMessage[], olderCursor: string | null = null): MessagePage => ({
  success: true,
  data,
  meta: { olderCursor, hasNewer: false },
});
const messages = (...pages: InboxMessage[][]): MessagesData => ({
  pages: pages.map((p) => messagePage(p)),
  pageParams: pages.map((_, i) => (i ? `c${i}` : '')),
});
const convPage = (data: InboxConversation[]): ConversationPage => ({
  success: true,
  data,
  meta: { nextCursor: null },
});
const conversations = (...pages: InboxConversation[][]): ConversationsData => ({
  pages: pages.map(convPage),
  pageParams: pages.map((_, i) => (i ? `c${i}` : '')),
});
const at = (iso: string, m: InboxMessage): InboxMessage => ({ ...m, at: iso });
const row = (id: string, lastAt: string | null, extra: Partial<InboxConversation> = {}) =>
  fakeConversation({
    id,
    lastMessage: lastAt
      ? {
          id: `m_${id}`,
          direction: 'in',
          type: 'text',
          preview: 'x',
          at: lastAt,
          status: 'received',
        }
      : null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  });
const httpError = (code: string, details: ApiError['details'] = [], message = 'Server text') =>
  new ApiError({ status: 409, code, message, kind: 'http', details });

describe('keys', () => {
  it('lists include filters; messages include the jump target', () => {
    expect(inboxKeys.list({ status: 'open', filter: 'mine' })).toEqual([
      'inbox',
      'conversations',
      { status: 'open', filter: 'mine' },
    ]);
    expect(inboxKeys.messages('c1')).toEqual(['inbox', 'messages', 'c1', 'latest']);
    expect(inboxKeys.messages('c1', 'm9')).toEqual(['inbox', 'messages', 'c1', 'm9']);
    expect(inboxKeys.messagesOf('c1')).toEqual(['inbox', 'messages', 'c1']);
    expect(inboxKeys.conversation('c1')).toEqual(['inbox', 'conversation', 'c1']);
    expect(inboxKeys.contact('c1')).toEqual(['inbox', 'contact', 'c1']);
    expect(inboxKeys.mediaLink('m1')).toEqual(['inbox', 'media', 'm1']);
  });
});

describe('limits', () => {
  it('server limits override the defaults; unknown / non-number keys ignored', () => {
    expect(resolveLimits(undefined)).toEqual(DEFAULT_INBOX_LIMITS);
    const config = fakeInboxConfig();
    config.limits = { textMax: 100, unknown: 5 };
    const limits = resolveLimits(config);
    expect(limits.textMax).toBe(100);
    expect(limits.captionMax).toBe(1024);
    expect(limits).not.toHaveProperty('unknown');
  });

  it('max bytes per kind', () => {
    const l = DEFAULT_INBOX_LIMITS;
    expect(maxBytesFor('image', l)).toBe(5 * 1024 * 1024);
    expect(maxBytesFor('video', l)).toBe(16 * 1024 * 1024);
    expect(maxBytesFor('sticker', l)).toBe(100 * 1024);
    expect(maxBytesFor('document', l)).toBe(100 * 1024 * 1024);
    expect(maxBytesFor('audio', l)).toBe(16 * 1024 * 1024);
    expect(maxBytesFor('voice', l)).toBe(16 * 1024 * 1024);
  });

  it('checks type and size before uploading', () => {
    const l = DEFAULT_INBOX_LIMITS;
    const ok = (type: string, kind: Parameters<typeof checkUpload>[1], size = 10) =>
      checkUpload({ type, size }, kind, l);
    expect(ok('', 'document')).toBeNull();
    expect(ok('image/jpeg', 'image')).toBeNull();
    expect(ok('image/png', 'image')).toBeNull();
    expect(ok('image/gif', 'image')).toMatch(/doesn't accept/);
    expect(ok('image/webp', 'sticker')).toBeNull();
    expect(ok('image/png', 'sticker')).toMatch(/doesn't accept/);
    expect(ok('video/mp4', 'video')).toBeNull();
    expect(ok('audio/mpeg', 'video')).toMatch(/doesn't accept/);
    expect(ok('audio/mpeg', 'audio')).toBeNull();
    expect(ok('audio/webm;codecs=opus', 'voice')).toBeNull();
    expect(ok('application/pdf', 'document')).toBeNull();
    expect(ok('image/png', 'document')).toMatch(/doesn't accept/);
    expect(ok('application/pdf', 'document', 0)).toBe('This file is empty.');
    expect(ok('image/webp', 'sticker', 200 * 1024)).toBe('This file is too large for WhatsApp.');
  });
});

describe('format', () => {
  it('window state + label', () => {
    expect(windowState(null, NOW)).toEqual({ open: false, remainingLabel: '', remainingMs: 0 });
    expect(windowState('not a date', NOW).open).toBe(false);
    expect(windowState(new Date(NOW - 1).toISOString(), NOW).open).toBe(false);
    const h = windowState(new Date(NOW + (3 * 60 + 12) * 60_000 + 5_000).toISOString(), NOW);
    expect(h).toMatchObject({ open: true, remainingLabel: '3 h 12 m' });
    expect(windowState(new Date(NOW + 45 * 60_000 + 1).toISOString(), NOW).remainingLabel).toBe(
      '45 m',
    );
    expect(windowState(new Date(NOW + 30_000).toISOString(), NOW).remainingLabel).toBe('< 1 m');
    expect(windowLabel(h)).toBe('Open · 3 h 12 m left');
    expect(windowLabel(windowState(null))).toBe('Closed');
    // default "now"
    expect(windowState(new Date(Date.now() + 2 * 3_600_000).toISOString()).open).toBe(true);
  });

  it('masked phone keeps the country code and last four digits only', () => {
    expect(maskPhone('+919000077001')).toBe('+91 ••••• 7001');
    expect(maskPhone('919000077001')).toBe('+91 ••••• 7001');
    expect(maskPhone('+12')).toBe('••••');
    expect(maskPhone('+0000001234')).toBe('••••• 1234');
  });

  it('durations, sizes, initials, maps links', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(42.4)).toBe('0:42');
    expect(formatDuration(725)).toBe('12:05');
    expect(formatDuration(-3)).toBe('0:00');
    expect(formatBytes(245_760)).toBe('240 KB');
    expect(initials('Asha Verma')).toBe('AV');
    expect(initials('asha kumari verma')).toBe('AK');
    expect(initials('Asha')).toBe('A');
    expect(initials('+91 ••••• 7001')).toBe('#');
    expect(initials('   ')).toBe('#');
    expect(mapsUrl(26.9124, 75.7873)).toBe(
      'https://www.google.com/maps/search/?api=1&query=26.912400,75.787300',
    );
  });

  it('day / time labels in the account timezone', () => {
    expect(dayLabel('2026-10-22T06:00:00.000Z', TZ, NOW)).toBe('Today');
    expect(dayLabel('2026-10-21T06:00:00.000Z', TZ, NOW)).toBe('Yesterday');
    expect(dayLabel('2026-10-05T06:00:00.000Z', TZ, NOW)).toBe('05 Oct 2026');
    // 20:00 UTC on the 21st is the 22nd in India
    expect(dayLabel('2026-10-21T20:00:00.000Z', TZ, NOW)).toBe('Today');
    expect(timeLabel('2026-10-22T08:35:00.000Z', TZ)).toBe('14:05');
    expect(listTimeLabel('2026-10-22T08:35:00.000Z', TZ, NOW)).toBe('14:05');
    expect(listTimeLabel('2026-10-21T08:35:00.000Z', TZ, NOW)).toBe('Yesterday');
    expect(listTimeLabel('2026-10-05T08:35:00.000Z', TZ, NOW)).toBe('05 Oct');
    expect(typeof dayLabel(new Date().toISOString(), TZ)).toBe('string');
    expect(typeof listTimeLabel(new Date().toISOString(), TZ)).toBe('string');
  });

  it('links only http(s); trailing punctuation stays text', () => {
    expect(linkify('no links here')).toEqual([{ text: 'no links here' }]);
    expect(linkify('Pay at https://pay.example.com/x?a=1). Thanks')).toEqual([
      { text: 'Pay at ' },
      { text: 'https://pay.example.com/x?a=1', href: 'https://pay.example.com/x?a=1' },
      { text: '). Thanks' },
    ]);
    expect(linkify('http://a.example and https://b.example')).toEqual([
      { text: 'http://a.example', href: 'http://a.example' },
      { text: ' and ' },
      { text: 'https://b.example', href: 'https://b.example' },
    ]);
    expect(linkify('javascript:alert(1) <script>x</script>')).toEqual([
      { text: 'javascript:alert(1) <script>x</script>' },
    ]);
    expect(linkify('data:text/html,hi ftp://x.example')).toHaveLength(1);
  });
});

describe('labels', () => {
  it('tabs → list queries', () => {
    expect(INBOX_TABS.map((t) => t.label)).toEqual([
      'All',
      'Unread',
      'Mine',
      'Unassigned',
      'Closed',
    ]);
    expect(tabQuery('closed')).toEqual({ status: 'closed', filter: 'all' });
    expect(tabQuery('mine')).toEqual({ status: 'open', filter: 'mine' });
  });

  it('types, previews, ticks, statuses, origins, notify modes', () => {
    expect(messageTypeLabel('audio', { voice: true })).toBe('Voice note');
    expect(messageTypeLabel('audio', { voice: false })).toBe('Audio');
    expect(messageTypeLabel('audio')).toBe('Audio');
    expect(messageTypeLabel('contacts')).toBe('Contact card');
    expect(previewPrefix({ direction: 'out', type: 'note' })).toBe('Note: ');
    expect(previewPrefix({ direction: 'out', type: 'text' })).toBe('You: ');
    expect(previewPrefix({ direction: 'in', type: 'text' })).toBe('');
    expect(
      (
        [
          'queued',
          'accepted',
          'sent',
          'delivered',
          'read',
          'failed',
          'received',
          'deleted',
        ] as const
      ).map(tickKind),
    ).toEqual(['clock', 'clock', 'sent', 'delivered', 'read', 'failed', null, null]);
    expect(statusLabel('read')).toBe('Read');
    expect(statusLabel('failed')).toBe('Failed');
    expect(statusLabel('queued')).toBe('Queued');
    expect(statusLabel('accepted')).toBe('Queued');
    expect(isPending('queued')).toBe(true);
    expect(isPending('accepted')).toBe(true);
    expect(isPending('sent')).toBe(false);
    expect(originLabel('business_app')).toMatch(/Business app/);
    expect(originLabel('history')).toBe('Imported history');
    expect(originLabel('system')).toBe('Automatic reply');
    expect(originLabel('agent')).toBeNull();
    expect(originLabel('customer')).toBeNull();
    expect(Object.keys(NOTIFY_MODE_LABELS)).toEqual(['assigned_or_all', 'assigned_only', 'off']);
  });

  it('system lines', () => {
    expect(systemText({ kind: 'customer_changed_number', newWaIdLast4: '7001' })).toMatch(/7001/);
    expect(systemText({ kind: 'user_changed_number', newWaIdLast4: null })).toBe(
      'The customer changed their number.',
    );
    expect(systemText({ kind: 'customer_identity_changed', newWaIdLast4: null })).toMatch(
      /security code/,
    );
    expect(systemText({ kind: 'other', newWaIdLast4: null })).toMatch(/update/);
    expect(systemText(null)).toMatch(/update/);
  });

  it('error messages', () => {
    expect(inboxErrorMessage(httpError('WHATSAPP_WINDOW_CLOSED'))).toMatch(/window is closed/);
    expect(inboxErrorMessage(httpError('WHATSAPP_RECIPIENT_BLOCKED'))).toMatch(/Unblock/);
    expect(inboxErrorMessage(httpError('WHATSAPP_CHANNEL_NOT_READY'))).toMatch(/Numbers page/);
    expect(inboxErrorMessage(httpError('WHATSAPP_NOT_CONFIGURED'))).toMatch(/isn't set up/);
    expect(inboxErrorMessage(httpError('WHATSAPP_MEDIA_TOO_LARGE'))).toMatch(/too large/);
    expect(
      inboxErrorMessage(
        httpError('WHATSAPP_MEDIA_INVALID', [{ path: 'file', message: 'type_mismatch' }]),
      ),
    ).toMatch(/doesn't match/);
    expect(
      inboxErrorMessage(
        httpError('WHATSAPP_MEDIA_INVALID', [{ path: 'file', message: 'not_allowed' }]),
      ),
    ).toMatch(/doesn't accept/);
    expect(inboxErrorMessage(httpError('WHATSAPP_MEDIA_INVALID'))).toMatch(/can't be sent/);
    expect(inboxErrorMessage(httpError('INBOX_MEDIA_EXPIRED'))).toMatch(/7 days/);
    expect(inboxErrorMessage(httpError('RATE_LIMITED'))).toMatch(/too fast/);
    expect(inboxErrorMessage(httpError('AUTH_IMPERSONATION_BLOCKED'))).toMatch(/viewing as a user/);
    expect(
      inboxErrorMessage(httpError('META_API_ERROR', [{ path: 'meta', message: 'Bad thing' }])),
    ).toBe('WhatsApp returned an error: Bad thing');
    expect(inboxErrorMessage(httpError('META_API_ERROR'))).toMatch(/Try again/);
    expect(inboxErrorMessage(httpError('SOMETHING_ELSE'))).toBe('Server text');
  });
});

describe('status order (same as the backend)', () => {
  it('forward only, failed rules, deleted for inbound only', () => {
    expect(canMoveTo('sent', 'sent', 'out')).toBe(false);
    expect(canMoveTo('received', 'deleted', 'in')).toBe(true);
    expect(canMoveTo('deleted', 'received', 'in')).toBe(false);
    expect(canMoveTo('received', 'read', 'in')).toBe(false);
    expect(canMoveTo('sent', 'deleted', 'out')).toBe(false);
    expect(canMoveTo('sent', 'received', 'out')).toBe(false);
    expect(canMoveTo('sent', 'failed', 'out')).toBe(true);
    expect(canMoveTo('queued', 'failed', 'out')).toBe(true);
    expect(canMoveTo('delivered', 'failed', 'out')).toBe(false);
    expect(canMoveTo('received', 'failed', 'out')).toBe(false);
    expect(canMoveTo('failed', 'sent', 'out')).toBe(false);
    expect(canMoveTo('failed', 'delivered', 'out')).toBe(true);
    expect(canMoveTo('queued', 'accepted', 'out')).toBe(true);
    expect(canMoveTo('read', 'delivered', 'out')).toBe(false);
    expect(canMoveTo('received', 'sent', 'out')).toBe(false);
  });
});

describe('optimistic bubbles', () => {
  const sender = { id: 'u1', name: 'Asha Verma' };
  const now = new Date('2026-10-22T09:00:00.000Z');
  type Draft<T> = T extends unknown ? Omit<T, 'clientId'> : never;
  const build = (body: Draft<InboxSendMessage>) =>
    buildOptimistic('c1', { clientId: 'k1', ...body }, sender, now);

  it('remembers bodies for a local retry', () => {
    const body: InboxSendMessage = { clientId: 'k9', type: 'text', text: 'Hi' };
    rememberBody(body);
    expect(bodyFor('k9')).toBe(body);
    expect(bodyFor(null)).toBeUndefined();
    forgetBody('k9');
    expect(bodyFor('k9')).toBeUndefined();
  });

  it('builds a queued bubble for every type', () => {
    const text = build({ type: 'text', text: 'Hi' });
    expect(text).toMatchObject({
      id: 'tmp_k1',
      type: 'text',
      text: 'Hi',
      status: 'queued',
      direction: 'out',
      origin: 'agent',
      clientId: 'k1',
      sentBy: sender,
      at: now.toISOString(),
      media: null,
      interactive: null,
    });
    expect(isOptimistic(text)).toBe(true);
    expect(isOptimistic(fakeMessage())).toBe(false);
    expect(build({ type: 'note', text: 'Internal' })).toMatchObject({
      type: 'note',
      status: 'sent',
    });
    expect(build({ type: 'image', mediaToken: 't', caption: ' Chart ' })).toMatchObject({
      type: 'image',
      text: 'Chart',
      media: { voice: false, fileName: null },
    });
    expect(build({ type: 'video', mediaToken: 't' }).text).toBeNull();
    expect(
      build({ type: 'document', mediaToken: 't', fileName: 'a.pdf', caption: '' }),
    ).toMatchObject({ text: null, media: { fileName: 'a.pdf' } });
    expect(build({ type: 'document', mediaToken: 't' }).media?.fileName).toBeNull();
    expect(build({ type: 'voice', mediaToken: 't' })).toMatchObject({
      type: 'audio',
      media: { voice: true },
    });
    expect(build({ type: 'sticker', mediaToken: 't' }).type).toBe('sticker');
    expect(
      build({ type: 'location', latitude: 1, longitude: 2, name: ' Branch ', address: '' })
        .location,
    ).toEqual({ latitude: 1, longitude: 2, name: 'Branch', address: null, url: null });
    expect(build({ type: 'location', latitude: 1, longitude: 2 }).location?.name).toBeNull();
    expect(build({ type: 'contacts', contactIds: ['ct1'] }).type).toBe('contacts');
    expect(build({ type: 'reaction', messageId: 'm1', emoji: '👍' }).reaction).toEqual({
      targetMessageId: 'm1',
      emoji: '👍',
    });
    // default "now" + no sender
    expect(
      buildOptimistic('c1', { clientId: 'k2', type: 'text', text: 'x' }, null).sentBy,
    ).toBeNull();
  });

  it('builds the interactive preview', () => {
    const buttons = build({
      type: 'buttons',
      body: 'Pay?',
      footer: ' Demo ',
      header: { type: 'text', text: 'EMI' },
      buttons: [{ id: 'y', title: 'Yes' }],
    });
    expect(buttons.type).toBe('interactive');
    expect(buttons.text).toBeNull();
    expect(buttons.interactive).toMatchObject({
      kind: 'button',
      body: 'Pay?',
      footer: 'Demo',
      header: { type: 'text', text: 'EMI', fileName: null },
      buttons: [{ id: 'y', title: 'Yes' }],
      listButton: null,
      sections: [],
      cta: null,
    });
    expect(
      build({
        type: 'buttons',
        body: 'b',
        header: { type: 'image', mediaToken: 't' },
        buttons: [{ id: 'y', title: 'Yes' }],
      }).interactive?.header,
    ).toEqual({ type: 'image', text: null, fileName: null });
    expect(
      build({ type: 'buttons', body: 'b', buttons: [{ id: 'y', title: 'Yes' }] }).interactive
        ?.header,
    ).toBeNull();
    expect(
      build({ type: 'buttons', body: 'b', header: null, buttons: [] }).interactive?.footer,
    ).toBeNull();
    const list = build({
      type: 'list',
      body: 'Plans',
      header: 'Loans',
      button: 'Open',
      sections: [
        { title: ' Home ', rows: [{ id: 'r1', title: 'R1', description: ' 8.5% ' }] },
        { rows: [{ id: 'r2', title: 'R2' }] },
      ],
    });
    expect(list.interactive).toMatchObject({
      kind: 'list',
      header: { type: 'text', text: 'Loans' },
      listButton: 'Open',
      sections: [
        { title: 'Home', rows: [{ id: 'r1', title: 'R1', description: '8.5%' }] },
        { title: null, rows: [{ id: 'r2', title: 'R2', description: null }] },
      ],
    });
    const cta = build({
      type: 'cta_url',
      body: 'Pay online',
      displayText: 'Pay',
      url: 'https://p.example',
    });
    expect(cta.interactive).toMatchObject({
      kind: 'cta_url',
      header: null,
      cta: { displayText: 'Pay', url: 'https://p.example' },
    });
  });
});

describe('message cache merges', () => {
  const a = at('2026-10-22T09:00:00.000Z', fakeMessage('text', { id: 'a' }));
  const b = at('2026-10-22T09:05:00.000Z', fakeMessage('text', { id: 'b' }));
  const c = at('2026-10-22T09:10:00.000Z', fakeMessage('text', { id: 'c' }));
  const old = at('2026-10-21T09:00:00.000Z', fakeMessage('text', { id: 'old' }));

  it('flattens oldest → newest; pending detection', () => {
    expect(flattenMessages(undefined)).toEqual([]);
    expect(flattenMessages(messages([b, c], [old, a])).map((m) => m.id)).toEqual([
      'old',
      'a',
      'b',
      'c',
    ]);
    expect(hasPendingOutgoing(undefined)).toBe(false);
    expect(hasPendingOutgoing(messages([a, fakeOutgoing('delivered')]))).toBe(false);
    expect(hasPendingOutgoing(messages([fakeOutgoing('queued')]))).toBe(true);
    expect(hasPendingOutgoing(messages([fakeOutgoing('accepted')]))).toBe(true);
    // an inbound "queued" cannot exist, but direction is checked first
    expect(hasPendingOutgoing(messages([{ ...a, status: 'queued' }]))).toBe(false);
  });

  it('inserts by time, dedupes by id and clientId, never moves a status back', () => {
    expect(upsertMessage(undefined, a)).toBeUndefined();
    const withA = messages([a]);
    expect(upsertMessage(withA, fakeMessage('reaction', { id: 'rx' }))).toBe(withA);
    const empty: MessagesData = { pages: [], pageParams: [] };
    expect(upsertMessage(empty, a)).toBe(empty);
    // out-of-order: b arrives after c → goes between a and c
    const inserted = upsertMessage(messages([a, c]), b);
    expect(flattenMessages(inserted).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    // newest at the end
    expect(flattenMessages(upsertMessage(messages([a]), c)).map((m) => m.id)).toEqual(['a', 'c']);
    // older than everything on the newest page → first
    expect(flattenMessages(upsertMessage(messages([b]), a)).map((m) => m.id)).toEqual(['a', 'b']);

    // duplicate WS event → replaced, not added
    const twice = upsertMessage(messages([a, b]), { ...b, text: 'edited' });
    expect(flattenMessages(twice)).toHaveLength(2);
    expect(findMessage(twice, 'b')?.text).toBe('edited');

    // optimistic bubble replaced by the server message (same clientId)
    const bubble = buildOptimistic('cv1', { clientId: 'k1', type: 'text', text: 'Hi' }, null);
    const real = fakeOutgoing('accepted', { id: 'srv1', clientId: 'k1', at: bubble.at });
    const replaced = upsertMessage(messages([a, bubble]), real);
    expect(flattenMessages(replaced).map((m) => m.id)).toEqual(['a', 'srv1']);

    // a later "delivered" (WS) then the slower POST response "accepted" → stays delivered
    const delivered = { ...real, status: 'delivered' as const };
    const kept = upsertMessage(messages([delivered]), real);
    expect(findMessage(kept, 'srv1')?.status).toBe('delivered');
    // forward move is taken
    expect(findMessage(upsertMessage(messages([real]), delivered), 'srv1')?.status).toBe(
      'delivered',
    );
    // a message without clientId never matches by clientId
    const noClient = { ...c, id: 'n1', clientId: null };
    expect(
      flattenMessages(upsertMessage(messages([{ ...a, clientId: null }]), noClient)),
    ).toHaveLength(2);
    // the same id on two pages: only the first is replaced
    const dup = upsertMessage(messages([b], [b]), { ...b, text: 'x' });
    expect(dup?.pages[0]?.data[0]?.text).toBe('x');
    expect(dup?.pages[1]?.data[0]?.text).toBe(b.text);
  });

  it('replaces by id across pages', () => {
    expect(replaceMessage(undefined, 'a', (m) => m)).toBeUndefined();
    const data = messages([b], [a]);
    const out = replaceMessage(data, 'a', (m) => ({ ...m, text: 'changed' }));
    expect(out?.pages[0]).toBe(data.pages[0]);
    expect(findMessage(out, 'a')?.text).toBe('changed');
    expect(findMessage(out, 'zzz')).toBeUndefined();
  });

  it('applies WS updates monotonically (status, error, media, reactions)', () => {
    const sent = fakeOutgoing('sent');
    const read = applyUpdate(sent, {
      messageId: sent.id,
      status: 'read',
      error: null,
      media: null,
      reactions: [{ emoji: '👍', by: 'customer' }],
    });
    expect(read.status).toBe('read');
    expect(read.statusHistory.map((h) => h.status)).toEqual(['sent', 'read']);
    expect(read.reactions[0]).toMatchObject({ emoji: '👍', by: 'customer' });
    // a late "delivered" never moves read back; known reactions keep their time
    const late = applyUpdate(read, {
      messageId: sent.id,
      status: 'delivered',
      error: null,
      media: null,
      reactions: [{ emoji: '👍', by: 'customer' }],
    });
    expect(late.status).toBe('read');
    expect(late.reactions[0]).toBe(read.reactions[0]);
    // failed with a reason
    const failed = applyUpdate(fakeOutgoing('accepted'), {
      messageId: 'x',
      status: 'failed',
      error: { code: 131047, reason: 'Window closed' },
      media: null,
      reactions: [],
    });
    expect(failed).toMatchObject({ status: 'failed', error: { reason: 'Window closed' } });
    // media status on a media message only
    const image = fakeMessage('image', {
      media: { ...fakeMessage('image').media!, status: 'pending' },
    });
    const ready = applyUpdate(image, {
      messageId: image.id,
      status: 'received',
      error: null,
      media: { status: 'ready' },
      reactions: [],
    });
    expect(ready.media?.status).toBe('ready');
    expect(
      applyUpdate(image, {
        messageId: image.id,
        status: 'received',
        error: null,
        media: null,
        reactions: [],
      }).media?.status,
    ).toBe('pending');
    expect(
      applyUpdate(fakeMessage('text'), {
        messageId: 'm',
        status: 'received',
        error: null,
        media: { status: 'ready' },
        reactions: [],
      }).media,
    ).toBeNull();
  });
});

describe('conversation list cache', () => {
  const r1 = row('r1', '2026-10-22T09:00:00.000Z');
  const r2 = row('r2', '2026-10-22T08:00:00.000Z');
  const r3 = row('r3', null);

  it('sorts by last activity, then id', () => {
    expect(sortConversations([r3, r2, r1]).map((c) => c.id)).toEqual(['r1', 'r2', 'r3']);
    const t = '2026-10-22T09:00:00.000Z';
    expect(sortConversations([row('a', t), row('b', t)]).map((c) => c.id)).toEqual(['b', 'a']);
    expect(sortConversations([row('b', t), row('a', t)]).map((c) => c.id)).toEqual(['b', 'a']);
    expect(sortConversations([row('a', t), row('a', t)])).toHaveLength(2);
  });

  it('knows which rows are cached', () => {
    expect(hasConversation(undefined, 'r1')).toBe(false);
    expect(hasConversation(conversations([r1]), 'r1')).toBe(true);
    expect(hasConversation(conversations([r1]), 'zz')).toBe(false);
  });

  it('patches counters / status / assignee and re-sorts, keeping page sizes', () => {
    expect(
      patchConversationRow(undefined, {
        conversationId: 'r1',
        status: 'open',
        unreadCount: 1,
        assignedTo: null,
        lastMessageAt: null,
        lastMessageDirection: null,
      }),
    ).toBeUndefined();
    const data = conversations([r1, r2], [r3]);
    const moved = patchConversationRow(data, {
      conversationId: 'r2',
      status: 'open',
      unreadCount: 4,
      assignedTo: 'u2',
      lastMessageAt: '2026-10-22T10:00:00.000Z',
      lastMessageDirection: 'in',
    });
    expect(moved?.pages.map((p) => p.data.map((c) => c.id))).toEqual([['r2', 'r1'], ['r3']]);
    const top = moved?.pages[0]?.data[0];
    expect(top).toMatchObject({ unreadCount: 4, assignedTo: { id: 'u2', name: '' } });
    expect(top?.lastMessage?.at).toBe('2026-10-22T10:00:00.000Z');

    // same assignee keeps its name; an older time and no direction keep the last message
    const assigned = row('r4', '2026-10-22T09:30:00.000Z', {
      assignedTo: { id: 'u2', name: 'Ravi' },
    });
    const same = patchConversationRow(conversations([assigned]), {
      conversationId: 'r4',
      status: 'closed',
      unreadCount: 0,
      assignedTo: 'u2',
      lastMessageAt: '2026-10-22T09:00:00.000Z',
      lastMessageDirection: null,
    });
    expect(same?.pages[0]?.data[0]).toMatchObject({
      status: 'closed',
      assignedTo: { id: 'u2', name: 'Ravi' },
      lastMessage: { at: '2026-10-22T09:30:00.000Z' },
    });
    // newer time without a direction keeps the old direction
    const newer = patchConversationRow(conversations([assigned]), {
      conversationId: 'r4',
      status: 'open',
      unreadCount: 0,
      assignedTo: null,
      lastMessageAt: '2026-10-22T11:00:00.000Z',
      lastMessageDirection: null,
    });
    expect(newer?.pages[0]?.data[0]).toMatchObject({
      assignedTo: null,
      lastMessage: { at: '2026-10-22T11:00:00.000Z', direction: 'in' },
    });
    // a row without a last message stays without one
    const none = patchConversationRow(conversations([r3]), {
      conversationId: 'r3',
      status: 'open',
      unreadCount: 1,
      assignedTo: null,
      lastMessageAt: '2026-10-22T11:00:00.000Z',
      lastMessageDirection: 'out',
    });
    expect(none?.pages[0]?.data[0]?.lastMessage).toBeNull();
  });

  it('stores action results and read markers', () => {
    const matched = row('r1', '2026-10-22T09:00:00.000Z', {
      match: { messageId: 'm1', snippet: 'emi' },
    });
    const detail = fakeConversationDetail({ id: 'r1', status: 'closed', match: null });
    const stored = storeConversationRow(conversations([matched, r2]), detail);
    expect(stored?.pages[0]?.data[0]).toMatchObject({
      status: 'closed',
      match: { snippet: 'emi' },
    });
    expect(stored?.pages[0]?.data[1]).toBe(r2);
    const plain = storeConversationRow(conversations([{ ...r1, match: null }]), {
      ...detail,
      match: { messageId: 'm2', snippet: 'new' },
    });
    expect(plain?.pages[0]?.data[0]?.match).toEqual({ messageId: 'm2', snippet: 'new' });
    const noMatch = { ...detail } as InboxConversation;
    delete noMatch.match;
    expect(
      storeConversationRow(conversations([{ ...r1, match: null }]), noMatch)?.pages[0]?.data[0]
        ?.match,
    ).toBeNull();
    expect(
      markRowRead(conversations([{ ...r1, unreadCount: 3 }]), 'r1')?.pages[0]?.data[0]?.unreadCount,
    ).toBe(0);
    expect(markRowRead(conversations([r1, r2]), 'r2', 1)?.pages[0]?.data[1]?.unreadCount).toBe(1);
  });
});
