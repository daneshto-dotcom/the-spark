/**
 * SPARK — S122 P1 (B2 phase d): `?worker=1` sim-worker smoke (real browser, gating).
 *
 * Boots a SOLO match with the worker flag, waits for the driver to adopt the sim, then
 * asserts the full worker loop end-to-end:
 *   • the Worker chunk loads + INIT restore succeeds (driver reports ready, not failed);
 *   • the mirror's tick keeps advancing (positions payloads applying every frame);
 *   • a real drag-and-place lands through the intent path (worker-authoritative
 *     placement → structural snapshot → mirror shows the new primitive);
 *   • ZERO mirror-vs-worker hash mismatches across the run (the phase-d oracle);
 *   • zero page errors.
 *
 * The boot-then-smoke complement to workerSim.differential.test.ts (which proves the
 * batch envelope byte-identical in vitest): THIS proves the real Worker/postMessage/
 * transferable plumbing works in a live browser.
 */
import { test, expect } from '@playwright/test';
import { canvasToCss, placeFreeSparkAndConfirm, titleButtonCss, waitForWorld } from './helpers';

test.describe('S122 P1 — ?worker=1 sim worker smoke', () => {
  test('solo match adopts the worker: ticks advance, placement lands, 0 hash mismatches', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/?worker=1');
    await page.waitForFunction(
      () => (window as { __SPARK__?: unknown }).__SPARK__ !== undefined,
      { timeout: 30_000 },
    );

    // Start a solo match from the live title geometry.
    const solo = await titleButtonCss(page, 'solo');
    const c = await canvasToCss(page, solo.x, solo.y);
    // titleButtonCss already maps to CSS — click the mapped point directly.
    void c;
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'solo PLAYING', 20_000);

    // The driver must adopt (INIT → READY) and never fail.
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { simWorker: { ready: boolean; failed: boolean } | null };
        }).__SPARK__;
        return s.simWorker !== null && s.simWorker.ready && !s.simWorker.failed;
      },
      { timeout: 20_000 },
    );

    // Ticks must advance via the positions payloads (the worker is the only simulator now).
    const t0 = await page.evaluate(
      () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
    );
    await page.waitForFunction(
      (prev) =>
        (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick >
        prev + 120,
      t0,
      { timeout: 15_000 },
    );

    // A real placement through the worker intent path: drag a spark out + confirm the
    // primitive appears on the mirror (structural snapshot round-trip).
    const primsBefore = await page.evaluate(
      () =>
        (window as unknown as { __SPARK__: { world: { primitives: Map<number, unknown> } } })
          .__SPARK__.world.primitives.size,
    );
    await placeFreeSparkAndConfirm(page, 560, 400);
    const primsAfter = await page.evaluate(
      () =>
        (window as unknown as { __SPARK__: { world: { primitives: Map<number, unknown> } } })
          .__SPARK__.world.primitives.size,
    );
    expect(primsAfter).toBeGreaterThan(primsBefore);

    // Let it run a few more seconds, then the oracle verdict: ZERO hash mismatches.
    await page.waitForTimeout(4_000);
    const workerState = await page.evaluate(
      () =>
        (window as unknown as {
          __SPARK__: { simWorker: { ready: boolean; failed: boolean; hashMismatches: number } | null };
        }).__SPARK__.simWorker,
    );
    expect(workerState).not.toBeNull();
    expect(workerState!.failed).toBe(false);
    expect(workerState!.hashMismatches).toBe(0);

    expect(pageErrors).toEqual([]);
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::ERR'),
    );
    expect(realErrors).toEqual([]);
  });
});
