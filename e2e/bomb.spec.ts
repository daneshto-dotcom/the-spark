/**
 * SPARK — S71 P1 pickup-BOMB E2E (GATING lane; single-page SOLO, deterministic).
 *
 * The bomb was the one hazard with NO dedicated e2e — hunter (hunter.spec.ts) and
 * potato (potato.spec.ts) each have one; the bomb shipped (S71) with only unit
 * coverage (bombLifecycle.test.ts). e2e is tsc-blind, so the bomb's LIVE-BROWSER
 * wiring MUST be proven in a real browser: (1) the spawner.tick -> physicsLoop
 * SPAWN_BOMB dispatch that puts a bomb into world.bombs on its cadence, and (2) the
 * controls.onDown -> pickBomb -> TRIGGER_BOMB -> applyTriggerBomb path that detonates
 * it on a real LMB click and severs the picker's OWN bonds. The deterministic sever
 * algorithm + TTL dissipation are thoroughly unit-tested; these specs cover only the
 * e2e-unique wiring.
 *
 * SOLO + host-authoritative => NO real WebRTC => GATING lane (no @quarantine-flaky).
 * Seams (mirror the __TEST_WIN_SCORE__ idiom): __TEST_BOMB_SPAWN_SPARKS__ forces the
 * bomb cadence to a fixed spark count, __TEST_SPAWN_RATE_PER_SECOND__ speeds spawns,
 * __TEST_WIN_SCORE__ high so the game does NOT end first, and (sever test only)
 * __TEST_POTATO_SPAWN_SPARKS__ high so NO potato spawns into the build window — a
 * spawner-zone mouse-down within a hazard's pick-radius would fire that hazard
 * instead of picking the spark (pickBomb/pickPotato take priority in onDown), so the
 * structure is built BEFORE the bomb exists (the build consumes fewer than the 24-spark
 * cadence in every sim-speed regime) and potatoes are suppressed outright. The sim clock
 * is a clamped fixed-step accumulator (main.ts dtSec<=50ms/frame), so under slow CI "N
 * sparks" can take 2-4x its nominal wall time — hence the sever test's per-test timeout
 * bump + generous bomb-arrival wait.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasToCss,
  placeFreeSparkAndConfirm,
  readWorldState,
  waitForWorld,
} from './helpers.ts';

// Spawner disk (src/constants.ts SPAWNER_RADIUS; center = canvas center). Hardcoded
// here because e2e/ is bundled separately from src/ (no import cycle), mirroring the
// CANVAS_WIDTH/HEIGHT + title-button-coord constants already inlined in helpers.ts.
const SPAWNER_RADIUS = 250;

interface BombView {
  count: number;
  firstPos: { x: number; y: number } | null;
  firstRadius: number | null;
}

async function readBombs(page: Page): Promise<BombView> {
  return await page.evaluate(() => {
    const w = (window as {
      __SPARK__?: {
        world: { bombs: Map<number, { pos: { x: number; y: number }; radius: number }> };
      };
    }).__SPARK__!.world;
    const bs = Array.from(w.bombs.values());
    return {
      count: w.bombs.size,
      firstPos: bs.length > 0 ? { x: bs[0].pos.x, y: bs[0].pos.y } : null,
      firstRadius: bs.length > 0 ? bs[0].radius : null,
    };
  });
}

async function waitForBomb(
  page: Page,
  pred: (b: BombView) => boolean,
  desc: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const b = await readBombs(page).catch(() => null);
    if (b !== null && pred(b)) return;
    await page.waitForTimeout(200);
  }
  const f = await readBombs(page).catch(() => null);
  throw new Error(`waitForBomb timeout (${timeoutMs}ms): ${desc}\nFinal: ${JSON.stringify(f)}`);
}

async function startSolo(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const solo = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
}

test.describe('S71 P1 — pickup bomb (solo, gating)', () => {
  test('spawns into world.bombs in the spawn zone on its cadence (host SPAWN_BOMB wiring)', async ({ page }) => {
    // pageerror = uncaught JS exception = a real crash (spawner / renderer wiring).
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_BOMB_SPAWN_SPARKS__ = 3;' }); // bomb after 3 sparks
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' }); // never win first
    await startSolo(page);

    // (1) the spawner cadence + physicsLoop SPAWN_BOMB dispatch mint exactly one bomb.
    await waitForBomb(page, (b) => b.count === 1, 'bomb spawned on its cadence');
    const { firstPos, firstRadius } = await readBombs(page);

    // (2) it has a sane radius + a position INSIDE the spawn disk (sampleBombPos).
    expect(firstRadius, 'bomb has a positive finite radius').toBeGreaterThan(0);
    expect(Number.isFinite(firstPos!.x) && Number.isFinite(firstPos!.y)).toBe(true);
    const dist = Math.hypot(firstPos!.x - CANVAS_WIDTH / 2, firstPos!.y - CANVAS_HEIGHT / 2);
    expect(dist, 'bomb spawned inside the spawner zone').toBeLessThanOrEqual(SPAWNER_RADIUS);

    expect(pageErrors, `uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  test('grabbing it fires TRIGGER_BOMB → instant self-sever (bomb removed + bonds drop)', async ({ page }) => {
    // The sim clock is a clamped fixed-step accumulator (main.ts dtSec<=50ms/frame), so
    // under slow software-WebGL CI the SIM falls behind wall-clock — "N sparks" can take
    // 2-4x its nominal wall time. Give this build-then-wait test a generous budget (the
    // 60s project default is tuned for the fast 2-peer specs, not a 24-spark wait).
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    // Bomb only AFTER the build; potatoes suppressed entirely so the build window has NO
    // grabbable hazard under the cursor (pickBomb/pickPotato take priority in onDown). The
    // build consumes < cadence sparks in EVERY sim-speed regime (fast sim => ~10 sparks in
    // a ~5s build; slow sim => the sim spawns fewer during a longer build), so the first
    // bomb (24 sparks) reliably appears only once the cluster is built. See file header.
    await page.addInitScript({ content: 'window.__TEST_BOMB_SPAWN_SPARKS__ = 24;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_SPAWN_SPARKS__ = 999;' });
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' });
    await startSolo(page);

    // Build a small same-color cluster OUTSIDE the spawner zone. All three points are
    // pairwise within AUTO_BOND_RADIUS=60, so they auto-bond into a >=2-bond structure
    // (same coords as smoke.spec.ts Sym F). placeFreeSparkAndConfirm waits for an
    // in-zone spark + confirms each placement landed (host-authoritative round-trip).
    await placeFreeSparkAndConfirm(page, 1500, 400);
    await placeFreeSparkAndConfirm(page, 1530, 410);
    await placeFreeSparkAndConfirm(page, 1490, 380);
    await waitForWorld(page, (w) => w.bonds.length >= 2, 'cluster auto-bonded (>=2 bonds)');
    const beforeBonds = (await readWorldState(page)).bonds.length;

    // The bomb arrives only after the build (24 sparks). Generous arrival wait for the
    // sim-clock slowdown; the build is long done (player Idle) so the only click near the
    // orb is the intentional grab below.
    await waitForBomb(page, (b) => b.count === 1, 'bomb spawned after the build', 90_000);

    // Grab it: an LMB-down with the cursor on the (stationary) orb -> pickBomb ->
    // TRIGGER_BOMB. No pointer capture / carry (unlike the potato); the up is a no-op.
    // Bounded retry: a stationary orb has a stable coord so attempt 1 lands; the retry
    // only covers a missed-click / freshly-respawned-bomb edge, keeping the grab non-flaky.
    let cleared = false;
    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
      const b = await readBombs(page);
      if (b.count === 0) { cleared = true; break; }
      const at = await canvasToCss(page, b.firstPos!.x, b.firstPos!.y);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(300);
      const after = await readBombs(page).catch(() => null);
      cleared = after !== null && after.count === 0;
    }
    expect(cleared, 'bomb removed by the TRIGGER_BOMB grab').toBe(true);

    // applyTriggerBomb severs ~25% of the picker's OWN bonds (leaf-first, blast-capped)
    // through the locked SEVER_BOND path. Solo => host applies same-tick; poll for it.
    await waitForWorld(
      page,
      (w) => w.bonds.length < beforeBonds,
      `bonds severed by the bomb (was ${beforeBonds})`,
      10_000,
    );

    expect(pageErrors, `uncaught errors during bomb life:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});
