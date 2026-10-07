/**
 * S196 #16 — THE NONET HOME, ON SCREEN. ARCADE → NONET opens the home; each door opens its own first
 * screen; ESC from a run returns to the home. Captures go to the owner's REAL desktop
 * (`C:/Users/onesh/OneDrive/Desktop/SPARK_S196_NonetHome`) when it exists, `test-results/` otherwise (CI).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

const DESKTOP = 'C:/Users/onesh/OneDrive/Desktop';
const SHOTS = existsSync(DESKTOP) ? `${DESKTOP}/SPARK_S196_NonetHome` : 'test-results/nonet-home';

interface Row { id: string; x: number; y: number; w: number; h: number }
type Spark = {
  __SPARK__: {
    nonetHome: { getUiPoints: () => { open: boolean; view: string; rows: Row[] } } | null;
    arcadeOverlay: { getUiPoints: () => { open: boolean; rows: Row[] } };
    arcadeRunInfo: { mode: string; boardId: string | null; phase: string } | null;
    world: { sudoku: unknown };
  };
};

async function homePoints(page: Page): Promise<{ open: boolean; view: string; rows: Row[] } | null> {
  return page.evaluate(() => (window as unknown as Spark).__SPARK__.nonetHome?.getUiPoints() ?? null);
}

async function clickCanvas(page: Page, r: Row): Promise<void> {
  const c = await canvasToCss(page, r.x + r.w / 2, r.y + r.h / 2);
  await page.mouse.click(c.x, c.y);
}

async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const arcade = await titleButtonCss(page, 'arcade');
  await page.mouse.click(arcade.x, arcade.y);
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() => (window as unknown as Spark).__SPARK__.arcadeOverlay.getUiPoints());
  await clickCanvas(page, menu.rows.find((r) => r.id === 'nonet')!);
  await expect.poll(async () => (await homePoints(page))?.open ?? false, { timeout: 10_000 }).toBe(true);
}

async function door(page: Page, id: string): Promise<void> {
  const p = (await homePoints(page))!;
  await clickCanvas(page, p.rows.find((r) => r.id === id)!);
}

test.describe('@visual S196 — the NONET home', () => {
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test('home → PLAY / DAILY / ZEN / RANKING, each first screen, ESC back home', async ({ page }) => {
    test.setTimeout(120_000);
    await openHome(page);
    await page.waitForTimeout(1500); // the backdrop + the kami arrive
    expect(await page.evaluate(() => (window as unknown as Spark).__SPARK__.arcadeRunInfo)).toBeNull();
    await page.screenshot({ path: `${SHOTS}/01-nonet-home.png` });

    for (const [id, mode, shot] of [['play', 'PLAY', '02-play'], ['daily', 'DAILY', '03-daily'], ['zen', 'ZEN', '04-zen']] as const) {
      await door(page, id);
      await page.waitForTimeout(2000); // the NONET board's lazy chunk + art
      const info = await page.evaluate(() => ({ run: (window as unknown as Spark).__SPARK__.arcadeRunInfo, sudoku: (window as unknown as Spark).__SPARK__.world.sudoku }));
      expect(info.run?.mode).toBe(mode);
      expect(info.run?.phase).toBe('RUNNING');
      expect(info.run?.boardId === null).toBe(mode === 'ZEN');
      if (mode === 'DAILY') expect(info.run?.boardId).toMatch(/^nonet:d\d{8}$/);
      expect(info.sudoku, 'an arcade puzzle never enters the sim').toBeNull();
      await page.screenshot({ path: `${SHOTS}/${shot}.png` });
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await homePoints(page))?.open ?? false, { timeout: 5_000 }).toBe(true);
      expect(await page.evaluate(() => (window as unknown as Spark).__SPARK__.arcadeRunInfo)).toBeNull();
    }

    await door(page, 'ranking');
    await expect.poll(async () => (await homePoints(page))?.view, { timeout: 3_000 }).toBe('ranking');
    await page.screenshot({ path: `${SHOTS}/05-ranking.png` });
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await homePoints(page))?.view, { timeout: 3_000 }).toBe('home');
    await page.keyboard.press('Escape'); // home → the ARCADE menu
    await expect.poll(async () => page.evaluate(() => (window as unknown as Spark).__SPARK__.arcadeOverlay.getUiPoints().open), { timeout: 3_000 }).toBe(true);
    expect((await homePoints(page))?.open).toBe(false);
  });
});
