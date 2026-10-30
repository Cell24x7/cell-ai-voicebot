import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Backend base for the DEV-only job hook (`/api/v1/dev/jobs/:name`, MOCK_APIS_ENABLED). */
const BACKEND = 'http://127.0.0.1:5100';

/** Runs a nightly / hourly job now, optionally as if it were later (Phase 14 E2E). */
export async function runDevJob(
  request: APIRequestContext,
  name: 'calls-purge' | 'inbox-retention' | 'reports-email',
  later: { daysAhead?: number; hoursAhead?: number } = {},
): Promise<Record<string, number>> {
  const res = await request.post(`${BACKEND}/api/v1/dev/jobs/${name}`, { data: later });
  expect(res.status(), `dev job ${name}`).toBe(200);
  return ((await res.json()) as { data: Record<string, number> }).data;
}

/** The account-local hour now (the demo accounts are on Asia/Kolkata). */
export const istHour = (): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  );

/**
 * Waits for the post-call AI to decide (the sweep runs every minute, 15 s after the call
 * ends): `text` is what the card then shows (a summary, or why there is none).
 */
export async function waitForInsights(page: Page, text: RegExp) {
  const card = page.getByRole('region', { name: 'AI insights' });
  await expect(async () => {
    await page.reload();
    await expect(card.getByText(text)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 150_000, intervals: [10_000] });
  return card;
}

/** A simple CSV reader for the export checks (quoted cells, doubled quotes). */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
};
