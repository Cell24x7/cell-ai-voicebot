import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { addContact, addDnd, card, inviteMember } from './contacts';
import { signUpOwner } from './helpers';

test('do-not-call: managers add, only owners remove; opt-out survives a re-import', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'dnd');
  await addContact(page, { phone: '9000600001', name: 'Opt Out Person' });
  await addContact(page, { phone: '9000600002', name: 'Blocked Person' });
  const manager = await inviteMember(page, browser, 'Manager', 'Ravi Kumar');

  // the manager adds a number → the contact gets the badge
  await addDnd(manager, '9000600002', 'Complaint');
  await manager.goto('/contacts/all');
  await expect(
    manager.getByRole('row', { name: /Blocked Person/ }).getByText('Do not call'),
  ).toBeVisible();
  await manager.goto('/contacts/dnd');
  await expect(
    manager.getByText('Only an owner or admin can take numbers off this list.'),
  ).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Remove' })).toHaveCount(0);

  // the owner opts a contact out
  await page.goto('/contacts/all');
  await page.getByRole('link', { name: 'Opt Out Person' }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Opt out' }).click();
  await page
    .getByRole('dialog', { name: 'Opt this contact out?' })
    .getByRole('button', { name: 'Opt out' })
    .click();
  await expect(page.getByText('Opted out', { exact: true }).first()).toBeVisible();

  // re-importing the number does not undo the opt-out
  const file = testInfo.outputPath('reimport.csv');
  writeFileSync(file, 'Name,Mobile No\r\nOpt Out Person Again,09000600001\r\n');
  await page.goto('/contacts/import');
  await page.getByTestId('file-input').setInputFiles(file);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(card(page, 'On do-not-call list')).toContainText('1', { timeout: 60_000 });
  await page.getByRole('button', { name: /^Import 1 contacts$/ }).click();
  await expect(page.getByText('Import finished.')).toBeVisible({ timeout: 60_000 });
  await page.goto('/contacts/all?q=9000600001');
  const optedRow = page.getByRole('row', { name: /Opt Out Person Again/ });
  await expect(optedRow.getByText('Opted out')).toBeVisible();
  await expect(optedRow.getByText('Do not call')).toBeVisible();

  // the manager can't undo the opt-out; the owner removes the manager's DND number
  await manager.goto('/contacts/all?q=9000600001');
  await manager.getByRole('link', { name: 'Opt Out Person Again' }).click();
  await manager.getByRole('button', { name: 'More' }).click();
  await expect(manager.getByRole('menuitem', { name: 'Undo opt-out' })).toHaveCount(0);
  await manager.keyboard.press('Escape');

  await page.goto('/contacts/dnd');
  await page.getByLabel('Search numbers').fill('9000600002');
  await expect(page.getByRole('row', { name: /\+91 90006 00001/ })).toHaveCount(0);
  await page
    .getByRole('row', { name: /\+91 90006 00002/ })
    .getByRole('button', { name: 'Remove' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Number taken off the do-not-call list')).toBeVisible();
  await page.goto('/contacts/all?q=9000600002');
  await expect(page.getByRole('row', { name: /Blocked Person/ })).toBeVisible();
  await expect(
    page.getByRole('row', { name: /Blocked Person/ }).getByText('Do not call'),
  ).toHaveCount(0);
});

test('an agent can read contacts but not change, import or export them', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signUpOwner(page, 'agent');
  await addContact(page, { phone: '9000700001', name: 'Visible Borrower' });
  const agent = await inviteMember(page, browser, 'Agent', 'Meena Das');

  await agent.getByRole('link', { name: 'Contacts' }).click();
  await expect(agent.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
  await expect(agent.getByRole('link', { name: 'Visible Borrower' })).toBeVisible();
  for (const name of ['Add contact', 'Import contacts', 'Export']) {
    await expect(agent.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(agent.getByRole('link', { name: 'Import contacts' })).toHaveCount(0);
  await expect(agent.getByRole('checkbox')).toHaveCount(0);

  await agent.getByRole('link', { name: 'Visible Borrower' }).click();
  await expect(agent.getByRole('heading', { level: 1, name: 'Visible Borrower' })).toBeVisible();
  await expect(agent.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(agent.getByRole('button', { name: 'More' })).toHaveCount(0);

  await agent.goto('/contacts/fields');
  await expect(agent.getByRole('table', { name: 'Fields' })).toBeVisible();
  await expect(agent.getByRole('button', { name: 'New field' })).toHaveCount(0);
  await agent.goto('/contacts/dnd');
  await expect(agent.getByRole('button', { name: 'Add number' })).toHaveCount(0);
  await agent.goto('/contacts/import');
  await expect(agent.getByRole('heading', { level: 1, name: '403' })).toBeVisible();
});
