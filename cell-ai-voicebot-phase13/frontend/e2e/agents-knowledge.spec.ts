import { expect, test } from '@playwright/test';

import { createAgentFromTemplate, createKnowledgeBase, FAKE, say, startPlayground } from './agents';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

test('knowledge: upload samples, both ready live, Try a question, answered in the playground', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'agentskb');
  await addMoney(page, 500);
  await createKnowledgeBase(page, 'Demo FAQ', ['faq.txt', 'loan-terms.docx']);

  await page.getByLabel('Question').fill('late fee kitni lagti hai?');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Result 1: Late fee');

  const agentId = await createAgentFromTemplate(page, 'Inbound support', 'Support E2E');
  await page.getByRole('tab', { name: 'Knowledge' }).click();
  await page.getByRole('combobox', { name: 'Knowledge bases' }).click();
  await page.getByRole('option', { name: /Demo FAQ/ }).click();
  await page.getByRole('button', { name: 'Save knowledge settings' }).click();
  await expect(page.getByText('Knowledge settings saved')).toBeVisible();

  await startPlayground(page, agentId, { variables: { name: 'Asha' } });
  const reply = await say(page, 'late fee kitni lagti hai?');
  await expect(reply.getByText(FAKE.lateFee, { exact: true })).toBeVisible();
  await expect(reply.getByText('From knowledge (')).toBeVisible();
});
