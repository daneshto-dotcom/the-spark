/**
 * SPARK — S148 P1: LOOK AT THE BOARD.
 *
 * ⚠ A GREEN SUITE IS NOT EVIDENCE FOR RENDER WORK. This session moved every castle on screen, and
 * the unit tests only prove the NUMBERS are right — they cannot see a keep drawn half off-canvas, a
 * panel opening over the quarry, or a bank glyph landing on top of the score bar. S147 shipped a
 * phase-banner pulse bug that every test passed through and only a real frame exposed.
 *
 * So this captures both boards under the real host loop and writes them to the owner's desktop.
 * Playwright, not the in-app browser pane: an undisplayed pane does not composite, so rAF is paused
 * and the Pixi ticker never advances — a screenshot from it would show a dead first frame.
 *
 * Tagged `@visual` so it stays out of the gating lane; it is a capture with a couple of sanity
 * assertions, not a behavioural test.
 */
import { expect, test } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

/**
 * ⚠ The ONE canonical desktop on this machine is the OneDrive-redirected shell folder. Writing to
 * `%USERPROFILE%\Desktop` drops files into a stale folder the owner does not see on screen.
 */
const DESKTOP = 'C:/Users/onesh/OneDrive/Desktop';

async function readLayout(page: import('@playwright/test').Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as { __SPARK__?: { world?: { layout?: string } } }).__SPARK__?.world?.layout,
  );
}

test.describe('@visual S148 P1 — the zone partition on screen', () => {
  test('PITCH_2P: a solo match draws its keep in the goalmouth', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    // Let the host loop actually run, so gatherers have left the keep and this is not a first frame.
    await page.waitForTimeout(5000);

    expect(await readLayout(page)).toBe('PITCH_2P');
    await page.screenshot({ path: `${DESKTOP}/spark-s148-zones-PITCH_2P.png` });
  });

  test('QUADRANTS_4P: a bots match draws four corner keeps', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const vsBots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vsBots.x, vsBots.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    // START MATCH on the overlay defaults (3 bots + the human = the full 4-seat table).
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(5000);

    expect(await readLayout(page)).toBe('QUADRANTS_4P');
    await page.screenshot({ path: `${DESKTOP}/spark-s148-zones-QUADRANTS_4P.png` });
  });
});
