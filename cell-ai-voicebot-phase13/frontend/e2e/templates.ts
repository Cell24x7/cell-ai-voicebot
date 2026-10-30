import { randomUUID } from 'node:crypto';

import { expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test';

import { SUPERADMIN } from './env';
import { InboxApi } from './inbox';

/** A Meta INR rate card CSV like the one the superadmin imports (test numbers only). */
export const RATE_CSV = [
  'Market,Currency,Marketing,Utility,Authentication,Authentication-International,Service',
  'India,INR,0.8631,0.115,0.115,,0.115',
  'Other,INR,1.2,0.5,0.5,,0.3',
].join('\n');

export interface TemplateSpec {
  name: string;
  category?: 'UTILITY' | 'MARKETING';
  body?: string;
  examples?: string[];
}

/** Template setup and money checks through the API (the specs drive the UI themselves). */
export class TemplatesApi {
  readonly api: InboxApi;
  constructor(api: InboxApi) {
    this.api = api;
  }

  /** Creates and submits a template (fake review: name knobs `instant`, `_reject`, `_pause`…). */
  async createTemplate(channelId: string, spec: TemplateSpec): Promise<string> {
    const body = spec.body ?? 'Namaste {{1}}, your account update is ready.';
    const examples = spec.examples ?? ['Asha'];
    const r = await this.api.post<{ id: string }>('/whatsapp/templates', {
      channelId,
      name: spec.name,
      language: 'en',
      category: spec.category ?? 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: body,
          ...(examples.length ? { example: { body_text: [examples] } } : {}),
        },
      ],
    });
    expect(r.status, `create template: ${r.code ?? ''}`).toBe(201);
    return r.data.id;
  }

  async template(id: string) {
    return (
      await this.api.get<{ status: string; category: string; previousCategory: string | null }>(
        `/whatsapp/templates/${id}`,
      )
    ).data;
  }

  async waitStatus(id: string, status: string) {
    await expect
      .poll(async () => (await this.template(id)).status, { timeout: 20_000 })
      .toBe(status);
  }

  /** Sends a template into a conversation (API) — returns status + error code. */
  async sendTemplate(
    conversationId: string,
    templateId: string,
    variables: Record<string, string>,
  ) {
    return this.api.post<{ id: string }>(`/inbox/conversations/${conversationId}/messages`, {
      clientId: randomUUID(),
      type: 'template',
      templateId,
      variables,
    });
  }

  /** Opens (or creates) the chat of a contact with a template — the window can be closed. */
  async startWithTemplate(
    channelId: string,
    contactId: string,
    templateId: string,
    variables: Record<string, string>,
  ) {
    return this.api.post<{ id: string }>('/inbox/conversations/start', {
      channelId,
      contactId,
      template: { clientId: randomUUID(), type: 'template', templateId, variables },
    });
  }

  async messages(conversationId: string) {
    return (
      await this.api.get<
        {
          id: string;
          type: string;
          status: string;
          billing: { status: string; priceMicros: number } | null;
        }[]
      >(`/inbox/conversations/${conversationId}/messages`)
    ).data;
  }

  /** Polls the newest outgoing message of a type until its billing status is `status`. */
  async waitBilling(conversationId: string, status: string, type = 'template') {
    await expect
      .poll(
        async () => {
          const out = (await this.messages(conversationId)).filter((m) => m.type === type);
          return out.at(-1)?.billing?.status;
        },
        { timeout: 20_000 },
      )
      .toBe(status);
  }

  async ledger() {
    return (
      await this.api.get<{ status: string; amountMicros: number; direction: string }[]>(
        '/wallet/ledger?type=whatsapp_charge&limit=100',
      )
    ).data;
  }

  async wallet() {
    return (await this.api.get<{ balanceMicros: number; holdMicros: number }>('/wallet')).data;
  }

  async pricePreview(channelId: string, contactId: string, templateId: string) {
    return (
      await this.api.post<{ priceMicros: number; payer: string }>('/whatsapp/price-preview', {
        channelId,
        contactId,
        templateId,
      })
    ).data;
  }
}

/** A superadmin API session (wallet adjustments, account billing). */
export async function superadminApi(playwright: PlaywrightWorkerArgs['playwright']) {
  return InboxApi.signIn(playwright, SUPERADMIN.email, SUPERADMIN.password);
}

/** Superadmin: move an account's money (credit / debit) — test money only. */
export async function adjustWallet(
  admin: InboxApi,
  accountId: string,
  direction: 'credit' | 'debit',
  micros: number,
) {
  const r = await admin.postWithKey(`/admin/accounts/${accountId}/wallet/adjustments`, {
    direction,
    amountMicros: micros,
    reason: 'E2E test money',
    allowNegative: direction === 'debit',
  });
  expect(r.status, `adjust wallet: ${r.code ?? ''}`).toBe(201);
}

/** WhatsApp → Templates. */
export async function openTemplates(page: Page) {
  await page.goto('/whatsapp/templates');
  await expect(page.getByRole('table', { name: 'Templates' })).toBeVisible({ timeout: 20_000 });
}

/** The table row of a template. */
export const templateRow = (page: Page, name: string) =>
  page.getByRole('table', { name: 'Templates' }).getByRole('row').filter({ hasText: name });

/** Builder: name, message with variables + samples, footer, quick reply, URL with a suffix. */
export async function createTemplateUI(
  page: Page,
  spec: {
    name: string;
    parts: string[];
    samples: string[];
    footer?: string;
    headerImage?: string;
    quickReply?: string;
    url?: { text: string; base: string; example: string };
  },
) {
  await page.getByRole('button', { name: 'Create template' }).click();
  const d = page.getByRole('dialog', { name: 'Create template' });
  await d.getByRole('textbox', { name: 'Name' }).fill(spec.name);
  if (spec.headerImage) {
    await d.getByRole('combobox', { name: 'Header' }).click();
    await page.getByRole('option', { name: 'Image' }).click();
    await d.getByLabel('Example file').setInputFiles(spec.headerImage);
  }
  const message = d.getByRole('textbox', { name: 'Message' });
  // text, then a variable after every part but the last
  for (const [i, part] of spec.parts.entries()) {
    await message.press('End');
    await message.pressSequentially(part);
    if (i < spec.parts.length - 1) await d.getByRole('button', { name: 'Add variable' }).click();
  }
  for (const [i, sample] of spec.samples.entries()) {
    await d.getByRole('textbox', { name: `Sample for {{${String(i + 1)}}}` }).fill(sample);
  }
  if (spec.footer) await d.getByRole('textbox', { name: 'Footer (optional)' }).fill(spec.footer);
  let n = 0;
  if (spec.quickReply) {
    await d.getByRole('button', { name: 'Add button' }).click();
    await page.getByRole('menuitem', { name: /Quick reply/ }).click();
    n += 1;
    await d
      .getByRole('group', { name: `Quick reply button ${String(n)}` })
      .getByRole('textbox', { name: 'Button text' })
      .fill(spec.quickReply);
  }
  if (spec.url) {
    await d.getByRole('button', { name: 'Add button' }).click();
    await page.getByRole('menuitem', { name: /Website/ }).click();
    n += 1;
    const g = d.getByRole('group', { name: `Website button ${String(n)}` });
    await g.getByRole('textbox', { name: 'Button text' }).fill(spec.url.text);
    await g.getByRole('textbox', { name: 'Website address' }).fill(spec.url.base);
    await g.getByRole('switch', { name: /variable at the end/ }).click();
    await g.getByRole('textbox', { name: 'Example end of the address' }).fill(spec.url.example);
  }
  await d.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Sent to WhatsApp for review')).toBeVisible({ timeout: 20_000 });
  await expect(d).toBeHidden();
}

/** Send template dialog: pick the template (sources are set by the caller afterwards). */
export async function pickTemplate(page: Page, name: string) {
  const d = page.getByRole('dialog', { name: 'Send template' });
  await d.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: new RegExp(name) }).click();
  await expect(d.getByRole('figure', { name: 'Message preview' })).toBeVisible();
  return d;
}

/** Send template dialog: choose a source for a variable (and a value / field). */
export async function chooseSource(page: Page, variable: string, source: string, value?: string) {
  const d = page.getByRole('dialog', { name: 'Send template' });
  await d.getByRole('combobox', { name: `${variable} source` }).click();
  await page.getByRole('option', { name: source, exact: true }).click();
  if (source === 'Custom field' && value) {
    await d.getByRole('combobox', { name: `Custom field for ${variable}` }).click();
    await page.getByRole('option', { name: value }).click();
  } else if (value !== undefined) {
    await d.getByRole('textbox', { name: `Value for ${variable}` }).fill(value);
  }
}

/** Wallet → Transactions has a line with `text` and `amount` (e.g. "−₹0.14"). */
export async function expectLedgerLine(page: Page, text: string, amount: string, status = 'Done') {
  await page.goto('/wallet');
  await page.getByRole('tab', { name: 'Transactions' }).click();
  const row = page.getByRole('row').filter({ hasText: text }).filter({ hasText: amount }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText(status);
}
