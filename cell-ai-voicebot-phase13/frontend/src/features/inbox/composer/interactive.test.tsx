import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi } from '@/services/api/inbox';
import { signInAs } from '@/test/auth';
import { fakeConversationDetail, fakeInboxConfig, fakeOutgoing, fakeUpload } from '@/test/inbox';
import { renderWithProviders } from '@/test/render';

import { DEFAULT_INBOX_LIMITS as L } from '../limits';

import { Composer } from './Composer';
import {
  emptyBuilder,
  toPreview,
  toSendBody,
  validateBuilder,
  type BuilderState,
} from './interactive';

vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: { config: vi.fn(), send: vi.fn(), upload: vi.fn(), typing: vi.fn() },
}));
const api = vi.mocked(inboxApi);

const state = (patch: Partial<BuilderState>): BuilderState => ({ ...emptyBuilder(), ...patch });
const long = (n: number) => 'x'.repeat(n);

describe('builder rules (same as the API)', () => {
  it('buttons: body, footer, header text / media, count, titles, duplicates', () => {
    expect(validateBuilder(emptyBuilder(), L)).toEqual({
      body: 'Required',
      'button.0': 'Required',
    });
    const ok = state({ body: 'Pay?', buttons: ['Yes', 'No'] });
    expect(validateBuilder(ok, L)).toEqual({});
    expect(
      validateBuilder(
        state({
          body: long(1025),
          footer: long(61),
          headerType: 'text',
          headerText: long(61),
          buttons: ['Yes', 'yes ', long(21), 'Four'],
        }),
        L,
      ),
    ).toEqual({
      body: 'At most 1024 characters',
      footer: 'At most 60 characters',
      headerText: 'At most 60 characters',
      buttons: 'At most 3 buttons',
      'button.1': 'Each button needs its own title',
      'button.2': 'At most 20 characters',
    });
    expect(validateBuilder(state({ ...ok, headerType: 'text' }), L)).toEqual({
      headerText: 'Required',
    });
    expect(validateBuilder(state({ ...ok, headerType: 'image' }), L)).toEqual({
      headerMedia: 'Add a file',
    });
    expect(
      validateBuilder(
        state({ ...ok, headerType: 'video', headerMedia: { mediaToken: 't', fileName: null } }),
        L,
      ),
    ).toEqual({});
  });

  it('list: menu text, sections, rows, titles, descriptions', () => {
    const one = state({
      kind: 'list',
      body: 'Plans',
      listButton: 'Open',
      sections: [{ title: '', rows: [{ title: 'Home', description: '' }] }],
    });
    expect(validateBuilder(one, L)).toEqual({});
    // media headers are for buttons only: ignored for a list
    expect(validateBuilder({ ...one, headerType: 'image' }, L)).toEqual({});
    expect(validateBuilder({ ...one, headerType: 'text', headerText: '' }, L)).toEqual({
      headerText: 'Required',
    });
    expect(
      validateBuilder({ ...one, sections: [{ title: long(25), rows: one.sections[0]!.rows }] }, L),
    ).toEqual({
      'section.0': 'At most 24 characters',
    });
    const two = {
      ...one,
      listButton: '',
      sections: [
        { title: '', rows: [{ title: '', description: long(73) }] },
        { title: 'B', rows: Array.from({ length: 10 }, () => ({ title: 'R', description: '' })) },
      ],
    };
    expect(validateBuilder(two, L)).toEqual({
      listButton: 'Required',
      rows: 'At most 10 rows in total',
      'section.0': 'Required',
      'row.0.0': 'Required',
      'rowDescription.0.0': 'At most 72 characters',
    });
    expect(
      validateBuilder(
        {
          ...one,
          sections: Array.from({ length: 11 }, (_x, i) => ({ title: `S${String(i)}`, rows: [] })),
        },
        L,
      ),
    ).toEqual({ sections: 'At most 10 sections' });
  });

  it('link button: text and https only', () => {
    const cta = state({
      kind: 'cta_url',
      body: 'Pay',
      ctaText: 'Pay now',
      ctaUrl: 'https://pay.example.com',
    });
    expect(validateBuilder(cta, L)).toEqual({});
    expect(validateBuilder({ ...cta, ctaUrl: 'http://x.example' }, L)).toEqual({
      ctaUrl: 'Must be an https:// link',
    });
    expect(validateBuilder({ ...cta, ctaUrl: 'javascript:alert(1)', ctaText: '' }, L)).toEqual({
      ctaUrl: 'Must be an https:// link',
      ctaText: 'Required',
    });
  });

  it('request bodies with generated ids', () => {
    const extra = { clientId: 'k1', replyToMessageId: 'm1' };
    expect(
      toSendBody(
        state({
          body: ' Pay? ',
          footer: ' ',
          headerType: 'text',
          headerText: ' EMI ',
          buttons: [' Yes ', 'No'],
        }),
        extra,
      ),
    ).toEqual({
      ...extra,
      type: 'buttons',
      body: 'Pay?',
      footer: null,
      header: { type: 'text', text: 'EMI' },
      buttons: [
        { id: 'btn_1', title: 'Yes' },
        { id: 'btn_2', title: 'No' },
      ],
    });
    expect(
      toSendBody(
        state({
          body: 'b',
          headerType: 'document',
          headerMedia: { mediaToken: 'tok', fileName: 'a.pdf' },
          buttons: ['A'],
        }),
        { clientId: 'k2' },
      ),
    ).toMatchObject({ header: { type: 'document', mediaToken: 'tok' } });
    expect(
      toSendBody(state({ body: 'b', headerType: 'image', buttons: ['A'] }), { clientId: 'k3' }),
    ).toMatchObject({
      header: null,
    });
    expect(
      toSendBody(
        state({
          kind: 'list',
          body: 'Plans',
          footer: 'F',
          headerType: 'text',
          headerText: 'H',
          listButton: ' Open ',
          sections: [
            { title: ' Loans ', rows: [{ title: 'Home', description: ' 8% ' }] },
            {
              title: '',
              rows: [
                { title: 'Car', description: '' },
                { title: 'Bike', description: '' },
              ],
            },
          ],
        }),
        { clientId: 'k4' },
      ),
    ).toEqual({
      clientId: 'k4',
      type: 'list',
      body: 'Plans',
      footer: 'F',
      header: 'H',
      button: 'Open',
      sections: [
        { title: 'Loans', rows: [{ id: 'row_1', title: 'Home', description: '8%' }] },
        {
          title: null,
          rows: [
            { id: 'row_2', title: 'Car', description: null },
            { id: 'row_3', title: 'Bike', description: null },
          ],
        },
      ],
    });
    expect(
      toSendBody(
        state({ kind: 'cta_url', body: 'Pay', ctaText: ' Pay ', ctaUrl: ' https://p.example ' }),
        { clientId: 'k5' },
      ),
    ).toEqual({
      clientId: 'k5',
      type: 'cta_url',
      body: 'Pay',
      footer: null,
      header: null,
      displayText: 'Pay',
      url: 'https://p.example',
    });
  });

  it('preview placeholders', () => {
    expect(toPreview(emptyBuilder())).toMatchObject({
      kind: 'button',
      body: 'Message text',
      header: null,
      buttons: [{ id: '0', title: 'Button 1' }],
    });
    expect(toPreview(state({ headerType: 'text' })).header).toEqual({
      type: 'text',
      text: 'Header',
      fileName: null,
    });
    expect(toPreview(state({ headerType: 'image' })).header).toEqual({
      type: 'image',
      text: null,
      fileName: null,
    });
    expect(
      toPreview(state({ headerType: 'video', headerMedia: { mediaToken: 't', fileName: 'v.mp4' } }))
        .header,
    ).toEqual({ type: 'video', text: null, fileName: 'v.mp4' });
    expect(toPreview(state({ kind: 'list', headerType: 'image' }))).toMatchObject({
      kind: 'list',
      header: null,
      listButton: 'Menu',
      sections: [{ title: null, rows: [{ id: '0', title: 'Row', description: null }] }],
    });
    expect(toPreview(state({ kind: 'cta_url' })).cta).toEqual({ displayText: 'Open', url: '' });
  });
});

describe('builder dialog', () => {
  const lastBody = () => api.send.mock.calls.at(-1)?.[1];
  const openBuilder = async () => {
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <Composer
              conversation={fakeConversationDetail({
                windowExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              })}
              replyTo={null}
              onClearReply={() => undefined}
            />
          ),
        },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Interactive message' }));
    return screen.findByRole('dialog', { name: 'Interactive message' });
  };

  beforeEach(() => {
    signInAs('agent');
    api.config.mockResolvedValue(fakeInboxConfig());
    api.send.mockImplementation((_id, body) =>
      Promise.resolve(fakeOutgoing('accepted', { id: 'i1', clientId: body.clientId })),
    );
    api.upload.mockImplementation(({ kind, fileName }) =>
      Promise.resolve(fakeUpload({ kind, mediaToken: 'tok-h', fileName: fileName ?? null })),
    );
  });
  afterEach(() => vi.clearAllMocks());

  it('buttons with a text header: required errors after Send, live preview, send', async () => {
    const dialog = await openBuilder();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(within(dialog).getAllByText('Required').length).toBeGreaterThanOrEqual(2);
    expect(api.send).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Text' }));
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Header text' }),
      'EMI reminder',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Pay now?');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Footer (optional)' }),
      'Demo',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Button 1' }), 'Yes');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add button' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Button 2' }), 'yes');
    expect(within(dialog).getByText('Each button needs its own title')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Button 2' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Button 2' }), 'Later');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add button' }));
    expect(within(dialog).getByRole('button', { name: 'Add button' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove button 3' }));
    const preview = within(dialog).getByRole('figure', { name: 'Preview' });
    expect(within(preview).getByText('EMI reminder')).toBeInTheDocument();
    expect(within(preview).getByText('Pay now?')).toBeInTheDocument();
    expect(within(preview).getByText('Later')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(lastBody()).toMatchObject({
        type: 'buttons',
        body: 'Pay now?',
        footer: 'Demo',
        header: { type: 'text', text: 'EMI reminder' },
        buttons: [
          { id: 'btn_1', title: 'Yes' },
          { id: 'btn_2', title: 'Later' },
        ],
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Interactive message' })).toBeNull();
  });

  it('too long shows at once; media header upload (with errors)', async () => {
    const dialog = await openBuilder();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Button 1' }), long(21));
    expect(within(dialog).getByText('At most 20 characters')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Photo' }));
    const input = within(dialog).getByLabelText('Header file');
    await userEvent.upload(input, new File(['g'], 'a.gif', { type: 'image/gif' }), {
      applyAccept: false,
    });
    expect(
      within(dialog).getByText("WhatsApp doesn't accept this type of file here."),
    ).toBeInTheDocument();
    api.upload.mockRejectedValueOnce(
      new ApiError({
        status: 413,
        code: 'WHATSAPP_MEDIA_TOO_LARGE',
        message: 'x',
        kind: 'http',
        details: [],
      }),
    );
    await userEvent.upload(input, new File(['j'], 'big.jpg', { type: 'image/jpeg' }));
    expect(
      await within(dialog).findByText('This file is too large for WhatsApp.'),
    ).toBeInTheDocument();
    api.upload.mockResolvedValueOnce(fakeUpload({ mediaToken: 'tok-0', fileName: null }));
    await userEvent.upload(input, new File(['j'], 'noname.jpg', { type: 'image/jpeg' }));
    expect(await within(dialog).findByText('File ready')).toBeInTheDocument();
    await userEvent.upload(input, new File(['j'], 'logo.jpg', { type: 'image/jpeg' }));
    expect(await within(dialog).findByText('logo.jpg')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Change file' })).toBeInTheDocument();
    // no file picked: nothing happens
    fireEvent.change(input, { target: { files: [] } });
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Button 1' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Button 1' }), 'OK');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Look');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(lastBody()).toMatchObject({ header: { type: 'image', mediaToken: 'tok-h' } }),
    );
  });

  it('a media header needs a file; switching header clears it', async () => {
    api.upload.mockImplementationOnce(({ onProgress }) => {
      onProgress?.(50);
      return new Promise(() => undefined);
    });
    const dialog = await openBuilder();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Document' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(within(dialog).getByText('Add a file')).toBeInTheDocument();
    await userEvent.upload(
      within(dialog).getByLabelText('Header file'),
      new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }),
    );
    expect(await within(dialog).findByLabelText('Uploading header')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'No header' }));
    expect(within(dialog).queryByLabelText('Header file')).toBeNull();
  });

  it('list: sections and rows with limits; send', async () => {
    api.config.mockResolvedValue(fakeInboxConfig({ limits: { listRowsMax: 3 } }));
    const dialog = await openBuilder();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Text' }));
    await userEvent.click(within(dialog).getByRole('tab', { name: 'List' }));
    // a text header stays; media choices are not offered for lists
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Header' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['No header', 'Text']);
    await userEvent.click(screen.getByRole('option', { name: 'No header' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Pick a plan');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Menu button text' }),
      'Plans',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Row 1' }), 'Home loan');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Description (optional)' }),
      '8.5%',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add row' }));
    const descriptions = within(dialog).getAllByRole('textbox', { name: 'Description (optional)' });
    await userEvent.type(descriptions[1] as HTMLElement, 'x');
    expect(descriptions[0]).toHaveValue('8.5%');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove row 2 of section 1' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add section' }));
    expect(within(dialog).getByRole('textbox', { name: 'Section 1 title' })).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Section 1 title' }), 'Loans');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Section 2 title' }), 'Cards');
    const rows = within(dialog).getAllByRole('textbox', { name: 'Row 1' });
    await userEvent.type(rows[1] as HTMLElement, 'Gold card');
    const addRows = within(dialog).getAllByRole('button', { name: 'Add row' });
    await userEvent.click(addRows[1] as HTMLElement);
    expect(within(dialog).getByText('3 / 3 rows')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add section' })).toBeDisabled();
    await userEvent.type(
      within(dialog).getAllByRole('textbox', { name: 'Row 2' })[0] as HTMLElement,
      'Silver',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(lastBody()).toMatchObject({
        type: 'list',
        button: 'Plans',
        header: null,
        sections: [
          { title: 'Loans', rows: [{ id: 'row_1', title: 'Home loan', description: '8.5%' }] },
          {
            title: 'Cards',
            rows: [
              { id: 'row_2', title: 'Gold card' },
              { id: 'row_3', title: 'Silver' },
            ],
          },
        ],
      }),
    );
  });

  it('list: removing a section; long descriptions flagged', async () => {
    const dialog = await openBuilder();
    await userEvent.click(within(dialog).getByRole('tab', { name: 'List' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add section' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove section 2' }));
    expect(within(dialog).getByRole('button', { name: 'Remove section 1' })).toBeDisabled();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Description (optional)' }),
      long(73),
    );
    expect(within(dialog).getByText('At most 72 characters')).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Section 1 title (optional)' }),
      long(25),
    );
    expect(within(dialog).getByText('At most 24 characters')).toBeInTheDocument();
  });

  it('link button: https only; cancel closes', async () => {
    const dialog = await openBuilder();
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Link button' }));
    expect(within(dialog).getByText('Only https:// links')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Message' }), 'Pay online');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Button text' }), 'Pay');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Link' }),
      'http://pay.example.com',
    );
    expect(within(dialog).getByText('Must be an https:// link')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Link' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(within(dialog).getByText('Must be an https:// link')).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Link' }),
      'https://pay.example.com',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(lastBody()).toMatchObject({
        type: 'cta_url',
        displayText: 'Pay',
        url: 'https://pay.example.com',
      }),
    );
  });

  it('cancel', async () => {
    const dialog = await openBuilder();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
