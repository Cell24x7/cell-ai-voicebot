import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { setAccountWindow } from './campaigns';
import { addContact, addDnd, createField } from './contacts';
import { createFlowFromTemplate, publish } from './flows';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

// "Call now" from a contact: the dry-run line, the dial guard's words, the browser tester.
test.describe.configure({ mode: 'serial' });

const FLOW = 'Loan recovery Call now';
const AGENT = 'Call now Recovery Agent';
const BORROWER = { phone: '9000600012', name: 'Call Now Borrower' };
const DND = { phone: '9000600014', name: 'Blocked Borrower' };
let page: Page;

const openContact = async (name: string) => {
  await page.goto('/contacts/all');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
};

const callNow = async () => {
  await page.getByRole('button', { name: 'Call now' }).click();
  const dialog = page.getByRole('dialog', { name: 'Call now' });
  await expect(dialog.getByText(/Simulated call — no phone line yet/)).toBeVisible();
  await dialog.getByLabel('Flow', { exact: true }).click();
  await page.getByRole('option', { name: `${FLOW} (v1)` }).click();
  await dialog.getByRole('button', { name: 'Call', exact: true }).click();
  return dialog;
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  await signUpOwner(page, 'callnow');
  await addMoney(page, 500);
  await createField(page, { label: 'Amount', type: 'Amount (₹)' });
  await createField(page, { label: 'Due date', type: 'Date' });
  await addContact(page, { ...BORROWER, values: { Amount: '2500', 'Due date': '2026-10-10' } });
  await addContact(page, { ...DND, values: { Amount: '1800', 'Due date': '2026-10-12' } });
  await addDnd(page, DND.phone);
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(page, 'Loan recovery', FLOW, AGENT);
  await publish(page, 1);
  await setAccountWindow(page, { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] });
});

test.afterAll(async () => {
  await page.close();
});

test('Call now → the simulated call completes → its page has the transcript and says "Simulated call"', async () => {
  test.setTimeout(150_000);
  await openContact(BORROWER.name);
  const dialog = await callNow();
  await expect(dialog.getByText('Completed', { exact: true })).toBeVisible({ timeout: 120_000 });
  await dialog.getByRole('link', { name: 'Open the call' }).click();
  await page.waitForURL(/\/calls\/[0-9a-f]{24}$/);
  await expect(page.getByText('Simulated call', { exact: true })).toBeVisible();
  // the simulated customer varies (one hangs up early), the transcript is always there
  await expect(page.getByRole('region', { name: 'Transcript' })).toBeVisible();
  // the contact now has a call in its history
  await openContact(BORROWER.name);
  await expect(
    page.getByRole('region', { name: 'Call history' }).getByText(/^1 call · last/),
  ).toBeVisible();
});

test('a do-not-call contact is refused in words', async () => {
  await openContact(DND.name);
  const dialog = await callNow();
  await expect(
    dialog.getByText("This contact can't be called right now. On the do-not-call list."),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
});

test('"Test in browser" opens the tester with the contact selected', async () => {
  await openContact(BORROWER.name);
  await page.getByRole('link', { name: 'Test in browser' }).click();
  await page.waitForURL(/\/calls\/test\?contactId=[0-9a-f]{24}$/);
  await expect(page.getByRole('radio', { name: 'A contact' })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Contact' })).toHaveValue(
    `${BORROWER.name} · ••••0012`,
  );
});
