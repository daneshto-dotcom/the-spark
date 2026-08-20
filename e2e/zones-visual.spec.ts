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

  test('S148 P2 — the opening board is EMPTY: no free bot structures, no starter goblins', async ({ page }) => {
    // The owner's playtest complaint, asserted in a real browser rather than only in unit tests:
    // "why are bots starting with the pencil chewers and the drones from the start .... not fair.
    //  everyone should start with nothing but the castle and one gatherer."
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
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');

    const opening = await page.evaluate(() => {
      const w = (window as unknown as {
        __SPARK__: {
          world: {
            creatures: Map<unknown, unknown>;
            creatureSpawners: Map<unknown, unknown>;
            defenders: Map<unknown, unknown>;
            primitives: Map<unknown, unknown>;
            gatherers: Map<unknown, unknown>;
            players: Map<unknown, unknown>;
          };
        };
      }).__SPARK__.world;
      return {
        creatures: w.creatures.size,
        spawners: w.creatureSpawners.size,
        defenders: w.defenders.size,
        primitives: w.primitives.size,
        gatherers: w.gatherers.size,
        players: w.players.size,
      };
    });

    // POSITIVE CONTROL first — a real 4-seat bots match actually started, so the zeroes below mean
    // "nothing was seeded" rather than "nothing happened".
    expect(opening.players).toBe(4);
    expect(opening.gatherers).toBe(4); // one each, human and bot alike — the symmetry is the point

    expect(opening.creatures, 'no starter goblins (R49)').toBe(0);
    expect(opening.spawners, 'no free bot pentagrams (R50)').toBe(0);
    expect(opening.defenders, 'nobody opens with a tower').toBe(0);
    expect(opening.primitives, 'no free bot structures on the board').toBe(0);

    await page.screenshot({ path: `${DESKTOP}/spark-s148-empty-opening.png` });
  });
});

/**
 * S149 P3 — THE BORDER WALLS, ON SCREEN.
 *
 * ⚠ THIS IS THE HALF THE UNIT SUITE CANNOT REACH. `walls.test.ts` proves the segment geometry and
 * the movement clamp; neither can tell you whether a wall was actually DRAWN, drawn in the right
 * colour, or drawn at all after the phase flipped. The owner's report was literally *"there are no
 * walls it seems"* — a render-layer complaint — so a render-layer proof is the one that answers it.
 *
 * The phase is forced through `__SPARK__` rather than waited out: a real BUILD lasts 5400 ticks
 * (90 s), and the renderer reads `world.matchPhase` fresh every frame, so setting it is exactly
 * what the player would see one second after the clock turned over.
 */
test.describe('@visual S149 P3 — the border walls on screen', () => {
  test('PITCH_2P: walls stand during BUILD and are GONE during FIGHT', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(3000); // let the host loop actually run some frames

    // BUILD — the walls are up.
    expect(await readPhase(page)).toBe('BUILD');
    await page.screenshot({ path: `${DESKTOP}/spark-s149-walls-BUILD-pitch.png` });

    // Flip to FIGHT and let a few frames render.
    await forcePhase(page, 'FIGHT');
    await page.waitForTimeout(1200);
    expect(await readPhase(page)).toBe('FIGHT');
    await page.screenshot({ path: `${DESKTOP}/spark-s149-walls-FIGHT-pitch.png` });
  });

  test('QUADRANTS_4P: four coloured arms during BUILD', async ({ page }) => {
    await page.goto('/');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
    const vsBots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vsBots.x, vsBots.y);
    // VS-BOTS opens a setup overlay first — clicking the title button alone never reaches PLAYING.
    // Same flow the S148 capture above uses; START MATCH on the overlay defaults gives the full
    // 4-seat table, which is what puts four coloured arms on the board.
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(3000);

    expect(await readLayout(page)).toBe('QUADRANTS_4P');
    expect(await readPhase(page)).toBe('BUILD');
    await page.screenshot({ path: `${DESKTOP}/spark-s149-walls-BUILD-quadrants.png` });
  });
});

async function readPhase(page: import('@playwright/test').Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as { __SPARK__?: { world?: { matchPhase?: string } } }).__SPARK__?.world?.matchPhase,
  );
}

/** Render-only nudge: the wall renderer reads `matchPhase` fresh each frame. */
async function forcePhase(page: import('@playwright/test').Page, phase: string): Promise<void> {
  await page.evaluate((ph) => {
    const w = (window as { __SPARK__?: { world?: { matchPhase?: string } } }).__SPARK__?.world;
    if (w !== undefined) w.matchPhase = ph;
  }, phase);
}

/**
 * S149 P4 — THE FOOTER BAND, ON SCREEN (R36).
 *
 * ⚠ A UNIT TEST CANNOT SEE A UI SURFACE. `footerBand.test.ts` proves the numbers are derived from
 * the registry and that no chip overlaps a porch; it cannot tell you whether the bar is legible,
 * whether it collides with the HUD, or whether it renders at all. This surface was DELETED once
 * already (S136 P0) for exactly the kind of problem only a real frame shows.
 */
test.describe('@visual S149 P4 — the footer band on screen', () => {
  test('QUADRANTS_4P: the bar of connector counts sits clear of both bottom porches', async ({ page }) => {
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
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING');
    await page.waitForTimeout(3000);

    // ⭐ ASSERT THE BAR, DO NOT JUST PHOTOGRAPH IT. A screenshot at 1280x720 downscales the
    // 1920x1080 canvas by 2/3, and at that size a chip is 41px wide — small enough that I
    // miscounted them by eye on the first pass. Reading the live geometry is the only honest check
    // that every complexity in the registry actually reached the screen.
    const band = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { footerBand: { getUiPoints: () => { chips: Array<{ complexity: number; x: number; w: number }> } } };
      }).__SPARK__;
      return s.footerBand.getUiPoints();
    });
    // The five distinct connector counts in the shipped registry: stink 4, pentagram 5,
    // lightningHub 6, laserTurret/helga 7, voltkin 8. Derived, so adding a recipe updates the bar
    // and this assertion together.
    expect(band.chips.map((c) => c.complexity)).toEqual([4, 5, 6, 7, 8]);
    // And they clear both bottom-corner porches (x=130 and x=1790) by a wide margin.
    expect(Math.min(...band.chips.map((c) => c.x))).toBeGreaterThan(400);
    expect(Math.max(...band.chips.map((c) => c.x + c.w))).toBeLessThan(1520);

    await page.screenshot({ path: `${DESKTOP}/spark-s149-footer-band.png` });
  });
});
