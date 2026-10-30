import { expect, test } from '@playwright/test';

import { inviteMember } from './contacts';
import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';

test('roles: managers read the wallet only, agents have none, impersonators cannot top up', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await signUpOwner(page, 'walletroles');
  const nav = page.getByRole('navigation', { name: 'Main' }).first();
  await expect(nav.getByRole('link', { name: 'Wallet' })).toBeVisible();

  // manager: wallet read-only
  const manager = await inviteMember(page, browser, 'Manager', 'Ravi Kumar');
  await manager.goto('/wallet');
  await expect(manager.getByRole('heading', { level: 1, name: 'Wallet' })).toBeVisible();
  await expect(manager.getByText('Balance', { exact: true })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Add money' })).toHaveCount(0);
  await expect(manager.getByRole('button', { name: 'Alerts & budgets' })).toHaveCount(0);
  await manager.goto('/settings/billing');
  await expect(
    manager.getByText('Only the owner and admins can change billing details.'),
  ).toBeVisible();
  await expect(manager.getByLabel('City')).toBeDisabled();

  // agent: no Wallet at all
  const agent = await inviteMember(page, browser, 'Agent', 'Meena Das');
  await expect(
    agent.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Wallet' }),
  ).toHaveCount(0);
  await agent.goto('/wallet');
  await expect(agent.getByRole('heading', { level: 1, name: '403' })).toBeVisible();

  // impersonating superadmin: sees the wallet, cannot add money
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByText(/Viewing as/)).toBeVisible();
  // navigate inside the app — a full reload ends the impersonation (no refresh token for it)
  await expect(admin.getByText('No money available in the wallet', { exact: false })).toBeVisible();
  await admin
    .getByRole('navigation', { name: 'Main' })
    .first()
    .getByRole('link', { name: 'Wallet' })
    .click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Wallet' })).toBeVisible();
  await expect(admin.getByText('Balance', { exact: true })).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Add money' })).toHaveCount(0);
  await expect(admin.getByRole('button', { name: 'Alerts & budgets' })).toHaveCount(0);
  await adminContext.close();
});
