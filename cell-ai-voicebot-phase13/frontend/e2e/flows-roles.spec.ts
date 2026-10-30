import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate, FAKE, tomorrowIst } from './agents';
import { addContact, inviteMember } from './contacts';
import {
  createFlowFromTemplate,
  expectBot,
  FLOW_UNPAID_PHONE,
  openSimulator,
  press,
  publish,
  reply,
  simulator,
} from './flows';
import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';
import { addMoney } from './wallet';

const FLOW = 'Loan recovery Roles';

/** Read-only builder: no palette, no Save / Publish, the simulator only lists history. */
async function expectReadOnlyBuilder(member: Page, reason: string) {
  await expect(member.getByText(reason)).toBeVisible();
  await expect(member.getByRole('button', { name: /^Add / })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
  await member.getByRole('button', { name: 'Simulator', exact: true }).click();
  const panel = member.getByRole('complementary', { name: 'Simulator' });
  await expect(panel.getByRole('tab', { name: 'History' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Test call' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Start test call' })).toHaveCount(0);
}

test('roles & money: AI turn bills "Flow simulator", agent in use can\'t be deleted, viewer / agent / impersonation read-only', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await signUpOwner(page, 'flowsroles');
  await addMoney(page, 500);
  await addContact(page, { phone: FLOW_UNPAID_PHONE, name: 'Unpaid Borrower' });
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', 'Roles Agent');
  const flowId = await createFlowFromTemplate(page, 'Loan recovery', FLOW, 'Roles Agent');
  await publish(page, 1);

  // an AI turn in the simulator is charged like any AI usage
  await openSimulator(page, { contactName: 'Unpaid Borrower' }, 1);
  await press(page, '3');
  await reply(page, 'kal tak de dunga');
  await expectBot(page, FAKE.promise(tomorrowIst()));
  await expect(simulator(page).getByText(/^Cost ₹0\.\d\d$/)).toBeVisible();
  await page.goto('/wallet?tab=transactions');
  await page
    .getByRole('button', { name: /Details of AI usage/ })
    .first()
    .click();
  const drawer = page.getByRole('region', { name: 'Transaction details' });
  await expect(drawer.getByText('Flow simulator')).toBeVisible();
  await page.keyboard.press('Escape');

  // the agent is used by the flow → delete is refused and names the flow
  await page.goto('/agents');
  await page.getByRole('button', { name: 'Delete Roles Agent' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(new RegExp(`Flows: ${FLOW}`))).toBeVisible();
  await expect(page.getByRole('link', { name: 'Roles Agent' })).toBeVisible();

  // viewer and agent roles only look
  for (const role of ['Viewer', 'Agent'] as const) {
    const member = await inviteMember(page, browser, role, `${role} Member`);
    await member.goto(`/flows/${flowId}`);
    await expectReadOnlyBuilder(member, 'Read-only: you can view this flow but not change it.');
    const history = member.getByRole('list', { name: 'Test call history' });
    await expect(history.getByText(/^v1 · /).first()).toBeVisible();
    await member.context().close();
  }

  // a superadmin viewing as the owner can't run test calls
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  // in-app navigation only: the impersonation token lives in memory
  await admin.getByRole('link', { name: 'Call flows' }).click();
  await admin.getByRole('link', { name: FLOW }).click();
  await expectReadOnlyBuilder(
    admin,
    'You are viewing as this account — flows cannot be changed while impersonating.',
  );
  await adminContext.close();
});
