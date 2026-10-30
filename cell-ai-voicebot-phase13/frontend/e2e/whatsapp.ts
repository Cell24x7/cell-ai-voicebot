import { createHmac } from 'node:crypto';

import { expect, type Locator, type Page } from '@playwright/test';

import { FAKE_META_APP_SECRET } from './env';

export type FakeOutcome = 'Finish' | 'Finish without a phone number' | 'Cancel at a step' | 'Error';

export interface FakeNumber {
  businessName: string;
  phone: string;
  displayName?: string;
  mode?: 'cloud_api' | 'coexistence';
  outcome?: FakeOutcome;
}

let seq = 0;
/**
 * A test phone unique per run (`+91 9…`); `suffix` picks a fake Meta knob
 * (`00001` needs the PIN 123456, `00002` can't subscribe) — otherwise it never ends in one.
 */
export const testPhone = (suffix?: string): string => {
  seq += 1;
  const head = (Date.now() % 100_000).toString().padStart(5, '0');
  const tail = suffix ?? `1${String(seq).padStart(4, '0')}`;
  return `+91 9${head.slice(0, 4)} ${head.slice(4)}${tail}`.replace(/\s+/g, ' ');
};

export const numberCard = (page: Page, label: string): Locator =>
  page.getByRole('region', { name: `WhatsApp number ${label}` });

export async function openNumbers(page: Page) {
  // client-side navigation (a reload would end an impersonation)
  await page.getByRole('link', { name: 'WhatsApp', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'WhatsApp' })).toBeVisible();
}

/**
 * Connect WhatsApp → kind of number → Test signup dialog → Finish signup. Waits for
 * the signup response (when the outcome sends a code) before the caller asserts.
 */
export async function connectFakeNumber(page: Page, n: FakeNumber, button = 'Connect WhatsApp') {
  await page.getByRole('button', { name: button }).first().click();
  const wizard = page.getByRole('dialog', { name: 'Connect WhatsApp' });
  await expect(wizard).toBeVisible();
  if (n.mode === 'coexistence') {
    await wizard.getByRole('radio', { name: /Number on the WhatsApp Business app/ }).check();
  } else if (n.mode === 'cloud_api') {
    await wizard.getByRole('radio', { name: /New or Cloud API number/ }).check();
  }
  await wizard.getByRole('button', { name: 'Continue' }).click();
  const test = page.getByRole('dialog', { name: 'Test signup (Meta is simulated)' });
  await test.getByLabel('Business name').fill(n.businessName);
  await test.getByLabel('Phone number').fill(n.phone);
  await test.getByLabel('Display name').fill(n.displayName ?? n.businessName);
  const outcome = n.outcome ?? 'Finish';
  if (outcome !== 'Finish') {
    await test.getByRole('combobox', { name: 'Outcome' }).click();
    await page.getByRole('option', { name: outcome, exact: true }).click();
  }
  if (outcome === 'Cancel at a step') {
    await test.getByRole('button', { name: 'Finish signup' }).click();
    return;
  }
  const response = page.waitForResponse(
    (r) =>
      r.url().includes('/whatsapp/channels/embedded-signup') && r.request().method() === 'POST',
  );
  await test.getByRole('button', { name: 'Finish signup' }).click();
  await response;
}

export async function closeWizard(page: Page) {
  await page
    .getByRole('dialog', { name: 'Connect WhatsApp' })
    .getByRole('button', { name: 'Done' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Connect WhatsApp' })).toBeHidden();
}

/** Dev simulator through the card's details drawer (Send test event). */
export async function simulateEvent(page: Page, label: string, event: string) {
  await numberCard(page, label).getByRole('button', { name: 'Details' }).click();
  const drawer = page.getByRole('dialog', { name: 'Number details' });
  await drawer.getByRole('button', { name: 'Send test event' }).click();
  await page.getByRole('menuitem', { name: event, exact: true }).click();
  await expect(page.getByText(`Test event sent: ${event}`)).toBeVisible();
  await drawer.getByRole('button', { name: 'Close details' }).click();
  await expect(drawer).toBeHidden();
}

export async function expectStatus(page: Page, label: string, status: string) {
  await expect(numberCard(page, label).getByText(status, { exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** `X-Hub-Signature-256` with the E2E fake app secret. */
export const signBody = (body: string): string =>
  `sha256=${createHmac('sha256', FAKE_META_APP_SECRET).update(body).digest('hex')}`;

/** Meta's `signed_request` (deauthorize / data deletion) with the E2E fake app secret. */
export const signedRequest = (userId: string): string => {
  const payload = Buffer.from(
    JSON.stringify({
      algorithm: 'HMAC-SHA256',
      user_id: userId,
      issued_at: Math.floor(Date.now() / 1000),
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', FAKE_META_APP_SECRET).update(payload).digest('base64url');
  return `${sig}.${payload}`;
};
