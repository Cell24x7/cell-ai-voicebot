import { expect, test, type Page } from '@playwright/test';

import { signUpOwner } from './helpers';
import { connectNumber, customerPhone, InboxApi, openConversation, openInbox } from './inbox';
import { chooseSource, openTemplates, pickTemplate, templateRow, TemplatesApi } from './templates';

// Marketing rules (owner decisions §7 #5–#6): an opted-out customer gets utility, not
// marketing; "stopped marketing" (Meta's preference webhook or a 131050 failure) blocks
// marketing; one marketing template per customer per 24 h; a paused template can't be
// sent; a template WhatsApp recategorises shows Marketing (+ a bell).
test.describe.configure({ mode: 'serial' });

let page: Page;
let api: InboxApi;
let t: TemplatesApi;
let channelId: string;
const stamp = Date.now().toString(36);
const MARKETING = `festive_offer_instant_${stamp}`;
const UTILITY = `account_note_instant_${stamp}`;
let marketingId: string;
let utilityId: string;
const people = {
  stop: { name: 'Leela Stopper', phone: customerPhone() },
  prefs: { name: 'Arjun Prefs', phone: customerPhone() },
  stopped: { name: 'Divya Metastopped', phone: customerPhone('00013') },
  often: { name: 'Nikhil Frequent', phone: customerPhone() },
};
const ids: Record<string, string> = {};

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  const owner = await signUpOwner(page, 'tplmkt');
  await connectNumber(page, { label: 'Support line', business: `E2E Mkt ${stamp}` });
  api = await InboxApi.signIn(playwright, owner.email);
  await api.fund(playwright);
  t = new TemplatesApi(api);
  channelId = await api.channelId();
  marketingId = await t.createTemplate(channelId, {
    name: MARKETING,
    category: 'MARKETING',
    body: 'Hi {{1}}, our festive offer is live this week.',
  });
  utilityId = await t.createTemplate(channelId, { name: UTILITY });
  for (const [k, c] of Object.entries(people)) {
    ids[k] = await api.createContact(c.name, c.phone);
    await api.simulate(channelId, 'inbound_text', { from: c.phone, text: `Namaste, ${c.name}` });
    await api.waitConversation(c.phone);
  }
});
test.afterAll(async () => {
  await api.dispose();
  await page.close();
});

test('STOP puts the number on DND (no template); without the DND entry: marketing refused, utility goes', async () => {
  await api.simulate(channelId, 'inbound_stop', { from: people.stop.phone });
  await openInbox(page);
  await openConversation(page, people.stop.name);
  await page.getByRole('button', { name: 'Templates' }).click();
  let d = await pickTemplate(page, UTILITY);
  await expect(d.getByText(/Do-not-disturb/)).toBeVisible({ timeout: 20_000 });
  await expect(d.getByRole('button', { name: 'Send template' })).toBeDisabled();
  await d.getByRole('button', { name: 'Cancel' }).click();
  // the team removes the DND entry; the WhatsApp opt-out stays
  const q = people.stop.phone.replace(/\D/g, '');
  const dnd = await api.get<{ id: string }[]>(`/dnd-entries?q=${q}`);
  expect(dnd.data.length).toBeGreaterThan(0);
  expect(await api.delete(`/dnd-entries/${dnd.data[0]?.id ?? ''}`)).toBe(204);
  await page.reload();
  await page.getByRole('button', { name: 'Templates' }).click();
  d = await pickTemplate(page, MARKETING);
  await expect(d.getByText(/opted out of messages/)).toBeVisible({ timeout: 20_000 });
  await expect(d.getByRole('button', { name: 'Send template' })).toBeDisabled();
  await pickTemplate(page, UTILITY);
  await chooseSource(page, '{{1}}', 'Contact name');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByText(`Template · ${UTILITY}`).last()).toBeVisible();
});

test('the customer stops marketing on WhatsApp → marketing refused', async () => {
  await api.simulate(channelId, 'user_stopped_marketing', { from: people.prefs.phone });
  await openInbox(page);
  await openConversation(page, people.prefs.name);
  await page.getByRole('button', { name: 'Templates' }).click();
  const d = await pickTemplate(page, MARKETING);
  await chooseSource(page, '{{1}}', 'Contact name');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d.getByText(/stopped marketing messages on WhatsApp/)).toBeVisible();
  await d.getByRole('button', { name: 'Cancel' }).click();
});

test('Meta refuses marketing (131050, 00013) → failed, and the contact is flagged', async () => {
  const conv = await api.conversationOf(people.stopped.phone);
  const r = await t.sendTemplate(conv.id, marketingId, { 1: 'Divya' });
  expect(r.status, r.code).toBe(201);
  await expect
    .poll(
      async () => (await t.messages(conv.id)).filter((m) => m.type === 'template').at(-1)?.status,
      {
        timeout: 20_000,
      },
    )
    .toBe('failed');
  await expect
    .poll(async () => (await t.sendTemplate(conv.id, marketingId, { 1: 'Divya' })).code ?? '', {
      timeout: 20_000,
    })
    .toMatch(/^TEMPLATE_MARKETING_BLOCKED .*stopped_marketing/);
});

test('one marketing template per customer per 24 h', async () => {
  const conv = await api.conversationOf(people.often.phone);
  const first = await t.sendTemplate(conv.id, marketingId, { 1: 'Nikhil' });
  expect(first.status, first.code).toBe(201);
  await openInbox(page);
  await openConversation(page, people.often.name);
  await page.getByRole('button', { name: 'Templates' }).click();
  const d = await pickTemplate(page, MARKETING);
  await chooseSource(page, '{{1}}', 'Contact name');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d.getByText(/already got a marketing template in the last 24 hours/)).toBeVisible();
  await d.getByRole('button', { name: 'Cancel' }).click();
});

test('a paused template shows Paused and is not offered for sending', async () => {
  const name = `sale_pause_${stamp}`;
  const id = await t.createTemplate(channelId, { name, category: 'MARKETING' });
  await t.waitStatus(id, 'PAUSED');
  await openTemplates(page);
  await expect(templateRow(page, name)).toContainText('Paused');
  await openInbox(page);
  await openConversation(page, people.often.name);
  await page.getByRole('button', { name: 'Templates' }).click();
  const d = page.getByRole('dialog', { name: 'Send template' });
  await d.getByRole('combobox', { name: 'Template' }).click();
  await expect(page.getByRole('option', { name: new RegExp(MARKETING) })).toBeVisible();
  await expect(page.getByRole('option', { name: new RegExp(name) })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await d.getByRole('button', { name: 'Cancel' }).click();
});

test('WhatsApp recategorises a template → Marketing chip + bell', async () => {
  const name = `notice_recategorize_${stamp}`;
  const id = await t.createTemplate(channelId, { name });
  await expect
    .poll(async () => (await t.template(id)).category, { timeout: 20_000 })
    .toBe('MARKETING');
  await openTemplates(page);
  await expect(templateRow(page, name)).toContainText('Marketing (was Utility)');
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await expect(
    page.getByRole('menu').getByRole('img', { name: 'Template category changed' }).first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  expect(utilityId).toBeTruthy();
});
