import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import type * as ContactsModule from '@/services/api/contacts';
import { contactsApi } from '@/services/api/contacts';
import { ApiError } from '@/services/api/errors';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi } from '@/services/api/inbox';
import type { Contact, InboxConversationDetail, InboxMessage } from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import {
  fakeConversationDetail,
  fakeInboxConfig,
  fakeMessage,
  fakeOutgoing,
  fakeUpload,
} from '@/test/inbox';
import { renderWithProviders } from '@/test/render';

import { Composer } from './Composer';
import { readDraft, saveDraft } from './drafts';
import { geoErrorMessage, kindFor, kindForPaste } from './helpers';

vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: { config: vi.fn(), send: vi.fn(), upload: vi.fn(), typing: vi.fn() },
}));
vi.mock('@/services/api/contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof ContactsModule>()),
  contactsApi: { list: vi.fn() },
}));
const api = vi.mocked(inboxApi);
const contacts = vi.mocked(contactsApi);

const HOUR = 3_600_000;
const openConv = (over: Partial<InboxConversationDetail> = {}) =>
  fakeConversationDetail({
    windowExpiresAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    ...over,
  });

const show = (
  conversation = openConv(),
  props: { replyTo?: InboxMessage | null; onClearReply?: () => void } = {},
) => {
  const onClearReply = props.onClearReply ?? vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <Composer
            conversation={conversation}
            replyTo={props.replyTo ?? null}
            onClearReply={onClearReply}
          />
        ),
      },
    ],
  });
  return { onClearReply };
};
const box = () => screen.getByRole('textbox', { name: 'Message' });
const lastBody = () => api.send.mock.calls.at(-1)?.[1];
const UUID = /^[0-9a-f-]{36}$/;
const anyId = expect.stringMatching(UUID) as unknown as string;
const revokeUrl = vi.fn();
const contact = (id: string, name: string | null): Contact =>
  ({ id, name, phoneE164: `+91900000${id.padStart(4, '0')}` }) as Contact;

beforeEach(() => {
  signInAs('agent');
  saveDraft('cv1', '');
  saveDraft('cv2', '');
  api.config.mockResolvedValue(fakeInboxConfig());
  api.send.mockImplementation((_id, body) =>
    Promise.resolve(
      fakeOutgoing('accepted', { id: `srv-${body.clientId}`, clientId: body.clientId }),
    ),
  );
  api.typing.mockResolvedValue({ sent: true });
  api.upload.mockImplementation(({ kind, onProgress }) => {
    onProgress?.(60);
    return Promise.resolve(fakeUpload({ kind, mediaToken: `tok-${kind}` }));
  });
  contacts.list.mockResolvedValue({
    success: true,
    data: [contact('1', 'Ravi'), contact('2', null), contact('3', 'Meena')],
    meta: { page: 1, limit: 20, total: 3, totalPages: 1 },
  });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = revokeUrl;
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('who can write, and when', () => {
  it('viewers and impersonators only read', () => {
    signInAs('viewer');
    show();
    expect(screen.getByText('You can read this conversation but not reply')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });

  it('impersonating: read only', () => {
    signInAs('owner');
    useAuthStore.getState().startImpersonation(
      fakeSession('owner', {
        impersonation: { impersonatorId: 'sa', expiresAt: '2030-01-01T00:00:00Z' },
      }),
    );
    show();
    expect(screen.getByText('You can read this conversation but not reply')).toBeInTheDocument();
  });

  it('blocked customer: no composer', () => {
    show(openConv({ blocked: true }));
    expect(screen.getByText(/You blocked this customer/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });

  it('number not ready: banner with a link to Numbers', () => {
    show(openConv({ channel: null }));
    expect(screen.getByText(/isn't ready to send messages/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Numbers' })).toHaveAttribute(
      'href',
      '/whatsapp/numbers',
    );
  });

  it('window closed: banner, notes still possible, back to the banner', async () => {
    show(openConv({ windowExpiresAt: new Date(Date.now() - HOUR).toISOString() }));
    expect(screen.getByText(/The 24-hour window is closed\./)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Write an internal note' }));
    expect(screen.getByText(/The 24-hour window is closed\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach' })).toBeNull();
    await userEvent.type(box(), 'Called them{Enter}');
    await waitFor(() =>
      expect(lastBody()).toEqual({
        clientId: anyId,
        type: 'note',
        text: 'Called them',
      }),
    );
    expect(api.typing).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Internal note' }));
    expect(screen.getByRole('button', { name: 'Write an internal note' })).toBeInTheDocument();
  });

  it('opted out: banner, replies still allowed', () => {
    const base = openConv();
    show({ ...base, contact: { ...base.contact, optedOut: true } });
    expect(screen.getByText('This customer opted out — replies only')).toBeInTheDocument();
    expect(box()).toBeInTheDocument();
  });

  it('offline: sending is disabled until the browser is back online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    show();
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeDisabled();
    await userEvent.type(box(), 'Hi{Enter}');
    expect(api.send).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    vi.restoreAllMocks();
  });

  it('Templates is enabled (Phase 11 — the dialog is tested in templates/send)', () => {
    show();
    expect(screen.getByRole('button', { name: 'Templates' })).toBeEnabled();
  });
});

describe('layout', () => {
  it('the text box has its own row (tools never squeeze it on a narrow chat)', () => {
    show();
    const row = box().closest('.MuiStack-root') as HTMLElement;
    expect(within(row).queryByRole('button', { name: 'Attach' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Emoji' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
  });
});

describe('text', () => {
  it('Enter sends, Shift+Enter is a new line, IME composition does not send', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
    await userEvent.type(box(), 'Line one{Shift>}{Enter}{/Shift}Line two');
    expect(api.send).not.toHaveBeenCalled();
    expect(api.typing).toHaveBeenCalledWith('cv1');
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(api.send).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(lastBody()).toEqual({
        clientId: anyId,
        type: 'text',
        text: 'Line one\nLine two',
      }),
    );
    expect(box()).toHaveValue('');
    // blank text: nothing to send
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(api.send).toHaveBeenCalledTimes(1);
  });

  it('counter near the limit', async () => {
    api.config.mockResolvedValue(fakeInboxConfig({ limits: { textMax: 10 } }));
    show();
    await userEvent.type(box(), '12345678');
    expect(screen.queryByText('8 / 10')).toBeNull();
    await userEvent.type(box(), '9');
    expect(await screen.findByText('9 / 10')).toBeInTheDocument();
  });

  it('drafts stay per conversation', async () => {
    saveDraft('cv1', 'Half written');
    show();
    expect(box()).toHaveValue('Half written');
    await userEvent.type(box(), '!');
    expect(readDraft('cv1')).toBe('Half written!');
    expect(readDraft('cv2')).toBe('');
  });

  it('a failed send explains why (and can be dismissed)', async () => {
    api.send.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'WHATSAPP_WINDOW_CLOSED',
        message: 'x',
        kind: 'http',
        details: [],
      }),
    );
    show();
    await userEvent.type(box(), 'Hello{Enter}');
    expect(
      await screen.findByText(/You can reply when the customer writes again/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/You can reply when the customer writes again/)).toBeNull();
  });

  it('reply-to bar: quote, sends replyToMessageId, cancel', async () => {
    const { onClearReply } = show(openConv(), { replyTo: fakeMessage('text', { id: 'q1' }) });
    const bar = screen.getByLabelText('Replying to');
    expect(within(bar).getByText('Replying to the customer')).toBeInTheDocument();
    expect(within(bar).getByText(/EMI ki date/)).toBeInTheDocument();
    await userEvent.type(box(), 'Sure{Enter}');
    await waitFor(() => expect(lastBody()).toMatchObject({ type: 'text', replyToMessageId: 'q1' }));
    expect(onClearReply).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onClearReply).toHaveBeenCalledTimes(2);
  });

  it('reply to our own media message; notes never reply', async () => {
    show(openConv(), { replyTo: fakeOutgoing('read', { text: null, type: 'image' }) });
    expect(screen.getByText('Replying to your message')).toBeInTheDocument();
    expect(screen.getByText('image')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Internal note' }));
    expect(screen.queryByLabelText('Replying to')).toBeNull();
    await userEvent.type(box(), 'Note{Enter}');
    await waitFor(() =>
      expect(lastBody()).toEqual({
        clientId: anyId,
        type: 'note',
        text: 'Note',
      }),
    );
  });
});

describe('emoji', () => {
  it('inserts at the cursor and remembers recent ones', async () => {
    window.localStorage.removeItem('cav.inbox.recentEmojis');
    show();
    await userEvent.type(box(), 'Hi there');
    (box() as HTMLTextAreaElement).setSelectionRange(2, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Emoji' }));
    const picker = await screen.findByRole('dialog', { name: 'Emoji' });
    expect(within(picker).queryByText('Recent')).toBeNull();
    await userEvent.click(within(picker).getByRole('button', { name: '🙏' }));
    expect(box()).toHaveValue('Hi🙏 there');
    await userEvent.click(screen.getByRole('button', { name: 'Emoji' }));
    const again = await screen.findByRole('dialog', { name: 'Emoji' });
    expect(within(again).getByText('Recent')).toBeInTheDocument();
    await userEvent.click(within(again).getAllByRole('button', { name: '👍' })[0] as HTMLElement);
    expect(JSON.parse(window.localStorage.getItem('cav.inbox.recentEmojis') ?? '[]')).toEqual([
      '👍',
      '🙏',
    ]);
  });

  it('blocked storage still works', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('not json');
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Emoji' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Emoji' })).getByRole('button', {
        name: '👍',
      }),
    );
    expect(box()).toHaveValue('👍');
    vi.restoreAllMocks();
  });

  it('a stored list that is not an array is ignored', async () => {
    window.localStorage.setItem('cav.inbox.recentEmojis', '{"a":1}');
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Emoji' }));
    expect(
      within(await screen.findByRole('dialog', { name: 'Emoji' })).queryByText('Recent'),
    ).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Emoji' })).toBeNull());
  });
});

describe('attachments', () => {
  const pick = async (choice: string, file: File) => {
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }));
    await userEvent.click(screen.getByRole('menuitem', { name: choice }));
    await userEvent.upload(screen.getByLabelText('Choose a file'), file);
  };

  it('photo: preview, caption, progress, send', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Photo or video',
      'Audio',
      'Document',
      'Sticker',
    ]);
    await userEvent.keyboard('{Escape}');
    const photo = new File(['x'.repeat(2048)], 'photo.jpg', { type: 'image/jpeg' });
    await pick('Photo or video', photo);
    expect(screen.getByLabelText('Choose a file')).toHaveAttribute(
      'accept',
      expect.stringContaining('video/mp4'),
    );
    const card = screen.getByLabelText('Attachment');
    expect(within(card).getByRole('img', { name: 'Attachment preview' })).toHaveAttribute(
      'src',
      'blob:preview',
    );
    expect(within(card).getByText('photo.jpg')).toBeInTheDocument();
    expect(within(card).getByText('2 KB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach' })).toBeNull();
    await userEvent.type(
      within(card).getByRole('textbox', { name: 'Caption (optional)' }),
      ' Chart ',
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(lastBody()).toEqual({
        clientId: anyId,
        mediaToken: 'tok-image',
        type: 'image',
        caption: 'Chart',
      }),
    );
    expect(api.upload).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'photo.jpg', kind: 'image' }),
    );
    expect(screen.queryByLabelText('Attachment')).toBeNull();
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview');
  });

  it('video preview; document with caption + name; audio and sticker without caption', async () => {
    show();
    await pick('Photo or video', new File(['v'], 'clip.mp4', { type: 'video/mp4' }));
    expect(screen.getByLabelText('Attachment preview').tagName).toBe('VIDEO');
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Send' }),
    );
    await waitFor(() => expect(lastBody()).toMatchObject({ type: 'video', caption: null }));

    await pick('Document', new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' }));
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(lastBody()).toMatchObject({
        type: 'document',
        fileName: 'statement.pdf',
        caption: null,
      }),
    );

    await pick('Audio', new File(['a'], 'song.mp3', { type: 'audio/mpeg' }));
    expect(screen.queryByRole('textbox', { name: 'Caption (optional)' })).toBeNull();
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(lastBody()).toMatchObject({ type: 'audio', mediaToken: 'tok-audio' }),
    );

    await pick('Sticker', new File(['s'], 'smile.webp', { type: 'image/webp' }));
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(lastBody()).toMatchObject({ type: 'sticker', mediaToken: 'tok-sticker' }),
    );
  });

  it('a reply carries replyToMessageId on media too', async () => {
    show(openConv(), { replyTo: fakeMessage('text', { id: 'q9' }) });
    await pick('Document', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(lastBody()).toMatchObject({ type: 'document', replyToMessageId: 'q9' }),
    );
  });

  it('client checks: wrong type, too large; an empty pick does nothing', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Choose a file'), { target: { files: [] } });
    expect(screen.queryByLabelText('Attachment')).toBeNull();
    await userEvent.upload(
      screen.getByLabelText('Choose a file'),
      new File(['g'], 'a.gif', { type: 'image/gif' }),
      {
        applyAccept: false,
      },
    );
    expect(
      await screen.findByText("WhatsApp doesn't accept this type of file here."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sticker' }));
    await userEvent.upload(
      screen.getByLabelText('Choose a file'),
      new File(['s'.repeat(200 * 1024)], 'big.webp', { type: 'image/webp' }),
    );
    expect(await screen.findByText('This file is too large for WhatsApp.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Attachment')).toBeNull();
  });

  it('server errors, cancel during upload, cancel before sending', async () => {
    api.upload.mockRejectedValueOnce(
      new ApiError({
        status: 413,
        code: 'WHATSAPP_MEDIA_TOO_LARGE',
        message: 'x',
        kind: 'http',
        details: [],
      }),
    );
    show();
    await pick('Document', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Send' }),
    );
    expect(await screen.findByText('This file is too large for WhatsApp.')).toBeInTheDocument();

    let reject!: (e: unknown) => void;
    api.upload.mockImplementationOnce(({ onProgress }) => {
      onProgress?.(30);
      return new Promise((_r, rej) => (reject = rej));
    });
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Send' }),
    );
    expect(await screen.findByLabelText('Upload progress')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Cancel' }),
    );
    await act(async () => {
      reject(
        new ApiError({
          status: 0,
          code: 'CANCELED',
          message: 'Canceled',
          kind: 'canceled',
          details: [],
        }),
      );
      await Promise.resolve();
    });
    expect(screen.queryByLabelText('Attachment')).toBeNull();
    expect(screen.queryByText('Canceled')).toBeNull();
    expect(api.send).not.toHaveBeenCalled();
  });

  it('pasting a file attaches it; not in note mode; plain paste is text', async () => {
    show();
    fireEvent.paste(box(), {
      clipboardData: { files: [new File(['i'], 'shot.png', { type: 'image/png' })] },
    });
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByLabelText('Attachment')).getByRole('button', { name: 'Cancel' }),
    );
    fireEvent.paste(box(), { clipboardData: { files: [] } });
    expect(screen.queryByLabelText('Attachment')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Internal note' }));
    fireEvent.paste(box(), {
      clipboardData: { files: [new File(['i'], 'shot.png', { type: 'image/png' })] },
    });
    expect(screen.queryByLabelText('Attachment')).toBeNull();
  });
});

describe('location', () => {
  it('typed coordinates with validation; name / address optional', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Location' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send a location' });
    const sendBtn = within(dialog).getByRole('button', { name: 'Send location' });
    expect(sendBtn).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Latitude' }), '95');
    expect(within(dialog).getByText('−90 to 90')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Latitude' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Latitude' }), '26.9');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Longitude' }), 'abc');
    expect(within(dialog).getByText('−180 to 180')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Longitude' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Longitude' }), '75.8');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Name (optional)' }),
      ' Branch ',
    );
    await userEvent.click(sendBtn);
    await waitFor(() =>
      expect(lastBody()).toEqual({
        clientId: anyId,
        type: 'location',
        latitude: 26.9,
        longitude: 75.8,
        name: 'Branch',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Use my location": success fills the fields; errors explained; cancel', async () => {
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((ok: PositionCallback) =>
        ok({ coords: { latitude: 26.912345678, longitude: 75.787 } } as GeolocationPosition),
      )
      .mockImplementationOnce((_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
      );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Location' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send a location' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use my location' }));
    expect(within(dialog).getByRole('textbox', { name: 'Latitude' })).toHaveValue('26.912346');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Address (optional)' }),
      'MI Road',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use my location' }));
    expect(within(dialog).getByText(/Location access is blocked/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send location' }));
    await waitFor(() => expect(lastBody()).toMatchObject({ type: 'location', address: 'MI Road' }));
  });

  it('while finding the location the button waits', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn() },
    });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Location' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send a location' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use my location' }));
    expect(within(dialog).getByRole('button', { name: 'Finding you…' })).toBeDisabled();
  });

  it('a browser without geolocation; cancel', async () => {
    // jsdom has no geolocation
    Reflect.deleteProperty(navigator, 'geolocation');
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Location' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send a location' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use my location' }));
    expect(within(dialog).getByText("This browser can't share your location.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('geolocation error texts', () => {
    expect(geoErrorMessage(2)).toMatch(/not available/);
    expect(geoErrorMessage(3)).toMatch(/too long/);
  });
});

describe('contact cards', () => {
  it('search, pick (up to the limit), send', async () => {
    api.config.mockResolvedValue(fakeInboxConfig({ limits: { contactsMax: 2 } }));
    show();
    await screen.findByRole('button', { name: 'Contact card' });
    await waitFor(() => expect(api.config).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Contact card' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share contact cards' });
    await within(dialog).findByText('Ravi');
    expect(within(dialog).getByRole('button', { name: 'Send card' })).toBeDisabled();
    await userEvent.click(within(dialog).getByText('Ravi'));
    await userEvent.click(within(dialog).getAllByText(/00002/)[0] as HTMLElement);
    expect(within(dialog).getByText('2 of 2 selected')).toBeInTheDocument();
    expect(within(dialog).getByText('Meena').closest('[role="button"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // unpick + pick again
    await userEvent.click(within(dialog).getByText('Ravi'));
    await userEvent.click(within(dialog).getByText('Ravi'));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Search contacts' }), 'ra');
    await waitFor(() => expect(contacts.list).toHaveBeenLastCalledWith({ q: 'ra', limit: 20 }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send 2 cards' }));
    await waitFor(() =>
      expect(lastBody()).toMatchObject({ type: 'contacts', contactIds: ['2', '1'] }),
    );
  });

  it('no contacts; errors; cancel', async () => {
    contacts.list.mockResolvedValueOnce({
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Contact card' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share contact cards' });
    expect(await within(dialog).findByText('No contacts found.')).toBeInTheDocument();
    contacts.list.mockRejectedValueOnce(
      new ApiError({
        status: 500,
        code: 'INTERNAL',
        message: 'Search failed',
        kind: 'http',
        details: [],
      }),
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Search contacts' }), 'zz');
    expect(await within(dialog).findByText('Search failed')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('helpers', () => {
  it('kinds for picked and pasted files', () => {
    expect(kindFor('media', { type: 'video/mp4' })).toBe('video');
    expect(kindFor('media', { type: 'image/png' })).toBe('image');
    expect(kindFor('audio', { type: 'audio/mpeg' })).toBe('audio');
    expect(kindForPaste({ type: 'image/webp' })).toBe('sticker');
    expect(kindForPaste({ type: 'video/mp4' })).toBe('video');
    expect(kindForPaste({ type: 'audio/ogg' })).toBe('audio');
    expect(kindForPaste({ type: 'application/pdf' })).toBe('document');
  });
});
