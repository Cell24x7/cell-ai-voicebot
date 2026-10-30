import { expect, test } from '@playwright/test';

import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';
import { addMoney, endSimulatedCall, startSimulatedCall, walletCard } from './wallet';

/**
 * Phase 4 "Done when": a dummy call is charged correctly in the ledger and
 * hold / release behave — using the billing simulator (real engine calls).
 */
test('superadmin sets the rates; a simulated call holds, charges exactly and releases', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await signUpOwner(page, 'charges');
  await addMoney(page, 1000);

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);

  // account prices: ₹2.00 / min, 60 s pulse, no AI / TTS / commission
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('tab', { name: 'Rates' }).click();
  await expect(admin.getByText('Platform default', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Edit rates' }).click();
  const rates = admin.getByRole('dialog', { name: `Prices for ${owner.businessName}` });
  await rates.getByLabel('Call (₹ per minute)').fill('2');
  await rates.getByLabel('AI (₹ per minute)').fill('0');
  await rates.getByLabel('Voice / TTS (₹ per 1,000 characters)').fill('0');
  await rates.getByLabel('Note (optional)').fill('E2E pricing');
  await rates.getByRole('button', { name: 'Save new rates' }).click();
  await expect(admin.getByText('Account override')).toBeVisible();
  await expect(admin.getByText('₹2.00 / min')).toBeVisible();

  // the owner sees the new prices
  await page.goto('/wallet');
  await expect(page.getByRole('table', { name: 'Your prices' })).toContainText('₹2.00 / minute');

  // call 1: hold (3 min × ₹2 = ₹6) → owner sees it on hold
  await startSimulatedCall(admin, owner.businessName);
  await expect(
    admin.getByText('Call in progress — ₹6.00 on hold (prices: account override).'),
  ).toBeVisible();
  await page.reload();
  await expect(walletCard(page, 'On hold')).toContainText('₹6.00');
  await expect(walletCard(page, 'Available')).toContainText('₹994.00');

  // answered 90 s → 2 pulses × ₹2 = ₹4.00; the hold is released
  await endSimulatedCall(admin, { answered: true, durationSec: 90 });
  await page.reload();
  await expect(walletCard(page, 'Balance')).toContainText('₹996.00');
  await expect(walletCard(page, 'On hold')).toContainText('₹0.00');

  await page.getByRole('tab', { name: 'Transactions' }).click();
  const table = page.getByRole('table', { name: 'Transactions' });
  // the captured charge (hold rows also have the type "Call charge")
  const charges = table
    .getByRole('row')
    .filter({ hasText: 'Call charge' })
    .filter({ hasText: 'Done' });
  const charge = charges.first();
  await expect(charge).toContainText('−₹4.00');
  await expect(charge).toContainText('₹996.00');
  await expect(table.getByRole('row', { name: /Call hold/ }).first()).toContainText('Released');
  await charge.getByRole('button', { name: 'Details of Call charge' }).click();
  const details = page.getByRole('region', { name: 'Transaction details' });
  await expect(details).toContainText('1 min 30 s');
  await expect(details).toContainText('2 min (60 s pulses)');
  await expect(details).toContainText('Telephony₹4.00');
  await page.getByRole('button', { name: 'Close details' }).click();

  // call 2: unanswered → the whole hold is released, nothing charged
  await admin.getByRole('button', { name: 'Start simulated call' }).click();
  await expect(admin.getByText(/₹6\.00 on hold/)).toBeVisible();
  await endSimulatedCall(admin, { answered: false, durationSec: 20 });
  await page.goto('/wallet');
  await expect(walletCard(page, 'Balance')).toContainText('₹996.00');
  await expect(walletCard(page, 'On hold')).toContainText('₹0.00');
  await page.getByRole('tab', { name: 'Transactions' }).click();
  // one charge (call 1); both holds released, nothing charged for call 2
  const all = page.getByRole('table', { name: 'Transactions' }).getByRole('row');
  await expect(all.filter({ hasText: 'Call charge' }).filter({ hasText: 'Done' })).toHaveCount(1);
  await expect(all.filter({ hasText: 'Call hold' }).filter({ hasText: 'Released' })).toHaveCount(2);

  // this month's spend shows the call
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(walletCard(page, 'Spent this month')).toContainText('₹4.00');
  await adminContext.close();
});
