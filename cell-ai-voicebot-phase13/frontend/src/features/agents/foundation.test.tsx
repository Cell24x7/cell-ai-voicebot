import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { useRef, useState } from 'react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfirmProvider } from '@/components/ConfirmProvider';
import { JsonTemplateField } from '@/components/fields/JsonTemplateField';
import { SecretField } from '@/components/fields/SecretField';
import { insertAtCaret, jsonTemplateError } from '@/components/fields/text-utils';
import { useUnsavedChangesGuard } from '@/components/fields/useUnsavedChangesGuard';
import { VariablePicker } from '@/components/fields/VariablePicker';
import { useKnowledgeLiveUpdates } from '@/features/knowledge/useKnowledgeLiveUpdates';
import { adminAiApi } from '@/services/api/admin-ai';
import { agentsApi } from '@/services/api/agents';
import { apiClient } from '@/services/api/client';
import { knowledgeApi } from '@/services/api/knowledge';
import { playgroundApi } from '@/services/api/playground';
import type { KnowledgeSource } from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { knowledgeKeys } from './keys';

interface Seen {
  method: string;
  url: string;
  params: unknown;
  data: unknown;
}
const originalAdapter = apiClient.defaults.adapter;
let seen: Seen[] = [];
let progress: number[] = [];

beforeEach(() => {
  seen = [];
  progress = [];
  apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    config.onUploadProgress?.({ loaded: 5, total: 10, bytes: 5, lengthComputable: true });
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
      data: { success: true, data: { ok: true }, meta: { total: 0 } },
    });
  };
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});
const last = () => seen[seen.length - 1];

describe('AI API clients', () => {
  it('agents', async () => {
    await agentsApi.list({ q: 'rec', activeOnly: true, page: 2 });
    expect(last()).toMatchObject({
      method: 'get',
      url: '/agents',
      params: { q: 'rec', activeOnly: 'true', page: 2 },
    });
    await agentsApi.list();
    expect(last()?.params).toEqual({ activeOnly: undefined });
    await agentsApi.get('a1');
    expect(last()).toMatchObject({ method: 'get', url: '/agents/a1' });
    await agentsApi.create({ name: 'X', templateKey: 'payment_reminder' });
    expect(last()).toMatchObject({
      method: 'post',
      url: '/agents',
      data: { name: 'X', templateKey: 'payment_reminder' },
    });
    await agentsApi.update('a1', { model: { temperatureTenths: 3 } });
    expect(last()).toMatchObject({
      method: 'patch',
      url: '/agents/a1',
      data: { model: { temperatureTenths: 3 } },
    });
    await agentsApi.remove('a1');
    expect(last()).toMatchObject({ method: 'delete', url: '/agents/a1' });
    await agentsApi.duplicate('a1');
    expect(last()?.url).toBe('/agents/a1/duplicate');
    await agentsApi.setActive('a1', true);
    expect(last()?.url).toBe('/agents/a1/activate');
    await agentsApi.setActive('a1', false);
    expect(last()?.url).toBe('/agents/a1/deactivate');
    await agentsApi.templates();
    expect(last()?.url).toBe('/agents/templates');
    await agentsApi.catalog();
    expect(last()?.url).toBe('/agents/catalog');
    await agentsApi.compilePreview('a1', { variables: { name: 'Asha' } });
    expect(last()).toMatchObject({
      url: '/agents/a1/compile-preview',
      data: { variables: { name: 'Asha' } },
    });
    await agentsApi.usage('a1');
    expect(last()?.url).toBe('/agents/a1/usage');
    const fn = {
      name: 'check',
      description: 'Checks things',
      parameters: [],
      method: 'GET' as const,
      url: 'https://x.example',
      headers: [{ name: 'X-Key', secret: true, value: null }],
      bodyTemplate: null,
      resultPath: null,
      responseHint: null,
      timeoutMs: 6000,
    };
    await agentsApi.createFunction('a1', fn);
    expect(last()).toMatchObject({ method: 'post', url: '/agents/a1/functions', data: fn });
    await agentsApi.updateFunction('a1', 'f1', { timeoutMs: 2000 });
    expect(last()).toMatchObject({
      method: 'patch',
      url: '/agents/a1/functions/f1',
      data: { timeoutMs: 2000 },
    });
    await agentsApi.deleteFunction('a1', 'f1');
    expect(last()).toMatchObject({ method: 'delete', url: '/agents/a1/functions/f1' });
    await agentsApi.testFunction('a1', 'f1', { args: { a: 1 }, testPhone: '+919000000002' });
    expect(last()).toMatchObject({
      method: 'post',
      url: '/agents/a1/functions/f1/test',
      data: { args: { a: 1 }, testPhone: '+919000000002' },
    });
  });

  it('knowledge (multipart upload with progress)', async () => {
    await knowledgeApi.list();
    expect(last()).toMatchObject({ method: 'get', url: '/knowledge-bases' });
    await knowledgeApi.get('k1');
    await knowledgeApi.create({ name: 'FAQ' });
    expect(last()).toMatchObject({
      method: 'post',
      url: '/knowledge-bases',
      data: { name: 'FAQ' },
    });
    await knowledgeApi.update('k1', { name: 'FAQs' });
    expect(last()).toMatchObject({ method: 'patch', url: '/knowledge-bases/k1' });
    await knowledgeApi.remove('k1');
    expect(last()).toMatchObject({ method: 'delete', url: '/knowledge-bases/k1', params: {} });
    await knowledgeApi.remove('k1', true);
    expect(last()?.params).toEqual({ force: 'true' });
    await knowledgeApi.sources('k1');
    expect(last()?.url).toBe('/knowledge-bases/k1/sources');
    const files = [
      new File(['a'], 'faq.txt', { type: 'text/plain' }),
      new File(['%PDF-'], 'p.pdf'),
    ];
    await knowledgeApi.upload('k1', files, (p) => progress.push(p));
    expect(last()?.url).toBe('/knowledge-bases/k1/sources/files');
    const form = last()?.data as FormData;
    expect(form.getAll('files').map((f) => (f as File).name)).toEqual(['faq.txt', 'p.pdf']);
    expect(progress).toEqual([50]);
    await knowledgeApi.upload('k1', files);
    await knowledgeApi.addUrl('k1', { url: 'https://x.example' });
    expect(last()).toMatchObject({
      url: '/knowledge-bases/k1/sources/url',
      data: { url: 'https://x.example' },
    });
    await knowledgeApi.removeSource('k1', 's1');
    expect(last()).toMatchObject({ method: 'delete', url: '/knowledge-bases/k1/sources/s1' });
    await knowledgeApi.reindexSource('k1', 's1');
    expect(last()?.url).toBe('/knowledge-bases/k1/sources/s1/reindex');
    await knowledgeApi.reindex('k1');
    expect(last()?.url).toBe('/knowledge-bases/k1/reindex');
    await knowledgeApi.search('k1', { query: 'late fee' });
    expect(last()).toMatchObject({
      url: '/knowledge-bases/k1/search',
      data: { query: 'late fee' },
    });
  });

  it('playground and admin AI', async () => {
    await playgroundApi.list('a1');
    expect(last()).toMatchObject({ url: '/agents/a1/playground/sessions', params: {} });
    await playgroundApi.list('a1', true);
    expect(last()?.params).toEqual({ mine: 'true' });
    await playgroundApi.get('a1', 's1');
    expect(last()?.url).toBe('/agents/a1/playground/sessions/s1');
    await playgroundApi.start('a1', { contactId: 'c1' });
    expect(last()).toMatchObject({ method: 'post', data: { contactId: 'c1' } });
    await playgroundApi.send('a1', 's1', { text: 'hi', clientTurnId: 't1' });
    expect(last()).toMatchObject({
      url: '/agents/a1/playground/sessions/s1/messages',
      data: { text: 'hi', clientTurnId: 't1' },
    });
    await playgroundApi.reset('a1', 's1');
    expect(last()?.url).toBe('/agents/a1/playground/sessions/s1/reset');
    await adminAiApi.config();
    expect(last()?.url).toBe('/admin/ai/config');
  });
});

describe('routes', () => {
  it('readers open the agents page', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/agents' });
    expect(await screen.findByRole('heading', { level: 1, name: 'AI agents' })).toBeInTheDocument();
  });

  it('shows the knowledge page to agents (read-only role)', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/knowledge' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Knowledge' })).toBeInTheDocument();
  });

  it('without agents.read the pages are forbidden', async () => {
    signInAs('viewer', {
      permissions: fakeSession('viewer').permissions.filter((p) => p !== 'agents.read'),
    });
    renderWithProviders({ route: '/knowledge/k1' });
    expect(await screen.findByRole('heading', { name: '403' })).toBeInTheDocument();
  });
});

describe('knowledge live updates', () => {
  const SOURCE: KnowledgeSource = {
    id: 's1',
    kbId: 'k1',
    kind: 'file',
    title: 'faq.txt',
    fileType: 'txt',
    url: null,
    bytes: 10,
    chars: 0,
    chunks: 0,
    status: 'queued',
    progress: 0,
    error: null,
    createdAt: '2026-10-09T00:00:00Z',
    updatedAt: '2026-10-09T00:00:00Z',
  };
  function Live() {
    useKnowledgeLiveUpdates();
    return null;
  }

  it('patches the cached source from kb.source.updated without a refetch', async () => {
    signInAs('owner');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(knowledgeKeys.sources('k1'), [SOURCE]);
    const { client, emit } = fakeRealtime();
    renderWithProviders({
      queryClient,
      realtime: client,
      routes: [{ path: '/', element: <Live /> }],
    });
    emit('kb.source.updated', { kbId: 'k1', sourceId: 's1', status: 'processing', progress: 40 });
    expect(
      queryClient.getQueryData<KnowledgeSource[]>(knowledgeKeys.sources('k1'))?.[0],
    ).toMatchObject({
      status: 'processing',
      progress: 40,
      error: null,
    });
    expect(seen).toHaveLength(0);
    expect(queryClient.getQueryState(knowledgeKeys.sources('k1'))?.isInvalidated).toBe(false);
    emit('kb.source.updated', {
      kbId: 'k1',
      sourceId: 's1',
      status: 'failed',
      progress: 100,
      error: 'No text found.',
    });
    expect(
      queryClient.getQueryData<KnowledgeSource[]>(knowledgeKeys.sources('k1'))?.[0],
    ).toMatchObject({
      status: 'failed',
      error: 'No text found.',
    });
    expect(queryClient.getQueryState(knowledgeKeys.sources('k1'))?.isInvalidated).toBe(true);
    // an unknown source → its list is refetched
    queryClient.setQueryData(knowledgeKeys.sources('k2'), []);
    emit('kb.source.updated', { kbId: 'k2', sourceId: 'new', status: 'queued', progress: 0 });
    await waitFor(() =>
      expect(seen.some((s) => s.url === '/knowledge-bases/k2/sources')).toBe(false),
    );
    expect(queryClient.getQueryState(knowledgeKeys.sources('k2'))?.isInvalidated).toBe(true);
  });
});

describe('shared fields', () => {
  it('insertAtCaret / jsonTemplateError', () => {
    const el = { selectionStart: 6, selectionEnd: 6 } as HTMLInputElement;
    expect(insertAtCaret('Hello  ji', 'name', el)).toEqual({
      value: 'Hello {{name}} ji',
      caret: 14,
    });
    expect(insertAtCaret('Hi', 'name', null)).toEqual({ value: 'Hi{{name}}', caret: 10 });
    expect(jsonTemplateError('')).toBeNull();
    expect(jsonTemplateError('{"a":1}')).toBeNull();
    expect(jsonTemplateError('"x"')).toBe('Use a JSON object or array');
    expect(jsonTemplateError('{bad')).toMatch(/^Not valid JSON/);
  });

  it('VariablePicker inserts {{var}} at the caret', async () => {
    function Harness() {
      const [value, setValue] = useState('Namaste  ji');
      const ref = useRef<HTMLInputElement>(null);
      return (
        <>
          <input
            aria-label="Opening line"
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <VariablePicker
            variables={[{ name: 'name', label: 'Name', hint: 'Customer name' }]}
            value={value}
            onChange={setValue}
            inputRef={ref}
          />
        </>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>('Opening line');
    input.setSelectionRange(8, 8);
    await userEvent.click(screen.getByRole('button', { name: 'Insert variable' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /\{\{name\}\}/ }));
    expect(input.value).toBe('Namaste {{name}} ji');
  });

  it('VariablePicker is disabled without variables', () => {
    render(
      <VariablePicker
        variables={[]}
        value=""
        onChange={() => undefined}
        inputRef={{ current: null }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Insert variable' })).toBeDisabled();
  });

  it('SecretField keeps (null) or replaces the stored secret', async () => {
    const changes: (string | null)[] = [];
    function Harness({ hint }: { hint: string | null }) {
      const [value, setValue] = useState<string | null>(hint ? null : '');
      return (
        <SecretField
          label="Header value"
          hint={hint}
          value={value}
          onChange={(v) => {
            changes.push(v);
            setValue(v);
          }}
        />
      );
    }
    const { unmount } = render(<Harness hint="••••1234" />);
    expect(screen.getByLabelText('Header value')).toHaveValue('••••1234');
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(screen.getByText('Replaces ••••1234')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Header value'), 'new');
    await userEvent.click(screen.getByRole('button', { name: 'Keep current' }));
    expect(changes).toEqual(['', 'n', 'ne', 'new', null]);
    expect(screen.getByLabelText('Header value')).toHaveValue('••••1234');
    unmount();
    render(<Harness hint={null} />);
    expect(screen.getByText('Saved encrypted — you will not see it again')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
  });

  it('JsonTemplateField validates on blur and formats', async () => {
    function Harness() {
      const [value, setValue] = useState('{"amount":"{{args.amount}}"');
      return <JsonTemplateField label="Body template" value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const box = screen.getByLabelText('Body template');
    expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
    await userEvent.click(box);
    await userEvent.tab();
    expect(screen.getByText(/^Not valid JSON/)).toBeInTheDocument();
    await userEvent.type(box, '}');
    expect(screen.queryByText(/^Not valid JSON/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(box).toHaveValue('{\n  "amount": "{{args.amount}}"\n}');
  });

  it('JsonTemplateField shows a server error until edited', () => {
    render(
      <JsonTemplateField
        label="Body"
        value="{}"
        onChange={() => undefined}
        error="Must be a JSON object"
      />,
    );
    expect(screen.getByText('Must be a JSON object')).toBeInTheDocument();
  });

  it('the unsaved-changes guard asks before leaving, allows same-page moves', async () => {
    function Editor() {
      const [dirty, setDirty] = useState(false);
      useUnsavedChangesGuard(dirty, (path) => path.startsWith('/agents/a1/'));
      return (
        <>
          <button onClick={() => setDirty(true)}>Edit</button>
          <Link to="/agents/a1/limits">Limits tab</Link>
          <Link to="/elsewhere">Leave</Link>
        </>
      );
    }
    const router = createMemoryRouter(
      [
        { path: '/agents/a1/:tab', element: <Editor /> },
        { path: '/elsewhere', element: <p>Elsewhere</p> },
      ],
      { initialEntries: ['/agents/a1/basic'] },
    );
    render(
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('link', { name: 'Limits tab' }));
    expect(router.state.location.pathname).toBe('/agents/a1/limits');
    await userEvent.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/agents/a1/limits'));
    // the page is aria-hidden until the dialog has closed
    await userEvent.click(await screen.findByRole('link', { name: 'Leave' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });

  it('warns on tab close only while dirty', () => {
    function Page({ dirty }: { dirty: boolean }) {
      useUnsavedChangesGuard(dirty);
      return null;
    }
    const router = (dirty: boolean) =>
      createMemoryRouter([{ path: '/', element: <Page dirty={dirty} /> }]);
    const { unmount } = render(
      <ConfirmProvider>
        <RouterProvider router={router(true)} />
      </ConfirmProvider>,
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    unmount();
    render(
      <ConfirmProvider>
        <RouterProvider router={router(false)} />
      </ConfirmProvider>,
    );
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
});
