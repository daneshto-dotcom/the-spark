/**
 * SPARK — render the pencil chewer reference sheet to a PNG. DEV TOOL, not part of the build.
 *
 * ⭐ WHY. The owner asked for "the pencil chewer's character photo at high quality so I can make it
 * into the demon ones" (S187). There is no photo to send: the chewer has never had a sprite sheet.
 * Everything the player sees of him is painted procedurally by `drawChewer` in
 * `src/render/chewerRenderer.ts`, and `characterSheetModel.ts` records that he, the lightning drone
 * and the locust cloud are the only three creatures in the game with no atlas at all.
 *
 * ⛔ SO THIS RENDERS THE REAL PUPPET. `src/dev/chewerPortrait.ts` instantiates the PRODUCTION
 * `ChewerRenderer` and calls the same `drawPortraitInto` the character sheet uses, inside a
 * container scaled up. Pixi Graphics are vectors, so this is a true enlargement of the shipped art
 * rather than an upscale of a screenshot — and it cannot go stale, because it reads the painter.
 *
 * ⚠ IT DRIVES THE DEV SERVER, so the server must already be running. The page is a Vite entry
 * (`chewer-portrait.html`), which means it is transformed from the same TypeScript the game runs.
 *
 * Usage:  node scripts/render-chewer-reference.mjs [--port 5173] [--out <path>]
 * Exit:   0 wrote the file · 2 the page never signalled ready · 3 no canvas · 4 server unreachable
 */

import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const port = argOf('--port', process.env.SESSION_PORT || '5173');
const out = resolve(argOf('--out', 'assets-source/chewer/chewer-reference.png'));
const alpha = argv.includes('--alpha');
const url = `http://localhost:${port}/chewer-portrait.html${alpha ? '?alpha=1' : ''}`;

const browser = await chromium.launch();
// deviceScaleFactor compounds with the page's own `resolution: 2`, so the extracted bitmap is
// comfortably print-sized for tracing over.
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

try {
  await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
} catch (e) {
  console.error(`[chewer] cannot reach ${url} — is the dev server running?\n${e.message}`);
  await browser.close();
  process.exit(4);
}

// The page sets this only after `app.render()` has put the frame on the canvas, so this waits for
// PAINT rather than for load — a screenshot taken before it would be a blank sheet.
try {
  await page.waitForFunction(() => window.__CHEWER_READY__ === true, null, { timeout: 20_000 });
} catch {
  console.error('[chewer] the page never signalled __CHEWER_READY__.');
  if (errors.length) console.error('[chewer] page errors:\n  ' + errors.join('\n  '));
  await browser.close();
  process.exit(2);
}

const dataUrl = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  // Re-render in the SAME task as the read. See the preserveDrawingBuffer note on the page: a
  // WebGL buffer read after compositing comes back black, with no error to tell you so.
  window.__CHEWER_RENDER__?.();
  return c.toDataURL('image/png');
});

if (!dataUrl) {
  console.error('[chewer] no canvas on the page.');
  await browser.close();
  process.exit(3);
}

const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);

const dims = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return [c.width, c.height];
});

console.log(`[chewer] wrote ${out}`);
console.log(`[chewer] ${dims[0]}x${dims[1]} px, ${(buf.length / 1024).toFixed(1)} KiB`);
if (errors.length) console.error('[chewer] ⚠ page reported errors:\n  ' + errors.join('\n  '));

await browser.close();
