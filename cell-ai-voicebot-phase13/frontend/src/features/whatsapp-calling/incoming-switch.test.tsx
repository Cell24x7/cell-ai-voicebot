import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeFlowRow } from '@/test/flows';
import { renderWithProviders } from '@/test/render';

import { IncomingDefaultCard } from './settings/IncomingDefaultCard';

vi.mock('@/services/api/whatsapp-calling', () => ({
  whatsappCallingApi: { getIncomingDefault: vi.fn(), setIncomingDefault: vi.fn() },
}));
vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn() } }));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
const api = vi.mocked(whatsappCallingApi);
const offset = <T,>(data: T[]) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 100, total: data.length, totalPages: 1 },
});
const show = () =>
  renderWithProviders({ routes: [{ path: '/', element: <IncomingDefaultCard /> }] });

beforeEach(() => {
  api.getIncomingDefault.mockResolvedValue({ route: 'team', aiProgram: null, ringTimeoutSec: 30 });
  api.setIncomingDefault.mockImplementation((b) => Promise.resolve(b));
  vi.mocked(flowsApi.list).mockResolvedValue(offset([fakeFlowRow()]));
  vi.mocked(agentsApi.list).mockResolvedValue(offset([fakeAgentRow()]));
});
afterEach(() => vi.clearAllMocks());

describe('Settings → Calls: incoming WhatsApp calls default (SAC-T7)', () => {
  it('owner turns the AI on with a flow and saves the mapped route', async () => {
    signInAs('owner');
    show();
    await screen.findByText('Abhi: team uthayegi');
    await userEvent.click(screen.getByRole('switch', { name: 'AI se incoming calls uthao' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(screen.getByRole('combobox', { name: 'Published flow' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Loan recovery' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.setIncomingDefault).toHaveBeenCalledWith({
        route: 'ai_then_team',
        aiProgram: { kind: 'flow', id: 'f1' },
        ringTimeoutSec: 30,
      }),
    );
  });

  it('shows the wallet problem from the server', async () => {
    signInAs('owner');
    api.setIncomingDefault.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'x',
        kind: 'http',
        details: [
          { path: 'wallet', message: 'Add money first — AI answers are paid from the wallet.' },
        ],
      }),
    );
    show();
    await screen.findByText('Abhi: team uthayegi');
    await userEvent.click(screen.getByRole('switch', { name: 'AI se incoming calls uthao' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Published flow' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Loan recovery' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Add money first/)).toBeVisible();
  });

  it('agents read it but cannot change it', async () => {
    signInAs('agent');
    show();
    await screen.findByText(/Only the owner and admins/);
    expect(screen.getByRole('switch', { name: 'AI se incoming calls uthao' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
