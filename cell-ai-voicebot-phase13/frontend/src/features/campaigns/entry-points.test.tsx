import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callNowErrorText } from '@/features/calls/call-now';
import { CallNowDialog } from '@/features/calls/CallNowDialog';
import { ContactCallsCard } from '@/features/calls/ContactCallsCard';
import { CallSetup } from '@/features/calls/tester/CallSetup';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { agentsApi } from '@/services/api/agents';
import { callsApi } from '@/services/api/calls';
import { campaignsApi } from '@/services/api/campaigns';
import { contactsApi } from '@/services/api/contacts';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import { notificationsApi } from '@/services/api/notifications';
import type { Contact } from '@/services/api/types';
import { fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeCall } from '@/test/calls';
import { fakeCampaignListItem } from '@/test/campaigns';
import { fakeFlow, fakeFlowRow } from '@/test/flows';
import { renderWithProviders } from '@/test/render';

import { CampaignsCard } from './CampaignsCard';
import { FlowCampaignsButton } from './FlowCampaignsButton';

vi.mock('@/services/api/calls', () => ({
  callsApi: { start: vi.fn(), get: vi.fn(), list: vi.fn() },
}));
vi.mock('@/services/api/campaigns', () => ({
  campaignsApi: { list: vi.fn(), summary: vi.fn() },
}));
vi.mock('@/services/api/flows', () => ({
  flowsApi: { list: vi.fn(), variables: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({ contactsApi: { get: vi.fn(), list: vi.fn() } }));
vi.mock('@/services/api/notifications', () => ({
  notificationsApi: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const calls = vi.mocked(callsApi);
const campaigns = vi.mocked(campaignsApi);
const cursor = <T,>(data: T[]) => ({
  success: true as const,
  data,
  meta: { hasMore: false, nextCursor: null },
});
const offset = <T,>(data: T[]) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 100, total: data.length, totalPages: 1 },
});
const routes = (element: React.ReactNode) => [
  { path: '/', element },
  { path: '/calls/:id', element: <div>call page</div> },
  { path: '/campaigns/new', element: <div>wizard</div> },
  { path: '/campaigns/:id', element: <div>campaign page</div> },
];

const CONTACT = {
  id: 'k1',
  phoneE164: '+919876543210',
  name: 'Asha Verma',
  callCount: 3,
  lastCalledAt: '2026-10-21T06:00:00.000Z',
  lastDisposition: 'promise_to_pay',
} as Contact;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(flowsApi.list).mockResolvedValue(
    offset([
      fakeFlowRow(),
      fakeFlowRow({ id: 'f2', name: 'Inbound only', triggers: ['inbound'] }),
      fakeFlowRow({ id: 'f3', name: 'Draft', publishedVersion: null }),
    ]),
  );
  vi.mocked(agentsApi.list).mockResolvedValue(offset([fakeAgentRow()]));
  calls.list.mockResolvedValue(cursor([]));
  campaigns.list.mockResolvedValue(cursor([]));
});

describe('Call now', () => {
  it('flows that can start from a campaign; simulated note; refusal in words; then live status + link', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    calls.start
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'CALL_NOT_ALLOWED',
          message: "This contact can't be called right now.",
          details: [{ path: 'contactId', message: 'Daily call limit reached' }],
          kind: 'http',
        }),
      )
      .mockResolvedValue(fakeCall({ id: 'n1', status: 'ringing', provider: 'dryrun' }));
    calls.get.mockResolvedValue(fakeCall({ id: 'n1', status: 'completed', provider: 'dryrun' }));
    const onClose = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders({
      queryClient,
      routes: routes(<CallNowDialog contactId="k1" timezone="Asia/Kolkata" onClose={onClose} />),
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Simulated call — no phone line yet/)).toBeInTheDocument();
    const call = within(dialog).getByRole('button', { name: 'Call' });
    expect(call).toBeDisabled();
    await user.click(within(dialog).getByLabelText('Flow'));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Loan recovery (v2)']);
    await user.click(options[0] as HTMLElement);
    await user.click(call);
    expect(
      await within(dialog).findByText(
        "This contact can't be called right now. Daily call limit reached.",
      ),
    ).toBeInTheDocument();
    const firstKey = calls.start.mock.calls[0]?.[1];
    await user.click(call);
    // the retry of the same choice reuses the Idempotency-Key
    await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(2));
    expect(calls.start.mock.calls[1]).toEqual([{ contactId: 'k1', flowId: 'f1' }, firstKey]);
    expect(await within(dialog).findByText('Completed')).toBeInTheDocument();
    // the settled call refreshes the contact (its call facts changed)
    // once when it started and once when it ended
    const contactRefreshes = () =>
      invalidate.mock.calls.filter(
        ([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(['contacts', 'detail', 'k1']),
      ).length;
    await waitFor(() => expect(contactRefreshes()).toBe(2));
    expect(within(dialog).getByRole('link', { name: 'Open the call' })).toHaveAttribute(
      'href',
      '/calls/n1',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('agents too; a new choice gets a new key', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    calls.start.mockRejectedValue(
      new ApiError({ status: 500, code: 'X', message: 'Boom', kind: 'http' }),
    );
    renderWithProviders({
      routes: routes(<CallNowDialog contactId="k1" timezone="Asia/Kolkata" onClose={vi.fn()} />),
    });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('An agent'));
    await user.click(within(dialog).getByLabelText('Agent'));
    await user.click(await screen.findByRole('option', { name: 'Recovery Bot' }));
    await user.click(within(dialog).getByRole('button', { name: 'Call' }));
    expect(await within(dialog).findByText('Boom')).toBeInTheDocument();
    expect(calls.start.mock.calls[0]?.[0]).toEqual({ contactId: 'k1', agentId: 'a1' });
    await user.click(within(dialog).getByLabelText('A flow'));
    await user.click(within(dialog).getByLabelText('Flow'));
    await user.click(await screen.findByRole('option', { name: 'Loan recovery (v2)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Call' }));
    await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(2));
    expect(calls.start.mock.calls[1]?.[1]).not.toBe(calls.start.mock.calls[0]?.[1]);
  });

  it('error text: the calling window says when calls are allowed again', () => {
    const outside = new ApiError({
      status: 422,
      code: 'CALL_OUTSIDE_WINDOW',
      message: 'Calls are not allowed at this time.',
      details: [{ path: 'window', message: '2026-10-24T03:30:00.000Z' }],
      kind: 'http',
    });
    expect(callNowErrorText(outside, 'Asia/Kolkata')).toBe(
      'Calls are not allowed at this time. Calls are allowed again Sat 24 Oct, 09:00.',
    );
    expect(
      callNowErrorText(
        new ApiError({ status: 422, code: 'CALL_NOT_ALLOWED', message: 'No.', kind: 'http' }),
        'Asia/Kolkata',
      ),
    ).toBe('No.');
  });
});

describe('contact call history', () => {
  it('facts, last calls (campaign name first) and the campaigns that included the contact', async () => {
    signInAs('viewer');
    calls.list.mockResolvedValue(
      cursor([
        fakeCall({ id: 'x1', campaign: { id: 'cp1', name: 'October recovery', attempt: 2 } }),
        fakeCall({ id: 'x2' }),
      ]),
    );
    campaigns.list.mockResolvedValue(cursor([fakeCampaignListItem()]));
    renderWithProviders({ routes: routes(<ContactCallsCard contact={CONTACT} />) });
    const card = screen.getByRole('region', { name: 'Call history' });
    expect(within(card).getByText(/3 calls · last/)).toBeInTheDocument();
    expect(within(card).getByText(/Promise to pay/)).toBeInTheDocument();
    await within(card).findByRole('link', { name: 'Loan recovery' });
    // the call row and the campaign row both carry the campaign name
    expect(
      within(card)
        .getAllByRole('link', { name: 'October recovery' })
        .map((l) => l.getAttribute('href')),
    ).toEqual(['/calls/x1', '/campaigns/cp1']);
    expect(within(card).getByRole('link', { name: 'Loan recovery' })).toHaveAttribute(
      'href',
      '/calls/x2',
    );
    expect(within(card).getByRole('link', { name: 'All calls' })).toHaveAttribute(
      'href',
      '/calls?contactId=k1',
    );
    const list = await within(card).findByRole('list', { name: 'Campaigns' });
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/campaigns/cp1');
    expect(calls.list).toHaveBeenCalledWith({ contactId: 'k1', limit: 5 });
    expect(campaigns.list).toHaveBeenCalledWith({ contactId: 'k1', limit: 10 });
  });

  it('never called; without campaigns.read no campaign lookup', async () => {
    signInAs('viewer', { permissions: ['calls.read', 'contacts.read'] });
    renderWithProviders({
      routes: routes(
        <ContactCallsCard contact={{ ...CONTACT, callCount: 0, lastCalledAt: null }} />,
      ),
    });
    expect(screen.getByText('Never called.')).toBeInTheDocument();
    await waitFor(() => expect(calls.list).toHaveBeenCalled());
    expect(campaigns.list).not.toHaveBeenCalled();
  });
});

describe('call tester ?contactId=', () => {
  it('preselects the contact', async () => {
    signInAs('agent');
    vi.mocked(contactsApi.get).mockResolvedValue(CONTACT);
    vi.mocked(contactsApi.list).mockResolvedValue(offset([]));
    const onStart = vi.fn();
    const user = userEvent.setup();
    renderWithProviders({
      routes: routes(
        <CallSetup
          prefill={{ flowId: 'f1', contactId: 'k1' }}
          busy={false}
          fieldErrors={new Map()}
          onStart={onStart}
        />,
      ),
    });
    expect(screen.getByLabelText('A contact')).toBeChecked();
    expect(await screen.findByDisplayValue('Asha Verma · ••••3210')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: /Start/ });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: 'f1', contactId: 'k1' }),
    );
  });
});

describe('flow builder: Campaigns', () => {
  it('lists the campaigns using the flow and creates one with ?flowId', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    campaigns.list.mockResolvedValue(cursor([fakeCampaignListItem()]));
    renderWithProviders({ routes: routes(<FlowCampaignsButton flow={fakeFlow()} />) });
    await user.click(await screen.findByRole('button', { name: 'Campaigns (1)' }));
    expect(campaigns.list).toHaveBeenCalledWith({ flowId: 'f1', limit: 20 });
    expect(screen.getByRole('menuitem', { name: /October recovery/ })).toHaveAttribute(
      'href',
      '/campaigns/cp1',
    );
    await user.click(screen.getByRole('menuitem', { name: /Create campaign/ }));
    expect(await screen.findByText('wizard')).toBeInTheDocument();
  });

  it('unpublished flows cannot start one; viewers see the list only; no campaigns.read → nothing', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    const first = renderWithProviders({
      routes: routes(<FlowCampaignsButton flow={fakeFlow({ publishedVersion: null })} />),
    });
    await user.click(await screen.findByRole('button', { name: 'Campaigns' }));
    expect(await screen.findByText('Not used in any campaign yet')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Create campaign/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    first.unmount();
    signInAs('viewer');
    const second = renderWithProviders({
      routes: routes(<FlowCampaignsButton flow={fakeFlow()} />),
    });
    await user.click(await screen.findByRole('button', { name: 'Campaigns' }));
    expect(screen.queryByRole('menuitem', { name: /Create campaign/ })).not.toBeInTheDocument();
    second.unmount();
    signInAs('viewer', { permissions: ['flows.read'] });
    renderWithProviders({ routes: routes(<FlowCampaignsButton flow={fakeFlow()} />) });
    expect(screen.queryByRole('button', { name: /Campaigns/ })).not.toBeInTheDocument();
  });
});

describe('dashboard Campaigns card', () => {
  it('running, calls today, scheduled / paused, link; errors', async () => {
    signInAs('viewer');
    campaigns.summary.mockResolvedValueOnce({
      running: 2,
      scheduled: 1,
      paused: 3,
      callsToday: 1250,
    });
    const first = renderWithProviders({ routes: routes(<CampaignsCard />) });
    expect(await screen.findByLabelText('Running')).toHaveTextContent('2');
    expect(screen.getByLabelText('Calls today')).toHaveTextContent('1,250');
    expect(screen.getByText('1 scheduled · 3 paused')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All campaigns' })).toHaveAttribute(
      'href',
      '/campaigns',
    );
    first.unmount();
    campaigns.summary.mockRejectedValueOnce(new Error('x'));
    renderWithProviders({ routes: routes(<CampaignsCard />) });
    expect(await screen.findByText('Campaigns could not be loaded.')).toBeInTheDocument();
  });
});

describe('campaign notifications', () => {
  it('get an icon per type', async () => {
    const user = userEvent.setup();
    signInAs('viewer');
    const note = (id: string, type: string, title: string) => ({
      id,
      type,
      title,
      body: 'x',
      link: '/campaigns/cp1',
      readAt: null,
      createdAt: '2026-10-21T06:00:00.000Z',
    });
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue(3);
    vi.mocked(notificationsApi.list).mockResolvedValue({
      success: true,
      data: [
        note('n1', 'campaign.completed', 'Campaign finished'),
        note('n2', 'campaign.paused', 'Campaign paused'),
        note('n3', 'campaign.run_skipped', 'Scheduled run skipped'),
      ],
      meta: {},
    } as never);
    vi.mocked(notificationsApi.markRead).mockResolvedValue(undefined as never);
    renderWithProviders({ routes: routes(<NotificationsBell />) });
    await user.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }));
    const menu = await screen.findByRole('menu');
    await within(menu).findByText('Scheduled run skipped');
    for (const title of ['Campaign finished', 'Campaign paused', 'Run skipped']) {
      expect(within(menu).getByTitle(title)).toBeInTheDocument();
    }
    await user.click(within(menu).getAllByRole('menuitem')[1] as HTMLElement);
    expect(await screen.findByText('campaign page')).toBeInTheDocument();
  });
});
