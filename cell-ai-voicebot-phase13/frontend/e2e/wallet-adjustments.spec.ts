import { expect, test } from '@playwright/test';

import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';

test('superadmin credits and debits with a reason: ledger rows, bell and audit on both sides', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = await signUpOwner(page, 'adjust');

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('tab', { name: 'Wallet' }).click();

  const adjust = async (direction: 'credit' | 'debit', amount: string, reason: string) => {
    await admin.getByRole('button', { name: 'Adjust balance' }).click();
    const dialog = admin.getByRole('dialog', { name: 'Adjust wallet' });
    if (direction === 'debit') await dialog.getByRole('button', { name: 'Debit (deduct)' }).click();
    await dialog.getByLabel('Amount (₹)').fill(amount);
    await dialog.getByLabel('Reason').fill(reason);
    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(
      dialog.getByText(
        direction === 'credit'
          ? `Add ₹${amount}.00 to ${owner.businessName}’s wallet?`
          : `Deduct ₹${amount}.00 from ${owner.businessName}’s wallet?`,
      ),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: direction === 'credit' ? 'Add money' : 'Deduct money' })
      .click();
    await expect(dialog).toBeHidden();
  };
  await adjust('credit', '250', 'Welcome credit');
  await adjust('debit', '50', 'Setup fee');

  const adminLedger = admin.getByRole('table', { name: 'Transactions' });
  await expect(adminLedger.getByRole('row', { name: /Adjustment: Welcome credit/ })).toContainText(
    '+₹250.00',
  );
  await expect(adminLedger.getByRole('row', { name: /Adjustment: Setup fee/ })).toContainText(
    '−₹50.00',
  );

  // the customer sees both rows, the new balance and a bell notice
  await page.goto('/wallet?tab=transactions');
  const ledger = page.getByRole('table', { name: 'Transactions' });
  await expect(ledger.getByRole('row', { name: /Adjustment: Welcome credit/ })).toContainText(
    '+₹250.00',
  );
  const debit = ledger.getByRole('row', { name: /Adjustment: Setup fee/ });
  await expect(debit).toContainText('−₹50.00');
  await expect(debit).toContainText('₹200.00');
  await page.getByRole('button', { name: /^Notifications, \d+ unread/ }).click();
  await expect(
    page.getByRole('menu').getByText('Wallet adjusted by support').first(),
  ).toBeVisible();
  await expect(
    page.getByRole('menu').getByText(/₹250\.00 was added to your wallet\. Reason: Welcome credit/),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // audit on the customer account …
  await page.goto('/settings/audit');
  await expect(page.getByText('wallet.adjusted').first()).toBeVisible();
  // … and on the platform account
  await admin.goto('/settings/audit');
  await expect(admin.getByText('wallet.adjusted').first()).toBeVisible();
  await adminContext.close();
});
