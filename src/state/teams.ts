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
import { layoutForSeatCount, seatOfZone, zoneCount, zoneOwner, type ZoneLayout } from './zones.ts';

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

/**
 * ⭐ S192 (owner R192-T4) — the lobby chip's click: no team → TEAM 1 → … → TEAM 4 → no team. Shared by
 * the bot lobby and the multiplayer lobby so both cycle identically.
 */
export function nextTeamPick(cur: number | undefined): number | undefined {
  if (!isTeamIndex(cur)) return 0;
  return cur + 1 < TEAM_COUNT ? cur + 1 : undefined;
}

/** The chip's label: `—` for no team (its own side), `T1`..`T4` otherwise (the lobby is 1-based). */
export function teamChipLabel(pick: number | undefined): string {
  return isTeamIndex(pick) ? `T${pick + 1}` : '—';
}

/**
 * ⭐ S192 — apply `arrangeTeamSeats` to a seat-indexed list (races, teams, …): `out[newSeat] = list[order[newSeat]]`.
 * With no shared team the order is the identity, so a free-for-all lobby seats exactly as before.
 */
export function permuteSeats<T>(list: readonly T[], order: readonly number[]): T[] {
  return order.map((old) => list[old]!);
}

/**
 * ⭐ S194 — the same permutation for a per-BOT list (index 0 = the bot in seat 1): difficulties AND, since
 * the S193 personality chip, personalities. Seat 0 (the human) never moves (`order[0] === 0`), so bot `i`
 * of the new seating is the bot that sat in `order[i + 1]`. A pick travels with its bot — a re-seated
 * WARMONGER stays a WARMONGER. Identity order ⇒ the list unchanged (the free-for-all).
 */
export function permuteBots<T>(perBot: readonly T[], order: readonly number[]): T[] {
  return order.slice(1).map((old) => perBot[old - 1]!);
}

/**
 * ⭐⭐ S195 (owner N1 / R195-F1 / B-27) — **EVERY ZONE THE SEAT'S TEAM HOLDS**, ascending.
 *
 * > *"same team should be visible. No fog of war during build phase for your same team."* — owner, S195 N1
 * > *"during fight, there's no fog of war anywhere … I said no fog during build, because during build is
 * > when everything is foggy."* — owner, S195 R195-F1
 *
 * The fog renderer lights each of these edge to edge exactly as it lit the seat's own quarter (S170 P6).
 * In a free-for-all `sameTeam(s, seat)` is `s === seat`, so this is `[zoneOwner(seat)]` (or `[]` for a seat
 * with no ground) — the pre-S195 behaviour, byte for byte. Render input only: never read by the sim.
 */
export function teamZones(world: Pick<TeamsView, 'teams'> & { readonly layout: ZoneLayout }, seat: number): number[] {
  const out: number[] = [];
  if (zoneOwner(seat, world.layout) === null) return out; // a spectator / out-of-range seat lights nothing
  const n = zoneCount(world.layout);
  for (let z = 0; z < n; z++) {
    // ⭐ S195 — the zone's OWNER on this board (a mapped board moves seats; the 2v1 solo owns two zones).
    const owner = seatOfZone(z, world.layout);
    if (owner !== null && sameTeam(world, owner, seat)) out.push(z);
  }
  return out;
}

/**
 * ⭐⭐ S195 (owner R195-T2 / R195-T3 / R195-T4 / R195-T5, N2, B-29) — **WHERE EACH SEAT STANDS ON THE
 * QUADRANT BOARD**, as zone → owning seat (`null` = nobody). Replaces S192's seat PERMUTATION: the seat is
 * the player's identity and never moves now (the host stays seat 0 on the wire); only its ZONE does, and it
 * rides in `world.layout` (`zones.ts` `TeamQuadLayout`).
 *
 * The owner's rules, verbatim where he gave them:
 *   · *"if it's a one player, he will always be in the northwest corner. Same as player one"*;
 *   · a TWO-player team always takes a whole SIDE — west = NW+SW, east = NE+SE — *"because the image is
 *     generated that way"* (the pair art is a portrait top/bottom half);
 *   · **2v1**: the pair takes a side, the solo his corner (NW) **and** the empty one (SW) — B-29 *"plus he
 *     also gets the other empty quadrant to play on. It's only fair"*;
 *   · **1v1v2**: the pair takes the east side; the two solos keep one corner each (NW, SW);
 *   · **3v1**: solo NW; the trio NE → SE → SW in seat order, so the MIDDLE seat gets the sheltered SE
 *     (R195-T4 *"That's fine."*);
 *   · **2v2**: one pair per side.
 *
 * `slots[seat]` is the lobby's board-slot order (owner N16 — the host re-arranges seats in the lobby);
 * absent = the seat number. Within a role, the seat with the lower slot goes first (top before bottom,
 * NE before SE before SW). ⚠ MINE — in 2v2 the pair holding the lowest slot takes the WEST side (the S192
 * default kept: the host's team on the left unless the host re-seats).
 *
 * A free-for-all (no shared team, or one team for everyone) stands where its slots say — the identity
 * when nobody was moved. Returns `null` on the pitch (≤ 2 seats: there is no quadrant to choose).
 * PURE, total order, no clock.
 */
export function arrangeTeamZones(picks: readonly (number | undefined)[], seatCount: number, slots?: readonly (number | undefined)[]): (number | null)[] | null {
  if (seatCount <= 2 || seatCount > 4) return null;
  const slotOf = (s: number): number => {
    const v = slots?.[s];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 4 ? v : s;
  };
  const seats = Array.from({ length: seatCount }, (_, s) => s);
  const ranked = (list: readonly number[]): number[] => [...list].sort((a, b) => slotOf(a) - slotOf(b) || a - b);
  const owners: (number | null)[] = [null, null, null, null];
  const teams = normalizeTeams(picks, seatCount);
  if (teams === undefined) {
    // Free-for-all: each seat on its slot, if the slots are a clean injection; the identity otherwise.
    const used = new Set(seats.map(slotOf));
    for (const s of seats) owners[used.size === seatCount ? slotOf(s) : s] = s;
    return owners;
  }
  const groups = new Map<number, number[]>();
  for (const s of seats) {
    const t = teams[s]!;
    const g = groups.get(t);
    if (g === undefined) groups.set(t, [s]);
    else g.push(s);
  }
  const bySize = (n: number): number[][] => [...groups.values()].filter((g) => g.length === n).map(ranked).sort((a, b) => slotOf(a[0]!) - slotOf(b[0]!) || a[0]! - b[0]!);
  const pairs = bySize(2);
  const solos = bySize(1).map((g) => g[0]!);
  const trios = bySize(3);
  if (trios.length === 1 && solos.length === 1) {
    // 3v1 — solo NW; trio NE, SE, SW.
    owners[0] = solos[0]!;
    [owners[1], owners[2], owners[3]] = trios[0]! as [number, number, number];
  } else if (pairs.length === 1 && solos.length === 1 && seatCount === 3) {
    // 2v1 — solo NW + the empty SW; the pair east (NE top, SE bottom).
    owners[0] = solos[0]!;
    owners[3] = solos[0]!;
    [owners[1], owners[2]] = pairs[0]! as [number, number];
  } else if (pairs.length === 1 && solos.length === 2) {
    // 1v1v2 — the pair east; the solos NW then SW.
    [owners[1], owners[2]] = pairs[0]! as [number, number];
    owners[0] = solos[0]!;
    owners[3] = solos[1]!;
  } else if (pairs.length === 2) {
    // 2v2 — the pair holding the lowest slot west (NW top, SW bottom), the other east (NE top, SE bottom).
    [owners[0], owners[3]] = pairs[0]! as [number, number];
    [owners[1], owners[2]] = pairs[1]! as [number, number];
  } else {
    for (const s of seats) owners[s] = s; // unreachable for ≤ 4 seats with two sides; fail to the identity
  }
  return owners;
}

/**
 * ⭐ S195 — THE BOARD A MATCH IS PLAYED ON, from its seat count, team picks and lobby slots. The plain
 * layouts whenever the arrangement IS the identity (every free-for-all nobody re-seated, and a 2v2 already
 * sitting west/east) — so those matches are byte-identical to pre-S195; the mapped
 * `QUADRANTS_4P:<owners>` otherwise. Stamped once by `applyStartGame`.
 */
export function layoutForMatch(seatCount: number, picks: readonly (number | undefined)[], slots?: readonly (number | undefined)[]): ZoneLayout {
  const plain = layoutForSeatCount(seatCount);
  const owners = arrangeTeamZones(picks, seatCount, slots);
  if (owners === null) return plain;
  const identity = owners.every((o, z) => (z < seatCount ? o === z : o === null));
  if (identity) return plain;
  return `QUADRANTS_4P:${owners.map((o) => (o === null ? '-' : String(o))).join('')}`;
}
