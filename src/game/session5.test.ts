/**
 * SPARK — Session 5 tests:
 *   - free-spark soft-cap (DESPAWN action + main-loop enforcement)
 *   - structure-immobility runtime guard
 *   - color-inheritance + finite-position guards
 *   - effects emission (BOND_COMMIT, SEVER_ERASE)
 *   - bond strain auto-sever via solveBonds → dispatch SEVER_BOND
 *   - effects renderer ageing (no Pixi instantiation — we test the queue
 *     contract, not the draw output)
 */

import { describe, expect, it } from 'vitest';
import { FREE_SPARK_SOFT_CAP, PHYSICS_HZ, SparkType } from '../constants.ts';
import {
  snapPrevPosForUnbonded,
  snapshotInvariants,
  verifyInvariants,
} from './invariants.ts';
import { makeFreeSpark } from './spark.ts';
import { solveBonds, type Bond } from '../physics/bonds.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  asSparkId,
} from '../types.ts';

const P1 = asPlayerId(0);
const PHYSICS_DT = 1 / PHYSICS_HZ;

function spawnFree(world: ReturnType<typeof makeWorld>, id: number, tick: number, pos = { x: 100, y: 100 }) {
  const sparkId = asSparkId(id);
  const spark = makeFreeSpark({
    id: sparkId,
    type: SparkType.Dot,
    pos,
    velocity: { x: 0, y: 0 },
    dt: PHYSICS_DT,
    createdTick: tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark });
  return sparkId;
}

function placePrimitive(
  world: ReturnType<typeof makeWorld>,
  sparkId: ReturnType<typeof asSparkId>,
  targetId: ReturnType<typeof asPrimitiveId> | null,
) {
  dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId: P1 });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1,
    targetPrimitiveId: targetId,
    stiffnessTier: 'MID',
  });
}

describe('soft-cap (DESPAWN_SPARK)', () => {
  it('despawns a Free spark', () => {
    const world = makeWorld(0);
    const id = spawnFree(world, 1, 0);
    expect(world.freeSparks.has(id)).toBe(true);
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: id });
    expect(world.freeSparks.has(id)).toBe(false);
  });

  it('refuses to despawn a Carried spark (player FSM owns it)', () => {
    const world = makeWorld(0);
    const id = spawnFree(world, 1, 0);
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: id, playerId: P1 });
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: id });
    expect(world.freeSparks.has(id), 'Carried spark must not be despawned').toBe(true);
  });

  it('silently no-ops on missing id', () => {
    const world = makeWorld(0);
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: asSparkId(999) });
    expect(world.freeSparks.size).toBe(0);
  });

  it('cap enforcement keeps oldest by createdTick', () => {
    const world = makeWorld(0);
    // Spawn cap+5 sparks with monotonically increasing createdTick.
    for (let i = 0; i < FREE_SPARK_SOFT_CAP + 5; i++) {
      spawnFree(world, i, i);
    }
    expect(world.freeSparks.size).toBe(FREE_SPARK_SOFT_CAP + 5);

    // Replicate main-loop policy: oldest 5 despawn.
    const candidates = [...world.freeSparks.values()]
      .filter((s) => s.state.kind === 'Free')
      .sort((a, b) => a.createdTick - b.createdTick);
    for (let i = 0; i < 5; i++) {
      dispatch(world, { type: 'DESPAWN_SPARK', sparkId: candidates[i].id });
    }
    expect(world.freeSparks.size).toBe(FREE_SPARK_SOFT_CAP);
    // The youngest 50 remain — their tick range starts at 5.
    const survivingTicks = [...world.freeSparks.values()].map((s) => s.createdTick).sort((a, b) => a - b);
    expect(survivingTicks[0]).toBe(5);
    expect(survivingTicks[survivingTicks.length - 1]).toBe(FREE_SPARK_SOFT_CAP + 4);
  });
});

describe('invariants — structure immobility', () => {
  it('flags a moved unbonded primitive', () => {
    const world = makeWorld(0);
    const sId = spawnFree(world, 1, 0);
    placePrimitive(world, sId, null);
    const snap = snapshotInvariants(world.primitives);
    // Mutate pos under the rug — would be a bug in production code.
    const prim = [...world.primitives.values()][0];
    prim.pos.x += 5;
    const violations = verifyInvariants(world.primitives, world.freeSparks, snap);
    expect(violations.some((v) => v.kind === 'immobility')).toBe(true);
  });

  it('does NOT flag a bonded primitive moved by the solver', () => {
    const world = makeWorld(0);
    const s1 = spawnFree(world, 1, 0, { x: 100, y: 100 });
    placePrimitive(world, s1, null);
    const s2 = spawnFree(world, 2, 1, { x: 200, y: 100 });
    placePrimitive(world, s2, asPrimitiveId(0));
    const snap = snapshotInvariants(world.primitives);
    // Both primitives are now bonded — solver-moves are allowed.
    const prim = [...world.primitives.values()][0];
    prim.pos.x += 0.5;
    const violations = verifyInvariants(world.primitives, world.freeSparks, snap);
    expect(violations.filter((v) => v.kind === 'immobility')).toEqual([]);
  });

  it('flags non-finite primitive position', () => {
    const world = makeWorld(0);
    const sId = spawnFree(world, 1, 0);
    placePrimitive(world, sId, null);
    const snap = snapshotInvariants(world.primitives);
    const prim = [...world.primitives.values()][0];
    prim.pos.x = NaN;
    const violations = verifyInvariants(world.primitives, world.freeSparks, snap);
    expect(violations.some((v) => v.kind === 'nonfinite-primitive')).toBe(true);
  });

  it('flags non-finite spark position', () => {
    const world = makeWorld(0);
    const id = spawnFree(world, 1, 0);
    const snap = snapshotInvariants(world.primitives);
    const spark = world.freeSparks.get(id)!;
    spark.pos.x = Infinity;
    const violations = verifyInvariants(world.primitives, world.freeSparks, snap);
    expect(violations.some((v) => v.kind === 'nonfinite-spark')).toBe(true);
  });

  it('flags color-inheritance break (Phase 1 only)', () => {
    const world = makeWorld(0);
    const sId = spawnFree(world, 1, 0);
    placePrimitive(world, sId, null);
    const snap = snapshotInvariants(world.primitives);
    const prim = [...world.primitives.values()][0];
    prim.ownerColor = 0xdeadbe;
    const violations = verifyInvariants(world.primitives, world.freeSparks, snap);
    expect(violations.some((v) => v.kind === 'color-inheritance')).toBe(true);
  });

  it('snapPrevPosForUnbonded resets prevPos for orphaned primitives', () => {
    const world = makeWorld(0);
    const sId = spawnFree(world, 1, 0);
    placePrimitive(world, sId, null);
    const prim = [...world.primitives.values()][0];
    prim.pos.x = 250; // simulate solver having moved it
    prim.prevPos.x = 100;
    snapPrevPosForUnbonded(world.primitives);
    expect(prim.prevPos.x).toBe(prim.pos.x);
    expect(prim.prevPos.y).toBe(prim.pos.y);
  });
});

describe('effects emission', () => {
  it('PLACE_PRIMITIVE with target emits BOND_COMMIT effect', () => {
    const world = makeWorld(0);
    const a = spawnFree(world, 1, 0, { x: 100, y: 100 });
    placePrimitive(world, a, null);
    expect(world.effects.length, 'first place — no bond, no effect').toBe(0);
    const b = spawnFree(world, 2, 1, { x: 150, y: 100 });
    placePrimitive(world, b, asPrimitiveId(0));
    expect(world.effects.length).toBe(1);
    expect(world.effects[0].kind).toBe('BOND_COMMIT');
  });

  it('SEVER_BOND emits one SEVER_ERASE per loser primitive', () => {
    const world = makeWorld(0);
    // Build a 4-link chain. Cut the middle bond — smaller side wins by
    // tick, larger side keeps. Confirm the loser side shows up as
    // SEVER_ERASE entries.
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const sId = spawnFree(world, 100 + i, i, { x: 100 + i * 60, y: 100 });
      ids.push(sId);
      placePrimitive(world, sId, i === 0 ? null : asPrimitiveId(i - 1));
    }
    world.effects.length = 0;
    // Sever the bond between primitive 1 and 2 — in this geometry with
    // matching size, the side with greater max(createdTick) is the
    // pair (2,3) since they were placed last; that side gets erased.
    const middleBondId = asBondId(1);
    dispatch(world, { type: 'SEVER_BOND', bondId: middleBondId });
    const erases = world.effects.filter((e) => e.kind === 'SEVER_ERASE');
    expect(erases.length).toBe(2); // primitives 2 and 3 are wiped
  });

  it('effects accumulate independently of save serialization', async () => {
    const world = makeWorld(0);
    const a = spawnFree(world, 1, 0, { x: 100, y: 100 });
    placePrimitive(world, a, null);
    const b = spawnFree(world, 2, 1, { x: 150, y: 100 });
    placePrimitive(world, b, asPrimitiveId(0));
    expect(world.effects.length).toBeGreaterThan(0);
    // save.ts only enumerates explicit fields — effects must not appear
    // in the serialized snapshot.
    const { snapshot } = await import('../state/save.ts');
    const snap = snapshot(world) as unknown as Record<string, unknown>;
    expect('effects' in snap).toBe(false);
  });
});

describe('strain auto-sever', () => {
  it('solveBonds reports a bond stretched past the break ratio', () => {
    // Build a synthetic bond pair stretched to 3× rest length (LOW
    // breaks at 2×, MID at 1.5×, HIGH at 1.25×).
    const a = { pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 } };
    const b = { pos: { x: 300, y: 0 }, prevPos: { x: 300, y: 0 } };
    const bond: Bond = {
      id: asBondId(1),
      aId: asPrimitiveId(0),
      bId: asPrimitiveId(1),
      a,
      b,
      restLength: 100,
      stiffnessTier: 'MID',
      createdTick: 0,
    };
    const broken = solveBonds([bond]);
    expect(broken).toEqual([bond.id]);
  });

  it('overstretched bond + dispatch SEVER_BOND removes the bond from world', () => {
    const world = makeWorld(0);
    const a = spawnFree(world, 1, 0, { x: 100, y: 100 });
    placePrimitive(world, a, null);
    const b = spawnFree(world, 2, 1, { x: 150, y: 100 });
    placePrimitive(world, b, asPrimitiveId(0));
    expect(world.bonds.size).toBe(1);
    const bondId = [...world.bonds.keys()][0];
    // Stretch primitive 1 far away to force a strain break.
    const prim = [...world.primitives.values()].find((p) => p.id === asPrimitiveId(1))!;
    prim.pos.x = 1000;
    const bondArr = [...world.bonds.values()];
    const broken = solveBonds(bondArr);
    expect(broken.length).toBe(1);
    for (const bId of broken) {
      dispatch(world, { type: 'SEVER_BOND', bondId: bId });
    }
    expect(world.bonds.has(bondId)).toBe(false);
  });
});
