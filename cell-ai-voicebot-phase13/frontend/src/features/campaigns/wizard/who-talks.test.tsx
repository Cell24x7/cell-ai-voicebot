import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { phoneNumbersApi } from '@/services/api/phone-numbers';
import { teamApi } from '@/services/api/team';
import { signInAs } from '@/test/auth';

import { BasicsStep } from './BasicsStep';
import { emptyDraft, previewBody, stepProblems, toCreateInput, type WizardDraft } from './draft';

vi.mock('@/features/flows/queries', () => ({
  useFlows: () => ({ data: { data: [] }, isPending: false, isSuccess: true }),
  useFlowVersions: () => ({ data: [] }),
}));
vi.mock('@/services/api/phone-numbers', async (original) => ({
  ...(await original<object>()),
  phoneNumbersApi: { line: vi.fn() },
}));

vi.mock('@/services/api/team', async (original) => ({
  ...(await original<object>()),
  teamApi: { list: vi.fn() },
}));

vi.mock('@/features/agents/queries', () => ({
  useAgents: () => ({ data: { data: [{ id: 'agent1', name: 'Campaign agent' }] } }),
}));

const ACCOUNT = {
  timezone: 'Asia/Kolkata',
  window: { start: '09:00', end: '19:00', days: [1, 2, 3] },
};
const seen: { draft: WizardDraft | null } = { draft: null };

function Harness({ initial }: { initial: Partial<WizardDraft> }) {
  const [draft, setDraft] = useState<WizardDraft>({ ...emptyDraft(ACCOUNT), ...initial });
  return (
    <BasicsStep
      draft={draft}
      lock="none"
      onChange={(p) => {
        const next = { ...draft, ...p };
        seen.draft = next;
        setDraft(next);
      }}
    />
  );
}
const wrap = (initial: Partial<WizardDraft> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness initial={initial} />
    </QueryClientProvider>,
  );

const member = (id: string, name: string, role = 'agent') => ({
  id,
  name,
  email: `${id}@x.in`,
  phone: null,
  status: 'active' as const,
  role: { key: role, name: role },
  isOwner: false,
  lastLoginAt: null,
  inviteExpiresAt: null,
  createdAt: '2026-11-01T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  seen.draft = null;
  signInAs('owner');
  vi.mocked(teamApi.list).mockResolvedValue({
    data: [member('u1', 'Asha'), member('u2', 'Ravi'), member('u3', 'Vic', 'viewer')],
    meta: { page: 1, limit: 100, total: 3 },
  } as never);
});

describe('who talks (call modes)', () => {
  it('phone line: AI by default; My team → live, no flow, members and wrap-up in the body', async () => {
    vi.mocked(phoneNumbersApi.line).mockResolvedValue({ line: 'sip', numbers: [] });
    wrap();
    const user = userEvent.setup();
    expect(await screen.findByRole('radio', { name: /^AI/ })).toBeChecked();
    expect(screen.getByLabelText('Flow')).toBeInTheDocument();
    const team = screen.getByRole('radio', { name: /^My team/ });
    await vi.waitFor(() => expect(team).toBeEnabled());
    await user.click(team);
    expect(seen.draft).toMatchObject({ talkMode: 'team', mode: 'live', flowId: '' });
    expect(screen.queryByLabelText('Flow')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Dry run/ })).toBeDisabled();
    // everyone by default; choosing members
    await user.click(screen.getByRole('checkbox', { name: /Everyone who may make calls/ }));
    expect(stepProblems(0, { ...seen.draft!, name: 'X' })).toContain(
      'Choose at least one team member',
    );
    await user.click(screen.getByLabelText('Team members who take the calls'));
    expect(screen.queryByRole('option', { name: 'Vic' })).not.toBeInTheDocument(); // viewers can't call
    await user.click(await screen.findByRole('option', { name: 'Asha' }));
    const wrapUp = screen.getByLabelText('Wrap-up time (seconds)');
    await user.clear(wrapUp);
    await user.type(wrapUp, '30');
    const draft = { ...seen.draft!, name: 'Sales calls' };
    expect(stepProblems(0, draft)).toEqual([]);
    const body = toCreateInput(draft);
    expect(body).toMatchObject({
      mode: 'live',
      talkMode: 'team',
      team: { agentUserIds: ['u1'], wrapUpSec: 30 },
    });
    expect(body).not.toHaveProperty('flowId');
    expect(previewBody({ ...draft, listIds: ['l1'] })).toMatchObject({ talkMode: 'team' });
  });

  it('team needs live calls: off while the account is on the test line', async () => {
    vi.mocked(phoneNumbersApi.line).mockResolvedValue({ line: 'dryrun', numbers: [] });
    wrap();
    expect(await screen.findByRole('radio', { name: /^My team/ })).toBeDisabled();
    expect(screen.getByText('Team calling needs live calls on this line.')).toBeInTheDocument();
  });

  it('WhatsApp call campaign: the team talks, no AI program sent', () => {
    const draft: WizardDraft = {
      ...emptyDraft(ACCOUNT),
      name: 'WA team',
      line: 'whatsapp',
      channelId: 'ch1',
      talkMode: 'team',
      mode: 'live',
      program: { kind: 'agent', id: 'a1' },
    };
    expect(stepProblems(0, draft)).toEqual([]);
    expect(toCreateInput(draft)).toMatchObject({
      line: 'whatsapp',
      talkMode: 'team',
      program: null,
      team: { agentUserIds: null, wrapUpSec: 15 },
    });
    // AI campaigns keep sending no team
    expect(toCreateInput({ ...draft, talkMode: 'ai' })).toMatchObject({
      talkMode: 'ai',
      team: null,
      program: { kind: 'agent', id: 'a1' },
    });
  });
});
