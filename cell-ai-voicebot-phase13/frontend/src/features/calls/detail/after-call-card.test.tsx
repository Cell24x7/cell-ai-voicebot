import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { outcomeRulesApi } from '@/services/api/outcome-rules';
import type { AfterCallMessage } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { reasonOf, SKIP_REASON_TEXT } from './after-call';
import { AFTER_CALL_POLL_MS, AfterCallCard } from './AfterCallCard';

vi.mock('@/services/api/outcome-rules', () => ({ outcomeRulesApi: { afterCall: vi.fn() } }));

const row = (o: Partial<AfterCallMessage> = {}): AfterCallMessage => ({
  id: 'p1',
  source: 'rule',
  nodeId: null,
  ruleId: 'r1',
  ruleName: 'Promise reminder',
  templateName: 'emi_reminder',
  language: 'en',
  status: 'sent',
  reason: null,
  scheduledAt: '2026-10-30T05:00:00.000Z',
  sentAt: '2026-10-30T05:01:00.000Z',
  messageId: 'm1',
  conversationId: 'cv1',
  ...o,
});

const show = () =>
  renderWithProviders({
    routes: [{ path: '/', element: <AfterCallCard callId="c1" timezone="Asia/Kolkata" /> }],
  });

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
});
afterEach(() => vi.useRealTimers());

describe('AfterCallCard', () => {
  it('lists sent, skipped and scheduled messages with exact reasons and a chat link', async () => {
    vi.mocked(outcomeRulesApi.afterCall).mockResolvedValue([
      row(),
      row({
        id: 'p2',
        source: 'flow',
        nodeId: 'n4',
        ruleId: null,
        ruleName: null,
        status: 'skipped',
        reason: 'opted_out',
        sentAt: null,
        messageId: null,
        conversationId: null,
      }),
      row({ id: 'p3', ruleName: null, status: 'scheduled', sentAt: null, conversationId: null }),
      row({ id: 'p4', status: 'failed', reason: 'whatsapp_send_failed', sentAt: null }),
    ]);
    show();
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'After the call' })).toBeInTheDocument();
    expect(outcomeRulesApi.afterCall).toHaveBeenCalledWith('c1');
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText(/Rule "Promise reminder" · sent 30 Oct 2026, 10:31/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Flow step · at .* · The customer opted out of WhatsApp messages/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rule "removed" · due 30 Oct 2026, 10:30/)).toBeInTheDocument();
    expect(screen.getByText(/whatsapp send failed/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Open the chat' });
    expect(links[0]).toHaveAttribute('href', '/inbox/cv1');
  });

  it('renders nothing when the call sent nothing; no chat link without inbox access', async () => {
    vi.mocked(outcomeRulesApi.afterCall).mockResolvedValueOnce([]);
    const { unmount } = show();
    expect(screen.getByRole('heading', { name: 'After the call' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'After the call' })).not.toBeInTheDocument(),
    );
    unmount();

    signInAs('owner', { permissions: ['calls.read'] });
    vi.mocked(outcomeRulesApi.afterCall).mockResolvedValueOnce([row()]);
    show();
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open the chat' })).not.toBeInTheDocument();
  });

  it('shows load errors', async () => {
    vi.mocked(outcomeRulesApi.afterCall).mockRejectedValue(new Error('offline'));
    show();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('re-checks while a message is scheduled, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(outcomeRulesApi.afterCall)
      .mockResolvedValueOnce([row({ status: 'scheduled', sentAt: null })])
      .mockResolvedValue([row()]);
    show();
    expect(await screen.findByText('Scheduled')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(AFTER_CALL_POLL_MS + 10));
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(AFTER_CALL_POLL_MS * 2));
    expect(outcomeRulesApi.afterCall).toHaveBeenCalledTimes(2);
  });

  it('every backend skip reason has plain words', () => {
    expect(Object.keys(SKIP_REASON_TEXT)).toEqual([
      'opted_out',
      'dnd',
      'no_template',
      'template_not_approved',
      'no_number',
      'no_phone',
      'low_balance',
      'marketing_limit',
      'rule_disabled',
      'call_not_eligible',
    ]);
    expect(reasonOf(null)).toBeNull();
    expect(reasonOf('dnd')).toBe('The customer is on Do Not Disturb');
    expect(reasonOf('meta_rejected')).toBe('meta rejected');
  });
});
