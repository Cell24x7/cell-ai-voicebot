import { expect, type Page } from '@playwright/test';

import { openAdminAccount } from './helpers';

/** Billing details used by the wallet specs (Rajasthan = the seller's state → CGST + SGST). */
export const BILLING = {
  legalName: 'E2E Finance Private Limited',
  email: 'billing-e2e@example.com',
  addressLine1: '12 MI Road',
  city: 'Jaipur',
  pin: '302001',
};

/** Fills the billing form (Add-money step or Settings → Billing details). */
export async function fillBillingDetails(page: Page) {
  await page.getByLabel('Legal name (as on GST registration)').fill(BILLING.legalName);
  await page.getByLabel('Billing email').fill(BILLING.email);
  await page.getByLabel('Address line 1').fill(BILLING.addressLine1);
  await page.getByLabel('City').fill(BILLING.city);
  await page.getByRole('combobox', { name: 'State (place of supply)' }).click();
  await page.getByRole('option', { name: 'Rajasthan (08)' }).click();
  await page.getByLabel('PIN code').fill(BILLING.pin);
}

/** Owner: Wallet → Add money → (billing details) → test payment → done. */
export async function addMoney(page: Page, rupees: number) {
  await page.goto('/wallet');
  await page.getByRole('button', { name: 'Add money' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add money' });
  await dialog.getByLabel('Or enter an amount (₹)').fill(String(rupees));
  await dialog.getByRole('button', { name: 'Continue' }).click();
  // the next step is either the billing form (first top-up) or the GST review
  await page.getByRole('button', { name: /^(Pay ₹.+|Save and continue)$/ }).waitFor();
  const billing = page.getByRole('dialog', { name: 'Billing details' });
  if (await billing.isVisible()) {
    await fillBillingDetails(page);
    await billing.getByRole('button', { name: 'Save and continue' }).click();
  }
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await page
    .getByRole('dialog', { name: 'Test payment' })
    .getByRole('button', { name: 'Pay (test)' })
    .click();
  await expect(page.getByText(/added to your wallet\./)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Done' }).click();
}

/** Superadmin: account → Wallet tab → start a simulated call (returns once the hold shows). */
export async function startSimulatedCall(admin: Page, businessName: string) {
  await openAdminAccount(admin, businessName);
  await admin.getByRole('tab', { name: 'Wallet' }).click();
  await admin.getByRole('button', { name: 'Start simulated call' }).click();
  await expect(admin.getByText(/on hold \(prices:/)).toBeVisible();
}

/** Superadmin: end the running simulated call. */
export async function endSimulatedCall(
  admin: Page,
  { answered = true, durationSec = 90 }: { answered?: boolean; durationSec?: number } = {},
) {
  if (!answered) await admin.getByRole('switch', { name: 'Answered' }).click();
  await admin.getByLabel('Duration (seconds)').fill(String(durationSec));
  await admin.getByRole('button', { name: 'End call' }).click();
  await expect(
    admin.getByText(answered ? /^Call charged\./ : 'Not billable — the whole hold was released.'),
  ).toBeVisible();
}

/** Text of a wallet overview card (Balance / On hold / Available …). */
export const walletCard = (page: Page, label: string) =>
  page
    .locator('.MuiCard-root')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
