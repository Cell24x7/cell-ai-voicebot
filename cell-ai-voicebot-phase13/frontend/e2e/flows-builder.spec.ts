import { expect, test, type Page } from '@playwright/test';

import { addNodeFromPalette, connect, createFlowFromTemplate } from './flows';
import { signUpOwner } from './helpers';

// the builder is a desktop tool
test.use({ viewport: { width: 1600, height: 1000 } });

const steps = (page: Page) => page.locator('[data-testid^="flow-node-"]');
const card = (page: Page, label: string) => page.locator(`[aria-label="${label}"]`);

test('builder: add steps, insert a variable, auto-layout, connect, save, reload, undo / redo, stale save', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await signUpOwner(page, 'flowsbuild');
  const flowId = await createFlowFromTemplate(page, 'Blank flow', 'Builder E2E');
  // a blank flow is Start → Hang up; remove the Hang up to build our own path
  await expect(steps(page)).toHaveCount(2);
  await card(page, 'Hang up (Hang up)').click();
  await page
    .getByRole('complementary', { name: 'Step settings' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(steps(page)).toHaveCount(1);

  // speak with a {{name}} from the picker
  await addNodeFromPalette(page, 'Speak');
  const inspector = page.getByRole('complementary', { name: 'Step settings' });
  const text = inspector.getByLabel('Text to say');
  await text.fill('Namaste ');
  await inspector.getByRole('button', { name: 'Insert variable' }).click();
  await page.getByRole('menuitem', { name: /^\{\{name\}\}/ }).click();
  await expect(text).toHaveValue('Namaste {{name}}');
  await addNodeFromPalette(page, 'Keypad menu');
  await addNodeFromPalette(page, 'Hang up');
  await expect(steps(page)).toHaveCount(4);

  // dangling steps are listed until they are connected
  const problems = page.getByRole('list', { name: 'Problems' });
  await expect(problems.getByText(`"Speak" can't be reached from Start.`)).toBeVisible();

  // auto-layout moves the steps apart; then fit them on screen
  await page.keyboard.press('Escape');
  const before = await card(page, 'Hang up (Hang up)').boundingBox();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Auto-layout' }).click();
  await expect
    .poll(async () => JSON.stringify(await card(page, 'Hang up (Hang up)').boundingBox()))
    .not.toBe(JSON.stringify(before));
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Fit to screen' }).click();
  await connect(page, card(page, 'Start (Start)'), 'Start: Next', card(page, 'Speak (Speak)'));
  await connect(
    page,
    card(page, 'Speak (Speak)'),
    'Speak: Next',
    card(page, 'Keypad menu (Keypad menu)'),
  );
  await connect(
    page,
    card(page, 'Keypad menu (Keypad menu)'),
    'Keypad menu: Press 1 · Haan',
    card(page, 'Hang up (Hang up)'),
  );
  await connect(
    page,
    card(page, 'Keypad menu (Keypad menu)'),
    'Keypad menu: Press 2 · Nahi',
    card(page, 'Hang up (Hang up)'),
  );
  await expect(problems.getByText(/can't be reached from Start/)).toHaveCount(0);
  await expect(problems.getByText(/is not connected to a next step/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved · revision 2')).toBeVisible();

  // reload keeps everything
  await page.reload();
  await expect(steps(page)).toHaveCount(4);
  await expect(card(page, 'Speak (Speak)')).toContainText('Namaste {{name}}');

  // undo / redo
  await addNodeFromPalette(page, 'Wait');
  await expect(steps(page)).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(steps(page)).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(steps(page)).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(steps(page)).toHaveCount(4);

  // another tab saves first → this tab's save hits the revision check
  const other = await context.newPage();
  await other.goto(`/flows/${flowId}`);
  await other.locator('[aria-label="Speak (Speak)"]').click();
  await other.getByRole('textbox', { name: 'Step name' }).fill('Greeting');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(other.getByText('Saved · revision 3')).toBeVisible();
  await other.close();

  await card(page, 'Hang up (Hang up)').click();
  await page.getByRole('textbox', { name: 'Step name' }).fill('Bye');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const conflict = page.getByRole('dialog', { name: 'This flow was changed' });
  await expect(conflict).toBeVisible();
  await conflict.getByRole('button', { name: 'Reload' }).click();
  await expect(conflict).toBeHidden();
  await expect(card(page, 'Greeting (Speak)')).toBeVisible();
  await expect(page.getByText('Saved · revision 3')).toBeVisible();
});
