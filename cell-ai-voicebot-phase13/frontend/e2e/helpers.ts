import { expect, type Page } from '@playwright/test';

import { PASSWORD, SUPERADMIN } from './env';

let counter = 0;
/** Unique per run, so a spec can be re-run without resetting anything. */
export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now().toString(36)}-${(counter += 1)}@example.com`;

export interface Owner {
  email: string;
  name: string;
  businessName: string;
}

/** Signs up through the UI and lands on the dashboard without an email-code step. */
export async function signUpOwner(
  page: Page,
  tag: string,
  kind: 'business' | 'reseller' = 'business',
): Promise<Owner> {
  const owner = {
    email: uniqueEmail(tag),
    name: 'Asha Verma',
    businessName: `E2E ${tag} ${Date.now().toString(36)}`,
  };
  await page.route('**/api/v1/auth/signup', (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        'x-forwarded-for': `198.18.${String(Math.floor(Math.random() * 255))}.${String(Math.floor(Math.random() * 254) + 1)}`,
      },
    }),
  );
  await page.goto('/signup');
  await page
    .getByRole('button', { name: kind === 'business' ? 'Business' : 'Reseller', exact: true })
    .click();
  await page.getByLabel('Business name').fill(owner.businessName);
  await page.getByLabel('Your name').fill(owner.name);
  await page.getByLabel('Work email').fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: kind === 'reseller' ? 'Reseller' : 'Dashboard',
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute('**/api/v1/auth/signup');
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
