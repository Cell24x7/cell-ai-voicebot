import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { systemText } from '@/features/inbox/labels';
import { agentsApi } from '@/services/api/agents';
import { flowsApi } from '@/services/api/flows';
import type { WhatsAppScheduledCall } from '@/services/api/types';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeCallPermission } from '@/test/calls-wa';
import { fakeFlowRow } from '@/test/flows';
import { renderWithProviders } from '@/test/render';

import { CallButton } from './live/CallButton';
import { instantOf, localInputOf } from './live/schedule-time';
import { ScheduledCallsList } from './panel/ScheduledCallsList';

vi.mock('@/services/api/whatsapp-calling', () => ({
  whatsappCallingApi: {
    permission: vi.fn(),
    quote: vi.fn(),
    scheduleCall: vi.fn(),
    scheduledCalls: vi.fn(),
    cancelScheduledCall: vi.fn(),
    updateScheduledCall: vi.fn(),
  },
}));
vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn() } }));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
const api = vi.mocked(whatsappCallingApi);
const offset = <T,>(data: T[]) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 100, total: data.length, totalPages: 1 },
});
const row = (over: Partial<WhatsAppScheduledCall> = {}): WhatsAppScheduledCall => ({
  id: 's1',
  channelId: 'wa1',
  contactId: 'k1',
  conversationId: 'cv1',
  program: { kind: 'flow', id: 'f1' },
  purpose: null,
  dueAt: '2026-11-21T05:30:00.000Z',
  timezone: 'Asia/Kolkata',
  status: 'scheduled',
  skipReason: null,
  origin: 'manual',
  attempt: 0,
  retry: { max: 0, gapMin: 30, on: [] },
  attempts: [],
  shiftedAt: null,
  callIds: [],
  createdBy: 'u1',
  cancelledAt: null,
  createdAt: '2026-11-20T05:30:00.000Z',
  updatedAt: '2026-11-20T05:30:00.000Z',
  ...over,
});
const noWarnings = {
  noPermission: false,
  permissionExpiresBeforeDue: false,
  outsideWindow: false,
  lowWallet: false,
};

const showButton = () =>
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <CallButton
            channelId="wa1"
            contactId="k1"
            phoneE164="+919000000101"
            label="Asha Verma"
            conversationId="cv1"
            windowExpiresAt={null}
          />
        ),
      },
    ],
  });

beforeEach(() => {
  signInAs('owner');
  api.permission.mockResolvedValue(fakeCallPermission('temporary'));
  api.quote.mockResolvedValue({
    channelId: 'wa1',
    contactId: 'k1',
    senderLabel: 'Support',
    senderPhone: '+919000000001',
    market: 'IN',
    callPerMinuteMicros: 450000,
    aiPerMinuteMicros: 6000000,
    pulseSec: 6,
  });
  api.scheduledCalls.mockResolvedValue({
    success: true,
    data: [],
    meta: { nextCursor: null, hasMore: false },
  });
  vi.mocked(flowsApi.list).mockResolvedValue(offset([fakeFlowRow()]));
  vi.mocked(agentsApi.list).mockResolvedValue(offset([fakeAgentRow()]));
});
afterEach(() => vi.clearAllMocks());

describe('Schedule AI call (SAC-T10)', () => {
  it('the Call menu has Call myself, Call with AI and Schedule AI call', async () => {
    showButton();
    await userEvent.click(await screen.findByRole('button', { name: 'Call' }));
    expect(screen.getByRole('menuitem', { name: /Call myself/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /Call with AI/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /Schedule AI call/ })).toBeVisible();
  });

  it('needs a program; sends the time in UTC with retries and an Idempotency-Key', async () => {
    api.scheduleCall.mockResolvedValue({
      scheduledCall: row(),
      warnings: noWarnings,
      replay: false,
    });
    showButton();
    await userEvent.click(await screen.findByRole('button', { name: 'Call' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Schedule AI call/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule AI call' });
    const go = within(dialog).getByRole('button', { name: 'Schedule AI call' });
    expect(go).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Published flow' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Loan recovery' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '2 ghante baad' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Retry/ }));
    await userEvent.click(await screen.findByRole('option', { name: '1 baar' }));
    await userEvent.click(go);
    await waitFor(() => expect(api.scheduleCall).toHaveBeenCalled());
    const [body, key] = api.scheduleCall.mock.calls[0]!;
    expect(body).toMatchObject({
      channelId: 'wa1',
      contactId: 'k1',
      conversationId: 'cv1',
      program: { kind: 'flow', id: 'f1' },
      retry: { max: 1, gapMin: 60, on: ['no_answer', 'busy', 'failed'] },
    });
    const due = Date.parse(body.dueAt);
    expect(due - Date.now()).toBeGreaterThan(115 * 60_000);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('warnings after scheduling: keep it, or cancel it at once', async () => {
    api.scheduleCall.mockResolvedValue({
      scheduledCall: row(),
      warnings: { ...noWarnings, outsideWindow: true },
      replay: false,
    });
    api.cancelScheduledCall.mockResolvedValue(row({ status: 'cancelled' }));
    showButton();
    await userEvent.click(await screen.findByRole('button', { name: 'Call' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Schedule AI call/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule AI call' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Published flow' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Loan recovery' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule AI call' }));
    expect(await screen.findByText(/09:00–21:00 ke bahar/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this scheduled call' }));
    await waitFor(() => expect(api.cancelScheduledCall).toHaveBeenCalledWith('s1'));
  });

  it("a contact's scheduled calls: status, skip reason, cancel", async () => {
    api.scheduledCalls.mockResolvedValue({
      success: true,
      data: [
        row(),
        row({ id: 's2', status: 'skipped', skipReason: 'no_permission', origin: 'ai_callback' }),
      ],
      meta: { nextCursor: null, hasMore: false },
    });
    api.cancelScheduledCall.mockResolvedValue(row({ status: 'cancelled' }));
    renderWithProviders({
      routes: [{ path: '/', element: <ScheduledCallsList contactId="k1" /> }],
    });
    expect(await screen.findByText('Scheduled calls')).toBeVisible();
    expect(screen.getByText('Customer ki call permission nahi thi')).toBeVisible();
    expect(screen.getByText('AI callback')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel AI call' }));
    await waitFor(() => expect(api.cancelScheduledCall).toHaveBeenCalledWith('s1'));
  });

  it('chat lines and the account-time helpers', () => {
    expect(systemText({ kind: 'call_scheduled', newWaIdLast4: null })).toBe(
      'AI call scheduled for this customer.',
    );
    expect(systemText({ kind: 'call_schedule_skipped', newWaIdLast4: null })).toMatch(/not placed/);
    const at = new Date('2026-11-21T05:30:00.000Z');
    expect(localInputOf(at, 'Asia/Kolkata')).toBe('2026-11-21T11:00');
    expect(instantOf('2026-11-21T11:00', 'Asia/Kolkata')?.toISOString()).toBe(at.toISOString());
  });
});
