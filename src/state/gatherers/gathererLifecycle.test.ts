/**
 * SPARK — V6-1.1 gatherer economy tests.
 *
 * Covers the buy transaction (score→unit), the affordability guard, teardown parity at all five
 * sites, and — applying the S134/S135 lesson AT ADD TIME rather than retrofitting it after a bug —
 * the SERIALIZATION ROUND-TRIP on both host-authoritative consumers. A gatherer costs 105 victory
 * points; losing one on host migration or worker resume would silently burn the purchase, which is
 * exactly the creature/hunter defect class one entity family over.
 */
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CASTLE_PORCH_SLOTS,
  GATHERER_PRICE,
  KEEP_H,
  KEEP_RING_RADIUS,
  KEEP_RING_SEATS,
  KEEP_W,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  STARTING_VICTORY_POINTS,
} from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { spendScore } from '../gameMode.ts';
import { asPlayerId } from '../../types.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { porchSlot } from '../castleBank.ts';
import { castleAnchor } from './gatherer.ts';
import { teardownGatherers } from './gathererLifecycle.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** A PLAYING world where P0 can afford exactly `score` points' worth of gatherers. */
function worldWithScore(score: number): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.tick = 400;
  w.scoreByPlayer.set(P0, score);
  w.scoreProgress = score;
  return w;
}

const buy = (w: World, playerId = P0): World => dispatch(w, { type: 'BUY_GATHERER', playerId });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('V6-1.1 — BUY_GATHERER (score becomes a currency)', () => {
  it('spends the price from the ONE pool and mints exactly one gatherer at the buyer keep', () => {
    const w = worldWithScore(900);
    buy(w);

    expect(w.gatherers.size).toBe(1);
    // ONE POOL: the purchase SETS YOU BACK toward the win — 900 → 795, not a separate wallet.
    expect(w.scoreByPlayer.get(P0)).toBe(900 - GATHERER_PRICE);
    // scoreProgress (the win gate + the on-screen number) tracks the spend DOWNWARD, or the
    // displayed pool and the win condition would silently diverge.
    expect(w.scoreProgress).toBe(900 - GATHERER_PRICE);

    const g = [...w.gatherers.values()][0]!;
    expect(g.ownerPlayerId).toBe(P0);
    expect(g.spawnedAtTick).toBe(w.tick);
    // It appears AT ITS OWNER'S KEEP (within the fan-out offset), not at the world origin.
    const anchor = castleAnchor(0);
    expect(Math.hypot(g.pos.x - anchor.x, g.pos.y - anchor.y)).toBeLessThan(80);
    expect(w.nextGathererId).toBe(1);
  });

  it('is a NO-OP when the player cannot afford it — score never goes negative', () => {
    const w = worldWithScore(GATHERER_PRICE - 1);
    buy(w);
    expect(w.gatherers.size).toBe(0);
    expect(w.scoreByPlayer.get(P0)).toBe(GATHERER_PRICE - 1); // untouched, not clamped-from-negative
    expect(w.nextGathererId).toBe(0); // and no id was burned on the rejected buy
  });

  it('affords EXACTLY at the price boundary (>=, not >) and lands the buyer on zero', () => {
    const w = worldWithScore(GATHERER_PRICE);
    buy(w);
    expect(w.gatherers.size).toBe(1);
    expect(w.scoreByPlayer.get(P0)).toBe(0);
  });

  it('repeated buys mint distinct ids and never drive the pool below zero', () => {
    const w = worldWithScore(GATHERER_PRICE * 2 + 10);
    buy(w); buy(w); buy(w); // the third is unaffordable (10 left)
    expect(w.gatherers.size).toBe(2);
    expect(new Set([...w.gatherers.keys()]).size).toBe(2);
    expect(w.scoreByPlayer.get(P0)).toBe(10);
    expect(w.scoreByPlayer.get(P0)).toBeGreaterThanOrEqual(0);
  });

  it('spends from the BUYER own pool only — a second seat is untouched', () => {
    const w = worldWithScore(500);
    w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!, { x: 900, y: 500 }));
    w.scoreByPlayer.set(P1, 800);
    buy(w, P1);
    expect(w.scoreByPlayer.get(P0)).toBe(500); // untouched
    expect(w.scoreByPlayer.get(P1)).toBe(800 - GATHERER_PRICE);
    expect([...w.gatherers.values()][0]!.ownerPlayerId).toBe(P1);
    // scoreProgress = max across seats, so it follows the (still-leading) P1.
    expect(w.scoreProgress).toBe(800 - GATHERER_PRICE);
  });

  it('a missing player is a no-op (never throws, never mints)', () => {
    const w = worldWithScore(900);
    const ghost = asPlayerId(5);
    w.scoreByPlayer.set(ghost, 900); // score present, but no player object
    buy(w, ghost);
    expect(w.gatherers.size).toBe(0);
  });
});

describe('V6-1.1 — spendScore (the currency primitive)', () => {
  /**
   * ⚠ These pin `spendScore` DIRECTLY, and that is deliberate. Its 0-clamp is UNREACHABLE through
   * BUY_GATHERER — the reducer's affordability guard fires first — so a mutation removing the clamp
   * survived the whole buy-path suite (observed: mutation matrix M5 stayed green). `spendScore` is
   * exported and is the seam every future sink (upgrades, rebuys) will spend through, so its
   * contract is pinned here rather than left resting on one caller's guard.
   */
  it('clamps at zero — an over-spend can never produce a negative pool', () => {
    const w = worldWithScore(30);
    spendScore(w, P0, 100);
    expect(w.scoreByPlayer.get(P0)).toBe(0);
    expect(w.scoreProgress).toBe(0);
  });

  it('recomputes scoreProgress as the leader max, not the spender own score', () => {
    const w = worldWithScore(300);
    w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!, { x: 900, y: 500 }));
    w.scoreByPlayer.set(P1, 900);
    spendScore(w, P0, 100);
    expect(w.scoreByPlayer.get(P0)).toBe(200);
    expect(w.scoreProgress).toBe(900); // P1 still leads, so the win gate follows P1
  });

  it('spending on an unknown seat is harmless (treated as 0, clamped to 0)', () => {
    const w = worldWithScore(300);
    spendScore(w, asPlayerId(4), 100);
    expect(w.scoreByPlayer.get(asPlayerId(4))).toBe(0);
    expect(w.scoreByPlayer.get(P0)).toBe(300);
  });
});

describe('V6-1.1 — gatherer serialization round-trip (a 105-point purchase must survive)', () => {
  it('survives the DISK path (snapshot→restore — the worker-INIT / host save-load seam)', () => {
    const host = worldWithScore(900);
    buy(host); buy(host);

    const fresh = makeWorld(0);
    fresh.gameState = 'PLAYING';
    restore(clone(snapshot(host)), fresh);

    expect(fresh.gatherers.size).toBe(2);
    // Full fidelity: every field travels, so the restored world hashes IDENTICALLY. This is the
    // guard the hunter family could not have until S135 P0 made all its fields travel.
    expect(hashWorldStateFull(fresh)).toBe(hashWorldStateFull(host));
    // The mint cursor advances past the max loaded id, so the next buy cannot collide.
    expect(fresh.nextGathererId).toBe(2);
  });

  it('survives the WIRE path (netSnapshot→applyNetSnapshot — the promoted-successor seam)', () => {
    const host = worldWithScore(900);
    buy(host);
    const g = [...host.gatherers.values()][0]!;

    const client = makeWorld(0);
    client.gameState = 'PLAYING';
    applyNetSnapshot(clone(netSnapshot(host)), client);

    expect(client.gatherers.size).toBe(1);
    const mirrored = [...client.gatherers.values()][0]!;
    expect(mirrored.id).toBe(g.id);
    expect(mirrored.ownerPlayerId).toBe(g.ownerPlayerId);
    expect(mirrored.pos).toEqual(g.pos);
    expect(mirrored.spawnedAtTick).toBe(g.spawnedAtTick);
    expect(client.nextGathererId).toBe(1);
  });

  it('a world with NO gatherers omits the field entirely (pre-V6 saves stay byte-identical)', () => {
    const w = worldWithScore(900);
    expect(snapshot(w).gatherers).toBeUndefined();
    expect(JSON.stringify(netSnapshot(w)).includes('gatherers')).toBe(false);
  });

  it('rehydrate CLEARS a stale population (a successor never keeps units the snapshot dropped)', () => {
    const host = worldWithScore(900);
    const stale = worldWithScore(900);
    buy(stale); buy(stale);
    expect(stale.gatherers.size).toBe(2);
    // The host has none; applying its snapshot must empty the successor, not merge.
    applyNetSnapshot(clone(netSnapshot(host)), stale);
    expect(stale.gatherers.size).toBe(0);
    expect(stale.nextGathererId).toBe(0);
  });
});

describe('V6-1.1 — teardown parity', () => {
  it('teardownGatherers clears the population AND the mint cursor', () => {
    const w = worldWithScore(900);
    buy(w);
    teardownGatherers(w);
    expect(w.gatherers.size).toBe(0);
    expect(w.nextGathererId).toBe(0);
  });

  it('WIN_TRIGGER tears gatherers down (R5 decision: no endgame-ceremony role in V6-1.1)', () => {
    const w = worldWithScore(900);
    buy(w);
    dispatch(w, { type: 'WIN_TRIGGER', winnerId: P0 });
    expect(w.gameState).toBe('WIN');
    expect(w.gatherers.size).toBe(0);
  });

  it('START_GAME clears bought units then SEEDS exactly one per seat (the "START AT 1" ruling)', () => {
    const started = worldWithScore(900);
    buy(started); buy(started); buy(started);
    expect(started.gatherers.size).toBe(3);

    dispatch(started, { type: 'START_GAME', mode: 'solo', isHost: true });
    // V6-1.2 — a match boundary wipes the previous match's units (no unit survives it) and then
    // seeds the opening state: ONE gatherer per seated player + the opening point balance.
    expect(started.gatherers.size).toBe(1);
    expect([...started.gatherers.values()][0]!.ownerPlayerId).toBe(P0);
    expect(started.scoreByPlayer.get(P0)).toBe(STARTING_VICTORY_POINTS);
    // The mint cursor advanced past the seeded unit rather than colliding with it.
    expect(started.nextGathererId).toBe(1);
  });

  it('RETURN_TO_TITLE clears gatherers outright (the title screen owns no units)', () => {
    const returned = worldWithScore(900);
    buy(returned);
    dispatch(returned, { type: 'RETURN_TO_TITLE' });
    expect(returned.gatherers.size).toBe(0);
    expect(returned.nextGathererId).toBe(0);
  });

  it('GODLY_ABORT cascade-clears gatherers (peer-drop leaves no orphaned unit)', () => {
    const w = worldWithScore(900);
    buy(w);
    dispatch(w, { type: 'GODLY_ABORT' });
    expect(w.gatherers.size).toBe(0);
    expect(w.nextGathererId).toBe(0);
  });
});

describe('V6-1.1 — castleAnchor', () => {
  it('is pure + deterministic and gives every seat a DISTINCT keep', () => {
    expect(castleAnchor(0)).toEqual(castleAnchor(0));
    const seen = new Set<string>();
    // ⚠ LOOPS TO KEEP_RING_SEATS (7), NOT MAX_PLAYERS (6). VS-BOTS seats 1 human + up to 6 bots, and
    // the original MAX_PLAYERS ring made seat 6's keep land EXACTLY on seat 0's — a collision this
    // very test was blind to because it stopped at seat 5. Caught by the S135 end-of-session audit.
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      const a = castleAnchor(seat);
      expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
      seen.add(`${Math.round(a.x)},${Math.round(a.y)}`);
    }
    expect(seen.size).toBe(KEEP_RING_SEATS);
  });
});

describe('S138 P2 — the keep ring sits at the extremities (owner playtest)', () => {
  // Owner, verbatim: "the castles should all be first put at the extremities of the map of each
  // players zone, so that you cant all build at the middle from the start and make a mess of it."
  // Was SPAWNER_RADIUS + 150 = 275; now KEEP_RING_RADIUS = 420.
  it('every seat lands exactly on KEEP_RING_RADIUS from the arena centre', () => {
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      const a = castleAnchor(seat);
      const d = Math.hypot(a.x - SPAWNER_CENTER_X, a.y - SPAWNER_CENTER_Y);
      expect(d).toBeCloseTo(KEEP_RING_RADIUS, 6);
    }
  });

  it('the ring moved OUTWARD from the old 275 and is further from the quarry rim', () => {
    expect(KEEP_RING_RADIUS).toBeGreaterThan(SPAWNER_RADIUS + 150);
    // The haul a gatherer must walk each way: quarry rim -> keep. Was 150 px.
    expect(KEEP_RING_RADIUS - SPAWNER_RADIUS).toBeGreaterThan(2 * 150 * 0.95);
  });

  it('all 7 keeps (incl. the KEEP box) stay inside the canvas at the new radius', () => {
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      const a = castleAnchor(seat);
      expect(a.x - KEEP_W / 2).toBeGreaterThanOrEqual(0);
      expect(a.x + KEEP_W / 2).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(a.y - KEEP_H / 2).toBeGreaterThanOrEqual(0);
      expect(a.y + KEEP_H / 2).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });

  it('the porch slots also stay on-canvas (they hang off the keep)', () => {
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
        const p = porchSlot(seat, i);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(CANVAS_WIDTH);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(CANVAS_HEIGHT);
      }
    }
  });
});
