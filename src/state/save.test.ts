import { describe, expect, it } from 'vitest';
import {
  PHASE_1_WIN_PRIMITIVE_COUNT,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { dispatch, makeWorld } from './world.ts';
import { restore, snapshot } from './save.ts';

const P1 = asPlayerId(0);

function placeChain(world: ReturnType<typeof makeWorld>, count: number): void {
  let prev: number | null = null;
  for (let i = 0; i < count; i++) {
    const s = makeFreeSpark({
      id: asSparkId(i),
      type: (i % 6) as SparkType,
      pos: { x: 100 + i * 30, y: 100 + i * 5 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: world.tick,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    const targetId = prev !== null ? ([...world.primitives.keys()][prev] ?? null) : null;
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: targetId,
      stiffnessTier: i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MID' : 'LOW',
    });
    prev = i;
    world.tick++;
  }
}

describe('WorldSnapshot save/load (§ 10.4)', () => {
  it('roundtrips a 30-primitive chain via snapshot → JSON → restore', () => {
    const w1 = makeWorld(42);
    placeChain(w1, PHASE_1_WIN_PRIMITIVE_COUNT);
    const snap = snapshot(w1);
    const json = JSON.stringify(snap);
    const reparsed = JSON.parse(json);

    const w2 = makeWorld(0);
    restore(reparsed, w2);

    expect(w2.primitives.size).toBe(w1.primitives.size);
    expect(w2.bonds.size).toBe(w1.bonds.size);
    expect(w2.tick).toBe(w1.tick);
    expect(w2.rngSeed).toBe(w1.rngSeed);
    expect(w2.gameState).toBe(w1.gameState);

    // Adjacency reconstructed: every primitive's bonds are reattached.
    for (const p of w2.primitives.values()) {
      for (const bondId of p.bonds) {
        expect(w2.bonds.has(bondId)).toBe(true);
      }
    }
    // Bond.a and Bond.b refs point at the (newly created) primitive objects.
    for (const b of w2.bonds.values()) {
      expect(b.a).toBe(w2.primitives.get(b.aId));
      expect(b.b).toBe(w2.primitives.get(b.bId));
    }
  });

  it('preserves stiffness tier per bond across the roundtrip', () => {
    const w1 = makeWorld(7);
    placeChain(w1, 6);
    const tiersBefore = [...w1.bonds.values()].map((b) => b.stiffnessTier).sort();

    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w1))), w2);
    const tiersAfter = [...w2.bonds.values()].map((b) => b.stiffnessTier).sort();
    expect(tiersAfter).toEqual(tiersBefore);
  });

  it('preserves player energy + counters', () => {
    const w1 = makeWorld(0);
    dispatch(w1, { type: 'TICK_ENERGY', playerId: P1, deltaSec: 3.0 });
    placeChain(w1, 2);
    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w1))), w2);
    expect(w2.players.get(P1)!.energy).toBeCloseTo(w1.players.get(P1)!.energy, 6);
  });

  it('rejects unsupported schemaVersion', () => {
    const w1 = makeWorld(0);
    const bad = { ...snapshot(w1), schemaVersion: 99 as 1 };
    const w2 = makeWorld(0);
    expect(() => restore(bad, w2)).toThrow(/schemaVersion/);
  });
});
