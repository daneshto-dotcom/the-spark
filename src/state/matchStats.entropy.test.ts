/**
 * ⭐ S195 T22 (owner B-17, RULED *"only the player itself will see it, not all players"*) — the
 * LOST-TO-ENTROPY counter: arithmetic, the four sites (wire `le`, save, receiver, wide hash), REACH through
 * the real host tick (a taxed structure loses connectors at the FIGHT whistle → the counter moves for
 * exactly that seat), and the negatives (a free structure's seat and an empty seat stay at zero).
 *
 * The BOARD ROW that shows it is a later tree's. The seam it reads: `world.matchStats.seats.get(seat)
 * ?.lostToEntropy` (wire key `le`, absent at zero).
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { componentOf } from '../game/structure.ts';
import type { Controls } from '../input/controls.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../types.ts';
import { ENTROPY_FREE_CONNECTORS, applyEntropyTax, planEntropy } from './entropy.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import {
  applySerializedSeats, matchStatsHashParts, recordEntropyLoss, sampleBuilt, serializeMatchStats,
} from './matchStats.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { mulberry32 } from './rng.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P = (n: number): PlayerId => asPlayerId(n);

function match(seed: number): World {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

/** A freeform lattice of `shapes` shapes with exactly `connectors` nearest-first bonds, ONE component, owned by `seat`. */
function lattice(w: World, seat: PlayerId, shapes: number, connectors: number, ox: number, oy: number): BondId[] {
  const cols = Math.ceil(Math.sqrt(shapes));
  const ps: Primitive[] = [];
  const colour = PLAYER_COLORS[seat as number]!;
  for (let i = 0; i < shapes; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = ox + c * 40 + (r % 2) * 20, y = oy + r * 35;
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const p = { id, type: i % 2 === 0 ? SparkType.Square : SparkType.Triangle, placerColor: colour, placedBy: seat, createdTick: w.tick,
      pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: colour,
      lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null } as unknown as Primitive;
    w.primitives.set(id, p);
    ps.push(p);
  }
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < shapes; i++) for (let j = i + 1; j < shapes; j++) {
    const dx = ps[i]!.pos.x - ps[j]!.pos.x, dy = ps[i]!.pos.y - ps[j]!.pos.y;
    pairs.push([dx * dx + dy * dy, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const have = new Set<string>();
  const out: BondId[] = [];
  const add = (i: number, j: number): void => {
    if (have.has(`${i},${j}`)) return;
    have.add(`${i},${j}`);
    const id = asBondId(w.nextBondId++);
    const a = ps[i]!, b = ps[j]!;
    const rest = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: rest, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick } as never);
    a.bonds.add(id); b.bonds.add(id);
    out.push(id);
  };
  for (let i = 1; i < shapes; i++) add(i - 1, i);
  for (const [, i, j] of pairs) { if (out.length >= connectors) break; add(i, j); }
  expect(out.length, 'fixture: exact connector count').toBe(connectors);
  expect(componentOf(ps[0]!, w.primitives, w.bonds).bondIds.size, 'fixture: one component').toBe(connectors);
  return out;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)), controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** Cross ONE phase edge through the real host tick. */
function crossEdge(w: World, d: HostTickDeps, st: ReturnType<typeof makeHostTickState>): void {
  w.effects.length = 0;
  w.phaseEndsAtTick = w.tick;
  runHostTick(w, d, st);
  w.creatures.clear(); // keep the fight to the tax alone
}

const lost = (w: World, seat: PlayerId): number | undefined => w.matchStats.seats.get(seat)?.lostToEntropy;

describe('⭐ S195 T22 — lostToEntropy: the arithmetic and the four sites', () => {
  it('adds per seat; zero or negative records nothing and creates no seat entry', () => {
    const w = makeWorld(0);
    recordEntropyLoss(w, P(0), 0);
    recordEntropyLoss(w, P(0), -3);
    expect(w.matchStats.seats.size, 'a zero loss must not create an entry (it would change the hash by looking)').toBe(0);
    recordEntropyLoss(w, P(0), 4);
    recordEntropyLoss(w, P(0), 3);
    expect(lost(w, P(0))).toBe(7);
    expect(lost(w, P(1))).toBeUndefined();
  });

  it('WIRE: absent at zero (an untaxed match stays byte-identical), `le` when set, round-trips through save and net', () => {
    const w = makeWorld(0);
    expect(serializeMatchStats(w.matchStats)).toBeUndefined();
    recordEntropyLoss(w, P(1), 5);
    const s = serializeMatchStats(w.matchStats)!;
    expect(s.seats).toEqual([{ seat: 1, le: 5 }]);
    expect(JSON.stringify(s)).not.toContain('lostToEntropy'); // the compact key, like `dk`/`tu`
    // save → restore
    const back = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w))), back);
    expect(lost(back, P(1))).toBe(5);
    // net snapshot
    const peer = makeWorld(0);
    applyNetSnapshot(netSnapshot(w), peer);
    expect(lost(peer, P(1))).toBe(5);
    // receiver: an older host (no `le`) and garbage both read as 0, never throw
    const old = makeWorld(0);
    applySerializedSeats(old, { seats: [{ seat: 1, dealt: 3 }] });
    expect(lost(old, P(1))).toBe(0);
    applySerializedSeats(old, { seats: [{ seat: 1, le: -2 as number }, { seat: 2, le: 'x' as unknown as number }] });
    expect(lost(old, P(1))).toBe(0);
    expect(lost(old, P(2))).toBe(0);
  });

  it('HASH: the field moves the WIDE oracle (per-field contribution), and is in its seat part as `le`', () => {
    const w = makeWorld(0);
    recordEntropyLoss(w, P(0), 1);
    const h1 = hashWorldStateFull(w);
    recordEntropyLoss(w, P(0), 1);
    expect(hashWorldStateFull(w)).not.toBe(h1);
    expect(matchStatsHashParts(w.matchStats).find((p) => p.startsWith('ms0:'))).toMatch(/:le2$/);
  });
});

describe('⭐ S195 T22 — REACH: the counter moves for exactly the taxed seat, by the standing-bond delta', () => {
  it('seat 0\'s 145-connector blob loses connectors at the FIGHT whistle → its counter equals its BUILT drop; the others stay at zero', () => {
    const w = match(0x195e1);
    for (const i of [2, 3]) if (!w.players.has(P(i))) w.players.set(P(i), makeIdlePlayer(P(i), PLAYER_COLORS[i]!));
    lattice(w, P(0), 65, 145, 260, 200);
    lattice(w, P(1), 7, ENTROPY_FREE_CONNECTORS, 760, 220); // free: never taxed
    // seat 2 owns a taxed-size structure of its own; seat 3 owns nothing
    lattice(w, P(2), 24, 54, 600, 560);
    const d = deps();
    const st = makeHostTickState(w);
    let total0 = 0;
    let total2 = 0;
    for (let k = 0; k < 6; k++) {
      const before = sampleBuilt(w);
      crossEdge(w, d, st); // BUILD → FIGHT: the tax
      expect(w.matchPhase).toBe('FIGHT');
      const after = sampleBuilt(w);
      const drop = (seat: PlayerId): number => (before.get(seat) ?? 0) - (after.get(seat) ?? 0);
      total0 += drop(P(0));
      total2 += drop(P(2));
      expect(lost(w, P(0)) ?? 0, `wave ${k}: seat 0's counter is its BUILT drop so far`).toBe(total0);
      expect(lost(w, P(2)) ?? 0, `wave ${k}: seat 2 likewise`).toBe(total2);
      expect(lost(w, P(1)) ?? 0, 'a free structure\'s seat never moves').toBe(0);
      expect(lost(w, P(3)) ?? 0, 'an empty seat never moves').toBe(0);
      crossEdge(w, d, st); // FIGHT → BUILD: never taxes
      expect(w.matchPhase).toBe('BUILD');
      expect(lost(w, P(0)) ?? 0, 'the BUILD edge adds nothing').toBe(total0);
    }
    expect(total0, 'anti-vacuity: the blob lost connectors').toBeGreaterThan(0);
    expect(w.matchStats.seats.get(P(1))?.lostToEntropy ?? 0).toBe(0);
    expect(w.matchStats.seats.get(P(3))?.lostToEntropy ?? 0).toBe(0);
  });

  it('a split that deletes the smaller side counts those connectors too (counter ≥ snaps, = the board\'s drop)', () => {
    // Find a seed whose tax pass on a 145c blob deletes more connectors than it snaps — the chunk case.
    let seen = false;
    for (let seed = 1; seed <= 64 && !seen; seed++) {
      const w = match(0x195e2 + seed);
      const all = lattice(w, P(0), 65, 145, 260, 200);
      const plan = planEntropy(w);
      if (plan.length === 0) continue;
      const snapped = applyEntropyTax(w);
      const gone = all.length - all.filter((id) => w.bonds.has(id)).length;
      expect(lost(w, P(0)), `seed ${seed}: the counter is the board's drop`).toBe(gone);
      expect(gone).toBeGreaterThanOrEqual(snapped);
      if (gone > snapped) seen = true;
    }
    expect(seen, 'anti-vacuity: at least one seed split off a chunk (gone > snapped)').toBe(true);
  });
});
