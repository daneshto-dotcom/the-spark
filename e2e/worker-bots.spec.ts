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
import {
  canvasToCss,
  readWorldState,
  titleButtonCss,
  waitForWorld,
  waitForWorldWithinTicks,
} from './helpers';

/**
 * S143 P2 — HOW MUCH RUNWAY THE BOTS GET, DENOMINATED IN THE GAME'S OWN UNITS.
 *
 * A MID bot's `buildCooldownTicks` is 210 (`src/bots/botConfig.ts`), and its supply chain since
 * S138 P2 is gatherer → bank → porch → place (the quarry is off-limits to a bot), so one
 * placement costs materially more than one cooldown. 1200 ticks = 20 sim-seconds ≈ 5.7 cooldowns,
 * which is a full round trip with room to spare.
 *
 * ⛔ NOT SECONDS. Ticks are frame-bound (≤3 per rendered frame), so the same wall-clock window
 * buys ~1530 ticks locally and ~670 in CI. The old 60 s budget was tuned on the former and
 * silently ran the latter at less than half the runway — which is the whole of the "intermittent"
 * failure, three sessions unresolved.
 */
const GROWTH_BUDGET_TICKS = 1_200;

/**
 * Wall backstop for a DEAD page, not a throughput budget. 1200 ticks needs ~109 s at the ~11
 * ticks/s measured on the CI runner, so 180 s clears it with margin. If this ever binds first the
 * helper says so explicitly rather than blaming the game.
 */
const GROWTH_WALL_CAP_MS = 180_000;

test.describe('S123 P1 — VS-BOTS ?worker=1 sim worker smoke', () => {
  // S143 P2 — NO RETRIES ON THIS SPEC (the S127 `PW_RETRIES: 0` precedent). A tick-budgeted
  // failure reproduces identically, so retries buy nothing but wall-clock — and this lane's
  // PW_GLOBAL_TIMEOUT_MIN is 12 min for ~35 tests, which 3 attempts at this budget would eat
  // whole. The three attempts burned on every previous red produced three identical logs.
  test.describe.configure({ retries: 0 });

  test('bots match adopts the worker: bots place through the worker, 0 hash mismatches', async ({
    page,
  }) => {
    test.setTimeout(360_000);
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
    // ⛔ S143 P2 — SAMPLE THE HIGHEST PRIMITIVE ID, NOT THE LIVE COUNT.
    // `primitives.length` is NOT monotonic: `razePrimitives` deletes entries and MID bots sever
    // deliberately (severChance 0.25). A real CI attempt sampled 33 here and then FAILED at 32,
    // so `primitives.length > sampleA` was unsatisfiable no matter how long it waited — a defect
    // no timeout could fix, and one the old error reported as a frozen worker bridge.
    // Ids are allocated strictly increasing, so any NEW placement lands above every id present
    // now. (⛔ NOT `nextPrimitiveId`: it is host-only and frozen on a worker mirror — measured at
    // 33 while a primitive with id 38 was on screen. See its docblock in helpers.ts.)
    const sampleA = (await readWorldState(page)).maxPrimitiveId;

    // Freeze guard (GEMINI S123, adopted): growth must CONTINUE — a worker killed by a
    // DataCloneError (or a wedged snapshot bridge) freezes the cursor while positions keep
    // flowing. Budgeted in TICKS so the CI runner's frame rate cannot decide pass/fail.
    await waitForWorldWithinTicks(
      page,
      (w) => w.maxPrimitiveId > sampleA,
      `bot placements continue (maxPrimitiveId ${sampleA} → >${sampleA})`,
      GROWTH_BUDGET_TICKS,
      GROWTH_WALL_CAP_MS,
    );

    // Every primitive is bot-authored (placedBy !== human seat 0).
    const world = await readWorldState(page);
    expect(world.maxPrimitiveId).toBeGreaterThan(sampleA);
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
