import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLiveCallStore } from '@/features/whatsapp-calling/live/store';
import { campaignsApi, type TeamSession } from '@/services/api/campaigns';
import { signInAs } from '@/test/auth';
import { fakeCampaign } from '@/test/campaigns';
import { renderWithProviders } from '@/test/render';

import { TeamCallingPanel } from './detail/TeamCallingPanel';

const place = vi.hoisted(() => vi.fn());
vi.mock('@/features/whatsapp-calling/live/controller', () => ({
  placeTeamCall: place,
  isBusy: () => false,
  clearCall: () => useLiveCallStore.getState().setActive(null),
}));
vi.mock('@/services/api/campaigns', async (original) => ({
  ...(await original<object>()),
  campaignsApi: {
    session: vi.fn(),
    sessionAction: vi.fn(),
    nextCall: vi.fn(),
    wrapUp: vi.fn(),
  },
}));
vi.mock('@/features/insights/queries', () => ({
  useDispositions: () => ({ data: [{ key: 'paid', label: 'Paid', active: true }] }),
}));

const board = (state: TeamSession['agents'][number]['state'] | null): TeamSession => ({
  agents: state
    ? [
        {
          userId: 'u1',
          name: 'Asha',
          state,
          callId: null,
          since: '2026-11-11T10:00:00.000Z',
          wrapUpUntil: null,
        },
      ]
    : [],
  ready: state === 'ready' ? 1 : 0,
  onCall: state === 'on_call' ? 1 : 0,
});

const campaign = fakeCampaign({
  status: 'running',
  mode: 'live',
  talkMode: 'team',
  team: { agentUserIds: null, wrapUpSec: 0 },
});
const renderPanel = () =>
  renderWithProviders({
    routes: [{ path: '/', element: <TeamCallingPanel campaign={campaign} /> }],
  });

beforeEach(() => {
  vi.clearAllMocks();
  useLiveCallStore.getState().setActive(null);
  signInAs('owner');
  vi.mocked(campaignsApi.session).mockResolvedValue(board(null));
});

describe('team calling session (campaign page)', () => {
  it('join → the next customer connects in the bar → outcome → next call; leave', async () => {
    vi.mocked(campaignsApi.sessionAction).mockImplementation((_id, action) =>
      Promise.resolve(board(action === 'leave' ? null : 'ready')),
    );
    let calls = 0;
    place.mockImplementation(async (input: { next: () => Promise<unknown> }) => {
      calls += 1;
      await input.next();
      if (calls > 1) return { kind: 'wait', reason: 'no_contacts', until: null };
      useLiveCallStore.getState().setActive({
        ...useLiveCallStore.getState().active,
        callId: 'call1',
        mode: 'human',
        direction: 'outbound',
        label: 'Ravi',
        conversationId: null,
        phase: 'in_call',
        answeredAt: Date.now(),
        muted: false,
        held: false,
        level: 0,
        network: 'good',
        recording: false,
        failure: null,
        walletEndsInSec: null,
        ended: null,
        transport: 'sip',
      });
      return {
        kind: 'call',
        callId: 'call1',
        transport: 'sip',
        contact: { id: 'c1', name: 'Ravi' },
      };
    });
    vi.mocked(campaignsApi.nextCall).mockResolvedValue({
      kind: 'wait',
      reason: 'busy',
      until: null,
    });
    vi.mocked(campaignsApi.wrapUp).mockResolvedValue({ callId: 'call1', disposition: 'paid' });
    renderPanel();
    expect(
      await screen.findByText('Waiting for agents — nobody has joined the calling session yet.'),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Join calling session' }));
    expect(campaignsApi.sessionAction).toHaveBeenCalledWith('cp1', 'join');
    // asked for the next customer at once (microphone + leg inside placeTeamCall)
    await waitFor(() => expect(place).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('· Talking with Ravi')).toBeInTheDocument();
    // the customer hung up → the outcome form
    act(() => useLiveCallStore.getState().patchActive({ phase: 'ended' }));
    const form = await screen.findByRole('region', { name: 'Call outcome' });
    expect(form).toBeInTheDocument();
    await user.click(screen.getByLabelText('Outcome'));
    await user.click(await screen.findByRole('option', { name: 'Paid' }));
    await user.type(screen.getByLabelText('Note'), 'UPI today');
    await user.click(screen.getByRole('button', { name: 'Save and next call' }));
    expect(campaignsApi.wrapUp).toHaveBeenCalledWith('cp1', 'call1', {
      disposition: 'paid',
      note: 'UPI today',
    });
    // ready again → the next request answers "wait"
    await waitFor(() => expect(place).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('Nobody left to call right now (retries come back later).'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(campaignsApi.sessionAction).toHaveBeenCalledWith('cp1', 'leave');
    expect(await screen.findByRole('button', { name: 'Join calling session' })).toBeInTheDocument();
  });

  it('only listed members can join; a stopped campaign cannot be joined', async () => {
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <TeamCallingPanel
              campaign={{ ...campaign, team: { agentUserIds: ['someone-else'], wrapUpSec: 15 } }}
            />
          ),
        },
      ],
    });
    expect(
      await screen.findByText('You aren’t one of this campaign’s callers.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join calling session' })).not.toBeInTheDocument();
  });
});
