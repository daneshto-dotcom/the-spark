/**
 * SPARK — S153 P1: unit-first navigation, arrival spread and the castle march (owner R82/R83/R85).
 *
 * ⭐ WHY THIS FILE EXISTS AT ALL. The change it guards altered how every goblin in the game chooses
 * where to walk, and the full 2970-test suite stayed green through it. That is not luck — it is
 * structural. All three determinism gates in this repo are SELF-COMPARING (host vs worker, run vs
 * re-run), so they prove the sim agrees with itself, never that it agrees with the design. A
 * targeting change is exactly the class of edit that lands silently.
 *
 * The Council asked for a golden-hash pin on an exact tick to close that hole. Rejected: every
 * existing gate is deliberately self-comparing, and a hardcoded `expect(tick).toBe(145)` is a
 * tripwire that fires on any unrelated tuning change. What is asserted here instead is the
 * ORDERING PROPERTY the owner actually asked for, which is stable under retuning.
 *
 * ⚠ EVERY BEHAVIOURAL TEST BELOW ASSERTS BOTH HALVES. "A goblin walks to the unit" is also
 * satisfied by a goblin that has stopped targeting structures entirely — so each case is paired
 * with its negative. A one-sided assertion on a priority change is not evidence (S152 A1).
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../../constants.ts';
import {
  GOBLIN_SPREAD_RADIUS,
  GOBLIN_UNIT_ACQUIRE_RADIUS,
  GOBLIN_UNIT_LEASH_RADIUS,
} from '../../constants.ts';
import { asPlayerId } from '../../types.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../world.ts';
import { distSq, enemyCastleMarchPos, pickNavUnit, spreadTargetPos } from './creatureAI.ts';
import { applyCreatureTick } from './creatureLifecycle.ts';
import { asCreatureId, makeCreature, type Creature } from './creature.ts';
import { GOBLIN_MELEE_CONFIG } from './voltkin-config.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function setupWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

function addGoblin(world: World, id: number, owner: typeof P0, x: number, y: number): Creature {
  const c = makeCreature(GOBLIN_MELEE_CONFIG, {
    id: asCreatureId(id),
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
    sourceSpawnerId: null,
  });
  world.creatures.set(c.id, c);
  return c;
}

/*
 * ⚠ THE STRUCTURE HALF IS PINNED ELSEWHERE, ON PURPOSE. An addPrim helper stood here to assert
 * "no unit nearby -> still walks to the shape" through the real hostTick, but standing up a full
 * host tick needs the whole deps harness, and the selector it would exercise
 * (findNearestEnemyPrimitiveFrom) is ALREADY pinned four ways in goblin.test.ts, including the
 * no-own-target-fallback case. What is NOT unit-coverable cheaply is the steering wiring itself —
 * that is verified on the live site with a screenshot, because state is not pixels.
 */

const ACQ_SQ = GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS;
const LEASH_SQ = GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS;

describe('S153 P1 — pickNavUnit: acquisition, and the both-halves negative', () => {
  it('acquires an enemy unit INSIDE the acquire radius', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    const enemy = addGoblin(w, 2, P1, GOBLIN_UNIT_ACQUIRE_RADIUS - 20, 0);
    expect(pickNavUnit(w, goblin, null, ACQ_SQ, LEASH_SQ)).toBe(enemy.id);
  });

  it('acquires NOTHING when the only enemy unit is outside the acquire radius', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    addGoblin(w, 2, P1, GOBLIN_UNIT_ACQUIRE_RADIUS + 20, 0);
    // The negative half: without this, "always returns a unit" would pass the test above.
    expect(pickNavUnit(w, goblin, null, ACQ_SQ, LEASH_SQ)).toBeNull();
  });

  it('never acquires a FRIENDLY unit standing right on top of it', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    addGoblin(w, 2, P0, 5, 0); // same owner
    expect(pickNavUnit(w, goblin, null, ACQ_SQ, LEASH_SQ)).toBeNull();
  });
});

describe('S153 P1 — the hysteresis dead-band is what stops the 60 Hz pirouette', () => {
  it('HOLDS a locked quarry that has stepped past ACQUIRE but is still inside LEASH', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    // Between the two radii — the dead band. A single-radius design drops it here and the
    // goblin spins; the leash is the whole reason it does not.
    const mid = (GOBLIN_UNIT_ACQUIRE_RADIUS + GOBLIN_UNIT_LEASH_RADIUS) / 2;
    const quarry = addGoblin(w, 2, P1, mid, 0);
    expect(mid).toBeGreaterThan(GOBLIN_UNIT_ACQUIRE_RADIUS);
    expect(mid).toBeLessThan(GOBLIN_UNIT_LEASH_RADIUS);

    // Held → kept.
    expect(pickNavUnit(w, goblin, quarry.id, ACQ_SQ, LEASH_SQ)).toBe(quarry.id);
    // Not held → NOT acquired at that same distance. Both halves of the dead band.
    expect(pickNavUnit(w, goblin, null, ACQ_SQ, LEASH_SQ)).toBeNull();
  });

  it('DROPS a quarry that breaks the leash', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    const quarry = addGoblin(w, 2, P1, GOBLIN_UNIT_LEASH_RADIUS + 40, 0);
    expect(pickNavUnit(w, goblin, quarry.id, ACQ_SQ, LEASH_SQ)).toBeNull();
  });

  it('DROPS a quarry that has died, rather than holding a dangling id', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    const quarry = addGoblin(w, 2, P1, 40, 0);
    w.creatures.delete(quarry.id);
    expect(pickNavUnit(w, goblin, quarry.id, ACQ_SQ, LEASH_SQ)).toBeNull();
  });
});

describe('S153 P1 — spreadTargetPos: a squad arrives as an arc, not a pile', () => {
  it('puts each creature on the ring, at the configured radius', () => {
    const target = { x: 500, y: 300 };
    const a = spreadTargetPos(target, asCreatureId(1), GOBLIN_SPREAD_RADIUS);
    expect(Math.sqrt(distSq(target, a))).toBeCloseTo(GOBLIN_SPREAD_RADIUS, 6);
  });

  it('gives six consecutive ids six DISTINCT points (the anti-stack property)', () => {
    const target = { x: 0, y: 0 };
    const pts = [1, 2, 3, 4, 5, 6].map((i) =>
      spreadTargetPos(target, asCreatureId(i), GOBLIN_SPREAD_RADIUS),
    );
    const keys = new Set(pts.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`));
    expect(keys.size).toBe(6);
    // And no two are within a hair of each other — distinctness must be MEANINGFUL, not float noise.
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.sqrt(distSq(pts[i]!, pts[j]!))).toBeGreaterThan(1);
      }
    }
  });

  it('is a PURE function of the id — same input, same output, no tick and no draw', () => {
    const t = { x: 12, y: 34 };
    expect(spreadTargetPos(t, asCreatureId(9), GOBLIN_SPREAD_RADIUS)).toEqual(
      spreadTargetPos(t, asCreatureId(9), GOBLIN_SPREAD_RADIUS),
    );
  });
});

describe('S153 P1 — enemyCastleMarchPos (owner R85, the shipped half)', () => {
  it('returns an ENEMY seat anchor, never the goblin own seat anchor', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    const march = enemyCastleMarchPos(w, goblin);
    expect(march).not.toBeNull();
    const ownAnchor = enemyCastleMarchPos(w, addGoblin(w, 2, P1, 0, 0));
    // P0 marches on P1 keep and P1 marches on P0 keep — so the two must differ.
    expect(march).not.toEqual(ownAnchor);
  });

  it('returns null when there is no enemy seat at all', () => {
    const w = makeWorld(0);
    w.players.clear();
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
    const lonely = addGoblin(w, 1, P0, 0, 0);
    expect(enemyCastleMarchPos(w, lonely)).toBeNull();
  });
});

describe('S153 P1 — ⛔ the regression this change nearly shipped', () => {
  /*
   * The FSM used to enter ATTACKING on a bare `targetCreatureId !== null`, safe only because the
   * one writer range-gated to attackRange. Owner R83 makes a goblin hold a target 220 px away for
   * NAVIGATION, which would have fired that arm every tick: ATTACKING → re-validate → target
   * cleared → wind-up abort → SEEKING → re-acquire. A goblin that never walks and never swings,
   * with nothing red anywhere. These two cases pin the fix from both sides.
   */
  it('does NOT enter ATTACKING for a unit held at NAVIGATION distance', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    const quarry = addGoblin(w, 2, P1, GOBLIN_UNIT_ACQUIRE_RADIUS - 20, 0);
    goblin.state = 'SEEKING';
    goblin.ticksInState = 5;
    goblin.targetCreatureId = quarry.id; // acquired for navigation, far out of attackRange

    applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: goblin.id });

    expect(w.creatures.get(goblin.id)!.state).toBe('SEEKING');
  });

  it('DOES enter ATTACKING once that same unit is inside attackRange', () => {
    const w = setupWorld();
    const goblin = addGoblin(w, 1, P0, 0, 0);
    const quarry = addGoblin(w, 2, P1, GOBLIN_MELEE_CONFIG.attackRange - 5, 0);
    goblin.state = 'SEEKING';
    goblin.ticksInState = 5;
    goblin.targetCreatureId = quarry.id;

    applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: goblin.id });

    // The other half: the gate must still LET a real melee engagement through, or the "fix"
    // is just a goblin that never attacks anything.
    expect(w.creatures.get(goblin.id)!.state).toBe('ATTACKING');
  });
});
