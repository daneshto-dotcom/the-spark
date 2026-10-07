/**
 * SPARK — S193: `waitForTickAdvance` (`e2e/tickClock.ts`) against a LIVE and a FROZEN sim. No network, single
 * browser, ~15 s.
 *
 * `hostmigration.spec.ts` now budgets "the new host simulates" in rendered frames of the sim page rather than
 * wall seconds (the CI reds it replaces are in `tickClock.ts`). A budget that cannot fail would delete the
 * coverage while staying green, so this pins both halves:
 *   · a live solo match passes it;
 *   · a page whose tick does NOT move (pinned; the precondition is measured, not assumed) FAILS it,
 *     with the FROZEN verdict, inside its frame budget — i.e. a migrated host that stopped simulating would
 *     still turn hostmigration red, on any runner.
 */
import { test, expect } from '@playwright/test';
import { titleButtonCss, waitForWorld } from './helpers';
import { installFrameClock, readFrames, waitForTickAdvance } from './tickClock';

const readTick = async (p: import('@playwright/test').Page): Promise<number> =>
  await p.evaluate(() => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick);

test.describe('S193 - sim-clock tick wait (tickClock.ts)', () => {
  test('passes on a live sim and FAILS on a frozen one, inside its frame budget', async ({ browser }) => {
    test.setTimeout(90_000);
    const liveCtx = await browser.newContext();
    const frozenCtx = await browser.newContext();
    try {
      const live = await liveCtx.newPage();
      await live.addInitScript(() => {
        (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true;
      });
      await live.goto('/?debug=1');
      await live.waitForFunction(() => (window as { __SPARK__?: unknown }).__SPARK__ !== undefined, {
        timeout: 30_000,
      });
      const solo = await titleButtonCss(live, 'solo');
      await live.mouse.click(solo.x, solo.y);
      await waitForWorld(live, (w) => w.gameState === 'PLAYING', 'solo PLAYING', 20_000);
      await installFrameClock(live);

      // ⭐ REACH: the live sim passes.
      await waitForTickAdvance(live, live, 60, 'live solo sim (+60 ticks)', false);

      // ⭐ S196 (s196/ci) — the REACH half is done: CLOSE the game page before the negative. MEASURED on CI
      // (run 37626384765, trace in the `playwright-report` artifact): with this page AND a second full game
      // page rendering through SwiftShader, this page drew ~1.8 frames/s (frame counter 66 → 183 over 65 s).
      // The old negative clocked a 4 × 30 + 60 = 180-frame budget on it ⇒ ~100 s to reach the FROZEN
      // verdict, past this test's 90 s — so it timed out on EVERY master E2E run (14 of 14 checked, 3 attempts
      // each, which also pushed the gating lane into its 900 s globalTimeout), and passed locally on a GPU.
      // The budget was never wrong; the fixture made the CLOCK crawl. A frame budget is only runner-proof if
      // the clock page is not starved by the fixture beside it.
      await liveCtx.close();

      // The frozen fixture: what a migrated host that stopped simulating looks like FROM OUTSIDE — a page whose
      // `__SPARK__.world.tick` does not move while its frames keep coming. ⭐ S196: it is a STUB page, not a second
      // game: `waitForTickAdvance` reads only `world.tick` and the clock page's rAF count, so a game behind the
      // stub adds nothing to the helper under test except the starvation above. Without a renderer the stubs
      // draw at the headless rAF rate, so the frame budget runs out in seconds on any runner. (A TITLE page is
      // NOT frozen — measured S193: its tick advances — so the freeze is explicit, then measured, then asserted.)
      const frozen = await frozenCtx.newPage();
      const clock = await frozenCtx.newPage();
      for (const stub of [frozen, clock]) {
        await stub.setContent('<!doctype html><title>tickClock frozen fixture</title>');
        await stub.evaluate(() => {
          const w = { tick: 4321 };
          const pinned = w.tick;
          Object.defineProperty(w, 'tick', { get: () => pinned, set: () => undefined, configurable: true });
          (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__ = { world: w };
        });
        await installFrameClock(stub);
      }
      const a = await readTick(frozen);
      await frozen.waitForTimeout(1_500);
      expect(await readTick(frozen), 'precondition: the fixture tick must be frozen').toBe(a);
      expect(await readFrames(clock), 'precondition: the clock page is rendering frames').toBeGreaterThan(0);

      // ⛔ NEGATIVE, in BOTH shapes `hostmigration.spec.ts` uses: a frozen sim fails with the FROZEN verdict,
      // not the wall backstop — the sim page clocking itself (successor simulates, +60, no mirror allowance)
      // and a mirror clocked by another page (+30, mirror allowance).
      for (const [observed, clockPage, delta, mirror, label] of [
        [frozen, frozen, 60, false, 'frozen fixture, self-clocked (+60 ticks)'],
        [frozen, clock, 30, true, 'frozen fixture, mirror-clocked (+30 ticks)'],
      ] as const) {
        const err = await waitForTickAdvance(observed, clockPage, delta, label, mirror).then(
          () => null,
          (e: unknown) => String(e),
        );
        expect(err, `${label}: a frozen sim must FAIL the wait`).not.toBeNull();
        expect(err).toMatch(/FROZEN or crawling/);
      }
    } finally {
      await liveCtx.close();
      await frozenCtx.close();
    }
  });
});
