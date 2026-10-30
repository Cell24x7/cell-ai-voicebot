import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminApi } from '@/services/api/admin';
import { adminBillingApi } from '@/services/api/admin-billing';
import { ApiError } from '@/services/api/errors';
import type {
  AccountRateCards,
  AdminAccountDetail,
  BillingSummary,
  LedgerEntry,
  RateCardVersion,
  Wallet,
} from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeRetention } from '@/test/retention';

vi.mock('@/services/api/admin', () => ({
  adminApi: { account: vi.fn(), accounts: vi.fn() },
}));
vi.mock('@/services/api/admin-billing', () => ({
  adminBillingApi: {
    config: vi.fn(),
    defaultRateCard: vi.fn(),
    setDefaultRateCard: vi.fn(),
    defaultRateCardHistory: vi.fn(),
    accountRateCards: vi.fn(),
    setAccountRateCard: vi.fn(),
    accountRateCardToDefault: vi.fn(),
    wallet: vi.fn(),
    setCreditLimit: vi.fn(),
    ledger: vi.fn(),
    adjust: vi.fn(),
    startSimulatedCall: vi.fn(),
    endSimulatedCall: vi.fn(),
    summary: vi.fn(),
    payments: vi.fn(),
    paymentEvents: vi.fn(),
  },
}));
vi.mock('@/services/api/admin-ai', () => ({
  adminAiApi: {
    config: vi.fn(() =>
      Promise.resolve({
        provider: 'fake',
        textModels: ['gpt-4.1-mini'],
        defaultTextModel: 'gpt-4.1-mini',
        embeddingModel: 'text-embedding-3-small',
        mockApisEnabled: true,
        allowPrivateHosts: true,
        openaiKeyConfigured: false,
        voice: {
          provider: 'fake',
          pipeline: 'chat',
          realtimeModel: 'gpt-realtime-2.1-mini',
          ttsModel: 'gpt-4o-mini-tts',
          transcribeModel: 'gpt-4o-mini-transcribe',
          textInputEnabled: true,
        },
      }),
    ),
  },
}));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const admin = vi.mocked(adminApi);
const api = vi.mocked(adminBillingApi);
const R = 1_000_000;
const httpError = (status: number, code: string, message = 'Server said no') =>
  new ApiError({ status, code, message, kind: 'http' });

const base = fakeSession('owner');
const DETAIL: AdminAccountDetail = {
  account: { ...base.account, id: 'acc1', name: 'Demo Finance' },
  owner: base.user as AdminAccountDetail['owner'],
  usersCount: 3,
  usersByStatus: { active: 3, invited: 0, disabled: 0 },
  retention: fakeRetention(),
  limits: { maxConcurrentCalls: 10, dialsPerMinute: 60 },
  activeCampaigns: 0,
  adminPausedCampaigns: [],
  whatsappBilling: {
    metaPayer: 'platform',
    markupBps: null,
    fixedPrices: null,
    platformFeeMicros: null,
  },
  whatsappChannels: [],
  recentAudit: [],
};
const CARD = {
  callPerMinuteMicros: R,
  pulseSeconds: 60 as const,
  aiPerMinuteMicros: 6 * R,
  ttsPer1kCharsMicros: 2_500_000,
  commissionBps: 0,
  billUnansweredAttempts: false,
  aiTextPer1kTokensMicros: 200_000,
  embeddingPer1kTokensMicros: 10_000,
  sttPerMinuteMicros: 500_000,
};
const VERSION = (overrides: Partial<RateCardVersion> = {}): RateCardVersion => ({
  id: 'rc1',
  accountId: 'acc1',
  ...CARD,
  inheritsDefault: false,
  effectiveFrom: '2026-10-05T06:30:00Z',
  createdBy: 'sa',
  note: 'Pilot pricing',
  createdAt: '2026-10-05T06:30:00Z',
  ...overrides,
});
const CARDS = (source: 'account' | 'default' = 'account'): AccountRateCards => ({
  effective: {
    id: 'rc1',
    source,
    ...CARD,
    callPerMinuteMicros: source === 'account' ? 2 * R : R,
    effectiveFrom: '2026-10-05T06:30:00Z',
  },
  history: source === 'account' ? [VERSION({ callPerMinuteMicros: 2 * R })] : [],
});
const WALLET = (overrides: Partial<Wallet> = {}): Wallet => ({
  currency: 'INR',
  balanceMicros: 1000 * R,
  holdMicros: 0,
  availableMicros: 1000 * R,
  creditLimitMicros: 0,
  status: 'ok',
  lowBalanceThresholdMicros: 0,
  budgets: { monthlyCallMicros: 0, monthlyAiMicros: 0, monthlyWhatsappMicros: 0 },
  monthSpend: {
    month: '2026-10',
    callMicros: 0,
    aiMicros: 0,
    ttsMicros: 0,
    whatsappMicros: 0,
    totalMicros: 0,
  },
  updatedAt: '2026-10-09T00:00:00Z',
  ...overrides,
});
const ENTRY = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'l1',
  type: 'adjustment',
  direction: 'credit',
  status: 'captured',
  amountMicros: 250 * R,
  currency: 'INR',
  balanceAfterMicros: 1250 * R,
  breakdown: null,
  ref: { type: 'manual', id: 'x' },
  holdId: null,
  description: 'Adjustment: Goodwill',
  note: 'Goodwill',
  createdBy: { id: 'sa', name: 'Root' },
  releasedAt: null,
  releaseReason: null,
  createdAt: '2026-10-09T06:30:00Z',
  ...overrides,
});

beforeEach(() => {
  admin.account.mockResolvedValue(DETAIL);
  api.config.mockResolvedValue({ simulatorEnabled: true, paymentProvider: 'fake' });
  api.accountRateCards.mockResolvedValue(CARDS());
  api.wallet.mockResolvedValue(WALLET());
  api.ledger.mockResolvedValue({
    success: true,
    data: [ENTRY()],
    meta: { hasMore: false, nextCursor: null },
  });
});
afterEach(() => vi.clearAllMocks());

describe('account rates tab', () => {
  it('shows the override and its history, edits prices in micros / bps', async () => {
    signInAs('superadmin');
    api.setAccountRateCard
      .mockRejectedValueOnce(httpError(422, 'VALIDATION_FAILED', 'Too expensive'))
      .mockResolvedValue(CARDS());
    renderWithProviders({ route: '/admin/accounts/acc1?tab=rates' });
    expect(await screen.findByText('Account override')).toBeInTheDocument();
    expect(screen.getByText('₹2.00 / min')).toBeInTheDocument();
    const history = screen.getByRole('table', { name: 'Rate history' });
    expect(within(history).getByText('Pilot pricing')).toBeInTheDocument();
    expect(within(history).getByText('AI text / 1k tok')).toBeInTheDocument();
    expect(within(history).getAllByText('₹0.20').length).toBeGreaterThan(0);
    expect(screen.getByText('₹0.01 / 1k tokens')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit rates' }));
    const dialog = await screen.findByRole('dialog', { name: 'Prices for Demo Finance' });
    const call = within(dialog).getByLabelText('Call (₹ per minute)');
    expect(call).toHaveValue('2');
    await userEvent.clear(call);
    await userEvent.type(call, '2.50');
    const commission = within(dialog).getByLabelText('Platform commission (%)');
    await userEvent.clear(commission);
    await userEvent.type(commission, '101');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save new rates' }));
    expect(
      within(dialog).getByText('A percent from 0 to 100, at most 2 decimals'),
    ).toBeInTheDocument();
    await userEvent.clear(commission);
    await userEvent.type(commission, '10');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Billing pulse' }));
    await userEvent.click(await screen.findByRole('option', { name: '30 seconds' }));
    await userEvent.click(
      within(dialog).getByRole('switch', { name: 'Bill unanswered call attempts' }),
    );
    const aiText = within(dialog).getByLabelText('AI text (₹ per 1,000 tokens)');
    expect(aiText).toHaveValue('0.20');
    await userEvent.clear(aiText);
    await userEvent.type(aiText, '1001');
    expect(within(dialog).getByText('Maximum is ₹1,000')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save new rates' })).toBeDisabled();
    await userEvent.clear(aiText);
    await userEvent.type(aiText, '0.25');
    expect(within(dialog).getByLabelText('Embeddings (₹ per 1,000 tokens)')).toHaveValue('0.01');
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'Festive offer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save new rates' }));
    expect(await within(dialog).findByText('Too expensive')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save new rates' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.setAccountRateCard).toHaveBeenLastCalledWith('acc1', {
      callPerMinuteMicros: 2_500_000,
      pulseSeconds: 30,
      aiPerMinuteMicros: 6 * R,
      ttsPer1kCharsMicros: 2_500_000,
      commissionBps: 1000,
      billUnansweredAttempts: true,
      aiTextPer1kTokensMicros: 250_000,
      embeddingPer1kTokensMicros: 10_000,
      sttPerMinuteMicros: 500_000,
      note: 'Festive offer',
    });
    expect(await screen.findByText('New prices saved for Demo Finance')).toBeInTheDocument();
  });

  it('validates rupee fields and a too-short note', async () => {
    signInAs('superadmin');
    renderWithProviders({ route: '/admin/accounts/acc1?tab=rates' });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit rates' }));
    const dialog = await screen.findByRole('dialog');
    for (const label of [
      'Call (₹ per minute)',
      'AI (₹ per minute)',
      'Voice / TTS (₹ per 1,000 characters)',
    ]) {
      await userEvent.clear(within(dialog).getByLabelText(label));
      await userEvent.type(within(dialog).getByLabelText(label), 'x');
    }
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'ab');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save new rates' }));
    expect(within(dialog).getAllByText('Enter an amount like 1,500 or 1500.50')).toHaveLength(3);
    expect(within(dialog).getByText('At least 3 characters')).toBeInTheDocument();
    expect(api.setAccountRateCard).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('goes back to the platform default after confirming; disabled when already default', async () => {
    signInAs('superadmin');
    api.accountRateCardToDefault.mockResolvedValue(CARDS('default'));
    renderWithProviders({ route: '/admin/accounts/acc1?tab=rates' });
    await userEvent.click(await screen.findByRole('button', { name: 'Use platform default' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use default' }));
    await waitFor(() => expect(api.accountRateCardToDefault).toHaveBeenCalledWith('acc1'));
    expect(await screen.findByText('Platform default')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Use platform default' })).toBeDisabled();
    expect(screen.getByText('No changes yet')).toBeInTheDocument();
  });

  it('shows load and save errors', async () => {
    signInAs('superadmin');
    api.accountRateCards.mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Cards down'));
    api.accountRateCardToDefault.mockRejectedValue(
      httpError(409, 'CONFLICT_INVALID_STATE', 'Already default'),
    );
    renderWithProviders({ route: '/admin/accounts/acc1?tab=rates' });
    expect(await screen.findByText('Cards down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use platform default' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use default' }));
    expect(await screen.findByText('Already default')).toBeInTheDocument();
  });
});

describe('account wallet tab', () => {
  it('credits with a confirm text and keeps the same Idempotency-Key on a retry', async () => {
    signInAs('superadmin');
    api.adjust
      .mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Try again'))
      .mockResolvedValue({ entry: ENTRY(), wallet: WALLET({ balanceMicros: 1250 * R }) });
    renderWithProviders({ route: '/admin/accounts/acc1?tab=wallet' });
    expect(await screen.findAllByText('₹1,000.00', { selector: 'h6' })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Adjust balance' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust wallet' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    expect(within(dialog).getByText('Enter an amount')).toBeInTheDocument();
    expect(within(dialog).getByText(/At least 5 characters/)).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText('Allow the balance to go below zero'),
    ).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Amount (₹)'), '250');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Goodwill');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    expect(within(dialog).getByText('Add ₹250.00 to Demo Finance’s wallet?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add money' }));
    expect(await within(dialog).findByText('Try again')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add money' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [first, second] = api.adjust.mock.calls;
    expect(first?.[1]).toEqual({ direction: 'credit', amountMicros: 250 * R, reason: 'Goodwill' });
    expect(first?.[2]).toBe(second?.[2]);
    expect(await screen.findByText('Added ₹250.00')).toBeInTheDocument();
  });

  it('debits below zero only when allowed, with a warning', async () => {
    signInAs('superadmin');
    api.adjust.mockResolvedValue({
      entry: ENTRY({ direction: 'debit', amountMicros: 1200 * R }),
      wallet: WALLET({ balanceMicros: -200 * R }),
    });
    renderWithProviders({ route: '/admin/accounts/acc1?tab=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust balance' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust wallet' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Debit (deduct)' }));
    await userEvent.type(within(dialog).getByLabelText('Amount (₹)'), '1,200');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Chargeback');
    await userEvent.click(within(dialog).getByLabelText('Allow the balance to go below zero'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    expect(
      within(dialog).getByText('Deduct ₹1,200.00 from Demo Finance’s wallet?'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('The balance may go below zero.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deduct money' }));
    await waitFor(() =>
      expect(api.adjust).toHaveBeenCalledWith(
        'acc1',
        { direction: 'debit', amountMicros: 1200 * R, reason: 'Chargeback', allowNegative: true },
        expect.any(String),
      ),
    );
    expect(await screen.findByText('Deducted ₹1,200.00')).toBeInTheDocument();
  });

  it('sets the credit limit', async () => {
    signInAs('superadmin');
    api.setCreditLimit
      .mockRejectedValueOnce(httpError(422, 'VALIDATION_FAILED', 'Too high'))
      .mockResolvedValue(WALLET({ creditLimitMicros: 500 * R }));
    renderWithProviders({ route: '/admin/accounts/acc1?tab=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: 'Credit limit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Credit limit' });
    const input = within(dialog).getByLabelText('Credit limit (₹)');
    await userEvent.type(input, '2,00,000');
    expect(within(dialog).getByText('Maximum is ₹1,00,000')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, '500');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Too high')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.setCreditLimit).toHaveBeenLastCalledWith('acc1', 500 * R));
    expect(await screen.findByText('Credit limit saved')).toBeInTheDocument();
  });

  it('runs a simulated call: hold, end answered, charged', async () => {
    signInAs('superadmin');
    api.startSimulatedCall.mockResolvedValue({
      holdId: 'h1',
      heldMicros: 21 * R,
      rateCard: CARDS().effective,
      wallet: WALLET({ holdMicros: 21 * R }),
    });
    api.endSimulatedCall.mockResolvedValue({
      outcome: 'charged',
      entries: [
        ENTRY({
          id: 'c1',
          type: 'call_charge',
          direction: 'debit',
          amountMicros: 2 * R,
          description: 'Call charge',
        }),
      ],
      wallet: WALLET({ balanceMicros: 998 * R }),
    });
    renderWithProviders({ route: '/admin/accounts/acc1?tab=wallet' });
    const minutes = await screen.findByLabelText('Hold for (minutes)');
    await userEvent.type(minutes, '99');
    expect(screen.getByText('1–60 minutes')).toBeInTheDocument();
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Start simulated call' }));
    expect(api.startSimulatedCall).toHaveBeenCalledWith('acc1', 2);
    expect(
      await screen.findByText(/₹21\.00 on hold \(prices: account override\)/),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('AI seconds'), 'x');
    expect(screen.getByRole('button', { name: 'End call' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('AI seconds'));
    await userEvent.type(screen.getByLabelText('AI seconds'), '80');
    await userEvent.type(screen.getByLabelText('TTS characters'), '900');
    await userEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(api.endSimulatedCall).toHaveBeenCalledWith('acc1', 'h1', {
      answered: true,
      durationSec: 90,
      aiSeconds: 80,
      ttsChars: 900,
    });
    expect(await screen.findByText('Call charged. Balance now ₹998.00.')).toBeInTheDocument();
    expect(screen.getAllByText('−₹2.00').length).toBeGreaterThan(0);
    await waitFor(() => expect(api.wallet).toHaveBeenCalledTimes(3));
  });

  it('releases an unanswered call and shows start errors', async () => {
    signInAs('superadmin');
    api.startSimulatedCall
      .mockRejectedValueOnce(
        httpError(422, 'WALLET_INSUFFICIENT_BALANCE', 'Insufficient wallet balance.'),
      )
      .mockResolvedValue({
        holdId: 'h2',
        heldMicros: 21 * R,
        rateCard: CARDS('default').effective,
        wallet: WALLET(),
      });
    api.endSimulatedCall.mockResolvedValue({ outcome: 'released', entries: [], wallet: WALLET() });
    renderWithProviders({ route: '/admin/accounts/acc1?tab=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: 'Start simulated call' }));
    expect(await screen.findByText('Insufficient wallet balance.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start simulated call' }));
    expect(await screen.findByText(/prices: platform default/)).toBeInTheDocument();
    expect(api.startSimulatedCall).toHaveBeenLastCalledWith('acc1', undefined);
    await userEvent.click(screen.getByRole('switch', { name: 'Answered' }));
    await userEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(
      await screen.findByText('Not billable — the whole hold was released.'),
    ).toBeInTheDocument();
    expect(api.endSimulatedCall).toHaveBeenCalledWith('acc1', 'h2', {
      answered: false,
      durationSec: 90,
    });
  });

  it('hides the simulator when the server has it off; ledger details and errors', async () => {
    signInAs('superadmin');
    api.config.mockResolvedValue({ simulatorEnabled: false, paymentProvider: 'razorpay' });
    api.wallet.mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Wallet down'));
    renderWithProviders({ route: '/admin/accounts/acc1?tab=wallet' });
    expect(await screen.findByText('Wallet down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Details of Adjustment: Goodwill' }),
    );
    expect(await screen.findByText('Root')).toBeInTheDocument();
    expect(screen.queryByText('Billing simulator')).not.toBeInTheDocument();
  });
});

const SUMMARY: BillingSummary = {
  month: '2026-10',
  from: '2026-09-30T18:30:00.000Z',
  to: '2026-10-31T18:30:00.000Z',
  ai: {
    playgroundTurns: 12,
    kbIngests: 3,
    inputTokens: 18_000,
    outputTokens: 900,
    embeddingTokens: 4_200,
  },
  topups: {
    count: 3,
    baseMicros: 1500 * R,
    cgstMicros: 90 * R,
    sgstMicros: 90 * R,
    igstMicros: 90 * R,
    taxMicros: 270 * R,
    totalMicros: 1770 * R,
  },
  usage: { byType: [{ type: 'call_charge', amountMicros: 81 * R }], totalMicros: 81 * R },
  adjustments: { creditMicros: 100 * R, debitMicros: 7 * R },
  topAccounts: [{ accountId: 'acc1', name: 'Demo Finance', spendMicros: 81 * R }],
  wallets: { total: 5, low: 1, exhausted: 2 },
  openReconcileMismatches: 0,
  paymentEventsNeedingAttention: 2,
};

describe('/admin/billing — AI', () => {
  beforeEach(() => {
    api.summary.mockResolvedValue(SUMMARY);
    api.payments.mockResolvedValue({
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    api.paymentEvents.mockResolvedValue({
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    api.defaultRateCard.mockResolvedValue(VERSION({ accountId: null }));
    api.defaultRateCardHistory.mockResolvedValue([]);
  });

  it('shows the AI usage of the month and the AI configuration', async () => {
    signInAs('superadmin');
    renderWithProviders({ route: '/admin/billing' });
    expect(await screen.findByText('12 turns · 3 ingests')).toBeInTheDocument();
    expect(
      screen.getByText('18,000 in + 900 out tokens · 4,200 embedding tokens'),
    ).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'AI configuration' });
    expect(within(card).getByText('Provider: fake (test mode)')).toBeInTheDocument();
    expect(within(card).getByText('No OpenAI key')).toBeInTheDocument();
    expect(within(card).getByText('Mock APIs on (dev)')).toBeInTheDocument();
    expect(within(card).getByText('Private hosts allowed (dev)')).toBeInTheDocument();
    expect(
      within(card).getByText(/Text models: gpt-4\.1-mini \(default gpt-4\.1-mini\)/),
    ).toBeInTheDocument();
  });

  it('shows the production AI setup and load errors', async () => {
    signInAs('superadmin');
    const ai = vi.mocked((await import('@/services/api/admin-ai')).adminAiApi);
    ai.config.mockResolvedValueOnce({
      provider: 'openai',
      textModels: ['gpt-4.1-mini', 'gpt-4.1'],
      defaultTextModel: 'gpt-4.1-mini',
      embeddingModel: 'text-embedding-3-small',
      mockApisEnabled: false,
      allowPrivateHosts: false,
      openaiKeyConfigured: true,
      voice: {
        provider: 'openai',
        pipeline: 'realtime',
        realtimeModel: 'gpt-realtime-2.1-mini',
        ttsModel: 'gpt-4o-mini-tts',
        transcribeModel: 'gpt-4o-mini-transcribe',
        textInputEnabled: false,
      },
    });
    const { unmount } = renderWithProviders({ route: '/admin/billing' });
    const card = await screen.findByRole('region', { name: 'AI configuration' });
    expect(await within(card).findByText('Provider: OpenAI')).toBeInTheDocument();
    expect(within(card).getByText('OpenAI key set')).toBeInTheDocument();
    expect(within(card).getByText('Mock APIs off')).toBeInTheDocument();
    expect(within(card).getByText('Private hosts blocked')).toBeInTheDocument();
    expect(within(card).getByText('Voice: OpenAI Realtime')).toBeInTheDocument();
    expect(within(card).getByText('Typed call input off')).toBeInTheDocument();
    expect(within(card).getByText(/Voice models: gpt-realtime-2.1-mini/)).toBeInTheDocument();
    unmount();
    ai.config.mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Config down'));
    renderWithProviders({ route: '/admin/billing' });
    const failed = await screen.findByRole('region', { name: 'AI configuration' });
    expect(await within(failed).findByText('Config down')).toBeInTheDocument();
    await userEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    expect(await within(failed).findByText('Provider: fake (test mode)')).toBeInTheDocument();
    expect(within(failed).getByText('Voice: fake (test mode)')).toBeInTheDocument();
  });
});

describe('/admin/billing', () => {
  beforeEach(() => {
    api.summary.mockResolvedValue(SUMMARY);
    api.payments.mockResolvedValue({
      success: true,
      data: [
        {
          id: 't1',
          provider: 'fake',
          providerOrderId: 'order_1',
          status: 'paid',
          baseMicros: 1000 * R,
          cgstMicros: 90 * R,
          sgstMicros: 90 * R,
          igstMicros: 0,
          taxMicros: 180 * R,
          totalMicros: 1180 * R,
          currency: 'INR',
          failureReason: null,
          paidAt: '2026-10-09T06:00:00Z',
          invoiceId: 'i1',
          createdAt: '2026-10-09T06:00:00Z',
          accountId: 'acc1',
          accountName: 'Demo Finance',
          providerPaymentId: 'pay_1',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    api.paymentEvents.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'e1',
          provider: 'razorpay',
          eventId: 'evt_1',
          type: 'payment.captured',
          accountId: null,
          topupOrderId: null,
          providerOrderId: 'order_x',
          providerPaymentId: 'pay_x',
          outcome: 'unmatched',
          receivedAt: '2026-10-09T06:00:00Z',
          processedAt: null,
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    api.defaultRateCard.mockResolvedValue(VERSION({ accountId: null, note: null }));
    api.defaultRateCardHistory.mockResolvedValue([
      VERSION({ accountId: null, note: 'Launch prices' }),
    ]);
  });

  it('summarises the month and filters payments and events', async () => {
    signInAs('superadmin');
    renderWithProviders({ route: '/admin/billing' });
    expect(await screen.findByText('Recharges (3)')).toBeInTheDocument();
    expect(screen.getByText('₹270.00')).toBeInTheDocument();
    expect(screen.getByText('CGST ₹90.00 · SGST ₹90.00 · IGST ₹90.00')).toBeInTheDocument();
    expect(screen.getByText('Call charge ₹81.00')).toBeInTheDocument();
    expect(screen.getByText('+₹100.00 / −₹7.00')).toBeInTheDocument();
    expect(screen.getByText('1 low · 2 exhausted (right now)')).toBeInTheDocument();
    expect(screen.getByText('All wallets match their ledger')).toBeInTheDocument();
    const top = screen.getByRole('table', { name: 'Top accounts' });
    expect(within(top).getByRole('link', { name: 'Demo Finance' })).toHaveAttribute(
      'href',
      '/admin/accounts/acc1?tab=wallet',
    );
    const payments = await screen.findByRole('table', { name: 'Payments' });
    expect(within(payments).getByText('pay_1')).toBeInTheDocument();
    expect(api.paymentEvents).toHaveBeenCalledWith({ page: 1, limit: 20, outcome: 'unmatched' });
    const events = await screen.findByRole('table', { name: 'Payment events' });
    expect(await within(events).findByText('Unknown order')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Failed' }));
    await waitFor(() =>
      expect(api.payments).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'failed' }),
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Outcome' }));
    await userEvent.click(await screen.findByRole('option', { name: 'All' }));
    await waitFor(() => expect(api.paymentEvents).toHaveBeenLastCalledWith({ page: 1, limit: 20 }));

    const month = screen.getByLabelText('Month');
    await userEvent.clear(month);
    expect(screen.getByText('Choose a month')).toBeInTheDocument();
    await userEvent.type(month, '2026-09');
    await waitFor(() => expect(api.summary).toHaveBeenLastCalledWith('2026-09'));
  });

  it('shows single-kind GST, open reconcile notices and a summary error', async () => {
    signInAs('superadmin');
    api.summary
      .mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Summary down'))
      .mockResolvedValue({
        ...SUMMARY,
        topups: { ...SUMMARY.topups, cgstMicros: 0, sgstMicros: 0 },
        usage: { byType: [], totalMicros: 0 },
        openReconcileMismatches: 1,
      });
    renderWithProviders({ route: '/admin/billing' });
    expect(await screen.findByText('Summary down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('IGST ₹90.00')).toBeInTheDocument();
    expect(screen.getByText('No usage')).toBeInTheDocument();
    expect(screen.getByText(/Wallet ≠ ledger/)).toBeInTheDocument();
  });

  it('edits the platform default prices', async () => {
    signInAs('superadmin');
    api.setDefaultRateCard.mockResolvedValue(
      VERSION({ accountId: null, callPerMinuteMicros: 1_200_000 }),
    );
    renderWithProviders({ route: '/admin/billing' });
    expect(await screen.findByText('Launch prices')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit default rates' }));
    const dialog = await screen.findByRole('dialog', { name: 'Platform default prices' });
    const call = within(dialog).getByLabelText('Call (₹ per minute)');
    await userEvent.clear(call);
    await userEvent.type(call, '1.20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save new rates' }));
    await waitFor(() =>
      expect(api.setDefaultRateCard).toHaveBeenCalledWith({
        ...CARD,
        callPerMinuteMicros: 1_200_000,
        note: null,
      }),
    );
    expect(await screen.findByText('Platform default prices saved')).toBeInTheDocument();
  });

  it('is never shown to customers', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/admin/billing' });
    expect(await screen.findByRole('heading', { level: 1, name: '403' })).toBeInTheDocument();
    expect(api.summary).not.toHaveBeenCalled();
  });
});
