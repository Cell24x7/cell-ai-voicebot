import { expect, test, type Page } from '@playwright/test';

import { signUpOwner } from './helpers';
import {
  bubble,
  chat,
  connectNumber,
  customerPhone,
  InboxApi,
  log,
  openConversation,
  openInbox,
  row,
} from './inbox';

// Opt-out / opt-in keywords (English, Hinglish, Hindi; exact messages only) with
// auto-confirmations, 90-day retention, and a coexistence number (Business app
// echoes, imported history, contacts sync).
test.describe.configure({ mode: 'serial' });

let page: Page;
let api: InboxApi;
let channelId: string;
const CUSTOMER = 'Farhan Optout';
const phone = customerPhone();
const OPT_OUT_REPLY = /won't get more messages from us/;

const optedOutBanner = () => page.getByText('This customer opted out — replies only');
const autoReplies = () =>
  log(page).locator('[data-message-id]').filter({ hasText: 'Automatic reply' });

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  const owner = await signUpOwner(page, 'inboxopt');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Opt ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  // Phase 11: replies are held from the wallet
  await api.fund(playwright);
  channelId = await api.channelId();
  await api.createContact(CUSTOMER, phone);
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'Hi, mujhe loan chahiye' });
  await openInbox(page);
  await openConversation(page, CUSTOMER);
});
test.afterAll(async () => {
  await api.dispose();
  await page.close();
});

test('STOP → opted out (+ DND on the contact) with a confirmation; START → back with its confirmation', async () => {
  await api.simulate(channelId, 'inbound_stop', { from: phone });
  await expect(optedOutBanner()).toBeVisible({ timeout: 20_000 });
  await expect(autoReplies()).toHaveCount(1, { timeout: 20_000 });
  await expect(autoReplies().first()).toContainText(OPT_OUT_REPLY);
  // replies are still allowed inside the window
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  const details = page.getByRole('region', { name: 'Contact details' });
  await expect(details.getByText('Opted out')).toBeVisible({ timeout: 20_000 });

  await api.simulate(channelId, 'inbound_start', { from: phone });
  await expect(optedOutBanner()).toBeHidden({ timeout: 20_000 });
  await expect(autoReplies()).toHaveCount(2, { timeout: 20_000 });
});

test('"band karo" and "बंद करो" opt out once; "SHURU" opts in; a sentence never counts', async () => {
  await api.simulate(channelId, 'inbound_stop_hinglish', { from: phone });
  await expect(optedOutBanner()).toBeVisible({ timeout: 20_000 });
  await api.simulate(channelId, 'inbound_stop_hindi', { from: phone });
  await expect(log(page).getByText('बंद करो')).toBeVisible({ timeout: 20_000 });
  const confirmations = await autoReplies().count();
  // already opted out: no second confirmation
  await page.waitForTimeout(1_500);
  await expect(autoReplies()).toHaveCount(confirmations);

  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'SHURU' });
  await expect(optedOutBanner()).toBeHidden({ timeout: 20_000 });

  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'mera order band karo mat' });
  await expect(log(page).getByText('mera order band karo mat')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await expect(optedOutBanner()).toBeHidden();
});

test('retention: messages older than 90 days are deleted, newer stay; the list preview follows', async () => {
  const conv = await api.conversationOf(phone);
  await api.simulate(channelId, 'age_messages', { conversationId: conv.id, days: 91 });
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'Naya sawaal' });
  await expect(log(page).getByText('Naya sawaal')).toBeVisible({ timeout: 20_000 });
  await api.simulate(channelId, 'run_retention');
  await expect
    .poll(
      async () =>
        (
          await api.get<{ text: string | null }[]>(
            `/inbox/conversations/${conv.id}/messages?limit=100`,
          )
        ).data.map((m) => m.text),
      { timeout: 20_000 },
    )
    .toEqual(['Naya sawaal']);
  await page.reload();
  await expect(chat(page, CUSTOMER)).toBeVisible();
  await expect(log(page).getByText('Naya sawaal')).toBeVisible();
  await expect(log(page).getByText('Hi, mujhe loan chahiye')).toBeHidden();
  await expect(row(page, CUSTOMER).getByText('Naya sawaal')).toBeVisible();
});

test('coexistence number: contacts sync, Business app echoes, imported history without unread', async () => {
  await connectNumber(page, {
    label: 'Shop phone',
    business: `E2E Coex ${Date.now().toString(36)}`,
    mode: 'coexistence',
  });
  const coex = await api.channelId('Shop phone');
  await api.simulate(coex, 'contacts_sync');
  await expect
    .poll(
      async () => (await api.get<{ name: string }[]>('/contacts?q=Test%20Customer')).data.length,
      {
        timeout: 20_000,
      },
    )
    .toBeGreaterThan(0);

  await api.simulate(coex, 'echo_text');
  await api.simulate(coex, 'history_chunk');
  await openInbox(page);
  await openConversation(page, 'Test Customer');
  const echo = bubble(page, 'Test reply from the business phone');
  await expect(echo.getByText('Sent from the WhatsApp Business app')).toBeVisible({
    timeout: 20_000,
  });
  const old = bubble(page, 'Test old message');
  await expect(old.getByText('Imported history')).toBeVisible({ timeout: 20_000 });
  await expect(row(page, 'Test Customer').getByLabel(/unread/)).toBeHidden();
});
