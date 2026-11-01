import { expect, test, type Page } from '@playwright/test';

import { callEnded, openCallDetail, startWebCall } from './calls';
import { addContact } from './contacts';
import { addNodeFromPalette, connect, createFlowFromTemplate, publish } from './flows';
import { signUpOwner } from './helpers';
import { connectNumber, log } from './inbox';
import { createTemplateUI, openTemplates, templateRow } from './templates';
import { addMoney } from './wallet';

// the builder is a desktop tool
test.use({ viewport: { width: 1600, height: 1000 } });

const card = (page: Page, label: string) => page.locator(`[aria-label="${label}"]`);
const TEMPLATE = 'flow_step_hello';
const FLOW = 'Send WhatsApp flow';
const CUSTOMER = 'Flow Borrower';

test('a flow "Send WhatsApp" step with a picked template sends after the call and shows on the call page', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signUpOwner(page, 'flowwa');
  await addMoney(page, 500);
  await addContact(page, { phone: '9000400012', name: CUSTOMER, values: {} });
  await connectNumber(page, { label: 'Flow line', business: 'Flow Biz' });
  await openTemplates(page);
  await createTemplateUI(page, {
    name: TEMPLATE,
    parts: ['Namaste ', ', here is your update.'],
    samples: ['Asha'],
  });
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(templateRow(page, TEMPLATE)).toContainText('Approved', { timeout: 30_000 });

  // Start → Send WhatsApp → Hang up
  await createFlowFromTemplate(page, 'Blank flow', FLOW);
  await card(page, 'Hang up (Hang up)').click();
  const inspector = page.getByRole('complementary', { name: 'Step settings' });
  await inspector.getByRole('button', { name: 'Delete' }).click();
  await addNodeFromPalette(page, 'Send WhatsApp');
  await inspector.getByRole('combobox', { name: 'Approved template' }).click();
  await page.getByRole('option', { name: new RegExp(`^${TEMPLATE} `) }).click();
  await expect(inspector.getByText('Needs 1 parameter(s)')).toBeVisible();
  await expect(inspector.getByLabel('Template name')).toHaveValue(TEMPLATE);
  await inspector.getByRole('button', { name: 'Add parameter' }).click();
  await inspector.getByRole('textbox', { name: 'Parameter 1' }).fill('{{name}}');
  await addNodeFromPalette(page, 'Hang up');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Auto-layout' }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Fit to screen' }).click();
  const step = card(page, 'Send WhatsApp (Send WhatsApp)');
  await connect(page, card(page, 'Start (Start)'), 'Start: Next', step);
  await connect(page, step, 'Send WhatsApp: Next', card(page, 'Hang up (Hang up)'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved · revision \d+$/)).toBeVisible();
  await publish(page, 1);

  await startWebCall(page, { flow: { name: FLOW, version: 'published' }, contactName: CUSTOMER });
  await callEnded(page);
  await openCallDetail(page);
  const callUrl = page.url();

  const after = page.getByRole('region', { name: 'After the call' });
  await expect(async () => {
    await page.goto(callUrl);
    await expect(after.getByText('Sent', { exact: true })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });
  await expect(after.getByText(/Flow step/)).toBeVisible();
  await after.getByRole('link', { name: 'Open the chat' }).click();
  await expect(log(page).getByText(new RegExp(`Namaste ${CUSTOMER}`))).toBeVisible({
    timeout: 20_000,
  });
});
