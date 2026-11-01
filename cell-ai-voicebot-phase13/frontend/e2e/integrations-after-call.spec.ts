import { expect, test } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { callEnded, expectBotLine, openCallDetail, pressKey, startWebCall } from './calls';
import { addContact, createField } from './contacts';
import { createFlowFromTemplate, FLOW_PAID_PHONE, LOAN, publish } from './flows';
import { signUpOwner } from './helpers';
import { connectNumber, log } from './inbox';
import { addDevReceiverWebhook, devReceipts } from './integrations';
import { createTemplateUI, openTemplates, templateRow } from './templates';
import { addMoney } from './wallet';

const FLOW = 'Loan recovery After Call';
const AGENT = 'After Call Agent';
const TEMPLATE = 'after_call_thanks';
const RULE = 'Thank after every call';
const CUSTOMER = 'Rule Borrower';

test('a real call: signed call.completed to the dev receiver; an after-the-call rule sends the template to the chat and the call page', async ({
  page,
  request,
}) => {
  test.setTimeout(420_000);
  await signUpOwner(page, 'aftercall');
  await addMoney(page, 500);
  await createField(page, { label: 'Amount', type: 'Amount (₹)' });
  await createField(page, { label: 'Due date', type: 'Date' });
  await addContact(page, {
    phone: FLOW_PAID_PHONE,
    name: CUSTOMER,
    values: { Amount: '2500', 'Due date': '2026-10-10' },
  });
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(page, 'Loan recovery', FLOW, AGENT);
  await publish(page, 1);

  await connectNumber(page, { label: 'After call line', business: 'After Call Biz' });
  await openTemplates(page);
  await createTemplateUI(page, {
    name: TEMPLATE,
    parts: ['Namaste ', ', thank you for your time.'],
    samples: ['Asha'],
  });
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(templateRow(page, TEMPLATE)).toContainText('Approved', { timeout: 30_000 });

  await addDevReceiverWebhook(page);

  // the rule, with a live preview from sample values
  await page.goto('/integrations/after-call');
  await page.getByRole('button', { name: 'Add rule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an after-the-call rule' });
  await dialog.getByLabel('Name').fill(RULE);
  await dialog.getByRole('combobox', { name: 'Approved template' }).click();
  await page.getByRole('option', { name: new RegExp(`^${TEMPLATE} `) }).click();
  await dialog.getByLabel('Field key').fill('name');
  await expect(
    dialog.getByLabel('Preview with sample values').getByText(/Namaste Asha/),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Rule added')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`^${RULE}`) })).toContainText(
    'After every call',
  );

  // a real (fake voice) call with the contact
  await startWebCall(page, { flow: { name: FLOW, version: 'published' }, contactName: CUSTOMER });
  await expectBotLine(page, LOAN.menu);
  await pressKey(page, '1');
  await expectBotLine(page, LOAN.bye);
  await callEnded(page);
  await openCallDetail(page);
  const callUrl = page.url();

  // the receiver got call.completed and the signature verified
  await expect
    .poll(
      async () =>
        (await devReceipts(request)).some((r) => r.type === 'call.completed' && r.verified),
      { timeout: 60_000 },
    )
    .toBe(true);

  // the rule runs when the insights settle: the card shows it sent, and the chat has it
  const card = page.getByRole('region', { name: 'After the call' });
  await expect(async () => {
    await page.goto(callUrl);
    await expect(card.getByText('Sent', { exact: true })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 180_000, intervals: [10_000] });
  await expect(card.getByText(new RegExp(`Rule "${RULE}"`))).toBeVisible();
  await card.getByRole('link', { name: 'Open the chat' }).click();
  await expect(log(page).getByText(new RegExp(`Namaste ${CUSTOMER}`))).toBeVisible({
    timeout: 20_000,
  });

  // the delivery log has the real event
  await page.goto('/integrations/webhooks');
  await page.getByRole('button', { name: 'Deliveries' }).click();
  await expect(
    page
      .getByRole('dialog', { name: /^Deliveries — / })
      .getByRole('row', { name: /call\.completed/ })
      .first(),
  ).toContainText('Delivered', { timeout: 20_000 });
});
