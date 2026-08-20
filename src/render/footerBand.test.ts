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

import { CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y, PLAYER_COLORS } from '../constants.ts';
import { ALL_BLUEPRINT_IDS, blueprintCost } from '../state/blueprints.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { GATHERER_DEPOSIT_OFFSET_Y } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { zoneCount, type ZoneLayout } from '../state/zones.ts';
import { footerBandModel, structuresAtComplexity } from './footerBandModel.ts';
import { layoutChips, legendAnchor } from './footerBand.ts';

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

  it('every registry recipe lands in exactly one bucket — nothing is dropped or double-counted', () => {
    const model = footerBandModel(playingWorld());
    const counted = model.reduce((n, c) => n + c.total, 0);
    expect(counted).toBe(ALL_BLUEPRINT_IDS.length);
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

/**
 * S150 P1 — THE SHAPE KEY MOVED INTO THIS STRIP, so this file now owns its clearance.
 *
 * Owner: *"the game screen itself has non coherent parts (text/the shapes on the top left)"*. Those
 * shapes are the six-sprite type key, and they were being drawn INSIDE leaderboard row 0 — measured
 * on a live stage dump as legend x 14–132 / y 10–22 against score-row x 12–170 / y 12–28. It moved
 * down here because the band is already the build-reference strip: connector counts and "what shape
 * is what type" are the same kind of information, and one strip is one rule to learn.
 *
 * The anchor is DERIVED from the live chip row (`legendAnchor`) rather than fixed, because
 * `layoutChips` re-centres the row: every complexity tier added to the recipe registry marches the
 * row's left edge 38 px further LEFT. A hardcoded x that clears five chips would silently sit under
 * the sixth. These assertions pin the derivation, not a number.
 */
describe('S150 P1 — the six-shape type key clears everything else in the bottom strip', () => {
  const CHIP_ROW = () => layoutChips(footerBandModel(playingWorld()));
  // Mirrors renderer.ts LEGEND_WIDTH / LEGEND_SPRITE_STEP. Kept local so a change there that
  // narrows the key cannot silently relax this test.
  const STEP = 22;
  const SPAN = 5 * STEP + STEP * 2;
  const keyRect = (chips: ReturnType<typeof layoutChips>) => {
    const a = legendAnchor(chips);
    return { x: a.x - STEP, y: a.y - 12, w: SPAN, h: 24 };
  };

  it('sits to the LEFT of the first connector chip, with real breathing room', () => {
    const chips = CHIP_ROW();
    const key = keyRect(chips);
    const firstChipX = Math.min(...chips.map((c) => c.x));
    expect(key.x + key.w).toBeLessThan(firstChipX);
    expect(firstChipX - (key.x + key.w)).toBeGreaterThanOrEqual(20);
  });

  it('never overlaps ANY chip, at any registry size the layout can produce', () => {
    // Sweep 1..8 tiers: the real registry has 5 today, and `layoutChips` re-centres on every
    // change, so the interesting question is whether the derivation holds as the row grows.
    for (let n = 1; n <= 8; n++) {
      const chips = layoutChips(
        Array.from({ length: n }, (_, i) => ({ complexity: i + 3, total: 1, affordable: 0, enabled: false })),
      );
      const key = keyRect(chips);
      for (const c of chips) {
        const hit =
          key.x < c.x + c.w && c.x < key.x + key.w && key.y < c.y + c.h && c.y < key.y + key.h;
        expect(hit, `${n} tiers: the type key overlaps chip ${c.complexity}`).toBe(false);
      }
    }
  });

  it('clears the bottom-LEFT castle porch and the controls help line', () => {
    const key = keyRect(CHIP_ROW());
    // The seat-3 porch sits at (130, 1024) on QUADRANTS_4P — see this file's header.
    expect(key.x).toBeGreaterThan(130 + 60);
    // The help line runs x 10–591 at y 1058–1070 (measured live). The key is vertically clear of
    // it, which is what lets the strip hold both without either moving.
    expect(key.y + key.h).toBeLessThan(1058);
  });

  it('stays on canvas even with a single chip in the row', () => {
    const key = keyRect(layoutChips([{ complexity: 4, total: 1, affordable: 0, enabled: false }]));
    expect(key.x).toBeGreaterThan(0);
    expect(key.y).toBeGreaterThan(FOOTER_TOP_Y - 12);
    expect(key.y + key.h).toBeLessThan(CANVAS_HEIGHT);
  });
});

void P0;
