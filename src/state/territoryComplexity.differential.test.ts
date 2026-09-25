/**
 * SPARK — S191 P12 (`s191/perf`) — THE DENSE UNION-FIND AGAINST THE VERBATIM COMPLEXITY PASS.
 *
 * `computeAllPlayerComplexities` now labels components over a dense index instead of the id-keyed
 * Maps of `computeComponentRoots`. Its docblock argues the three counts, and so every complexity and
 * every radius, are identical; this file compares the real `computeAllPlayerComplexities` /
 * `computeAllPlayerRadii` / `computePlayerComplexity` / `computeTerritorialRadius` against the
 * VERBATIM pre-change chain (`territoryReference.fixtures.ts`) — entries in insertion order, keys `===`,
 * values `Object.is` — on boards built to break a union-find:
 *   · MIXED-colour bonds that join two seats' structures into one component (Council S191 item 1);
 *   · dangling bonds (an endpoint razed), a bond from a shape to itself, the same pair bonded twice;
 *   · ids inserted out of order and with gaps (razed shapes), long chains (path compression), a colour
 *     no seat holds, a seat with nothing, the shrink debuff;
 *   · 400 random boards.
 * The S118 test (`territory.differential.test.ts`, 400 worlds against a `componentOf` reference) runs
 * against the new code too.
 */
import { describe, expect, it } from 'vitest';
import type { World } from './world.ts';
import {
  computeAllPlayerComplexities, computeAllPlayerRadii, computePlayerComplexity, computeTerritorialRadius,
} from './territory.ts';
import {
  referenceComputeAllPlayerComplexities, referenceComputeAllPlayerRadii,
} from './territoryReference.fixtures.ts';
import { addBond, addPrim, emptyBoard } from './s191PerfOracle.fixtures.ts';
import { asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';

const entries = (m: Map<PlayerId, number>): Array<[number, number]> => [...m].map(([k, v]) => [k as unknown as number, v]);

function sameMap(label: string, got: Map<PlayerId, number>, exp: Map<PlayerId, number>): void {
  const g = entries(got);
  const e = entries(exp);
  expect(g.length, `${label}: entry count`).toBe(e.length);
  for (let i = 0; i < e.length; i++) {
    expect(g[i]![0], `${label}: key #${i}`).toBe(e[i]![0]);
    expect(Object.is(g[i]![1], e[i]![1]), `${label}: seat ${e[i]![0]}: ${g[i]![1]} vs ${e[i]![1]}`).toBe(true);
  }
}

function compare(w: World, label: string): void {
  sameMap(`${label} complexities`, computeAllPlayerComplexities(w), referenceComputeAllPlayerComplexities(w));
  sameMap(`${label} radii`, computeAllPlayerRadii(w), referenceComputeAllPlayerRadii(w));
  const refC = referenceComputeAllPlayerComplexities(w);
  const refR = referenceComputeAllPlayerRadii(w);
  for (const pid of w.players.keys()) {
    expect(Object.is(computePlayerComplexity(pid, w), refC.get(pid) ?? 0), `${label}: computePlayerComplexity(${pid as unknown as number})`).toBe(true);
    expect(Object.is(computeTerritorialRadius(pid, w), refR.get(pid) ?? 0), `${label}: computeTerritorialRadius(${pid as unknown as number})`).toBe(true);
  }
}

describe('S191 perf — computeAllPlayerComplexities (dense union-find) is bit-exact to the verbatim pass', () => {
  it('mixed bonds joining two seats, dangling / self / duplicate bonds, gapped out-of-order ids, a stray colour', () => {
    const w = emptyBoard();
    const s0: Primitive[] = [];
    const s1: Primitive[] = [];
    for (let i = 0; i < 6; i++) { s0.push(addPrim(w, 0, 100 + i * 20, 100)); s1.push(addPrim(w, 1, 400 + i * 20, 100)); }
    for (let i = 1; i < 6; i++) { addBond(w, s0[i - 1]!, s0[i]!); if (i !== 3) addBond(w, s1[i - 1]!, s1[i]!); }
    addBond(w, s0[5]!, s1[0]!); // MIXED: seat 0's and seat 1's structures are now ONE component
    addBond(w, s0[2]!, s0[2]!); // a shape bonded to itself
    addBond(w, s1[4]!, s1[5]!); // the same pair twice (s1[4]-s1[5] exists already)
    const gone = addPrim(w, 1, 600, 100);
    addBond(w, gone, s1[5]!);
    w.primitives.delete(gone.id); // dangling
    // Ids out of insertion order, with gaps: a high id first, then lower ones.
    const hiId = asPrimitiveId(w.nextPrimitiveId + 500);
    const hi: Primitive = { ...s0[0]!, id: hiId, pos: { x: 700, y: 700 }, prevPos: { x: 700, y: 700 }, bonds: new Set() };
    w.primitives.set(hiId, hi);
    addBond(w, hi, addPrim(w, 0, 720, 700));
    // A colour no seat holds.
    const stray: Primitive = { ...addPrim(w, 2, 900, 900), placerColor: 0x123456 };
    w.primitives.set(stray.id, stray);
    compare(w, 'hand-built');
  });

  it('long chains (path compression), a seat with nothing, the shrink debuff', () => {
    for (const shrink of [false, true]) {
      const w = emptyBoard();
      w.tick = 50;
      let prev = addPrim(w, 0, 0, 0);
      for (let i = 1; i < 400; i++) { const p = addPrim(w, i % 7 === 0 ? 1 : 0, i, i % 13); addBond(w, prev, p); prev = p; }
      for (let i = 0; i < 30; i++) addPrim(w, 2, 1000 + i * 9, 500); // seat 2: thirty singletons
      if (shrink) w.players.get(asPlayerId(0))!.territorialShrinkUntilTick = 100;
      compare(w, `chain shrink=${shrink}`);
    }
  });

  it('400 random boards (mixed bonds, razes, self-bonds, four seats)', () => {
    let seed = 0x7c0;
    const rnd = (): number => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return seed / 2 ** 32; };
    for (let iter = 0; iter < 400; iter++) {
      const w = emptyBoard();
      w.tick = Math.floor(rnd() * 300);
      const ps: Primitive[] = [];
      const n = Math.floor(rnd() * 50);
      for (let i = 0; i < n; i++) ps.push(addPrim(w, Math.floor(rnd() * 4), rnd() * 1900, rnd() * 1000));
      const m = Math.floor(rnd() * n * 1.8);
      for (let k = 0; k < m && ps.length > 0; k++) {
        const a = ps[Math.floor(rnd() * ps.length)]!;
        const same = rnd() < 0.7;
        const pool = same ? ps.filter((p) => p.placerColor === a.placerColor) : ps;
        addBond(w, a, pool[Math.floor(rnd() * pool.length)]!);
      }
      for (const p of ps) if (rnd() < 0.08) w.primitives.delete(p.id);
      for (const seat of [0, 1, 2, 3]) if (rnd() < 0.2) w.players.get(asPlayerId(seat))!.territorialShrinkUntilTick = w.tick + Math.floor(rnd() * 100) - 30;
      compare(w, `random board ${iter}`);
    }
  });
});
