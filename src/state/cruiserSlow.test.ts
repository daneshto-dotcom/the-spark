/**
 * SPARK — S82 P1 cruiser-poopy-slow unit tests.
 *
 * Locks the movement-model contract (Council S82 R1+R2 CONVERGED):
 *   - applyPoopTick checks PLAYER CRUISERS FIRST (bodyblock precedence over structures),
 *     lowest-seat deterministic pick, benched avatars immune, consume-on-hit, re-hit refresh.
 *   - While debuffed, applyUpdateAvatarPos writes poopedCursorTarget (verbatim cursor) and
 *     leaves avatarPos to tickCruiserChase: ≤ POOP_CRUISER_MAX_SPEED px/tick, EXACT snap +
 *     clear within one step (guaranteed termination — no float-equality chase), carried-spark
 *     pinning preserved (S45 Sym A).
 *   - The first UN-debuffed UPDATE_AVATAR_POS restores verbatim teleport + clears the target.
 *   - Serialization is additive-optional: fields emitted only when set (pre-S82 byte-compat),
 *     full snapshot→JSON→restore round-trip.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  POOP_AVATAR_HIT_RADIUS,
  POOP_CRUISER_MAX_SPEED,
  POOP_CRUISER_SLOW_TICKS,
  POOP_FALL_SPEED,
  SparkType,
} from '../constants.ts';
import { makeIdlePlayer, pickup } from '../game/player.ts';
import { makeFreeSpark } from '../game/spark.ts';
import type { Primitive } from '../game/primitive.ts';
import { asPlayerId, asPoopId, asPrimitiveId, asSparkId } from '../types.ts';
import { isCruiserDebuffed, applyUpdateAvatarPos, tickCruiserChase } from './gameMode.ts';
import { restore, snapshot } from './save.ts';
import { makePoop } from './seagulls/seagull.ts';
import { applyPoopTick } from './seagulls/seagullLifecycle.ts';
import { makeWorld, type World } from './world.ts';

const P1 = asPlayerId(0);
const P2 = asPlayerId(1);
const RED = PLAYER_COLORS[0];
const CYAN = PLAYER_COLORS[1];

function baseWorld(): World {
  const world = makeWorld(0);
  world.players.clear();
  world.players.set(P1, makeIdlePlayer(P1, RED, { x: 600, y: 500 }));
  world.gameState = 'PLAYING';
  world.tick = 100;
  return world;
}

/** A FALLING poop that lands within hit range of (600,500) on its next tick. */
function dropPoopAt(world: World, x: number, y: number): void {
  const id = asPoopId(world.nextPoopId++);
  world.poops.set(id, makePoop({ id, pos: { x, y }, spawnedAtTick: world.tick }));
}

function tickAllPoops(world: World): void {
  for (const pid of [...world.poops.keys()]) {
    applyPoopTick(world, { type: 'POOP_TICK', poopId: pid });
  }
}

function addPrim(world: World, id: number, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor: RED,
    placedBy: P1,
    createdTick: id,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: RED,
    lastOwnershipChange: 0,
    radius: 8,
  };
  world.primitives.set(p.id, p);
  return p;
}

describe('S82 P1 — poop vs player cruiser', () => {
  it('a falling poop within POOP_AVATAR_HIT_RADIUS slows the cruiser and is consumed', () => {
    const w = baseWorld();
    dropPoopAt(w, 600, 500 - POOP_FALL_SPEED - 10); // lands ~10px above the avatar — inside 30
    tickAllPoops(w);
    const p1 = w.players.get(P1)!;
    expect(p1.poopedUntilTick).toBe(w.tick + POOP_CRUISER_SLOW_TICKS);
    // chase engages AT the avatar position (no movement until the next cursor update)
    expect(p1.poopedCursorTarget).toEqual({ x: 600, y: 500 });
    expect(w.poops.size).toBe(0); // consumed
  });

  it('a poop outside the avatar radius keeps falling (no debuff)', () => {
    const w = baseWorld();
    dropPoopAt(w, 600 + POOP_AVATAR_HIT_RADIUS + 20, 480);
    tickAllPoops(w);
    expect(w.players.get(P1)!.poopedUntilTick).toBeUndefined();
    expect(w.poops.size).toBe(1); // still falling
  });

  it('PRECEDENCE: the avatar bodyblocks — a poop over both avatar and structure hits the avatar', () => {
    const w = baseWorld();
    addPrim(w, 1, 600, 500); // structure exactly under the avatar
    dropPoopAt(w, 600, 500 - POOP_FALL_SPEED - 5);
    tickAllPoops(w);
    expect(w.players.get(P1)!.poopedUntilTick).toBeDefined();
    expect(w.fouledPrimitives.size).toBe(0); // the structure was SHIELDED
    expect(w.poops.size).toBe(0);
  });

  it('a benched avatar cannot be hit — the poop falls through to the structure', () => {
    const w = baseWorld();
    const p1 = w.players.get(P1)!;
    p1.benchedUntilTick = w.tick + 600; // benched (hidden) for 10s
    addPrim(w, 1, 600, 500);
    dropPoopAt(w, 600, 500 - POOP_FALL_SPEED - 5);
    tickAllPoops(w);
    expect(p1.poopedUntilTick).toBeUndefined();
    expect(w.fouledPrimitives.size).toBe(1); // structure took the hit instead
  });

  it('two overlapping avatars: the LOWEST seat id is hit (deterministic), one victim per poop', () => {
    const w = baseWorld();
    w.players.set(P2, makeIdlePlayer(P2, CYAN, { x: 602, y: 500 }));
    dropPoopAt(w, 600, 500 - POOP_FALL_SPEED);
    tickAllPoops(w);
    expect(w.players.get(P1)!.poopedUntilTick).toBeDefined();
    expect(w.players.get(P2)!.poopedUntilTick).toBeUndefined();
    expect(w.poops.size).toBe(0);
  });

  it('a re-hit while already slowed REFRESHES the debuff window', () => {
    const w = baseWorld();
    dropPoopAt(w, 600, 500 - POOP_FALL_SPEED);
    tickAllPoops(w);
    const first = w.players.get(P1)!.poopedUntilTick!;
    w.tick += 200;
    dropPoopAt(w, 600, 500 - POOP_FALL_SPEED);
    tickAllPoops(w);
    expect(w.players.get(P1)!.poopedUntilTick).toBe(first + 200);
  });
});

describe('S82 P1 — debuffed movement model (reducer + chase)', () => {
  it('isCruiserDebuffed: strict tick compare, expiry boundary heals', () => {
    expect(isCruiserDebuffed({ poopedUntilTick: undefined }, 50)).toBe(false);
    expect(isCruiserDebuffed({ poopedUntilTick: 100 }, 99)).toBe(true);
    expect(isCruiserDebuffed({ poopedUntilTick: 100 }, 100)).toBe(false);
  });

  it('un-debuffed UPDATE_AVATAR_POS writes avatarPos verbatim (teleport unchanged)', () => {
    const w = baseWorld();
    applyUpdateAvatarPos(w, { type: 'UPDATE_AVATAR_POS', playerId: P1, pos: { x: 1500, y: 200 } });
    expect(w.players.get(P1)!.avatarPos).toEqual({ x: 1500, y: 200 });
  });

  it('debuffed UPDATE_AVATAR_POS writes the TARGET; avatarPos does not move', () => {
    const w = baseWorld();
    const p1 = w.players.get(P1)!;
    p1.poopedUntilTick = w.tick + 100;
    applyUpdateAvatarPos(w, { type: 'UPDATE_AVATAR_POS', playerId: P1, pos: { x: 1500, y: 200 } });
    expect(p1.avatarPos).toEqual({ x: 600, y: 500 });
    expect(p1.poopedCursorTarget).toEqual({ x: 1500, y: 200 });
  });

  it('the chase moves exactly POOP_CRUISER_MAX_SPEED px/tick toward the target', () => {
    const w = baseWorld();
    const p1 = w.players.get(P1)!;
    p1.poopedUntilTick = w.tick + 1000;
    p1.poopedCursorTarget = { x: 600 + 100, y: 500 }; // 100px straight right
    tickCruiserChase(w);
    expect(p1.avatarPos.x).toBeCloseTo(600 + POOP_CRUISER_MAX_SPEED, 10);
    expect(p1.avatarPos.y).toBeCloseTo(500, 10);
    expect(p1.poopedCursorTarget).toBeDefined(); // still converging
  });

  it('within one step: EXACT snap + target cleared (guaranteed termination)', () => {
    const w = baseWorld();
    const p1 = w.players.get(P1)!;
    p1.poopedCursorTarget = { x: 600 + POOP_CRUISER_MAX_SPEED - 1, y: 500 };
    tickCruiserChase(w);
    expect(p1.avatarPos.x).toBe(600 + POOP_CRUISER_MAX_SPEED - 1); // exact, not approximate
    expect(p1.poopedCursorTarget).toBeUndefined();
  });

  it('the chase completes the residual gap even AFTER the debuff timer expires', () => {
    const w = baseWorld();
    const p1 = w.players.get(P1)!;
    p1.poopedUntilTick = w.tick - 1; // already expired
    p1.poopedCursorTarget = { x: 600 + 20, y: 500 };
    tickCruiserChase(w); // 7px
    tickCruiserChase(w); // 14px
    tickCruiserChase(w); // ≤7 remaining → snap + clear
    expect(p1.avatarPos.x).toBe(620);
    expect(p1.poopedCursorTarget).toBeUndefined();
  });

  it('the first UN-debuffed update clears a leftover target and teleports verbatim', () => {
    const w = baseWorld();
    const p1 = w.players.get(P1)!;
    p1.poopedUntilTick = w.tick - 1; // expired
    p1.poopedCursorTarget = { x: 700, y: 500 }; // residual chase still pending
    applyUpdateAvatarPos(w, { type: 'UPDATE_AVATAR_POS', playerId: P1, pos: { x: 900, y: 300 } });
    expect(p1.avatarPos).toEqual({ x: 900, y: 300 });
    expect(p1.poopedCursorTarget).toBeUndefined();
  });

  it('a Carrying player\'s spark is pinned to the chasing avatar each tick (S45 Sym A)', () => {
    const w = baseWorld();
    const sparkId = asSparkId(7);
    const spark = makeFreeSpark({
      id: sparkId,
      type: SparkType.Dot,
      pos: { x: 600, y: 500 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    spark.state = { kind: 'Carried', carrierId: P1 };
    w.freeSparks.set(sparkId, spark);
    const carrying = pickup(w.players.get(P1)!, sparkId);
    w.players.set(P1, carrying);
    carrying.poopedUntilTick = w.tick + 1000;
    carrying.poopedCursorTarget = { x: 700, y: 500 };
    tickCruiserChase(w);
    expect(spark.pos.x).toBeCloseTo(carrying.avatarPos.x, 10);
    expect(spark.pos.y).toBeCloseTo(carrying.avatarPos.y, 10);
    expect(spark.prevPos).toEqual(spark.pos); // velocity-free pin
  });

  it('debuffed reducer does NOT snap the carried spark (the chase owns the coupling)', () => {
    const w = baseWorld();
    const sparkId = asSparkId(8);
    const spark = makeFreeSpark({
      id: sparkId,
      type: SparkType.Dot,
      pos: { x: 600, y: 500 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    spark.state = { kind: 'Carried', carrierId: P1 };
    w.freeSparks.set(sparkId, spark);
    const carrying = pickup(w.players.get(P1)!, sparkId);
    w.players.set(P1, carrying);
    carrying.poopedUntilTick = w.tick + 1000;
    applyUpdateAvatarPos(w, { type: 'UPDATE_AVATAR_POS', playerId: P1, pos: { x: 1500, y: 200 } });
    expect(spark.pos).toEqual({ x: 600, y: 500 }); // untouched — avatar didn't move
  });
});

describe('S82 P1 — serialization (additive-optional, pre-S82 byte-compat)', () => {
  it('emits poopedUntilTick/poopedCursorTarget only when set', () => {
    const w = baseWorld();
    const clean = JSON.stringify(snapshot(w));
    expect(clean).not.toContain('poopedUntilTick');
    expect(clean).not.toContain('poopedCursorTarget');
    const p1 = w.players.get(P1)!;
    p1.poopedUntilTick = 7777;
    p1.poopedCursorTarget = { x: 1, y: 2 };
    const dirty = JSON.stringify(snapshot(w));
    expect(dirty).toContain('"poopedUntilTick":7777');
    expect(dirty).toContain('"poopedCursorTarget":{"x":1,"y":2}');
  });

  it('round-trips through snapshot→JSON→restore (deep-copied target, no aliasing)', () => {
    const w = baseWorld();
    const p1 = w.players.get(P1)!;
    p1.poopedUntilTick = 4242;
    p1.poopedCursorTarget = { x: 321, y: 654 };
    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w))), w2);
    const r1 = w2.players.get(P1)!;
    expect(r1.poopedUntilTick).toBe(4242);
    expect(r1.poopedCursorTarget).toEqual({ x: 321, y: 654 });
    expect(r1.poopedCursorTarget).not.toBe(p1.poopedCursorTarget);
  });
});
