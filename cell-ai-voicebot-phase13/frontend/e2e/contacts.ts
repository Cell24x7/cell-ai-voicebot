import { fileURLToPath } from 'node:url';

import { expect, type Browser, type Page } from '@playwright/test';

import { PASSWORD } from './env';
import { uniqueEmail } from './helpers';
import { extractLink, waitForEmail } from './mailpit';

/** The backend's deterministic sample sheets (docs/samples/README.md). */
export const SAMPLES_DIR = fileURLToPath(
  new URL('../../cell-ai-voicebot-backend/docs/samples/', import.meta.url),
);
/** Same as `SAMPLE_EXISTING_PHONES` / `SAMPLE_DND_PHONES` in scripts/make-contact-samples.ts. */
export const EXISTING_PHONES = ['9000100086', '9000100087'];
export const DND_PHONES = ['9000100088', '9000100089'];

/** A totals card in the import wizard ("Will create", "Invalid" …). */
export const card = (page: Page, label: string) =>
  page.getByRole('region', { name: label, exact: true });

export async function createField(
  page: Page,
  field: { label: string; type: string; required?: boolean },
) {
  await page.goto('/contacts/fields');
  await page.getByRole('button', { name: 'New field' }).click();
  const dialog = page.getByRole('dialog', { name: 'New field' });
  await dialog.getByLabel('Label').fill(field.label);
  await dialog.getByLabel('Type').click();
  await page.getByRole('option', { name: field.type, exact: true }).click();
  if (field.required) await dialog.getByRole('switch', { name: /Required/ }).check();
  await dialog.getByRole('button', { name: 'Add field' }).click();
  await expect(page.getByText('Field added')).toBeVisible();
  await expect(dialog).toBeHidden();
}

export async function addContact(
  page: Page,
  contact: { phone: string; name: string; values?: Record<string, string> },
) {
  await page.goto('/contacts/all');
  await page.getByRole('button', { name: 'Add contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a contact' });
  await dialog.getByLabel('Phone').fill(contact.phone);
  await dialog.getByLabel('Name').fill(contact.name);
  for (const [label, value] of Object.entries(contact.values ?? {})) {
    await dialog.getByLabel(label).fill(value);
  }
  await dialog.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByText('Contact added')).toBeVisible();
  await expect(dialog).toBeHidden();
}

export async function addDnd(page: Page, phone: string, reason = 'Asked not to be called') {
  await page.goto('/contacts/dnd');
  await page.getByRole('button', { name: 'Add number' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to do-not-call' });
  await dialog.getByLabel('Phone number').fill(phone);
  await dialog.getByLabel('Reason (optional)').fill(reason);
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Number added to the do-not-call list')).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** Opens the wizard, uploads a sample file and waits for the mapping step. */
export async function uploadSample(
  page: Page,
  file: string,
  kind: 'contacts' | 'dnd' = 'contacts',
) {
  await page.goto(kind === 'dnd' ? '/contacts/import?kind=dnd' : '/contacts/import');
  await page.getByTestId('file-input').setInputFiles(`${SAMPLES_DIR}${file}`);
  await expect(page.getByRole('table', { name: 'Column mapping' })).toBeVisible({
    timeout: 30_000,
  });
}

/** Mapping → options → check; waits for the review step. */
export async function checkImport(page: Page) {
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(page.getByRole('region', { name: 'Rows', exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

/** Starts the import from the review step and waits for the summary. */
export async function runImport(page: Page, button: RegExp) {
  await page.getByRole('button', { name: button }).click();
  await expect(page.getByText('Import finished.')).toBeVisible({ timeout: 90_000 });
}

/** Imports the 100-row sample as-is (no preconditions) and returns to the contacts list. */
export async function importSampleCsv(page: Page) {
  await uploadSample(page, 'contacts-sample-100.csv');
  await checkImport(page);
  await runImport(page, /^Import \d+ contacts$/);
}

/** Owner invites a member with `role`; the member accepts in a new browser context. */
export async function inviteMember(
  page: Page,
  browser: Browser,
  role: 'Manager' | 'Agent' | 'Viewer',
  name: string,
): Promise<Page> {
  const email = uniqueEmail(role.toLowerCase());
  await page.goto('/team');
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite a team member' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Role').click();
  await page.getByRole('option', { name: role }).click();
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();

  const member = await (await browser.newContext()).newPage();
  await member.goto(extractLink(await waitForEmail(email, /invited/i), '/accept-invite'));
  await member.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await member.getByLabel('Repeat password').fill(PASSWORD);
  await member.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(member.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  return member;
}
