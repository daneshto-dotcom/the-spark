/**
 * SPARK — S152 P2 — THE FEED GESTURE, PROVEN BY REAL CLICKS ONLY.
 *
 * ## ⛔ WHY A UNIT TEST COULD NOT HAVE CLOSED THIS
 *
 * S151 P3 shipped `applyFeedTower` with 13 passing tests and NOTHING DISPATCHING IT. All 13 called
 * the reducer directly, so all 13 were green while the goblin tower's whole mechanic was unreachable
 * in play — this project's recorded trap verbatim: *"green tests prove code RUNS, not that a player
 * can REACH it."*
 *
 * And it was worse than a missing button. S152 P2 found that the tower **never ignited**:
 * `runSpawnerIgnition` names its recipes by hand and only ever named pentagram and lightningHub,
 * while `goblinTowerRecipe` was registered into a registry whose spawner matcher has ZERO production
 * callers. So `applyFeedTower`'s Gate 1 was looking up a spawner that could not exist, and the S151
 * handoff's "it builds, it IGNITES, it tears down" was two-of-three.
 *
 * So every hop below is a real click: tier chip → tower card → world click → the host sweep ignites
 * it → click the tower → the popover's FEED row → a goblin walks out and the bank is debited.
 */

import { expect, test } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers.ts';

/** Mirrored from `constants.ts SparkType`. Square feeds the SHIELD goblin (owner R70). */
const SQUARE = 3;
/** A legal drop site inside seat 0's own ground under PITCH_2P — the coordinates bomb.spec uses. */
const SITE = { x: 420, y: 400 };

async function bootSolo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
  const solo = await titleButtonCss(page, 'solo');
  await page.mouse.click(solo.x, solo.y);
  await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
}

async function clickCanvas(page: import('@playwright/test').Page, cx: number, cy: number): Promise<void> {
  const p = await canvasToCss(page, cx, cy);
  await page.mouse.click(p.x, p.y);
}

/** Fill the bank so the tower's bill AND several spare Squares are affordable. */
async function seedBank(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      castleBanks: Map<number, number[]>;
      localPlayerId: number;
    };
    w.castleBanks.set(w.localPlayerId, [8, 8, 8, 8, 8, 8]);
  });
  await page.waitForTimeout(250);
}

async function bandPoints(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const sp = (window as { __SPARK__?: { footerBand?: { getUiPoints?: () => unknown } } }).__SPARK__;
    if (sp?.footerBand?.getUiPoints === undefined) throw new Error('footerBand.getUiPoints unavailable');
    return sp.footerBand.getUiPoints() as {
      chips: Array<{ complexity: number; x: number; y: number; w: number; h: number }>;
      cards: Array<{ id: string; enabled: boolean; x: number; y: number; w: number; h: number }>;
    };
  });
}

async function panelPoints(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const sp = (window as { __SPARK__?: { structurePanel?: { getUiPoints?: () => unknown } } }).__SPARK__;
    if (sp?.structurePanel?.getUiPoints === undefined) throw new Error('structurePanel.getUiPoints unavailable');
    return sp.structurePanel.getUiPoints() as {
      selected: number | null;
      title: string;
      buttons: Array<{
        kind: string; sparkType?: number; caption: string; enabled: boolean;
        x: number; y: number; w: number; h: number;
      }>;
    };
  });
}

/** Build the goblin tower for real: tier chip → its card → a world click. */
async function buildGoblinTower(page: import('@playwright/test').Page): Promise<void> {
  const { chips } = await bandPoints(page);
  // ⚠ The tier is DERIVED, not hardcoded: a hardcoded board/UI coordinate in this lane has rotted
  // twice already (helpers.ts:892 and click-to-build.spec.ts:31 both record an instance).
  const complexities = chips.map((c) => c.complexity);
  let card: { id: string; enabled: boolean; x: number; y: number; w: number; h: number } | undefined;
  for (const c of chips) {
    await clickCanvas(page, c.x + c.w / 2, c.y + c.h / 2);
    await page.waitForTimeout(300);
    const found = (await bandPoints(page)).cards.find((k) => k.id === 'goblinTower');
    if (found !== undefined) { card = found; break; }
  }
  if (card === undefined) {
    throw new Error(`goblinTower card not found on any tier; bar has [${complexities.join(', ')}]`);
  }
  expect(card.enabled).toBe(true); // a funded card must light up, or the bill changed
  await clickCanvas(page, card.x + card.w / 2, card.y + card.h / 2);
  await page.waitForTimeout(250);
  await clickCanvas(page, SITE.x, SITE.y);
  await page.waitForTimeout(400);
}

test.describe('S152 P2 — FEED_TOWER through the real popover (owner R70)', () => {
  test('build → ignite → FEED click → a shield goblin walks out and the bank is debited', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await bootSolo(page);
    await seedBank(page);
    await buildGoblinTower(page);

    // ── 1. IT IGNITES. This is the half S151 shipped broken; before the fix this stayed 0 forever.
    const spawner = await page.evaluate(async () => {
      const g = window as unknown as {
        __SPARK__: { world: { creatureSpawners: Map<number, { recipeId: string; anchorPrimitiveId: number }> } };
      };
      for (let i = 0; i < 240; i++) {
        for (const s of g.__SPARK__.world.creatureSpawners.values()) {
          if (s.recipeId === 'goblinTower') return { anchor: s.anchorPrimitiveId };
        }
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return null;
    });
    expect(spawner, 'the goblin tower must register a spawner — runSpawnerIgnition must name it').not.toBeNull();

    // ── 2. THE POPOVER OPENS ON IT. A real click on the tower's own anchor shape.
    const anchorPos = await page.evaluate((anchor) => {
      const g = window as unknown as {
        __SPARK__: { world: { primitives: Map<number, { pos: { x: number; y: number } }> } };
      };
      const p = g.__SPARK__.world.primitives.get(anchor);
      return p === undefined ? null : { x: p.pos.x, y: p.pos.y };
    }, spawner!.anchor);
    expect(anchorPos).not.toBeNull();
    await clickCanvas(page, anchorPos!.x, anchorPos!.y);
    await page.waitForTimeout(300);

    // ── 3. THE FEED ROW IS THERE, all six, each naming the goblin it makes.
    const view = await panelPoints(page);
    const feed = view.buttons.filter((b) => b.kind === 'FEED');
    expect(feed).toHaveLength(6);
    const square = feed.find((b) => b.sparkType === SQUARE);
    expect(square, 'a FEED button for Square must exist').not.toBeUndefined();
    expect(square!.caption).toBe('SHIELD'); // owner R70: Square → shield goblin
    expect(square!.enabled).toBe(true);     // the bank holds Squares

    const before = await page.evaluate(() => {
      const g = window as unknown as {
        __SPARK__: {
          world: {
            creatures: Map<number, { type: string }>;
            castleBanks: Map<number, number[]>;
            localPlayerId: number;
          };
        };
      };
      const w = g.__SPARK__.world;
      return {
        shields: [...w.creatures.values()].filter((c) => c.type === 'goblinShield').length,
        squares: (w.castleBanks.get(w.localPlayerId) ?? [])[3] ?? 0,
      };
    });

    // ── 4. THE GESTURE. A real click on a real FEED button.
    await clickCanvas(page, square!.x + square!.w / 2, square!.y + square!.h / 2);
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const g = window as unknown as {
        __SPARK__: {
          world: {
            creatures: Map<number, { type: string }>;
            castleBanks: Map<number, number[]>;
            localPlayerId: number;
          };
        };
      };
      const w = g.__SPARK__.world;
      return {
        shields: [...w.creatures.values()].filter((c) => c.type === 'goblinShield').length,
        squares: (w.castleBanks.get(w.localPlayerId) ?? [])[3] ?? 0,
      };
    });

    // ⭐ THE RIGHT GOBLIN, not just any goblin: Square must produce goblinShield per GOBLIN_FEED_MAP.
    expect(after.shields).toBe(before.shields + 1);
    // ⭐ AND IT WAS PAID FOR. `applyFeedTower` debits the CASTLE BANK, and a mint without a debit
    // would be the "paid but got nothing" bug class inverted.
    expect(after.squares).toBe(before.squares - 1);

    expect(errors).toEqual([]);
  });

  /*
   * ⭐ S153 P3 (owner R79) — *"i should be able to build goblins during fight stage"*.
   *
   * THIS TEST EXISTS BECAUSE THE UNIT TESTS CANNOT REACH THE BUG IT GUARDS. `structureActionModel`
   * is now happy to build a FEED-only popover in FIGHT, and six unit tests prove it — but the model
   * is only consulted if `controls.pickOwnPrimitive` lets the click through, and that gate is a
   * SEPARATE change in a SEPARATE file. Exactly one session ago this repo shipped a goblin tower
   * whose recipe was registered, gated and covered by 34 green tests and which never ignited,
   * because the one production caller named its recipes by hand. A green model test proves the
   * model; only a real click proves the mechanic.
   */
  test('⭐ R79 — the tower is still feedable in FIGHT, through a real click', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await bootSolo(page);
    await seedBank(page);
    await buildGoblinTower(page);

    // Ignite first (a host poll), THEN cross into FIGHT — the order a real match takes.
    const anchor = await page.evaluate(async () => {
      const g = window as unknown as { __SPARK__: { world: any } };
      for (let i = 0; i < 240; i++) {
        for (const s of g.__SPARK__.world.creatureSpawners.values()) {
          if (s.recipeId === 'goblinTower') return s.anchorPrimitiveId as number;
        }
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return null;
    });
    expect(anchor, 'the goblin tower must ignite before the phase flips').not.toBeNull();

    const pos = await page.evaluate((a) => {
      const g = window as unknown as { __SPARK__: { world: any } };
      // Cross into FIGHT the way hunter.spec does — a direct phase write, which is what the
      // 90-second BUILD timer would otherwise cost this test.
      g.__SPARK__.world.matchPhase = 'FIGHT';
      const p = g.__SPARK__.world.primitives.get(a);
      return p === undefined ? null : { x: p.pos.x as number, y: p.pos.y as number };
    }, anchor);
    expect(pos).not.toBeNull();

    // THE CLICK. Before R79 this was refused by `pickOwnPrimitive`'s canBuildNow gate and no
    // popover opened at all.
    await clickCanvas(page, pos!.x, pos!.y);
    await page.waitForTimeout(300);

    const view = await panelPoints(page);
    const feed = view.buttons.filter((b: { kind: string }) => b.kind === 'FEED');
    expect(feed, 'the FEED row must be reachable in FIGHT').toHaveLength(6);
    // ...and R19 still holds for the other two, in the real UI and not just the model.
    expect(view.buttons.some((b: { kind: string }) => b.kind === 'FIX')).toBe(false);
    expect(view.buttons.some((b: { kind: string }) => b.kind === 'SCRAP')).toBe(false);

    const square = feed.find((b: { sparkType?: number }) => b.sparkType === SQUARE);
    expect(square, 'a FEED button for Square must exist in FIGHT').not.toBeUndefined();
    expect(square!.enabled).toBe(true);

    const before = await page.evaluate(() => {
      const g = window as unknown as { __SPARK__: { world: any } };
      const w = g.__SPARK__.world;
      return {
        shields: [...w.creatures.values()].filter((c: { type: string }) => c.type === 'goblinShield').length,
        squares: (w.castleBanks.get(w.localPlayerId) ?? [])[3] ?? 0,
      };
    });

    await clickCanvas(page, square!.x + square!.w / 2, square!.y + square!.h / 2);
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => {
      const g = window as unknown as { __SPARK__: { world: any } };
      const w = g.__SPARK__.world;
      return {
        shields: [...w.creatures.values()].filter((c: { type: string }) => c.type === 'goblinShield').length,
        squares: (w.castleBanks.get(w.localPlayerId) ?? [])[3] ?? 0,
      };
    });

    expect(after.shields).toBe(before.shields + 1);
    expect(after.squares).toBe(before.squares - 1);
    expect(errors).toEqual([]);
  });
});
