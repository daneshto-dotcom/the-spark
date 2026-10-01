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
import { installFrameClock, waitForTickAdvance } from './tickClock';

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

      // The frozen fixture: a second page whose `world.tick` is pinned (writes ignored), i.e. exactly what a
      // migrated host that stopped simulating looks like from outside. (A TITLE page is NOT frozen — measured:
      // its tick advances — so the freeze is made explicit rather than assumed.) Measured, then asserted.
      const frozen = await frozenCtx.newPage();
      await frozen.goto('/?debug=1');
      await waitForWorld(frozen, (w) => w.gameState === 'TITLE', 'TITLE', 30_000);
      await frozen.evaluate(() => {
        const w = (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world;
        const pinned = w.tick;
        Object.defineProperty(w, 'tick', { get: () => pinned, set: () => undefined, configurable: true });
      });
      const a = await readTick(frozen);
      await frozen.waitForTimeout(1_500);
      expect(await readTick(frozen), 'precondition: the TITLE tick must be frozen').toBe(a);

      // ⛔ NEGATIVE: a frozen sim fails with the FROZEN verdict, not the wall backstop.
      const err = await waitForTickAdvance(frozen, live, 30, 'frozen fixture (+30 ticks)', true).then(
        () => null,
        (e: unknown) => String(e),
      );
      expect(err, 'a frozen sim must FAIL the wait').not.toBeNull();
      expect(err).toMatch(/FROZEN or crawling/);
    } finally {
      await liveCtx.close();
      await frozenCtx.close();
    }
  });
});
