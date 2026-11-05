import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { CallingApi } from './calls-wa';
import { setAccountWindow } from './campaigns';
import { signUpOwner } from './helpers';
import { connectNumber, customerPhone, InboxApi } from './inbox';
import { createTemplateUI, TemplatesApi } from './templates';

test.describe.configure({ mode: 'serial' });
let page: Page;
let api: InboxApi;
let wa: CallingApi;
let channelId: string;
let agentId: string;
let contactId: string;
let templateId: string;
const name = `continuation_instant_${Date.now().toString(36)}`;
const phone = customerPhone('00028');

test.beforeAll(async ({ browser, playwright }) => {
  page = await browser.newPage();
  const owner = await signUpOwner(page, 'p19');
  await connectNumber(page, {
    label: 'Campaign sender',
    business: `P19 ${Date.now().toString(36)}`,
  });
  api = await InboxApi.signIn(playwright, owner.email);
  await api.fund(playwright);
  wa = new CallingApi(api);
  channelId = await api.channelId();
  await wa.enableCalling(channelId);
  agentId = await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', 'Campaign AI');
  const contact = await api.post<{ id: string }>('/contacts', {
    name: 'Continuation customer',
    phone,
  });
  expect(contact.status).toBe(201);
  contactId = contact.data.id;
  await wa.allow(channelId, phone);
  await setAccountWindow(page, { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] });
});
test.afterAll(async () => {
  await api?.dispose();
  await page?.close();
});

test('number-scoped template builder → approval → shared sender list', async () => {
  await page.goto(`/whatsapp/templates?channelId=${channelId}`);
  await expect(page.getByRole('combobox', { name: 'WhatsApp number' })).toContainText(
    'Campaign sender',
  );
  await createTemplateUI(page, { name, parts: ['Your account update is ready.'], samples: [] });
  await page.getByRole('button', { name: 'Close details' }).click();
  const rows = await api.get<{ id: string; name: string; status: string }[]>(
    `/whatsapp/templates?channelId=${channelId}`,
  );
  const template = rows.data.find((t) => t.name === name);
  expect(template?.status).toBe('APPROVED');
  templateId = template!.id;
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'WhatsApp number' })).toContainText(
    'Campaign sender',
  );
  await expect(page.getByRole('table', { name: 'Templates' }).getByText(name)).toBeVisible();
});

test('three campaign types stay in URL; message wizard reaches an actual completed report', async () => {
  await page.goto('/campaigns');
  for (const type of ['SIP / Normal call', 'WhatsApp bulk campaign', 'WhatsApp call'])
    await expect(page.getByRole('tab', { name: type, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'WhatsApp call', exact: true }).click();
  await expect(page).toHaveURL(/line=whatsapp-call/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'WhatsApp call', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goto(`/campaigns/new?contactIds=${contactId}`);
  await page.getByRole('combobox', { name: 'Campaign type' }).click();
  await page.getByRole('option', { name: 'WhatsApp bulk campaign', exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/whatsapp\/new\?contactIds=/);
  await page.getByLabel('Campaign name').fill('Browser message campaign');
  await page.getByRole('combobox', { name: 'WhatsApp number' }).click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('combobox', { name: 'Template', exact: true }).click();
  await page.getByRole('option', { name: `${name} (UTILITY)`, exact: true }).click();
  for (let step = 0; step < 4; step++)
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start campaign' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start campaign' }).click();
  await expect(page).toHaveURL(/\/campaigns\/whatsapp\/[a-f0-9]{24}$/);
  await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('table', { name: 'Campaign recipients' })).toBeVisible();
});

test('WhatsApp call campaign stores an agent, completes a dry run and stays separate from SIP rows', async () => {
  const result = await api.post<{
    id: string;
    flow: { id: string };
    program: { kind: string; id: string };
  }>('/campaigns', {
    name: 'Browser WhatsApp agent campaign',
    mode: 'dry_run',
    line: 'whatsapp',
    channelId,
    program: { kind: 'agent', id: agentId },
    audience: { contactIds: [contactId], excludeActiveCampaigns: false },
    retry: { maxAttempts: 1, intervalMinutes: 15, retryOn: [] },
    followUps: { callbacks: false, promiseCheck: { enabled: false, daysAfter: 1 } },
    dryRun: {
      speed: 20,
      scenarios: {
        paid: 100,
        promise: 0,
        refuse: 0,
        callback: 0,
        silence: 0,
        wrong_number: 0,
        hangup_early: 0,
        wrong_keys: 0,
      },
      mix: { answered: 10000, no_answer: 0, busy: 0, failed: 0, invalid_number: 0 },
    },
  });
  expect(result.status, result.code).toBe(201);
  expect(result.data.program).toMatchObject({ kind: 'agent', id: agentId });
  expect(result.data.flow.id).toBe('');
  expect((await api.postWithKey(`/campaigns/${result.data.id}/start`, {})).status).toBe(200);
  await page.goto(`/campaigns/${result.data.id}`);
  await expect(page.getByText('WhatsApp call', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Campaign AI' })).toHaveAttribute(
    'href',
    `/agents/${agentId}`,
  );
  await expect
    .poll(
      async () => (await api.get<{ status: string }>(`/campaigns/${result.data.id}`)).data.status,
    )
    .toBe('completed');
  const sip = await api.get<{ id: string }[]>('/campaigns?line=phone');
  expect(sip.data.some((c) => c.id === result.data.id)).toBe(false);
});

test('Contact normal-call confirmation preserves the sender and refuses stale SIP readiness without fallback', async () => {
  const senderId = '111111111111111111111111';
  await page.route('**/api/v1/phone-line', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          line: 'sip',
          numbers: [
            {
              id: senderId,
              label: 'Synthetic SIP',
              number: '+911600000001',
              purpose: 'outbound',
              status: 'active',
            },
          ],
        },
      },
    }),
  );
  try {
    await page.goto(`/contacts/c/${contactId}`);
    await page.getByRole('button', { name: 'Call now', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Call now' });
    await chooser.getByRole('combobox', { name: 'Call method' }).click();
    await page.getByRole('option', { name: 'Normal call (SIP)' }).click();
    await expect(chooser.getByRole('combobox', { name: 'Caller number' })).toContainText(
      'Synthetic SIP',
    );
    await chooser.getByRole('button', { name: 'Continue with normal call' }).click();
    const confirm = page.getByRole('dialog', { name: 'Call now' }).last();
    await confirm.getByRole('radio', { name: 'An agent' }).click();
    await confirm.getByRole('combobox', { name: 'Agent', exact: true }).click();
    await page.getByRole('option', { name: 'Campaign AI' }).click();
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/calls') && r.request().method() === 'POST',
    );
    await confirm.getByRole('button', { name: 'Call', exact: true }).click();
    const refused = await response;
    expect(refused.request().postDataJSON() as unknown).toMatchObject({
      callerNumberId: senderId,
      agentId,
    });
    expect(refused.status()).toBe(422); // real account is still on its test line
    await expect(confirm.getByRole('alert').last()).toBeVisible();
    await confirm.getByRole('button', { name: 'Close' }).click();
    await chooser.getByRole('button', { name: 'Close' }).click();
  } finally {
    await page.unroute('**/api/v1/phone-line');
  }
});

test('Contact → WhatsApp sender → AI agent uses the existing live runtime', async () => {
  await page.goto(`/contacts/c/${contactId}`);
  await page.getByRole('button', { name: 'Call now', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Call now' });
  await expect(chooser.getByRole('combobox', { name: 'Call method' })).toContainText(
    'WhatsApp call',
  );
  await chooser.getByRole('button', { name: 'Call', exact: true }).click();
  await page.getByRole('menuitem', { name: /Call with AI/ }).click();
  const ai = page.getByRole('dialog', { name: 'Call with AI' });
  await ai.getByRole('combobox', { name: 'AI program' }).click();
  await page.getByRole('option', { name: 'AI agent', exact: true }).click();
  await ai.getByRole('combobox', { name: 'Active AI agent' }).click();
  await page.getByRole('option', { name: 'Campaign AI', exact: true }).click();
  await ai.getByRole('button', { name: 'Call with AI', exact: true }).click();
  await expect(chooser).not.toBeVisible();
  const done = await wa.ended('provider=whatsapp&mode=ai');
  expect(done.mode).toBe('ai');
  expect(done.direction).toBe('outbound');
  const sent = await new TemplatesApi(api).template(templateId);
  expect(sent.status).toBe('APPROVED');
});
