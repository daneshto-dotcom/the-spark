/**
 * SPARK — S72 P2 Pac-Man hunter E2E (GATING lane; single-page SOLO, deterministic).
 *
 * e2e is tsc-blind (the S71 v4->5 bump broke 2 specs that tsc + unit both passed),
 * so the hunter's main.ts trigger wiring + the pure-vector renderer + the SOLO
 * avatarPos fix (the hunter chases world.players[target].avatarPos, which pre-S72
 * only updated in networked mode) MUST be proven in a real browser.
 *
 * SOLO + host-authoritative => NO real WebRTC => GATING lane (no @quarantine-flaky).
 * Seams (mirror __TEST_WIN_SCORE__ idiom): __TEST_HUNTER_TRIGGER_SCORE__ low so the
 * hunter spawns at score 1, __TEST_WIN_SCORE__ high so the game does NOT end first,
 * __TEST_SPAWN_RATE_PER_SECOND__ fast so a spark is available to place quickly.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasToCss,
  placeFreeSparkAndConfirm,
  waitForWorld,
} from './helpers.ts';

interface HunterView {
  count: number;
  first: { state: string; targetPlayerId: number } | null;
  benched0: number | undefined;
}

async function readHunters(page: Page): Promise<HunterView> {
  return await page.evaluate(() => {
    const w = (window as {
      __SPARK__?: {
        world: {
          hunters: Map<number, { state: string; targetPlayerId: number }>;
          players: Map<number, { benchedUntilTick?: number }>;
        };
      };
    }).__SPARK__!.world;
    const hs = Array.from(w.hunters.values());
    const p0 = w.players.get(0);
    return {
      count: w.hunters.size,
      first: hs.length > 0 ? { state: hs[0].state, targetPlayerId: hs[0].targetPlayerId } : null,
      benched0: p0?.benchedUntilTick,
    };
  });
}

async function waitForHunter(
  page: Page,
  pred: (h: HunterView) => boolean,
  desc: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const h = await readHunters(page).catch(() => null);
    if (h !== null && pred(h)) return;
    await page.waitForTimeout(200);
  }
  const f = await readHunters(page).catch(() => null);
  throw new Error(`waitForHunter timeout (${timeoutMs}ms): ${desc}\nFinal: ${JSON.stringify(f)}`);
}

test.describe('S72 P2 — Pac-Man hunter (solo, gating)', () => {
  test('spawns once at the 75% trigger, chases the solo avatar, and catches → benches', async ({ page }) => {
    // S75 P2 — the hunter is now 5x slower (MAX_SPEED 7->1.4), so the pure-pursuit catch of
    // the held center avatar takes ~7s of sim time (~400 ticks, well within the 1800-tick HUNT
    // window) and MORE wall-time under CI software-WebGL sim-clock slowdown (main.ts:496 dtSec
    // clamp; S74 lesson). Extend the per-test budget + the catch wait — a STATIONARY target is
    // always caught; only the wall-time grows.
    test.setTimeout(120_000);
    // pageerror = uncaught JS exception = a real crash (renderer / sim wiring). The
    // single high-signal assertion; console noise (audio autoplay, etc.) is ignored.
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 1.5;' });
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' }); // never win first
    await page.addInitScript({ content: 'window.__TEST_HUNTER_TRIGGER_SCORE__ = 1;' }); // spawn at score 1

    await page.goto('/?debug=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');

    // Solo button — helpers: btnSolo at (CANVAS_W/2, CANVAS_H/2 + 40).
    const solo = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');

    // Place one primitive outside the spawner zone (exercises the place wiring + gives P0 complexity).
    await placeFreeSparkAndConfirm(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 360);

    // S78 — the income rate was cut 3x (0.15->0.05) for game-length tuning, which tripled the SIM-time
    // for natural accrual to cross the trigger (complexity-1 → score 1 is now ~20s sim, far worse under
    // the CI sim-clock slowdown) and blew the 15s spawn-wait. This test covers the trigger WIRING, not
    // the income RATE (the income→threshold mechanic is unit-tested in scoring.test.ts), so inject the
    // host score over the trigger directly — mirrors the S76 win-pipeline e2e __SPARK__ score-injection
    // — making the spawn robust to ANY future income/win-score tuning.
    await page.evaluate(() => {
      const w = (window as unknown as { __SPARK__: { world: { scoreByPlayer: Map<number, number> } } })
        .__SPARK__.world;
      w.scoreByPlayer.set(0, 5); // > __TEST_HUNTER_TRIGGER_SCORE__ (1), << __TEST_WIN_SCORE__ (999)
    });

    // (a) main.ts 75% trigger fires once → exactly one hunter, SEEKING, targeting P0.
    await waitForHunter(page, (h) => h.count === 1, 'hunter spawned');
    const spawned = await readHunters(page);
    expect(spawned.first?.state).toBe('SEEKING');
    expect(spawned.first?.targetPlayerId).toBe(0);

    // (b) It chases: hold the cursor at a fixed point so avatarPos settles there
    // (the SOLO avatarPos fix), then the capped-speed pure-pursuit homes in +
    // catches → benchedUntilTick set. Deterministic (host sim; no obstacles).
    const hold = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    await page.mouse.move(hold.x, hold.y);
    await page.mouse.move(hold.x + 3, hold.y); // >2px nudge so UPDATE_AVATAR_POS dispatches
    await waitForHunter(page, (h) => h.benched0 !== undefined, 'solo player benched by the hunter', 90_000);

    expect(pageErrors, `uncaught errors during hunter life:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});
