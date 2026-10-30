import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { signUpOwner } from './helpers';
import {
  bubble,
  chat,
  connectNumber,
  customerPhone,
  expectTicks,
  InboxApi,
  log,
  openConversation,
  openInbox,
  sendText,
} from './inbox';

// Window closed → banner + notes + 409; a new message reopens it. Delivery knobs:
// undeliverable (00009) fails with Retry, never-read (00008) stays ✓✓,
// throughput (00006) still delivers, window closed at Meta (00007) fails.
test.describe.configure({ mode: 'serial' });

let page: Page;
let api: InboxApi;
let channelId: string;

const customers = {
  window: { name: 'Meena Window', phone: customerPhone() },
  failed: { name: 'Karan Undeliverable', phone: customerPhone('00009') },
  unread: { name: 'Pooja Neverread', phone: customerPhone('00008') },
  slow: { name: 'Sunil Throughput', phone: customerPhone('00006') },
  closed: { name: 'Neha Metaclosed', phone: customerPhone('00007') },
};

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  const owner = await signUpOwner(page, 'inboxwin');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Win ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  // Phase 11: replies are held from the wallet
  await api.fund(playwright);
  channelId = await api.channelId();
  for (const c of Object.values(customers)) {
    await api.createContact(c.name, c.phone);
    await api.simulate(channelId, 'inbound_text', { from: c.phone, text: `Hello from ${c.name}` });
  }
  await openInbox(page);
});
test.afterAll(async () => {
  await api.dispose();
  await page.close();
});

test('window closed: banner, notes only, API 409; the customer writes → open again', async () => {
  const c = customers.window;
  await openConversation(page, c.name);
  const conv = await api.conversationOf(c.phone);
  await api.simulate(channelId, 'window_expired', { conversationId: conv.id });
  await page.reload();
  await expect(chat(page, c.name)).toBeVisible();
  await expect(page.getByText(/The 24-hour window is closed\./)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeHidden();
  await expect(chat(page, c.name).getByLabel('Window Closed')).toBeVisible();

  await page.getByRole('button', { name: 'Write an internal note' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Called her, will follow up');
  await page.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(bubble(page, 'Called her, will follow up').getByText('Internal note')).toBeVisible();

  const refused = await api.post(`/inbox/conversations/${conv.id}/messages`, {
    clientId: randomUUID(),
    type: 'text',
    text: 'Too late',
  });
  expect(refused.status).toBe(409);
  expect(refused.code).toMatch(/^WHATSAPP_WINDOW_CLOSED/);

  await api.simulate(channelId, 'inbound_text', { from: c.phone, text: 'Main wapas aa gayi' });
  await expect(log(page).getByText('Main wapas aa gayi')).toBeVisible({ timeout: 20_000 });
  await expect(chat(page, c.name).getByLabel(/^Window Open/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Internal note' }).click();
  await sendText(page, 'Welcome back!');
  await expectTicks(bubble(page, 'Welcome back!'), 'Read');
});

test('undeliverable recipient: ⚠ with the reason and Retry', async () => {
  const c = customers.failed;
  await openConversation(page, c.name);
  await sendText(page, 'Your EMI is due');
  const b = bubble(page, 'Your EMI is due');
  await expectTicks(b, 'Failed');
  await expect(b.getByText(/undeliverable/i)).toBeVisible();
  await b.getByRole('button', { name: 'Retry' }).click();
  // the retry is a new message (it fails again on this knob)
  await expect(
    log(page).locator('[data-message-id]').filter({ hasText: 'Your EMI is due' }),
  ).toHaveCount(2, {
    timeout: 20_000,
  });
});

test('never-read recipient stays ✓✓; throughput errors still deliver; Meta window closed fails', async () => {
  await openConversation(page, customers.unread.name);
  await sendText(page, 'Reminder one');
  const unread = bubble(page, 'Reminder one');
  await expectTicks(unread, 'Delivered');
  await page.waitForTimeout(2_000);
  await expect(unread.getByRole('img', { name: 'Delivered' })).toBeVisible();

  await openConversation(page, customers.slow.name);
  await sendText(page, 'Reminder two');
  await expectTicks(bubble(page, 'Reminder two'), 'Read');

  await openConversation(page, customers.closed.name);
  await sendText(page, 'Reminder three');
  const failed = bubble(page, 'Reminder three');
  await expectTicks(failed, 'Failed');
  await expect(failed.getByText(/24 hours/)).toBeVisible();
});
