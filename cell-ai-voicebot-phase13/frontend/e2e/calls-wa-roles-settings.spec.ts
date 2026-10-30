import { expect, test, type Browser, type Page } from '@playwright/test';

import { callBar, CallingApi, incoming, KNOBS, openCallingSettings } from './calls-wa';
import { inviteMember } from './contacts';
import { openAdminAccount, signInAsSuperadmin, signUpOwner, type Owner } from './helpers';
import { chat, connectNumber, customerPhone, InboxApi, openConversation, openInbox } from './inbox';

// Phase 12 roles + settings: a viewer reads only (no Call, no ringing); an agent calls;
// an impersonating superadmin reads only; the owner's call settings round-trip (call
// hours, ringing); a coexistence number can't call; a restriction shows; other
// accounts get 404.
test.describe.configure({ mode: 'serial' });

let page: Page;
let owner: Owner;
let wa: CallingApi;
let channelId: string;
let agent: Page;
let viewer: Page;
const CUSTOMER = 'Roles Ritu';
const phone = customerPhone(KNOBS.hangsUpAfter5s);

test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  owner = await signUpOwner(page, 'waroles');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Roles ${Date.now().toString(36)}`,
  });
  wa = await CallingApi.signIn(playwright, owner.email);
  await wa.api.fund(playwright);
  channelId = await wa.api.channelId('Support line');
  await wa.api.createContact(CUSTOMER, phone);
  await wa.api.simulate(channelId, 'inbound_text', { from: phone, text: 'Hello' });
  await wa.api.waitConversation(phone);
  await wa.enableCalling(channelId, { inbound: { route: 'team', ringTimeoutSec: 30 } });
  await wa.allow(channelId, phone);
  agent = await inviteMember(page, browser, 'Agent', 'Arjun Agent');
  viewer = await inviteMember(page, browser, 'Viewer', 'Vani Viewer');
  await wa.setAvailability('busy');
});
test.afterAll(async () => {
  await wa.dispose();
  for (const p of [agent, viewer]) await p.context().close();
  await page.close();
});

test('a viewer reads the calling state but has no Call button and never rings', async () => {
  test.setTimeout(120_000);
  await openInbox(viewer);
  await openConversation(viewer, CUSTOMER);
  await expect(viewer.getByText('WhatsApp calling').first()).toBeVisible({ timeout: 20_000 });
  await expect(chat(viewer, CUSTOMER).getByRole('button', { name: /^Call/ })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: /^Call availability/ })).toHaveCount(0);
  // a customer calls: the agent rings, the viewer doesn't
  await wa.userCall(channelId, customerPhone());
  await expect(incoming(agent)).toBeVisible({ timeout: 20_000 });
  await expect(incoming(viewer)).toHaveCount(0);
  await incoming(agent).getByRole('button', { name: 'Decline' }).click();
  await wa.ended('provider=whatsapp&direction=inbound');
});

test('an agent calls the customer from the chat', async () => {
  test.setTimeout(120_000);
  await openInbox(agent);
  await openConversation(agent, CUSTOMER);
  const c = chat(agent, CUSTOMER);
  await expect(c.getByRole('button', { name: 'Call', exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await c.getByRole('button', { name: 'Call', exact: true }).first().click();
  await agent.getByRole('menuitem', { name: /Call yourself/ }).click();
  // knob 00027: the customer answers and hangs up after 5 s
  await expect(callBar(agent).getByText(/^Call ended/)).toBeVisible({ timeout: 40_000 });
  await callBar(agent).getByRole('button', { name: 'Close' }).click();
  const call = await wa.ended('provider=whatsapp&direction=outbound');
  expect(call).toMatchObject({ status: 'completed', mode: 'human' });
});

test('an impersonating superadmin reads only: no Call button, settings locked', async ({
  browser,
}) => {
  const admin = await impersonate(browser, owner);
  await openInbox(admin);
  await openConversation(admin, CUSTOMER);
  await expect(admin.getByText('WhatsApp calling').first()).toBeVisible({ timeout: 20_000 });
  await expect(chat(admin, CUSTOMER).getByRole('button', { name: /^Call/ })).toHaveCount(0);
  const calling = await openCallingSettings(admin);
  await expect(calling.getByRole('switch', { name: 'WhatsApp calling' })).toBeDisabled();
  await expect(calling.getByRole('button', { name: 'Save call settings' })).toHaveCount(0);
  await admin.context().close();
});

test('the owner sets call hours and ringing; overlapping hours are refused; saved settings come back', async () => {
  const calling = await openCallingSettings(page);
  await calling.getByRole('switch', { name: 'Only take calls during call hours' }).click();
  const week = calling.getByRole('group', { name: 'Weekly hours' });
  await week.getByRole('button', { name: 'Add Mon range' }).click();
  // a second Monday range (14:00–18:00) overlaps 09:00–18:00
  await week.getByRole('button', { name: 'Add Mon range' }).click();
  await expect(calling.getByRole('button', { name: 'Save call settings' })).toBeDisabled();
  await week.getByRole('button', { name: 'Remove Mon range' }).last().click();
  await week.getByRole('button', { name: 'Add Sat range' }).click();
  await calling.getByRole('spinbutton', { name: 'Ring for (seconds)' }).fill('20');
  await calling.getByRole('button', { name: 'Save call settings' }).click();
  await expect(page.getByText('Call settings saved')).toBeVisible();
  const saved = await wa.api.get<{
    callHours: { enabled: boolean; weekly: { day: string; open: string; close: string }[] };
    inbound: { ringTimeoutSec: number };
  }>(`/whatsapp/channels/${channelId}/calling`);
  expect(saved.data.callHours.enabled).toBe(true);
  expect(saved.data.callHours.weekly).toEqual([
    { day: 'MONDAY', open: '0900', close: '1800' },
    { day: 'SATURDAY', open: '0900', close: '1800' },
  ]);
  expect(saved.data.inbound.ringTimeoutSec).toBe(20);
  await page.reload();
  const again = await openCallingSettings(page);
  await expect(again.getByRole('spinbutton', { name: 'Ring for (seconds)' })).toHaveValue('20');
  await expect(
    again.getByRole('group', { name: 'Weekly hours' }).getByRole('button', { name: /^Remove/ }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Close details' }).click();
});

test('WhatsApp restricts calling → a warning on the number and a bell; lifted again', async () => {
  await wa.api.simulate(channelId, 'calling_restricted');
  const calling = await openCallingSettings(page);
  await expect(
    calling.getByText(
      'WhatsApp paused calls from your business to customers after low call quality.',
    ),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('menuitem', { name: /calling/i }).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.keyboard.press('Escape');
  await wa.api.simulate(channelId, 'calling_unrestricted');
  const lifted = await openCallingSettings(page);
  await expect(lifted.getByText(/WhatsApp paused calls from your business/)).toHaveCount(0, {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Close details' }).click();
});

test('a coexistence number (WhatsApp Business app) cannot call', async () => {
  await connectNumber(page, {
    label: 'Shop app',
    business: `E2E Roles App ${Date.now().toString(36)}`,
    mode: 'coexistence',
  });
  const calling = await openCallingSettings(page, 'Shop app');
  await expect(calling.getByText('Calling unavailable')).toBeVisible();
  await expect(
    calling.getByText('Calling is not available on WhatsApp Business app numbers (coexistence).'),
  ).toBeVisible();
  await expect(calling.getByRole('switch', { name: 'WhatsApp calling' })).toHaveCount(0);
  const app = await wa.api.channelId('Shop app');
  const r = await wa.api.patch(`/whatsapp/channels/${app}/calling`, { status: 'enabled' });
  expect(r.code).toBe('WHATSAPP_CALLING_UNAVAILABLE');
  await page.getByRole('button', { name: 'Close details' }).click();
});

test('another account gets 404 for these calling settings, permissions and calls', async ({
  browser,
  playwright,
}) => {
  const contactId = await wa.contactId(phone);
  const call = await wa.lastCall();
  const other = await browser.newPage();
  const stranger = await signUpOwner(other, 'warolesiso');
  const api = await InboxApi.signIn(playwright, stranger.email);
  try {
    expect((await api.get(`/whatsapp/channels/${channelId}/calling`)).status).toBe(404);
    expect(
      (await api.get(`/whatsapp/call-permissions?channelId=${channelId}&contactId=${contactId}`))
        .status,
    ).toBe(404);
    expect((await api.get(`/calls/${call?.id ?? ''}`)).status).toBe(404);
    const dial = await api.postWithKey('/whatsapp/calls', { channelId, contactId, mode: 'human' });
    expect(dial.status).toBe(404);
  } finally {
    await api.dispose();
    await other.close();
  }
});

async function impersonate(browser: Browser, o: Owner): Promise<Page> {
  const admin = await (await browser.newContext()).newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, o.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByText(`Viewing as ${o.name}`, { exact: false })).toBeVisible();
  return admin;
}
