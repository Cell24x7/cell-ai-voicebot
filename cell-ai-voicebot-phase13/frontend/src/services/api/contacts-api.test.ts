import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  contactKeys,
  dndKeys,
  exportKeys,
  fieldKeys,
  importKeys,
  listKeys,
  segmentKeys,
} from '@/features/contacts/keys';

import { apiClient } from './client';
import { contactExportsApi } from './contact-exports';
import { contactImportsApi } from './contact-imports';
import { contactListsApi } from './contact-lists';
import { contactsApi } from './contacts';
import { customFieldsApi } from './custom-fields';
import { dndApi } from './dnd';
import { segmentsApi } from './segments';

interface Seen {
  method: string;
  url: string;
  params: unknown;
  data: unknown;
}

const originalAdapter = apiClient.defaults.adapter;
let seen: Seen[] = [];
let status = 200;

beforeEach(() => {
  seen = [];
  status = 200;
  apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    config.onUploadProgress?.({ loaded: 5, total: 10, bytes: 5, lengthComputable: true });
    seen.push({
      method: config.method ?? '',
      url: config.url ?? '',
      params: config.params as unknown,
      data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
    });
    return Promise.resolve({
      status,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
      data: { success: true, data: { ok: true }, meta: { total: 1 } },
    });
  };
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

const last = () => seen[seen.length - 1];

describe('contact API clients', () => {
  it('contacts', async () => {
    expect(await contactsApi.list({ q: 'asha', page: 2 })).toMatchObject({ meta: { total: 1 } });
    expect(last()).toMatchObject({
      method: 'get',
      url: '/contacts',
      params: { q: 'asha', page: 2 },
    });
    await contactsApi.search({ filter: { dnd: true } });
    expect(last()).toMatchObject({
      method: 'post',
      url: '/contacts/search',
      data: { filter: { dnd: true } },
    });
    expect(await contactsApi.get('c1')).toEqual({ ok: true });
    await contactsApi.create({ phone: '9876543210' });
    await contactsApi.update('c1', { name: null });
    expect(last()).toMatchObject({ method: 'patch', url: '/contacts/c1', data: { name: null } });
    expect(await contactsApi.remove('c1')).toBeUndefined();
    await contactsApi.tags();
    expect(await contactsApi.bulk({ action: 'delete', ids: ['c1'] })).toEqual({ ok: true });
    await contactsApi.optOut('c1');
    await contactsApi.undoOptOut('c1');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /contacts',
      'post /contacts/search',
      'get /contacts/c1',
      'post /contacts',
      'patch /contacts/c1',
      'delete /contacts/c1',
      'get /contact-tags',
      'post /contacts/bulk',
      'post /contacts/c1/opt-out',
      'delete /contacts/c1/opt-out',
    ]);
  });

  it('lists, segments, DND, fields', async () => {
    await contactListsApi.list({ q: 'mar' });
    await contactListsApi.get('l1');
    await contactListsApi.create({ name: 'March' });
    await contactListsApi.update('l1', { name: 'April' });
    await contactListsApi.remove('l1');
    await segmentsApi.list();
    expect(last()?.params).toEqual({});
    await segmentsApi.list(true);
    expect(last()?.params).toEqual({ withCounts: 'true' });
    await segmentsApi.get('s1');
    await segmentsApi.create({ name: 'S', filter: {} });
    await segmentsApi.update('s1', { name: 'T' });
    await segmentsApi.remove('s1');
    await segmentsApi.preview({ dnd: false });
    expect(await dndApi.list({ q: '98' })).toMatchObject({ meta: { total: 1 } });
    expect(await dndApi.add({ phone: '9876543210' })).toEqual({
      entry: { ok: true },
      created: false,
    });
    status = 201;
    expect((await dndApi.add({ phone: '9876543211' })).created).toBe(true);
    await dndApi.remove('d1');
    await customFieldsApi.list();
    await customFieldsApi.list(true);
    expect(last()?.params).toEqual({ withUsage: 'true' });
    await customFieldsApi.create({ key: 'k', label: 'K', type: 'text' });
    await customFieldsApi.update('f1', { label: 'L' });
    await customFieldsApi.reorder(['f1']);
    await customFieldsApi.remove('f1');
    expect(seen).toHaveLength(22);
  });

  it('imports and exports', async () => {
    const progress: number[] = [];
    await contactImportsApi.upload(new File(['a'], 'a.csv'), 'dnd', (p) => progress.push(p));
    expect(progress).toEqual([50]);
    expect(last()?.data).toBeInstanceOf(FormData);
    await contactImportsApi.upload(new File(['a'], 'a.csv'), 'contacts');
    await contactImportsApi.list({ kind: 'contacts' });
    await contactImportsApi.get('i1');
    await contactImportsApi.setMapping('i1', { columns: [{ index: 0, target: 'phone' }] });
    await contactImportsApi.validate('i1');
    await contactImportsApi.start('i1');
    await contactImportsApi.cancel('i1');
    await contactImportsApi.errorReport('i1');
    await contactImportsApi.template();
    await contactExportsApi.create({ scope: 'filter', filter: {} });
    await contactExportsApi.list({ page: 1 });
    await contactExportsApi.get('e1');
    expect(seen.map((s) => `${s.method} ${s.url}`).slice(2)).toEqual([
      'get /contact-imports',
      'get /contact-imports/i1',
      'put /contact-imports/i1/mapping',
      'post /contact-imports/i1/validate',
      'post /contact-imports/i1/start',
      'post /contact-imports/i1/cancel',
      'get /contact-imports/i1/error-report',
      'get /contact-imports/template.csv',
      'post /contact-exports',
      'get /contact-exports',
      'get /contact-exports/e1',
    ]);
  });
});

describe('query keys', () => {
  it('are stable arrays under each feature prefix', () => {
    expect(contactKeys.list({ q: 'a' })).toEqual(['contacts', 'list', { q: 'a' }]);
    expect(contactKeys.search({ filter: {}, page: 1, limit: 20 })[1]).toBe('search');
    expect(contactKeys.detail('c1')).toEqual(['contacts', 'detail', 'c1']);
    expect(listKeys.list({})).toEqual(['contact-lists', 'list', {}]);
    expect(segmentKeys.list(true)).toEqual(['segments', 'list', true]);
    expect(segmentKeys.preview({})).toEqual(['segments', 'preview', {}]);
    expect(dndKeys.list({})).toEqual(['dnd', 'list', {}]);
    expect(fieldKeys.list(false)).toEqual(['custom-fields', false]);
    expect(importKeys.list({})[0]).toBe('contact-imports');
    expect(importKeys.detail('i1')).toEqual(['contact-imports', 'detail', 'i1']);
    expect(exportKeys.list({})[0]).toBe('contact-exports');
    expect(exportKeys.detail('e1')).toEqual(['contact-exports', 'detail', 'e1']);
  });
});
