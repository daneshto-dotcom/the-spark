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
  AUTO_BOND_RADIUS, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, PRIMITIVE_MAX_HP,
  SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS, SparkType,
} from '../constants.ts';
import { asPlayerId, asPrimitiveId, type Vec2 } from '../types.ts';
import { ALL_BLUEPRINT_IDS, blueprintRadius } from './blueprints.ts';
import { canStampAt, stampRefusalAt } from './blueprintLegality.ts';
import type { Primitive } from '../game/primitive.ts';

const P0 = asPlayerId(0);
/** Far from the quarry (960,540 r125) and clear of every edge even for voltkin. */
const CLEAR: Vec2 = { x: 300, y: 300 };

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
    const w = setup();
    // Centre placed just outside the disc, but close enough that the footprint still overlaps it.
    const justOutside = { x: SPAWNER_CENTER_X + SPAWNER_RADIUS + blueprintRadius(id) - 4, y: SPAWNER_CENTER_Y };
    expect(stampRefusalAt(w, justOutside, P0, id)).toBe('QUARRY');
  });

  it.each(ALL_BLUEPRINT_IDS)('%s: every canvas edge is refused by footprint', (id) => {
    const w = setup();
    const r = blueprintRadius(id);
    for (const centre of [
      { x: 2, y: 300 },
      { x: CANVAS_WIDTH - 2, y: 300 },
      { x: 300, y: 2 },
      { x: 300, y: CANVAS_HEIGHT - 2 },
      // One radius INSIDE the edge minus a hair — the case a centre-only check would wrongly allow.
      { x: r - 4, y: 300 },
    ]) {
      expect(stampRefusalAt(w, centre, P0, id)).toBe('OFF SCREEN');
    }
  });

  it('existing geometry within bond reach is BLOCKED', () => {
    const w = setup();
    // Sitting just inside AUTO_BOND_RADIUS of the stamp centre.
    addPrimitive(w, 1, { x: CLEAR.x + AUTO_BOND_RADIUS - 6, y: CLEAR.y });
    expect(stampRefusalAt(w, CLEAR, P0, 'stinkTower')).toBe('BLOCKED');
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
});
