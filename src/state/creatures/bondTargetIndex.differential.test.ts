/**
 * SPARK — S190 P0 (C5) — ⛔ THE IDENTITY ORACLE FOR THE BOND-TARGET INDEX.
 *
 * Owner, S189: *"it was lagging at about wave five. I thought we fixed the lags"*. The measured cause
 * was the structure-target bond scan: every creature, every tick, walked every bond two or three
 * times with four `Map.get`s each. s190/perf replaces that with a per-tick index. It is a PURE
 * performance change, and this file is the proof — not a claim — that nothing a player could see
 * has moved.
 *
 * ## THE THREE THINGS IT PROVES
 *
 *  1. **EVERY SCAN AGREES, AT THE INSTANT IT HAPPENS.** `creatureAI.ts` is routed through a
 *     `vi.mock` wrapper, so every call the REAL host tick makes to `structureTargets` /
 *     `findNearestBondTarget` is compared, in place, against the verbatim pre-change scan
 *     (`bondTargetReference.fixtures.ts`) on the same world — all three variants (structureTargets,
 *     enemy-only, Voltkin) for the creature being scanned, and once per tick for EVERY live
 *     creature. In place matters: the scans are interleaved with strikes and severs, so a check
 *     run before or after the tick would miss exactly the hazard this change has to survive.
 *  2. **THE WORLDS DO NOT DIVERGE.** At a wave-N FIGHT the world is forked (`structuredClone`, which
 *     keeps a bond's `a`/`b` pointing at the same objects as `world.primitives` — asserted) and the
 *     two forks run in lockstep: one on the REFERENCE, one on the INDEX. `hashWorldStateFull` — the
 *     wide, test-only oracle — must match every tick. This is what catches an index that returns
 *     the right ids but mutates something while building.
 *  3. **MID-TICK MUTATION CANNOT FOOL IT.** Bonds die mid-tick — a strike, a drone, a suicide blast
 *     — and this also INJECTS them between two creatures' scans: a sever of the bond the scanning
 *     creature just chose, a brand-new bond (strict AND mixed-colour), and a whole primitive razed.
 *     The very next scans in the same tick must still agree with the reference.
 *
 * ## ⚠ THE SCALE, AND WHY THE DEFAULT SUITE RUNS A SMALLER ONE
 *
 * Reaching wave 5 costs ~22 s of host ticks before a single interesting scan (the BUILD phases are
 * physics, not targeting), and the suite's 20 s budget is a bound on wall clock, not a licence. So
 * the default run forks at **wave 3's FIGHT** (~280 bonds, 120 creatures) for 600 ticks; with
 * `SPARK_C5_PERF=1` it runs the full case — **wave 5's FIGHT, all 3600 ticks**. Same code, one
 * parameter. The full run's result is recorded in `S190_PROGRESS_perf.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../world.ts';
import type { Creature, CreatureType } from './creature.ts';
import type { BondId, PrimitiveId } from '../../types.ts';

type RealAI = typeof import('./creatureAI.ts');
type RefAI = typeof import('./bondTargetReference.fixtures.ts');
type StResult = { primitiveId: PrimitiveId | null; bondId: BondId | null };

const H = vi.hoisted(() => ({
  real: null as unknown as RealAI,
  ref: null as unknown as RefAI,
  structureTargets: null as unknown as (w: World, c: Creature) => StResult,
  findNearestBondTarget: null as unknown as (w: World, c: Creature, enemyOnly: boolean) => BondId | null,
}));

vi.mock('./creatureAI.ts', async (importOriginal) => {
  const real = await importOriginal<RealAI>();
  const ref = await import('./bondTargetReference.fixtures.ts');
  H.real = real;
  H.ref = ref;
  return {
    ...real,
    structureTargets: (w: World, c: Creature) => H.structureTargets(w, c),
    findNearestBondTarget: (w: World, c: Creature, enemyOnly: boolean = false) => H.findNearestBondTarget(w, c, enemyOnly),
  };
});

import { runHostTick, makeHostTickState } from '../hostTick.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { razePrimitives } from '../razePrimitives.ts';
import { makeBond } from '../placePrimitive.ts';
import { PLAYER_COLORS } from '../../constants.ts';
import { BotManager } from '../../bots/botManager.ts';
import { c5Deps, fightStartTick, startC5Match, topUpCreatures } from '../c5WaveFiveBoard.fixtures.ts';
import type { Primitive } from '../../game/primitive.ts';

const FULL = process.env.SPARK_C5_PERF === '1';
const FORK_WAVE = FULL ? 5 : 3;
const WINDOW_TICKS = FULL ? 3600 : 600;
const CREATURES = 120;
/** Every scan path the host tick has: structure-attackers, Voltkin (own fallback), chewer (enemy-only
 *  + spread), the drone (enemy-only homing) and the suicide goblin (structure-attacker + blast). */
const DIFF_MIX: readonly CreatureType[] = [
  'goblinMelee', 'voltkin', 'chewer', 'goblinArcher', 'lightningDrone',
  'goblinShield', 'goblinSuicide', 'goblinHound', 'raceUnit',
];

/* ───────────────────────────── the harness ───────────────────────────── */

type Mode = 'checked' | 'reference';
let mode: Mode = 'checked';
/** How often to inject a mid-tick mutation, and after which scan of the tick. `null` = never. */
interface InjectPlan { severEvery: number; createEvery: number; razeEvery: number }
let inject: InjectPlan | null = null;
let sweepEveryTick = false;

const stats = {
  hostScans: 0, compared: 0, mismatches: 0, sweeps: 0,
  injectedSevers: 0, injectedCreates: 0, injectedMixedCreates: 0, injectedRazes: 0,
  scansAfterMidTickMutation: 0, naturalMidTickMutations: 0,
  createdPickedLaterSameTick: 0, severedReturned: 0,
};
const firstMismatches: string[] = [];

interface ScanState { tick: number; n: number; mutated: boolean; lastFp: string; severed: Set<number>; created: Set<number> }
const scanStates = new WeakMap<World, ScanState>();
const fp = (w: World): string => `${w.bonds.size}/${w.nextBondId}/${w.primitives.size}/${w.nextPrimitiveId}`;

function mismatch(w: World, c: Creature, what: string, real: unknown, ref: unknown): void {
  stats.mismatches++;
  if (firstMismatches.length < 8) {
    firstMismatches.push(`tick ${w.tick} creature ${c.id as unknown as number} (${c.type}) ${what}: index=${JSON.stringify(real)} reference=${JSON.stringify(ref)}`);
  }
}

/** All three variants for one creature, index against reference, on the world as it is RIGHT NOW. */
function compareAll(w: World, c: Creature): void {
  const rs = H.real.structureTargets(w, c);
  const fs = H.ref.referenceStructureTargets(w, c, H.real.findNearestEnemyPrimitiveFrom);
  if (rs.primitiveId !== fs.primitiveId || rs.bondId !== fs.bondId) mismatch(w, c, 'structureTargets', rs, fs);
  for (const enemyOnly of [true, false]) {
    const r = H.real.findNearestBondTarget(w, c, enemyOnly);
    const f = H.ref.referenceFindNearestBondTarget(w, c, enemyOnly);
    if (r !== f) mismatch(w, c, `findNearestBondTarget(enemyOnly=${enemyOnly})`, r, f);
  }
  stats.compared += 3;
}

function sweep(w: World): void {
  for (const c of w.creatures.values()) compareAll(w, c);
  stats.sweeps++;
}

function ownerColourOf(w: World, c: Creature): number {
  return w.players.get(c.ownerPlayerId)?.color ?? PLAYER_COLORS[c.ownerPlayerId as unknown as number]!;
}

/** The `k` nearest primitives to `c` passing `keep`, by (distSq, id) — a total order, never Map order. */
function nearestPrims(w: World, c: Creature, keep: (p: Primitive) => boolean, k: number): Primitive[] {
  const all: Array<{ p: Primitive; d: number }> = [];
  for (const p of w.primitives.values()) {
    if (!keep(p)) continue;
    const dx = p.pos.x - c.pos.x;
    const dy = p.pos.y - c.pos.y;
    all.push({ p, d: dx * dx + dy * dy });
  }
  all.sort((a, b) => a.d - b.d || (a.p.id as unknown as number) - (b.p.id as unknown as number));
  return all.slice(0, k).map((e) => e.p);
}

function lowestId<K>(m: Map<K, unknown>): K | null {
  let best: K | null = null;
  for (const k of m.keys()) if (best === null || (k as unknown as number) < (best as unknown as number)) best = k;
  return best;
}

/** A REAL bond, built the way production builds one: `makeBond` allocates from `world.nextBondId`. */
function weld(w: World, a: Primitive, b: Primitive): BondId | null {
  for (const id of a.bonds) if (b.bonds.has(id)) return null; // already welded
  const bond = makeBond(w, a, b, 'MID');
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond.id;
}

/**
 * Runs after every scan the HOST TICK makes, in BOTH modes, so the two forks see the same injections
 * at the same logical instant — between this creature's scan and the next creature's.
 */
function afterHostScan(w: World, c: Creature, returned: BondId | null): void {
  let s = scanStates.get(w);
  if (s === undefined || s.tick !== w.tick) {
    s = { tick: w.tick, n: 0, mutated: false, lastFp: fp(w), severed: new Set(), created: new Set() };
    scanStates.set(w, s);
  }
  s.n++;
  stats.hostScans++;
  const now = fp(w);
  if (s.n > 1 && now !== s.lastFp) { stats.naturalMidTickMutations++; s.mutated = true; }
  if (s.mutated) stats.scansAfterMidTickMutation++;
  if (returned !== null && s.severed.has(returned as unknown as number)) stats.severedReturned++;
  if (returned !== null && s.created.has(returned as unknown as number)) stats.createdPickedLaterSameTick++;

  let injected = false;
  if (inject !== null) {
    if (w.tick % inject.severEvery === 0 && s.n === 2) {
      const victim = returned !== null && w.bonds.has(returned) ? returned : lowestId(w.bonds);
      if (victim !== null) {
        razePrimitives(w, [], [victim], true); // the sever/damage path's own call shape
        s.severed.add(victim as unknown as number);
        stats.injectedSevers++;
        injected = true;
      }
    }
    if (w.tick % inject.createEvery === 3 % inject.createEvery && s.n === 3) {
      const own = ownerColourOf(w, c);
      const mixed = Math.floor(w.tick / inject.createEvery) % 2 === 1;
      const enemies = nearestPrims(w, c, (p) => p.placerColor !== own, 2);
      const pair = mixed ? [enemies[0], nearestPrims(w, c, (p) => p.placerColor === own, 1)[0]] : enemies;
      if (pair.length === 2 && pair[0] !== undefined && pair[1] !== undefined) {
        const id = weld(w, pair[0], pair[1]);
        if (id !== null) {
          s.created.add(id as unknown as number);
          stats.injectedCreates++;
          if (mixed) stats.injectedMixedCreates++;
          injected = true;
        }
      }
    }
    if (w.tick % inject.razeEvery === 5 % inject.razeEvery && s.n === 4) {
      const viaBond = returned !== null ? w.bonds.get(returned) : undefined;
      const primId = viaBond?.aId ?? lowestId(w.primitives);
      if (primId !== null && w.primitives.has(primId)) {
        razePrimitives(w, [primId]);
        stats.injectedRazes++;
        injected = true;
      }
    }
  }
  if (injected) {
    s.mutated = true;
    // The mutation has landed between this scan and the next; prove the index sees it at once.
    if (mode === 'checked') sweep(w);
  }
  s.lastFp = fp(w);
}

function beforeHostScan(w: World): void {
  const s = scanStates.get(w);
  const firstOfTick = s === undefined || s.tick !== w.tick;
  if (firstOfTick && sweepEveryTick && mode === 'checked') sweep(w);
}

H.structureTargets = (w, c) => {
  beforeHostScan(w);
  let result: StResult;
  if (mode === 'reference') {
    result = H.ref.referenceStructureTargets(w, c, H.real.findNearestEnemyPrimitiveFrom);
  } else {
    result = H.real.structureTargets(w, c);
    compareAll(w, c);
  }
  afterHostScan(w, c, result.bondId);
  return result;
};
H.findNearestBondTarget = (w, c, enemyOnly) => {
  beforeHostScan(w);
  let result: BondId | null;
  if (mode === 'reference') {
    result = H.ref.referenceFindNearestBondTarget(w, c, enemyOnly);
  } else {
    result = H.real.findNearestBondTarget(w, c, enemyOnly);
    compareAll(w, c);
  }
  afterHostScan(w, c, result);
  return result;
};

function resetStats(): void {
  for (const k of Object.keys(stats) as Array<keyof typeof stats>) stats[k] = 0;
  firstMismatches.length = 0;
}

/* ───────────────────────────── the long match ───────────────────────────── */

describe(`S190 C5 — the bond-target index is byte-identical to the scan it replaced (fork at wave ${FORK_WAVE})`, () => {
  it(`every scan agrees in place, and a reference world and an index world hash identically for ${WINDOW_TICKS} ticks of a 120-creature FIGHT`, async () => {
    resetStats();
    /* ── the prefix: a real four-seat bots match, every scan checked in place ── */
    mode = 'checked';
    sweepEveryTick = false;
    inject = { severEvery: 293, createEvery: 101, razeEvery: 401 }; // sparse: the bots must still build a real board
    const m = startC5Match(true);
    const forkAt = fightStartTick(FORK_WAVE);
    while (m.world.tick < forkAt && (m.world.gameState as string) === 'PLAYING') {
      if (m.world.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
      m.bots.tick(m.world);
      runHostTick(m.world, m.deps, m.state);
      m.world.effects.length = 0;
    }
    expect(m.world.gameState, 'the prefix match is still being played').toBe('PLAYING');
    expect(m.world.waveNumber).toBe(FORK_WAVE);
    const prefix = { ...stats };
    expect(prefix.mismatches, `prefix mismatches:\n${firstMismatches.join('\n')}`).toBe(0);
    expect(prefix.hostScans, 'the prefix really scanned').toBeGreaterThan(1000);

    /* ── the fork: identical twins, one on the reference and one on the index ── */
    topUpCreatures(m.world, CREATURES, DIFF_MIX);
    const A = structuredClone(m.world);
    const B = structuredClone(m.world);
    for (const w of [A, B]) {
      const bond = w.bonds.values().next().value!;
      expect(bond.a, 'structuredClone kept bond.a === world.primitives.get(aId)').toBe(w.primitives.get(bond.aId));
    }
    expect(hashWorldStateFull(A)).toBe(hashWorldStateFull(m.world));
    expect(hashWorldStateFull(B)).toBe(hashWorldStateFull(m.world));
    const twin = (w: World) => ({ w, bots: new BotManager(['HARD', 'IMBA', 'IMBA'], 0xbeef), deps: c5Deps(), st: makeHostTickState(w) });
    const ref = twin(A);
    const idx = twin(B);

    resetStats();
    inject = { severEvery: 13, createEvery: 7, razeEvery: 29 }; // denser than the prefix, but the board must survive the window
    sweepEveryTick = true;
    let divergedAt = -1;
    let maxCreatures = 0;
    let minBonds = Infinity;
    let bondTicks = 0;
    const bondsAtFork = B.bonds.size;
    const end = forkAt + WINDOW_TICKS;
    while (A.tick < end && (A.gameState as string) === 'PLAYING') {
      if (A.tick % 250 === 0) await new Promise<void>((r) => setImmediate(r));
      if (A.tick % 60 === 0) { topUpCreatures(A, CREATURES, DIFF_MIX); topUpCreatures(B, CREATURES, DIFF_MIX); }
      mode = 'reference';
      ref.bots.tick(A); runHostTick(A, ref.deps, ref.st); A.effects.length = 0;
      mode = 'checked';
      idx.bots.tick(B); runHostTick(B, idx.deps, idx.st); B.effects.length = 0;
      maxCreatures = Math.max(maxCreatures, B.creatures.size);
      minBonds = Math.min(minBonds, B.bonds.size);
      bondTicks += B.bonds.size;
      if (hashWorldStateFull(A) !== hashWorldStateFull(B)) { divergedAt = A.tick; break; }
    }
    inject = null;
    sweepEveryTick = false;
    mode = 'checked';

    console.log(`[S190 C5 oracle] fork at wave ${FORK_WAVE} tick ${forkAt}, window ${WINDOW_TICKS} ticks — prefix: ${JSON.stringify(prefix)}`);
    console.log(`[S190 C5 oracle] window: ${JSON.stringify(stats)} maxCreatures=${maxCreatures} bonds at fork=${bondsAtFork} min=${minBonds} mean=${(bondTicks / WINDOW_TICKS).toFixed(0)} reached tick ${A.tick}`);

    expect(stats.mismatches, `window mismatches:\n${firstMismatches.join('\n')}`).toBe(0);
    expect(divergedAt, 'hashWorldStateFull diverged between the reference world and the index world').toBe(-1);
    expect(A.tick, 'the window ran to the end').toBe(end);
    // ── anti-vacuity: the window really exercised what it claims to ──
    expect(maxCreatures, 'the board carried the 120 creatures').toBeGreaterThanOrEqual(CREATURES - 5);
    // 120 creatures DO take a board apart — that is the fight — so the bar is a real board at the
    // fork and a board that never emptied, not a board that never shrank.
    expect(bondsAtFork, 'a real wave board at the fork').toBeGreaterThan(150);
    expect(minBonds, 'the board never emptied during the window').toBeGreaterThan(20);
    expect(stats.sweeps, 'a whole-board sweep ran every tick').toBeGreaterThanOrEqual(WINDOW_TICKS);
    expect(stats.injectedSevers, 'mid-tick severs injected').toBeGreaterThan(20);
    expect(stats.injectedCreates, 'mid-tick bond creations injected').toBeGreaterThan(20);
    expect(stats.injectedMixedCreates, 'mixed-colour creations injected').toBeGreaterThan(5);
    expect(stats.injectedRazes, 'mid-tick primitive razes injected').toBeGreaterThan(10);
    expect(stats.naturalMidTickMutations, 'the sim itself severed between two scans').toBeGreaterThan(0);
    expect(stats.scansAfterMidTickMutation, 'scans ran AFTER a mid-tick mutation, in the same tick').toBeGreaterThan(1000);
    expect(stats.createdPickedLaterSameTick, 'a bond created mid-tick was chosen by a LATER scan of the same tick').toBeGreaterThan(0);
    expect(stats.severedReturned, 'no scan ever returned a bond severed earlier in its tick').toBe(0);
  }, FULL ? 3_600_000 : 120_000);
});

/* ───────────────────────────── the small, exact cases ───────────────────────────── */

describe('S190 C5 — the index agrees with the reference across every kind of change between two scans', () => {
  it('sever, weld (strict and mixed), raze, a degenerate bond, a rainbow recolour and an exact tie — all agree', () => {
    resetStats();
    mode = 'checked';
    inject = null;
    const m = startC5Match(false);
    const w = m.world;
    // A real board: run the bots through two BUILDs so every seat has structures.
    while (w.tick < fightStartTick(2) + 60) { m.bots.tick(w); runHostTick(w, m.deps, m.state); w.effects.length = 0; }
    topUpCreatures(w, 24, DIFF_MIX);
    const all = (): void => { for (const c of w.creatures.values()) compareAll(w, c); };
    all();
    // The scanning creature must belong to a seat that HAS shapes, or no mixed bond can exist for it.
    const hasShapes = (c: Creature): boolean => [...w.primitives.values()].some((x) => x.placerColor === ownerColourOf(w, c));
    const c0 = [...w.creatures.values()].find(hasShapes)!;
    expect(c0, 'fixture: a creature whose seat has built something').toBeDefined();

    // sever the bond the first creature wants
    const target = H.real.findNearestBondTarget(w, c0, false);
    expect(target, 'fixture: the board has bonds').not.toBeNull();
    razePrimitives(w, [], [target!], true);
    all();
    expect(H.real.findNearestBondTarget(w, c0, false)).not.toBe(target);

    // weld its two nearest enemy shapes: the new bond must be seen at once
    const own = ownerColourOf(w, c0);
    const [p, q] = nearestPrims(w, c0, (x) => x.placerColor !== own, 2);
    expect(p !== undefined && q !== undefined, 'fixture: two enemy shapes').toBe(true);
    const welded = weld(w, p!, q!);
    expect(welded).not.toBeNull();
    all();
    // and a MIXED weld: enemy for Voltkin, not for an enemy-only scan
    const [mine] = nearestPrims(w, c0, (x) => x.placerColor === own, 1);
    expect(mine, 'fixture: an own shape').toBeDefined();
    const mixedId = weld(w, p!, mine!);
    expect(mixedId).not.toBeNull();
    all();

    // raze a whole primitive (it and every bond on it)
    razePrimitives(w, [q!.id]);
    all();

    // ⚠ a DEGENERATE bond — an endpoint missing from `world.primitives` while the bond survives. No
    // production path leaves one (`razePrimitives` takes the incident bonds with the shape), but the
    // scan has always classified it as OWN rather than crash, and the index must say the same.
    if (mixedId !== null) {
      const bond = w.bonds.get(mixedId)!;
      const survivor = w.primitives.get(bond.aId)!;
      w.primitives.delete(bond.aId);
      all();
      w.primitives.set(survivor.id, survivor);
    }

    // a rainbow recolour BETWEEN scans (never inside the creature loop — see the index docblock)
    for (const pr of w.primitives.values()) if (pr.placerColor === own) pr.placerColor = PLAYER_COLORS[3]!;
    all();

    // an EXACT tie: two bonds whose midpoints are both exactly 50 px away (integer coordinates, so
    // the squared distances are bit-equal), re-inserted HIGH id first, so that if Map order decided
    // anything the higher id would win.
    const four = nearestPrims(w, c0, (x) => x.placerColor !== own, 4);
    expect(four.length, 'fixture: four enemy shapes for the tie').toBe(4);
    const [e1, e2, e3, e4] = four as [Primitive, Primitive, Primitive, Primitive];
    w.bonds.clear();
    for (const pr of w.primitives.values()) pr.bonds.clear();
    c0.pos.x = 500; c0.pos.y = 500;
    e1.pos.x = 450; e1.pos.y = 480; e2.pos.x = 450; e2.pos.y = 520; // midpoint (450, 500)
    e3.pos.x = 550; e3.pos.y = 480; e4.pos.x = 550; e4.pos.y = 520; // midpoint (550, 500)
    const first = weld(w, e1, e2)!;
    const second = weld(w, e3, e4)!;
    expect((second as unknown as number) > (first as unknown as number)).toBe(true);
    const b1 = w.bonds.get(first)!;
    const b2 = w.bonds.get(second)!;
    w.bonds.clear();
    w.bonds.set(second, b2);
    w.bonds.set(first, b1);
    all();
    expect(H.real.findNearestBondTarget(w, c0, false), 'the lower id wins an exact tie, whatever the Map order').toBe(first);
    expect(stats.mismatches, firstMismatches.join('\n')).toBe(0);
    expect(stats.compared).toBeGreaterThan(24 * 3 * 6);
  }, 60_000);
});

describe('S190 C5 — the epoch cache is REAL, and its one blind spot is the one the guards pin', () => {
  /**
   * Anti-vacuity for everything above: if the index silently rebuilt on every scan, every
   * comparison in this file would pass and the fix would be a no-op. So prove the reuse directly,
   * using the one change the fingerprint deliberately does NOT see — a `placerColor` rewrite.
   * Inside an epoch the cached classification must win (reuse is real); outside one the live scan
   * must win (a throwaway cannot be stale). This is also why `bondTargetIndex.guards.test.ts`
   * pins `placerColor`'s writers to the rainbow, which can never run inside the creature loop.
   */
  it('inside an epoch a placerColor rewrite is NOT seen (reuse); outside one it is (fresh)', () => {
    mode = 'checked';
    inject = null;
    const m = startC5Match(false);
    const w = m.world;
    while (w.tick < fightStartTick(2) + 60) { m.bots.tick(w); runHostTick(w, m.deps, m.state); w.effects.length = 0; }
    topUpCreatures(w, w.creatures.size + 4, ['voltkin']); // relative: the board already has creatures
    const c = [...w.creatures.values()].find((x) => x.type === 'voltkin')!;
    const own = ownerColourOf(w, c);
    const before = H.real.findNearestBondTarget(w, c, false);
    expect(before, 'fixture: a bond to aim at').not.toBeNull();
    const bond = w.bonds.get(before!)!;
    const pa = w.primitives.get(bond.aId)!;
    const pb = w.primitives.get(bond.bId)!;
    const saved = [pa.placerColor, pb.placerColor] as const;
    const wasEnemy = saved[0] !== own || saved[1] !== own;
    expect(wasEnemy, 'fixture: the nearest bond is an enemy bond').toBe(true);

    H.real.openBondTargetEpoch(w);
    try {
      expect(H.real.findNearestBondTarget(w, c, false)).toBe(before); // builds the cache
      pa.placerColor = own; pb.placerColor = own; // now an OWN bond — the fingerprint cannot see it
      expect(H.real.findNearestBondTarget(w, c, false), 'the cached classification is reused inside the epoch').toBe(before);
    } finally {
      H.real.closeBondTargetEpoch();
    }
    const fresh = H.real.findNearestBondTarget(w, c, false);
    expect(fresh).toBe(H.ref.referenceFindNearestBondTarget(w, c, false));
    expect(fresh, 'non-vacuous: the rewrite really changes the live answer').not.toBe(before);
    pa.placerColor = saved[0]; pb.placerColor = saved[1];
  }, 60_000);
});
