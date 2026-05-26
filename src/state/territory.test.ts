/**
 * Tests for territorial repulsion system (Sym F, S49 P1).
 *
 * Direct world.primitives/bonds construction (no dispatch) because:
 *  - territory.ts functions are pure readers of world state
 *  - We need fine-grained spatial control impossible via PLACE_PRIMITIVE
 *    (which would itself gate on territory after this PR lands)
 *  - Pattern validated by session13.test.ts auxiliary primitives
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import {
  computePlayerComplexity,
  computeTerritorialRadius,
  isInsideEnemyTerritory,
  computeTerritorialInfluence,
} from './territory.ts';
import {
  TERRITORY_BASE_RADIUS,
  TERRITORY_ENGULF_STIFFNESS,
  TERRITORY_SHRINK_DURATION_TICKS,
  SparkType,
} from '../constants.ts';
import { asPlayerId, asPrimitiveId, asBondId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';

// ─── test helpers ──────────────────────────────────────────────────────────

/**
 * Directly insert a primitive at (x, y) with the given player color into the
 * world without going through dispatch. Safe for territory.ts unit tests
 * because the functions are pure readers of world.primitives + world.players.
 */
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

/**
 * Directly insert a bond between two primitives without going through dispatch.
 */
function bondPrims(world: World, a: Primitive, b: Primitive): void {
  const bondId = asBondId(world.nextBondId++);
  const bond = {
    id: bondId,
    aId: a.id,
    bId: b.id,
    a: a as unknown as import('../physics/bonds.ts').PhysicsBody & { id: never },
    b: b as unknown as import('../physics/bonds.ts').PhysicsBody & { id: never },
    restLength: Math.max(20, Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y)),
    stiffnessTier: 'MID' as const,
    createdTick: world.tick,
  };
  // Cast: Bond interface requires PhysicsBody for a/b; Primitive satisfies the
  // shape (has pos/prevPos). The cast is safe for territory unit tests which
  // only read pos from bond.a/bond.b.
  world.bonds.set(bondId, bond as Parameters<typeof world.bonds.set>[1]);
  a.bonds.add(bondId);
  b.bonds.add(bondId);
}

// ─── shared setup ──────────────────────────────────────────────────────────

let world: World;

function setupWorld(): World {
  const w = makeWorld(42);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  return w;
}

// ───────────────────────────────────────────────────────────────────────────

describe('computePlayerComplexity', () => {
  beforeEach(() => { world = setupWorld(); });

  it('returns 0 when player has no primitives', () => {
    expect(computePlayerComplexity(asPlayerId(0), world)).toBe(0);
  });

  it('1 isolated prim → complexity = 1 + 0 + 0.1×1 = 1.1', () => {
    addPrimAt(world, 0, 200, 200);
    expect(computePlayerComplexity(asPlayerId(0), world)).toBeCloseTo(1.1, 5);
  });

  it('2 bonded prims (1 bond, 1 component) → complexity = 2 + 0.5 + 0.1 = 2.6', () => {
    const p1 = addPrimAt(world, 0, 200, 200);
    const p2 = addPrimAt(world, 0, 260, 200);
    bondPrims(world, p1, p2);
    expect(computePlayerComplexity(asPlayerId(0), world)).toBeCloseTo(2.6, 5);
  });

  it('2 isolated prims (2 components) → complexity = 2 + 0 + 0.1×2 = 2.2', () => {
    addPrimAt(world, 0, 200, 200);
    addPrimAt(world, 0, 900, 900); // far away, no bond
    expect(computePlayerComplexity(asPlayerId(0), world)).toBeCloseTo(2.2, 5);
  });

  it('does not count enemy primitives', () => {
    addPrimAt(world, 0, 200, 200); // P1
    addPrimAt(world, 1, 800, 200); // P2's prim — must be ignored
    expect(computePlayerComplexity(asPlayerId(0), world)).toBeCloseTo(1.1, 5);
  });

  it('cross-player bonds are not counted for either player', () => {
    // Sym D invariant: cross-color bonds cannot exist in production.
    // Verify complexity ignores bonds between differently-colored prims.
    const p1 = addPrimAt(world, 0, 200, 200);
    const p2 = addPrimAt(world, 1, 260, 200);
    bondPrims(world, p1, p2); // artificial cross-color bond
    // P1 complexity: 1 prim, 0 same-color bonds (bond endpoints differ in color)
    expect(computePlayerComplexity(asPlayerId(0), world)).toBeCloseTo(1.1, 5);
  });
});

describe('computeTerritorialRadius', () => {
  beforeEach(() => { world = setupWorld(); });

  it('returns 0 when player has no primitives', () => {
    expect(computeTerritorialRadius(asPlayerId(0), world)).toBe(0);
  });

  it('returns at least TERRITORY_BASE_RADIUS once any primitive placed', () => {
    addPrimAt(world, 0, 200, 200);
    expect(computeTerritorialRadius(asPlayerId(0), world)).toBeGreaterThanOrEqual(TERRITORY_BASE_RADIUS);
  });

  it('radius grows monotonically with complexity', () => {
    addPrimAt(world, 0, 200, 200);
    const r1 = computeTerritorialRadius(asPlayerId(0), world);
    const p2 = addPrimAt(world, 0, 260, 200);
    const p3 = addPrimAt(world, 0, 320, 200);
    // Add bond between first two prims (p2 and the first prim)
    const first = world.primitives.values().next().value as Primitive;
    bondPrims(world, first, p2);
    bondPrims(world, p2, p3);
    const r2 = computeTerritorialRadius(asPlayerId(0), world);
    expect(r2).toBeGreaterThan(r1);
  });

  it('halves radius while shrink debuff is active', () => {
    addPrimAt(world, 0, 200, 200);
    const rNormal = computeTerritorialRadius(asPlayerId(0), world);
    const player = world.players.get(asPlayerId(0))!;
    player.territorialShrinkUntilTick = world.tick + TERRITORY_SHRINK_DURATION_TICKS;
    const rShrunk = computeTerritorialRadius(asPlayerId(0), world);
    expect(rShrunk).toBeCloseTo(rNormal * 0.5, 5);
  });

  it('restores full radius once debuff tick has passed', () => {
    addPrimAt(world, 0, 200, 200);
    const rNormal = computeTerritorialRadius(asPlayerId(0), world);
    const player = world.players.get(asPlayerId(0))!;
    player.territorialShrinkUntilTick = world.tick - 1; // already expired
    const rRestored = computeTerritorialRadius(asPlayerId(0), world);
    expect(rRestored).toBeCloseTo(rNormal, 5);
  });
});

describe('isInsideEnemyTerritory', () => {
  beforeEach(() => { world = setupWorld(); });

  it('returns false when enemy has no primitives', () => {
    expect(isInsideEnemyTerritory({ x: 800, y: 500 }, asPlayerId(0), world)).toBe(false);
  });

  it('returns true for pos strictly within enemy R', () => {
    addPrimAt(world, 1, 800, 500);
    const R = computeTerritorialRadius(asPlayerId(1), world);
    const insidePos = { x: 800 + R * 0.5, y: 500 };
    expect(isInsideEnemyTerritory(insidePos, asPlayerId(0), world)).toBe(true);
  });

  it('returns false for pos strictly outside enemy R', () => {
    addPrimAt(world, 1, 800, 500);
    const R = computeTerritorialRadius(asPlayerId(1), world);
    const outsidePos = { x: 800 + R * 2, y: 500 };
    expect(isInsideEnemyTerritory(outsidePos, asPlayerId(0), world)).toBe(false);
  });

  it('returns false for own territory (same-player)', () => {
    addPrimAt(world, 0, 200, 200);
    // Checking from P1's perspective: P1's own territory is not "enemy"
    expect(isInsideEnemyTerritory({ x: 200, y: 200 }, asPlayerId(0), world)).toBe(false);
  });

  it('shrunk enemy territory excludes previously-inside positions', () => {
    addPrimAt(world, 1, 800, 500);
    const R = computeTerritorialRadius(asPlayerId(1), world);
    // pos between R/2 and R — inside normal territory, outside shrunk territory
    const borderPos = { x: 800 + R * 0.7, y: 500 };
    expect(isInsideEnemyTerritory(borderPos, asPlayerId(0), world)).toBe(true);
    // Now shrink P2's territory
    const enemy = world.players.get(asPlayerId(1))!;
    enemy.territorialShrinkUntilTick = world.tick + TERRITORY_SHRINK_DURATION_TICKS;
    expect(isInsideEnemyTerritory(borderPos, asPlayerId(0), world)).toBe(false);
  });
});

describe('computeTerritorialInfluence', () => {
  beforeEach(() => { world = setupWorld(); });

  it('resets stale stiffnessMultiplier to 1.0 when no territory active', () => {
    const p1 = addPrimAt(world, 0, 200, 200);
    const p2 = addPrimAt(world, 0, 260, 200);
    bondPrims(world, p1, p2);
    const bond = world.bonds.values().next().value!;
    bond.stiffnessMultiplier = 0.1; // simulate stale value
    computeTerritorialInfluence(world);
    expect(bond.stiffnessMultiplier).toBe(1.0);
  });

  it('degrades enemy bond whose endpoint is inside territorial radius', () => {
    // P1 anchors territory at (200, 200)
    addPrimAt(world, 0, 200, 200);
    const R = computeTerritorialRadius(asPlayerId(0), world);

    // P2 has two prims bonded together, with first endpoint inside P1's R
    const ep1 = addPrimAt(world, 1, 200 + R * 0.3, 200); // inside
    const ep2 = addPrimAt(world, 1, 200 + R * 0.55, 200); // also inside
    bondPrims(world, ep1, ep2);
    const enemyBond = world.bonds.values().next().value!;

    computeTerritorialInfluence(world);
    expect(enemyBond.stiffnessMultiplier).toBe(TERRITORY_ENGULF_STIFFNESS);
  });

  it('does not degrade friendly bond inside own territory', () => {
    const fp1 = addPrimAt(world, 0, 200, 200);
    const fp2 = addPrimAt(world, 0, 260, 200);
    bondPrims(world, fp1, fp2);
    const friendlyBond = world.bonds.values().next().value!;

    computeTerritorialInfluence(world);
    expect(friendlyBond.stiffnessMultiplier).toBe(1.0);
  });

  it('does not degrade enemy bond clearly outside territory', () => {
    addPrimAt(world, 0, 200, 200);
    const R = computeTerritorialRadius(asPlayerId(0), world);
    // P2's prims far outside P1's R
    const ep1 = addPrimAt(world, 1, 200 + R * 4, 200);
    const ep2 = addPrimAt(world, 1, 200 + R * 5, 200);
    bondPrims(world, ep1, ep2);
    const enemyBond = world.bonds.values().next().value!;

    computeTerritorialInfluence(world);
    expect(enemyBond.stiffnessMultiplier).toBe(1.0);
  });

  it('stays at ENGULF level when bond spans two overlapping territories', () => {
    // Both P1 and P2 have primitives close together (territories overlap)
    addPrimAt(world, 0, 200, 200);
    addPrimAt(world, 1, 300, 200);
    const R1 = computeTerritorialRadius(asPlayerId(0), world);

    // P2's bond endpoint inside P1's territory
    const ep1 = addPrimAt(world, 1, 200 + R1 * 0.4, 200);
    const ep2 = addPrimAt(world, 1, 200 + R1 * 0.6, 200);
    bondPrims(world, ep1, ep2);

    computeTerritorialInfluence(world);
    // The bond between P2's ep1 and ep2 should be degraded by P1's territory
    // (we find it by looking for bonds owned by P2 = both endpoints have P2's color)
    const p2Color = world.players.get(asPlayerId(1))!.color;
    let found = false;
    for (const bond of world.bonds.values()) {
      const primA = world.primitives.get(bond.aId);
      const primB = world.primitives.get(bond.bId);
      if (primA?.placerColor === p2Color && primB?.placerColor === p2Color) {
        expect(bond.stiffnessMultiplier).toBe(TERRITORY_ENGULF_STIFFNESS);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});
