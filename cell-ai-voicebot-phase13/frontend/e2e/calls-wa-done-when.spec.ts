import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import {
  callBar,
  callBubble,
  CallingApi,
  expectInCall,
  KNOBS,
  openCallingSettings,
} from './calls-wa';
import { createFlowFromTemplate, publish } from './flows';
import { signUpOwner, type Owner } from './helpers';
import { chat, connectNumber, customerPhone, openConversation, openInbox } from './inbox';
import { expectLedgerLine } from './templates';

// Phase 12 "Done when": calling on → permission request → the customer allows → an
// agent call with two-way audio (the fake phone hears the agent's tone), mute, keys,
// hang up → call bubble, recording, wallet line priced in pulses; an AI call with keys.
test.describe.configure({ mode: 'serial' });

let page: Page;
let owner: Owner;
let wa: CallingApi;
let channelId: string;
const ASKED = 'Asha Permission';
const CALLED = 'Ravi Callme';
const AI = 'Paid Presser';
const askedPhone = customerPhone(KNOBS.permissionTemporary);
const calledPhone = customerPhone(KNOBS.answersAfter2s);
const aiPhone = customerPhone(KNOBS.pressesOne);

test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  owner = await signUpOwner(page, 'wacall');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Calls ${Date.now().toString(36)}`,
  });
  wa = await CallingApi.signIn(playwright, owner.email);
  await wa.api.fund(playwright);
  channelId = await wa.api.channelId();
  for (const [name, phone] of [
    [ASKED, askedPhone],
    [CALLED, calledPhone],
    [AI, aiPhone],
  ] as const) {
    await wa.api.createContact(name, phone);
    await wa.api.simulate(channelId, 'inbound_text', { from: phone, text: 'Namaste' });
    await wa.api.waitConversation(phone);
  }
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', 'Recovery Bot WA');
  await createFlowFromTemplate(page, 'Loan recovery', 'Loan recovery WA', 'Recovery Bot WA');
  await publish(page, 1);
});
test.afterAll(async () => {
  await wa.dispose();
  await page.close();
});

test('the owner turns calling on in the number settings', async () => {
  const calling = await openCallingSettings(page);
  await expect(calling.getByText('Calling off')).toBeVisible();
  await calling.getByRole('switch', { name: 'WhatsApp calling' }).click();
  const confirm = page.getByRole('dialog', { name: 'Turn on WhatsApp calling?' });
  await confirm.getByRole('button', { name: 'Turn on' }).click();
  await expect(calling.getByText('Calling on')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Close details' }).click();
});

test('Request permission → the customer allows → "Can call until …" live', async () => {
  await openInbox(page);
  await openConversation(page, ASKED);
  const c = chat(page, ASKED);
  await c.getByRole('button', { name: 'Request permission' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Ask to allow calls' });
  await expect(dialog.getByRole('textbox', { name: 'Message' })).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(c.getByRole('button', { name: 'Requested · waiting' }).first()).toBeVisible();
  // knob 00023: the fake customer allows (temporary, 7 days)
  await expect(c.getByRole('button', { name: 'Call', exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/^Can call until /)).toBeVisible();
  // the request bubble shows the answer and the customer's reply bubble carries it
  await expect(
    page.getByRole('log', { name: 'Messages' }).getByText('Allowed calls for 7 days'),
  ).toHaveCount(2);
});

test('Call yourself: the phone answers, hears the agent, keys, mute; hang up → bubble, recording, pulses in the wallet', async () => {
  test.setTimeout(180_000);
  await wa.allow(channelId, calledPhone);
  await openConversation(page, CALLED);
  const c = chat(page, CALLED);
  await expect(c.getByRole('button', { name: 'Call', exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await c.getByRole('button', { name: 'Call', exact: true }).first().click();
  await page.getByRole('menuitem', { name: /Call yourself/ }).click();
  const bar = callBar(page);
  await expect(bar).toBeVisible();
  await expectInCall(page);
  // the customer heard the agent's 1 kHz microphone tone (after the recording notice)
  await expect
    .poll(
      async () =>
        (await wa.fakeCalls(channelId)).find((v) => v.toLast4 === calledPhone.slice(-4))?.heardTone,
      { timeout: 40_000 },
    )
    .toBe(true);
  await bar.getByRole('button', { name: 'Mute' }).click();
  await expect(bar.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
  await bar.getByRole('button', { name: 'Unmute' }).click();
  await bar.getByRole('button', { name: 'Keypad' }).click();
  await page.getByRole('group', { name: 'Keypad' }).getByRole('button', { name: 'Key 5' }).click();
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Hang up' }).click();
  await expect(bar.getByText(/^Call ended/)).toBeVisible({ timeout: 30_000 });
  await bar.getByRole('button', { name: 'Close' }).click();
  const call = await wa.ended();
  expect(call.status).toBe('completed');
  const bubble = callBubble(page, /^Call · \d+:\d{2}$/);
  await expect(bubble).toBeVisible({ timeout: 20_000 });
  await bubble.click();
  await expect(
    page.getByRole('region', { name: 'WhatsApp' }).getByText('Your business called'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recording' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Load recording' }).click();
  const audio = page.getByLabel('Call recording');
  await audio.evaluate(async (element: HTMLAudioElement) => {
    await element.play();
  });
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0);
  await audio.evaluate((element: HTMLAudioElement) => element.pause());
  // Meta's talk time in 6-second pulses at ₹0.3885 / min × 1.15 (paise rounded up per call)
  const settled = await wa.ended();
  const seconds = settled.whatsapp?.metaDuration ?? 0;
  const pulses = Math.ceil(seconds / 6);
  const paise = Math.ceil((pulses * 38_850 * 1.15) / 10_000);
  await expectLedgerLine(page, 'WhatsApp call · India', `−₹${(paise / 100).toFixed(2)}`);
});

test('Call with AI: the Loan recovery flow, the customer presses 1 → Paid', async () => {
  test.setTimeout(180_000);
  await wa.allow(channelId, aiPhone);
  await openInbox(page);
  await openConversation(page, AI);
  const c = chat(page, AI);
  await expect(c.getByRole('button', { name: 'Call', exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await c.getByRole('button', { name: 'Call', exact: true }).first().click();
  await page.getByRole('menuitem', { name: /Call with AI/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Call with AI' });
  await expect(dialog.getByLabel('Estimated cost')).toContainText('a minute');
  await dialog.getByRole('combobox', { name: 'Published flow' }).click();
  await page.getByRole('option', { name: 'Loan recovery WA' }).click();
  await dialog.getByRole('button', { name: 'Call with AI' }).click();
  const bar = callBar(page);
  await expect(bar.getByText('AI is talking')).toBeVisible({ timeout: 30_000 });
  const call = await wa.ended('provider=whatsapp&mode=ai');
  expect(call.mode).toBe('ai');
  expect(call.disposition).toBe('paid');
  await expect(bar.getByText(/^Call ended/)).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: 'Close' }).click();
  await page.goto(`/calls/${call.id}`);
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('Paid');
  await expect(page.getByRole('region', { name: 'Cost' })).toContainText('AI conversation');
});
