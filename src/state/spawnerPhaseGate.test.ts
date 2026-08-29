/**
 * SPARK — S157 P0: SPAWNERS ARE DORMANT OUTSIDE THE FIGHT, AND A HUB DOES NOT EAT ITS OWN BASE.
 *
 * ## The report
 *
 * Owner, after a real play session: *"lightning hubs blow up own structures or nearby friendlies
 * during build phase when the drones are produced - WTF!? first they shouldnt be able to hit
 * friendlies in friendly territory and certainly not during build phase!"*
 *
 * ## What it actually was — and my first diagnosis was WRONG
 *
 * I blamed the drones: a fuse surviving `recallArmies` across the phase edge. Three independent
 * review agents refuted it, and the disproof was already in my own notes — the creature fan-out is
 * FIGHT-gated (`hostTick.ts`), so a drone cannot move, tick or detonate during BUILD. My story was
 * unreachable. The drones are innocent.
 *
 * ⛔ THE REAL CAUSE IS THE HUB'S OWN FINALE, AND THE SPAWNER POLL HAD NO PHASE GATE AT ALL. After
 * `STRUCTURE_SELFDESTRUCT_DRONE_COUNT` drones the arc dispatches `STRUCTURE_SELFDESTRUCT` — a 240 px
 * raze that reached `applyRadialClear` with `() => true` for creatures and NO predicate whatsoever
 * for primitives. Owner-blind by construction. And the poll that drives it gated only on
 * `gameState === 'PLAYING'`, while its two sibling polls (defenders, and the creature fan-out) both
 * gate on `matchPhase`. Detonation lands +3600 ticks after ignition = 60 s, inside a 90 s BUILD — so
 * a hub built early in BUILD ALWAYS detonated in its owner's own base.
 *
 * That one missing conjunct also drove two more of the owner's nine reports (chewers accumulating
 * through BUILD while the despawn cannot run; the goblin feed then refused by the cap those frozen
 * chewers hold), which is why it shipped first.
 *
 * ## What these tests pin
 *
 * 1. Nothing is emitted or detonated outside FIGHT.
 * 2. ⭐ The cadence is kept ALIGNED while dormant — a bare `continue` would leave `nextSpawnTick`
 *    90 s in the past and dump a backlog burst (and an instant self-destruct) on the first FIGHT
 *    tick. That is the absolute-deadline-survives-a-phase-edge class this repo has now hit three
 *    times, so it is asserted rather than assumed.
 * 3. The blast spares its owner and still takes the enemy — otherwise the fix is a nerf, not a fix.
 */

import { describe, expect, it } from 'vitest';
import {
  FIGHT_PHASE_TICKS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SPARK_VISUAL_SIZE,
  LIGHTNING_HUB_DEGREE,
  SPAWN_INTERVAL_TICKS,
  STRUCTURE_SELFDESTRUCT_RADIUS,
  SparkType,
} from '../constants.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { applyStructureSelfDestruct } from './potatoLifecycle.ts';
import { applySpawnCreature } from './creatures/creatureLifecycle.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';

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
  const world = makeWorld(0x5157);
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

/** A bare primitive for `seat` at (x, y) — enough to anchor a spawner or to be blown up. */
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

/**
 * Register a live lightning hub for `seat` — WITH ITS REAL RECIPE GEOMETRY.
 *
 * ⛔ THE GEOMETRY IS NOT OPTIONAL, AND LEAVING IT OUT MAKES EVERY TEST BELOW VACUOUS. The spawner
 * poll re-validates each spawner against `recipeStillSatisfied` in BOTH phases (deliberately —
 * dormancy suspends the weapon, not the bookkeeping), so a hub anchored on a bare primitive is
 * REMOVED within one revalidate interval. It would then emit nothing during BUILD for a reason that
 * has nothing to do with the phase gate, and "no drones were emitted" would pass against a hub that
 * no longer existed. The first draft of this file did exactly that, and the cadence test is what
 * caught it — a green suite is not evidence.
 *
 * The recipe (`lightningHub.ts`): a Dot hub of bond-degree exactly `LIGHTNING_HUB_DEGREE` (5) whose
 * connected component is exactly `LIGHTNING_HUB_COMPONENT_SIZE` (6) primitives, every non-hub member
 * a Circle.
 */
function hub(world: World, seat: PlayerId, x: number, y: number) {
  const player = world.players.get(seat)!;
  const anchor = prim(world, seat, x, y);
  anchor.type = SparkType.Dot;
  for (let i = 0; i < LIGHTNING_HUB_DEGREE; i++) {
    const a = (i * 2 * Math.PI) / LIGHTNING_HUB_DEGREE;
    const leaf = prim(world, seat, x + Math.cos(a) * 40, y + Math.sin(a) * 40);
    leaf.type = SparkType.Circle;
    const bondId = asBondId(world.nextBondId++);
    world.bonds.set(bondId, {
      id: bondId,
      aId: anchor.id,
      bId: leaf.id,
      a: anchor,
      b: leaf,
      restLength: 40,
      stiffnessTier: 'MID',
      createdTick: world.tick,
      damageFifths: 0,
    });
    anchor.bonds.add(bondId);
    leaf.bonds.add(bondId);
  }
  void player;
  dispatch(world, {
    type: 'REGISTER_SPAWNER',
    ownerPlayerId: seat,
    anchorPrimitiveId: anchor.id,
    recipeId: 'lightningHub',
  });
  return anchor;
}

describe('S157 P0 — the spawner poll is FIGHT-gated', () => {
  it('⭐ a lightning hub does NOT detonate during BUILD', () => {
    const world = board();
    world.matchPhase = 'BUILD';
    world.phaseEndsAtTick = world.tick + 100_000; // hold BUILD open past the 3600-tick arc
    const anchor = hub(world, P0, 700, 300);
    const bystander = prim(world, P0, 820, 300); // clear of the 40 px star, inside the 240 px blast

    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 5000; t++) runHostTick(world, d, st);

    expect(world.matchPhase, 'the fixture must still be in BUILD').toBe('BUILD');
    expect(world.primitives.has(anchor.id), 'the hub anchor survived BUILD').toBe(true);
    expect(world.primitives.has(bystander.id), 'the owner own shape survived BUILD').toBe(true);
    expect(world.creatures.size, 'no drones were emitted during BUILD').toBe(0);
  });

  it('⛔ and the cadence stays ALIGNED, so the FIGHT edge does not dump a backlog burst', () => {
    // The trap: a bare `continue` leaves nextSpawnTick 90 s in the past, and the first FIGHT tick
    // then fires every overdue slot at once — including the self-destruct.
    const world = board();
    world.matchPhase = 'BUILD';
    world.phaseEndsAtTick = world.tick + 100_000;
    hub(world, P0, 700, 300);

    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 5000; t++) runHostTick(world, d, st);

    const sp = [...world.creatureSpawners.values()][0];
    expect(sp, 'the hub is still registered').toBeDefined();
    const overdueBy = world.tick - sp.nextSpawnTick;
    expect(
      overdueBy,
      `nextSpawnTick is ${overdueBy} ticks in the past — the FIGHT edge would burst`,
    ).toBeLessThan(SPAWN_INTERVAL_TICKS);
  });

  it('⛔ ANTI-VACUITY — the SAME hub in FIGHT does emit, and does detonate', () => {
    // Without this, "nothing happened during BUILD" would pass just as well against a hub that was
    // silently removed, mis-registered, or never reached its cadence at all.
    const world = board();
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + 100_000; // hold FIGHT open across the whole 3600-tick arc
    const anchor = hub(world, P0, 700, 300);
    const enemy = prim(world, P1, 820, 300); // inside the 240 px blast, NOT the owner's

    const d = deps();
    const st = makeHostTickState(world);
    let sawDrone = false;
    for (let t = 0; t < 5000; t++) {
      runHostTick(world, d, st);
      if (world.creatures.size > 0) sawDrone = true;
    }

    expect(sawDrone, 'the hub emitted at least one drone during FIGHT').toBe(true);
    expect(world.primitives.has(anchor.id), 'the hub detonated itself at the end of its arc').toBe(false);
    expect(world.primitives.has(enemy.id), 'and it took the ENEMY shape with it').toBe(false);
  });

  it('a pentagram emits nothing during BUILD either (it is the same poll)', () => {
    const world = board();
    world.matchPhase = 'BUILD';
    world.phaseEndsAtTick = world.tick + 100_000;
    const anchor = prim(world, P0, 700, 300);
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: P0,
      anchorPrimitiveId: anchor.id,
      recipeId: 'pentagram',
    });

    const d = deps();
    const st = makeHostTickState(world);
    for (let t = 0; t < 3000; t++) runHostTick(world, d, st);
    expect(world.creatures.size, 'no chewers minted during BUILD').toBe(0);
  });
});

describe('S157 P0 — the self-destruct spares its owner', () => {
  /** Put one shape per seat inside the blast, plus one creature per seat, then detonate. */
  function blastFixture() {
    const world = board();
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + FIGHT_PHASE_TICKS;
    const mine = prim(world, P0, 700, 300);
    const theirs = prim(world, P1, 740, 300);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: P0,
      pos: { x: 710, y: 300 },
      targetPos: { x: 710, y: 300 },
      sourceSpawnerId: null,
    });
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: P1,
      pos: { x: 730, y: 300 },
      targetPos: { x: 730, y: 300 },
      sourceSpawnerId: null,
    });
    return { world, mine, theirs };
  }

  it('⭐ takes the ENEMY shape and leaves the OWNER own', () => {
    const { world, mine, theirs } = blastFixture();
    applyStructureSelfDestruct(world, {
      type: 'STRUCTURE_SELFDESTRUCT',
      pos: { x: 700, y: 300 },
      radius: STRUCTURE_SELFDESTRUCT_RADIUS,
      ownerPlayerId: P0,
    });
    expect(world.primitives.has(mine.id), 'the owner own shape must survive').toBe(true);
    expect(world.primitives.has(theirs.id), 'the enemy shape must be destroyed').toBe(false);
  });

  it('⭐ spares the owner units and takes the enemy ones', () => {
    const { world } = blastFixture();
    applyStructureSelfDestruct(world, {
      type: 'STRUCTURE_SELFDESTRUCT',
      pos: { x: 700, y: 300 },
      radius: STRUCTURE_SELFDESTRUCT_RADIUS,
      ownerPlayerId: P0,
    });
    const owners = [...world.creatures.values()].map((c) => c.ownerPlayerId);
    expect(owners, 'the owner own drones/units survive their own blast').toContain(P0);
    expect(owners, 'enemy units do not').not.toContain(P1);
  });

  it('⛔ ANTI-VACUITY — with no owner supplied it still razes EVERYTHING (the potato path)', () => {
    // Proves the two tests above are the owner filter working, not the blast failing to reach.
    const { world, mine, theirs } = blastFixture();
    applyStructureSelfDestruct(world, {
      type: 'STRUCTURE_SELFDESTRUCT',
      pos: { x: 700, y: 300 },
      radius: STRUCTURE_SELFDESTRUCT_RADIUS,
    });
    expect(world.primitives.has(mine.id)).toBe(false);
    expect(world.primitives.has(theirs.id)).toBe(false);
    expect(world.creatures.size).toBe(0);
  });
});
