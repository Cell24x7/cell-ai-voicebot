import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Web call helpers. The backend runs the fake voice (tones for speech, 60 ms
 * per character, real time) and allows typed customer words; Chromium's mic
 * is a file of near silence. Bot lines appear in the live transcript once
 * they have finished playing.
 */

/** Fake TTS speaks ~60 ms per character in real time: long lines need a long wait. */
export const LINE_TIMEOUT = 45_000;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const liveTranscript = (page: Page): Locator =>
  page.getByRole('list', { name: 'Live transcript' });

/** /calls/test → pick the flow (version) or agent, the customer → Start call → in call. */
export async function startWebCall(
  page: Page,
  options: {
    flow?: { name: string; version: 'published' | 'draft' };
    agent?: string;
    contactName?: string;
    variables?: Record<string, string>;
    testPhone?: string;
  },
) {
  await page.goto('/calls/test');
  const setup = page.getByRole('region', { name: 'Call setup' });
  if (options.agent) {
    await setup.getByRole('radio', { name: 'An AI agent alone' }).check();
    await setup.getByRole('combobox', { name: 'AI agent' }).click();
    await page.getByRole('option', { name: options.agent, exact: true }).click();
  } else if (options.flow) {
    await setup.getByRole('combobox', { name: 'Flow' }).fill(options.flow.name);
    await page.getByRole('option', { name: options.flow.name, exact: true }).click();
    await setup.getByRole('combobox', { name: 'Version' }).click();
    await page
      .getByRole('option', {
        name: options.flow.version === 'draft' ? 'Saved draft' : /^Published \(v\d+\)$/,
      })
      .click();
  }
  if (options.contactName) {
    await setup.getByRole('radio', { name: 'A contact' }).check();
    await setup.getByRole('combobox', { name: 'Contact' }).fill(options.contactName);
    await page
      .getByRole('option', { name: new RegExp(`^${escape(options.contactName)} ·`) })
      .click();
  } else {
    for (const [name, value] of Object.entries(options.variables ?? {})) {
      await setup.getByRole('textbox', { name: `{{${name}}}` }).fill(value);
    }
    if (options.testPhone) await setup.getByLabel('Test phone (optional)').fill(options.testPhone);
  }
  await setup.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByText('In call', { exact: true })).toBeVisible({ timeout: 20_000 });
}

/** A final bot line (exact text or pattern). */
export async function expectBotLine(page: Page, text: string | RegExp): Promise<Locator> {
  // final lines only: a line shows greyed while it plays and solid once it was heard
  const line = liveTranscript(page)
    .locator('li[data-final="true"]')
    .filter({ hasText: /^Bot/ })
    .filter({ hasText: text });
  await expect(line.last()).toBeVisible({ timeout: LINE_TIMEOUT });
  return line.last();
}

export async function expectCustomerLine(page: Page, text: string): Promise<Locator> {
  const line = liveTranscript(page)
    .locator('li[data-final="true"]')
    .filter({ hasText: /^Customer/ })
    .filter({ hasText: text });
  await expect(line.last()).toBeVisible({ timeout: 15_000 });
  return line.last();
}

export async function pressKey(page: Page, key: string) {
  await page.getByRole('button', { name: `Key ${key}`, exact: true }).click();
  await expectCustomerLine(page, `[${key}]`);
}

/** Types the customer's words (fake voice) and waits until the server heard them. */
export async function sayText(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Type instead of speaking' });
  await box.fill(text);
  await box.press('Enter');
  await expectCustomerLine(page, text);
}

export async function hangUp(page: Page) {
  await page.getByRole('button', { name: 'Hang up' }).click();
}

/** Waits for the end of the call; returns the result card. */
export async function callEnded(page: Page): Promise<Locator> {
  const result = page.getByRole('region', { name: 'Call result' });
  await expect(result.getByRole('link', { name: /Open call details/ })).toBeVisible({
    timeout: LINE_TIMEOUT,
  });
  return result;
}

/** From the result card to `/calls/:id`; returns the call id. */
export async function openCallDetail(page: Page): Promise<string> {
  const result = await callEnded(page);
  await result.getByRole('link', { name: /Open call details/ }).click();
  await page.waitForURL(/\/calls\/[0-9a-f]{24}$/);
  await expect(page.getByRole('region', { name: 'Summary' })).toBeVisible();
  const id = /\/calls\/([0-9a-f]{24})/.exec(page.url())?.[1];
  if (!id) throw new Error(`No call id in ${page.url()}`);
  return id;
}

/** The "Cost ₹x.xx" heading of the call detail. */
export async function callCost(page: Page): Promise<string> {
  const heading = page.getByRole('region', { name: 'Cost' }).getByRole('heading');
  await expect(heading).toHaveText(/^Cost ₹/);
  return (await heading.textContent()) ?? '';
}
