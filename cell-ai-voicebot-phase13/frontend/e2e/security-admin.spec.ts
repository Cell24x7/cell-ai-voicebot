import { expect, test } from '@playwright/test';

import { inviteMember } from './contacts';
import { SUPERADMIN } from './env';
import { openAdminAccount, signInAsSuperadmin, signOut, signUpOwner } from './helpers';
import { totpCode } from './security';

test('compliance page: the owner and an agent read the rules in force', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'seccompliance');
  await page.goto('/settings/compliance');
  await expect(page.getByText('Rules in force')).toBeVisible();
  await expect(page.getByText('Opt-out words')).toBeVisible();
  await expect(page.getByText('Calling hours')).toBeVisible();
  const agent = await inviteMember(page, browser, 'Agent', 'Meena Das');
  await agent.goto('/settings/compliance');
  // the rules are readable by everyone in the account (account.read)
  await expect(agent.getByText('Rules in force')).toBeVisible();
});

test('superadmin: per-account API limits are saved', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const owner = await signUpOwner(page, 'seclimits');
  const context = await browser.newContext();
  const admin = await context.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByLabel(/^Reads \(default/).fill('900');
  await admin.getByLabel(/^Writes \(default/).fill('90');
  await admin.getByRole('button', { name: 'Save API limits' }).click();
  await expect(admin.getByText(/API limits saved/)).toBeVisible();
  await admin.reload();
  await expect(admin.getByLabel(/^Reads \(default/)).toHaveValue('900');
  await context.close();
});

test('superadmin: two-step sign-in is set up, stays on after a new sign-in, and is turned off', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signInAsSuperadmin(page);
  await page.goto('/settings/security');
  await page.getByRole('button', { name: 'Set up' }).click();
  const setup = page.getByRole('dialog', { name: 'Set up two-step sign-in' });
  await expect(setup.getByLabel('Setup key')).not.toHaveValue('');
  const key = await setup.getByLabel('Setup key').inputValue();
  await setup.getByLabel('6-digit code').fill(totpCode(key));
  await setup.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByText('Save your recovery codes')).toBeVisible();
  // the code just used can't be used again, so the next steps use recovery codes
  const codes = (await page.locator('pre').innerText()).split('\n');
  await page.getByRole('button', { name: 'I saved them' }).click();

  // asking for a code after sign-in needs MFA_ENFORCED_FOR_ADMINS (off here; see tests/security/mfa)
  await signOut(page);
  await signInAsSuperadmin(page);

  await page.goto('/settings/security');
  await page.getByRole('button', { name: 'Turn off' }).click();
  const off = page.getByRole('dialog');
  await off.getByLabel('Your password').fill(SUPERADMIN.password);
  await off.getByLabel('Code from your app, or a recovery code').fill(codes[0] ?? '');
  await off.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByRole('button', { name: 'Set up' })).toBeVisible();
});
