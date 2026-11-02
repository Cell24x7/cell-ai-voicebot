import { expect, test } from '@playwright/test';

import { addContact, createField, inviteMember } from './contacts';
import { PASSWORD } from './env';
import { signUpOwner } from './helpers';

test('sensitive field: the value is hidden from a viewer and shown to the owner', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'secfield');
  await createField(page, { label: 'Loan number', type: 'Text' });
  await page.getByRole('switch', { name: 'Loan number is sensitive' }).click();
  await page.getByRole('button', { name: 'Mark sensitive' }).click();
  await expect(page.getByText('Loan number is now sensitive')).toBeVisible();
  await addContact(page, {
    phone: '9000160001',
    name: 'Sensitive Person',
    values: { 'Loan number': 'SECRET-1601' },
  });
  await page.getByRole('link', { name: 'Sensitive Person' }).click();
  await expect(page.getByText('SECRET-1601')).toBeVisible();

  const viewer = await inviteMember(page, browser, 'Viewer', 'Vani Rao');
  await viewer.goto('/contacts/all');
  await viewer.getByRole('link', { name: 'Sensitive Person' }).click();
  await expect(viewer.getByRole('heading', { name: 'Sensitive Person' })).toBeVisible();
  await expect(viewer.getByText('SECRET-1601')).toHaveCount(0);
});

test('erase: gone from the list for good, and a viewer has no erase action', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'secerase');
  await addContact(page, { phone: '9000160002', name: 'Erase Me' });
  await page.goto('/contacts/all');
  await page
    .getByRole('row', { name: /Erase Me/ })
    .getByRole('checkbox')
    .check();
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Erase permanently' }).click();
  const dialog = page.getByRole('dialog', { name: /permanently\?/ });
  await dialog.getByLabel('Type ERASE to confirm').fill('ERASE');
  await dialog.getByRole('button', { name: /Erase/ }).click();
  await expect(page.getByText(/erased$/)).toBeVisible({ timeout: 30_000 });
  await page.goto('/contacts/all');
  await expect(page.getByText('Erase Me')).toHaveCount(0);

  await addContact(page, { phone: '9000160003', name: 'Stays Here' });
  const viewer = await inviteMember(page, browser, 'Viewer', 'Vani Rao');
  await viewer.goto('/contacts/all');
  await expect(viewer.getByText('Stays Here')).toBeVisible();
  await expect(viewer.getByRole('checkbox')).toHaveCount(0);
});

test('account: export, delete, banner and cancel; a manager sees none of it', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const owner = await signUpOwner(page, 'secaccount');
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Export all data' }).click();
  const exporting = page.getByRole('dialog', { name: 'Export all data' });
  await exporting.getByLabel('Your password').fill(PASSWORD);
  await exporting.getByRole('button', { name: 'Start export' }).click();
  await expect(exporting).toBeHidden();
  await expect(page.getByRole('button', { name: 'Download latest export' })).toBeVisible({
    timeout: 90_000,
  });

  await page.getByRole('button', { name: 'Delete account' }).click();
  const deleting = page.getByRole('dialog', { name: 'Delete this account?' });
  await deleting.getByLabel(/^Type /).fill(owner.businessName);
  await deleting.getByLabel('Your password').fill(PASSWORD);
  await deleting.getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByText('Your account will be deleted in 7 days')).toBeVisible();
  await expect(page.getByText(/This account will be deleted on/).first()).toBeVisible();
  await page
    .getByRole('button', { name: /Cancel deletion|Keep/ })
    .first()
    .click();
  await expect(page.getByText('Deletion canceled')).toBeVisible();
  await expect(page.getByText(/This account will be deleted on/)).toHaveCount(0);

  const manager = await inviteMember(page, browser, 'Manager', 'Ravi Kumar');
  await manager.goto('/settings/account');
  await expect(manager.getByRole('button', { name: 'Export all data' })).toHaveCount(0);
  await expect(manager.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
});
