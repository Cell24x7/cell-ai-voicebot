import { expect, test } from '@playwright/test';

import { addContact, importSampleCsv } from './contacts';
import { signUpOwner } from './helpers';

/** Segment "DPD > 30" → bulk tag every match → export the segment as CSV. */
test('segments, bulk tagging and a safe CSV export', async ({ page }) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'segment');
  await importSampleCsv(page); // 92 contacts, 62 with DPD > 30
  // a contact whose name would be a formula in Excel
  await addContact(page, { phone: '9000500001', name: '=1+2 Sneaky', values: { DPD: '45' } });

  await page.goto('/contacts/segments');
  await page.getByRole('button', { name: 'New segment' }).click();
  const dialog = page.getByRole('dialog', { name: 'New segment' });
  await dialog.getByLabel('Segment name').fill('DPD over 30');
  await dialog.getByRole('button', { name: 'Add condition' }).click();
  await dialog.getByLabel('Field', { exact: true }).click();
  await page.getByRole('option', { name: 'DPD (Number)' }).click();
  await dialog.getByLabel('Condition', { exact: true }).click();
  await page.getByRole('option', { name: 'more than' }).click();
  await dialog.getByLabel('Value', { exact: true }).fill('30');
  await expect(dialog.getByText('63 contacts match')).toBeVisible();
  await dialog.getByRole('button', { name: 'Create segment' }).click();
  await expect(page.getByText('Segment created')).toBeVisible();
  const row = page.getByRole('row', { name: /DPD over 30/ });
  await expect(row.getByRole('cell', { name: '63', exact: true })).toBeVisible();

  // bulk: tag every contact in the segment (filter mode → background job)
  await row.getByRole('link', { name: 'DPD over 30' }).click();
  await expect(page.getByText(/of 63/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select all on this page' }).check();
  await page.getByRole('button', { name: 'Select all 63 matching' }).click();
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Add tags' }).click();
  const tagDialog = page.getByRole('dialog', { name: 'Add tags' });
  await tagDialog.getByLabel('Tags').fill('overdue');
  await tagDialog.getByLabel('Tags').press('Enter');
  await tagDialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Working on 63 contacts in the background…')).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.goto('/contacts/all?tag=overdue');
        return page
          .getByText(/of \d+/)
          .first()
          .textContent({ timeout: 10_000 });
      },
      { timeout: 60_000 },
    )
    .toMatch(/of 63$/);

  // export the segment
  await page.goto('/contacts/segments');
  await page
    .getByRole('row', { name: /DPD over 30/ })
    .getByRole('button', { name: 'Export' })
    .click();
  const exportDialog = page.getByRole('dialog', { name: 'Export contacts' });
  await expect(exportDialog.getByRole('radio', { name: 'A segment' })).toBeChecked();
  await exportDialog.getByRole('button', { name: 'Export' }).click();
  await expect(exportDialog.getByText(/63 contacts exported/)).toBeVisible({ timeout: 60_000 });
  const fresh = page.waitForResponse((r) => /\/contact-exports\/[a-f0-9]{24}$/.test(r.url()));
  const popup = page.context().waitForEvent('page');
  await exportDialog.getByRole('button', { name: 'Download' }).click();
  const { data } = (await (await fresh).json()) as { data: { downloadUrl: string } };
  await (await popup).close();
  const csv = await (await page.request.get(data.downloadUrl)).text();
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trimEnd().split('\r\n');
  expect(lines[0]).toMatch(/^name,phone,email,external_id,tags,/);
  expect(lines[0]).toContain('dpd');
  expect(lines).toHaveLength(64);
  expect(csv).toContain("'=1+2 Sneaky");
  expect(csv).not.toMatch(/(^|,)=1\+2/m);
  expect(lines.slice(1).every((l) => l.includes('overdue'))).toBe(true);
  // phones stay E.164 (never formula-escaped)
  expect(lines.slice(1).every((l) => l.split(',')[1]?.startsWith('+91'))).toBe(true);

  await page.goto('/contacts/activity');
  await page.getByRole('tab', { name: 'Exports' }).click();
  await expect(page.getByRole('table', { name: 'Exports' }).getByText('A segment')).toBeVisible();
});
