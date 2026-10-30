import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { contactsApi } from '@/services/api/contacts';
import { ApiError } from '@/services/api/errors';
import { FAKE_CATALOG, fakeAgent, fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/agents', () => ({
  agentsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    setActive: vi.fn(),
    templates: vi.fn(),
    catalog: vi.fn(),
    compilePreview: vi.fn(),
    usage: vi.fn(),
  },
}));
vi.mock('@/services/api/contacts', () => ({ contactsApi: { list: vi.fn() } }));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const api = vi.mocked(agentsApi);
const contacts = vi.mocked(contactsApi);
const page = (rows = [fakeAgentRow()]) => ({
  success: true as const,
  data: rows,
  meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 },
});
const USAGE = {
  flows: [],
  today: { day: '2026-10-09', spentMicros: 250_000, turns: 2 },
  month: { month: '2026-10', spentMicros: 1_250_000, turns: 9, inputTokens: 900, outputTokens: 80 },
};

beforeEach(() => {
  api.list.mockResolvedValue(page());
  api.get.mockResolvedValue(fakeAgent());
  api.catalog.mockResolvedValue(FAKE_CATALOG);
  api.usage.mockResolvedValue(USAGE);
  api.templates.mockResolvedValue([
    {
      key: 'loan_recovery_hinglish',
      title: 'Loan recovery (Hinglish)',
      summary: 'Overdue EMI',
      language: 'Hinglish',
    },
    {
      key: 'payment_reminder',
      title: 'Payment reminder',
      summary: 'Friendly reminder',
      language: 'Hinglish',
    },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe('/agents list', () => {
  it('shows agents with spend, toggles, duplicates and deletes (writers)', async () => {
    signInAs('manager');
    api.setActive.mockResolvedValue(fakeAgent({ isActive: false }));
    api.duplicate.mockResolvedValue(fakeAgent({ id: 'a2', name: 'Recovery Bot (copy)' }));
    api.remove.mockResolvedValue();
    renderWithProviders({ route: '/agents' });
    const row = (await screen.findByRole('link', { name: 'Recovery Bot' })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(row).getByText('₹1.25')).toBeInTheDocument();
    expect(within(row).getByText('Hinglish · auto')).toBeInTheDocument();
    expect(within(row).getByText('Coral')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('switch', { name: 'Recovery Bot on' }));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith('a1', false));
    await userEvent.click(within(row).getByRole('button', { name: 'Duplicate Recovery Bot' }));
    expect(await screen.findByText('Created "Recovery Bot (copy)"')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Delete Recovery Bot' }));
    expect(await screen.findByText('Delete "Recovery Bot"?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('a1'));
  });

  it('an agent used by call flows is not deleted — the flows are named', async () => {
    signInAs('manager');
    api.remove.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'RESOURCE_IN_USE',
        message: 'This agent is used by 1 call flow. Remove it from them first.',
        kind: 'http',
        details: [{ path: 'flows', message: 'Loan recovery', id: 'f1' }],
      }),
    );
    api.remove.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Oops', kind: 'http' }),
    );
    renderWithProviders({ route: '/agents' });
    const row = (await screen.findByRole('link', { name: 'Recovery Bot' })).closest(
      'tr',
    ) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Delete Recovery Bot' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByText(
        'This agent is used by 1 call flow. Remove it from them first. Flows: Loan recovery',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(within(row).getByRole('button', { name: 'Delete Recovery Bot' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Oops')).toBeInTheDocument();
  });

  it('searches by name through the URL (debounced)', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/agents' });
    await screen.findByRole('link', { name: 'Recovery Bot' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Search agents' }), 'reco');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ q: 'reco', page: 1, limit: 20 }),
    );
  });

  it('readers see no switches or actions; empty state offers templates to writers', async () => {
    signInAs('viewer');
    const { unmount } = renderWithProviders({ route: '/agents' });
    const row = (await screen.findByRole('link', { name: 'Recovery Bot' })).closest(
      'tr',
    ) as HTMLElement;
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New agent' })).not.toBeInTheDocument();
    expect(within(row).getByText('On')).toBeInTheDocument();
    unmount();
    signInAs('owner');
    api.list.mockResolvedValue(page([]));
    renderWithProviders({ route: '/agents' });
    expect(await screen.findByText('No agents yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create from a template' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New agent' })).toBeInTheDocument();
  });

  it('shows a retry on errors', async () => {
    signInAs('viewer');
    api.list.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'X', message: 'Boom', kind: 'http' }),
    );
    renderWithProviders({ route: '/agents' });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Recovery Bot' })).toBeInTheDocument();
  });
});

describe('/agents/new', () => {
  it('creates from a template and opens the editor', async () => {
    signInAs('manager');
    api.create.mockResolvedValue(fakeAgent({ id: 'a9', name: 'My recovery' }));
    api.get.mockResolvedValue(fakeAgent({ id: 'a9', name: 'My recovery' }));
    renderWithProviders({ route: '/agents/new' });
    await userEvent.click(await screen.findByText('Loan recovery (Hinglish)'));
    const name = screen.getByRole('textbox', { name: 'Agent name' });
    expect(name).toHaveValue('Loan recovery (Hinglish)');
    await userEvent.clear(name);
    await userEvent.type(name, 'My recovery');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        name: 'My recovery',
        templateKey: 'loan_recovery_hinglish',
      }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My recovery' }),
    ).toBeInTheDocument();
  });

  it('blank agent: name required, duplicate name error shown', async () => {
    signInAs('owner');
    api.create.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT_DUPLICATE',
        message: 'Exists',
        kind: 'http',
        details: [{ path: 'name', message: 'Already exists' }],
      }),
    );
    renderWithProviders({ route: '/agents/new' });
    await userEvent.click(await screen.findByText('Blank agent'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Agent name' }), 'Taken');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Already exists')).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith({ name: 'Taken' });
  });

  it('readers cannot create', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/agents/new' });
    expect(await screen.findByText('You can view agents but not create them')).toBeInTheDocument();
  });
});

describe('agent editor', () => {
  it('saves only the changed fields (caps in rupees → micros)', async () => {
    signInAs('manager');
    api.update.mockImplementation((_id, patch) =>
      Promise.resolve(
        fakeAgent({ name: patch.name ?? 'Recovery Bot', updatedAt: '2026-10-09T01:00:00.000Z' }),
      ),
    );
    renderWithProviders({ route: '/agents/a1/basic' });
    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Recovery Bot 2');
    await userEvent.click(screen.getByRole('tab', { name: 'Limits' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Daily cap' }), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('a1', {
        name: 'Recovery Bot 2',
        limits: { dailySpendCapMicros: 50_000_000, monthlySpendCapMicros: 0, onCap: 'fallback' },
      }),
    );
    expect(await screen.findByText('Agent saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows client and server errors on the right tab with badges', async () => {
    signInAs('owner');
    api.update.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'Invalid',
        kind: 'http',
        details: [
          { path: 'persona', message: 'Not allowed here: {{loan_amount}}' },
          { path: 'body.toneRules.0.respond', message: 'Too long' },
        ],
      }),
    );
    renderWithProviders({ route: '/agents/a1/limits' });
    const daily = await screen.findByRole('textbox', { name: 'Daily cap' });
    await userEvent.type(daily, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter an amount like 1,500 or 1500.50')).toBeInTheDocument();
    expect(api.update).not.toHaveBeenCalled();
    await userEvent.clear(daily);
    await userEvent.type(daily, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('tab', { name: 'Basic (1 errors)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Voice & Language (1 errors)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Basic (1 errors)' }));
    expect(await screen.findByText('Not allowed here: {{loan_amount}}')).toBeInTheDocument();
  });

  it('edits tone rules, voice and the persona with a variable', async () => {
    signInAs('owner');
    api.update.mockResolvedValue(fakeAgent());
    renderWithProviders({ route: '/agents/a1/voice' });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove tone rule 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add tone rule' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'When the customer is' }));
    await userEvent.click(screen.getByRole('option', { name: 'Custom…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Describe when this applies')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe when' }), 'customer cries');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Respond like this' }),
      'Main samajhta hoon',
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Voice (used on calls)' }));
    await userEvent.click(screen.getByRole('option', { name: 'Sage' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Always one language' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('a1', {
        voice: 'sage',
        languageMode: 'fixed',
        toneRules: [
          { when: 'custom', customWhen: 'customer cries', respond: 'Main samajhta hoon' },
        ],
      }),
    );
  });

  it('inserts a variable into the opening line', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/agents/a1/basic' });
    const opening = await screen.findByRole('textbox', { name: 'Opening line' });
    await userEvent.click(opening);
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Insert variable' })[1] as HTMLElement,
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /\{\{company\}\}/ }));
    expect(opening).toHaveValue('Namaste {{name}} ji{{company}}');
  });

  it('asks before leaving with unsaved changes', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/agents/a1/basic' });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), '!');
    await userEvent.click(screen.getByRole('tab', { name: 'Limits' }));
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'All agents' }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
  });

  it('previews the compiled prompt with warnings', async () => {
    signInAs('viewer');
    api.compilePreview.mockResolvedValue({
      instructions: 'You are "Recovery Bot"…',
      tools: [{ name: 'end_call', description: 'End the conversation politely.\nmore' }],
      openingLine: 'Namaste ji',
      closingLine: 'Dhanyavaad',
      variables: { name: '' },
      warnings: ['missing_variable:name', 'persona_truncated'],
    });
    contacts.list.mockResolvedValue({
      success: true,
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    } as never);
    renderWithProviders({ route: '/agents/a1/basic' });
    await userEvent.click(await screen.findByRole('button', { name: 'Prompt preview' }));
    await userEvent.type(screen.getByRole('textbox', { name: '{{name}}' }), 'Asha');
    await userEvent.click(screen.getByRole('button', { name: 'Show prompt' }));
    await waitFor(() =>
      expect(api.compilePreview).toHaveBeenCalledWith('a1', {
        channel: 'text',
        variables: { name: 'Asha' },
      }),
    );
    expect(await screen.findByLabelText('Compiled instructions')).toHaveTextContent(
      'You are "Recovery Bot"…',
    );
    expect(screen.getByText('No value for {{name}} — it is left empty')).toBeInTheDocument();
    expect(
      screen.getByText('The persona was cut to fit the instruction limit'),
    ).toBeInTheDocument();
    expect(screen.getByText('end_call')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Sample contact' }));
    expect(screen.getByRole('button', { name: 'Show prompt' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  });

  it('is read-only for viewers and while impersonating', async () => {
    signInAs('viewer');
    const { unmount } = renderWithProviders({ route: '/agents/a1/basic' });
    expect(
      await screen.findByText('Read-only: you can view this agent but not change it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
    unmount();
    signInAs('owner', {
      impersonation: {
        impersonatorId: 'sa',
        impersonatorName: 'Platform Admin',
        startedAt: '2026-10-09T00:00:00Z',
      } as never,
    });
    renderWithProviders({ route: '/agents/a1/limits' });
    expect(
      await screen.findByText(
        'You are viewing as this account — agents cannot be changed while impersonating.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the flows that use the agent', async () => {
    signInAs('owner');
    api.usage.mockResolvedValue({
      ...USAGE,
      flows: [{ id: 'f1', name: 'Loan recovery', status: 'published' }],
    });
    renderWithProviders({ route: '/agents/a1/basic' });
    expect(await screen.findByText('Used in 1 flow')).toBeInTheDocument();
  });

  it('turns the agent on / off from the header', async () => {
    signInAs('owner');
    api.setActive.mockResolvedValue(
      fakeAgent({ isActive: false, updatedAt: '2026-10-09T02:00:00.000Z' }),
    );
    renderWithProviders({ route: '/agents/a1/basic' });
    await userEvent.click(await screen.findByRole('switch'));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith('a1', false));
    expect(await screen.findByText('Agent is off')).toBeInTheDocument();
    expect(screen.getByText('This month ₹1.25 · today ₹0.25')).toBeInTheDocument();
  });

  it('offers a reload when the agent changed elsewhere', async () => {
    signInAs('owner');
    const { client, emit } = fakeRealtime();
    renderWithProviders({ route: '/agents/a1/basic', realtime: client });
    await screen.findByRole('textbox', { name: 'Name' });
    api.get.mockResolvedValue(
      fakeAgent({ name: 'Renamed elsewhere', updatedAt: '2026-10-09T05:00:00.000Z' }),
    );
    emit('agent.updated', { agentId: 'other' });
    emit('agent.updated', { agentId: 'a1' });
    expect(await screen.findByText(/This agent was changed elsewhere/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Renamed elsewhere' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/This agent was changed elsewhere/)).not.toBeInTheDocument();
  });

  it('edits limits, basic guardrails and allowed variables', async () => {
    signInAs('owner');
    api.update.mockResolvedValue(fakeAgent());
    renderWithProviders({ route: '/agents/a1/limits' });
    const longest = await screen.findByRole('spinbutton', { name: 'Longest call (seconds)' });
    await userEvent.clear(longest);
    await userEvent.type(longest, '600');
    await userEvent.click(
      screen.getByRole('switch', { name: 'Let the customer interrupt the agent' }),
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Text model' }));
    await userEvent.click(screen.getByRole('option', { name: 'gpt-4.1' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Refuse the turn' }));
    const aiFailed = screen.getByRole('textbox', { name: 'When the AI fails' });
    await userEvent.clear(aiFailed);
    await userEvent.type(aiFailed, 'Sorry');
    await userEvent.click(screen.getByRole('tab', { name: 'Basic' }));
    await userEvent.click(screen.getByRole('radio', { name: 'General' }));
    const neverSay = screen.getByRole('combobox', { name: 'Never say' });
    await userEvent.type(neverSay, 'jail{Enter}');
    await userEvent.click(screen.getByRole('combobox', { name: 'Allowed variables' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Loan amount ({{loan_amount}})' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('a1', {
        allowedVariables: ['name', 'loan_amount'],
        guardrails: {
          neverSay: ['legal notice', 'jail'],
          disclosureLine: 'Main AI assistant hoon.',
          complianceMode: 'general',
        },
        callBehaviour: {
          maxCallDurationSec: 600,
          silenceTimeoutSec: 8,
          bargeIn: false,
          endCallAfterSilenceRetries: 2,
        },
        model: { textModel: 'gpt-4.1', temperatureTenths: 6, maxOutputTokens: 300 },
        limits: { dailySpendCapMicros: 0, monthlySpendCapMicros: 0, onCap: 'stop' },
        fallback: expect.objectContaining({ aiFailed: 'Sorry' }) as unknown,
      }),
    );
  });

  it('previews with a sample contact (masked phone in the picker)', async () => {
    signInAs('owner');
    api.compilePreview.mockResolvedValue({
      instructions: 'Compiled',
      tools: [],
      openingLine: '',
      closingLine: '',
      variables: { name: 'Asha' },
      warnings: [],
    });
    contacts.list.mockResolvedValue({
      success: true,
      data: [{ id: 'c1', name: 'Asha Verma', phoneE164: '+919000000002' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    } as never);
    renderWithProviders({ route: '/agents/a1/basic' });
    await userEvent.click(await screen.findByRole('button', { name: 'Prompt preview' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Sample contact' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Contact' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Asha Verma · ••••0002' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Channel' }));
    await userEvent.click(screen.getByRole('option', { name: 'Voice (calls)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show prompt' }));
    await waitFor(() =>
      expect(api.compilePreview).toHaveBeenCalledWith('a1', { channel: 'voice', contactId: 'c1' }),
    );
    expect(await screen.findByText('None')).toBeInTheDocument();
  });

  it('handles load errors and unknown tabs', async () => {
    signInAs('owner');
    api.get.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Agent not found',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/agents/a1/nope' });
    expect(await screen.findByText('Agent not found')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('tab', { name: 'Basic', selected: true })).toBeInTheDocument();
  });
});
