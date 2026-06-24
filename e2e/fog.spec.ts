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

// FOG_COLOR = 0x000000 in src/render/fogRenderer.ts (S63: pure black, no tint)
const FOG = { r: 0, g: 0, b: 0 };

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

  test('S77 P2 — a global-reach entity (potato) renders THROUGH the fog; the board behind stays concealed', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);

    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      w.gameMode = '1v1';
      w.gameState = 'PLAYING';
      w.localPlayerId = 0;
      // Own base by the cursor (revealed); the potato sits in a FAR fogged corner.
      const mk = (placedBy: number, color: number, x: number, y: number): void => {
        const id = w.nextPrimitiveId++;
        w.primitives.set(id, {
          id, type: 3, placerColor: color, placedBy, createdTick: w.tick,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: color, lastOwnershipChange: 0, radius: 9,
        });
      };
      mk(0, 0xff3b6b, 560, 380); mk(0, 0xff3b6b, 620, 380);
      s.controls.cursor.x = 590; s.controls.cursor.y = 410;
      // Owner-agnostic AoE => fog-exempt. Placed where NO vision source reaches (so it can only
      // be visible by virtue of rendering ABOVE the fog, not because the area is revealed).
      w.potatoes.set(1, { id: 1, pos: { x: 1400, y: 300 }, state: 'FREE', detonateAtTick: w.tick + 600 });

      // Z-ORDER PROOF: aboveFogLayer is above the fog container, and all 4 global-reach
      // renderers (creature/hunter/potato/rainbow) parented into it.
      const stage = app.stage;
      const aboveIdx = stage.getChildIndex(s.aboveFogLayer);
      const fogIdx = stage.getChildIndex(fog.container);
      const aboveFogChildren = s.aboveFogLayer.children.length;

      // Draw the potato (into aboveFogLayer) + compose the fog — both synchronous (no rAF).
      s.potatoRenderer.sync(w);
      fog.sync(w, s.controls.cursor, 1 / 60);

      const stagePx = app.renderer.extract.pixels(app.stage);
      const maskPx = app.renderer.extract.pixels(fog.maskTexture);
      const read = (out: any, x: number, y: number): number[] => {
        const rX = out.width / 1920, rY = out.height / 1080;
        const i = (Math.round(y * rY) * out.width + Math.round(x * rX)) * 4;
        return [out.pixels[i], out.pixels[i + 1], out.pixels[i + 2], out.pixels[i + 3]];
      };
      return {
        aboveIdx, fogIdx, aboveFogChildren,
        potatoOnStage: read(stagePx, 1400, 300),    // potato center — brown body if it shows through
        boardNearPotato: read(stagePx, 1560, 300),  // 160px away, no entity — fogged board
        maskAtPotato: read(maskPx, 1400, 300),       // potato is NOT a vision source — mask stays opaque
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    // Z-order: the global-reach layer sits above the fog, with all global-reach renderers routed
    // into it — P2's 4 (creature/hunter/potato/rainbow) + P3's seagull + poop = 6, + S84 P2's
    // flyover celebration (overlay wash/beams + character container) = 8, + S100 P1's two TD
    // renderers (spawnerZoneRenderer aura + chewerRenderer swarm) = 10. This count is the
    // layer CONTRACT: bump it deliberately (with the renderer list above) on every addition.
    expect(r.aboveIdx).toBeGreaterThan(r.fogIdx);
    expect(r.aboveFogChildren).toBe(10);
    // The potato punches THROUGH the fog — its brown body (BODY_COLOR 0xb5651d, r≈181) shows on the
    // composited stage as a strong red channel, clearly not the fog's pure black.
    expect(r.potatoOnStage[0]).toBeGreaterThan(90);                 // red channel present → visible
    expect(r.potatoOnStage[0]).toBeGreaterThan(r.potatoOnStage[2]); // r > b → brown, not grey/fog
    // ...yet the board NEXT TO it stays concealed (no terrain leak), and the fog mask at the potato
    // is still OPAQUE — the entity reveals only itself, never the surrounding board.
    expect(r.boardNearPotato[0]).toBeLessThan(20);  // fogged → near-black
    expect(r.maskAtPotato[3]).toBeGreaterThan(245); // mask opaque at the potato → zero board reveal
  });

  test('remembers a scouted enemy structure as a ghost, conceals an unscouted one, drops it when razed', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);

    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      const COL_ENEMY = 0x3bd7ff; // cyan → strong green+blue channels when ghosted
      const mkEnemy = (x: number, y: number): number => {
        const id = w.nextPrimitiveId++;
        w.primitives.set(id, {
          id, type: 3, placerColor: COL_ENEMY, placedBy: 1, createdTick: w.tick,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: COL_ENEMY, lastOwnershipChange: 0, radius: 9,
        });
        return id;
      };
      w.gameMode = '1v1';
      w.gameState = 'PLAYING';
      w.localPlayerId = 0;
      const A = mkEnemy(1400, 700); // mid-board, will be scouted then left
      mkEnemy(300, 200);            // control: never scouted

      // 1) SCOUT A — cursor on it (A enters live vision → recorded into memory).
      //    Before PLAYING every sync hit the early-return and zeroed the throttle
      //    counter, so this first sync recomposes (records A); 3x is belt-and-braces.
      s.controls.cursor.x = 1400; s.controls.cursor.y = 700;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const afterScout = fog.rememberedCount;

      // 2) LEAVE — cursor to spawner; A falls back into fog (>2x personal radius away).
      //    6 syncs guarantees a throttled recompose at the settled cursor.
      s.controls.cursor.x = 960; s.controls.cursor.y = 540;
      for (let f = 0; f < 6; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const afterLeave = fog.rememberedCount;

      // Pixel proof on the fully-composited stage: A is fogged-but-remembered (a dim
      // enemy-tinted silhouette painted OVER the opaque fog) → lifted G+B channels; B
      // was never seen → plain near-black fog. The live fog mask stays OPAQUE at A, so
      // the real board beneath the ghost is NOT revealed (no M1-style leak).
      const stage = app.renderer.extract.pixels(app.stage);
      const mask = app.renderer.extract.pixels(fog.maskTexture);
      const read = (out: any, x: number, y: number): number[] => {
        const rX = out.width / 1920, rY = out.height / 1080;
        const i = (Math.round(y * rY) * out.width + Math.round(x * rX)) * 4;
        return [out.pixels[i], out.pixels[i + 1], out.pixels[i + 2], out.pixels[i + 3]];
      };
      const ghostA = read(stage, 1400, 700);
      const plainB = read(stage, 300, 200);
      const maskA = read(mask, 1400, 700);

      // 3) RAZE A while looking right at it → confirmed destroyed → forgotten.
      w.primitives.delete(A);
      s.controls.cursor.x = 1400; s.controls.cursor.y = 700;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const afterRaze = fog.rememberedCount;

      // 4) MATCH RESTART — a new match must NOT inherit ghosts. Re-place + scout a
      //    structure, then bounce TITLE→PLAYING with the cursor parked far away: the
      //    PLAYING edge wipes the memory and the parked cursor doesn't re-remember it.
      mkEnemy(1400, 700);
      s.controls.cursor.x = 1400; s.controls.cursor.y = 700;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const beforeRestart = fog.rememberedCount;
      s.controls.cursor.x = 960; s.controls.cursor.y = 540; // park far from the new structure
      w.gameState = 'TITLE';
      fog.sync(w, s.controls.cursor, 1 / 60); // fog inactive → clears the PLAYING latch
      w.gameState = 'PLAYING';
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60); // PLAYING edge → resetMemory()
      const afterRestart = fog.rememberedCount;

      return { afterScout, afterLeave, afterRaze, beforeRestart, afterRestart, ghostA, plainB, maskA };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    // State machine, exercised through the REAL renderer (sync → updateGhostMemory →
    // syncGhostSprites), not just the pure unit core.
    expect(r.afterScout).toBe(1); // A recorded the moment it was scouted
    expect(r.afterLeave).toBe(1); // ghost persists once A is back under fog
    expect(r.afterRaze).toBe(0);  // re-scouting the razed spot confirms it gone → dropped
    expect(r.beforeRestart).toBe(1); // a re-placed structure is remembered within the match
    expect(r.afterRestart).toBe(0);  // the PLAYING edge wiped it — no cross-match ghost carry

    // Pixel: the remembered ghost paints at A; the unseen structure stays concealed.
    expect(r.ghostA[1]).toBeGreaterThan(50); // enemy-cyan ghost lifts the green channel
    expect(r.ghostA[2]).toBeGreaterThan(50); // ...and the blue channel
    expect(r.plainB[1]).toBeLessThan(20);    // B never seen → plain fog, no ghost
    // No leak: the board under the ghost is still fully fogged (mask opaque at A).
    expect(r.maskA[3]).toBeGreaterThan(245);
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

  test('P3(a) — freezes the mask during the win-lift so the reveal dissolves uniformly', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);
    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const app = s.app;
      const fog = s.fogRenderer;
      const w = s.world;
      w.gameMode = '1v1'; w.gameState = 'PLAYING'; w.localPlayerId = 0;
      // Compose a fog mask with a personal-vision hole at (500,500) (outside the spawner).
      s.controls.cursor.x = 500; s.controls.cursor.y = 500;
      fog.sync(w, s.controls.cursor, 1 / 60);
      const maskAlphaAt = (x: number, y: number): number => {
        const out = app.renderer.extract.pixels(fog.maskTexture);
        const rX = out.width / 1920, rY = out.height / 1080;
        return out.pixels[(Math.round(y * rY) * out.width + Math.round(x * rX)) * 4 + 3];
      };
      const holeBeforeWin = maskAlphaAt(500, 500); // ~0 (transparent vision hole)
      // Enter WIN (lift begins) and move the cursor far away. If the mask were still
      // recomposing, the hole would relocate and (500,500) would fill in (opaque). The
      // P3(a) freeze keeps the last PLAYING composition, so (500,500) stays a hole.
      w.gameState = 'WIN';
      s.controls.cursor.x = 1500; s.controls.cursor.y = 900;
      for (let f = 0; f < 4; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      return { holeBeforeWin, holeDuringLift: maskAlphaAt(500, 500), midLiftAlpha: fog.currentAlpha };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(r.midLiftAlpha).toBeGreaterThan(0); // still mid-lift...
    expect(r.midLiftAlpha).toBeLessThan(1);    // ...fog is fading, not yet fully gone
    expect(r.holeBeforeWin).toBeLessThan(10);  // the vision hole at (500,500)
    expect(r.holeDuringLift).toBeLessThan(10); // STILL a hole — mask frozen, not recomposed
  });

  test('P3(c) — reset() forgets exploration + ghost memory and hides the fog', async ({ page }) => {
    await page.goto('/?debug=1');
    await waitForSparkFog(page);
    const r = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const fog = s.fogRenderer;
      const w = s.world;
      const id = w.nextPrimitiveId++;
      w.primitives.set(id, {
        id, type: 3, placerColor: 0x3bd7ff, placedBy: 1, createdTick: w.tick,
        pos: { x: 800, y: 500 }, prevPos: { x: 800, y: 500 }, bonds: new Set(),
        ownerColor: 0x3bd7ff, lastOwnershipChange: 0, radius: 9,
      });
      w.gameMode = '1v1'; w.gameState = 'PLAYING'; w.localPlayerId = 0;
      s.controls.cursor.x = 800; s.controls.cursor.y = 500;
      for (let f = 0; f < 3; f++) fog.sync(w, s.controls.cursor, 1 / 60);
      const beforeReset = { remembered: fog.rememberedCount, visible: fog.container.visible };
      fog.reset();
      const afterReset = {
        remembered: fog.rememberedCount,
        visible: fog.container.visible,
        alpha: fog.currentAlpha,
      };
      return { beforeReset, afterReset };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });
    expect(r.beforeReset.remembered).toBe(1); // enemy structure scouted + remembered
    expect(r.beforeReset.visible).toBe(true);  // fog active
    expect(r.afterReset.remembered).toBe(0);   // memory forgotten
    expect(r.afterReset.visible).toBe(false);  // fog hidden
    expect(r.afterReset.alpha).toBe(0);        // alpha zeroed
  });
});
