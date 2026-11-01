import { expect, test, type Browser, type Page } from '@playwright/test';

import { PASSWORD } from './env';
import { signUpOwner, uniqueEmail } from './helpers';
import { extractLink, waitForEmail } from './mailpit';

/** Owner invites a member with this role; the member accepts in their own browser. */
async function inviteMember(page: Page, browser: Browser, name: string, role: string) {
  const email = uniqueEmail(role.toLowerCase());
  await page.goto('/team');
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite a team member' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Role').click();
  await page.getByRole('option', { name: role, exact: true }).click();
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
  const context = await browser.newContext();
  const member = await context.newPage();
  await member.goto(extractLink(await waitForEmail(email, /invited/i), '/accept-invite'));
  await member.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await member.getByLabel('Repeat password').fill(PASSWORD);
  await member.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(member.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  return { member, context };
}

test('Integrations by role: owners all tabs; managers Google Sheets only; agents and viewers none', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await signUpOwner(page, 'introles');
  await page.getByRole('link', { name: 'Integrations' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible();
  for (const tab of ['Webhooks', 'After the call', 'Google Sheets'])
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();

  // manager (contacts.import, no integrations.manage): Google Sheets only
  const manager = await inviteMember(page, browser, 'Mona Manager', 'Manager');
  await manager.member.getByRole('link', { name: 'Integrations' }).click();
  await expect(manager.member.getByRole('tab', { name: 'Google Sheets' })).toBeVisible();
  await expect(manager.member.getByRole('tab', { name: 'Webhooks' })).toHaveCount(0);
  await expect(manager.member.getByRole('button', { name: 'Add sheet' })).toBeVisible();
  await manager.member.goto('/integrations/webhooks');
  await expect(manager.member.getByRole('heading', { level: 1, name: '403' })).toBeVisible();
  await manager.member.goto('/settings/api-keys');
  await expect(manager.member.getByRole('button', { name: 'Create API key' })).toHaveCount(0);
  await manager.context.close();

  // agent and viewer: no Integrations at all
  for (const [name, role] of [
    ['Arun Agent', 'Agent'],
    ['Vera Viewer', 'Viewer'],
  ] as const) {
    const m = await inviteMember(page, browser, name, role);
    await expect(m.member.getByRole('link', { name: 'Integrations' })).toHaveCount(0);
    await m.member.goto('/integrations');
    await expect(m.member.getByRole('heading', { level: 1, name: '403' })).toBeVisible();
    await m.context.close();
  }
});
