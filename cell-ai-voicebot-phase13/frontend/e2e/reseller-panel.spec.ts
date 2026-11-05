import { expect, test } from '@playwright/test';

import { PASSWORD, SUPERADMIN } from './env';
import { signUpOwner, uniqueEmail } from './helpers';
import { InboxApi } from './inbox';

test('reseller signup → customer → credit → log in as → back → reclaim', async ({
  page,
  playwright,
}) => {
  const reseller = await signUpOwner(page, 'reseller', 'reseller');
  const api = await InboxApi.signIn(playwright, reseller.email);
  try {
    await api.fund(playwright);
    await page.goto('/reseller/customers');
    await page.getByRole('button', { name: 'Add customer', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Add customer' });
    await create.getByLabel('Business name').fill('Synthetic customer');
    await create.getByLabel('Owner name').fill('Test Owner');
    await create.getByLabel('Owner email').fill(uniqueEmail('customer'));
    await create.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await create.getByLabel('Starting credit in ₹ (optional)').fill('100');
    await create.getByRole('button', { name: 'Add customer', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Synthetic customer', exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Credit', exact: true })).toContainText(
      '₹100.00',
    );
    await page.getByRole('button', { name: 'Add credit', exact: true }).click();
    const add = page.getByRole('dialog');
    await add.getByLabel('Amount in ₹').fill('50');
    await add.getByRole('button', { name: 'Add credit', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Credit', exact: true })).toContainText(
      '₹150.00',
    );
    await page.getByRole('button', { name: 'Log in as', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByText(/Logged in as Test Owner/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Customers', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to reseller panel' }).click();
    await expect(
      page.getByRole('heading', { name: 'Synthetic customer', exact: true, level: 1 }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Take back', exact: true }).click();
    const reclaim = page.getByRole('dialog');
    await reclaim.getByLabel('Amount in ₹').fill('25');
    await reclaim.getByRole('button', { name: 'Take back', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Credit', exact: true })).toContainText(
      '₹125.00',
    );
  } finally {
    await api.dispose();
  }
});

test('admin creates an approved reseller and can view or act with sensitive actions blocked', async ({
  page,
  playwright,
}) => {
  const admin = await InboxApi.signIn(playwright, SUPERADMIN.email, SUPERADMIN.password);
  try {
    const created = await admin.post<{ id: string }>('/admin/accounts', {
      businessName: `Admin reseller ${Date.now().toString(36)}`,
      ownerName: 'Reseller Owner',
      ownerEmail: uniqueEmail('admin-reseller'),
      ownerPassword: PASSWORD,
      kind: 'reseller',
    });
    expect(created.status, created.code).toBe(201);
    await page.goto('/login');
    await page.getByLabel('Email').fill(SUPERADMIN.email);
    await page.getByLabel('Password', { exact: true }).fill(SUPERADMIN.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await page.goto(`/admin/accounts/${created.data.id}`);
    await page.getByRole('button', { name: 'Log in as', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByText(/Logged in as Reseller Owner/)).toBeVisible();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'API keys' }).click();
    await expect(page.getByRole('button', { name: 'Create API key' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to admin' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/accounts/${created.data.id}$`));
  } finally {
    await admin.dispose();
  }
});
