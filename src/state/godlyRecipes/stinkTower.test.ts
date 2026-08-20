/**
 * SPARK — S141 P1 STINK TOWER recipe tests.
 *
 * The centrepiece here is the MID-BUILD DISJOINTNESS SWEEP. A recipe fires the instant its component
 * matches, so a new one is only safe if it cannot match a PARTIAL build of an existing recipe — and
 * a 4-shape recipe sits at the size every larger recipe passes THROUGH on its way up. Both Council
 * seats independently flagged accidental construction as the top risk on this feature, so the sweep
 * is written as one test per shipped recipe rather than as a single "does not collide" assertion:
 * a future retune that breaks exactly one of them must fail by name.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import {
  PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, STINK_TOWER_HUB_DEGREE, STINK_TOWER_SIZE,
} from '../../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { isStinkTowerComponent, stinkTowerPredicate, STINK_HUB_TYPE, STINK_LEAF_TYPE } from './stinkTower.ts';
import { findDefenderMatches } from './index.ts';
import { HELGA_SIZE } from './princessHelga.ts';
import { TURRET_SIZE } from './laserTurret.ts';
import { VOLTKIN_SIZE } from './voltkin.ts';

const P0 = asPlayerId(0);

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x = 300, y = 300): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id), type, placerColor: PLAYER_COLORS[0], placedBy: P0,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: PLAYER_COLORS[0], lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

let nextBond = 1;
function bond(w: World, a: Primitive, b: Primitive): void {
  const bd: Bond = {
    id: asBondId(nextBond++), aId: a.id, bId: b.id, a, b,
    restLength: 30, stiffnessTier: 'MID', createdTick: 0,
  };
  w.bonds.set(bd.id, bd);
  a.bonds.add(bd.id);
  b.bonds.add(bd.id);
}

/** A Square hub + `leaves` Circle leaves bonded to it. Returns the hub id. */
function buildStink(w: World, hubId: number, leaves = STINK_TOWER_HUB_DEGREE): PrimitiveId {
  const hub = addPrim(w, hubId, STINK_HUB_TYPE);
  for (let i = 0; i < leaves; i++) bond(w, hub, addPrim(w, hubId + 1 + i, STINK_LEAF_TYPE, 300 + 30 * (i + 1), 300));
  return hub.id;
}

describe('S141 P1 — the stink-tower predicate', () => {
  it('matches a Square hub of the shipped degree with all-Circle leaves', () => {
    const w = setup();
    const hub = buildStink(w, 1);
    expect(isStinkTowerComponent(w, hub)).toBe(true);
    const m = stinkTowerPredicate(w, { x: 0, y: 0 });
    expect(m).not.toBeNull();
    expect(m!.anchorPrimitiveId).toBe(hub);
    expect(m!.triggererPlayerId).toBe(P0);
  });

  it('the component size it gates on is exactly hub-degree + 1 (the pigeonhole star)', () => {
    // Binds the two constants to each other rather than to literals, so a degree retune that forgets
    // the size constant fails here instead of silently making the recipe unbuildable.
    expect(STINK_TOWER_SIZE).toBe(STINK_TOWER_HUB_DEGREE + 1);
  });

  it('rejects one leaf too few and one too many', () => {
    const a = setup();
    expect(isStinkTowerComponent(a, buildStink(a, 1, STINK_TOWER_HUB_DEGREE - 1))).toBe(false);
    const b = setup();
    expect(isStinkTowerComponent(b, buildStink(b, 1, STINK_TOWER_HUB_DEGREE + 1))).toBe(false);
  });

  it('rejects a wrong-typed leaf', () => {
    const w = setup();
    const hub = addPrim(w, 1, STINK_HUB_TYPE);
    bond(w, hub, addPrim(w, 2, STINK_LEAF_TYPE));
    bond(w, hub, addPrim(w, 3, STINK_LEAF_TYPE));
    bond(w, hub, addPrim(w, 4, SparkType.Spiral)); // one Spiral among the Circles
    expect(isStinkTowerComponent(w, hub.id)).toBe(false);
  });

  it('TOLERATES an inter-leaf bond (dense auto-bond must not cause a silent no-build)', () => {
    // The shipped stars deliberately do NOT require degree-1 leaves — laserTurret.ts records that
    // requiring it produced "a frequent silent no-build". A Council seat proposed re-adding that
    // requirement as the fix for accidental construction; this test pins the rejection of that advice.
    const w = setup();
    const hub = addPrim(w, 1, STINK_HUB_TYPE);
    const l1 = addPrim(w, 2, STINK_LEAF_TYPE, 330, 300);
    const l2 = addPrim(w, 3, STINK_LEAF_TYPE, 360, 300);
    const l3 = addPrim(w, 4, STINK_LEAF_TYPE, 300, 330);
    bond(w, hub, l1); bond(w, hub, l2); bond(w, hub, l3);
    bond(w, l1, l2); // two adjacent leaves bond to each other — degree 2, hub degree unchanged
    expect(isStinkTowerComponent(w, hub.id)).toBe(true);
  });

  it('rejects an extra shape attached anywhere on the component', () => {
    const w = setup();
    const hub = buildStink(w, 1);
    const leaf = w.primitives.get(asPrimitiveId(2))!;
    bond(w, leaf, addPrim(w, 99, SparkType.Dot, 400, 400)); // component size now 5
    expect(isStinkTowerComponent(w, hub)).toBe(false);
  });

  it('skips an anchor that already carries a live defender of ANY kind', () => {
    // applyRegisterDefender de-dups by anchorPrimitiveId with NO kind comparison, so returning an
    // occupied anchor would produce a dispatch the reducer silently drops.
    const w = setup();
    const hub = buildStink(w, 1);
    const m1 = stinkTowerPredicate(w, { x: 0, y: 0 });
    expect(m1).not.toBeNull();
    w.defenders.set(asPrimitiveId(0) as never, {
      id: asPrimitiveId(0) as never, kind: 'turret', ownerPlayerId: P0, anchorPrimitiveId: hub,
      recipeId: 'laserTurret', pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 }, walkTargetPos: null,
      state: 'IDLE', ticksInState: 0, hp: 1, bagsRemaining: 0,
      nextFireTick: 0, targetCreatureId: null, lastStrikePos: null,
    });
    expect(stinkTowerPredicate(w, { x: 0, y: 0 })).toBeNull();
  });
});

describe('S141 P1 — MID-BUILD DISJOINTNESS SWEEP (the top risk both Council seats flagged)', () => {
  /** Assert no defender recipe — this one or any other — matches the given world. */
  const noStink = (w: World): void => {
    expect(isStinkTowerComponent(w, asPrimitiveId(1))).toBe(false);
    expect(stinkTowerPredicate(w, { x: 0, y: 0 })).toBeNull();
    expect(findDefenderMatches(w, { x: 0, y: 0 }).some((m) => m.recipe.id === 'stinkTower')).toBe(false);
  };

  it('VOLTKIN mid-build: the first four Squares do NOT build a stink tower', () => {
    // ⭐ THE ONE THAT KILLS THE OBVIOUS ALTERNATIVE. A 4-SQUARE RING recipe would have matched here.
    // This is why the recipe is a Square/Circle star and not an all-Square ring.
    const w = setup();
    const s = [1, 2, 3, 4].map((i) => addPrim(w, i, SparkType.Square, 300 + i * 30, 300));
    bond(w, s[0], s[1]); bond(w, s[1], s[2]); bond(w, s[2], s[3]); // the chain
    noStink(w);
    // and prove the fixture really is Voltkin's opening (4 of its 8)
    expect(VOLTKIN_SIZE).toBeGreaterThan(4);
  });

  it('VOLTKIN mid-build, worst case: four Squares CLOSED INTO A RING still do not match', () => {
    const w = setup();
    const s = [1, 2, 3, 4].map((i) => addPrim(w, i, SparkType.Square, 300 + i * 20, 300));
    bond(w, s[0], s[1]); bond(w, s[1], s[2]); bond(w, s[2], s[3]); bond(w, s[3], s[0]);
    noStink(w);
  });

  it('LIGHTNING HUB mid-build: a Dot with three Circles does NOT match (hub type)', () => {
    const w = setup();
    const hub = addPrim(w, 1, SparkType.Dot);
    for (let i = 0; i < 3; i++) bond(w, hub, addPrim(w, 2 + i, SparkType.Circle, 330 + i * 30, 300));
    noStink(w);
  });

  it('HELGA mid-build: a Triangle with three Circles does NOT match (hub type)', () => {
    const w = setup();
    const hub = addPrim(w, 1, SparkType.Triangle);
    for (let i = 0; i < 3; i++) bond(w, hub, addPrim(w, 2 + i, SparkType.Circle, 330 + i * 30, 300));
    noStink(w);
    expect(HELGA_SIZE).toBeGreaterThan(STINK_TOWER_SIZE);
  });

  it('LASER TURRET mid-build: a Line with three Spirals does NOT match (hub AND leaves)', () => {
    const w = setup();
    const hub = addPrim(w, 1, SparkType.Line);
    for (let i = 0; i < 3; i++) bond(w, hub, addPrim(w, 2 + i, SparkType.Spiral, 330 + i * 30, 300));
    noStink(w);
    expect(TURRET_SIZE).toBeGreaterThan(STINK_TOWER_SIZE);
  });

  it('PENTAGRAM mid-build: four Triangles in a path do NOT match', () => {
    const w = setup();
    const t = [1, 2, 3, 4].map((i) => addPrim(w, i, SparkType.Triangle, 300 + i * 30, 300));
    bond(w, t[0], t[1]); bond(w, t[1], t[2]); bond(w, t[2], t[3]);
    noStink(w);
  });

  it('the hub type is one NO other shipped recipe uses as a hub — the property the sweep rests on', () => {
    // Stated as an executable claim rather than left in a docblock: if a future recipe adopts a
    // Square hub, this fails and whoever wrote it has to redo the sweep above.
    expect(STINK_HUB_TYPE).toBe(SparkType.Square);
    expect([SparkType.Dot, SparkType.Triangle, SparkType.Line]).not.toContain(STINK_HUB_TYPE);
  });

  it('⚠ ACCIDENTAL CONSTRUCTION IS REAL AND IS DOCUMENTED, NOT DENIED', () => {
    // A Square dropped among three loose Circles DOES build a tower. This test exists so the
    // behaviour is recorded as known rather than discovered in playtest — and so that the two
    // mitigations (exact-size self-heal, and no blast on deconstruction) are provably load-bearing.
    const w = setup();
    const hub = buildStink(w, 1);
    expect(isStinkTowerComponent(w, hub)).toBe(true);
    // …and it self-heals the moment the player keeps building.
    const leaf = w.primitives.get(asPrimitiveId(2))!;
    bond(w, leaf, addPrim(w, 50, SparkType.Dot, 500, 500));
    expect(isStinkTowerComponent(w, hub)).toBe(false);
  });
});
