import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { openAdminAccount, signInAsSuperadmin, signUpOwner, type Owner } from './helpers';
import { connectNumber, customerPhone, InboxApi, openConversation, openInbox } from './inbox';
import {
  adjustWallet,
  chooseSource,
  expectLedgerLine,
  pickTemplate,
  RATE_CSV,
  superadminApi,
  TemplatesApi,
} from './templates';

// Money (PHASE_11_PLAN §1f–§1j): the superadmin imports Meta's rate card and sets an
// account markup → the price changes; failed and free messages release their hold, a
// billable reply is captured; an empty wallet and a reached budget refuse the send with
// nothing held; Meta billing after a release charges late (negative balance + bell); a
// customer-pays number holds nothing; the margin report has the account.
test.describe.configure({ mode: 'serial' });

let page: Page;
let admin: Page;
let owner: Owner;
let api: InboxApi;
let sa: InboxApi;
let t: TemplatesApi;
let channelId: string;
let accountId: string;
let templateId: string;
const TEMPLATE = `billing_note_instant_${Date.now().toString(36)}`;
const people = {
  failed: { name: 'Ravi Undeliverable', phone: customerPhone('00009') },
  free: { name: 'Sita Freereply', phone: customerPhone() },
  billable: { name: 'Mohit Billable', phone: customerPhone('00010') },
};
const contactIds: Record<string, string> = {};

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  owner = await signUpOwner(page, 'tplbill');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Bill ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  await api.fund(playwright);
  t = new TemplatesApi(api);
  sa = await superadminApi(playwright);
  channelId = await api.channelId();
  accountId = await api.accountId();
  templateId = await t.createTemplate(channelId, { name: TEMPLATE });
  for (const [k, c] of Object.entries(people))
    contactIds[k] = await api.createContact(c.name, c.phone);
  const ctx = await browser.newContext();
  admin = await ctx.newPage();
  await signInAsSuperadmin(admin);
});
test.afterAll(async () => {
  await api.dispose();
  await sa.dispose();
  await admin.context().close();
  await page.close();
});

test('superadmin imports a rate card (diff) and saves it; an account markup of 50 % changes the price', async () => {
  expect((await t.pricePreview(channelId, contactIds.free ?? '', templateId)).priceMicros).toBe(
    140_000,
  );
  await admin.goto('/admin/whatsapp-billing');
  await admin.getByLabel('Rate card CSV').setInputFiles({
    name: 'meta-inr-rates.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(RATE_CSV),
  });
  const preview = admin.getByRole('region', { name: 'Import preview' });
  await expect(preview).toContainText('meta-inr-rates.csv: 2 markets');
  await expect(preview.getByRole('region', { name: 'Changes' })).toContainText(
    /prices changed|no rate card yet/,
  );
  await preview.getByRole('button', { name: 'Save rate card' }).click();
  await expect(admin.getByText('Rate card saved')).toBeVisible();
  await expect(admin.getByRole('table', { name: 'Current rates' })).toContainText('₹0.8631');

  await openAdminAccount(admin, owner.businessName);
  const region = admin.getByRole('region', { name: 'WhatsApp billing' });
  await region.getByRole('textbox', { name: 'Markup (%)' }).fill('50');
  await region.getByRole('button', { name: 'Save prices' }).click();
  await expect(admin.getByText('WhatsApp prices saved')).toBeVisible();
  // ₹0.115 × 1.5 = ₹0.1725 → rounded up to ₹0.18
  await expect
    .poll(
      async () => (await t.pricePreview(channelId, contactIds.free ?? '', templateId)).priceMicros,
    )
    .toBe(180_000);
});

test('an undeliverable (00009) template fails → its hold is released', async () => {
  const r = await t.startWithTemplate(channelId, contactIds.failed ?? '', templateId, {
    1: 'Ravi',
  });
  expect(r.status, r.code).toBe(201);
  await t.waitBilling(r.data.id, 'released');
  await expectLedgerLine(page, 'WhatsApp · Utility · India', '−₹0.18', 'Released');
});

test('a free service reply is released; a billable (00010) reply is captured', async () => {
  for (const c of [people.free, people.billable]) {
    await api.simulate(channelId, 'inbound_text', { from: c.phone, text: `Hi from ${c.name}` });
  }
  const free = await api.waitConversation(people.free.phone);
  const billable = await api.waitConversation(people.billable.phone);
  for (const conv of [free, billable]) {
    const r = await api.post(`/inbox/conversations/${conv.id}/messages`, {
      clientId: randomUUID(),
      type: 'text',
      text: 'Ji, batayiye',
    });
    expect(r.status, r.code).toBe(201);
  }
  await t.waitBilling(free.id, 'released', 'text');
  await t.waitBilling(billable.id, 'captured', 'text');
  await expectLedgerLine(page, 'WhatsApp · Service · India', '−₹0.18', 'Done');
});

test('an empty wallet refuses a template with "Add money…" and holds nothing; Meta billing later charges below zero + bell', async () => {
  const { balanceMicros } = await t.wallet();
  await adjustWallet(sa, accountId, 'debit', balanceMicros);
  const before = (await t.ledger()).length;
  await openInbox(page);
  await openConversation(page, people.free.name);
  await page.getByRole('button', { name: 'Templates' }).click();
  const d = await pickTemplate(page, TEMPLATE);
  await chooseSource(page, '{{1}}', 'Contact name');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d.getByText('Add money to your wallet to send WhatsApp messages.')).toBeVisible();
  await d.getByRole('button', { name: 'Cancel' }).click();
  expect((await t.ledger()).length).toBe(before);

  // the failed (released) message is billed by Meta after all → charged late, below zero
  const conv = await api.conversationOf(people.failed.phone);
  const msg = (await t.messages(conv.id)).find((m) => m.type === 'template');
  expect(msg).toBeTruthy();
  const late = await api.post('/dev/meta/webhooks', {
    channelId,
    kind: 'late_billable_status',
    messageId: msg?.id,
  });
  expect(late.status, late.code).toBe(200);
  await t.waitBilling(conv.id, 'late_charged');
  await expect.poll(async () => (await t.wallet()).balanceMicros).toBeLessThan(0);
  await page.reload();
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await expect(
    page.getByRole('menu').getByRole('img', { name: 'WhatsApp charge after a release' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await adjustWallet(sa, accountId, 'credit', 500_000_000);
});

test('a reached WhatsApp budget refuses the send', async () => {
  const set = await api.patch('/wallet/settings', { budgets: { monthlyWhatsappMicros: 10_000 } });
  expect(set.status, set.code).toBe(200);
  await openInbox(page);
  await openConversation(page, people.free.name);
  await page.getByRole('button', { name: 'Templates' }).click();
  const d = await pickTemplate(page, TEMPLATE);
  await chooseSource(page, '{{1}}', 'Contact name');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d.getByText(/monthly WhatsApp budget is reached/)).toBeVisible();
  await d.getByRole('button', { name: 'Cancel' }).click();
  await api.patch('/wallet/settings', { budgets: { monthlyWhatsappMicros: 0 } });
});

test('a customer-pays number: "Billed by Meta…" and no wallet line', async () => {
  await openAdminAccount(admin, owner.businessName);
  const region = admin.getByRole('region', { name: 'WhatsApp billing' });
  await region.getByRole('radio', { name: 'Customer pays Meta' }).check();
  await region.getByRole('button', { name: 'Save Meta billing' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(admin.getByText('Meta billing saved')).toBeVisible();
  // numbers connected from now on are billed to the customer's own WhatsApp account
  await connectNumber(page, {
    label: 'Own bill line',
    business: `E2E Own ${Date.now().toString(36)}`,
  });
  const own = await api.channelId('Own bill line');
  const ownTemplate = `own_note_instant_${Date.now().toString(36)}`;
  await t.createTemplate(own, { name: ownTemplate });
  const phone = customerPhone();
  const name = 'Kiran Ownbill';
  await api.createContact(name, phone);
  await api.simulate(own, 'inbound_text', { from: phone, text: 'Hello own line' });
  await api.waitConversation(phone);
  const before = (await t.ledger()).length;
  await openInbox(page);
  await openConversation(page, name);
  await page.getByRole('button', { name: 'Templates' }).click();
  const d = await pickTemplate(page, ownTemplate);
  await expect(d.getByLabel('Cost')).toContainText('Billed by Meta to your WhatsApp account');
  await chooseSource(page, '{{1}}', 'Contact name');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d).toBeHidden();
  const conv = await api.conversationOf(phone);
  await expect
    .poll(
      async () =>
        (await t.messages(conv.id)).filter((m) => m.type === 'template').at(-1)?.billing?.status,
    )
    .toBe('none');
  expect((await t.ledger()).length).toBe(before);
});

test('the margin report lists the account', async () => {
  await admin.goto('/admin/whatsapp-billing?tab=margin');
  await expect(admin.getByRole('table', { name: 'WhatsApp margin' })).toContainText(
    owner.businessName,
    {
      timeout: 20_000,
    },
  );
});
