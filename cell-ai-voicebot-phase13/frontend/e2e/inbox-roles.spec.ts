import { expect, test, type Browser, type Page } from '@playwright/test';

import { inviteMember } from './contacts';
import { openAdminAccount, signInAsSuperadmin, signUpOwner, type Owner } from './helpers';
import {
  chat,
  connectNumber,
  customerPhone,
  InboxApi,
  log,
  openConversation,
  openInbox,
  row,
  sendText,
} from './inbox';

// Roles: viewers read; agents reply and take chats (not others', no blocking);
// managers assign; impersonators read only (no read receipts); accounts are isolated;
// search; closed chats reopen when the customer writes.
test.describe.configure({ mode: 'serial' });

let page: Page;
let owner: Owner;
let api: InboxApi;
let channelId: string;
let agent: Page;
let manager: Page;
let viewer: Page;
const CUSTOMER = 'Gita Rolecheck';
const OTHER = 'Mohan Searchable';
const phone = customerPhone();
const otherPhone = customerPhone();

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  owner = await signUpOwner(page, 'inboxroles');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Roles ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  // Phase 11: replies are held from the wallet
  await api.fund(playwright);
  channelId = await api.channelId();
  await api.createContact(CUSTOMER, phone);
  await api.createContact(OTHER, otherPhone);
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'Mera statement bhejiye' });
  await api.simulate(channelId, 'inbound_text', { from: otherPhone, text: 'Gold loan ka rate?' });
  agent = await inviteMember(page, browser, 'Agent', 'Ankit Agent');
  manager = await inviteMember(page, browser, 'Manager', 'Maya Manager');
  viewer = await inviteMember(page, browser, 'Viewer', 'Vik Viewer');
});
test.afterAll(async () => {
  await api.dispose();
  for (const p of [agent, manager, viewer]) await p.context().close();
  await page.close();
});

test('viewers read the chat but have no composer and no actions', async () => {
  await openInbox(viewer);
  await openConversation(viewer, CUSTOMER);
  await expect(log(viewer).getByText('Mera statement bhejiye')).toBeVisible();
  await expect(viewer.getByText('You can read this conversation but not reply')).toBeVisible();
  await expect(viewer.getByRole('textbox', { name: 'Message' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Close conversation' })).toHaveCount(0);
  await expect(viewer.getByRole('combobox', { name: 'Assigned to' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('agents reply and take a chat; they cannot assign others or block', async () => {
  await openInbox(agent);
  await openConversation(agent, CUSTOMER);
  await sendText(agent, 'Statement aaj bhej dunga');
  const assign = chat(agent, CUSTOMER).getByRole('combobox', { name: 'Assigned to' });
  await assign.click();
  await expect(agent.getByRole('option', { name: 'Maya Manager' })).toHaveCount(0);
  await agent.getByRole('option', { name: 'Ankit Agent (me)' }).click();
  await expect(assign).toHaveText('Ankit Agent (me)');
  await chat(agent, CUSTOMER).getByRole('button', { name: 'More actions' }).click();
  await expect(agent.getByRole('menuitem', { name: 'Block' })).toHaveCount(0);
  await agent.keyboard.press('Escape');
});

test('managers assign to anyone; the assignee gets a bell and finds it under Mine', async () => {
  await openInbox(manager);
  await openConversation(manager, OTHER);
  const assign = chat(manager, OTHER).getByRole('combobox', { name: 'Assigned to' });
  await assign.click();
  await manager.getByRole('option', { name: 'Ankit Agent' }).click();
  await expect(assign).toHaveText('Ankit Agent');

  await agent
    .getByRole('button', { name: /^Notifications, \d+ unread$/ })
    .click({ timeout: 20_000 });
  await expect(
    agent.getByRole('menuitem', { name: /Conversation assigned to you/ }).first(),
  ).toBeVisible();
  await agent.keyboard.press('Escape');
  await agent.getByRole('tab', { name: 'Mine' }).click();
  await expect(row(agent, OTHER)).toBeVisible();
  await expect(row(agent, CUSTOMER)).toBeVisible();
});

test('search by name and by message text', async () => {
  await openInbox(page);
  const search = page.getByRole('searchbox', { name: 'Search conversations' });
  await search.fill('Mohan');
  await expect(row(page, OTHER)).toBeVisible();
  await expect(row(page, CUSTOMER)).toBeHidden();
  await search.fill('statement');
  await expect(row(page, CUSTOMER)).toBeVisible();
  await expect(row(page, OTHER)).toBeHidden();
  await search.fill('');
});

test('close; the customer writes → open again', async () => {
  await openConversation(page, CUSTOMER);
  await page.getByRole('button', { name: 'Close conversation' }).click();
  await expect(page.getByRole('button', { name: 'Reopen conversation' })).toBeVisible();
  await page.getByRole('tab', { name: 'Closed' }).click();
  await expect(row(page, CUSTOMER)).toBeVisible();
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'Abhi tak nahi aaya' });
  await expect(page.getByRole('button', { name: 'Close conversation' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(row(page, CUSTOMER)).toBeVisible();
});

test('an impersonating superadmin reads only and sends no read receipt', async ({ browser }) => {
  // nobody else has a chat open (an open chat marks new messages read)
  await manager.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await api.simulate(channelId, 'inbound_text', { from: otherPhone, text: 'Hello again' });
  await expect
    .poll(async () => (await api.conversationOf(otherPhone)).unreadCount)
    .toBeGreaterThan(0);
  // receipts of earlier messages may still be on their way: count once they settle
  let before = -1;
  await expect
    .poll(
      async () => {
        const now = (await api.fakeSent(channelId)).readReceipts.length;
        const settled = now === before;
        before = now;
        return settled;
      },
      { intervals: [1_000] },
    )
    .toBe(true);
  const admin = await impersonate(browser, owner);
  await openInbox(admin);
  await openConversation(admin, OTHER);
  await expect(log(admin).getByText('Hello again')).toBeVisible();
  await expect(admin.getByText('You can read this conversation but not reply')).toBeVisible();
  await admin.waitForTimeout(1_500);
  expect((await api.fakeSent(channelId)).readReceipts.length).toBe(before);
  await expect(row(admin, OTHER).getByLabel(/unread/)).toBeVisible();
  await admin.context().close();
});

test('another account never sees these conversations', async ({ browser, playwright }) => {
  const conv = await api.conversationOf(phone);
  const other = await browser.newPage();
  const stranger = await signUpOwner(other, 'inboxiso');
  await openInbox(other);
  await expect(
    other.getByText(/Connect a WhatsApp number first|No conversations yet/),
  ).toBeVisible();
  const strangerApi = await InboxApi.signIn(playwright, stranger.email);
  expect((await strangerApi.get(`/inbox/conversations/${conv.id}`)).status).toBe(404);
  await strangerApi.dispose();
  await other.close();
});

async function impersonate(browser: Browser, o: Owner): Promise<Page> {
  const admin = await (await browser.newContext()).newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, o.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByText(`Viewing as ${o.name}`, { exact: false })).toBeVisible();
  return admin;
}
