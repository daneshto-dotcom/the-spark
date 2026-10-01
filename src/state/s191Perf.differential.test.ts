/**
 * SPARK — S191 P12 (`s191/perf`) — ⛔ THE MULTI-WAVE IDENTITY ORACLE FOR EVERY s191/perf CHANGE.
 *
 * Owner (C5): *"it was lagging at about wave five. I thought we fixed the lags"*. s191/perf changes the
 * hot paths the S191 profile ranked, one per commit, each a PURE performance change. This file is the
 * proof that, together, they moved nothing:
 *
 *  1. **EVERY CALL AGREES, IN PLACE.** Each changed function is routed through a `vi.mock` wrapper, so
 *     every call the REAL host tick makes runs the VERBATIM pre-change reference beside the real code
 *     on the same world at the same instant (`s191PerfOracle.fixtures.ts`), and every disagreement is
 *     counted. Arms, one per change:
 *       · TERRITORY — `computeTerritorialInfluence` (the anchor grid) and the radius map it reads
 *         (`computeAllPlayerRadii`, fed by the S191 2e dense union-find): every bond's
 *         `stiffnessMultiplier` and every radius, `Object.is`, against `territoryReference.fixtures.ts`.
 *       · NAV UNIT — `pickNavUnit` (the per-tick enemy index): every host call, plus every live
 *         creature's re-acquire once per tick and again after each injection, against
 *         `navUnitReference.fixtures.ts`. Between two calls of one tick it also injects a lethal
 *         DEFERRED blow to the unit just picked, an outright removal, and a birth beside the caller
 *         (Council S191 item 2), and counts holds the creature did not set itself (retaliation).
 *       · SOLVER — `solveBonds` (tier tables hoisted): every substep call, verbatim solver first from
 *         the same positions (`solveBondsReference.fixtures.ts`), every endpoint `pos` `Object.is` and
 *         the broken list compared.
 *       · SCORING — `computeAllComplexities` (combo answers memoised per call): every `tickScoring` call,
 *         the real map against the verbatim one (`scoringReference.fixtures.ts`), entries in insertion
 *         order; twin A scores with the verbatim `tickScoring`.
 *  2. **THE WORLDS DO NOT DIVERGE, ACROSS WAVES.** Two identical four-seat bots matches run in lockstep
 *     from tick 0 — twin A on EVERY reference, twin B on EVERY real change with the in-place checks —
 *     through whole waves (BUILD + FIGHT, creatures held in the last FIGHT), `hashWorldStateFull`
 *     compared EVERY tick. The wide hash projects `stiffnessMultiplier` (`:sm`), so a wrong multiplier
 *     is caught the tick it happens.
 *  3. **THE BOARD IS MADE TO EXERCISE WHAT A BOTS MATCH NEVER DOES.** Identically in both twins: a
 *     cross-seat WELD every 97 ticks (Council S191 item 1 — mixed-colour bonds) and an INTRUDER every
 *     131 ticks (the engulf never fires in a plain bots match — measured, see `plantIntruder`), each
 *     razed again 600 ticks later (permanent ones ended the match at wave 3 — see `Injected`).
 *
 * The edges each change's argument rests on are proven separately and fast
 * (`territoryGrid.differential.test.ts`).
 *
 * ## SCALE, AND ITS COST
 *
 * Default: waves 1–3 (27 000 ticks per twin, 40 creatures in wave 3's FIGHT) — ~28-30 s of test time on the shared
 * S191 machine (waves 1–5: ~100 s), ~40 % of it the wide hash of two worlds every tick. `SPARK_C5_PERF=1`: waves 1–5 with
 * 120 creatures, the board the owner reported. Same code, one parameter. Results in
 * `S191_PROGRESS_perf.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import type { World } from './world.ts';

import type { Creature } from './creatures/creature.ts';
import type { BondId, CreatureId } from '../types.ts';
import type { Bond } from '../physics/bonds.ts';

type RealTerritory = typeof import('./territory.ts');
type RealAI = typeof import('./creatures/creatureAI.ts');
type RealBonds = typeof import('../physics/bonds.ts');
type RealScoring = typeof import('./scoring.ts');
type NavFn = (w: World, c: Creature, held: CreatureId | null, acq: number, leash: number) => CreatureId | null;

const H = vi.hoisted(() => ({
  territory: null as unknown as RealTerritory,
  influence: null as unknown as (w: World) => void,
  ai: null as unknown as RealAI,
  pickNavUnit: null as unknown as NavFn,
  bonds: null as unknown as RealBonds,
  solve: null as unknown as (bonds: readonly Bond[]) => BondId[],
  scoring: null as unknown as RealScoring,
  tickScoring: null as unknown as (w: World) => void,
}));

vi.mock('./territory.ts', async (importOriginal) => {
  const real = await importOriginal<RealTerritory>();
  H.territory = real;
  return { ...real, computeTerritorialInfluence: (w: World) => H.influence(w) };
});

vi.mock('./scoring.ts', async (importOriginal) => {
  const real = await importOriginal<RealScoring>();
  H.scoring = real;
  return { ...real, tickScoring: (w: World) => H.tickScoring(w) };
});

vi.mock('../physics/bonds.ts', async (importOriginal) => {
  const real = await importOriginal<RealBonds>();
  H.bonds = real;
  return { ...real, solveBonds: (bonds: readonly Bond[]) => H.solve(bonds) };
});

vi.mock('./creatures/creatureAI.ts', async (importOriginal) => {
  const real = await importOriginal<RealAI>();
  H.ai = real;
  return {
    ...real,
    pickNavUnit: (w: World, c: Creature, held: CreatureId | null, acq: number, leash: number) => H.pickNavUnit(w, c, held, acq, leash),
  };
});

import { runHostTick } from './hostTick.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { referenceComputeTerritorialInfluence } from './territoryReference.fixtures.ts';
import { startC5Match, topUpCreatures, WAVE_TICKS } from './c5WaveFiveBoard.fixtures.ts';
import {
  makeNavChecker, makeScoringChecker, makeSolverChecker, makeTerritoryChecker, plantIntruder, removeInjected,
  weldNearestCrossSeatPair, type Injected, type NavInjectPlan,
} from './s191PerfOracle.fixtures.ts';
import { referenceTickScoring } from './scoringReference.fixtures.ts';
import { damageEntity } from './damage.ts';
import { referenceSolveBonds } from '../physics/solveBondsReference.fixtures.ts';

const FULL = process.env.SPARK_C5_PERF === '1';
const WAVES = FULL ? 5 : 3;
/** Held through the last FIGHT: 120 (the brother's S182 count) in the full run, 40 by default. */
const CREATURES = FULL ? 120 : 40;
/** Every this-many ticks both twins get the same cross-seat weld / intruder before their tick. */
const WELD_EVERY = 97;
const INTRUDE_EVERY = 131;
/** …and razes it again this many ticks later (see `Injected` for why injections are temporary). */
const INJECTION_LIFETIME = 600;

type Mode = 'reference' | 'checked';
let mode: Mode = 'checked';

const territory = makeTerritoryChecker(
  (w) => H.territory.computeTerritorialInfluence(w),
  (w) => H.territory.computeAllPlayerRadii(w),
);
H.influence = (w) => {
  if (mode === 'reference') referenceComputeTerritorialInfluence(w);
  else territory.check(w);
};

/** Between two `pickNavUnit` calls of one tick (2nd / 3rd / 4th): a lethal deferred blow to the unit
 *  just picked, an outright removal of it, a birth beside the caller — Council S191 item 2. */
const NAV_INJECT: NavInjectPlan = {
  killEvery: 7, removeEvery: 13, birthEvery: 19,
  // The production creature strike's own call shape (`creatureAttack.ts`), through the dispatcher.
  kill: (w, victim, attacker) =>
    damageEntity(w, { kind: 'creature', id: victim }, 1_000_000, 'creature', { kind: 'creature', id: attacker }, 'physical'),
};
const nav = makeNavChecker((w, c, h, a, l) => H.ai.pickNavUnit(w, c, h, a, l));
H.pickNavUnit = (w, c, held, acq, leash) => nav.call(w, c, held, acq, leash, mode === 'checked', NAV_INJECT);

const solver = makeSolverChecker((bonds) => H.bonds.solveBonds(bonds));
H.solve = (bonds) => (mode === 'reference' ? referenceSolveBonds(bonds) : solver.check(bonds));

const scoring = makeScoringChecker((w) => H.scoring.computeAllComplexities(w));
H.tickScoring = (w) => {
  if (mode === 'reference') { referenceTickScoring(w); return; }
  scoring.check(w); // in place, before the real pass accrues from the same board
  H.scoring.tickScoring(w);
};

describe(`S191 perf — every s191/perf change is byte-identical to the code it replaced (waves 1–${WAVES}, hash every tick)`, () => {
  it(`in-place agreement on every call, and a reference world and a changed world hash identically every tick for ${WAVES} waves`, async () => {
    territory.reset();
    nav.reset();
    solver.reset();
    scoring.reset();
    const A = startC5Match(true); // twin A: every REFERENCE
    const B = startC5Match(true); // twin B: every real change, every call also checked in place
    expect(hashWorldStateFull(A.world), 'the twins start identical').toBe(hashWorldStateFull(B.world));
    const end = WAVES * WAVE_TICKS;
    let divergedAt = -1;
    let maxBonds = 0;
    let maxCreatures = 0;
    let bondTicks = 0;
    let welds = 0;
    let intruders = 0;
    let mixedIntruders = 0;
    let hashMs = 0;
    /** Per twin: what to raze, and when — identical queues, drained identically. */
    const expiring: Array<{ at: number; a: Injected; b: Injected }> = [];
    const t0 = performance.now();
    while (A.world.tick < end && (A.world.gameState as string) === 'PLAYING') {
      if (A.world.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
      const t = A.world.tick;
      if (A.world.waveNumber === WAVES && A.world.matchPhase === 'FIGHT' && t % 60 === 0) {
        topUpCreatures(A.world, CREATURES);
        topUpCreatures(B.world, CREATURES);
      }
      while (expiring.length > 0 && expiring[0]!.at <= t) {
        const e = expiring.shift()!;
        removeInjected(A.world, e.a);
        removeInjected(B.world, e.b);
      }
      if (t % WELD_EVERY === 0 && t > 0) {
        const wa = weldNearestCrossSeatPair(A.world);
        const wb = weldNearestCrossSeatPair(B.world);
        expect(wb, 'both twins welded the same way').toEqual(wa);
        if (wa !== null && wb !== null) { welds++; expiring.push({ at: t + INJECTION_LIFETIME, a: wa, b: wb }); }
      }
      if (t % INTRUDE_EVERY === 0 && t > 0) {
        const k = t / INTRUDE_EVERY;
        const ia = plantIntruder(A.world, k);
        const ib = plantIntruder(B.world, k);
        expect(ib, 'both twins planted the same intruder').toEqual(ia);
        if (ia !== null && ib !== null) {
          intruders++;
          if (ib.kind === 'mixed') mixedIntruders++;
          expiring.push({ at: t + INJECTION_LIFETIME, a: ia, b: ib });
        }
      }
      expiring.sort((x, y) => x.at - y.at);
      mode = 'reference';
      A.bots.tick(A.world); runHostTick(A.world, A.deps, A.state); A.world.effects.length = 0;
      mode = 'checked';
      B.bots.tick(B.world); runHostTick(B.world, B.deps, B.state); B.world.effects.length = 0;
      maxBonds = Math.max(maxBonds, B.world.bonds.size);
      maxCreatures = Math.max(maxCreatures, B.world.creatures.size);
      bondTicks += B.world.bonds.size;
      const h0 = performance.now();
      const same = hashWorldStateFull(A.world) === hashWorldStateFull(B.world);
      hashMs += performance.now() - h0;
      if (!same) { divergedAt = A.world.tick; break; }
    }
    mode = 'checked';
    const ticks = B.world.tick;
    const ts = territory.stats;
    const ns = nav.stats;
    const ss = solver.stats;
    const sc = scoring.stats;
    console.log(`[S191 perf oracle] waves 1-${WAVES}: nav ${JSON.stringify(ns)}`);
    console.log(`[S191 perf oracle] waves 1-${WAVES}: solver ${JSON.stringify(ss)}`);
    console.log(`[S191 perf oracle] waves 1-${WAVES}: scoring ${JSON.stringify(sc)}`);
    console.log(`[S191 perf oracle] waves 1-${WAVES}: territory ${JSON.stringify(ts)}; welds=${welds} intruders=${intruders} (mixed ${mixedIntruders}) ticks=${ticks} maxBonds=${maxBonds} meanBonds=${(bondTicks / Math.max(1, ticks)).toFixed(0)} maxCreatures=${maxCreatures} reached wave ${A.world.waveNumber} ${A.world.matchPhase}; wall ${((performance.now() - t0) / 1000).toFixed(1)} s of which hashing ${(hashMs / 1000).toFixed(1)} s`);

    expect(ts.mismatches, `territory in-place mismatches:\n${territory.firstMismatches.join('\n')}`).toBe(0);
    expect(ns.mismatches, `nav-unit in-place mismatches:\n${nav.firstMismatches.join('\n')}`).toBe(0);
    expect(ss.mismatches, `solver in-place mismatches:\n${solver.firstMismatches.join('\n')}`).toBe(0);
    expect(sc.mismatches, `scoring in-place mismatches:\n${scoring.firstMismatches.join('\n')}`).toBe(0);
    expect(divergedAt, 'hashWorldStateFull diverged between the reference world and the changed world').toBe(-1);
    expect(A.world.tick, 'the run reached the end of its last wave').toBe(end);
    /*
     * ── ANTI-VACUITY FLOORS ── (the bondTargetIndex.differential discipline: each a FLOOR well under the
     * measured value, with its reason. ⚠ FOR THE MERGE OWNER: if a merge takes one under, re-measure;
     * if the drop is real, LENGTHEN the run (more waves) until it holds and restate the measurement.
     * Never lower an "at least one" floor to zero — that deletes the claim and leaves the test green.)
     */
    const floors: ReadonlyArray<readonly [what: string, actual: number, floor: number, measured: string, why: string]> = [
      ['territory: one checked call per host tick', ts.calls, end, '27 000 / 45 000',
        'structural: stepPhysics calls the pass once per tick'],
      ['a real board (max bonds)', maxBonds, 100, '206 / 476',
        'bots build every wave; a merge that makes them build less can lower it'],
      ['intruders planted', intruders, 50, '98 / 166', 'one every 131 ticks once two seats have shapes'],
      ['territory: bonds engulfed (sum over calls)', ts.engulfed, 10_000, '679 216 / 2 501 844',
        'the grid only matters where an enemy bond sits inside a territory; without the intruders this is 0'],
      ['territory: calls that engulfed at least one bond', ts.callsWithEngulf, 1000, '24 980 / 42 563',
        'engulfing must be a sustained state of the run, not a one-off'],
      ['the last FIGHT held its creatures', maxCreatures, CREATURES - 5, '43 / 123',
        'set by the top-up lever: creatures raze shapes mid-run, which is what moves the grid'],
      ['cross-seat welds injected (Council S191 item 1)', welds, 50, '264 / 449',
        'one every 97 ticks once two seats have shapes'],
      ['territory: a welded MIXED-colour bond was visited (Council S191 item 1)', ts.mixedVisited, 1, '123 788 / 212 400',
        'an existence claim the Council asked for: the per-bond skip must meet a mixed bond on a real board'],
      ['territory: the radius map compared in place every call (S191 2e)', ts.radiiCompared, end, '27 000 / 45 000',
        'structural: once per influence call'],
      ['territory: a MIXED bond was engulfed by a THIRD seat', ts.mixedEngulfed, 1, '87 260 / 161 075',
        'an existence claim: the either-endpoint skip exercised on its engulfing side too'],
      ['nav: host-tick pickNavUnit calls', ns.calls, 1000, '228 350 / 579 376', 'every SEEKING structure-attacker, every FIGHT tick'],
      ['nav: comparisons (calls + sweeps)', ns.compared, 10_000, '336 464 / 901 061', 'a whole-population sweep per tick and after every injection'],
      ['nav: a unit was found', ns.nonNull, 100, '47 598 / 135 866', 'a re-acquire that always returns null proves nothing'],
      ['nav: injected lethal blows between two calls (Council S191 item 2)', ns.injectedKills, 20, '384 / 624', 'every 7th FIGHT tick with 2+ calls and a pick'],
      ['nav: injected removals between two calls', ns.injectedRemovals, 10, '230 / 380', 'every 13th FIGHT tick with 3+ calls and a pick'],
      ['nav: injected births between two calls', ns.injectedBirths, 10, '736 / 1 146', 'every 19th FIGHT tick with 4+ calls'],
      ['nav: calls AFTER a mid-loop creature-set change, same tick', ns.callsAfterMidLoopChange, 100, '16 468 / 51 392', 'the calls that would read a stale index'],
      ['nav: a held lock the creature did not set itself (a retaliation turn) (Council S191 item 2)', ns.heldElsewhere, 1, '104 / 220', 'an existence claim: the retaliation hold is exercised'],
      ['nav: and that hold was kept', ns.heldElsewhereKept, 1, '104 / 220', 'an existence claim: the hold branch returned it'],
      ['solver: calls (8 substeps per tick with bonds)', ss.calls, 100_000, '204 472 / 348 472', 'structural: the substep loop'],
      ['solver: bonds solved', ss.bondsSolved, 1_000_000, '19 471 513 / 71 798 337', 'a real board, every substep'],
      ['solver: bonds solved SAGGED (multiplier != 1)', ss.sagged, 10_000, '7 285 382 / 31 589 227', 'the territory / anchor path — the intruders make it real'],
      ['solver: bonds broken by strain', ss.broken, 1, '4 / 43', 'an existence claim: the break branch runs in the real match'],
      ['solver: LOW-tier bonds solved', ss.low, 1000, '2 070 592 / 5 977 624', 'every tier branch exercised'],
      ['solver: MID-tier bonds solved', ss.mid, 1000, '14 482 152 / 48 990 587', 'every tier branch exercised'],
      ['solver: HIGH-tier bonds solved', ss.high, 1000, '2 918 769 / 16 830 126', 'every tier branch exercised'],
      ['scoring: checked calls (FIGHT ticks)', sc.calls, 1000, '10 800 / 18 000', 'tickScoring accrues in FIGHT only'],
      ['scoring: calls on a board with a MAGIC bond', sc.withMagic, 100, '10 800 / 18 000', 'the magic memo branch'],
      ['scoring: calls on a board with a FILAMENT', sc.withFilament, 1, '10 800 / 18 000', 'an existence claim: the Filament + keystone branch'],
    ];
    /*
     * ⚠ MEASURED, NOT ASSERTED: `naturalMidLoopChanges` — the sim changing the creature set between two
     * `pickNavUnit` calls of one tick by itself — was 0 on the default run: deaths inside the loop are
     * DEFERRED (S155 N1), so the Map's size does not move, and nothing in the loop spawns between two
     * structure-attackers' picks. The index's rebuild path is therefore exercised by the INJECTED
     * kills / removals / births above (`callsAfterMidLoopChange`), which is why those are floors.
     * `pendingDeathReturned` (the live scan handing back a unit killed earlier the same loop — kept by
     * the index, see `EnemyCreatureIndex`) is printed for the same reason: a count, not a claim. And
     * scoring's `withFouled` is 0 in a bots match (the seagull hazard that fouls shapes is switched off),
     * so the fouled branch is proven only by `scoringMemo.differential.test.ts`.
     */
    for (const [what, actual, floor, measured, why] of floors) {
      expect(actual, `${what}: ${actual} is under its floor ${floor} (measured S191 default / full: ${measured}; ${why})`)
        .toBeGreaterThanOrEqual(floor);
    }
  }, FULL ? 3_600_000 : 240_000);
});
