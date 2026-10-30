import { expect, test } from '@playwright/test';

import { createAgentFromTemplate, say, startPlayground } from './agents';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

test('billing: a turn adds an AI usage row with tokens; a tiny cap falls back', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'agentsbill');
  await addMoney(page, 500);
  const agentId = await createAgentFromTemplate(page, 'Feedback survey', 'Billing E2E');
  await startPlayground(page, agentId, { variables: { name: 'Asha' } });
  const reply = await say(page, 'hello');
  await expect(reply).toContainText(/₹0\.\d\d · [\d,]+ \+ \d+ tokens/);

  await page.goto('/wallet?tab=transactions');
  await page
    .getByRole('button', { name: /Details of AI usage/ })
    .first()
    .click();
  const drawer = page.getByRole('region', { name: 'Transaction details' });
  await expect(drawer.getByText('AI playground turn')).toBeVisible();
  await expect(drawer.getByText(/\d[\d,]* in · \d+ out/)).toBeVisible();
  await page.keyboard.press('Escape');

  // daily cap of ₹0.01 is already used up by the first turn
  await page.goto(`/agents/${agentId}/limits`);
  await page.getByLabel('Daily cap').fill('0.01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Agent saved')).toBeVisible();
  await startPlayground(page, agentId, { variables: { name: 'Asha' } });
  await say(page, 'hello again');
  await expect(page.getByText('This agent reached its spending cap.')).toBeVisible();
});

test('billing: an empty wallet answers with the wallet-empty message and charges nothing', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUpOwner(page, 'agentsempty');
  const agentId = await createAgentFromTemplate(page, 'Feedback survey', 'Empty wallet E2E');
  await startPlayground(page, agentId, { variables: { name: 'Asha' } });
  await say(page, 'hello');
  await expect(
    page.getByText('The wallet is empty — the agent answered with its wallet-empty message.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add money' })).toBeVisible();
  await page.goto('/wallet?tab=transactions');
  await expect(page.getByRole('button', { name: /Details of AI usage/ })).toHaveCount(0);
});
