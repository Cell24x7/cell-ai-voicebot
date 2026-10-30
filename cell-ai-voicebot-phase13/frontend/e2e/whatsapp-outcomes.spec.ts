import { expect, test, type Page } from '@playwright/test';

import { signUpOwner } from './helpers';
import {
  closeWizard,
  connectFakeNumber,
  expectStatus,
  numberCard,
  openNumbers,
  simulateEvent,
  testPhone,
} from './whatsapp';

// Every signup outcome and setup problem the fake Meta can produce (PHASE_9_PLAN §1j).
test.describe.configure({ mode: 'serial' });

let page: Page;
const tag = Date.now().toString(36);
const wizard = () => page.getByRole('dialog', { name: 'Connect WhatsApp' });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signUpOwner(page, 'waoutcomes');
  await openNumbers(page);
});
test.afterAll(async () => {
  await page.close();
});

test('cancel at a step: nothing saved; error outcome: the Meta message', async () => {
  await connectFakeNumber(page, {
    businessName: `Cancel ${tag}`,
    phone: testPhone(),
    outcome: 'Cancel at a step',
  });
  await expect(
    wizard().getByText(/Signup cancelled at Test signup\. Nothing was saved\./),
  ).toBeVisible();
  await closeWizard(page);
  await expect(page.getByText('No WhatsApp number connected yet')).toBeVisible();
  await connectFakeNumber(page, {
    businessName: `Error ${tag}`,
    phone: testPhone(),
    outcome: 'Error',
  });
  await expect(wizard().getByText('The Meta signup expired — try again.')).toBeVisible();
  await closeWizard(page);
  await expect(page.getByText('No WhatsApp number connected yet')).toBeVisible();
});

test('WhatsApp Business app number: warning, badge, syncs, echoes', async () => {
  await page.getByRole('button', { name: 'Connect WhatsApp' }).click();
  await wizard()
    .getByRole('radio', { name: /Number on the WhatsApp Business app/ })
    .check();
  await expect(wizard().getByText(/Calling won't work on this number/)).toBeVisible();
  await wizard().getByRole('button', { name: 'Cancel' }).click();
  await connectFakeNumber(page, {
    businessName: `Shop ${tag}`,
    phone: testPhone(),
    displayName: 'Coex Shop',
    mode: 'coexistence',
  });
  await closeWizard(page);
  const card = numberCard(page, 'Coex Shop');
  await expect(card.getByText('WhatsApp Business app')).toBeVisible();
  await expect(card.getByText('Messages from your phone appear in this app.')).toBeVisible();
  await expect(
    card.getByText(/Contacts sync: Requested · Chat history: Requested \(0%\)/),
  ).toBeVisible();
  await simulateEvent(page, 'Coex Shop', 'Contacts received');
  await simulateEvent(page, 'Coex Shop', 'Chat history received');
  await expect(card.getByText(/Contacts sync: Received · Chat history: Received/)).toBeVisible({
    timeout: 20_000,
  });
  await simulateEvent(page, 'Coex Shop', 'Message sent from the phone (echo)');
  await expect(async () => {
    await card.getByRole('button', { name: 'Details' }).click();
    const drawer = page.getByRole('dialog', { name: 'Number details' });
    await expect(drawer.getByText('smb_message_echoes: 1')).toBeVisible({ timeout: 2_000 });
    await drawer.getByRole('button', { name: 'Close details' }).click();
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press('Escape');
});

test('only a WhatsApp account → Action needed → the number is added → Sync → Connected', async () => {
  await connectFakeNumber(page, {
    businessName: `Only WABA ${tag}`,
    phone: testPhone(),
    displayName: 'Later Number',
    outcome: 'Finish without a phone number',
  });
  await expect(wizard().getByText('Action needed')).toBeVisible();
  await closeWizard(page);
  // no number yet → no name yet: the default label
  const card = numberCard(page, 'WhatsApp number');
  await expect(card.getByText('Add a phone number in WhatsApp Manager, then Sync.')).toBeVisible();
  await expect(card.getByText('No phone number yet')).toBeVisible();
  await simulateEvent(page, 'WhatsApp number', 'Phone number added in WhatsApp Manager');
  await expectStatus(page, 'WhatsApp number', 'Connected');
  await expect(card.getByText('No phone number yet')).toBeHidden();
});

test('a number with a two-step PIN (…00001) → Enter PIN → Connected', async () => {
  await connectFakeNumber(page, {
    businessName: `Pin ${tag}`,
    phone: testPhone('00001'),
    displayName: 'Pin Number',
  });
  await expect(wizard().getByText('Action needed')).toBeVisible();
  await closeWizard(page);
  const card = numberCard(page, 'Pin Number');
  await expect(card.getByText(/Two-step verification PIN is already set/)).toBeVisible();
  await card.getByRole('button', { name: 'Enter PIN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Enter PIN' });
  await dialog.getByLabel('6-digit PIN').fill('111111');
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(dialog.getByText(/doesn't match/)).toBeVisible();
  await dialog.getByLabel('6-digit PIN').fill('123456');
  await dialog.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Number connected')).toBeVisible();
  await expectStatus(page, 'Pin Number', 'Connected');
});

test('subscribe keeps failing (…00002) → Action needed → Retry setup says so', async () => {
  await connectFakeNumber(page, {
    businessName: `Subscribe ${tag}`,
    phone: testPhone('00002'),
    displayName: 'Broken Hooks',
  });
  await closeWizard(page);
  const card = numberCard(page, 'Broken Hooks');
  await expectStatus(page, 'Broken Hooks', 'Action needed');
  await expect(card.getByText(/Couldn't subscribe this app/)).toBeVisible();
  await card.getByRole('button', { name: 'Retry setup' }).click();
  await expect(page.getByText('Number still needs attention')).toBeVisible();
  await expect(card.getByText(/Couldn't subscribe this app/)).toBeVisible();
});
