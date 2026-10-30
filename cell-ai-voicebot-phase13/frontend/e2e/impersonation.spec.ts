import { expect, test } from '@playwright/test';

import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';

test('superadmin views an account as its owner and stops', async ({ page, browser }) => {
  const owner = await signUpOwner(page, 'imp');

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);

  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(
    admin.getByText(`Viewing as ${owner.name} (${owner.businessName})`, { exact: false }),
  ).toBeVisible();
  await expect(admin.getByRole('link', { name: 'Accounts', exact: true })).toHaveCount(0);

  // Sensitive actions are off while impersonating. In-app navigation only: the
  // impersonation token lives in memory, so a full reload returns to the admin session.
  await admin.getByRole('link', { name: 'Settings' }).click();
  await admin.getByRole('tab', { name: 'Security' }).click();
  await expect(
    admin.getByText('Password changes are not available while viewing as another user.'),
  ).toBeVisible();
  await admin.getByRole('tab', { name: 'API keys' }).click();
  await expect(admin.getByRole('button', { name: 'Create API key' })).toHaveCount(0);

  await admin.getByRole('button', { name: 'Stop' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: owner.businessName })).toBeVisible();
  await expect(admin.getByRole('link', { name: 'Accounts', exact: true })).toBeVisible();

  // The owner sees it in their audit log.
  await page.goto('/settings/audit');
  await expect(page.getByRole('cell', { name: 'admin.impersonation_started' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'admin.impersonation_stopped' })).toBeVisible();
  await adminContext.close();
});
