import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { inboxApi, INBOX_SIMULATOR_KINDS } from './inbox';
import { BUSINESS_VERTICALS, whatsappApi } from './whatsapp';

interface Seen {
  method: string;
  url: string;
  params: unknown;
  data: unknown;
  timeout: number | undefined;
  signal: unknown;
}

describe('Inbox API client', () => {
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
      });
      progress?.(config);
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: { ok: true }, meta: { nextCursor: null } },
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('hits every /inbox route with the right method, path and body', async () => {
    expect(await inboxApi.config()).toEqual({ ok: true });
    await inboxApi.summary();
    expect(await inboxApi.conversations({ status: 'open', filter: 'unread', q: 'asha' })).toEqual({
      success: true,
      data: { ok: true },
      meta: { nextCursor: null },
    });
    await inboxApi.conversation('c1');
    await inboxApi.messages('c1');
    await inboxApi.messages('c1', { before: 'cur', limit: 20 });
    await inboxApi.contact('c1');
    await inboxApi.send('c1', { clientId: 'k1', type: 'text', text: 'Hi' });
    expect(await inboxApi.read('c1')).toBeUndefined();
    expect(await inboxApi.unread('c1')).toBeUndefined();
    await inboxApi.typing('c1');
    await inboxApi.assign('c1', 'u2');
    await inboxApi.assign('c1', null);
    await inboxApi.close('c1');
    await inboxApi.reopen('c1');
    await inboxApi.block('c1');
    await inboxApi.unblock('c1');
    await inboxApi.start({ channelId: 'w1', contactId: 'ct1' });
    await inboxApi.mediaLink('m1');
    await inboxApi.retry('m1');
    expect(await inboxApi.retryMedia('m1')).toBeUndefined();
    await inboxApi.settings();
    await inboxApi.updateSettings({ sendReadReceipts: false });
    await inboxApi.simulate('w1', 'inbound_text');
    await inboxApi.simulate('w1', 'age_messages', { conversationId: 'c1', days: 95 });
    await inboxApi.fakeSent('w1');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /inbox/config',
      'get /inbox/summary',
      'get /inbox/conversations',
      'get /inbox/conversations/c1',
      'get /inbox/conversations/c1/messages',
      'get /inbox/conversations/c1/messages',
      'get /inbox/conversations/c1/contact',
      'post /inbox/conversations/c1/messages',
      'post /inbox/conversations/c1/read',
      'post /inbox/conversations/c1/unread',
      'post /inbox/conversations/c1/typing',
      'patch /inbox/conversations/c1',
      'patch /inbox/conversations/c1',
      'post /inbox/conversations/c1/close',
      'post /inbox/conversations/c1/reopen',
      'post /inbox/conversations/c1/block',
      'post /inbox/conversations/c1/unblock',
      'post /inbox/conversations/start',
      'get /inbox/messages/m1/media',
      'post /inbox/messages/m1/retry',
      'post /inbox/messages/m1/media/retry',
      'get /account/inbox-settings',
      'patch /account/inbox-settings',
      'post /dev/meta/webhooks',
      'post /dev/meta/webhooks',
      'get /dev/meta/sent',
    ]);
    expect(seen[2]?.params).toEqual({ status: 'open', filter: 'unread', q: 'asha' });
    expect(seen[4]?.params).toEqual({});
    expect(seen[5]?.params).toEqual({ before: 'cur', limit: 20 });
    expect(seen[7]?.data).toEqual({ clientId: 'k1', type: 'text', text: 'Hi' });
    expect(seen[11]?.data).toEqual({ assignedTo: 'u2' });
    expect(seen[12]?.data).toEqual({ assignedTo: null });
    expect(seen[17]?.data).toEqual({ channelId: 'w1', contactId: 'ct1' });
    expect(seen[22]?.data).toEqual({ sendReadReceipts: false });
    expect(seen[23]?.data).toEqual({ channelId: 'w1', kind: 'inbound_text' });
    expect(seen[24]?.data).toEqual({
      channelId: 'w1',
      kind: 'age_messages',
      conversationId: 'c1',
      days: 95,
    });
    expect(seen[25]?.params).toEqual({ channelId: 'w1' });
  });

  it('uploads multipart with kind, duration, file name, progress and abort', async () => {
    const onProgress = vi.fn();
    progress = (config) => {
      config.onUploadProgress?.({ loaded: 50, total: 200, bytes: 50, lengthComputable: true });
      // no total → no progress callback
      config.onUploadProgress?.({ loaded: 10, bytes: 10, lengthComputable: false });
    };
    const ac = new AbortController();
    const file = new Blob(['voice'], { type: 'audio/webm' });
    await inboxApi.upload({
      file,
      fileName: 'voice.webm',
      kind: 'voice',
      durationSec: 3,
      onProgress,
      signal: ac.signal,
    });
    expect(seen[0]?.url).toBe('/inbox/media');
    expect(seen[0]?.timeout).toBe(0);
    expect(seen[0]?.signal).toBe(ac.signal);
    const form = seen[0]?.data as FormData;
    expect(form.get('kind')).toBe('voice');
    expect(form.get('durationSec')).toBe('3');
    expect((form.get('file') as File).name).toBe('voice.webm');
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(25);

    // without duration / name / signal / progress handler
    progress = (config) => {
      config.onUploadProgress?.({ loaded: 1, total: 1, bytes: 1, lengthComputable: true });
    };
    await inboxApi.upload({
      file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
      kind: 'image',
    });
    const plain = seen[1]?.data as FormData;
    expect(plain.get('durationSec')).toBeNull();
    expect((plain.get('file') as File).name).toBe('photo.jpg');
    expect(seen[1]?.signal).toBeUndefined();
  });

  it('business profile calls', async () => {
    await whatsappApi.profile('w1');
    await whatsappApi.updateProfile('w1', { about: 'Loans', websites: ['https://example.com'] });
    await whatsappApi.uploadProfilePhoto('w1', new File(['p'], 'logo.png', { type: 'image/png' }));
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /whatsapp/channels/w1/profile',
      'patch /whatsapp/channels/w1/profile',
      'post /whatsapp/channels/w1/profile/photo',
    ]);
    expect(seen[1]?.data).toEqual({ about: 'Loans', websites: ['https://example.com'] });
    expect(((seen[2]?.data as FormData).get('file') as File).name).toBe('logo.png');
    expect(seen[2]?.timeout).toBe(0);
  });

  it('kind lists match the backend', () => {
    expect(INBOX_SIMULATOR_KINDS).toHaveLength(29);
    expect(new Set(INBOX_SIMULATOR_KINDS).size).toBe(29);
    expect(BUSINESS_VERTICALS).toHaveLength(19);
    expect(BUSINESS_VERTICALS).toContain('FINANCE');
  });
});
