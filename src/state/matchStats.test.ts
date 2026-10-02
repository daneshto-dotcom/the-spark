/**
 * SPARK — ⭐ S191: the end-of-match stat board's RECORDER, its wire shape and its hash.
 *
 * The REACH half (counters driven through the real host tick, a real WIN, host vs worker) lives in
 * `matchStats.reach.test.ts`. This file pins the arithmetic and the four sites.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { makeGameStateExtras, softReset } from './gameState.ts';
import {
  HISTORY_WINDOW_TICKS,
  applySerializedHistory,
  applySerializedSeats,
  matchStatsHashParts,
  recordDamage,
  recordKill,
  recordSeatFell,
  recordTowerBuilt,
  recordTowerFell,
  recordUnitBuilt,
  recordWaveSample,
  sampleBuilt,
  serializeMatchStats,
} from './matchStats.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { dispatch, makeWorld } from './world.ts';
import type { World } from './worldTypes.ts';

const P = (n: number): PlayerId => asPlayerId(n);

function board(n: number): World {
  const w = makeWorld(0);
  for (let i = 0; i < n; i++) {
    if (!w.players.has(P(i))) w.players.set(P(i), makeIdlePlayer(P(i), PLAYER_COLORS[i]!));
    w.scoreByPlayer.set(P(i), 100);
  }
  return w;
}

/** A two-shape, one-connector structure owned by `owner` (ids offset so several can coexist). */
function addConnector(w: World, owner: PlayerId, base: number): void {
  const mk = (id: number, x: number): Primitive => ({
    id: asPrimitiveId(id), type: SparkType.Dot, placerColor: 0xffffff, placedBy: owner,
    createdTick: 0, pos: { x, y: 0 }, prevPos: { x, y: 0 }, bonds: new Set(),
    ownerColor: 0xffffff, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
  });
  const a = mk(base, base);
  const b = mk(base + 1, base + 30);
  w.primitives.set(a.id, a);
  w.primitives.set(b.id, b);
  const id = asBondId(base);
  w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0 });
  a.bonds.add(id);
  b.bonds.add(id);
}

describe('S191 matchStats — the arithmetic', () => {
  it('TAKEN goes to the victim, DEALT to the attacker, and a self-hit is a loss for nobody else', () => {
    const w = board(2);
    recordDamage(w, P(1), P(0), 12, 'unit');
    recordDamage(w, P(0), P(0), 7, 'unit'); // own blast on own unit
    recordDamage(w, P(1), null, 5, 'unit'); // unattributed (divine fire)
    const s0 = w.matchStats.seats.get(P(0))!;
    const s1 = w.matchStats.seats.get(P(1))!;
    expect(s0.dealtFifths).toBe(12);
    expect(s0.takenFifths).toBe(7);
    expect(s1.takenFifths).toBe(17);
    expect(s1.dealtFifths).toBe(0);
  });

  it('a zero or negative applied amount records nothing (never the swing, never a heal)', () => {
    const w = board(2);
    recordDamage(w, P(1), P(0), 0, 'unit');
    recordDamage(w, P(1), P(0), -3, 'unit');
    expect(w.matchStats.seats.size).toBe(0);
  });

  it('kills are per VICTIM type, credited to the killer; a self-kill and an unattributed kill count nothing', () => {
    const w = board(2);
    recordKill(w, P(0), P(1), 'chewer');
    recordKill(w, P(0), P(1), 'chewer');
    recordKill(w, P(0), P(1), 'raceUnit');
    recordKill(w, P(1), P(1), 'chewer');
    recordKill(w, null, P(1), 'chewer');
    expect([...w.matchStats.seats.get(P(0))!.kills]).toEqual([['chewer', 2], ['raceUnit', 1]]);
    // ⭐ S194 v2 — every death is a LOSS for its owner (enemy, self or unattributed); a kill for nobody but P0.
    expect(w.matchStats.seats.get(P(1))!.kills.size).toBe(0);
    expect([...w.matchStats.seats.get(P(1))!.lost]).toEqual([['chewer', 4], ['raceUnit', 1]]);
    expect(w.matchStats.seats.get(P(0))!.lost.size).toBe(0);
  });

  it('units built are per type; towers built/fell count; the fell-wave stamp is write-once', () => {
    const w = board(1);
    recordUnitBuilt(w, P(0), 'raceUnit');
    recordUnitBuilt(w, P(0), 'raceUnit');
    recordUnitBuilt(w, P(0), 'goblinMelee');
    recordTowerBuilt(w, P(0));
    recordTowerBuilt(w, P(0));
    recordTowerFell(w, P(0));
    w.waveNumber = 5;
    recordSeatFell(w, P(0));
    w.waveNumber = 9;
    recordSeatFell(w, P(0));
    const s = w.matchStats.seats.get(P(0))!;
    expect(s.built.get('raceUnit')).toBe(2);
    expect(s.built.get('goblinMelee')).toBe(1);
    expect([s.towersBuilt, s.towersFell, s.fellOnWave]).toEqual([2, 1, 5]);
  });

  it('the BUILT graph counts connectors STANDING per seat, owner = bond.aId → placedBy', () => {
    const w = board(2);
    addConnector(w, P(0), 100);
    addConnector(w, P(0), 200);
    addConnector(w, P(1), 300);
    expect([...sampleBuilt(w)].sort()).toEqual([[P(0), 2], [P(1), 1]]);
  });

  it('a wave sample floors the score, lists every seat in id order, and upserts its wave', () => {
    const w = makeWorld(0);
    w.players.set(P(2), makeIdlePlayer(P(2), PLAYER_COLORS[2]!));
    w.scoreByPlayer.set(P(0), 123.9);
    w.scoreByPlayer.set(P(2), 50.2);
    addConnector(w, P(2), 100);
    w.tick = 900;
    recordWaveSample(w, 1);
    w.scoreByPlayer.set(P(0), 200);
    recordWaveSample(w, 1); // the win landing on the edge's tick: one point, not two
    expect(w.matchStats.history).toHaveLength(1);
    expect(w.matchStats.history[0]).toEqual({
      wave: 1,
      tick: 900,
      seats: [
        { seat: P(0), score: 200, built: 0, units: 0, kills: 0, dealt: 0, taken: 0 },
        { seat: P(2), score: 50, built: 1, units: 0, kills: 0, dealt: 0, taken: 0 },
      ],
    });
    recordWaveSample(w, 2);
    expect(w.matchStats.history.map((h) => h.wave)).toEqual([1, 2]);
  });
});

describe('S191 matchStats — the four sites', () => {
  it('FACTORY + WIRE: an untouched world carries no key at all (opening snapshots stay byte-identical)', () => {
    const w = board(2);
    expect(serializeMatchStats(w.matchStats)).toBeUndefined();
    expect(JSON.stringify(snapshot(w))).not.toContain('matchStats');
    expect(JSON.stringify(netSnapshot(w))).not.toContain('matchStats');
  });

  it('SERIALIZE: a full snapshot round-trips every counter and the whole history', () => {
    const w = board(2);
    recordUnitBuilt(w, P(0), 'raceUnit');
    recordKill(w, P(1), P(0), 'raceUnit');
    recordDamage(w, P(0), P(1), 44, 'unit');
    recordTowerBuilt(w, P(1));
    recordTowerFell(w, P(1));
    recordSeatFell(w, P(0));
    recordWaveSample(w, 1);
    const back = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w))), back);
    expect(matchStatsHashParts(back.matchStats)).toEqual(matchStatsHashParts(w.matchStats));
  });

  it('WIRE: the NET form carries the history only inside its window and through WIN/POSTGAME', () => {
    const w = board(2);
    recordUnitBuilt(w, P(0), 'raceUnit');
    w.tick = 10_000;
    recordWaveSample(w, 3);
    expect(netSnapshot(w).matchStats?.history).toHaveLength(1); // just sampled
    w.tick = 10_000 + HISTORY_WINDOW_TICKS - 1;
    expect(netSnapshot(w).matchStats?.history).toHaveLength(1);
    w.tick = 10_000 + HISTORY_WINDOW_TICKS;
    const outside = netSnapshot(w);
    expect(outside.matchStats?.history).toBeUndefined();
    expect(outside.matchStats?.seats).toHaveLength(1); // the running totals always ride
    w.gameState = 'POSTGAME';
    expect(netSnapshot(w).matchStats?.history).toHaveLength(1);
    // …while the FULL local form always carries it (worker INIT, disk, takeover).
    w.gameState = 'PLAYING';
    expect(snapshot(w).matchStats?.history).toHaveLength(1);
  });

  it('RECEIVER: totals replace every snapshot; history is kept when absent and replaced when present', () => {
    const host = board(2);
    recordUnitBuilt(host, P(0), 'raceUnit');
    host.tick = 5000;
    recordWaveSample(host, 1);
    const peer = board(2);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), peer);
    expect(peer.matchStats.history.map((h) => h.wave)).toEqual([1]);
    host.tick = 5000 + HISTORY_WINDOW_TICKS * 3; // outside the window
    recordUnitBuilt(host, P(0), 'raceUnit');
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), peer);
    expect(peer.matchStats.history.map((h) => h.wave)).toEqual([1]); // kept
    expect(peer.matchStats.seats.get(P(0))!.built.get('raceUnit')).toBe(2); // replaced
    recordWaveSample(host, 2);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), peer);
    expect(peer.matchStats.history.map((h) => h.wave)).toEqual([1, 2]);
  });

  it('RECEIVER: garbage on the wire is dropped, never thrown', () => {
    const w = board(1);
    applySerializedSeats(w, {
      seats: [
        { seat: 0, built: [['raceUnit', 3], ['x', -1] as never, [7, 7] as never], dealt: 1.5, taken: 9 },
        { seat: -1 } as never,
        null as never,
      ],
    });
    const s = w.matchStats.seats.get(P(0))!;
    expect([...s.built]).toEqual([['raceUnit', 3]]);
    expect([s.dealtFifths, s.takenFifths]).toEqual([0, 9]);
    expect(w.matchStats.seats.size).toBe(1);
  });

  it('HASH: a counter and a history point each move the WIDE oracle (per-field contribution)', () => {
    const w = board(2);
    const h0 = hashWorldStateFull(w);
    recordDamage(w, P(1), P(0), 6, 'unit');
    const h1 = hashWorldStateFull(w);
    expect(h1).not.toBe(h0);
    recordKill(w, P(0), P(1), 'chewer');
    const h2 = hashWorldStateFull(w);
    expect(h2).not.toBe(h1);
    recordWaveSample(w, 1);
    expect(hashWorldStateFull(w)).not.toBe(h2);
  });

  it('RESETS: match start, return to title and soft reset each start a clean board', () => {
    const dirty = (): World => {
      const w = board(2);
      recordUnitBuilt(w, P(0), 'raceUnit');
      recordWaveSample(w, 1);
      return w;
    };
    const a = dirty();
    dispatch(a, { type: 'START_GAME', mode: 'solo', isHost: true });
    expect([a.matchStats.seats.size, a.matchStats.history.length]).toEqual([0, 0]);
    const b = dirty();
    dispatch(b, { type: 'RETURN_TO_TITLE' });
    expect([b.matchStats.seats.size, b.matchStats.history.length]).toEqual([0, 0]);
    const c = dirty();
    softReset(c, makeGameStateExtras());
    expect([c.matchStats.seats.size, c.matchStats.history.length]).toEqual([0, 0]);
  });
});

describe('⭐ S194 v2 matchStats — the inert v2 counters', () => {
  it('a hit is filed by WHAT it landed on, and by WHOM it hit; totals still sum', () => {
    const w = board(3);
    recordDamage(w, P(1), P(0), 10, 'unit');
    recordDamage(w, P(1), P(0), 20, 'structure');
    recordDamage(w, P(2), P(0), 300, 'keep');
    recordDamage(w, P(0), P(0), 7, 'keep'); // own hit: TAKEN only — it sits on the grid's diagonal
    recordDamage(w, undefined, P(0), 5, 'structure'); // ⭐ audit: an ownerless orphan bond counts for NOBODY
    recordDamage(w, P(1), null, 4, 'unit'); // ⭐ audit: unattributed → the victim's NO SOURCE cell
    const s0 = w.matchStats.seats.get(P(0))!;
    expect([s0.dealtFifths, s0.dealtStruct, s0.dealtKeep]).toEqual([330, 20, 300]);
    expect([...s0.dealtTo].sort()).toEqual([[P(0), 7], [P(1), 30], [P(2), 300]]);
    expect([s0.takenFifths, s0.takenKeep, s0.takenStruct]).toEqual([7, 7, 0]);
    expect(w.matchStats.seats.get(P(1))!.takenUnattributed).toBe(4);
    // ⛔ THE GRID ADDS UP: off-diagonal row = DEALT; column (diagonal + NO SOURCE included) = TAKEN.
    const seats = w.matchStats.seats;
    for (const [id, s] of seats) {
      let row = 0;
      for (const [v, n] of s.dealtTo) if (v !== id) row += n;
      expect(row, `row ${id}`).toBe(s.dealtFifths);
      let col = s.takenUnattributed;
      for (const o of seats.values()) col += o.dealtTo.get(id) ?? 0;
      expect(col, `column ${id}`).toBe(s.takenFifths);
    }
    const s1 = w.matchStats.seats.get(P(1))!;
    expect([s1.takenFifths, s1.takenStruct, s1.takenKeep]).toEqual([34, 20, 0]);
  });

  it('a wave sample carries each seat\'s RUNNING TOTALS (cumulative; the board differences them)', () => {
    const w = board(2);
    recordUnitBuilt(w, P(0), 'raceUnit');
    recordUnitBuilt(w, P(0), 'chewer');
    recordKill(w, P(0), P(1), 'chewer');
    recordDamage(w, P(1), P(0), 40, 'unit');
    w.tick = 10;
    recordWaveSample(w, 1);
    recordDamage(w, P(1), P(0), 2, 'unit');
    w.tick = 20;
    recordWaveSample(w, 2);
    const at = (i: number, seat: number) => w.matchStats.history[i]!.seats.find((p) => p.seat === P(seat))!;
    expect([at(0, 0).units, at(0, 0).kills, at(0, 0).dealt, at(0, 0).taken]).toEqual([2, 1, 40, 0]);
    expect([at(1, 0).dealt, at(1, 1).taken]).toEqual([42, 42]);
    // ⛔ a READ: sampling a seat with no counters must not create an entry (the hash would move by looking).
    const fresh = board(2);
    recordWaveSample(fresh, 1);
    expect(fresh.matchStats.seats.size).toBe(0);
  });

  it('SERIALIZE: every v2 counter round-trips through a save; the wire packs a sample\'s totals as one `v` array', () => {
    const w = board(2);
    recordKill(w, P(1), P(0), 'raceUnit');
    recordDamage(w, P(0), P(1), 44, 'keep');
    recordDamage(w, P(0), P(1), 9, 'structure');
    recordWaveSample(w, 1);
    const snap = JSON.parse(JSON.stringify(snapshot(w)));
    const back = makeWorld(0);
    restore(snap, back);
    expect(matchStatsHashParts(back.matchStats)).toEqual(matchStatsHashParts(w.matchStats));
    const s0 = back.matchStats.seats.get(P(0))!;
    expect([...s0.lost]).toEqual([['raceUnit', 1]]);
    expect([s0.takenKeep, s0.takenStruct]).toEqual([44, 9]);
    expect([...back.matchStats.seats.get(P(1))!.dealtTo]).toEqual([[P(0), 53]]);
    const wirePoint = snap.matchStats.history[0].seats.find((p: { seat: number }) => p.seat === 1);
    expect(wirePoint).toEqual({ seat: 1, score: 100, built: 0, v: [0, 1, 53, 0] });
    expect(Object.keys(wirePoint)).not.toContain('dealt');
  });

  it('RECEIVER: an S191 host (no v2 keys) reads as zeros; a malformed `v` is read as zeros, never thrown', () => {
    const peer = board(2);
    applySerializedSeats(peer, { seats: [{ seat: 0, dealt: 12 }] });
    const s = peer.matchStats.seats.get(P(0))!;
    expect([s.dealtFifths, s.dealtKeep, s.dealtStruct, s.lost.size, s.dealtTo.size]).toEqual([12, 0, 0, 0, 0]);
    applySerializedHistory(peer, {
      history: [
        { wave: 1, tick: 5, seats: [{ seat: 0, score: 3, built: 1 }] },
        { wave: 2, tick: 9, seats: [{ seat: 0, score: 4, built: 1, v: [1, -2, 3, 4] as never }] },
        { wave: 3, tick: 12, seats: [{ seat: 0, score: 5, built: 2, v: [1, 2, 3, 4] }] },
      ],
    }, false);
    expect(peer.matchStats.history.map((h) => [h.seats[0]!.units, h.seats[0]!.taken])).toEqual([[0, 0], [0, 0], [1, 4]]);
  });

  it('HASH: each v2 field moves the WIDE oracle (per-field contribution)', () => {
    const steps: Array<(w: World) => void> = [
      (w) => recordKill(w, null, P(1), 'chewer'), // lost only
      (w) => recordDamage(w, P(1), P(0), 3, 'keep'), // keep split + dealtTo
      (w) => recordDamage(w, P(1), P(0), 3, 'structure'), // structure split
    ];
    const w = board(2);
    let prev = hashWorldStateFull(w);
    for (const step of steps) {
      step(w);
      const h = hashWorldStateFull(w);
      expect(h).not.toBe(prev);
      prev = h;
    }
    // …and the same TOTAL filed under a different class hashes differently (the split is really in the hash).
    const a = board(2);
    recordDamage(a, P(1), P(0), 5, 'unit');
    const b = board(2);
    recordDamage(b, P(1), P(0), 5, 'keep');
    expect(hashWorldStateFull(a)).not.toBe(hashWorldStateFull(b));
  });
});
