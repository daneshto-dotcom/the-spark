/**
 * SPARK — S147 P1 match-clock browser smoke (real-browser, real host loop).
 *
 * The clock's arithmetic and determinism are unit-tested (`state/matchPhase.test.ts`) and its
 * host-vs-worker parity is proven in `state/workerSim.differential.test.ts`. What NEITHER of those can
 * prove is that the thing is actually WIRED: that the real rAF host loop advances the phase, that the
 * HUD reads the live world rather than a stale mirror, and that the countdown a player sees moves.
 * That is what this file is for — the "renderer verified in browser smoke" doctrine this repo already
 * applies to the hazards.
 *
 * ⚠ The banner is drawn into the Pixi canvas, so there is no DOM node to assert on. These tests read
 * the authoritative world through the `__SPARK__` DEV global and assert the SIM side of the wiring,
 * plus that a frame renders with no page error — the same shape as `seagull.spec.ts`.
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

test.describe('S147 P1 — the match clock is live in the browser', () => {
  test('a solo match opens in BUILD and the countdown ADVANCES under the real host loop', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/?debug=1');
    await waitForSpark(page);

    const start = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = (window as any).__SPARK__.world;
      w.gameMode = 'solo';
      w.gameState = 'PLAYING';
      w.isHost = true;
      w.localPlayerId = 0;
      return { phase: w.matchPhase, endsAt: w.phaseEndsAtTick, tick: w.tick };
    });

    // A fresh match is in BUILD with a deadline a full phase out (Q12).
    expect(start.phase).toBe('BUILD');
    expect(start.endsAt).toBeGreaterThan(start.tick);

    // Let the REAL rAF host loop run, then confirm the clock moved with it.
    await page.waitForTimeout(1200);

    const later = await page.evaluate(() => {
      const w = (window as any).__SPARK__.world;
      return { phase: w.matchPhase, endsAt: w.phaseEndsAtTick, tick: w.tick };
    });

    expect(later.tick, 'the host loop must have advanced the tick').toBeGreaterThan(start.tick);
    // Time REMAINING must have shrunk — this is what the HUD renders.
    expect(later.endsAt - later.tick).toBeLessThan(start.endsAt - start.tick);
    // 1.2 s is nowhere near a 90 s phase, so it must still be BUILD.
    expect(later.phase).toBe('BUILD');
    expect(errors, 'no page errors while the clock runs').toEqual([]);
  });

  test('the BUILD→FIGHT edge fires live, and scoring only starts after it (R3)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/?debug=1');
    await waitForSpark(page);

    const r = await page.evaluate(async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = (window as any).__SPARK__.world;
      w.gameMode = 'solo';
      w.gameState = 'PLAYING';
      w.isHost = true;
      w.localPlayerId = 0;
      w.scoreByPlayer.set(0, 0);
      w.scoreProgress = 0;

      // Give the player standing complexity, so income is possible the moment FIGHT begins. Without
      // this the score would stay 0 for the trivial reason that there is nothing to earn from, and
      // the test would prove nothing about the gate.
      const mk = (id: number, x: number, y: number): void => {
        w.primitives.set(id, {
          id, type: 3, placerColor: 0xff3b6b, placedBy: 0, createdTick: 0,
          pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
          ownerColor: 0xff3b6b, lastOwnershipChange: 0, radius: 9, hp: 1000,
        });
      };
      mk(90001, 700, 500);
      mk(90002, 730, 500);

      // Sample a stretch of BUILD first: score must not move at all.
      await new Promise((res) => setTimeout(res, 500));
      const buildPhase = w.matchPhase;
      const scoreInBuild = w.scoreProgress;

      // Now bring the deadline right up to the current tick so the very next host tick flips the
      // phase. This is the same technique the unit tests use — the deadline is stored precisely so it
      // can be re-stamped, and it keeps the test to ~1 s instead of 90.
      w.phaseEndsAtTick = w.tick + 2;
      await new Promise((res) => setTimeout(res, 700));

      return {
        buildPhase,
        scoreInBuild,
        phaseAfter: w.matchPhase,
        scoreAfter: w.scoreProgress,
        endsAfter: w.phaseEndsAtTick,
        tickAfter: w.tick,
      };
    });

    expect(r.buildPhase).toBe('BUILD');
    expect(r.scoreInBuild, 'score must be exactly 0 through BUILD (R3)').toBe(0);
    expect(r.phaseAfter, 'the live host loop must have flipped to FIGHT').toBe('FIGHT');
    // The new deadline must be strictly ahead of the tick — the relative advance, live.
    expect(r.endsAfter).toBeGreaterThan(r.tickAfter);
    // And income must have started. This is the payoff assertion: the gate opened.
    expect(r.scoreAfter, 'score must rise once FIGHT begins (R7/R16)').toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('Step 0 — hazards do NOT spawn even on a forced fast cadence (R14/R23)', async ({ page }) => {
    // The exact complement of the hazard specs, which opt back IN via __TEST_HAZARDS_ENABLED__.
    //
    // ⚠ THIS NEEDS THE SAME SPEED SEAMS THEY USE, OR IT PROVES NOTHING. My first version just waited
    // on a default session and asserted zero hazards — but the shipped spark rate is 0.15/s and the
    // hazard cadences are measured in SPARKS (7-18 of them), so the FIRST hazard is ~50-120 s away
    // even with hazards fully ENABLED. Zero hazards after a couple of seconds was therefore
    // guaranteed regardless of the flag, and the anti-vacuity check I had written (sparks > 0) failed
    // honestly and caught it: ~0.4 sparks expected in 2.5 s, so usually none at all.
    //
    // So: crank the spark rate AND force a 2-spark cadence on all four, i.e. conditions under which a
    // hazard would certainly appear, then withhold __TEST_HAZARDS_ENABLED__. Now zero really does mean
    // "the dispatch gate held" rather than "nothing had time to happen".
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 12;' });
    await page.addInitScript({ content: 'window.__TEST_BOMB_SPAWN_SPARKS__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_SPAWN_SPARKS__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_RAINBOW_SPAWN_SPARKS__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_SEAGULL_SPAWN_SPARKS__ = 2;' });
    // NOTE: __TEST_HAZARDS_ENABLED__ deliberately NOT set — that is the whole point of this test.

    await page.goto('/?debug=1');
    await waitForSpark(page);

    const counts = await page.evaluate(async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = (window as any).__SPARK__.world;
      w.gameMode = 'solo';
      w.gameState = 'PLAYING';
      w.isHost = true;
      w.localPlayerId = 0;
      let peakSparks = 0;
      // ~4 s at 12 sparks/s is ~48 sparks — roughly 24 hazard cadences' worth on a 2-spark countdown.
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 100));
        if (w.freeSparks.size > peakSparks) peakSparks = w.freeSparks.size;
      }
      return {
        peakSparks,
        nextBombId: w.nextBombId,
        nextPotatoId: w.nextPotatoId,
        nextRainbowId: w.nextRainbowId,
        nextSeagullId: w.nextSeagullId,
        bombs: w.bombs.size,
        potatoes: w.potatoes.size,
        rainbows: w.rainbows.size,
        seagulls: w.seagulls.size,
      };
    });

    // Anti-vacuity: sparks really did flow, so the countdowns really did elapse many times over.
    expect(counts.peakSparks, 'the fast spawner must have produced sparks').toBeGreaterThan(3);
    // Live counts are zero...
    expect(counts.bombs).toBe(0);
    expect(counts.potatoes).toBe(0);
    expect(counts.rainbows).toBe(0);
    expect(counts.seagulls).toBe(0);
    // ...and so are the ID ALLOCATORS, which is the stronger claim: nothing was ever minted and then
    // reaped by a TTL. A hazard that spawned and expired would leave its allocator advanced.
    expect(counts.nextBombId, 'no bomb was ever minted').toBe(0);
    expect(counts.nextPotatoId, 'no potato was ever minted').toBe(0);
    expect(counts.nextRainbowId, 'no rainbow was ever minted').toBe(0);
    expect(counts.nextSeagullId, 'no seagull was ever minted').toBe(0);
  });
});
