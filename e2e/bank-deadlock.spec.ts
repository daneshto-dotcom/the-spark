/**
 * SPARK — S145: THE FULL-BANK DEADLOCK, end to end in a real browser.
 *
 * ⚠ THIS IS THE ASSERTION S144 DID NOT HAVE, AND ITS ABSENCE IS WHY A DEAD FEATURE SHIPPED.
 *
 * `click-to-build.spec.ts` proves the build path works — but it SEEDS the bank first, and its own
 * comment says why: *"waiting for gatherers to haul a MATCHING set is not viable in a gating lane
 * (they fetch whatever they find, and a full bank of the wrong mix satisfies nothing)."* That
 * sentence describes the bug, and the workaround made the suite blind to it. Every unit and e2e test
 * passed while the shipped game was unplayable:
 *
 *   Measured, two independent 4-minute solo runs, no seeding — the bank fills to cap in ~46 s, the
 *   composition then FREEZES for 11,449 further ticks, every tile reads "NEED n MORE" forever, and
 *   ZERO towers are ever built. Ordering the missing type through the real UI changed nothing,
 *   because a gatherer parked in WAITING never re-picks a target.
 *
 * So the property under test here is the one no other spec states: **a player who wants a tower can
 * get one.** The bank is seeded FULL OF JUNK rather than seeded correct — that reproduces the
 * terminal state in one call instead of 46 s, and everything after it is the real shipped loop:
 * a real click on a real short tile, real orders, real gatherers, a real build.
 *
 * Gating lane, because this is now the only test that can fail when the game becomes unwinnable.
 */

import { expect, test } from '@playwright/test';
import { canvasToCss, waitForWorld, waitForWorldWithinTicks } from './helpers.ts';

/** Mirrored from `constants.ts SparkType`. stinkTower's bill is 1 Square + 3 Circles. */
const SQUARE = 3;
const CIRCLE = 4;
/** Junk: in NO recipe's bill in the quantities banked here, so every tile starts short. */
const DOT = 0;
/** Clear of the quarry (960,540 r125) and of the seat-0 keep + its panel. */
const LEGAL_SITE = { x: 360, y: 780 };

async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?debug=1');
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
 * Reproduce the measured terminal state in one call: bank at CAP, entirely the wrong shapes.
 *
 * This is the ONLY seeding in the spec, and it seeds the FAILURE, not the fix — everything the test
 * actually asserts happens through the shipped UI afterwards.
 */
async function fillBankWithJunk(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate((junk: number) => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      castleBanks: Map<number, unknown[]>;
      localPlayerId: number;
    };
    const cap = 7;
    const mk = (id: number, type: number): unknown => ({
      id, type,
      pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 },
      radius: 8, createdTick: 0, state: { kind: 'Free' },
    });
    const bank = [];
    for (let i = 0; i < cap; i++) bank.push(mk(9500 + i, junk));
    w.castleBanks.set(w.localPlayerId, bank);
    return bank.length;
  }, DOT);
}

async function panelPoints(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const sp = (window as { __SPARK__?: { castlePanel?: { getUiPoints?: () => unknown } } }).__SPARK__;
    if (sp?.castlePanel?.getUiPoints === undefined) throw new Error('getUiPoints unavailable');
    // Called IN PLACE — detaching the method loses `this`.
    return sp.castlePanel.getUiPoints() as {
      open: boolean;
      bank: { count: number; cap: number };
      structureCenters: Array<{ id: string; x: number; y: number; enabled: boolean; reason: string }>;
      armed: string | null;
    };
  });
}

async function openPanel(page: import('@playwright/test').Page): Promise<void> {
  const keep = await page.evaluate(() => {
    const sp = (window as { __SPARK__?: { keepCenter?: (n: number) => { x: number; y: number } } }).__SPARK__;
    if (sp?.keepCenter === undefined) throw new Error('keepCenter unavailable');
    return sp.keepCenter(0);
  });
  const p = await canvasToCss(page, keep.x, keep.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}

async function clickCanvas(page: import('@playwright/test').Page, cx: number, cy: number): Promise<void> {
  const p = await canvasToCss(page, cx, cy);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(80);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
}

const stinkTile = async (page: import('@playwright/test').Page) =>
  (await panelPoints(page)).structureCenters.find((t) => t.id === 'stinkTower')!;

/**
 * Poll the stink-tower tile until it goes buildable, bounded in SIM TICKS (see
 * `waitForWorldWithinTicks` for why wall-clock is the wrong unit for anything the simulation has to
 * do). Returns the moment it lights; on exhaustion returns the last tile so the assertion can print
 * the live blocker rather than a bare timeout.
 */
async function waitForTile(
  page: import('@playwright/test').Page,
  budgetTicks: number,
  wallCapMs: number,
): Promise<{ id: string; x: number; y: number; enabled: boolean; reason: string }> {
  const t0 = (await page.evaluate(
    () => (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__!.world!.tick,
  )) as number;
  const start = Date.now();
  let last = await stinkTile(page);
  while (Date.now() - start < wallCapMs) {
    last = await stinkTile(page);
    if (last.enabled) return last;
    const tick = (await page.evaluate(
      () => (window as { __SPARK__?: { world?: { tick: number } } }).__SPARK__!.world!.tick,
    )) as number;
    if (tick - t0 >= budgetTicks) break; // the sim had its runway — a real failure, not a slow box
    await page.waitForTimeout(500);
  }
  return last;
}

test.describe('S145 — a full bank of the wrong shapes is not a dead end (solo, gating)', () => {
  test('⭐ clicking a SHORT tile orders its shortfall and makes room for it', async ({ page }) => {
    await bootSolo(page);
    await fillBankWithJunk(page);
    await openPanel(page);

    const before = await panelPoints(page);
    expect(before.open).toBe(true);
    expect(before.bank.count).toBe(before.bank.cap); // the terminal state, reproduced
    const stink = before.structureCenters.find((t) => t.id === 'stinkTower')!;
    expect(stink.enabled).toBe(false);
    expect(stink.reason).not.toBe('');

    // THE CLICK THAT USED TO DO NOTHING.
    await clickCanvas(page, stink.x, stink.y);

    const after = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        gathererOrders: Map<number, number[]>;
        castleBanks: Map<number, unknown[]>;
        localPlayerId: number;
      };
      const seat = w.localPlayerId;
      return {
        orders: [...(w.gathererOrders.get(seat) ?? [])],
        bank: (w.castleBanks.get(seat) ?? []).length,
      };
    });
    // It ordered exactly what the bill was short of — 1 Square + 3 Circles, none of it junk.
    expect(after.orders).toContain(SQUARE);
    expect(after.orders.filter((t) => t === CIRCLE)).toHaveLength(3);
    expect(after.orders).not.toContain(DOT);
    // ⭐ And it made room, or the order could never be delivered — that IS the deadlock.
    expect(after.bank).toBeLessThan(before.bank.cap);
    // Nothing was destroyed: the decanted shape is on the porch and still spendable.
    const porch = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        freeSparks: Map<number, { escrow?: string }>;
      };
      return [...w.freeSparks.values()].filter((s) => s.escrow === 'banked').length;
    });
    expect(porch).toBeGreaterThan(0);
  });

  test('⭐ THE WHOLE POINT: the tower actually gets built, with no seeding of the fix', async ({ page }) => {
    // A full haul cycle is keep(r420) → quarry(r125) → keep, ~295 px each way at GATHERER_BASE_SPEED,
    // and the bill needs FOUR of them from solo's single gatherer. Sim ticks are FRAME-bound, so a
    // 2-core SwiftShader runner advances far fewer per second than a dev box — hence a generous
    // budget here. It returns the moment the tile lights, so a fast machine pays nothing for it.
    test.setTimeout(300_000);

    await bootSolo(page);
    await fillBankWithJunk(page);
    await openPanel(page);

    // ONE click is the whole ask: it orders the shortfall AND decants enough bank slots to receive
    // it. Anything beyond this point is the shipped economy doing its job unattended.
    const t0 = await stinkTile(page);
    expect(t0.enabled).toBe(false);
    await clickCanvas(page, t0.x, t0.y);

    // Then simply WAIT for the haulers. No further clicks — if the tile only lights because the test
    // keeps poking it, the deadlock is not actually fixed. Returns the instant it lights.
    const armed = await waitForTile(page, 9_000, 240_000);
    expect(
      armed.enabled,
      `stinkTower never became buildable — reason "${armed.reason}". The full-bank deadlock is back.`,
    ).toBe(true);

    // And it really builds: arm, place, and confirm a defender that SURVIVES revalidation.
    await clickCanvas(page, armed.x, armed.y);
    expect((await panelPoints(page)).armed).toBe('stinkTower');
    await clickCanvas(page, LEGAL_SITE.x, LEGAL_SITE.y);
    await page.waitForTimeout(900);

    const built = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        defenders: Map<number, { recipeId: string }>;
      };
      return [...w.defenders.values()].map((d) => d.recipeId);
    });
    expect(built).toContain('stinkTower');

    // A defender is re-validated against its recipe every 30 ticks; a stamp that does not satisfy
    // its own predicate is removed within 0.5 s. 3 s covers ~6 polls.
    await page.waitForTimeout(3_000);
    const later = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        defenders: Map<number, { recipeId: string }>;
      };
      return [...w.defenders.values()].map((d) => d.recipeId);
    });
    expect(later).toContain('stinkTower');
  });
});
