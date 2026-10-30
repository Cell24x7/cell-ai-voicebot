import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as InboxModule from '@/services/api/inbox';
import { inboxApi } from '@/services/api/inbox';
import type { InboxMessage } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { fakeMessage, fakeOutgoing, fakeOutgoingInteractive } from '@/test/inbox';
import { theme } from '@/theme';

import { MessageBubble, type BubbleProps } from './MessageBubble';
import { StatusTicks } from './StatusTicks';

vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: { mediaLink: vi.fn(), retryMedia: vi.fn() },
}));
const api = vi.mocked(inboxApi);

const TZ = 'Asia/Kolkata';

const renderBubble = (message: InboxMessage, extra: Partial<BubbleProps> = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const props: BubbleProps = {
    message,
    timezone: TZ,
    canReply: true,
    canAssign: true,
    onJump: vi.fn(),
    onRetry: vi.fn(),
    onAddContact: vi.fn(),
    ...extra,
  };
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <MessageBubble {...props} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return props;
};

const media = (status: NonNullable<InboxMessage['media']>['status'], extra = {}) => ({
  ...(fakeMessage('image').media as NonNullable<InboxMessage['media']>),
  status,
  ...extra,
});

beforeEach(() => {
  signInAs('owner');
  api.mediaLink.mockImplementation((id) =>
    Promise.resolve({
      url: `https://files.example/${id}`,
      mimeType: null,
      fileName: null,
      expiresInSec: 300,
    }),
  );
  api.retryMedia.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe('text and labels', () => {
  it('text with links: only http(s) become anchors (new tab, no opener); hostile text stays text', () => {
    renderBubble(
      fakeMessage('text', {
        text: 'Pay https://pay.example.com now <script>alert(1)</script> javascript:alert(2) averyveryverylongwordwithoutanyspaces',
      }),
    );
    const link = screen.getByRole('link', { name: 'https://pay.example.com' });
    expect(link).toHaveAttribute('href', 'https://pay.example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('14:30')).toBeInTheDocument();
  });

  it('origin, forwarded, referral, reply quote and reactions', async () => {
    const props = renderBubble(
      fakeMessage('text', {
        origin: 'business_app',
        direction: 'out',
        status: 'sent',
        context: {
          replyToMessageId: 'm0',
          forwarded: true,
          frequentlyForwarded: false,
          referral: {
            sourceUrl: 'https://fb.example/ad',
            sourceType: 'ad',
            sourceId: 's1',
            headline: 'Home loans',
            body: 'Low EMI',
            ctwaClid: 'c1',
          },
        },
        replyTo: { id: 'm0', type: 'text', direction: 'in', preview: 'Original question' },
        reactions: [
          { emoji: '👍', by: 'customer', at: '2026-10-22T09:00:00.000Z' },
          { emoji: '🙏', by: 'agent', at: '2026-10-22T09:00:00.000Z' },
        ],
      }),
    );
    expect(screen.getByText('Sent from the WhatsApp Business app')).toBeInTheDocument();
    expect(screen.getByText('Forwarded')).toBeInTheDocument();
    expect(screen.getByText('From an ad (ad)')).toBeInTheDocument();
    expect(screen.getByText('Home loans')).toBeInTheDocument();
    expect(screen.getByText('Low EMI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://fb.example/ad' })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Reactions')).getByTitle('Customer reacted'),
    ).toHaveTextContent('👍');
    expect(screen.getByTitle('You reacted')).toHaveTextContent('🙏');
    await userEvent.click(screen.getByRole('button', { name: /Go to the quoted message/ }));
    expect(props.onJump).toHaveBeenCalledWith('m0');
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('referral without optional parts; frequently forwarded; quote of our own message; history; system origin', () => {
    renderBubble(
      fakeMessage('text', {
        origin: 'history',
        context: {
          replyToMessageId: null,
          forwarded: false,
          frequentlyForwarded: true,
          referral: {
            sourceUrl: null,
            sourceType: null,
            sourceId: null,
            headline: null,
            body: null,
            ctwaClid: null,
          },
        },
        replyTo: { id: 'o1', type: 'text', direction: 'out', preview: 'Our reply' },
      }),
    );
    expect(screen.getByText('Imported history')).toBeInTheDocument();
    expect(screen.getByText('Forwarded many times')).toBeInTheDocument();
    expect(screen.getByText('From an ad')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('note: yellow "Internal note" with the author, no ticks', () => {
    renderBubble(fakeMessage('note', { sentBy: { id: 'u1', name: 'Asha Verma' } }));
    expect(screen.getByLabelText('Internal note')).toBeInTheDocument();
    expect(screen.getAllByText('Internal note')).toHaveLength(1);
    expect(screen.getByText('Called the customer back')).toBeInTheDocument();
    expect(screen.getByText('Asha Verma')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('system, unsupported, deleted, empty text', () => {
    renderBubble(fakeMessage('system'));
    expect(screen.getByText(/changed their number to one ending in 7001/)).toBeInTheDocument();
  });

  it('unsupported and deleted messages explain themselves', () => {
    renderBubble(fakeMessage('unsupported'));
    expect(screen.getByText(/can't be shown here/)).toBeInTheDocument();
  });

  it('deleted by the customer', () => {
    renderBubble(fakeMessage('text', { status: 'deleted' }));
    expect(screen.getByText('This message was deleted')).toBeInTheDocument();
    expect(screen.queryByText(/EMI ki date/)).toBeNull();
  });

  it('a text message without text renders only the time; highlight + actions slot', () => {
    renderBubble(fakeMessage('text', { text: null }), {
      highlighted: true,
      actions: <button type="button">Reply</button>,
    });
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });
});

describe('status ticks', () => {
  it.each([
    ['queued', 'Queued'],
    ['accepted', 'Queued'],
    ['sent', 'Sent'],
    ['delivered', 'Delivered'],
    ['read', 'Read'],
    ['failed', 'Failed'],
  ] as const)('%s → %s', (status, label) => {
    render(<StatusTicks message={{ status, error: null }} />);
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
  });

  it('nothing for inbound statuses', () => {
    const { container } = render(<StatusTicks message={{ status: 'received', error: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('failed: reason on hover + Retry (only with inbox.reply)', async () => {
    const props = renderBubble(fakeOutgoing('failed'));
    expect(screen.getByText(/More than 24 hours have passed/)).toBeInTheDocument();
    await userEvent.hover(screen.getByRole('img', { name: 'Failed' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/More than 24 hours/);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'out_failed' }));
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('failed without a reason and without permission', async () => {
    renderBubble(fakeOutgoing('failed', { error: null }), { canReply: false });
    expect(screen.getByText('Not delivered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await userEvent.hover(screen.getByRole('img', { name: 'Failed' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Not delivered');
  });
});

describe('media', () => {
  it('photo: thumbnail from the signed link → lightbox (lazy) → close', async () => {
    renderBubble(fakeMessage('image', { id: 'img1' }));
    const thumb = await screen.findByRole('img', { name: 'Payment ka screenshot' });
    expect(thumb).toHaveAttribute('src', 'https://files.example/img1');
    expect(api.mediaLink).toHaveBeenCalledWith('img1');
    await userEvent.click(screen.getByRole('button', { name: 'View photo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Photo' });
    expect(within(dialog).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://files.example/img1',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close photo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('photo without a caption; link still loading', () => {
    api.mediaLink.mockReturnValue(new Promise(() => undefined));
    renderBubble(fakeMessage('image', { text: null }));
    expect(screen.getByRole('button', { name: 'View photo' })).toBeDisabled();
  });

  it('photo without caption once loaded uses "Photo" (thumbnail and lightbox)', async () => {
    renderBubble(fakeMessage('image', { text: null }));
    expect(await screen.findByRole('img', { name: 'Photo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View photo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Photo' });
    expect(within(dialog).getByRole('img', { name: 'Photo' })).toBeInTheDocument();
  });

  it('video and audio players, voice note with its length', async () => {
    renderBubble(fakeMessage('video', { id: 'v1' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Video')).toHaveAttribute('src', 'https://files.example/v1'),
    );
  });

  it('audio file', async () => {
    renderBubble(fakeMessage('audio', { id: 'a1' }));
    await waitFor(() => expect(screen.getByLabelText('Audio')).toHaveAttribute('src'));
    expect(screen.queryByText(/Voice note/)).toBeNull();
  });

  it('voice note label + duration', () => {
    renderBubble(
      fakeMessage('audio', {
        media: media('ready', { voice: true, durationSec: 63, mimeType: 'audio/ogg' }),
      }),
    );
    expect(screen.getByText('Voice note · 1:03')).toBeInTheDocument();
    expect(screen.getByLabelText('Voice note')).toBeInTheDocument();
  });

  it('voice note without a known length', () => {
    renderBubble(
      fakeMessage('audio', { media: media('ready', { voice: true, durationSec: null }) }),
    );
    expect(screen.getByText('Voice note')).toBeInTheDocument();
  });

  it('document card: name, size, type, Download', async () => {
    renderBubble(fakeMessage('document', { id: 'd1' }));
    expect(screen.getByText('statement.pdf')).toBeInTheDocument();
    expect(screen.getByText('240 KB · application/pdf')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://files.example/d1',
    );
    expect(screen.getByText('Statement')).toBeInTheDocument();
  });

  it('document without name / size / type', () => {
    api.mediaLink.mockReturnValue(new Promise(() => undefined));
    renderBubble(
      fakeMessage('document', {
        text: null,
        media: media('ready', { fileName: null, size: null, mimeType: null }),
      }),
    );
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it('sticker (and its placeholder while the link loads)', async () => {
    renderBubble(fakeMessage('sticker', { id: 's1' }));
    expect(await screen.findByRole('img', { name: 'Sticker' })).toHaveAttribute(
      'src',
      'https://files.example/s1',
    );
  });

  it('sticker placeholder', () => {
    api.mediaLink.mockReturnValue(new Promise(() => undefined));
    renderBubble(fakeMessage('sticker'));
    expect(screen.queryByRole('img', { name: 'Sticker' })).toBeNull();
  });

  it('downloading / uploading spinners; no link requested', () => {
    renderBubble(fakeMessage('image', { media: media('pending') }));
    expect(screen.getByRole('status')).toHaveTextContent('Downloading…');
    expect(api.mediaLink).not.toHaveBeenCalled();
  });

  it('optimistic upload shows "Uploading…"', () => {
    renderBubble(
      fakeMessage('image', {
        id: 'tmp_k1',
        direction: 'out',
        origin: 'agent',
        status: 'queued',
        media: media('pending'),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Uploading…');
  });

  it('an optimistic ready file does not ask for a link', () => {
    renderBubble(fakeMessage('document', { id: 'tmp_k2', direction: 'out', status: 'queued' }));
    expect(api.mediaLink).not.toHaveBeenCalled();
  });

  it('expired media', () => {
    renderBubble(fakeMessage('video', { media: media('expired') }));
    expect(screen.getByText(/no longer available from WhatsApp/)).toBeInTheDocument();
  });

  it('failed download + Retry (inbox.assign only)', async () => {
    renderBubble(fakeMessage('image', { id: 'f1', media: media('failed') }));
    expect(screen.getByText("Couldn't download this file.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.retryMedia).toHaveBeenCalledWith('f1'));
  });

  it('failed download without permission: no Retry', () => {
    renderBubble(fakeMessage('image', { media: media('failed') }), { canAssign: false });
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a media type whose file is missing shows only the caption', () => {
    renderBubble(fakeMessage('image', { media: null, text: 'Caption only' }));
    expect(screen.getByText('Caption only')).toBeInTheDocument();
  });
});

describe('cards', () => {
  it('location: name, address, coordinates, maps link from lat / long', () => {
    renderBubble(fakeMessage('location'));
    expect(screen.getByText('Jaipur branch')).toBeInTheDocument();
    expect(screen.getByText('MI Road, Jaipur')).toBeInTheDocument();
    expect(screen.getByText('26.91240, 75.78730')).toBeInTheDocument();
    const maps = screen.getByRole('link', { name: 'Open in Google Maps' });
    expect(maps).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=26.912400,75.787300',
    );
    expect(maps).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('location without name / address, or without data', () => {
    renderBubble(
      fakeMessage('location', {
        location: {
          latitude: 1,
          longitude: 2,
          name: null,
          address: null,
          url: 'javascript:alert(1)',
        },
      }),
    );
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('location missing', () => {
    renderBubble(fakeMessage('location', { location: null }));
    expect(screen.getByText('Location')).toBeInTheDocument();
  });

  it('contact card fields as text + Add contact', async () => {
    const props = renderBubble(fakeMessage('contacts'));
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('Example Pvt Ltd')).toBeInTheDocument();
    expect(screen.getByText('+91 90000 66001 (cell)')).toBeInTheDocument();
    expect(screen.getByText('ravi@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(props.onAddContact).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ravi Kumar' }),
    );
  });

  it('contact card without phones / org / permission; no cards', () => {
    renderBubble(
      fakeMessage('contacts', {
        contacts: [
          {
            name: '<b>Bold</b>',
            phones: [{ phone: '123', type: null, waId: null }],
            emails: [],
            org: null,
          },
          { name: 'No phone', phones: [], emails: [], org: null },
        ],
      }),
      { onAddContact: undefined },
    );
    expect(screen.getByText('<b>Bold</b>')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add contact' })).toBeNull();
  });

  it('a contacts message without cards', () => {
    renderBubble(fakeMessage('contacts', { contacts: null }));
    expect(screen.queryByText('Add contact')).toBeNull();
  });

  it('customer replies to buttons / lists', () => {
    renderBubble(fakeMessage('interactive'));
    expect(screen.getByLabelText('Replied Yes, pay now')).toBeInTheDocument();
  });

  it('list reply with a description; reply without a title', () => {
    renderBubble(
      fakeMessage('interactive', {
        interactive: {
          ...(fakeMessage('interactive').interactive as NonNullable<InboxMessage['interactive']>),
          kind: 'list_reply',
          reply: { id: 'r1', title: 'Home loan', description: '8.5%' },
        },
      }),
    );
    expect(screen.getByText('8.5%')).toBeInTheDocument();
  });

  it('a reply without title', () => {
    renderBubble(
      fakeMessage('interactive', {
        interactive: {
          ...(fakeMessage('interactive').interactive as NonNullable<InboxMessage['interactive']>),
          reply: null,
        },
      }),
    );
    expect(screen.getByLabelText('Replied')).toHaveTextContent('Reply');
  });

  it('form answers (nfm_reply): fields, flow token hidden, truncated note', () => {
    renderBubble(
      fakeMessage('interactive', {
        interactive: {
          ...(fakeMessage('interactive').interactive as NonNullable<InboxMessage['interactive']>),
          kind: 'nfm_reply',
          nfmResponse: JSON.stringify({
            full_name: 'Asha',
            amount: 5000,
            prefs: { sms: true },
            flow_token: 'secret',
          }),
          nfmTruncated: true,
        },
      }),
    );
    expect(screen.getByText('Form submitted')).toBeInTheDocument();
    expect(screen.getByText('full name:')).toBeInTheDocument();
    expect(screen.getByText(/Asha/)).toBeInTheDocument();
    expect(screen.getByText(/5000/)).toBeInTheDocument();
    expect(screen.getByText(/\{"sms":true\}/)).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(screen.getByText(/too long to keep/)).toBeInTheDocument();
  });

  it.each([null, 'not json', '[1,2]', 'null'])(
    'form answers that are not an object (%s)',
    (nfmResponse) => {
      renderBubble(
        fakeMessage('interactive', {
          interactive: {
            ...(fakeMessage('interactive').interactive as NonNullable<InboxMessage['interactive']>),
            kind: 'nfm_reply',
            nfmResponse,
          },
        }),
      );
      expect(screen.getByText('Form submitted')).toBeInTheDocument();
    },
  );

  it('outgoing buttons preview with header + footer', () => {
    renderBubble(
      fakeOutgoingInteractive('button', {
        interactive: {
          ...(fakeOutgoingInteractive('button').interactive as NonNullable<
            InboxMessage['interactive']
          >),
          header: { type: 'text', text: 'EMI reminder', fileName: null },
        },
      }),
    );
    expect(screen.getByText('EMI reminder')).toBeInTheDocument();
    expect(screen.getByText('Choose one')).toBeInTheDocument();
    expect(screen.getByText('Demo Finance')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('outgoing list preview (sections, rows, descriptions)', () => {
    renderBubble(
      fakeOutgoingInteractive('list', {
        interactive: {
          ...(fakeOutgoingInteractive('list').interactive as NonNullable<
            InboxMessage['interactive']
          >),
          header: { type: 'document', text: null, fileName: 'plans.pdf' },
          sections: [
            { title: 'Loans', rows: [{ id: 'r1', title: 'Home loan', description: '8.5%' }] },
            { title: null, rows: [{ id: 'r2', title: 'Car loan', description: null }] },
          ],
        },
      }),
    );
    expect(screen.getByText('Document header · plans.pdf')).toBeInTheDocument();
    expect(screen.getByText('Plans')).toBeInTheDocument();
    expect(screen.getByText('Loans')).toBeInTheDocument();
    expect(screen.getByText('• Home loan — 8.5%')).toBeInTheDocument();
    expect(screen.getByText('• Car loan')).toBeInTheDocument();
  });

  it('outgoing link button preview; image header without a name; no body / footer', () => {
    renderBubble(
      fakeOutgoingInteractive('cta_url', {
        interactive: {
          ...(fakeOutgoingInteractive('cta_url').interactive as NonNullable<
            InboxMessage['interactive']
          >),
          header: { type: 'image', text: null, fileName: null },
          body: null,
          footer: null,
        },
      }),
    );
    expect(screen.getByText('Photo header')).toBeInTheDocument();
    expect(screen.getByTitle('https://pay.example.com')).toHaveTextContent('Pay');
  });

  it('interactive without content', () => {
    renderBubble(
      fakeOutgoingInteractive('button', {
        interactive: {
          ...(fakeOutgoingInteractive('button').interactive as NonNullable<
            InboxMessage['interactive']
          >),
          buttons: [],
          body: null,
          footer: null,
        },
      }),
    );
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('interactive missing entirely', () => {
    renderBubble(fakeMessage('interactive', { interactive: null }));
    expect(screen.getByText('Interactive message')).toBeInTheDocument();
  });

  it('template button reply: text, payload, fallback', () => {
    renderBubble(fakeMessage('button'));
    expect(screen.getByText('Tapped a button')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('template button reply with only a payload', () => {
    renderBubble(fakeMessage('button', { button: { payload: 'PAY', text: null } }));
    expect(screen.getByText('PAY')).toBeInTheDocument();
  });

  it('template button reply without data', () => {
    renderBubble(fakeMessage('button', { button: null }));
    expect(screen.getByText('Button')).toBeInTheDocument();
  });

  it('order: items, total, note', () => {
    renderBubble(fakeMessage('order', { text: 'Please deliver fast' }));
    expect(screen.getByText('Order · 2 items')).toBeInTheDocument();
    expect(screen.getByText('INR 1,499')).toBeInTheDocument();
    expect(screen.getByText('Please deliver fast')).toBeInTheDocument();
  });

  it('order with one item, no total / currency; order missing', () => {
    renderBubble(
      fakeMessage('order', {
        order: { catalogId: null, itemsCount: 1, total: null, currency: null },
      }),
    );
    expect(screen.getByText('Order · 1 item')).toBeInTheDocument();
  });

  it('order data missing', () => {
    renderBubble(fakeMessage('order', { order: null }));
    expect(screen.getByText('Order')).toBeInTheDocument();
  });

  it('total without currency', () => {
    renderBubble(
      fakeMessage('order', {
        order: { catalogId: null, itemsCount: 3, total: 10, currency: null },
      }),
    );
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
