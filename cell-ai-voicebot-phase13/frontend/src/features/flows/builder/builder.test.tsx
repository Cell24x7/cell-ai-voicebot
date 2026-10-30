import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { ApiError } from '@/services/api/errors';
import { flowAudioApi } from '@/services/api/flow-audio';
import { flowSimulatorApi } from '@/services/api/flow-simulator';
import { flowsApi } from '@/services/api/flows';
import { fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { FAKE_FLOW_CATALOG, KNOWN_VARIABLES, fakeFlow, fakeRun, sampleGraph } from '@/test/flows';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';
import { line, step } from '@/test/simulator';
import { installXyflowMocks } from '@/test/xyflow';

vi.mock('@/services/api/flows', () => ({
  flowsApi: {
    get: vi.fn(),
    catalog: vi.fn(),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    validate: vi.fn(),
    duplicate: vi.fn(),
    exportFile: vi.fn(),
    importFile: vi.fn(),
    version: vi.fn(),
    list: vi.fn(),
    versions: vi.fn(),
    variables: vi.fn(),
    stats: vi.fn(),
  },
}));
vi.mock('@/services/api/flow-simulator', () => ({
  flowSimulatorApi: { start: vi.fn(), send: vi.fn(), list: vi.fn(), get: vi.fn() },
}));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn(), catalog: vi.fn() } }));
vi.mock('@/services/api/flow-audio', () => ({ flowAudioApi: { list: vi.fn() } }));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const api = vi.mocked(flowsApi);

beforeAll(() => installXyflowMocks());
beforeEach(() => {
  api.get.mockResolvedValue(
    fakeFlow({
      issues: [
        {
          severity: 'warning',
          code: 'error_exit_unconnected',
          message: '"Greeting": errors go to the flow error message.',
          nodeId: 'greet',
          field: 'exits.error',
        },
      ],
    }),
  );
  api.catalog.mockResolvedValue(FAKE_FLOW_CATALOG);
  api.variables.mockResolvedValue(KNOWN_VARIABLES);
  api.list.mockResolvedValue({
    success: true,
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  api.versions.mockResolvedValue([]);
  vi.mocked(agentsApi.list).mockResolvedValue({
    success: true,
    data: [fakeAgentRow()],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  vi.mocked(flowAudioApi.list).mockResolvedValue([]);
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

const open = async (route = '/flows/f1', realtime = fakeRealtime()) => {
  renderWithProviders({ route, realtime: realtime.client });
  await screen.findByTestId('flow-node-greet');
  return realtime;
};
const nodeCount = () => screen.getAllByTestId(/^flow-node-/).length;

describe('flow builder', () => {
  it('draws the steps with summaries and labelled exits; shows the problems list', async () => {
    signInAs('owner');
    await open();
    expect(screen.getByRole('heading', { name: 'Loan recovery' })).toBeInTheDocument();
    const greet = screen.getByTestId('flow-node-greet');
    expect(within(greet).getByText('Greeting')).toBeInTheDocument();
    expect(within(greet).getByText('Namaste {{name}}')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('flow-node-menu')).getByText('Press 1 · Yes'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('flow-node-menu')).getByText('Press 1')).toBeInTheDocument();
    expect(screen.getByText('0 errors · 1 warning')).toBeInTheDocument();
    expect(screen.getByText('Saved · revision 3')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Steps' })).toBeInTheDocument();
  });

  it('adds a step from the palette, saves with the revision, undo / redo', async () => {
    signInAs('owner');
    api.saveDraft.mockResolvedValue({
      revision: 4,
      issues: [],
      hasUnpublishedChanges: true,
      savedAt: '2026-10-12T00:00:00Z',
    });
    await open();
    const before = nodeCount();
    await userEvent.click(screen.getByRole('button', { name: 'Add Wait' }));
    expect(nodeCount()).toBe(before + 1);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Step settings' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(nodeCount()).toBe(before);
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(nodeCount()).toBe(before + 1);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveDraft).toHaveBeenCalledWith(
        'f1',
        3,
        expect.objectContaining({ schemaVersion: 1 }),
      ),
    );
    expect(await screen.findByText('Saved · revision 4')).toBeInTheDocument();
    const saved = api.saveDraft.mock.calls[0]![2];
    expect(saved.nodes).toHaveLength(before + 1);
    expect(screen.getByText('No problems found.')).toBeInTheDocument();
  });

  it('keyboard: Ctrl+Z / Ctrl+Y, Ctrl+S, copy / paste, Escape', async () => {
    signInAs('owner');
    api.saveDraft.mockResolvedValue({
      revision: 4,
      issues: [],
      hasUnpublishedChanges: true,
      savedAt: 'x',
    });
    await open();
    const before = nodeCount();
    await userEvent.click(screen.getByRole('button', { name: 'Add Speak' }));
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    expect(nodeCount()).toBe(before + 2);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(nodeCount()).toBe(before + 1);
    fireEvent.keyDown(window, { key: 'y', metaKey: true });
    expect(nodeCount()).toBe(before + 2);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Step settings' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true }); // pastes the last copy again
    expect(nodeCount()).toBe(before + 3);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalled());
  });

  it('selects a step from the problems list, renames and deletes it', async () => {
    signInAs('owner');
    await open();
    await userEvent.click(screen.getByText('"Greeting": errors go to the flow error message.'));
    const panel = await screen.findByRole('complementary', { name: 'Step settings' });
    const name = within(panel).getByRole('textbox', { name: 'Step name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Hello step');
    expect(
      within(screen.getByTestId('flow-node-greet')).getByText('Hello step'),
    ).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByTestId('flow-node-greet')).not.toBeInTheDocument();
  });

  it('the step form edits the config; flow variables can be renamed', async () => {
    signInAs('owner');
    await open();
    await userEvent.click(screen.getByText('"Greeting": errors go to the flow error message.'));
    const panel = await screen.findByRole('complementary', { name: 'Step settings' });
    fireEvent.change(within(panel).getByLabelText('Text to say'), {
      target: { value: 'Namaste {{name}}, kaise hain?' },
    });
    expect(
      within(screen.getByTestId('flow-node-greet')).getByText(/kaise hain/),
    ).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Variables (1)' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'loan_status' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('button', { name: 'Variables (1)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Flow settings' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Flow settings');
  });

  it('stats overlay by version and range; the simulator highlights the current step', async () => {
    signInAs('owner');
    api.stats.mockResolvedValue([
      { nodeId: 'greet', entered: 4, exits: { next: 4 }, errors: 0, avgMs: 2 },
    ]);
    vi.mocked(agentsApi.catalog).mockRejectedValue(new Error('offline'));
    vi.mocked(flowSimulatorApi.list).mockResolvedValue([]);
    vi.mocked(flowSimulatorApi.get).mockResolvedValue(fakeRun({ currentNodeId: 'menu' }));
    vi.mocked(flowSimulatorApi.start).mockResolvedValue(
      step({ currentNodeId: 'menu' }, [line('bot', 'say', 'Namaste Asha')]),
    );
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Stats' }));
    expect(await screen.findByTestId('flow-stat-greet')).toHaveTextContent('4 in');
    expect(api.stats).toHaveBeenLastCalledWith(
      'f1',
      expect.objectContaining({ version: 'draft', mode: 'simulator' }),
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Stats of' }));
    await userEvent.click(screen.getByRole('option', { name: 'v2' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Range' }));
    await userEvent.click(screen.getByRole('option', { name: '30 days' }));
    await waitFor(() =>
      expect(api.stats).toHaveBeenLastCalledWith('f1', expect.objectContaining({ version: 2 })),
    );
    const q = api.stats.mock.lastCall?.[1];
    expect(q?.from && q.to ? (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 : 0).toBe(29);
    await userEvent.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.queryByTestId('flow-stat-greet')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Simulator' }));
    const panel = await screen.findByRole('complementary', { name: 'Simulator' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Start test call' }));
    expect(await within(panel).findByText('Namaste Asha')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('flow-node-menu')).toHaveAttribute('data-highlighted', 'true'),
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Close simulator' }));
    expect(screen.queryByRole('complementary', { name: 'Simulator' })).not.toBeInTheDocument();
  });

  it('a stale save opens the conflict dialog: reload or save as a copy', async () => {
    signInAs('owner');
    api.saveDraft.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'FLOW_REVISION_CONFLICT',
        message: 'Changed',
        kind: 'http',
        details: [
          { path: 'revision', message: '7' },
          { path: 'updatedBy', message: 'Ravi' },
        ],
      }),
    );
    api.importFile.mockResolvedValue({
      flow: fakeFlow({ id: 'f2', name: 'Loan recovery (my changes)' }),
      warnings: [],
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Add Wait' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'This flow was changed' });
    expect(within(dialog).getByText(/Ravi saved this flow/)).toBeInTheDocument();
    api.get.mockResolvedValueOnce(fakeFlow({ revision: 7 }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reload' }));
    expect(await screen.findByText('Saved · revision 7')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Wait' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save as a copy' }),
    );
    await waitFor(() =>
      expect(api.importFile).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'cell-ai-flow', name: 'Loan recovery' }),
        'Loan recovery (my changes)',
      ),
    );
  });

  it('other save errors are shown', async () => {
    signInAs('owner');
    api.saveDraft.mockRejectedValue(
      new ApiError({
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The flow is too large.',
        kind: 'http',
      }),
    );
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Add Wait' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('The flow is too large.')).toBeInTheDocument();
  });

  it('publish: blocked while unsaved; server problems shown; success', async () => {
    signInAs('manager');
    api.publish.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'FLOW_INVALID',
        message: 'The call flow has 1 problem to fix before publishing.',
        kind: 'http',
        details: [
          {
            path: 'exits.key_k1',
            message: '"Main menu": "Press 1" is not connected.',
            issue: 'exit_required',
            severity: 'error',
            nodeId: 'menu',
          },
        ],
      }),
    );
    api.publish.mockResolvedValueOnce({
      id: 'v3',
      version: 3,
      notes: 'Go',
      checksum: 'x',
      nodesCount: 4,
      current: true,
      publishedBy: null,
      publishedAt: 'x',
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish this flow' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Notes (optional)' }), 'Go');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('"Main menu": "Press 1" is not connected.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Publish' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    api.validate.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('No problems found')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' }),
    );
    await waitFor(() => expect(api.publish).toHaveBeenLastCalledWith('f1', 3, null));
    expect(await screen.findByText('Published v3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Wait' }));
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('validate reports problems; a revision conflict on publish opens the dialog', async () => {
    signInAs('owner');
    api.validate.mockResolvedValue([
      { severity: 'error', code: 'no_ending', message: 'No path ends.' },
    ]);
    api.publish.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'FLOW_REVISION_CONFLICT',
        message: 'Changed',
        kind: 'http',
      }),
    );
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Problems found')).toBeInTheDocument();
    expect(screen.getByText('No path ends.')).toBeInTheDocument();
    api.validate.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Down', kind: 'http' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Down')).toBeInTheDocument();
    api.validate.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'This flow was changed' }),
    ).toBeInTheDocument();
  });

  it('menu: auto-layout, duplicate, export, fit to screen', async () => {
    signInAs('owner');
    api.duplicate.mockResolvedValue(fakeFlow({ id: 'f5' }));
    api.exportFile.mockResolvedValue({ fileName: 'flow.json', data: {} });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Auto-layout' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Export JSON' }));
    await waitFor(() => expect(api.exportFile).toHaveBeenCalledWith('f1', 'draft'));
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Fit to screen' }));
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith('f1'));
  });

  it('live updates: silent reload when clean, a banner when there are unsaved changes', async () => {
    signInAs('owner');
    const rt = await open();
    api.get.mockResolvedValueOnce(fakeFlow({ revision: 5 }));
    rt.emit('flow.updated', { flowId: 'f1', revision: 5, by: 'other-user' });
    expect(await screen.findByText('Saved · revision 5')).toBeInTheDocument();
    rt.emit('flow.updated', { flowId: 'f1', revision: 2, by: 'other-user' }); // older — ignored
    await userEvent.click(screen.getByRole('button', { name: 'Add Wait' }));
    rt.emit('flow.updated', { flowId: 'f1', revision: 6, by: 'other-user' });
    expect(await screen.findByText('This flow was updated elsewhere.')).toBeInTheDocument();
    api.get.mockResolvedValueOnce(fakeFlow({ revision: 6 }));
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByText('Saved · revision 6')).toBeInTheDocument();
  });

  it('read-only for viewers (no palette, no save) and for version views', async () => {
    signInAs('viewer');
    await open();
    expect(
      screen.getByText('Read-only: you can view this flow but not change it.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Steps' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true }); // ignored
  });

  it('shows a published version read-only', async () => {
    signInAs('owner');
    api.version.mockResolvedValue({
      id: 'v1',
      version: 1,
      notes: null,
      checksum: 'x',
      nodesCount: 4,
      current: false,
      publishedBy: null,
      publishedAt: 'x',
      graph: sampleGraph() as never,
    });
    await open('/flows/f1?v=1');
    expect(screen.getByText('Viewing v1')).toBeInTheDocument();
    expect(screen.getByText(/You are viewing published version v1/)).toBeInTheDocument();
  });

  it('impersonation and small screens are read-only; load errors offer a retry', async () => {
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa', expiresAt: '2030-01-01T00:00:00Z' },
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );
    await open();
    expect(screen.getByText(/flows cannot be changed while impersonating/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('load errors offer a retry', async () => {
    signInAs('owner');
    api.get.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Flow not found',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/flows/f1' });
    expect(await screen.findByText('Flow not found')).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });
  });
});

describe('canvas selection', () => {
  it('clicking a step on the canvas opens its settings (controlled nodes apply "select")', async () => {
    signInAs('owner');
    await open();
    expect(screen.queryByRole('complementary', { name: 'Step settings' })).not.toBeInTheDocument();
    // click only — d3-drag's mousedown needs a real window (Playwright covers dragging)
    fireEvent.click(within(screen.getByTestId('flow-node-greet')).getByText('Greeting'));
    const panel = await screen.findByRole('complementary', { name: 'Step settings' });
    expect(within(panel).getByRole('textbox', { name: 'Step name' })).toHaveValue('Greeting');
    fireEvent.click(within(screen.getByTestId('flow-node-menu')).getByText('Main menu'));
    expect(
      await within(screen.getByRole('complementary', { name: 'Step settings' })).findByDisplayValue(
        'Main menu',
      ),
    ).toBeInTheDocument();
  });
});

describe('validate with unsaved changes', () => {
  it('shows the server problems of the checked graph until it changes again', async () => {
    signInAs('owner');
    api.validate.mockResolvedValue([
      { severity: 'error', code: 'url_blocked', message: '"Check": This address is not allowed.' },
    ]);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Add Wait' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await waitFor(() =>
      expect(api.validate).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({ schemaVersion: 1 }),
      ),
    );
    expect(await screen.findByText('"Check": This address is not allowed.')).toBeInTheDocument();
    // a further edit makes the server answer stale → local checks again
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('"Check": This address is not allowed.')).not.toBeInTheDocument();
  });
});
