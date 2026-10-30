import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import { templatesApi } from '@/services/api/templates';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';
import { fakeTemplate, fakeTemplateListItem } from '@/test/templates';
import { mockViewport } from '@/test/viewport';
import { fakeChannel, fakeWhatsAppConfig } from '@/test/whatsapp';

import { callPermissionState } from './builder/model';
import { TemplateBuilder, type TemplateBuilderProps } from './builder/TemplateBuilder';

vi.mock('@/services/api/templates', () => ({
  templatesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    edit: vi.fn(),
    submit: vi.fn(),
    remove: vi.fn(),
    setVariables: vi.fn(),
    sync: vi.fn(),
    callPermission: vi.fn(),
    uploadMedia: vi.fn(),
  },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));

const api = vi.mocked(templatesApi);
const http = (
  status: number,
  code: string,
  message = 'Server said no',
  details: ApiError['details'] = [],
) => new ApiError({ status, code, message, kind: 'http', details });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  vi.spyOn(whatsappApi, 'config').mockResolvedValue(fakeWhatsAppConfig());
  vi.spyOn(whatsappApi, 'channels').mockResolvedValue({
    items: [fakeChannel()],
    counts: { connected: 1 },
    limit: 10,
  });
  vi.mocked(customFieldsApi.list).mockResolvedValue([
    {
      id: 'f1',
      key: 'emi_amount',
      label: 'EMI amount',
      type: 'currency',
      required: false,
      defaultValue: null,
      order: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ]);
  api.list.mockResolvedValue([
    fakeTemplateListItem('APPROVED'),
    fakeTemplateListItem('REJECTED', 'MARKETING', {
      id: 'tpl2',
      name: 'diwali_offer',
      language: 'hi',
      statusReason: { reason: 'INVALID_FORMAT', title: null, description: null },
    }),
  ]);
  api.get.mockImplementation((id: string) =>
    Promise.resolve(
      id === 'tpl2'
        ? fakeTemplate('REJECTED', 'MARKETING', undefined, {
            id: 'tpl2',
            name: 'diwali_offer',
            statusReason: { reason: 'INVALID_FORMAT', title: null, description: null },
          })
        : fakeTemplate(),
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const openTab = async (
  role: Parameters<typeof signInAs>[0] = 'owner',
  realtime = fakeRealtime(),
) => {
  signInAs(role);
  renderWithProviders({ route: '/whatsapp/templates', realtime: realtime.client });
  const table = await screen.findByRole('table', { name: 'Templates' });
  await within(table).findByText('emi_reminder');
  return { table, realtime };
};

describe('Templates tab', () => {
  it('lists name, language, category, status (+ reason), quality, number and usage', async () => {
    const { table } = await openTab();
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const emi = within(rows[1] as HTMLElement);
    expect(emi.getByText('English')).toBeInTheDocument();
    expect(emi.getByText('Utility')).toBeInTheDocument();
    expect(emi.getByText('Approved')).toBeInTheDocument();
    expect(emi.getByText('High quality')).toBeInTheDocument();
    expect(emi.getByText('Support line')).toBeInTheDocument();
    expect(emi.getByText('12 · 7')).toBeInTheDocument();
    const offer = within(rows[2] as HTMLElement);
    expect(offer.getByText('Hindi')).toBeInTheDocument();
    await userEvent.hover(offer.getByText('Rejected'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/format is not valid/);
  });

  it('filters by status, category, language and search (debounced)', async () => {
    await openTab();
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Approved' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ status: ['APPROVED'] }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    await userEvent.click(screen.getByRole('option', { name: 'Marketing' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ status: ['APPROVED'], category: 'MARKETING' }),
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'emi');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        status: ['APPROVED'],
        category: 'MARKETING',
        q: 'emi',
      }),
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await userEvent.click(screen.getByRole('option', { name: 'Hindi' }));
    const table = screen.getByRole('table', { name: 'Templates' });
    await waitFor(() => expect(within(table).queryByText('emi_reminder')).toBeNull());
    expect(within(table).getByText('diwali_offer')).toBeInTheDocument();
  });

  it('several numbers: a number filter; empty results say so', async () => {
    vi.mocked(whatsappApi.channels).mockResolvedValue({
      items: [
        fakeChannel(),
        fakeChannel({ id: 'wa2', label: 'Sales line' }),
        fakeChannel({ id: 'wa3', status: 'disconnected' }),
      ],
      counts: { connected: 2, disconnected: 1 },
      limit: 10,
    });
    await openTab();
    await userEvent.click(screen.getByRole('combobox', { name: 'Number' }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    api.list.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('option', { name: 'Sales line' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ channelId: 'wa2' }));
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
  });

  it('WhatsApp off, no number, load errors', async () => {
    vi.mocked(whatsappApi.config).mockResolvedValue(fakeWhatsAppConfig({ enabled: false }));
    signInAs('owner');
    const first = renderWithProviders({ route: '/whatsapp/templates' });
    expect(await screen.findByText(/isn't set up on this server/)).toBeInTheDocument();
    first.unmount();
    vi.mocked(whatsappApi.config).mockResolvedValue(fakeWhatsAppConfig());
    vi.mocked(whatsappApi.channels).mockResolvedValue({ items: [], counts: {}, limit: 10 });
    const second = renderWithProviders({ route: '/whatsapp/templates' });
    expect(await screen.findByText('Connect a WhatsApp number first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Numbers' })).toHaveAttribute(
      'href',
      '/whatsapp/numbers',
    );
    second.unmount();
    vi.mocked(whatsappApi.config).mockRejectedValue(http(503, 'WHATSAPP_NOT_CONFIGURED'));
    const third = renderWithProviders({ route: '/whatsapp/templates' });
    expect(await screen.findByText(/isn't set up on this server/)).toBeInTheDocument();
    third.unmount();
    vi.mocked(whatsappApi.config).mockRejectedValue(http(500, 'INTERNAL_ERROR'));
    renderWithProviders({ route: '/whatsapp/templates' });
    expect(await screen.findByText(/Couldn't load the WhatsApp settings/)).toBeInTheDocument();
  });

  it('agents, viewers and impersonators read only', async () => {
    for (const role of ['agent', 'viewer'] as const) {
      const view = await openTab(role);
      expect(screen.queryByRole('button', { name: 'Create template' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
      expect(screen.getByText(/Only owners, admins and managers/)).toBeInTheDocument();
      void view;
      cleanup();
    }
    signInAs('owner', { impersonation: { by: 'x' } as never });
    renderWithProviders({ route: '/whatsapp/templates' });
    await screen.findByRole('table', { name: 'Templates' });
    expect(screen.queryByRole('button', { name: 'Create template' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'emi_reminder' }));
    const drawer = await screen.findByRole('region', { name: 'Template details' });
    await within(drawer).findByRole('figure', { name: 'Template preview' });
    expect(within(drawer).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(drawer).getByRole('combobox', { name: '{{1}}' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Sync now reports what changed and the rate limit', async () => {
    await openTab();
    api.sync.mockResolvedValueOnce({ created: 2, updated: 1, deleted: 0, unchanged: 5 });
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(
      await screen.findByText('Templates synced: 2 new, 1 updated, 0 removed'),
    ).toBeInTheDocument();
    expect(api.sync).toHaveBeenCalledWith('wa1');
    api.sync.mockRejectedValueOnce(http(429, 'RATE_LIMITED', 'Too many'));
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(
      await screen.findByText('Too many tries. Wait a minute and try again.'),
    ).toBeInTheDocument();
  });

  it('a status change arrives live', async () => {
    api.list.mockResolvedValue([fakeTemplateListItem('PENDING')]);
    const rt = fakeRealtime();
    signInAs('owner');
    renderWithProviders({ route: '/whatsapp/templates', realtime: rt.client });
    const table = await screen.findByRole('table', { name: 'Templates' });
    expect(await within(table).findByText('In review')).toBeInTheDocument();
    api.list.mockResolvedValue([fakeTemplateListItem('APPROVED')]);
    act(() => {
      rt.emit('whatsapp.template.updated', {
        templateId: 'tpl1',
        status: 'APPROVED',
        quality: 'GREEN',
        category: 'UTILITY',
      });
    });
    expect(await within(table).findByText('Approved')).toBeInTheDocument();
  });
});

describe('Template details drawer', () => {
  it('preview, usage, history; variable values saved per source', async () => {
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'emi_reminder' }));
    const drawer = await screen.findByRole('region', { name: 'Template details' });
    const figure = await within(drawer).findByRole('figure', { name: 'Template preview' });
    expect(figure).toHaveTextContent('EMI for Asha');
    expect(figure).toHaveTextContent('Namaste Asha, your EMI of ₹12,500.00 is due soon.');
    expect(
      within(drawer).getByText(/12 sent · 10 delivered · 7 read · 1 failed/),
    ).toBeInTheDocument();
    expect(within(drawer).getByRole('region', { name: 'Status history' })).toHaveTextContent(
      'approved by WhatsApp',
    );
    api.setVariables.mockResolvedValue(fakeTemplate());
    const save = within(drawer).getByRole('button', { name: 'Save variable values' });
    expect(save).toBeDisabled();
    await userEvent.click(within(drawer).getByRole('combobox', { name: '{{1}}' }));
    await userEvent.click(screen.getByRole('option', { name: 'Contact name' }));
    await userEvent.click(within(drawer).getByRole('combobox', { name: '{{2}}' }));
    await userEvent.click(screen.getByRole('option', { name: 'Custom field' }));
    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Custom field' }));
    await userEvent.click(await screen.findByRole('option', { name: 'EMI amount' }));
    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Button 2 variable' }));
    await userEvent.click(screen.getByRole('option', { name: 'Fixed text' }));
    await userEvent.type(within(drawer).getByRole('textbox', { name: 'Fixed text' }), 'LN-1');
    await userEvent.click(save);
    await waitFor(() =>
      expect(api.setVariables).toHaveBeenCalledWith('tpl1', [
        { key: 'header_1', kind: 'ask', value: null },
        { key: '1', kind: 'contact.name', value: null },
        { key: '2', kind: 'field', value: 'emi_amount' },
        { key: 'button_1', kind: 'static', value: 'LN-1' },
      ]),
    );
    expect(await screen.findByText('Variable values saved')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close details' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Template details' })).toBeNull(),
    );
  });

  it('a rejected template shows the reason → Edit and resubmit opens the builder', async () => {
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'diwali_offer' }));
    const drawer = await screen.findByRole('region', { name: 'Template details' });
    expect(await within(drawer).findByText(/format is not valid/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Edit and resubmit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit template' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    api.edit.mockResolvedValue(fakeTemplate('PENDING', 'MARKETING', undefined, { id: 'tpl2' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(api.edit).toHaveBeenCalledTimes(1));
    expect(api.edit.mock.calls[0]?.[1]).toMatchObject({ category: 'MARKETING' });
    expect(api.edit.mock.calls[0]?.[1]).not.toHaveProperty('name');
    expect(await screen.findByText('Sent to WhatsApp for review')).toBeInTheDocument();
  });

  it('unsupported / authentication templates are read only with a WhatsApp Manager link', async () => {
    api.get.mockResolvedValue(
      fakeTemplate('APPROVED', 'AUTHENTICATION', undefined, { editable: false }),
    );
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'emi_reminder' }));
    const drawer = await screen.findByRole('region', { name: 'Template details' });
    expect(await within(drawer).findByText(/managed in WhatsApp Manager/)).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /Edit in WhatsApp Manager/ })).toHaveAttribute(
      'href',
      'https://business.facebook.com/wa/manage/message-templates/',
    );
    expect(within(drawer).queryByRole('button', { name: 'Edit' })).toBeNull();
    api.get.mockResolvedValue(
      fakeTemplate('APPROVED', 'UTILITY', [{ type: 'CAROUSEL' }], { editable: false }),
    );
    cleanup();
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'emi_reminder' }));
    expect(await screen.findByText(/uses parts this app can’t edit/)).toBeInTheDocument();
  });

  it('a draft is submitted; delete asks this language or every language', async () => {
    api.get.mockResolvedValue(fakeTemplate('DRAFT'));
    api.submit
      .mockRejectedValueOnce(http(422, 'VALIDATION_ERROR', 'Upload an example file'))
      .mockResolvedValueOnce(fakeTemplate('PENDING'));
    api.remove.mockResolvedValue({ deleted: 2 });
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'emi_reminder' }));
    const drawer = await screen.findByRole('region', { name: 'Template details' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText('Upload an example file')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText('Sent to WhatsApp for review')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete template?' });
    expect(dialog).toHaveTextContent(/blocked for 30 days/);
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Every language of emi_reminder' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('tpl1', 'name'));
    expect(await screen.findByText('2 templates deleted')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Template details' })).toBeNull(),
    );
  });

  it('a load error shows in the drawer; a paused template says until when', async () => {
    api.get.mockRejectedValueOnce(http(404, 'TEMPLATE_NOT_FOUND', 'Template not found.'));
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'emi_reminder' }));
    expect(await screen.findByText('Template not found.')).toBeInTheDocument();
  });
});

const renderBuilder = (props: Partial<TemplateBuilderProps> = {}) => {
  signInAs('owner');
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <TemplateBuilder open channelId="wa1" onClose={onClose} onSaved={onSaved} {...props} />
        ),
      },
    ],
  });
  return { onClose, onSaved, dialog: screen.getByRole('dialog') };
};

describe('Template builder', () => {
  it('builds a utility template with variables, footer and buttons; preview follows', async () => {
    const { dialog, onClose, onSaved } = renderBuilder();
    const d = within(dialog);
    expect(d.getByRole('heading', { name: 'Create template' })).toBeInTheDocument();
    await userEvent.type(d.getByRole('textbox', { name: 'Name' }), 'EMI Reminder');
    expect(d.getByRole('textbox', { name: 'Name' })).toHaveValue('emi_reminder');
    const body = d.getByRole('textbox', { name: 'Message' });
    await userEvent.type(body, 'Namaste');
    await userEvent.click(d.getAllByRole('button', { name: 'Add variable' })[0] as HTMLElement);
    await userEvent.type(body, ', pay today.');
    expect(body).toHaveValue('Namaste {{1}}, pay today.');
    await userEvent.type(d.getByRole('textbox', { name: 'Sample for {{1}}' }), 'Asha');
    await userEvent.type(d.getByRole('textbox', { name: 'Footer (optional)' }), 'Demo Finance');
    await userEvent.click(d.getByRole('button', { name: 'Add button' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Quick reply/ }));
    await userEvent.type(d.getByRole('textbox', { name: 'Button text' }), 'Paid');
    await userEvent.click(d.getByRole('button', { name: 'Add button' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Website/ }));
    const site = within(d.getByRole('group', { name: 'Website button 2' }));
    await userEvent.type(site.getByRole('textbox', { name: 'Button text' }), 'Pay now');
    await userEvent.type(
      site.getByRole('textbox', { name: 'Website address' }),
      'https://pay.example.com/',
    );
    await userEvent.click(site.getByRole('switch', { name: /variable at the end/ }));
    await userEvent.type(site.getByRole('textbox', { name: 'Example end of the address' }), 'LN-1');
    // grouping: the website button can't move above the quick reply in a way that splits it (only 2 → ok)
    expect(site.getByRole('button', { name: 'Move Website button 2 up' })).toBeEnabled();
    const figure = d.getByRole('figure', { name: 'Template preview' });
    expect(figure).toHaveTextContent('Namaste Asha, pay today.');
    expect(figure).toHaveTextContent('Demo Finance');
    expect(within(figure).getByRole('list', { name: 'Buttons' })).toHaveTextContent('PaidPay now');
    api.create.mockResolvedValue(fakeTemplate('PENDING'));
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith({
      channelId: 'wa1',
      name: 'emi_reminder',
      language: 'en',
      category: 'UTILITY',
      parameterFormat: 'positional',
      components: [
        { type: 'BODY', text: 'Namaste {{1}}, pay today.', example: { body_text: [['Asha']] } },
        { type: 'FOOTER', text: 'Demo Finance' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Paid' },
            {
              type: 'URL',
              text: 'Pay now',
              url: 'https://pay.example.com/{{1}}',
              example: ['https://pay.example.com/LN-1'],
            },
          ],
        },
      ],
      ttlSeconds: null,
      submit: true,
    });
    expect(api.submit).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows every validator error on submit and the name error while typing', async () => {
    const { dialog } = renderBuilder();
    const d = within(dialog);
    await userEvent.type(d.getByRole('textbox', { name: 'Name' }), '1');
    await userEvent.clear(d.getByRole('textbox', { name: 'Name' }));
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    expect(d.getByText('1–512 characters')).toBeInTheDocument();
    expect(d.getByText('1–1024 characters')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    // header text variable needs a sample; a body variable at the start is refused
    await userEvent.type(d.getByRole('textbox', { name: 'Name' }), 'x');
    await userEvent.click(d.getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Text' }));
    await userEvent.type(d.getByRole('textbox', { name: 'Header text' }), 'EMI');
    await userEvent.click(d.getAllByRole('button', { name: 'Add variable' })[0] as HTMLElement);
    expect(d.getAllByRole('button', { name: 'Add variable' })[0]).toBeDisabled();
    expect(d.getByText('Add an example for the header variable')).toBeInTheDocument();
    await userEvent.type(d.getByRole('textbox', { name: 'Message' }), '{{{{1}} hi');
    expect(d.getByText("The message can't start or end with a variable")).toBeInTheDocument();
    expect(d.getByText('Add a sample value')).toBeInTheDocument();
  });

  it('save draft; a server field error lands on the field; a conflict shows its text', async () => {
    const { dialog } = renderBuilder();
    const d = within(dialog);
    await userEvent.type(d.getByRole('textbox', { name: 'Name' }), 'emi');
    await userEvent.type(d.getByRole('textbox', { name: 'Message' }), 'Pay today.');
    api.create.mockRejectedValueOnce(
      http(422, 'VALIDATION_ERROR', 'Invalid', [{ path: 'body.name', message: 'Taken name' }]),
    );
    await userEvent.click(d.getByRole('button', { name: 'Save draft' }));
    expect(await d.findByText('Taken name')).toBeInTheDocument();
    expect(d.getByText('Fix the highlighted fields.')).toBeInTheDocument();
    api.create.mockRejectedValueOnce(
      http(409, 'TEMPLATE_NAME_TAKEN', 'x', [{ path: 'purpose', message: 'One per language' }]),
    );
    await userEvent.click(d.getByRole('button', { name: 'Save draft' }));
    expect(await d.findByText(/already exists/)).toBeInTheDocument();
    expect(d.getByText('One per language')).toBeInTheDocument();
    api.create.mockResolvedValueOnce(fakeTemplate('DRAFT'));
    await userEvent.click(d.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ submit: false })),
    );
    expect(await screen.findByText('Draft saved')).toBeInTheDocument();
  });

  it('media header: type / size errors, upload progress, cancel, then submit', async () => {
    const { dialog } = renderBuilder();
    const d = within(dialog);
    await userEvent.type(d.getByRole('textbox', { name: 'Name' }), 'offer');
    await userEvent.type(d.getByRole('textbox', { name: 'Message' }), 'See the offer.');
    await userEvent.click(d.getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Image' }));
    const input = d.getByLabelText('Example file');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    });
    expect(d.getByText('Use a JPEG or PNG image')).toBeInTheDocument();
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(d.getByText(/at most 5.0 MB/)).toBeInTheDocument();
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.change(input, {
      target: { files: [new File(['png'], 'offer.png', { type: 'image/png' })] },
    });
    expect(d.getByText(/offer.png · /)).toBeInTheDocument();
    expect(d.getByRole('figure', { name: 'Template preview' })).toHaveTextContent('offer.png');
    // first try: the upload is canceled → the draft stays, retry goes on the same draft
    api.create.mockResolvedValue(
      fakeTemplate('DRAFT', 'UTILITY', [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'See the offer.' },
      ]),
    );
    api.uploadMedia.mockImplementationOnce((_id, input) => {
      input.onProgress?.(40);
      return new Promise((_resolve, reject) => {
        input.signal?.addEventListener('abort', () =>
          reject(
            new ApiError({ status: 0, code: 'CANCELED', message: 'canceled', kind: 'canceled' }),
          ),
        );
      });
    });
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    expect(await d.findByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    await userEvent.click(d.getByRole('button', { name: 'Cancel upload' }));
    expect(await d.findByText(/Upload canceled/)).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ submit: false }));
    api.edit.mockResolvedValue(fakeTemplate('DRAFT'));
    api.uploadMedia.mockResolvedValue(fakeTemplate('DRAFT'));
    api.submit.mockResolvedValue(fakeTemplate('PENDING'));
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('tpl1'));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.edit).toHaveBeenCalledTimes(1);
    expect(api.uploadMedia).toHaveBeenLastCalledWith(
      'tpl1',
      expect.objectContaining({ fileName: 'offer.png' }),
    );
  });

  it('a video / document header takes MP4 / PDF; location needs nothing', async () => {
    const { dialog } = renderBuilder();
    const d = within(dialog);
    await userEvent.click(d.getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Video' }));
    fireEvent.change(d.getByLabelText('Example file'), {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
    });
    expect(d.getByText('Use an MP4 video')).toBeInTheDocument();
    await userEvent.click(d.getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Document' }));
    fireEvent.change(d.getByLabelText('Example file'), {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
    });
    expect(d.getByText('Use a PDF')).toBeInTheDocument();
    fireEvent.change(d.getByLabelText('Example file'), { target: { files: [] } });
    await userEvent.click(d.getByRole('combobox', { name: 'Header' }));
    await userEvent.click(screen.getByRole('option', { name: 'Location' }));
    expect(d.getByText('The location is chosen when the template is sent.')).toBeInTheDocument();
  });

  it('editing an approved template: the edit limits notice; category and name fixed', async () => {
    const approved = fakeTemplate('APPROVED', 'UTILITY', undefined, {
      editsLast30Days: 3,
      nextEditAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const { dialog } = renderBuilder({ template: approved });
    const d = within(dialog);
    expect(d.getByText(/edited once a day and 10 times in 30 days/)).toHaveTextContent(
      'Edits in the last 30 days: 3',
    );
    expect(d.getByText(/Next edit/)).toBeInTheDocument();
    expect(d.getByRole('radio', { name: /Marketing/ })).toBeDisabled();
    expect(d.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(d.queryByRole('button', { name: 'Save draft' })).toBeNull();
    const footer = d.getByRole('textbox', { name: 'Footer (optional)' });
    await userEvent.clear(footer);
    await userEvent.type(footer, 'Team Demo');
    api.edit.mockResolvedValue(fakeTemplate('PENDING'));
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(api.edit).toHaveBeenCalledTimes(1));
    const [id, patch] = api.edit.mock.calls[0] ?? [];
    expect(id).toBe('tpl1');
    expect(patch).not.toHaveProperty('category');
    expect(JSON.stringify(patch)).toContain('Team Demo');
  });

  it('a draft media template with an uploaded example edits, then submits', async () => {
    const draft = fakeTemplate(
      'DRAFT',
      'MARKETING',
      [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Offer' },
      ],
      {
        headerMedia: { mimeType: 'image/png', size: 10, fileName: 'old.png', uploaded: true },
      },
    );
    const { dialog } = renderBuilder({ template: draft });
    const d = within(dialog);
    expect(d.getByText('old.png · uploaded')).toBeInTheDocument();
    api.edit.mockResolvedValue(draft);
    api.submit.mockResolvedValue({ ...draft, status: 'PENDING' });
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('tpl1'));
    expect(api.uploadMedia).not.toHaveBeenCalled();
  });

  it('a rejected media template: a new example is uploaded before the edit', async () => {
    const rejected = fakeTemplate(
      'REJECTED',
      'MARKETING',
      [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Offer' },
      ],
      {
        headerMedia: { mimeType: 'image/png', size: 10, fileName: 'old.png', uploaded: true },
      },
    );
    const { dialog } = renderBuilder({ template: rejected });
    const d = within(dialog);
    fireEvent.change(d.getByLabelText('Example file'), {
      target: { files: [new File(['p'], 'new.png', { type: 'image/png' })] },
    });
    api.uploadMedia.mockResolvedValue(rejected);
    api.edit.mockResolvedValue({ ...rejected, status: 'PENDING' });
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(api.edit).toHaveBeenCalled());
    expect(api.uploadMedia.mock.invocationCallOrder[0]).toBeLessThan(
      api.edit.mock.invocationCallOrder[0] ?? 0,
    );
    expect(api.edit.mock.calls[0]?.[1]).toMatchObject({ category: 'MARKETING' });
  });

  it('named variables, copy code, phone and voice call buttons; button order and removal', async () => {
    const { dialog } = renderBuilder();
    const d = within(dialog);
    await userEvent.click(d.getByRole('button', { name: /Named/ }));
    await userEvent.type(d.getByRole('textbox', { name: 'Variable name' }), 'First Name');
    await userEvent.click(d.getAllByRole('button', { name: 'Add variable' })[0] as HTMLElement);
    expect(d.getByRole('textbox', { name: 'Message' })).toHaveValue('{{first_name}}');
    for (const type of [/Phone number/, /Copy code/, /Call on WhatsApp/]) {
      await userEvent.click(d.getByRole('button', { name: 'Add button' }));
      await userEvent.click(screen.getByRole('menuitem', { name: type }));
    }
    await userEvent.click(d.getByRole('button', { name: 'Add button' }));
    expect(screen.getByRole('menuitem', { name: /Phone number/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.type(
      within(d.getByRole('group', { name: 'Phone number button 1' })).getByRole('textbox', {
        name: 'Phone number',
      }),
      '+919000000001',
    );
    await userEvent.type(
      within(d.getByRole('group', { name: 'Copy code button 2' })).getByRole('textbox', {
        name: 'Example code',
      }),
      'SAVE10',
    );
    expect(d.getByRole('figure', { name: 'Template preview' })).toHaveTextContent(
      'Copy code SAVE10',
    );
    await userEvent.click(d.getByRole('button', { name: 'Move Copy code button 2 up' }));
    expect(d.getByRole('group', { name: 'Copy code button 1' })).toBeInTheDocument();
    await userEvent.click(d.getByRole('button', { name: 'Move Copy code button 1 down' }));
    await userEvent.click(d.getByRole('button', { name: 'Remove Call on WhatsApp button 3' }));
    expect(d.queryByRole('group', { name: /Call on WhatsApp/ })).toBeNull();
    await userEvent.click(d.getByRole('button', { name: 'Cancel' }));
  });

  it('time to live in Advanced', async () => {
    const { dialog } = renderBuilder();
    const d = within(dialog);
    await userEvent.click(d.getByRole('button', { name: 'Advanced' }));
    const ttl = d.getByRole('spinbutton', { name: 'Message expiry (seconds)' });
    await userEvent.type(ttl, '10');
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    expect(d.getByText('Between 30 seconds and 30 days')).toBeInTheDocument();
    await userEvent.clear(ttl);
    expect(d.queryByText('Between 30 seconds and 30 days')).toBeNull();
  });

  it('the call permission template: body + language only, sent to its own endpoint', async () => {
    const { dialog } = renderBuilder({ initial: callPermissionState() });
    const d = within(dialog);
    expect(d.getByRole('heading', { name: 'Create call permission template' })).toBeInTheDocument();
    expect(d.queryByRole('region', { name: 'Buttons' })).toBeNull();
    expect(d.getByRole('figure', { name: 'Template preview' })).toHaveTextContent(
      'Allow calls from this business?',
    );
    await userEvent.click(d.getByRole('combobox', { name: 'Language' }));
    await userEvent.click(screen.getByRole('option', { name: 'Hindi (hi)' }));
    expect(d.getByRole('textbox', { name: 'Name' })).toHaveValue('call_permission_hi');
    api.callPermission.mockResolvedValue(
      fakeTemplate('PENDING', 'UTILITY', undefined, { purpose: 'call_permission' }),
    );
    await userEvent.click(d.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() =>
      expect(api.callPermission).toHaveBeenCalledWith({
        channelId: 'wa1',
        language: 'hi',
        body: callPermissionState().body,
        submit: true,
      }),
    );
  });

  it('the call permission switch turns a new template into one (and back)', async () => {
    const { dialog } = renderBuilder();
    const d = within(dialog);
    const toggle = d.getByRole('switch', { name: /call permission template/ });
    await userEvent.click(toggle);
    expect(d.queryByRole('region', { name: 'Buttons' })).toBeNull();
    await userEvent.click(toggle);
    expect(d.getByRole('region', { name: 'Buttons' })).toBeInTheDocument();
  });

  it('opens from the tab: Create template and Create call permission template', async () => {
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'Create template' }));
    expect(await screen.findByRole('dialog', { name: 'Create template' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create call permission template' }));
    expect(
      await screen.findByRole('dialog', { name: 'Create call permission template' }),
    ).toBeInTheDocument();
  });

  it('is full screen on a phone', () => {
    mockViewport(375);
    renderBuilder();
    expect(document.querySelector('.MuiDialog-paperFullScreen')).not.toBeNull();
  });
});

describe('chips', () => {
  it('a category WhatsApp changed says what it was; unknown quality', async () => {
    api.list.mockResolvedValue([
      fakeTemplateListItem('APPROVED', 'MARKETING', { previousCategory: 'UTILITY', quality: null }),
    ]);
    await openTab();
    const table = screen.getByRole('table', { name: 'Templates' });
    expect(within(table).getByText('Marketing (was Utility)')).toBeInTheDocument();
    expect(within(table).getByText('Quality not rated yet')).toBeInTheDocument();
  });
});
