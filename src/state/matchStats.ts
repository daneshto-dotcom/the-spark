/**
 * SPARK — ⭐ S191 THE END-OF-MATCH STAT BOARD'S RECORDER.
 *
 * Owner, S179: *"a stat board to show how many units were built by each character, how many buildings or
 * connectors were built, how much damage was done … taken … with even graphs … a simplified version"*.
 * Owner, S191: *"how many units were built, how many units were killed of each type … the graphs showing
 * like all the players and how much they have built and like compared to each other."*
 * Spec: `.claude/plans/S191_ENDGAME_STATS_SPEC.md`.
 *
 * ## What lives here
 *
 * One `World.matchStats` holding (a) each seat's RUNNING TOTALS and (b) the per-wave HISTORY the two graphs
 * draw. Every writer is a function in this file, called from a HOST reducer at the site the fact happens:
 * the three creature mint sites, the two damage chokepoints, the tower register/removal sites, the fallen-seat
 * stamp, the wave edge and the win edge.
 *
 * ## ⛔⛔ THE COUNTERS ARE INERT, AND THE NO-BUMP VERDICT RESTS ON THAT
 *
 * Nothing in the sim may READ a stat. The day a reducer gates on one — an achievement, a comeback bonus, a
 * bot that reads its own damage taken — a peer that dropped the field would compute a different world, and
 * the additive-optional wire shape below would stop being free. Read them from a renderer, never a reducer.
 *
 * ## Determinism
 *
 * Integers only, host-only writers, no RNG, no clock. The per-type records are `Map`s, and they are written
 * and hashed in SORTED key order — `Map` iteration is insertion order, and letting it shape a byte is the
 * class of divergence this codebase spends most of its comments on.
 *
 * ⚠ ONE LADDER. Every damage number here is in FIFTHS, the unit the sim subtracts and the player reads
 * float off a unit. There is no conversion anywhere, and the board must not invent one.
 */

import { PHYSICS_HZ } from '../constants.ts';
import type { PlayerId } from '../types.ts';
import type { CreatureType } from './creatures/creature.ts';
import type { World } from './worldTypes.ts';

/** One seat's running totals for the match. */
export interface SeatMatchStats {
  /** Units minted FOR this seat, keyed by creature type (castle units, tower units, summons, bosses). */
  readonly built: Map<CreatureType, number>;
  /** ENEMY units this seat killed, keyed by the VICTIM's type. A self-kill is not a kill. */
  readonly kills: Map<CreatureType, number>;
  /** Towers (defenders + spawners) this seat ignited. */
  towersBuilt: number;
  /**
   * Towers that stopped standing mid-match. ⚠ MINE, not the owner's: the sim never records WHO broke a
   * recipe (the re-validation poll only sees that it no longer matches), so this includes a tower its owner
   * scrapped or extended. A reset's `.clear()` never counts.
   */
  towersFell: number;
  /** Damage this seat's units, towers, castle and blasts ACTUALLY APPLIED to enemies, in fifths. */
  dealtFifths: number;
  /** Damage this seat's things ACTUALLY TOOK, from anyone (itself included), in fifths. */
  takenFifths: number;
  /** The wave its castle fell on; `undefined` while it stands. */
  fellOnWave: number | undefined;
}

/** One seat's point on the two graphs. */
export interface WaveSampleSeat {
  readonly seat: PlayerId;
  /** The seat's banked score, floored — the number the HUD and the win bar read. */
  readonly score: number;
  /** Connectors the seat has STANDING. See `sampleBuilt`. */
  readonly built: number;
}

/** The graphs' x axis: one sample per wave edge, plus one at the win. */
export interface WaveSample {
  /** The wave this sample CLOSES (the in-progress wave for the win sample). Unique and increasing. */
  readonly wave: number;
  /** The tick it was taken on. Drives the wire window below; never drawn. */
  readonly tick: number;
  /** Every seat, in seat-id order. */
  readonly seats: readonly WaveSampleSeat[];
}

export interface MatchStats {
  readonly seats: Map<PlayerId, SeatMatchStats>;
  readonly history: WaveSample[];
}

export function makeMatchStats(): MatchStats {
  return { seats: new Map(), history: [] };
}

/** Every reset path calls this: match start, return to title, soft reset. */
export function resetMatchStats(world: World): void {
  world.matchStats.seats.clear();
  world.matchStats.history.length = 0;
}

function emptySeat(): SeatMatchStats {
  return {
    built: new Map(),
    kills: new Map(),
    towersBuilt: 0,
    towersFell: 0,
    dealtFifths: 0,
    takenFifths: 0,
    fellOnWave: undefined,
  };
}

/** Get-or-create. Writers only — a reader that created entries would change the hash by looking. */
function seat(world: World, id: PlayerId): SeatMatchStats {
  let s = world.matchStats.seats.get(id);
  if (s === undefined) {
    s = emptySeat();
    world.matchStats.seats.set(id, s);
  }
  return s;
}

function bump<K>(m: Map<K, number>, k: K): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WRITERS — host reducers only.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A creature was minted for `owner`. Called at each `world.creatures.set` in `applySpawnCreature`. */
export function recordUnitBuilt(world: World, owner: PlayerId, type: CreatureType): void {
  bump(seat(world, owner).built, type);
}

/**
 * A hit landed. `appliedFifths` is what the target ACTUALLY lost — after DEF, after every clamp, never the
 * swing (Council, S191). TAKEN goes to the victim's owner; DEALT to the attacker's seat unless it hit its
 * own side, which is a loss for that seat and a gain for nobody.
 */
export function recordDamage(
  world: World,
  victim: PlayerId | undefined,
  attacker: PlayerId | null,
  appliedFifths: number,
): void {
  if (!(appliedFifths > 0)) return;
  if (victim !== undefined) seat(world, victim).takenFifths += appliedFifths;
  if (attacker !== null && attacker !== victim) seat(world, attacker).dealtFifths += appliedFifths;
}

/** `killer` killed one of `victim`'s units. Exactly once per death — the caller guarantees it. */
export function recordKill(
  world: World,
  killer: PlayerId | null,
  victim: PlayerId,
  victimType: CreatureType,
): void {
  if (killer === null || killer === victim) return;
  bump(seat(world, killer).kills, victimType);
}

export function recordTowerBuilt(world: World, owner: PlayerId): void {
  seat(world, owner).towersBuilt += 1;
}

export function recordTowerFell(world: World, owner: PlayerId): void {
  seat(world, owner).towersFell += 1;
}

/** Called by `markFallenSeats` on the tick it stamps the seat. Write-once, like the stamp. */
export function recordSeatFell(world: World, id: PlayerId): void {
  const s = seat(world, id);
  if (s.fellOnWave === undefined) s.fellOnWave = world.waveNumber;
}

/**
 * ⭐ THE "BUILT" GRAPH — CONNECTORS STANDING. ⚠ MINE, not the owner's, and the one lever to move if he
 * wants a different line: every structure's pool on the ONE ladder is a function of its connector count
 * (`structurePoolFifths(n) = n × (5 + n)`), so connectors are the quantity a building's strength derives
 * from. It is linear (a single welded blob cannot dwarf the chart the way a pool sum would), it rises when a
 * seat builds and FALLS when it is chewed — the Dota net-worth story — and bonds survive the `WIN_TRIGGER`
 * teardown, so the final sample is honest. Ownership is `bond.aId → placedBy`, the single-owner rule
 * `scoring.ts` and the raid arm already use.
 */
export function sampleBuilt(world: World): Map<PlayerId, number> {
  const out = new Map<PlayerId, number>();
  for (const bond of world.bonds.values()) {
    const owner = world.primitives.get(bond.aId)?.placedBy;
    if (owner === undefined) continue;
    out.set(owner, (out.get(owner) ?? 0) + 1);
  }
  return out;
}

/**
 * Record the graphs' point for `wave`. Called at the wave edge (the wave just closed) and on the win edge
 * (the wave in progress). Upserts, so a win on the very tick of an edge cannot produce two points for one
 * wave. Seats in explicit id order.
 */
export function recordWaveSample(world: World, wave: number): void {
  const built = sampleBuilt(world);
  const seats = [...world.players.keys()]
    .sort((a, b) => (a as number) - (b as number))
    .map((id) => ({
      seat: id,
      score: Math.floor(world.scoreByPlayer.get(id) ?? 0),
      built: built.get(id) ?? 0,
    }));
  const sample: WaveSample = { wave, tick: world.tick, seats };
  const h = world.matchStats.history;
  // Never out of order: replace a same-wave point, and drop anything a stale history put after it.
  while (h.length > 0 && h[h.length - 1]!.wave >= wave) h.pop();
  h.push(sample);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WIRE — additive-optional, emitted only when non-empty (an untouched match stays byte-identical).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ MINE, not the owner's. How long after each sample the WHOLE history rides the net snapshot. Two
 * seconds at 10 Hz is ~20 copies per wave: a peer that joined late, reconnected, or is promoted on host
 * migration holds the full history within one wave, and it never rides the other ~133 s of the wave.
 */
export const HISTORY_WINDOW_TICKS = 2 * PHYSICS_HZ;

export interface SerializedSeatStats {
  readonly seat: number;
  readonly built?: ReadonlyArray<readonly [string, number]>;
  readonly kills?: ReadonlyArray<readonly [string, number]>;
  readonly towersBuilt?: number;
  readonly towersFell?: number;
  readonly dealt?: number;
  readonly taken?: number;
  readonly fellOnWave?: number;
}

export interface SerializedMatchStats {
  readonly seats?: readonly SerializedSeatStats[];
  /** When present it is the WHOLE history, and the receiver replaces its own with it. */
  readonly history?: readonly WaveSample[];
}

function sortedEntries(m: Map<CreatureType, number>): Array<[string, number]> {
  return [...m.entries()].filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function serializeSeat(id: PlayerId, s: SeatMatchStats): SerializedSeatStats | null {
  const built = sortedEntries(s.built);
  const kills = sortedEntries(s.kills);
  const out: SerializedSeatStats = {
    seat: id as number,
    ...(built.length > 0 ? { built } : {}),
    ...(kills.length > 0 ? { kills } : {}),
    ...(s.towersBuilt > 0 ? { towersBuilt: s.towersBuilt } : {}),
    ...(s.towersFell > 0 ? { towersFell: s.towersFell } : {}),
    ...(s.dealtFifths > 0 ? { dealt: s.dealtFifths } : {}),
    ...(s.takenFifths > 0 ? { taken: s.takenFifths } : {}),
    ...(s.fellOnWave !== undefined ? { fellOnWave: s.fellOnWave } : {}),
  };
  return Object.keys(out).length > 1 ? out : null;
}

/** The FULL form — disk save, worker INIT, takeover. `undefined` when there is nothing to say. */
export function serializeMatchStats(ms: MatchStats): SerializedMatchStats | undefined {
  const seats = [...ms.seats.entries()]
    .sort(([a], [b]) => (a as number) - (b as number))
    .map(([id, s]) => serializeSeat(id, s))
    .filter((s): s is SerializedSeatStats => s !== null);
  const out: SerializedMatchStats = {
    ...(seats.length > 0 ? { seats } : {}),
    // A shallow copy of the array only: a sample is never mutated after `recordWaveSample` pushes it.
    ...(ms.history.length > 0 ? { history: ms.history.slice() } : {}),
  };
  return out.seats === undefined && out.history === undefined ? undefined : out;
}

/**
 * Does the history ride THIS net snapshot? Inside the window after a sample, and throughout WIN/POSTGAME
 * (so every peer's final board is complete whatever it missed).
 */
export function historyRidesNetSnapshot(world: World): boolean {
  if (world.gameState === 'WIN' || world.gameState === 'POSTGAME') return true;
  const h = world.matchStats.history;
  if (h.length === 0) return false;
  return world.tick - h[h.length - 1]!.tick < HISTORY_WINDOW_TICKS;
}

/** The NET form of an already-serialized block: the same, minus the history outside its window. */
export function trimMatchStatsForNet(
  s: SerializedMatchStats | undefined,
  world: World,
): SerializedMatchStats | undefined {
  if (s === undefined || s.history === undefined || historyRidesNetSnapshot(world)) return s;
  return s.seats === undefined ? undefined : { seats: s.seats };
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

function readRecord(
  arr: ReadonlyArray<readonly [string, number]> | undefined,
): Map<CreatureType, number> {
  const m = new Map<CreatureType, number>();
  if (!Array.isArray(arr)) return m;
  for (const e of arr) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !isCount(e[1]) || e[1] === 0) continue;
    m.set(e[0] as CreatureType, e[1]);
  }
  return m;
}

/** Running totals: REPLACED from every snapshot (absent ⇒ every seat is at zero). */
export function applySerializedSeats(world: World, s: SerializedMatchStats | undefined): void {
  const seats = world.matchStats.seats;
  seats.clear();
  if (s === undefined || !Array.isArray(s.seats)) return;
  for (const r of s.seats) {
    if (r === null || typeof r !== 'object' || !isCount(r.seat)) continue;
    seats.set(r.seat as PlayerId, {
      built: readRecord(r.built),
      kills: readRecord(r.kills),
      towersBuilt: isCount(r.towersBuilt) ? r.towersBuilt : 0,
      towersFell: isCount(r.towersFell) ? r.towersFell : 0,
      dealtFifths: isCount(r.dealt) ? r.dealt : 0,
      takenFifths: isCount(r.taken) ? r.taken : 0,
      fellOnWave: isCount(r.fellOnWave) ? r.fellOnWave : undefined,
    });
  }
}

function readHistory(arr: readonly WaveSample[]): WaveSample[] {
  const out: WaveSample[] = [];
  for (const h of arr) {
    if (h === null || typeof h !== 'object' || !isCount(h.wave) || !isCount(h.tick) || !Array.isArray(h.seats)) continue;
    if (out.length > 0 && out[out.length - 1]!.wave >= h.wave) continue; // strictly increasing, always
    const seats: WaveSampleSeat[] = [];
    for (const p of h.seats) {
      if (p === null || typeof p !== 'object' || !isCount(p.seat) || !isCount(p.score) || !isCount(p.built)) continue;
      seats.push({ seat: p.seat as PlayerId, score: p.score, built: p.built });
    }
    out.push({ wave: h.wave, tick: h.tick, seats });
  }
  return out;
}

/**
 * History. `full` is the local restore (a save IS the whole truth, so absent means empty); the net path
 * keeps what it holds when the snapshot is outside the window, and replaces it when the history rides.
 */
export function applySerializedHistory(
  world: World,
  s: SerializedMatchStats | undefined,
  full: boolean,
): void {
  const h = world.matchStats.history;
  const incoming = s?.history;
  if (!Array.isArray(incoming)) {
    if (full) h.length = 0;
    return;
  }
  const next = readHistory(incoming);
  h.length = 0;
  h.push(...next);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// HASH — the WIDE oracle only (`stateHashFull`). The narrow production hash stays narrow.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** `ms{seat}:` per seat with anything recorded, then `mh{wave}:` per sample. Sorted; integers only. */
export function matchStatsHashParts(ms: MatchStats): string[] {
  const parts: string[] = [];
  const rec = (m: Map<CreatureType, number>): string =>
    sortedEntries(m).map(([k, n]) => `${k}=${n}`).join('.');
  for (const [id, s] of [...ms.seats.entries()].sort(([a], [b]) => (a as number) - (b as number))) {
    parts.push(
      `ms${id as number}:b${rec(s.built)}:k${rec(s.kills)}:tb${s.towersBuilt}:tf${s.towersFell}` +
        `:d${s.dealtFifths}:t${s.takenFifths}:fw${s.fellOnWave ?? -1}`,
    );
  }
  for (const h of ms.history) {
    parts.push(`mh${h.wave}:${h.tick}:${h.seats.map((p) => `${p.seat as number}=${p.score}/${p.built}`).join(',')}`);
  }
  return parts;
}
