import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { campaignsApi } from '@/services/api/campaigns';
import { contactListsApi } from '@/services/api/contact-lists';
import { contactsApi } from '@/services/api/contacts';
import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import { segmentsApi } from '@/services/api/segments';
import { signInAs } from '@/test/auth';
import { fakeCampaign, fakeCampaignListItem } from '@/test/campaigns';
import { fakeFlowRow } from '@/test/flows';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/campaigns', () => ({
  campaignsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    previewAudience: vi.fn(),
    estimate: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  },
}));
vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn(), versions: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/segments', () => ({ segmentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({ contactsApi: { list: vi.fn(), tags: vi.fn() } }));

const api = vi.mocked(campaignsApi);
const page = <T,>(data: T[], nextCursor: string | null = null) => ({
  success: true as const,
  data,
  meta: { hasMore: Boolean(nextCursor), nextCursor },
});
const PREVIEW = {
  total: 12,
  willCall: 10,
  tooMany: false,
  excluded: { dnd: 1, opted_out: 1, invalid_phone: 0 },
  missing: [{ field: 'amount', label: 'Amount', count: 2 }],
  samples: [{ name: 'Asha Verma', phoneLast4: '3210' }],
};
const ESTIMATE = {
  contacts: 10,
  calls: 13,
  perCallMicros: 2_500_000,
  totalMicros: 32_500_000,
  minMicros: 24_000_000,
  maxMicros: 40_000_000,
  assumptions: { avgDurationSec: 60, answerRateBps: 6500, aiShareBps: 5000, expectedAttempts: 1.3 },
  walletAvailableMicros: 30_000_000,
};

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue(page([]));
  api.get.mockResolvedValue(fakeCampaign());
  api.previewAudience.mockResolvedValue(PREVIEW);
  api.estimate.mockResolvedValue(ESTIMATE);
  api.create.mockResolvedValue(fakeCampaign({ id: 'new1', status: 'draft', revision: 1 }));
  api.update.mockResolvedValue(fakeCampaign({ id: 'new1', status: 'draft', revision: 2 }));
  api.start.mockResolvedValue(fakeCampaign({ id: 'new1', status: 'running' }));
  vi.mocked(flowsApi.list).mockResolvedValue({
    success: true,
    data: [fakeFlowRow(), fakeFlowRow({ id: 'f2', name: 'Inbound only', triggers: ['inbound'] })],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  } as never);
  vi.mocked(flowsApi.versions).mockResolvedValue([
    { id: 'v2', version: 2, notes: 'Shorter intro', current: true },
    { id: 'v1', version: 1, notes: null, current: false },
  ] as never);
  vi.mocked(contactListsApi.list).mockResolvedValue({
    data: [
      { id: 'l1', name: 'October', contactCount: 12 },
      { id: 'l2', name: 'November', contactCount: 5 },
    ],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  } as never);
  vi.mocked(segmentsApi.list).mockResolvedValue([{ id: 's1', name: 'Overdue > 30 days' }] as never);
  vi.mocked(customFieldsApi.list).mockResolvedValue([]);
  vi.mocked(contactsApi.list).mockResolvedValue({
    data: [{ id: 'k1', name: 'Asha Verma', phoneE164: '+919876543210' }],
    meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
  } as never);
  vi.mocked(contactsApi.tags).mockResolvedValue([] as never);
});

describe('/campaigns list', () => {
  it('rows: name, dry-run badge, flow + version, status + waiting, progress, answered, would-have-cost, next run; load more', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    api.list
      .mockResolvedValueOnce(
        page(
          [
            fakeCampaignListItem({ waitingUntil: '2026-10-24T03:30:00.000Z' }),
            fakeCampaignListItem({
              id: 'cp2',
              name: 'Daily reminder',
              status: 'paused',
              pauseReason: 'wallet_empty',
              recurring: true,
              nextRunAt: '2026-10-22T04:30:00.000Z',
              mode: 'live',
              spentMicros: 12_340_000,
            }),
          ],
          'n1',
        ),
      )
      .mockResolvedValueOnce(page([fakeCampaignListItem({ id: 'cp3', name: 'Third' })]));
    renderWithProviders({ route: '/campaigns', realtime: fakeRealtime().client });
    const table = await screen.findByRole('table', { name: 'Campaigns' });
    expect(await within(table).findByRole('link', { name: 'October recovery' })).toHaveAttribute(
      'href',
      '/campaigns/cp1',
    );
    expect(within(table).getByText('Dry run')).toBeInTheDocument();
    expect(within(table).getAllByText('Loan recovery · v2')).toHaveLength(2);
    expect(within(table).getByText('Waiting · Sat 24 Oct, 09:00')).toBeInTheDocument();
    expect(within(table).getByText('Paused')).toBeInTheDocument();
    expect(within(table).getByText('Repeats')).toBeInTheDocument();
    expect(within(table).getAllByText('50 / 100')).toHaveLength(2);
    expect(within(table).getAllByText('83 %')).toHaveLength(2);
    expect(within(table).getByText('₹125.50*')).toBeInTheDocument();
    expect(within(table).getByText('₹12.34')).toBeInTheDocument();
    expect(within(table).getByText('Thu 22 Oct, 10:00')).toBeInTheDocument();
    expect(screen.getByText(/would have cost — nothing was charged/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await within(table).findByText('Third')).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ limit: 25, cursor: 'n1' });
  });

  it('filters live in the URL; clear filters; empty states by role', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    renderWithProviders({ route: '/campaigns?status=running,paused&mode=dry_run&flowId=f1' });
    await screen.findByText('Nothing matches these filters');
    expect(api.list).toHaveBeenCalledWith({
      limit: 25,
      status: ['running', 'paused'],
      mode: 'dry_run',
      flowId: 'f1',
    });
    await user.type(screen.getByLabelText('Search'), 'oct');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'oct' })),
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('No campaigns yet')).toBeInTheDocument();
    expect(screen.getByText(/start with a dry run/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New campaign' })).toHaveAttribute(
      'href',
      '/campaigns/new',
    );
  });

  it('viewers and agents read only: no New, no row actions; managers get pause / duplicate / delete', async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue(
      page([
        fakeCampaignListItem(),
        fakeCampaignListItem({ id: 'cp9', name: 'Old', status: 'completed' }),
      ]),
    );
    for (const role of ['viewer', 'agent'] as const) {
      signInAs(role);
      const view = renderWithProviders({ route: '/campaigns' });
      await screen.findByRole('link', { name: 'October recovery' });
      expect(screen.queryByRole('link', { name: 'New campaign' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
      view.unmount();
    }
    signInAs('manager');
    api.pause.mockResolvedValue(fakeCampaign({ status: 'paused' }));
    api.remove.mockResolvedValue();
    api.duplicate.mockResolvedValue(fakeCampaign({ id: 'copy1', status: 'draft' }));
    renderWithProviders({ route: '/campaigns' });
    await user.click(await screen.findByRole('button', { name: 'Actions for October recovery' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Pause' }));
    await waitFor(() => expect(api.pause).toHaveBeenCalledWith('cp1'));
    await user.click(await screen.findByRole('button', { name: 'Actions for Old' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('cp9'));
    await user.click(await screen.findByRole('button', { name: 'Actions for Old' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith('cp9'));
    expect(
      await screen.findByRole('heading', { name: /Edit October recovery|Edit/ }),
    ).toBeInTheDocument();
  });

  it('a campaign paused by the platform team cannot be resumed from the menu', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.list.mockResolvedValue(
      page([fakeCampaignListItem({ status: 'paused', pauseReason: 'admin' })]),
    );
    renderWithProviders({ route: '/campaigns' });
    await user.click(await screen.findByRole('button', { name: 'Actions for October recovery' }));
    expect(screen.queryByRole('menuitem', { name: 'Resume' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument();
  });
});

describe('/campaigns/new wizard', () => {
  it('walks the 5 steps with validation, saves before the review, shows the estimate, starts with a key', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    renderWithProviders({ route: '/campaigns/new' });
    expect(await screen.findByRole('heading', { name: 'New campaign' })).toBeInTheDocument();
    // live mode needs SIP
    expect(screen.getByLabelText('Live calls')).toBeDisabled();
    next();
    expect(screen.getByText('Give the campaign a name')).toBeInTheDocument();
    expect(screen.getByText('Choose a published flow')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Campaign name/), 'October recovery');
    await user.click(screen.getByLabelText('Flow'));
    // only published flows with the campaign trigger
    expect(screen.queryByRole('option', { name: 'Inbound only' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Loan recovery' }));
    await user.click(screen.getByLabelText('Version'));
    expect(screen.getByRole('option', { name: 'Latest (v2)' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'v1' }));
    next();

    // audience
    await screen.findByRole('radiogroup', { name: 'Audience' });
    next();
    expect(screen.getByText('Choose at least one list')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Lists' }));
    await user.click(await screen.findByRole('option', { name: 'October (12)' }));
    const preview = await screen.findByLabelText('Audience preview');
    expect(
      await within(preview).findByText('10 of 12 contacts will be called'),
    ).toBeInTheDocument();
    expect(within(preview).getByText('On the do-not-call list: 1')).toBeInTheDocument();
    expect(within(preview).getByText(/Asha Verma ••••3210/)).toBeInTheDocument();
    await user.click(within(preview).getByLabelText('2 without Amount — skip them'));
    expect(api.previewAudience).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: 'f1', chosenVersion: 1 }),
    );
    next();

    // schedule & window
    expect(await screen.findByText(/Calls go out/)).toBeInTheDocument();
    next();

    // retries & pacing
    expect(await screen.findByText('Dry-run simulation')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Attempts per contact'), { target: { value: '9' } });
    next();
    expect(screen.getByText('Attempts: 1 to 5')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Attempts per contact'), { target: { value: '2' } });
    next();

    // review: saved as a draft, estimate with the wallet warning
    await screen.findByLabelText('Estimate');
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({
      name: 'October recovery',
      mode: 'dry_run',
      flowId: 'f1',
      chosenVersion: 1,
      audience: { listIds: ['l1'], skipIfMissing: ['amount'] },
      retry: { maxAttempts: 2 },
    });
    expect(await screen.findByText('₹24.00 – ₹40.00')).toBeInTheDocument();
    expect(screen.getByText(/the campaign will pause when money runs out/)).toBeInTheDocument();
    expect(screen.getByText(/never charged/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start now' }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('new1', expect.any(String)));
  });

  it('server field errors go back to their step; Edit links on the review jump to steps', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.create.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid.',
        kind: 'http',
        details: [{ path: 'body.pacing.concurrency', message: 'At most 10 (account limit)' }],
      }),
    );
    renderWithProviders({ route: '/campaigns/new?flowId=f1&listId=l1' });
    await user.type(await screen.findByLabelText(/Campaign name/), 'Prefilled');
    next();
    // prefilled list from ?listId
    expect(await screen.findByText('10 of 12 contacts will be called')).toBeInTheDocument();
    next();
    next();
    next();
    expect(
      await screen.findByText('pacing.concurrency: At most 10 (account limit)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dry-run simulation')).toBeInTheDocument();
    next();
    await screen.findByLabelText('Estimate');
    await user.click(screen.getByRole('button', { name: 'Edit Audience' }));
    expect(screen.getByLabelText('Audience preview')).toBeInTheDocument();
  });

  it('schedules when a start time is set; saves a draft without starting', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    renderWithProviders({ route: '/campaigns/new?flowId=f1&segmentId=s1' });
    await user.type(await screen.findByLabelText(/Campaign name/), 'Later one');
    next();
    expect(await screen.findByText('10 of 12 contacts will be called')).toBeInTheDocument();
    next();
    await user.click(await screen.findByLabelText('Later'));
    next();
    next();
    expect(await screen.findByRole('button', { name: 'Schedule' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    // saved already on the way to the review: leaves for the campaign page, never starts
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument(),
    );
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({
      audience: { segmentId: 's1', listIds: [] },
      schedule: { timezone: 'Asia/Kolkata' },
    });
    expect(api.create.mock.calls[0]?.[0].schedule?.startAt).toEqual(expect.any(String));
    expect(api.start).not.toHaveBeenCalled();
  });
});

describe('/campaigns/:id/edit', () => {
  it('a running campaign locks the audience and flow; saves the allowed groups only', async () => {
    signInAs('manager');
    api.update.mockResolvedValue(fakeCampaign({ revision: 4 }));
    renderWithProviders({ route: '/campaigns/cp1/edit' });
    expect(
      await screen.findByRole('heading', { name: 'Edit October recovery' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Flow')).toHaveAttribute('aria-disabled', 'true');
    next();
    expect(
      screen.getByText('The audience was copied when the campaign started.'),
    ).toBeInTheDocument();
    next();
    expect(screen.getByText(/only its end and calling window can change/)).toBeInTheDocument();
    next();
    fireEvent.change(screen.getByLabelText('Calls at once'), { target: { value: '7' } });
    next();
    await screen.findByLabelText('Estimate');
    expect(api.update).toHaveBeenCalledWith('cp1', {
      revision: 3,
      name: 'October recovery',
      schedule: { endAt: null },
      window: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] },
      retry: { maxAttempts: 3, intervalMinutes: 60, retryOn: ['no_answer', 'busy', 'failed'] },
      followUps: {
        callbacks: true,
        callbackMaxDays: 7,
        promiseCheck: { enabled: false, daysAfter: 1 },
      },
      pacing: { concurrency: 7, dialsPerMinute: 30, priority: 'normal' },
      autoResume: true,
    });
    expect(screen.queryByRole('button', { name: 'Start now' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('a revision conflict offers Reload / Keep editing', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockResolvedValue(fakeCampaign({ status: 'draft' }));
    api.update.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'CAMPAIGN_REVISION_CONFLICT',
        message: 'Changed',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/campaigns/cp1/edit' });
    await screen.findByRole('heading', { name: 'Edit October recovery' });
    for (let i = 0; i < 4; i += 1) next();
    expect(await screen.findByText('Someone else changed this campaign')).toBeInTheDocument();
    api.get.mockResolvedValue(
      fakeCampaign({ status: 'draft', revision: 9, name: 'Renamed elsewhere' }),
    );
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() =>
      expect(screen.queryByText('Someone else changed this campaign')).not.toBeInTheDocument(),
    );
  });

  it('finished campaigns cannot be edited; viewers cannot open the wizard', async () => {
    signInAs('owner');
    api.get.mockResolvedValue(fakeCampaign({ status: 'completed' }));
    const view = renderWithProviders({ route: '/campaigns/cp1/edit' });
    expect(await screen.findByText(/has finished — it can’t be edited/)).toBeInTheDocument();
    view.unmount();
    signInAs('viewer');
    renderWithProviders({ route: '/campaigns/new' });
    expect(
      await screen.findByRole('heading', { name: /403|forbidden|access/i }),
    ).toBeInTheDocument();
  });
});
