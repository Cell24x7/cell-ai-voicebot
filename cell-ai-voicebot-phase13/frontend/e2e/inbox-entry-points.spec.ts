import { expect, test, type Page } from '@playwright/test';

import { signUpOwner } from './helpers';
import {
  chat,
  connectNumber,
  customerPhone,
  InboxApi,
  log,
  openConversation,
  openInbox,
} from './inbox';
import { numberCard, openNumbers } from './whatsapp';

// Entry points: contact page Open / Start chat, Settings → Inbox (read receipts,
// custom keyword, retention text), business profile, dashboard card, nav badge,
// notification → chat.
test.describe.configure({ mode: 'serial' });

let page: Page;
let api: InboxApi;
let channelId: string;
let chattyId: string;
let quietId: string;
const CHATTY = 'Isha Entrypoint';
const QUIET = 'Lata Newchat';
const chattyPhone = customerPhone();
const quietPhone = customerPhone();

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  const owner = await signUpOwner(page, 'inboxentry');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Entry ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  // Phase 11: replies are held from the wallet
  await api.fund(playwright);
  channelId = await api.channelId();
  chattyId = await api.createContact(CHATTY, chattyPhone);
  quietId = await api.createContact(QUIET, quietPhone);
});
test.afterAll(async () => {
  await api.dispose();
  await page.close();
});

test('a new message: nav badge, dashboard card, bell → the chat', async () => {
  await api.simulate(channelId, 'inbound_text', { from: chattyPhone, text: 'Mujhe call kijiye' });
  await page.getByRole('link', { name: 'Dashboard' }).click();
  const card = page.getByRole('region', { name: 'Inbox' });
  await expect(card.getByText('Inbox: 1 unread · 0 assigned to you')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: 'Inbox, 1 unread' }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`New WhatsApp message.*${CHATTY}`) })
    .first()
    .click();
  await expect(chat(page, CHATTY)).toBeVisible();
  await expect(log(page).getByText('Mujhe call kijiye')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inbox', exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test('contact page: Open chat (existing) and Start chat (closed window → banner)', async () => {
  await page.goto(`/contacts/c/${chattyId}`);
  await expect(page.getByText(/~Test Customer/)).toBeVisible();
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(chat(page, CHATTY)).toBeVisible();

  await page.goto(`/contacts/c/${quietId}`);
  await page.getByRole('button', { name: 'Start chat' }).click();
  await expect(chat(page, QUIET)).toBeVisible();
  await expect(page.getByText(/The 24-hour window is closed\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Write an internal note' })).toBeVisible();
});

test('Settings → Inbox: read receipts on by default → off (none sent) → on; retention text', async () => {
  await page.goto('/settings/inbox');
  const section = page.getByRole('region', { name: 'Inbox settings' });
  const receipts = section.getByRole('switch', { name: /read receipts/ });
  await expect(receipts).toBeChecked();
  await expect(section.getByText(/kept for 90 days/)).toBeVisible();
  await receipts.click();
  await section.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Inbox settings saved')).toBeVisible();

  await api.simulate(channelId, 'inbound_text', { from: chattyPhone, text: 'Koi update?' });
  const before = (await api.fakeSent(channelId)).readReceipts.length;
  await openInbox(page);
  await openConversation(page, CHATTY);
  await expect(log(page).getByText('Koi update?')).toBeVisible();
  await page.waitForTimeout(1_500);
  expect((await api.fakeSent(channelId)).readReceipts.length).toBe(before);

  await page.goto('/settings/inbox');
  await page
    .getByRole('region', { name: 'Inbox settings' })
    .getByRole('switch', { name: /read receipts/ })
    .click();
  await page
    .getByRole('region', { name: 'Inbox settings' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(page.getByText('Inbox settings saved')).toBeVisible();
});

test('a custom opt-out keyword ("ROKO") opts the customer out', async () => {
  await page.goto('/settings/inbox');
  const section = page.getByRole('region', { name: 'Inbox settings' });
  await section.getByRole('textbox', { name: 'Add to opt-out keywords' }).fill('roko');
  await section.getByRole('textbox', { name: 'Add to opt-out keywords' }).press('Enter');
  await expect(
    section.getByRole('list', { name: 'Opt-out keywords' }).getByText('ROKO'),
  ).toBeVisible();
  await section.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Inbox settings saved')).toBeVisible();

  await openInbox(page);
  await openConversation(page, CHATTY);
  await api.simulate(channelId, 'inbound_text', { from: chattyPhone, text: 'Roko' });
  await expect(page.getByText('This customer opted out — replies only')).toBeVisible({
    timeout: 20_000,
  });
});

test('business profile edit in the Numbers drawer', async () => {
  await openNumbers(page);
  await numberCard(page, 'Support line').getByRole('button', { name: 'Details' }).click();
  const profile = page
    .getByRole('dialog', { name: 'Number details' })
    .getByRole('region', { name: 'Business profile' });
  const about = profile.getByRole('textbox', { name: 'About' });
  await expect(about).toBeEditable();
  await about.fill('Loans made simple, fast');
  await profile.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Business profile saved')).toBeVisible();
  await expect(about).toHaveValue('Loans made simple, fast');
});
