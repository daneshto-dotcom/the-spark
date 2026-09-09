/**
 * SPARK — S167 — **THE RACE TOWER IS ON SCREEN.** @visual
 *
 * ## ⛔ THE GUARD THAT WAS MISSING, AND WHAT ITS ABSENCE COST
 *
 * S165 P4 generated twelve tier-3 tower atlases plus six destruction cinematics, matted them,
 * scanned them with `check:atlas`, and shipped a unit test asserting every path **exists on disk**.
 * Every one of those gates was green for two sessions while `t3TowerAtlasBase` had **zero
 * production callers** — the art was never drawn, and nothing could tell.
 *
 * That is the exact shape a disk-existence test cannot catch: the file is there, the path resolves,
 * and no code asks for it. The only assertion that could ever have caught it is this one — build the
 * thing in a real browser and check a sprite appeared.
 *
 * ⚠ SO THIS TEST IS ABOUT THE RENDERER, NOT ABOUT THE RECIPE. `t9BossTower.test.ts` already proves
 * the tower ignites, releases and crumbles under the real host tick. What is unproven in vitest — and
 * unprovable there, since `jsdom` has no Pixi stage — is that a texture reached a sprite on the
 * board.
 *
 * ⚠ AND IT ASSERTS THE **SPRITE**, NOT A PIXEL. A screenshot diff would fail on every art revision
 * and teach the next session to re-baseline without looking. The durable contract is "the tower
 * renderer owns exactly one live sprite per live race tower", which is true across any redraw of the
 * art and false in precisely the failure mode that shipped.
 */

import { expect, test } from '@playwright/test';
import { canvasToCss, waitForWorld } from './helpers.ts';

/** `SparkType` on the wire — the same numeric tally `click-to-build.spec.ts` seeds. */
const SHAPE_BY_RACE: Readonly<Record<string, number>> = {
  vampires: 2, // Triangle
  nagas: 3, //    Square
  mummies: 1, //  Line
  zombies: 4, //  Circle
  orcs: 0, //     Dot
  demons: 5, //   Spiral
};

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

/** The seat's own race — R95 means only ITS towers are buildable, so the test must ask. */
async function seatRace(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      localPlayerId: number;
      players: Map<number, { raceId: string }>;
    };
    const me = w.players.get(w.localPlayerId);
    if (me === undefined) throw new Error('local player missing');
    return me.raceId;
  });
}

/**
 * Put `n` of one shape in seat 0's bank.
 *
 * ⚠ THERE IS NO BANK CAP TO WORK AROUND — `CASTLE_BANK_CAP` was deleted in S146 P2 and the
 * inventory is limitless, which is what makes a NINE-shape bill payable at all. Worth stating: a cap
 * of 7 would have made the tier-9 tower unbuildable by any means, and nothing would have said so.
 */
async function seedBank(page: import('@playwright/test').Page, shape: number, n: number): Promise<void> {
  await page.evaluate(({ shape: s, n: count }) => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      castleBanks: Map<number, number[]>;
    };
    const tally = [0, 0, 0, 0, 0, 0];
    tally[s] = count;
    w.castleBanks.set(0, tally);
  }, { shape, n });
}

/**
 * The FOOTER BAND, which is where a tower is picked.
 *
 * ⛔ NOT `castlePanel.getUiPoints().structureCenters`, AND THIS COST TWO RUNS TO REDISCOVER.
 * Tower selection moved out of the castle in S149 P6 on the owner's ruling (*"the towers are still
 * being built within the castle which is wrong … put it down in the footer"*), so the castle grid
 * is off behind `CASTLE_BUILD_GRID_ENABLED = false` and renders ZERO tiles — while that seam still
 * maps all nineteen `ALL_BLUEPRINT_IDS` against an EMPTY tile array. It therefore reports every
 * race's tower as present-but-disabled with an empty reason, which reads exactly like a broken R95
 * filter and is in fact a retired surface describing itself. `click-to-build.spec.ts` records the
 * same finding at its own `bandPoints`.
 */
async function bandPoints(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const sp = (window as { __SPARK__?: { footerBand?: { getUiPoints?: () => unknown } } }).__SPARK__;
    if (sp?.footerBand?.getUiPoints === undefined) throw new Error('footerBand.getUiPoints unavailable');
    // Called IN PLACE — detaching the method loses `this`.
    return sp.footerBand.getUiPoints() as {
      chips: Array<{ complexity: number; x: number; y: number; w: number; h: number; enabled: boolean }>;
      cards: Array<{ id: string; name: string; reason: string; enabled: boolean; x: number; y: number; w: number; h: number }>;
      selected: number | null;
    };
  });
}

/** The armed tower still lives on the castle panel even though SELECTION moved to the footer. */
async function armedTower(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    const sp = (window as { __SPARK__?: { castlePanel?: { getUiPoints?: () => { armed: string | null } } } }).__SPARK__;
    if (sp?.castlePanel?.getUiPoints === undefined) throw new Error('castlePanel.getUiPoints unavailable');
    return sp.castlePanel.getUiPoints().armed;
  });
}

/** Live spawners by recipe, and how many sprites the tower renderer is holding. */
async function towerState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
      creatureSpawners: Map<number, { recipeId: string }>;
      primitives: Map<number, unknown>;
    };
    /*
     * ⭐ S169 (owner) — the tower layer moved to `fogHiddenLayer`, UNDER the fog: he ruled that an
     * enemy's buildings must be hidden during BUILD ("You should only see, like, their castle").
     * This probe follows it. `fog.spec.ts` rolls call BOTH layers now.
     *
     * The tower layer is a Container parented to that layer. `fog.spec.ts` pins its INDEX (3,
     * directly above the spawner aura at 2), so reading it positionally here is the same contract
     * read from the other side — if someone reorders the layer, that spec fails first and names it.
     */
    const above = (window as { __SPARK__?: { fogHiddenLayer?: unknown } }).__SPARK__?.fogHiddenLayer as
      | { children: Array<{ children?: unknown[] }> }
      | undefined;
    if (above === undefined) throw new Error('__SPARK__.fogHiddenLayer unavailable');
    // ⭐ S169 — the layer MOVED (aboveFogLayer -> fogHiddenLayer) but the INDEX is unchanged at 3:
    // the zone backdrop and walls moved down with the buildings, so the original relative order of
    // all ten renderers is preserved. `fog.spec.ts` rolls call both layers.
    const layer = above.children[3];
    const towerSprites = layer?.children?.length ?? -1;
    return {
      spawners: [...w.creatureSpawners.values()].map((s) => s.recipeId),
      primitives: w.primitives.size,
      towerSprites,
    };
  });
}

async function clickCanvas(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
  const p = await canvasToCss(page, x, y);
  await page.mouse.click(p.x, p.y);
}

test.describe('@visual S167 — the race tower is DRAWN, not just built', () => {
  test('⭐ a tier-9 boss tower stamps, ignites, and puts a SPRITE on the board', async ({ page }) => {
    await bootSolo(page);
    const race = await seatRace(page);
    const shape = SHAPE_BY_RACE[race];
    expect(shape, `unknown race ${race}`).not.toBeUndefined();

    // Nine of the seat's own feed shape — the whole bill, and nothing else.
    await seedBank(page, shape!, 9);
    await page.waitForTimeout(300);

    const before = await towerState(page);
    expect(before.spawners, 'no tower before the build').toEqual([]);

    /*
     * ARM: open the tier-9 chip on the footer and click the card.
     *
     * ⭐ THE `9` CHIP APPEARS WITH NO HARDCODED LIST EDITED — `footerBandModel` derives the bar from
     * `blueprintCost`, so a nine-shape recipe made a new tier show up on its own. Failing here with
     * "no chip for complexity 9" would mean the recipe never reached the registry at all.
     */
    const towerId = `t9Tower${race[0]!.toUpperCase()}${race.slice(1)}`;
    const { chips } = await bandPoints(page);
    const chip = chips.find((c) => c.complexity === 9);
    expect(chip, `no 9 chip; the bar has [${chips.map((c) => c.complexity).join(', ')}]`).not.toBeUndefined();
    await clickCanvas(page, chip!.x + chip!.w / 2, chip!.y + chip!.h / 2);
    await page.waitForTimeout(400);

    const { cards } = await bandPoints(page);
    const card = cards.find((c) => c.id === towerId);
    expect(
      card,
      `the ${race} boss tower card must open above the bar — open cards: [${cards.map((c) => c.id).join(', ')}]`,
    ).not.toBeUndefined();
    /*
     * ⚠ EXACTLY ONE CARD AT COMPLEXITY 9, NOT SIX. R95 filters the footer to the seat's OWN race
     * tower; six cards here would mean the tier-9 half of that filter had come off, which is the
     * defect `castlePanel.ts`'s R95 line was extended to prevent.
     */
    expect(cards.length, `one 9-cost card for a ${race} seat, got [${cards.map((c) => c.id).join(', ')}]`).toBe(1);
    expect(card!.enabled, `funded card must be clickable — ${card!.reason}`).toBe(true);

    await clickCanvas(page, card!.x + card!.w / 2, card!.y + card!.h / 2);
    await page.waitForTimeout(250);
    expect(await armedTower(page), 'clicking the card must ARM the tower').toBe(towerId);

    // PLACE: the same legal site `click-to-build.spec.ts` uses for seat 0.
    await clickCanvas(page, 420, 400);
    await page.waitForTimeout(900);

    const after = await towerState(page);
    // The REAL geometry landed: nine primitives in a closed ring.
    expect(after.primitives - before.primitives, 'nine shapes stamped').toBe(9);
    // ⭐ And it IGNITED — zero here means the ring landed but no BOND_FORMED reached the matcher.
    expect(after.spawners, 'the boss tower must ignite').toContain(towerId);
    /*
     * ⭐⭐ THE ASSERTION THIS WHOLE FILE EXISTS FOR. One live tower, one sprite. A zero here is the
     * defect that shipped for two sessions on the tier-3 towers: recipe fine, art fine, path fine,
     * and nothing on screen.
     */
    expect(after.towerSprites, 'the tower renderer must hold exactly one sprite').toBe(1);

    await page.screenshot({ path: 'test-results/t9-tower-on-board.png' });
  });

  test('⭐ the tower RELEASES its boss, crumbles, and the BOSS is drawn from its atlas', async ({ page }) => {
    /*
     * ⭐ THE END-TO-END PROOF, and the one that matters most for a playtest: recipe -> ignition ->
     * release -> raze -> a BOSS SPRITE ON THE BOARD. Every link is covered in vitest, but vitest has
     * no Pixi stage and so cannot answer the question that actually sank the tier-3 tower art —
     * "does a texture reach a sprite?"
     *
     * ⚠ AND IT IS SPECIFICALLY A CHECK AGAINST THE GREEN PUPPET. `goblinRenderer`'s ATLASES map is
     * `Partial<Record<CreatureType, string>>` and `loadAtlas` swallows a 404 with a bare catch, so a
     * boss with a wrong path renders as `drawGoblin`'s procedural blob — the owner's "gay green
     * circle" — with tsc green and every unit test green. Asserting the boss is in the SPRITE layer
     * rather than merely in `world.creatures` is what separates those two outcomes.
     */
    await bootSolo(page);
    const race = await seatRace(page);
    const shape = SHAPE_BY_RACE[race];
    await seedBank(page, shape!, 9);
    await page.waitForTimeout(300);

    const towerId = `t9Tower${race[0]!.toUpperCase()}${race.slice(1)}`;
    const { chips } = await bandPoints(page);
    const chip = chips.find((c) => c.complexity === 9)!;
    await clickCanvas(page, chip.x + chip.w / 2, chip.y + chip.h / 2);
    await page.waitForTimeout(400);
    const card = (await bandPoints(page)).cards.find((c) => c.id === towerId)!;
    await clickCanvas(page, card.x + card.w / 2, card.y + card.h / 2);
    await page.waitForTimeout(250);
    await clickCanvas(page, 420, 400);
    await page.waitForTimeout(600);
    expect((await towerState(page)).spawners, 'tower ignited').toContain(towerId);

    /*
     * Jump the match into FIGHT. The whole spawner poll is gated on it (S157 P0, "spawners are
     * dormant outside the fight"), so a tower built in BUILD — which is the only phase it CAN be
     * built in — cannot release until the edge. Waiting out a real 90 s BUILD in a gating lane is
     * not viable, so the phase is set directly; everything downstream is the shipped host loop.
     */
    await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        matchPhase: string; tick: number; phaseEndsAtTick: number;
      };
      w.matchPhase = 'FIGHT';
      w.phaseEndsAtTick = w.tick + 100_000;
    });

    // The release fires T9_RELEASE_DELAY_TICKS (5 s) after ignition; allow margin for the poll.
    await page.waitForTimeout(9_000);

    const after = await page.evaluate(() => {
      const w = (window as { __SPARK__?: { world?: unknown } }).__SPARK__?.world as {
        creatures: Map<number, { type: string }>;
        creatureSpawners: Map<number, { recipeId: string }>;
        primitives: Map<number, unknown>;
      };
      const above = (window as { __SPARK__?: { fogHiddenLayer?: unknown } }).__SPARK__
        ?.fogHiddenLayer as { children: Array<{ children?: unknown[] }> };
      return {
        bosses: [...w.creatures.values()].filter((c) => c.type.startsWith('t9Boss')).map((c) => c.type),
        spawners: [...w.creatureSpawners.values()].map((s) => s.recipeId),
        primitives: w.primitives.size,
        // fog.spec.ts pins that ordering, so this reads the same contract from the other side.
        // index 8 is goblinRenderer.spriteLayer — the ATLAS sprites, not the procedural puppet.
        atlasSprites: above.children[8]?.children?.length ?? -1,
      };
    });

    expect(after.bosses, `exactly one boss released for ${race}`).toHaveLength(1);
    expect(after.bosses[0]).toBe(`t9Boss${race[0]!.toUpperCase()}${race.slice(1)}`);
    expect(after.spawners, '⛔ the tower must have CRUMBLED after releasing').not.toContain(towerId);
    expect(after.primitives, '⛔ and the nine shapes must be CONSUMED').toBe(0);
    /*
     * ⭐⭐ The assertion that separates "real art" from "green procedural blob": the boss must be in
     * the ATLAS sprite layer. A missing or mistyped path leaves world.creatures correct and this
     * layer empty.
     */
    expect(after.atlasSprites, '⛔ the boss must be drawn from its ATLAS, not the puppet')
      .toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: 'test-results/t9-boss-released.png' });
  });

  test('⭐ and the TIER-3 tower draws too — the art that was orphaned for two sessions', async ({ page }) => {
    /*
     * ⛔ THIS IS THE ONE THAT ACTUALLY REGRESSED, so it gets its own test rather than riding on the
     * tier-9 case. `t3TowerAtlasBase` had ZERO production callers from S165 until S167: twelve tower
     * atlases and six destruction cinematics, matted, scanned by check:atlas and asserted-present on
     * disk by a unit test, and never once drawn.
     *
     * ⚠ SHARING A CODE PATH WITH THE TIER-9 TOWER IS NOT PROOF THAT THIS ONE DRAWS. The two tiers
     * resolve DIFFERENT atlas bases and — the part that would fail silently — DIFFERENT ROW ORDERS:
     * a tier-3 sheet carries a `spawning` row at index 1 that tier-9 does not have, so reading one
     * with the other's indices renders a perfectly valid WRONG FRAME. Only building a tier-3 tower
     * in a browser closes that.
     */
    await bootSolo(page);
    const race = await seatRace(page);
    const shape = SHAPE_BY_RACE[race];
    await seedBank(page, shape!, 3);
    await page.waitForTimeout(300);

    const towerId = `t3Tower${race[0]!.toUpperCase()}${race.slice(1)}`;
    const { chips } = await bandPoints(page);
    const chip = chips.find((c) => c.complexity === 3);
    expect(chip, `no 3 chip; the bar has [${chips.map((c) => c.complexity).join(', ')}]`).not.toBeUndefined();
    await clickCanvas(page, chip!.x + chip!.w / 2, chip!.y + chip!.h / 2);
    await page.waitForTimeout(400);

    const { cards } = await bandPoints(page);
    const card = cards.find((c) => c.id === towerId);
    expect(card, `the ${race} tier-3 card must open — got [${cards.map((c) => c.id).join(', ')}]`)
      .not.toBeUndefined();
    // R95 again: exactly one 3-cost card for a seat, not six.
    expect(cards.length, `one 3-cost card for a ${race} seat`).toBe(1);

    await clickCanvas(page, card!.x + card!.w / 2, card!.y + card!.h / 2);
    await page.waitForTimeout(250);
    await clickCanvas(page, 420, 400);
    await page.waitForTimeout(900);

    const after = await towerState(page);
    expect(after.primitives, 'three shapes stamped').toBe(3);
    expect(after.spawners, 'the tier-3 tower must ignite').toContain(towerId);
    expect(after.towerSprites, '⛔ the S165 tower art must finally be DRAWN').toBe(1);

    await page.screenshot({ path: 'test-results/t3-tower-on-board.png' });
  });
});
