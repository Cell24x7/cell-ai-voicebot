import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import {
  addNodeFromPalette,
  connect,
  createFlowFromTemplate,
  openSimulator,
  publish,
  transcript,
  WELCOME_WAV,
} from './flows';
import { signUpOwner } from './helpers';

test.use({ viewport: { width: 1600, height: 1000 } });

const card = (page: Page, label: string) => page.locator(`[aria-label="${label}"]`);
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const more = async (page: Page, item: string) => {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('versions: publish v1, edit, publish v2, restore v1, export, import, duplicate', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpOwner(page, 'flowsver');
  const flowId = await createFlowFromTemplate(page, 'Blank flow', 'Versions E2E');
  await publish(page, 1);

  await card(page, 'Hang up (Hang up)').click();
  await inspector(page).getByLabel('Goodbye line (optional)').fill('Phir milenge.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Unsaved changes')).toBeHidden();
  await publish(page, 2);

  await page.getByRole('link', { name: 'Versions' }).click();
  const table = page.getByRole('table', { name: 'Versions' });
  await expect(table.getByText('v2', { exact: true })).toBeVisible();
  await expect(table.getByText('v1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore v1' }).click();
  const confirm = page.getByRole('dialog', { name: 'Restore v1?' });
  await confirm.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('v1 copied into the draft — publish it to go live')).toBeVisible();
  await expect(card(page, 'Hang up (Hang up)')).toContainText('Dhanyavaad, namaste.');

  // export → the file is the flow; import it back as a new flow
  const downloading = page.waitForEvent('download');
  await more(page, 'Export JSON');
  const download = await downloading;
  const file = await download.path();
  const json = JSON.parse(await readFile(file, 'utf8')) as {
    name?: string;
    flow?: { name?: string };
  };
  expect(JSON.stringify(json)).toContain('Versions E2E');

  await page.goto('/flows');
  await page.getByLabel('Flow JSON file').setInputFiles(file);
  await expect(page.getByText(/^Imported "/)).toBeVisible();
  await page.waitForURL(/\/flows\/[0-9a-f]{24}$/);
  expect(page.url()).not.toContain(flowId);
  await expect(page.getByText(/^Saved · revision \d+$/)).toBeVisible();

  // duplicate from the builder opens the copy
  await page.goto(`/flows/${flowId}`);
  await more(page, 'Duplicate');
  await expect(page.getByText(/Versions E2E \(copy\)/)).toBeVisible();
  expect(page.url()).not.toContain(flowId);
});

test('audio: upload a WAV in Play audio and hear it in the simulator', async ({ page }) => {
  test.setTimeout(120_000);
  await signUpOwner(page, 'flowsaudio');
  await createFlowFromTemplate(page, 'Blank flow', 'Audio E2E');
  await card(page, 'Hang up (Hang up)').click();
  await inspector(page).getByRole('button', { name: 'Delete' }).click();

  await addNodeFromPalette(page, 'Play audio');
  await inspector(page).getByRole('button', { name: 'Upload audio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload audio' });
  await dialog.getByLabel('Audio file').setInputFiles(WELCOME_WAV);
  await expect(dialog.getByLabel('Name')).toHaveValue('welcome');
  await dialog.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText(/^Uploaded "welcome" \(\d+\.\d s\)$/)).toBeVisible();
  await expect(inspector(page).getByRole('combobox', { name: 'Audio file' })).toContainText(
    'welcome',
  );

  await addNodeFromPalette(page, 'Hang up');
  await page.keyboard.press('Escape');
  await more(page, 'Auto-layout');
  await more(page, 'Fit to screen');
  await connect(
    page,
    card(page, 'Start (Start)'),
    'Start: Next',
    card(page, 'Play audio (Play audio)'),
  );
  await connect(
    page,
    card(page, 'Play audio (Play audio)'),
    'Play audio: Next',
    card(page, 'Hang up (Hang up)'),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Unsaved changes')).toBeHidden();
  await expect(page.getByRole('button', { name: /^0 errors/ })).toBeVisible();

  await openSimulator(page, { variables: {} });
  const audio = transcript(page).locator('[data-kind="play"]');
  await expect(audio).toContainText('Audio');
  await expect(audio).toContainText('welcome');
});
