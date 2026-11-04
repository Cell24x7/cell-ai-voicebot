import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { phoneNumbersApi } from '@/services/api/phone-numbers';
import { signInAs } from '@/test/auth';

import { BasicsStep } from './BasicsStep';
import { emptyDraft, stepProblems, toCreateInput, type WizardDraft } from './draft';

vi.mock('@/features/flows/queries', () => ({
  useFlows: () => ({ data: { data: [] }, isPending: false, isSuccess: true }),
  useFlowVersions: () => ({ data: [] }),
}));
vi.mock('@/services/api/phone-numbers', async (original) => ({
  ...(await original<object>()),
  phoneNumbersApi: { line: vi.fn() },
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

const NUMBER = {
  id: 'n1',
  number: '+911600123456',
  kind: '1600' as const,
  accountId: 'acc1',
  accountName: null,
  purpose: 'outbound' as const,
  label: 'Main',
  dltPrincipalEntityId: null,
  status: 'active' as const,
  warnings: [],
  createdAt: '2026-11-03T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  seen.draft = null;
  signInAs('owner');
});

describe('campaign phone line (Phase 18)', () => {
  it('live calls stay off while the account is on the test line', async () => {
    vi.mocked(phoneNumbersApi.line).mockResolvedValue({ line: 'dryrun', numbers: [] });
    wrap();
    const live = await screen.findByRole('radio', { name: 'Live calls' });
    expect(live).toBeDisabled();
  });

  it('on the phone line: live with a caller number and a voicemail message', async () => {
    vi.mocked(phoneNumbersApi.line).mockResolvedValue({ line: 'sip', numbers: [NUMBER] });
    wrap();
    const user = userEvent.setup();
    const live = await screen.findByRole('radio', { name: 'Live calls' });
    await vi.waitFor(() => expect(live).toBeEnabled());
    await user.click(live);
    await user.click(screen.getByLabelText('Caller number'));
    await user.click(await screen.findByRole('option', { name: '+911600123456 · Main' }));
    await user.click(screen.getByLabelText('Answering machines'));
    await user.click(await screen.findByRole('option', { name: /Leave a message/ }));
    expect(stepProblems(0, { ...seen.draft!, name: 'X', flowId: 'f1' })).toContain(
      'Write the message for answering machines',
    );
    await user.type(screen.getByLabelText(/Message for answering machines/), 'Please call back');
    const draft = { ...seen.draft!, name: 'X', flowId: 'f1' };
    expect(stepProblems(0, draft)).toEqual([]);
    expect(toCreateInput(draft).phoneLine).toEqual({
      callerNumberId: 'n1',
      amd: 'leave_message',
      voicemailText: 'Please call back',
    });
  });

  it('the message is not sent unless machines get one', () => {
    const draft: WizardDraft = {
      ...emptyDraft(ACCOUNT),
      mode: 'live',
      phoneLine: { callerNumberId: null, amd: 'hangup', voicemailText: 'left over' },
    };
    expect(toCreateInput(draft).phoneLine).toEqual({
      callerNumberId: null,
      amd: 'hangup',
      voicemailText: null,
    });
  });
});
