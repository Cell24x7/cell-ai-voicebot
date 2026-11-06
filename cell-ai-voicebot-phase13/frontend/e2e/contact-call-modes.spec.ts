import { expect, test, type WebSocketRoute } from '@playwright/test';

import type { Call } from '../src/services/api/types';

import { addContact } from './contacts';
import { signUpOwner } from './helpers';

// Browser media with a fake SIP endpoint: never connects to a customer/provider.
const contactName = 'Direct call customer';
const numberId = '611111111111111111111111';
const callId = '622222222222222222222222';
test.beforeEach(async ({ page }) => {
  await signUpOwner(page, 'directcall');
  await addContact(page, { name: contactName, phone: '9000600088' });
  await page.route('**/api/v1/phone-line', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          line: 'sip',
          numbers: [
            {
              id: numberId,
              number: '+911600000001',
              label: 'Office',
              purpose: 'outbound',
              status: 'active',
              kind: '1600',
              warnings: [],
            },
          ],
        },
      },
    }),
  );
  await page.goto('/contacts/all');
  await page.getByRole('link', { name: contactName, exact: true }).click();
});

test('contact → normal SIP → flow / agent / self → browser microphone, hold, keypad and hangup', async ({
  page,
}) => {
  let media: WebSocketRoute | undefined;
  let frames = 0;
  const controls: string[] = [];
  const starts: unknown[] = [];
  const holds: unknown[] = [];
  const call: Call = {
    id: callId,
    direction: 'outbound',
    provider: 'sip',
    mode: 'human',
    agentUserId: null,
    whatsapp: null,
    callerId: null,
    inbound: null,
    missed: null,
    sip: null,
    isTest: false,
    charged: true,
    campaign: null,
    status: 'ringing',
    endReason: 'hangup_node',
    source: { kind: 'flow', flowId: 'f1', flowVersionRef: 1, agentId: null, name: 'Loan recovery' },
    contact: { id: 'k1', name: 'Asha Verma' },
    startedBy: { id: 'u1', name: 'Demo Owner' },
    timestamps: {
      queuedAt: '2026-10-15T10:00:00.000Z',
      ringingAt: '2026-10-15T10:00:01.000Z',
      answeredAt: '2026-10-15T10:00:02.000Z',
      endedAt: '2026-10-15T10:00:28.000Z',
    },
    durationSec: 26,
    variables: { name: 'Asha Verma' },
    outcome: { disposition: 'paid' },
    disposition: 'paid',
    externalRef: null,
    dispositionSource: null,
    insights: null,
    languageDetected: 'hi',
    metrics: {
      latency: { p50Ms: 820, p95Ms: 1400, maxMs: 1600, samples: 4 },
      bargeIns: 1,
      silencePrompts: 0,
      aiSeconds: 0,
      ttsChars: 300,
      ttsCachedChars: 120,
    },
    cost: {
      telephonyMicros: 0,
      aiMicros: 0,
      ttsMicros: 600_000,
      commissionMicros: 295_000,
      totalMicros: 895_000,
    },
    recording: null,
    flowRunId: 'r1',
    error: null,
    createdAt: '2026-10-15T10:00:00.000Z',
  };
  await page.route('**/api/v1/calls', async (route) => {
    starts.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { success: true, data: call } });
  });
  await page.route(`**/api/v1/calls/${callId}`, (route) =>
    route.fulfill({ json: { success: true, data: call } }),
  );
  await page.route(`**/api/v1/calls/${callId}/media-ticket`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          callId,
          mediaTicket: 'browser-fake-ticket',
          wsPath: '/ws/media',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      },
    }),
  );
  await page.route(`**/api/v1/calls/${callId}/hold`, async (route) => {
    holds.push(route.request().postDataJSON());
    await route.fulfill({ json: { success: true, data: { callId, on: true } } });
  });
  await page.routeWebSocket('**/ws/media?**', (ws) => {
    media = ws;
    ws.onMessage((message) => {
      if (typeof message !== 'string') {
        frames += 1;
        return;
      }
      const control = JSON.parse(message) as { type: string; digit?: string };
      controls.push(control.type);
      if (control.type === 'call.ready') {
        call.status = 'in_progress';
        ws.send(
          JSON.stringify({
            type: 'call.event',
            event: { type: 'status', data: { status: 'in_progress' }, seq: 1 },
          }),
        );
      }
      if (control.type === 'call.hangup') {
        call.status = 'completed';
        ws.send(
          JSON.stringify({
            type: 'call.ended',
            reason: 'agent_end_call',
            durationSec: 3,
            costMicros: 0,
          }),
        );
        void ws.close({ code: 1000, reason: 'normal' });
      }
    });
  });
  await page.getByRole('button', { name: 'Call now' }).click();
  await page.getByRole('button', { name: 'Continue with normal call' }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog.getByRole('radio', { name: 'A flow' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'An agent' })).toBeVisible();
  await dialog.getByRole('radio', { name: 'Call yourself' }).check();
  await dialog.getByRole('button', { name: 'Call', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Normal call' });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Mute', exact: true })).toBeEnabled();
  expect(starts).toEqual([
    { contactId: expect.any(String), callerNumberId: numberId, mode: 'human' },
  ]);
  await expect.poll(() => frames).toBeGreaterThan(0);
  expect(media).toBeDefined();
  await bar.getByRole('button', { name: 'Hold', exact: true }).click();
  await expect.poll(() => holds).toEqual([{ on: true }]);
  await bar.getByRole('button', { name: 'Keypad', exact: true }).click();
  await page.getByRole('button', { name: 'Key 5', exact: true }).click();
  await expect.poll(() => controls.includes('call.dtmf')).toBe(true);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Hang up' }).click();
  await expect(bar.getByText(/Call ended/).first()).toBeVisible();
});

test('denied microphone shows a recoverable failure and never creates a SIP call', async ({
  page,
}) => {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  let starts = 0;
  await page.route('**/api/v1/calls', (route) => {
    starts += 1;
    return route.abort();
  });
  await page.getByRole('button', { name: 'Call now' }).click();
  await page.getByRole('button', { name: 'Continue with normal call' }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('radio', { name: 'Call yourself' }).check();
  await dialog.getByRole('button', { name: 'Call', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Normal call' });
  await expect(bar.getByText(/microphone/i)).toBeVisible();
  expect(starts).toBe(0);
  await bar.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(bar).not.toBeVisible();
});
