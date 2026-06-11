/**
 * SPARK — S75 P3 rainbow color-shuffle E2E (GATING lane; single-page SOLO, deterministic).
 *
 * e2e is tsc-blind, so the rainbow's main.ts spawn-dispatch + dissipate-poll wiring, the controls
 * click->TRIGGER_RAINBOW gesture, and the pure-vector renderer MUST be proven in a real browser.
 * SOLO + host-authoritative => NO real WebRTC => GATING lane (no @quarantine-flaky). The shuffle's
 * determinism + uniqueness + derangement are thoroughly unit-tested (rainbowLifecycle.test.ts);
 * this spec covers the e2e-unique wiring + the live COMPLETENESS proof (a player's STRUCTURE
 * recolours in lockstep with the player, not just the avatar).
 *
 * Seams: __TEST_RAINBOW_SPAWN_SPARKS__ (fast cadence), bomb/potato cadences pushed huge so only
 * the rainbow occupies the spawn zone (race-free click by construction), __TEST_WIN_SCORE__ high.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasToCss,
  placeFreeSparkAndConfirm,
  waitForWorld,
} from './helpers.ts';

interface RainbowView {
  count: number;
  firstPos: { x: number; y: number } | null;
  p0Color: number | undefined;
  firstPrimPlacer: number | undefined;
}

async function readRainbow(page: Page): Promise<RainbowView> {
  return await page.evaluate(() => {
    const w = (window as {
      __SPARK__?: {
        world: {
          rainbows: Map<number, { pos: { x: number; y: number } }>;
          players: Map<number, { color: number }>;
          primitives: Map<number, { placerColor: number }>;
        };
      };
    }).__SPARK__!.world;
    const rs = Array.from(w.rainbows.values());
    const prims = Array.from(w.primitives.values());
    return {
      count: w.rainbows.size,
      firstPos: rs.length > 0 ? { x: rs[0].pos.x, y: rs[0].pos.y } : null,
      p0Color: w.players.get(0)?.color,
      firstPrimPlacer: prims.length > 0 ? prims[0].placerColor : undefined,
    };
  });
}

async function waitForRainbow(
  page: Page,
  pred: (r: RainbowView) => boolean,
  desc: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await readRainbow(page).catch(() => null);
    if (r !== null && pred(r)) return;
    await page.waitForTimeout(200);
  }
  const f = await readRainbow(page).catch(() => null);
  throw new Error(`waitForRainbow timeout (${timeoutMs}ms): ${desc}\nFinal: ${JSON.stringify(f)}`);
}

async function startSolo(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const solo = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
}

test.describe('S75 P3 — rainbow color-shuffle (solo, gating)', () => {
  test('spawns on its cadence; clicking it shuffles the player AND their structure colour in lockstep', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_RAINBOW_SPAWN_SPARKS__ = 2;' }); // rainbow after 2 sparks
    // Suppress the other two zone hazards so ONLY the rainbow is clickable (race-free by design).
    await page.addInitScript({ content: 'window.__TEST_BOMB_SPAWN_SPARKS__ = 99999;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_SPAWN_SPARKS__ = 99999;' });
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' });
    await startSolo(page);

    // Place a primitive (outside the spawn zone) so we can prove the STRUCTURE recolours, not just
    // the avatar. In solo the placer is P0, so its placerColor == P0's colour.
    await placeFreeSparkAndConfirm(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 360);
    const before = await readRainbow(page);
    expect(before.p0Color, 'P0 has a colour').not.toBeUndefined();
    expect(before.firstPrimPlacer, 'the placed prim is owned by P0 (same colour)').toBe(before.p0Color);

    // Rainbow spawns on its (fast) cadence.
    await waitForRainbow(page, (r) => r.count === 1, 'rainbow spawned');
    const at = (await readRainbow(page)).firstPos!;
    const css = await canvasToCss(page, at.x, at.y);
    await page.mouse.move(css.x, css.y);
    await page.mouse.click(css.x, css.y); // TRIGGER_RAINBOW (instant, host-authoritative)

    // Host shuffles → P0's colour changes AND the structure recolours in lockstep (placerColor
    // still tracks P0's NEW colour → territory / bond-segregation stay coherent), rainbow consumed.
    await waitForRainbow(
      page,
      (r) => r.count === 0 && r.p0Color !== before.p0Color && r.firstPrimPlacer === r.p0Color,
      'colour shuffled: player + structure recoloured in lockstep, rainbow consumed',
    );

    // S84 P2 — the switch opens the flyover celebration window (synced rainbowSwitchTick →
    // renderer active) and it self-closes after RAINBOW_FLYOVER_DURATION_TICKS (240 = 4s).
    await expect
      .poll(
        () => page.evaluate(() => {
          const g = globalThis as { __SPARK__?: { rainbowFlyoverActive?: boolean } };
          return g.__SPARK__?.rainbowFlyoverActive ?? false;
        }),
        { message: 'flyover window opened (switchTick stamped + renderer active)', timeout: 3_000 },
      )
      .toBe(true);
    // SIM-time based close assertion: wall-clock polls raced CI software-WebGL (the
    // flyover's own full-screen fills slow frames so much that the clamped fixed-step
    // accumulator may need >30s wall to elapse 240 sim ticks — 971c81a CI failure).
    // Instead: wait until the SIM has provably passed the window, then require the
    // renderer inactive in the same sample (atomic — no tick/flag race).
    await expect
      .poll(
        () => page.evaluate(() => {
          const g = globalThis as {
            __SPARK__?: {
              rainbowFlyoverActive?: boolean;
              world?: { tick: number; rainbowSwitchTick?: number };
            };
          };
          const w = g.__SPARK__?.world;
          const switchTick = w?.rainbowSwitchTick;
          if (w === undefined || switchTick === undefined) return 'no-switch-stamped';
          const windowPassed = w.tick - switchTick >= 240 + 10; // duration + margin
          const active = g.__SPARK__?.rainbowFlyoverActive ?? false;
          if (!windowPassed) return 'window-still-elapsing';
          return active ? 'STUCK-ACTIVE-PAST-WINDOW' : 'closed';
        }),
        { message: 'flyover self-closed once the sim window elapsed', timeout: 90_000 },
      )
      .toBe('closed');

    expect(pageErrors, `uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});
