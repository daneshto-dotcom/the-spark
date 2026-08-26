/**
 * SPARK — S153 P5a (owner R91): ordering a tower's shapes from the FOOTER must work even if the
 * castle panel has never been opened.
 *
 * Owner, verbatim: *"i clicked on tier 5 buld and then goblin tower twice - and then when i clicked
 * on the castle it didnt show anything in queue. only when the castle page was up and then i clicked
 * on them again, those shape that make the goblin tower came up to queue."*
 *
 * The cause was a DRAW-TIME LATCH: `requestShapesFor` read a field the castle panel only assigns
 * while rendering, so a player who had never opened the castle silently lost the order — no queue
 * entry, no refusal, nothing on screen. This spec reproduces the owner's sequence exactly and would
 * have failed before the fix, which is the only reason it is worth having.
 */
import { expect, test } from '@playwright/test';
import { canvasToCss, waitForWorld } from './helpers.ts';

async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const c = await page.evaluate(() => (window as any).__SPARK__.titleScreen.getButtonCenters());
  const solo = await canvasToCss(page, c.solo.x, c.solo.y);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
}
async function clickCanvas(page: import('@playwright/test').Page, x: number, y: number) {
  const p = await canvasToCss(page, x, y);
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(60);
  await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up();
  await page.waitForTimeout(250);
}
const queueLen = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const w = (window as any).__SPARK__.world;
    return (w.gathererOrders.get(w.localPlayerId) ?? []).length as number;
  });

test('⭐ R91 — a tower ordered from the footer queues its shapes with the castle NEVER opened', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await bootSolo(page);

  // Empty the bank so every tower is UNAFFORDABLE — that is the branch that orders the shortfall.
  await page.evaluate(() => {
    const g = (window as any).__SPARK__;
    const w = g.world;
    w.castleBanks.set(w.localPlayerId, []);
  });
  await page.waitForTimeout(200);
  expect(await queueLen(page), 'queue starts empty').toBe(0);

  // The owner's sequence: a tier chip, then the tower card. The castle is NEVER clicked.
  const pts = await page.evaluate(() => (window as any).__SPARK__.footerBand.getUiPoints());
  const chip = pts.chips[pts.chips.length - 1] ?? pts.chips[0];
  await clickCanvas(page, chip.x + chip.w / 2, chip.y + chip.h / 2);

  const opened = await page.evaluate(() => (window as any).__SPARK__.footerBand.getUiPoints());
  expect(opened.cards.length, 'the chip must open its tower menu').toBeGreaterThan(0);
  const card = opened.cards[0];
  await clickCanvas(page, card.x + card.w / 2, card.y + card.h / 2);

  // Before the fix this stayed 0: the panel had never drawn, so its latch was empty and the
  // order was dropped in silence.
  expect(await queueLen(page), 'the shortfall must be queued from the footer alone').toBeGreaterThan(0);
  expect(errs).toEqual([]);
});
