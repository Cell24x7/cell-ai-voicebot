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

// Phase 9 "Done when": an owner connects a Cloud API number (fake Meta), sees it live,
// loses access, reconnects the same number and disconnects it.
test.describe.configure({ mode: 'serial' });

let page: Page;
const business = `E2E WA Connect ${Date.now().toString(36)}`;
const phone = testPhone();
const LABEL = 'Asha Traders';

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signUpOwner(page, 'waconnect');
});
test.afterAll(async () => {
  await page.close();
});

test('empty state → Connect → Cloud API → Connected card', async () => {
  await openNumbers(page);
  await expect(page.getByText('No WhatsApp number connected yet')).toBeVisible();
  await connectFakeNumber(page, {
    businessName: business,
    phone,
    displayName: LABEL,
    mode: 'cloud_api',
  });
  const wizard = page.getByRole('dialog', { name: 'Connect WhatsApp' });
  await expect(wizard.getByText('Connected', { exact: true })).toBeVisible();
  await closeWizard(page);
  const card = numberCard(page, LABEL);
  await expect(card.getByText('Connected', { exact: true })).toBeVisible();
  await expect(card.getByText(phone)).toBeVisible();
  await expect(card.getByText('High quality')).toBeVisible();
  await expect(card.getByText('Cloud API')).toBeVisible();
  await expect(card.getByText(/Limit 2K \/ day/)).toBeVisible();
  await expect(card.getByText(/Name approved/)).toBeVisible();
  await expect(card.getByText('Meta billed to: platform credit line ✓')).toBeVisible();
});

test('details drawer: ids and history; rename', async () => {
  await numberCard(page, LABEL).getByRole('button', { name: 'Details' }).click();
  const drawer = page.getByRole('dialog', { name: 'Number details' });
  await expect(drawer.getByText(/^fake_waba_[0-9a-f]{12}$/)).toBeVisible();
  await expect(drawer.getByText(/^fake_phone_[0-9a-f]{12}$/)).toBeVisible();
  await expect(drawer.getByRole('list', { name: 'History' }).getByText('Connected')).toBeVisible();
  await drawer.getByRole('button', { name: 'Close details' }).click();
  await numberCard(page, LABEL).getByRole('button', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename number' });
  await rename.getByLabel('Name in this app').fill('Support line');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(numberCard(page, 'Support line')).toBeVisible();
});

test('simulated quality downgrade and flag → live card + bell', async () => {
  await simulateEvent(page, 'Support line', 'Quality downgrade');
  await expect(numberCard(page, 'Support line').getByText('Medium quality')).toBeVisible({
    timeout: 20_000,
  });
  await expect(numberCard(page, 'Support line').getByText(/Limit 250 \/ day/)).toBeVisible();
  await simulateEvent(page, 'Support line', 'Number flagged');
  await expect(numberCard(page, 'Support line').getByText('Low quality')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await expect(
    page.getByRole('menu').getByText('WhatsApp number quality is low').first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
});

test('access revoked → Needs reconnect → Reconnect (same number, history kept)', async () => {
  await simulateEvent(page, 'Support line', 'Access revoked (token)');
  await expectStatus(page, 'Support line', 'Needs reconnect');
  const card = numberCard(page, 'Support line');
  await expect(card.getByText(/reconnect the number/)).toBeVisible();
  await card.getByRole('button', { name: 'Reconnect' }).click();
  // the wizard is open now; finish the signup with the same number
  const wizard = page.getByRole('dialog', { name: 'Connect WhatsApp' });
  await expect(wizard.getByText(/Reconnect Support line: sign up again/)).toBeVisible();
  await wizard.getByRole('button', { name: 'Continue' }).click();
  const testSignup = page.getByRole('dialog', { name: 'Test signup (Meta is simulated)' });
  await testSignup.getByLabel('Business name').fill(business);
  await testSignup.getByLabel('Phone number').fill(phone);
  await testSignup.getByLabel('Display name').fill(LABEL);
  const response = page.waitForResponse((r) => r.url().includes('/embedded-signup'));
  await testSignup.getByRole('button', { name: 'Finish signup' }).click();
  await response;
  await expect(wizard.getByText(/\(reconnected\)/)).toBeVisible();
  await closeWizard(page);
  await expectStatus(page, 'Support line', 'Connected');
  await expect(page.getByRole('region', { name: /^WhatsApp number / })).toHaveCount(1);
  await numberCard(page, 'Support line').getByRole('button', { name: 'Details' }).click();
  const history = page
    .getByRole('dialog', { name: 'Number details' })
    .getByRole('list', { name: 'History' });
  await expect(history.getByText(/^Needs reconnect/)).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
});

test('disconnect → Disconnected (Connect again offered)', async () => {
  const card = numberCard(page, 'Support line');
  await card.getByRole('button', { name: 'Disconnect' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(/The number keeps working on WhatsApp/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Disconnect' }).click();
  await expectStatus(page, 'Support line', 'Disconnected');
  await expect(card.getByRole('button', { name: 'Connect again' })).toBeVisible();
});
