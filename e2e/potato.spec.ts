/**
 * SPARK — S72 P3 potato-bomb E2E (GATING lane; single-page SOLO, deterministic).
 *
 * e2e is tsc-blind, so the potato's main.ts spawn-dispatch + fuse-poll wiring, the
 * controls pickup/place gestures, and the pure-vector renderer MUST be proven in a real
 * browser. SOLO + host-authoritative => NO real WebRTC => GATING lane (no @quarantine-flaky).
 * The AoE deletion + determinism are thoroughly unit-tested (potatoLifecycle.test.ts);
 * these specs cover the e2e-unique wiring. Seams: __TEST_POTATO_SPAWN_SPARKS__ (fast
 * cadence), __TEST_POTATO_FUSE_TICKS__ (short fuse for the auto-detonate test),
 * __TEST_WIN_SCORE__ high (the game doesn't end first).
 */
import { test, expect, type Page } from '@playwright/test';
import { CANVAS_HEIGHT, CANVAS_WIDTH, canvasToCss, waitForWorld } from './helpers.ts';

interface PotatoView {
  count: number;
  firstState: string | null;
  firstPos: { x: number; y: number } | null;
  carried0: number | undefined;
  benched0: number | undefined;
}

async function readPotatoes(page: Page): Promise<PotatoView> {
  return await page.evaluate(() => {
    const w = (window as {
      __SPARK__?: {
        world: {
          potatoes: Map<number, { state: string; pos: { x: number; y: number } }>;
          players: Map<number, { carriedPotatoId?: number; benchedUntilTick?: number }>;
        };
      };
    }).__SPARK__!.world;
    const ps = Array.from(w.potatoes.values());
    return {
      count: w.potatoes.size,
      firstState: ps.length > 0 ? ps[0].state : null,
      firstPos: ps.length > 0 ? { x: ps[0].pos.x, y: ps[0].pos.y } : null,
      carried0: w.players.get(0)?.carriedPotatoId,
      benched0: w.players.get(0)?.benchedUntilTick,
    };
  });
}

async function waitForPotato(
  page: Page,
  pred: (p: PotatoView) => boolean,
  desc: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const p = await readPotatoes(page).catch(() => null);
    if (p !== null && pred(p)) return;
    await page.waitForTimeout(200);
  }
  const f = await readPotatoes(page).catch(() => null);
  throw new Error(`waitForPotato timeout (${timeoutMs}ms): ${desc}\nFinal: ${JSON.stringify(f)}`);
}

async function startSolo(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const solo = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
}

test.describe('S72 P3 — potato bomb (solo, gating)', () => {
  test('spawns on its cadence then a FREE potato AUTO-DISSIPATES harmlessly on the from-SPAWN fuse (S78 — no random blast; host poll wiring)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_SPAWN_SPARKS__ = 2;' }); // potato after 2 sparks
    await page.addInitScript({ content: 'window.__TEST_POTATO_FUSE_TICKS__ = 90;' }); // ~1.5s fuse
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' });
    await startSolo(page);

    await waitForPotato(page, (p) => p.count === 1, 'potato spawned');
    // S78 — a FREE potato is never picked up, so the host poll DISSIPATES it harmlessly (no blast)
    // ~1.5s after spawn (was POTATO_DETONATE pre-S78). Either way the potato leaves the Map (count 0).
    await waitForPotato(page, (p) => p.count === 0, 'free potato auto-dissipated on its fuse', 10_000);

    expect(pageErrors, `uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  test('can be grabbed (PICKUP_POTATO → CARRIED) and placed (PLACE_POTATO → ARMED)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_SPAWN_SPARKS__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' });
    // default 23s fuse — plenty of time to grab + place without racing the detonation.
    await startSolo(page);

    await waitForPotato(page, (p) => p.firstState === 'FREE', 'FREE potato spawned');
    const { firstPos } = await readPotatoes(page);
    const at = await canvasToCss(page, firstPos!.x, firstPos!.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ button: 'left' }); // PICKUP_POTATO (FREE potato under cursor)
    await waitForPotato(page, (p) => p.carried0 !== undefined && p.firstState === 'CARRIED', 'potato grabbed (CARRIED)');

    // Carry it out + release to plant it.
    const drop = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 340);
    await page.mouse.move(drop.x, drop.y);
    await page.mouse.up({ button: 'left' }); // PLACE_POTATO → ARMED
    await waitForPotato(page, (p) => p.firstState === 'ARMED' && p.carried0 === undefined, 'potato placed (ARMED)');

    expect(pageErrors, `uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  test('S75: a placed (ARMED) potato is RE-GRABBABLE — true hot-potato', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_SPAWN_SPARKS__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' });
    // default 23s fuse — no detonation race for grab → place → re-grab.
    await startSolo(page);

    await waitForPotato(page, (p) => p.firstState === 'FREE', 'FREE potato spawned');
    const spawn = (await readPotatoes(page)).firstPos!;
    let at = await canvasToCss(page, spawn.x, spawn.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ button: 'left' }); // grab the FREE potato
    await waitForPotato(page, (p) => p.firstState === 'CARRIED', 'grabbed (CARRIED)');
    // Carry it out + plant it ARMED.
    const plant = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 340);
    await page.mouse.move(plant.x, plant.y);
    await page.mouse.up({ button: 'left' }); // PLACE → ARMED
    await waitForPotato(page, (p) => p.firstState === 'ARMED' && p.carried0 === undefined, 'placed (ARMED)');

    // S75 — RE-GRAB the ARMED potato (rejected pre-S75; pickPotato now accepts ARMED).
    const armed = (await readPotatoes(page)).firstPos!;
    at = await canvasToCss(page, armed.x, armed.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ button: 'left' }); // RE-PICKUP an ARMED potato
    await waitForPotato(
      page,
      (p) => p.firstState === 'CARRIED' && p.carried0 !== undefined,
      're-grabbed the placed potato (CARRIED)',
    );
    await page.mouse.up({ button: 'left' }); // tidy: re-plant so the gesture closes

    expect(pageErrors, `uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  test('S75: holding the potato to detonation benches the carrier', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.addInitScript({ content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_SPAWN_SPARKS__ = 2;' });
    await page.addInitScript({ content: 'window.__TEST_POTATO_FUSE_TICKS__ = 180;' }); // ~3s — grab first, then it cooks off in-hand
    await page.addInitScript({ content: 'window.__TEST_WIN_SCORE__ = 999;' });
    await startSolo(page);

    await waitForPotato(page, (p) => p.firstState === 'FREE', 'FREE potato spawned');
    const spawn = (await readPotatoes(page)).firstPos!;
    const at = await canvasToCss(page, spawn.x, spawn.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ button: 'left' }); // grab + HOLD (never place)
    await waitForPotato(page, (p) => p.firstState === 'CARRIED', 'grabbed + holding (CARRIED)');

    // Hold through the fuse → detonates in-hand → carrier benched. The fuse is tick-based,
    // so CI sim-clock slowdown only lengthens the wall-time (the grab always wins the race).
    await waitForPotato(
      page,
      (p) => p.count === 0 && p.benched0 !== undefined,
      'carrier benched on in-hand detonation',
      30_000,
    );
    await page.mouse.up({ button: 'left' });

    expect(pageErrors, `uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  });
});
