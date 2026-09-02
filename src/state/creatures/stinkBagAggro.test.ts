/**
 * SPARK — S159 P1 (owner R77): **A LANDED STINK BAG PULLS UNITS ONTO IT.**
 *
 * R77's deferred-mechanics list, verbatim: *"destructible stink bags as entities with aggro and
 * on-destroy damage"*. S158 shipped the two halves that need no navigation — the bag carries a pool
 * (A2) and BURSTS when killed — plus the two clauses that let a unit ALREADY STANDING at one deal
 * with it. **Aggro, the word in the middle, was the part nothing did.**
 *
 * ## What these tests are actually guarding
 *
 * The feature is one line in a steering chain, and a steering chain is exactly the kind of code that
 * "passes" while doing nothing: every unit test about goblins walking at shapes stays green whether
 * or not a bag is ever consulted. So the first test here is a MEASUREMENT, not an assertion about
 * internals — a goblin placed one aggro radius from an enemy bag must actually reach it and pop it,
 * *within the bag's four-second life*. Delete the wiring and it marches on the keep instead, and this
 * test fails on the thing a player would see.
 *
 * The second test is the one that separates this from the function that already existed.
 * `enemyStinkCloudInReach` (S158 A2) answers *"what can I hit from here"* and takes the LOWEST ID
 * outright — correct there, because everything in reach is equally hittable. Navigation must take the
 * NEAREST. A nearer bag with a higher id is therefore the discriminating case: reuse the old function
 * for navigation and this test fails, which is the whole reason `nearestEnemyStinkCloudWithin` exists
 * beside it rather than replacing it.
 */

import { describe, expect, it } from 'vitest';

import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { applySpawnCreature } from './creatureLifecycle.ts';
import { nearestEnemyStinkCloudWithin, enemyStinkCloudInReach } from './creatureAI.ts';
import { makeStinkCloud } from '../defenders/stinkCloud.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { asPlayerId, asPrimitiveId, asStinkCloudId, type StinkCloudId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import type { Creature } from './creature.ts';
import {
  GOBLIN_SPREAD_RADIUS,
  SparkType,
  STINK_BAG_AGGRO_RADIUS,
  STINK_BAG_RADIUS,
  STINK_CLOUD_LIFETIME_TICKS,
  phaseDurationTicks,
} from '../../constants.ts';

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

/**
 * A 1v1 world in FIGHT with a clean board: no creatures, no shapes, no bonds. Every target the
 * steering chain could prefer over a bag is therefore absent unless a test puts it there, which is
 * what makes each priority test say only what it means to say.
 */
function fightWorld(seed = 0x5159): World {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  // Far enough from the end that `isRetreatWindow` is false — HOME outranks a bag by design, so a
  // retreat window would make every test below pass for the wrong reason.
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.primitives.clear();
  w.bonds.clear();
  return w;
}

function landBag(w: World, x: number, y: number, owner = P1, idNum?: number): StinkCloudId {
  const id = asStinkCloudId(idNum ?? w.nextStinkCloudId++);
  w.stinkClouds.set(
    id,
    makeStinkCloud({ id, pos: { x, y }, ownerPlayerId: owner, landedAtTick: w.tick, radius: STINK_BAG_RADIUS }),
  );
  return id;
}

function spawnGoblin(w: World, x: number, y: number, type: Creature['type'] = 'goblinMelee', owner = P0): Creature {
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE',
    creatureType: type,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: null,
  });
  return [...w.creatures.values()].at(-1)!;
}

/** An enemy shape, inserted directly — `PLACE_PRIMITIVE` would have to satisfy cost + legality, and
 * the scenario is only about which DESTINATION the steering chain picks. Indestructible so it cannot
 * die mid-run and release the target, the `standoff.test.ts` precedent. */
function addPrimAt(w: World, seat: 0 | 1, x: number, y: number): Primitive {
  const player = w.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id,
    type: SparkType.Square,
    placerColor: player.color,
    placedBy: player.id,
    createdTick: w.tick,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: player.color,
    lastOwnershipChange: 0,
    radius: 9,
    hp: 1e9,
    origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

/** Run past SPAWNING so the creature is really SEEKING and the navigation branch is live. */
function settleToSeeking(w: World, c: Creature, d = deps(), st = makeHostTickState(w)): void {
  for (let i = 0; i < 90 && c.state !== 'SEEKING'; i++) runHostTick(w, d, st);
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('S159 P1 — the AGGRO half of R77: a landed bag pulls a unit onto it', () => {
  it('a goblin one aggro radius away REACHES the bag and pops it inside the bag\'s own lifetime', () => {
    const w = fightWorld();
    const bagId = landBag(w, 900, 900);
    const bagPos = w.stinkClouds.get(bagId)!.pos;
    const g = spawnGoblin(w, bagPos.x - STINK_BAG_AGGRO_RADIUS, bagPos.y);
    const d = deps();
    const st = makeHostTickState(w);
    settleToSeeking(w, g, d, st);

    const startDist = dist(g.pos, bagPos);
    let goneAtTick = -1;
    const t0 = w.tick;
    // The REAL sweep is left running: a bag expires on its own after STINK_CLOUD_LIFETIME_TICKS, so
    // the run stops one tick short of that. Whether the bag left by expiry or by force is then read
    // off `killCount`, which only the strike path increments — an expired bag would leave it at 0.
    for (let i = 0; i < STINK_CLOUD_LIFETIME_TICKS - 1; i++) {
      runHostTick(w, d, st);
      if (!w.stinkClouds.has(bagId)) {
        goneAtTick = w.tick - t0;
        break;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[S159 P1] goblin walked ${startDist.toFixed(0)} px and the bag was gone at tick ${goneAtTick} ` +
        `of its ${STINK_CLOUD_LIFETIME_TICKS}-tick life (killCount ${g.killCount})`,
    );
    // ⚠ THE ASSERTIONS THAT MAKE THE RADIUS HONEST. If the roster's speeds ever change so that a
    // unit can no longer cross one aggro radius inside a bag's life, these fail and the constant
    // needs re-sizing — rather than the feature quietly becoming decorative.
    expect(goneAtTick).toBeGreaterThan(0);
    expect(goneAtTick).toBeLessThan(STINK_CLOUD_LIFETIME_TICKS);
    expect(g.killCount).toBeGreaterThanOrEqual(1); // KILLED, not expired
  });

  it('steers at the NEAREST bag, not the lowest-id one — the case that separates the two scans', () => {
    const w = fightWorld();
    // id 0 is FAR (but still inside the radius), id 1 is NEAR. `enemyStinkCloudInReach` would
    // answer id 0; navigation must answer id 1.
    const far = landBag(w, 900 + STINK_BAG_AGGRO_RADIUS - 10, 900, P1, 0);
    const near = landBag(w, 900 + 60, 900, P1, 1);
    const g = spawnGoblin(w, 900, 900);
    settleToSeeking(w, g);

    expect(nearestEnemyStinkCloudWithin(w, g, STINK_BAG_AGGRO_RADIUS)).toBe(near);
    // Proof this is a real discrimination and not a tautology: the older scan disagrees.
    expect(enemyStinkCloudInReach(w, g, STINK_BAG_AGGRO_RADIUS)).toBe(far);
  });

  it('takes the lowest id only on an exact tie', () => {
    const w = fightWorld();
    const g = spawnGoblin(w, 900, 900);
    const hi = landBag(w, 900 + 100, 900, P1, 7);
    const lo = landBag(w, 900 - 100, 900, P1, 3);
    expect(nearestEnemyStinkCloudWithin(w, g, STINK_BAG_AGGRO_RADIUS)).toBe(lo);
    expect(lo).not.toBe(hi);
  });

  it('ignores its OWN bags and anything outside the radius', () => {
    const w = fightWorld();
    const g = spawnGoblin(w, 900, 900);
    landBag(w, 900 + 40, 900, P0); // own side — enemy-only, like every other target
    landBag(w, 900 + STINK_BAG_AGGRO_RADIUS + 20, 900, P1); // just out of reach
    expect(nearestEnemyStinkCloudWithin(w, g, STINK_BAG_AGGRO_RADIUS)).toBeNull();
  });

  it('a bag OUTRANKS the committed shape it was standing between', () => {
    const w = fightWorld();
    const bagId = landBag(w, 900 + 80, 900);
    const g = spawnGoblin(w, 900, 900);
    settleToSeeking(w, g);
    // An enemy shape well beyond the bag, so the two destinations cannot be confused.
    const prim = addPrimAt(w, 1, 900 + 900, 900);
    runHostTick(w, deps(), makeHostTickState(w));
    expect(g.targetPrimitiveId).toBe(prim.id); // committed to the shape ...


    const bagPos = w.stinkClouds.get(bagId)!.pos;
    // `spreadTargetPos` scatters the destination by up to GOBLIN_SPREAD_RADIUS, so the test asserts
    // the NEIGHBOURHOOD of the bag rather than the exact point — which is what steering means here.
    // ... and yet STEERING at the bag. Both at once is the point: the commitment that drives the
    // strike is unchanged, and only the destination is overridden.
    expect(dist(g.targetPos, bagPos)).toBeLessThanOrEqual(GOBLIN_SPREAD_RADIUS + 1);
    expect(dist(g.targetPos, prim.pos)).toBeGreaterThan(GOBLIN_SPREAD_RADIUS + 1);
  });

  it('an acquired enemy UNIT still outranks the bag — the soldier swinging at you comes first', () => {
    const w = fightWorld();
    const bagId = landBag(w, 900 + 120, 900);
    const g = spawnGoblin(w, 900, 900);
    settleToSeeking(w, g);
    const foe = spawnGoblin(w, 900 - 100, 900, 'goblinMelee', P1);
    runHostTick(w, deps(), makeHostTickState(w));

    const bagPos = w.stinkClouds.get(bagId)!.pos;
    expect(dist(g.targetPos, foe.pos)).toBeLessThan(dist(g.targetPos, bagPos));
  });

  it('is deterministic: two identical worlds stay hash-equal tick for tick with bags on the board', () => {
    const build = (): { w: World; d: HostTickDeps; st: ReturnType<typeof makeHostTickState> } => {
      const w = fightWorld();
      landBag(w, 900 + 150, 900, P1, 0);
      landBag(w, 900 - 150, 900, P1, 1);
      spawnGoblin(w, 900, 900);
      spawnGoblin(w, 920, 940);
      return { w, d: deps(), st: makeHostTickState(w) };
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 240; i++) {
      runHostTick(a.w, a.d, a.st);
      runHostTick(b.w, b.d, b.st);
      expect(hashWorldStateFull(a.w)).toBe(hashWorldStateFull(b.w));
    }
  });
});
