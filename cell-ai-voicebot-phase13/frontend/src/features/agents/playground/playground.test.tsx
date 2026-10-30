import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LedgerDetailDrawer } from '@/features/wallet/LedgerDetailDrawer';
import { agentsApi } from '@/services/api/agents';
import { contactsApi } from '@/services/api/contacts';
import { ApiError } from '@/services/api/errors';
import { playgroundApi } from '@/services/api/playground';
import type { PlaygroundSession, PlaygroundTurn } from '@/services/api/types';
import { FAKE_CATALOG, fakeAgent } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/agents', () => ({
  agentsApi: { get: vi.fn(), catalog: vi.fn(), usage: vi.fn(), setActive: vi.fn() },
}));
vi.mock('@/services/api/playground', () => ({
  playgroundApi: { list: vi.fn(), get: vi.fn(), start: vi.fn(), send: vi.fn(), reset: vi.fn() },
}));
vi.mock('@/services/api/contacts', () => ({ contactsApi: { list: vi.fn() } }));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const agents = vi.mocked(agentsApi);
const pg = vi.mocked(playgroundApi);
const contacts = vi.mocked(contactsApi);

const turn = (o: Partial<PlaygroundTurn>): PlaygroundTurn => ({
  id: `t${Math.random()}`,
  clientTurnId: null,
  role: 'assistant',
  text: '',
  toolCalls: [],
  knowledge: [],
  inputTokens: 0,
  outputTokens: 0,
  costMicros: 0,
  billing: 'none',
  guardrail: null,
  fallback: null,
  at: '2026-10-09T00:00:00Z',
  ...o,
});
const OUTCOME = {
  disposition: null,
  promiseToPay: null,
  callback: null,
  transferRequested: false,
  endRequested: false,
  smsTemplate: null,
};
const SESSION = (o: Partial<PlaygroundSession> = {}): PlaygroundSession => ({
  id: 's1',
  agentId: 'a1',
  userId: 'u1',
  contactId: null,
  variables: { name: 'Asha' },
  hasTestPhone: true,
  turns: [turn({ id: 'open', text: 'Namaste Asha ji' })],
  outcome: OUTCOME,
  status: 'active',
  costMicros: 0,
  expiresAt: '2026-11-08T00:00:00Z',
  createdAt: '2026-10-09T00:00:00Z',
  ...o,
});
const ROW = {
  id: 's1',
  userId: 'u1',
  status: 'active' as const,
  turns: 1,
  costMicros: 0,
  lastText: 'Namaste Asha ji',
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
};

beforeEach(() => {
  agents.get.mockResolvedValue(fakeAgent());
  agents.catalog.mockResolvedValue(FAKE_CATALOG);
  agents.usage.mockResolvedValue({
    flows: [],
    today: { day: '2026-10-09', spentMicros: 0, turns: 0 },
    month: { month: '2026-10', spentMicros: 0, turns: 0, inputTokens: 0, outputTokens: 0 },
  });
  pg.list.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

const typeAndSend = async (text: string) => {
  const box = await screen.findByRole('textbox', { name: 'Message' });
  await userEvent.type(box, `${text}{Enter}`);
};

describe('playground', () => {
  it('starts a conversation, sends with Enter and shows tool cards, cost and outcome', async () => {
    signInAs('manager');
    pg.start.mockResolvedValue(SESSION());
    pg.get.mockResolvedValue(SESSION());
    pg.send.mockImplementation((_a, _s, body) =>
      Promise.resolve({
        userTurn: turn({
          id: 'u1',
          role: 'user',
          text: body.text,
          clientTurnId: body.clientTurnId,
        }),
        turn: turn({
          id: 'r1',
          clientTurnId: body.clientTurnId,
          text: 'Dhanyavaad! Payment mil gaya.',
          toolCalls: [
            {
              name: 'check_payment_status',
              kind: 'custom',
              args: {},
              ok: true,
              simulated: false,
              durationMs: 41,
              resultPreview: '{"status":"paid"}',
              error: null,
            },
          ],
          knowledge: [{ title: 'Late fee', snippet: '₹50 per day', score: 0.48 }],
          inputTokens: 1500,
          outputTokens: 40,
          costMicros: 308_000,
          billing: 'charged',
        }),
        outcome: OUTCOME,
        status: 'active',
        replay: false,
      }),
    );
    renderWithProviders({ route: '/agents/a1/playground' });
    expect(await screen.findByText('Test mode — fake AI')).toBeInTheDocument();
    expect(screen.getByText('Start a conversation to test this agent.')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: '{{name}}' }), 'Asha');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Test phone (optional)' }),
      '+919000000002',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start new conversation' }));
    await waitFor(() =>
      expect(pg.start).toHaveBeenCalledWith('a1', {
        variables: { name: 'Asha' },
        testPhone: '+919000000002',
      }),
    );
    expect(await screen.findByText('Namaste Asha ji')).toBeInTheDocument();
    await typeAndSend('maine pay kar diya');
    await waitFor(() =>
      expect(pg.send).toHaveBeenCalledWith('a1', 's1', {
        text: 'maine pay kar diya',
        clientTurnId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      }),
    );
    expect(await screen.findByText('Dhanyavaad! Payment mil gaya.')).toBeInTheDocument();
    const tool = screen.getByRole('group', { name: 'Tool check_payment_status' });
    expect(within(tool).getByText('OK')).toBeInTheDocument();
    expect(within(tool).getByText('41 ms')).toBeInTheDocument();
    expect(screen.getByText('₹0.31 · 1,500 + 40 tokens')).toBeInTheDocument();
    expect(screen.getByText('From knowledge (1)')).toBeInTheDocument();
    expect(screen.getByText('A test phone is set for functions.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Outcome' })).toHaveTextContent(
      'Nothing recorded yet.',
    );
  });

  it('shows simulated built-ins, the promise outcome and ends the conversation', async () => {
    signInAs('owner');
    pg.list.mockResolvedValue([ROW]);
    pg.get.mockResolvedValue(SESSION());
    pg.send.mockResolvedValue({
      userTurn: turn({ id: 'u2', role: 'user', text: 'kal tak de dunga' }),
      turn: turn({
        id: 'r2',
        text: 'Aapke samay ke liye dhanyavaad.',
        toolCalls: [
          {
            name: 'save_promise_to_pay',
            kind: 'built_in',
            args: { date: '2026-10-10' },
            ok: true,
            simulated: true,
            durationMs: 0,
            resultPreview: null,
            error: null,
          },
        ],
      }),
      outcome: {
        ...OUTCOME,
        promiseToPay: { date: '2026-10-10', amountMicros: 2_500_000_000 },
        endRequested: true,
        disposition: 'promise_to_pay',
        callback: { date: '2026-10-12', time: '18:00' },
        transferRequested: true,
        smsTemplate: 'pay_link',
      },
      status: 'ended',
      replay: false,
    });
    pg.reset.mockResolvedValue(SESSION({ id: 's2' }));
    renderWithProviders({ route: '/agents/a1/playground' });
    await typeAndSend('kal tak de dunga');
    const tool = await screen.findByRole('group', { name: 'Tool save_promise_to_pay' });
    expect(within(tool).getByText('Simulated')).toBeInTheDocument();
    expect(within(tool).getByText('date: 2026-10-10')).toBeInTheDocument();
    const outcome = screen.getByRole('region', { name: 'Outcome' });
    expect(outcome).toHaveTextContent('Promise to pay10 Oct 2026 · ₹2,500.00');
    expect(outcome).toHaveTextContent('OutcomePromise to pay');
    expect(outcome).toHaveTextContent('Call back12 Oct 2026 at 18:00');
    expect(outcome).toHaveTextContent('TransferRequested');
    expect(outcome).toHaveTextContent('SMS after the callpay_link');
    expect(outcome).toHaveTextContent('ConversationEnded');
    expect(
      screen.getByText('This conversation has ended — start a new one or press Reset.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(pg.reset).toHaveBeenCalledWith('a1', 's1'));
  });

  it('retries a failed message with the same clientTurnId; cap errors are explained', async () => {
    signInAs('owner');
    pg.list.mockResolvedValue([ROW]);
    pg.get.mockResolvedValue(SESSION());
    pg.send
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK', message: 'x', kind: 'network' }),
      )
      .mockResolvedValueOnce({
        userTurn: turn({ id: 'u3', role: 'user', text: 'hello' }),
        turn: turn({ id: 'r3', text: 'Ji, boliye.' }),
        outcome: OUTCOME,
        status: 'active',
        replay: true,
      })
      .mockRejectedValueOnce(
        new ApiError({ status: 422, code: 'AI_SPEND_CAP_REACHED', message: 'cap', kind: 'http' }),
      );
    renderWithProviders({ route: '/agents/a1/playground' });
    await typeAndSend('hello');
    expect(await screen.findByText(/^Not sent:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ji, boliye.')).toBeInTheDocument();
    const [first, second] = pg.send.mock.calls;
    expect(second?.[2].clientTurnId).toBe(first?.[2].clientTurnId);
    await typeAndSend('again');
    expect(
      await screen.findByText('Not sent: This agent reached its spending cap.'),
    ).toBeInTheDocument();
  });

  it('shows fallback banners: wallet empty, cap reached, agent off, AI failed', async () => {
    signInAs('owner');
    pg.list.mockResolvedValue([ROW]);
    agents.get.mockResolvedValue(fakeAgent({ isActive: false }));
    agents.setActive.mockResolvedValue(fakeAgent({ isActive: true }));
    const withLast = (o: Partial<PlaygroundTurn>) =>
      SESSION({ turns: [turn({ id: 'x', text: 'Fallback text', ...o })] });
    pg.get.mockResolvedValueOnce(withLast({ fallback: 'walletEmpty' }));
    const { unmount } = renderWithProviders({ route: '/agents/a1/playground' });
    expect(
      await screen.findByText(
        'The wallet is empty — the agent answered with its wallet-empty message.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add money' })).toHaveAttribute(
      'href',
      '/wallet?add=1',
    );
    unmount();
    pg.get.mockResolvedValueOnce(withLast({ fallback: 'capReached' }));
    const second = renderWithProviders({ route: '/agents/a1/playground' });
    expect(await screen.findByRole('link', { name: 'Change the limits' })).toHaveAttribute(
      'href',
      '/agents/a1/limits',
    );
    second.unmount();
    pg.get.mockResolvedValueOnce(withLast({ fallback: 'agentOff' }));
    const third = renderWithProviders({ route: '/agents/a1/playground' });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(agents.setActive).toHaveBeenCalledWith('a1', true));
    expect(
      await screen.findByText('The agent is on now — send the message again.'),
    ).toBeInTheDocument();
    third.unmount();
    pg.get.mockResolvedValueOnce(
      withLast({
        fallback: 'aiFailed',
        guardrail: 'secret_request',
        inputTokens: 10,
        outputTokens: 2,
        costMicros: 2400,
        billing: 'charged',
      }),
    );
    renderWithProviders({ route: '/agents/a1/playground' });
    expect(
      await screen.findByText(/The AI could not answer \(its reply broke a rule twice\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/reply blocked once: asked for a secret/)).toBeInTheDocument();
  });

  it('while a new conversation starts, the open one takes no message (it would go to the old one)', async () => {
    signInAs('manager');
    pg.list.mockResolvedValue([ROW]);
    pg.get.mockResolvedValue(SESSION());
    let started: (s: PlaygroundSession) => void = () => undefined;
    pg.start.mockReturnValue(
      new Promise((resolve) => {
        started = resolve;
      }),
    );
    renderWithProviders({ route: '/agents/a1/playground' });
    const box = await screen.findByRole('textbox', { name: 'Message' });
    expect(box).toBeEnabled();
    await userEvent.type(screen.getByRole('textbox', { name: '{{name}}' }), 'Ravi');
    await userEvent.click(screen.getByRole('button', { name: 'Start new conversation' }));
    await waitFor(() => expect(box).toBeDisabled());
    pg.get.mockResolvedValue(
      SESSION({ id: 's2', turns: [turn({ id: 'open2', text: 'Namaste Ravi ji' })] }),
    );
    started(SESSION({ id: 's2', turns: [turn({ id: 'open2', text: 'Namaste Ravi ji' })] }));
    expect(await screen.findByText('Namaste Ravi ji')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled());
  });

  it('starts from a contact', async () => {
    signInAs('owner');
    contacts.list.mockResolvedValue({
      success: true,
      data: [{ id: 'c1', name: 'Asha Verma', phoneE164: '+919000000002' }],
      meta: {},
    } as never);
    pg.start.mockResolvedValue(SESSION({ contactId: 'c1' }));
    pg.get.mockResolvedValue(SESSION({ contactId: 'c1' }));
    renderWithProviders({ route: '/agents/a1/playground' });
    await userEvent.click(await screen.findByRole('radio', { name: 'A contact' }));
    expect(screen.getByRole('button', { name: 'Start new conversation' })).toBeDisabled();
    await userEvent.click(screen.getByRole('combobox', { name: 'Contact' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Asha Verma · ••••0002' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start new conversation' }));
    await waitFor(() => expect(pg.start).toHaveBeenCalledWith('a1', { contactId: 'c1' }));
  });

  it('readers browse past conversations read-only', async () => {
    signInAs('viewer');
    pg.list.mockResolvedValue([ROW, { ...ROW, id: 's2', lastText: 'Older one', status: 'ended' }]);
    pg.get.mockImplementation((_a, sid) =>
      Promise.resolve(
        SESSION({
          id: sid,
          turns: [turn({ id: sid, text: sid === 's2' ? 'Older one' : 'Namaste Asha ji' })],
        }),
      ),
    );
    renderWithProviders({ route: '/agents/a1/playground' });
    expect(await screen.findByRole('listitem', { name: 'Agent' })).toHaveTextContent(
      'Namaste Asha ji',
    );
    expect(
      screen.queryByRole('button', { name: 'Start new conversation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Older one/ }));
    await waitFor(() => expect(pg.get).toHaveBeenCalledWith('a1', 's2'));
  });
});

describe('ledger drawer — AI usage', () => {
  it('shows tokens, model and kind', () => {
    render(
      <LedgerDetailDrawer
        open
        timezone="Asia/Kolkata"
        onClose={() => undefined}
        entry={{
          id: 'l1',
          type: 'ai_charge',
          direction: 'debit',
          status: 'captured',
          amountMicros: 308_000,
          currency: 'INR',
          balanceAfterMicros: 99_692_000,
          breakdown: {
            aiMicros: 308_000,
            inputTokens: 1500,
            outputTokens: 40,
            embeddingTokens: 12,
            model: 'gpt-4.1-mini',
            kind: 'playground',
          },
          ref: { type: 'usage', id: 's1' },
          holdId: null,
          description: 'AI usage',
          note: null,
          createdBy: null,
          releasedAt: null,
          releaseReason: null,
          createdAt: '2026-10-09T06:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('AI playground turn')).toBeInTheDocument();
    expect(screen.getByText('gpt-4.1-mini')).toBeInTheDocument();
    expect(screen.getByText('1,500 in · 40 out')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
