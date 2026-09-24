/**
 * SPARK — S149 P4: the footer band, indexed by connector count (R36).
 *
 * *"the tower selection should be on the bottom of the map as a footer"* — owner playtest.
 *
 * ⚠ This surface was DELETED once, in S136 P0, on the owner's own ruling. R36 reinstates a
 * different one — numbers rather than a flat list of every tower — and the two constraints that got
 * the original deleted are what most of this file pins: it must not swallow the board's clicks, and
 * it must not sit on top of the castle porches.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ALL_SPARK_TYPES, CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y, PLAYER_COLORS, SparkType,
} from '../constants.ts';
import { ALL_BLUEPRINT_IDS, blueprintBill, blueprintCost } from '../state/blueprints.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { GATHERER_DEPOSIT_OFFSET_Y } from '../constants.ts';
import { asPlayerId } from '../types.ts';
// S166 — the footer derives from the panel model, so the bucket total is asserted against it.
// S173 — and the card's "WHICH shapes" readout is that same model's shortfall, unsummed.
import {
  SHORTFALL_GLYPH_R, castleStructuresModel, glyphCountRowLayout, shortfallEntries, structureRowFor,
} from './castlePanel.ts';
import { bankAdd } from '../state/castleBank.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { zoneCount, type ZoneLayout } from '../state/zones.ts';
import { footerBandModel, structuresAtComplexity } from './footerBandModel.ts';
import { CARRY_PLATE_PAD, layoutCarryBill, layoutCards, layoutChips } from './footerBand.ts';
import { STRIP_MARGIN, shapeStripLayout } from './shapeStrip.ts';

/**
 * S182 — the chip box height, restated here ONLY to bound the carry readout's plate in the overlap
 * sweep. `layoutChips` reports the live value and the assertions below read it from there where
 * they can; this is the one place a bare number is needed and it is pinned against the real chips.
 */
const CHIP_H_FOR_TEST = 46;

const P0 = asPlayerId(0);

function playingWorld(seats = 1): World {
  const w = makeWorld(0);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: Array.from({ length: seats }, (_, s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1),
  });
  return w;
}

describe('S149 P4 — the bar is DERIVED from the recipe registry, never hardcoded (Q8)', () => {
  it('shows exactly the distinct connector counts that actually exist', () => {
    const w = playingWorld();
    const shown = footerBandModel(w).map((c) => c.complexity);
    const expected = [...new Set(ALL_BLUEPRINT_IDS.map(blueprintCost))].sort((a, b) => a - b);
    expect(shown).toEqual(expected);
  });

  it('is ascending, so a chip never moves under the cursor as inventory changes', () => {
    const shown = footerBandModel(playingWorld()).map((c) => c.complexity);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
  });

  it('every VISIBLE recipe lands in exactly one bucket — nothing dropped or double-counted', () => {
    /*
     * ⭐ S166 — THE FOOTER INHERITS R95'S RACE FILTER FOR FREE, and §7 of the races spec predicted
     * exactly that: it derives from `castleStructuresModel`, which now hides the five race towers
     * that are not yours. So the total is what the PANEL offers (7 globals + 1 own tower = 8), not
     * `ALL_BLUEPRINT_IDS.length` (13).
     *
     * ⚠ ASSERTED AGAINST THE PANEL, not against a hardcoded 8, so the two models can never drift
     * apart — which is the property that actually matters. The literal 8 below is anti-vacuity: an
     * empty panel would satisfy the equality on its own.
     */
    const w = playingWorld();
    const model = footerBandModel(w);
    const counted = model.reduce((n, c) => n + c.total, 0);
    expect(counted).toBe(castleStructuresModel(w).length);
    /*
     * ⚠ S167 — 8 -> 9 BECAUSE A SEAT NOW SEES TWO RACE TOWERS, NOT BECAUSE A CHIP MOVED. The
     * breakdown is 7 globals + the seat's ONE tier-3 tower + the seat's ONE tier-9 boss tower. If
     * this line ever goes red again, the question to ask FIRST is whether the R95 per-race filter
     * still hides the other five races' towers — the failure message says "footer band", but the
     * defect it is most likely reporting is a leaked race filter, and bumping the number would hide
     * exactly that.
     */
    expect(counted).toBe(9);
  });

  it('a chip is DIM on an empty inventory, because nothing is affordable at t=0', () => {
    // The opening board hands out 100 points and no shapes, so every recipe is unaffordable and the
    // whole bar reads dim. If this ever goes bright, affordability has stopped being real.
    const w = playingWorld();
    for (const c of footerBandModel(w)) {
      expect(c.affordable).toBe(0);
      expect(c.enabled).toBe(false);
    }
  });

  it('structuresAtComplexity returns exactly the recipes of that size', () => {
    const w = playingWorld();
    for (const c of footerBandModel(w)) {
      const rows = structuresAtComplexity(w, c.complexity);
      expect(rows).toHaveLength(c.total);
      for (const r of rows) expect(r.cost).toBe(c.complexity);
    }
  });
});

describe('S149 P4 — ⛔ THE CHIPS CLEAR THE CASTLE PORCHES (the S148 warning, now an assertion)', () => {
  // `zones.test.ts` has carried this since S148: the bottom quadrant keeps deposit BELOW the footer
  // line, "which is only safe while the footer is empty … If a footer control is ever revived, these
  // anchors move up." A footer control has now been revived. Rather than move two shipped anchors
  // (and every gatherer spawn, deposit and hit-test derived from them), the chips are CENTRED —
  // and this is the test that keeps them there.
  const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];

  it('the collision is real — the bottom quadrant porches ARE inside the footer band', () => {
    // Establishes that this test is not vacuous: if the porches ever move out of the band, this
    // fails and the whole clearance concern can be retired rather than silently kept forever.
    const inBand = [2, 3].map((seat) => {
      const a = castleAnchor(seat, 'QUADRANTS_4P');
      return a.y + GATHERER_DEPOSIT_OFFSET_Y;
    });
    for (const y of inBand) expect(y).toBeGreaterThan(FOOTER_TOP_Y);
  });

  for (const layout of LAYOUTS) {
    it(`${layout} — no chip overlaps any castle porch`, () => {
      const chips = layoutChips(footerBandModel(playingWorld(zoneCount(layout))));
      expect(chips.length).toBeGreaterThan(0); // anti-vacuity: there ARE chips to clear

      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = castleAnchor(seat, layout);
        const porch = { x: a.x, y: a.y + GATHERER_DEPOSIT_OFFSET_Y };
        for (const c of chips) {
          const overlaps =
            porch.x >= c.x && porch.x <= c.x + c.w && porch.y >= c.y && porch.y <= c.y + c.h;
          expect(overlaps, `${layout} seat ${seat} porch is under the chip for ${c.complexity}`).toBe(false);
        }
      }
    });
  }

  it('the chips are CENTRED and leave the corners alone', () => {
    const chips = layoutChips(footerBandModel(playingWorld()));
    const left = Math.min(...chips.map((c) => c.x));
    const right = Math.max(...chips.map((c) => c.x + c.w));
    // Comfortably clear of the x=130 and x=1790 corner porches, with room for a future recipe.
    expect(left).toBeGreaterThan(400);
    expect(right).toBeLessThan(CANVAS_WIDTH - 400);
  });

  it('every chip sits inside the footer band, on the board', () => {
    for (const c of layoutChips(footerBandModel(playingWorld()))) {
      expect(c.y).toBeGreaterThanOrEqual(FOOTER_TOP_Y);
      expect(c.y + c.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });
});

describe('S149 P4 — the bar is presentational: no sim state, no wire surface', () => {
  it('reading the model does not mutate the world', () => {
    const w = playingWorld();
    const before = JSON.stringify({
      prims: w.primitives.size,
      sparks: w.freeSparks.size,
      tick: w.tick,
      phase: w.matchPhase,
    });
    footerBandModel(w);
    structuresAtComplexity(w, 4);
    const after = JSON.stringify({
      prims: w.primitives.size,
      sparks: w.freeSparks.size,
      tick: w.tick,
      phase: w.matchPhase,
    });
    expect(after).toBe(before);
  });

  it('⚠ affordability comes from the SHIPPED reducer logic, not a lookalike count', () => {
    // `castleStructuresModel` decides `enabled` via `planBlueprintPayment` — the same function the
    // build reducer calls. This asserts the band inherits that verdict verbatim rather than
    // re-deriving it, which is the defect that makes a bright tile refuse to build.
    const w = playingWorld();
    for (const c of footerBandModel(w)) {
      const rows = structuresAtComplexity(w, c.complexity);
      expect(c.affordable).toBe(rows.filter((r) => r.enabled).length);
      expect(c.enabled).toBe(rows.some((r) => r.enabled));
    }
  });

  it('an empty model lays out no chips rather than throwing', () => {
    expect(layoutChips([])).toEqual([]);
  });
});

/*
 * ⭐ S169 (owner R153) — THE SIX-SHAPE KEY, AND ITS CLEARANCE SUITE, ARE DELETED.
 *
 * This file used to carry a `describe` block proving the key cleared every connector chip at any
 * registry size. S150 P1 wrote it after the owner's *"non coherent parts (text/the shapes on the top
 * left)"* — the key was being drawn inside leaderboard row 0 — and it did its job for many sessions.
 *
 * He has now ruled the key itself redundant: *"you see those six shapes on the left side with their
 * colors - thats illogical to have them. maybe just remove them and make the shapes on the right
 * side (where the queue menue is) colored with those colors (showing the races that own them)."*
 * Geometry assertions about a container that no longer exists cannot fail, so they are removed
 * rather than left as green decoration. `footerBandLegendRemoved.test.ts` pins the absence and the
 * race tint that replaced it — the claims that CAN regress.
 */

/**
 * ⭐ S173 — A SHORT CARD SAYS **WHICH** SHAPES. Owner, playtest:
 *
 *   *"under the tower, it says need five more … But it doesn't say WHAT SHAPES. Some towers need
 *    different types of shapes. It's good to know which you're missing … We need the NEED, and then
 *    the SYMBOL. Need three more this and five more this, for example."*
 *
 * This is the surface his screenshot was of — the open tower menu's card, whose sub-line was
 * `card.reason`, i.e. the panel model's per-shape shortfall already summed into one number. The
 * geometry carrier now hands the breakdown through so the card can draw a glyph per shape.
 *
 * ⚠ WHAT THESE TESTS CAN AND CANNOT SEE. `layoutCards` is PURE and is therefore what is asserted;
 * the glyph pixels are drawn in `sync` against a live Pixi `Graphics`, exactly like the tower thumb
 * and the palette marks beside them, and are out of reach here. So the claim pinned below is the one
 * that can actually regress silently: that the card carries the UNSUMMED shortfall, and that it is
 * the SAME shortfall the reducer refused the build over.
 */
describe('S173 — the tower card carries WHICH shapes it is short of, not just how many', () => {
  it('layoutCards hands the per-shape shortfall through VERBATIM from the panel model', () => {
    const w = playingWorld();
    for (const complexity of footerBandModel(w).map((c) => c.complexity)) {
      const rows = structuresAtComplexity(w, complexity);
      const cards = layoutCards(w, complexity, FOOTER_TOP_Y);
      expect(cards.length, `complexity ${complexity}`).toBe(rows.length);
      for (const card of cards) {
        const row = rows.find((r) => r.id === card.id)!;
        // Carried, never re-derived: a second count here could promise a build the reducer refuses.
        expect(card.missing, `${card.id}`).toEqual(row.missing);
      }
    }
  });

  it('a card names each missing shape with its own count — the owner’s "three more this"', () => {
    // STINK TOWER = 1 Square hub + 3 Circle leaves, and the bank opens EMPTY.
    const w = playingWorld();
    const card = layoutCards(w, blueprintCost('stinkTower'), FOOTER_TOP_Y)
      .find((c) => c.id === 'stinkTower')!;
    expect(card.enabled).toBe(false);
    expect(shortfallEntries(card.missing)).toEqual([
      { type: SparkType.Square, short: 1 },
      { type: SparkType.Circle, short: 3 },
    ]);
    // The one-line fallback survives beside it, still true, no longer the only thing on offer.
    expect(card.reason).toBe('NEED 4 MORE');
  });

  it('⚠ a card that is merely LOCKED keeps the WORD — a lock is not a shopping list', () => {
    const w = playingWorld();
    w.players.get(w.localPlayerId)!.benchedUntilTick = w.tick + 600;
    const cards = layoutCards(w, blueprintCost('stinkTower'), FOOTER_TOP_Y);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.enabled).toBe(false);
      expect(card.reason).toBe('LOCKED');
    }
  });
});

/* ========================================================================== *
 *   ⭐⭐ S182 ITEM 3 (owner) — THE CARRIED TOWER'S BILL
 * ========================================================================== */

/**
 * > *"When you click on a tower, before you place it, when you're carrying the template, it should
 * > show you 'this will cost you this much and this much'. In a consistent manner without writing
 * > over the shapes. It should be a very understandable place."*
 *
 * ⛔ WHAT THIS FILE HAS TO CATCH IS NOT "does it draw" — nothing here runs Pixi — BUT THE TWO
 * DEFECTS S181 SHIPPED OF EXACTLY THIS CLASS: a new UI block that drew at an absolute position and
 * never advanced the layout cursor, and one that drew on top of an existing row. Both are layout
 * facts, both are pure, and both are asserted below.
 */
describe('S182 — the carry readout is laid out FROM the band, not beside it', () => {
  const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];
  /** Widest real bill in the registry: PRINCESS HELGA names three distinct shapes. */
  const WIDEST = 3;

  it('⚠ the bare chip height this file bounds the plate with is the LIVE one', () => {
    // Pins the one literal in this describe block against `layoutChips`, so a chip resize cannot
    // leave the overlap sweep below quietly measuring the wrong rectangle.
    expect(CHIP_H_FOR_TEST).toBe(layoutChips(footerBandModel(playingWorld()))[0].h);
  });

  it('is null when there is nothing to anchor to, or nothing to bill', () => {
    expect(layoutCarryBill([], WIDEST)).toBeNull();
    expect(layoutCarryBill(layoutChips(footerBandModel(playingWorld())), 0)).toBeNull();
  });

  it('⛔ sits LEFT of every chip, with the strip\'s own margin of air', () => {
    const chips = layoutChips(footerBandModel(playingWorld()));
    const carry = layoutCarryBill(chips, WIDEST)!;
    expect(carry.right).toBe(Math.min(...chips.map((c) => c.x)) - STRIP_MARGIN);
    for (const c of chips) expect(carry.right).toBeLessThanOrEqual(c.x);
  });

  it('⛔ overlaps NOTHING — not a chip, not the shape strip, not a castle porch', () => {
    for (const layout of LAYOUTS) {
      const w = playingWorld(zoneCount(layout));
      expect(w.layout).toBe(layout); // anti-vacuity: the seat count really selected this board
      const chips = layoutChips(footerBandModel(w));
      const carry = layoutCarryBill(chips, WIDEST)!;
      const strip = shapeStripLayout(chips, [SparkType.Dot, SparkType.Circle]);

      /*
       * ⚠ MEASURED AGAINST THE **PLATE**, NOT THE CONTENT. The drawn rectangle overhangs `left` and
       * `right` by `CARRY_PLATE_PAD` on each side, so a sweep over `left`/`right` alone would be
       * measuring a smaller box than the one the player sees — and would stay green while the plate
       * sat on a chip. Caught by re-reading the draw against this test, S182.
       */
      const plateL = carry.left - CARRY_PLATE_PAD;
      const plateR = carry.right + CARRY_PLATE_PAD;
      const hits = (x: number, y: number): boolean =>
        x >= plateL && x <= plateR && y >= carry.y - CHIP_H_FOR_TEST / 2
        && y <= carry.y + CHIP_H_FOR_TEST / 2;

      for (const c of chips) {
        expect(plateR, `chip ${c.complexity}`).toBeLessThan(c.x);
      }
      for (const r of [...strip.palette, ...strip.queue]) {
        expect(plateR, 'the shape strip is on the OTHER side — "without writing over the shapes"')
          .toBeLessThan(r.x);
      }
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = castleAnchor(seat, layout);
        expect(
          hits(a.x, a.y + GATHERER_DEPOSIT_OFFSET_Y),
          `${layout} seat ${seat} porch is under the carry readout`,
        ).toBe(false);
      }
    }
  });

  it('⛔⛔ THE PLATE SWALLOWS THE CLICK — it is a UI surface, so it must be in the guard', () => {
    /*
     * The defect an adversarial review of this branch found in ITEM 3 before the owner did, and it
     * is the S181 class one more time: the plate is `0x0b0f16` at alpha 0.72 and the band is brought
     * to the front, so it hides the board AND the blueprint ghost — while ITEM 1 simultaneously made
     * the band's own y LEGAL for a flat recipe. A click dead centre therefore passed every guard and
     * planted a tower on ground the player could not see.
     *
     * ⚠ ASSERTED THROUGH `isOverBandSurface`, NOT `isOverCarryBill`: the surface predicate is what
     * the COMMIT gates consult, and a test that only exercised the narrow helper would stay green if
     * the fold-in were removed. ⛔ AND NOT THROUGH `isOverChip` EITHER — that was the first fix, and
     * it reached the hover cursor (advertising a readout as clickable) without reaching the gate
     * that refuses the placement, because `handleFooterChipClick` only RETURNS true for a real
     * control press. Two predicates, two questions; see `isOverBandSurface`.
     */
    const src = readFileSync(new URL('./footerBand.ts', import.meta.url), 'utf8');
    const i = src.indexOf('isOverBandSurface(x: number, y: number): boolean {');
    expect(i, 'isOverBandSurface must exist').toBeGreaterThan(-1);
    expect(src.slice(i, i + 300)).toContain('this.isOverCarryBill(x, y)');
    // …and the CONTROL test must stay narrow, or the hover cursor starts lying again.
    const c = src.indexOf('isOverChip(x: number, y: number): boolean {');
    expect(c, 'isOverChip must still exist').toBeGreaterThan(-1);
    expect(src.slice(c, c + 300)).not.toContain('isOverCarryBill');
    // …and the hit-test must measure the PLATE, padding included, not the bare content box.
    const j = src.indexOf('isOverCarryBill(x: number, y: number): boolean {');
    expect(j, 'isOverCarryBill must exist').toBeGreaterThan(-1);
    expect(src.slice(j, j + 400)).toContain('CARRY_PLATE_PAD');
    // The geometry it hit-tests is THIS frame's, stored by sync — never recomputed independently.
    expect(src).toContain('private carry: CarryBillGeom | null = null;');
    expect(src).toContain('this.carry = carry;');
  });

  it('⛔⛔ EVERY OPAQUE RECTANGLE THE BAND FILLS IS HIT-TESTED BY SOMETHING', () => {
    /*
     * ⛔ THE ENUMERATION, MADE MECHANICAL. The carry plate was the FIFTH opaque fill in this file and
     * the only one no predicate knew about — and it was found by an audit, not by a test, twice.
     * The rule the project states is "enumerate a rule's SITES before claiming it is applied"; this
     * is that rule with teeth.
     *
     * The five, and what hit-tests each:
     *   1. the tier chip plate      → `chipAt`
     *   2. the palette button       → `paletteAt`      (via `isOverShapeStrip`)
     *   3. the queue chip           → `queueChipAt`    (via `isOverShapeStrip`)
     *   4. the CARRY READOUT plate  → `isOverCarryBill` (via `isOverBandSurface`)  ← the miss
     *   5. the tower card plate     → `cardAt`
     *   6. the COLLAPSE TAB plate   → `isOverCollapseTab` (via `isOverChip`)   ← S187
     *   7. the POWER OF RA plate    → `isOverRaButton` (via `isOverChip`, both states)  ← S188 P6
     *   8. the POWER OF RA sun disc → `isOverRaButton` — drawn INSIDE plate 7, same rectangle
     *      (S188 P11: now only the FALLBACK while the skill's picture has not loaded)
     *   9. a WRATH OF RA charge pip → `isOverRaButton` — drawn INSIDE plate 7, same rectangle ← P11
     *
     * ⚠ IF THIS GOES RED, DO NOT BUMP THE NUMBER. A sixth opaque fill means a sixth surface the
     * player cannot see through, and something must hit-test it before this test is updated — that
     * is the entire point. Add it to `isOverChip` if it is a CONTROL, or to `isOverBandSurface` if
     * it is a readout; the two questions are deliberately different (see `isOverBandSurface`).
     */
    const src = readFileSync(new URL('./footerBand.ts', import.meta.url), 'utf8');
    const fills = src.match(/\.fill\(\{/g) ?? [];
    expect(
      fills.length,
      `the band now fills ${fills.length} opaque rectangles, not 9 — register the new one in ` +
        '`isOverChip` (a control) or `isOverBandSurface` (a readout) BEFORE updating this count',
    ).toBe(9);
    /*
     * ⭐ S188 P6 — 6 → 8, and again the rule was followed: both new fills are the POWER OF RA
     * button (its plate, and the sun disc drawn inside that plate), hit-tested by `isOverRaButton`,
     * which `isOverChip` asks FIRST in both collapse states (and `isOverBandSurface` likewise), so the
     * compact button beside the collapsed tab is as solid as the full one. Behavioural proof of the
     * rectangle is in `footerRaButton.test.ts`.
     *
     * ⭐ S188 P11 — 8 → 9, the same rule: the ninth is the WRATH OF RA charge pip, drawn inside the
     * skill's square (on the overlay above its picture) and hit-tested by that square's
     * `isOverRaButton`. The picture itself is a Sprite, not a fill, and sits inside the same square.
     */
    /*
     * ⭐ S187 — 5 → 6, AND THE RULE ABOVE WAS FOLLOWED RATHER THAN THE NUMBER BUMPED. The sixth is
     * the collapse tab, a CONTROL, hit-tested by `isOverCollapseTab` and folded into `isOverChip`
     * (so the cursor offers it) AND into `isOverBandSurface`'s collapsed branch (so nothing is
     * planted on top of the one control that brings the menu back). This test went red on the new
     * fill before any of that was written, which is exactly what it is for.
     */
    // Anti-vacuity: every hit-test that pairs with them must still be named in this file.
    for (const fn of ['chipAt(', 'paletteAt(', 'queueChipAt(', 'cardAt(', 'isOverCarryBill(', 'isOverCollapseTab(', 'isOverRaButton(']) {
      expect(src, `${fn} is what makes one of those five fills clickable-or-blocking`).toContain(fn);
    }
  });

  it('⛔ AND IT DOES NOT TAKE BACK THE GROUND ITEM 1 GAVE — the band stays mostly live board', () => {
    /*
     * The over-correction guard. Item 1 exists so the owner can build on the ground beside the
     * queue; a fix for the plate that swallowed the WHOLE band would quietly undo it, and no other
     * assertion here would notice. The plate is a ~154 px block in a fixed place — everything else
     * on the band's midline must still be board.
     */
    const chips = layoutChips(footerBandModel(playingWorld()));
    const carry = layoutCarryBill(chips, WIDEST)!;
    const plateL = carry.left - CARRY_PLATE_PAD;
    const plateR = carry.right + CARRY_PLATE_PAD;
    // The far-left stretch of the band — where a wide, flat recipe now legally lands — is untouched.
    expect(plateL).toBeGreaterThan(300);
    // …and the plate is a small share of a 1920-wide band, not a curtain across it.
    expect(plateR - plateL).toBeLessThan(CANVAS_WIDTH / 6);
  });

  it('⛔ and it clears the open CARD MENU, which draws ABOVE the band on the same x range', () => {
    // The cards float over the board just above the chip row. The readout is on the chip row's own
    // midline, so the two must not meet vertically — a plate drawn over an open card would be S181's
    // "drew on top of an existing row" defect in a new place.
    const w = playingWorld();
    const chips = layoutChips(footerBandModel(w));
    const carry = layoutCarryBill(chips, WIDEST)!;
    const cards = layoutCards(w, blueprintCost('stinkTower'), chips[0].y);
    expect(cards.length).toBeGreaterThan(0); // anti-vacuity
    const plateTop = carry.y - CHIP_H_FOR_TEST / 2;
    for (const card of cards) {
      expect(card.y + card.h, `card ${card.id} bottom`).toBeLessThanOrEqual(plateTop);
    }
  });

  it('grows LEFTWARD as a bill names more shapes — the right edge never moves', () => {
    const chips = layoutChips(footerBandModel(playingWorld()));
    const one = layoutCarryBill(chips, 1)!;
    const three = layoutCarryBill(chips, WIDEST)!;
    expect(three.right).toBe(one.right);
    expect(three.left).toBeLessThan(one.left);
    // …and even a bill naming every primitive stays clear of the corner porch at x = 130.
    expect(layoutCarryBill(chips, 6)!.left).toBeGreaterThan(200);
  });

  it('sits on the chip row\'s own midline, inside the band', () => {
    const chips = layoutChips(footerBandModel(playingWorld()));
    const carry = layoutCarryBill(chips, WIDEST)!;
    const chipMid = chips[0].y + chips[0].h / 2;
    expect(carry.y).toBe(chipMid);
    expect(carry.y - CHIP_H_FOR_TEST / 2).toBeGreaterThanOrEqual(FOOTER_TOP_Y);
    expect(carry.y + CHIP_H_FOR_TEST / 2).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it('its pairs are the SHARED row geometry, never a second copy of the arithmetic', () => {
    const chips = layoutChips(footerBandModel(playingWorld()));
    const carry = layoutCarryBill(chips, WIDEST)!;
    const row = glyphCountRowLayout(WIDEST, { glyphR: SHORTFALL_GLYPH_R });
    expect(carry.slots).toEqual(row.slots);
    // The block is exactly the word + the prefix gap + that row — nothing measured twice.
    expect(carry.right - carry.left).toBe(carry.pairsLeft - carry.left + row.width);
  });

  it('⛔ ADVANCES THE LAYOUT CURSOR — the card labels count from after this block', () => {
    /*
     * S181's defect verbatim: a block that draws but leaves the cursor where it was, so the next
     * block lands on top of it. Here the cursor is the pooled-label index, which no pure function
     * exposes — so this is the source-text half, and it is the half that catches a regression.
     */
    const src = readFileSync(new URL('./footerBand.ts', import.meta.url), 'utf8');
    expect(src).toContain('return this.carryLabelBase() + CARRY_LABELS;');
    expect(src).toContain('const CARRY_LABELS = 1 + SHORTFALL_MAX_SHAPES;');
    // And the unused tail of the fixed reservation is hidden BY HAND, like the badge block's.
    expect(src).toContain('for (let k = 0; k < CARRY_LABELS; k++) this.labelAt(carryBase + k).visible = false;');
  });
});

describe('S182 — the bill is the model\'s, and the model has exactly one', () => {
  it.each(ALL_BLUEPRINT_IDS.filter((id) => !id.startsWith('t3Tower') && !id.startsWith('t9Tower')))(
    '%s: the row\'s bill IS blueprintBill, whole, in ALL_SPARK_TYPES order',
    (id) => {
      const w = playingWorld();
      const row = structureRowFor(w, id)!;
      expect(row, 'a GLOBAL tower is visible to every seat').not.toBeNull();
      const expected = ALL_SPARK_TYPES
        .filter((t) => blueprintBill(id).has(t))
        .map((t) => ({ type: t, need: blueprintBill(id).get(t)!, have: 0 }));
      expect(row.bill).toEqual(expected);
    },
  );

  it('⛔ `missing` is a FILTER of `bill`, never a parallel walk', () => {
    const w = playingWorld(); // the bank opens EMPTY, so everything is short
    for (const row of castleStructuresModel(w)) {
      expect(row.missing.length).toBeGreaterThan(0); // anti-vacuity
      for (const m of row.missing) {
        expect(row.bill).toContainEqual(m);
      }
      expect(row.bill.length).toBeGreaterThanOrEqual(row.missing.length);
    }
  });

  it('⭐ and the bill SURVIVES becoming affordable — which is when the carry readout needs it', () => {
    // The structural reason `missing` could not be reused: it empties exactly when you pick the
    // tower up. Bank the stink tower's bill and watch one array empty while the other does not.
    const w = playingWorld();
    for (let i = 0; i < 1; i++) bankAdd(w.castleBanks, w.localPlayerId, SparkType.Square);
    for (let i = 0; i < 3; i++) bankAdd(w.castleBanks, w.localPlayerId, SparkType.Circle);
    const row = structureRowFor(w, 'stinkTower')!;
    expect(row.enabled).toBe(true);
    expect(row.missing).toEqual([]);
    expect(row.bill).toEqual([
      { type: SparkType.Square, need: 1, have: 1 },
      { type: SparkType.Circle, need: 3, have: 3 },
    ]);
  });
});

void P0;
