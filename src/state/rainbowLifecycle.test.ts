/**
 * SPARK — S75 P3 rainbow color-shuffle lifecycle unit tests.
 *
 * Locks the load-bearing guarantees (Council DR5/DR7/DR8): the shuffle is a DETERMINISTIC
 * BIJECTION over the palette (uniqueness — "no two players the same colour" — always holds), a
 * DERANGEMENT over active colours (everyone visibly switches), COMPLETE (a player's structures
 * recolour in lockstep so territory/bond-segregation stay coherent), idempotent (first-click-
 * wins), and replay-safe (identical seed+tick => identical colours). Spawn/dissipate/teardown too.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, RAINBOW_TTL_TICKS, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, asPrimitiveId, asRainbowId } from '../types.ts';
import { mulberry32 } from './rng.ts';
import { makeWorld, type World } from './world.ts';
import {
  applyDissipateRainbow,
  applySpawnRainbow,
  applyTriggerRainbow,
  buildShuffleColorMap,
  teardownRainbows,
} from './rainbowLifecycle.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function makePrim(id: number, placerColor: number): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: P0,
    createdTick: id,
    pos: { x: id * 10, y: 0 },
    prevPos: { x: id * 10, y: 0 },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

/** 2-player world with P0=crimson, P1=cyan, seeded for deterministic shuffles. */
function duelWorld(): World {
  const w = makeWorld(0xc0ffee);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

describe('rainbowLifecycle — spawn + dissipate + teardown', () => {
  it('mints a rainbow at pos with a TTL + advancing id', () => {
    const w = duelWorld();
    w.tick = 100;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 960, y: 540 } });
    expect(w.rainbows.size).toBe(1);
    expect(w.nextRainbowId).toBe(1);
    const rb = w.rainbows.get(asRainbowId(0))!;
    expect(rb.pos).toEqual({ x: 960, y: 540 });
    expect(rb.spawnedAtTick).toBe(100);
    expect(rb.dissipateAtTick).toBe(100 + RAINBOW_TTL_TICKS);
  });

  it('DISSIPATE removes an un-clicked rainbow WITHOUT recolouring', () => {
    const w = duelWorld();
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 500, y: 500 } });
    const before = w.players.get(P0)!.color;
    applyDissipateRainbow(w, { type: 'DISSIPATE_RAINBOW', rainbowId: asRainbowId(0) });
    expect(w.rainbows.size).toBe(0);
    expect(w.players.get(P0)!.color).toBe(before);
  });

  it('teardownRainbows clears the Map + counter', () => {
    const w = duelWorld();
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 500, y: 500 } });
    teardownRainbows(w);
    expect(w.rainbows.size).toBe(0);
    expect(w.nextRainbowId).toBe(0);
  });
});

describe('rainbowLifecycle — buildShuffleColorMap (bijection + derangement)', () => {
  it('is a BIJECTION over the 6 human colours (excludes the bots-only Silver — S94)', () => {
    const human = PLAYER_COLORS.slice(0, 6);
    const map = buildShuffleColorMap(mulberry32(123), new Set(human));
    const outputs = human.map((c) => map.get(c)!);
    expect(new Set(outputs).size).toBe(human.length); // all distinct
    expect(new Set(outputs)).toEqual(new Set(human)); // a permutation of the 6 human colours
  });

  it('DERANGES the active colours (every active player visibly changes) across seeds', () => {
    const active = new Set([PLAYER_COLORS[0], PLAYER_COLORS[1]]);
    for (let seed = 1; seed <= 12; seed++) {
      const map = buildShuffleColorMap(mulberry32(seed), active);
      expect(map.get(PLAYER_COLORS[0])).not.toBe(PLAYER_COLORS[0]);
      expect(map.get(PLAYER_COLORS[1])).not.toBe(PLAYER_COLORS[1]);
    }
  });
});

describe('rainbowLifecycle — applyTriggerRainbow (global colour remap)', () => {
  it('remaps every player to a NEW, UNIQUE colour (2-player game, full palette available)', () => {
    const w = duelWorld();
    w.tick = 7;
    const c0 = w.players.get(P0)!.color;
    const c1 = w.players.get(P1)!.color;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 0, y: 0 } });
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', rainbowId: asRainbowId(0), playerId: P0 });
    const n0 = w.players.get(P0)!.color;
    const n1 = w.players.get(P1)!.color;
    expect(n0).not.toBe(c0); // P0 switched
    expect(n1).not.toBe(c1); // P1 switched
    expect(n0).not.toBe(n1); // never the same colour
    expect(PLAYER_COLORS).toContain(n0); // still a palette colour
    expect(PLAYER_COLORS).toContain(n1);
    expect(w.rainbows.size).toBe(0); // consumed
  });

  it('remaps a player structures in lockstep (placerColor + ownerColor track the owner)', () => {
    const w = duelWorld();
    const a = makePrim(0, PLAYER_COLORS[0]); // P0
    const b = makePrim(1, PLAYER_COLORS[0]); // P0
    const c = makePrim(2, PLAYER_COLORS[1]); // P1
    w.primitives.set(a.id, a);
    w.primitives.set(b.id, b);
    w.primitives.set(c.id, c);
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 0, y: 0 } });
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', rainbowId: asRainbowId(0), playerId: P0 });
    const p0c = w.players.get(P0)!.color;
    const p1c = w.players.get(P1)!.color;
    // Each prim's colours still equal its OWNER's NEW colour → territory/bond-seg stay coherent.
    expect(a.placerColor).toBe(p0c);
    expect(a.ownerColor).toBe(p0c);
    expect(b.placerColor).toBe(p0c);
    expect(c.placerColor).toBe(p1c);
    expect(c.ownerColor).toBe(p1c);
  });

  it('is DETERMINISTIC: identical worlds (same seed + tick) yield identical colours', () => {
    const run = (): number[] => {
      const w = duelWorld();
      w.tick = 42;
      applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 0, y: 0 } });
      applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', rainbowId: asRainbowId(0), playerId: P0 });
      return [w.players.get(P0)!.color, w.players.get(P1)!.color];
    };
    expect(run()).toEqual(run());
  });

  it('is IDEMPOTENT: a second trigger on the consumed rainbow no-ops (first-click-wins)', () => {
    const w = duelWorld();
    w.tick = 7;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 0, y: 0 } });
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', rainbowId: asRainbowId(0), playerId: P0 });
    const after = w.players.get(P0)!.color;
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', rainbowId: asRainbowId(0), playerId: P1 });
    expect(w.players.get(P0)!.color).toBe(after); // no second recolour
  });

  it('SOLO: the single player still switches to a different palette colour', () => {
    const w = makeWorld(0xabcdef);
    const p0 = w.players.get(P0);
    if (p0 !== undefined) p0.color = PLAYER_COLORS[0];
    w.tick = 3;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 0, y: 0 } });
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', rainbowId: asRainbowId(0), playerId: P0 });
    expect(w.players.get(P0)!.color).not.toBe(PLAYER_COLORS[0]);
    expect(PLAYER_COLORS).toContain(w.players.get(P0)!.color);
  });
});

describe('S84 P2 — rainbowSwitchTick (flyover celebration window)', () => {
  it('TRIGGER stamps world.rainbowSwitchTick with the trigger tick', () => {
    const w = duelWorld();
    w.tick = 777;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 960, y: 540 } });
    expect(w.rainbowSwitchTick).toBeUndefined();
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', playerId: P0, rainbowId: asRainbowId(0) });
    expect(w.rainbowSwitchTick).toBe(777);
  });

  it('a SECOND switch overwrites the tick (restart semantics — Council row 8)', () => {
    const w = duelWorld();
    w.tick = 100;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 960, y: 540 } });
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', playerId: P0, rainbowId: asRainbowId(0) });
    w.tick = 150;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 400, y: 400 } });
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', playerId: P0, rainbowId: asRainbowId(1) });
    expect(w.rainbowSwitchTick).toBe(150);
  });

  it('an idempotent re-click (consumed rainbow) does NOT re-stamp the window', () => {
    const w = duelWorld();
    w.tick = 100;
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 960, y: 540 } });
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', playerId: P0, rainbowId: asRainbowId(0) });
    w.tick = 130;
    applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', playerId: P0, rainbowId: asRainbowId(0) });
    expect(w.rainbowSwitchTick).toBe(100); // first-click-wins, no restart from ghosts
  });

  it('DISSIPATE never opens the window (harmless TTL expiry)', () => {
    const w = duelWorld();
    applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 500, y: 500 } });
    applyDissipateRainbow(w, { type: 'DISSIPATE_RAINBOW', rainbowId: asRainbowId(0) });
    expect(w.rainbowSwitchTick).toBeUndefined();
  });
});

describe('S94 BUGFIX — rainbow shuffles only the 6 human colours, never the bots-only Silver', () => {
  const SILVER = PLAYER_COLORS[6]; // 0xc0c8d0, bots-only, near-white — the "stuck white" culprit
  const HUMAN = PLAYER_COLORS.slice(0, 6);

  it('buildShuffleColorMap never has Silver as a key or value, over any seed', () => {
    for (let seed = 0; seed < 300; seed++) {
      const map = buildShuffleColorMap(mulberry32(seed), new Set([PLAYER_COLORS[0], PLAYER_COLORS[1]]));
      expect(map.has(SILVER)).toBe(false);
      for (const v of map.values()) expect(v).not.toBe(SILVER);
      // bijection over exactly the 6 human colours
      expect([...map.keys()].sort((a, b) => a - b)).toEqual([...HUMAN].sort((a, b) => a - b));
    }
  });

  it('a Silver bot keeps Silver (not in the map → unchanged via the ?? fallback)', () => {
    const map = buildShuffleColorMap(mulberry32(7), new Set([PLAYER_COLORS[0], SILVER]));
    expect(map.get(SILVER)).toBeUndefined();
  });

  it('applyTriggerRainbow never leaves a human player stuck Silver (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const w = duelWorld();
      w.rngSeed = seed;
      applySpawnRainbow(w, { type: 'SPAWN_RAINBOW', pos: { x: 100, y: 100 } });
      applyTriggerRainbow(w, { type: 'TRIGGER_RAINBOW', rainbowId: asRainbowId(0), playerId: P0 });
      for (const p of w.players.values()) expect(p.color).not.toBe(SILVER);
    }
  });
});
