import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from '@/features/inbox/chat/MessageBubble';
import { Composer } from '@/features/inbox/composer/Composer';
import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi } from '@/services/api/inbox';
import { templatesApi } from '@/services/api/templates';
import type { WhatsAppTemplate } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import {
  fakeContactPanel,
  fakeConversationDetail,
  fakeInboxConfig,
  fakeMessage,
  fakeOutgoing,
} from '@/test/inbox';
import { renderWithProviders } from '@/test/render';
import { fakePricePreview, fakeTemplate, fakeTemplateListItem } from '@/test/templates';
import { fakeChannel, fakeWhatsAppConfig } from '@/test/whatsapp';

import { ContactTemplateButton } from './ContactTemplateButton';
import { initialChoices, marketingBlock, resolveVariable, type SendContact } from './resolve';
import { SendTemplateDialog, type SendTemplateDialogProps } from './SendTemplateDialog';

vi.mock('@/services/api/templates', () => ({
  templatesApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: {
    config: vi.fn(),
    send: vi.fn(),
    start: vi.fn(),
    upload: vi.fn(),
    typing: vi.fn(),
    contact: vi.fn(),
  },
}));

const tpl = vi.mocked(templatesApi);
const inbox = vi.mocked(inboxApi);
const UUID = /^[0-9a-f-]{36}$/;
const anyId = expect.stringMatching(UUID) as unknown as string;
const anyString = expect.any(String) as unknown as string;
const HOUR = 3_600_000;

const CONTACT: SendContact = {
  id: 'ct1',
  name: 'Asha',
  phoneE164: '+919876543210',
  email: 'asha@example.com',
  variables: { emi_amount: 12_500_100_000, due_date: '2026-11-05' },
  dnd: false,
  optedOutAt: null,
  consent: null,
};
const FIELDS = [
  { key: 'emi_amount', type: 'currency' as const },
  { key: 'due_date', type: 'date' as const },
];

/** The EMI template with remembered sources: header asks, {{1}} name, {{2}} a field, URL fixed. */
const emi = (over: Partial<WhatsAppTemplate> = {}): WhatsAppTemplate => {
  const t = fakeTemplate('APPROVED', 'UTILITY', undefined, over);
  return {
    ...t,
    variables: t.variables.map((v) =>
      v.key === '1'
        ? { ...v, defaultSource: { kind: 'contact.name', value: null } }
        : v.key === '2'
          ? { ...v, defaultSource: { kind: 'field', value: 'emi_amount' } }
          : v.key === 'button_1'
            ? { ...v, defaultSource: { kind: 'static', value: 'LN-1001' } }
            : v,
    ),
  };
};

beforeEach(() => {
  signInAs('agent');
  for (const fn of [...Object.values(tpl), ...Object.values(inbox)]) fn.mockReset();
  inbox.config.mockResolvedValue(fakeInboxConfig());
  inbox.contact.mockResolvedValue(fakeContactPanel());
  vi.mocked(customFieldsApi.list).mockResolvedValue(
    FIELDS.map((f, i) => ({
      id: `f${String(i)}`,
      key: f.key,
      label: f.key === 'emi_amount' ? 'EMI amount' : 'Due date',
      type: f.type,
      required: false,
      defaultValue: null,
      order: i,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    })),
  );
  tpl.list.mockResolvedValue([
    fakeTemplateListItem('APPROVED', 'UTILITY'),
    fakeTemplateListItem('APPROVED', 'MARKETING', { id: 'tpl2', name: 'diwali_offer' }),
    fakeTemplateListItem('FLAGGED', 'UTILITY', {
      id: 'tpl3',
      name: 'other_number',
      channelIds: ['wa9'],
    }),
  ]);
  tpl.get.mockImplementation((id: string) =>
    Promise.resolve(
      id === 'tpl2'
        ? fakeTemplate(
            'APPROVED',
            'MARKETING',
            [{ type: 'BODY', text: 'Festive offer for you!' }],
            {
              id: 'tpl2',
              name: 'diwali_offer',
            },
          )
        : emi(),
    ),
  );
  vi.spyOn(whatsappApi, 'pricePreview').mockResolvedValue(fakePricePreview());
  inbox.send.mockImplementation((_id, body) =>
    Promise.resolve(
      fakeOutgoing('accepted', { id: 'srv1', clientId: body.clientId, type: 'template' }),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

describe('resolve', () => {
  it('every source → the text the backend would use; missing → empty', () => {
    const r = (kind: Parameters<typeof resolveVariable>[0]['kind'], value = '') =>
      resolveVariable({ kind, value }, CONTACT, FIELDS);
    expect(r('contact.name')).toBe('Asha');
    expect(r('contact.phone')).toBe('+91 98765 43210');
    expect(r('contact.email')).toBe('asha@example.com');
    expect(r('field', 'emi_amount')).toBe('₹12,500.10');
    expect(r('field', 'due_date')).toBe('05 Nov 2026');
    expect(r('field', 'missing')).toBe('');
    expect(r('static', '  LN-1 ')).toBe('LN-1');
    expect(r('ask', '')).toBe('');
    const bare = { ...CONTACT, name: null, email: null, variables: { x: { nested: true }, y: '' } };
    expect(resolveVariable({ kind: 'contact.name', value: '' }, bare, FIELDS)).toBe('');
    expect(resolveVariable({ kind: 'contact.email', value: '' }, bare, FIELDS)).toBe('');
    expect(resolveVariable({ kind: 'field', value: 'x' }, bare, [])).toBe('');
    expect(resolveVariable({ kind: 'field', value: 'y' }, bare, [])).toBe('');
    expect(initialChoices(emi().variables)['2']).toEqual({ kind: 'field', value: 'emi_amount' });
    expect(initialChoices(emi().variables).header_1).toEqual({ kind: 'ask', value: '' });
  });

  it('marketing blocks known on screen', () => {
    expect(marketingBlock(CONTACT)).toBeNull();
    expect(marketingBlock({ ...CONTACT, dnd: true, optedOutAt: 'x' })).toBe('dnd');
    expect(marketingBlock({ ...CONTACT, optedOutAt: '2026-10-01' })).toBe('opted_out');
  });
});

const renderDialog = (props: Partial<SendTemplateDialogProps> = {}) => {
  const onClose = vi.fn();
  const onSent = vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <SendTemplateDialog
            open
            channelId="wa1"
            contact={CONTACT}
            target={{ kind: 'conversation', conversationId: 'cv1' }}
            onClose={onClose}
            onSent={onSent}
            {...props}
          />
        ),
      },
    ],
  });
  return { onClose, onSent, d: within(screen.getByRole('dialog', { name: 'Send template' })) };
};
const choose = async (d: { getByRole: typeof screen.getByRole }, name: string) => {
  await userEvent.click(d.getByRole('combobox', { name: 'Template' }));
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(name) }));
};

describe('Send template dialog', () => {
  it('lists approved / flagged templates of this number; sends the exact body per variable source', async () => {
    const { d, onClose, onSent } = renderDialog();
    await userEvent.click(d.getByRole('combobox', { name: 'Template' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('emi_reminder'),
      expect.stringContaining('diwali_offer'),
    ]);
    expect(options[0]).toHaveTextContent('Utility');
    await userEvent.click(options[0] as HTMLElement);
    expect(tpl.list).toHaveBeenCalledWith({ channelId: 'wa1', status: ['APPROVED', 'FLAGGED'] });
    expect(await d.findByText('Sends: Asha')).toBeInTheDocument();
    expect(d.getByText('Sends: ₹12,500.10')).toBeInTheDocument();
    expect(d.getByText('Sends: LN-1001')).toBeInTheDocument();
    // the header asks → type it
    await userEvent.type(d.getByRole('textbox', { name: 'Value for Header variable' }), 'November');
    const preview = d.getByRole('figure', { name: 'Message preview' });
    expect(preview).toHaveTextContent('EMI for November');
    expect(preview).toHaveTextContent('Namaste Asha, your EMI of ₹12,500.10 is due soon.');
    // {{1}} switched to the phone
    await userEvent.click(d.getByRole('combobox', { name: '{{1}} source' }));
    await userEvent.click(screen.getByRole('option', { name: 'Contact phone' }));
    expect(preview).toHaveTextContent('Namaste +91 98765 43210');
    expect(d.getByLabelText('Cost')).toHaveTextContent(
      'This message costs ₹0.14 · Utility · India',
    );
    expect(d.getByLabelText('Cost')).toHaveTextContent('Charged only when WhatsApp delivers it.');
    expect(whatsappApi.pricePreview).toHaveBeenCalledWith({
      channelId: 'wa1',
      contactId: 'ct1',
      templateId: 'tpl1',
    });
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    await waitFor(() => expect(inbox.send).toHaveBeenCalledTimes(1));
    const [conversationId, body] = inbox.send.mock.calls[0] ?? [];
    expect(conversationId).toBe('cv1');
    expect(body).toEqual({
      clientId: anyId,
      type: 'template',
      templateId: 'tpl1',
      variables: {
        header_1: 'November',
        1: '+91 98765 43210',
        2: '₹12,500.10',
        button_1: 'LN-1001',
      },
    });
    expect(onSent).toHaveBeenCalledWith({
      message: expect.objectContaining({ id: 'srv1' }) as unknown,
    });
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('Template sent')).toBeInTheDocument();
  });

  it('a custom field source and a fixed text; a missing value blocks sending', async () => {
    const { d } = renderDialog();
    await choose(d, 'emi_reminder');
    await d.findByText('Sends: Asha');
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    expect(d.getByText('No value for this contact — type one')).toBeInTheDocument();
    expect(inbox.send).not.toHaveBeenCalled();
    await userEvent.click(d.getByRole('combobox', { name: 'Header variable source' }));
    await userEvent.click(screen.getByRole('option', { name: 'Custom field' }));
    await userEvent.click(d.getByRole('combobox', { name: 'Custom field for Header variable' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Due date' }));
    expect(d.getByText('Sends: 05 Nov 2026')).toBeInTheDocument();
    await userEvent.click(d.getByRole('combobox', { name: '{{2}} source' }));
    await userEvent.click(screen.getByRole('option', { name: 'Fixed text' }));
    await userEvent.type(d.getByRole('textbox', { name: 'Value for {{2}}' }), '₹99');
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    await waitFor(() => expect(inbox.send).toHaveBeenCalled());
    expect(inbox.send.mock.calls[0]?.[1]).toMatchObject({
      variables: { header_1: '05 Nov 2026', 1: 'Asha', 2: '₹99', button_1: 'LN-1001' },
    });
  });

  it('cost line: customer pays Meta', async () => {
    vi.mocked(whatsappApi.pricePreview).mockResolvedValueOnce(
      fakePricePreview({ payer: 'customer', priceMicros: 0, note: 'customer_pays_meta' }),
    );
    const { d } = renderDialog();
    await choose(d, 'emi_reminder');
    expect(await d.findByText('Billed by Meta to your WhatsApp account')).toBeInTheDocument();
  });

  it('price errors fall back to a plain note', async () => {
    vi.mocked(whatsappApi.pricePreview).mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'x', kind: 'http' }),
    );
    const { d } = renderDialog();
    await choose(d, 'emi_reminder');
    expect(await d.findByText(/price couldn't be loaded/)).toBeInTheDocument();
  });

  it('marketing: the consent warning', async () => {
    const first = renderDialog();
    await choose(first.d, 'diwali_offer');
    expect(await first.d.findByText(/agreed to hear from you on WhatsApp/)).toHaveTextContent(
      'No consent is recorded for this contact.',
    );
    expect(first.d.getByRole('figure', { name: 'Message preview' })).toHaveTextContent(
      'Festive offer for you!',
    );
  });

  it('an opted-out contact gets utility, not marketing; DND blocks every template', async () => {
    const { d } = renderDialog({ contact: { ...CONTACT, optedOutAt: '2026-10-01T00:00:00Z' } });
    await choose(d, 'diwali_offer');
    expect(await d.findByText(/opted out of messages/)).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Send template' })).toBeDisabled();
    await choose(d, 'emi_reminder');
    await waitFor(() => expect(d.queryByText(/opted out of messages/)).toBeNull());
  });

  it('DND blocks every template', async () => {
    const { d } = renderDialog({ contact: { ...CONTACT, dnd: true } });
    await choose(d, 'emi_reminder');
    expect(await d.findByText(/Do-not-disturb/)).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Send template' })).toBeDisabled();
  });

  it.each([
    ['WALLET_INSUFFICIENT_BALANCE', [], /Add money to your wallet/],
    ['WALLET_BUDGET_EXCEEDED', [], /monthly WhatsApp budget/],
    ['WHATSAPP_FREQUENCY_LIMIT', [], /last 24 hours/],
    ['TEMPLATE_PAUSED', [], /paused this template/],
    [
      'TEMPLATE_MARKETING_BLOCKED',
      [{ path: 'contact', message: 'stopped_marketing' }],
      /stopped marketing messages on WhatsApp/,
    ],
    ['SOMETHING_NEW', [], /Server said no/],
  ])('shows %s in plain words', async (code, details, text) => {
    inbox.send.mockRejectedValueOnce(
      new ApiError({ status: 422, code, message: 'Server said no', kind: 'http', details }),
    );
    const { d } = renderDialog();
    await choose(d, 'emi_reminder');
    await userEvent.type(
      await d.findByRole('textbox', { name: 'Value for Header variable' }),
      'Nov',
    );
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    expect(await d.findByText(text)).toBeInTheDocument();
  });

  it('media header: the example by default, or a new upload sent as the header', async () => {
    const media = emi({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'See the offer, {{1}}.', example: { body_text: [['Asha']] } },
      ],
      headerMedia: { mimeType: 'image/png', size: 10, fileName: 'offer.png', uploaded: true },
    });
    media.variables = [
      {
        key: '1',
        component: 'body',
        index: 0,
        example: 'Asha',
        defaultSource: { kind: 'contact.name', value: null },
      },
    ];
    tpl.get.mockResolvedValue(media);
    inbox.upload.mockImplementation(({ onProgress }) => {
      onProgress?.(50);
      return Promise.resolve({
        mediaToken: 'mt1',
        kind: 'image',
        mimeType: 'image/png',
        size: 3,
        fileName: 'new.png',
        expiresAt: '2026-10-24T00:00:00Z',
      } as never);
    });
    const { d } = renderDialog();
    await choose(d, 'emi_reminder');
    expect(await d.findByRole('radio', { name: 'Use the example (offer.png)' })).toBeChecked();
    expect(d.getByRole('figure', { name: 'Message preview' })).toHaveTextContent('offer.png');
    await userEvent.click(d.getByRole('radio', { name: 'Upload a new file' }));
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    expect(inbox.send).not.toHaveBeenCalled();
    const input = d.getByLabelText('Header file');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    });
    expect(d.getByText(/doesn't accept this type/)).toBeInTheDocument();
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(d.getByText(/At most 5.0 MB/)).toBeInTheDocument();
    fireEvent.change(input, {
      target: { files: [new File(['png'], 'new.png', { type: 'image/png' })] },
    });
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    await waitFor(() => expect(inbox.send).toHaveBeenCalled());
    expect(inbox.upload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', fileName: 'new.png' }),
    );
    expect(inbox.send.mock.calls[0]?.[1]).toMatchObject({
      header: { mediaToken: 'mt1' },
      variables: { 1: 'Asha' },
    });
  });

  it('the example is used as is (no header in the body)', async () => {
    const media = emi({
      components: [
        { type: 'HEADER', format: 'DOCUMENT' },
        { type: 'BODY', text: 'Your statement.' },
      ],
      headerMedia: {
        mimeType: 'application/pdf',
        size: 10,
        fileName: 'statement.pdf',
        uploaded: true,
      },
    });
    media.variables = [];
    tpl.get.mockResolvedValue(media);
    const { d } = renderDialog();
    await choose(d, 'emi_reminder');
    await d.findByRole('radio', { name: /Use the example/ });
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    await waitFor(() => expect(inbox.send).toHaveBeenCalled());
    expect(inbox.send.mock.calls[0]?.[1]).toEqual({
      clientId: anyId,
      type: 'template',
      templateId: 'tpl1',
    });
  });

  it('location header: coordinates required, then sent', async () => {
    const loc = emi({
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Visit our branch.' },
      ],
    });
    loc.variables = [];
    tpl.get.mockResolvedValue(loc);
    const { d } = renderDialog();
    await choose(d, 'emi_reminder');
    await userEvent.click(await d.findByRole('button', { name: 'Send template' }));
    expect(inbox.send).not.toHaveBeenCalled();
    await userEvent.type(d.getByRole('textbox', { name: 'Latitude' }), '26.91');
    await userEvent.type(d.getByRole('textbox', { name: 'Longitude' }), '75.78');
    await userEvent.type(
      d.getByRole('textbox', { name: 'Place name (optional)' }),
      'Jaipur branch',
    );
    expect(d.getByRole('figure', { name: 'Message preview' })).toHaveTextContent('Jaipur branch');
    await userEvent.click(d.getByRole('button', { name: 'Send template' }));
    await waitFor(() => expect(inbox.send).toHaveBeenCalled());
    expect(inbox.send.mock.calls[0]?.[1]).toMatchObject({
      header: {
        location: { latitude: 26.91, longitude: 75.78, name: 'Jaipur branch', address: null },
      },
    });
  });

  it('no templates for the number; the list fails', async () => {
    tpl.list.mockResolvedValue([]);
    const { d } = renderDialog();
    await userEvent.click(d.getByRole('combobox', { name: 'Template' }));
    expect(await screen.findByText('No approved templates for this number')).toBeInTheDocument();
    expect(d.getByText('Choose a template to see the message.')).toBeInTheDocument();
  });
});

describe('entry points', () => {
  const closed = () =>
    fakeConversationDetail({ windowExpiresAt: new Date(Date.now() - HOUR).toISOString() });
  const open = () =>
    fakeConversationDetail({ windowExpiresAt: new Date(Date.now() + 5 * HOUR).toISOString() });
  const showComposer = (c = open()) =>
    renderWithProviders({
      routes: [
        { path: '/', element: <Composer conversation={c} replyTo={null} onClearReply={vi.fn()} /> },
      ],
    });

  it('the window-closed banner offers Send a template (the panel contact fills the values)', async () => {
    const panel = fakeContactPanel();
    inbox.contact.mockResolvedValue({
      ...panel,
      contact: panel.contact && { ...panel.contact, variables: { emi_amount: 1_000_000 } },
    });
    showComposer(closed());
    expect(
      screen.getByText(
        'The 24-hour window is closed. Send a template to start the conversation again.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send a template' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send template' });
    await choose(within(dialog), 'emi_reminder');
    await userEvent.type(
      await within(dialog).findByRole('textbox', { name: 'Value for Header variable' }),
      'Nov',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send template' }));
    await waitFor(() => expect(inbox.send).toHaveBeenCalled());
    expect(inbox.send.mock.calls[0]?.[0]).toBe('cv1');
    expect(inbox.send.mock.calls[0]?.[1]).toMatchObject({ variables: { 2: '₹1.00' } });
  });

  it('viewers get no template button on the closed banner', () => {
    signInAs('viewer');
    showComposer(closed());
    expect(screen.queryByRole('button', { name: 'Send a template' })).toBeNull();
  });

  it('the composer Templates button opens the dialog; the reply cost hint for platform payers', async () => {
    vi.mocked(whatsappApi.pricePreview).mockResolvedValue(
      fakePricePreview({ category: 'service', priceMicros: 130_000, note: 'free_tier_may_apply' }),
    );
    showComposer();
    expect(
      await screen.findByText('Replies may cost ₹0.13 after the free 1,000 each month'),
    ).toBeInTheDocument();
    expect(whatsappApi.pricePreview).toHaveBeenCalledWith({
      channelId: 'wa1',
      contactId: anyString,
      category: 'service',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(await screen.findByRole('dialog', { name: 'Send template' })).toBeInTheDocument();
  });

  it('no cost hint when the customer pays Meta', async () => {
    vi.mocked(whatsappApi.pricePreview).mockResolvedValue(
      fakePricePreview({ payer: 'customer', priceMicros: 0, note: 'customer_pays_meta' }),
    );
    showComposer();
    await waitFor(() => expect(whatsappApi.pricePreview).toHaveBeenCalled());
    expect(screen.queryByText(/Replies may cost/)).toBeNull();
  });

  it('contact page: Send template picks the number, starts the chat with the template, opens it', async () => {
    vi.spyOn(whatsappApi, 'config').mockResolvedValue(fakeWhatsAppConfig());
    vi.spyOn(whatsappApi, 'channels').mockResolvedValue({
      items: [
        fakeChannel(),
        fakeChannel({ id: 'wa2', label: 'Sales line', displayPhoneNumber: null }),
        fakeChannel({ id: 'wa3', status: 'disconnected' }),
      ],
      counts: { connected: 2 },
      limit: 10,
    });
    tpl.list.mockResolvedValue([
      fakeTemplateListItem('APPROVED', 'UTILITY', { channelIds: ['wa1', 'wa2'] }),
    ]);
    inbox.start.mockResolvedValue(fakeConversationDetail({ id: 'cv9' }));
    renderWithProviders({
      routes: [
        { path: '/', element: <ContactTemplateButton contact={CONTACT} /> },
        { path: '/inbox/:id', element: <p>Chat opened</p> },
      ],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Send template' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sales line' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send template' });
    await choose(within(dialog), 'emi_reminder');
    await userEvent.type(
      await within(dialog).findByRole('textbox', { name: 'Value for Header variable' }),
      'Nov',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send template' }));
    await waitFor(() => expect(inbox.start).toHaveBeenCalled());
    expect(inbox.start).toHaveBeenCalledWith({
      channelId: 'wa2',
      contactId: 'ct1',
      template: {
        clientId: anyId,
        type: 'template',
        templateId: 'tpl1',
        variables: { header_1: 'Nov', 1: 'Asha', 2: '₹12,500.10', button_1: 'LN-1001' },
      },
    });
    expect(await screen.findByText('Chat opened')).toBeInTheDocument();
  });

  it('contact page: one number opens the dialog at once; hidden without a number or for viewers', async () => {
    vi.spyOn(whatsappApi, 'config').mockResolvedValue(fakeWhatsAppConfig());
    const channels = vi
      .spyOn(whatsappApi, 'channels')
      .mockResolvedValue({ items: [fakeChannel()], counts: { connected: 1 }, limit: 10 });
    const first = renderWithProviders({
      routes: [{ path: '/', element: <ContactTemplateButton contact={CONTACT} /> }],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Send template' }));
    expect(await screen.findByRole('dialog', { name: 'Send template' })).toBeInTheDocument();
    first.unmount();
    channels.mockResolvedValue({ items: [], counts: {}, limit: 10 });
    const second = renderWithProviders({
      routes: [{ path: '/', element: <ContactTemplateButton contact={CONTACT} /> }],
    });
    await waitFor(() => expect(channels).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Send template' })).toBeNull();
    second.unmount();
    signInAs('viewer');
    renderWithProviders({
      routes: [{ path: '/', element: <ContactTemplateButton contact={CONTACT} /> }],
    });
    expect(screen.queryByRole('button', { name: 'Send template' })).toBeNull();
  });
});

describe('template bubbles', () => {
  const bubble = (m = fakeMessage('template')) =>
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <MessageBubble
              message={m}
              timezone="Asia/Kolkata"
              canReply
              canAssign
              onJump={vi.fn()}
              onRetry={vi.fn()}
            />
          ),
        },
      ],
    });

  it('label, rendered text and the template buttons', async () => {
    tpl.get.mockResolvedValue(emi());
    bubble();
    expect(screen.getByText('Template · emi_reminder')).toBeInTheDocument();
    expect(screen.getByText(/your EMI of ₹12,500.00 is due on 05 Nov 2026/)).toBeInTheDocument();
    const buttons = await screen.findByRole('list', { name: 'Template buttons' });
    expect(buttons).toHaveTextContent('Paid already');
    expect(buttons).toHaveTextContent('Pay now');
  });

  it('hostile values stay text; a deleted template shows no buttons; a failed reason shows', async () => {
    tpl.get.mockRejectedValue(
      new ApiError({ status: 404, code: 'TEMPLATE_NOT_FOUND', message: 'x', kind: 'http' }),
    );
    bubble(
      fakeMessage('template', {
        text: 'Hi <img src=x onerror=alert(1)> {{1}}',
        status: 'failed',
        error: { code: 132015, reason: 'Template is paused for low quality' },
      }),
    );
    expect(screen.getByText('Hi <img src=x onerror=alert(1)> {{1}}')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('Template is paused for low quality')).toBeInTheDocument();
    await waitFor(() => expect(tpl.get).toHaveBeenCalled());
    expect(screen.queryByRole('list', { name: 'Template buttons' })).toBeNull();
  });

  it('many buttons → See all options; media header and no template info', async () => {
    tpl.get.mockResolvedValue(
      fakeTemplate('APPROVED', 'MARKETING', [
        { type: 'BODY', text: 'x' },
        {
          type: 'BUTTONS',
          buttons: ['A', 'B', 'C', 'D'].map((t) => ({ type: 'QUICK_REPLY', text: t })),
        },
      ]),
    );
    bubble();
    expect(await screen.findByText('See all options')).toBeInTheDocument();
    cleanup();
    bubble(fakeMessage('template', { template: null, text: 'Plain' }));
    expect(screen.getByText('Template · WhatsApp template')).toBeInTheDocument();
  });
});
