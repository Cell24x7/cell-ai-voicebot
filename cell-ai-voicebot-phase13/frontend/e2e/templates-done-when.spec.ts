import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { signUpOwner } from './helpers';
import {
  bubble,
  chat,
  connectNumber,
  customerPhone,
  expectTicks,
  InboxApi,
  openConversation,
  openInbox,
} from './inbox';
import {
  chooseSource,
  createTemplateUI,
  expectLedgerLine,
  openTemplates,
  pickTemplate,
  templateRow,
  TemplatesApi,
} from './templates';

// Done when (PHASE_11_PLAN §0): build a template with an image header, two variables and
// buttons → In review → Approved live + bell; a closed chat → Send a template with the
// real values and the cost → Read → the wallet line is the shown cost; a rejected
// template → Edit and resubmit → approved; the fake saw a template payload.
test.describe.configure({ mode: 'serial' });

const photo = fileURLToPath(new URL('./fixtures/inbox/photo.jpg', import.meta.url));
let page: Page;
let api: InboxApi;
let t: TemplatesApi;
let channelId: string;
const CUSTOMER = 'Asha Template';
const phone = customerPhone();
const NAME = `emi_reminder_${Date.now().toString(36)}`;

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  const owner = await signUpOwner(page, 'tpldone');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Tpl ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  await api.fund(playwright);
  t = new TemplatesApi(api);
  channelId = await api.channelId();
  const field = await api.post('/custom-fields', {
    key: 'emi_amount',
    label: 'EMI amount',
    type: 'currency',
  });
  expect(field.status, field.code).toBe(201);
  const contact = await api.post('/contacts', {
    name: CUSTOMER,
    phone,
    variables: { emi_amount: '12500' },
  });
  expect(contact.status, contact.code).toBe(201);
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'EMI kab hai?' });
  const conv = await api.waitConversation(phone);
  await api.simulate(channelId, 'window_expired', { conversationId: conv.id });
});
test.afterAll(async () => {
  await api.dispose();
  await page.close();
});

test('builder: image header, 2 variables, footer, quick reply + URL → In review → Approved live + bell', async () => {
  await openTemplates(page);
  await createTemplateUI(page, {
    name: NAME,
    headerImage: photo,
    parts: ['Namaste ', ', your EMI of ', ' is due this week.'],
    samples: ['Asha', '₹12,500.00'],
    footer: 'Demo Finance',
    quickReply: 'Paid already',
    url: { text: 'Pay now', base: 'https://pay.example.com/', example: 'LN-1001' },
  });
  // the builder opens the new template's details
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(templateRow(page, NAME)).toContainText(/In review|Approved/);
  await expect(templateRow(page, NAME)).toContainText('Approved', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^Notifications, \d+ unread$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await expect(
    page.getByRole('menu').getByRole('img', { name: 'Template approved' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
});

test('closed chat → Send a template with real values + cost → Read → the wallet line equals the cost', async () => {
  await openInbox(page);
  await openConversation(page, CUSTOMER);
  await expect(
    page.getByText(
      'The 24-hour window is closed. Send a template to start the conversation again.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Send a template' }).click();
  const d = await pickTemplate(page, NAME);
  await chooseSource(page, '{{1}}', 'Contact name');
  await chooseSource(page, '{{2}}', 'Custom field', 'EMI amount');
  await chooseSource(page, 'Button 2 variable', 'Type here', 'LN-7001');
  const preview = d.getByRole('figure', { name: 'Message preview' });
  await expect(preview).toContainText(
    `Namaste ${CUSTOMER}, your EMI of ₹12,500.00 is due this week.`,
  );
  await expect(preview).toContainText('Pay now');
  await expect(d.getByLabel('Cost')).toContainText('This message costs ₹0.14 · Utility · India');
  await d.getByRole('button', { name: 'Send template' }).click();
  await expect(d).toBeHidden();
  const sent = bubble(page, `Template · ${NAME}`);
  await expect(sent).toContainText(`Namaste ${CUSTOMER}`);
  await expectTicks(sent, 'Read');
  await expect(chat(page, CUSTOMER)).toBeVisible();
  const conv = await api.conversationOf(phone);
  await t.waitBilling(conv.id, 'captured');
  await expectLedgerLine(page, 'WhatsApp · Utility · India', '−₹0.14');
  const fake = await api.fakeSent(channelId);
  expect(fake.sent.some((s) => s.type === 'template')).toBe(true);
});

test('a rejected template shows the reason → Edit and resubmit → approved', async () => {
  const name = `promo_reject_${Date.now().toString(36)}`;
  const id = await t.createTemplate(channelId, { name, body: 'Hello {{1}}, your offer is here.' });
  await t.waitStatus(id, 'REJECTED');
  await openTemplates(page);
  await expect(templateRow(page, name)).toContainText('Rejected');
  await templateRow(page, name).getByRole('button', { name }).click();
  const drawer = page.getByRole('region', { name: 'Template details' });
  await drawer.getByRole('button', { name: 'Edit and resubmit' }).click();
  const d = page.getByRole('dialog', { name: 'Edit template' });
  await d.getByRole('textbox', { name: 'Footer (optional)' }).fill('Reply STOP to opt out');
  await d.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Sent to WhatsApp for review')).toBeVisible();
  await t.waitStatus(id, 'APPROVED');
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(templateRow(page, name)).toContainText('Approved', { timeout: 20_000 });
});
