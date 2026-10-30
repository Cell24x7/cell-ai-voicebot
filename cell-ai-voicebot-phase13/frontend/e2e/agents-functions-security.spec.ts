import { expect, test } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { signUpOwner } from './helpers';

const SECRET = 'e2e-secret-value-4321';

test('functions: secret header masked and never sent back, metadata URL refused, bad JSON caught', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUpOwner(page, 'agentsfn');
  const agentId = await createAgentFromTemplate(page, 'Payment reminder', 'Functions E2E');
  const bodies: string[] = [];
  page.on('response', async (res) => {
    if (res.url().includes(`/api/v1/agents/${agentId}`))
      bodies.push(await res.text().catch(() => ''));
  });

  await page.getByRole('tab', { name: 'Functions' }).click();
  await page.getByRole('button', { name: 'Add function' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add function' });
  await dialog.getByLabel('Function name').fill('lookup_loan');
  await dialog
    .getByLabel('What it does (the AI reads this)')
    .fill('Looks up the loan of the customer');
  await dialog.getByLabel('URL').fill('http://169.254.169.254/latest/meta-data');
  await dialog.getByRole('button', { name: 'Add header' }).click();
  await dialog.getByLabel('Header 1 name').fill('X-Api-Key');
  await dialog.getByLabel('Header 1 value').fill(SECRET);
  await dialog.getByRole('button', { name: 'Add function' }).click();
  await expect(dialog.getByText(/This address is not allowed/)).toBeVisible();

  await dialog.getByLabel('Method').click();
  await page.getByRole('option', { name: 'POST' }).click();
  await dialog.getByLabel('Body template (JSON)').fill('{"loan": ');
  await dialog.getByLabel('URL').fill('https://api.example.com/loans');
  await dialog.getByRole('button', { name: 'Add function' }).click();
  await expect(dialog.getByText(/^Not valid JSON/)).toBeVisible();

  await dialog.getByLabel('Body template (JSON)').fill('{"loan": "{{contact.externalId}}"}');
  await dialog.getByRole('button', { name: 'Add function' }).click();
  await expect(page.getByText('Function saved')).toBeVisible();

  await page.getByRole('button', { name: 'Edit lookup_loan' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit lookup_loan' });
  await expect(edit.getByLabel('Header 1 value')).toHaveValue('••••4321');
  await edit.getByRole('button', { name: 'Cancel' }).click();

  await page.reload();
  await expect(page.getByText('lookup_loan')).toBeVisible();
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) expect(body).not.toContain(SECRET);
});
