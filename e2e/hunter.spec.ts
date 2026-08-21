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
  titleButtonCss,
  holdInBuildPhase,
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
    // ⭐ S137 P0b — THE TRIGGER SEAM MUST SIT ABOVE THE OPENING BALANCE, and this is the whole
    // reason this spec broke. It used to be 1.
    //
    // V6-1.2 gave every seat an OPENING BALANCE of STARTING_VICTORY_POINTS = 100
    // (constants.ts:356 → gameMode.ts:271), and `scoreProgress` is `max(scoreByPlayer)`
    // (scoring.ts:264). So from the very first tick `scoreProgress` is already 100, and
    // hostTick.ts:498 (`floor(scoreProgress) >= HUNTER_TRIGGER_SCORE`) fired against a seam of 1
    // INSTANTLY — the hunter spawned at tick ~1 instead of when this spec injects the score below,
    // roughly 90 s early. Measured: by tick 330 it had already caught the player
    // (benchedUntilTick 1925) and despawned, so `hunters` was EMPTY before the spec ever looked.
    //
    // That broke the spec twice over: (a) a benched player is fully input-locked
    // (controls.ts:345), so the V6-1.3 castle-pull the placement now needs could not click the
    // keep — surfacing as the misleading "castle panel did not open"; and (b) the wait for
    // `count === 1` below could never pass on an already-despawned hunter.
    //
    // It went unnoticed because the pre-V6-1.3 placement was instant — it finished before the
    // t=0 hunter could reach anyone. The slower pull-from-bank loop exposed it.
    //
    // The seam is therefore set ABOVE 100 so the spawn is once again CAUSED by this spec's own
    // injection, which is what "spawns once at the 75% trigger" is supposed to be testing.
    // Production is unaffected either way: there the seam is
    // floor(PHASE_1_WIN_SCORE * 0.75) = floor(1500 * 0.75) = 1125, comfortably above 100.
    await page.addInitScript({ content: 'window.__TEST_HUNTER_TRIGGER_SCORE__ = 200;' });

    await page.goto('/?debug=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');

    // Solo button — helpers: btnSolo at (CANVAS_W/2, CANVAS_H/2 + 40).
    const solo = await titleButtonCss(page, 'solo'); // S85 P4c — live title geometry
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
    // ⭐ S150 P5 — HOLD THE MATCH IN BUILD. Measured root cause of the bomb/rainbow intermittence:
    // once the sim crosses PHASE_DURATION_TICKS (5400 = 90 s) into FIGHT, canBuildNow refuses every
    // placement SILENTLY, so a slow run's build can never land and no retry budget can save it.
    // This spec is about hazards, not the match clock, so the edge is held off.
    await holdInBuildPhase(page);

    // Place one primitive outside the spawner zone (exercises the place wiring + gives P0 complexity).
    // ⭐ S149 P1 — x moved from CANVAS_WIDTH/2 to CANVAS_WIDTH/4. Dead centre is ON the pitch split,
    // and the border convention gives a point exactly on a split line to the HIGHER-indexed zone —
    // so x=960 is seat 1's ground, and solo P0 (seat 0, LEFT half) was refused. Nothing here cares
    // where the prim sits, only that it exists and is outside the quarry.
    await placeFreeSparkAndConfirm(page, CANVAS_WIDTH / 4, CANVAS_HEIGHT / 2 - 360);

    // S78 — the income rate was cut 3x (0.15->0.05) for game-length tuning, which tripled the SIM-time
    // for natural accrual to cross the trigger (complexity-1 → score 1 is now ~20s sim, far worse under
    // the CI sim-clock slowdown) and blew the 15s spawn-wait. This test covers the trigger WIRING, not
    // the income RATE (the income→threshold mechanic is unit-tested in scoring.test.ts), so inject the
    // host score over the trigger directly — mirrors the S76 win-pipeline e2e __SPARK__ score-injection
    // — making the spawn robust to ANY future income/win-score tuning.
    await page.evaluate(() => {
      const w = (window as unknown as { __SPARK__: { world: { scoreByPlayer: Map<number, number> } } })
        .__SPARK__.world;
      // S137 P0b — 250 > the 200 seam (and > the 100 opening balance that silently made the old
      // value of 5 a no-op), and still << __TEST_WIN_SCORE__ (999) so the match cannot end first.
      w.scoreByPlayer.set(0, 250);
      // ⭐ S147 P1 — AND THE MATCH MUST BE IN **FIGHT** FOR THIS INJECTION TO BE OBSERVED.
      //
      // This spec writes `scoreByPlayer` DIRECTLY (deliberately — see the comment above: it covers
      // the trigger WIRING, not the income rate), then relies on `tickScoring` to re-derive
      // `scoreProgress = max(scoreByPlayer)` — and `scoreProgress` is the value the hunter trigger
      // actually reads. S147 gated `tickScoring` to FIGHT (R3: no points during BUILD) and a fresh
      // match opens in BUILD, so in BUILD that re-derivation never runs, `scoreProgress` stays at the
      // opening balance, and no hunter ever spawns.
      //
      // ⚠ That is correct sim behaviour, NOT a production bug — worth stating so nobody "fixes" the
      // sim from this line. Production never depends on the re-derivation here: `addScore` and
      // `spendScore` each recompute `scoreProgress` at their own call sites. Only a DIRECT map write
      // leans on `tickScoring` to notice, and that is a test-harness shortcut.
      //
      // Setting FIGHT is also the faithful framing: the hunter is triggered by SCORE, score exists
      // only in FIGHT, so FIGHT is the only phase in which this scenario is meaningful at all.
      (w as unknown as { matchPhase: string }).matchPhase = 'FIGHT';
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
