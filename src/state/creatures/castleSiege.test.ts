/**
 * SPARK — S157 B5: CHEWERS, VOLTKIN AND DRONES GO FOR THE CASTLE.
 *
 * Owner: *"pencil chewers should also target castle (also voltkin and drones and every creature that
 * is offensive to towers (not helga)), instead after all enemy structures are destroyed pencil
 * chewers just stand there idle...."*
 *
 * ## Two holes, and I had them backwards
 *
 * My first diagnosis said the strike was already generic and only NAVIGATION was missing. Review
 * proved the reverse:
 *
 *   • `enemyCastleMarchPos` ALREADY existed and was ALREADY wired — for goblins, in the
 *     `targetsStructures` branch. The chewer/Voltkin/drone branch simply never got it.
 *   • `enemyCastleInReach` opened with a `targetsStructures` gate, and that flag means "attacks
 *     SHAPES" — false for all three of them, because they attack CONNECTORS. It is the sole
 *     authority behind the engage predicate, the abort predicate AND the strike, so a chewer
 *     standing ON the keep could never enter ATTACKING against it.
 *
 * Shipping either half alone gives a unit that walks to the keep and cannot hit it, or one that can
 * hit it and never walks there — which is the "full attack animation that does nothing" failure this
 * codebase explicitly warns about. Both are asserted here.
 *
 * ⚠ "not helga" needs no code: she is a DEFENDER, not a creature, and never reaches this machinery.
 */

import { describe, expect, it } from 'vitest';
import { FIGHT_PHASE_TICKS, PLAYER_COLORS } from '../../constants.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { enemyCastleInReach } from './creatureAI.ts';
import { asCreatureId, makeCreature } from './creature.ts';
import { CHEWER_CONFIG, LIGHTNING_DRONE_CONFIG, VOLTKIN_CONFIG, GOBLIN_MELEE_CONFIG } from './voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asPlayerId, asSpawnerId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function board(): World {
  const world = makeWorld(0xb5);
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
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + FIGHT_PHASE_TICKS;
  return world;
}

describe('S157 B5 — the STRIKE half: every offensive unit can reach a castle', () => {
  const cases = [
    ['chewer', CHEWER_CONFIG],
    ['voltkin', VOLTKIN_CONFIG],
    ['lightningDrone', LIGHTNING_DRONE_CONFIG],
    ['goblinMelee', GOBLIN_MELEE_CONFIG],
  ] as const;

  it.each(cases)('%s standing on the enemy keep HAS it in reach', (label, config) => {
    const world = board();
    const keep = castleAnchor(P1 as unknown as number, world.layout);
    const c = makeCreature(config, {
      id: asCreatureId(1),
      ownerPlayerId: P0,
      pos: { x: keep.x, y: keep.y },
      targetPos: { x: keep.x, y: keep.y },
      spawnedAtTick: world.tick,
      sourceSpawnerId: label === 'voltkin' ? null : asSpawnerId(1),
      clock: world,
    });
    world.creatures.set(c.id, c);
    expect(
      enemyCastleInReach(world, c, config.attackRange),
      `${label} must be able to engage a castle — it was gated on targetsStructures`,
    ).toBe(P1);
  });

  it('⛔ and a unit far from every keep still has NOTHING in reach', () => {
    // Anti-vacuity: proves the predicate still measures distance rather than always saying yes.
    const world = board();
    const c = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(2),
      ownerPlayerId: P0,
      pos: { x: 900, y: 540 },
      targetPos: { x: 900, y: 540 },
      spawnedAtTick: world.tick,
      sourceSpawnerId: asSpawnerId(1),
      clock: world,
    });
    world.creatures.set(c.id, c);
    expect(enemyCastleInReach(world, c, CHEWER_CONFIG.attackRange)).toBeNull();
  });
});

describe('S157 B5 — the NAVIGATION half: an idle chewer marches instead of standing still', () => {
  it('⭐ with no enemy bond on the board, a chewer walks toward the enemy keep', () => {
    const world = board();
    const keep = castleAnchor(P1 as unknown as number, world.layout);
    const start = { x: 900, y: 540 };
    const c = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(3),
      ownerPlayerId: P0,
      pos: { x: start.x, y: start.y },
      targetPos: { x: start.x, y: start.y },
      spawnedAtTick: world.tick,
      sourceSpawnerId: asSpawnerId(1),
      clock: world,
    });
    c.state = 'SEEKING';
    world.creatures.set(c.id, c);

    const before = Math.hypot(c.targetPos.x - keep.x, c.targetPos.y - keep.y);
    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 60; t++) runHostTick(world, d, st);

    const after = Math.hypot(c.targetPos.x - keep.x, c.targetPos.y - keep.y);
    // Before the fix `targetPos` was left at its stale value forever — the literal "just stand there
    // idle". Now it is aimed at the keep.
    expect(after, 'the chewer is now aiming at the enemy keep').toBeLessThan(before);
    expect(c.targetBondId, 'and it genuinely had no bond to chew').toBeNull();
  });
});
