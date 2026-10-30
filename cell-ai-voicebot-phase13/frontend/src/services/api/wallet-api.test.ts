import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  adminBillingKeys,
  billingKeys,
  invoiceKeys,
  notificationKeys,
  walletKeys,
} from '@/features/wallet/keys';

import { adminBillingApi } from './admin-billing';
import { billingApi } from './billing';
import { apiClient } from './client';
import { invoicesApi } from './invoices';
import { notificationsApi } from './notifications';
import { walletApi } from './wallet';

interface Seen {
  method: string;
  url: string;
  params: unknown;
  data: unknown;
  headers: Record<string, unknown>;
  responseType?: string;
}

const originalAdapter = apiClient.defaults.adapter;
let seen: Seen[] = [];
let body: unknown = { success: true, data: { ok: true }, meta: { hasMore: false } };

beforeEach(() => {
  seen = [];
  body = { success: true, data: { ok: true }, meta: { hasMore: false } };
  apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    seen.push({
      method: config.method ?? '',
      url: config.url ?? '',
      params: config.params as unknown,
      data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
      headers: AxiosHeaders.from(config.headers).toJSON(),
      responseType: config.responseType,
    });
    return Promise.resolve({
      status: 200,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
      data: body,
    });
  };
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

const last = () => seen[seen.length - 1];
const calls = () => seen.map((s) => `${s.method} ${s.url}`);

describe('wallet API client', () => {
  it('reads and changes the wallet', async () => {
    expect(await walletApi.get()).toEqual({ ok: true });
    await walletApi.updateSettings({ lowBalanceThresholdMicros: 5 });
    expect(last()).toMatchObject({ data: { lowBalanceThresholdMicros: 5 } });
    await walletApi.rates();
    await walletApi.estimate({ calls: 10, avgDurationSec: 60, answerRate: 50, aiShare: 100 });
    expect(
      await walletApi.ledger({ limit: 20, type: ['topup', 'adjustment'], status: 'captured' }),
    ).toMatchObject({ meta: { hasMore: false } });
    expect(last()?.params).toEqual({ limit: 20, type: 'topup,adjustment', status: 'captured' });
    await walletApi.ledger({ type: [] });
    expect(last()?.params).toEqual({});
    await walletApi.ledgerEntry('l1');
    await walletApi.exportLedger('2026-10-01', '2026-10-09');
    expect(last()).toMatchObject({
      params: { from: '2026-10-01', to: '2026-10-09' },
      responseType: 'blob',
    });
    await walletApi.usage({ from: '2026-10-01' });
    expect(calls()).toEqual([
      'get /wallet',
      'patch /wallet/settings',
      'get /wallet/rates',
      'post /wallet/estimate',
      'get /wallet/ledger',
      'get /wallet/ledger',
      'get /wallet/ledger/l1',
      'get /wallet/ledger/export',
      'get /wallet/usage',
    ]);
  });

  it('creates and completes top-ups with the caller’s Idempotency-Key', async () => {
    await walletApi.createTopup(500_000_000, 'key-1');
    expect(last()).toMatchObject({
      method: 'post',
      url: '/wallet/topups',
      data: { amountMicros: 500_000_000 },
      headers: { 'Idempotency-Key': 'key-1' },
    });
    await walletApi.topups({ page: 2 });
    await walletApi.topup('t1');
    await walletApi.verifyTopup('t1', { providerPaymentId: 'pay_1', signature: 'sig' });
    expect(last()?.data).toEqual({ providerPaymentId: 'pay_1', signature: 'sig' });
    await walletApi.fakeComplete('t1', 'failed');
    expect(last()).toMatchObject({
      url: '/wallet/topups/t1/fake-complete',
      data: { outcome: 'failed' },
    });
    expect(calls().slice(1)).toEqual([
      'get /wallet/topups',
      'get /wallet/topups/t1',
      'post /wallet/topups/t1/verify',
      'post /wallet/topups/t1/fake-complete',
    ]);
  });
});

describe('billing, invoices and notifications clients', () => {
  it('billing profile and GST states', async () => {
    await billingApi.profile();
    await billingApi.saveProfile({
      legalName: 'X',
      email: 'x@example.com',
      addressLine1: 'a',
      city: 'c',
      stateCode: '08',
      pin: '302001',
    });
    await billingApi.states();
    expect(calls()).toEqual([
      'get /billing/profile',
      'put /billing/profile',
      'get /billing/states',
    ]);
  });

  it('invoices', async () => {
    await invoicesApi.list({ page: 1, limit: 20 });
    expect(last()?.params).toEqual({ page: 1, limit: 20 });
    await invoicesApi.get('i1');
    await invoicesApi.download('i1');
    expect(calls()).toEqual(['get /invoices', 'get /invoices/i1', 'get /invoices/i1/download']);
  });

  it('notifications', async () => {
    await notificationsApi.list({ limit: 20 });
    expect(last()?.params).toEqual({ limit: 20 });
    await notificationsApi.list({ limit: 5, unread: true });
    expect(last()?.params).toEqual({ limit: 5, unread: 'true' });
    body = { success: true, data: { count: 4 } };
    expect(await notificationsApi.unreadCount()).toBe(4);
    await notificationsApi.markRead('n1');
    await notificationsApi.markAllRead();
    expect(calls()).toEqual([
      'get /notifications',
      'get /notifications',
      'get /notifications/unread-count',
      'post /notifications/n1/read',
      'post /notifications/read-all',
    ]);
  });
});

describe('admin billing client', () => {
  it('calls every superadmin billing route', async () => {
    const card = {
      callPerMinuteMicros: 1,
      pulseSeconds: 60 as const,
      aiPerMinuteMicros: 1,
      ttsPer1kCharsMicros: 1,
      commissionBps: 0,
      billUnansweredAttempts: false,
      aiTextPer1kTokensMicros: 1,
      embeddingPer1kTokensMicros: 1,
    };
    await adminBillingApi.config();
    await adminBillingApi.defaultRateCard();
    await adminBillingApi.setDefaultRateCard(card);
    await adminBillingApi.defaultRateCardHistory();
    expect(last()?.params).toEqual({ limit: 50 });
    await adminBillingApi.accountRateCards('a1', 10);
    await adminBillingApi.setAccountRateCard('a1', { ...card, note: 'Pilot' });
    await adminBillingApi.accountRateCardToDefault('a1', 'Back');
    expect(last()?.data).toEqual({ note: 'Back' });
    await adminBillingApi.accountRateCardToDefault('a1');
    expect(last()?.data).toEqual({});
    await adminBillingApi.wallet('a1');
    await adminBillingApi.setCreditLimit('a1', 5);
    await adminBillingApi.ledger('a1', { limit: 5, type: ['adjustment'] });
    expect(last()?.params).toEqual({ limit: 5, type: 'adjustment' });
    await adminBillingApi.ledger('a1', {});
    await adminBillingApi.adjust(
      'a1',
      { direction: 'credit', amountMicros: 1, reason: 'Hello' },
      'k1',
    );
    expect(last()?.headers).toMatchObject({ 'Idempotency-Key': 'k1' });
    await adminBillingApi.startSimulatedCall('a1', 2);
    expect(last()?.data).toEqual({ estimateMinutes: 2 });
    await adminBillingApi.startSimulatedCall('a1');
    expect(last()?.data).toEqual({});
    await adminBillingApi.endSimulatedCall('a1', 'h1', { answered: true, durationSec: 90 });
    await adminBillingApi.summary('2026-10');
    expect(last()?.params).toEqual({ month: '2026-10' });
    await adminBillingApi.summary();
    expect(last()?.params).toEqual({});
    await adminBillingApi.payments({ status: 'paid', account: 'a1' });
    await adminBillingApi.paymentEvents({ outcome: 'unmatched' });
    expect(calls()).toEqual([
      'get /admin/billing/config',
      'get /admin/rate-cards/default',
      'put /admin/rate-cards/default',
      'get /admin/rate-cards/default/history',
      'get /admin/accounts/a1/rate-cards',
      'post /admin/accounts/a1/rate-cards',
      'delete /admin/accounts/a1/rate-cards',
      'delete /admin/accounts/a1/rate-cards',
      'get /admin/accounts/a1/wallet',
      'patch /admin/accounts/a1/wallet',
      'get /admin/accounts/a1/ledger',
      'get /admin/accounts/a1/ledger',
      'post /admin/accounts/a1/wallet/adjustments',
      'post /admin/accounts/a1/billing/simulated-calls',
      'post /admin/accounts/a1/billing/simulated-calls',
      'post /admin/accounts/a1/billing/simulated-calls/h1/end',
      'get /admin/billing/summary',
      'get /admin/billing/summary',
      'get /admin/payments',
      'get /admin/payment-events',
    ]);
  });

  it('query keys are stable and distinct', () => {
    expect(walletKeys.ledger({ type: ['topup'] })).toEqual([
      'wallet',
      'ledger',
      { type: ['topup'] },
    ]);
    expect(walletKeys.usage({})[0]).toBe('wallet');
    expect(walletKeys.ledgerEntry('x')).toEqual(['wallet', 'ledger-entry', 'x']);
    expect(walletKeys.topup('t')).toEqual(['wallet', 'topup', 't']);
    expect(billingKeys.profile).not.toEqual(billingKeys.states);
    expect(invoiceKeys.list({ page: 1 })).toEqual(['invoices', 'list', { page: 1 }]);
    expect(notificationKeys.unread[0]).toBe('notifications');
    expect(adminBillingKeys.ledger('a', {})).toEqual(['admin-billing', 'ledger', 'a', {}]);
    for (const k of [
      adminBillingKeys.accountCards('a'),
      adminBillingKeys.wallet('a'),
      adminBillingKeys.ledgerAll('a'),
      adminBillingKeys.summary('2026-10'),
      adminBillingKeys.payments({}),
      adminBillingKeys.paymentEvents({}),
    ]) {
      expect(k[0]).toBe('admin-billing');
    }
  });
});
