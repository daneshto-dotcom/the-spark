/**
 * SPARK — S103 P3 (#9) laser-turret recipe tests.
 *
 * Covers the strict 1-Line + 7-Spiral-leaf star predicate (reject 6 / 8 leaves, a non-Spiral leaf,
 * a leaf bonded elsewhere, an extra attached shape), the buildable-anchor scan (skips already-live
 * defenders + ascending-id determinism), and that the predicate yields the Line as the anchor/pos.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { PLAYER_COLORS, SparkType } from '../../constants.ts';
import { asBondId, asCreatureId, asDefenderId, asPlayerId, asPrimitiveId, asSpawnerId, type PrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { isLaserTurretComponent, laserTurretPredicate } from './laserTurret.ts';
import { findDefenderMatches } from './index.ts';
import { applyDefenderTick, applyRegisterDefender } from '../defenders/defenderLifecycle.ts';
import { getDefenderConfig } from '../defenders/defender.ts';
import { makeCreature } from '../creatures/creature.ts';
import { CHEWER_CONFIG } from '../creatures/voltkin-config.ts';

const P0 = asPlayerId(0);

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id), type, placerColor: PLAYER_COLORS[0], placedBy: P0,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[0], lastOwnershipChange: 0, radius: 8,
  };
  w.primitives.set(p.id, p);
  return p;
}

function bond(w: World, id: number, a: Primitive, b: Primitive): void {
  const bd: Bond = { id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0 };
  w.bonds.set(bd.id, bd);
  a.bonds.add(bd.id);
  b.bonds.add(bd.id);
}

/** Build a Line hub (id=lineId) with `leaves` leaf primitives of `leafType` bonded to it. */
function buildTurret(w: World, lineId: number, leaves: number, leafType: SparkType = SparkType.Spiral): PrimitiveId {
  const hub = addPrim(w, lineId, SparkType.Line, 200, 200);
  for (let i = 0; i < leaves; i++) {
    const leaf = addPrim(w, lineId + 100 + i, leafType, 200 + 30 * Math.cos(i), 200 + 30 * Math.sin(i));
    bond(w, lineId * 10 + i, hub, leaf);
  }
  return hub.id;
}

describe('isLaserTurretComponent — strict 1-Line + 7-Spiral-leaf star', () => {
  it('accepts exactly 1 Line(deg7) + 7 Spiral leaves', () => {
    const w = setup();
    const line = buildTurret(w, 1, 7);
    expect(isLaserTurretComponent(w, line)).toBe(true);
  });

  it('rejects 6 leaves (degree 6) and 8 leaves (degree 8)', () => {
    const w6 = setup();
    expect(isLaserTurretComponent(w6, buildTurret(w6, 1, 6))).toBe(false);
    const w8 = setup();
    expect(isLaserTurretComponent(w8, buildTurret(w8, 1, 8))).toBe(false);
  });

  it('rejects when a leaf is the wrong type (a Circle instead of a Spiral)', () => {
    const w = setup();
    const hub = addPrim(w, 1, SparkType.Line, 200, 200);
    for (let i = 0; i < 6; i++) bond(w, 100 + i, hub, addPrim(w, 200 + i, SparkType.Spiral, 230, 200 + i));
    bond(w, 199, hub, addPrim(w, 299, SparkType.Circle, 170, 200)); // 7th leaf is a Circle
    expect(isLaserTurretComponent(w, hub.id)).toBe(false);
  });

  it('rejects an EXTRA attached shape (a leaf bonded to an external prim grows the component past 8)', () => {
    const w = setup();
    const line = buildTurret(w, 1, 7);
    // Attach an external Dot to one leaf → the component grows to 9 → size mismatch → reject.
    const leaf = w.primitives.get(asPrimitiveId(101))!;
    bond(w, 9999, leaf, addPrim(w, 5000, SparkType.Dot, 260, 260));
    expect(isLaserTurretComponent(w, line)).toBe(false);
  });

  it('TOLERATES inter-leaf auto-bonds (Council CHECK — fixes the dense-7-leaf silent no-build)', () => {
    const w = setup();
    const line = buildTurret(w, 1, 7);
    // AUTO_BOND can bond two adjacent Spiral leaves together → a leaf of degree 2, but still
    // 8 prims / hub degree 7 / all Spirals → it IS a valid turret (was a frequent silent no-build).
    const a = w.primitives.get(asPrimitiveId(101))!;
    const b = w.primitives.get(asPrimitiveId(102))!;
    bond(w, 8888, a, b);
    expect(isLaserTurretComponent(w, line)).toBe(true);
  });

  it('returns false when the anchor is not a Line', () => {
    const w = setup();
    addPrim(w, 1, SparkType.Triangle, 200, 200);
    expect(isLaserTurretComponent(w, asPrimitiveId(1))).toBe(false);
  });
});

describe('laserTurretPredicate', () => {
  it('yields the Line as the anchor + its pos', () => {
    const w = setup();
    buildTurret(w, 1, 7);
    const match = laserTurretPredicate(w, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.anchorPrimitiveId).toBe(asPrimitiveId(1));
    expect(match!.triggererPlayerId).toBe(P0);
    expect(match!.pos).toEqual({ x: 200, y: 200 });
  });

  it('skips an anchor that is already a live defender (no double-build; rebuild after removal)', () => {
    const w = setup();
    buildTurret(w, 1, 7);
    // Mark the Line as already a live defender → predicate must skip it (returns null, no 2nd turret).
    w.defenders.set(asDefenderId(0), {
      id: asDefenderId(0), kind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
      recipeId: 'laserTurret', pos: { x: 200, y: 200 }, state: 'IDLE', ticksInState: 0, hp: 1,
      nextFireTick: 0, targetCreatureId: null, lastStrikePos: null,
    });
    expect(laserTurretPredicate(w, { x: 0, y: 0 })).toBeNull();
  });

  it('end-to-end: geometry → findDefenderMatches → REGISTER_DEFENDER → the turret FIRES + kills a chewer', () => {
    const w = setup();
    buildTurret(w, 1, 7);
    w.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));
    const chewer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(70), ownerPlayerId: asPlayerId(1),
      pos: { x: 260, y: 200 }, targetPos: { x: 260, y: 200 }, spawnedAtTick: 0, sourceSpawnerId: asSpawnerId(1),
    });
    w.creatures.set(chewer.id, chewer);

    // The laserTurret.ts import registered the recipe → the ignition matcher finds it.
    const m = findDefenderMatches(w, { x: 0, y: 0 }).find((x) => x.recipe.id === 'laserTurret');
    expect(m).toBeDefined();
    applyRegisterDefender(w, {
      type: 'REGISTER_DEFENDER', defenderKind: m!.recipe.defenderKind,
      ownerPlayerId: m!.match.triggererPlayerId, anchorPrimitiveId: m!.match.anchorPrimitiveId,
      recipeId: m!.recipe.id, pos: m!.match.pos,
    });
    const d = [...w.defenders.values()][0];
    expect(d.kind).toBe('turret');
    d.nextFireTick = w.tick; // fire ASAP (skip the 30s charge for the test)

    for (let i = 0; i < getDefenderConfig('turret').windupTicks + 4; i++) {
      applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: d.id });
      w.tick++;
    }
    expect(w.creatures.has(asCreatureId(70))).toBe(false); // the beam killed the chewer (hp 1)
  });
});
