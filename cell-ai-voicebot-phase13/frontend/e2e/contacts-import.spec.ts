import { expect, test } from '@playwright/test';

import {
  addContact,
  addDnd,
  card,
  checkImport,
  createField,
  DND_PHONES,
  EXISTING_PHONES,
  runImport,
  uploadSample,
} from './contacts';
import { signUpOwner } from './helpers';

/**
 * PHASE_3 "Done when": the 100-row sample (docs/samples/README.md) against an
 * account with a required currency field, 2 existing contacts and 2 DND numbers.
 */
test('imports the sample CSV with the expected totals, error report and typed values', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpOwner(page, 'import');
  await createField(page, { label: 'Loan amount', type: 'Amount (₹)', required: true });
  for (const [i, phone] of EXISTING_PHONES.entries()) {
    await addContact(page, { phone, name: `Existing ${i + 1}`, values: { 'Loan amount': '1000' } });
  }
  for (const phone of DND_PHONES) await addDnd(page, phone);

  await uploadSample(page, 'contacts-sample-100.csv');
  // the suggested mapping is accepted as it is
  await expect(page.getByLabel('Use "Mobile No" as')).toContainText('Phone');
  await expect(page.getByLabel('Use "Loan ID" as')).toContainText('External id');
  await expect(page.getByLabel('Use "Loan Amount" as')).toContainText('Loan amount');
  await expect(page.getByLabel('Use "Due Date" as')).toContainText('New field');
  await expect(page.getByLabel('Date format')).toContainText('DD/MM/YYYY');
  await checkImport(page);

  await expect(card(page, 'Rows')).toContainText('100');
  await expect(card(page, 'Will create')).toContainText('87');
  await expect(card(page, 'Will update')).toContainText('2');
  await expect(card(page, 'Invalid')).toContainText('8');
  await expect(card(page, 'Duplicates in file')).toContainText('3');
  await expect(card(page, 'On do-not-call list')).toContainText('2');
  const problems = page.getByRole('table', { name: 'Problem rows' });
  await expect(problems.getByText(/lost digits in Excel/)).toBeVisible();
  await expect(problems.getByText(/loan_amount: required/).first()).toBeVisible();

  // the error report is a signed link to a CSV with the reasons in words
  const reportResponse = page.waitForResponse((r) => /\/error-report$/.test(r.url()));
  const popup = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Download error report' }).click();
  const { data } = (await (await reportResponse).json()) as { data: { url: string } };
  await (await popup).close();
  const report = await page.request.get(data.url);
  expect(report.ok()).toBe(true);
  const text = await report.text();
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain('Phone lost digits in Excel');
  expect(text).toContain('Same phone as row 2');

  await runImport(page, /^Import 89 contacts$/);
  await expect(card(page, 'Created')).toContainText('87');
  await expect(card(page, 'Updated')).toContainText('2');

  await page.getByRole('link', { name: 'View contacts' }).click();
  const table = page.getByRole('table', { name: 'Contacts' });
  await expect(page.getByText(/of 89/)).toBeVisible();

  // DND numbers were imported and flagged
  await page.getByLabel('Search name, phone, e-mail, id').fill(DND_PHONES[0] ?? '');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByText('Do not call')).toBeVisible();

  // typed variables on the contact page
  await page.getByLabel('Search name, phone, e-mail, id').fill('Test Borrower 001');
  await table.getByRole('link', { name: 'Test Borrower 001' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Test Borrower 001' })).toBeVisible();
  await expect(page.getByText('₹5,250.00')).toBeVisible();
  await expect(page.getByText('02 Feb 2026')).toBeVisible();
  await expect(page.getByText('LN-0001')).toBeVisible();
});

test('imports the same rows from XLSX after switching sheets', async ({ page }) => {
  test.setTimeout(180_000);
  await signUpOwner(page, 'xlsx');
  await uploadSample(page, 'contacts-sample-100.xlsx');
  await expect(page.getByLabel('Sheet')).toContainText('Borrowers');
  await page.getByLabel('Sheet').click();
  await page.getByRole('option', { name: 'Old loans' }).click();
  await expect(page.getByLabel('Use "Mobile No" as')).toContainText('Phone');
  await expect(page.getByLabel('Use "Due Date" as')).toHaveCount(0);
  await page.getByLabel('Sheet').click();
  await page.getByRole('option', { name: 'Borrowers' }).click();
  await expect(page.getByLabel('Use "Due Date" as')).toBeVisible();
  await checkImport(page);
  // no required field / existing contacts here: the 3 rows without an amount are valid
  await expect(card(page, 'Will create')).toContainText('92');
  await expect(card(page, 'Invalid')).toContainText('5');
  await expect(card(page, 'Duplicates in file')).toContainText('3');
  await runImport(page, /^Import 92 contacts$/);
  await expect(card(page, 'Created')).toContainText('92');
});
