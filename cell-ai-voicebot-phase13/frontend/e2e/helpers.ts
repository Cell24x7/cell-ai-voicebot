import { expect, type Page } from '@playwright/test';

import { PASSWORD, SUPERADMIN } from './env';
import { extractCode, waitForEmail } from './mailpit';

let counter = 0;
/** Unique per run, so a spec can be re-run without resetting anything. */
export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now().toString(36)}-${(counter += 1)}@example.com`;

export interface Owner {
  email: string;
  name: string;
  businessName: string;
}

/** Signs up through the UI, enters the emailed code and lands on the dashboard. */
export async function signUpOwner(page: Page, tag: string): Promise<Owner> {
  const owner = {
    email: uniqueEmail(tag),
    name: 'Asha Verma',
    businessName: `E2E ${tag} ${Date.now().toString(36)}`,
  };
  await page.goto('/signup');
  await page.getByLabel('Business name').fill(owner.businessName);
  await page.getByLabel('Your name').fill(owner.name);
  await page.getByLabel('Work email').fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const code = extractCode(await waitForEmail(owner.email, /verif|code/i));
  await page.getByLabel('Digit 1').click();
  await page.keyboard.type(code);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  return owner;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signInAsSuperadmin(page: Page) {
  await signIn(page, SUPERADMIN.email, SUPERADMIN.password);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/** Superadmin: open the detail page of the account with this business name. */
export async function openAdminAccount(page: Page, businessName: string) {
  await page.goto('/admin/accounts');
  await page.getByLabel('Search name, slug or owner email').fill(businessName);
  await page.getByRole('link', { name: businessName }).click();
  await expect(page.getByRole('heading', { level: 1, name: businessName })).toBeVisible();
}
