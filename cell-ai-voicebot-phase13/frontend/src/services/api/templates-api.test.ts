import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminWhatsappBillingApi } from './admin-whatsapp-billing';
import { apiClient } from './client';
import { INBOX_SIMULATOR_KINDS } from './inbox';
import { templatesApi } from './templates';
import { walletApi } from './wallet';
import { SIMULATOR_KINDS, TEMPLATE_SIMULATOR_KINDS, whatsappApi } from './whatsapp';

interface Seen {
  method: string;
  url: string;
  params: unknown;
  data: unknown;
  timeout: number | undefined;
  signal: unknown;
  responseType: string | undefined;
}

describe('Templates + WhatsApp billing API clients', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let seen: Seen[] = [];
  let progress: ((config: InternalAxiosRequestConfig) => void) | null = null;
  beforeEach(() => {
    seen = [];
    progress = null;
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push({
        method: config.method ?? '',
        url: config.url ?? '',
        params: config.params as unknown,
        data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
        timeout: config.timeout,
        signal: config.signal,
        responseType: config.responseType,
      });
      progress?.(config);
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: { ok: true } },
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('hits every /whatsapp/templates route with the right method, path and body', async () => {
    expect(await templatesApi.list()).toEqual({ ok: true });
    await templatesApi.list({
      channelId: 'w1',
      status: ['APPROVED', 'FLAGGED'],
      category: 'UTILITY',
      purpose: 'general',
      q: 'emi',
      includeDeleted: true,
    });
    await templatesApi.list({ status: [], includeDeleted: false });
    await templatesApi.get('t1');
    const create = {
      channelId: 'w1',
      name: 'emi_reminder',
      language: 'en',
      category: 'UTILITY' as const,
      components: [{ type: 'BODY', text: 'Hi' }],
      submit: false,
    };
    await templatesApi.create(create);
    await templatesApi.edit('t1', { components: [{ type: 'BODY', text: 'Hello' }] });
    await templatesApi.submit('t1');
    await templatesApi.remove('t1');
    await templatesApi.remove('t1', 'name');
    await templatesApi.setVariables('t1', [{ key: '1', kind: 'contact.name' }]);
    await templatesApi.sync('w1');
    await templatesApi.callPermission({ channelId: 'w1', language: 'hi' });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /whatsapp/templates',
      'get /whatsapp/templates',
      'get /whatsapp/templates',
      'get /whatsapp/templates/t1',
      'post /whatsapp/templates',
      'patch /whatsapp/templates/t1',
      'post /whatsapp/templates/t1/submit',
      'delete /whatsapp/templates/t1',
      'delete /whatsapp/templates/t1',
      'patch /whatsapp/templates/t1/variables',
      'post /whatsapp/templates/sync',
      'post /whatsapp/templates/call-permission',
    ]);
    expect(seen[0]?.params).toEqual({});
    expect(seen[1]?.params).toEqual({
      channelId: 'w1',
      status: 'APPROVED,FLAGGED',
      category: 'UTILITY',
      purpose: 'general',
      q: 'emi',
      includeDeleted: 'true',
    });
    expect(seen[2]?.params).toEqual({});
    expect(seen[4]?.data).toEqual(create);
    expect(seen[7]?.params).toEqual({ scope: 'language' });
    expect(seen[8]?.params).toEqual({ scope: 'name' });
    expect(seen[9]?.data).toEqual({ sources: [{ key: '1', kind: 'contact.name' }] });
    expect(seen[10]?.data).toEqual({ channelId: 'w1' });
    expect(seen[11]?.data).toEqual({ channelId: 'w1', language: 'hi' });
  });

  it('uploads a header example with progress and abort (no timeout)', async () => {
    const onProgress = vi.fn();
    progress = (config) => {
      config.onUploadProgress?.({ loaded: 30, total: 120, bytes: 30, lengthComputable: true });
      config.onUploadProgress?.({ loaded: 10, bytes: 10, lengthComputable: false });
    };
    const ac = new AbortController();
    await templatesApi.uploadMedia('t1', {
      file: new Blob(['img'], { type: 'image/png' }),
      fileName: 'offer.png',
      onProgress,
      signal: ac.signal,
    });
    expect(seen[0]?.url).toBe('/whatsapp/templates/t1/media');
    expect(seen[0]?.timeout).toBe(0);
    expect(seen[0]?.signal).toBe(ac.signal);
    expect(((seen[0]?.data as FormData).get('file') as File).name).toBe('offer.png');
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(25);

    progress = (config) => {
      config.onUploadProgress?.({ loaded: 1, total: 1, bytes: 1, lengthComputable: true });
    };
    await templatesApi.uploadMedia('t1', {
      file: new File(['x'], 'brochure.pdf', { type: 'application/pdf' }),
    });
    expect(((seen[1]?.data as FormData).get('file') as File).name).toBe('brochure.pdf');
    expect(seen[1]?.signal).toBeUndefined();
  });

  it('price preview, template simulator and the fake template list', async () => {
    await whatsappApi.pricePreview({ channelId: 'w1', contactId: 'c1', templateId: 't1' });
    await whatsappApi.simulateTemplate('w1', 'template_approved', { templateId: 't1' });
    await whatsappApi.simulateTemplate('w1', 'run_hold_reaper');
    await whatsappApi.fakeTemplates('w1');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'post /whatsapp/price-preview',
      'post /dev/meta/webhooks',
      'post /dev/meta/webhooks',
      'get /dev/meta/templates',
    ]);
    expect(seen[0]?.data).toEqual({ channelId: 'w1', contactId: 'c1', templateId: 't1' });
    expect(seen[1]?.data).toEqual({ channelId: 'w1', kind: 'template_approved', templateId: 't1' });
    expect(seen[2]?.data).toEqual({ channelId: 'w1', kind: 'run_hold_reaper' });
    expect(seen[3]?.params).toEqual({ channelId: 'w1' });
  });

  it('wallet WhatsApp budget and the ledger ref filter', async () => {
    await walletApi.updateSettings({ budgets: { monthlyWhatsappMicros: 500_000_000 } });
    await walletApi.ledger({ refType: 'whatsapp_message', type: ['whatsapp_charge'] });
    expect(seen[0]?.data).toEqual({ budgets: { monthlyWhatsappMicros: 500_000_000 } });
    expect(seen[1]?.params).toEqual({ refType: 'whatsapp_message', type: 'whatsapp_charge' });
  });

  it('superadmin WhatsApp billing routes', async () => {
    await adminWhatsappBillingApi.rates();
    await adminWhatsappBillingApi.importRates(new Blob(['csv'], { type: 'text/csv' }), 'rates.csv');
    await adminWhatsappBillingApi.importRates(new File(['csv'], 'meta.csv'));
    const card = { markets: [], source: 'meta_csv' as const, note: null };
    await adminWhatsappBillingApi.saveRates(card);
    await adminWhatsappBillingApi.settings();
    await adminWhatsappBillingApi.updateSettings({ markupBps: 2000 });
    await adminWhatsappBillingApi.setAccountBilling('a1', { markupBps: 2000 });
    await adminWhatsappBillingApi.margin({ month: '2026-10' });
    await adminWhatsappBillingApi.marginCsv({ month: '2026-10', accountId: 'a1' });
    await adminWhatsappBillingApi.reconciliation({ month: '2026-10' });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /admin/whatsapp-rates',
      'post /admin/whatsapp-rates/import',
      'post /admin/whatsapp-rates/import',
      'post /admin/whatsapp-rates',
      'get /admin/whatsapp-billing',
      'patch /admin/whatsapp-billing',
      'patch /admin/accounts/a1/whatsapp-billing',
      'get /admin/reports/whatsapp-margin',
      'get /admin/reports/whatsapp-margin',
      'get /admin/reports/whatsapp-reconciliation',
    ]);
    expect(((seen[1]?.data as FormData).get('file') as File).name).toBe('rates.csv');
    expect(((seen[2]?.data as FormData).get('file') as File).name).toBe('meta.csv');
    expect(seen[1]?.timeout).toBe(0);
    expect(seen[3]?.data).toEqual(card);
    expect(seen[5]?.data).toEqual({ markupBps: 2000 });
    expect(seen[6]?.data).toEqual({ markupBps: 2000 });
    expect(seen[7]?.params).toEqual({ month: '2026-10' });
    expect(seen[8]?.params).toEqual({ month: '2026-10', accountId: 'a1', format: 'csv' });
    expect(seen[8]?.responseType).toBe('blob');
  });

  it('lists all 58 simulator kinds of the backend (16 + 29 − 1 shared + 14)', () => {
    const all = new Set([
      ...SIMULATOR_KINDS,
      ...INBOX_SIMULATOR_KINDS,
      ...TEMPLATE_SIMULATOR_KINDS,
    ]);
    expect(all.size).toBe(58);
    expect(TEMPLATE_SIMULATOR_KINDS).toHaveLength(14);
  });
});
