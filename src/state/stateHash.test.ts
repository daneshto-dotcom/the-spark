/**
 * SPARK — S107 P2 state-hash tests. Pins that hashWorldState is (a) a pure,
 * deterministic fingerprint, (b) SENSITIVE to any sim-state change (so it can
 * catch a desync), and (c) invariant to Map insertion order (the cross-context
 * cross-check primitive must not depend on allocation order).
 */
import { describe, expect, it } from 'vitest';
import { fnv1a32, hashWorldState } from './stateHash.ts';
import { makeWorld } from './world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from './worldTypes.ts';

let nextId = 0;
function addPrim(w: World, player: PlayerId, x: number, y: number): Primitive {
  const id = asPrimitiveId(nextId++);
  const prim: Primitive = {
    id, type: SparkType.Dot, placerColor: 0xffffff, placedBy: player, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: 0xffffff,
    lastOwnershipChange: 0, radius: 8,
  };
  w.primitives.set(id, prim);
  return prim;
}
function addBond(w: World, a: Primitive, b: Primitive): void {
  const id = asBondId(nextId++);
  w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0 });
  a.bonds.add(id); b.bonds.add(id);
}

describe('fnv1a32', () => {
  it('is deterministic and 32-bit unsigned', () => {
    expect(fnv1a32('spark')).toBe(fnv1a32('spark'));
    expect(fnv1a32('spark')).toBeGreaterThanOrEqual(0);
    expect(fnv1a32('spark')).toBeLessThanOrEqual(0xffffffff);
    expect(fnv1a32('spark')).not.toBe(fnv1a32('sparl')); // 1-char change diverges
  });
});

describe('hashWorldState (S107 P2 — worker-sim cross-check oracle)', () => {
  it('two identical worlds hash equal', () => {
    const P0 = asPlayerId(0);
    const wA = makeWorld(0); addPrim(wA, P0, 100, 100); wA.scoreByPlayer.set(P0, 12.5); wA.scoreProgress = 12.5;
    nextId -= 1; // reuse the same id so wB is structurally identical
    const wB = makeWorld(0); addPrim(wB, P0, 100, 100); wB.scoreByPlayer.set(P0, 12.5); wB.scoreProgress = 12.5;
    expect(hashWorldState(wA)).toBe(hashWorldState(wB));
  });

  it('is SENSITIVE — a moved primitive, a new bond, or a score change all flip the hash', () => {
    const P0 = asPlayerId(0);
    const base = makeWorld(0);
    const a = addPrim(base, P0, 100, 100);
    const b = addPrim(base, P0, 160, 100);
    const h0 = hashWorldState(base);

    a.pos.x += 0.0001; // sub-pixel move
    const hMoved = hashWorldState(base);
    expect(hMoved).not.toBe(h0);

    addBond(base, a, b);
    const hBonded = hashWorldState(base);
    expect(hBonded).not.toBe(hMoved);

    base.scoreByPlayer.set(P0, 5);
    base.scoreProgress = 5;
    expect(hashWorldState(base)).not.toBe(hBonded);

    base.tick += 1;
    const hTick = hashWorldState(base);
    expect(hTick).not.toBe(hashWorldState({ ...base, tick: base.tick - 1 } as World));
  });

  it('is INVARIANT to Map insertion order (sorted by id before hashing)', () => {
    const P0 = asPlayerId(0);
    // World 1: insert prim id-lo then id-hi.
    const w1 = makeWorld(0);
    const lo = addPrim(w1, P0, 10, 10);
    const hi = addPrim(w1, P0, 20, 20);
    // World 2: same two prims+ids but inserted hi-first (different Map order).
    const w2 = makeWorld(0);
    w2.primitives.set(hi.id, { ...hi, bonds: new Set() });
    w2.primitives.set(lo.id, { ...lo, bonds: new Set() });
    expect([...w2.primitives.keys()]).not.toEqual([...w1.primitives.keys()]); // genuinely different order
    expect(hashWorldState(w2)).toBe(hashWorldState(w1)); // ...but the hash is identical
  });
});
