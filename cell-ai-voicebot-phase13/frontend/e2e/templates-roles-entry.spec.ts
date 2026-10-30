import { expect, test, type Page } from '@playwright/test';

import { inviteMember } from './contacts';
import { openAdminAccount, signInAsSuperadmin, signUpOwner, type Owner } from './helpers';
import { connectNumber, customerPhone, InboxApi, openConversation, openInbox } from './inbox';
import { chooseSource, openTemplates, pickTemplate, templateRow, TemplatesApi } from './templates';

// Roles + entry points: viewers / agents read templates (no Create), agents send;
// impersonating superadmins read only; the call permission template; Send template
// from the contact page (start-with-template); the dashboard spend line and Wallet →
// WhatsApp prices; another account never sees these templates.
test.describe.configure({ mode: 'serial' });

let page: Page;
let owner: Owner;
let api: InboxApi;
let t: TemplatesApi;
let channelId: string;
let templateId: string;
let agent: Page;
let viewer: Page;
const stamp = Date.now().toString(36);
const TEMPLATE = `payment_due_instant_${stamp}`;
const CUSTOMER = { name: 'Farah Entrypoint', phone: customerPhone() };
const NEW_CUSTOMER = { name: 'Gopal Contactpage', phone: customerPhone() };
let newContactId: string;

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  owner = await signUpOwner(page, 'tplroles');
  await connectNumber(page, { label: 'Support line', business: `E2E TplRoles ${stamp}` });
  api = await InboxApi.signIn(playwright, owner.email);
  await api.fund(playwright);
  t = new TemplatesApi(api);
  channelId = await api.channelId();
  templateId = await t.createTemplate(channelId, { name: TEMPLATE });
  await api.createContact(CUSTOMER.name, CUSTOMER.phone);
  newContactId = await api.createContact(NEW_CUSTOMER.name, NEW_CUSTOMER.phone);
  await api.simulate(channelId, 'inbound_text', {
    from: CUSTOMER.phone,
    text: 'Payment link chahiye',
  });
  await api.waitConversation(CUSTOMER.phone);
  agent = await inviteMember(page, browser, 'Agent', 'Ankit Agent');
  viewer = await inviteMember(page, browser, 'Viewer', 'Vik Viewer');
});
test.afterAll(async () => {
  await api.dispose();
  for (const p of [agent, viewer]) await p.context().close();
  await page.close();
});

test('viewers and agents read templates without Create; the agent sends one', async () => {
  for (const p of [viewer, agent]) {
    await openTemplates(p);
    await expect(templateRow(p, TEMPLATE)).toContainText('Approved');
    await expect(p.getByRole('button', { name: 'Create template' })).toHaveCount(0);
    await expect(
      p.getByText(/Only owners, admins and managers can create or change templates/),
    ).toBeVisible();
  }
  await openInbox(agent);
  await openConversation(agent, CUSTOMER.name);
  await agent.getByRole('button', { name: 'Templates' }).click();
  const d = await pickTemplate(agent, TEMPLATE);
  await chooseSource(agent, '{{1}}', 'Contact name');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d).toBeHidden();
  await expect(agent.getByText(`Template · ${TEMPLATE}`).last()).toBeVisible();
});

test('an impersonating superadmin reads templates only', async ({ browser }) => {
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  // in-app navigation only (the impersonation token lives in memory)
  await admin.getByRole('link', { name: 'WhatsApp' }).click();
  await admin.getByRole('tab', { name: 'Templates' }).click();
  await expect(templateRow(admin, TEMPLATE)).toContainText('Approved');
  await expect(admin.getByRole('button', { name: 'Create template' })).toHaveCount(0);
  await expect(admin.getByRole('button', { name: 'Sync now' })).toHaveCount(0);
  await ctx.close();
});

test('Create call permission template → In review → Approved', async () => {
  await openTemplates(page);
  await page.getByRole('button', { name: 'Create call permission template' }).click();
  const d = page.getByRole('dialog', { name: 'Create call permission template' });
  await expect(d.getByRole('figure', { name: 'Template preview' })).toContainText(
    'Allow calls from this business?',
  );
  await d.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Sent to WhatsApp for review')).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(templateRow(page, 'call_permission_en')).toContainText('Approved', {
    timeout: 20_000,
  });
});

test('contact page → Send template starts the chat with the template', async () => {
  await page.goto(`/contacts/c/${newContactId}`);
  await expect(page.getByRole('heading', { level: 1, name: NEW_CUSTOMER.name })).toBeVisible();
  await page.getByRole('button', { name: 'Send template' }).click();
  const d = await pickTemplate(page, TEMPLATE);
  await chooseSource(page, '{{1}}', 'Contact name');
  await expect(d.getByRole('figure', { name: 'Message preview' })).toContainText(
    `Namaste ${NEW_CUSTOMER.name}`,
  );
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(page).toHaveURL(/\/inbox\/[a-f0-9]{24}$/);
  await expect(page.getByText(`Template · ${TEMPLATE}`).last()).toBeVisible({ timeout: 20_000 });
});

test('dashboard spend line; Wallet → WhatsApp prices', async () => {
  const conv = await api.conversationOf(NEW_CUSTOMER.phone);
  await t.waitBilling(conv.id, 'captured');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'WhatsApp' })).toContainText(
    /This month: ₹\d+\.\d{2} on WhatsApp/,
  );
  await page.goto('/wallet');
  const prices = page.getByRole('table', { name: 'WhatsApp prices' });
  await expect(prices.getByRole('row', { name: /India/ })).toContainText('₹0.14');
});

test('another account never sees these templates', async ({ browser, playwright }) => {
  const other = await browser.newPage();
  const stranger = await signUpOwner(other, 'tplother');
  const otherApi = await InboxApi.signIn(playwright, stranger.email);
  expect((await otherApi.get(`/whatsapp/templates/${templateId}`)).status).toBe(404);
  const list = await otherApi.get<{ id: string }[]>('/whatsapp/templates');
  expect(list.data.some((x) => x.id === templateId)).toBe(false);
  await otherApi.dispose();
  await other.close();
});
