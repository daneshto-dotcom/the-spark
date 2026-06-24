/**
 * SPARK — S100 P1 (TD Phase 1a/1b) spawner lifecycle + teardown-parity tests.
 *
 * Covers the PDR acceptance gates for the spawner subsystem:
 *   - REGISTER_SPAWNER mints a SpawnerId, seeds the cadence (first chewer after one
 *     SPAWN_INTERVAL), and de-dups a duplicate anchor.
 *   - REMOVE_SPAWNER deletes the record (idempotent on a missing id).
 *   - recipeStillSatisfied re-validates the CURRENT component (a removed-triangle
 *     pentagram fails; an exact pentagram passes), so the throttled re-validation
 *     poll's teardown branch fires when the anchor's shape is broken.
 *   - teardownSpawners clears the map + resets nextSpawnerId, wired into ALL FOUR
 *     teardown sites (WIN_TRIGGER, START_GAME, RETURN_TO_TITLE, GODLY_ABORT).
 *
 * Fixture style mirrors voltkin.test.ts (hand-built primitives + bonds with mirrored
 * adjacency) and creatureLifecycle.test.ts (dispatch + direct reducer calls).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, makeWorld, type World } from '../world.ts';
import {
  applyRegisterSpawner,
  applyRemoveSpawner,
  recipeStillSatisfied,
  teardownSpawners,
} from './spawnerLifecycle.ts';
import { makeSpawner } from './spawner.ts';
import { SparkType } from '../../constants.ts';
import { SPAWN_INTERVAL_TICKS } from '../../constants.ts';
import {
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type BondId,
  type PrimitiveId,
} from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { makeIdlePlayer } from '../../game/player.ts';

const P0_COLOR = 0xff0000;

function makePrim(id: number, x: number, y: number, type: SparkType = SparkType.Triangle): Primitive {
  return {
    id: asPrimitiveId(id),
    type,
    placerColor: P0_COLOR,
    placedBy: asPlayerId(0),
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: P0_COLOR,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

function addPrim(world: World, prim: Primitive): void {
  world.primitives.set(prim.id, prim);
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

/**
 * Build an exact 5-triangle closed pentagram ring (prims 0..4, bonds 0..4 closing
 * 4→0). Returns the anchor (lowest prim id = 0). Bond ids are offset by `bondBase`
 * so multiple rings in one world don't collide.
 */
function buildPentagram(world: World, primBase: number, bondBase: number): PrimitiveId {
  for (let i = 0; i < 5; i++) {
    addPrim(world, makePrim(primBase + i, (primBase + i) * 40, 0, SparkType.Triangle));
  }
  for (let i = 0; i < 5; i++) {
    addBond(world, bondBase + i, primBase + i, primBase + ((i + 1) % 5));
  }
  return asPrimitiveId(primBase);
}

describe('applyRegisterSpawner / applyRemoveSpawner', () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld(1);
  });

  it('mints a SpawnerId and seeds the cadence one SPAWN_INTERVAL out', () => {
    world.tick = 500;
    const anchor = asPrimitiveId(7);
    applyRegisterSpawner(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
    });
    expect(world.creatureSpawners.size).toBe(1);
    expect(world.nextSpawnerId).toBe(1);
    const sp = world.creatureSpawners.get(asSpawnerId(0))!;
    expect(sp.anchorPrimitiveId).toBe(anchor);
    expect(sp.ownerPlayerId).toBe(asPlayerId(0));
    expect(sp.recipeId).toBe('pentagram');
    expect(sp.ignitedAtTick).toBe(500);
    expect(sp.nextSpawnTick).toBe(500 + SPAWN_INTERVAL_TICKS);
    expect(sp.lastValidatedTick).toBe(500);
    expect(sp.spawnedCount).toBe(0);
  });

  it('de-dups a duplicate anchor (no double-register on the same primitive)', () => {
    const anchor = asPrimitiveId(3);
    applyRegisterSpawner(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
    });
    applyRegisterSpawner(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
    });
    expect(world.creatureSpawners.size).toBe(1);
    expect(world.nextSpawnerId).toBe(1); // not bumped on the rejected register
  });

  it('REMOVE_SPAWNER deletes the record; idempotent on a missing id', () => {
    applyRegisterSpawner(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: asPrimitiveId(1),
      recipeId: 'pentagram',
    });
    const id = asSpawnerId(0);
    applyRemoveSpawner(world, { type: 'REMOVE_SPAWNER', spawnerId: id });
    expect(world.creatureSpawners.has(id)).toBe(false);
    // Missing-id removal is a no-op (no throw).
    expect(() =>
      applyRemoveSpawner(world, { type: 'REMOVE_SPAWNER', spawnerId: asSpawnerId(99) }),
    ).not.toThrow();
  });
});

describe('recipeStillSatisfied — re-validation predicate (the counterplay)', () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld(1);
  });

  it('true for an exact pentagram anchor', () => {
    const anchor = buildPentagram(world, 0, 0);
    const sp = makeSpawner({
      id: asSpawnerId(0),
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
      ignitedAtTick: 0,
      nextSpawnTick: SPAWN_INTERVAL_TICKS,
    });
    expect(recipeStillSatisfied(world, sp)).toBe(true);
  });

  it('false after a triangle is removed (shape reduced below the ring)', () => {
    const anchor = buildPentagram(world, 0, 0);
    const sp = makeSpawner({
      id: asSpawnerId(0),
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
      ignitedAtTick: 0,
      nextSpawnTick: SPAWN_INTERVAL_TICKS,
    });
    // Remove triangle 2 + its two ring bonds (1→2, 2→3).
    const p2 = world.primitives.get(asPrimitiveId(2))!;
    for (const bid of [...p2.bonds]) {
      const bond = world.bonds.get(bid)!;
      world.primitives.get(bond.aId)?.bonds.delete(bid);
      world.primitives.get(bond.bId)?.bonds.delete(bid);
      world.bonds.delete(bid);
    }
    world.primitives.delete(asPrimitiveId(2));
    expect(recipeStillSatisfied(world, sp)).toBe(false);
  });

  it('false when the anchor primitive itself is gone', () => {
    const anchor = buildPentagram(world, 0, 0);
    const sp = makeSpawner({
      id: asSpawnerId(0),
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
      ignitedAtTick: 0,
      nextSpawnTick: SPAWN_INTERVAL_TICKS,
    });
    world.primitives.delete(anchor);
    expect(recipeStillSatisfied(world, sp)).toBe(false);
  });
});

describe('REGISTER/REMOVE dispatch + throttled re-validation removal (anchor vanishes)', () => {
  it('a registered spawner is torn down by the host re-validation poll model when its anchor vanishes', () => {
    // This exercises the reducer half of the poll: the main.ts poll detects
    // !recipeStillSatisfied and dispatches REMOVE_SPAWNER. We simulate that here
    // (the poll itself is wired in main.ts and uses lastValidatedTick throttle).
    const world = makeWorld(1);
    const anchor = buildPentagram(world, 0, 0);
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
    });
    const id = asSpawnerId(0);
    expect(world.creatureSpawners.has(id)).toBe(true);

    // Break the shape (delete the anchor) — recipeStillSatisfied now false.
    world.primitives.delete(anchor);
    const sp = world.creatureSpawners.get(id)!;
    expect(recipeStillSatisfied(world, sp)).toBe(false);

    // Poll's teardown branch.
    dispatch(world, { type: 'REMOVE_SPAWNER', spawnerId: id });
    expect(world.creatureSpawners.has(id)).toBe(false);
  });

  it('lastValidatedTick gates the re-validation cadence (the throttle field is per-spawner)', () => {
    const world = makeWorld(1);
    const anchor = buildPentagram(world, 0, 0);
    world.tick = 1000;
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
    });
    const sp = world.creatureSpawners.get(asSpawnerId(0))!;
    // lastValidatedTick is seeded to ignitedAtTick so the first re-validation runs
    // one throttle window later (the poll compares world.tick - lastValidatedTick).
    expect(sp.lastValidatedTick).toBe(1000);
  });
});

describe('teardownSpawners — all four teardown sites', () => {
  function registerOne(world: World): void {
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: asPlayerId(0),
      anchorPrimitiveId: asPrimitiveId(1),
      recipeId: 'pentagram',
    });
  }

  it('direct teardownSpawners clears the map + resets nextSpawnerId', () => {
    const world = makeWorld(1);
    registerOne(world);
    registerOne(world); // de-dup'd (same anchor), but nextSpawnerId already 1
    expect(world.creatureSpawners.size).toBe(1);
    teardownSpawners(world);
    expect(world.creatureSpawners.size).toBe(0);
    expect(world.nextSpawnerId).toBe(0);
  });

  it('site 1 — WIN_TRIGGER clears spawners', () => {
    const world = makeWorld(1);
    registerOne(world);
    dispatch(world, { type: 'WIN_TRIGGER', winnerId: asPlayerId(0) });
    expect(world.creatureSpawners.size).toBe(0);
    expect(world.nextSpawnerId).toBe(0);
  });

  it('site 2 + 3 — START_GAME and RETURN_TO_TITLE clear spawners', () => {
    const wStart = makeWorld(1);
    registerOne(wStart);
    dispatch(wStart, { type: 'START_GAME', mode: 'solo', isHost: true });
    expect(wStart.creatureSpawners.size).toBe(0);
    expect(wStart.nextSpawnerId).toBe(0);

    const wTitle = makeWorld(1);
    registerOne(wTitle);
    dispatch(wTitle, { type: 'RETURN_TO_TITLE' });
    expect(wTitle.creatureSpawners.size).toBe(0);
    expect(wTitle.nextSpawnerId).toBe(0);
  });

  it('site 4 — GODLY_ABORT clears spawners', () => {
    const world = makeWorld(1);
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), 0x00ff00));
    registerOne(world);
    dispatch(world, { type: 'GODLY_ABORT' });
    expect(world.creatureSpawners.size).toBe(0);
    expect(world.nextSpawnerId).toBe(0);
  });
});
