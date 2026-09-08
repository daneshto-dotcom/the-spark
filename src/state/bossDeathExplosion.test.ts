/**
 * SPARK — S168 P7 (owner R138) — THE ZOMBIE BOSS EXPLODES WHEN HE DIES, ON EVERY DEATH PATH.
 *
 * Owner: *"when he dies he explodes in a huge radius hurting everything radius"*.
 *
 * ## ⛔ The defect this file exists to prevent, which S167 stopped short of rather than shipped
 *
 * There is no single place in this sim that knows a creature died. `damageCreature` behaves TWO
 * ways: with `world.pendingCreatureDeaths` open it DEFERS removal to `sweepDeferredDeaths`; with it
 * `null` it deletes the creature immediately, inside the damage call. The batch is only open for
 * part of the tick, and the DEFENDER poll runs BEFORE it opens. So:
 *
 *   · a boss killed by another CREATURE dies on the deferred path;
 *   · a boss killed by a laser turret, Helga or a stink bag is deleted immediately;
 *   · a boss killed by a player RAID dies OUTSIDE `runHostTick` entirely, in main.ts's intent drain.
 *
 * A hook at the sweep fires for the first and misses the other two. S167's own note says why that
 * is worse than no hook at all: *"the explosion would look intermittent and the cause would be
 * invisible"*. **So the test below deliberately kills the boss three different ways.** If the
 * implementation ever regresses to a single-path hook, exactly one of these goes red.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  T9_ZOMBIE_DEATH_BLAST_RADIUS,
  STRUCTURE_SELFDESTRUCT_RADIUS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { sweepDeferredDeaths } from './creatures/creatureLifecycle.ts';
import { damageEntity } from './damage.ts';
import { dispatch } from './world.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import type { Controls } from '../input/controls.ts';
import { makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BOSS_AT = { x: 900, y: 500 };

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** A world with a live boss of `race`, plus a bystander from EACH seat inside the blast. */
function worldWithBoss(race: 'zombies' | 'nagas'): {
  world: World;
  bossId: CreatureId;
  st: ReturnType<typeof makeHostTickState>;
} {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;

  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: T9_BOSS_TYPE[race],
    ownerPlayerId: P0,
    pos: { ...BOSS_AT },
    targetPos: { ...BOSS_AT },
  });
  const boss = [...world.creatures.values()].find((c) => c.type === T9_BOSS_TYPE[race]);
  if (boss === undefined) throw new Error('fixture: the boss did not spawn');

  // One bystander per seat, 40 px away — well inside the blast, and the P0 one is what proves
  // "hurting EVERYTHING" rather than "hurting the enemy".
  for (const [seat, dx] of [
    [P0, 40],
    [P1, -40],
  ] as const) {
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: seat,
      pos: { x: BOSS_AT.x + dx, y: BOSS_AT.y },
      targetPos: { x: BOSS_AT.x + dx, y: BOSS_AT.y },
      sourceSpawnerId: null,
    });
  }

  const st = makeHostTickState(world);
  // One quiet tick so the roster records the boss as live. Nothing dies here.
  runHostTick(world, deps(), st);
  return { world, bossId: boss.id, st };
}

const exploded = (w: World): boolean =>
  w.effects.some((e) => e.kind === 'BOMB_EXPLODE' && e.radius === T9_ZOMBIE_DEATH_BLAST_RADIUS);

/** Kill outright, with the deferred batch CLOSED — the turret / Helga / stink-bag path. */
function killImmediately(w: World, id: CreatureId): void {
  w.pendingCreatureDeaths = null;
  damageEntity(w, { kind: 'creature', id }, 100_000, 'player');
}

describe('S168 P7 — the zombie boss death explosion (R138)', () => {
  it('CONTROL — a LIVE boss explodes nothing, so the assertions below mean something', () => {
    const { world, st } = worldWithBoss('zombies');
    world.effects.length = 0;
    runHostTick(world, deps(), st);
    expect(exploded(world)).toBe(false);
    expect(world.creatures.size, 'and nobody was cleared').toBeGreaterThan(1);
  });

  it('⭐ path 1 — killed IMMEDIATELY (turret / Helga / a raid between ticks)', () => {
    const { world, bossId, st } = worldWithBoss('zombies');
    world.effects.length = 0;
    killImmediately(world, bossId);
    expect(world.creatures.has(bossId), 'the immediate path deletes inside the damage call').toBe(
      false,
    );
    runHostTick(world, deps(), st);
    expect(exploded(world)).toBe(true);
  });

  it('⭐⭐ path 2 — killed on the DEFERRED batch (another creature), swept later', () => {
    const { world, bossId, st } = worldWithBoss('zombies');
    world.effects.length = 0;
    const batch = new Set<CreatureId>();
    world.pendingCreatureDeaths = batch;
    damageEntity(world, { kind: 'creature', id: bossId }, 100_000, 'player');
    expect(world.creatures.has(bossId), 'deferred: still present, still swinging').toBe(true);
    sweepDeferredDeaths(world, batch);
    world.pendingCreatureDeaths = null;
    expect(world.creatures.has(bossId)).toBe(false);
    runHostTick(world, deps(), st);
    expect(exploded(world)).toBe(true);
  });

  /*
   * ⭐ THE BLAST IS OWNER-AGNOSTIC, and that is R138 read literally. `applyStructureSelfDestruct`
   * takes an OPTIONAL ownerPlayerId that SPARES the owner's own units — added in S157 after the
   * owner reported lightning hubs eating their own base. *"hurting everything"* is unambiguous, so
   * the boss passes none. This asserts the CHOICE, because passing the owner would look like a
   * tidy improvement to a future reader.
   */
  it('⭐ hurts EVERYTHING — including the boss owner own units', () => {
    const { world, bossId, st } = worldWithBoss('zombies');
    const mine = [...world.creatures.values()].filter(
      (c) => c.ownerPlayerId === P0 && c.type === 'goblinMelee',
    );
    expect(mine.length, 'fixture: the boss owner has a bystander in range').toBe(1);
    killImmediately(world, bossId);
    runHostTick(world, deps(), st);
    const survivors = [...world.creatures.values()].filter((c) => c.type === 'goblinMelee');
    expect(survivors, 'both seats bystanders are inside the blast').toEqual([]);
  });

  it('⛔ only the ZOMBIE explodes — the other five bosses die quietly', () => {
    const { world, bossId, st } = worldWithBoss('nagas');
    world.effects.length = 0;
    killImmediately(world, bossId);
    runHostTick(world, deps(), st);
    expect(exploded(world)).toBe(false);
    const survivors = [...world.creatures.values()].filter((c) => c.type === 'goblinMelee');
    expect(survivors.length, 'and nothing near the Kraken was cleared').toBe(2);
  });

  it('fires EXACTLY ONCE — a dead boss must not re-detonate every tick afterwards', () => {
    const { world, bossId, st } = worldWithBoss('zombies');
    killImmediately(world, bossId);
    runHostTick(world, deps(), st);
    world.effects.length = 0;
    for (let i = 0; i < 5; i++) runHostTick(world, deps(), st);
    expect(exploded(world)).toBe(false);
  });

  it('⭐ the boss blast is BIGGER than the lightning hub — it is the tier-9 finale', () => {
    // The only comparable already on the board. Pinned so a future tune cannot quietly make a
    // tier-9 boss detonate smaller than a tier-6 structure.
    expect(T9_ZOMBIE_DEATH_BLAST_RADIUS).toBeGreaterThan(STRUCTURE_SELFDESTRUCT_RADIUS);
  });
});
