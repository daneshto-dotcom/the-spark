import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HZ,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../constants.ts';
import { CarryViolation } from '../game/player.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { dispatch, makeWorld } from './world.ts';

const DT = 1 / PHYSICS_HZ;
const P1 = asPlayerId(0);

function spawnTestSpark(id: number): Spark {
  return makeFreeSpark({
    id: asSparkId(id),
    type: SparkType.Dot,
    pos: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    dt: DT,
    createdTick: 0,
  });
}

describe('world dispatch seam (§ 10.2)', () => {
  it('SPAWN_SPARK adds the spark to freeSparks', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    expect(w.freeSparks.size).toBe(1);
    expect(w.freeSparks.get(s.id)).toBe(s);
  });

  it('PICKUP_SPARK transitions player Idle → Carrying and marks spark Carried', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    const player = w.players.get(P1)!;
    expect(player.kind).toBe('Carrying');
    expect(s.state.kind).toBe('Carried');
  });

  it('double-PICKUP_SPARK throws CarryViolation', () => {
    const w = makeWorld(0);
    const a = spawnTestSpark(0);
    const b = spawnTestSpark(1);
    dispatch(w, { type: 'SPAWN_SPARK', spark: a });
    dispatch(w, { type: 'SPAWN_SPARK', spark: b });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: a.id, playerId: P1 });
    expect(() =>
      dispatch(w, { type: 'PICKUP_SPARK', sparkId: b.id, playerId: P1 }),
    ).toThrow(CarryViolation);
  });

  it('DROP_SPARK returns spark to Free state at the dropped position', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, { type: 'DROP_SPARK', playerId: P1, pos: { x: 500, y: 500 } });
    expect(s.state.kind).toBe('Free');
    expect(s.pos.x).toBe(500);
    expect(s.pos.y).toBe(500);
    expect(w.players.get(P1)!.kind).toBe('Idle');
  });

  it('PLACE_PRIMITIVE without target creates an anchor primitive (no bond)', () => {
    const w = makeWorld(0);
    const s = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(1);
    expect(w.bonds.size).toBe(0);
    expect(w.freeSparks.size).toBe(0);
    expect(w.players.get(P1)!.kind).toBe('Idle');
  });

  it('PLACE_PRIMITIVE with target creates a primitive AND a bond linking adjacency', () => {
    const w = makeWorld(0);
    // Anchor.
    const s1 = spawnTestSpark(0);
    dispatch(w, { type: 'SPAWN_SPARK', spark: s1 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s1.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    const anchorId = [...w.primitives.keys()][0];

    // Second primitive bonded to anchor.
    const s2 = spawnTestSpark(1);
    s2.pos.x = 300;
    s2.pos.y = 300;
    dispatch(w, { type: 'SPAWN_SPARK', spark: s2 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s2.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: anchorId,
      stiffnessTier: 'HIGH',
    });

    expect(w.primitives.size).toBe(2);
    expect(w.bonds.size).toBe(1);
    const bond = [...w.bonds.values()][0];
    expect(bond.stiffnessTier).toBe('HIGH');
    expect(bond.aId === anchorId || bond.bId === anchorId).toBe(true);
    // Adjacency wired on both primitives.
    for (const p of w.primitives.values()) expect(p.bonds.size).toBe(1);
  });

  it('SEVER_BOND removes the bond and clears adjacency', () => {
    const w = makeWorld(0);
    const s1 = spawnTestSpark(0);
    const s2 = spawnTestSpark(1);
    s2.pos.x = 300; s2.pos.y = 300;
    dispatch(w, { type: 'SPAWN_SPARK', spark: s1 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s1.id, playerId: P1 });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P1, targetPrimitiveId: null, stiffnessTier: 'MID' });
    const anchorId = [...w.primitives.keys()][0];
    dispatch(w, { type: 'SPAWN_SPARK', spark: s2 });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s2.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: anchorId,
      stiffnessTier: 'MID',
    });
    const bondId = [...w.bonds.keys()][0];
    dispatch(w, { type: 'SEVER_BOND', bondId });
    expect(w.bonds.size).toBe(0);
    for (const p of w.primitives.values()) expect(p.bonds.size).toBe(0);
  });

  it('TICK_ENERGY accrues passive energy at the constant rate (§ XIV.8)', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'TICK_ENERGY', playerId: P1, deltaSec: 1.0 });
    expect(w.players.get(P1)!.energy).toBeCloseTo(5.0, 6);
  });

  it('WIN_TRIGGER flips gameState and records the winner', () => {
    const w = makeWorld(0);
    dispatch(w, { type: 'WIN_TRIGGER', winnerId: P1 });
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P1);
  });

  // § IX.5 (v0.5.1) — no building inside the spawner zone.
  it('PLACE_PRIMITIVE inside spawner zone is silently rejected; carry preserved', () => {
    const w = makeWorld(0);
    const s = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, // dead center
      velocity: { x: 0, y: 0 },
      dt: DT,
      createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(0);
    expect(w.players.get(P1)!.kind).toBe('Carrying');
  });

  it('PLACE_PRIMITIVE on the ring boundary is allowed', () => {
    const w = makeWorld(0);
    const s = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: SPAWNER_CENTER_X + 250, y: SPAWNER_CENTER_Y }, // exactly on ring
      velocity: { x: 0, y: 0 },
      dt: DT,
      createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    dispatch(w, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: null,
      stiffnessTier: 'MID',
    });
    expect(w.primitives.size).toBe(1);
    expect(w.players.get(P1)!.kind).toBe('Idle');
  });
});
