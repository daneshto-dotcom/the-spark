/**
 * SPARK — S178: **A LANDED STINK BAG DIES IN ONE STRIKE, EVEN WHEN THE ATTACKER HOLDS A SHAPE
 * COMMITMENT IT CANNOT REACH.**
 *
 * Owner, S178: *"The poop bag is still freaking unkillable. Vlad killed the orc warlord within, like,
 * freaking three hits, but it took him, like, maybe fifty hits. He was just standing there and
 * attacking a poop bag, and the poop bag didn't explode or anything. That is not consistent. It is
 * not coherent. This is ridiculous. A poop bag should be one HP."*
 *
 * ⛔ THE POOL WAS NEVER THE PROBLEM, WHICH IS WHY IT SURVIVED S177. `STINK_BAG_HP` is 1 and
 * `STINK_BAG_DEF` 0, so `ehp` is `unitPoolFifths(1, 0)` = **5 fifths** and every attacker in the
 * game one-shots it; S177 P5 had already fixed the reach test (`Math.max(reach, cloud.radius)`).
 * Both halves were correct and the bag was still immortal, because a THIRD thing ate the strike:
 *
 *   1. `creatureLifecycle`'s bag clause holds a creature in ATTACKING while a bag is in engage
 *      range — so it never re-seeks and never walks away;
 *   2. `creatureAttack`'s SHAPE arm runs BEFORE the bag arm and used to `return` on all three of its
 *      exits, including the two that deal no damage;
 *   3. `hostTick` re-acquires `targetPrimitiveId` — the nearest enemy shape — every tick.
 *
 * So every tick: commit set → shape out of reach → release the commit → **return**, and the bag arm
 * was never reached. Fifty swings is fifty seconds of exactly that.
 *
 * ⭐ THE SHAPE MAY BE ANYWHERE. The cases below put it at 60, 120 and **300 px** — far outside any
 * attacker's 35 px melee reach — because the defect never depended on the shape being close. It
 * depended only on a commitment existing. That is what makes it fire in every real match: a stink
 * tower is built OUT OF shapes, so a boss standing in its bags always has one committed.
 *
 * ⚠ THIS TEST IS A PROMOTED PROBE, AND IT IS WRITTEN AS A MEASUREMENT RATHER THAN AS A BOOLEAN.
 * It reports the TICK the bag dies, so a future regression says "null" or "300" instead of merely
 * "false" — the difference between "nothing can kill it", "it expired on its own" and "it took
 * five swings". The three are different bugs and the numbers tell them apart.
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { applySpawnCreature } from './creatureLifecycle.ts';
import { asPlayerId, asPrimitiveId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import { PRIMITIVE_MAX_HP, SparkType, STINK_BAG_DEF, STINK_BAG_HP, STINK_BAG_RADIUS } from '../../constants.ts';
import { makeStinkCloud } from '../defenders/stinkCloud.ts';
import { asStinkCloudId } from '../../types.ts';
import { unitPoolFifths } from '../stats.ts';
import type { Primitive } from '../../game/primitive.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(seed = 1): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function make1v1(): World {
  const w = makeWorld(0x9111);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  return w;
}

function addPrimAt(world: World, seat: 0 | 1, x: number, y: number): Primitive {
  const player = world.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: player.id,
    createdTick: world.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: player.color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  world.primitives.set(id, prim);
  return prim;
}

/**
 * Spawn one attacker of `creatureType` with ONE enemy bag `bagAt` px away, and optionally an enemy
 * SHAPE `shapeAt` px away. Returns the tick the bag died, or null if it survived the whole run.
 */
function ticksToKillBag(creatureType: string, bagAt: number, shapeAt: number | null): number | null {
  const w = make1v1();
  w.creatures.clear();
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE', creatureType, ownerPlayerId: asPlayerId(0),
    pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 }, sourceSpawnerId: null,
  } as never);
  if (shapeAt !== null) addPrimAt(w, 1, 500 + shapeAt, 500);

  const id = asStinkCloudId(w.nextStinkCloudId++);
  w.stinkClouds.set(id, makeStinkCloud({
    id, pos: { x: 500 + bagAt, y: 500 }, ownerPlayerId: asPlayerId(1),
    landedAtTick: w.tick, radius: STINK_BAG_RADIUS,
  }));

  const d = deps();
  const st = makeHostTickState(w);
  for (let t = 0; t < 900; t++) {
    // ⚠ Hold off the bag's own 5 s EXPIRY so what we measure is KILLING. Without this a pass could
    // mean "the bag timed out", which is precisely the wrong diagnosis a previous session reached.
    const c = w.stinkClouds.get(id) as { landedAtTick: number } | undefined;
    if (c !== undefined) c.landedAtTick = w.tick;
    runHostTick(w, d, st);
    if (w.stinkClouds.get(id) === undefined) return t;
  }
  return null;
}

/** One strike at 60 ticks — the attack cadence. Anything slower means swings are being eaten. */
const ONE_STRIKE_TICKS = 60;

describe('S178 — a landed stink bag is killable (owner: "a poop bag should be one HP")', () => {
  it('has the pool the owner ruled, so this suite is testing the right thing', () => {
    expect(STINK_BAG_HP).toBe(1);
    expect(STINK_BAG_DEF).toBe(0);
    expect(unitPoolFifths(STINK_BAG_HP, STINK_BAG_DEF)).toBe(5);
  });

  for (const type of ['goblinMelee', 't9BossVampires', 't9BossOrcs', 'goblinArcher']) {
    it(`${type} pops a bag it is standing in, with no shape on the board`, () => {
      expect(ticksToKillBag(type, 20, null)).toBe(ONE_STRIKE_TICKS);
    });
  }

  /*
   * ⛔ THE REGRESSION ITSELF. Every one of these returned `null` — the bag alive after 900 ticks,
   * the attacker stuck in ATTACKING cycling its cadence and dealing nothing — until the shape arm's
   * two no-op exits stopped consuming the strike.
   */
  for (const type of ['t9BossVampires', 'goblinMelee']) {
    for (const shapeAt of [60, 120, 300]) {
      it(`${type} still pops the bag while committed to an unreachable shape ${shapeAt}px away`, () => {
        expect(ticksToKillBag(type, 20, shapeAt)).toBe(ONE_STRIKE_TICKS);
      });
    }
  }

  it('reaches a bag anywhere inside the cloud, not just at its centre', () => {
    // S177 P5's reach fix: reach is max(attackRange, cloud.radius), so standing in the smell is
    // enough. 85 px is outside every melee arm (35) and inside STINK_BAG_RADIUS (90).
    expect(ticksToKillBag('t9BossOrcs', 85, 120)).toBe(ONE_STRIKE_TICKS);
  });
});
