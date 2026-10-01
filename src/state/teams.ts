/**
 * SPARK — ⭐⭐ S192 (owner R192-T1..T4) — **TEAMS: THE ONE "IS THIS AN ENEMY?" PREDICATE.**
 *
 * > *"you also don't get damage … your enemies obviously can't attack each other … Your towers don't
 * > attack each other, even though you're different colors, different races."* — owner, S192 (R192-T1)
 *
 * Every decision in the sim, the bots, the raid picker and the renderer that asks *"is this an
 * enemy?"* calls one of the three functions below. `S192_TEAMS_SPEC.md` §(a) lists every site at
 * file:line, and `teams.sites.test.ts` pins the count of inline seat/colour comparisons that remain
 * per file, so a NEW inline comparison turns the suite red until somebody decides which kind it is:
 *
 *   · *"is this an ENEMY?"*  ⇒ `isEnemySeat` / `!sameTeam` / `!sameTeamColor` — a friend is never hit;
 *   · *"is this MINE?"*      ⇒ plain seat equality — your gatherer, your shape, your tower's owner.
 *
 * ⭐ A FREE-FOR-ALL IS BYTE-IDENTICAL BY CONSTRUCTION. `world.teams` is `undefined` unless at least two
 * seats share a team (`normalizeTeams`), and with it undefined `sameTeam(a, b)` is exactly `a === b`
 * and `sameTeamColor(x, y)` is exactly `x === y` — the comparisons every site made before S192. The
 * differential in `teams.ffaDifferential.test.ts` drives a long four-seat bots match through the real
 * host tick and compares `hashWorldStateFull` against a reference that never calls these functions.
 *
 * ⛔ HOST-AUTHORITATIVE. `world.teams` is stamped once, by `applyStartGame`, from the roster the HOST
 * minted (the bot lobby's or the multiplayer lobby's), and rides every snapshot after that — a joiner,
 * the `?worker=1` mirror and a promoted successor all READ it, none of them computes it.
 */

import type { PlayerId } from '../types.ts';
import { MAX_PLAYERS } from '../constants.ts';

/** Team indices are 0-based on the sim side (team 0 = the lobby's "TEAM 1"). */
export const TEAM_COUNT = 4;

/** The slice of the world the predicates read — so pure helpers and tests can pass a literal. */
export interface TeamsView {
  readonly teams?: readonly number[];
  readonly players: ReadonlyMap<PlayerId, { readonly id: PlayerId; readonly color: number }>;
}

/**
 * ⭐ ARE `a` AND `b` ON THE SAME SIDE? A seat is always on its own side. `undefined` (an owner that
 * does not exist — a missing primitive's `placedBy`) is nobody's teammate, not even another
 * `undefined`'s: every pre-S192 site compared a defined seat against a possibly-undefined one, and
 * `undefined === seat` was false.
 */
export function sameTeam(world: Pick<TeamsView, 'teams'>, a: PlayerId | number | undefined, b: PlayerId | number | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (a === b) return true;
  const t = world.teams;
  if (t === undefined) return false;
  const ta = t[a as number];
  return ta !== undefined && ta === t[b as number];
}

/** ⭐ IS `b` AN ENEMY OF `a`? The negation, named, so a call site reads as the rule it applies. */
export function isEnemySeat(world: Pick<TeamsView, 'teams'>, a: PlayerId | number | undefined, b: PlayerId | number | undefined): boolean {
  return !sameTeam(world, a, b);
}

/**
 * ⭐ ARE TWO COLOURS ON THE SAME SIDE? The colour form, for the sites whose allegiance is a shape's
 * `placerColor` (the bond and shape target scans, the drone, the territory sag).
 *
 * The colour → seat lookup walks `world.players` (≤ `MAX_PLAYERS` entries) and ONLY when teams are on;
 * in a free-for-all this is one compare and one property read, so the hot target scans keep their
 * S190 cost. A colour no seat wears (a free spark, a palette fallback for a missing owner) is on
 * nobody's team except its own.
 */
export function sameTeamColor(world: TeamsView, ca: number | undefined, cb: number | undefined): boolean {
  if (ca === undefined || cb === undefined) return false;
  if (ca === cb) return true;
  if (world.teams === undefined) return false;
  return sameTeam(world, seatOfColor(world, ca), seatOfColor(world, cb));
}

function seatOfColor(world: TeamsView, color: number): PlayerId | undefined {
  for (const p of world.players.values()) if (p.color === color) return p.id;
  return undefined;
}

/** The team index of a seat — its own seat number in a free-for-all, for labels and win banners. */
export function teamOf(world: Pick<TeamsView, 'teams'>, seat: PlayerId | number): number {
  return world.teams?.[seat as number] ?? (seat as number);
}

/**
 * ⭐ THE ROSTER'S PICKS → `world.teams`, OR `undefined` FOR A FREE-FOR-ALL.
 *
 * `picks[seat]` is that seat's team (0..3) or `undefined` (never picked = its own team). Returns
 * `undefined` — teams OFF, FFA byte-identical — when:
 *   · no two seats share a team (every seat on its own team IS the free-for-all), or
 *   · ⚠ MINE (spec Q2) — every seat is on ONE team: a match with no enemy has no game in it, so the
 *     sim falls back to the free-for-all rather than starting a match nobody can lose. The lobbies
 *     disable Begin first (`teamsPlayable`); this is the defensive half.
 *
 * An unpicked seat gets a team nobody picked (lowest free index ≥ TEAM_COUNT), so it stays alone.
 * Out-of-range or non-integer picks are treated as unpicked — the wire validator already refuses them.
 */
export function normalizeTeams(picks: readonly (number | undefined)[], seatCount: number): readonly number[] | undefined {
  if (seatCount <= 1 || seatCount > MAX_PLAYERS) return undefined;
  const out: number[] = [];
  let solo = TEAM_COUNT;
  for (let s = 0; s < seatCount; s++) {
    const p = picks[s];
    out.push(isTeamIndex(p) ? p : solo++);
  }
  const distinct = new Set(out).size;
  if (distinct === seatCount) return undefined; // nobody shares — this IS the free-for-all
  if (distinct <= 1) return undefined; // one team, no enemy (Q2)
  return out;
}

/** ⭐ Can a match start with these picks? At least two sides (spec Q2). Shared by both lobbies. */
export function teamsPlayable(picks: readonly (number | undefined)[], seatCount: number): boolean {
  if (seatCount <= 1) return true;
  const sides = new Set<number>();
  let solo = TEAM_COUNT;
  for (let s = 0; s < seatCount; s++) {
    const p = picks[s];
    sides.add(isTeamIndex(p) ? p : solo++);
  }
  return sides.size >= 2;
}

export function isTeamIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < TEAM_COUNT;
}

/**
 * ⭐ ⚠ MINE (spec §(b) rule 5) — **TEAMMATES SIT SIDE BY SIDE.** A permutation of the seats, applied
 * by the host BEFORE the roster is minted, so that teammates share a border on the four-zone board
 * and never sit on its diagonal (TL=0 · TR=1 · BR=2 · BL=3 — zones 0/2 and 1/3 touch only at the
 * quarry). R192-T2's *"one continuous zone"* is only possible between neighbours.
 *
 * `teams[seat]` is each seat's pick (`undefined` = alone). Seat 0 (the host / the human) never moves.
 * Returns `order` where `order[newSeat] = oldSeat`. Among the permutations with the fewest same-team
 * diagonal pairs it prefers the host's team on the LEFT half (seats 0 and 3 — his v2 picture,
 * *"team one on the left, team two on the right"*), then the identity, then lexicographic order — a
 * total order, so the same picks always give the same seating.
 *
 * Two seats (the pitch board) and three-or-fewer-seat boards with no shared team return the identity.
 */
export function arrangeTeamSeats(teams: readonly (number | undefined)[]): number[] {
  const n = teams.length;
  const identity = Array.from({ length: n }, (_, i) => i);
  if (n <= 2) return identity;
  const team = (s: number): number => (isTeamIndex(teams[s]) ? (teams[s] as number) : TEAM_COUNT + s);
  let best = identity;
  let bestKey: [number, number, number] | null = null;
  for (const perm of permutationsFixingZero(n)) {
    // perm[newSeat] = oldSeat
    let diagonal = 0;
    for (const [x, y] of [[0, 2], [1, 3]] as const) {
      if (x < n && y < n && team(perm[x]!) === team(perm[y]!)) diagonal++;
    }
    const hostLeft = n > 3 && team(perm[3]!) === team(perm[0]!) ? 0 : 1;
    const moved = perm.some((v, i) => v !== i) ? 1 : 0;
    const key: [number, number, number] = [diagonal, hostLeft, moved];
    if (bestKey === null || lexLess(key, bestKey)) {
      bestKey = key;
      best = perm;
    }
  }
  return best;
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

/** Every permutation of 0..n-1 with 0 fixed, in lexicographic order (n ≤ 4 ⇒ at most 6). */
function permutationsFixingZero(n: number): number[][] {
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const out: number[][] = [];
  const go = (prefix: number[], left: number[]): void => {
    if (left.length === 0) {
      out.push([0, ...prefix]);
      return;
    }
    for (let i = 0; i < left.length; i++) go([...prefix, left[i]!], [...left.slice(0, i), ...left.slice(i + 1)]);
  };
  go([], rest);
  return out;
}
