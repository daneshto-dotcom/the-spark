/**
 * SPARK — S191 P12 (`s191/perf`) — THE MEMOISED SCORING PASS AGAINST THE VERBATIM ONE.
 *
 * `computeAllComplexities` now answers "is this pair magic?" and "is it a Filament?" once per type pair
 * per call (the same `lookupCombo` / `isFilamentCombo`, memoised) instead of once per bond. Every case
 * compares the real pass with the verbatim pre-change pass (`scoringReference.fixtures.ts`): the result
 * Map's entries IN INSERTION ORDER, keys `===`, values `Object.is` — over boards built to hit every
 * branch the memo sits on:
 *   · all 36 ordered type pairs (magic, functional, the directional Wheel/Star dual, both Filament
 *     orders), several owners, mixed-owner bonds (credited to the aId placer);
 *   · FILAMENTS with magic and functional neighbours on both endpoints, above and below the keystone cap;
 *   · poop-FOULED prims (their prims, their bonds and their keystone neighbours all skipped);
 *   · a degenerate bond (endpoint missing), spawners, a seat with nothing;
 *   · an INVALID type (not one of the six SparkTypes): both passes must throw the same error, from the
 *     same bond — the memo is bypassed for it;
 *   · 300 random boards.
 * The real-match proof is the SCORING arm of `s191Perf.differential.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { World } from './world.ts';
import { computeAllComplexities } from './scoring.ts';
import { referenceComputeAllComplexities } from './scoringReference.fixtures.ts';
import { addBond, emptyBoard } from './s191PerfOracle.fixtures.ts';
import { PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { isFilamentCombo, lookupCombo } from '../combos.ts';

function prim(w: World, seat: number, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type, placerColor: player.color, placedBy: player.id, createdTick: 0, pos: { x, y }, prevPos: { x, y },
    bonds: new Set(), ownerColor: player.color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function addSpawner(w: World, seat: number): void {
  const id = w.creatureSpawners.size + 1000;
  (w.creatureSpawners as Map<number, unknown>).set(id, { ownerPlayerId: asPlayerId(seat) });
}

const entries = (m: Map<PlayerId, number>): Array<[number, number]> => [...m].map(([k, v]) => [k as unknown as number, v]);

function compare(w: World, label: string): void {
  const real = entries(computeAllComplexities(w));
  const ref = entries(referenceComputeAllComplexities(w));
  expect(real.length, `${label}: entry count`).toBe(ref.length);
  for (let i = 0; i < ref.length; i++) {
    expect(real[i]![0], `${label}: key #${i} (insertion order)`).toBe(ref[i]![0]);
    expect(Object.is(real[i]![1], ref[i]![1]), `${label}: value for seat ${ref[i]![0]}: ${real[i]![1]} vs ${ref[i]![1]}`).toBe(true);
  }
}

const TYPES = [SparkType.Dot, SparkType.Line, SparkType.Triangle, SparkType.Square, SparkType.Circle, SparkType.Spiral];

describe('S191 perf — computeAllComplexities (memoised combos) is bit-identical to the verbatim pass', () => {
  it('all 36 ordered type pairs, several owners, mixed-owner bonds, spawners, a degenerate bond', () => {
    const w = emptyBoard();
    let magic = 0;
    for (const [i, ta] of TYPES.entries()) {
      for (const [j, tb] of TYPES.entries()) {
        const a = prim(w, (i + j) % 3, ta, i * 50, j * 50);
        const b = prim(w, (i + j + (i === j ? 0 : 1)) % 3, tb, i * 50 + 20, j * 50);
        addBond(w, a, b);
        if (lookupCombo(ta, tb).isMagical) magic++;
      }
    }
    const doomed = prim(w, 1, SparkType.Dot, 900, 900);
    addBond(w, doomed, prim(w, 1, SparkType.Line, 920, 900));
    w.primitives.delete(doomed.id);
    addSpawner(w, 0); addSpawner(w, 2); addSpawner(w, 2);
    expect(magic, 'fixture: magic pairs present').toBeGreaterThan(10);
    compare(w, '36 pairs');
  });

  it('Filaments with magic and functional neighbours, above and below the keystone cap, and fouling', () => {
    for (const foulMode of ['none', 'filament end', 'neighbour end', 'unrelated'] as const) {
      const w = emptyBoard();
      let filaments = 0;
      for (let k = 0; k < 6; k++) {
        const seat = k % 2;
        const d = prim(w, seat, SparkType.Dot, 100 + k * 150, 100);
        const l = prim(w, seat, SparkType.Line, 130 + k * 150, 100);
        // Both Filament orders (Dot→Line and Line→Dot).
        if (k % 2 === 0) addBond(w, d, l); else addBond(w, l, d);
        if (isFilamentCombo(d.type, l.type)) filaments++;
        // k magic neighbours hung off the Filament's ends (Dot→Spiral = Vortex, Line→Circle = Spindle…)
        // and one functional neighbour.
        for (let n = 0; n < k; n++) {
          const end = n % 2 === 0 ? d : l;
          const t = end === d ? SparkType.Spiral : SparkType.Circle;
          addBond(w, end, prim(w, seat, t, end.pos.x, end.pos.y + 25 + n * 10));
        }
        addBond(w, d, prim(w, seat, SparkType.Square, d.pos.x - 20, d.pos.y));
        if (foulMode === 'filament end' && k === 3) w.fouledPrimitives.add(d.id);
        if (foulMode === 'neighbour end' && k === 5) {
          const nbId = [...l.bonds].map((id) => w.bonds.get(id)!).find((b) => b.aId !== d.id && b.bId !== d.id)!;
          w.fouledPrimitives.add(nbId.bId);
        }
      }
      if (foulMode === 'unrelated') w.fouledPrimitives.add(asPrimitiveId(99_999));
      expect(filaments, 'fixture: filaments present').toBeGreaterThan(0);
      compare(w, `filaments / keystone, fouled ${foulMode}`);
    }
  });

  it('an INVALID type throws the same error from both, and an empty board agrees', () => {
    const empty = emptyBoard();
    compare(empty, 'empty board');
    const w = emptyBoard();
    const a = prim(w, 0, SparkType.Dot, 0, 0);
    const b = prim(w, 0, SparkType.Line, 30, 0);
    addBond(w, a, b);
    // A VALID Square→Square bond first, so a memo that mis-keyed an invalid type onto a valid slot
    // (9 mod 6 = Square) would answer from the cache instead of throwing.
    addBond(w, prim(w, 1, SparkType.Square, 40, 40), prim(w, 1, SparkType.Square, 70, 40));
    const bad = prim(w, 1, 9 as SparkType, 60, 0);
    addBond(w, bad, prim(w, 1, SparkType.Square, 90, 0));
    const err = (f: () => unknown): string => { try { f(); return 'no throw'; } catch (e) { return String((e as Error).message); } };
    const r = err(() => computeAllComplexities(w));
    expect(r, 'the real pass throws on the invalid pair').toMatch(/Combo lookup failed/);
    expect(r).toBe(err(() => referenceComputeAllComplexities(w)));
  });

  it('300 random boards: random types, owners, bonds, fouling, spawners', () => {
    let seed = 0x5c0e;
    const rnd = (): number => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return seed / 2 ** 32; };
    for (let iter = 0; iter < 300; iter++) {
      const w = emptyBoard();
      const n = Math.floor(rnd() * 60);
      const ps: Primitive[] = [];
      for (let i = 0; i < n; i++) ps.push(prim(w, Math.floor(rnd() * 4), TYPES[Math.floor(rnd() * 6)]!, rnd() * 1900, rnd() * 1000));
      const m = Math.floor(rnd() * n * 2);
      for (let k = 0; k < m && ps.length >= 2; k++) addBond(w, ps[Math.floor(rnd() * ps.length)]!, ps[Math.floor(rnd() * ps.length)]!);
      for (const p of ps) if (rnd() < 0.05) w.fouledPrimitives.add(p.id);
      if (ps.length > 0 && rnd() < 0.2) w.primitives.delete(ps[0]!.id);
      for (let s = 0; s < Math.floor(rnd() * 4); s++) addSpawner(w, Math.floor(rnd() * 4));
      compare(w, `random board ${iter}`);
    }
  });
});
