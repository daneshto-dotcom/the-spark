/**
 * SPARK — S194 (T8): a SLOW click near a button's edge still registers.
 *
 * Deploy #22's gating lane caught `exit-match.spec.ts` "a click near the right EDGE opens the confirm"
 * failing once, then passing on retry. Not noise. The S152 press grammar (`buttonFeedback.ts`) scales the
 * container to `BUTTON_PRESS_SCALE` (0.97) on `pointerdown`, about its ORIGIN — the exit button's
 * top-left. Pixi tests `pointerup` against the container's world transform, so once a frame renders
 * between down and up, the 168-px plate's click target is 168 × 0.97 = 162.96 px wide: a release at
 * local x 165 (3 px inside the right edge) lands OUTSIDE it, Pixi fires `pointerupoutside`, and the tap
 * never happens. Whether a frame lands between Playwright's down and up is timing — hence a flake on a
 * slow runner and a pass on the retry. A HUMAN click (≈100 ms down→up) renders several frames between
 * the two, so for a player the right ≈5 px of every top-left-origin button were dead: the owner's
 * S155 complaint ("one side … clickable and … the right part of it is not"), still half-true.
 *
 * This spec makes the timing deterministic: it holds the button down for 150 ms (≥ 2 frames even at a
 * slow tick) before releasing, near both edges.
 */
import { expect, test, type Page } from '@playwright/test';
import { canvasToCss, waitForWorld } from './helpers.ts';

async function bootSolo(page: Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const c = await page.evaluate(() => (window as any).__SPARK__.titleScreen.getButtonCenters());
  const solo = await canvasToCss(page, c.solo.x, c.solo.y);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
}

const exitState = (page: Page) =>
  page.evaluate(() => (window as any).__SPARK__.exitButton.getUiPoints() as {
    exit: { x: number; y: number }; confirmOpen: boolean;
  });

/** Press, HOLD (frames render with the press scale applied), release — what a person does. */
async function slowClick(page: Page, x: number, y: number): Promise<void> {
  const css = await canvasToCss(page, x, y);
  await page.mouse.move(css.x, css.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test.describe('S194 T8 — a held click near the edge of the BACK TO MAIN button registers', () => {
  // The plate is EXIT_BTN_W = 168 wide (exitButton.ts), drawn from its top-left.
  const HALF_W = 168 / 2;
  for (const edge of ['left', 'right'] as const) {
    test(`a held click 3 px inside the ${edge} edge opens the confirm`, async ({ page }) => {
      await bootSolo(page);
      const p = await exitState(page);
      expect(p.confirmOpen).toBe(false);
      const x = edge === 'left' ? p.exit.x - (HALF_W - 3) : p.exit.x + (HALF_W - 3);
      await slowClick(page, x, p.exit.y);
      await page.waitForTimeout(250);
      expect((await exitState(page)).confirmOpen, `a held click 3 px inside the ${edge} edge must register`).toBe(true);
    });
  }

  test('negative: a held click 3 px OUTSIDE the right edge still does nothing', async ({ page }) => {
    await bootSolo(page);
    const p = await exitState(page);
    await slowClick(page, p.exit.x + HALF_W + 3, p.exit.y);
    await page.waitForTimeout(250);
    expect((await exitState(page)).confirmOpen).toBe(false);
  });
});
