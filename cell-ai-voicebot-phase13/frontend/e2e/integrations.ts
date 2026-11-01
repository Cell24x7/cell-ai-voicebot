import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The backend itself (the public API is called without the browser, like a client's server). */
export const API_BASE = 'http://127.0.0.1:5100/api/v1';

/** Settings → API keys → create a key with these scopes; returns the full key (shown once). */
export async function createApiKey(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.goto('/settings/api-keys');
  await page.getByRole('button', { name: 'Create API key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create API key' });
  await dialog.getByLabel('Name').fill(name);
  for (const scope of scopes) {
    await dialog
      .getByRole('checkbox', { name: new RegExp(`^${scope.replace(':', '\\:')}`) })
      .check();
  }
  await dialog.getByRole('button', { name: 'Create key' }).click();
  const field = page.getByLabel('New API key');
  await expect(field).toHaveValue(/^cav_test_/);
  const key = await field.inputValue();
  await page.getByRole('button', { name: "I've copied it" }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return key;
}

/** Settings → API keys → "Test a key". */
export async function testKey(page: Page, key: string) {
  await page.getByRole('button', { name: 'Test a key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Test a key' });
  await dialog.getByLabel('API key').fill(key);
  await dialog.getByRole('button', { name: 'Check key' }).click();
  return dialog;
}

/** Integrations → Webhooks → add an endpoint to the backend's dev receiver (all events). */
export async function addDevReceiverWebhook(page: Page) {
  await page.goto('/integrations/webhooks');
  await page.getByRole('button', { name: 'Add webhook' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add webhook' });
  await dialog.getByRole('button', { name: 'Use the dev receiver' }).click();
  await dialog.getByRole('button', { name: 'Add webhook' }).click();
  const secret = page.getByRole('textbox', { name: 'Signing secret' });
  await expect(secret).toHaveValue(/^whsec_/);
  await page.getByRole('button', { name: "I've copied it" }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The dev receiver's last deliveries (newest first; no payloads). */
export async function devReceipts(request: APIRequestContext) {
  const res = await request.get(`${API_BASE}/mock/webhook-receiver`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as { eventId: string | null; type: string | null; verified: boolean }[];
}
