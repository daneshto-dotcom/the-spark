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
/**
 * A legal drop site, DERIVED from the live panel rather than hardcoded.
 *
 * ⛔ S148 P1 — THIS WAS A HARDCODED `{ x: 360, y: 780 }` AND THE ZONE PARTITION BROKE IT. Seat 0's
 * keep moved from the old polar ring (540,540) to the `PITCH_2P` goalmouth (120,540), which drags
 * the castle panel with it: the panel went from x[583,851] to x[163,431], and the old constant sat
 * squarely inside the new rect. Every click was therefore swallowed by `isOverPanel` and the test
 * failed with "0 primitives placed" — which reads like a broken build path and is nothing of the
 * kind.
 *
 * This is the SECOND time a hardcoded board coordinate in the e2e lane has rotted when the keeps
 * moved (`helpers.ts:892` records the first, when the ring went to 420 and four tests started
 * clicking empty board). So it is derived now: right of the panel, clear of the quarry, above the
 * footer. The panel geometry getter exists for exactly this (the S85 P4c convention).
 */
function legalSiteRightOfPanel(rect: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  const x = rect.x + rect.w + 120; // clear of the panel's right edge with margin
  const y = 800; // below the quarry, above FOOTER_TOP_Y (996)
  return { x, y };
}

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
      castleBanks: Map<number, number[]>;
    };
    // S146 P2 — the inventory is a fixed 6-entry tally indexed by SparkType, not a list of
    // entities. Seeding it is now literally "put 1 Square and 3 Circles in the castle".
    const tally = [0, 0, 0, 0, 0, 0];
    tally[sq] = 1;
    tally[ci] = 3;
    w.castleBanks.set(0, tally);
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
      castleBanks: Map<number, number[]>;
    };
    return {
      primitives: w.primitives.size,
      bonds: w.bonds.size,
      defenders: [...w.defenders.values()].map((d) => d.recipeId),
      bank: (w.castleBanks.get(0) ?? []).reduce((a, b) => a + b, 0),
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

/**
 * S150 P4 — the FOOTER BAND readers, replacing the castle-panel ones for tower selection.
 *
 * Tower selection moved out of the castle in S149 P6 on the owner's ruling: *"the towers are still
 * being built within the castle which is wrong. you should remove the area and put it down in the
 * footer ... the castle is just to hold the shapes (inventory)."* So `structureCenters` no longer
 * describes a rendered surface — the grid is off behind `CASTLE_BUILD_GRID_ENABLED` — and the three
 * tests below drive the bar instead. The pattern is lifted from the one place that already exercises
 * it green, `zones-visual.spec.ts`.
 */
async function bandPoints(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const sp = (window as {
      __SPARK__?: { footerBand?: { getUiPoints?: () => unknown } };
    }).__SPARK__;
    if (sp?.footerBand?.getUiPoints === undefined) throw new Error('footerBand.getUiPoints unavailable');
    // Called IN PLACE — detaching the method loses `this`.
    return sp.footerBand.getUiPoints() as {
      chips: Array<{ complexity: number; x: number; y: number; w: number; h: number; enabled: boolean }>;
      cards: Array<{ id: string; name: string; reason: string; enabled: boolean; x: number; y: number; w: number; h: number }>;
      selected: number | null;
    };
  });
}

/** Open the tier chip for a complexity, and fail LOUDLY if that complexity is not on the bar. */
async function openTier(page: import('@playwright/test').Page, complexity: number): Promise<void> {
  const { chips } = await bandPoints(page);
  const chip = chips.find((c) => c.complexity === complexity);
  if (chip === undefined) {
    throw new Error(
      `no chip for complexity ${complexity}; bar has [${chips.map((c) => c.complexity).join(', ')}]`,
    );
  }
  await clickCanvas(page, chip.x + chip.w / 2, chip.y + chip.h / 2);
  await page.waitForTimeout(400);
}

/** The stink tower's card, once its tier is open. */
async function stinkCard(page: import('@playwright/test').Page) {
  const { cards } = await bandPoints(page);
  const card = cards.find((c) => c.id === 'stinkTower');
  if (card === undefined) {
    throw new Error(`stinkTower card absent; open cards are [${cards.map((c) => c.id).join(', ')}]`);
  }
  return card;
}

/**
 * A legal drop site DERIVED from the seat's own zone, not from the panel.
 *
 * Same defence as `legalSiteRightOfPanel` and for the same recorded reason — a hardcoded board
 * coordinate in this lane has now rotted twice when the keeps moved. Seat 0 owns the LEFT half under
 * `PITCH_2P`, so this sits well inside its own ground, clear of the quarry disc at (960,540) r=125,
 * and above the footer bar. These are the same coordinates `bomb.spec.ts` builds its cluster at,
 * which is independent evidence that seat 0 can legally place here.
 */
function legalSiteForSeat0(): { x: number; y: number } {
  return { x: 420, y: 400 };
}

/**
 * ⭐ S150 P4 — THESE THREE WERE `fixme`, AND THEY ARE LIVE AGAIN ON THE FOOTER PATH.
 *
 * S149 P6 marked them `fixme` — deliberately NOT `@quarantine-flaky`, because they were STALE, not
 * intermittent, and mislabelling a stale test as flaky is how a real regression later gets waved
 * through. Tower selection had moved out of the castle and into the footer band, so
 * `castlePanel.getUiPoints().structureCenters` stopped describing a rendered surface.
 *
 * The rewrite follows the recipe S149 left in this file, unchanged: open the tier chip for the
 * recipe's complexity, read the cards that open above the bar, click one to ARM it, then click the
 * world to place. Everything from the placement onward — the stamp, the ignition, the survival poll,
 * the spend — is what these tests always asserted, which is the point: the BEHAVIOUR never moved,
 * only the surface that triggers it.
 *
 * ⚠ WHAT THESE STILL COVER THAT NO UNIT TEST CAN. Three layers meeting: a real click on a real chip,
 * an armed ghost, a dispatched BUILD_BLUEPRINT, a host stamp, a snapshot, and a tower the renderer
 * draws — plus the two silent deaths recorded in this file's header (no `BOND_FORMED` ⇒ perfect
 * geometry and no ignition; the placing click also grabbing a spark ⇒ a tower plus a phantom drag).
 */
test.describe('S150 P4 — click a tower on the FOOTER, place it, keep it (solo, gating)', () => {
  test('the tier bar is derived from the registry, and a funded card becomes clickable', async ({ page }) => {
    await bootSolo(page);

    // The five distinct complexities in the shipped registry: stink 4, pentagram 5, lightningHub 6,
    // laserTurret/helga 7, voltkin 8. Derived, so adding a recipe moves the bar and this assertion
    // together rather than leaving the bar advertising a complexity with nothing in it.
    const band = await bandPoints(page);
    expect(band.chips.map((c) => c.complexity)).toEqual([4, 5, 6, 7, 8]);

    // With an EMPTY bank the card is dim AND names its blocker — an unexplained dim box is
    // indistinguishable from a broken one, which was the original S136 complaint.
    await openTier(page, 4);
    const dim = await stinkCard(page);
    expect(dim.enabled).toBe(false);
    expect(dim.reason).not.toBe('');

    // Fund exactly its bill and the same card lights up, with nothing left to explain.
    await seedBank(page);
    await page.waitForTimeout(300);
    const lit = await stinkCard(page);
    expect(lit.enabled).toBe(true);
    expect(lit.reason).toBe('');
  });

  test('clicking a card arms it; clicking the world builds a REAL tower that survives', async ({ page }) => {
    await bootSolo(page);
    await seedBank(page);

    const before = await counts(page);
    expect(before.bank).toBe(4);

    // ARM: open the tier, click the stink-tower card.
    await openTier(page, 4);
    const card = await stinkCard(page);
    expect(card.enabled).toBe(true);
    await clickCanvas(page, card.x + card.w / 2, card.y + card.h / 2);
    await page.waitForTimeout(250);
    // The castle panel still owns the ARMED state even though the footer now owns SELECTION, so this
    // reader is deliberately unchanged — it is the arming contract, not the moved surface.
    expect((await panelPoints(page)).armed).toBe('stinkTower');

    // PLACE: a legal spot inside seat 0's own zone.
    const site = legalSiteForSeat0();
    await clickCanvas(page, site.x, site.y);
    await page.waitForTimeout(900);

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

    // ⭐ SURVIVAL. A defender is re-validated every 30 ticks against its recipe; a stamp whose
    // geometry does not satisfy its own predicate is removed within 0.5 s. 3 s covers ~6 polls.
    await page.waitForTimeout(3_000);
    const later = await counts(page);
    expect(later.defenders).toContain('stinkTower');
    expect(later.primitives).toBe(after.primitives);
  });

  test('an illegal drop keeps the tower in hand and builds nothing', async ({ page }) => {
    await bootSolo(page);
    await seedBank(page);

    await openTier(page, 4);
    const card = await stinkCard(page);
    await clickCanvas(page, card.x + card.w / 2, card.y + card.h / 2);
    await page.waitForTimeout(250);
    expect((await panelPoints(page)).armed).toBe('stinkTower');

    const before = await counts(page);
    // The shared quarry is refused: geometry stamped there would be rim-snapped out every substep.
    await clickCanvas(page, 960, 540);
    await page.waitForTimeout(600);

    const after = await counts(page);
    expect(after.primitives).toBe(before.primitives);
    expect(after.bank).toBe(before.bank); // nothing spent
    // Still held — an illegal click must not silently cost the player their selection.
    expect((await panelPoints(page)).armed).toBe('stinkTower');
  });
});
