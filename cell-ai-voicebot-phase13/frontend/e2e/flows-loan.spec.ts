import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate, FAKE, tomorrowIst } from './agents';
import { addContact } from './contacts';
import {
  createFlowFromTemplate,
  expectBot,
  expectOutcome,
  FLOW_PAID_PHONE,
  FLOW_UNPAID_PHONE,
  LOAN,
  node,
  openSimulator,
  press,
  publish,
  reply,
  silence,
  simulator,
} from './flows';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

// One account + flow for every branch; each branch is its own short test.
test.describe.configure({ mode: 'serial' });

let page: Page;
let flowId = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  await signUpOwner(page, 'flowsloan');
  await addMoney(page, 500);
  await addContact(page, { phone: FLOW_PAID_PHONE, name: 'Paid Borrower' });
  await addContact(page, { phone: FLOW_UNPAID_PHONE, name: 'Unpaid Borrower' });
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', 'Recovery Flow Agent');
});

test.afterAll(async () => {
  await page.close();
});

test('"Done when": Loan recovery from the template has no errors and publishes v1', async () => {
  flowId = await createFlowFromTemplate(
    page,
    'Loan recovery',
    'Loan recovery E2E',
    'Recovery Flow Agent',
  );
  await expect(page.getByRole('button', { name: /^0 errors · \d+ warnings?$/ })).toBeVisible();
  await expect(node(page, 'menu')).toContainText('Main menu');
  await publish(page, 1);
});

test('paid contact: press 1 → payment found → Paid → goodbye', async () => {
  await page.goto(`/flows/${flowId}`);
  await openSimulator(page, { contactName: 'Paid Borrower' }, 1);
  await expectBot(
    page,
    /^Namaste Paid Borrower, main .+ ki taraf se ek AI assistant bol rahi hoon\./,
  );
  await expectBot(page, LOAN.menu);
  await expect(node(page, 'menu')).toHaveAttribute('data-highlighted', 'true');
  await press(page, '1');
  await expectBot(page, LOAN.paid);
  await expectBot(page, LOAN.bye);
  await expect(simulator(page).getByText('Hung up by the flow')).toBeVisible();
  await expectOutcome(page, 'Disposition: Paid');
});

test('unpaid contact: press 1 → not in record → AI takes a promise for tomorrow', async () => {
  await openSimulator(page, { contactName: 'Unpaid Borrower' }, 1);
  await press(page, '1');
  await expectBot(page, LOAN.notFound);
  await expect(node(page, 'ai')).toHaveAttribute('data-highlighted', 'true');
  await reply(page, 'kal tak de dunga');
  await expectBot(page, FAKE.promise(tomorrowIst()));
  await expectBot(page, LOAN.promise(tomorrowIst()));
  await expectBot(page, LOAN.bye);
  await expectOutcome(page, 'Disposition: Promise to pay');
});

test('press 2 → payment link SMS queued → Promise to pay', async () => {
  await openSimulator(page, { contactName: 'Unpaid Borrower' }, 1);
  await press(page, '2');
  await expect(
    simulator(page).getByText(/^SMS: .+: Aapki EMI ka payment link https:\/\/pay\.example\.com\//),
  ).toBeVisible();
  await expectBot(page, LOAN.linkSent);
  await expectBot(page, LOAN.bye);
  await expectOutcome(page, 'Disposition: Promise to pay');
});

test('press 3 → AI agent → "kal tak de dunga" → promise exit', async () => {
  await openSimulator(page, { contactName: 'Unpaid Borrower' }, 1);
  await press(page, '3');
  await reply(page, 'kal tak de dunga');
  await expectBot(page, FAKE.promise(tomorrowIst()));
  await expect(simulator(page).getByText('Hung up by the flow')).toBeVisible();
  await expect(simulator(page).getByText(/^Cost ₹/)).toBeVisible();
});

test('no input ×3 → callback; wrong key ×3 → callback; highlight follows', async () => {
  await openSimulator(page, { contactName: 'Paid Borrower' }, 1);
  await silence(page);
  await silence(page);
  await silence(page);
  await expectBot(page, LOAN.callback);
  await expectOutcome(page, 'Disposition: Callback requested');

  await openSimulator(page, { contactName: 'Paid Borrower' }, 1);
  await press(page, '9');
  await press(page, '8');
  await expect(node(page, 'menu')).toHaveAttribute('data-highlighted', 'true');
  await press(page, '7');
  await expectBot(page, LOAN.callback);
  await expect(node(page, 'menu')).not.toHaveAttribute('data-highlighted', 'true');
});
