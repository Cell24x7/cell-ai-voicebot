import { expect, type Locator, type Page, type PlaywrightWorkerArgs } from '@playwright/test';

import { InboxApi } from './inbox';
import { numberCard, openNumbers } from './whatsapp';

/** Fake Meta call knobs (customer number endings, backend FAKE_CALL_KNOBS). */
export const KNOBS = {
  answersAfter2s: '00020',
  rejects: '00021',
  neverAnswers: '00022',
  permissionTemporary: '00023',
  permissionPermanent: '00024',
  permissionDeclines: '00025',
  hangsUpAfter5s: '00027',
  pressesOne: '00028',
  noPermission: '00030',
} as const;

export interface FakeCallView {
  waCallId: string;
  toLast4: string;
  direction: 'BUSINESS_INITIATED' | 'USER_INITIATED';
  state: 'ringing' | 'accepted' | 'ended';
  heardTone: boolean;
  dtmfSent: string;
  durationSec: number | null;
}

interface CallRow {
  id: string;
  status: string;
  direction: 'inbound' | 'outbound';
  mode: 'human' | 'ai';
  endReason: string | null;
  disposition: string | null;
  durationSec: number;
  agentUserId: string | null;
  whatsapp: { metaDuration: number | null; transferredTo: string | null } | null;
}

/** API shortcuts for WhatsApp calling specs (the InboxApi session of a user). */
export class CallingApi {
  readonly api: InboxApi;
  constructor(api: InboxApi) {
    this.api = api;
  }

  static async signIn(playwright: PlaywrightWorkerArgs['playwright'], email: string) {
    return new CallingApi(await InboxApi.signIn(playwright, email));
  }

  /** Calling on at Meta + here (the number's messaging limit settles first). */
  async enableCalling(channelId: string, patch: Record<string, unknown> = {}) {
    await expect
      .poll(
        async () =>
          (
            await this.api.patch(`/whatsapp/channels/${channelId}/calling`, {
              status: 'enabled',
              ...patch,
            })
          ).status,
        { timeout: 20_000 },
      )
      .toBe(200);
  }

  async permission(channelId: string, contactId: string) {
    return (
      await this.api.get<{ status: string; canCall: boolean }>(
        `/whatsapp/call-permissions?channelId=${channelId}&contactId=${contactId}&refresh=true`,
      )
    ).data;
  }

  /** The customer allows calls in WhatsApp (simulator reply). */
  async allow(channelId: string, phone: string, permanent = true) {
    await this.api.simulate(
      channelId,
      permanent ? 'permission_reply_permanent' : 'permission_reply_accept',
      { from: phone },
    );
  }

  async fakeCalls(channelId: string): Promise<FakeCallView[]> {
    return (await this.api.get<{ calls: FakeCallView[] }>(`/dev/meta/calls?channelId=${channelId}`))
      .data.calls;
  }

  /** The fake customer calls the number (the inbound flow runs for real). */
  async userCall(channelId: string, from: string): Promise<string> {
    const r = await this.api.post<{ waCallId: string }>('/dev/meta/calls/user-call', {
      channelId,
      from,
    });
    expect(r.status, `user call ${r.code ?? ''}`).toBe(200);
    return r.data.waCallId;
  }

  /** The customer hangs up (the newest live call of the number). */
  async hangupCustomer(channelId: string) {
    const r = await this.api.post('/dev/meta/webhooks', { channelId, kind: 'user_hangup' });
    expect(r.status, `hang up ${r.code ?? ''}`).toBe(200);
  }

  /** The customer presses keys on the live call. */
  async pressKeys(channelId: string, digits: string) {
    const r = await this.api.post('/dev/meta/webhooks', { channelId, kind: 'user_dtmf', digits });
    expect(r.status).toBe(200);
  }

  async setAvailability(status: 'available' | 'busy' | 'offline') {
    const r = await this.api.patch('/users/me/call-availability', { status });
    expect(r.status).toBe(200);
  }

  async calls(query = 'provider=whatsapp'): Promise<CallRow[]> {
    return (await this.api.get<CallRow[]>(`/calls?${query}&limit=20`)).data;
  }

  async lastCall(query = 'provider=whatsapp'): Promise<CallRow | undefined> {
    return (await this.calls(query))[0];
  }

  /** Waits for the newest WhatsApp call to end (returns it). */
  async ended(query = 'provider=whatsapp'): Promise<CallRow> {
    let last: CallRow | undefined;
    await expect
      .poll(
        async () => {
          last = await this.lastCall(query);
          return last && !['queued', 'ringing', 'in_progress'].includes(last.status);
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    return last as CallRow;
  }

  async contactId(phone: string): Promise<string> {
    const q = phone.replace(/\D/g, '');
    const r = await this.api.get<{ id: string; phoneE164: string }[]>(`/contacts?q=${q}`);
    const hit = r.data.find((c) => c.phoneE164.replace(/\D/g, '') === q);
    expect(hit, 'contact').toBeTruthy();
    return (hit as { id: string }).id;
  }

  async dispose() {
    await this.api.dispose();
  }
}

/** Numbers → Details → Calling region. */
export async function openCallingSettings(page: Page, label = 'Support line'): Promise<Locator> {
  // Avoid a redundant /whatsapp → /whatsapp/numbers redirect after reload.
  // Its pending navigation can remount NumbersPanel after Details was clicked.
  if (new URL(page.url()).pathname !== '/whatsapp/numbers') await openNumbers(page);
  await expect(page).toHaveURL(/\/whatsapp\/numbers$/);
  await numberCard(page, label).getByRole('button', { name: 'Details' }).click();
  const region = page.getByRole('dialog', { name: 'Number details' }).getByRole('region', {
    name: 'Calling',
  });
  await expect(region.getByText(/Calling (on|off|unavailable)/)).toBeVisible();
  return region;
}

export const callBar = (page: Page): Locator => page.getByRole('region', { name: 'WhatsApp call' });

/** The call bar shows a running call (the timer). */
export async function expectInCall(page: Page) {
  await expect(callBar(page).getByRole('status')).toHaveText(/^\d+:\d{2}/, { timeout: 30_000 });
}

export const incoming = (page: Page): Locator =>
  page.getByRole('alertdialog', { name: 'Incoming WhatsApp call' });

export async function answerIncoming(page: Page) {
  await incoming(page).getByRole('button', { name: 'Accept' }).click({ timeout: 20_000 });
  await expectInCall(page);
}

export const callBubble = (page: Page, text: string | RegExp): Locator =>
  page.getByRole('log', { name: 'Messages' }).getByRole('link', { name: text });
