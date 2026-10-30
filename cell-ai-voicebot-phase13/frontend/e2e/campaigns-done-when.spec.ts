import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import {
  campaignCounter,
  createCampaign,
  dayName,
  exportCampaign,
  importCampaignSample,
  parseCsv,
  resultsRow,
  setAccountWindow,
  todayIst,
  waitForCounter,
} from './campaigns';
import { createField } from './contacts';
import { createFlowFromTemplate, publish } from './flows';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

// One account, the PHASE_8 "done when" path in short serial steps (dry run ×20).
test.describe.configure({ mode: 'serial' });

const FLOW = 'Loan recovery Campaigns';
const AGENT = 'Campaigns Recovery Agent';
const NAME = 'October recovery';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
let page: Page;

const snake = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, '_');
const STATUS_OF: Record<string, string> = {
  Completed: 'completed',
  'Not reached': 'failed',
  Skipped: 'skipped',
  Canceled: 'canceled',
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  page = await browser.newPage();
  await signUpOwner(page, 'campaigns');
  await addMoney(page, 500);
  await createField(page, { label: 'Amount', type: 'Amount (₹)' });
  await createField(page, { label: 'Due date', type: 'Date' });
  await createField(page, { label: 'Loan id', type: 'Text' });
  await importCampaignSample(page);
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(page, 'Loan recovery', FLOW, AGENT);
  await publish(page, 1);
  // dry runs have no hard bound: the account allows the whole day, every day
  await setAccountWindow(page, { start: '00:00', end: '23:59', days: ALL_DAYS });
});

test.afterAll(async () => {
  await page.close();
});

test('a window without today: started, then waits for the calling window with a time', async () => {
  test.setTimeout(120_000);
  await createCampaign(page, {
    name: NAME,
    flow: FLOW,
    window: { start: '00:00', end: '23:59', days: ALL_DAYS.filter((d) => d !== todayIst()) },
    maxAttempts: 3,
    intervalMinutes: 15,
    speed: 20,
    // a callback would wait for tomorrow: the run has to finish here
    callbacks: false,
  });
  const tomorrow = dayName((todayIst() + 1) % 7);
  await expect(
    page.getByText(`Waiting for the calling window — calls resume ${tomorrow} 00:00`),
  ).toBeVisible({ timeout: 30_000 });
  expect(await campaignCounter(page, 'Completed')).toBe(0);
  expect(await campaignCounter(page, 'Total')).toBe(100);
});

test('editing the window to add today starts dialing', async () => {
  test.setTimeout(120_000);
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Schedule & window' }).click();
  await page
    .getByRole('group', { name: 'Calling days' })
    .getByRole('button', {
      name: dayName(todayIst()),
      exact: true,
    })
    .click();
  await page.getByRole('tab', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  await expect(page.getByText(/Waiting for the calling window/)).toBeHidden({ timeout: 90_000 });
  await waitForCounter(page, 'Completed', (n) => n > 0, 90_000);
});

test('pause: calls in progress drain and nothing more completes; resume continues', async () => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused — paused by a team member')).toBeVisible();
  await waitForCounter(page, 'Calling', (n) => n === 0, 60_000);
  const done = await campaignCounter(page, 'Completed');
  await page.waitForTimeout(5_000);
  expect(await campaignCounter(page, 'Completed')).toBe(done);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Paused — paused by a team member')).toBeHidden();
  await waitForCounter(page, 'Completed', (n) => n > done, 60_000);
});

test('completes: nothing pending, queued, calling or waiting; retried rows show 2 or 3 attempts', async () => {
  test.setTimeout(480_000);
  await expect(
    page.getByText(/^Finished .* — \d+ completed, \d+ not reached, \d+ skipped\.$/),
  ).toBeVisible({
    timeout: 450_000,
  });
  for (const label of ['Pending', 'Queued', 'Calling', 'Waiting']) {
    expect(await campaignCounter(page, label), label).toBe(0);
  }
  const table = page.getByRole('table', { name: 'Campaign results' });
  await page.reload();
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  const attempts = await table
    .getByRole('row')
    .evaluateAll((rows) =>
      rows.slice(1).map((r) => r.querySelectorAll('td')[2]?.textContent ?? ''),
    );
  expect(attempts.some((a) => a === '2' || a === '3')).toBe(true);
});

test('export CSV: 100 rows, exact header, statuses and outcomes match the table, full phones', async () => {
  test.setTimeout(120_000);
  const { text } = await exportCampaign(page, 'CSV');
  const [header, ...rows] = parseCsv(text).filter((r) => r.some(Boolean));
  expect(header).toEqual([
    'Name',
    'Phone',
    'Status',
    'Attempts',
    'Last result',
    'Disposition',
    'Promise date',
    'Promise amount',
    'Callback',
    'Last call at (IST)',
    'Duration (s)',
    'Cost (₹)',
    'Skip reason',
    'Call id',
    'Amount',
    'Due date',
    'Loan id',
  ]);
  expect(rows).toHaveLength(100);
  for (const r of rows) expect(r[1]).toMatch(/^\+9190005\d{5}$/);
  for (const n of ['001', '017', '025', '038', '049']) {
    const name = `Campaign Customer ${n}`;
    const csv = rows.find((r) => r[0] === name);
    expect(csv, name).toBeDefined();
    await page.getByLabel('Name', { exact: true }).fill(name);
    const row = resultsRow(page, name);
    await expect(row).toBeVisible();
    const cells = await row.locator('td').allTextContents();
    const statusLabel = Object.keys(STATUS_OF).find((l) => (cells[1] ?? '').startsWith(l));
    expect(STATUS_OF[statusLabel ?? ''], name).toBe(csv?.[2]);
    expect(csv?.[3], name).toBe(cells[2]);
    const outcome = cells[4] ?? '—';
    expect(csv?.[5] ?? '', name).toBe(outcome === '—' ? '' : snake(outcome));
  }
});
