import { expect, test } from '@playwright/test';

import { PASSWORD } from './env';
import { signUpOwner, uniqueEmail } from './helpers';
import { extractLink, waitForEmail } from './mailpit';

/** BUILD_PLAN "Done when": new account → member invited → the menu follows the role. */
test('owner invites a manager; the menu and pages follow the role', async ({ page, browser }) => {
  await signUpOwner(page, 'team');
  const memberEmail = uniqueEmail('member');

  await page.getByRole('link', { name: 'Team' }).click();
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite a team member' });
  await dialog.getByLabel('Email').fill(memberEmail);
  await dialog.getByLabel('Name').fill('Ravi Kumar');
  await dialog.getByLabel('Role').click();
  await page.getByRole('option', { name: 'Manager' }).click();
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${memberEmail}`)).toBeVisible();
  const row = page.getByRole('row', { name: /Ravi Kumar/ });
  await expect(row.getByText('Invited')).toBeVisible();

  // The member accepts in their own browser.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  const link = extractLink(await waitForEmail(memberEmail, /invited/i), '/accept-invite');
  await member.goto(link);
  await expect(member.getByLabel('Your name')).toHaveValue('Ravi Kumar');
  await member.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await member.getByLabel('Repeat password').fill(PASSWORD);
  await member.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(member.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // Manager: Team is read-only; no API keys / Audit log settings.
  await member.getByRole('link', { name: 'Team' }).click();
  await expect(member.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
  await expect(member.getByRole('row', { name: /Asha Verma/ })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Invite member' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
  await member.getByRole('link', { name: 'Settings' }).click();
  await expect(member.getByRole('tab', { name: 'Account' })).toBeVisible();
  await expect(member.getByRole('tab', { name: 'API keys' })).toHaveCount(0);
  await expect(member.getByRole('tab', { name: 'Audit log' })).toHaveCount(0);

  // Owner makes the member a Viewer → Team disappears from the member's menu.
  await expect(row.getByText('Active')).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Actions for Ravi Kumar' }).click();
  await page.getByRole('menuitem', { name: 'Make Viewer' }).click();
  await expect(page.getByText('Ravi Kumar is now Viewer')).toBeVisible();

  await member.reload();
  await expect(member.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(member.getByRole('link', { name: 'Team' })).toHaveCount(0);
  await member.goto('/team');
  await expect(member.getByRole('heading', { level: 1, name: '403' })).toBeVisible();

  // Disabling signs the member out.
  await row.getByRole('button', { name: 'Actions for Ravi Kumar' }).click();
  await page.getByRole('menuitem', { name: 'Disable' }).click();
  await expect(page.getByText('Ravi Kumar was disabled')).toBeVisible();
  await member.reload();
  await expect(member.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await memberContext.close();
});
