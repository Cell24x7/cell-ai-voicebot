import { expect, test, type Page } from '@playwright/test';

import { signUpOwner, type Owner } from './helpers';
import {
  chat,
  connectNumber,
  customerPhone,
  InboxApi,
  log,
  openConversation,
  openInbox,
  row,
} from './inbox';
import { runDevJob } from './reports';

// Phase 14: WhatsApp chat summaries on demand; chats past the account's retention go.
test.describe.configure({ mode: 'serial' });

let page: Page;
let owner: Owner;
let api: InboxApi;
let channelId: string;
const CUSTOMER = 'Meena Summary';
const phone = customerPhone();

test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(180_000);
  page = await browser.newPage();
  owner = await signUpOwner(page, 'chat-summary');
  await connectNumber(page, {
    label: 'Summary line',
    business: `E2E Summary ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  await api.fund(playwright);
  channelId = await api.channelId();
  await api.createContact(CUSTOMER, phone);
});

test.afterAll(async () => {
  await api.dispose();
  await page.close();
});

test('summarize a chat: the drawer lists the summary; nothing new → no second summary', async () => {
  test.setTimeout(120_000);
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'EMI kal tak bhar dunga' });
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'Link bhej do please' });
  await openInbox(page);
  await expect(row(page, CUSTOMER)).toBeVisible({ timeout: 20_000 });
  await openConversation(page, CUSTOMER);
  await expect(log(page).getByText('Link bhej do please')).toBeVisible();

  await chat(page, CUSTOMER).getByRole('button', { name: 'Summary' }).click();
  const drawer = page.getByRole('region', { name: 'Chat summary' });
  await drawer.getByRole('button', { name: 'Summarize new messages' }).click();
  await expect(drawer.getByText(/2 messages\. Customer: "EMI kal tak bhar dunga"/)).toBeVisible({
    timeout: 60_000,
  });
  await drawer.getByRole('button', { name: 'Summarize new messages' }).click();
  await expect(page.getByText(/no new messages to summarise/i)).toBeVisible();
  await drawer.getByRole('button', { name: 'Close summary' }).click();
});

test('a shorter chat retention deletes old messages on the nightly run', async () => {
  await page.goto('/settings/retention');
  await page.getByLabel('WhatsApp chats (days)').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await page
    .getByRole('dialog', { name: 'Delete older data?' })
    .getByRole('button', { name: 'Save and delete' })
    .click();
  await expect(page.getByText('Data retention saved')).toBeVisible();
  const purged = await runDevJob(page.request, 'inbox-retention', { daysAhead: 31 });
  expect(purged.messages).toBeGreaterThanOrEqual(2);
  await openInbox(page);
  await openConversation(page, CUSTOMER);
  await expect(log(page).getByText('Link bhej do please')).toHaveCount(0);
});
