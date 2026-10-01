/**
 * SPARK — S191 P12 (`s191/perf`) — THE BOND SOLVER, HOISTED, AGAINST THE VERBATIM SOLVER.
 *
 * `solveBonds` now reads the tier tables once per call and each endpoint's `pos` once per bond. Its
 * docblock argues the outputs are identical by construction; this file runs the real solver and the
 * verbatim pre-change one (`solveBondsReference.fixtures.ts`) on two identical copies of the same
 * network for 8 substeps and asserts, after EVERY substep, every body's `pos` `Object.is`-equal and the
 * same broken list — over the cases the hoists could plausibly get wrong:
 *   · every tier, a MISSING multiplier (`undefined`), 1.0, the territory sag 0.3, other floors;
 *   · a bond shorter than EPSILON (skipped), one overstretched past its tier's break ratio (broken),
 *     one whose correction hits the 0.5 × rest-length CLAMP (both signs);
 *   · a bond whose two ends are the SAME body (the cached `pos` refs alias), bodies shared by many
 *     bonds (Gauss-Seidel order matters), the same pair bonded twice;
 *   · an UNKNOWN tier (the fallback table read — NaN flows exactly as it did);
 *   · the tables themselves re-tuned between calls (they are read once per CALL, not once per module);
 *   · 400 random networks.
 * The real-match proof is the SOLVER arm of `s191Perf.differential.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { solveBonds, type Bond, type PhysicsBody } from './bonds.ts';
import { referenceSolveBonds } from './solveBondsReference.fixtures.ts';
import { STIFFNESS_BY_TIER, STRAIN_BREAK_BY_TIER, type StiffnessTier } from '../constants.ts';
import { asBondId, asPrimitiveId, type BondId } from '../types.ts';

interface BondSpec { a: number; b: number; rest: number; tier: string; mult: number | undefined }
interface NetSpec { bodies: Array<[number, number]>; bonds: BondSpec[] }

function build(spec: NetSpec): { bodies: PhysicsBody[]; bonds: Bond[] } {
  const bodies = spec.bodies.map(([x, y]) => ({ pos: { x, y }, prevPos: { x, y } }));
  const bonds = spec.bonds.map((s, i) => {
    const bond = {
      id: asBondId(i + 1), aId: asPrimitiveId(s.a), bId: asPrimitiveId(s.b),
      a: bodies[s.a]!, b: bodies[s.b]!, restLength: s.rest,
      stiffnessTier: s.tier as StiffnessTier, createdTick: 0, damageFifths: 0,
    } as Bond;
    if (s.mult !== undefined) bond.stiffnessMultiplier = s.mult;
    return bond;
  });
  return { bodies, bonds };
}

/** 8 substeps on two identical copies; every body and every broken list compared after each. */
function compare(spec: NetSpec, label: string, substeps = 8): { broken: number; moved: number } {
  const R = build(spec);
  const N = build(spec);
  let broken = 0;
  let moved = 0;
  let rBonds = R.bonds;
  let nBonds = N.bonds;
  for (let s = 0; s < substeps; s++) {
    const rb: BondId[] = referenceSolveBonds(rBonds);
    const nb: BondId[] = solveBonds(nBonds);
    expect(nb, `${label} substep ${s}: broken list`).toEqual(rb);
    for (let i = 0; i < R.bodies.length; i++) {
      const r = R.bodies[i]!.pos;
      const n = N.bodies[i]!.pos;
      expect(Object.is(n.x, r.x) && Object.is(n.y, r.y), `${label} substep ${s} body ${i}: (${n.x}, ${n.y}) vs (${r.x}, ${r.y})`).toBe(true);
      if (r.x !== spec.bodies[i]![0] || r.y !== spec.bodies[i]![1]) moved++;
    }
    broken += rb.length;
    // As the physics loop does: a broken bond is gone from the next substep's array.
    const gone = new Set(rb);
    rBonds = rBonds.filter((b) => !gone.has(b.id));
    nBonds = nBonds.filter((b) => !gone.has(b.id));
  }
  return { broken, moved };
}

describe('S191 perf — solveBonds (hoisted) is bit-identical to the verbatim solver', () => {
  it('every tier × every multiplier shape, EPSILON, a break, the clamp both ways, an unknown tier', () => {
    const tiers = ['LOW', 'MID', 'HIGH'];
    const mults = [undefined, 1.0, 0.3, 0.7, 0.06, 1.5];
    const bodies: Array<[number, number]> = [];
    const bonds: BondSpec[] = [];
    const pair = (ax: number, ay: number, bx: number, by: number, rest: number, tier: string, mult: number | undefined): void => {
      bodies.push([ax, ay], [bx, by]);
      bonds.push({ a: bodies.length - 2, b: bodies.length - 1, rest, tier, mult });
    };
    for (const tier of tiers) {
      for (const mult of mults) {
        pair(0, 0, 30, 4, 25, tier, mult); // ordinary stretch
        pair(100, 0, 100 + 1e-4, 0, 25, tier, mult); // distSq < EPSILON: skipped
        pair(200, 0, 200 + 25 * 2.01, 0, 25, tier, mult); // past every break ratio: broken
        pair(300, 0, 300 + 25 * 1.2, 0, 25, tier, mult); // 1.2 × rest: under every break ratio (2.0 / 1.5 / 1.25) — a big pull
        pair(400, 0, 401, 0, 400, tier, mult); // compressed hard: the clamp, negative correction
        pair(500, 0, 500 + 25 * 1.24, 0.5, 25, tier, mult); // near HIGH's 1.25 break
      }
    }
    pair(600, 0, 650, 0, 40, 'WEIRD', undefined); // unknown tier: the table fallback, NaN as before
    pair(700, 0, 750, 0, 40, 'WEIRD', 0.3);
    const r = compare({ bodies, bonds }, 'tier × multiplier');
    expect(r.broken, 'breaks happened').toBeGreaterThan(10);
    expect(r.moved, 'bodies moved').toBeGreaterThan(50);
  });

  it('a self-bond (both ends one body), shared bodies in chains and rings, the same pair twice', () => {
    const bodies: Array<[number, number]> = [];
    for (let i = 0; i < 24; i++) bodies.push([100 + 23 * Math.cos(i), 100 + 31 * Math.sin(i * 1.7)]);
    const bonds: BondSpec[] = [];
    for (let i = 0; i < 24; i++) bonds.push({ a: i, b: (i + 1) % 24, rest: 20 + (i % 5), tier: ['LOW', 'MID', 'HIGH'][i % 3]!, mult: i % 4 === 0 ? 0.3 : undefined });
    for (let i = 0; i < 24; i += 3) bonds.push({ a: i, b: (i + 7) % 24, rest: 35, tier: 'MID', mult: 1.0 });
    bonds.push({ a: 5, b: 5, rest: 20, tier: 'MID', mult: undefined }); // self-bond: the aliasing case
    bonds.push({ a: 2, b: 9, rest: 18, tier: 'HIGH', mult: 0.3 });
    bonds.push({ a: 2, b: 9, rest: 18, tier: 'HIGH', mult: 0.3 }); // the same pair twice
    const r = compare({ bodies, bonds }, 'chains / rings / self / duplicate', 16);
    expect(r.moved).toBeGreaterThan(100);
  });

  it('the tables are read once per CALL: a retune between calls is seen by the next call', () => {
    const spec: NetSpec = { bodies: [[0, 0], [40, 0], [80, 3]], bonds: [
      { a: 0, b: 1, rest: 30, tier: 'MID', mult: undefined }, { a: 1, b: 2, rest: 30, tier: 'LOW', mult: 0.3 },
    ] };
    const R = build(spec);
    const N = build(spec);
    const saved = { s: { ...STIFFNESS_BY_TIER }, b: { ...STRAIN_BREAK_BY_TIER } };
    try {
      for (const [sMid, bLow] of [[0.5, 2.0], [0.9, 1.1], [0.1, 1.05]] as const) {
        STIFFNESS_BY_TIER.MID = sMid;
        STRAIN_BREAK_BY_TIER.LOW = bLow;
        expect(solveBonds(N.bonds)).toEqual(referenceSolveBonds(R.bonds));
        for (let i = 0; i < 3; i++) expect(Object.is(N.bodies[i]!.pos.x, R.bodies[i]!.pos.x) && Object.is(N.bodies[i]!.pos.y, R.bodies[i]!.pos.y)).toBe(true);
      }
    } finally {
      Object.assign(STIFFNESS_BY_TIER, saved.s);
      Object.assign(STRAIN_BREAK_BY_TIER, saved.b);
    }
  });

  it('400 random networks (dense, sparse, stretched, compressed), 8 substeps each', () => {
    let seed = 0xb0d5;
    const rnd = (): number => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return seed / 2 ** 32; };
    let broken = 0;
    for (let iter = 0; iter < 400; iter++) {
      const n = 2 + Math.floor(rnd() * 40);
      const spread = [60, 300, 1500][iter % 3]!;
      const bodies: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) bodies.push([rnd() * spread - spread / 3, rnd() * spread]);
      const bonds: BondSpec[] = [];
      const m = Math.floor(rnd() * n * 2.2);
      for (let k = 0; k < m; k++) {
        const a = Math.floor(rnd() * n);
        const b = rnd() < 0.03 ? a : Math.floor(rnd() * n);
        const [ax, ay] = bodies[a]!;
        const [bx, by] = bodies[b]!;
        const d = Math.hypot(bx - ax, by - ay);
        const rest = Math.max(20, d * (0.3 + rnd() * 1.6));
        const r = rnd();
        bonds.push({ a, b, rest, tier: ['LOW', 'MID', 'HIGH'][Math.floor(rnd() * 3)]!, mult: r < 0.3 ? undefined : r < 0.6 ? 1.0 : r < 0.8 ? 0.3 : rnd() });
      }
      broken += compare({ bodies, bonds }, `random network ${iter}`).broken;
    }
    expect(broken, 'the random networks broke bonds too').toBeGreaterThan(50);
  });
});
