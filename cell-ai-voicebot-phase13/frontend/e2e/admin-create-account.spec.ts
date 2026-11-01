import { expect, test } from '@playwright/test';

import { PASSWORD } from './env';
import { signInAsSuperadmin, uniqueEmail } from './helpers';
import { extractLink, waitForEmail } from './mailpit';

test('a superadmin adds an account; the owner accepts the e-mailed invitation and signs in', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('adminmade');
  const business = `Admin Made ${Date.now().toString(36)}`;
  await signInAsSuperadmin(page);
  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: 'Add account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add account' });
  await dialog.getByLabel('Business name').fill(business);
  await dialog.getByLabel('Owner name').fill('Meera Shah');
  await dialog.getByLabel('Owner email').fill(email);
  await dialog.getByRole('button', { name: 'Create and send invitation' }).click();

  // the new account opens, its owner still invited
  await expect(page.getByRole('heading', { level: 1, name: business })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend invitation' })).toBeVisible();

  // the owner sets a password from the e-mail and lands in their account
  const context = await browser.newContext();
  const owner = await context.newPage();
  await owner.goto(extractLink(await waitForEmail(email, /invited/i), '/accept-invite'));
  await owner.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await owner.getByLabel('Repeat password').fill(PASSWORD);
  await owner.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(owner.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await owner.getByRole('link', { name: 'Team' }).click();
  await expect(owner.getByRole('button', { name: 'Invite member' })).toBeVisible();
  await context.close();

  // the admin no longer sees the resend button
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: business })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend invitation' })).toHaveCount(0);
});
