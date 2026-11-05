import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { waCampaignsApi, type WaCampaignCreateInput } from './whatsapp-campaigns';

const original = apiClient.defaults.adapter;
let seen: InternalAxiosRequestConfig[];
beforeEach(() => {
  seen = [];
  apiClient.defaults.adapter = (config) => {
    seen.push(config);
    return Promise.resolve({
      config,
      status: 200,
      statusText: '',
      headers: new AxiosHeaders(),
      data:
        config.responseType === 'blob'
          ? new Blob(['phone,status\nmasked,sent'])
          : { success: true, data: { id: 'cp1' }, meta: { page: 2, total: 30 } },
    });
  };
});
afterEach(() => {
  apiClient.defaults.adapter = original;
  vi.restoreAllMocks();
});

it('preserves sender, recurrence and media across create/edit and retains pagination metadata', async () => {
  const body: WaCampaignCreateInput = {
    name: 'Reminder',
    channelId: 'wa2',
    variants: [{ key: 'A', templateId: 't2', splitPct: 100 }],
    audience: { contactIds: ['k1'] },
    schedule: {
      kind: 'recurring',
      timezone: 'UTC',
      recurrence: { freq: 'daily', days: [], time: '09:00', until: null },
    },
    headerMediaToken: 'upload1',
  };
  const list = await waCampaignsApi.list({ page: 2, limit: 15, status: 'paused' });
  expect(list.meta).toEqual({ page: 2, total: 30 });
  expect(seen[0]?.params).toEqual({ page: 2, limit: 15, status: 'paused' });
  await expect(waCampaignsApi.create(body)).resolves.toEqual({ id: 'cp1' });
  await waCampaignsApi.update('cp1', body);
  expect(
    seen.slice(1).map((c) => [c.method, c.url, JSON.parse(c.data as string) as unknown]),
  ).toEqual([
    ['post', '/whatsapp-campaigns', body],
    ['patch', '/whatsapp-campaigns/cp1', body],
  ]);
  await waCampaignsApi.get('cp1');
  const recipients = await waCampaignsApi.recipients('cp1', { page: 2, status: 'failed' });
  expect(recipients.meta.page).toBe(2);
  expect(seen.at(-1)?.params).toEqual({ page: 2, status: 'failed' });
});

it('reuses the start key and sends lifecycle, report and CSV requests to the campaign only', async () => {
  await waCampaignsApi.estimate('cp1');
  await waCampaignsApi.start('cp1', 'same-click');
  await waCampaignsApi.start('cp1', 'same-click');
  expect(seen.slice(1, 3).map((c) => c.headers.get('Idempotency-Key'))).toEqual([
    'same-click',
    'same-click',
  ]);
  await waCampaignsApi.pause('cp1');
  await waCampaignsApi.resume('cp1');
  await waCampaignsApi.stop('cp1');
  await waCampaignsApi.retryFailed('cp1');
  await waCampaignsApi.report('cp1');
  const download = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:campaign');
  await expect(waCampaignsApi.export('cp1')).resolves.toBe('blob:campaign');
  expect(download).toHaveBeenCalledWith(expect.any(Blob));
  expect(seen.at(-1)?.responseType).toBe('blob');
  await waCampaignsApi.remove('cp1');
  expect(seen.map((c) => `${c.method} ${c.url}`)).toEqual([
    'post /whatsapp-campaigns/cp1/estimate',
    'post /whatsapp-campaigns/cp1/start',
    'post /whatsapp-campaigns/cp1/start',
    'post /whatsapp-campaigns/cp1/pause',
    'post /whatsapp-campaigns/cp1/resume',
    'post /whatsapp-campaigns/cp1/stop',
    'post /whatsapp-campaigns/cp1/retry-failed',
    'get /whatsapp-campaigns/cp1/report',
    'get /whatsapp-campaigns/cp1/export',
    'delete /whatsapp-campaigns/cp1',
  ]);
});
