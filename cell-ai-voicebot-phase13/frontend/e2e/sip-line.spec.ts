import { expect, test } from '@playwright/test';

import { PASSWORD } from './env';
import { signInAsSuperadmin, uniqueEmail } from './helpers';

/** Phase 18: a superadmin adds a caller-ID number, gives it to an account and moves the account to the phone line. */
test('a superadmin gives a caller number and the phone line to an account', async ({ page }) => {
  const business = `Sip Line ${Date.now().toString(36)}`;
  const number = `+911600${String(Date.now()).slice(-6)}`;
  await signInAsSuperadmin(page);

  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: 'Add account' }).click();
  const create = page.getByRole('dialog', { name: 'Add account' });
  await create.getByLabel('Business name').fill(business);
  await create.getByLabel('Owner name').fill('Ravi Iyer');
  await create.getByLabel('Owner email').fill(uniqueEmail('sipline'));
  await create.getByLabel('Owner password').fill(PASSWORD);
  await create.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: business })).toBeVisible();
  const accountUrl = page.url();

  await page.goto('/admin/phone-numbers');
  await page.getByRole('button', { name: 'Add number' }).click();
  const add = page.getByRole('dialog', { name: 'Add a number' });
  await add.getByLabel('Number').fill(number);
  await add.getByRole('button', { name: 'Add' }).click();
  const row = page.getByRole('row').filter({ hasText: number });
  await expect(row).toContainText('In the pool');
  await row.getByRole('button', { name: 'Give' }).click();
  const give = page.getByRole('dialog');
  await give.getByLabel('Account').click();
  await page.getByRole('option', { name: business }).click();
  await give.getByRole('button', { name: 'Give' }).click();
  await expect(row).toContainText(business);

  await page.goto(accountUrl);
  const card = page.getByRole('region', { name: 'Phone line' });
  await expect(card).toContainText('Test line');
  await expect(card).toContainText(number);
  await card.getByRole('button', { name: 'Move to the phone line' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
  await expect(card).toContainText('Live: campaigns and Call now dial real phones');
});
