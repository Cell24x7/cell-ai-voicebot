import { expect, test } from '@playwright/test';

import { signUpOwner } from './helpers';
import {
  addDevReceiverWebhook,
  API_BASE,
  createApiKey,
  devReceipts,
  testKey,
} from './integrations';

test('a key with scopes → "Test a key" → the API; a webhook to the dev receiver: test, real event, replay; IP allowlist', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await signUpOwner(page, 'integrations');

  // an API key with two scopes, checked from the dashboard
  const key = await createApiKey(page, 'CRM sync', ['contacts:read', 'contacts:write']);
  const ok = await testKey(page, key);
  await expect(ok.getByText('The key works. Scopes: contacts:read, contacts:write')).toBeVisible();
  await ok.getByRole('button', { name: 'Close' }).click();

  // the client's server uses the key: upsert a contact; a scope it lacks is refused
  const created = await request.post(`${API_BASE}/contacts?upsert=phone`, {
    headers: { 'X-API-Key': key },
    data: { phone: '+919000770001', name: 'Hook Person', externalId: 'CRM-77' },
  });
  expect(created.status()).toBe(201);
  const calls = await request.get(`${API_BASE}/calls`, { headers: { 'X-API-Key': key } });
  expect(calls.status()).toBe(403);
  // the request log shows the route template, never the data
  const row = page.getByRole('row', { name: /^CRM sync/ });
  await row.getByRole('button', { name: 'Requests' }).click();
  const log = page.getByRole('dialog', { name: 'Requests — CRM sync' });
  await expect(log.getByText('POST /api/v1/contacts')).toBeVisible({ timeout: 15_000 });
  await expect(log.getByText('9000770001')).toHaveCount(0);
  await log.getByRole('button', { name: 'Close' }).click();

  // a webhook to the dev receiver: secret once, a test event delivered
  await addDevReceiverWebhook(page);
  await page.getByRole('button', { name: 'Send test' }).click();
  const tester = page.getByRole('dialog', { name: 'Send test event' });
  await tester.getByRole('button', { name: 'Send' }).click();
  await expect(tester.getByText(/^Delivered — HTTP 200/)).toBeVisible({ timeout: 15_000 });
  await tester.getByRole('button', { name: 'Close' }).click();

  // a real event: opting the API's contact out → contact.opted_out, signed and verified
  await page.goto('/contacts/all');
  await page.getByRole('link', { name: 'Hook Person' }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Opt out' }).click();
  await page
    .getByRole('dialog', { name: 'Opt this contact out?' })
    .getByRole('button', { name: 'Opt out' })
    .click();
  await expect
    .poll(
      async () =>
        (await devReceipts(request)).some((r) => r.type === 'contact.opted_out' && r.verified),
      {
        timeout: 30_000,
      },
    )
    .toBe(true);

  // the delivery log lists it; Replay sends it again (same event id)
  await page.goto('/integrations/webhooks');
  await page.getByRole('button', { name: 'Deliveries' }).click();
  const deliveries = page.getByRole('dialog', { name: /^Deliveries — / });
  const real = deliveries.getByRole('row', { name: /contact\.opted_out/ });
  await expect(real.getByText('Delivered')).toBeVisible({ timeout: 15_000 });
  await expect(deliveries.getByRole('row', { name: /\(test\)/ })).toBeVisible();
  const before = (await devReceipts(request)).filter((r) => r.type === 'contact.opted_out').length;
  await real.getByRole('button', { name: 'Replay' }).click();
  await expect(page.getByText(/Sending again/)).toBeVisible();
  await expect
    .poll(
      async () => (await devReceipts(request)).filter((r) => r.type === 'contact.opted_out').length,
      {
        timeout: 30_000,
      },
    )
    .toBe(before + 1);
  await deliveries.getByRole('button', { name: 'Close' }).click();

  // the IP allowlist: the key now only works from another address
  await page.goto('/settings/api-keys');
  await page
    .getByRole('row', { name: /^CRM sync/ })
    .getByRole('button', { name: 'Change' })
    .click();
  const change = page.getByRole('dialog', { name: 'Change API key' });
  await change.getByLabel('Allowed IPs (optional)').fill('203.0.113.9');
  await change.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/API key saved/)).toBeVisible();
  await expect(page.getByRole('row', { name: /^CRM sync/ }).getByText(/1 allowed/)).toBeVisible();
  const denied = await testKey(page, key);
  await expect(denied.getByRole('alert')).toBeVisible();
  await expect(denied.getByText(/The key works/)).toHaveCount(0);
  const refused = await request.get(`${API_BASE}/contacts`, { headers: { 'X-API-Key': key } });
  expect(refused.status()).toBe(403);
});
