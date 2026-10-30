import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { campaignsApi } from '@/services/api/campaigns';
import { contactListsApi } from '@/services/api/contact-lists';
import { contactsApi } from '@/services/api/contacts';
import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import { segmentsApi } from '@/services/api/segments';
import { signInAs } from '@/test/auth';

import { AudienceStep } from './AudienceStep';
import { emptyDraft, type LockRule, type WizardDraft } from './draft';
import { RetriesStep } from './RetriesStep';
import { ScheduleStep } from './ScheduleStep';

vi.mock('@/services/api/campaigns', () => ({ campaignsApi: { previewAudience: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/segments', () => ({ segmentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({ contactsApi: { list: vi.fn(), tags: vi.fn() } }));

const ACCOUNT = {
  timezone: 'Asia/Kolkata',
  window: { start: '09:00', end: '19:00', days: [1, 2, 3] },
};
/** The draft after the last change (read by the tests). */
const seen: { draft: WizardDraft | null } = { draft: null };

function Harness({
  Step,
  initial,
  lock = 'none',
}: {
  Step: typeof AudienceStep;
  initial: Partial<WizardDraft>;
  lock?: LockRule;
}) {
  const [draft, setDraft] = useState<WizardDraft>({
    ...emptyDraft(ACCOUNT),
    flowId: 'f1',
    ...initial,
  });
  return (
    <Step
      draft={draft}
      lock={lock}
      onChange={(p) => {
        const next = { ...draft, ...p };
        seen.draft = next;
        setDraft(next);
      }}
    />
  );
}
const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
  vi.mocked(contactListsApi.list).mockResolvedValue({
    data: [{ id: 'l1', name: 'October', contactCount: 12 }],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  vi.mocked(segmentsApi.list).mockResolvedValue([{ id: 's1', name: 'Overdue' }] as never);
  vi.mocked(customFieldsApi.list).mockResolvedValue([]);
  vi.mocked(contactsApi.tags).mockResolvedValue([] as never);
  vi.mocked(contactsApi.list).mockResolvedValue({
    data: [
      { id: 'k1', name: 'Asha Verma', phoneE164: '+919876543210' },
      { id: 'k2', name: null, phoneE164: '+919876540000' },
    ],
    meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
  } as never);
});

describe('AudienceStep', () => {
  it('nothing to preview yet; loading; zero contacts; too many; an error', async () => {
    const preview = vi.mocked(campaignsApi.previewAudience);
    const view = wrap(<Harness Step={AudienceStep} initial={{}} />);
    expect(
      screen.getByText('Choose a flow and who to call to see the numbers.'),
    ).toBeInTheDocument();
    view.unmount();
    preview.mockReturnValue(new Promise(() => undefined));
    const loading = wrap(<Harness Step={AudienceStep} initial={{ listIds: ['l1'] }} />);
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    loading.unmount();
    preview.mockResolvedValue({
      total: 0,
      willCall: 0,
      tooMany: true,
      excluded: {},
      missing: [],
      samples: [],
    });
    const zero = wrap(<Harness Step={AudienceStep} initial={{ listIds: ['l1'] }} />);
    expect(await screen.findByText(/Nobody matches/)).toBeInTheDocument();
    expect(screen.getByText('Too many contacts for one campaign.')).toBeInTheDocument();
    zero.unmount();
    preview.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'Flow not found',
        kind: 'http',
      }),
    );
    wrap(<Harness Step={AudienceStep} initial={{ listIds: ['l1'] }} />);
    expect(await screen.findByText('Flow not found')).toBeInTheDocument();
  });

  it('segment, custom filter and picked contacts; excludes other campaigns; skip switches', async () => {
    const user = userEvent.setup();
    vi.mocked(campaignsApi.previewAudience).mockResolvedValue({
      total: 3,
      willCall: 3,
      tooMany: false,
      excluded: { dnd: 0 },
      missing: [{ field: 'amount', label: 'Amount', count: 1 }],
      samples: [],
    });
    wrap(<Harness Step={AudienceStep} initial={{ listIds: ['l1'], skipIfMissing: ['amount'] }} />);
    const skip = await screen.findByLabelText('1 without Amount — skip them');
    expect(skip).toBeChecked();
    await user.click(skip);
    expect(seen.draft?.skipIfMissing).toEqual([]);
    await user.click(screen.getByLabelText('Skip contacts that are in another active campaign'));
    expect(seen.draft?.excludeActiveCampaigns).toBe(false);

    await user.click(screen.getByLabelText('Segment'));
    expect(seen.draft?.audienceMode).toBe('segment');
    await user.click(screen.getByRole('combobox', { name: 'Segment' }));
    await user.click(await screen.findByRole('option', { name: 'Overdue' }));
    expect(seen.draft?.segmentId).toBe('s1');

    await user.click(screen.getByLabelText('Custom filter'));
    expect(screen.getByText(/Field conditions/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Pick contacts'));
    expect(screen.getByText('0 picked')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pick contacts' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByText('Asha Verma'));
    await user.click(within(dialog).getByText('No name'));
    await user.click(within(dialog).getByText('No name'));
    expect(within(dialog).getByText('1 picked (up to 1000)')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Search by name or phone'), 'asha');
    await waitFor(() =>
      expect(contactsApi.list).toHaveBeenLastCalledWith({ limit: 50, q: 'asha' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Use 1 contacts' }));
    expect(seen.draft?.contactIds).toEqual(['k1']);
    await user.click(screen.getByRole('button', { name: 'Pick contacts' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.getByText('1 picked')).toBeInTheDocument();
  });

  it('a running campaign shows the audience read-only', () => {
    wrap(<Harness Step={AudienceStep} initial={{ listIds: ['l1'] }} lock="live" />);
    expect(
      screen.getByText('The audience was copied when the campaign started.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Segment')).toBeDisabled();
  });
});

describe('RetriesStep', () => {
  it('edits retries, follow-ups, pacing, auto-resume and the dry-run simulation', async () => {
    const user = userEvent.setup();
    wrap(<Harness Step={RetriesStep} initial={{}} />);
    fireEvent.change(screen.getByLabelText('Attempts per contact'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Retry after (minutes)'), { target: { value: '' } });
    expect(seen.draft?.retry).toMatchObject({ maxAttempts: 4, intervalMinutes: 0 });
    const retryWhen = screen.getByLabelText('Retry when');
    await user.click(within(retryWhen).getByText('Busy'));
    await user.click(within(retryWhen).getByText('Answered without an outcome'));
    expect(seen.draft?.retry.retryOn).toEqual(['no_answer', 'failed', 'no_outcome']);
    fireEvent.change(screen.getByLabelText('Callbacks within (days)'), { target: { value: '3' } });
    await user.click(screen.getByLabelText('Call back when the customer asks'));
    expect(seen.draft?.followUps).toMatchObject({ callbacks: false, callbackMaxDays: 3 });
    expect(screen.queryByLabelText('Callbacks within (days)')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Call again after a promise to pay'));
    fireEvent.change(screen.getByLabelText('Days after the promised date'), {
      target: { value: '2' },
    });
    expect(seen.draft?.followUps.promiseCheck).toEqual({ enabled: true, daysAfter: 2 });
    fireEvent.change(screen.getByLabelText('Calls at once'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Dials per minute'), { target: { value: '40' } });
    await user.click(screen.getByLabelText('Priority'));
    await user.click(screen.getByRole('option', { name: 'High' }));
    expect(seen.draft?.pacing).toEqual({ concurrency: 8, dialsPerMinute: 40, priority: 'high' });
    await user.click(screen.getByLabelText('Resume by itself after the wallet is topped up'));
    expect(seen.draft?.autoResume).toBe(false);
    fireEvent.change(screen.getByLabelText('Busy', { selector: 'input' }), {
      target: { value: '5' },
    });
    expect(seen.draft?.dryRun.mix.busy).toBe(500);
    fireEvent.change(screen.getByLabelText('Already paid'), { target: { value: '40' } });
    expect(seen.draft?.dryRun.scenarios.paid).toBe(40);
    await user.click(screen.getByLabelText('Speed'));
    await user.click(screen.getByRole('option', { name: '×20' }));
    expect(seen.draft?.dryRun.speed).toBe(20);
  });

  it('live mode hides the simulation; locked groups are disabled', () => {
    wrap(<Harness Step={RetriesStep} initial={{ mode: 'live' }} lock="all" />);
    expect(screen.queryByText('Dry-run simulation')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Attempts per contact')).toBeDisabled();
  });
});

describe('ScheduleStep', () => {
  it('a running campaign can only move its end; live mode adds the TRAI bound', () => {
    wrap(<Harness Step={ScheduleStep} initial={{ mode: 'live' }} lock="live" />);
    expect(screen.getByText(/only its end and calling window can change/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Start now')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('End (optional, Asia/Kolkata)'), {
      target: { value: '2026-12-01T18:00' },
    });
    expect(seen.draft?.schedule.endAt).toBe('2026-12-01T12:30:00.000Z');
    fireEvent.change(screen.getByLabelText('End (optional, Asia/Kolkata)'), {
      target: { value: '' },
    });
    expect(seen.draft?.schedule.endAt).toBeNull();
    expect(
      screen.getByText(/live calls\s+are also held to 09:00–21:00 \(TRAI\)/),
    ).toBeInTheDocument();
  });
});
