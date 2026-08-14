/**
 * SPARK — S144 P3: CLICK-TO-BUILD, end to end in a real browser.
 *
 * Owner ruling that created this feature (playtest 2026-08-13):
 *   *"you have a place to click on the tower (you dont even need to build it physically) and it builds
 *    it for you. then the spark (your cruiser) just drags it to where you want it to be!"*
 *
 * The unit suites prove the reducer stamps geometry that ignites and survives. What they CANNOT prove
 * is that the three layers meet: panel tile -> armed ghost -> world click -> dispatch -> host stamp ->
 * snapshot -> a tower the renderer draws. Every one of those hops is a place this feature can die
 * silently, and two of them died in exactly that way during development:
 *   • no `BOND_FORMED` emitted ⇒ perfect geometry, no ignition, no error anywhere;
 *   • the click that places also grabbing a spark ⇒ a tower plus a phantom drag.
 *
 * Gating lane (no @quarantine-flaky/@soak/@perf-measure tag), because this is now the primary way a
 * player builds anything and nothing else in CI reports it.
 */

import { expect, test } from '@playwright/test';
import { canvasToCss, waitForWorld } from './helpers.ts';

/** Mirrored from `constants.ts SparkType` — the stink tower's bill is 1 Square + 3 Circles. */
const SQUARE = 3;
const CIRCLE = 4;
/** Clear of the quarry (960,540 r125), inside the arena, away from the seat-0 keep + its panel. */
const LEGAL_SITE = { x: 360, y: 780 };

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
 * Put exactly one stink-tower bill in seat 0's bank.
 *
 * Direct world seeding, the same idiom `stink-tower.spec.ts` uses to build its component — waiting for
 * gatherers to haul a MATCHING set is not viable in a gating lane (they fetch whatever they find, and
 * a full bank of the wrong mix satisfies nothing). The BUILD itself is entirely real: a genuine tile
 * click and a genuine BUILD_BLUEPRINT through the shipped dispatch path.
 */
async function seedBank(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(({ sq, ci }) => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      castleBanks: Map<number, unknown[]>;
    };
    const mk = (id: number, type: number): unknown => ({
      id, type,
      pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 },
      radius: 8, createdTick: 0, state: { kind: 'Free' },
    });
    w.castleBanks.set(0, [mk(9001, sq), mk(9002, ci), mk(9003, ci), mk(9004, ci)]);
  }, { sq: SQUARE, ci: CIRCLE });
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

async function counts(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      primitives: Map<number, unknown>; bonds: Map<number, unknown>;
      defenders: Map<number, { recipeId: string }>;
      castleBanks: Map<number, unknown[]>;
    };
    return {
      primitives: w.primitives.size,
      bonds: w.bonds.size,
      defenders: [...w.defenders.values()].map((d) => d.recipeId),
      bank: (w.castleBanks.get(0) ?? []).length,
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
  await page.waitForTimeout(200);
}

async function clickCanvas(page: import('@playwright/test').Page, cx: number, cy: number): Promise<void> {
  const p = await canvasToCss(page, cx, cy);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(80);
  await page.mouse.click(p.x, p.y);
}

test.describe('S144 — click a tower, drag it, place it (solo, gating)', () => {
  test('the build grid lists all six recipes, and a funded one becomes clickable', async ({ page }) => {
    await bootSolo(page);
    await openPanel(page);

    let pts = await panelPoints(page);
    expect(pts.open).toBe(true);
    // Owner: "for now everyone should have all the recipes just to test it all out."
    expect(pts.structureCenters).toHaveLength(6);
    // With an empty bank every tile is dim AND names its blocker — an unexplained dim box is
    // indistinguishable from a broken one, which was the original S136 complaint.
    for (const t of pts.structureCenters) {
      expect(t.enabled).toBe(false);
      expect(t.reason).not.toBe('');
    }

    await seedBank(page);
    await page.waitForTimeout(200);
    pts = await panelPoints(page);
    const stink = pts.structureCenters.find((t) => t.id === 'stinkTower')!;
    expect(stink.enabled).toBe(true);
    expect(stink.reason).toBe('');
  });

  test('clicking a tile arms it; clicking the world builds a REAL tower that survives', async ({ page }) => {
    await bootSolo(page);
    await seedBank(page);
    await openPanel(page);

    const before = await counts(page);
    expect(before.bank).toBe(4);

    // ARM: click the stink-tower tile.
    const stink = (await panelPoints(page)).structureCenters.find((t) => t.id === 'stinkTower')!;
    expect(stink.enabled).toBe(true);
    await clickCanvas(page, stink.x, stink.y);
    expect((await panelPoints(page)).armed).toBe('stinkTower');

    // PLACE: click a legal spot in the world.
    await clickCanvas(page, LEGAL_SITE.x, LEGAL_SITE.y);
    await waitForWorld(page, () => true, 'settle', 1_000).catch(() => {});
    await page.waitForTimeout(800);

    const after = await counts(page);
    // The recipe's REAL geometry landed: 4 primitives, 3 bonds (a 1-Square + 3-Circle star).
    expect(after.primitives - before.primitives).toBe(4);
    expect(after.bonds - before.bonds).toBe(3);
    // ⭐ And it IGNITED. Zero here means the geometry landed but no BOND_FORMED reached the matcher —
    // the silent-death mode this whole feature hinges on.
    expect(after.defenders).toContain('stinkTower');
    // The shapes were actually spent, not duplicated.
    expect(after.bank).toBe(0);
    // One pick = one tower.
    expect((await panelPoints(page)).armed).toBeNull();

    // ⭐ SURVIVAL. A defender is re-validated every 30 ticks against its recipe; a stamp whose geometry
    // does not satisfy its own predicate is removed within 0.5 s. 3 s covers ~6 polls.
    await page.waitForTimeout(3_000);
    const later = await counts(page);
    expect(later.defenders).toContain('stinkTower');
    expect(later.primitives).toBe(after.primitives);
  });

  test('an illegal drop keeps the tower in hand and builds nothing', async ({ page }) => {
    await bootSolo(page);
    await seedBank(page);
    await openPanel(page);

    const stink = (await panelPoints(page)).structureCenters.find((t) => t.id === 'stinkTower')!;
    await clickCanvas(page, stink.x, stink.y);
    expect((await panelPoints(page)).armed).toBe('stinkTower');

    const before = await counts(page);
    // The shared quarry is refused: geometry stamped there would be rim-snapped out every substep.
    await clickCanvas(page, 960, 540);
    await page.waitForTimeout(500);

    const after = await counts(page);
    expect(after.primitives).toBe(before.primitives);
    expect(after.bank).toBe(before.bank); // nothing spent
    // Still held — an illegal click must not silently cost the player their selection.
    expect((await panelPoints(page)).armed).toBe('stinkTower');
  });
});
