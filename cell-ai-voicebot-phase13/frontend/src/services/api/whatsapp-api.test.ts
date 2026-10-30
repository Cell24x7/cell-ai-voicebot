import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adminWhatsappApi } from './admin-whatsapp';
import { apiClient } from './client';
import { metaPublicApi } from './meta-public';
import { whatsappApi } from './whatsapp';

describe('WhatsApp API clients', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let seen: { method: string; url: string; params: unknown; data: unknown }[] = [];
  beforeEach(() => {
    seen = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push({
        method: config.method ?? '',
        url: config.url ?? '',
        params: config.params as unknown,
        data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
      });
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

  it('hits every /whatsapp route', async () => {
    expect(await whatsappApi.config()).toEqual({ ok: true });
    await whatsappApi.channels();
    await whatsappApi.channels('connected');
    await whatsappApi.channel('w1');
    await whatsappApi.signup({ code: 'c', mode: 'cloud_api', sessionInfo: { wabaId: '1' } });
    await whatsappApi.rename('w1', 'Sales');
    await whatsappApi.sync('w1');
    await whatsappApi.retrySetup('w1');
    await whatsappApi.register('w1', '123456');
    await whatsappApi.coexistenceSync('w1');
    await whatsappApi.disconnect('w1');
    await whatsappApi.simulate('w1', 'flagged');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /whatsapp/config',
      'get /whatsapp/channels',
      'get /whatsapp/channels',
      'get /whatsapp/channels/w1',
      'post /whatsapp/channels/embedded-signup',
      'patch /whatsapp/channels/w1',
      'post /whatsapp/channels/w1/sync',
      'post /whatsapp/channels/w1/retry-setup',
      'post /whatsapp/channels/w1/register',
      'post /whatsapp/channels/w1/coexistence-sync',
      'post /whatsapp/channels/w1/disconnect',
      'post /dev/meta/webhooks',
    ]);
    expect(seen[1]?.params).toEqual({});
    expect(seen[2]?.params).toEqual({ status: 'connected' });
    expect(seen[4]?.data).toEqual({ code: 'c', mode: 'cloud_api', sessionInfo: { wabaId: '1' } });
    expect(seen[5]?.data).toEqual({ label: 'Sales' });
    expect(seen[8]?.data).toEqual({ pin: '123456' });
    expect(seen[11]?.data).toEqual({ channelId: 'w1', kind: 'flagged' });
  });

  it('hits the superadmin and public routes', async () => {
    await adminWhatsappApi.status();
    await adminWhatsappApi.events();
    await adminWhatsappApi.events('failed');
    await adminWhatsappApi.replay('e1');
    await adminWhatsappApi.disconnect('w1', 'Spam');
    await adminWhatsappApi.setBilling('a1', 'customer');
    await adminWhatsappApi.manualConnect('a1', {
      wabaId: '1',
      phoneNumberId: '2',
      accessToken: 't'.repeat(20),
    });
    await metaPublicApi.deletionStatus('abc/def');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /admin/whatsapp/status',
      'get /admin/whatsapp/events',
      'get /admin/whatsapp/events',
      'post /admin/whatsapp/events/e1/replay',
      'post /admin/whatsapp/channels/w1/disconnect',
      'patch /admin/accounts/a1/whatsapp-billing',
      'post /admin/accounts/a1/whatsapp/manual-connect',
      'get /meta/data-deletion/abc%2Fdef',
    ]);
    expect(seen[1]?.params).toEqual({});
    expect(seen[2]?.params).toEqual({ status: 'failed' });
    expect(seen[4]?.data).toEqual({ reason: 'Spam' });
    expect(seen[5]?.data).toEqual({ metaPayer: 'customer' });
  });
});
