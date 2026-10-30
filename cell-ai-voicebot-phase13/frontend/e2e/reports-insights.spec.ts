import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { callEnded, expectBotLine, openCallDetail, pressKey, startWebCall } from './calls';
import { addContact, createField, inviteMember } from './contacts';
import { createFlowFromTemplate, FLOW_PAID_PHONE, LOAN, publish } from './flows';
import { signUpOwner, type Owner } from './helpers';
import { extractLink, waitForEmail } from './mailpit';
import { istHour, parseCsv, runDevJob, waitForInsights } from './reports';
import { addMoney } from './wallet';

// Phase 14 "Done when": a call → AI insights → the outcome changes → reports count it;
// export, data retention and report e-mails end to end. One account, in order.
test.describe.configure({ mode: 'serial' });

const FLOW = 'Loan recovery Reports';
const AGENT = 'Reports Recovery Agent';
let page: Page;
let owner: Owner;
let callUrl = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await browser.newPage();
  owner = await signUpOwner(page, 'reports');
  await addMoney(page, 500);
  await createField(page, { label: 'Amount', type: 'Amount (₹)' });
  await createField(page, { label: 'Due date', type: 'Date' });
  await addContact(page, {
    phone: FLOW_PAID_PHONE,
    name: 'Report Borrower',
    values: { Amount: '2500', 'Due date': '2026-10-10' },
  });
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(page, 'Loan recovery', FLOW, AGENT);
  await publish(page, 1);
});

test.afterAll(async () => {
  await page.close();
});

test('a short call: the AI says why it made no insights; changing the outcome moves the calls report', async () => {
  test.setTimeout(300_000);
  await startWebCall(page, {
    flow: { name: FLOW, version: 'published' },
    contactName: 'Report Borrower',
  });
  await expectBotLine(page, LOAN.menu);
  await pressKey(page, '1');
  await expectBotLine(page, LOAN.bye);
  await callEnded(page);
  await openCallDetail(page);
  callUrl = page.url();

  // the fake flow call is ~25 s: below the review minimum, so no AI summary (and no charge)
  const card = await waitForInsights(page, /The call was too short to review/);
  await expect(card.getByText('Not made')).toBeVisible();
  await expect(card.getByText('Set by the flow')).toBeVisible();
  await card.getByRole('combobox', { name: 'Outcome' }).click();
  await page.getByRole('option', { name: 'Callback requested' }).click();
  await expect(card.getByText('Set by a team member')).toBeVisible();

  // the rollups follow within about a minute (analytics sweep)
  await expect(async () => {
    // web test calls are test traffic: counted only with "Include test calls"
    await page.goto('/reports/calls?test=1');
    const details = page.getByRole('table', { name: 'Calls details' });
    await expect(details.getByRole('link', { name: 'Callback requested' })).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 120_000, intervals: [10_000] });
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Period' }).click();
  await page.getByRole('option', { name: 'Last 30 days' }).click();
  await expect(page).toHaveURL(/[?&]range=30d/);
});

test('export calls: the file has the columns, a shortened phone and the AI summary', async () => {
  await page.goto('/calls');
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export calls' });
  await dialog.getByRole('switch', { name: 'AI summaries' }).check();
  await dialog.getByRole('button', { name: 'Start export' }).click();
  const link = dialog.getByRole('link', { name: /^Download \(\d+ rows?\)$/ });
  await expect(link).toBeVisible({ timeout: 30_000 });
  const res = await page.request.get((await link.getAttribute('href')) ?? '');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toMatch(
    /attachment; filename="calls-[a-z0-9-]+-start-now\.csv"/,
  );
  const rows = parseCsv(await res.text());
  expect(rows[0]?.slice(0, 6)).toEqual([
    'Date',
    'Direction',
    'Line',
    'WhatsApp number',
    'Contact',
    'Phone',
  ]);
  expect(rows[0]?.at(-1)).toBe('AI summary');
  const call = rows.find((r) => r[4] === 'Report Borrower');
  expect(call?.[5]).toMatch(/^\+91\*+\d{4}$/);
  expect(call?.[8]).toBe('callback');
  await dialog.getByRole('button', { name: 'Close' }).click();
});

test('a report e-mail arrives with numbers only, and its link stops it', async () => {
  test.setTimeout(120_000);
  await page.goto('/settings/notifications');
  await page.getByRole('button', { name: 'Add report e-mail' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a report e-mail' });
  await dialog.getByRole('combobox', { name: 'How often' }).click();
  await page.getByRole('option', { name: 'Every day (yesterday)' }).click();
  const hour = istHour();
  await dialog.getByRole('combobox', { name: /Send at/ }).click();
  await page.getByRole('option', { name: `${String(hour).padStart(2, '0')}:00` }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByRole('table', { name: 'Report e-mails' }).getByText('Every day (yesterday)'),
  ).toBeVisible();

  // sent when the account-local hour matches the subscription (picked just above)
  const { sent } = await runDevJob(page.request, 'reports-email', {
    hoursAhead: (hour - istHour() + 24) % 24,
  });
  expect(sent).toBeGreaterThanOrEqual(1);
  const text = await waitForEmail(owner.email, /report for Yesterday/);
  expect(text).toContain('Overview');
  expect(text).not.toMatch(/\+91\d|Report Borrower|Customer said/);
  const stop = extractLink(text, '/report-emails/unsubscribe');
  const visitor = await (await page.context().browser()?.newContext())?.newPage();
  if (!visitor) throw new Error('no browser');
  await visitor.goto(stop.replace(/^https?:\/\/[^/]+/, ''));
  await visitor.getByRole('button', { name: 'Stop these e-mails' }).click();
  await expect(visitor.getByText(/you won't get this report e-mail/)).toBeVisible();
  await visitor.close();
  await page.reload();
  await expect(
    page
      .getByRole('table', { name: 'Report e-mails' })
      .getByRole('switch', { name: 'Resume this e-mail' }),
  ).toBeVisible();
});

test('data retention: a shorter period is confirmed, then the nightly purge deletes the recording only', async () => {
  test.setTimeout(120_000);
  await page.goto('/settings/retention');
  await page.getByLabel('Call recordings (days)').fill('1');
  await page.getByRole('button', { name: 'Save' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete older data?' });
  await expect(
    confirm.getByText(/Recordings older than 1 days will be deleted tonight/),
  ).toBeVisible();
  await confirm.getByRole('button', { name: 'Save and delete' }).click();
  await expect(page.getByText('Data retention saved')).toBeVisible();

  const purged = await runDevJob(page.request, 'calls-purge', { daysAhead: 2 });
  expect(purged.recordings).toBeGreaterThanOrEqual(1);
  await page.goto(callUrl);
  await expect(page.getByText(/The recording was deleted on/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Transcript' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'AI insights' }).getByText('Set by a team member'),
  ).toBeVisible();
});

test('viewers read reports without export buttons; agents have no Reports', async ({ browser }) => {
  test.setTimeout(120_000);
  const viewer = await inviteMember(page, browser, 'Viewer', 'Reports Viewer');
  await viewer.goto('/reports/calls');
  await expect(viewer.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Export' })).toHaveCount(0);
  await viewer.goto('/calls');
  await expect(viewer.getByRole('button', { name: 'Export' })).toHaveCount(0);
  await viewer.goto('/settings/retention');
  await expect(viewer.getByText('Only the owner or an admin can change this.')).toBeVisible();
  await viewer.close();

  const agent = await inviteMember(page, browser, 'Agent', 'Reports Agent');
  await expect(agent.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await agent.goto('/reports');
  await expect(agent).toHaveURL(/\/403$/);
  await agent.close();
});
