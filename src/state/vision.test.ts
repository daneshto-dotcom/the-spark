/**
 * Tests for fog-of-war vision math (S57 P1).
 *
 * Direct world.primitives construction (no PLACE_PRIMITIVE dispatch) — the
 * vision functions are pure readers of world state, same pattern as
 * territory.test.ts. Covers: own-beacon-only enumeration, enemy concealment,
 * spawner always-visible, host/client symmetry, gating, and the win-lift tween.
 */

import { describe, it, expect } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import {
  computeVisionSources,
  isPointVisible,
  fogActive,
  fogTargetAlpha,
  stepFogAlpha,
} from './vision.ts';
import {
  R_PERSONAL,
  R_BEACON,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
} from '../constants.ts';
import { asPlayerId, asPrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';

// ─── test helpers ──────────────────────────────────────────────────────────

/** A 1v1 world in PLAYING, viewed from `localPlayerIndex`'s perspective. */
function make1v1(localPlayerIndex: 0 | 1): World {
  const world = makeWorld(0x57f0);
  dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: localPlayerIndex === 0 });
  world.localPlayerId = asPlayerId(localPlayerIndex);
  world.gameState = 'PLAYING';
  return world;
}

/** Insert a primitive at (x, y) owned by `playerIndex`, bypassing dispatch. */
function addPrimAt(world: World, playerIndex: 0 | 1, x: number, y: number): Primitive {
  const player = world.players.get(asPlayerId(playerIndex))!;
  const primId = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id: primId,
    type: SparkType.Square,
    placerColor: player.color,
    placedBy: player.id,
    createdTick: world.tick,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: player.color,
    lastOwnershipChange: 0,
    radius: 9,
  };
  world.primitives.set(primId, prim);
  return prim;
}

const cursor = (x: number, y: number) => ({ x, y });

// A far corner well outside the spawner zone + any default vision.
const FAR_CORNER = { x: 1850, y: 1000 };

// ─── computeVisionSources ───────────────────────────────────────────────────

describe('computeVisionSources', () => {
  it('always includes the spawner zone as a vision source', () => {
    const world = make1v1(0);
    const sources = computeVisionSources(world, cursor(100, 100));
    const spawner = sources.find(
      (s) => s.x === SPAWNER_CENTER_X && s.y === SPAWNER_CENTER_Y && s.radius === SPAWNER_RADIUS,
    );
    expect(spawner).toBeDefined();
  });

  it('includes a personal radius at the live cursor', () => {
    const world = make1v1(0);
    const sources = computeVisionSources(world, cursor(742, 318));
    const personal = sources.find((s) => s.x === 742 && s.y === 318 && s.radius === R_PERSONAL);
    expect(personal).toBeDefined();
  });

  it('emits exactly spawner + personal when no primitives exist', () => {
    const world = make1v1(0);
    expect(computeVisionSources(world, cursor(100, 100))).toHaveLength(2);
  });

  it('emits one R_BEACON source per OWN primitive', () => {
    const world = make1v1(0);
    addPrimAt(world, 0, 300, 300);
    addPrimAt(world, 0, 360, 300);
    addPrimAt(world, 0, 420, 300);
    const sources = computeVisionSources(world, cursor(100, 100));
    const beacons = sources.filter((s) => s.radius === R_BEACON);
    expect(beacons).toHaveLength(3);
    // spawner + personal + 3 beacons
    expect(sources).toHaveLength(5);
  });

  it('EXCLUDES enemy primitives (concealment)', () => {
    const world = make1v1(0); // I am player 0
    addPrimAt(world, 0, 300, 300); // mine
    addPrimAt(world, 1, 1600, 800); // enemy
    addPrimAt(world, 1, 1660, 800); // enemy
    const sources = computeVisionSources(world, cursor(100, 100));
    const beacons = sources.filter((s) => s.radius === R_BEACON);
    // only my 1 primitive becomes a beacon; the 2 enemy prims contribute none
    expect(beacons).toHaveLength(1);
    expect(beacons[0]).toMatchObject({ x: 300, y: 300 });
  });

  it('is symmetric: from player 1, player 1 owns the beacons and player 0 is excluded', () => {
    const world = make1v1(1); // I am player 1 (the client)
    addPrimAt(world, 0, 300, 300); // enemy (host)
    addPrimAt(world, 1, 1600, 800); // mine
    addPrimAt(world, 1, 1660, 800); // mine
    const beacons = computeVisionSources(world, cursor(100, 100)).filter(
      (s) => s.radius === R_BEACON,
    );
    expect(beacons).toHaveLength(2);
    expect(beacons.every((b) => b.x >= 1600)).toBe(true);
  });

  it('beacon is centered exactly on the owning primitive position', () => {
    const world = make1v1(0);
    addPrimAt(world, 0, 512, 678);
    const beacon = computeVisionSources(world, cursor(0, 0)).find((s) => s.radius === R_BEACON);
    expect(beacon).toEqual({ x: 512, y: 678, radius: R_BEACON });
  });
});

// ─── isPointVisible (concealment property) ───────────────────────────────────

describe('isPointVisible', () => {
  it('reveals my own structure but conceals the enemy far-corner base', () => {
    const world = make1v1(0);
    const mine = addPrimAt(world, 0, 300, 300);
    const enemy = addPrimAt(world, 1, FAR_CORNER.x, FAR_CORNER.y);
    // cursor parked on my base, far from the enemy
    const sources = computeVisionSources(world, cursor(300, 300));
    expect(isPointVisible(sources, mine.pos.x, mine.pos.y)).toBe(true);
    expect(isPointVisible(sources, enemy.pos.x, enemy.pos.y)).toBe(false);
  });

  it('reveals an enemy structure once the cursor cruises over it', () => {
    const world = make1v1(0);
    const enemy = addPrimAt(world, 1, FAR_CORNER.x, FAR_CORNER.y);
    // cruise the cursor onto the enemy base — personal radius now covers it
    const sources = computeVisionSources(world, cursor(FAR_CORNER.x, FAR_CORNER.y));
    expect(isPointVisible(sources, enemy.pos.x, enemy.pos.y)).toBe(true);
  });

  it('reveals an enemy structure sitting inside the always-visible spawner zone', () => {
    const world = make1v1(0);
    // enemy primitive near canvas center (inside spawner) — visible by design (§ IX.5)
    const enemy = addPrimAt(world, 1, SPAWNER_CENTER_X + 50, SPAWNER_CENTER_Y);
    const sources = computeVisionSources(world, cursor(0, 0));
    expect(isPointVisible(sources, enemy.pos.x, enemy.pos.y)).toBe(true);
  });

  it('treats the radius boundary as inclusive', () => {
    const sources = [{ x: 0, y: 0, radius: 100 }];
    expect(isPointVisible(sources, 100, 0)).toBe(true); // exactly on edge
    expect(isPointVisible(sources, 100.01, 0)).toBe(false); // just outside
  });
});

// ─── gating + win-lift ────────────────────────────────────────────────────────

describe('fogActive / fogTargetAlpha', () => {
  it('is active with full target alpha during 1v1 PLAYING', () => {
    const world = make1v1(0);
    expect(fogActive(world)).toBe(true);
    expect(fogTargetAlpha(world)).toBe(1);
  });

  it('is inactive in solo (no opponent to hide from)', () => {
    const world = makeWorld(0x1); // solo, PLAYING by default
    expect(world.gameMode).toBe('solo');
    expect(fogActive(world)).toBe(false);
    expect(fogTargetAlpha(world)).toBe(0);
  });

  it('LIFTS the fog on WIN and POSTGAME (reveal-all)', () => {
    const world = make1v1(0);
    world.gameState = 'WIN';
    expect(fogActive(world)).toBe(false);
    expect(fogTargetAlpha(world)).toBe(0);
    world.gameState = 'POSTGAME';
    expect(fogTargetAlpha(world)).toBe(0);
  });

  it('shows no active fog in 1v1 LOBBY/TITLE (pre-match board visible)', () => {
    const world = make1v1(0);
    world.gameState = 'LOBBY';
    expect(fogActive(world)).toBe(false);
    world.gameState = 'TITLE';
    expect(fogActive(world)).toBe(false);
  });
});

// ─── stepFogAlpha (pure tween) ───────────────────────────────────────────────

describe('stepFogAlpha', () => {
  it('snaps ON instantly when the target rises (match start)', () => {
    expect(stepFogAlpha(0, 1, 0.02)).toBe(1);
    expect(stepFogAlpha(0.5, 1, 0.02)).toBe(1);
  });

  it('fades OFF gradually by at most fadeStep per call (win lift)', () => {
    expect(stepFogAlpha(1, 0, 0.02)).toBeCloseTo(0.98, 5);
    expect(stepFogAlpha(0.98, 0, 0.02)).toBeCloseTo(0.96, 5);
  });

  it('clamps to the target without undershooting on the final step', () => {
    expect(stepFogAlpha(0.01, 0, 0.02)).toBe(0);
  });

  it('holds steady when already at the target', () => {
    expect(stepFogAlpha(1, 1, 0.02)).toBe(1);
    expect(stepFogAlpha(0, 0, 0.02)).toBe(0);
  });
});
