import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { ApiError } from '@/services/api/errors';
import { knowledgeApi } from '@/services/api/knowledge';
import type { AgentFunction, KnowledgeBase, KnowledgeSource } from '@/services/api/types';
import { FAKE_CATALOG, fakeAgent } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/agents', () => ({
  agentsApi: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
    catalog: vi.fn(),
    usage: vi.fn(),
    createFunction: vi.fn(),
    updateFunction: vi.fn(),
    deleteFunction: vi.fn(),
    testFunction: vi.fn(),
  },
}));
vi.mock('@/services/api/knowledge', () => ({
  knowledgeApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    sources: vi.fn(),
    upload: vi.fn(),
    addUrl: vi.fn(),
    removeSource: vi.fn(),
    reindexSource: vi.fn(),
    reindex: vi.fn(),
    search: vi.fn(),
  },
}));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const agents = vi.mocked(agentsApi);
const kbApi = vi.mocked(knowledgeApi);
const USAGE = {
  flows: [],
  today: { day: '2026-10-09', spentMicros: 0, turns: 0 },
  month: { month: '2026-10', spentMicros: 0, turns: 0, inputTokens: 0, outputTokens: 0 },
};
const FN: AgentFunction = {
  id: 'f1',
  name: 'check_payment_status',
  description: 'Checks whether the customer has paid',
  parameters: [{ name: 'loan_id', type: 'string', description: 'Loan id', required: true }],
  method: 'GET',
  url: 'http://localhost:5100/api/v1/mock/payment-status?phone={{contact.phone}}',
  headers: [{ name: 'X-Api-Key', secret: true, value: null, valueHint: '••••1234' }],
  bodyTemplate: null,
  resultPath: null,
  responseHint: 'status is paid / unpaid',
  timeoutMs: 6000,
};
const KB: KnowledgeBase = {
  id: 'k1',
  name: 'Demo FAQ',
  description: 'Payment FAQ',
  sourcesCount: 2,
  chunksCount: 7,
  status: 'ok',
  embeddingModel: 'text-embedding-3-small',
  linkedAgents: [{ id: 'a1', name: 'Recovery Bot' }],
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
};
const SOURCE = (o: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id: 's1',
  kbId: 'k1',
  kind: 'file',
  title: 'faq.txt',
  fileType: 'txt',
  url: null,
  bytes: 2048,
  chars: 700,
  chunks: 3,
  status: 'ready',
  progress: 100,
  error: null,
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  ...o,
});

beforeEach(() => {
  agents.get.mockResolvedValue(fakeAgent({ functions: [FN] }));
  agents.catalog.mockResolvedValue(FAKE_CATALOG);
  agents.usage.mockResolvedValue(USAGE);
  kbApi.list.mockResolvedValue([
    KB,
    { ...KB, id: 'k2', name: 'Policies', linkedAgents: [], status: 'stale' },
  ]);
  kbApi.get.mockResolvedValue(KB);
  kbApi.sources.mockResolvedValue([SOURCE()]);
});
afterEach(() => vi.clearAllMocks());

describe('functions tab', () => {
  /** Opens Add function with name + description filled (paste is fast under load). */
  const openNewFunction = async () => {
    renderWithProviders({ route: '/agents/a1/functions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add function' }));
    const dialog = await screen.findByRole('dialog');
    const field = (name: string) => within(dialog).getByRole('textbox', { name });
    const put = async (name: string, value: string) => {
      fireEvent.change(field(name), { target: { value } });
      await Promise.resolve();
    };
    await put('Function name', 'save_payment');
    await put('What it does (the AI reads this)', 'Saves a payment record');
    return { dialog, field, put };
  };

  it('builds the parameters of a new function (types, enum values, required, order)', async () => {
    signInAs('owner');
    agents.createFunction.mockResolvedValue(fakeAgent({ functions: [FN] }));
    const { dialog, put } = await openNewFunction();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add parameter' }));
    await put('Parameter 1 name', 'mode');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }));
    await userEvent.click(screen.getByRole('option', { name: 'enum' }));
    await put('Allowed values', 'upi, cash');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add parameter' }));
    await put('Parameter 2 name', 'amount');
    await userEvent.click(
      within(dialog).getAllByRole('checkbox', { name: 'Required' })[1] as HTMLElement,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move parameter 2 up' }));
    await put('URL', 'https://api.example.com/pay');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add function' }));
    await waitFor(() =>
      expect(agents.createFunction).toHaveBeenCalledWith('a1', {
        name: 'save_payment',
        description: 'Saves a payment record',
        parameters: [
          { name: 'amount', type: 'string', description: '', required: false },
          {
            name: 'mode',
            type: 'enum',
            description: '',
            required: true,
            enumValues: ['upi', 'cash'],
          },
        ],
        method: 'GET',
        url: 'https://api.example.com/pay',
        headers: [],
        bodyTemplate: null,
        resultPath: null,
        responseHint: null,
        timeoutMs: 6000,
      }),
    );
    expect(await screen.findByText('Function saved')).toBeInTheDocument();
  });

  it('builds the request of a new function (placeholder, secret header, JSON body, result path)', async () => {
    signInAs('owner');
    agents.createFunction.mockResolvedValue(fakeAgent({ functions: [FN] }));
    const { dialog, field, put } = await openNewFunction();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Method' }));
    await userEvent.click(screen.getByRole('option', { name: 'POST' }));
    await put('URL', 'https://api.example.com/pay?phone=');
    field('URL').focus();
    (field('URL') as HTMLInputElement).setSelectionRange(34, 34);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Insert placeholder' }));
    expect(screen.getByText('Full phone — server only, not shown to the AI')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /contact\.phone/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add header' }));
    await put('Header 1 name', 'Authorization');
    fireEvent.change(within(dialog).getByLabelText('Header 1 value'), {
      target: { value: 'Bearer s3cret' },
    });
    await put('Body template (JSON)', '{"amount":"{{args.amount}}"}');
    await put('Result path', 'data.status');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add function' }));
    await waitFor(() =>
      expect(agents.createFunction).toHaveBeenCalledWith('a1', {
        name: 'save_payment',
        description: 'Saves a payment record',
        parameters: [],
        method: 'POST',
        url: 'https://api.example.com/pay?phone={{contact.phone}}',
        headers: [{ name: 'Authorization', secret: true, value: 'Bearer s3cret' }],
        bodyTemplate: '{"amount":"{{args.amount}}"}',
        resultPath: 'data.status',
        responseHint: null,
        timeoutMs: 6000,
      }),
    );
  });

  it('checks the form before sending', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/agents/a1/functions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add function' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add parameter' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }));
    await userEvent.click(screen.getByRole('option', { name: 'enum' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Method' }));
    await userEvent.click(screen.getByRole('option', { name: 'PATCH' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Body template (JSON)' }), {
      target: { value: '{bad' },
    });
    const timeout = within(dialog).getByRole('spinbutton', { name: 'Timeout (seconds)' });
    await userEvent.clear(timeout);
    await userEvent.type(timeout, '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add function' }));
    expect(within(dialog).getByText('Fix the highlighted fields')).toBeInTheDocument();
    expect(
      within(dialog).getByText('3–40 characters: a-z, 0-9 and _ (start with a letter)'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Describe it in at least 10 characters')).toBeInTheDocument();
    expect(within(dialog).getByText('Add at least one value')).toBeInTheDocument();
    expect(within(dialog).getByText('1 to 10 seconds')).toBeInTheDocument();
    expect(within(dialog).getByText(/^Not valid JSON/)).toBeInTheDocument();
    expect(agents.createFunction).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove parameter 1' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('keeps or replaces a stored secret and shows the blocked-URL message', async () => {
    signInAs('owner');
    agents.updateFunction
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'FUNCTION_URL_BLOCKED',
          message: 'This address is not allowed.',
          kind: 'http',
          details: [
            { path: 'url', message: 'Private, local and cloud-metadata addresses are not allowed' },
          ],
        }),
      )
      .mockResolvedValue(fakeAgent({ functions: [FN] }));
    renderWithProviders({ route: '/agents/a1/functions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit check_payment_status' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Header 1 value')).toHaveValue('••••1234');
    const url = within(dialog).getByRole('textbox', { name: 'URL' });
    await userEvent.clear(url);
    await userEvent.type(url, 'http://169.254.169.254/latest/meta-data');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save function' }));
    expect(
      await within(dialog).findByText(
        'This address is not allowed: Private, local and cloud-metadata addresses are not allowed',
      ),
    ).toBeInTheDocument();
    expect(agents.updateFunction).toHaveBeenLastCalledWith(
      'a1',
      'f1',
      expect.objectContaining({ headers: [{ name: 'X-Api-Key', secret: true, value: null }] }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
    await userEvent.type(within(dialog).getByLabelText('Header 1 value'), 'new-key-9999');
    await userEvent.clear(url);
    await userEvent.type(url, 'https://api.example.com/x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save function' }));
    await waitFor(() =>
      expect(agents.updateFunction).toHaveBeenLastCalledWith(
        'a1',
        'f1',
        expect.objectContaining({
          headers: [{ name: 'X-Api-Key', secret: true, value: 'new-key-9999' }],
          url: 'https://api.example.com/x',
        }),
      ),
    );
  });

  it('tests a function: ok result, warnings, error and argument problems', async () => {
    signInAs('owner');
    agents.testFunction
      .mockResolvedValueOnce({
        ok: true,
        httpStatus: 200,
        durationMs: 42,
        result: '{"status":"paid"}',
        warnings: ['missing:args.loan_id'],
        error: null,
      })
      .mockResolvedValueOnce({
        ok: false,
        httpStatus: null,
        durationMs: 1,
        result: '',
        warnings: [],
        error: 'blocked',
      })
      .mockResolvedValueOnce({
        ok: false,
        httpStatus: null,
        durationMs: 0,
        result: '',
        warnings: [],
        error: 'invalid_arguments',
        details: [{ path: 'loan_id', message: 'Required' }],
      });
    renderWithProviders({ route: '/agents/a1/functions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Test check_payment_status' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'loan_id *' }), 'L-1');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Test phone' }), '9000000002');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Run test' }));
    await waitFor(() =>
      expect(agents.testFunction).toHaveBeenCalledWith('a1', 'f1', {
        args: { loan_id: 'L-1' },
        testPhone: '+919000000002',
      }),
    );
    expect(await within(dialog).findByLabelText('Function result')).toHaveTextContent(
      '"status": "paid"',
    );
    expect(within(dialog).getByText('HTTP 200')).toBeInTheDocument();
    expect(within(dialog).getByText('42 ms')).toBeInTheDocument();
    expect(
      within(dialog).getByText('No value for {{args.loan_id}} — sent empty'),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'No contact' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(await within(dialog).findByText(/This address is not allowed/)).toBeInTheDocument();
    expect(agents.testFunction).toHaveBeenLastCalledWith('a1', 'f1', { args: { loan_id: 'L-1' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(await within(dialog).findByText('loan_id: Required')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  });

  it('removes a function and saves built-in tool settings', async () => {
    signInAs('manager');
    agents.deleteFunction.mockResolvedValue(fakeAgent({ functions: [] }));
    agents.update.mockResolvedValue(
      fakeAgent({ functions: [], updatedAt: '2026-10-09T03:00:00Z' }),
    );
    renderWithProviders({ route: '/agents/a1/functions' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove check_payment_status' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('No functions yet')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('switch', { name: /Transfer to a person/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Transfer number' }), '+911800000000');
    await userEvent.click(screen.getByRole('switch', { name: /Schedule a call back/ }));
    await userEvent.click(screen.getByRole('switch', { name: /Send an SMS after the call/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add SMS' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'SMS 1 key' }), 'pay_link');
    await userEvent.type(screen.getByRole('textbox', { name: 'SMS 1 text' }), 'Pay here');
    await userEvent.click(screen.getByRole('button', { name: 'Save tools' }));
    await waitFor(() =>
      expect(agents.update).toHaveBeenCalledWith('a1', {
        builtInTools: expect.objectContaining({
          transferToHuman: { enabled: true, phone: '+911800000000', message: null },
          scheduleCallback: { enabled: true, maxDaysAhead: 7 },
          sendSmsAfterCall: { enabled: true, templates: [{ key: 'pay_link', text: 'Pay here' }] },
        }) as unknown,
      }),
    );
    expect(await screen.findByText('Built-in tools saved')).toBeInTheDocument();
  });

  it('tests with enum / boolean arguments; edits outcomes and promise window', async () => {
    signInAs('owner');
    agents.get.mockResolvedValue(
      fakeAgent({
        functions: [
          {
            ...FN,
            parameters: [
              {
                name: 'mode',
                type: 'enum',
                description: 'How',
                required: true,
                enumValues: ['upi', 'cash'],
              },
              { name: 'urgent', type: 'boolean', description: '', required: false },
              { name: 'count', type: 'integer', description: '', required: false },
            ],
          },
        ],
        builtInTools: {
          ...fakeAgent().builtInTools,
          sendSmsAfterCall: { enabled: true, templates: [{ key: 'k', text: 't' }] },
        },
      }),
    );
    agents.testFunction.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      durationMs: 5,
      result: 'plain text',
      warnings: ['result_path_not_found'],
      error: null,
    });
    agents.update.mockResolvedValue(fakeAgent());
    renderWithProviders({ route: '/agents/a1/functions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Test check_payment_status' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'mode *' }));
    await userEvent.click(screen.getByRole('option', { name: 'cash' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'urgent' }));
    await userEvent.click(screen.getByRole('option', { name: 'true' }));
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'count' }), '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Run test' }));
    await waitFor(() =>
      expect(agents.testFunction).toHaveBeenCalledWith('a1', 'f1', {
        args: { mode: 'cash', urgent: true, count: 3 },
      }),
    );
    expect(
      await within(dialog).findByText('The result path was not found in the answer'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Function result')).toHaveTextContent('plain text');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Allowed outcomes' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Dispute' }));
    const promise = screen.getByRole('spinbutton', { name: 'Within days' });
    await userEvent.clear(promise);
    await userEvent.type(promise, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Remove SMS 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save tools' }));
    await waitFor(() =>
      expect(agents.update).toHaveBeenCalledWith('a1', {
        builtInTools: expect.objectContaining({
          setDisposition: { enabled: true, allowed: ['paid', 'promise_to_pay', 'dispute'] },
          savePromiseToPay: { enabled: true, maxDaysAhead: 10 },
          sendSmsAfterCall: { enabled: true, templates: [] },
        }) as unknown,
      }),
    );
  });

  it('is read-only for viewers', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/agents/a1/functions' });
    expect(await screen.findByText('check_payment_status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add function' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Test / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save tools' })).not.toBeInTheDocument();
  });
});

describe('agent knowledge tab', () => {
  it('links knowledge bases and saves the match settings', async () => {
    signInAs('owner');
    agents.update.mockResolvedValue(
      fakeAgent({ knowledge: { knowledgeBaseIds: ['k1'], topK: 4, minScoreHundredths: 35 } }),
    );
    renderWithProviders({ route: '/agents/a1/knowledge' });
    await userEvent.click(await screen.findByRole('combobox', { name: 'Knowledge bases' }));
    await userEvent.click(await screen.findByRole('option', { name: /Demo FAQ/ }));
    expect(screen.getByText('Demo FAQ (2)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save knowledge settings' }));
    await waitFor(() =>
      expect(agents.update).toHaveBeenCalledWith('a1', {
        knowledge: { knowledgeBaseIds: ['k1'], topK: 4, minScoreHundredths: 35 },
      }),
    );
    expect(await screen.findByText('Knowledge settings saved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage knowledge' })).toHaveAttribute(
      'href',
      '/knowledge',
    );
  });
});

describe('agent knowledge tab — errors and sliders', () => {
  it('retries a failed list and saves slider changes', async () => {
    signInAs('owner');
    kbApi.list.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'X', message: 'Boom', kind: 'http' }),
    );
    agents.update.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'Invalid',
        kind: 'http',
        details: [{ path: 'knowledge.knowledgeBaseIds', message: 'Unknown knowledge base' }],
      }),
    );
    renderWithProviders({ route: '/agents/a1/knowledge' });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByRole('combobox', { name: 'Knowledge bases' });
    const slider = screen.getByRole('slider', { name: /Pieces per answer/ });
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    const min = screen.getByRole('slider', { name: /Minimum match/ });
    min.focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.click(screen.getByRole('button', { name: 'Save knowledge settings' }));
    expect(await screen.findByText('Unknown knowledge base')).toBeInTheDocument();
    expect(agents.update).toHaveBeenCalledWith('a1', {
      knowledge: { knowledgeBaseIds: [], topK: 5, minScoreHundredths: 40 },
    });
  });
});

describe('/knowledge pages', () => {
  it('lists, creates and renames knowledge bases', async () => {
    signInAs('owner');
    kbApi.create.mockResolvedValue(KB);
    kbApi.update.mockResolvedValue(KB);
    renderWithProviders({ route: '/knowledge' });
    const row = (await screen.findByRole('link', { name: 'Demo FAQ' })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(row).getByText('Recovery Bot')).toBeInTheDocument();
    expect(within(row).getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Needs re-index')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New knowledge base' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Terms');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(kbApi.create).toHaveBeenCalledWith({ name: 'Terms', description: null }),
    );
    expect(await screen.findByText('Knowledge base created')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Rename Demo FAQ' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'FAQ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(kbApi.update).toHaveBeenCalledWith('k1', { name: 'FAQ', description: 'Payment FAQ' }),
    );
  });

  it('a linked base asks to unlink before deleting', async () => {
    signInAs('owner');
    kbApi.remove
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'CONFLICT_INVALID_STATE',
          message: 'Used by Recovery Bot. Remove it from these agents first.',
          kind: 'http',
        }),
      )
      .mockResolvedValue();
    renderWithProviders({ route: '/knowledge' });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Demo FAQ' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByText(
        /Used by Recovery Bot\. Remove it from these agents first\. Unlink it/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unlink and delete' }));
    await waitFor(() => expect(kbApi.remove).toHaveBeenLastCalledWith('k1', true));
    expect(await screen.findByText('Knowledge base deleted')).toBeInTheDocument();
  });

  it('uploads with progress; WS moves the source to ready; failed reasons show', async () => {
    signInAs('owner');
    const { client, emit } = fakeRealtime();
    kbApi.sources.mockResolvedValue([
      SOURCE({
        id: 's9',
        title: 'scan.pdf',
        status: 'failed',
        error: 'No text found (scanned PDF?)',
        chunks: 0,
      }),
    ]);
    kbApi.upload.mockImplementation((_id, files, onProgress) => {
      onProgress?.(60);
      return Promise.resolve(
        files.map((f, i) => SOURCE({ id: `n${i}`, title: f.name, status: 'queued', progress: 0 })),
      );
    });
    renderWithProviders({ route: '/knowledge/k1', realtime: client });
    expect(await screen.findByText('No text found (scanned PDF?)')).toBeInTheDocument();
    const input = screen.getByLabelText<HTMLInputElement>('Choose files');
    await userEvent.upload(input, new File(['x'], 'virus.exe'), { applyAccept: false });
    expect(screen.getByText('"virus.exe" is not a PDF, DOCX, TXT or MD file')).toBeInTheDocument();
    kbApi.sources.mockResolvedValue([
      SOURCE({
        id: 's9',
        title: 'scan.pdf',
        status: 'failed',
        error: 'No text found (scanned PDF?)',
        chunks: 0,
      }),
      SOURCE({ id: 'n0', title: 'faq.txt', status: 'queued', progress: 0, chunks: 0 }),
    ]);
    await userEvent.upload(input, new File(['hello'], 'faq.txt', { type: 'text/plain' }));
    await waitFor(() => expect(kbApi.upload).toHaveBeenCalled());
    expect(await screen.findByText('1 file added — processing')).toBeInTheDocument();
    expect(await screen.findByText('Waiting')).toBeInTheDocument();
    emit('kb.source.updated', { kbId: 'k1', sourceId: 'n0', status: 'processing', progress: 50 });
    expect(await screen.findByRole('progressbar', { name: 'faq.txt progress' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    emit('kb.source.updated', { kbId: 'k1', sourceId: 'n0', status: 'ready', progress: 100 });
    await waitFor(() => expect(screen.getAllByText('Ready').length).toBeGreaterThan(0));
  });

  it('drag and drop, size limit, re-index and remove', async () => {
    signInAs('owner');
    kbApi.reindex.mockResolvedValue([]);
    kbApi.reindexSource.mockResolvedValue(SOURCE({ status: 'queued' }));
    kbApi.removeSource.mockResolvedValue();
    renderWithProviders({ route: '/knowledge/k1' });
    const zone = (await screen.findByText(/Drop PDF, Word, text or Markdown files here/)).closest(
      'div',
    ) as HTMLElement;
    const big = new File(['x'], 'big.pdf');
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [big] } });
    expect(screen.getByText('"big.pdf" is larger than 10 MB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Re-index all' }));
    expect(await screen.findByText('Re-indexing all sources')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Re-index faq.txt' }));
    await waitFor(() => expect(kbApi.reindexSource).toHaveBeenCalledWith('k1', 's1'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove faq.txt' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(kbApi.removeSource).toHaveBeenCalledWith('k1', 's1'));
  });

  it('adds a web page (blocked address explained)', async () => {
    signInAs('owner');
    kbApi.addUrl
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'FUNCTION_URL_BLOCKED',
          message: 'This address is not allowed.',
          kind: 'http',
          details: [{ path: 'url', message: 'This address is not allowed' }],
        }),
      )
      .mockResolvedValue(SOURCE({ kind: 'url', url: 'https://help.example.com', title: 'help' }));
    renderWithProviders({ route: '/knowledge/k1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add web page' }));
    const address = screen.getByRole('textbox', { name: 'Page address' });
    await userEvent.clear(address);
    await userEvent.type(address, 'http://169.254.169.254/x');
    await userEvent.click(screen.getByRole('button', { name: 'Add page' }));
    expect(
      await screen.findByText('This address is not allowed. This address is not allowed'),
    ).toBeInTheDocument();
    await userEvent.clear(address);
    await userEvent.type(address, 'https://help.example.com');
    await userEvent.type(screen.getByRole('textbox', { name: 'Title (optional)' }), 'Help');
    await userEvent.click(screen.getByRole('button', { name: 'Add page' }));
    await waitFor(() =>
      expect(kbApi.addUrl).toHaveBeenLastCalledWith('k1', {
        url: 'https://help.example.com',
        title: 'Help',
      }),
    );
    expect(await screen.findByText('Web page added — processing')).toBeInTheDocument();
  });

  it('tries a question and shows ranked results', async () => {
    signInAs('viewer');
    kbApi.search
      .mockResolvedValueOnce([
        {
          chunkId: 'c1',
          sourceId: 's1',
          sourceTitle: 'faq.txt',
          title: 'Late fee',
          text: 'Due date ke baad ₹50 late fee.',
          score: 0.48,
        },
        {
          chunkId: 'c2',
          sourceId: 's1',
          sourceTitle: 'faq.txt',
          title: 'Contact hours',
          text: 'Mon–Sat 9–7',
          score: 0.07,
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithProviders({ route: '/knowledge/k1' });
    expect(await screen.findByText(/used by Recovery Bot/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload files' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Question' }), 'late fee kitni hai?');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(kbApi.search).toHaveBeenCalledWith('k1', { query: 'late fee kitni hai?', topK: 4 }),
    );
    expect(await screen.findByRole('article', { name: 'Result 1: Late fee' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Match 0.48' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByText('Nothing matched. Add a document that answers this, or rephrase.'),
    ).toBeInTheDocument();
  });

  it('shows a stale warning and load errors', async () => {
    signInAs('owner');
    kbApi.get.mockResolvedValueOnce({ ...KB, status: 'stale' });
    const { unmount } = renderWithProviders({ route: '/knowledge/k1' });
    expect(await screen.findByText(/The AI embedding model changed/)).toBeInTheDocument();
    unmount();
    kbApi.get.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Knowledge base not found',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/knowledge/k1' });
    expect(await screen.findByText('Knowledge base not found')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Demo FAQ' })).toBeInTheDocument();
  });
});
