import { expect, test, type Page, type Request } from '@playwright/test';

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

test('Call now without a connected SIP/WhatsApp calling number explains setup and makes no dial request', async () => {
  await openContact(BORROWER.name);
  const dialRequests: string[] = [];
  const capture = (request: Request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/v1\/(calls|whatsapp\/calls)$/.test(new URL(request.url()).pathname)
    )
      dialRequests.push(request.url());
  };
  page.on('request', capture);
  await page.getByRole('button', { name: 'Call now' }).click();
  const dialog = page.getByRole('dialog', { name: 'Call now' });
  await expect(
    dialog.getByText(
      'Connect a SIP caller number or enable calling on a supported WhatsApp number.',
    ),
  ).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Phone setup' })).toBeVisible();
  expect(dialRequests).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  page.off('request', capture);
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
