import { expect, test, type Page } from '@playwright/test';

import { callBar, CallingApi, KNOBS } from './calls-wa';
import { SUPERADMIN } from './env';
import { signIn, signUpOwner, type Owner } from './helpers';
import { chat, connectNumber, customerPhone, InboxApi, openConversation, openInbox } from './inbox';

// Phase 12 guards + money: no money → refused; the customer declines; Meta has no
// permission although our row says yes (nothing held); DND; 4 unanswered calls →
// revoked + bell; the superadmin calling rate card changes the price; margin rows.
test.describe.configure({ mode: 'serial' });

let page: Page;
let owner: Owner;
let wa: CallingApi;
let channelId: string;
const POOR = 'Poor Pankaj';
const DECLINES = 'Declining Divya';
const NO_META = 'No Meta Naveen';
const DND = 'Dnd Deepa';
const NEVER = 'Rejecting Rekha';
const TALKS = 'Talking Tara';
const poorPhone = customerPhone();
const declinesPhone = customerPhone(KNOBS.permissionDeclines);
const noMetaPhone = customerPhone(KNOBS.noPermission);
const dndPhone = customerPhone();
const neverPhone = customerPhone(KNOBS.rejects);
const talksPhone = customerPhone(KNOBS.hangsUpAfter5s);

const callYourself = async (name: string) => {
  await openInbox(page);
  await openConversation(page, name);
  const c = chat(page, name);
  await expect(c.getByRole('button', { name: 'Call', exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await c.getByRole('button', { name: 'Call', exact: true }).first().click();
  await page.getByRole('menuitem', { name: /Call yourself/ }).click();
};

test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  owner = await signUpOwner(page, 'waguards');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Guards ${Date.now().toString(36)}`,
  });
  wa = await CallingApi.signIn(playwright, owner.email);
  channelId = await wa.api.channelId();
  for (const [name, phone] of [
    [POOR, poorPhone],
    [DECLINES, declinesPhone],
    [NO_META, noMetaPhone],
    [DND, dndPhone],
    [NEVER, neverPhone],
    [TALKS, talksPhone],
  ] as const) {
    await wa.api.createContact(name, phone);
    await wa.api.simulate(channelId, 'inbound_text', { from: phone, text: 'Hello' });
    await wa.api.waitConversation(phone);
  }
  await wa.enableCalling(channelId);
});
test.afterAll(async () => {
  await wa.dispose();
  await page.close();
});

test('an empty wallet refuses the call before dialing', async () => {
  await wa.allow(channelId, poorPhone);
  await callYourself(POOR);
  await expect(callBar(page).getByText('Add money to your wallet to make calls.')).toBeVisible({
    timeout: 20_000,
  });
  await callBar(page).getByRole('button', { name: 'Close' }).click();
  expect(await wa.lastCall()).toBeUndefined();
});

test('the customer declines → "Can\'t call"; a second request the same day is refused', async ({
  playwright,
}) => {
  await wa.api.fund(playwright);
  await openInbox(page);
  await openConversation(page, DECLINES);
  const c = chat(page, DECLINES);
  await c.getByRole('button', { name: 'Request permission' }).first().click();
  await page
    .getByRole('dialog', { name: 'Ask to allow calls' })
    .getByRole('button', {
      name: 'Send request',
    })
    .click();
  await expect(c.getByRole('button', { name: "Can't call" }).first()).toBeDisabled({
    timeout: 30_000,
  });
  await expect(page.getByText('The customer declined calls.').first()).toBeVisible();
  const again = await wa.api.post('/whatsapp/call-permissions/request', {
    channelId,
    contactId: await wa.contactId(declinesPhone),
  });
  expect(again.status).toBe(429);
  expect(again.code).toMatch(/^WHATSAPP_CALL_PERMISSION_LIMIT/);
});

test('Meta has no permission (our row says yes) → WhatsApp decides: revoked, refused, nothing held', async () => {
  await wa.allow(channelId, noMetaPhone);
  await openInbox(page);
  await openConversation(page, NO_META);
  // the panel asks WhatsApp: no permission there → no Call button, a new request instead
  await expect(
    chat(page, NO_META).getByRole('button', { name: 'Request permission' }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible();
  const refused = await wa.api.postWithKey('/whatsapp/calls', {
    channelId,
    contactId: await wa.contactId(noMetaPhone),
    mode: 'human',
  });
  expect(refused.code).toBe('WHATSAPP_CALL_PERMISSION_MISSING');
  const wallet = await wa.api.get<{ holdMicros: number }>('/wallet');
  expect(wallet.data.holdMicros).toBe(0);
  expect((await wa.calls()).some((c) => c.status !== 'failed')).toBe(false);
});

test('a DND number cannot be called', async () => {
  await wa.allow(channelId, dndPhone);
  const r = await wa.api.post('/dnd-entries', {
    phone: dndPhone,
    reason: 'Asked not to be called',
  });
  expect(r.status, r.code).toBeLessThan(300);
  await openInbox(page);
  await openConversation(page, DND);
  const button = chat(page, DND).getByRole('button', { name: "Can't call" }).first();
  await expect(button).toBeDisabled({ timeout: 20_000 });
  const refused = await wa.api.postWithKey('/whatsapp/calls', {
    channelId,
    contactId: await wa.contactId(dndPhone),
    mode: 'human',
  });
  expect(refused.code).toBe('CALL_NOT_ALLOWED');
});

test('4 calls not picked up → the permission is revoked, with a bell', async () => {
  test.setTimeout(180_000);
  await wa.allow(channelId, neverPhone);
  const contactId = await wa.contactId(neverPhone);
  // knob 00021: the phone rings and the customer rejects — a call not picked up (like
  // Meta's streak; 00022 rings the full 45 s each time)
  for (let i = 0; i < 4; i += 1) {
    const r = await wa.api.postWithKey<{ callId: string }>('/whatsapp/calls', {
      channelId,
      contactId,
      mode: 'human',
    });
    expect(r.status, r.code).toBe(201);
    await expect
      .poll(async () => (await wa.calls()).find((c) => c.id === r.data.callId)?.status, {
        timeout: 30_000,
      })
      .not.toMatch(/^(queued|ringing|in_progress)$/);
  }
  await expect
    .poll(
      async () =>
        (
          await wa.api.get<{ status: string }>(
            `/whatsapp/call-permissions?channelId=${channelId}&contactId=${contactId}`,
          )
        ).data.status,
      { timeout: 20_000 },
    )
    .toBe('revoked');
  await page.reload();
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(
    page.getByRole('menuitem', { name: /Call permission removed after unanswered calls/ }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
});

test('a connected call is charged; superadmin: margin rows include it, a calling rate card import changes the price', async ({
  browser,
  playwright,
}) => {
  test.setTimeout(180_000);
  // knob 00027: the customer answers and hangs up after 5 s → a charge in the ledger
  await wa.allow(channelId, talksPhone);
  await callYourself(TALKS);
  await expect(callBar(page).getByText(/^Call ended/)).toBeVisible({ timeout: 40_000 });
  await callBar(page).getByRole('button', { name: 'Close' }).click();
  expect((await wa.ended()).status).toBe('completed');
  const accountId = await wa.api.accountId();
  const admin = await InboxApi.signIn(playwright, SUPERADMIN.email, SUPERADMIN.password);
  const before = await admin.get<{ current: { callingMarkets: unknown[] } | null }>(
    '/admin/whatsapp-rates?kind=calling',
  );
  const sa = await (await browser.newContext()).newPage();
  try {
    await signIn(sa, SUPERADMIN.email, SUPERADMIN.password);
    await expect(sa.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await sa.goto('/admin/whatsapp-billing?tab=calling');
    await sa.getByLabel('Calling rate card CSV').setInputFiles({
      name: 'calls.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Market,Currency,Per minute\nIndia,INR,0.60\nOther,INR,1.00\n'),
    });
    await expect(sa.getByText(/IN: ₹0\.\d+ → ₹0\.60 a minute/)).toBeVisible({ timeout: 20_000 });
    await sa.getByRole('button', { name: 'Save calling rates' }).click();
    await expect(sa.getByText('Calling rate card saved')).toBeVisible();
    // the owner's wallet: ₹0.60 × 1.15 = ₹0.69 a minute
    await page.goto('/wallet');
    await expect(
      page.getByRole('table', { name: 'WhatsApp call prices' }).getByRole('row', { name: /India/ }),
    ).toContainText('₹0.69', { timeout: 20_000 });
    await sa.goto('/admin/whatsapp-billing?tab=margin');
    await sa.getByRole('textbox', { name: 'Account id (optional)' }).fill(accountId);
    await expect(
      sa
        .getByRole('table', { name: 'WhatsApp margin' })
        .getByRole('row', { name: /WhatsApp calls/ }),
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    // back to the card the other specs price with
    if (before.data.current)
      await admin.post('/admin/whatsapp-rates', {
        kind: 'calling',
        callingMarkets: before.data.current.callingMarkets,
        source: 'manual',
        note: 'E2E restore',
      });
    await admin.dispose();
    await sa.context().close();
  }
});
