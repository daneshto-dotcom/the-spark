/**
 * SPARK — S123 P1: VS-BOTS `?worker=1` smoke (real browser, gating).
 *
 * S122 shipped the worker with bots EXCLUDED (`botSeats.size===0` adoption gate); S123 P1
 * drops the exclusion — the worker reconstructs the BotManager fresh-from-seed (Council
 * S123 design (A)). This spec proves the full loop live:
 *   • a VS-BOTS match on `?worker=1` ADOPTS the worker (the old gate is gone);
 *   • bots ACT inside the worker — bot-authored primitives appear on the main-thread
 *     mirror (only reachable via structural snapshot applies: the placements prove the
 *     worker→main snapshot bridge is alive, the GEMINI structuredClone-freeze guard);
 *   • placements KEEP arriving (a second growth sample — a silently-dead bridge or a
 *     DataCloneError-killed worker would freeze the first count);
 *   • ZERO mirror-vs-worker hash mismatches (the phase-d oracle, now over bot activity);
 *   • zero page errors.
 *
 * Companion: workerSim.differential.test.ts "VS-BOTS ... (HARD GATE)" proves the batch
 * envelope byte-identical with worker-owned bots in vitest; THIS proves the real
 * Worker/postMessage plumbing + the simWorker.ts BotManager factory seam in a browser.
 */
import { test, expect } from '@playwright/test';
import { canvasToCss, readWorldState, titleButtonCss, waitForWorld } from './helpers';

test.describe('S123 P1 — VS-BOTS ?worker=1 sim worker smoke', () => {
  test('bots match adopts the worker: bots place through the worker, 0 hash mismatches', async ({
    page,
  }) => {
    test.setTimeout(180_000);
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

    // Open the VS-BOTS setup overlay from the live title geometry (lazy chunk).
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

    // START MATCH with the overlay defaults (3 MID bots) via live geometry.
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(
      page,
      (w) => w.gameState === 'PLAYING' && w.players.length === 4,
      'bots PLAYING with human + 3 bots seated',
      20_000,
    );

    // S123 P1 core claim: the worker ADOPTS a bots match (the S122 exclusion is gone).
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { simWorker: { ready: boolean; failed: boolean } | null };
        }).__SPARK__;
        return s.simWorker !== null && s.simWorker.ready && !s.simWorker.failed;
      },
      { timeout: 20_000 },
    );

    // Bots act INSIDE the worker: a bot-authored primitive reaches the mirror. The human
    // places nothing in this spec, so ANY primitive is bot-authored AND proves a
    // structural snapshot applied (primitives never ride the positions payload).
    await waitForWorld(
      page,
      (w) => w.primitives.length >= 1,
      'first bot-authored primitive on the mirror',
      60_000,
    );
    const sampleA = (await readWorldState(page)).primitives.length;

    // Freeze guard (GEMINI S123, adopted): growth must CONTINUE — a worker killed by a
    // DataCloneError (or a wedged snapshot bridge) freezes the count while positions
    // keep flowing. MID bots re-place every ~4-8s; 60s is generous headroom.
    await waitForWorld(
      page,
      (w) => w.primitives.length > sampleA,
      `bot placements continue (prims ${sampleA} → >${sampleA})`,
      60_000,
    );

    // Every primitive is bot-authored (placedBy !== human seat 0).
    const world = await readWorldState(page);
    expect(world.primitives.length).toBeGreaterThan(sampleA);
    for (const p of world.primitives) expect(p.placedBy).not.toBe(0);

    // The oracle verdict over live bot activity: ZERO mirror-vs-worker hash mismatches.
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
