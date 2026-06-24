/**
 * SPARK — S100 P1 (TD Phase 1b) pentagram predicate + ignition tests.
 *
 * The owner's strict-gating requirement (PDR + design §2.5):
 *   - EXACTLY 5 triangles in a closed cycle ⇒ match
 *   - the same 5 + 1 extra primitive attached ⇒ NO match (componentOf follows every
 *     bond, so the extra shape lands in the component and breaks size/degree)
 *   - 4 triangles (one removed) ⇒ NO match
 * Plus the two-player + rebuild ignition path (design §2.5 R5): two players each
 * complete a pentagram → two spawners; destroy one → that player can rebuild.
 *
 * Fixture style mirrors voltkin.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../../types.ts';
import { SparkType } from '../../constants.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import {
  isPentagramComponent,
  findPentagramAnchor,
  findAllPentagramAnchors,
} from './pentagram.ts';
import {
  runGodlyMatcher,
  makeGodlyOrchestrationState,
  type GodlyOrchestrationCtx,
} from '../godlyOrchestration.ts';

function stubCtx(): GodlyOrchestrationCtx {
  return {
    netTransport: null,
    debugOverlay: null,
    debugProbes: { lastBondFormedTick: -1, bondFormedCount: 0, matcherFiredEver: false, lastMatcherTick: -1 },
  } as unknown as GodlyOrchestrationCtx;
}

function makePrim(
  id: number,
  color: number,
  x: number,
  y: number,
  type: SparkType = SparkType.Triangle,
): Primitive {
  return {
    id: asPrimitiveId(id),
    type,
    placerColor: color,
    placedBy: asPlayerId(0),
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: color,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

function addBond(world: World, id: number, aId: number, bId: number): void {
  const a = world.primitives.get(asPrimitiveId(aId))!;
  const b = world.primitives.get(asPrimitiveId(bId))!;
  const bond: Bond = {
    id: id as unknown as BondId,
    aId: asPrimitiveId(aId),
    bId: asPrimitiveId(bId),
    a,
    b,
    restLength: 50,
    stiffnessTier: 'MID',
    createdTick: 0,
  };
  world.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
}

function removeBond(world: World, id: number): void {
  const bond = world.bonds.get(asBondId(id));
  if (bond === undefined) return;
  world.primitives.get(bond.aId)?.bonds.delete(bond.id);
  world.primitives.get(bond.bId)?.bonds.delete(bond.id);
  world.bonds.delete(bond.id);
}

/** Exact 5-triangle closed ring at prim ids primBase..primBase+4, bonds bondBase..+4. */
function buildPentagram(world: World, color: number, primBase: number, bondBase: number): PrimitiveId {
  for (let i = 0; i < 5; i++) {
    world.primitives.set(
      asPrimitiveId(primBase + i),
      makePrim(primBase + i, color, (primBase + i) * 40, 0, SparkType.Triangle),
    );
  }
  for (let i = 0; i < 5; i++) {
    addBond(world, bondBase + i, primBase + i, primBase + ((i + 1) % 5));
  }
  return asPrimitiveId(primBase);
}

describe('isPentagramComponent — strict exact-5-triangle-cycle predicate', () => {
  let world: World;
  let color: number;
  beforeEach(() => {
    world = makeWorld(1);
    color = world.players.get(asPlayerId(0))!.color;
  });

  it('MATCHES exactly 5 triangles in a closed cycle', () => {
    const anchor = buildPentagram(world, color, 0, 0);
    expect(isPentagramComponent(world, anchor)).toBe(true);
    // every ring member seeds the same match (anchor is the lowest id).
    for (let i = 0; i < 5; i++) {
      expect(isPentagramComponent(world, asPrimitiveId(i))).toBe(true);
    }
    expect(findPentagramAnchor(world)).toBe(asPrimitiveId(0));
  });

  it('S102 #7 — sever a closing connector → no match (spawner removed) → re-place it → matches again (rebuild)', () => {
    const anchor = buildPentagram(world, color, 0, 0);
    expect(isPentagramComponent(world, anchor)).toBe(true);
    // an enemy raids/severs the closing connector → the ring opens → the predicate fails,
    // so the re-validation poll removes the spawner (income + swarm STOP). This is the counterplay.
    removeBond(world, 4); // bond 4 closes prim 4 -> prim 0
    expect(isPentagramComponent(world, anchor)).toBe(false);
    // the owner REBUILDS by re-placing that connector → the exact pentagram stands again → the
    // predicate matches, so the next topology change re-ignites a fresh spawner (owner item #7).
    addBond(world, 4, 4, 0);
    expect(isPentagramComponent(world, anchor)).toBe(true);
  });

  it('NO match with the same 5 + 1 extra primitive attached (component grows past 5)', () => {
    const anchor = buildPentagram(world, color, 0, 0);
    expect(isPentagramComponent(world, anchor)).toBe(true);
    // Attach a 6th primitive to triangle 0 (a triangle, so the failure is purely
    // the size/degree change, not a non-triangle type).
    world.primitives.set(asPrimitiveId(5), makePrim(5, color, -40, 0, SparkType.Triangle));
    addBond(world, 10, 0, 5);
    expect(isPentagramComponent(world, anchor)).toBe(false);
    expect(findPentagramAnchor(world)).toBeNull();
  });

  it('NO match with 4 triangles (one removed)', () => {
    const anchor = buildPentagram(world, color, 0, 0);
    // Remove triangle 2 + its two ring bonds (bond 1: 1→2, bond 2: 2→3).
    removeBond(world, 1);
    removeBond(world, 2);
    world.primitives.delete(asPrimitiveId(2));
    expect(isPentagramComponent(world, anchor)).toBe(false);
    expect(findPentagramAnchor(world)).toBeNull();
  });

  it('NO match for a non-closed 5-triangle chain (open ends, degree-1 nodes)', () => {
    for (let i = 0; i < 5; i++) {
      world.primitives.set(asPrimitiveId(i), makePrim(i, color, i * 40, 0, SparkType.Triangle));
    }
    // linear 0-1-2-3-4 (NOT closed back to 0) → endpoints degree 1.
    for (let i = 0; i < 4; i++) addBond(world, i, i, i + 1);
    expect(isPentagramComponent(world, asPrimitiveId(0))).toBe(false);
  });

  it('NO match when a ring node is a non-triangle', () => {
    buildPentagram(world, color, 0, 0);
    // Swap prim 3 to a Square in place.
    const p3 = world.primitives.get(asPrimitiveId(3))!;
    world.primitives.set(asPrimitiveId(3), { ...p3, type: SparkType.Square });
    expect(isPentagramComponent(world, asPrimitiveId(0))).toBe(false);
  });
});

describe('findAllPentagramAnchors — disjoint rings, ascending order', () => {
  it('enumerates two disjoint pentagrams by ascending anchor id', () => {
    const world = makeWorld(1);
    const color = world.players.get(asPlayerId(0))!.color;
    buildPentagram(world, color, 0, 0); // anchor 0
    buildPentagram(world, color, 10, 20); // anchor 10
    expect(findAllPentagramAnchors(world)).toEqual([asPrimitiveId(0), asPrimitiveId(10)]);
  });
});

describe('runGodlyMatcher — two-player ignition + rebuild after destroy (R5)', () => {
  function buildTwoPlayerWorld(): { world: World; c0: number; c1: number } {
    const world = makeWorld(1);
    world.isHost = true;
    world.tick = 100;
    const p1 = makeIdlePlayer(asPlayerId(1), 0x00ff00);
    world.players.set(p1.id, p1);
    const c0 = world.players.get(asPlayerId(0))!.color;
    const c1 = world.players.get(asPlayerId(1))!.color;
    // Player 0's pentagram: prims 0..4 / bonds 0..4. Player 1's: prims 10..14 / bonds 20..24.
    buildPentagram(world, c0, 0, 0);
    buildPentagram(world, c1, 10, 20);
    return { world, c0, c1 };
  }

  it('two players each completing a pentagram → two spawners (one per player/anchor)', () => {
    const { world } = buildTwoPlayerWorld();
    // A topology change is required for ignition to scan; ignition is single-per-frame
    // (lowest-anchor first), so run the matcher twice with a fresh BOND_FORMED each.
    world.effects.push({ kind: 'BOND_FORMED', tick: 100, pos: { x: 0, y: 0 }, bondCount: 1 });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.creatureSpawners.size).toBe(1);

    world.effects.length = 0;
    world.effects.push({ kind: 'BOND_FORMED', tick: 101, pos: { x: 0, y: 0 }, bondCount: 1 });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.creatureSpawners.size).toBe(2);

    const anchors = [...world.creatureSpawners.values()].map((s) => s.anchorPrimitiveId).sort((a, b) => a - b);
    expect(anchors).toEqual([asPrimitiveId(0), asPrimitiveId(10)]);
    const owners = [...world.creatureSpawners.values()].map((s) => s.ownerPlayerId).sort((a, b) => a - b);
    expect(owners).toEqual([asPlayerId(0), asPlayerId(1)]);
  });

  it('an already-live anchor is NOT re-registered (per-(player,anchor) live-map de-dup)', () => {
    const { world } = buildTwoPlayerWorld();
    // Remove player 1's pentagram so only anchor 0 qualifies.
    for (const bid of [20, 21, 22, 23, 24]) removeBond(world, bid);
    for (let i = 10; i < 15; i++) world.primitives.delete(asPrimitiveId(i));

    world.effects.push({ kind: 'BOND_FORMED', tick: 100, pos: { x: 0, y: 0 }, bondCount: 1 });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.creatureSpawners.size).toBe(1);

    // Run again on a new topology change — the anchor is already a live spawner, so no dup.
    world.effects.length = 0;
    world.effects.push({ kind: 'BOND_FORMED', tick: 102, pos: { x: 0, y: 0 }, bondCount: 1 });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.creatureSpawners.size).toBe(1);
  });

  it('destroy one player\'s spawner → that player can rebuild (not blocked by godlyFiredThisMatch)', () => {
    const { world } = buildTwoPlayerWorld();
    // Ignite player 0's pentagram (anchor 0).
    for (const bid of [20, 21, 22, 23, 24]) removeBond(world, bid);
    for (let i = 10; i < 15; i++) world.primitives.delete(asPrimitiveId(i));
    world.effects.push({ kind: 'BOND_FORMED', tick: 100, pos: { x: 0, y: 0 }, bondCount: 1 });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.creatureSpawners.size).toBe(1);
    const firstId = [...world.creatureSpawners.keys()][0];

    // RAID: destroy the spawner (as the re-validation poll would on a broken shape).
    world.creatureSpawners.delete(firstId);
    expect(world.creatureSpawners.size).toBe(0);

    // The exact pentagram still stands → a new topology change re-ignites it. The
    // per-type godlyFiredThisMatch gate must NOT block this (spawner recipes excluded).
    world.effects.length = 0;
    world.effects.push({ kind: 'BOND_SEVERED', tick: 110, pos: { x: 0, y: 0 }, cause: 'player' });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.creatureSpawners.size).toBe(1);
    expect([...world.creatureSpawners.values()][0].anchorPrimitiveId).toBe(asPrimitiveId(0));
  });
});
