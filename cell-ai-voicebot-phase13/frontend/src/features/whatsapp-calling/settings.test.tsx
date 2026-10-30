import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import { teamApi } from '@/services/api/team';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeCallingSettings } from '@/test/calls-wa';
import { fakeFlowRow } from '@/test/flows';
import { renderWithProviders } from '@/test/render';

import { CallingSection } from './settings/CallingSection';
import { settingsPatch, settingsProblems, draftOf } from './settings/form';

vi.mock('@/services/api/whatsapp-calling', () => ({
  whatsappCallingApi: { getSettings: vi.fn(), updateSettings: vi.fn(), syncSettings: vi.fn() },
}));
vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn() } }));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/team', () => ({ teamApi: { list: vi.fn() } }));
const api = vi.mocked(whatsappCallingApi);
const offset = <T,>(data: T[]) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 100, total: data.length, totalPages: 1 },
});

const show = () =>
  renderWithProviders({ routes: [{ path: '/', element: <CallingSection channelId="wa1" /> }] });
const section = async () => {
  const s = screen.getByRole('region', { name: 'Calling' });
  await within(s).findByText(/Calling (on|off|unavailable)/);
  return s;
};

beforeEach(() => {
  signInAs('owner');
  api.getSettings.mockResolvedValue(fakeCallingSettings());
  api.updateSettings.mockImplementation((_id, patch) =>
    Promise.resolve(fakeCallingSettings(patch as never)),
  );
  api.syncSettings.mockResolvedValue(fakeCallingSettings());
  vi.mocked(flowsApi.list).mockResolvedValue(offset([fakeFlowRow()]));
  vi.mocked(agentsApi.list).mockResolvedValue(offset([fakeAgentRow()]));
  vi.mocked(teamApi.list).mockResolvedValue(
    offset([
      { id: 'u1', name: 'Asha Verma', role: { key: 'owner', name: 'Owner' } },
      { id: 'u2', name: 'Ravi Agent', role: { key: 'agent', name: 'Agent' } },
      { id: 'u3', name: 'Vera Viewer', role: { key: 'viewer', name: 'Viewer' } },
    ]) as never,
  );
});
afterEach(() => vi.clearAllMocks());

describe('number → Calling settings', () => {
  it('unavailable numbers explain why and have no switch', async () => {
    api.getSettings.mockResolvedValue(
      fakeCallingSettings({ status: 'unavailable', unavailableReason: 'coexistence' }),
    );
    show();
    const s = await section();
    expect(within(s).getByText(/WhatsApp Business app numbers/)).toBeInTheDocument();
    expect(within(s).queryByRole('switch', { name: 'WhatsApp calling' })).not.toBeInTheDocument();
    expect(within(s).queryByRole('button', { name: 'Save call settings' })).not.toBeInTheDocument();
  });

  it('turning calling on asks first and saves only the status', async () => {
    api.getSettings.mockResolvedValue(fakeCallingSettings({ status: 'disabled' }));
    show();
    const s = await section();
    await userEvent.click(within(s).getByRole('switch', { name: 'WhatsApp calling' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn on WhatsApp calling?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith('wa1', { status: 'enabled' }),
    );
  });

  it('shows Meta restrictions and the business-call country rule', async () => {
    api.getSettings.mockResolvedValue(
      fakeCallingSettings({
        businessCallsAvailable: false,
        businessCallsBlockedBy: 'country',
        restrictions: [
          {
            type: 'RESTRICTED_BUSINESS_INITIATED_CALLING',
            reason: null,
            expiresAt: '2030-01-01T00:00:00.000Z',
            active: true,
          },
          {
            type: 'RESTRICTED_USER_INITIATED_CALLING',
            reason: null,
            expiresAt: null,
            active: false,
          },
        ],
      }),
    );
    show();
    const s = await section();
    expect(within(s).getByText(/paused calls from your business/)).toBeInTheDocument();
    expect(within(s).queryByText(/paused customer calls/)).not.toBeInTheDocument();
    expect(
      within(s).getByText(/calls from your business to customers are not available/),
    ).toBeInTheDocument();
  });

  it('call hours: add ranges, overlap is an error, valid hours save as a patch', async () => {
    show();
    const s = await section();
    await userEvent.click(
      within(s).getByRole('switch', { name: 'Only take calls during call hours' }),
    );
    const save = within(s).getByRole('button', { name: 'Save call settings' });
    // on with no ranges → error
    expect(within(s).getByText(/Add at least one time range/)).toBeInTheDocument();
    expect(save).toBeDisabled();
    const week = within(s).getByRole('group', { name: 'Weekly hours' });
    await userEvent.click(within(week).getByRole('button', { name: 'Add Mon range' }));
    await userEvent.click(within(week).getByRole('button', { name: 'Add Mon range' }));
    expect(within(week).queryByRole('button', { name: 'Add Mon range' })).not.toBeInTheDocument();
    // 09–18 and 14–18 overlap
    expect(within(s).getByText(/MONDAY: time ranges overlap/)).toBeInTheDocument();
    await userEvent.click(within(week).getAllByRole('button', { name: 'Remove Mon range' })[1]!);
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings.mock.calls[0]?.[1]).toEqual({
      callHours: {
        enabled: true,
        timezone: 'Asia/Kolkata',
        weekly: [{ day: 'MONDAY', open: '0900', close: '1800' }],
        holidays: [],
      },
    });
  });

  it('routing: AI routes need a program; a ring list of people who can answer', async () => {
    show();
    const s = await section();
    await userEvent.click(within(s).getByRole('combobox', { name: 'Answered by' }));
    await userEvent.click(await screen.findByRole('option', { name: 'AI first, then the team' }));
    expect(within(s).getByText('Choose a flow or an AI agent')).toBeInTheDocument();
    await userEvent.click(within(s).getByRole('combobox', { name: 'Published flow' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Loan recovery' }));
    await userEvent.click(within(s).getByRole('switch', { name: /Ring everyone/ }));
    await userEvent.click(within(s).getByRole('combobox', { name: 'Ring these people' }));
    expect(await screen.findByRole('option', { name: 'Ravi Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Vera Viewer' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Ravi Agent' }));
    await userEvent.click(within(s).getByRole('button', { name: 'Save call settings' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings.mock.calls[0]?.[1]).toEqual({
      inbound: {
        route: 'ai_then_team',
        aiProgram: { kind: 'flow', id: 'f1' },
        ringTimeoutSec: 30,
        ringUserIds: ['u2'],
      },
    });
  });

  it('server errors show the calling text', async () => {
    api.updateSettings.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'WHATSAPP_CALLING_UNAVAILABLE',
        message: 'x',
        kind: 'http',
        details: [],
      }),
    );
    show();
    const s = await section();
    await userEvent.click(within(s).getByRole('switch', { name: /allows your call back/ }));
    await userEvent.click(within(s).getByRole('button', { name: 'Save call settings' }));
    expect(
      await within(s).findByText('Calling is not available on this number.'),
    ).toBeInTheDocument();
  });

  it.each(['manager', 'agent', 'viewer'] as const)('%s reads only', async (role) => {
    signInAs(role);
    show();
    const s = await section();
    expect(within(s).getByRole('switch', { name: 'WhatsApp calling' })).toBeDisabled();
    expect(within(s).queryByRole('button', { name: 'Save call settings' })).not.toBeInTheDocument();
    expect(within(s).queryByRole('button', { name: 'Read again' })).not.toBeInTheDocument();
  });

  it('impersonating superadmins read only', async () => {
    signInAs('owner', {
      impersonation: { superadminId: 'sa1', superadminName: 'Platform Admin' } as never,
    });
    show();
    const s = await section();
    expect(within(s).getByRole('switch', { name: 'WhatsApp calling' })).toBeDisabled();
  });
});

describe('settings form helpers', () => {
  const today = '2030-01-01';
  it('patch has only the changed fields; route team drops the program', () => {
    const saved = draftOf(fakeCallingSettings());
    expect(settingsPatch(saved, saved)).toEqual({});
    expect(
      settingsPatch(
        {
          ...saved,
          permissionRequestBody: ' New text ',
          inbound: { ...saved.inbound, aiProgram: { kind: 'agent', id: 'a1' } },
        },
        saved,
      ),
    ).toEqual({
      permissionRequestBody: 'New text',
      inbound: { route: 'team', aiProgram: null, ringTimeoutSec: 30, ringUserIds: null },
    });
  });
  it('problems: ring timeout, text, countries', () => {
    const d = draftOf(fakeCallingSettings());
    expect(settingsProblems(d, today)).toEqual({});
    expect(
      Object.keys(
        settingsProblems(
          {
            ...d,
            iconCountries: ['india'],
            permissionRequestBody: ' ',
            inbound: { ...d.inbound, ringTimeoutSec: 5 },
          },
          today,
        ),
      ).sort(),
    ).toEqual(['iconCountries', 'permissionRequestBody', 'ringTimeoutSec']);
  });
});
