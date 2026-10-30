import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import {
  campaignCounter,
  createCampaign,
  importCampaignSample,
  setAccountWindow,
  waitForCounter,
} from './campaigns';
import { createField } from './contacts';
import { createFlowFromTemplate, publish } from './flows';
import { openAdminAccount, signInAsSuperadmin, signUpOwner } from './helpers';
import { addMoney } from './wallet';

// A dry run's virtual cost against a small wallet: auto-pause, top up, auto-resume, cancel.
test.describe.configure({ mode: 'serial' });

const FLOW = 'Loan recovery Money';
const AGENT = 'Money Recovery Agent';
const NAME = 'Small wallet run';
const WALLET_PAUSE = 'Paused — the wallet would run out (dry run)';
let page: Page;
let url = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  page = await browser.newPage();
  const owner = await signUpOwner(page, 'campmoney');
  // ₹20 is below the smallest top-up: the platform team credits it
  const admin = await (await browser.newContext()).newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('tab', { name: 'Wallet' }).click();
  await admin.getByRole('button', { name: 'Adjust balance' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Adjust wallet' });
  await dialog.getByLabel('Amount (₹)').fill('20');
  await dialog.getByLabel('Reason').fill('Campaign test credit');
  await dialog.getByRole('button', { name: 'Review' }).click();
  await dialog.getByRole('button', { name: 'Add money' }).click();
  await expect(dialog).toBeHidden();
  await admin.close();

  await createField(page, { label: 'Amount', type: 'Amount (₹)' });
  await createField(page, { label: 'Due date', type: 'Date' });
  await createField(page, { label: 'Loan id', type: 'Text' });
  await importCampaignSample(page);
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(page, 'Loan recovery', FLOW, AGENT);
  await publish(page, 1);
  await setAccountWindow(page, { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] });
});

test.afterAll(async () => {
  await page.close();
});

test('₹20 wallet: the dry run pauses before its virtual cost passes the balance; the bell says so', async () => {
  test.setTimeout(240_000);
  await createCampaign(page, { name: NAME, flow: FLOW, speed: 20 });
  url = page.url();
  await expect(page.getByText(WALLET_PAUSE)).toBeVisible({ timeout: 200_000 });
  await expect(page.getByRole('link', { name: 'Add money' })).toBeVisible();
  expect(await campaignCounter(page, 'Completed')).toBeLessThan(100);
  await page.getByRole('button', { name: /^Notifications, \d+ unread/ }).click();
  await expect(
    page
      .getByRole('menuitem')
      .filter({ hasText: /Campaign paused.*Small wallet run/ })
      .first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
});

test('adding ₹500 resumes it by itself: running again, counters move', async () => {
  test.setTimeout(180_000);
  const before = await campaignCounter(page, 'Completed');
  await addMoney(page, 500);
  await page.goto(url);
  await expect(page.getByText(WALLET_PAUSE)).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await waitForCounter(page, 'Completed', (n) => n > before, 120_000);
});

test('cancel with "Also hang up calls in progress": canceled, nothing left calling', async () => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Also hang up calls in progress').check();
  await dialog.getByRole('button', { name: 'Cancel campaign' }).click();
  await expect(page.getByText('Canceled', { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.reload();
  await waitForCounter(page, 'Calling', (n) => n === 0, 60_000);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeHidden();
});
