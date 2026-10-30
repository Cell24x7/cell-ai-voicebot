import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { createCampaign, setAccountWindow, todayIst } from './campaigns';
import { addContact, createField, inviteMember } from './contacts';
import { createFlowFromTemplate, publish } from './flows';
import { openAdminAccount, signInAsSuperadmin, signUpOwner, type Owner } from './helpers';
import { addMoney } from './wallet';

// Who sees and does what with campaigns (PHASE_8_PLAN §1q).
test.describe.configure({ mode: 'serial' });

const FLOW = 'Loan recovery Roles';
const AGENT = 'Roles Recovery Agent';
const CONTACTS = ['Role Borrower A', 'Role Borrower B', 'Role Borrower C'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// a window without today keeps the campaign running (waiting) for the pause test
const NOT_TODAY = ALL_DAYS.filter((d) => d !== todayIst());
let owner: Page;
let account: Owner;
let campaignId = '';

const CONTROLS = ['Pause', 'Resume', 'Cancel', 'Duplicate', 'Delete', 'Export'];
const expectReadOnly = async (page: Page) => {
  // client-side: a full reload would end an impersonation
  await page.getByRole('link', { name: 'Campaigns', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Owner run', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New campaign' })).toBeHidden();
  await page.getByRole('link', { name: 'Owner run', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Owner run' })).toBeVisible();
  await expect(page.getByLabel('Counters')).toBeVisible();
  for (const name of CONTROLS) {
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
  }
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeHidden();
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  owner = await browser.newPage();
  account = await signUpOwner(owner, 'camproles');
  await addMoney(owner, 500);
  await createField(owner, { label: 'Amount', type: 'Amount (₹)' });
  await createField(owner, { label: 'Due date', type: 'Date' });
  for (const [i, name] of CONTACTS.entries()) {
    await addContact(owner, {
      phone: `900070001${String(i)}`,
      name,
      values: { Amount: '2000', 'Due date': '2026-10-10' },
    });
  }
  await createAgentFromTemplate(owner, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(owner, 'Loan recovery', FLOW, AGENT);
  await publish(owner, 1);
  await setAccountWindow(owner, { start: '00:00', end: '23:59', days: ALL_DAYS });
  campaignId = await createCampaign(owner, {
    name: 'Owner run',
    flow: FLOW,
    contacts: CONTACTS,
    window: { days: NOT_TODAY },
    speed: 20,
  });
});

test.afterAll(async () => {
  await owner.close();
});

test('viewer: list and detail, no New, no controls, no export', async ({ browser }) => {
  const viewer = await inviteMember(owner, browser, 'Viewer', 'Vera Viewer');
  await expectReadOnly(viewer);
  await viewer.close();
});

test('agent: read-only campaigns, but Call now on a contact', async ({ browser }) => {
  const agent = await inviteMember(owner, browser, 'Agent', 'Arun Agent');
  await expectReadOnly(agent);
  await agent.goto('/contacts/all');
  await agent.getByRole('link', { name: CONTACTS[0] ?? '', exact: true }).click();
  await expect(agent.getByRole('button', { name: 'Call now' })).toBeVisible();
  await agent.close();
});

test('manager: creates and starts a campaign', async ({ browser }) => {
  test.setTimeout(120_000);
  const manager = await inviteMember(owner, browser, 'Manager', 'Mona Manager');
  await createCampaign(manager, {
    name: 'Manager run',
    flow: FLOW,
    contacts: [CONTACTS[1] ?? ''],
    // the contact is in the owner's running campaign too
    excludeActive: false,
    window: { days: NOT_TODAY },
    speed: 20,
  });
  await expect(manager.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await manager.close();
});

test('superadmin: read-only while impersonating; "Pause all campaigns" → the owner cannot resume', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = await (await browser.newContext()).newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, account.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expectReadOnly(admin);
  await admin.getByRole('button', { name: 'Stop' }).click();

  await openAdminAccount(admin, account.businessName);
  const limits = admin.getByRole('region', { name: 'Calling limits' });
  await limits.getByRole('button', { name: 'Pause all campaigns' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Pause all' }).click();
  await expect(admin.getByText(/^\d+ campaigns? paused$/)).toBeVisible();
  await expect(
    limits.getByRole('list', { name: 'Paused by the platform team' }).getByText('Owner run'),
  ).toBeVisible();

  await owner.goto(`/campaigns/${campaignId}`);
  await expect(owner.getByText('Paused — paused by the platform team')).toBeVisible();
  await expect(owner.getByText('Only the platform team can resume it.')).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Resume', exact: true })).toBeHidden();

  // the platform team lifts it
  await limits.getByRole('button', { name: 'Resume Owner run' }).click();
  await expect(admin.getByText('Campaign resumed')).toBeVisible();
  await owner.reload();
  await expect(owner.getByText('Paused — paused by the platform team')).toBeHidden();
  await admin.close();
});
