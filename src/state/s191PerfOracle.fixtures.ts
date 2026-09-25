/**
 * SPARK — S191 P12 (`s191/perf`) — TEST-ONLY FIXTURES for the identity oracles of the s191/perf
 * changes. ⛔ Never imported by production code (`.fixtures.ts`, the `c5WaveFiveBoard.fixtures.ts`
 * convention).
 *
 * Holds the IN-PLACE comparators (one per changed hotspot: territory, nav unit, solver, scoring — each runs the verbatim pre-change reference
 * and the real code on the same world at the same instant and counts every disagreement) and the
 * board INJECTIONS the long twin run applies identically to both twins. Shared by the fast exact-case
 * files and the long multi-wave twin oracle (`s191Perf.differential.test.ts`), so the comparator the
 * edges are proven with and the comparator the real match is proven with are the same function.
 */
import { makeBond } from './placePrimitive.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { referenceComputeAllPlayerRadii, referenceComputeTerritorialInfluence } from './territoryReference.fixtures.ts';
import {
  GOBLIN_UNIT_ACQUIRE_RADIUS, GOBLIN_UNIT_LEASH_RADIUS, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType,
  TERRITORY_ENGULF_STIFFNESS,
} from '../constants.ts';
import { asBondId, asCreatureId, asPlayerId, asPrimitiveId, type BondId, type CreatureId, type PlayerId, type PrimitiveId } from '../types.ts';
import { referencePickNavUnit } from './creatures/navUnitReference.fixtures.ts';
import { referenceSolveBonds } from '../physics/solveBondsReference.fixtures.ts';
import { referenceComputeAllComplexities } from './scoringReference.fixtures.ts';
import { isFilamentCombo, lookupCombo } from '../combos.ts';
import { damageCreature, removeCreature } from './creatures/creatureLifecycle.ts';
import { makeCreature, type Creature, type CreatureType } from './creatures/creature.ts';
import { CREATURE_CONFIGS } from './creatures/voltkin-config.ts';
import { razePrimitives } from './razePrimitives.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond, PhysicsBody } from '../physics/bonds.ts';

/* ───────────────────────────── territory: the in-place comparator ───────────────────────────── */

export interface TerritoryCheckStats {
  calls: number; bondsCompared: number; mismatches: number;
  engulfed: number; callsWithEngulf: number; maxEngulfedInOneCall: number;
  /** Council S191 item 1 — bonds with both endpoints present and two DIFFERENT colours, counted per
   *  checked call; and how many of those the reference engulfed (only a THIRD seat can). */
  mixedVisited: number; mixedEngulfed: number;
  /** S191 2e — the radius map (`computeAllPlayerRadii`, fed by the dense union-find) compared per call. */
  radiiCompared: number; radiiMismatches: number;
}

export interface TerritoryChecker {
  readonly stats: TerritoryCheckStats;
  readonly firstMismatches: string[];
  reset(): void;
  /** Reference on the world as it is RIGHT NOW, restore, then `real` from the same pre-state; every
   *  bond's `stiffnessMultiplier` compared with `Object.is`. The world is left as `real` left it. */
  check(w: World): void;
}

export function makeTerritoryChecker(
  real: (w: World) => void,
  realRadii?: (w: World) => Map<PlayerId, number>,
): TerritoryChecker {
  const stats: TerritoryCheckStats = {
    calls: 0, bondsCompared: 0, mismatches: 0, engulfed: 0, callsWithEngulf: 0, maxEngulfedInOneCall: 0,
    mixedVisited: 0, mixedEngulfed: 0, radiiCompared: 0, radiiMismatches: 0,
  };
  const firstMismatches: string[] = [];
  return {
    stats,
    firstMismatches,
    reset(): void {
      for (const k of Object.keys(stats) as Array<keyof TerritoryCheckStats>) stats[k] = 0;
      firstMismatches.length = 0;
    },
    check(w: World): void {
      if (realRadii !== undefined) {
        const got = [...realRadii(w)];
        const exp = [...referenceComputeAllPlayerRadii(w)];
        stats.radiiCompared++;
        const same = got.length === exp.length && exp.every(([k, v], i) => got[i]![0] === k && Object.is(got[i]![1], v));
        if (!same) {
          stats.radiiMismatches++;
          stats.mismatches++;
          if (firstMismatches.length < 8) firstMismatches.push(`tick ${w.tick} radii: real=${JSON.stringify(got)} reference=${JSON.stringify(exp)}`);
        }
      }
      const bonds = [...w.bonds.values()];
      const pre = bonds.map((b) => b.stiffnessMultiplier);
      referenceComputeTerritorialInfluence(w);
      const expected = bonds.map((b) => b.stiffnessMultiplier);
      // Both passes begin by resetting every bond, so this restore is belt and braces: the real pass
      // never sees the reference's writes.
      for (let i = 0; i < bonds.length; i++) bonds[i]!.stiffnessMultiplier = pre[i];
      real(w);
      stats.calls++;
      let engulfed = 0;
      for (let i = 0; i < bonds.length; i++) {
        const bond = bonds[i]!;
        const got = bond.stiffnessMultiplier;
        stats.bondsCompared++;
        if (expected[i] === TERRITORY_ENGULF_STIFFNESS) engulfed++;
        const pa = w.primitives.get(bond.aId);
        const pb = w.primitives.get(bond.bId);
        if (pa !== undefined && pb !== undefined && pa.placerColor !== pb.placerColor) {
          stats.mixedVisited++;
          if (expected[i] === TERRITORY_ENGULF_STIFFNESS) stats.mixedEngulfed++;
        }
        if (!Object.is(got, expected[i])) {
          stats.mismatches++;
          if (firstMismatches.length < 8) {
            firstMismatches.push(`tick ${w.tick} bond ${bond.id as unknown as number}: grid=${String(got)} reference=${String(expected[i])}`);
          }
        }
      }
      stats.engulfed += engulfed;
      if (engulfed > 0) stats.callsWithEngulf++;
      stats.maxEngulfedInOneCall = Math.max(stats.maxEngulfedInOneCall, engulfed);
    },
  };
}

/* ───────────────────────────── synthetic boards ───────────────────────────── */

/** A four-seat world with NO structures; the exact cases add their own. */
export function emptyBoard(): World {
  const w = makeWorld(0x7e1);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [1, 2, 3],
  });
  w.primitives.clear();
  w.bonds.clear();
  return w;
}

export function addPrim(w: World, seat: number, x: number, y: number): Primitive {
  const player = w.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: player.id, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

export function addBond(w: World, a: Primitive, b: Primitive): Bond {
  const id = asBondId(w.nextBondId++);
  const bond = {
    id, aId: a.id, bId: b.id,
    a: a as unknown as PhysicsBody, b: b as unknown as PhysicsBody,
    restLength: 40, stiffnessTier: 'MID' as const, createdTick: w.tick, damageFifths: 0,
  } as Bond;
  w.bonds.set(id, bond);
  a.bonds.add(id);
  b.bonds.add(id);
  return bond;
}

/* ───────────────────────────── injections for the long twin run ───────────────────────────── */

const byId = (a: Primitive, b: Primitive): number => (a.id as unknown as number) - (b.id as unknown as number);

/** A bond built the way production builds one: `makeBond` allocates from `world.nextBondId`. */
export function weld(w: World, a: Primitive, b: Primitive): BondId {
  const bond = makeBond(w, a, b, 'MID');
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond.id;
}

/**
 * What an injection added, so the long run can take it away again through the production raze path.
 * ⚠ WHY INJECTIONS ARE TEMPORARY — MEASURED: the first full run (waves 1–5) kept every weld and
 * intruder; the extra shapes and connectors are complexity INCOME, a seat reached the win bar and the
 * match ENDED at wave 3's FIGHT, so wave 5 was never reached. Each injection now lives a fixed number
 * of ticks and is then razed (`razePrimitives`) identically in both twins.
 */
export interface Injected { prims: PrimitiveId[]; bonds: BondId[] }

/**
 * Council S191 item 1 — a WELD across two seats: the nearest pair of shapes of two different colours
 * that is not already bonded, by (distSq, lower id, higher id) — a total order over an id-sorted list,
 * never Map order — so two identical twins weld the identical pair.
 */
export function weldNearestCrossSeatPair(w: World): Injected | null {
  const prims = [...w.primitives.values()].sort(byId);
  let best: [Primitive, Primitive] | null = null;
  let bestD = Infinity;
  for (let i = 0; i < prims.length; i++) {
    const a = prims[i]!;
    for (let j = i + 1; j < prims.length; j++) {
      const b = prims[j]!;
      if (a.placerColor === b.placerColor) continue;
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const d = dx * dx + dy * dy;
      if (d >= bestD) continue;
      let bonded = false;
      for (const id of a.bonds) if (b.bonds.has(id)) { bonded = true; break; }
      if (bonded) continue;
      best = [a, b];
      bestD = d;
    }
  }
  if (best === null) return null;
  return { prims: [], bonds: [weld(w, best[0], best[1])] };
}

/** A new shape minted the way production mints one (`world.nextPrimitiveId++`), hand-placed. */
export function mintShape(w: World, template: Primitive, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = { ...template, id, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), origin: null, createdTick: w.tick };
  w.primitives.set(id, p);
  return p;
}

/**
 * ⚠ WHY THIS EXISTS — MEASURED, NOT ASSUMED: on a real four-seat bots match the territorial engulf
 * NEVER FIRES. The first run of the s191 territory oracle (waves 1–3, 27 000 ticks, no injections)
 * counted **0** engulfed bonds: seats build in their own zones, so no enemy bond ever sits within R
 * (~60–140 px) of another seat's shapes, and the grid's `return true` would have been proven only by
 * synthetic boards. So the long run also plants an INTRUDER: two bonded shapes of another seat right
 * beside seat X's lowest-id shape (inside X's territory by construction) — alternately a pure enemy
 * pair (seat X+1) and a MIXED pair (X+1 with X+2, which only X can engulf) — identically in both twins.
 * Physics, creatures and the sag then run on them for real.
 */
export function plantIntruder(w: World, k: number): (Injected & { kind: 'pure' | 'mixed' }) | null {
  const seats = [...w.players.values()].map((p) => p.color);
  const prims = [...w.primitives.values()].sort(byId);
  const x = seats[k % seats.length]!;
  const host = prims.find((p) => p.placerColor === x);
  const y = seats[(k + 1) % seats.length]!;
  const z = seats[(k + 2) % seats.length]!;
  const ty = prims.find((p) => p.placerColor === y);
  const tz = prims.find((p) => p.placerColor === z);
  if (host === undefined || ty === undefined) return null;
  const mixed = k % 2 === 1 && tz !== undefined;
  const a = mintShape(w, ty, host.pos.x + 18, host.pos.y);
  const b = mintShape(w, mixed ? tz! : ty, host.pos.x + 18, host.pos.y + 22);
  const bond = weld(w, a, b);
  return { kind: mixed ? 'mixed' : 'pure', prims: [a.id, b.id], bonds: [bond] };
}

/** Raze what an injection added and is still standing (the sever path's call shape, orphans too). */
export function removeInjected(w: World, inj: Injected): void {
  razePrimitives(
    w,
    inj.prims.filter((id) => w.primitives.has(id)),
    inj.bonds.filter((id) => w.bonds.has(id)),
    true,
  );
}

/* ───────────────────────────── nav unit: the in-place comparator ───────────────────────────── */

export type PickNavUnitFn = (
  w: World, c: Creature, held: CreatureId | null, acquireRadiusSq: number, leashRadiusSq: number,
) => CreatureId | null;

export interface NavCheckStats {
  /** Host-tick calls of `pickNavUnit`, and comparisons (host calls + every sweep entry). */
  calls: number; compared: number; mismatches: number; sweeps: number;
  /** Results: a unit found at all; the reference returned a unit KILLED earlier in the same loop
   *  (`pendingCreatureDeaths`) — see `EnemyCreatureIndex` for why that is kept. */
  nonNull: number; pendingDeathReturned: number;
  /** Holds: calls with a held lock; kept; a lock this creature's previous pick did NOT set (a
   *  retaliation turn, `retaliation.ts`) and how often that hold was kept. */
  held: number; heldKept: number; heldElsewhere: number; heldElsewhereKept: number;
  /** Mid-loop churn between two calls of the same tick: injected kills / removals / births, the sim's
   *  own changes to the creature set, and the calls that ran AFTER any of those in the same tick. */
  injectedKills: number; injectedRemovals: number; injectedBirths: number;
  naturalMidLoopChanges: number; callsAfterMidLoopChange: number;
}

interface NavTickState { tick: number; n: number; lastFp: string; changed: boolean }

/** Every this-many ticks the checker injects, identically in both twins, between two calls. */
export interface NavInjectPlan { killEvery: number; removeEvery: number; birthEvery: number }

export interface NavChecker {
  readonly stats: NavCheckStats;
  readonly firstMismatches: string[];
  reset(): void;
  /** One host-tick call. `checked`: run the real function AND the reference on the world as it is
   *  now, compare, return the real answer; otherwise return the reference's. Injections follow in
   *  both modes, so two identical twins stay identical. */
  call(w: World, c: Creature, held: CreatureId | null, acq: number, leash: number, checked: boolean, inject: NavInjectPlan | null): CreatureId | null;
  /** Every live creature's re-acquire (held = null), real against reference. */
  sweep(w: World): void;
}

const navFp = (w: World): string => `${w.creatures.size}/${w.nextCreatureId}`;

/** A creature born mid-loop the way every creature is born: `world.nextCreatureId++`, then `set`. */
export function birthCreature(w: World, seat: number, x: number, y: number, type: CreatureType = 'goblinMelee'): CreatureId {
  const id = asCreatureId(w.nextCreatureId++);
  const c = makeCreature(CREATURE_CONFIGS[type], {
    id,
    ownerPlayerId: asPlayerId(seat),
    pos: { x, y },
    targetPos: { x: 960, y: 540 },
    spawnedAtTick: w.tick,
    clock: w,
    draftPicks: w.players.get(asPlayerId(seat))?.draftPicks,
  });
  w.creatures.set(id, c);
  return id;
}

export function makeNavChecker(real: PickNavUnitFn): NavChecker {
  const stats: NavCheckStats = {
    calls: 0, compared: 0, mismatches: 0, sweeps: 0, nonNull: 0, pendingDeathReturned: 0,
    held: 0, heldKept: 0, heldElsewhere: 0, heldElsewhereKept: 0,
    injectedKills: 0, injectedRemovals: 0, injectedBirths: 0, naturalMidLoopChanges: 0, callsAfterMidLoopChange: 0,
  };
  const firstMismatches: string[] = [];
  const perTick = new WeakMap<World, NavTickState>();
  const lastPick = new WeakMap<World, Map<number, CreatureId | null>>();

  const mismatch = (w: World, c: Creature, what: string, r: unknown, f: unknown): void => {
    stats.mismatches++;
    if (firstMismatches.length < 8) {
      firstMismatches.push(`tick ${w.tick} creature ${c.id as unknown as number} (${c.type}) ${what}: index=${JSON.stringify(r)} reference=${JSON.stringify(f)}`);
    }
  };
  const acq = GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS;
  const leash = GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS;
  const sweep = (w: World): void => {
    for (const c of w.creatures.values()) {
      const r = real(w, c, null, acq, leash);
      const f = referencePickNavUnit(w, c, null, acq, leash);
      stats.compared++;
      if (r !== f) mismatch(w, c, 'sweep re-acquire', r, f);
    }
    stats.sweeps++;
  };

  return {
    stats,
    firstMismatches,
    reset(): void {
      for (const k of Object.keys(stats) as Array<keyof NavCheckStats>) stats[k] = 0;
      firstMismatches.length = 0;
    },
    sweep,
    call(w, c, held, a, l, checked, inject): CreatureId | null {
      let s = perTick.get(w);
      if (s === undefined || s.tick !== w.tick) {
        s = { tick: w.tick, n: 0, lastFp: navFp(w), changed: false };
        perTick.set(w, s);
        if (checked) sweep(w);
      }
      s.n++;
      stats.calls++;
      const now = navFp(w);
      if (s.n > 1 && now !== s.lastFp) { stats.naturalMidLoopChanges++; s.changed = true; }
      if (s.changed) stats.callsAfterMidLoopChange++;

      const f = referencePickNavUnit(w, c, held, a, l);
      let result = f;
      if (checked) {
        const r = real(w, c, held, a, l);
        stats.compared++;
        if (r !== f) mismatch(w, c, `pickNavUnit(held=${String(held)})`, r, f);
        result = r;
      }
      if (f !== null) {
        stats.nonNull++;
        if (w.pendingCreatureDeaths?.has(f) === true) stats.pendingDeathReturned++;
      }
      let last = lastPick.get(w);
      if (last === undefined) lastPick.set(w, (last = new Map()));
      if (held !== null) {
        stats.held++;
        if (result === held) stats.heldKept++;
        const prev = last.get(c.id as unknown as number);
        if (prev !== held) {
          stats.heldElsewhere++;
          if (result === held) stats.heldElsewhereKept++;
        }
      }
      last.set(c.id as unknown as number, result);

      let injected = false;
      if (inject !== null) {
        if (w.tick % inject.killEvery === 0 && s.n === 2 && result !== null && w.pendingCreatureDeaths !== null) {
          // The in-loop strike path's own call shape: lethal, deferred to the sweep after the loop.
          if (damageCreature(w, result, 1_000_000, w.pendingCreatureDeaths, c.id)) { stats.injectedKills++; injected = true; }
        }
        if (w.tick % inject.removeEvery === 1 && s.n === 3 && result !== null) {
          if (removeCreature(w, result)) { stats.injectedRemovals++; injected = true; }
        }
        if (w.tick % inject.birthEvery === 2 && s.n === 4) {
          const enemySeat = ((c.ownerPlayerId as unknown as number) + 1) % 4;
          birthCreature(w, enemySeat, c.pos.x + 25, c.pos.y);
          stats.injectedBirths++;
          injected = true;
        }
      }
      if (injected) {
        s.changed = true;
        if (checked) sweep(w); // the change landed between this call and the next: prove it is seen at once
      }
      s.lastFp = navFp(w);
      return result;
    },
  };
}

/* ───────────────────────────── solver: the in-place comparator ───────────────────────────── */

export interface SolverCheckStats {
  calls: number; bondsSolved: number; mismatches: number; broken: number;
  /** Bonds solved with a territory / anchor multiplier ≠ 1 — the sag path the hoist must not skew. */
  sagged: number; low: number; mid: number; high: number;
}

export interface SolverChecker {
  readonly stats: SolverCheckStats;
  readonly firstMismatches: string[];
  reset(): void;
  /** Verbatim solver from the positions as they are NOW, restore, the real solver from the same
   *  positions; every endpoint `pos` `Object.is` and the broken list compared. Leaves the real result. */
  check(bonds: readonly Bond[]): BondId[];
}

export function makeSolverChecker(real: (bonds: readonly Bond[]) => BondId[]): SolverChecker {
  const stats: SolverCheckStats = { calls: 0, bondsSolved: 0, mismatches: 0, broken: 0, sagged: 0, low: 0, mid: 0, high: 0 };
  const firstMismatches: string[] = [];
  return {
    stats,
    firstMismatches,
    reset(): void {
      for (const k of Object.keys(stats) as Array<keyof SolverCheckStats>) stats[k] = 0;
      firstMismatches.length = 0;
    },
    check(bonds: readonly Bond[]): BondId[] {
      const bodies: Array<{ x: number; y: number }> = [];
      const seen = new Set<object>();
      for (const b of bonds) {
        for (const p of [b.a.pos, b.b.pos]) if (!seen.has(p)) { seen.add(p); bodies.push(p); }
      }
      const pre = bodies.map((p) => [p.x, p.y] as const);
      const expectedBroken = referenceSolveBonds(bonds);
      const expected = bodies.map((p) => [p.x, p.y] as const);
      for (let i = 0; i < bodies.length; i++) { bodies[i]!.x = pre[i]![0]; bodies[i]!.y = pre[i]![1]; }
      const got = real(bonds);
      stats.calls++;
      stats.bondsSolved += bonds.length;
      stats.broken += got.length;
      for (const b of bonds) {
        if ((b.stiffnessMultiplier ?? 1.0) !== 1.0) stats.sagged++;
        if (b.stiffnessTier === 'LOW') stats.low++; else if (b.stiffnessTier === 'MID') stats.mid++; else stats.high++;
      }
      const note = (what: string): void => {
        stats.mismatches++;
        if (firstMismatches.length < 8) firstMismatches.push(what);
      };
      if (got.length !== expectedBroken.length || got.some((id, i) => id !== expectedBroken[i])) {
        note(`broken list: real=${JSON.stringify(got)} reference=${JSON.stringify(expectedBroken)}`);
      }
      for (let i = 0; i < bodies.length; i++) {
        const p = bodies[i]!;
        if (!Object.is(p.x, expected[i]![0]) || !Object.is(p.y, expected[i]![1])) {
          note(`body ${i}: real=(${p.x}, ${p.y}) reference=(${expected[i]![0]}, ${expected[i]![1]})`);
        }
      }
      return got;
    },
  };
}

/* ───────────────────────────── scoring: the in-place comparator ───────────────────────────── */

export interface ScoringCheckStats {
  calls: number; mismatches: number;
  /** Calls whose board carried a magic bond / a Filament / a fouled shape — the memo's branches. */
  withMagic: number; withFilament: number; withFouled: number;
}

export interface ScoringChecker {
  readonly stats: ScoringCheckStats;
  readonly firstMismatches: string[];
  reset(): void;
  /** The real `computeAllComplexities` against the verbatim one on the world as it is NOW: every
   *  entry, in insertion order, key `===` and value `Object.is`. Both are pure reads. */
  check(w: World): void;
}

export function makeScoringChecker(real: (w: World) => Map<PlayerId, number>): ScoringChecker {
  const stats: ScoringCheckStats = { calls: 0, mismatches: 0, withMagic: 0, withFilament: 0, withFouled: 0 };
  const firstMismatches: string[] = [];
  return {
    stats,
    firstMismatches,
    reset(): void {
      for (const k of Object.keys(stats) as Array<keyof ScoringCheckStats>) stats[k] = 0;
      firstMismatches.length = 0;
    },
    check(w: World): void {
      const got = [...real(w)];
      const exp = [...referenceComputeAllComplexities(w)];
      stats.calls++;
      let same = got.length === exp.length;
      for (let i = 0; same && i < exp.length; i++) {
        if (got[i]![0] !== exp[i]![0] || !Object.is(got[i]![1], exp[i]![1])) same = false;
      }
      if (!same) {
        stats.mismatches++;
        if (firstMismatches.length < 8) firstMismatches.push(`tick ${w.tick}: real=${JSON.stringify(got)} reference=${JSON.stringify(exp)}`);
      }
      let magic = false;
      let filament = false;
      for (const b of w.bonds.values()) {
        const pa = w.primitives.get(b.aId);
        const pb = w.primitives.get(b.bId);
        if (pa === undefined || pb === undefined) continue;
        if (lookupCombo(pa.type, pb.type).isMagical) magic = true;
        if (isFilamentCombo(pa.type, pb.type)) filament = true;
        if (magic && filament) break;
      }
      if (magic) stats.withMagic++;
      if (filament) stats.withFilament++;
      if (w.fouledPrimitives.size > 0) stats.withFouled++;
    },
  };
}
