/**
 * SPARK — S157 B1: A GOBLIN IS NOT A CHEWER, AND THE SHAPE IS NEVER SPENT FOR NOTHING.
 *
 * ## The report
 *
 * Owner, after a real play session: *"Late game 0 Goblins not being built even if you feed their
 * towers any shapes and the shapes are being consumed nevertheless - not cool! also pencil chewers
 * and other spawn that are not being spawned late game - except helga."*
 *
 * ## What it was
 *
 * A fed goblin carries a non-null `sourceSpawnerId` and is not a `lightningDrone`, so it fell through
 * to the CHEWER branch of `applySpawnCreature` — and `underChewerCaps` counts only
 * `type === 'chewer'`. Goblins were gated by a ceiling **they could not contribute to**. "Late game"
 * simply means "enough chewers alive to saturate it", which is why it read as a late-game bug rather
 * than as wiring.
 *
 * And the shape vanished because `applyFeedTower` debited the bank BEFORE dispatching, so a silent
 * downstream refusal returned to a caller that had already paid.
 *
 * ⭐ *"except helga"* is the detail that confirms the whole diagnosis: she is a DEFENDER, not a
 * creature, so no creature cap has ever touched her.
 *
 * ## What these tests pin
 *
 * The first one is the owner's exact scenario and it is the reason this file exists: chewers owned by
 * **another player** from an **unrelated spawner** must not be able to starve your goblin tower.
 */

import { describe, expect, it } from 'vitest';
import {
  CHEWER_MAX_GLOBAL,
  GOBLIN_MAX_PER_SPAWNER,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SPARK_VISUAL_SIZE,
  SparkType,
} from '../constants.ts';
import { bankAdd, bankCountOf } from './castleBank.ts';
import { applyFeedTower } from './goblinTowerFeed.ts';
import { applySpawnCreature, underGoblinCaps } from './creatures/creatureLifecycle.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, asPrimitiveId, type BondId, type PlayerId, type SpawnerId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const world = makeWorld(0xb1);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  });
  return world;
}

function prim(world: World, seat: PlayerId, x: number, y: number) {
  const player = world.players.get(seat)!;
  const id = asPrimitiveId(world.nextPrimitiveId++);
  const p = {
    id,
    type: SparkType.Square,
    placerColor: player.color,
    placedBy: seat,
    createdTick: world.tick,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set<BondId>(),
    ownerColor: player.color,
    lastOwnershipChange: world.tick,
    hp: PRIMITIVE_MAX_HP,
    radius: Math.max(8, SPARK_VISUAL_SIZE[SparkType.Square] * 0.45),
    origin: null,
  };
  world.primitives.set(id, p);
  return p;
}

/** A registered goblin tower for `seat`. Returns its spawner id. */
function goblinTower(world: World, seat: PlayerId, x = 600, y = 300): SpawnerId {
  const anchor = prim(world, seat, x, y);
  dispatch(world, {
    type: 'REGISTER_SPAWNER',
    ownerPlayerId: seat,
    anchorPrimitiveId: anchor.id,
    recipeId: 'goblinTower',
  });
  return [...world.creatureSpawners.keys()][world.creatureSpawners.size - 1];
}

/** Fill the board with live chewers owned by `seat`, from a spawner that is NOT the tower. */
function floodChewers(world: World, seat: PlayerId, n: number): void {
  const other = goblinTower(world, seat, 1200, 800); // any spawner id; the type is what counts
  for (let i = 0; i < n; i++) {
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'chewer',
      ownerPlayerId: seat,
      pos: { x: 1200 + i, y: 800 },
      targetPos: { x: 1200 + i, y: 800 },
      sourceSpawnerId: other,
    });
  }
}

describe('S157 B1 — an enemy chewer swarm cannot starve your goblin tower', () => {
  it('⭐ THE OWNER SCENARIO: feed succeeds with a saturated chewer population', () => {
    const world = board();
    const tower = goblinTower(world, P0);
    // The old global ceiling, owned by the OTHER player, from an unrelated spawner.
    floodChewers(world, P1, CHEWER_MAX_GLOBAL > 200 ? 40 : CHEWER_MAX_GLOBAL);
    bankAdd(world.castleBanks, P0, SparkType.Square);

    const before = world.creatures.size;
    applyFeedTower(world, {
      type: 'FEED_TOWER',
      spawnerId: tower,
      playerId: P0,
      sparkType: SparkType.Square,
    });

    expect(world.creatures.size, 'a goblin was actually born').toBe(before + 1);
    expect(bankCountOf(world.castleBanks, P0, SparkType.Square), 'and the shape was spent for it').toBe(0);
  });

  it('⛔ THE SHAPE IS NEVER SPENT FOR NOTHING — a refused feed costs the player zero', () => {
    // Saturate the GOBLIN cap for this tower, then feed. The refusal must be free.
    const world = board();
    const tower = goblinTower(world, P0);
    for (let i = 0; i < GOBLIN_MAX_PER_SPAWNER; i++) {
      applySpawnCreature(world, {
        type: 'SPAWN_CREATURE',
        creatureType: 'goblinMelee',
        ownerPlayerId: P0,
        pos: { x: 600, y: 300 },
        targetPos: { x: 600, y: 300 },
        sourceSpawnerId: tower,
      });
    }
    expect(underGoblinCaps(world, tower), 'the fixture really is at the cap').toBe(false);

    bankAdd(world.castleBanks, P0, SparkType.Square);
    const before = world.creatures.size;
    applyFeedTower(world, {
      type: 'FEED_TOWER',
      spawnerId: tower,
      playerId: P0,
      sparkType: SparkType.Square,
    });

    expect(world.creatures.size, 'no goblin was born').toBe(before);
    expect(
      bankCountOf(world.castleBanks, P0, SparkType.Square),
      'THE SHAPE IS STILL IN THE BANK — this is the half the owner actually felt',
    ).toBe(1);
  });

  it('goblins and chewers count against SEPARATE ceilings', () => {
    const world = board();
    const tower = goblinTower(world, P0);
    floodChewers(world, P0, 30);
    // 30 chewers alive, and the goblin cap is untouched by them.
    expect(underGoblinCaps(world, tower)).toBe(true);
  });

  it('a fed goblin does not count against the DRONE population either', () => {
    const world = board();
    const tower = goblinTower(world, P0);
    bankAdd(world.castleBanks, P0, SparkType.Square);
    applyFeedTower(world, {
      type: 'FEED_TOWER',
      spawnerId: tower,
      playerId: P0,
      sparkType: SparkType.Square,
    });
    const drones = [...world.creatures.values()].filter((c) => c.type === 'lightningDrone');
    expect(drones.length).toBe(0);
    expect(world.creatures.size).toBe(1);
  });

  it('⛔ the goblin cap is still REAL — it is a backstop, not a deletion', () => {
    // Goblins are `persistent: true`, so they never age out. An unbounded population is the one
    // creature family that genuinely cannot self-correct, which is why the ceiling stays.
    const world = board();
    const tower = goblinTower(world, P0);
    for (let i = 0; i < GOBLIN_MAX_PER_SPAWNER; i++) {
      applySpawnCreature(world, {
        type: 'SPAWN_CREATURE',
        creatureType: 'goblinMelee',
        ownerPlayerId: P0,
        pos: { x: 600, y: 300 },
        targetPos: { x: 600, y: 300 },
        sourceSpawnerId: tower,
      });
    }
    const atCap = world.creatures.size;
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: P0,
      pos: { x: 600, y: 300 },
      targetPos: { x: 600, y: 300 },
      sourceSpawnerId: tower,
    });
    expect(world.creatures.size).toBe(atCap);
  });
});
