import { expect, test } from '@playwright/test';

import {
  createAgentFromTemplate,
  FAKE,
  PAID_PHONE,
  say,
  startPlayground,
  tomorrowIst,
  UNPAID_PHONE,
} from './agents';
import { addContact } from './contacts';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

test('"Done when": the agent checks the mock API — paid thanks, unpaid takes a promise', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'agentsdone');
  await addMoney(page, 500);
  await addContact(page, { phone: PAID_PHONE, name: 'Paid Borrower' });
  await addContact(page, { phone: UNPAID_PHONE, name: 'Unpaid Borrower' });

  const agentId = await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', 'Recovery E2E');

  // the template function points at the mock API; its Test button answers "paid" for an even phone
  await page.getByRole('tab', { name: 'Functions' }).click();
  await expect(page.getByText('check_payment_status')).toBeVisible();
  await page.getByRole('button', { name: 'Test check_payment_status' }).click();
  const test1 = page.getByRole('dialog', { name: 'Test check_payment_status' });
  await test1.getByRole('textbox', { name: 'Test phone' }).fill(`+91${PAID_PHONE}`);
  await test1.getByRole('button', { name: 'Run test' }).click();
  await expect(test1.getByText('HTTP 200')).toBeVisible();
  await expect(test1.getByLabel('Function result')).toContainText('"status": "paid"');
  await test1.getByRole('button', { name: 'Close' }).click();

  // paid contact
  await startPlayground(page, agentId, { contactName: 'Paid Borrower' });
  await expect(page.getByText('Test mode — fake AI')).toBeVisible();
  const paid = await say(page, 'maine pay kar diya');
  await expect(paid.getByText(FAKE.paid)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tool check_payment_status' })).toBeVisible();

  // unpaid contact → promise for tomorrow
  await startPlayground(page, agentId, { contactName: 'Unpaid Borrower' });
  const unpaid = await say(page, 'maine pay kar diya');
  await expect(unpaid.getByText(FAKE.unpaid, { exact: true })).toBeVisible();
  const promise = await say(page, 'kal tak de dunga');
  await expect(promise.getByText(FAKE.promise(tomorrowIst()), { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Tool save_promise_to_pay' })
      .getByText('Simulated', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Outcome' })).toContainText(
    `Promise to pay${tomorrowIst()}`,
  );
});
