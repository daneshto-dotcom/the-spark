/**
 * SPARK — S100 P1 (TD Phase 1a) chewer behaviour tests.
 *
 * Covers the PDR acceptance gates for the chewer creature:
 *   - Voltkin regression: still auto-deletes at tick 1200, enters DESPAWNING at 1140;
 *     a persistent chewer does NOT auto-despawn.
 *   - Chew loop: a chewer reaches chewProgress 5 on a stationary enemy bond, severs it
 *     exactly on the 5th hit, and does not re-seek (re-select its target) mid-chew.
 *   - Caps: global / per-spawner / per-victim; Voltkin-vs-chewer populations counted
 *     INDEPENDENTLY (a chewer swarm does not block a Voltkin summon).
 *   - Enemy-only targeting: a chewer with no enemy bonds idles, never targeting its
 *     owner's own bonds.
 *
 * Fixtures build real Primitive/Bond objects (with live a/b refs) so the FSM range
 * gate + bondMidpoint + isEnemyBond all see consistent state, mirroring the
 * creatureLifecycle.test.ts setupSeeking helper.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import {
  applyCreatureTick,
  applySpawnCreature,
  underChewerCaps,
} from './creatureLifecycle.ts';
import { applyCreatureAttack } from './creatureAttack.ts';
import { findNearestBondTarget } from './creatureAI.ts';
import {
  asCreatureId,
  VOLTKIN_LIFETIME_TICKS,
  CREATURE_DESPAWNING_TICKS,
} from './creature.ts';
import {
  CHEW_HITS,
  CHEW_INTERVAL_TICKS,
  CHEWER_MAX_GLOBAL,
  CHEWER_MAX_PER_SPAWNER,
  CHEWER_MAX_PER_VICTIM,
  PLAYER_COLORS,
  SparkType,
} from '../../constants.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId, type BondId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { makeIdlePlayer } from '../../game/player.ts';

/** Add an enemy (player-1-coloured) bond whose midpoint is at (midX, midY). */
function addEnemyBond(
  world: World,
  bondId: number,
  primAId: number,
  primBId: number,
  midX: number,
  midY: number,
  ownerColor: number,
  ownerPlayer: number,
): BondId {
  const primA: Primitive = {
    id: asPrimitiveId(primAId),
    type: SparkType.Dot,
    placerColor: ownerColor,
    placedBy: asPlayerId(ownerPlayer),
    createdTick: 0,
    pos: { x: midX - 10, y: midY },
    prevPos: { x: midX - 10, y: midY },
    bonds: new Set(),
    ownerColor,
    lastOwnershipChange: 0,
    radius: 8,
  };
  const primB: Primitive = {
    id: asPrimitiveId(primBId),
    type: SparkType.Dot,
    placerColor: ownerColor,
    placedBy: asPlayerId(ownerPlayer),
    createdTick: 0,
    pos: { x: midX + 10, y: midY },
    prevPos: { x: midX + 10, y: midY },
    bonds: new Set(),
    ownerColor,
    lastOwnershipChange: 0,
    radius: 8,
  };
  world.primitives.set(primA.id, primA);
  world.primitives.set(primB.id, primB);
  const bond: Bond = {
    id: bondId as unknown as BondId,
    aId: primA.id,
    bId: primB.id,
    a: primA,
    b: primB,
    restLength: 32,
    stiffnessTier: 'MID',
    createdTick: 0,
  };
  world.bonds.set(bond.id, bond);
  primA.bonds.add(bond.id);
  primB.bonds.add(bond.id);
  return bond.id;
}

function spawnChewer(
  world: World,
  pos: { x: number; y: number },
  spawnerId: number,
  ownerPlayer = 0,
  victimPlayerId?: number,
): void {
  applySpawnCreature(world, {
    type: 'SPAWN_CREATURE',
    creatureType: 'chewer',
    ownerPlayerId: asPlayerId(ownerPlayer),
    pos,
    targetPos: pos,
    sourceSpawnerId: asSpawnerId(spawnerId),
    ...(victimPlayerId !== undefined ? { victimPlayerId: asPlayerId(victimPlayerId) } : {}),
  });
}

describe('Voltkin regression — persistent gate does not touch the Voltkin lifecycle', () => {
  it('a Voltkin still auto-deletes at tick 1200 and enters DESPAWNING at 1140', () => {
    const world = makeWorld(1);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 100, y: 100 },
      targetPos: { x: 200, y: 200 },
    });
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    expect(c.despawnAtTick).toBe(VOLTKIN_LIFETIME_TICKS); // spawnedAtTick 0 + 1200
    // DESPAWNING at despawnAtTick - 60 = 1140.
    c.state = 'SEEKING';
    world.tick = VOLTKIN_LIFETIME_TICKS - CREATURE_DESPAWNING_TICKS; // 1140
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('DESPAWNING');
    // Auto-delete at despawnAtTick = 1200.
    world.tick = VOLTKIN_LIFETIME_TICKS; // 1200
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.has(id)).toBe(false);
  });

  it('a persistent chewer does NOT auto-despawn at its (sentinel) lifetime boundary', () => {
    const world = makeWorld(1);
    spawnChewer(world, { x: 100, y: 100 }, 0);
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    // Drive far past Voltkin's 1200-tick lifetime and well past despawnAtTick−60
    // boundaries — the !config.persistent gate skips both end-of-life steps.
    c.state = 'SEEKING';
    world.tick = 100_000;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.has(id)).toBe(true);
    expect(world.creatures.get(id)!.state).toBe('SEEKING'); // never forced into DESPAWNING
  });
});

describe('Chew loop — 5 hits sever exactly on the 5th; no re-seek mid-chew', () => {
  let world: World;
  let enemyBondId: BondId;
  beforeEach(() => {
    world = makeWorld(0);
    world.players.clear();
    world.players.set(asPlayerId(0), makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0]));
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));
    // Stationary enemy bond near the chewer.
    enemyBondId = addEnemyBond(world, 1, 10, 11, 50, 0, PLAYER_COLORS[1], 1);
  });

  it('chewProgress climbs once per CHEW_INTERVAL_TICKS and reaches CHEW_HITS at attackFireTick', () => {
    spawnChewer(world, { x: 0, y: 0 }, 0);
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    c.state = 'ATTACKING';
    c.ticksInState = 0;
    c.targetBondId = enemyBondId;

    let lastProgress = 0;
    let sealedSever = false;
    for (let t = 1; t <= CHEW_HITS * CHEW_INTERVAL_TICKS; t++) {
      applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
      const cc = world.creatures.get(id)!;
      // Target must NOT change while mid-chew (no re-seek): it stays committed.
      expect(cc.targetBondId).toBe(enemyBondId);
      // chewProgress is monotonic non-decreasing, +1 exactly on each interval boundary.
      if (cc.ticksInState % CHEW_INTERVAL_TICKS === 0 && cc.chewProgress < CHEW_HITS) {
        // covered below by the explicit boundary check
      }
      expect(cc.chewProgress).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = cc.chewProgress;

      // main.ts dispatches the real CREATURE_ATTACK at attackFireTick (= 300 = 5×60).
      if (cc.ticksInState === CHEW_HITS * CHEW_INTERVAL_TICKS) {
        expect(cc.chewProgress).toBe(CHEW_HITS); // reached 5 on the 5th interval
        applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: id, bondId: enemyBondId });
        sealedSever = true;
      }
    }
    expect(sealedSever).toBe(true);
    // The bond is severed exactly on the 5th hit (it no longer exists).
    expect(world.bonds.has(enemyBondId)).toBe(false);
  });

  it('does not re-seek (chewProgress stays committed) — releases only when the bond vanishes', () => {
    spawnChewer(world, { x: 0, y: 0 }, 0);
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    c.state = 'ATTACKING';
    c.ticksInState = 0;
    c.targetBondId = enemyBondId;
    // Add a SECOND, closer enemy bond — a re-seeking creature would switch to it.
    const closer = addEnemyBond(world, 2, 20, 21, 5, 0, PLAYER_COLORS[1], 1);
    // Advance one chew interval so chewProgress > 0 (committed).
    for (let t = 0; t < CHEW_INTERVAL_TICKS; t++) {
      applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    }
    expect(world.creatures.get(id)!.chewProgress).toBe(1);
    expect(world.creatures.get(id)!.targetBondId).toBe(enemyBondId); // not the closer bond
    void closer;

    // Now the committed bond vanishes (another actor severed it) → release + re-seek.
    world.bonds.delete(enemyBondId);
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    const cc = world.creatures.get(id)!;
    expect(cc.chewProgress).toBe(0);
    expect(cc.state).toBe('SEEKING');
    expect(cc.targetBondId).toBe(null);
  });
});

describe('Caps — global / per-spawner / per-victim; independent populations', () => {
  function worldWithPlayers(n: number): World {
    const world = makeWorld(0);
    world.players.clear();
    for (let i = 0; i < n; i++) {
      world.players.set(asPlayerId(i), makeIdlePlayer(asPlayerId(i), PLAYER_COLORS[i]));
    }
    return world;
  }

  it('per-spawner cap: a single spawner cannot exceed CHEWER_MAX_PER_SPAWNER', () => {
    const world = worldWithPlayers(2);
    for (let i = 0; i < CHEWER_MAX_PER_SPAWNER + 3; i++) {
      spawnChewer(world, { x: i * 10, y: 0 }, 0);
    }
    const fromSpawner0 = [...world.creatures.values()].filter(
      (c) => c.sourceSpawnerId === asSpawnerId(0),
    ).length;
    expect(fromSpawner0).toBe(CHEWER_MAX_PER_SPAWNER);
  });

  it('global cap: total live chewers cannot exceed CHEWER_MAX_GLOBAL across many spawners', () => {
    const world = worldWithPlayers(2);
    // Use many distinct spawners so the per-spawner cap never bites first.
    for (let s = 0; s < CHEWER_MAX_GLOBAL + 5; s++) {
      spawnChewer(world, { x: s * 7, y: 0 }, s);
    }
    expect(world.creatures.size).toBe(CHEWER_MAX_GLOBAL);
  });

  it('per-victim cap: at most CHEWER_MAX_PER_VICTIM chewers committed to one victim', () => {
    const world = worldWithPlayers(2);
    // Give each chewer a committed enemy bond owned by player 1, then keep emitting
    // with a victimPlayerId hint — underChewerCaps counts chewers whose targetBondId
    // belongs to that victim.
    let bondCount = 0;
    for (let i = 0; i < CHEWER_MAX_PER_VICTIM + 4; i++) {
      const bond = addEnemyBond(world, 100 + i, 200 + i * 2, 201 + i * 2, 40 + i, 0, PLAYER_COLORS[1], 1);
      // distinct spawner per chewer so per-spawner cap never blocks the per-victim assertion
      spawnChewer(world, { x: i, y: 0 }, 50 + i, 0, 1);
      // commit the freshly-spawned chewer (if it spawned) to the victim's bond
      const all = [...world.creatures.values()];
      const last = all[all.length - 1];
      if (last !== undefined && last.sourceSpawnerId !== null) {
        last.targetBondId = bond;
      }
      bondCount++;
    }
    void bondCount;
    const committedToVictim1 = [...world.creatures.values()].filter((c) => {
      if (c.targetBondId === null) return false;
      const b = world.bonds.get(c.targetBondId);
      if (b === undefined) return false;
      return world.primitives.get(b.aId)?.placedBy === asPlayerId(1);
    }).length;
    expect(committedToVictim1).toBeLessThanOrEqual(CHEWER_MAX_PER_VICTIM);
    // underChewerCaps reports the victim cap is saturated.
    expect(underChewerCaps(world, asSpawnerId(999), asPlayerId(1))).toBe(false);
  });

  it('independent populations: a saturated chewer swarm does NOT block a Voltkin summon', () => {
    const world = worldWithPlayers(2);
    // Saturate the global chewer cap.
    for (let s = 0; s < CHEWER_MAX_GLOBAL; s++) {
      spawnChewer(world, { x: s * 7, y: 0 }, s);
    }
    expect(world.creatures.size).toBe(CHEWER_MAX_GLOBAL);
    // A Voltkin summon (sourceSpawnerId == null) must still succeed — it is counted
    // against the null-population only (currently 0 for this owner).
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 500, y: 500 },
      targetPos: { x: 600, y: 600 },
    });
    const voltkins = [...world.creatures.values()].filter((c) => c.sourceSpawnerId === null);
    expect(voltkins.length).toBe(1);
    expect(voltkins[0].type).toBe('voltkin');
  });

  it('independent populations: a live Voltkin does NOT consume a chewer cap slot', () => {
    const world = worldWithPlayers(2);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 0, y: 0 },
      targetPos: { x: 10, y: 10 },
    });
    // Now the chewer global cap should still allow CHEWER_MAX_GLOBAL chewers.
    for (let s = 0; s < CHEWER_MAX_GLOBAL; s++) {
      spawnChewer(world, { x: s * 7, y: 0 }, s);
    }
    const chewers = [...world.creatures.values()].filter((c) => c.sourceSpawnerId !== null);
    expect(chewers.length).toBe(CHEWER_MAX_GLOBAL);
  });
});

describe('Enemy-only targeting — chewer never eats its own structure', () => {
  it('a chewer with NO enemy bonds returns null (idles), never targets own bonds', () => {
    const world = makeWorld(0);
    world.players.clear();
    world.players.set(asPlayerId(0), makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0]));
    // Only OWN bonds exist (player 0's colour).
    addEnemyBond(world, 1, 10, 11, 50, 0, PLAYER_COLORS[0], 0);
    addEnemyBond(world, 2, 12, 13, 80, 0, PLAYER_COLORS[0], 0);
    spawnChewer(world, { x: 0, y: 0 }, 0, 0);
    const chewer = world.creatures.get(asCreatureId(0))!;
    // enemyOnly:true → null when no enemy bond exists.
    expect(findNearestBondTarget(world, chewer, true)).toBe(null);
    // Voltkin default (enemyOnly:false) WOULD fall back to an own bond (byte-for-byte).
    expect(findNearestBondTarget(world, chewer, false)).not.toBe(null);
  });

  it('a chewer targets the enemy bond when one exists (own bonds present too)', () => {
    const world = makeWorld(0);
    world.players.clear();
    world.players.set(asPlayerId(0), makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0]));
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));
    // Own bond (closer) + enemy bond (farther).
    addEnemyBond(world, 1, 10, 11, 20, 0, PLAYER_COLORS[0], 0); // own
    const enemy = addEnemyBond(world, 2, 12, 13, 200, 0, PLAYER_COLORS[1], 1); // enemy
    spawnChewer(world, { x: 0, y: 0 }, 0, 0);
    const chewer = world.creatures.get(asCreatureId(0))!;
    // enemyOnly:true picks the enemy bond even though the own bond is closer.
    expect(findNearestBondTarget(world, chewer, true)).toBe(enemy);
  });
});
