import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsApi } from './calls';
import { apiClient } from './client';
import { whatsappCallingApi } from './whatsapp-calling';

interface Seen {
  method: string;
  url: string;
  params: unknown;
  data: unknown;
  key: unknown;
}

describe('WhatsApp calling API client', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let seen: Seen[] = [];
  beforeEach(() => {
    seen = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push({
        method: config.method ?? '',
        url: config.url ?? '',
        params: config.params as unknown,
        data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
        key: config.headers.get('Idempotency-Key'),
      });
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: { ok: true }, meta: {} },
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('settings, permissions, calls and availability hit the documented routes', async () => {
    await whatsappCallingApi.getSettings('wa1');
    await whatsappCallingApi.updateSettings('wa1', { status: 'enabled' });
    await whatsappCallingApi.syncSettings('wa1');
    await whatsappCallingApi.permission('wa1', 'k1');
    await whatsappCallingApi.permission('wa1', 'k1', true);
    await whatsappCallingApi.requestPermission({
      channelId: 'wa1',
      contactId: 'k1',
      body: 'Call?',
    });
    await whatsappCallingApi.start({ channelId: 'wa1', contactId: 'k1', mode: 'human' }, 'key-1');
    await whatsappCallingApi.answer('c1');
    await whatsappCallingApi.decline('c1');
    await whatsappCallingApi.hold('c1', true);
    await whatsappCallingApi.transfer('c1');
    await whatsappCallingApi.transfer('c1', 'u2');
    await whatsappCallingApi.mediaTicket('c1');
    await whatsappCallingApi.setAvailability('busy');
    await callsApi.list({ provider: 'whatsapp', direction: 'inbound', mode: 'ai' });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /whatsapp/channels/wa1/calling',
      'patch /whatsapp/channels/wa1/calling',
      'post /whatsapp/channels/wa1/calling/sync',
      'get /whatsapp/call-permissions',
      'get /whatsapp/call-permissions',
      'post /whatsapp/call-permissions/request',
      'post /whatsapp/calls',
      'post /whatsapp/calls/c1/answer',
      'post /whatsapp/calls/c1/decline',
      'post /whatsapp/calls/c1/hold',
      'post /whatsapp/calls/c1/transfer',
      'post /whatsapp/calls/c1/transfer',
      'post /calls/c1/media-ticket',
      'patch /users/me/call-availability',
      'get /calls',
    ]);
    expect(seen[1]?.data).toEqual({ status: 'enabled' });
    expect(seen[3]?.params).toEqual({ channelId: 'wa1', contactId: 'k1' });
    expect(seen[4]?.params).toEqual({ channelId: 'wa1', contactId: 'k1', refresh: 'true' });
    expect(seen[5]?.data).toEqual({ channelId: 'wa1', contactId: 'k1', body: 'Call?' });
    expect(seen[6]).toMatchObject({
      data: { channelId: 'wa1', contactId: 'k1', mode: 'human' },
      key: 'key-1',
    });
    expect(seen[9]?.data).toEqual({ on: true });
    expect(seen[10]?.data).toEqual({});
    expect(seen[11]?.data).toEqual({ userId: 'u2' });
    expect(seen[13]?.data).toEqual({ status: 'busy' });
    expect(seen[14]?.params).toEqual({ provider: 'whatsapp', direction: 'inbound', mode: 'ai' });
  });
});
