/**
 * SPARK — S144 P3: where a tower may be put down.
 *
 * `stampRefusalAt` is consumed by BOTH the drag ghost (to tint itself and name the blocker) and the
 * host reducer (to authorise the build). These tests pin the refusals that protect the sim, not just
 * the ones that protect the fiction:
 *
 *   • QUARRY — `enforceSpawnerBounds` rim-snaps any non-escrowed spark out of the spawn disc every
 *     substep, so geometry stamped there would be physically ejected.
 *   • BLOCKED — measured by BOND REACH, not overlap. A structure born within `AUTO_BOND_RADIUS` of
 *     existing shapes is one ordinary placement away from having a chord auto-bonded onto it, which
 *     kills the exact-degree recipes; and overlapping geometry makes the solver shove the new nodes
 *     apart, straining fresh bonds until one breaks and the recipe stops holding.
 *   • OFF SCREEN — the whole FOOTPRINT, not the centre. voltkin is 304 px wide; a centre-only check
 *     would let three quarters of a chain hang off the arena.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from './world.ts';
import { makeIdlePlayer } from '../game/player.ts';
import {
  AUTO_BOND_RADIUS,
  STAMP_CLEARANCE, CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y, PLAYER_COLORS, PRIMITIVE_MAX_HP,
  SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS, SparkType,
} from '../constants.ts';
import { asPlayerId, asPrimitiveId, type Vec2 } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import { ALL_BLUEPRINT_IDS, blueprintExtent, blueprintPositions, blueprintRadius } from './blueprints.ts';
import { canStampAt, stampRefusalAt } from './blueprintLegality.ts';
import { CASTLE_NO_BUILD_RADIUS, zoneCastleAnchor, zoneCount, type ZoneLayout } from './zones.ts';
import type { Primitive } from '../game/primitive.ts';

const P0 = asPlayerId(0);
/** Far from the quarry (960,540 r125) and clear of every edge even for voltkin. */
const CLEAR: Vec2 = { x: 300, y: 300 };
/**
 * S182 — px per sample in the quarry-boundary sweeps below. The sweeps report the FIRST legal
 * sample, so the true boundary lies within one step behind it; every comparison is therefore made
 * against `first - QUARRY_SWEEP_STEP`, the last sample that was actually refused. Asserting on the
 * first legal sample instead is off by up to one step and fails for the two recipes whose boundary
 * lands exactly on a sample.
 */
const QUARRY_SWEEP_STEP = 0.5;

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.localPlayerId = P0;
  return w;
}

function addPrimitive(w: World, id: number, pos: Vec2): void {
  const p: Primitive = {
    id: asPrimitiveId(id), type: SparkType.Circle, placerColor: PLAYER_COLORS[0], placedBy: P0,
    createdTick: 0, pos, prevPos: pos, bonds: new Set(),
    ownerColor: PLAYER_COLORS[0], lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
}

describe('stampRefusalAt', () => {
  it.each(ALL_BLUEPRINT_IDS)('%s: an empty arena far from the quarry is legal', (id) => {
    expect(stampRefusalAt(setup(), CLEAR, P0, id)).toBeNull();
    expect(canStampAt(setup(), CLEAR, P0, id)).toBe(true);
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: the quarry centre is refused', (id) => {
    const w = setup();
    expect(stampRefusalAt(w, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, P0, id)).toBe('QUARRY');
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: the quarry is refused by FOOTPRINT, not just by centre', (id) => {
    /*
     * ⭐ S182 — PROBED AGAINST THE **BOUNDARY THE PREDICATE ACTUALLY HAS**, not against an offset
     * derived from its internals. This assertion has now been re-pinned twice in one session — once
     * off `blueprintRadius`, once off `blueprintExtent().minDx` — and both times because it encoded
     * the implementation rather than the claim. The claim is only this: there exists a band where
     * the CENTRE is outside the quarry and the stamp is still refused. So find the boundary by
     * sweeping, then assert the band exists and is non-empty.
     */
    const w = setup();
    const rim = SPAWNER_CENTER_X + SPAWNER_RADIUS;
    let firstLegal = Infinity;
    for (let x = SPAWNER_CENTER_X; x < SPAWNER_CENTER_X + 420; x += QUARRY_SWEEP_STEP) {
      if (stampRefusalAt(w, { x, y: SPAWNER_CENTER_Y }, P0, id) !== 'QUARRY') { firstLegal = x; break; }
    }
    expect(firstLegal).toBeLessThan(Infinity); // anti-vacuity: the sweep escapes the quarry
    // The refusal reaches PAST the rim — i.e. it is measured on the footprint, not on the centre.
    expect(firstLegal).toBeGreaterThan(rim);
    // And one step inside that boundary, with the centre already clear of the disc, it IS refused.
    const inBand = firstLegal - QUARRY_SWEEP_STEP;
    expect(inBand).toBeGreaterThan(rim); // the probe really is outside the disc
    expect(stampRefusalAt(w, { x: inBand, y: SPAWNER_CENTER_Y }, P0, id)).toBe('QUARRY');
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: a footprint that truly clears the quarry rim is NOT refused', (id) => {
    // The complement, and the half that has teeth: past the boundary the stamp is legal. Under the
    // old `SPAWNER_RADIUS + circumradius` disc this point was still QUARRY for every wide recipe.
    const w = setup();
    let firstLegal = Infinity;
    for (let x = SPAWNER_CENTER_X; x < SPAWNER_CENTER_X + 420; x += QUARRY_SWEEP_STEP) {
      if (stampRefusalAt(w, { x, y: SPAWNER_CENTER_Y }, P0, id) !== 'QUARRY') { firstLegal = x; break; }
    }
    expect(stampRefusalAt(w, { x: firstLegal, y: SPAWNER_CENTER_Y }, P0, id)).not.toBe('QUARRY');
    // ⭐ AND IT IS STRICTLY BETTER THAN THE CIRCUMRADIUS IT REPLACED, on this axis too.
    const lastRefused = firstLegal - QUARRY_SWEEP_STEP - SPAWNER_CENTER_X;
    expect(lastRefused).toBeLessThanOrEqual(SPAWNER_RADIUS + blueprintRadius(id));
  });

  it.each(ALL_BLUEPRINT_IDS)(
    '%s: ⛔ THE DIAGONAL — the quarry arm never refuses ground the circumradius allowed',
    (id) => {
      /*
       * ⛔⛔ THE REGRESSION THIS PINS WAS SHIPPED AND THEN CAUGHT BY AN ADVERSARIAL REVIEW OF THIS
       * BRANCH. The first cut tested the footprint's BOUNDING BOX against the quarry disc. A box's
       * CORNER lies farther from the centre than the outermost node does, so on the diagonals it
       * refused MORE ground than the old circumradius — in a change whose entire purpose was to
       * stop refusing ground. Measured then, along the 45° ray: pentagram 177.0 → 191.7,
       * goblinTower 181.0 → 204.2, the six t9 towers 201.0 → 229.1.
       *
       * ⚠ AND THE SUITE COULD NOT SEE IT, which is the real lesson. Every other quarry assertion in
       * this file probes the **+x axis**, the one direction in which a box and a circumradius agree
       * exactly. A per-recipe diagonal sweep is the cheapest thing that would have caught it, so it
       * is now the standing guard.
       */
      const w = setup();
      const oldReach = SPAWNER_RADIUS + blueprintRadius(id);
      // Walk outward along the up-left diagonal (inside seat 0's own ground on PITCH_2P) and find
      // the first distance at which the QUARRY arm stops firing.
      let newReach = Infinity;
      for (let d = 80; d < 420; d += QUARRY_SWEEP_STEP) {
        const c = {
          x: SPAWNER_CENTER_X - d / Math.SQRT2,
          y: SPAWNER_CENTER_Y - d / Math.SQRT2,
        };
        if (stampRefusalAt(w, c, P0, id) !== 'QUARRY') { newReach = d; break; }
      }
      expect(newReach).toBeLessThan(Infinity); // anti-vacuity: the sweep really does escape
      const lastRefused = newReach - QUARRY_SWEEP_STEP;
      expect(
        lastRefused,
        `${id}: the quarry arm still refuses at ${lastRefused.toFixed(1)}px on the diagonal, past ` +
          `the ${oldReach.toFixed(1)}px the circumradius reached — it has TAKEN ground, not given it`,
      ).toBeLessThanOrEqual(oldReach);
    },
  );

  it.each(ALL_BLUEPRINT_IDS)('%s: every canvas edge is refused by footprint', (id) => {
    const w = setup();
    /*
     * ⛔ S186 — RE-DERIVED FROM `blueprintExtent`, AND THE OLD FORM WAS A LATENT TEST BUG THAT THE
     * `EDGE_PAD` CHANGE EXPOSED RATHER THAN CAUSED.
     *
     * The fifth probe used `blueprintRadius(id)` — the CIRCUMRADIUS — while the rule it probes uses
     * `blueprintExtent(id).minDx`, the true horizontal reach. Where a recipe's widest arm is not its
     * longest the two differ (laserTurret: circumradius 56 vs minDx −50.105), so at a pad of 8 the
     * probe landed outside the legal area anyway and the mismatch never showed. At pad 0 it stops
     * refusing for NINE of nineteen recipes — the six tier-3 race towers, stinkTower, laserTurret and
     * helga — not because the rule regressed but because the probe was in the wrong place.
     *
     * Now derived from the same function the rule uses, so the two cannot drift apart again.
     */
    const minDx = blueprintExtent(id).minDx;
    for (const centre of [
      { x: 2, y: 300 },
      { x: CANVAS_WIDTH - 2, y: 300 },
      { x: 300, y: 2 },
      { x: 300, y: CANVAS_HEIGHT - 2 },
      // The outermost NODE one hair outside the edge — what a centre-only check would wrongly allow.
      { x: -minDx - 4, y: 300 },
    ]) {
      expect(stampRefusalAt(w, centre, P0, id)).toBe('OFF SCREEN');
    }
  });

  /**
   * ⭐ S185 — re-pinned from AUTO_BOND_RADIUS (60) to STAMP_CLEARANCE (24), the owner-ruled margin.
   * The literal is DERIVED from the constant rather than written out, so the next retune cannot
   * half-land: move the constant and this test moves with it.
   *
   * ⚠ The probe is placed relative to the NEAREST NODE, not to the centre. The old version put a
   * primitive `AUTO_BOND_RADIUS - 6` from the CENTRE and relied on that also being inside some
   * node's reach — true at 60, coincidence at 24. Measuring from the node is what the arm actually
   * does.
   */
  it('existing geometry within STAMP_CLEARANCE of a node is BLOCKED', () => {
    const w = setup();
    const node = blueprintPositions('stinkTower', CLEAR)[0]!;
    addPrimitive(w, 1, { x: node.x + STAMP_CLEARANCE - 2, y: node.y });
    expect(stampRefusalAt(w, CLEAR, P0, 'stinkTower')).toBe('BLOCKED');
  });

  /**
   * ⛔ THE CONTROL THAT MAKES THE CHANGE MEAN SOMETHING, and the one he actually asked for. A shape
   * just OUTSIDE the new clearance must be allowed — under the old 60 px margin this exact position
   * was refused, and that refusal is what he photographed: *"this is where I should be able to put
   * it, right behind it."* If someone restores the old margin, this goes red.
   */
  it('⭐ S185 — and just OUTSIDE it is ALLOWED, which was refused before the ruling', () => {
    const w = setup();
    const node = blueprintPositions('stinkTower', CLEAR)[0]!;
    addPrimitive(w, 1, { x: node.x + STAMP_CLEARANCE + 2, y: node.y });
    expect(stampRefusalAt(w, CLEAR, P0, 'stinkTower')).toBeNull();
    expect(STAMP_CLEARANCE).toBeLessThan(AUTO_BOND_RADIUS);
  });

  it('geometry beyond bond reach of EVERY node is allowed', () => {
    const w = setup();
    // Clear of the whole footprint, not merely of the centre — the footprint is what gets stamped.
    addPrimitive(w, 1, { x: CLEAR.x + blueprintRadius('stinkTower') + AUTO_BOND_RADIUS + 10, y: CLEAR.y });
    expect(stampRefusalAt(w, CLEAR, P0, 'stinkTower')).toBeNull();
  });

  it('a LEAF within bond reach blocks even when the centre is clear', () => {
    const w = setup();
    // The crux of measuring against the footprint: nothing is near the centre, but a leaf lands on
    // top of this primitive. A centre-only clearance check would pass and the tower would be born
    // fused to a neighbour — breaking the exact-degree recipes.
    const leafish = { x: CLEAR.x, y: CLEAR.y - 44 }; // STAR_R straight up = node 1
    addPrimitive(w, 1, leafish);
    expect(stampRefusalAt(w, CLEAR, P0, 'stinkTower')).toBe('BLOCKED');
  });

  it('refusal reasons are stable, player-facing strings', () => {
    // The ghost prints these verbatim, so they must stay short and legible — the panel's
    // "a disabled thing names its blocker" contract, applied to the cursor.
    const w = setup();
    const reasons = new Set<string>();
    reasons.add(stampRefusalAt(w, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, P0, 'stinkTower')!);
    reasons.add(stampRefusalAt(w, { x: 2, y: 2 }, P0, 'stinkTower')!);
    addPrimitive(w, 1, CLEAR);
    reasons.add(stampRefusalAt(w, CLEAR, P0, 'stinkTower')!);
    for (const r of reasons) {
      expect(r).toMatch(/^[A-Z ]+$/);
      expect(r.length).toBeLessThanOrEqual(14);
    }
  });

  it('the CASTLE refusal is a stable, player-facing string too', () => {
    const w = setup();
    const r = stampRefusalAt(w, zoneCastleAnchor(0, w.layout), P0, 'stinkTower')!;
    expect(r).toBe('CASTLE');
    expect(r).toMatch(/^[A-Z ]+$/);
    expect(r.length).toBeLessThanOrEqual(14);
  });
});

/* ========================================================================== *
 *   ⭐⭐ S182 ITEM 1 (owner) — THE GROUND BY THE QUEUE
 * ========================================================================== */

describe('S182 — a blueprint is not a disc: the bottom of the board is buildable again', () => {
  /*
   * > *"Where the queue is with all the shapes — in that area you can't place towers. That's weird.
   * > You should be able to place them out there."*
   *
   * The footer band occupies `FOOTER_TOP_Y`…`CANVAS_HEIGHT` and the shape queue sits inside it.
   * VOLTKIN is 280 px wide and 0 px tall, so the old circumradius margin (140 + 12) refused it
   * across that whole band AND 68 px of clear ground above it.
   */
  const FLAT: GodlyId = 'voltkin';

  it('anti-vacuity — the old circumradius rule DID refuse this point', () => {
    // Derived from the shipped constant, so this cannot rot into an assertion about nothing: if
    // voltkin's circumradius ever shrinks below the band, the premise is gone and this fails loudly.
    const y = CANVAS_HEIGHT - 24;
    expect(y + blueprintRadius(FLAT)).toBeGreaterThan(CANVAS_HEIGHT - 8);
    expect(y).toBeGreaterThan(FOOTER_TOP_Y); // and it really is in the footer band
  });

  it('a wide, FLAT blueprint is legal on the ground beside the queue', () => {
    const w = setup();
    // x = 300 keeps it in seat 0's zone on PITCH_2P, clear of the centred chip row and of the keep.
    expect(stampRefusalAt(w, { x: 300, y: CANVAS_HEIGHT - 24 }, P0, FLAT)).toBeNull();
  });

  it('⛔ and the footprint still may NOT hang off the arena — the safety direction holds', () => {
    const w = setup();
    // Four px from the bottom edge: the margin alone puts the nodes past it.
    expect(stampRefusalAt(w, { x: 300, y: CANVAS_HEIGHT - 4 }, P0, FLAT)).toBe('OFF SCREEN');
    // And a TALL recipe gains nothing at the same y — the box is per-side, not a blanket loosening.
    expect(stampRefusalAt(w, { x: 300, y: CANVAS_HEIGHT - 24 }, P0, 'lightningHub')).toBe('OFF SCREEN');
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: the extent never claims less space than the circumradius allows', (id) => {
    /*
     * ⛔ THE SAFETY INVARIANT, ASSERTED FOR EVERY RECIPE FROM THE LIVE TABLE. The extent must be a
     * SUBSET of the circumradius disc's bounding box in every direction — i.e. the change can only
     * ever hand back ground the stamp does not occupy, never claim that a node sits somewhere it
     * does not. A retune that broke this would allow geometry off the arena.
     */
    const e = blueprintExtent(id);
    const r = blueprintRadius(id);
    expect(e.maxDx).toBeLessThanOrEqual(r);
    expect(e.maxDy).toBeLessThanOrEqual(r);
    expect(-e.minDx).toBeLessThanOrEqual(r);
    expect(-e.minDy).toBeLessThanOrEqual(r);
    // And it is never degenerate: the margin alone guarantees a box on every side.
    expect(e.maxDx - e.minDx).toBeGreaterThan(0);
    expect(e.maxDy - e.minDy).toBeGreaterThan(0);
  });

  it('voltkin is the recipe that proves the two differ — measured, not assumed', () => {
    const e = blueprintExtent('voltkin');
    // 7 gaps of CHAIN_STEP 40 = 280 px wide, centred, plus 12 px of margin per side.
    expect(e.maxDx - e.minDx).toBe(280 + 24);
    // …and no vertical extent at all beyond the margin. THIS is the 140 px of ground it was losing.
    expect(e.maxDy - e.minDy).toBe(24);
    expect(blueprintRadius('voltkin')).toBe(152);
  });
});

/* ========================================================================== *
 *   ⭐⭐ S182 ITEM 2 (owner) — NOBODY BUILDS ON THE CASTLE
 * ========================================================================== */

describe('S182 — the castle keep-out, seen by the STAMP predicate', () => {
  const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];

  function setupOn(layout: ZoneLayout): World {
    const w = setup();
    w.layout = layout;
    return w;
  }

  for (const layout of LAYOUTS) {
    it(`${layout} — a stamp centred on ANY castle is refused as CASTLE`, () => {
      const w = setupOn(layout);
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = zoneCastleAnchor(seat, layout);
        // Asked as the OWNER of that ground, so the refusal cannot be ENEMY GROUND wearing a mask.
        expect(stampRefusalAt(w, a, asPlayerId(seat), 'stinkTower')).toBe('CASTLE');
      }
    });

    it(`${layout} — the keep-out is FOOTPRINT-aware, not centre-only`, () => {
      const w = setupOn(layout);
      const seat = 0;
      const a = zoneCastleAnchor(seat, layout);
      const e = blueprintExtent('voltkin');
      /*
       * The crux. Centre placed so the chain's near END lands 2 px inside the keep-out while the
       * CENTRE is well outside it — the case `canBuildAt`'s own centre-only castle arm would allow
       * and this predicate must not.
       */
      const centre = { x: a.x - e.minDx + CASTLE_NO_BUILD_RADIUS - 2, y: a.y };
      expect(centre.x - a.x).toBeGreaterThan(CASTLE_NO_BUILD_RADIUS); // the centre IS clear
      expect(stampRefusalAt(w, centre, asPlayerId(seat), 'voltkin')).toBe('CASTLE');
    });

    it(`${layout} — two px further out and the same stamp is no longer a CASTLE refusal`, () => {
      const w = setupOn(layout);
      const a = zoneCastleAnchor(0, layout);
      const e = blueprintExtent('voltkin');
      const centre = { x: a.x - e.minDx + CASTLE_NO_BUILD_RADIUS + 2, y: a.y };
      expect(stampRefusalAt(w, centre, asPlayerId(0), 'voltkin')).not.toBe('CASTLE');
    });
  }
});
