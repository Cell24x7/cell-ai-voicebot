import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page } from '@playwright/test';

/** The backend's sample WAV (docs/samples/audio, made by `npm run fixtures:audio`). */
export const WELCOME_WAV = fileURLToPath(
  new URL('../../cell-ai-voicebot-backend/docs/samples/audio/welcome.wav', import.meta.url),
);

/** Mock payment API: even last digit = paid, odd = unpaid. */
export const FLOW_PAID_PHONE = '9000400012';
export const FLOW_UNPAID_PHONE = '9000400017';

/** Locked texts of the Loan recovery template (backend src/modules/flows/templates.ts). */
export const LOAN = {
  menu: 'Agar aap payment kar chuke hain to 1 dabaiye. Payment link chahiye to 2 dabaiye. Humse baat karne ke liye 3 dabaiye.',
  paid: 'Dhanyavaad! Aapka payment hamare record mein mil gaya hai. Aapka din shubh ho.',
  notFound:
    'Abhi tak hamare record mein aapka payment nahi dikh raha. Main aapko hamare assistant se jod rahi hoon.',
  linkSent: 'Payment link aapke number par SMS se bhej diya gaya hai. Dhanyavaad!',
  promise: (date: string) => `Aapka promise ${date} ke liye save ho gaya hai. Dhanyavaad!`,
  callback: 'Koi baat nahi, hum aapko baad mein call karenge. Dhanyavaad!',
  transfer: 'Main aapko hamare team member se jod rahi hoon.',
  bye: 'Dhanyavaad, namaste.',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** /flows/new → template card → name (+ agent) → builder. Returns the flow id. */
export async function createFlowFromTemplate(
  page: Page,
  templateTitle: string,
  name: string,
  agentName?: string,
): Promise<string> {
  await page.goto('/flows/new');
  await page.getByRole('button', { name: templateTitle, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: templateTitle });
  await dialog.getByLabel('Flow name').fill(name);
  if (agentName) {
    await dialog.getByRole('combobox', { name: /^AI agent for/ }).click();
    await page.getByRole('option', { name: agentName }).click();
  }
  await dialog.getByRole('button', { name: 'Create flow' }).click();
  await page.waitForURL(/\/flows\/[0-9a-f]{24}$/);
  await expect(page.getByText(/^Saved · revision \d+$/)).toBeVisible();
  const id = /\/flows\/([0-9a-f]{24})/.exec(page.url())?.[1];
  if (!id) throw new Error(`No flow id in ${page.url()}`);
  return id;
}

/** Publish dialog → Publish; waits for "Published vN". */
export async function publish(page: Page, version: number) {
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish this flow' });
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(
    page.locator('#notistack-snackbar').getByText(`Published v${String(version)}`, { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
}

export const simulator = (page: Page) => page.getByRole('complementary', { name: 'Simulator' });
export const transcript = (page: Page) => simulator(page).getByRole('log', { name: 'Transcript' });

/** Opens the simulator panel and starts a test call. */
export async function openSimulator(
  page: Page,
  from: { contactName: string } | { variables: Record<string, string> },
  version: 'draft' | number = 'draft',
) {
  const panel = simulator(page);
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'Simulator', exact: true }).click();
  }
  await expect(panel).toBeVisible();
  if (await panel.getByRole('button', { name: 'New test' }).isVisible()) {
    await panel.getByRole('button', { name: 'New test' }).click();
  } else if (await panel.getByRole('button', { name: 'Restart' }).isVisible()) {
    await panel.getByRole('button', { name: 'Restart' }).click();
  }
  if (version !== 'draft') {
    await panel.getByRole('combobox', { name: 'Version' }).click();
    await page.getByRole('option', { name: `Published (v${String(version)})` }).click();
  }
  if ('contactName' in from) {
    await panel.getByRole('radio', { name: 'A contact' }).check();
    const box = panel.getByRole('combobox', { name: 'Contact' });
    await box.fill(from.contactName);
    await page.getByRole('option', { name: new RegExp(escape(from.contactName)) }).click();
  } else {
    for (const [name, value] of Object.entries(from.variables)) {
      await panel.getByLabel(`{{${name}}}`).fill(value);
    }
  }
  await panel.getByRole('button', { name: 'Start test call' }).click();
  await expect(
    panel
      .getByRole('button', { name: 'Hang up' })
      .or(panel.getByRole('button', { name: 'New test' })),
  ).toBeVisible();
}

/** Waits until the last input was handled. */
export async function settled(page: Page) {
  await expect(
    simulator(page).getByRole('status').filter({ hasText: 'Waiting for the flow' }),
  ).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(simulator(page).getByRole('alert')).toHaveCount(0);
}

/** Presses one keypad key (menu) or types digits then Send (digits mode). */
export async function press(page: Page, keys: string) {
  const keypad = simulator(page).getByRole('group', { name: 'Keypad' });
  for (const key of keys) {
    await keypad.getByRole('button', { name: new RegExp(`^Press ${escape(key)}(:|$)`) }).click();
  }
  const send = simulator(page).getByRole('button', { name: 'Send', exact: true });
  if (await send.isVisible()) await send.click();
  await settled(page);
}

/** Types what the customer says (speech or AI) and waits for the flow's answer. */
export async function reply(page: Page, text: string) {
  const box = simulator(page).getByRole('textbox', {
    name: /^(Customer says|Reply to the AI agent)$/,
  });
  await box.fill(text);
  await box.press('Enter');
  await expect(transcript(page).getByText(text, { exact: true }).last()).toBeVisible();
  await settled(page);
}

export async function silence(page: Page) {
  await simulator(page).getByRole('button', { name: 'Stay silent' }).click();
  await settled(page);
}

/** A bot line in the transcript (exact text or a pattern). */
export async function expectBot(page: Page, text: string | RegExp): Promise<Locator> {
  const line = transcript(page)
    .getByText(text, typeof text === 'string' ? { exact: true } : {})
    .last();
  await expect(line).toBeVisible();
  return line;
}

/** Outcome section text of the running / ended test call. */
export async function expectOutcome(page: Page, text: string) {
  const panel = simulator(page);
  const summary = panel.getByRole('button', { name: 'Outcome' });
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
  await expect(panel.getByText(text, { exact: true })).toBeVisible();
}

export async function addNodeFromPalette(page: Page, label: string) {
  await page.getByRole('button', { name: `Add ${label}`, exact: true }).click();
}

export const node = (page: Page, id: string) => page.getByTestId(`flow-node-${id}`);

/** Drags from a step's exit handle to another step's input handle. */
export async function connect(page: Page, from: Locator, handleLabel: string, to: Locator) {
  const source = from.getByLabel(handleLabel, { exact: false }).last();
  const target = to.locator('.react-flow__handle-top');
  // raw mouse events skip actionability: wait for a closing menu's backdrop to go
  await expect(page.locator('.MuiPopover-root')).toHaveCount(0);
  // and for the canvas to stop moving (fit-view / layout animations)
  const where = async () =>
    JSON.stringify([await source.boundingBox(), await target.boundingBox()]);
  let last = '';
  await expect
    .poll(async () => {
      const now = await where();
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  if (!a || !b) throw new Error('Handle not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}
