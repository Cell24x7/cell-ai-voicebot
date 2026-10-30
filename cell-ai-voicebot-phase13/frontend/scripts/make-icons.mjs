// Renders public/favicon.svg into the PNG icons Meta's app settings and browsers need
// (Phase 13): icon-1024 (Meta app icon), icon-512 / icon-192 (manifest),
// apple-touch-icon (180) and favicon.ico (a PNG inside an ICO container).
// Uses Playwright's Chromium (already a dev dependency) — no native image library.
// Run: `npm run icons` (writes the files into public/; they are committed).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const svg = readFileSync(`${pub}favicon.svg`, 'utf8');
const SIZES = [
  ['icon-1024.png', 1024],
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
  ['favicon-48.png', 48],
];

/** ICO with one embedded PNG image (allowed since Windows Vista; every browser reads it). */
const ico = (png, size) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // images
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // image size
  entry.writeUInt32LE(6 + 16, 12); // image offset
  return Buffer.concat([header, entry, png]);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const out = {};
  for (const [name, size] of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace(
        '<svg ',
        `<svg width="${size}" height="${size}" `,
      )}</body></html>`,
    );
    out[name] = await page.locator('svg').screenshot({ omitBackground: true });
  }
  for (const [name] of SIZES.filter(([n]) => n !== 'favicon-48.png'))
    writeFileSync(`${pub}${name}`, out[name]);
  writeFileSync(`${pub}favicon.ico`, ico(out['favicon-48.png'], 48));
  process.stdout.write(`icons written: ${SIZES.map(([n]) => n).join(', ')} + favicon.ico\n`);
} finally {
  await browser.close();
}
