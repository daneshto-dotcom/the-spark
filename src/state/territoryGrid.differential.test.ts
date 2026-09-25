/**
 * SPARK — S191 P12 (`s191/perf`) — THE TERRITORY ANCHOR GRID ON THE EDGES ITS ARGUMENT RESTS ON.
 *
 * `computeTerritorialInfluence` now tests an endpoint only against the anchors in its own grid cell and
 * the eight around it (cells of side R + 1), and falls back to the old exhaustive test outside a ±1e6
 * envelope or above a cell cap. Its docblock argues the result is identical by construction; this file
 * attacks each step of that argument on synthetic boards and compares EVERY bond's
 * `stiffnessMultiplier` (`Object.is`) against the VERBATIM pre-change pass
 * (`territoryReference.fixtures.ts`), through the same in-place comparator the long multi-wave twin
 * oracle uses (`s191PerfOracle.fixtures.ts` → `s191Perf.differential.test.ts`):
 *   · endpoints exactly at R, one ulp inside, ±1e-9 around it, and straddling every cell line near an
 *     anchor, with and without the shrink debuff (R halved);
 *   · coordinates outside the envelope, NaN and ±Infinity, a lone anchor far outside, a spread wide
 *     enough to exceed the cell cap;
 *   · own bonds, MIXED-colour bonds (Council S191 item 1: engulfable only by a third seat), a
 *     degenerate bond, overlapping territories, a seat with no shapes;
 *   · 600 random four-seat boards.
 */
import { describe, expect, it } from 'vitest';
import type { World } from './world.ts';
import { computeTerritorialInfluence, computeTerritorialRadius } from './territory.ts';
import { addBond, addPrim, emptyBoard, makeTerritoryChecker } from './s191PerfOracle.fixtures.ts';
import { asPlayerId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';

const checker = makeTerritoryChecker(computeTerritorialInfluence);

/** Real vs reference on one synthetic world, per bond, `Object.is`. Returns the engulfed count. */
function compareOnce(w: World, label: string): number {
  checker.reset();
  checker.check(w);
  expect(checker.stats.mismatches, `${label}:\n${checker.firstMismatches.join('\n')}`).toBe(0);
  return checker.stats.engulfed;
}

const radiusOf = (w: World, seat: number): number => computeTerritorialRadius(asPlayerId(seat), w);

describe('S191 perf — the territory grid on the edges its argument rests on (vs the verbatim reference)', () => {
  it('600 random four-seat boards, coordinates spread over ±3000 (negatives, off-board, clustered and not)', () => {
    let seed = 0x5191;
    const rnd = (): number => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return seed / 2 ** 32; };
    let engulfedTotal = 0;
    let mixedVisited = 0;
    for (let iter = 0; iter < 600; iter++) {
      const w = emptyBoard();
      w.tick = Math.floor(rnd() * 600);
      const spread = iter % 3 === 0 ? 3000 : iter % 3 === 1 ? 900 : 250;
      for (let seat = 0; seat < 4; seat++) {
        const n = Math.floor(rnd() * 14);
        const prims: Primitive[] = [];
        const cx = 960 + (rnd() - 0.5) * spread;
        const cy = 540 + (rnd() - 0.5) * spread;
        for (let i = 0; i < n; i++) prims.push(addPrim(w, seat, cx + (rnd() - 0.5) * spread, cy + (rnd() - 0.5) * spread));
        for (let i = 1; i < prims.length; i++) if (rnd() < 0.7) addBond(w, prims[i - 1]!, prims[Math.floor(rnd() * i)]!);
        if (rnd() < 0.25) w.players.get(asPlayerId(seat))!.territorialShrinkUntilTick = w.tick + Math.floor(rnd() * 200) - 50;
      }
      // Mixed bonds (welds — Council S191 item 1) and, sometimes, a degenerate one.
      const all = [...w.primitives.values()];
      for (let m = 0; m < 3; m++) {
        if (all.length >= 2 && rnd() < 0.6) addBond(w, all[Math.floor(rnd() * all.length)]!, all[Math.floor(rnd() * all.length)]!);
      }
      if (all.length >= 3 && rnd() < 0.2) w.primitives.delete(all[0]!.id);
      engulfedTotal += compareOnce(w, `random board ${iter}`);
      mixedVisited += checker.stats.mixedVisited;
    }
    expect(engulfedTotal, 'the random boards engulfed something (anti-vacuity)').toBeGreaterThan(200);
    expect(mixedVisited, 'the random boards carried mixed bonds (anti-vacuity)').toBeGreaterThan(100);
  });

  it('endpoints exactly at R, one ulp inside, and straddling every cell boundary near an anchor', () => {
    let engulfedTotal = 0;
    let compared = 0;
    for (const shrink of [false, true]) {
      for (const ax of [0, 0.5, -37.25, 1234.0625, 999_999]) {
        const w = emptyBoard();
        const anchor = addPrim(w, 0, ax, 300);
        const buddy = addPrim(w, 0, ax, 300.5); // seat 0's structure: two prims, one bond
        addBond(w, anchor, buddy);
        if (shrink) { w.tick = 10; w.players.get(asPlayerId(0))!.territorialShrinkUntilTick = 100; }
        const R = radiusOf(w, 0);
        const cell = R + 1; // the grid's cell side (territory.ts `buildAnchorGrid`)
        const offsets: number[] = [R, -R, R * (1 - 2 ** -52), -R * (1 - 2 ** -52), R - 1e-9, R + 1e-9, 0];
        // Anchor-relative points on and either side of every cell line near the anchor.
        const k0 = Math.floor(ax / cell);
        for (let k = k0 - 2; k <= k0 + 3; k++) for (const e of [-1e-7, 0, 1e-7]) offsets.push(k * cell + e - ax);
        for (const dx of offsets) {
          for (const dy of [0, 1e-3, R * 0.5]) {
            const p = addPrim(w, 1, ax + dx, 300 + dy);
            const q = addPrim(w, 1, ax + dx + 500, 300 + dy + 500); // far endpoint: only p can engulf
            addBond(w, p, q);
          }
        }
        engulfedTotal += compareOnce(w, `boundary ax=${ax} shrink=${shrink}`);
        compared += checker.stats.bondsCompared;
      }
    }
    expect(engulfedTotal, 'some boundary endpoints were inside (anti-vacuity)').toBeGreaterThan(50);
    expect(compared, 'every boundary endpoint was compared').toBeGreaterThan(500);
  });

  it('outside the envelope: ±2e6 coordinates, NaN, ±Infinity, a lone far anchor, and a cell-cap spread', () => {
    const cases: ReadonlyArray<readonly [label: string, anchors: ReadonlyArray<readonly [number, number]>, ends: ReadonlyArray<readonly [number, number]>]> = [
      ['anchor and endpoint both at 2e6', [[2e6, 2e6], [2e6 + 1, 2e6]], [[2e6 + 30, 2e6], [2e6 - 30, 2e6 + 5], [2e6 + 5000, 2e6]]],
      ['anchor at -3e6, endpoints near it and at the board', [[-3e6, 10], [-3e6, 11]], [[-3e6 + 20, 10], [100, 100]]],
      ['in-envelope anchors + one loose anchor, endpoint near the loose one', [[500, 500], [501, 500], [1.5e6, 0]], [[1.5e6 + 10, 0], [520, 500], [5000, 5000]]],
      ['NaN and Infinity anchors beside real ones', [[NaN, 300], [Infinity, 300], [300, -Infinity], [300, 300]], [[310, 300], [NaN, 300], [Infinity, Infinity], [-Infinity, 300]]],
      ['endpoints beyond the envelope near an in-envelope anchor', [[999_990, 0], [999_991, 0]], [[1_000_010, 0], [1_000_000, 0], [-1_000_020, 0]]],
      // The loose list's own reason to exist: an anchor just OUTSIDE the envelope, an endpoint just
      // INSIDE it (so the grid path runs) and within R of that anchor only.
      ['a loose anchor just outside the envelope, in-envelope endpoints near it', [[100, 100], [101, 100], [1_000_005, -1_000_003]], [[999_990, -999_995], [999_999, -1_000_000], [110, 100]]],
      ['a spread that exceeds the cell cap (exhaustive path)', [[-999_000, -999_000], [999_000, 999_000], [0, 0]], [[-999_000 + 10, -999_000], [999_000 - 10, 999_000], [15, 0], [400_000, 0]]],
    ];
    let engulfedTotal = 0;
    for (const [label, anchors, ends] of cases) {
      const w = emptyBoard();
      const ps = anchors.map(([x, y]) => addPrim(w, 0, x, y));
      for (let i = 1; i < ps.length; i++) addBond(w, ps[i - 1]!, ps[i]!);
      for (const [x, y] of ends) addBond(w, addPrim(w, 2, x, y), addPrim(w, 2, x, y + 0.25));
      engulfedTotal += compareOnce(w, label);
    }
    expect(engulfedTotal, 'the envelope cases engulfed their near endpoints (anti-vacuity)').toBeGreaterThan(5);
  });

  it('own bonds, mixed bonds (engulfed only by a third seat), a degenerate bond, overlap, a seat with no shapes', () => {
    const w = emptyBoard();
    const s0 = [addPrim(w, 0, 400, 400), addPrim(w, 0, 430, 400), addPrim(w, 0, 460, 410)];
    const s1 = [addPrim(w, 1, 520, 400), addPrim(w, 1, 540, 420)];
    const s2 = [addPrim(w, 2, 470, 470), addPrim(w, 2, 480, 490)];
    addBond(w, s0[0]!, s0[1]!); addBond(w, s0[1]!, s0[2]!); // own (seat 0)
    addBond(w, s1[0]!, s1[1]!); // seat 1 inside seat 0's and seat 2's radii
    addBond(w, s2[0]!, s2[1]!);
    addBond(w, s0[2]!, s1[0]!); // mixed 0/1 — only seat 2 can engulf it
    addBond(w, s1[1]!, s2[0]!); // mixed 1/2 — only seat 0 can engulf it
    const doomed = addPrim(w, 2, 450, 450);
    addBond(w, doomed, s2[1]!);
    w.primitives.delete(doomed.id); // degenerate: an endpoint missing from world.primitives
    expect(radiusOf(w, 3), 'seat 3 has no shapes → radius 0 → skipped by both').toBe(0);
    expect(compareOnce(w, 'mixed / own / degenerate / overlap')).toBeGreaterThan(0);
    expect(checker.stats.mixedVisited, 'both mixed bonds were visited').toBe(2);
    expect(checker.stats.mixedEngulfed, 'a mixed bond was engulfed by the third seat').toBeGreaterThanOrEqual(1);
  });
});
