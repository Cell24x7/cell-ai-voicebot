import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminWhatsappBillingApi } from '@/services/api/admin-whatsapp-billing';
import { templatesApi } from '@/services/api/templates';
import type { WhatsAppTemplate, WhatsAppTemplateListItem } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { RealtimeContext } from '@/services/realtime/context';
import { WS_EVENT_TYPES } from '@/services/realtime/events';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';
import {
  EMI_COMPONENTS,
  fakeMarginRow,
  fakePricePreview,
  fakeRateCard,
  fakeReconcileRow,
  fakeTemplate,
  fakeTemplateListItem,
} from '@/test/templates';

import { templateKeys, whatsappBillingKeys } from './keys';
import {
  languageLabel,
  reasonText,
  TEMPLATE_CATEGORY,
  TEMPLATE_ERROR_TEXT,
  TEMPLATE_QUALITY,
  TEMPLATE_STATUS,
} from './labels';
import { HEADER_EXAMPLE_TYPES, TEMPLATE_LIMITS } from './limits';
import { buildPreview } from './preview';
import {
  storeTemplate,
  TEMPLATE_POLL_MS,
  useCanManageTemplates,
  useCreateCallPermissionTemplate,
  useCreateTemplate,
  useDeleteTemplate,
  useEditTemplate,
  useImportWhatsAppRates,
  usePricePreview,
  useSaveWhatsAppRates,
  useSetAccountWhatsAppBilling,
  useSetVariableSources,
  useSubmitTemplate,
  useSyncTemplates,
  useTemplate,
  useTemplateLiveUpdates,
  useTemplates,
  useUpdateWhatsAppBillingSettings,
  useUploadTemplateMedia,
  useWhatsAppBillingSettings,
  useWhatsAppMargin,
  useWhatsAppRates,
  useWhatsAppReconciliation,
} from './queries';
import {
  copyCodeKey,
  extractVariables,
  headerFormat,
  headerKey,
  placeholdersIn,
  renderText,
  sampleValues,
  urlButtonKey,
} from './variables';

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
vi.mock('@/services/api/admin-whatsapp-billing', () => ({
  adminWhatsappBillingApi: {
    rates: vi.fn(),
    importRates: vi.fn(),
    saveRates: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    setAccountBilling: vi.fn(),
    margin: vi.fn(),
    marginCsv: vi.fn(),
    reconciliation: vi.fn(),
  },
}));

const api = vi.mocked(templatesApi);
const admin = vi.mocked(adminWhatsappBillingApi);

describe('variables (mirror of the backend)', () => {
  it('finds placeholders, keys and examples of header, body, URL and copy code', () => {
    expect(placeholdersIn('Hi {{1}} and {{ Name }}')).toEqual(['1', 'name']);
    const vars = extractVariables(
      [
        ...EMI_COMPONENTS.slice(0, 3),
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Pay',
              url: 'https://pay.example.com/{{1}}',
              example: ['https://pay.example.com/LN-1'],
            },
            { type: 'URL', text: 'Other', url: 'https://x.example/{{1}}', example: ['LN-2'] },
            { type: 'COPY_CODE', example: 'SAVE10' },
            { type: 'URL', text: 'Plain', url: 'https://plain.example' },
          ],
        },
      ],
      'positional',
    );
    expect(vars).toEqual([
      { key: 'header_1', component: 'header', index: 0, example: 'Asha' },
      { key: '1', component: 'body', index: 0, example: 'Asha' },
      { key: '2', component: 'body', index: 0, example: '₹12,500.00' },
      { key: 'button_0', component: 'button', index: 0, example: 'LN-1' },
      { key: 'button_1', component: 'button', index: 1, example: 'LN-2' },
      { key: 'copy_code_2', component: 'button', index: 2, example: 'SAVE10' },
    ]);
    expect(headerKey('1', 'positional')).toBe('header_1');
    expect(headerKey('month', 'named')).toBe('month');
    expect(urlButtonKey(1)).toBe('button_1');
    expect(copyCodeKey(0)).toBe('copy_code_0');
    expect(sampleValues(vars.slice(0, 2))).toEqual({ header_1: 'Asha', 1: 'Asha' });
  });

  it('named variables keep their names; repeats and missing examples', () => {
    const vars = extractVariables(
      [
        {
          type: 'HEADER',
          format: 'TEXT',
          text: 'For {{first_name}}',
          example: { header_text_named_params: [{ param_name: 'first_name', example: 'Asha' }] },
        },
        { type: 'BODY', text: 'Hi {{first_name}}, {{amount}} due.', example: {} },
        { type: 'BUTTONS' },
      ],
      'named',
    );
    expect(vars.map((v) => [v.key, v.example])).toEqual([
      ['first_name', 'Asha'],
      ['amount', ''],
    ]);
    expect(extractVariables([{ type: 'BODY', text: 'Hi {{1}}' }], 'positional')).toEqual([
      { key: '1', component: 'body', index: 0, example: '' },
    ]);
    expect(
      extractVariables([{ type: 'HEADER', format: 'TEXT', text: 'No vars' }], 'positional'),
    ).toEqual([]);
  });

  it('renders values, keeps missing / empty placeholders', () => {
    expect(renderText('Hi {{1}}, pay {{2}}', { 1: 'Asha', 2: '' })).toBe('Hi Asha, pay {{2}}');
    expect(renderText('Hi {{1}}', new Map([['1', 'Ravi']]))).toBe('Hi Ravi');
    expect(renderText('EMI {{1}}', { header_1: 'Oct' }, (raw) => `header_${raw}`)).toBe('EMI Oct');
    expect(headerFormat(EMI_COMPONENTS)).toBe('TEXT');
    expect(headerFormat([{ type: 'BODY', text: 'x' }])).toBe('');
  });
});

describe('preview', () => {
  it('fills samples into header, body and the URL; shows footer and buttons', () => {
    const p = buildPreview(EMI_COMPONENTS, 'positional', {
      values: { header_1: 'Asha', 1: 'Asha', 2: '₹12,500.00', button_1: 'LN-9' },
    });
    expect(p).toEqual({
      header: { kind: 'text', text: 'EMI for Asha' },
      body: 'Namaste Asha, your EMI of ₹12,500.00 is due soon. Please pay on time.',
      footer: 'Demo Finance',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Paid already' },
        { type: 'URL', text: 'Pay now', url: 'https://pay.example.com/LN-9' },
      ],
      hiddenButtons: 0,
      callPermission: false,
    });
  });

  it('media / location headers, copy code, fallbacks and "See all options" beyond 3', () => {
    const buttons = [
      { type: 'QUICK_REPLY', text: 'A' },
      { type: 'QUICK_REPLY', text: 'B' },
      { type: 'COPY_CODE', example: 'SAVE10' },
      { type: 'VOICE_CALL' },
      { type: 'CATALOG' },
      { type: 'URL', text: 'Site', url: 'https://x.example/{{1}}' },
    ];
    const image = buildPreview(
      [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Offer' },
        { type: 'BUTTONS', buttons },
      ],
      'positional',
      { headerFileName: 'offer.png' },
    );
    expect(image.header).toEqual({ kind: 'image', fileName: 'offer.png' });
    expect(image.footer).toBeNull();
    expect(image.buttons).toHaveLength(2);
    expect(image.hiddenButtons).toBe(4);
    const all = buildPreview(
      [
        { type: 'BODY', text: 'Offer' },
        { type: 'BUTTONS', buttons: buttons.slice(2) },
      ],
      'positional',
    );
    expect(all.buttons.map((b) => [b.type, b.text])).toEqual(
      [
        ['COPY_CODE', 'Copy code SAVE10'],
        ['VOICE_CALL', 'Call on WhatsApp'],
        ['OTHER', 'Button'],
        ['URL', 'Site'],
      ].slice(0, 2),
    );
    const loc = buildPreview(
      [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'x' },
      ],
      'named',
      {
        locationName: 'Jaipur branch',
      },
    );
    expect(loc.header).toEqual({ kind: 'location', name: 'Jaipur branch' });
    const permission = buildPreview(
      [{ type: 'BODY', text: 'May we call?' }, { type: 'call_permission_request' }],
      'positional',
    );
    expect(permission.callPermission).toBe(true);
    expect(permission.header).toBeNull();
    const doc = buildPreview(
      [
        { type: 'HEADER', format: 'DOCUMENT' },
        { type: 'BODY', text: 'x' },
      ],
      'positional',
    );
    expect(doc.header).toEqual({ kind: 'document', fileName: null });
    const noCode = buildPreview(
      [
        { type: 'BODY', text: 'x' },
        { type: 'BUTTONS', buttons: [{ type: 'COPY_CODE' }] },
      ],
      'positional',
    );
    expect(noCode.buttons[0]?.text).toBe('Copy code');
    // a URL without a variable keeps its address
    const plain = buildPreview(
      [
        { type: 'BODY', text: 'x' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Go', url: 'https://a.example' }] },
      ],
      'positional',
      { values: { button_0: 'ignored' } },
    );
    expect(plain.buttons[0]?.url).toBe('https://a.example');
  });
});

describe('limits and labels', () => {
  it('copies the backend TEMPLATE_LIMITS (src/config/limits.ts)', () => {
    expect(TEMPLATE_LIMITS).toMatchObject({
      nameMax: 512,
      headerTextMax: 60,
      bodyMax: 1024,
      footerMax: 60,
      buttonsMax: 10,
      quickRepliesMax: 10,
      urlButtonsMax: 2,
      phoneButtonsMax: 1,
      copyCodeButtonsMax: 1,
      voiceCallButtonsMax: 1,
      buttonTextMax: 25,
      urlMax: 2000,
      phoneMax: 20,
      copyCodeExampleMax: 20,
      variablesMax: 20,
      variableValueMax: 1024,
      headerExampleMaxBytes: { image: 5_242_880, video: 16_777_216, document: 104_857_600 },
    });
    expect(TEMPLATE_LIMITS.namePattern.source).toBe('^[a-z0-9_]+$');
    expect(HEADER_EXAMPLE_TYPES.IMAGE).toEqual(['image/jpeg', 'image/png']);
  });

  it('every status, category and quality has a label; reasons read plainly', () => {
    expect(Object.keys(TEMPLATE_STATUS)).toHaveLength(12);
    expect(TEMPLATE_STATUS.PENDING.label).toBe('In review');
    expect(TEMPLATE_CATEGORY.UTILITY.label).toBe('Utility');
    expect(TEMPLATE_QUALITY.RED.color).toBe('error');
    expect(reasonText(null)).toBeNull();
    expect(reasonText({ reason: 'INVALID_FORMAT', title: null, description: null })).toMatch(
      /format/,
    );
    expect(reasonText({ reason: 'X', title: 'Meta title', description: null })).toBe('Meta title');
    expect(reasonText({ reason: 'X', title: 't', description: 'Meta says' })).toBe('Meta says');
    expect(reasonText({ reason: 'NEW_REASON', title: null, description: null })).toBe('NEW_REASON');
    expect(languageLabel('hi')).toBe('Hindi');
    expect(languageLabel('xx_YY')).toBe('xx_YY');
    expect(TEMPLATE_ERROR_TEXT.WALLET_INSUFFICIENT_BALANCE).toMatch(/Add money/);
    expect(WS_EVENT_TYPES).toContain('whatsapp.template.updated');
  });
});

describe('queries', () => {
  const rt = fakeRealtime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RealtimeContext value={rt.client}>{children}</RealtimeContext>
    </QueryClientProvider>
  );
  beforeEach(() => {
    client.clear();
    for (const fn of [...Object.values(api), ...Object.values(admin)]) fn.mockReset();
    api.list.mockResolvedValue([fakeTemplateListItem()]);
    api.get.mockResolvedValue(fakeTemplate());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('list and detail; no id → idle', async () => {
    const list = renderHook(() => useTemplates({ channelId: 'wa1' }), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));
    expect(api.list).toHaveBeenCalledWith({ channelId: 'wa1' });
    const detail = renderHook(() => useTemplate('tpl1'), { wrapper });
    await waitFor(() => expect(detail.result.current.data?.variables).toHaveLength(4));
    expect(renderHook(() => useTemplate(null), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
    expect(renderHook(() => useTemplates({}, false), { wrapper }).result.current.fetchStatus).toBe(
      'idle',
    );
  });

  it('polls while Meta reviews a template, stops once approved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.list.mockResolvedValue([fakeTemplateListItem('PENDING')]);
    api.get.mockResolvedValue(fakeTemplate('PENDING'));
    renderHook(() => useTemplates(), { wrapper });
    renderHook(() => useTemplate('tpl1'), { wrapper });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    api.list.mockResolvedValue([fakeTemplateListItem('APPROVED')]);
    api.get.mockResolvedValue(fakeTemplate('APPROVED'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TEMPLATE_POLL_MS + 10);
    });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TEMPLATE_POLL_MS * 2);
    });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('live updates patch every list and the detail (status, quality, category)', () => {
    renderHook(() => useTemplateLiveUpdates(), { wrapper });
    const key = templateKeys.list({});
    client.setQueryData(key, [
      fakeTemplateListItem('PENDING'),
      fakeTemplateListItem('DRAFT', 'UTILITY', { id: 'tpl2' }),
    ]);
    client.setQueryData(templateKeys.detail('tpl1'), fakeTemplate('PENDING'));
    rt.emit('whatsapp.template.updated', {
      templateId: 'tpl1',
      status: 'APPROVED',
      quality: 'GREEN',
      category: 'MARKETING',
    });
    const rows = client.getQueryData<WhatsAppTemplateListItem[]>(key);
    expect(rows?.[0]).toMatchObject({ status: 'APPROVED', category: 'MARKETING' });
    expect(rows?.[1]?.status).toBe('DRAFT');
    expect(client.getQueryData<WhatsAppTemplate>(templateKeys.detail('tpl1'))).toMatchObject({
      status: 'APPROVED',
      quality: 'GREEN',
    });
    // nothing cached → nothing to patch
    client.clear();
    rt.emit('whatsapp.template.updated', {
      templateId: 'tpl1',
      status: 'PAUSED',
      quality: 'RED',
      category: 'UTILITY',
    });
    expect(client.getQueryData(templateKeys.detail('tpl1'))).toBeUndefined();
  });

  it('storeTemplate replaces the detail and the list row', () => {
    const key = templateKeys.list({ status: ['APPROVED'] });
    client.setQueryData(key, [
      fakeTemplateListItem('DRAFT'),
      fakeTemplateListItem('DRAFT', 'UTILITY', { id: 'x' }),
    ]);
    storeTemplate(client, fakeTemplate('PENDING'));
    expect(client.getQueryData<WhatsAppTemplateListItem[]>(key)?.map((r) => r.status)).toEqual([
      'PENDING',
      'DRAFT',
    ]);
    expect(client.getQueryData<WhatsAppTemplate>(templateKeys.detail('tpl1'))?.status).toBe(
      'PENDING',
    );
  });

  it('template mutations call the API and store the result', async () => {
    const t = fakeTemplate('PENDING');
    for (const fn of [
      api.create,
      api.edit,
      api.submit,
      api.setVariables,
      api.callPermission,
      api.uploadMedia,
    ])
      fn.mockResolvedValue(t);
    api.remove.mockResolvedValue({ deleted: 2 });
    api.sync.mockResolvedValue({ created: 1, updated: 0, deleted: 0, unchanged: 3 });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const hooks = renderHook(
      () => ({
        create: useCreateTemplate(),
        edit: useEditTemplate(),
        submit: useSubmitTemplate(),
        vars: useSetVariableSources(),
        call: useCreateCallPermissionTemplate(),
        media: useUploadTemplateMedia(),
        remove: useDeleteTemplate(),
        sync: useSyncTemplates(),
      }),
      { wrapper },
    );
    const body = {
      channelId: 'wa1',
      name: 'emi_reminder',
      language: 'en',
      category: 'UTILITY' as const,
      components: EMI_COMPONENTS,
    };
    const file = new Blob(['x']);
    await act(async () => {
      await hooks.result.current.create.mutateAsync(body);
      await hooks.result.current.edit.mutateAsync({ id: 'tpl1', body: { name: 'emi_v2' } });
      await hooks.result.current.submit.mutateAsync('tpl1');
      await hooks.result.current.vars.mutateAsync({
        id: 'tpl1',
        sources: [{ key: '1', kind: 'contact.name' }],
      });
      await hooks.result.current.call.mutateAsync({ channelId: 'wa1' });
      await hooks.result.current.media.mutateAsync({ id: 'tpl1', input: { file } });
      await hooks.result.current.remove.mutateAsync({ id: 'tpl1', scope: 'name' });
      await hooks.result.current.sync.mutateAsync('wa1');
    });
    expect(api.create).toHaveBeenCalledWith(body);
    expect(api.edit).toHaveBeenCalledWith('tpl1', { name: 'emi_v2' });
    expect(api.setVariables).toHaveBeenCalledWith('tpl1', [{ key: '1', kind: 'contact.name' }]);
    expect(api.uploadMedia).toHaveBeenCalledWith('tpl1', { file });
    expect(api.remove).toHaveBeenCalledWith('tpl1', 'name');
    expect(api.sync).toHaveBeenCalledWith('wa1');
    expect(client.getQueryData<WhatsAppTemplate>(templateKeys.detail('tpl1'))?.status).toBe(
      'PENDING',
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: templateKeys.detail('tpl1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: templateKeys.all });
  });

  it('price preview runs only with a body', async () => {
    const preview = vi.spyOn(whatsappApi, 'pricePreview').mockResolvedValue(fakePricePreview());
    const none = renderHook(() => usePricePreview(null), { wrapper });
    expect(none.result.current.fetchStatus).toBe('idle');
    const body = { channelId: 'wa1', contactId: 'c1', templateId: 'tpl1' };
    const hook = renderHook(() => usePricePreview(body), { wrapper });
    await waitFor(() => expect(hook.result.current.data?.priceMicros).toBe(140_000));
    expect(preview).toHaveBeenCalledWith(body);
    const phone = renderHook(
      () => usePricePreview({ channelId: 'wa1', phone: '+919000000001', category: 'service' }),
      { wrapper },
    );
    await waitFor(() => expect(phone.result.current.isSuccess).toBe(true));
    const bare = renderHook(() => usePricePreview({ channelId: 'wa1' }), { wrapper });
    await waitFor(() => expect(bare.result.current.isSuccess).toBe(true));
  });

  it('superadmin billing queries and mutations', async () => {
    admin.rates.mockResolvedValue({ current: fakeRateCard(), scheduled: [], history: [] });
    const settingsView = {
      settings: { markupBps: 1500, platformFeeMicros: 0, holdMaxAgeHours: 72 },
      defaults: { markupBps: 1500, platformFeeMicros: 0, holdMaxAgeHours: 72 },
      nonInrPlatformChannels: [],
      calling: {
        markupBps: 1500,
        platformFeePerMinuteMicros: 0,
        holdMinutes: 5,
        holdExtendMinutes: 5,
      },
      callingDefaults: {
        markupBps: 1500,
        platformFeePerMinuteMicros: 0,
        holdMinutes: 5,
        holdExtendMinutes: 5,
      },
    };
    admin.settings.mockResolvedValue(settingsView);
    admin.updateSettings.mockResolvedValue({
      ...settingsView,
      settings: { ...settingsView.settings, markupBps: 2000 },
    });
    admin.margin.mockResolvedValue([fakeMarginRow()]);
    admin.reconciliation.mockResolvedValue([fakeReconcileRow()]);
    admin.importRates.mockResolvedValue({
      markets: [],
      callingMarkets: [],
      errors: [],
      diff: null,
    });
    admin.saveRates.mockResolvedValue(fakeRateCard());
    admin.setAccountBilling.mockResolvedValue({
      metaPayer: 'platform',
      whatsappBilling: { markupBps: 2000, fixedPrices: null, platformFeeMicros: null },
      whatsappCallingBilling: {
        markupBps: null,
        fixedPerMinuteMicros: null,
        platformFeePerMinuteMicros: null,
      },
    });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const hooks = renderHook(
      () => ({
        rates: useWhatsAppRates(),
        settings: useWhatsAppBillingSettings(),
        margin: useWhatsAppMargin({ month: '2026-10' }),
        recon: useWhatsAppReconciliation({ month: '2026-10', accountId: 'a1' }),
        importRates: useImportWhatsAppRates(),
        save: useSaveWhatsAppRates(),
        update: useUpdateWhatsAppBillingSettings(),
        account: useSetAccountWhatsAppBilling('a1'),
      }),
      { wrapper },
    );
    await waitFor(() => expect(hooks.result.current.margin.data).toHaveLength(1));
    await waitFor(() => expect(hooks.result.current.recon.data).toHaveLength(1));
    expect(hooks.result.current.rates.data?.current?.markets).toHaveLength(2);
    const file = new Blob(['csv']);
    await act(async () => {
      await hooks.result.current.importRates.mutateAsync({ file, fileName: 'r.csv' });
      await hooks.result.current.save.mutateAsync({ markets: [], source: 'manual' });
      await hooks.result.current.update.mutateAsync({ markupBps: 2000 });
      await hooks.result.current.account.mutateAsync({ markupBps: 2000 });
    });
    expect(admin.importRates).toHaveBeenCalledWith(file, 'r.csv');
    expect(admin.reconciliation).toHaveBeenCalledWith({ month: '2026-10', accountId: 'a1' });
    expect(admin.setAccountBilling).toHaveBeenCalledWith('a1', { markupBps: 2000 });
    expect(client.getQueryData(whatsappBillingKeys.settings)).toMatchObject({
      settings: { markupBps: 2000 },
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: whatsappBillingKeys.rates });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'account', 'a1'] });
  });

  it('who can manage templates: owners / admins / managers, not agents, viewers or impersonators', () => {
    for (const role of ['owner', 'admin', 'manager'] as const) {
      signInAs(role);
      expect(renderHook(() => useCanManageTemplates(), { wrapper }).result.current).toBe(true);
    }
    for (const role of ['agent', 'viewer'] as const) {
      signInAs(role);
      expect(renderHook(() => useCanManageTemplates(), { wrapper }).result.current).toBe(false);
    }
    signInAs('owner', { impersonation: { by: 'x' } as never });
    expect(renderHook(() => useCanManageTemplates(), { wrapper }).result.current).toBe(false);
    const session = signInAs('owner');
    signInAs('owner', { account: { ...session.account, status: 'suspended' } });
    expect(renderHook(() => useCanManageTemplates(), { wrapper }).result.current).toBe(false);
  });
});

describe('routes', () => {
  beforeEach(() => {
    vi.mocked(templatesApi.list).mockResolvedValue([]);
  });

  it('/whatsapp/templates opens the Templates tab; the tabs follow the URL', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/whatsapp/templates' });
    expect(
      await screen.findByRole('tab', { name: 'Templates', selected: true }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Numbers' })).toHaveAttribute(
      'href',
      '/whatsapp/numbers',
    );
  });

  it('/admin/whatsapp-billing is for superadmins only', async () => {
    signInAs('superadmin');
    renderWithProviders({ route: '/admin/whatsapp-billing' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'WhatsApp billing' }),
    ).toBeInTheDocument();
  });

  it('owners never reach the superadmin page', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/admin/whatsapp-billing' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 1, name: 'WhatsApp billing' })).toBeNull(),
    );
  });
});
