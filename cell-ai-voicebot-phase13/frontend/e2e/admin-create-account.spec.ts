import { expect, test } from '@playwright/test';

import { PASSWORD } from './env';
import { signIn, signInAsSuperadmin, uniqueEmail } from './helpers';

test('a superadmin adds an account with a password and changes it; the owner signs in', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('adminmade');
  const business = `Admin Made ${Date.now().toString(36)}`;
  const nextPassword = `${PASSWORD}-next`;
  await signInAsSuperadmin(page);
  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: 'Add account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add account' });
  await dialog.getByLabel('Business name').fill(business);
  await dialog.getByLabel('Owner name').fill('Meera Shah');
  await dialog.getByLabel('Owner email').fill(email);
  await dialog.getByLabel('Owner password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: business })).toBeVisible();

  const ownerSignsIn = async (password: string) => {
    const context = await browser.newContext();
    const owner = await context.newPage();
    await signIn(owner, email, password);
    await expect(owner.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await context.close();
  };
  await ownerSignsIn(PASSWORD);

  await page.getByRole('button', { name: 'Change password' }).click();
  const change = page.getByRole('dialog', { name: 'Change owner password' });
  await change.getByLabel('New password').fill(nextPassword);
  await change.getByLabel('Repeat password').fill(nextPassword);
  await change.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  await ownerSignsIn(nextPassword);
});
