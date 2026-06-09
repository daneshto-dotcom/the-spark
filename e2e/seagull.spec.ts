/**
 * SPARK — S77 P3 seagull hazard smoke (real-browser, host loop).
 *
 * Drives the __SPARK__ DEV global into solo PLAYING, injects a seagull + a poop falling onto a
 * structure, then lets the REAL host tick loop run (rAF) for ~1.5s and asserts the end-to-end
 * wiring through the actual dispatch path (NOT a unit reducer): the gull drops poops
 * (world.nextPoopId advances) and a poop fouls a structure (world.fouledPrimitives grows). The
 * deterministic logic is unit-tested (state/seagulls/seagull.test.ts); this guards that the
 * spawner→dispatch→SEAGULL_TICK/POOP_TICK wiring + the pure-vector renderers run live without
 * throwing (the "renderer verified in browser smoke" doctrine).
 */
import { test, expect, type Page } from '@playwright/test';

async function waitForSpark(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s = (window as { __SPARK__?: { world?: unknown; app?: unknown } }).__SPARK__;
      return !!s && !!s.world && !!s.app;
    },
    { timeout: 20_000 },
  );
}

test.describe('S77 P3 — seagull hazard (host-loop smoke)', () => {
  test('the gull drops poop and a poop fouls a structure (income-halt wiring) — live, no throw', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/?debug=1');
    await waitForSpark(page);

    const r = await page.evaluate(async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).__SPARK__;
      const w = s.world;
      w.gameMode = 'solo';
      w.gameState = 'PLAYING';
      w.isHost = true;
      w.localPlayerId = 0;
      w.scoreByPlayer.set(0, 0);

      // A small structure for player 0 (two unbonded prims; fouling either is enough proof).
      const mk = (id: number, x: number, y: number): void => {
        w.primitives.set(id, {
          id, type: 3, placerColor: 0xff3b6b, placedBy: 0, createdTick: 0,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: 0xff3b6b, lastOwnershipChange: 0, radius: 9,
        });
      };
      mk(1, 600, 500);
      mk(2, 660, 500);

      // Inject a seagull mid-flight (it should render + drop poops as the host loop ticks).
      w.seagulls.set(0, {
        id: 0, pos: { x: 300, y: 90 }, prevPos: { x: 295, y: 90 },
        vx: 4.5, baseY: 90, spawnedAtTick: w.tick, lastPoopTick: w.tick,
      });
      const startPoopId = w.nextPoopId;

      // A poop falling straight onto prim 1 — POOP_TICK should foul its structure within a few ticks.
      w.poops.set(999, {
        id: 999, pos: { x: 600, y: 460 }, prevPos: { x: 600, y: 453 },
        state: 'FALLING', spawnedAtTick: w.tick, landedAtTick: -1,
      });

      // Let the real rAF host loop run.
      await new Promise((res) => setTimeout(res, 1500));

      return {
        droppedPoops: w.nextPoopId > startPoopId, // the gull minted poops through the host loop
        fouled: w.fouledPrimitives.size,          // a poop fouled a structure
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    expect(errors, `no page errors: ${errors.join(' | ')}`).toHaveLength(0);
    expect(r.fouled).toBeGreaterThan(0); // the falling poop fouled the structure (income halts)
    expect(r.droppedPoops).toBe(true);   // the seagull dropped poop via the real SEAGULL_TICK path
  });
});
