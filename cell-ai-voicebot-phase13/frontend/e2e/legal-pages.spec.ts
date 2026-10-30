import { expect, test } from '@playwright/test';

// Phase 13: the public legal pages Meta's app settings point at work without a login,
// are linked from the sign-in / sign-up screens, and the icons + manifest are served.

test('privacy, terms, contact and data deletion open without signing in', async ({ page }) => {
  for (const [path, title] of [
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
    ['/contact', 'Contact'],
    ['/data-deletion', 'Data deletion'],
  ] as const) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Legal' })).toBeVisible();
  }
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: '11. Deleting data' })).toBeVisible();
  await page.getByRole('link', { name: 'data deletion page' }).click();
  await expect(page.getByRole('heading', { name: 'How to delete your data' })).toBeVisible();
});

test('sign-in links the legal pages; sign-up names the terms and the privacy policy', async ({
  page,
}) => {
  await page.goto('/login');
  const legal = page.getByRole('navigation', { name: 'Legal' });
  await legal.getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
  await page.goto('/signup');
  await expect(page.getByText(/By creating an account you agree to the/)).toBeVisible();
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
});

test('icons and the web manifest are served', async ({ request }) => {
  for (const path of ['/icon-1024.png', '/icon-512.png', '/icon-192.png', '/apple-touch-icon.png'])
    expect((await request.get(path)).headers()['content-type'], path).toContain('image/png');
  expect((await request.get('/favicon.ico')).status()).toBe(200);
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string }[];
  };
  expect(manifest.icons.map((i) => i.src)).toContain('/icon-512.png');
});
