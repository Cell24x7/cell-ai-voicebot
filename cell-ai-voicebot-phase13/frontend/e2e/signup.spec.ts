import { expect, test } from '@playwright/test';

import { PASSWORD } from './env';
import { signIn, signOut, signUpOwner } from './helpers';

test('sign up → verify email → dashboard → sign out → sign in again', async ({ page }) => {
  const owner = await signUpOwner(page, 'signup');
  await expect(page.getByText(`Welcome, ${owner.name}`)).toBeVisible();
  await expect(page.getByRole('banner').getByText(owner.businessName)).toBeVisible();

  // The access token lives in memory only; the refresh cookie restores the session.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await signOut(page);
  await page.goto('/team');
  await expect(page).toHaveURL(/\/login\?next=%2Fteam$/);

  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid email or password.')).toBeVisible();

  await signIn(page, owner.email, PASSWORD);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});
