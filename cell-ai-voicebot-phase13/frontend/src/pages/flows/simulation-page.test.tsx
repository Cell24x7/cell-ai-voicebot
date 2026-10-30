import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flowSimulatorApi } from '@/services/api/flow-simulator';
import { flowsApi } from '@/services/api/flows';
import { signInAs } from '@/test/auth';
import { fakeFlow, fakeRun } from '@/test/flows';
import { renderWithProviders } from '@/test/render';
import { line } from '@/test/simulator';

vi.mock('@/services/api/flows', () => ({ flowsApi: { get: vi.fn() } }));
vi.mock('@/services/api/flow-simulator', () => ({ flowSimulatorApi: { get: vi.fn() } }));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

beforeEach(() => {
  signInAs('viewer');
  vi.mocked(flowsApi.get).mockResolvedValue(fakeFlow());
});

const ROUTE = '/flows/f1/simulations/r1';

describe('FlowSimulationPage', () => {
  it('shows transcript, values, outcome, trace and banners', async () => {
    vi.mocked(flowSimulatorApi.get).mockResolvedValue(
      fakeRun({
        status: 'ended',
        waiting: null,
        endReason: 'transferred',
        versionRef: 2,
        costMicros: 2_500_000,
        variables: { name: 'Asha', note: '' },
        outcome: {
          disposition: 'promise_to_pay',
          dispositionNote: 'kal',
          promiseToPay: { date: '2026-10-13', amountMicros: 2_500_000_000 },
          callback: { date: '2026-10-14', time: '10:00' },
          transfer: { result: 'no_answer' },
          messages: [
            { channel: 'sms', nodeId: 'sms', text: 'Pay link', templateName: null, params: [] },
            { channel: 'whatsapp', nodeId: 'wa', text: null, templateName: 'emi', params: [] },
          ],
        },
        transcript: [
          line('bot', 'say', 'Namaste'),
          line('bot', 'ai', 'No money', { meta: { fallback: 'walletEmpty' } }),
          line('bot', 'ai', 'Cap', { meta: { fallback: 'capReached' } }),
        ],
        trace: [
          {
            seq: 1,
            at: 'x',
            nodeId: 'greet',
            type: 'speak',
            event: 'exit',
            handle: 'next',
            detail: 'ok',
            durationMs: 4,
          },
          { seq: 2, at: 'x', nodeId: null, type: null, event: 'end' },
        ],
      }),
    );
    renderWithProviders({ route: ROUTE });
    expect(await screen.findByText('Namaste')).toBeInTheDocument();
    expect(screen.getByText('Loan recovery — test call')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Transferred')).toBeInTheDocument();
    expect(screen.getByText(/wallet was empty/)).toBeInTheDocument();
    expect(screen.getByText(/spending limit during this call/)).toBeInTheDocument();
    expect(screen.getByText('Disposition: Promise to pay — kal')).toBeInTheDocument();
    expect(screen.getByText(/Promise to pay: 2026-10-13 ·/)).toBeInTheDocument();
    expect(screen.getByText('Callback: 2026-10-14 10:00')).toBeInTheDocument();
    expect(screen.getByText('Transfer: no answer')).toBeInTheDocument();
    expect(screen.getByText('SMS queued: Pay link')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp queued: emi')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Values (2)'));
    expect(
      within(screen.getByRole('table', { name: 'Values' })).getByText('—'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText('Trace (2)'));
    expect(screen.getByText('exit → next (ok)')).toBeInTheDocument();
  });

  it('empty run: no values, no outcome, no transcript', async () => {
    vi.mocked(flowSimulatorApi.get).mockResolvedValue(
      fakeRun({ variables: {}, transcript: [], contactName: null, createdBy: null }),
    );
    renderWithProviders({ route: ROUTE });
    expect(await screen.findByText('Nothing said yet.')).toBeInTheDocument();
    expect(screen.getByText('Typed values', { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Values (0)'));
    expect(screen.getByText('No values.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Outcome'));
    expect(screen.getByText('Nothing recorded yet.')).toBeInTheDocument();
  });

  it('load error offers a retry', async () => {
    vi.mocked(flowSimulatorApi.get).mockRejectedValueOnce(new Error('gone'));
    vi.mocked(flowSimulatorApi.get).mockResolvedValueOnce(
      fakeRun({ transcript: [line('bot', 'say', 'Back')] }),
    );
    renderWithProviders({ route: ROUTE });
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Back')).toBeInTheDocument();
  });
});
