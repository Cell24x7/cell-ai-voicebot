import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmProvider } from '@/components/ConfirmProvider';
import { useAuthStore } from '@/features/auth/store';
import { addKeyword, normalizeKeyword, retentionText } from '@/features/settings/inbox-settings';
import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi } from '@/services/api/inbox';
import { teamApi } from '@/services/api/team';
import type { CustomField, InboxConversationDetail, TeamMember } from '@/services/api/types';
import type * as WhatsAppModule from '@/services/api/whatsapp';
import { whatsappApi } from '@/services/api/whatsapp';
import { fakeSession, signInAs } from '@/test/auth';
import {
  fakeContactPanel,
  fakeConversation,
  fakeConversationDetail,
  fakeInboxConfig,
  fakeInboxSettings,
  fakeInboxSummary,
} from '@/test/inbox';
import { renderWithProviders } from '@/test/render';
import { fakeChannel } from '@/test/whatsapp';

import { AssignSelect, ConversationActions } from './chat/ConversationActions';
import { ContactChatButton } from './ContactChatButton';
import { InboxDashboardCard } from './InboxDashboardCard';
import { ContactPanel } from './panel/ContactPanel';

vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: {
    config: vi.fn(),
    summary: vi.fn(),
    conversations: vi.fn(),
    conversation: vi.fn(),
    contact: vi.fn(),
    assign: vi.fn(),
    close: vi.fn(),
    reopen: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
    unread: vi.fn(),
    start: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    simulate: vi.fn(),
  },
}));
vi.mock('@/services/api/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof WhatsAppModule>()),
  whatsappApi: { channels: vi.fn() },
}));
vi.mock('@/services/api/team', () => ({ teamApi: { list: vi.fn() } }));
// Phase 12: the panel's calling section asks for the customer's call permission
vi.mock('@/services/api/whatsapp-calling', () => ({
  whatsappCallingApi: {
    permission: vi.fn(() =>
      Promise.resolve({
        status: 'temporary',
        expiresAt: '2026-10-30T10:00:00.000Z',
        canCall: true,
        canRequest: false,
        nextRequestAt: null,
        reason: null,
        history: [],
      }),
    ),
    getSettings: vi.fn(),
  },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));

const api = vi.mocked(inboxApi);
const wa = vi.mocked(whatsappApi);
const member = (id: string, name: string) => ({ id, name }) as TeamMember;
const http = (status: number, code: string, message = 'Server said no') =>
  new ApiError({ status, code, message, kind: 'http', details: [] });

const at = (element: React.ReactNode, route = '/') =>
  renderWithProviders({
    route,
    routes: [
      { path: '/', element: <ConfirmProvider>{element}</ConfirmProvider> },
      { path: '/inbox/:id', element: <div>Inbox page</div> },
    ],
  });

beforeEach(() => {
  signInAs('owner');
  api.config.mockResolvedValue(fakeInboxConfig());
  api.summary.mockResolvedValue(fakeInboxSummary());
  api.conversation.mockResolvedValue(fakeConversationDetail());
  api.contact.mockResolvedValue(fakeContactPanel());
  const echo = (over: Partial<InboxConversationDetail>) => () =>
    Promise.resolve(fakeConversationDetail(over));
  api.assign.mockImplementation((_id, assignedTo) =>
    Promise.resolve(
      fakeConversationDetail({ assignedTo: assignedTo ? { id: assignedTo, name: 'X' } : null }),
    ),
  );
  api.close.mockImplementation(echo({ status: 'closed' }));
  api.reopen.mockImplementation(echo({ status: 'open' }));
  api.block.mockImplementation(echo({ blocked: true }));
  api.unblock.mockImplementation(echo({ blocked: false }));
  api.unread.mockResolvedValue(undefined);
  vi.mocked(teamApi.list).mockResolvedValue({
    success: true,
    data: [member('u1', 'Asha Verma'), member('u2', 'Ravi Kumar')],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  vi.mocked(customFieldsApi.list).mockResolvedValue([
    { id: 'f1', key: 'city', label: 'City', type: 'text' } as CustomField,
    { id: 'f2', key: 'loan', label: 'Loan', type: 'currency' } as CustomField,
  ]);
});
afterEach(() => vi.clearAllMocks());

describe('Assigned to', () => {
  it('owners pick anyone (or nobody)', async () => {
    at(<AssignSelect conversation={fakeConversationDetail()} />);
    const select = screen.getByRole('combobox', { name: 'Assigned to' });
    expect(select).toHaveTextContent('Unassigned');
    await userEvent.click(select);
    await screen.findByRole('option', { name: 'Ravi Kumar' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Unassigned',
      'Asha Verma (me)',
      'Ravi Kumar',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Ravi Kumar' }));
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith('cv1', 'u2'));
  });

  it('agents may take it or leave it; others stay visible but disabled', async () => {
    signInAs('agent');
    at(
      <AssignSelect
        conversation={fakeConversationDetail({ assignedTo: { id: 'u9', name: 'Meena' } })}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Assigned to' });
    expect(select).toHaveTextContent('Meena');
    expect(teamApi.list).not.toHaveBeenCalled();
    await userEvent.click(select);
    expect(screen.getByRole('option', { name: 'Meena' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('option', { name: 'Unassigned' }));
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith('cv1', null));
  });

  it('viewers read only; no session', () => {
    signInAs('viewer');
    at(<AssignSelect conversation={fakeConversationDetail()} />);
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('without a session nothing is "me"', () => {
    useAuthStore.setState({ session: null });
    at(<AssignSelect conversation={fakeConversationDetail()} />);
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('conversation actions', () => {
  it('close / reopen, block (confirmed) / unblock, mark as unread', async () => {
    const view = at(<ConversationActions conversation={fakeConversationDetail()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close conversation' }));
    await waitFor(() => expect(api.close).toHaveBeenCalledWith('cv1'));

    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Block' }));
    const dialog = await screen.findByRole('dialog', { name: 'Block this customer?' });
    expect(within(dialog).getByText(/last 24 hours/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.block).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Block' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Block this customer?' })).getByRole(
        'button',
        { name: 'Block' },
      ),
    );
    await waitFor(() => expect(api.block).toHaveBeenCalledWith('cv1'));

    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark as unread' }));
    await waitFor(() => expect(api.unread).toHaveBeenCalledWith('cv1'));
    view.unmount();

    at(
      <ConversationActions
        conversation={fakeConversationDetail({ status: 'closed', blocked: true })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reopen conversation' }));
    await waitFor(() => expect(api.reopen).toHaveBeenCalledWith('cv1'));
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unblock' }));
    await waitFor(() => expect(api.unblock).toHaveBeenCalledWith('cv1'));
  });

  it('agents: no block; viewers: no close; impersonators cannot mark unread', async () => {
    signInAs('agent');
    const view = at(<ConversationActions conversation={fakeConversationDetail()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Block' })).toBeNull();
    view.unmount();
    signInAs('viewer');
    const v2 = at(<ConversationActions conversation={fakeConversationDetail()} />);
    expect(screen.queryByRole('button', { name: 'Close conversation' })).toBeNull();
    v2.unmount();
    signInAs('superadmin');
    useAuthStore.getState().startImpersonation(
      fakeSession('owner', {
        impersonation: { impersonatorId: 'sa', expiresAt: '2030-01-01T00:00:00Z' },
      }),
    );
    at(<ConversationActions conversation={fakeConversationDetail()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Mark as unread' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.keyboard('{Escape}');
  });

  it('dev: Simulate customer (fake provider)', async () => {
    api.simulate.mockResolvedValue({ kind: 'inbound_text', field: 'messages' } as never);
    at(<ConversationActions conversation={fakeConversationDetail()} />);
    await waitFor(() => expect(api.config).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Simulate customer' }));
    const drawer = await screen.findByRole('region', { name: 'Simulate customer' });
    await userEvent.type(
      within(drawer).getByRole('textbox', { name: 'Text (optional)' }),
      ' Hello ',
    );
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send event' }));
    await waitFor(() =>
      expect(api.simulate).toHaveBeenCalledWith('wa1', 'inbound_text', {
        from: '+919000077001',
        text: 'Hello',
      }),
    );
    expect(await within(drawer).findByText(/updates in a moment/)).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Event' }));
    await userEvent.click(screen.getByRole('option', { name: 'Age messages' }));
    expect(within(drawer).queryByRole('textbox', { name: 'Customer number' })).toBeNull();
    await userEvent.clear(within(drawer).getByRole('spinbutton', { name: 'Days back' }));
    await userEvent.type(within(drawer).getByRole('spinbutton', { name: 'Days back' }), '95');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send event' }));
    await waitFor(() =>
      expect(api.simulate).toHaveBeenLastCalledWith('wa1', 'age_messages', {
        conversationId: 'cv1',
        days: 95,
      }),
    );
    await userEvent.clear(within(drawer).getByRole('spinbutton', { name: 'Days back' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send event' }));
    await waitFor(() =>
      expect(api.simulate).toHaveBeenLastCalledWith('wa1', 'age_messages', {
        conversationId: 'cv1',
        days: 91,
      }),
    );

    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Event' }));
    await userEvent.click(screen.getByRole('option', { name: 'Window expired' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send event' }));
    await waitFor(() =>
      expect(api.simulate).toHaveBeenLastCalledWith('wa1', 'window_expired', {
        conversationId: 'cv1',
      }),
    );

    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Event' }));
    await userEvent.click(screen.getByRole('option', { name: 'Inbound image' }));
    await userEvent.clear(within(drawer).getByRole('textbox', { name: 'Customer number' }));
    await userEvent.type(
      within(drawer).getByRole('textbox', { name: 'Customer number' }),
      '+91 90000 88001',
    );
    api.simulate.mockRejectedValueOnce(http(404, 'RESOURCE_NOT_FOUND', 'No such number'));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send event' }));
    expect(await within(drawer).findByText('No such number')).toBeInTheDocument();
    expect(api.simulate).toHaveBeenLastCalledWith('wa1', 'inbound_image', {
      from: '+91 90000 88001',
    });

    // text kind without text
    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Event' }));
    await userEvent.click(screen.getByRole('option', { name: 'Inbound reply' }));
    await userEvent.clear(within(drawer).getByRole('textbox', { name: 'Text (optional)' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send event' }));
    await waitFor(() =>
      expect(api.simulate).toHaveBeenLastCalledWith('wa1', 'inbound_reply', {
        from: '+91 90000 88001',
      }),
    );
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Simulate customer' })).toBeNull(),
    );
  });

  it('no simulator on the real provider or without a number', async () => {
    api.config.mockResolvedValue(fakeInboxConfig({ fakeProvider: false }));
    at(<ConversationActions conversation={fakeConversationDetail()} />);
    await waitFor(() => expect(api.config).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Simulate customer' })).toBeNull();
  });
});

describe('contact panel', () => {
  it('everything about the contact', async () => {
    api.contact.mockResolvedValue(
      fakeContactPanel({
        contact: {
          ...fakeContactPanel().contact!,
          email: 'asha@example.com',
          dnd: true,
          optedOutAt: '2026-10-20T00:00:00.000Z',
          variables: { city: 'Jaipur', loan: 12_500_000_000, unknown_key: 'x' },
          whatsapp: {
            profileName: 'Asha',
            lastInboundAt: '2026-10-22T09:00:00.000Z',
            blocked: true,
          },
        },
        recentCalls: [
          {
            id: 'c1',
            status: 'completed',
            at: '2026-10-22T09:00:00.000Z',
            durationSec: 64,
            disposition: 'promise_to_pay',
          },
          {
            id: 'c2',
            status: 'no_answer',
            at: '2026-10-21T09:00:00.000Z',
            durationSec: null,
            disposition: null,
          },
        ],
        otherConversations: [
          {
            id: 'cv2',
            channelId: 'wa2',
            channelLabel: 'Sales',
            lastMessageAt: null,
            status: 'closed',
          },
        ],
      }),
    );
    api.conversation.mockResolvedValue(
      fakeConversationDetail({ assignedTo: { id: 'u2', name: 'Ravi' } }),
    );
    at(<ContactPanel conversationId="cv1" />);
    const panel = screen.getByRole('region', { name: 'Contact details' });
    expect(await within(panel).findByText('asha@example.com')).toBeInTheDocument();
    expect(within(panel).getByText('Opted out')).toBeInTheDocument();
    expect(within(panel).getByText('DND')).toBeInTheDocument();
    expect(within(panel).getByText('Blocked')).toBeInTheDocument();
    expect(within(panel).getByText(/Last message from them/)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Open contact' })).toHaveAttribute(
      'href',
      '/contacts/c/ct1',
    );
    expect(await within(panel).findByText('Assigned to: Ravi')).toBeInTheDocument();
    expect(within(panel).getByText('Number: Support line')).toBeInTheDocument();
    expect(within(panel).getByText('vip')).toBeInTheDocument();
    expect(within(panel).getByText('EMI due')).toBeInTheDocument();
    expect(await within(panel).findByText('City:')).toBeInTheDocument();
    expect(within(panel).getByText('Loan:')).toBeInTheDocument();
    expect(within(panel).getByText(/₹12,500\.00/)).toBeInTheDocument();
    expect(within(panel).getByText('unknown_key:')).toBeInTheDocument();
    expect(await within(panel).findByText('Can call until 30 Oct 2026, 15:30')).toBeInTheDocument();
    expect(
      within(panel).getByRole('link', { name: 'completed · promise to pay · 64 s' }),
    ).toHaveAttribute('href', '/calls/c1');
    expect(within(panel).getByRole('link', { name: 'no answer' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Sales · closed' })).toHaveAttribute(
      'href',
      '/inbox/cv2',
    );
  });

  it('a plain contact; deleted contact; no calls; number removed; load error', async () => {
    api.contact.mockResolvedValue(
      fakeContactPanel({
        contact: {
          ...fakeContactPanel().contact!,
          tags: [],
          lists: [],
          variables: {},
          whatsapp: null,
        },
        recentCalls: [],
      }),
    );
    api.conversation.mockResolvedValue(fakeConversationDetail({ channel: null }));
    const view = at(<ContactPanel conversationId="cv1" />);
    expect(await screen.findByText('No calls yet.')).toBeInTheDocument();
    expect(screen.queryByText('Tags and lists')).toBeNull();
    expect(screen.queryByText('Fields')).toBeNull();
    expect(await screen.findByText('Number: Removed')).toBeInTheDocument();
    expect(screen.getByText('Assigned to: Nobody')).toBeInTheDocument();
    view.unmount();

    api.contact.mockRejectedValueOnce(http(500, 'INTERNAL'));
    at(<ContactPanel conversationId="cv1" />);
    expect(await screen.findByText('Contact details could not be loaded.')).toBeInTheDocument();
  });

  it('fields list failing still shows raw keys', async () => {
    vi.mocked(customFieldsApi.list).mockRejectedValue(http(500, 'INTERNAL'));
    at(<ContactPanel conversationId="cv1" />);
    expect(await screen.findByText('city:')).toBeInTheDocument();
  });
});

describe('contact page chat button', () => {
  const show = () => at(<ContactChatButton contactId="ct1" phoneE164="+919000077001" />);
  beforeEach(() => {
    wa.channels.mockResolvedValue({ items: [fakeChannel()], counts: { connected: 1 }, limit: 10 });
    api.conversations.mockResolvedValue({ success: true, data: [], meta: { nextCursor: null } });
    api.start.mockResolvedValue(fakeConversationDetail({ id: 'new1', created: true }));
  });

  it('Open chat when a conversation exists (closed ones too)', async () => {
    api.conversations
      .mockResolvedValueOnce({
        success: true,
        data: [
          fakeConversation({ id: 'other', contact: { ...fakeConversation().contact, id: 'ct9' } }),
        ],
        meta: { nextCursor: null },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [fakeConversation({ id: 'old1' })],
        meta: { nextCursor: null },
      });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    expect(await screen.findByText('Inbox page')).toBeInTheDocument();
    expect(api.conversations).toHaveBeenCalledWith({
      q: '919000077001',
      status: 'open',
      limit: 50,
    });
    expect(api.conversations).toHaveBeenCalledWith({
      q: '919000077001',
      status: 'closed',
      limit: 50,
    });
  });

  it('Start chat on the only number', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start chat' }));
    await waitFor(() =>
      expect(api.start).toHaveBeenCalledWith({ channelId: 'wa1', contactId: 'ct1' }),
    );
    expect(await screen.findByText('Inbox page')).toBeInTheDocument();
  });

  it('Start chat picks the number when there are several (not disconnected ones)', async () => {
    wa.channels.mockResolvedValue({
      items: [
        fakeChannel(),
        fakeChannel({ id: 'wa2', label: 'Sales', displayPhoneNumber: null }),
        fakeChannel({ id: 'wa3', label: 'Old', status: 'disconnected' }),
      ],
      counts: {},
      limit: 10,
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start chat' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Support line · +91 90000 12345',
      'Sales',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sales' }));
    await waitFor(() =>
      expect(api.start).toHaveBeenCalledWith({ channelId: 'wa2', contactId: 'ct1' }),
    );
  });

  it('closing the number menu', async () => {
    wa.channels.mockResolvedValue({
      items: [fakeChannel(), fakeChannel({ id: 'wa2', label: 'Sales' })],
      counts: {},
      limit: 10,
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Start chat' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('nothing for viewers without a chat, without numbers, or when WhatsApp is off', async () => {
    signInAs('viewer');
    const v1 = show();
    await waitFor(() => expect(api.conversations).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button')).toBeNull();
    v1.unmount();
    signInAs('owner');
    wa.channels.mockResolvedValue({ items: [], counts: {}, limit: 10 });
    const v2 = show();
    await waitFor(() => expect(api.conversations).toHaveBeenCalledTimes(4));
    expect(screen.queryByRole('button')).toBeNull();
    v2.unmount();
    api.config.mockRejectedValue(http(503, 'WHATSAPP_NOT_CONFIGURED'));
    show();
    await waitFor(() => expect(api.config).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('numbers still loading: nothing yet', async () => {
    wa.channels.mockReturnValue(new Promise(() => undefined));
    show();
    await waitFor(() => expect(api.conversations).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('dashboard leaves the card out without inbox.read', async () => {
    signInAs('owner', { permissions: ['account.read'] });
    renderWithProviders({ route: '/' });
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(api.summary).not.toHaveBeenCalled();
  });

  it('no inbox permission: nothing', () => {
    signInAs('owner', { permissions: ['contacts.read'] });
    show();
    expect(api.config).not.toHaveBeenCalled();
  });
});

describe('dashboard card', () => {
  it('unread and assigned counts → /inbox', async () => {
    at(<InboxDashboardCard />);
    const card = await screen.findByRole('region', { name: 'Inbox' });
    expect(within(card).getByText('Inbox: 3 unread · 1 assigned to you')).toBeInTheDocument();
    expect(within(card).getByText('5 open conversations')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );
  });

  it('one open; hidden when the summary fails', async () => {
    api.summary.mockResolvedValueOnce(fakeInboxSummary({ open: 1 }));
    const v = at(<InboxDashboardCard />);
    expect(await screen.findByText('1 open conversation')).toBeInTheDocument();
    v.unmount();
    api.summary.mockRejectedValueOnce(http(503, 'WHATSAPP_NOT_CONFIGURED'));
    at(<InboxDashboardCard />);
    await waitFor(() => expect(api.summary).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('region', { name: 'Inbox' })).toBeNull();
  });
});

describe('Settings → Inbox', () => {
  const open = () => renderWithProviders({ route: '/settings/inbox' });
  beforeEach(() => {
    api.settings.mockResolvedValue(fakeInboxSettings());
    api.updateSettings.mockImplementation((patch) =>
      Promise.resolve(fakeInboxSettings(patch as Partial<ReturnType<typeof fakeInboxSettings>>)),
    );
  });

  it('read receipts on by default; keywords; replies; notifications; retention; save', async () => {
    open();
    const section = await screen.findByRole('region', { name: 'Inbox settings' });
    const receipts = within(section).getByRole('switch', { name: /read receipts/ });
    expect(receipts).toBeChecked();
    expect(within(section).getByText(/kept for 90 days/)).toBeInTheDocument();
    const save = within(section).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.click(receipts);

    const add = within(section).getByRole('textbox', { name: 'Add to opt-out keywords' });
    await userEvent.type(add, ' roko ');
    await userEvent.click(
      within(section).getAllByRole('button', { name: 'Add' })[0] as HTMLElement,
    );
    expect(
      within(within(section).getByRole('list', { name: 'Opt-out keywords' })).getByText('ROKO'),
    ).toBeInTheDocument();
    await userEvent.type(add, 'stop{Enter}');
    expect(within(section).getByText('Already in this list')).toBeInTheDocument();
    await userEvent.clear(add);
    await userEvent.type(add, 'start{Enter}');
    expect(within(section).getByText('Already in the other list')).toBeInTheDocument();
    await userEvent.clear(add);
    await userEvent.type(add, 'a{Backspace}');
    expect(within(section).getAllByRole('button', { name: 'Add' })[0]).toBeDisabled();
    // other keys don't add
    await userEvent.type(add, 'x');
    await userEvent.keyboard('{Tab}');

    const optIn = within(section).getByRole('list', { name: 'Opt-in keywords' });
    const shuru = within(optIn).getByText('SHURU').closest('.MuiChip-root') as HTMLElement;
    await userEvent.click(within(shuru).getByTestId('CancelIcon'));
    expect(within(optIn).queryByText('SHURU')).toBeNull();

    const reply = within(section).getByRole('textbox', { name: 'Opt-out reply' });
    await userEvent.clear(reply);
    expect(save).toBeDisabled();
    await userEvent.type(reply, 'Done, no more messages.');
    await userEvent.click(within(section).getByRole('switch', { name: /Confirm opt-ins/ }));
    expect(within(section).queryByRole('textbox', { name: 'Opt-in reply' })).toBeNull();
    await userEvent.click(within(section).getByRole('switch', { name: /Confirm opt-ins/ }));
    await userEvent.clear(within(section).getByRole('textbox', { name: 'Opt-in reply' }));
    expect(save).toBeDisabled();
    await userEvent.type(
      within(section).getByRole('textbox', { name: 'Opt-in reply' }),
      'Welcome back',
    );
    await userEvent.click(within(section).getByRole('switch', { name: /Confirm opt-outs/ }));

    await userEvent.click(
      within(section).getByRole('combobox', { name: 'New message notifications' }),
    );
    await userEvent.click(
      screen.getByRole('option', { name: 'Only conversations assigned to me' }),
    );
    await userEvent.click(save);
    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          sendReadReceipts: false,
          optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'BAND KARO', 'बंद करो', 'ROKO'],
          optInKeywords: ['START'],
          optOutReply: false,
          optInReplyText: 'Welcome back',
          notifyOnNewMessage: 'assigned_only',
        }),
      ),
    );
    expect(await screen.findByText('Inbox settings saved')).toBeInTheDocument();
  });

  it('at least one opt-out keyword; discard; save errors', async () => {
    api.settings.mockResolvedValue(fakeInboxSettings({ optOutKeywords: ['STOP'] }));
    api.updateSettings.mockRejectedValueOnce(http(422, 'VALIDATION_FAILED', 'Bad settings'));
    open();
    const section = await screen.findByRole('region', { name: 'Inbox settings' });
    const list = within(section).getByRole('list', { name: 'Opt-out keywords' });
    await userEvent.click(
      within(within(list).getByText('STOP').closest('.MuiChip-root') as HTMLElement).getByTestId(
        'CancelIcon',
      ),
    );
    expect(within(section).getByText('Keep at least one opt-out keyword.')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(within(section).getByRole('button', { name: 'Discard changes' }));
    expect(within(list).getByText('STOP')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('switch', { name: /read receipts/ }));
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await within(section).findByText('Bad settings')).toBeInTheDocument();
  });

  it('read only without account.update; no retention limit; load error', async () => {
    signInAs('agent');
    api.config.mockResolvedValue(fakeInboxConfig({ retentionDays: 0 }));
    const v = open();
    const section = await screen.findByRole('region', { name: 'Inbox settings' });
    expect(within(section).getByText(/Only owners and admins/)).toBeInTheDocument();
    expect(within(section).getByRole('switch', { name: /read receipts/ })).toBeDisabled();
    expect(within(section).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(section).queryByRole('textbox', { name: 'Add to opt-out keywords' })).toBeNull();
    expect(
      await within(section).findByText(/kept until the account is deleted/),
    ).toBeInTheDocument();
    v.unmount();
    signInAs('owner');
    api.settings.mockRejectedValueOnce(http(500, 'INTERNAL', 'Settings failed'));
    open();
    expect(await screen.findByText('Settings failed')).toBeInTheDocument();
  });

  it('settings without the inbox config fall back to the stored retention', async () => {
    api.config.mockRejectedValue(http(503, 'WHATSAPP_NOT_CONFIGURED'));
    api.settings.mockResolvedValue(fakeInboxSettings({ retentionDays: 30 }));
    open();
    expect(await screen.findByText(/kept for 30 days/)).toBeInTheDocument();
  });

  it('keyword rules', () => {
    expect(normalizeKeyword('  band   karo ')).toBe('BAND KARO');
    expect(addKeyword([], [], '  ')).toEqual({ keywords: [], error: 'Type a keyword' });
    expect(addKeyword([], [], 'x'.repeat(31)).error).toBe('At most 30 characters');
    const full = Array.from({ length: 30 }, (_x, i) => `K${String(i)}`);
    expect(addKeyword(full, [], 'NEW').error).toBe('At most 30 keywords');
    expect(addKeyword(['STOP'], [], 'roko')).toEqual({ keywords: ['STOP', 'ROKO'], error: null });
    expect(retentionText(90)).toMatch(/90 days/);
  });
});
