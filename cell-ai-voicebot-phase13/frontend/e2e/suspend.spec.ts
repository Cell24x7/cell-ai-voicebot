import { expect, test } from '@playwright/test';

import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';

test('superadmin suspends and re-enables an account', async ({ page, browser }) => {
  const owner = await signUpOwner(page, 'suspend');

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await expect(admin.getByText(owner.email)).toBeVisible();

  await admin.getByRole('button', { name: 'Suspend' }).click();
  const dialog = admin.getByRole('dialog', { name: `Suspend ${owner.businessName}?` });
  await dialog.getByLabel('Reason').fill('Unpaid invoice');
  await dialog.getByRole('button', { name: 'Suspend account' }).click();
  await expect(admin.getByText('Suspended: Unpaid invoice')).toBeVisible();

  // The owner is told (live, or on the next load) and the account is read-only.
  await page.reload();
  await expect(page.getByText(/This account is suspended.*Unpaid invoice/)).toBeVisible();
  await page.goto('/settings/account');
  await expect(page.getByLabel('Business name')).toBeDisabled();

  await admin.getByRole('button', { name: 'Enable' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Enable' }).click();
  await expect(admin.getByText(`${owner.businessName} enabled`)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Business name')).toBeEnabled();
  await expect(page.getByText(/This account is suspended/)).toHaveCount(0);

  // Both actions are in the account's recent activity.
  await admin.reload();
  await expect(admin.getByRole('cell', { name: 'account.suspended' })).toBeVisible();
  await expect(admin.getByRole('cell', { name: 'account.enabled' })).toBeVisible();
  await adminContext.close();
});
