import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';

/** The backend's sample knowledge documents (docs/samples/knowledge/README.md). */
export const KNOWLEDGE_DIR = fileURLToPath(
  new URL('../../cell-ai-voicebot-backend/docs/samples/knowledge/', import.meta.url),
);

/** Mock payment API without seeded records: even last digit = paid, odd = unpaid. */
export const PAID_PHONE = '9000300012';
export const UNPAID_PHONE = '9000300017';

/** Exact replies of the fake AI provider (backend src/core/ai/fake.provider.ts). */
export const FAKE = {
  paid: /^Dhanyavaad! Hamare record mein aapka ₹2500 ka payment \d{2} \w{3} \d{4} ko mil gaya hai\.$/,
  unpaid: 'Abhi tak hamare record mein payment nahi dikh raha. Aap kab tak payment kar paayenge?',
  promise: (date: string) => `Theek hai, ${date} tak ka promise note kar liya.`,
  lateFee: 'Due date ke baad har din ₹50 late fee lagti hai, maximum ₹500 tak.',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Tomorrow in India as `dd MMM yyyy` (how the app prints dates). */
export const tomorrowIst = (): string => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCFullYear()}`;
};

/** /agents/new → template card → name → editor. Returns the agent id. */
export async function createAgentFromTemplate(
  page: Page,
  templateTitle: string,
  name: string,
): Promise<string> {
  await page.goto('/agents/new');
  await page.getByText(templateTitle, { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Name your agent' });
  await dialog.getByLabel('Agent name').fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const id = /\/agents\/([0-9a-f]{24})\//.exec(page.url())?.[1];
  if (!id) throw new Error(`No agent id in ${page.url()}`);
  return id;
}

/** Opens the Playground tab and starts a conversation with a contact or typed values. */
export async function startPlayground(
  page: Page,
  agentId: string,
  from: { contactName: string } | { variables: Record<string, string> },
) {
  await page.goto(`/agents/${agentId}/playground`);
  if ('contactName' in from) {
    await page.getByRole('radio', { name: 'A contact' }).check();
    const box = page.getByRole('combobox', { name: 'Contact' });
    await box.fill(from.contactName);
    await page.getByRole('option', { name: new RegExp(from.contactName) }).click();
  } else {
    for (const [name, value] of Object.entries(from.variables)) {
      await page.getByLabel(`{{${name}}}`).fill(value);
    }
  }
  // wait for the new conversation: until it opens, the message box belongs to the last one
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/playground\/sessions$/.test(r.url()),
    ),
    page.getByRole('button', { name: 'Start new conversation' }).click(),
  ]);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeEnabled();
}

/** Sends one message and waits for the agent's reply. Returns the reply's list item. */
export async function say(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listitem', { name: 'You' }).last()).toContainText(text);
  await expect(page.getByRole('status').filter({ hasText: 'Agent is typing' })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByText(/^Not sent:/)).toHaveCount(0);
  return page.getByRole('listitem', { name: 'Agent' }).last();
}

/** /knowledge → new base → upload sample files → all Ready. Returns the base id. */
export async function createKnowledgeBase(
  page: Page,
  name: string,
  files: string[],
): Promise<string> {
  await page.goto('/knowledge');
  await page.getByRole('button', { name: 'New knowledge base' }).click();
  const dialog = page.getByRole('dialog', { name: 'New knowledge base' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Knowledge base created')).toBeVisible();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const id = /\/knowledge\/([0-9a-f]{24})/.exec(page.url())?.[1];
  if (!id) throw new Error(`No knowledge base id in ${page.url()}`);
  await page.getByLabel('Choose files').setInputFiles(files.map((f) => `${KNOWLEDGE_DIR}${f}`));
  await expect(page.getByText(/added — processing/)).toBeVisible();
  const table = page.getByRole('table', { name: 'Sources' });
  for (const f of files) {
    await expect(table.getByRole('row', { name: new RegExp(f) }).getByText('Ready')).toBeVisible({
      timeout: 60_000,
    });
  }
  return id;
}
