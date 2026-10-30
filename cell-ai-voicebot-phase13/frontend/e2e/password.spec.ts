import { expect, test } from '@playwright/test';

import { PASSWORD } from './env';
import { signIn, signOut, signUpOwner } from './helpers';
import { extractLink, waitForEmail } from './mailpit';

const NEW_PASSWORD = 'green-falcon-lake-77';

test('forgot password → emailed link → new password works; old password and sessions do not', async ({
  page,
  browser,
}) => {
  const owner = await signUpOwner(page, 'password');
  // A second device that stays signed in through the reset.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, owner.email, PASSWORD);
  await expect(other.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await signOut(page);

  await page.getByRole('link', { name: /forgot/i }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(owner.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/If an account exists for this email/)).toBeVisible();

  const link = extractLink(await waitForEmail(owner.email, /reset/i), '/reset-password');
  await page.goto(link);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Repeat new password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await waitForEmail(owner.email, /password was changed/i);

  // Every existing session ended with the reset.
  await other.reload();
  await expect(other.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await otherContext.close();

  // The link is single-use.
  await page.goto(link);
  await page.getByLabel('New password', { exact: true }).fill('another-pass-word-55');
  await page.getByLabel('Repeat new password', { exact: true }).fill('another-pass-word-55');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();

  await signIn(page, owner.email, PASSWORD);
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
  await signIn(page, owner.email, NEW_PASSWORD);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // Change it again from Settings → Security.
  await page.goto('/settings/security');
  await page.getByLabel('Current password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repeat new password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/Password changed/i)).toBeVisible();
  await signOut(page);
  await signIn(page, owner.email, PASSWORD);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});
