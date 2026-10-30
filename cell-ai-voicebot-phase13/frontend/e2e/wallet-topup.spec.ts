import { expect, test } from '@playwright/test';

import { signUpOwner } from './helpers';
import { waitForEmail } from './mailpit';
import { BILLING, fillBillingDetails, walletCard } from './wallet';

const INVOICE_NUMBER = /^CAV\/\d{2}-\d{2}\/\d{6}$/;

/** Phase 4 "Done when": a test top-up raises the balance, with a GST invoice, PDF and receipt. */
test('owner adds ₹1,000 with a test payment: balance, ledger, GST invoice, PDF and receipt', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUpOwner(page, 'topup');

  await page
    .getByRole('navigation', { name: 'Main' })
    .first()
    .getByRole('link', { name: 'Wallet' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wallet' })).toBeVisible();
  await expect(walletCard(page, 'Balance')).toContainText('₹0.00');

  await page.getByRole('button', { name: 'Add money' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add money' });
  await expect(dialog.getByRole('button', { name: '₹1,000' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // first top-up → billing details (Rajasthan, the seller's state)
  const billing = page.getByRole('dialog', { name: 'Billing details' });
  await fillBillingDetails(page);
  await billing.getByRole('button', { name: 'Save and continue' }).click();

  // GST review: CGST 9 % + SGST 9 %
  await expect(page.getByText('CGST (9%)')).toBeVisible();
  await expect(page.getByText('SGST (9%)')).toBeVisible();
  await expect(page.getByText('₹90.00')).toHaveCount(2);
  await page.getByRole('button', { name: 'Pay ₹1,180.00' }).click();

  const test_ = page.getByRole('dialog', { name: 'Test payment' });
  await expect(test_.getByText(/Test mode — no real money/)).toBeVisible();
  await test_.getByRole('button', { name: 'Pay (test)' }).click();
  await expect(page.getByText('₹1,000.00 added to your wallet.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(walletCard(page, 'Balance')).toContainText('₹1,000.00');
  await expect(walletCard(page, 'Available')).toContainText('₹1,000.00');

  // ledger
  await page.getByRole('tab', { name: 'Transactions' }).click();
  const recharge = page.getByRole('row', { name: /Wallet recharge/ });
  await expect(recharge).toContainText('+₹1,000.00');
  await expect(recharge).toContainText('₹1,000.00');

  // GST invoice
  await page.getByRole('tab', { name: 'Invoices' }).click();
  const row = page.getByRole('table', { name: 'Invoices' }).getByRole('row').nth(1);
  await expect(row).toContainText('Ready', { timeout: 30_000 });
  await expect(row).toContainText('₹180.00');
  await expect(row).toContainText('₹1,180.00');
  const number = (await row.getByRole('cell').first().textContent())?.trim() ?? '';
  expect(number).toMatch(INVOICE_NUMBER);

  // PDF through a fresh signed link
  const linkResponse = page.waitForResponse((r) => /\/invoices\/[^/]+\/download$/.test(r.url()));
  const popup = page.waitForEvent('popup');
  await row.getByRole('button', { name: `Download ${number}` }).click();
  const { data } = (await (await linkResponse).json()) as {
    data: { url: string; expiresInSec: number };
  };
  expect(data.expiresInSec).toBe(900);
  await (await popup).close();
  const pdf = await page.request.get(data.url);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  // the link is signed — a changed signature is refused
  const tampered = await page.request.get(data.url.replace(/sig=[^&]+/, 'sig=0000'));
  expect(tampered.status()).not.toBe(200);

  // receipt email (billing email) after the PDF exists
  const receipt = await waitForEmail(
    BILLING.email,
    new RegExp(`Payment received — invoice ${number.replace(/\//g, '\\/')}`),
  );
  expect(receipt).toContain(number);

  // the bell got the top-up notice
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('menu').getByText('Money added to the wallet')).toBeVisible();
});
