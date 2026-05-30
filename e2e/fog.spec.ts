/**
 * SPARK — fog-of-war rendering smoke (S57 P1).
 *
 * Single-page, DETERMINISTIC. Drives the __SPARK__ DEV global into 1v1 PLAYING,
 * places an own base + an enemy far-corner base, calls fogRenderer.sync()
 * synchronously (so the assertion never depends on rAF timing), then extracts
 * the composed fog-mask RenderTexture and asserts the visibility contract at the
 * PIXEL level:
 *   - own vision sources (live cursor / spawner / own primitive) are CUT OUT
 *     (mask transparent) -> the world is revealed there
 *   - the enemy base is OPAQUE FOG_COLOR -> concealed until the cursor scouts it
 *   - on WIN the overlay fades to alpha 0 and hides -> reveal-all (§ III.7)
 *
 * This is the automated form of the S57 preview verification. It guards the
 * 'erase'-into-RenderTexture path that tsc + unit tests cannot reach (the
 * Council's whole concern was that rendering breaks SILENTLY). No 2-peer /
 * WebRTC: the fog is a pure client-side render mask, so one page exercises it
 * fully. extract.pixels works headless via swiftshader (see playwright.config).
 */
import { test, expect, type Page } from '@playwright/test';

// FOG_COLOR = 0x05070d in src/render/fogRenderer.ts
const FOG = { r: 5, g: 7, b: 13 };

async function waitForSparkFog(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s = (window as { __SPARK__?: { fogRenderer?: unknown; world?: unknown } }).__SPARK__;
      return !!s && !!s.fogRenderer && !!s.world;
    },
    { timeout: 20_000 },
  );
}

test.describe('S57 Fog of War — client-side render mask', () => {
  test('conceals the enemy base, reveals own vision, lifts on win', async ({ page }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);

    const result = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      const COL_ME = 0xff3b6b;
      const COL_ENEMY = 0x3bd7ff;
      const mk = (placedBy: number, color: number, x: number, y: number): void => {
        const id = w.nextPrimitiveId++;
        w.primitives.set(id, {
          id, type: 3, placerColor: color, placedBy, createdTick: w.tick,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: color, lastOwnershipChange: 0, radius: 9,
        });
      };
      w.gameMode = '1v1';
      w.gameState = 'PLAYING';
      w.localPlayerId = 0;
      mk(0, COL_ME, 560, 380); mk(0, COL_ME, 620, 380); mk(0, COL_ME, 590, 440);
      mk(1, COL_ENEMY, 1600, 860); mk(1, COL_ENEMY, 1660, 860);
      s.controls.cursor.x = 590; s.controls.cursor.y = 410;

      // Compose the mask synchronously — no rAF dependency.
      fog.sync(w, s.controls.cursor, 1 / 60);
      const out = app.renderer.extract.pixels(fog.maskTexture);
      const px = out.pixels, W = out.width, H = out.height;
      const rX = W / 1920, rY = H / 1080;
      const at = (x: number, y: number): number[] => {
        const sx = Math.round(x * rX), sy = Math.round(y * rY);
        const i = (sy * W + sx) * 4;
        return [px[i], px[i + 1], px[i + 2], px[i + 3]];
      };
      const playing = {
        alpha: fog.currentAlpha,
        cursor: at(590, 410), spawner: at(960, 540), myPrim: at(560, 380),
        enemy: at(1600, 860), far: at(1400, 200),
      };

      // WIN -> fade overlay out over ~1s (90 frames covers the 1s fade + margin).
      w.gameState = 'WIN';
      for (let f = 0; f < 90; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const win = { alpha: fog.currentAlpha, visible: fog.container.visible };

      return { playing, win };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    // PLAYING: full fog, own vision cut out, enemy concealed as FOG_COLOR.
    expect(result.playing.alpha).toBe(1);
    expect(result.playing.cursor[3]).toBeLessThan(10); // transparent (revealed)
    expect(result.playing.spawner[3]).toBeLessThan(10);
    expect(result.playing.myPrim[3]).toBeLessThan(10);
    expect(result.playing.enemy[3]).toBeGreaterThan(245); // opaque (concealed)
    expect(result.playing.enemy[0]).toBe(FOG.r);
    expect(result.playing.enemy[1]).toBe(FOG.g);
    expect(result.playing.enemy[2]).toBe(FOG.b);
    expect(result.playing.far[3]).toBeGreaterThan(245);

    // WIN: fog fully lifted and hidden -> reveal-all.
    expect(result.win.alpha).toBe(0);
    expect(result.win.visible).toBe(false);
  });

  test('renders NO fog in solo mode', async ({ page }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);
    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const w = s.world;
      w.gameMode = 'solo';
      w.gameState = 'PLAYING';
      s.fogRenderer.sync(w, s.controls.cursor, 1 / 60);
      return { alpha: s.fogRenderer.currentAlpha, visible: s.fogRenderer.container.visible };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(r.alpha).toBe(0);
    expect(r.visible).toBe(false);
  });
});
