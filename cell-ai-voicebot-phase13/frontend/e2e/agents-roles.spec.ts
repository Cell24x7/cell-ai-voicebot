import { expect, test } from '@playwright/test';

import { createAgentFromTemplate, say, startPlayground } from './agents';
import { inviteMember } from './contacts';
import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';
import { addMoney } from './wallet';

test('roles: readers see agents read-only, impersonators cannot chat, a new AI price changes the cost', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const owner = await signUpOwner(page, 'agentsroles');
  await addMoney(page, 500);
  const agentId = await createAgentFromTemplate(page, 'Feedback survey', 'Roles E2E');
  await startPlayground(page, agentId, { variables: { name: 'Asha' } });
  const first = await say(page, 'hello');
  const firstCost = (await first.textContent()) ?? '';

  // viewer: read-only editor, no Save, no playground input
  const viewer = await inviteMember(page, browser, 'Viewer', 'Vimal Shah');
  await viewer.goto(`/agents/${agentId}/basic`);
  await expect(
    viewer.getByText('Read-only: you can view this agent but not change it.'),
  ).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await expect(viewer.getByLabel('Name')).toBeDisabled();
  await viewer.getByRole('tab', { name: 'Playground' }).click();
  await expect(viewer.getByRole('list', { name: 'Recent conversations' })).toBeVisible();
  await expect(viewer.getByRole('textbox', { name: 'Message' })).toHaveCount(0);

  // agent role reads the list
  const agent = await inviteMember(page, browser, 'Agent', 'Meena Das');
  await agent.goto('/agents');
  await expect(agent.getByRole('link', { name: 'Roles E2E' })).toBeVisible();
  await expect(agent.getByRole('button', { name: 'New agent' })).toHaveCount(0);

  // superadmin: raise the AI text price for this account, then impersonate (read-only playground)
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('tab', { name: 'Rates' }).click();
  await admin.getByRole('button', { name: /Edit rates|Set account prices/ }).click();
  const rates = admin.getByRole('dialog');
  await rates.getByLabel('AI text (₹ per 1,000 tokens)').fill('2');
  await rates.getByRole('button', { name: /Save/ }).click();
  await expect(rates).toBeHidden();
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByText(/Viewing as/)).toBeVisible();
  await admin
    .getByRole('navigation', { name: 'Main' })
    .first()
    .getByRole('link', { name: 'AI agents' })
    .click();
  await admin.getByRole('link', { name: 'Roles E2E' }).click();
  await admin.getByRole('tab', { name: 'Playground' }).click();
  await expect(
    admin.getByText(
      'You are viewing as this account — agents cannot be changed while impersonating.',
    ),
  ).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Start new conversation' })).toHaveCount(0);
  await adminContext.close();

  // the owner's next turn is priced with the new rate
  await startPlayground(page, agentId, { variables: { name: 'Asha' } });
  const second = await say(page, 'hello');
  const secondCost = (await second.textContent()) ?? '';
  const rupees = (s: string) => Number(/₹(\d+\.\d\d)/.exec(s)?.[1] ?? 0);
  expect(rupees(secondCost)).toBeGreaterThan(rupees(firstCost) * 5);
});
