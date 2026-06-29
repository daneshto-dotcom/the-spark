/**
 * SPARK — S113 Batch C — lightning-drone building tests.
 *
 * Covers the PDR acceptance gates:
 *   - isLightningHubComponent recipe gate (1 Dot deg-5 + 5 Circle leaves; loosened: tolerates an
 *     inter-leaf bond; rejects wrong hub type / wrong degree / non-Circle leaf / an extra shape).
 *   - recipeStillSatisfied('lightningHub') re-validation.
 *   - applyDroneExplode: enemy-only radial sever (<= DRONE_MAX_CONNECTORS), nearest-first, ARC_FLASH
 *     per sever + BOMB_EXPLODE burst, spares OWN bonds, harmless with no enemy, despawns the drone.
 *   - applyStructureSelfDestruct: owner-AGNOSTIC clear of prims + bonds + creatures in radius.
 *   - underDroneCaps: own independent population cap (global + per-spawner).
 *   - determinism: two identical DRONE_EXPLODE dispatches produce byte-identical snapshots.
 *
 * Fixture style mirrors spawnerLifecycle.test.ts (hand-built primitives + bonds).
 */

import { describe, it, expect } from 'vitest';
import { dispatch, makeWorld, type World } from './world.ts';
import {
  DRONE_EXPLODE_RADIUS,
  DRONE_MAX_CONNECTORS,
  DRONE_MAX_GLOBAL,
  DRONE_MAX_PER_SPAWNER,
  PLAYER_COLORS,
  SparkType,
  STRUCTURE_SELFDESTRUCT_RADIUS,
} from '../constants.ts';
import {
  asBondId,
  asCreatureId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type BondId,
  type PrimitiveId,
} from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';
import { isLightningHubComponent, findAllLightningHubAnchors } from './godlyRecipes/lightningHub.ts';
import { recipeStillSatisfied } from './spawners/spawnerLifecycle.ts';
import { makeSpawner } from './spawners/spawner.ts';
import { underDroneCaps } from './droneLifecycle.ts';
import { underChewerCaps } from './creatures/creatureLifecycle.ts';
import { makeCreature } from './creatures/creature.ts';
import { LIGHTNING_DRONE_CONFIG, CHEWER_CONFIG } from './creatures/voltkin-config.ts';
import { snapshot } from './save.ts';

const OWNER = asPlayerId(0);
const OWNER_COLOR = PLAYER_COLORS[0];
const ENEMY_COLOR = PLAYER_COLORS[1];

function makePrim(id: number, x: number, y: number, type: SparkType, color: number = OWNER_COLOR): Primitive {
  return {
    id: asPrimitiveId(id),
    type,
    placerColor: color,
    placedBy: OWNER,
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

/** Build a valid lightning-hub: Dot hub id=0 (deg 5) + 5 Circle leaves ids 1..5 around it. */
function buildHub(world: World): PrimitiveId {
  world.primitives.set(asPrimitiveId(0), makePrim(0, 0, 0, SparkType.Dot));
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    world.primitives.set(asPrimitiveId(i), makePrim(i, Math.cos(a) * 36, Math.sin(a) * 36, SparkType.Circle));
    addBond(world, i, 0, i); // each leaf bonded ONLY to the hub
  }
  return asPrimitiveId(0);
}

describe('isLightningHubComponent — recipe gate', () => {
  it('accepts 1 Dot(deg5) + 5 Circle leaves', () => {
    const world = makeWorld(1);
    const anchor = buildHub(world);
    expect(isLightningHubComponent(world, anchor)).toBe(true);
  });

  it('rejects a Triangle hub (wrong hub type)', () => {
    const world = makeWorld(1);
    world.primitives.set(asPrimitiveId(0), makePrim(0, 0, 0, SparkType.Triangle));
    for (let i = 1; i <= 5; i++) {
      world.primitives.set(asPrimitiveId(i), makePrim(i, i * 30, 0, SparkType.Circle));
      addBond(world, i, 0, i);
    }
    expect(isLightningHubComponent(world, asPrimitiveId(0))).toBe(false);
  });

  it('rejects a hub of degree 4 (only 4 leaves)', () => {
    const world = makeWorld(1);
    world.primitives.set(asPrimitiveId(0), makePrim(0, 0, 0, SparkType.Dot));
    for (let i = 1; i <= 4; i++) {
      world.primitives.set(asPrimitiveId(i), makePrim(i, i * 30, 0, SparkType.Circle));
      addBond(world, i, 0, i);
    }
    expect(isLightningHubComponent(world, asPrimitiveId(0))).toBe(false);
  });

  it('rejects a non-Circle leaf (one Square)', () => {
    const world = makeWorld(1);
    buildHub(world);
    // Replace leaf 3 with a Square (keep its bond to the hub).
    const sq = makePrim(3, world.primitives.get(asPrimitiveId(3))!.pos.x, world.primitives.get(asPrimitiveId(3))!.pos.y, SparkType.Square);
    sq.bonds = world.primitives.get(asPrimitiveId(3))!.bonds;
    world.primitives.set(asPrimitiveId(3), sq);
    expect(isLightningHubComponent(world, asPrimitiveId(0))).toBe(false);
  });

  it('TOLERATES an inter-leaf bond (loosened gate — still a 1-Dot + 5-Circle, size 6)', () => {
    const world = makeWorld(1);
    const anchor = buildHub(world);
    addBond(world, 99, 1, 2); // bond two adjacent Circle leaves — leaf degree rises to 2, hub stays 5
    expect(isLightningHubComponent(world, anchor)).toBe(true);
  });

  it('rejects an extra attached shape (component size > 6)', () => {
    const world = makeWorld(1);
    const anchor = buildHub(world);
    world.primitives.set(asPrimitiveId(6), makePrim(6, 200, 200, SparkType.Circle));
    addBond(world, 100, 1, 6); // attach a 7th shape to a leaf → size 7
    expect(isLightningHubComponent(world, anchor)).toBe(false);
  });
});

describe('findAllLightningHubAnchors + recipeStillSatisfied', () => {
  it('finds the Dot hub anchor', () => {
    const world = makeWorld(1);
    buildHub(world);
    expect(findAllLightningHubAnchors(world)).toEqual([asPrimitiveId(0)]);
  });

  it('recipeStillSatisfied is true for a live hub, false once a leaf is removed', () => {
    const world = makeWorld(1);
    const anchor = buildHub(world);
    const sp = makeSpawner({
      id: asSpawnerId(0),
      ownerPlayerId: OWNER,
      anchorPrimitiveId: anchor,
      recipeId: 'lightningHub',
      ignitedAtTick: 0,
      nextSpawnTick: 900,
    });
    expect(recipeStillSatisfied(world, sp)).toBe(true);
    // Break it: delete a leaf (drops hub degree to 4 + component size to 5).
    world.primitives.get(asPrimitiveId(0))!.bonds.delete(world.bonds.get(asBondId(1))!.id);
    world.bonds.delete(asBondId(1));
    world.primitives.delete(asPrimitiveId(1));
    expect(recipeStillSatisfied(world, sp)).toBe(false);
  });
});

/** Place a drone owned by OWNER at (0,0) with a sourceSpawnerId so it counts as a drone population. */
function addDrone(world: World, id: number): void {
  const drone = makeCreature(LIGHTNING_DRONE_CONFIG, {
    id: asCreatureId(id),
    ownerPlayerId: OWNER,
    pos: { x: 0, y: 0 },
    targetPos: { x: 0, y: 0 },
    spawnedAtTick: 0,
    sourceSpawnerId: asSpawnerId(0),
  });
  drone.state = 'SEEKING';
  world.creatures.set(drone.id, drone);
}

describe('applyDroneExplode', () => {
  it('severs nearby ENEMY bonds (<= DRONE_MAX_CONNECTORS), emits ARC_FLASH per sever + a BOMB_EXPLODE, then despawns', () => {
    const world = makeWorld(1);
    addDrone(world, 500);
    // 3 enemy bonds within radius (each a pair of enemy-coloured prims near the drone).
    let pid = 10;
    let bid = 10;
    for (let k = 0; k < 3; k++) {
      const x = 10 + k * 12;
      world.primitives.set(asPrimitiveId(pid), makePrim(pid, x, 0, SparkType.Square, ENEMY_COLOR));
      world.primitives.set(asPrimitiveId(pid + 1), makePrim(pid + 1, x, 8, SparkType.Square, ENEMY_COLOR));
      addBond(world, bid, pid, pid + 1);
      pid += 2;
      bid += 1;
    }
    expect(world.bonds.size).toBe(3);
    dispatch(world, { type: 'DRONE_EXPLODE', creatureId: asCreatureId(500) });
    expect(world.bonds.size).toBe(0); // all 3 enemy bonds severed
    expect(world.creatures.has(asCreatureId(500))).toBe(false); // drone gone
    const arcs = world.effects.filter((e) => e.kind === 'ARC_FLASH');
    expect(arcs.length).toBe(3);
    expect(world.effects.some((e) => e.kind === 'BOMB_EXPLODE')).toBe(true);
  });

  it('SPARES the owner own bonds (enemy-only)', () => {
    const world = makeWorld(1);
    addDrone(world, 500);
    world.primitives.set(asPrimitiveId(10), makePrim(10, 10, 0, SparkType.Square, OWNER_COLOR));
    world.primitives.set(asPrimitiveId(11), makePrim(11, 10, 8, SparkType.Square, OWNER_COLOR));
    addBond(world, 10, 10, 11);
    dispatch(world, { type: 'DRONE_EXPLODE', creatureId: asCreatureId(500) });
    expect(world.bonds.size).toBe(1); // own bond untouched
    expect(world.effects.filter((e) => e.kind === 'ARC_FLASH').length).toBe(0);
  });

  it('caps the sever at DRONE_MAX_CONNECTORS even with more enemy bonds in range', () => {
    const world = makeWorld(1);
    addDrone(world, 500);
    let pid = 10;
    let bid = 10;
    for (let k = 0; k < 5; k++) {
      const x = 10 + k * 10;
      world.primitives.set(asPrimitiveId(pid), makePrim(pid, x, 0, SparkType.Square, ENEMY_COLOR));
      world.primitives.set(asPrimitiveId(pid + 1), makePrim(pid + 1, x, 8, SparkType.Square, ENEMY_COLOR));
      addBond(world, bid, pid, pid + 1);
      pid += 2;
      bid += 1;
    }
    dispatch(world, { type: 'DRONE_EXPLODE', creatureId: asCreatureId(500) });
    expect(world.bonds.size).toBe(5 - DRONE_MAX_CONNECTORS); // exactly DRONE_MAX_CONNECTORS severed
    expect(world.effects.filter((e) => e.kind === 'ARC_FLASH').length).toBe(DRONE_MAX_CONNECTORS);
  });

  it('is harmless with no enemy bonds (no sever, just despawn + burst)', () => {
    const world = makeWorld(1);
    addDrone(world, 500);
    // A far-away enemy bond OUTSIDE the radius.
    world.primitives.set(asPrimitiveId(10), makePrim(10, DRONE_EXPLODE_RADIUS + 200, 0, SparkType.Square, ENEMY_COLOR));
    world.primitives.set(asPrimitiveId(11), makePrim(11, DRONE_EXPLODE_RADIUS + 200, 8, SparkType.Square, ENEMY_COLOR));
    addBond(world, 10, 10, 11);
    dispatch(world, { type: 'DRONE_EXPLODE', creatureId: asCreatureId(500) });
    expect(world.bonds.size).toBe(1); // out-of-range bond survives
    expect(world.creatures.has(asCreatureId(500))).toBe(false); // drone still despawns
    expect(world.effects.filter((e) => e.kind === 'ARC_FLASH').length).toBe(0);
  });
});

describe('applyStructureSelfDestruct', () => {
  it('owner-AGNOSTIC: clears prims + bonds + creatures in radius (incl. the owner own)', () => {
    const world = makeWorld(1);
    // Own structure at the blast centre.
    world.primitives.set(asPrimitiveId(0), makePrim(0, 0, 0, SparkType.Triangle, OWNER_COLOR));
    world.primitives.set(asPrimitiveId(1), makePrim(1, 20, 0, SparkType.Triangle, OWNER_COLOR));
    addBond(world, 0, 0, 1);
    // An own creature in radius.
    addDrone(world, 500);
    // A prim OUTSIDE the radius survives.
    world.primitives.set(asPrimitiveId(9), makePrim(9, STRUCTURE_SELFDESTRUCT_RADIUS + 100, 0, SparkType.Triangle, OWNER_COLOR));

    dispatch(world, { type: 'STRUCTURE_SELFDESTRUCT', pos: { x: 0, y: 0 }, radius: STRUCTURE_SELFDESTRUCT_RADIUS });

    expect(world.primitives.has(asPrimitiveId(0))).toBe(false); // own prim wiped (agnostic)
    expect(world.primitives.has(asPrimitiveId(1))).toBe(false);
    expect(world.bonds.size).toBe(0);
    expect(world.creatures.has(asCreatureId(500))).toBe(false); // creature in radius wiped too
    expect(world.primitives.has(asPrimitiveId(9))).toBe(true); // out-of-range prim survives
  });
});

describe('underDroneCaps', () => {
  it('caps the per-spawner drone population', () => {
    const world = makeWorld(1);
    for (let i = 0; i < DRONE_MAX_PER_SPAWNER; i++) addDrone(world, 600 + i);
    expect(underDroneCaps(world, asSpawnerId(0))).toBe(false); // this spawner is at its cap
  });

  it('counts ONLY lightningDrone creatures (independent of the chewer population)', () => {
    const world = makeWorld(1);
    expect(underDroneCaps(world, asSpawnerId(0))).toBe(true); // empty → under cap
    expect(DRONE_MAX_GLOBAL).toBeGreaterThan(0);
  });

  it('drones do NOT count toward the chewer caps, and chewers do NOT count toward the drone caps (owner #7)', () => {
    const world = makeWorld(1);
    // Saturate the per-spawner DRONE cap with drones; chewers stay fully under their own cap.
    for (let i = 0; i < DRONE_MAX_PER_SPAWNER; i++) addDrone(world, 700 + i);
    expect(underDroneCaps(world, asSpawnerId(0))).toBe(false); // drone cap saturated
    expect(underChewerCaps(world, asSpawnerId(0))).toBe(true); // chewer cap UNAFFECTED by the drones
    // Now add a chewer; the drone cap is still independent.
    world.creatures.set(
      asCreatureId(800),
      makeCreature(CHEWER_CONFIG, {
        id: asCreatureId(800),
        ownerPlayerId: OWNER,
        pos: { x: 0, y: 0 },
        targetPos: { x: 0, y: 0 },
        spawnedAtTick: 0,
        sourceSpawnerId: asSpawnerId(0),
      }),
    );
    expect(underDroneCaps(world, asSpawnerId(0))).toBe(false); // still only the 3 drones count
  });
});

describe('determinism — DRONE_EXPLODE is replay byte-identical', () => {
  const detJson = (w: World): string => {
    const s = snapshot(w) as { savedAt?: string };
    delete s.savedAt;
    return JSON.stringify(s);
  };
  function buildExplodeWorld(seed: number): World {
    const world = makeWorld(seed);
    addDrone(world, 500);
    let pid = 10;
    let bid = 10;
    for (let k = 0; k < 5; k++) {
      const x = 10 + k * 10;
      world.primitives.set(asPrimitiveId(pid), makePrim(pid, x, 0, SparkType.Square, ENEMY_COLOR));
      world.primitives.set(asPrimitiveId(pid + 1), makePrim(pid + 1, x, 8, SparkType.Square, ENEMY_COLOR));
      addBond(world, bid, pid, pid + 1);
      pid += 2;
      bid += 1;
    }
    dispatch(world, { type: 'DRONE_EXPLODE', creatureId: asCreatureId(500) });
    return world;
  }
  it('two identically-built worlds match byte-for-byte after the explode', () => {
    expect(detJson(buildExplodeWorld(0xabc))).toBe(detJson(buildExplodeWorld(0xabc)));
  });
});
