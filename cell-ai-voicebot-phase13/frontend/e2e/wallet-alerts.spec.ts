import { expect, test, type Page } from '@playwright/test';

import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';
import { waitForEmail } from './mailpit';
import { addMoney, endSimulatedCall, startSimulatedCall } from './wallet';

const bellHas = async (page: Page, title: string) => {
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('menu').getByText(title)).toBeVisible();
  await page.keyboard.press('Escape');
};

test('low balance and exhausted: banner, bell and email; no new calls at ₹0; a top-up clears it', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await signUpOwner(page, 'alerts');
  await addMoney(page, 1000);
  await expect(page.getByRole('alert').filter({ hasText: /wallet/i })).toHaveCount(0);

  // alert when available drops below ₹999
  await page.getByRole('button', { name: 'Alerts & budgets' }).click();
  const settings = page.getByRole('dialog', { name: 'Wallet settings' });
  await settings.getByLabel('Low-balance alert below (₹)').fill('999');
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Wallet settings saved')).toBeVisible();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);

  // a charge takes it below the threshold
  await startSimulatedCall(admin, owner.businessName);
  await endSimulatedCall(admin, { answered: true, durationSec: 90 });
  await page.reload();
  await expect(
    page.getByText(
      'Low wallet balance: ₹998.00 available. Calls and WhatsApp messages stop when it runs out.',
    ),
  ).toBeVisible();
  await bellHas(page, 'Wallet balance is low');
  await waitForEmail(owner.email, /wallet balance is low/);

  // support takes the rest → exhausted
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('tab', { name: 'Wallet' }).click();
  await admin.getByRole('button', { name: 'Adjust balance' }).click();
  const adjust = admin.getByRole('dialog', { name: 'Adjust wallet' });
  await adjust.getByRole('button', { name: 'Debit (deduct)' }).click();
  await adjust.getByLabel('Amount (₹)').fill('998');
  await adjust.getByLabel('Reason').fill('E2E: use up the balance');
  await adjust.getByRole('button', { name: 'Review' }).click();
  await adjust.getByRole('button', { name: 'Deduct money' }).click();
  await expect(admin.getByText('Deducted ₹998.00')).toBeVisible();

  await page.reload();
  await expect(
    page.getByText(
      'No money available in the wallet — calls and WhatsApp messages cannot start until money is added.',
    ),
  ).toBeVisible();
  await bellHas(page, 'Wallet balance used up');
  await waitForEmail(owner.email, /wallet balance used up/);

  // no new calls while available is 0
  await admin.getByRole('button', { name: 'Start simulated call' }).click();
  await expect(admin.getByText('Insufficient wallet balance.')).toBeVisible();

  // a top-up clears the banner
  await addMoney(page, 1000);
  await page.reload();
  await expect(page.getByText(/No money available in the wallet|Low wallet balance/)).toHaveCount(
    0,
  );
  await adminContext.close();
});
