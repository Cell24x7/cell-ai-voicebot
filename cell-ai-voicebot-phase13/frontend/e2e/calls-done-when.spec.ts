import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate, FAKE, tomorrowIst } from './agents';
import {
  callEnded,
  callCost,
  expectBotLine,
  hangUp,
  liveTranscript,
  openCallDetail,
  pressKey,
  sayText,
  startWebCall,
} from './calls';
import { addContact, createField } from './contacts';
import { createFlowFromTemplate, FLOW_PAID_PHONE, FLOW_UNPAID_PHONE, LOAN, publish } from './flows';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

// Real-time calls on the fake voice: one account, a short test per scenario.
test.describe.configure({ mode: 'serial' });

const FLOW = 'Loan recovery Calls';
const AGENT = 'Calls Recovery Agent';
const NOTICE = 'Yeh call quality ke liye record ki ja rahi hai.';
let page: Page;
let paidCallId = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  await signUpOwner(page, 'calls');
  await addMoney(page, 500);
  await createField(page, { label: 'Amount', type: 'Amount (₹)' });
  await createField(page, { label: 'Due date', type: 'Date' });
  await addContact(page, {
    phone: FLOW_PAID_PHONE,
    name: 'Paid Borrower',
    values: { Amount: '2500', 'Due date': '2026-10-10' },
  });
  await addContact(page, { phone: FLOW_UNPAID_PHONE, name: 'Unpaid Borrower' });
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(page, 'Loan recovery', FLOW, AGENT);
  await publish(page, 1);
});

test.afterAll(async () => {
  await page.close();
});

test('"Done when" (keypad): greeting with name + amount → press 1 → payment found → Paid; transcript and cost', async () => {
  test.setTimeout(120_000);
  await startWebCall(page, {
    flow: { name: FLOW, version: 'published' },
    contactName: 'Paid Borrower',
  });
  await expect(page.getByText('Fake voice (test mode)')).toBeVisible();
  await expectBotLine(page, NOTICE);
  await expectBotLine(
    page,
    /Namaste Paid Borrower, main .+ ki taraf se ek AI assistant bol rahi hoon\. Aapki ₹2,500\.00 ki EMI 10 Oct 2026 ko due thi\./,
  );
  await expectBotLine(page, LOAN.menu);
  await pressKey(page, '1');
  await expectBotLine(page, LOAN.paid);
  await expectBotLine(page, LOAN.bye);
  const result = await callEnded(page);
  await expect(result.getByText(/Flow finished · \d+ s · Paid/)).toBeVisible();

  paidCallId = await openCallDetail(page);
  const transcript = page.getByRole('region', { name: 'Transcript' });
  await expect(transcript.getByText(LOAN.paid)).toBeVisible();
  await expect(transcript.getByText('[1]')).toBeVisible();
  expect(await callCost(page)).toMatch(/^Cost ₹\d+\.\d\d$/);
  await expect(
    page.getByRole('region', { name: 'Cost' }).getByText('None (web test call)'),
  ).toBeVisible();
});

test('the paid call: its recording plays from a signed WAV link; the ledger has the call charge', async () => {
  await page.goto(`/calls/${paidCallId}`);
  // the recording: a signed WAV link that plays
  await page.getByRole('button', { name: 'Load recording' }).click();
  const player = page.getByLabel('Call recording');
  const src = (await player.getAttribute('src')) ?? '';
  expect(src).toMatch(/\/recordings\/[0-9a-f]{24}\.wav\?exp=\d+&sig=/);
  const response = await page.request.get(src);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('audio/wav');
  const duration = await page.getByLabel('Call recording').evaluate(
    (el: HTMLAudioElement) =>
      new Promise<number>((resolve) => {
        if (el.readyState >= 1) {
          resolve(el.duration);
          return;
        }
        el.addEventListener('loadedmetadata', () => resolve(el.duration), { once: true });
        el.addEventListener('error', () => resolve(-1), { once: true });
        el.preload = 'metadata';
        el.load();
      }),
  );
  expect(duration).toBeGreaterThan(5);

  // the ledger: a call charge for voice + commission, no phone line
  await page.goto('/wallet?tab=transactions');
  await page
    .getByRole('button', { name: /Details of Call charge/ })
    .first()
    .click();
  const drawer = page.getByRole('region', { name: 'Transaction details' });
  await expect(drawer.getByText('₹0.00 (web test call — no phone line)')).toBeVisible();
  await expect(drawer.getByText('AI voice (TTS)')).toBeVisible();
  await expect(drawer.getByRole('link', { name: /^Call · / })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('"Done when" (voice, Hinglish): unpaid → AI checks the payment → "kal tak de dunga" → promise for tomorrow', async () => {
  test.setTimeout(120_000);
  await startWebCall(page, {
    flow: { name: FLOW, version: 'published' },
    contactName: 'Unpaid Borrower',
  });
  await expectBotLine(page, LOAN.menu);
  await pressKey(page, '1');
  await expectBotLine(page, LOAN.notFound);
  await expectBotLine(page, /Namaste Unpaid Borrower ji/); // the agent's opening line
  await sayText(page, 'maine payment kar diya');
  await expectBotLine(page, FAKE.unpaid);
  await sayText(page, 'kal tak de dunga');
  await expectBotLine(page, FAKE.promise(tomorrowIst()));
  await expectBotLine(page, LOAN.promise(tomorrowIst()));
  await expectBotLine(page, LOAN.bye);
  const result = await callEnded(page);
  await expect(result.getByText(/Promise to pay/)).toBeVisible();
});

test('English: an agent alone answers "I have paid" in English after the payment check', async () => {
  test.setTimeout(90_000);
  await startWebCall(page, {
    agent: AGENT,
    variables: { name: 'Asha' },
    testPhone: `+91${FLOW_PAID_PHONE}`,
  });
  await expectBotLine(page, /Namaste Asha ji/);
  await sayText(page, 'I have paid, the payment is done');
  await expectBotLine(
    page,
    /^Bot.*Thank you! Our records show your payment of ₹2500 on \d{2} \w{3} \d{4}\./,
  );
  await hangUp(page);
  const result = await callEnded(page);
  await expect(result.getByText(/Customer hung up/)).toBeVisible();
});

test('barge-in: words while the bot speaks cut it; the line is marked interrupted and the reply follows', async () => {
  test.setTimeout(90_000);
  await startWebCall(page, { agent: AGENT, variables: { name: 'Asha' } });
  await expectBotLine(page, NOTICE);
  // the opening line is playing now (~6 s of fake voice)
  await page.waitForTimeout(1500);
  await sayText(page, 'kal tak de dunga');
  const cut = liveTranscript(page)
    .getByRole('listitem')
    .filter({ hasText: /Namaste Asha ji/ });
  await expect(cut.getByText('interrupted')).toBeVisible({ timeout: 15_000 });
  await expectBotLine(page, FAKE.promise(tomorrowIst()));
  await expect(
    page.getByRole('list', { name: 'Call events' }).getByText(/Customer interrupted the bot/),
  ).toBeVisible();
  await hangUp(page);
  await callEnded(page);
});

test('wrong keys three times → callback branch (keys cut the prompts)', async () => {
  test.setTimeout(120_000);
  await startWebCall(page, {
    flow: { name: FLOW, version: 'published' },
    contactName: 'Paid Borrower',
  });
  await expectBotLine(page, LOAN.menu);
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Key 9', exact: true }).click();
    await page.waitForTimeout(800);
  }
  await expectBotLine(page, LOAN.callback);
  const result = await callEnded(page);
  await expect(result.getByText(/Callback requested/)).toBeVisible();
});

test('AI silence: "Hello? Kya aap sun rahe hain?" then the agent ends the call', async () => {
  test.setTimeout(120_000);
  await startWebCall(page, { agent: AGENT, variables: { name: 'Asha' } });
  await expectBotLine(page, /Namaste Asha ji/);
  await expectBotLine(page, 'Hello? Kya aap sun rahe hain?');
  const result = await callEnded(page);
  await expect(result.getByText(/Agent ended the call/)).toBeVisible();
});
