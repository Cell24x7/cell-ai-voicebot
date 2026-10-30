import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { contactsApi } from '@/services/api/contacts';
import { ApiError } from '@/services/api/errors';
import { flowSimulatorApi } from '@/services/api/flow-simulator';
import type { Flow } from '@/services/api/types';
import { FAKE_CATALOG } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { KNOWN_VARIABLES, fakeFlow, fakeRun } from '@/test/flows';
import { renderWithProviders } from '@/test/render';
import { line, step } from '@/test/simulator';

import { SimulatorPanel } from './SimulatorPanel';

vi.mock('@/services/api/flow-simulator', () => ({
  flowSimulatorApi: { start: vi.fn(), send: vi.fn(), list: vi.fn(), get: vi.fn() },
}));
vi.mock('@/services/api/agents', () => ({ agentsApi: { catalog: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({ contactsApi: { list: vi.fn() } }));

const sim = vi.mocked(flowSimulatorApi);

beforeEach(() => {
  signInAs('owner');
  vi.mocked(agentsApi.catalog).mockResolvedValue(FAKE_CATALOG);
  sim.list.mockResolvedValue([]);
  sim.get.mockImplementation((_f, runId) =>
    Promise.resolve(
      fakeRun({
        id: runId,
        trace: [{ seq: 1, at: 'x', nodeId: 'greet', type: 'speak', event: 'enter', durationMs: 3 }],
      }),
    ),
  );
  let n = 0;
  vi.stubGlobal('crypto', {
    ...crypto,
    randomUUID: () => `00000000-0000-4000-8000-00000000000${String(++n)}`,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const show = (
  props: Partial<Parameters<typeof SimulatorPanel>[0]> = {},
  flow: Flow = fakeFlow(),
) => {
  const onNode = vi.fn();
  const onClose = vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <SimulatorPanel
            flow={flow}
            dirty={false}
            canRun
            known={KNOWN_VARIABLES}
            flowVariables={[{ name: 'status', type: 'text' }]}
            onNode={onNode}
            onClose={onClose}
            {...props}
          />
        ),
      },
      { path: '/flows/:id/simulations/:runId', element: <p>Run page</p> },
    ],
  });
  return { onNode, onClose };
};

const GREETING = line('bot', 'say', 'Namaste Asha');

describe('simulator panel', () => {
  it('starts with typed values, presses menu keys and follows the current step', async () => {
    sim.start.mockResolvedValue(step({ currentNodeId: 'menu' }, [GREETING]));
    sim.send.mockResolvedValue(
      step(
        {
          status: 'ended',
          waiting: null,
          currentNodeId: null,
          endReason: 'hangup_node',
          costMicros: 0,
          outcome: { ...fakeRun().outcome, disposition: 'paid' },
        },
        [
          line('customer', 'dtmf', '1'),
          line('bot', 'say', 'Dhanyavaad'),
          line('system', 'note', 'Call ended'),
        ],
      ),
    );
    const { onNode } = show();
    expect(await screen.findByText('Test mode — fake AI')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('{{name}}'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('{{status}}'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Test phone (optional)'), {
      target: { value: '+91 98765-43210' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Start test call' }));
    await waitFor(() =>
      expect(sim.start).toHaveBeenCalledWith('f1', {
        version: 'draft',
        variables: { name: 'Asha' },
        testPhone: '+919876543210',
      }),
    );
    expect(await screen.findByText('Namaste Asha')).toBeInTheDocument();
    expect(onNode).toHaveBeenLastCalledWith('menu');
    await userEvent.click(screen.getByRole('button', { name: 'Press 1: Yes' }));
    await waitFor(() =>
      expect(sim.send).toHaveBeenCalledWith('f1', 'r1', {
        kind: 'dtmf',
        value: '1',
        clientInputId: '00000000-0000-4000-8000-000000000001',
      }),
    );
    expect(await screen.findByText('Hung up by the flow')).toBeInTheDocument();
    expect(onNode).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Disposition: Paid')).toBeInTheDocument();
    // clicking a bot line highlights its step
    await userEvent.click(screen.getByText('Dhanyavaad'));
    expect(onNode).toHaveBeenLastCalledWith('greet');
    await userEvent.click(screen.getByText(/Trace \(1\)/));
    await userEvent.click(within(screen.getByRole('table', { name: 'Trace' })).getByText('enter'));
    expect(onNode).toHaveBeenLastCalledWith('greet');
    await userEvent.click(screen.getByRole('link', { name: 'Full details' }));
    expect(await screen.findByText('Run page')).toBeInTheDocument();
  });

  it('a failed input can be retried with the same id; a definite error is not retried', async () => {
    sim.start.mockResolvedValue(
      step({ waiting: { kind: 'speech', nodeId: 'ask' }, currentNodeId: 'ask' }, [GREETING]),
    );
    sim.send
      .mockRejectedValueOnce(
        new ApiError({
          kind: 'network',
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'Network down',
        }),
      )
      .mockResolvedValueOnce(
        step({ waiting: { kind: 'ai', nodeId: 'ai' }, currentNodeId: 'ai' }, [
          line('customer', 'speech', 'kal tak de dunga'),
          line('bot', 'ai', 'Theek hai', { meta: { fallback: null } }),
        ]),
      )
      .mockRejectedValueOnce(
        new ApiError({
          kind: 'http',
          status: 409,
          code: 'CONFLICT_INVALID_STATE',
          message: 'This simulation has ended.',
        }),
      );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start test call' }));
    const say = await screen.findByLabelText('Customer says');
    await userEvent.type(say, 'kal tak de dunga{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Theek hai')).toBeInTheDocument();
    const ids = sim.send.mock.calls.map((c) => c[2].clientInputId);
    expect(ids[0]).toBe(ids[1]);
    await userEvent.type(screen.getByLabelText('Reply to the AI agent'), 'ok');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('This simulation has ended.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    await waitFor(() => expect(sim.get).toHaveBeenCalled());
  });

  it('digits, silence, transfer, hang up and restart', async () => {
    sim.start.mockResolvedValue(
      step(
        {
          waiting: { kind: 'dtmf', nodeId: 'acct', mode: 'digits', maxDigits: 2 },
          currentNodeId: 'acct',
        },
        [GREETING],
      ),
    );
    sim.send
      .mockResolvedValueOnce(
        step({ waiting: { kind: 'dtmf', nodeId: 'acct', mode: 'digits', maxDigits: 2 } }, [
          line('customer', 'dtmf', '42'),
        ]),
      )
      .mockResolvedValueOnce(
        step({ waiting: { kind: 'transfer', nodeId: 'tr', transferPhoneLast4: '0000' } }, [
          line('system', 'note', '(silence)'),
        ]),
      )
      .mockResolvedValueOnce(
        step({ waiting: { kind: 'speech', nodeId: 'ask' } }, [
          line('system', 'transfer', 'Transfer no answer'),
        ]),
      )
      .mockResolvedValueOnce(
        step({ status: 'ended', waiting: null, endReason: null }, [
          line('system', 'note', 'Call ended'),
        ]),
      );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start test call' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Press 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Press 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.click(screen.getByRole('button', { name: 'Press 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Press 2' }));
    expect(screen.getByRole('button', { name: 'Press 9' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(sim.send.mock.calls[0]?.[2]).toMatchObject({ kind: 'dtmf', value: '42' }),
    );
    const silent = await screen.findByRole('button', { name: 'Stay silent' });
    await waitFor(() => expect(silent).toBeEnabled());
    await waitFor(() => expect(sim.send).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stay silent' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Stay silent' }));
    expect(await screen.findByText(/Transfer to ••••0000/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'No answer' }));
    await waitFor(() =>
      expect(sim.send.mock.calls[2]?.[2]).toMatchObject({
        kind: 'transfer_result',
        value: 'no_answer',
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Hang up' }));
    expect(await screen.findByText('Call ended', { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New test' }));
    expect(screen.getByRole('button', { name: 'Start test call' })).toBeInTheDocument();
  });

  it('restart mid-call; wallet and cap banners', async () => {
    sim.start.mockResolvedValue(
      step({ waiting: { kind: 'ai', nodeId: 'ai' } }, [
        line('bot', 'ai', 'Wallet khaali', { meta: { fallback: 'walletEmpty' } }),
        line('bot', 'ai', 'Limit', { meta: { fallback: 'capReached' } }),
        line('system', 'message', 'Pay link', { meta: { channel: 'sms' } }),
        line('system', 'message', 'Template', { meta: { channel: 'whatsapp' } }),
      ]),
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start test call' }));
    expect(await screen.findByText(/Your wallet is empty/)).toBeInTheDocument();
    expect(screen.getByText(/reached its spending limit/)).toBeInTheDocument();
    expect(screen.getByText('Fallback: walletEmpty')).toBeInTheDocument();
    expect(screen.getByText('SMS: Pay link')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp: Template')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('button', { name: 'Start test call' })).toBeInTheDocument();
  });

  it('unsaved draft blocks the draft; published version and a contact can be chosen', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue({
      success: true,
      data: [{ id: 'c1', name: 'Asha', phoneE164: '+919000400012' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    } as never);
    sim.start.mockRejectedValueOnce(
      new ApiError({ kind: 'http', status: 404, code: 'NOT_FOUND', message: 'Contact not found' }),
    );
    show({ dirty: true });
    expect(screen.getByText(/Save first/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start test call' })).toBeDisabled();
    await userEvent.click(screen.getByRole('combobox', { name: 'Version' }));
    await userEvent.click(screen.getByRole('option', { name: 'Published (v2)' }));
    await userEvent.click(screen.getByLabelText('A contact'));
    expect(screen.getByRole('button', { name: 'Start test call' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Contact'));
    await userEvent.click(await screen.findByRole('option', { name: 'Asha · ••••0012' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start test call' }));
    expect(await screen.findByText('Contact not found')).toBeInTheDocument();
    expect(sim.start).toHaveBeenCalledWith('f1', { version: 'published', contactId: 'c1' });
  });

  it('shows field errors from the server on typed values', async () => {
    sim.start.mockRejectedValueOnce(
      new ApiError({
        kind: 'http',
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'Invalid',
        details: [{ path: 'variables.status', message: 'Not a valid text' }],
      }),
    );
    show({}, fakeFlow({ publishedVersion: null }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Version' }));
    expect(screen.queryByRole('option', { name: /Published/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Start test call' }));
    expect(await screen.findByText('Not a valid text')).toBeInTheDocument();
  });

  it('history: viewers see only past runs; close button', async () => {
    sim.list.mockResolvedValue([
      {
        id: 'r9',
        versionRef: 2,
        status: 'ended',
        endReason: 'transferred',
        disposition: null,
        costMicros: 120000,
        contactName: null,
        createdBy: { id: 'u1', name: 'Asha Verma' },
        createdAt: '2026-10-11T00:00:00.000Z',
      },
      {
        id: 'r8',
        versionRef: 'draft',
        status: 'waiting',
        endReason: null,
        disposition: null,
        costMicros: 0,
        contactName: 'Ravi',
        createdBy: null,
        createdAt: '2026-10-11T00:00:00.000Z',
      },
    ]);
    const { onClose } = show({ canRun: false });
    expect(screen.queryByRole('tab', { name: 'Test call' })).not.toBeInTheDocument();
    expect(await screen.findByText('v2 · Transferred')).toBeInTheDocument();
    expect(screen.getByText('Draft · Waiting for the customer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close simulator' }));
    expect(onClose).toHaveBeenCalled();
    await userEvent.click(screen.getByText('v2 · Transferred'));
    expect(await screen.findByText('Run page')).toBeInTheDocument();
  });

  it('history: empty and error states', async () => {
    show();
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('No test calls yet.')).toBeInTheDocument();
  });

  it('history: load error', async () => {
    sim.list.mockRejectedValue(new Error('boom'));
    show({ canRun: false });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
