import { expect, test } from '@playwright/test';

import { META_VERIFY_TOKEN } from './env';
import { signBody, signedRequest } from './whatsapp';

// The public endpoints Meta calls (webhook verification + events, data deletion).
const API = 'http://127.0.0.1:5100/api/v1';

test('webhook verification: the challenge for the right token only', async ({ request }) => {
  const ok = await request.get(`${API}/webhooks/meta`, {
    params: {
      'hub.mode': 'subscribe',
      'hub.verify_token': META_VERIFY_TOKEN,
      'hub.challenge': '8675309',
    },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe('8675309');
  const wrong = await request.get(`${API}/webhooks/meta`, {
    params: { 'hub.mode': 'subscribe', 'hub.verify_token': 'not-the-token', 'hub.challenge': '1' },
  });
  expect(wrong.status()).toBe(403);
});

test('webhook events: unsigned → 401, signed → stored', async ({ request }) => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: `e2e-waba-${Date.now().toString(36)}`,
        changes: [{ field: 'account_update', value: { event: 'VERIFIED_ACCOUNT' } }],
      },
    ],
  });
  const headers = { 'content-type': 'application/json' };
  const unsigned = await request.post(`${API}/webhooks/meta`, { data: body, headers });
  expect(unsigned.status()).toBe(401);
  expect(((await unsigned.json()) as { error: { code: string } }).error.code).toBe(
    'META_SIGNATURE_INVALID',
  );
  const wrongSig = await request.post(`${API}/webhooks/meta`, {
    data: body,
    headers: { ...headers, 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` },
  });
  expect(wrongSig.status()).toBe(401);
  const signed = await request.post(`${API}/webhooks/meta`, {
    data: body,
    headers: { ...headers, 'x-hub-signature-256': signBody(body) },
  });
  expect(signed.status()).toBe(200);
  expect(((await signed.json()) as { data: unknown }).data).toEqual({
    received: 1,
    duplicates: 0,
    ignored: false,
  });
  // Meta redelivers: stored once
  const again = await request.post(`${API}/webhooks/meta`, {
    data: body,
    headers: { ...headers, 'x-hub-signature-256': signBody(body) },
  });
  expect(((await again.json()) as { data: unknown }).data).toMatchObject({
    received: 0,
    duplicates: 1,
  });
});

test('data deletion request → confirmation code → public status page', async ({
  request,
  page,
}) => {
  const bad = await request.post(`${API}/meta/data-deletion`, {
    form: { signed_request: 'abc.def' },
  });
  expect(bad.status()).toBe(401);
  const res = await request.post(`${API}/meta/data-deletion`, {
    form: { signed_request: signedRequest(`e2e-meta-user-${Date.now().toString(36)}`) },
  });
  expect(res.status()).toBe(200);
  const { url, confirmation_code: code } = (await res.json()) as {
    url: string;
    confirmation_code: string;
  };
  expect(url).toContain(`/data-deletion?code=${code}`);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Data deletion' })).toBeVisible();
  await expect(page.getByText(new RegExp(`Request ${code}: completed`))).toBeVisible();
  await expect(page.getByText(/Remove the Cell AI Voicebot app in Facebook/)).toBeVisible();
  await page.goto('/data-deletion?code=AAAAAAAAAAAAAAAA');
  await expect(page.getByText(/couldn't find a deletion request/)).toBeVisible();
});
