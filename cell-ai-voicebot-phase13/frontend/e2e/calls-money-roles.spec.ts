import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { callEnded, expectBotLine, hangUp, startWebCall } from './calls';
import { inviteMember } from './contacts';
import { FRONTEND_URL, PASSWORD } from './env';
import { openAdminAccount, signInAsSuperadmin, signUpOwner, type Owner } from './helpers';
import { addMoney } from './wallet';

test.describe.configure({ mode: 'serial' });

const AGENT = 'Money Roles Agent';
let page: Page;
let owner: Owner;
let agentId = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  // a real context: the 4-calls test opens more tabs of the same session
  page = await (await browser.newContext()).newPage();
  owner = await signUpOwner(page, 'callsmoney');
  agentId = await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
});

test.afterAll(async () => {
  await page.context().close();
});

test('an empty wallet refuses the call before it starts', async () => {
  await page.goto('/calls/test');
  const setup = page.getByRole('region', { name: 'Call setup' });
  await setup.getByRole('radio', { name: 'An AI agent alone' }).check();
  await setup.getByRole('combobox', { name: 'AI agent' }).click();
  await page.getByRole('option', { name: AGENT, exact: true }).click();
  await setup.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByText('Insufficient wallet balance.')).toBeVisible();
  await expect(setup).toBeVisible(); // still on the setup
  await page.goto('/calls');
  await expect(page.getByText('No calls yet')).toBeVisible();
});

test('an agent-role member can start a test call', async ({ browser }) => {
  test.setTimeout(120_000);
  await addMoney(page, 500);
  const member = await inviteMember(page, browser, 'Agent', 'Calls Agent');
  await startWebCall(member, { agent: AGENT, variables: { name: 'Asha' } });
  await expectBotLine(member, /Namaste Asha ji/);
  await hangUp(member);
  await callEnded(member);
  await member.context().close();
});

test('the 4th live call of an account is refused', async ({ playwright }) => {
  // three calls through the API (a call waiting for its browser counts as live);
  // live calls in other windows would be frozen by headless Chromium
  const api = await playwright.request.newContext({ baseURL: FRONTEND_URL });
  const login = await api.post('/api/v1/auth/login', {
    data: { email: owner.email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  for (let i = 0; i < 3; i += 1) {
    const res = await api.post('/api/v1/calls/web', {
      headers: { Authorization: `Bearer ${token}` },
      data: { agentId, variables: { name: 'Asha' } },
    });
    expect(res.status()).toBe(201);
  }
  await api.dispose();
  await page.goto('/calls/test');
  const setup = page.getByRole('region', { name: 'Call setup' });
  await setup.getByRole('radio', { name: 'An AI agent alone' }).check();
  await setup.getByRole('combobox', { name: 'AI agent' }).click();
  await page.getByRole('option', { name: AGENT, exact: true }).click();
  await setup.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByText('Too many calls are running for this account.')).toBeVisible();
  await page.goto('/calls');
  await expect(page.getByRole('table', { name: 'Calls' }).getByText('Starting')).toHaveCount(3);
});

test('viewers see calls but cannot start one or play recordings', async ({ browser }) => {
  test.setTimeout(150_000);
  const viewer = await inviteMember(page, browser, 'Viewer', 'Calls Viewer');
  await viewer.goto('/calls');
  await expect(viewer.getByRole('link', { name: 'New test call' })).toHaveCount(0);
  await viewer.getByRole('row').filter({ hasText: 'Completed' }).first().getByRole('link').click();
  await expect(viewer.getByRole('region', { name: 'Summary' })).toBeVisible();
  await expect(viewer.getByText("You can't play recordings with your role.")).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Load recording' })).toHaveCount(0);
  await viewer.goto('/calls/test');
  await expect(viewer.getByText(/permission/i)).toBeVisible();
  await viewer.context().close();
});

test('a superadmin viewing as the owner sees calls read-only (no start, no player)', async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signInAsSuperadmin(admin);
  await openAdminAccount(admin, owner.businessName);
  await admin.getByRole('button', { name: 'Impersonate' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  // in-app navigation only: the impersonation token lives in memory
  await admin.getByRole('link', { name: 'Calls', exact: true }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Calls' })).toBeVisible();
  await expect(admin.getByRole('link', { name: 'New test call' })).toHaveCount(0);
  await admin.getByRole('row').filter({ hasText: 'Completed' }).first().getByRole('link').click();
  await expect(admin.getByText("You can't play recordings with your role.")).toBeVisible();
  await adminContext.close();
});
