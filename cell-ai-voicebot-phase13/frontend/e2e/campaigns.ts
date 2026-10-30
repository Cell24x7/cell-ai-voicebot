import { readFileSync } from 'node:fs';

import { expect, type Locator, type Page } from '@playwright/test';

import { checkImport, runImport, uploadSample } from './contacts';

export const CAMPAIGN_LIST = 'Campaign 100';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Today's weekday in India (0 = Sunday), how the calling window counts days. */
export const todayIst = (): number =>
  DAYS.indexOf(
    new Date().toLocaleDateString('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
    }) as (typeof DAYS)[number],
  );
export const dayName = (d: number): string => DAYS[d] ?? 'Sun';

/** Settings → Calls: the account calling window. */
export async function setAccountWindow(
  page: Page,
  window: { start: string; end: string; days: number[] },
) {
  await page.goto('/settings/calls');
  const section = page.getByRole('region', { name: 'Call settings' });
  await section.getByLabel('From', { exact: true }).fill(window.start);
  await section.getByLabel('To', { exact: true }).fill(window.end);
  await setDays(section, window.days);
  const save = section.getByRole('button', { name: 'Save changes' });
  if (await save.isEnabled()) {
    await save.click();
    await expect(page.getByText('Call settings saved')).toBeVisible();
  }
}

/** Toggles the "Calling days" buttons so exactly `days` are on. */
async function setDays(scope: Locator, days: number[]) {
  const group = scope.getByRole('group', { name: 'Calling days' });
  for (let d = 0; d < 7; d += 1) {
    const button = group.getByRole('button', { name: dayName(d), exact: true });
    const on = (await button.getAttribute('aria-pressed')) === 'true';
    if (on !== days.includes(d)) await button.click();
  }
}

/** Uploads `campaign-100.csv` into a new list "Campaign 100" (fields Amount / Due date / Loan id exist). */
export async function importCampaignSample(page: Page) {
  await uploadSample(page, 'campaign-100.csv');
  const map = async (header: string, target: string) => {
    await page.getByLabel(`Use "${header}" as`).click();
    await page.getByRole('option', { name: target, exact: true }).click();
  };
  await map('amount', 'Amount');
  await map('due_date', 'Due date');
  await map('loan_id', 'Loan id');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('List name').fill(CAMPAIGN_LIST);
  // checkImport clicks Next again from the options step
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(page.getByRole('region', { name: 'Rows', exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await runImport(page, /^Import \d+ contacts$/);
}
export { checkImport };

export interface CampaignOptions {
  name: string;
  flow: string;
  list?: string;
  /** Pick these contacts by name instead of a list. */
  contacts?: string[];
  window?: { start?: string; end?: string; days?: number[] };
  maxAttempts?: number;
  intervalMinutes?: number;
  speed?: 1 | 5 | 10 | 20;
  /** Outcome mix in % (the rest keeps the defaults; must add up to 100). */
  mix?: Partial<Record<'Answered' | 'No answer' | 'Busy' | 'Failed' | 'Invalid number', number>>;
  /** Simulated customers in % (all eight are set: missing ones become 0). */
  scenarios?: Partial<
    Record<
      | 'Already paid'
      | 'Promises to pay'
      | 'Refuses'
      | 'Asks for a callback'
      | 'Stays silent'
      | 'Wrong number'
      | 'Hangs up early'
      | 'Presses wrong keys',
      number
    >
  >;
  /** "Start now" (default) or only save the draft. */
  start?: boolean;
  /** Off: a customer asking for a callback is done (no callback wait). */
  callbacks?: boolean;
  /** Off: contacts already in another active campaign are called too. */
  excludeActive?: boolean;
  /** Runs on the audience step once the preview has numbers. */
  onAudience?: (page: Page) => Promise<void>;
}

const SCENARIOS = [
  'Already paid',
  'Promises to pay',
  'Refuses',
  'Asks for a callback',
  'Stays silent',
  'Wrong number',
  'Hangs up early',
  'Presses wrong keys',
] as const;

/** The wizard from /campaigns/new to the detail page; returns the campaign id. */
export async function createCampaign(page: Page, opts: CampaignOptions): Promise<string> {
  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name').fill(opts.name);
  await page.getByLabel('Flow', { exact: true }).click();
  await page.getByRole('option', { name: opts.flow, exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // audience
  if (opts.contacts) {
    await page.getByRole('radio', { name: 'Pick contacts' }).check();
    await page.getByRole('button', { name: 'Pick contacts' }).click();
    const dialog = page.getByRole('dialog', { name: 'Pick contacts' });
    for (const name of opts.contacts) {
      await dialog.getByLabel('Search by name or phone').fill(name);
      await dialog.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    }
    await dialog.getByRole('button', { name: /^Use \d+ contacts$/ }).click();
  } else {
    await page.getByRole('combobox', { name: 'Lists' }).click();
    await page
      .getByRole('option', { name: new RegExp(`^${opts.list ?? CAMPAIGN_LIST} \\(`) })
      .click();
    await page.keyboard.press('Escape');
  }
  if (opts.excludeActive === false) {
    await page
      .getByRole('switch', { name: 'Skip contacts that are in another active campaign' })
      .uncheck();
  }
  await expect(page.getByText(/ of \d+ contacts will be called$/)).toBeVisible({ timeout: 20_000 });
  await opts.onAudience?.(page);
  await page.getByRole('button', { name: 'Next' }).click();

  // schedule + window
  if (opts.window?.start) await page.getByLabel('From', { exact: true }).fill(opts.window.start);
  if (opts.window?.end) await page.getByLabel('To', { exact: true }).fill(opts.window.end);
  if (opts.window?.days) await setDays(page.locator('body'), opts.window.days);
  await page.getByRole('button', { name: 'Next' }).click();

  // retries, pacing, dry run
  if (opts.maxAttempts)
    await page.getByLabel('Attempts per contact').fill(String(opts.maxAttempts));
  if (opts.intervalMinutes) {
    await page.getByLabel('Retry after (minutes)').fill(String(opts.intervalMinutes));
  }
  if (opts.callbacks === false) {
    await page.getByRole('switch', { name: 'Call back when the customer asks' }).uncheck();
  }
  if (opts.mix) {
    for (const [label, pct] of Object.entries(opts.mix)) {
      await page.getByRole('spinbutton', { name: label, exact: true }).first().fill(String(pct));
    }
  }
  if (opts.scenarios) {
    for (const label of SCENARIOS) {
      await page
        .getByRole('spinbutton', { name: label, exact: true })
        .fill(String(opts.scenarios[label] ?? 0));
    }
  }
  if (opts.speed) {
    await page.getByLabel('Speed').click();
    await page.getByRole('option', { name: `×${String(opts.speed)}`, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled({ timeout: 20_000 });
  if (opts.start === false) {
    await page.getByRole('button', { name: 'Save draft' }).click();
  } else {
    await page.getByRole('button', { name: 'Start now' }).click();
  }
  await page.waitForURL(/\/campaigns\/[0-9a-f]{24}$/);
  await expect(page.getByRole('heading', { level: 1, name: opts.name })).toBeVisible();
  const id = /\/campaigns\/([0-9a-f]{24})$/.exec(page.url())?.[1];
  if (!id) throw new Error(`No campaign id in ${page.url()}`);
  return id;
}

/** A live counter on the detail page ("Completed", "Calling" …). */
export const campaignCounter = async (page: Page, label: string): Promise<number> =>
  Number(
    (
      (await page.getByLabel('Counters').getByLabel(label, { exact: true }).textContent()) ?? ''
    ).replace(/[^\d]/g, '') || '0',
  );

export async function waitForCounter(
  page: Page,
  label: string,
  check: (n: number) => boolean,
  timeout = 120_000,
) {
  await expect
    .poll(async () => check(await campaignCounter(page, label)), {
      timeout,
      intervals: [500, 1_000, 2_000],
    })
    .toBe(true);
}

/** The detail header's status chip. */
export const campaignStatus = (page: Page, status: string) =>
  page.locator('header, main').getByText(status, { exact: true }).first();

/** One contact's row in the results table. */
export const resultsRow = (page: Page, name: string): Locator =>
  page
    .getByRole('table', { name: 'Campaign results' })
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name, exact: true }) });

/** Export → CSV / Excel → wait for the file → returns its text (CSV) or path. */
export async function exportCampaign(page: Page, format: 'CSV' | 'Excel (XLSX)') {
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: format }).click();
  const dialog = page.getByRole('dialog', { name: 'Export results' });
  const link = dialog.getByRole('link', { name: /^Download \(\d+ rows\)$/ });
  await expect(link).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const path = await download.path();
  await dialog.getByRole('button', { name: 'Close' }).click();
  return { path, text: format === 'CSV' ? readFileSync(path, 'utf8') : '' };
}

/** Minimal CSV parser (quoted cells, "" escapes, BOM). */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};
