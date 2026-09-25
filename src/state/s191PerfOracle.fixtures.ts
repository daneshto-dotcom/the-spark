/**
 * SPARK — S191 P12 (`s191/perf`) — TEST-ONLY FIXTURES for the identity oracles of the s191/perf
 * changes. ⛔ Never imported by production code (`.fixtures.ts`, the `c5WaveFiveBoard.fixtures.ts`
 * convention).
 *
 * Holds the IN-PLACE comparators (one per changed hotspot — each runs the verbatim pre-change reference
 * and the real code on the same world at the same instant and counts every disagreement) and the
 * board INJECTIONS the long twin run applies identically to both twins. Shared by the fast exact-case
 * files and the long multi-wave twin oracle (`s191Perf.differential.test.ts`), so the comparator the
 * edges are proven with and the comparator the real match is proven with are the same function.
 */
import { makeBond } from './placePrimitive.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { referenceComputeTerritorialInfluence } from './territoryReference.fixtures.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, TERRITORY_ENGULF_STIFFNESS } from '../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../types.ts';
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
}

export interface TerritoryChecker {
  readonly stats: TerritoryCheckStats;
  readonly firstMismatches: string[];
  reset(): void;
  /** Reference on the world as it is RIGHT NOW, restore, then `real` from the same pre-state; every
   *  bond's `stiffnessMultiplier` compared with `Object.is`. The world is left as `real` left it. */
  check(w: World): void;
}

export function makeTerritoryChecker(real: (w: World) => void): TerritoryChecker {
  const stats: TerritoryCheckStats = {
    calls: 0, bondsCompared: 0, mismatches: 0, engulfed: 0, callsWithEngulf: 0, maxEngulfedInOneCall: 0,
    mixedVisited: 0, mixedEngulfed: 0,
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
