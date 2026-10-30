import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { flowAudioKeys, flowKeys, simulationKeys } from '@/features/flows/keys';
import { sampleGraph } from '@/test/flows';

import { apiClient } from './client';
import { flowAudioApi } from './flow-audio';
import { flowSimulatorApi } from './flow-simulator';
import { flowsApi } from './flows';

interface Seen {
  method: string;
  url: string;
  params: unknown;
  data: unknown;
}

const originalAdapter = apiClient.defaults.adapter;
let seen: Seen[] = [];
let headers = new AxiosHeaders();
let body: unknown = { success: true, data: { ok: true } };

beforeEach(() => {
  seen = [];
  headers = new AxiosHeaders();
  body = { success: true, data: { ok: true } };
  apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    if (config.data instanceof FormData) {
      config.onUploadProgress?.({ loaded: 50, total: 100, bytes: 50, lengthComputable: true });
    }
    seen.push({
      method: config.method ?? '',
      url: config.url ?? '',
      params: config.params as unknown,
      data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
    });
    return Promise.resolve({ status: 200, statusText: '', headers, config, data: body });
  };
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

const last = () => seen.at(-1);

describe('flows API client', () => {
  it('calls every flows route with the right method, path, params and body', async () => {
    body = { success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    expect(await flowsApi.list({ q: 'loan', status: 'draft' })).toMatchObject({ data: [] });
    expect(last()).toMatchObject({
      method: 'get',
      url: '/flows',
      params: { q: 'loan', status: 'draft' },
    });
    body = { success: true, data: { ok: true } };
    const g = sampleGraph();
    const calls: [() => Promise<unknown>, string, string, unknown?][] = [
      [() => flowsApi.get('f1'), 'get', '/flows/f1'],
      [
        () => flowsApi.create({ name: 'X', templateKey: 'loan_recovery', agentIds: { ai: 'a1' } }),
        'post',
        '/flows',
        { name: 'X', templateKey: 'loan_recovery', agentIds: { ai: 'a1' } },
      ],
      [() => flowsApi.update('f1', { name: 'Y' }), 'patch', '/flows/f1', { name: 'Y' }],
      [() => flowsApi.saveDraft('f1', 3, g), 'put', '/flows/f1/draft', { revision: 3, graph: g }],
      [() => flowsApi.validate('f1'), 'post', '/flows/f1/validate', {}],
      [() => flowsApi.validate('f1', g), 'post', '/flows/f1/validate', { graph: g }],
      [
        () => flowsApi.publish('f1', 3, 'notes'),
        'post',
        '/flows/f1/publish',
        { revision: 3, notes: 'notes' },
      ],
      [() => flowsApi.versions('f1'), 'get', '/flows/f1/versions'],
      [() => flowsApi.version('f1', 2), 'get', '/flows/f1/versions/2'],
      [() => flowsApi.restore('f1', 2, 4), 'post', '/flows/f1/versions/2/restore', { revision: 4 }],
      [() => flowsApi.duplicate('f1'), 'post', '/flows/f1/duplicate'],
      [() => flowsApi.archive('f1'), 'post', '/flows/f1/archive'],
      [() => flowsApi.unarchive('f1'), 'post', '/flows/f1/unarchive'],
      [
        () => flowsApi.importFile({ format: 'cell-ai-flow' }),
        'post',
        '/flows/import',
        { file: { format: 'cell-ai-flow' } },
      ],
      [
        () => flowsApi.importFile({}, 'Named'),
        'post',
        '/flows/import',
        { file: {}, name: 'Named' },
      ],
      [() => flowsApi.templates(), 'get', '/flows/templates'],
      [() => flowsApi.catalog(), 'get', '/flows/catalog'],
      [() => flowsApi.variables('f1'), 'get', '/flows/f1/variables'],
      [() => flowsApi.stats('f1', { version: 1 }), 'get', '/flows/f1/stats'],
      [() => flowsApi.stats('f1'), 'get', '/flows/f1/stats'],
    ];
    for (const [call, method, url, data] of calls) {
      expect(await call()).toEqual({ ok: true });
      expect(last()).toMatchObject({ method, url, ...(data === undefined ? {} : { data }) });
    }
    await flowsApi.remove('f1');
    expect(last()).toMatchObject({ method: 'delete', url: '/flows/f1' });
  });

  it('export reads the file name from Content-Disposition (with a fallback)', async () => {
    body = { format: 'cell-ai-flow' };
    headers = new AxiosHeaders({
      'content-disposition': 'attachment; filename="flow-loan-v2.json"',
    });
    expect(await flowsApi.exportFile('f1', 2)).toEqual({
      fileName: 'flow-loan-v2.json',
      data: { format: 'cell-ai-flow' },
    });
    expect(last()).toMatchObject({ url: '/flows/f1/export', params: { version: 2 } });
    headers = new AxiosHeaders();
    expect((await flowsApi.exportFile('f1')).fileName).toBe('flow-f1.json');
  });

  it('audio and simulator clients', async () => {
    const progress: number[] = [];
    await flowAudioApi.upload(new File(['x'], 'a.wav'), 'Tone', (p) => progress.push(p));
    expect(last()?.url).toBe('/flow-audio');
    expect((last()?.data as FormData).get('name')).toBe('Tone');
    expect(progress).toEqual([50]);
    await flowAudioApi.upload(new File(['x'], 'a.wav'));
    expect((last()?.data as FormData).get('name')).toBeNull();
    await flowAudioApi.list('ton');
    expect(last()).toMatchObject({ url: '/flow-audio', params: { q: 'ton' } });
    await flowAudioApi.list();
    await flowAudioApi.url('au1');
    expect(last()?.url).toBe('/flow-audio/au1/url');
    await flowAudioApi.rename('au1', 'New');
    expect(last()).toMatchObject({ method: 'patch', data: { name: 'New' } });
    await flowAudioApi.remove('au1');
    expect(last()).toMatchObject({ method: 'delete', url: '/flow-audio/au1' });
    await flowSimulatorApi.start('f1', { version: 'draft' });
    expect(last()).toMatchObject({
      method: 'post',
      url: '/flows/f1/simulations',
      data: { version: 'draft' },
    });
    await flowSimulatorApi.send('f1', 'r1', { clientInputId: 'c1', kind: 'dtmf', value: '1' });
    expect(last()?.url).toBe('/flows/f1/simulations/r1/inputs');
    await flowSimulatorApi.list('f1', true);
    expect(last()).toMatchObject({ params: { mine: 'true' } });
    await flowSimulatorApi.list('f1');
    expect(last()).toMatchObject({ params: {} });
    await flowSimulatorApi.get('f1', 'r1');
    expect(last()?.url).toBe('/flows/f1/simulations/r1');
  });

  it('query keys', () => {
    expect(flowKeys.list({ q: 'x' })).toEqual(['flows', 'list', { q: 'x' }]);
    expect(flowKeys.version('f1', 2)).toEqual(['flows', 'version', 'f1', 2]);
    expect(flowKeys.stats('f1', {})).toEqual(['flows', 'stats', 'f1', {}]);
    expect(flowKeys.detail('f1')).toEqual(['flows', 'detail', 'f1']);
    expect(flowKeys.versions('f1')).toEqual(['flows', 'versions', 'f1']);
    expect(flowKeys.variables('f1')).toEqual(['flows', 'variables', 'f1']);
    expect(flowAudioKeys.list).toEqual(['flow-audio', 'list']);
    expect(simulationKeys.list('f1')).toEqual(['flow-simulations', 'list', 'f1']);
    expect(simulationKeys.run('f1', 'r1')).toEqual(['flow-simulations', 'run', 'f1', 'r1']);
  });
});
