/**
 * SPARK — S76 P3 complexity-income scoring tests.
 *
 * Locks the new model end-to-end: computeComplexity (formula + per-owner attribution),
 * tickScoring (per-tick income accrual + scoreProgress = max), the player-1 CONSISTENCY fix
 * (#3b — every seat scores by the identical path), determinism, and the unified addScore.
 *
 * Structures are inserted directly (not via the placement pipeline) so the complexity math
 * is asserted in isolation from bond-formation geometry.
 */

import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HZ,
  PLAYER_COLORS,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_INCOME_PER_COMPLEXITY_PER_SEC,
  SCORE_MAGIC_BOND,
  SparkType,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, type PlayerId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { addScore } from './gameMode.ts';
import { computeComplexity, tickScoring } from './scoring.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const MAGIC_PREMIUM = SCORE_MAGIC_BOND - SCORE_FUNCTIONAL_BOND; // 2
const PER_TICK = SCORE_INCOME_PER_COMPLEXITY_PER_SEC / PHYSICS_HZ;

let nextId = 0;

function addPrim(world: World, playerId: PlayerId, type: SparkType, x: number, y: number): Primitive {
  const id = asPrimitiveId(nextId++);
  const color = PLAYER_COLORS[playerId as unknown as number];
  const prim: Primitive = {
    id, type, placerColor: color, placedBy: playerId, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: color, lastOwnershipChange: 0, radius: 8,
  };
  world.primitives.set(id, prim);
  return prim;
}

function addBond(world: World, a: Primitive, b: Primitive): void {
  const id = asBondId(nextId++);
  world.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0 });
  a.bonds.add(id);
  b.bonds.add(id);
}

// A 2-prim MAGIC structure (Line→Line = Cable) → complexity 2×SCORE_ANCHOR + MAGIC_PREMIUM = 4.
function buildMagicPair(world: World, playerId: PlayerId, x: number, y: number): void {
  const a = addPrim(world, playerId, SparkType.Line, x, y);
  const b = addPrim(world, playerId, SparkType.Line, x + 20, y);
  addBond(world, b, a);
}

function duel(): World {
  const w = makeWorld(0); // seats P0
  w.gameMode = '1v1';
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1], { x: 1400, y: 540 }));
  w.scoreByPlayer.set(P1, 0);
  return w;
}

describe('S76 scoring — computeComplexity', () => {
  it('empty world → 0', () => {
    expect(computeComplexity(makeWorld(0), P0)).toBe(0);
  });

  it('isolated primitives count at SCORE_ANCHOR each', () => {
    const w = makeWorld(0);
    addPrim(w, P0, SparkType.Dot, 200, 200);
    addPrim(w, P0, SparkType.Dot, 260, 200);
    expect(computeComplexity(w, P0)).toBe(2 * SCORE_ANCHOR);
  });

  it('a magic bond adds MAGIC_PREMIUM; a functional bond is neutral', () => {
    const wMagic = makeWorld(0);
    addBond(wMagic, addPrim(wMagic, P0, SparkType.Line, 220, 200), addPrim(wMagic, P0, SparkType.Line, 200, 200));
    expect(computeComplexity(wMagic, P0)).toBe(2 * SCORE_ANCHOR + MAGIC_PREMIUM); // 4

    const wFunc = makeWorld(0);
    addBond(wFunc, addPrim(wFunc, P0, SparkType.Dot, 220, 200), addPrim(wFunc, P0, SparkType.Dot, 200, 200));
    expect(computeComplexity(wFunc, P0)).toBe(2 * SCORE_ANCHOR); // 2 — connecting never lowers it
  });

  it('attributes per-owner: one player\'s structure is not counted for another', () => {
    const w = duel();
    buildMagicPair(w, P0, 200, 200);   // P0 → 4
    buildMagicPair(w, P1, 1400, 540);  // P1 → 4
    addPrim(w, P0, SparkType.Dot, 300, 300); // P0 +1 isolated
    expect(computeComplexity(w, P0)).toBe(5);
    expect(computeComplexity(w, P1)).toBe(4);
  });
});

describe('S76 scoring — tickScoring income', () => {
  it('accrues rate × complexity / PHYSICS_HZ per tick', () => {
    const w = makeWorld(0);
    buildMagicPair(w, P0, 200, 200); // complexity 4
    tickScoring(w);
    expect(w.scoreByPlayer.get(P0)).toBeCloseTo(4 * PER_TICK, 9);
    expect(w.scoreProgress).toBeCloseTo(4 * PER_TICK, 9);
  });

  it('scoreProgress = max(scoreByPlayer); a bigger structure earns faster', () => {
    const w = duel();
    buildMagicPair(w, P0, 200, 200);          // P0 complexity 4
    addPrim(w, P1, SparkType.Dot, 1400, 540); // P1 complexity 1
    for (let t = 0; t < 100; t++) tickScoring(w);
    const s0 = w.scoreByPlayer.get(P0)!;
    const s1 = w.scoreByPlayer.get(P1)!;
    expect(s0).toBeGreaterThan(s1);
    expect(w.scoreProgress).toBe(Math.max(s0, s1));
  });

  it('CONSISTENCY (#3b): identical structures accrue identical score — player-1 is not special', () => {
    const w = duel();
    buildMagicPair(w, P0, 200, 200);
    buildMagicPair(w, P1, 1400, 540);
    for (let t = 0; t < 250; t++) tickScoring(w);
    expect(w.scoreByPlayer.get(P0)).toBeCloseTo(w.scoreByPlayer.get(P1)!, 9);
  });

  it('zero complexity → zero income (you must keep structure standing to progress)', () => {
    const w = makeWorld(0);
    for (let t = 0; t < 100; t++) tickScoring(w);
    expect(w.scoreProgress).toBe(0);
  });

  it('deterministic: identical builds + tick counts → identical scoreProgress', () => {
    const run = (): number => {
      nextId = 1000;
      const w = makeWorld(0);
      buildMagicPair(w, P0, 200, 200);
      for (let t = 0; t < 300; t++) tickScoring(w);
      return w.scoreProgress;
    };
    expect(run()).toBe(run());
  });
});

describe('S76 scoring — unified addScore (no solo/networked split)', () => {
  it('solo: scoreProgress = the single player\'s score', () => {
    const w = makeWorld(0);
    addScore(w, P0, 5);
    expect(w.scoreByPlayer.get(P0)).toBe(5);
    expect(w.scoreProgress).toBe(5);
  });

  it('multi: scoreProgress = max across players (identical rule for every seat)', () => {
    const w = duel();
    addScore(w, P0, 5);
    addScore(w, P1, 9);
    expect(w.scoreProgress).toBe(9);
    addScore(w, P0, 7); // P0 → 12, becomes leader
    expect(w.scoreProgress).toBe(12);
  });
});
