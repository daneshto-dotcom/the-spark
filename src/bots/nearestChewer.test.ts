/**
 * S165 — `nearestChewer` must key on the creature TYPE, not on its provenance.
 *
 * ⛔ THE BUG THIS PINS WAS LIVE, NOT LATENT. `nearestChewer` filtered on
 * `sourceSpawnerId !== null`, and at S100 — when it was written — that was a correct spelling of
 * "is a chewer", because the chewer was the only spawner-sourced creature in the game. S151 P3 gave
 * the goblin tower six outputs and `goblinTowerFeed.ts:154` stamps every one of them with
 * `sourceSpawnerId: action.spawnerId`. From that commit onward EVERY GOBLIN satisfied the filter, so
 * the chewer-avoid in `chooseGoal` steered bots away from their own goblins. Nothing failed: the
 * function still returned a plausible position, which is exactly why it survived fourteen sessions.
 *
 * ⚠ AND IT WAS ABOUT TO GET WORSE. W1-C gives the castle a race unit carrying a sentinel
 * `SpawnerId` (owner R133), which would have joined the same false positive. This test is the
 * reason that cannot happen quietly: it asserts the discriminator is the type.
 */
import { describe, expect, it } from 'vitest';

import { nearestChewer } from './botBrain.ts';
import { makeCreature } from '../state/creatures/creature.ts';
import { CHEWER_CONFIG, GOBLIN_MELEE_CONFIG } from '../state/creatures/voltkin-config.ts';
import { makeWorld, type World } from '../state/world.ts';
import { asCreatureId, asPlayerId, asSpawnerId } from '../types.ts';

/** Put one creature of `config` at `pos` into a fresh world and hand the world back. */
function worldWith(
  config: typeof CHEWER_CONFIG,
  pos: { x: number; y: number },
  sourceSpawnerId: ReturnType<typeof asSpawnerId> | null,
): World {
  const world = makeWorld(11); // fixed seed — this test must not depend on rng
  const id = asCreatureId(1);
  world.creatures.set(
    id,
    makeCreature(config, {
      id,
      ownerPlayerId: asPlayerId(0),
      pos,
      targetPos: pos,
      spawnedAtTick: 0,
      sourceSpawnerId,
    }),
  );
  return world;
}

const FROM = { x: 100, y: 100 };
const NEAR = { x: 110, y: 100 }; // 10px away — well inside CHEWER_AVOID_RADIUS (140)

describe('nearestChewer keys on TYPE, not on provenance', () => {
  it('finds a real chewer that is in range', () => {
    const world = worldWith(CHEWER_CONFIG, NEAR, asSpawnerId(7));
    expect(nearestChewer(world, FROM)).toEqual(NEAR);
  });

  it('⛔ does NOT report a spawner-sourced GOBLIN as a chewer', () => {
    // The exact shape goblinTowerFeed produces: a goblin carrying a real SpawnerId.
    const world = worldWith(GOBLIN_MELEE_CONFIG, NEAR, asSpawnerId(7));
    expect(nearestChewer(world, FROM)).toBeNull();
  });

  it('⛔ does NOT report a creature carrying a CASTLE SENTINEL SpawnerId (W1-C, R133)', () => {
    // A negative id is the per-seat sentinel shape W1-C will use. It must not read as a chewer
    // merely because it is non-null — that is the same mistake one layer further on.
    const world = worldWith(GOBLIN_MELEE_CONFIG, NEAR, asSpawnerId(-1));
    expect(nearestChewer(world, FROM)).toBeNull();
  });

  it('still ignores a spawner-less creature (the original S100 intent)', () => {
    const world = worldWith(GOBLIN_MELEE_CONFIG, NEAR, null);
    expect(nearestChewer(world, FROM)).toBeNull();
  });

  it('ignores a chewer that is out of range', () => {
    const world = worldWith(CHEWER_CONFIG, { x: 1000, y: 1000 }, asSpawnerId(7));
    expect(nearestChewer(world, FROM)).toBeNull();
  });
});
