/**
 * SPARK — S153 A2: you can leave a match without reloading the page.
 *
 * Owner: *"i dont want to have to restart the page to go back to main menue"*. This is the S109 P0
 * trap again — RETURN_TO_TITLE was reachable only from the lobby's back button, the connection-lost
 * overlay, and a click on POSTGAME, so a live match had no exit at all.
 *
 * Both halves are asserted, because "Escape leaves the match" is equally satisfied by an Escape
 * that abandons the game on a single accidental press — which would be a worse bug than the one
 * being fixed.
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
const gs = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__SPARK__.world.gameState as string);

test.describe('S153 A2 — leaving a live match (owner)', () => {
  test('a DOUBLE Escape returns to the title without a reload', async ({ page }) => {
    await bootSolo(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await gs(page)).toBe('TITLE');
  });

  test('⭐ a SINGLE Escape does NOT — an accidental press must never abandon a game', async ({ page }) => {
    await bootSolo(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await gs(page)).toBe('PLAYING');
  });

  test('⭐ two Escapes far apart do NOT count as a double-press', async ({ page }) => {
    await bootSolo(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2200); // beyond TITLE_EXIT_CONFIRM_MS
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await gs(page)).toBe('PLAYING');
  });
});
