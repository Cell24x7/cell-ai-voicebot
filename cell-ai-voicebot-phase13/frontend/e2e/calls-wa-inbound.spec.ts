import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { callBar, callBubble, CallingApi, expectInCall, incoming } from './calls-wa';
import { inviteMember } from './contacts';
import { createFlowFromTemplate, publish } from './flows';
import { signUpOwner, type Owner } from './helpers';
import { chat, connectNumber, customerPhone, openConversation, openInbox } from './inbox';

// Phase 12 inbound: a customer calls → every available team member online rings → the
// first to accept talks, the others see who took it; nobody answers → missed bubble +
// bell; the AI route answers; an AI call is handed to an agent; callback permission.
test.describe.configure({ mode: 'serial' });

let page: Page;
let owner: Owner;
let wa: CallingApi;
let channelId: string;
let agent: Page;
let manager: Page;
let agentId: string;
let flowId: string;
const CALLER = 'Kavya Caller';
const MISSED = 'Missed Mohan';
const AI_CALLER = 'Ai Anita';
const HANDOFF = 'Handoff Hari';
const callerPhone = customerPhone();
const missedPhone = customerPhone();
const aiPhone = customerPhone();
const handoffPhone = customerPhone();

test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(300_000);
  page = await browser.newPage();
  owner = await signUpOwner(page, 'wainbound');
  await connectNumber(page, {
    label: 'Support line',
    business: `E2E Inbound ${Date.now().toString(36)}`,
  });
  wa = await CallingApi.signIn(playwright, owner.email);
  await wa.api.fund(playwright);
  channelId = await wa.api.channelId();
  for (const [name, phone] of [
    [CALLER, callerPhone],
    [MISSED, missedPhone],
    [AI_CALLER, aiPhone],
    [HANDOFF, handoffPhone],
  ] as const)
    await wa.api.createContact(name, phone);
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', 'Inbound Bot');
  flowId = await createFlowFromTemplate(page, 'Loan recovery', 'Inbound flow', 'Inbound Bot');
  await publish(page, 1);
  await wa.enableCalling(channelId, { inbound: { route: 'team', ringTimeoutSec: 30 } });
  agent = await inviteMember(page, browser, 'Agent', 'Ankit Agent');
  manager = await inviteMember(page, browser, 'Manager', 'Maya Manager');
  const team = await wa.api.get<{ id: string; name: string }[]>('/team/users?limit=50');
  agentId = team.data.find((m) => m.name === 'Ankit Agent')?.id ?? '';
  expect(agentId).not.toBe('');
  // the owner is not ringing in these tests (busy); the agent and the manager are online
  await wa.setAvailability('busy');
  // their app shell has loaded the call listener (lazy) before the first customer calls
  for (const p of [agent, manager])
    await expect(p.getByRole('button', { name: /^Call availability/ })).toBeVisible({
      timeout: 20_000,
    });
});
test.afterAll(async () => {
  await wa.dispose();
  for (const p of [agent, manager]) await p.context().close();
  await page.close();
});

test('two members ring; the agent accepts and talks; the manager sees who took it', async () => {
  test.setTimeout(120_000);
  await wa.userCall(channelId, callerPhone);
  await expect(incoming(manager)).toBeVisible({ timeout: 20_000 });
  await expect(incoming(agent)).toBeVisible();
  await expect(incoming(agent).getByText(CALLER)).toBeVisible();
  await incoming(agent).getByRole('button', { name: 'Accept' }).click();
  await expectInCall(agent);
  await expect(incoming(manager).getByText('Taken by Ankit Agent')).toBeVisible({
    timeout: 15_000,
  });
  await expect(incoming(manager)).toBeHidden({ timeout: 10_000 });
  await expect
    .poll(async () => (await wa.fakeCalls(channelId)).some((c) => c.heardTone), {
      timeout: 20_000,
    })
    .toBe(true);
  await wa.hangupCustomer(channelId);
  await expect(callBar(agent).getByText(/^Call ended/)).toBeVisible({ timeout: 30_000 });
  await callBar(agent).getByRole('button', { name: 'Close' }).click();
  const call = await wa.ended('provider=whatsapp&direction=inbound');
  expect(call).toMatchObject({ status: 'completed', mode: 'human', agentUserId: agentId });
  await openInbox(agent);
  await openConversation(agent, CALLER);
  await expect(callBubble(agent, /^Call · \d+:\d{2}$/)).toBeVisible({ timeout: 20_000 });
});

test('nobody answers → missed call bubble and a bell', async () => {
  test.setTimeout(120_000);
  await wa.enableCalling(channelId, { inbound: { ringTimeoutSec: 10 } });
  await wa.userCall(channelId, missedPhone);
  await expect(incoming(agent)).toBeVisible({ timeout: 20_000 });
  await expect(incoming(agent).getByText('The call stopped ringing')).toBeVisible({
    timeout: 30_000,
  });
  const call = await wa.ended('provider=whatsapp&direction=inbound');
  expect(call.endReason).toBe('no_agent_available');
  await openInbox(page);
  await openConversation(page, MISSED);
  await expect(callBubble(page, 'Missed call')).toBeVisible({ timeout: 20_000 });
  await expect(agent.getByRole('button', { name: /^Notifications, \d+ unread$/ })).toBeVisible({
    timeout: 20_000,
  });
  await agent.getByRole('button', { name: /^Notifications/ }).click();
  await expect(agent.getByRole('menuitem', { name: /Missed WhatsApp call/ }).first()).toBeVisible();
  await agent.keyboard.press('Escape');
});

test('outside call hours: the customer gets a missed call without ringing the team', async () => {
  const before = (await wa.lastCall('provider=whatsapp&direction=inbound'))?.id;
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  await wa.enableCalling(channelId, {
    callHours: {
      enabled: true,
      timezone: 'UTC',
      weekly: [{ day: days[(new Date().getUTCDay() + 1) % 7], open: '0000', close: '2359' }],
      holidays: [],
    },
  });
  try {
    await wa.userCall(channelId, missedPhone);
    await expect
      .poll(async () => (await wa.lastCall('provider=whatsapp&direction=inbound'))?.id)
      .not.toBe(before);
    expect((await wa.ended('provider=whatsapp&direction=inbound')).endReason).toBe(
      'outside_call_hours',
    );
    await expect(incoming(agent)).toBeHidden();
  } finally {
    await wa.enableCalling(channelId, {
      callHours: { enabled: false, timezone: 'UTC', weekly: [], holidays: [] },
    });
  }
});

test('the AI route answers with the flow (no team ring)', async () => {
  test.setTimeout(120_000);
  await wa.enableCalling(channelId, {
    inbound: { route: 'ai', aiProgram: { kind: 'flow', id: flowId } },
  });
  await wa.userCall(channelId, aiPhone);
  await expect
    .poll(async () => (await wa.lastCall('provider=whatsapp&direction=inbound'))?.status, {
      timeout: 30_000,
    })
    .toBe('in_progress');
  expect((await wa.lastCall('provider=whatsapp&direction=inbound'))?.mode).toBe('ai');
  await expect(incoming(agent)).toBeHidden();
  await wa.hangupCustomer(channelId);
  expect((await wa.ended('provider=whatsapp&direction=inbound')).status).toBe('completed');
});

test('AI → team: a supervisor hands the AI call to the agent on the same call', async () => {
  test.setTimeout(120_000);
  await wa.enableCalling(channelId, {
    inbound: { route: 'ai_then_team', aiProgram: { kind: 'flow', id: flowId }, ringTimeoutSec: 30 },
  });
  await wa.userCall(channelId, handoffPhone);
  let callId = '';
  await expect
    .poll(
      async () => {
        const c = await wa.lastCall('provider=whatsapp&direction=inbound');
        callId = c?.id ?? '';
        return c?.status;
      },
      { timeout: 30_000 },
    )
    .toBe('in_progress');
  const transfer = await wa.api.post(`/whatsapp/calls/${callId}/transfer`, { userId: agentId });
  expect(transfer.status, transfer.code).toBe(200);
  await expect(incoming(agent)).toBeVisible({ timeout: 20_000 });
  await incoming(agent).getByRole('button', { name: 'Accept' }).click();
  await expectInCall(agent);
  await expect
    .poll(async () => (await wa.lastCall('provider=whatsapp&direction=inbound'))?.mode, {
      timeout: 20_000,
    })
    .toBe('human');
  await wa.hangupCustomer(channelId);
  const call = await wa.ended('provider=whatsapp&direction=inbound');
  expect(call.whatsapp?.transferredTo).toBe(agentId);
  await callBar(agent).getByRole('button', { name: 'Close' }).click();
});

test('callback permission: a customer who called may be called back', async () => {
  test.setTimeout(120_000);
  await wa.enableCalling(channelId, { callbackPermission: true, inbound: { route: 'team' } });
  const phone = customerPhone();
  await wa.api.createContact('Callback Chitra', phone);
  await wa.setAvailability('available');
  await wa.userCall(channelId, phone);
  await expect(incoming(agent)).toBeVisible({ timeout: 20_000 });
  await incoming(agent).getByRole('button', { name: 'Decline' }).click();
  await incoming(manager).getByRole('button', { name: 'Decline' }).click();
  await incoming(page).getByRole('button', { name: 'Decline' }).click({ timeout: 10_000 });
  await wa.ended('provider=whatsapp&direction=inbound');
  await openInbox(page);
  await openConversation(page, 'Callback Chitra');
  await expect(
    chat(page, 'Callback Chitra').getByRole('button', { name: 'Call', exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('log', { name: 'Messages' }).getByText('after calling you'),
  ).toBeVisible();
});
