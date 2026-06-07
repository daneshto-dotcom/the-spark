/**
 * SPARK — S72 P2 Pac-Man hunter unit tests.
 *
 * Locks the carried-S71-PDR hunter behaviour: leader-targeting + once-per-game
 * spawn, deterministic momentum pursuit, catch → bench + drop-carried (DROP_SPARK
 * reuse), escape-on-timeout, the CRITICAL target-disconnect crash-guard (Council
 * Gemini #1), and full teardown. Determinism is load-bearing (host-authoritative +
 * replay-safe), so the AI tests assert exact reproducibility.
 */

import { describe, expect, it } from 'vitest';
import {
  HUNTER_BENCH_TICKS,
  HUNTER_CATCH_HOLD_TICKS,
  HUNTER_DESPAWN_FADE_TICKS,
  HUNTER_HUNT_TICKS,
  PLAYER_COLORS,
  SparkType,
} from '../../constants.ts';
import { makeIdlePlayer, pickup } from '../../game/player.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import { asHunterId, asPlayerId, asPotatoId, asSparkId } from '../../types.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { applyPickupPotato, applySpawnPotato } from '../potatoLifecycle.ts';
import { isBenched, makeHunter } from './hunter.ts';
import { huntDistSq, hunterPursue } from './hunterAI.ts';
import {
  applyHunterCatch,
  applyHunterTick,
  applySpawnHunter,
  findLeadingPlayer,
  teardownHunters,
} from './hunterLifecycle.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const CYAN = PLAYER_COLORS[1];

/** Solo world (makeWorld already seats P0 + scoreByPlayer 0). */
function soloWorld(): World {
  return makeWorld(0);
}

/** 1v1 world: P0 (from makeWorld) + a CYAN P1 at a known avatar position. */
function duelWorld(): World {
  const w = makeWorld(0);
  w.gameMode = '1v1';
  w.players.set(P1, makeIdlePlayer(P1, CYAN, { x: 1000, y: 500 }));
  w.scoreByPlayer.set(P1, 0);
  return w;
}

describe('hunterLifecycle — findLeadingPlayer', () => {
  it('solo: returns the sole player', () => {
    expect(findLeadingPlayer(soloWorld())).toBe(P0);
  });
  it('1v1: returns the higher-scoring player', () => {
    const w = duelWorld();
    w.scoreByPlayer.set(P0, 10);
    w.scoreByPlayer.set(P1, 25);
    expect(findLeadingPlayer(w)).toBe(P1);
  });
  it('tie → lowest PlayerId (deterministic)', () => {
    const w = duelWorld();
    w.scoreByPlayer.set(P0, 30);
    w.scoreByPlayer.set(P1, 30);
    expect(findLeadingPlayer(w)).toBe(P0);
  });
});

describe('hunterLifecycle — applySpawnHunter', () => {
  it('mints one hunter targeting the leader, sets hunterSpawned, spawns at the top edge', () => {
    const w = duelWorld();
    w.scoreByPlayer.set(P1, 40);
    w.tick = 200;
    applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
    expect(w.hunters.size).toBe(1);
    expect(w.hunterSpawned).toBe(true);
    expect(w.nextHunterId).toBe(1);
    const h = [...w.hunters.values()][0];
    expect(h.targetPlayerId).toBe(P1);
    expect(h.state).toBe('SEEKING');
    expect(h.spawnedAtTick).toBe(200);
    expect(h.despawnAtTick).toBe(200 + HUNTER_HUNT_TICKS);
    expect(h.pos.y).toBeLessThan(100); // top edge — closes in from outside
  });
  it('is once-per-game: a second spawn is a no-op (defense-in-depth guard)', () => {
    const w = soloWorld();
    applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
    applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
    expect(w.hunters.size).toBe(1);
  });
});

describe('hunterAI — pursuit (pure, deterministic)', () => {
  it('huntDistSq is squared euclidean distance', () => {
    expect(huntDistSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  });
  it('hunterPursue moves the body toward the target', () => {
    const h = { pos: { x: 0, y: 0 }, prevPos: { x: 0, y: 0 } };
    hunterPursue(h, { x: 1000, y: 0 }, 0.6, 7, 0.9);
    expect(h.pos.x).toBeGreaterThan(0);
    expect(h.pos.y).toBeCloseTo(0, 6);
  });
  it('caps the per-tick step at maxSpeed (juke-ability budget)', () => {
    const h = { pos: { x: 0, y: 0 }, prevPos: { x: -100, y: 0 } }; // huge inbound velocity
    hunterPursue(h, { x: 1000, y: 0 }, 0.6, 7, 0.9);
    const step = Math.hypot(h.pos.x, h.pos.y);
    expect(step).toBeLessThanOrEqual(7 + 1e-9);
  });
  it('is deterministic across identical input sequences', () => {
    const run = (): { x: number; y: number } => {
      const h = { pos: { x: 5, y: 5 }, prevPos: { x: 5, y: 5 } };
      for (let i = 0; i < 50; i++) hunterPursue(h, { x: 400, y: 300 }, 0.6, 7, 0.9);
      return { x: h.pos.x, y: h.pos.y };
    };
    expect(run()).toEqual(run());
  });
});

describe('hunterLifecycle — applyHunterTick steering + escape', () => {
  it('steers the hunter closer to the target avatar over ticks', () => {
    const w = duelWorld();
    const target = w.players.get(P1)!;
    target.avatarPos.x = 1000;
    target.avatarPos.y = 500;
    const id = asHunterId(0);
    w.hunters.set(id, makeHunter({ id, targetPlayerId: P1, pos: { x: 100, y: 500 }, spawnedAtTick: 0 }));
    const before = huntDistSq(w.hunters.get(id)!.pos, target.avatarPos);
    for (let i = 0; i < 20; i++) {
      w.tick++;
      applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id });
    }
    const after = huntDistSq(w.hunters.get(id)!.pos, target.avatarPos);
    expect(after).toBeLessThan(before);
  });
  it('escapes (→ DESPAWNING → removed) when the chase window elapses uncaught', () => {
    const w = duelWorld();
    const target = w.players.get(P1)!;
    target.avatarPos.x = 5000; // unreachable → never caught
    target.avatarPos.y = 5000;
    const id = asHunterId(0);
    w.hunters.set(id, makeHunter({ id, targetPlayerId: P1, pos: { x: 100, y: 100 }, spawnedAtTick: 0 }));
    w.tick = HUNTER_HUNT_TICKS; // chase window elapsed
    applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id });
    expect(w.hunters.get(id)!.state).toBe('DESPAWNING');
    for (let i = 0; i < HUNTER_DESPAWN_FADE_TICKS; i++) {
      w.tick++;
      applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id });
    }
    expect(w.hunters.has(id)).toBe(false);
  });
});

describe('hunterLifecycle — catch + bench', () => {
  it('catches an idle player in range → benches + holds CATCHING → despawns', () => {
    const w = duelWorld();
    const target = w.players.get(P1)!;
    target.avatarPos.x = 800;
    target.avatarPos.y = 400;
    const id = asHunterId(0);
    // Spawn the hunter right on the avatar so it catches on the first tick.
    w.hunters.set(id, makeHunter({ id, targetPlayerId: P1, pos: { x: 800, y: 400 }, spawnedAtTick: 0 }));
    w.tick = 10;
    applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id });
    expect(w.hunters.get(id)!.state).toBe('CATCHING');
    expect(w.players.get(P1)!.benchedUntilTick).toBe(10 + HUNTER_BENCH_TICKS);
    for (let i = 0; i < HUNTER_CATCH_HOLD_TICKS; i++) {
      w.tick++;
      applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id });
    }
    expect(w.hunters.has(id)).toBe(false);
  });

  it('catch drops the victim carried spark (REUSE DROP_SPARK) + preserves the bench', () => {
    const w = duelWorld();
    const spark = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: 800, y: 400 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    spark.state = { kind: 'Carried', carrierId: P1 };
    w.freeSparks.set(spark.id, spark);
    w.players.set(P1, pickup(makeIdlePlayer(P1, CYAN, { x: 800, y: 400 }), spark.id));
    const id = asHunterId(0);
    w.hunters.set(id, makeHunter({ id, targetPlayerId: P1, pos: { x: 800, y: 400 }, spawnedAtTick: 0 }));
    w.tick = 5;
    applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id });
    const victim = w.players.get(P1)!;
    expect(victim.kind).toBe('Idle'); // spark dropped via DROP_SPARK
    expect(w.freeSparks.get(spark.id)!.state.kind).toBe('Free');
    // The bench survived the fsmDrop player-object reconstruction (set BEFORE drop).
    expect(victim.benchedUntilTick).toBe(5 + HUNTER_BENCH_TICKS);
  });

  it('S75: catch drops a carried POTATO to ARMED at the catch pos (no invisible carrier, no double-bench)', () => {
    const w = duelWorld();
    const target = w.players.get(P1)!;
    target.avatarPos.x = 800;
    target.avatarPos.y = 400;
    // P1 is carrying a potato (carry-1: kind stays Idle, carriedPotatoId set).
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 800, y: 400 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    expect(w.players.get(P1)!.carriedPotatoId).toBe(asPotatoId(0));
    const id = asHunterId(0);
    w.hunters.set(id, makeHunter({ id, targetPlayerId: P1, pos: { x: 800, y: 400 }, spawnedAtTick: 0 }));
    w.tick = 12;
    applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id });
    // Benched once (no double-bench), potato dropped to ARMED, carry slot cleared.
    expect(w.players.get(P1)!.benchedUntilTick).toBe(12 + HUNTER_BENCH_TICKS);
    expect(w.players.get(P1)!.carriedPotatoId).toBeUndefined();
    const po = w.potatoes.get(asPotatoId(0))!;
    expect(po.state).toBe('ARMED');
    expect(po.carrierId).toBe(null);
  });
});

describe('hunterLifecycle — CRITICAL target-disconnect crash-guard (Council Gemini #1)', () => {
  it('despawns immediately + does not throw when the target player is gone', () => {
    const w = duelWorld();
    const id = asHunterId(0);
    w.hunters.set(id, makeHunter({ id, targetPlayerId: P1, pos: { x: 100, y: 100 }, spawnedAtTick: 0 }));
    w.players.delete(P1); // disconnect / eliminate the chased player
    expect(() => applyHunterTick(w, { type: 'HUNTER_TICK', hunterId: id })).not.toThrow();
    expect(w.hunters.has(id)).toBe(false);
  });
});

describe('hunterLifecycle — teardownHunters', () => {
  it('clears hunters + counter + spawned flag + every benchedUntilTick', () => {
    const w = duelWorld();
    applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
    w.players.get(P0)!.benchedUntilTick = 9999;
    w.players.get(P1)!.benchedUntilTick = 9999;
    teardownHunters(w);
    expect(w.hunters.size).toBe(0);
    expect(w.nextHunterId).toBe(0);
    expect(w.hunterSpawned).toBe(false);
    expect(w.players.get(P0)!.benchedUntilTick).toBeUndefined();
    expect(w.players.get(P1)!.benchedUntilTick).toBeUndefined();
  });
});

describe('hunterLifecycle — applyHunterCatch (dispatch parity)', () => {
  it('benches the victim + sets the hunter to CATCHING', () => {
    const w = duelWorld();
    const id = asHunterId(0);
    w.hunters.set(id, makeHunter({ id, targetPlayerId: P1, pos: { x: 0, y: 0 }, spawnedAtTick: 0 }));
    w.tick = 7;
    applyHunterCatch(w, { type: 'HUNTER_CATCH', hunterId: id, victimId: P1 });
    expect(w.hunters.get(id)!.state).toBe('CATCHING');
    expect(w.players.get(P1)!.benchedUntilTick).toBe(7 + HUNTER_BENCH_TICKS);
  });
});

describe('hunterLifecycle — teardown WIRING via dispatch (CHECK: WIN + START_GAME)', () => {
  it('WIN_TRIGGER tears down the hunter + every bench (winner ends unbenched)', () => {
    const w = duelWorld();
    applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
    w.players.get(P0)!.benchedUntilTick = 9999;
    dispatch(w, { type: 'WIN_TRIGGER', winnerId: P0 });
    expect(w.gameState).toBe('WIN');
    expect(w.hunters.size).toBe(0);
    expect(w.hunterSpawned).toBe(false);
    expect(w.players.get(P0)!.benchedUntilTick).toBeUndefined();
  });
  it('START_GAME starts a fresh match with no hunter + no bench (defensive invariant)', () => {
    const w = duelWorld();
    applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
    w.players.get(P0)!.benchedUntilTick = 9999;
    dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true });
    expect(w.hunters.size).toBe(0);
    expect(w.hunterSpawned).toBe(false);
    expect(w.players.get(P0)!.benchedUntilTick).toBeUndefined();
  });
});

describe('isBenched helper (shared by controls input-lock + avatar-hide)', () => {
  it('true only while benchedUntilTick is strictly in the future', () => {
    expect(isBenched(undefined, 100)).toBe(false);
    expect(isBenched(50, 100)).toBe(false); // past
    expect(isBenched(100, 100)).toBe(false); // expired exactly (self-heal)
    expect(isBenched(150, 100)).toBe(true); // future
  });
});
