import { randomUUID } from 'node:crypto';

import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type PlaywrightWorkerArgs,
} from '@playwright/test';

import { FRONTEND_URL, PASSWORD, SUPERADMIN } from './env';
import { closeWizard, connectFakeNumber, openNumbers, testPhone } from './whatsapp';

let seq = 0;
/**
 * A valid Indian mobile for a simulated customer, unique per run: `+91 9HHHH TTTTT`;
 * `suffix` picks a fake Meta knob (`00006` throughput, `00007` window closed,
 * `00008` never read, `00009` undeliverable).
 */
export const customerPhone = (suffix?: string): string => {
  seq += 1;
  const head = (Date.now() % 10_000).toString().padStart(4, '0');
  const tail = suffix ?? `${String(5 + (seq % 5))}${String(seq).padStart(4, '0')}`;
  return `+91 9${head} ${tail}`;
};

/** API session of a user (simulator, fake Meta log, setup shortcuts). */
export class InboxApi {
  private readonly api: APIRequestContext;
  private readonly token: string;
  private constructor(api: APIRequestContext, token: string) {
    this.api = api;
    this.token = token;
  }

  static async signIn(
    playwright: PlaywrightWorkerArgs['playwright'],
    email: string,
    password = PASSWORD,
  ) {
    const api = await playwright.request.newContext({ baseURL: FRONTEND_URL });
    const login = await api.post('/api/v1/auth/login', { data: { email, password } });
    expect(login.status()).toBe(200);
    const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
    return new InboxApi(api, token);
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async get<T>(path: string): Promise<{ status: number; data: T }> {
    const res = await this.api.get(`/api/v1${path}`, { headers: this.headers() });
    const body = (await res.json().catch(() => null)) as { data: T } | null;
    return { status: res.status(), data: body?.data as T };
  }

  async post<T>(path: string, data?: unknown): Promise<{ status: number; data: T; code?: string }> {
    const res = await this.api.post(`/api/v1${path}`, { headers: this.headers(), data });
    const body = (await res.json().catch(() => null)) as {
      data: T;
      error?: { code: string; details?: unknown };
    } | null;
    return {
      status: res.status(),
      data: body?.data as T,
      code: body?.error
        ? `${body.error.code} ${JSON.stringify(body.error.details ?? [])}`
        : undefined,
    };
  }

  async patch<T>(
    path: string,
    data?: unknown,
  ): Promise<{ status: number; data: T; code?: string }> {
    const res = await this.api.patch(`/api/v1${path}`, { headers: this.headers(), data });
    const body = (await res.json().catch(() => null)) as {
      data: T;
      error?: { code: string };
    } | null;
    return { status: res.status(), data: body?.data as T, code: body?.error?.code };
  }

  async delete(path: string): Promise<number> {
    const res = await this.api.delete(`/api/v1${path}`, { headers: this.headers() });
    return res.status();
  }

  /** POST with an Idempotency-Key (wallet adjustments). */
  async postWithKey<T>(path: string, data: unknown) {
    const res = await this.api.post(`/api/v1${path}`, {
      headers: { ...this.headers(), 'Idempotency-Key': randomUUID() },
      data,
    });
    const body = (await res.json().catch(() => null)) as {
      data: T;
      error?: { code: string };
    } | null;
    return { status: res.status(), data: body?.data as T, code: body?.error?.code };
  }

  /** A connected number (by label, else the first). */
  async channelId(label?: string): Promise<string> {
    const list = await this.get<{ items: { id: string; status: string; label: string }[] }>(
      '/whatsapp/channels',
    );
    const ch = list.data.items.find(
      (c) => c.status === 'connected' && (!label || c.label === label),
    );
    expect(ch, 'a connected number').toBeTruthy();
    return (ch as { id: string }).id;
  }

  /** A Phase 3 contact (so the chat shows this name, not "Test Customer"). */
  async createContact(name: string, phone: string): Promise<string> {
    const r = await this.post<{ id: string }>('/contacts', { name, phone });
    expect(r.status, `create contact: ${r.code ?? ''}`).toBe(201);
    return r.data.id;
  }

  /** DEV simulator: the customer writes / reacts / opts out…, or this chat ages / expires. */
  async simulate(
    channelId: string,
    kind: string,
    options: { from?: string; text?: string; conversationId?: string; days?: number } = {},
  ) {
    const r = await this.post('/dev/meta/webhooks', { channelId, kind, ...options });
    expect(r.status, `simulate ${kind}`).toBe(200);
  }

  /** Waits until the customer's conversation exists (webhooks are processed async). */
  async waitConversation(phone: string): Promise<{ id: string; unreadCount: number }> {
    await expect
      .poll(
        async () =>
          this.conversationOf(phone).then(
            () => true,
            () => false,
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    return this.conversationOf(phone);
  }

  async conversationOf(phone: string): Promise<{ id: string; unreadCount: number }> {
    const q = phone.replace(/\D/g, '');
    for (const status of ['open', 'closed']) {
      const r = await this.get<{ id: string; phoneE164: string; unreadCount: number }[]>(
        `/inbox/conversations?status=${status}&q=${q}`,
      );
      const hit = r.data.find((c) => c.phoneE164.replace(/\D/g, '') === q);
      if (hit) return hit;
    }
    throw new Error('conversation not found');
  }

  /** What the fake Meta "sent" for a number (types, voice check, receipts). */
  async fakeSent(channelId: string) {
    return (
      await this.get<{
        sent: {
          type: string;
          interactiveType: string | null;
          voiceValid: boolean | null;
          toLast4: string;
        }[];
        readReceipts: { waMessageId: string; typing: boolean }[];
      }>(`/dev/meta/sent?channelId=${channelId}`)
    ).data;
  }

  /** This user's account id. */
  async accountId(): Promise<string> {
    const me = await this.get<{ account: { id: string } }>('/auth/me');
    expect(me.status).toBe(200);
    return me.data.account.id;
  }

  /**
   * Phase 11: every WhatsApp message except notes is held from the wallet — a
   * superadmin credit (test money) so the account can reply / send templates.
   */
  async fund(playwright: PlaywrightWorkerArgs['playwright'], rupees = 1000) {
    const accountId = await this.accountId();
    const admin = await InboxApi.signIn(playwright, SUPERADMIN.email, SUPERADMIN.password);
    const res = await admin.api.post(`/api/v1/admin/accounts/${accountId}/wallet/adjustments`, {
      headers: { ...admin.headers(), 'Idempotency-Key': randomUUID() },
      data: { direction: 'credit', amountMicros: rupees * 1_000_000, reason: 'E2E test money' },
    });
    expect(res.status(), 'fund the wallet').toBe(201);
    await admin.dispose();
  }

  async dispose() {
    await this.api.dispose();
  }
}

/** Numbers page → connect a Cloud API (or coexistence) number on the fake Meta. */
export async function connectNumber(
  page: Page,
  opts: { label: string; business: string; mode?: 'cloud_api' | 'coexistence' },
) {
  await openNumbers(page);
  await connectFakeNumber(page, {
    businessName: opts.business,
    phone: testPhone(),
    displayName: opts.label,
    mode: opts.mode ?? 'cloud_api',
  });
  await expect(
    page.getByRole('dialog', { name: 'Connect WhatsApp' }).getByText('Connected', { exact: true }),
  ).toBeVisible();
  await closeWizard(page);
}

export async function openInbox(page: Page) {
  await page
    .getByRole('link', { name: /^Inbox/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
}

export const row = (page: Page, name: string): Locator =>
  page.getByRole('listitem', { name: `Conversation with ${name}` });

export const chat = (page: Page, name: string): Locator =>
  page.getByRole('region', { name: `Chat with ${name}` });

export const log = (page: Page): Locator => page.getByRole('log', { name: 'Messages' });

/** Click the row (waits for it to appear live) and the chat to open. */
export async function openConversation(page: Page, name: string) {
  await row(page, name).getByRole('link').click({ timeout: 20_000 });
  await expect(chat(page, name)).toBeVisible();
}

export async function sendText(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Enter');
  await expect(log(page).getByText(text, { exact: true }).last()).toBeVisible();
}

/** The bubble containing `text` (its message anchor). */
export const bubble = (page: Page, text: string | RegExp): Locator =>
  log(page).locator('[data-message-id]').filter({ hasText: text }).last();

/** Ticks of a bubble reach `label` (Queued / Sent / Delivered / Read / Failed). */
export async function expectTicks(b: Locator, label: string) {
  await expect(b.getByRole('img', { name: label })).toBeVisible({ timeout: 20_000 });
}

/** Attach menu → choice → file. */
export async function attachFile(page: Page, choice: string, path: string) {
  await page.getByRole('button', { name: 'Attach' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: choice }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByLabel('Attachment')).toBeVisible();
}

/** Mic → record `ms` with Chromium's fake microphone → preview → send. */
export async function recordVoice(page: Page, ms: number) {
  await page.getByRole('button', { name: 'Record voice note' }).click();
  await expect(page.getByRole('timer', { name: 'Recording time' })).toBeVisible();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByLabel('Voice note preview')).toBeVisible();
  await page.getByRole('button', { name: 'Send voice note' }).click();
}
