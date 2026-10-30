import { readFile, writeFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { addContact } from './contacts';
import {
  expectBot,
  FLOW_PAID_PHONE,
  FLOW_UNPAID_PHONE,
  openSimulator,
  reply,
  simulator,
} from './flows';
import { signUpOwner } from './helpers';

test.use({ viewport: { width: 1600, height: 1000 } });

const MOCK = 'http://localhost:5100/api/v1/mock';
const SECRET = 'Bearer e2e-header-secret-4821';

const n = (id: string, type: string, label: string, x: number, y: number, config = {}) => ({
  id,
  type,
  label,
  position: { x, y },
  config,
});
const e = (source: string, sourceHandle: string, target: string) => ({
  id: `e_${source}_${sourceHandle}`,
  source,
  sourceHandle,
  target,
});

/** Listen (2 intents) → API → condition on the saved status; a 500 API takes its failure edge. */
const LOGIC_FLOW = {
  format: 'cell-ai-flow',
  schemaVersion: 1,
  name: 'Logic E2E',
  graph: {
    schemaVersion: 1,
    nodes: [
      n('start', 'start', 'Start', 0, 0),
      n('ask', 'gather_speech', 'Ask', 0, 150, {
        prompt: { kind: 'speak', text: 'Kya aapne payment kar diya?' },
        intents: [
          { id: 'paid', label: 'Paid', keywords: ['pay kar diya', 'paid'] },
          { id: 'later', label: 'Later', keywords: ['baad mein'] },
        ],
      }),
      n('check', 'api_request', 'Check payment', -300, 320, {
        method: 'GET',
        url: `${MOCK}/payment-status?phone={{contact.phone}}`,
        saveResponse: [{ path: 'status', variable: 'payment_status' }],
      }),
      n('router', 'condition_router', 'Paid?', -300, 480, {
        rules: [
          {
            id: 'paid',
            label: 'Paid',
            conditions: [{ variable: 'payment_status', operator: 'equals', value: 'paid' }],
          },
        ],
      }),
      n('ok', 'speak', 'Confirmed', -450, 640, { text: 'Payment confirmed.' }),
      n('pending', 'speak', 'Pending', -150, 640, { text: 'Payment pending.' }),
      n('broken', 'api_request', 'Broken API', 300, 320, {
        method: 'GET',
        url: `${MOCK}/http-status/500`,
      }),
      n('failed', 'speak', 'Failed', 300, 480, { text: 'Server error branch.' }),
      n('bye', 'hangup', 'Bye', 0, 800, { text: 'Bye.' }),
    ],
    edges: [
      e('start', 'next', 'ask'),
      e('ask', 'intent_paid', 'check'),
      e('ask', 'intent_later', 'broken'),
      e('ask', 'no_match', 'bye'),
      e('check', 'success', 'router'),
      e('check', 'failure', 'failed'),
      e('router', 'rule_paid', 'ok'),
      e('router', 'else', 'pending'),
      e('ok', 'next', 'bye'),
      e('pending', 'next', 'bye'),
      e('broken', 'success', 'bye'),
      e('broken', 'failure', 'failed'),
      e('failed', 'next', 'bye'),
    ],
    variables: [{ name: 'payment_status', type: 'text' }],
  },
};

const card = (page: Page, label: string) => page.locator(`[aria-label="${label}"]`);
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });

test('logic: speech intents, API + condition on the response, 500 failure edge, blocked URL, secret header never exported', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  await signUpOwner(page, 'flowslogic');
  await addContact(page, { phone: FLOW_PAID_PHONE, name: 'Paid Borrower' });
  await addContact(page, { phone: FLOW_UNPAID_PHONE, name: 'Unpaid Borrower' });

  const file = info.outputPath('logic-flow.json');
  await writeFile(file, JSON.stringify(LOGIC_FLOW));
  await page.goto('/flows');
  await page.getByLabel('Flow JSON file').setInputFiles(file);
  await expect(page.getByText('Imported "Logic E2E"')).toBeVisible();
  await page.waitForURL(/\/flows\/[0-9a-f]{24}$/);
  await expect(page.getByRole('button', { name: /^0 errors/ })).toBeVisible();

  // intent "Paid" → API says paid → rule "Paid"
  await openSimulator(page, { contactName: 'Paid Borrower' });
  await expectBot(page, 'Kya aapne payment kar diya?');
  await reply(page, 'haan maine pay kar diya');
  await expectBot(page, 'Payment confirmed.');
  await expectBot(page, 'Bye.');

  // unpaid → Else
  await openSimulator(page, { contactName: 'Unpaid Borrower' });
  await reply(page, 'paid');
  await expectBot(page, 'Payment pending.');

  // intent "Later" → the 500 API takes its Failure edge
  await openSimulator(page, { contactName: 'Paid Borrower' });
  await reply(page, 'baad mein karunga');
  await expectBot(page, 'Server error branch.');
  await expect(simulator(page).getByText('Hung up by the flow')).toBeVisible();
  await simulator(page).getByRole('button', { name: 'Close simulator' }).click();

  // a secret header is stored sealed and never exported
  await card(page, 'Check payment (API request)').click();
  await inspector(page).getByRole('button', { name: 'Add header' }).click();
  await inspector(page).getByLabel('Header name').fill('Authorization');
  await inspector(page).getByRole('button', { name: 'Make it secret' }).click();
  await inspector(page).getByLabel('Secret value').fill(SECRET);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Unsaved changes')).toBeHidden();
  await page.reload();
  await card(page, 'Check payment (API request)').click();
  await expect(inspector(page).getByRole('button', { name: 'Replace' })).toBeVisible();
  await expect(page.getByText(SECRET)).toHaveCount(0);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Export JSON' }).click();
  const exported = await readFile(await (await downloading).path(), 'utf8');
  expect(exported).toContain('Authorization');
  expect(exported).not.toContain(SECRET);
  expect(exported).not.toContain('e2e-header-secret');

  // a cloud-metadata address is refused before anything runs
  await inspector(page).getByLabel('URL').fill('http://169.254.169.254/latest/meta-data');
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(
    page.getByRole('list', { name: 'Problems' }).getByText(/This address is not allowed\./),
  ).toBeVisible();
  await expect(inspector(page).getByText(/This address is not allowed\./)).toBeVisible();
});
