import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { billingApi } from '@/services/api/billing';
import { ApiError } from '@/services/api/errors';
import type {
  BillingProfile,
  BillingProfileResponse,
  RateCardView,
  TopupCheckout,
  TopupOrder,
  Wallet,
} from '@/services/api/types';
import { walletApi } from '@/services/api/wallet';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import type { RazorpayOptions } from '@/types/razorpay';

import { loadRazorpayCheckout, RAZORPAY_CHECKOUT_URL, resetRazorpayLoader } from './razorpay';

vi.mock('@/services/api/wallet', () => ({
  walletApi: {
    get: vi.fn(),
    rates: vi.fn(),
    updateSettings: vi.fn(),
    createTopup: vi.fn(),
    topup: vi.fn(),
    fakeComplete: vi.fn(),
    verifyTopup: vi.fn(),
  },
}));
vi.mock('@/services/api/billing', () => ({
  billingApi: { profile: vi.fn(), saveProfile: vi.fn(), states: vi.fn() },
}));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const wallet = vi.mocked(walletApi);
const billing = vi.mocked(billingApi);
const R = 1_000_000;
const httpError = (status: number, code: string, message = 'Server said no') =>
  new ApiError({ status, code, message, kind: 'http' });

const WALLET = (overrides: Partial<Wallet> = {}): Wallet => ({
  currency: 'INR',
  balanceMicros: 1500 * R,
  holdMicros: 21 * R,
  availableMicros: 1479 * R,
  creditLimitMicros: 0,
  status: 'ok',
  lowBalanceThresholdMicros: 500 * R,
  budgets: { monthlyCallMicros: 1000 * R, monthlyAiMicros: 0, monthlyWhatsappMicros: 0 },
  monthSpend: {
    month: '2026-10',
    callMicros: 850 * R,
    aiMicros: 12 * R,
    ttsMicros: 3 * R,
    whatsappMicros: 0,
    totalMicros: 865 * R,
  },
  updatedAt: '2026-10-09T00:00:00Z',
  ...overrides,
});
const RATES: RateCardView = {
  callPerMinuteMicros: R,
  pulseSeconds: 60,
  aiPerMinuteMicros: 6 * R,
  ttsPer1kCharsMicros: 2_500_000,
  commissionBps: 250,
  aiTextPer1kTokensMicros: 200_000,
  embeddingPer1kTokensMicros: 10_000,
  billUnansweredAttempts: false,
  source: 'default',
  effectiveFrom: '2026-10-01T00:00:00Z',
  whatsapp: { payer: 'platform', effectiveFrom: '2026-10-01T00:00:00Z', markets: [] },
  whatsappCalling: { payer: 'platform', pulseSec: 6, markets: [] },
};
const PROFILE: BillingProfile = {
  legalName: 'Demo Finance Pvt Ltd',
  email: 'billing@demo.example',
  addressLine1: '12 MI Road',
  addressLine2: null,
  city: 'Jaipur',
  stateCode: '08',
  pin: '302001',
  gstin: null,
  updatedAt: '2026-10-09T00:00:00Z',
};
const profileResponse = (p: BillingProfile | null, seller = '08'): BillingProfileResponse => ({
  profile: p,
  complete: Boolean(p),
  sellerStateCode: seller,
});
const ORDER = (overrides: Partial<TopupOrder> = {}): TopupOrder => ({
  id: 't1',
  provider: 'fake',
  providerOrderId: 'order_1',
  status: 'created',
  baseMicros: 1000 * R,
  cgstMicros: 90 * R,
  sgstMicros: 90 * R,
  igstMicros: 0,
  taxMicros: 180 * R,
  totalMicros: 1180 * R,
  currency: 'INR',
  failureReason: null,
  paidAt: null,
  invoiceId: null,
  createdAt: '2026-10-09T00:00:00Z',
  ...overrides,
});
const CHECKOUT = (provider: 'fake' | 'razorpay' = 'fake'): TopupCheckout => ({
  topupOrder: ORDER({ provider }),
  checkout: {
    provider,
    keyId: provider === 'razorpay' ? 'rzp_test_public' : null,
    providerOrderId: 'order_1',
    amountPaise: 118_000,
    currency: 'INR',
    name: 'Cell AI Voicebot',
    description: 'Wallet recharge',
    prefill: { name: PROFILE.legalName, email: PROFILE.email },
  },
});

beforeEach(() => {
  wallet.get.mockResolvedValue(WALLET());
  wallet.rates.mockResolvedValue(RATES);
  billing.profile.mockResolvedValue(profileResponse(PROFILE));
  billing.states.mockResolvedValue([
    { code: '08', name: 'Rajasthan' },
    { code: '27', name: 'Maharashtra' },
  ]);
});
afterEach(() => {
  vi.clearAllMocks();
  delete window.Razorpay;
  resetRazorpayLoader();
  document.head
    .querySelectorAll(`script[src="${RAZORPAY_CHECKOUT_URL}"]`)
    .forEach((s) => s.remove());
});

const openAddMoney = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Add money' }));
  return screen.findByRole('dialog', { name: 'Add money' });
};

describe('wallet overview', () => {
  it('shows balances, status, budgets and prices', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/wallet' });
    expect(await screen.findByText('₹1,500.00')).toBeInTheDocument();
    expect(screen.getByText('₹21.00')).toBeInTheDocument();
    expect(screen.getByText('₹1,479.00')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('₹865.00')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Calls: 85% of the monthly budget used' }),
    ).toBeInTheDocument();
    expect(screen.getByText('₹15.00 · no budget')).toBeInTheDocument();
    expect(screen.getByText('below ₹500.00', { exact: false })).toBeInTheDocument();
    const prices = await screen.findByRole('table', { name: 'Your prices' });
    expect(within(prices).getByText('₹1.00 / minute')).toBeInTheDocument();
    expect(within(prices).getByText('60 seconds')).toBeInTheDocument();
    expect(within(prices).getByText('₹2.50 / 1,000 characters')).toBeInTheDocument();
    expect(within(prices).getByText('₹0.20 / 1,000 tokens')).toBeInTheDocument();
    expect(within(prices).getByText('Knowledge processing')).toBeInTheDocument();
    expect(within(prices).getByText('2.5%')).toBeInTheDocument();
    expect(within(prices).getByText('Free')).toBeInTheDocument();
  });

  it('shows the credit limit, low status, and budget colours past 100%', async () => {
    signInAs('owner');
    wallet.get.mockResolvedValue(
      WALLET({
        creditLimitMicros: 200 * R,
        status: 'low',
        lowBalanceThresholdMicros: 0,
        budgets: { monthlyCallMicros: 500 * R, monthlyAiMicros: 10 * R, monthlyWhatsappMicros: 0 },
      }),
    );
    wallet.rates.mockResolvedValue({ ...RATES, commissionBps: 0, billUnansweredAttempts: true });
    renderWithProviders({ route: '/wallet' });
    expect(await screen.findByText(/incl\. ₹200\.00 credit limit/)).toBeInTheDocument();
    expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('progressbar', { name: 'Calls: 100% of the monthly budget used' }),
    ).toBeInTheDocument();
    expect(screen.getByText('off', { exact: false })).toBeInTheDocument();
    expect(await screen.findByText('Billed')).toBeInTheDocument();
    expect(screen.queryByText('Platform commission')).not.toBeInTheDocument();
  });

  it('retries after an error and shows a rates error', async () => {
    signInAs('viewer');
    wallet.get.mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Wallet down'));
    wallet.rates.mockRejectedValue(httpError(500, 'INTERNAL_ERROR', 'Rates down'));
    renderWithProviders({ route: '/wallet' });
    expect(await screen.findByText('Wallet down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Rates down')).toBeInTheDocument();
  });

  it('hides Add money and settings from managers and impersonators', async () => {
    signInAs('manager');
    const view = renderWithProviders({ route: '/wallet?add=1' });
    await screen.findByText('₹1,500.00');
    expect(screen.queryByRole('button', { name: 'Add money' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alerts & budgets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-09T01:00:00Z' },
    });
    renderWithProviders({ route: '/wallet' });
    await screen.findByText('₹1,500.00');
    expect(screen.queryByRole('button', { name: 'Add money' })).not.toBeInTheDocument();
  });

  it('saves alerts and budgets in micros and validates rupees', async () => {
    signInAs('owner');
    wallet.updateSettings.mockResolvedValue(WALLET({ lowBalanceThresholdMicros: 750 * R }));
    renderWithProviders({ route: '/wallet' });
    await userEvent.click(await screen.findByRole('button', { name: 'Alerts & budgets' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wallet settings' });
    const threshold = within(dialog).getByLabelText('Low-balance alert below (₹)');
    expect(threshold).toHaveValue('500');
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '7,50.5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter an amount like 1,500 or 1500.50')).toBeInTheDocument();
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '750');
    await userEvent.clear(within(dialog).getByLabelText('Monthly call budget (₹)'));
    await userEvent.type(within(dialog).getByLabelText('Monthly AI budget (₹)'), '2,000.25');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(wallet.updateSettings).toHaveBeenCalledWith({
        lowBalanceThresholdMicros: 750 * R,
        budgets: {
          monthlyCallMicros: 0,
          monthlyAiMicros: 2000 * R + 250_000,
          monthlyWhatsappMicros: 0,
        },
      }),
    );
    expect(await screen.findByText('Wallet settings saved')).toBeInTheDocument();
  });

  it('shows a server error when saving settings fails, and cancels', async () => {
    signInAs('owner');
    wallet.updateSettings.mockRejectedValue(
      httpError(422, 'VALIDATION_FAILED', 'Nothing to update'),
    );
    renderWithProviders({ route: '/wallet' });
    await userEvent.click(await screen.findByRole('button', { name: 'Alerts & budgets' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wallet settings' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Nothing to update')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('add money', () => {
  it('validates the amount and previews CGST + SGST within the seller state', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/wallet' });
    const dialog = await openAddMoney();
    expect(within(dialog).getByRole('button', { name: '₹1,000' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const custom = within(dialog).getByLabelText('Or enter an amount (₹)');
    await userEvent.type(custom, '99');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(within(dialog).getByText('Minimum is ₹100')).toBeInTheDocument();
    await userEvent.clear(custom);
    await userEvent.type(custom, '150.50');
    expect(within(dialog).getByText('Whole rupees only')).toBeInTheDocument();
    await userEvent.clear(custom);
    await userEvent.type(custom, '6,00,000');
    expect(within(dialog).getByText('Maximum is ₹5,00,000')).toBeInTheDocument();
    await userEvent.clear(custom);
    await userEvent.click(within(dialog).getByRole('button', { name: '₹2,000' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(within(dialog).getByText('CGST (9%)')).toBeInTheDocument();
    expect(within(dialog).getAllByText('₹180.00')).toHaveLength(2);
    expect(within(dialog).getByText('₹2,360.00')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Pay ₹2,360.00' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('uses IGST for another state', async () => {
    signInAs('owner');
    billing.profile.mockResolvedValue(profileResponse({ ...PROFILE, stateCode: '27' }));
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await within(dialog).findByText('IGST (18%)')).toBeInTheDocument();
    expect(within(dialog).getByText('₹180.00')).toBeInTheDocument();
    expect(within(dialog).queryByText('CGST (9%)')).not.toBeInTheDocument();
  });

  it('asks for billing details first when the profile is missing', async () => {
    signInAs('owner');
    billing.profile.mockResolvedValue(profileResponse(null));
    billing.saveProfile.mockResolvedValue(profileResponse(PROFILE));
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const form = await screen.findByRole('dialog', { name: 'Billing details' });
    await userEvent.click(within(form).getByRole('button', { name: 'Save and continue' }));
    expect(await within(form).findByText('Enter the legal name')).toBeInTheDocument();
    await userEvent.type(
      within(form).getByLabelText('Legal name (as on GST registration)'),
      PROFILE.legalName,
    );
    await userEvent.type(within(form).getByLabelText('Billing email'), PROFILE.email);
    await userEvent.type(within(form).getByLabelText('Address line 1'), PROFILE.addressLine1);
    await userEvent.type(within(form).getByLabelText('City'), 'जयपुर');
    await userEvent.click(within(form).getByRole('combobox', { name: 'State (place of supply)' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Rajasthan (08)' }));
    await userEvent.type(within(form).getByLabelText('PIN code'), '302001');
    await userEvent.click(within(form).getByRole('button', { name: 'Save and continue' }));
    expect(
      await within(form).findByText('Use English letters, as on your GST registration'),
    ).toBeInTheDocument();
    await userEvent.clear(within(form).getByLabelText('City'));
    await userEvent.type(within(form).getByLabelText('City'), 'Jaipur');
    await userEvent.click(within(form).getByRole('button', { name: 'Save and continue' }));
    await waitFor(() =>
      expect(billing.saveProfile).toHaveBeenCalledWith({
        legalName: PROFILE.legalName,
        email: PROFILE.email,
        addressLine1: PROFILE.addressLine1,
        addressLine2: null,
        city: 'Jaipur',
        stateCode: '08',
        pin: '302001',
        gstin: null,
      }),
    );
    expect(await screen.findByRole('button', { name: 'Pay ₹1,180.00' })).toBeInTheDocument();
  });

  it('pays with a test payment and shows the new balance', async () => {
    signInAs('owner');
    wallet.createTopup.mockResolvedValue(CHECKOUT('fake'));
    wallet.fakeComplete.mockResolvedValue(ORDER({ status: 'paid' }));
    wallet.topup.mockResolvedValue(ORDER({ status: 'paid', invoiceId: 'i1' }));
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    const test = await screen.findByRole('dialog', { name: 'Test payment' });
    expect(within(test).getByText(/Test mode — no real money/)).toBeInTheDocument();
    const [amount, key] = wallet.createTopup.mock.calls[0] ?? [];
    expect(amount).toBe(1000 * R);
    expect(key).toMatch(/^[0-9a-f-]{20,}$/);
    wallet.get.mockResolvedValue(WALLET({ balanceMicros: 2500 * R }));
    await userEvent.click(within(test).getByRole('button', { name: 'Pay (test)' }));
    expect(wallet.fakeComplete).toHaveBeenCalledWith('t1', 'paid');
    expect(await screen.findByText('₹1,000.00 added to your wallet.')).toBeInTheDocument();
    expect(await screen.findByText('₹2,500.00', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'see invoices' })).toHaveAttribute(
      'href',
      '/wallet?tab=invoices',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a failed test payment and starts again with a fresh key', async () => {
    signInAs('owner');
    wallet.createTopup.mockResolvedValue(CHECKOUT('fake'));
    wallet.fakeComplete.mockResolvedValue(ORDER({ status: 'failed' }));
    wallet.topup.mockResolvedValue(
      ORDER({ status: 'failed', failureReason: 'Test payment declined' }),
    );
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Fail payment' }));
    expect(await screen.findByText(/Payment failed: Test payment declined/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pay ₹1,180.00' }));
    await screen.findByRole('dialog', { name: 'Test payment' });
    const keys = wallet.createTopup.mock.calls.map((c) => c[1]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('explains rate limits and test-payment errors', async () => {
    signInAs('owner');
    wallet.createTopup.mockRejectedValueOnce(httpError(429, 'RATE_LIMITED'));
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    expect(await within(dialog).findByText(/Too many top-up attempts/)).toBeInTheDocument();
    wallet.createTopup.mockResolvedValue(CHECKOUT('fake'));
    wallet.fakeComplete.mockRejectedValue(
      httpError(409, 'CONFLICT_INVALID_STATE', 'This top-up can no longer be paid'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    const test = await screen.findByRole('dialog', { name: 'Test payment' });
    await userEvent.click(within(test).getByRole('button', { name: 'Pay (test)' }));
    expect(await within(test).findByText('This top-up can no longer be paid')).toBeInTheDocument();
  });

  it('opens Razorpay Checkout, verifies the payment and confirms it', async () => {
    signInAs('owner');
    let options: RazorpayOptions | undefined;
    const open = vi.fn();
    window.Razorpay = vi.fn(function (this: unknown, o: RazorpayOptions) {
      options = o;
      return { open, on: vi.fn() };
    });
    wallet.createTopup.mockResolvedValue(CHECKOUT('razorpay'));
    wallet.verifyTopup.mockResolvedValue(ORDER({ status: 'paid' }));
    wallet.topup.mockResolvedValueOnce(ORDER()).mockResolvedValue(ORDER({ status: 'paid' }));
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(options).toMatchObject({
      key: 'rzp_test_public',
      order_id: 'order_1',
      amount: 118_000,
      currency: 'INR',
      prefill: { email: PROFILE.email },
    });
    options?.handler({
      razorpay_payment_id: 'pay_1',
      razorpay_order_id: 'order_1',
      razorpay_signature: 'sig',
    });
    expect(await screen.findByText('Confirming payment…')).toBeInTheDocument();
    expect(wallet.verifyTopup).toHaveBeenCalledWith('t1', {
      providerPaymentId: 'pay_1',
      signature: 'sig',
    });
    expect(
      await screen.findByText('₹1,000.00 added to your wallet.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('tells the user when verification fails or the checkout is closed', async () => {
    signInAs('owner');
    let options: RazorpayOptions | undefined;
    window.Razorpay = vi.fn(function (this: unknown, o: RazorpayOptions) {
      options = o;
      return { open: vi.fn(), on: vi.fn() };
    });
    wallet.createTopup.mockResolvedValue(CHECKOUT('razorpay'));
    wallet.verifyTopup.mockRejectedValue(httpError(422, 'PAYMENT_VERIFICATION_FAILED'));
    wallet.topup.mockResolvedValue(ORDER());
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    await waitFor(() => expect(options).toBeDefined());
    options?.handler({
      razorpay_payment_id: 'pay_1',
      razorpay_order_id: 'order_1',
      razorpay_signature: 'bad',
    });
    expect(await screen.findByText(/We could not confirm this payment/)).toBeInTheDocument();
  });

  it('says nothing was charged when the checkout is dismissed', async () => {
    signInAs('owner');
    let options: RazorpayOptions | undefined;
    window.Razorpay = vi.fn(function (this: unknown, o: RazorpayOptions) {
      options = o;
      return { open: vi.fn(), on: vi.fn() };
    });
    wallet.createTopup.mockResolvedValue(CHECKOUT('razorpay'));
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    await waitFor(() => expect(options).toBeDefined());
    options?.modal?.ondismiss?.();
    expect(await screen.findByText('Payment cancelled — nothing was charged.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stops waiting after 60 seconds with a calm message', async () => {
    signInAs('owner');
    const start = new Date('2026-10-09T10:00:00Z').getTime();
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    wallet.createTopup.mockResolvedValue(CHECKOUT('fake'));
    wallet.fakeComplete.mockResolvedValue(ORDER());
    wallet.topup.mockResolvedValue(ORDER());
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pay (test)' }));
    await screen.findByText('Confirming payment…');
    await waitFor(() => expect(wallet.topup).toHaveBeenCalled());
    now.mockReturnValue(start + 61_000);
    expect(
      await screen.findByText(/not received the payment confirmation yet/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    now.mockRestore();
  });

  it('reports a Razorpay window that cannot start', async () => {
    signInAs('owner');
    window.Razorpay = vi.fn();
    wallet.createTopup.mockResolvedValue({
      ...CHECKOUT('razorpay'),
      checkout: { ...CHECKOUT('razorpay').checkout, keyId: null },
    });
    renderWithProviders({ route: '/wallet?add=1' });
    const dialog = await screen.findByRole('dialog', { name: 'Add money' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay ₹1,180.00' }));
    expect(
      await within(dialog).findByText('The payment window could not start.'),
    ).toBeInTheDocument();
  });
});

describe('Razorpay script loader', () => {
  it('injects the script once and resolves when it loads', async () => {
    const first = loadRazorpayCheckout();
    const second = loadRazorpayCheckout();
    expect(second).toBe(first);
    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      `script[src="${RAZORPAY_CHECKOUT_URL}"]`,
    );
    expect(scripts).toHaveLength(1);
    window.Razorpay = vi.fn();
    scripts[0]?.onload?.(new Event('load'));
    await expect(first).resolves.toBeUndefined();
    await expect(loadRazorpayCheckout()).resolves.toBeUndefined();
  });

  it('fails on a load error, a missing global and a 15 s timeout — and can retry', async () => {
    const failing = loadRazorpayCheckout();
    document.head.querySelector<HTMLScriptElement>('script')?.onerror?.(new Event('error'));
    await expect(failing).rejects.toThrow('could not be loaded');
    const empty = loadRazorpayCheckout();
    document.head
      .querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_URL}"]`)
      ?.onload?.(new Event('load'));
    await expect(empty).rejects.toThrow('could not start');
    vi.useFakeTimers();
    try {
      const slow = loadRazorpayCheckout();
      vi.advanceTimersByTime(15_001);
      await expect(slow).rejects.toThrow('took too long');
    } finally {
      vi.useRealTimers();
    }
    expect(document.head.querySelectorAll(`script[src="${RAZORPAY_CHECKOUT_URL}"]`)).toHaveLength(
      0,
    );
  });
});

describe('dashboard wallet card', () => {
  it('shows the available balance for wallet readers only', async () => {
    signInAs('viewer');
    wallet.get.mockResolvedValue(WALLET({ status: 'low' }));
    const view = renderWithProviders({ route: '/' });
    expect(await screen.findByText('₹1,479.00')).toBeInTheDocument();
    expect(screen.getByText(/₹865\.00 spent this month/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open wallet' })).toHaveAttribute('href', '/wallet');
    view.unmount();
    signInAs('agent');
    renderWithProviders({ route: '/' });
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(screen.queryByRole('link', { name: 'Open wallet' })).not.toBeInTheDocument();
  });

  it('shows an error on the card', async () => {
    signInAs('viewer');
    wallet.get.mockRejectedValue(httpError(500, 'INTERNAL_ERROR', 'No wallet'));
    renderWithProviders({ route: '/' });
    expect((await screen.findAllByText('No wallet')).length).toBeGreaterThan(0);
  });
});
