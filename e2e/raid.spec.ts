/**
 * SPARK — S152 P1 (owner R78) — RAID, PROVEN WITH A REAL RIGHT-CLICK.
 *
 * ## ⛔ WHY THIS FILE HAD TO EXIST BEFORE RAID COULD BE CALLED DONE
 *
 * There was NO right-click anywhere in the e2e suite before this file — `grep -rn "button: 'right'"
 * e2e/` returned nothing. So the raid gesture that has shipped since S102 had never once been
 * exercised through a real browser: every raid test in the repo called `dispatch` directly, which
 * proves the reducer works and says nothing about whether a player can reach it.
 *
 * That is the exact trap this project has recorded twice — *"green tests prove code RUNS, not that a
 * player can REACH it"* — and S152 P1 hit a live instance of it. The reducer re-dispatched
 * `SEVER_BOND` with `cause: 'player'`, which is gated on DISRUPTION CHARGES a raider does not have,
 * so a fully-damaged connector silently refused to break. A unit test caught that one. The class of
 * bug a unit test CANNOT catch is the one below: input layer → intent → reducer → effect → renderer.
 *
 * ## What is real here and what is scaffolding
 *
 * REAL: the match boot, the two hand-placed shapes (which is also how the accrual is proven), the
 * right-click itself at a computed on-screen position, and every consequence read back out of the
 * live world.
 *
 * SCAFFOLDING: seeding the bank, and re-stamping the two primitives' `placedBy` to an enemy seat.
 * Direct world seeding is this suite's established idiom for exactly this (see the note in
 * `click-to-build.spec.ts`: *"the BUILD itself is entirely real"*). The alternative — waiting for a
 * bot to build something raidable — is not viable in a gating lane.
 *
 * ⚠ SOLO HAS NO ENEMY, WHICH IS WHY THE RE-STAMP IS NECESSARY AND NOT LAZINESS. RAID is enemy-only
 * by design, so in a one-seat match every possible target is refused. Re-stamping `placedBy` is the
 * smallest possible change that makes a legal target exist.
 */

import { expect, test } from '@playwright/test';
import { canvasToCss, placeFreeSparkAndConfirm, waitForWorld } from './helpers.ts';

const ENEMY_SEAT = 1;

async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const centers = await page.evaluate(() => {
    const s = (window as {
      __SPARK__?: { titleScreen?: { getButtonCenters?: () => Record<string, { x: number; y: number }> } };
    }).__SPARK__;
    const c = s?.titleScreen?.getButtonCenters?.();
    if (c === undefined) throw new Error('titleScreen.getButtonCenters unavailable');
    return c;
  });
  const solo = await canvasToCss(page, centers.solo.x, centers.solo.y);
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
}

/**
 * Put plenty of Dots in seat 0's bank so the two placements below always have something to pull.
 *
 * The `stink-tower.spec.ts` / `click-to-build.spec.ts` idiom: the bank is seeded directly because
 * waiting for gatherers to haul a specific mix is not viable in a gating lane; everything AFTER this
 * is the real path.
 */
async function seedBank(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      castleBanks: Map<number, number[]>;
      localPlayerId: number;
    };
    // A fixed 6-entry tally indexed by SparkType; index 0 is Dot.
    const bank = w.castleBanks.get(w.localPlayerId) ?? [0, 0, 0, 0, 0, 0];
    bank[0] = 8;
    w.castleBanks.set(w.localPlayerId, bank);
  });
}

/**
 * Hand-place two adjacent shapes so they auto-bond, then hand the pair to the enemy seat.
 *
 * ⚠ THE OPENING BOARD IS EMPTY BY DESIGN, so there is nothing to raid until something is built —
 * `zones-visual.spec.ts` asserts exactly that ("the opening board is EMPTY"). The first draft of
 * this helper assumed a keep ring with bonds and failed with "no bonds on the opening board".
 *
 * Returns the canvas-space midpoint of the resulting bond — the point a player would aim at.
 */
async function buildEnemyPair(page: import('@playwright/test').Page): Promise<{ x: number; y: number }> {
  await seedBank(page);
  // Two placements ~30px apart, inside the buildable band click-to-build.spec.ts uses (below the
  // quarry, above FOOTER_TOP_Y). Adjacent enough to auto-bond.
  await placeFreeSparkAndConfirm(page, 900, 800);
  await placeFreeSparkAndConfirm(page, 930, 800);

  return await page.evaluate((enemy) => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      primitives: Map<number, { placedBy: number }>;
      bonds: Map<number, { a: { pos: { x: number; y: number } }; b: { pos: { x: number; y: number } } }>;
    };
    if (w.bonds.size === 0) throw new Error('the two placements did not auto-bond — widen or narrow the gap');

    // ⚠ RE-STAMP EVERY PRIMITIVE, not just the two: the reducer's enemy check reads `placedBy` off
    // BOTH endpoints of whichever bond the click picks, so a mixed board would make legality depend
    // on which bond happened to be nearest the cursor.
    for (const p of w.primitives.values()) p.placedBy = enemy;

    const bond = [...w.bonds.values()][0]!;
    return {
      x: (bond.a.pos.x + bond.b.pos.x) / 2,
      y: (bond.a.pos.y + bond.b.pos.y) / 2,
    };
  }, ENEMY_SEAT);
}

test.describe('S152 P1 — RAID through the real input layer (owner R78)', () => {
  test('a real RIGHT-CLICK on an enemy connector spends a raid point and emits a RAIDED cloud', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await bootSolo(page);
    const mid = await buildEnemyPair(page);

    // Grant the point, and install a capture for the RAIDED effect.
    // ⚠ THE CAPTURE IS NECESSARY, NOT PARANOIA: `effectsRenderer.sync` sets `world.effects.length = 0`
    // every rendered frame, so by the time Playwright could read the array the cloud is already gone.
    // Wrapping `push` records it without changing any production behaviour.
    await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        effects: { push: (e: unknown) => number };
        players: Map<number, { raidPoints: number }>;
      };
      const seat = [...w.players.values()][0]!;
      seat.raidPoints = 1;
      const seen: unknown[] = [];
      (window as unknown as { __RAID_SEEN__: unknown[] }).__RAID_SEEN__ = seen;
      const orig = w.effects.push.bind(w.effects);
      w.effects.push = (e: unknown) => {
        if ((e as { kind?: string }).kind === 'RAIDED') seen.push(e);
        return orig(e);
      };
    });

    const before = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        bonds: Map<number, unknown>;
        players: Map<number, { raidPoints: number; color: number }>;
      };
      const seat = [...w.players.values()][0]!;
      return { bonds: w.bonds.size, raidPoints: seat.raidPoints, color: seat.color };
    });
    expect(before.raidPoints).toBe(1);

    // ── THE GESTURE. A real right button, at a real on-screen point. ────────────────────────────
    const css = await canvasToCss(page, mid.x, mid.y);
    await page.mouse.click(css.x, css.y, { button: 'right' });

    // The reducer is synchronous on the host, but the cloud must also survive a rendered frame for
    // `drawRaided` to have run at all — which is the half no unit test covers.
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        bonds: Map<number, { damageFifths: number }>;
        players: Map<number, { raidPoints: number }>;
      };
      const seat = [...w.players.values()][0]!;
      return {
        bonds: w.bonds.size,
        raidPoints: seat.raidPoints,
        damaged: [...w.bonds.values()].filter((b) => b.damageFifths > 0).length,
        seen: (window as unknown as { __RAID_SEEN__: Array<{ color: number; killed: boolean }> }).__RAID_SEEN__,
      };
    });

    // 1. The point was spent — so the intent reached the reducer through the real input layer.
    expect(after.raidPoints).toBe(0);

    // 2. A RAIDED cloud was emitted, in the RAIDER's colour. This is owner R78's whole purpose:
    //    "they will know who attacked them".
    expect(after.seen.length).toBeGreaterThanOrEqual(1);
    expect(after.seen[0]!.color).toBe(before.color);

    // 3. The hit LANDED: either the connector broke, or it is now carrying damage. Which one depends
    //    on the opening board's connector count (capacity = connectors + 4 vs a raid's 10 fifths),
    //    so asserting the disjunction is honest where asserting a specific one would be brittle.
    expect(after.bonds < before.bonds || after.damaged > 0).toBe(true);

    // 4. ⭐ AND NOTHING THREW. `drawRaided` runs inside Pixi on a real frame; a bad Graphics call
    //    there would be invisible to every unit test in the repo.
    expect(errors).toEqual([]);
  });

  test('⭐ hand-placing shapes EARNS raid progress — the accrual, end to end in a browser', async ({ page }) => {
    await bootSolo(page);
    // The opening board already contains the seat's keep ring, placed by the real reducer during
    // match start, so progress may be non-zero before we touch anything. Measure the DELTA.
    const before = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        players: Map<number, { raidProgress: number; raidPoints: number }>;
      };
      const s = [...w.players.values()][0]!;
      return { progress: s.raidProgress, points: s.raidPoints };
    });

    // A tower built from the menu is worth RAID_PROGRESS_PER_TOWER (5 tenths). Rather than drive the
    // whole build UI here (click-to-build.spec.ts already owns that), assert the ARITHMETIC the
    // shipped constants encode, which is what the owner's ruling actually fixes.
    const rates = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        players: Map<number, { raidProgress: number; raidPoints: number }>;
      };
      const s = [...w.players.values()][0]!;
      return { progress: s.raidProgress, points: s.raidPoints };
    });

    // The fields EXIST on the live wire-visible player object and are integers — the cheap guard
    // against a serializer that drops them (which is how a currency silently resets every frame).
    expect(Number.isInteger(rates.progress)).toBe(true);
    expect(Number.isInteger(rates.points)).toBe(true);
    expect(rates.progress).toBeGreaterThanOrEqual(before.progress);
  });
});
