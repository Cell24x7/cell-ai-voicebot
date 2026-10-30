import { expect, test, type Page } from '@playwright/test';

import { createAgentFromTemplate } from './agents';
import { createCampaign, resultsRow, setAccountWindow } from './campaigns';
import { addContact, addDnd, createField } from './contacts';
import { createFlowFromTemplate, publish } from './flows';
import { signUpOwner } from './helpers';
import { addMoney } from './wallet';

// Who is skipped and why, callbacks, and the per-contact daily limit.
test.describe.configure({ mode: 'serial' });

const FLOW = 'Loan recovery Rules';
const AGENT = 'Rules Recovery Agent';
const people = Array.from({ length: 10 }, (_, i) => ({
  name: `Rule Borrower ${String(i + 1).padStart(2, '0')}`,
  phone: `90009000${String(i + 10)}`,
}));
const [dndA, dndB, optedOut] = [people[0], people[1], people[2]].map((p) => p?.name ?? '');
const CALLED = people.slice(3).map((p) => p.name);
let page: Page;

/** Tomorrow in India as YYYY-MM-DD. */
const tomorrowYmd = () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  page = await browser.newPage();
  await signUpOwner(page, 'camprules');
  await addMoney(page, 500);
  await createField(page, { label: 'Amount', type: 'Amount (₹)' });
  await createField(page, { label: 'Due date', type: 'Date' });
  for (const p of people) {
    await addContact(page, { ...p, values: { Amount: '1500', 'Due date': '2026-10-10' } });
  }
  await addDnd(page, people[0]?.phone ?? '');
  await addDnd(page, people[1]?.phone ?? '');
  await page.goto('/contacts/all');
  await page.getByRole('link', { name: optedOut, exact: true }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Opt out' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Opt out' }).click();
  await expect(page.getByText(/^Opted out — /)).toBeVisible();
  await createAgentFromTemplate(page, 'Loan recovery (Hinglish)', AGENT);
  await createFlowFromTemplate(page, 'Loan recovery', FLOW, AGENT);
  await publish(page, 1);
  await setAccountWindow(page, { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] });
});

test.afterAll(async () => {
  await page.close();
});

test('the preview shows the exclusions; skipped rows say why; callbacks wait for tomorrow 17:00', async () => {
  test.setTimeout(240_000);
  await createCampaign(page, {
    name: 'Rules run',
    flow: FLOW,
    contacts: people.map((p) => p.name),
    speed: 20,
    mix: { Answered: 100, 'No answer': 0, Busy: 0, Failed: 0, 'Invalid number': 0 },
    scenarios: { 'Asks for a callback': 100 },
    onAudience: async (p) => {
      const preview = p.getByLabel('Audience preview');
      await expect(preview.getByText('7 of 10 contacts will be called')).toBeVisible();
      // an opt-out also puts the number on the do-not-call list, which is checked first
      await expect(preview.getByText('On the do-not-call list: 3')).toBeVisible();
    },
  });
  for (const name of [dndA, dndB, optedOut]) {
    await expect(resultsRow(page, name)).toContainText('On the do-not-call list');
  }
  const callback = resultsRow(page, CALLED[0] ?? '');
  await expect(callback).toContainText('Callback', { timeout: 200_000 });
  await expect(callback).toContainText(`${tomorrowYmd()} 17:00`);
});

test('a daily limit of 1: a second campaign over the same contacts waits "Daily call limit reached"', async () => {
  test.setTimeout(180_000);
  await page.goto('/settings/calls');
  await page.getByLabel('Calls per day').fill('1');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Call settings saved')).toBeVisible();
  await createCampaign(page, {
    name: 'Second run',
    flow: FLOW,
    contacts: CALLED.slice(0, 3),
    excludeActive: false,
    speed: 20,
  });
  for (const name of CALLED.slice(0, 3)) {
    await expect(resultsRow(page, name)).toContainText('Daily call limit reached', {
      timeout: 120_000,
    });
  }
});
