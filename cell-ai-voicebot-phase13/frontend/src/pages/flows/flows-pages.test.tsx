import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import { fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeFlow, fakeFlowRow } from '@/test/flows';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/flows', () => ({
  flowsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    exportFile: vi.fn(),
    importFile: vi.fn(),
    templates: vi.fn(),
    versions: vi.fn(),
    restore: vi.fn(),
  },
}));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn(), create: vi.fn() } }));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const api = vi.mocked(flowsApi);
const agents = vi.mocked(agentsApi);
const page = (rows = [fakeFlowRow()]) => ({
  success: true as const,
  data: rows,
  meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 },
});
const VERSIONS = [
  {
    id: 'v2',
    version: 2,
    notes: 'Second',
    checksum: 'abcdef1234',
    nodesCount: 4,
    current: true,
    publishedBy: { id: 'u1', name: 'Asha' },
    publishedAt: '2026-10-11T00:00:00.000Z',
  },
  {
    id: 'v1',
    version: 1,
    notes: null,
    checksum: '99887766aa',
    nodesCount: 3,
    current: false,
    publishedBy: null,
    publishedAt: '2026-10-10T00:00:00.000Z',
  },
];

let createObjectURL: ReturnType<typeof vi.fn>;
beforeEach(() => {
  api.list.mockResolvedValue(page());
  api.get.mockResolvedValue(fakeFlow());
  api.versions.mockResolvedValue(VERSIONS);
  api.templates.mockResolvedValue([
    {
      key: 'loan_recovery',
      title: 'Loan recovery',
      description: 'EMI menu + AI',
      language: 'hinglish',
      aiNodes: [
        { nodeId: 'ai', label: 'Recovery agent', suggestedAgentTemplate: 'loan_recovery_hinglish' },
      ],
      optionalFields: ['amount'],
    },
  ]);
  agents.list.mockResolvedValue({
    success: true,
    data: [
      fakeAgentRow({ id: 'a1', name: 'Recovery Bot', templateKey: 'loan_recovery_hinglish' }),
      fakeAgentRow({ id: 'a2', name: 'Other', templateKey: null, isActive: false }),
    ],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  createObjectURL = vi.fn(() => 'blob:x');
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

describe('flows list', () => {
  it('shows rows with status chips and refreshes on live updates', async () => {
    signInAs('owner');
    const rt = fakeRealtime();
    renderWithProviders({ route: '/flows', realtime: rt.client });
    expect(await screen.findByRole('link', { name: 'Loan recovery' })).toHaveAttribute(
      'href',
      '/flows/f1',
    );
    expect(screen.getByText('Published v2')).toBeInTheDocument();
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument();
    expect(screen.getByText('Recovery Bot')).toBeInTheDocument();
    rt.emit('flow.updated', { flowId: 'f1', revision: 9, by: null });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('searches and filters by status in the URL', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/flows' });
    await screen.findByText('Loan recovery');
    await userEvent.type(screen.getByRole('textbox', { name: 'Search flows' }), 'loan');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'loan' })),
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Archived' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'archived' })),
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'All' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined })),
    );
  });

  it('empty and error states', async () => {
    signInAs('owner');
    api.list.mockResolvedValueOnce(page([]));
    renderWithProviders({ route: '/flows' });
    expect(await screen.findByText('No call flows yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create from a template' }));
    expect(await screen.findByRole('heading', { name: 'New call flow' })).toBeInTheDocument();
  });

  it('duplicate, archive / unarchive, export and delete (in-use message)', async () => {
    signInAs('owner');
    api.list.mockResolvedValue(
      page([fakeFlowRow(), fakeFlowRow({ id: 'f2', name: 'Old flow', status: 'archived' })]),
    );
    api.duplicate.mockResolvedValue(fakeFlow({ name: 'Loan recovery (copy)' }));
    api.archive.mockResolvedValue(fakeFlow({ status: 'archived' }));
    api.unarchive.mockResolvedValue(fakeFlow({ name: 'Old flow', status: 'draft' }));
    api.exportFile.mockResolvedValue({
      fileName: 'flow-loan-draft.json',
      data: { format: 'cell-ai-flow' },
    });
    api.remove.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'RESOURCE_IN_USE',
        message: 'In use',
        kind: 'http',
        details: [{ path: 'campaigns', message: 'October drive' }],
      }),
    );
    api.remove.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Boom', kind: 'http' }),
    );
    renderWithProviders({ route: '/flows' });
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate Loan recovery' }));
    expect(await screen.findByText('Created "Loan recovery (copy)"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive Loan recovery' }));
    expect(await screen.findByText('"Loan recovery" archived')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Old flow' }));
    expect(await screen.findByText('"Old flow" restored')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export Loan recovery' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Delete Loan recovery' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('This flow is in use: October drive.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Loan recovery' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    api.remove.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Loan recovery' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Flow deleted')).toBeInTheDocument();
  });

  it('imports a JSON file (warnings shown) and refuses non-JSON files', async () => {
    signInAs('owner');
    api.importFile.mockResolvedValue({
      flow: fakeFlow({ id: 'f9', name: 'Imported' }),
      warnings: ['agent_unmapped:ai', 'odd'],
    });
    renderWithProviders({ route: '/flows' });
    await screen.findByText('Loan recovery');
    const input = screen.getByLabelText('Flow JSON file');
    await userEvent.upload(
      input,
      new File(['{"format":"cell-ai-flow"}'], 'f.json', { type: 'application/json' }),
    );
    expect(await screen.findByText('Imported "Imported"')).toBeInTheDocument();
    expect(screen.getByText('AI agent not found — pick one (ai)')).toBeInTheDocument();
    expect(screen.getByText('odd')).toBeInTheDocument();
    expect(api.importFile).toHaveBeenCalledWith({ format: 'cell-ai-flow' });
  });

  it('a bad import file shows an error', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/flows' });
    await screen.findByText('Loan recovery');
    await userEvent.upload(
      screen.getByLabelText('Flow JSON file'),
      new File(['not json'], 'f.json', { type: 'application/json' }),
    );
    expect(await screen.findByText('This file is not a flow export (JSON).')).toBeInTheDocument();
    expect(api.importFile).not.toHaveBeenCalled();
  });

  it('viewers see the list read-only', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/flows' });
    await screen.findByText('Loan recovery');
    expect(screen.queryByRole('button', { name: 'New flow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Loan recovery' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import JSON' })).not.toBeInTheDocument();
  });
});

describe('new flow', () => {
  it('creates from a template with the suggested agent pre-selected', async () => {
    signInAs('manager');
    api.create.mockResolvedValue(fakeFlow({ id: 'f7', addedVariables: ['amount'] }));
    renderWithProviders({ route: '/flows/new' });
    await userEvent.click(await screen.findByRole('button', { name: 'Loan recovery' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Flow name' })).toHaveValue('Loan recovery');
    await waitFor(() =>
      expect(
        within(dialog).getByRole('combobox', { name: 'AI agent for "Recovery agent"' }),
      ).toHaveTextContent('Recovery Bot'),
    );
    expect(within(dialog).getByText(/Missing ones become flow variables/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create flow' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        name: 'Loan recovery',
        templateKey: 'loan_recovery',
        agentIds: { ai: 'a1' },
      }),
    );
    expect(
      await screen.findByText('Flow variables added for missing contact fields: amount'),
    ).toBeInTheDocument();
  });

  it('can create the matching agent, choose later, or start blank', async () => {
    signInAs('manager');
    agents.create.mockResolvedValue({ id: 'a9', name: 'Recovery agent (x)' } as never);
    api.create.mockResolvedValue(fakeFlow({ id: 'f8' }));
    renderWithProviders({ route: '/flows/new' });
    await userEvent.click(await screen.findByRole('button', { name: 'Loan recovery' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create the matching agent' }),
    );
    await waitFor(() =>
      expect(agents.create).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'loan_recovery_hinglish' }),
      ),
    );
    expect(await screen.findByText(/Created agent/)).toBeInTheDocument();
    fireEvent.mouseDown(
      within(dialog).getByRole('combobox', { name: 'AI agent for "Recovery agent"' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Choose later' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create flow' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenLastCalledWith({
        name: 'Loan recovery',
        templateKey: 'loan_recovery',
        agentIds: {},
      }),
    );
  });

  it('blank flow: name required, server errors shown, cancel closes', async () => {
    signInAs('manager');
    renderWithProviders({ route: '/flows/new' });
    await userEvent.click(await screen.findByRole('button', { name: 'Blank flow' }));
    const blank = await screen.findByRole('dialog');
    const create = within(blank).getByRole('button', { name: 'Create flow' });
    expect(create).toBeDisabled();
    await userEvent.type(within(blank).getByRole('textbox', { name: 'Flow name' }), 'My flow');
    api.create.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'CONFLICT_DUPLICATE',
        message: 'A flow with this name already exists.',
        kind: 'http',
      }),
    );
    await userEvent.click(create);
    expect(await screen.findByText('A flow with this name already exists.')).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith({ name: 'My flow' });
    await userEvent.click(within(blank).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creating the matching agent can fail', async () => {
    signInAs('manager');
    agents.create.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'Agent limit',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/flows/new' });
    await userEvent.click(await screen.findByRole('button', { name: 'Loan recovery' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Create the matching agent',
      }),
    );
    expect(await screen.findByText('Agent limit')).toBeInTheDocument();
  });

  it('read-only users are sent back to the list', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/flows/new' });
    expect(await screen.findByRole('heading', { name: 'Call flows' })).toBeInTheDocument();
  });
});

describe('versions', () => {
  it('lists versions, exports one and restores into the draft', async () => {
    signInAs('manager');
    const restored = fakeFlow({ revision: 9 });
    api.restore.mockResolvedValue(restored);
    api.exportFile.mockResolvedValue({ fileName: 'flow-v1.json', data: {} });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithProviders({ route: '/flows/f1/versions', queryClient });
    expect(await screen.findByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('abcdef12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View v1' })).toHaveAttribute('href', '/flows/f1?v=1');
    await userEvent.click(screen.getByRole('button', { name: 'Export v1' }));
    await waitFor(() => expect(api.exportFile).toHaveBeenCalledWith('f1', 1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore v1' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Restore v1' }));
    // refetches hang, so only what restore put in the cache counts
    api.get.mockReturnValue(new Promise(() => undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith('f1', 1, 3));
    // the builder opens with the restored draft, not the cached old one
    await waitFor(() =>
      expect(queryClient.getQueryData(['flows', 'detail', 'f1'])).toMatchObject({ revision: 9 }),
    );
  });

  it('viewers only view; empty state before the first publish', async () => {
    signInAs('viewer');
    api.versions.mockResolvedValue([]);
    renderWithProviders({ route: '/flows/f1/versions' });
    expect(await screen.findByText('Not published yet')).toBeInTheDocument();
  });

  it('restore errors are shown', async () => {
    signInAs('owner');
    api.restore.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'FLOW_REVISION_CONFLICT',
        message: 'Changed elsewhere',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/flows/f1/versions' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore v2' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Restore v2' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(await screen.findByText('Changed elsewhere')).toBeInTheDocument();
  });
});
