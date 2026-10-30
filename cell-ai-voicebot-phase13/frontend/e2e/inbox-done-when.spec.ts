import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { signUpOwner, type Owner } from './helpers';
import {
  attachFile,
  bubble,
  chat,
  connectNumber,
  expectTicks,
  InboxApi,
  log,
  openConversation,
  openInbox,
  recordVoice,
  row,
  sendText,
  customerPhone,
} from './inbox';

// Phase 10 "Done when": a customer writes, the agent answers with text / photo /
// interactive messages / a voice note, every inbound type renders, ticks go to Read.
test.describe.configure({ mode: 'serial' });

const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/inbox/${name}`, import.meta.url));

let page: Page;
let owner: Owner;
let api: InboxApi;
let channelId: string;
const CUSTOMER = 'Ravi Donewhen';
const phone = customerPhone();

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  owner = await signUpOwner(page, 'inboxdone');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Inbox ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  // Phase 11: replies are held from the wallet
  await api.fund(playwright);
  channelId = await api.channelId();
  await api.createContact(CUSTOMER, phone);
});
test.afterAll(async () => {
  await api.dispose();
  await page.close();
});

test('a customer writes → the chat appears live, unread, in the bell; opening it reads it', async () => {
  await openInbox(page);
  await expect(page.getByText('No conversations yet')).toBeVisible();
  await api.simulate(channelId, 'inbound_text', { from: phone, text: 'Namaste, EMI kab hai?' });
  const r = row(page, CUSTOMER);
  await expect(r.getByLabel('1 unread')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Inbox, 1 unread' }).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await expect(
    page.getByRole('menuitem', { name: new RegExp(`New WhatsApp message.*${CUSTOMER}`) }).first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await openConversation(page, CUSTOMER);
  await expect(log(page).getByText('Namaste, EMI kab hai?')).toBeVisible();
  await expect(r.getByLabel('1 unread')).toBeHidden({ timeout: 20_000 });
  await expect(chat(page, CUSTOMER).getByLabel(/^Window Open · 2[34] h/)).toBeVisible();
  await expect
    .poll(async () => (await api.fakeSent(channelId)).readReceipts.length, { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test('text reply: ✓ → ✓✓ → blue ✓✓', async () => {
  await sendText(page, 'Aapki EMI 5 tareekh ko due hai.');
  const b = bubble(page, 'Aapki EMI 5 tareekh ko due hai.');
  await expectTicks(b, 'Read');
  await expect(b.getByText(owner.name)).toBeVisible();
});

test('photo reply with caption and upload', async () => {
  await attachFile(page, 'Photo or video', fixture('photo.jpg'));
  await page
    .getByLabel('Attachment')
    .getByRole('textbox', { name: 'Caption (optional)' })
    .fill('EMI chart');
  await page.getByLabel('Attachment').getByRole('button', { name: 'Send' }).click();
  const b = bubble(page, 'EMI chart');
  await expect(b.getByRole('button', { name: 'View photo' })).toBeVisible();
  await expectTicks(b, 'Read');
});

test('every inbound type renders; media opens / plays / downloads', async () => {
  for (const kind of [
    'inbound_image',
    'inbound_video',
    'inbound_voice',
    'inbound_document',
    'inbound_sticker',
    'inbound_location',
    'inbound_contacts',
  ]) {
    await api.simulate(channelId, kind, { from: phone });
  }
  const l = log(page);
  await expect(l.getByRole('link', { name: 'Open in Google Maps' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(l.getByRole('button', { name: 'Add contact' })).toBeVisible({ timeout: 20_000 });
  // downloads finish through the worker, then the signed links load
  await expect(l.getByRole('img', { name: 'Sticker' })).toBeVisible({ timeout: 20_000 });
  await expect(l.getByLabel('Video')).toHaveAttribute('src', /\/api\/v1\/|^http/, {
    timeout: 20_000,
  });
  await expect(l.getByText(/^Voice note/).first()).toBeVisible();
  await expect(l.getByLabel('Voice note').first()).toHaveAttribute('src', /.+/, {
    timeout: 20_000,
  });
  const download = l.getByRole('link', { name: 'Download' }).last();
  await expect(download).toHaveAttribute('href', /.+/, { timeout: 20_000 });
  const photos = l.getByRole('button', { name: 'View photo' });
  await photos.first().click();
  const viewer = page.getByRole('dialog', { name: 'Photo' });
  await expect(viewer.getByRole('img')).toBeVisible();
  await viewer.getByRole('button', { name: 'Close photo' }).click();
  await expect(viewer).toBeHidden();
});

test('reply to a customer message (quote); the customer reacts; we react', async () => {
  // the first bubble with this text (the reply below quotes it too)
  const first = log(page)
    .locator('[data-message-id]')
    .filter({ hasText: 'Namaste, EMI kab hai?' })
    .first();
  await first.hover();
  await first.getByRole('button', { name: 'Reply' }).click();
  await expect(page.getByLabel('Replying to')).toBeVisible();
  await sendText(page, 'Main check karke batata hoon.');
  const reply = bubble(page, 'Main check karke batata hoon.');
  await expect(
    reply.getByRole('button', { name: /Go to the quoted message: Namaste/ }),
  ).toBeVisible();

  await api.simulate(channelId, 'inbound_reaction', { from: phone, text: '🙏' });
  await expect(reply.getByTitle('Customer reacted')).toHaveText('🙏', { timeout: 20_000 });

  await first.hover();
  await first.getByRole('button', { name: 'React' }).click();
  await page.getByRole('button', { name: 'React 👍' }).click();
  await expect(first.getByTitle('You reacted')).toHaveText('👍');
});

test('interactive: buttons → customer taps one; list and link button', async () => {
  await page.getByRole('button', { name: 'Interactive message' }).click();
  let builder = page.getByRole('dialog', { name: 'Interactive message' });
  await builder.getByRole('textbox', { name: 'Message' }).fill('Pay the EMI now?');
  await builder.getByRole('textbox', { name: 'Button 1' }).fill('Yes, pay');
  await builder.getByRole('button', { name: 'Add button' }).click();
  await builder.getByRole('textbox', { name: 'Button 2' }).fill('Later');
  await builder.getByRole('button', { name: 'Send' }).click();
  await expectTicks(bubble(page, 'Pay the EMI now?'), 'Read');
  await api.simulate(channelId, 'inbound_button_reply', { from: phone });
  await expect(log(page).getByLabel('Replied Yes, pay')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Interactive message' }).click();
  builder = page.getByRole('dialog', { name: 'Interactive message' });
  await builder.getByRole('tab', { name: 'List' }).click();
  await builder.getByRole('textbox', { name: 'Message' }).fill('Choose a plan');
  await builder.getByRole('textbox', { name: 'Menu button text' }).fill('Plans');
  await builder.getByRole('textbox', { name: 'Row 1' }).fill('Home loan');
  await builder.getByRole('button', { name: 'Send' }).click();
  await expect(bubble(page, 'Choose a plan').getByText('• Home loan')).toBeVisible();

  await page.getByRole('button', { name: 'Interactive message' }).click();
  builder = page.getByRole('dialog', { name: 'Interactive message' });
  await builder.getByRole('tab', { name: 'Link button' }).click();
  await builder.getByRole('textbox', { name: 'Message' }).fill('Pay online');
  await builder.getByRole('textbox', { name: 'Button text' }).fill('Pay');
  await builder.getByRole('textbox', { name: 'Link' }).fill('https://pay.example.com/emi');
  await builder.getByRole('button', { name: 'Send' }).click();
  await expectTicks(bubble(page, 'Pay online'), 'Read');
  const sent = await api.fakeSent(channelId);
  expect(sent.sent.map((s) => s.interactiveType).filter(Boolean)).toEqual(
    expect.arrayContaining(['button', 'list', 'cta_url']),
  );
});

test('voice note: record 3 s → preview → send → voice bubble → Read; Meta got a mono OGG/Opus', async () => {
  await recordVoice(page, 3_000);
  const voice = log(page)
    .locator('[data-message-id]')
    .filter({ hasText: /^Voice note|Voice note ·/ })
    .last();
  await expect(voice).toBeVisible({ timeout: 20_000 });
  await expectTicks(voice, 'Read');
  await expect(voice.getByText(/Voice note · 0:0[2-4]/)).toBeVisible();
  await expect
    .poll(
      async () => (await api.fakeSent(channelId)).sent.filter((s) => s.voiceValid === true).length,
    )
    .toBeGreaterThan(0);
});
