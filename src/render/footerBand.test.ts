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

import { CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y, PLAYER_COLORS, SparkType } from '../constants.ts';
import { ALL_BLUEPRINT_IDS, blueprintCost } from '../state/blueprints.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { GATHERER_DEPOSIT_OFFSET_Y } from '../constants.ts';
import { asPlayerId } from '../types.ts';
// S166 — the footer derives from the panel model, so the bucket total is asserted against it.
// S173 — and the card's "WHICH shapes" readout is that same model's shortfall, unsummed.
import { castleStructuresModel, shortfallEntries } from './castlePanel.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { zoneCount, type ZoneLayout } from '../state/zones.ts';
import { footerBandModel, structuresAtComplexity } from './footerBandModel.ts';
import { layoutCards, layoutChips } from './footerBand.ts';

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

void P0;
