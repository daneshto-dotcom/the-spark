/**
 * SPARK — S154 P2 (owner R92): THE BAT RIDER'S REACH, AND THE RANGED-STANDOFF CREEP.
 *
 * ## Why this file exists
 *
 * The owner reported that nothing appears to leave the bat rider when he attacks. The cause was not
 * a missing projectile: `GOBLIN_BAT_CONFIG.attackRange` was `GOBLIN_ATTACK_RANGE` (35) — the same
 * constant documented as *"true melee — closes onto its target"* and shared with the swordsman, the
 * shield and the hound. He had no ranged behaviour to fail at.
 *
 * ⭐ AND FIXING THAT EXPOSED A SECOND, OLDER DEFECT IN SHIPPED CODE. Both Council seats
 * independently predicted that a ranged creature creeps inward one attack cadence at a time:
 * `computeSteeringAccel` returns ZERO_ACCEL unless the state is SEEKING, but the FSM drops an
 * ATTACKING creature back to SEEKING for one tick whenever its cadence elapses, and that tick buys
 * a full `arriveForce` impulse which `VELOCITY_DAMPING` (0.998 **per substep**) bleeds off only
 * slowly. Measured with the real loop: the **shipped `goblinArcher` decayed from 220 px to 155 px
 * over ~40 s**, and `GOBLIN_LIFETIME_TICKS` is sixty minutes.
 *
 * ## What makes these assertions trustworthy
 *
 * They drive `runHostTick`, which is the REAL loop — it calls `stepPhysics`, so the creatures are
 * moved by real Verlet integration with real steering, and the FSM is the shipped reducer. The
 * throwaway probe that first measured the creep reimplemented the FSM inline; that was enough to
 * decide a design, and deliberately not enough to ship a test on.
 *
 * This matters because, as `unitFirstTargeting.test.ts` records, every determinism gate in this repo
 * is SELF-COMPARING: a wrong-but-consistent change to how creatures move passes all of them, and a
 * 2970-test suite once stayed green straight through a rewrite of goblin targeting. Standoff
 * distance is behaviour, so it has to be asserted by hand.
 */

import { describe, expect, it } from 'vitest';

import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { applySpawnCreature } from './creatureLifecycle.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from './voltkin-config.ts';
import { STANDOFF_RANGE_FRACTION } from './creatureAI.ts';
import type { CreatureType } from './creature.ts';
import { asPlayerId, asPrimitiveId, type BondId, type CreatureId, type PrimitiveId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import {
  GOBLIN_ATTACK_CADENCE_TICKS,
  GOBLIN_ATTACK_RANGE,
  GOBLIN_BAT_RANGE,
  PRIMITIVE_MAX_HP,
  SparkType,
} from '../../constants.ts';

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

/** A 1v1 world pinned to FIGHT — creatures are dormant in BUILD (S149 P3), and this is combat. */
function make1v1(): World {
  const w = makeWorld(0x9111);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.creatures.clear(); // drop the starter grant so each scenario holds exactly one unit
  return w;
}

function addPrimAt(world: World, seat: 0 | 1, x: number, y: number): Primitive {
  const player = world.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id,
    type: SparkType.Square,
    placerColor: player.color,
    placedBy: player.id,
    createdTick: world.tick,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: player.color,
    lastOwnershipChange: 0,
    radius: 9,
    hp: 1e9, // ⚠ effectively indestructible: the scenario is about DISTANCE over many cadences,
    origin: null, //   and a shape that dies mid-run would release the target and end the standoff.
  };
  world.primitives.set(id, prim);
  return prim;
}

/**
 * Spawn one creature of `type` at `startDist` px from a lone enemy shape and run the REAL host tick
 * for `ticks`, reporting how close it ended up. `startDist` is deliberately outside the unit's own
 * range so the run includes its approach as well as its standoff.
 */
/*
 * ⭐⭐ S179 (owner) — **THE TARGET IS A STRUCTURE NOW, AND THE DISTANCE IS MEASURED TO WHAT THE
 * UNIT IS ACTUALLY HOLDING RANGE FROM.**
 *
 * Two of his rules land on this harness at once:
 *   1. a shape with NO connectors is worth 5 and dies to ANY hit — so the old lone-shape victim was
 *      destroyed by the first arrow and there was no standoff left to measure;
 *   2. a creature no longer TARGETS a shape that has connectors — *"He targets the connectors. The
 *      whole building."* — so a bonded victim is never the anchor either.
 *
 * Both are satisfied by giving the victim a real partner and measuring to the CONNECTOR the unit
 * actually picks. That is not a workaround: holding station off a building is precisely the
 * behaviour R92 is about, and the harness was only ever using a shape as a convenient stand-in.
 *
 * ⚠ MEASURING TO `victim.pos` WOULD NOW BE WRONG BY HALF THE BOND LENGTH, which is exactly the
 * size of the slack in `endDist <= range + 1`. So the anchor is resolved per tick from the unit's
 * own committed target, the same way the sim resolves it.
 */
function targetAnchor(w: World, c: { targetCreatureId: CreatureId | null; targetBondId: BondId | null; targetPrimitiveId: PrimitiveId | null }): { x: number; y: number } | null {
  if (c.targetCreatureId !== null) {
    const v = w.creatures.get(c.targetCreatureId);
    if (v !== undefined) return { x: v.pos.x, y: v.pos.y };
  }
  if (c.targetBondId !== null) {
    const b = w.bonds.get(c.targetBondId);
    if (b !== undefined) return { x: (b.a.pos.x + b.b.pos.x) * 0.5, y: (b.a.pos.y + b.b.pos.y) * 0.5 };
  }
  if (c.targetPrimitiveId !== null) {
    const p = w.primitives.get(c.targetPrimitiveId);
    if (p !== undefined) return { x: p.pos.x, y: p.pos.y };
  }
  return null;
}

function closeIn(type: CreatureType, startDist: number, ticks: number) {
  const w = make1v1();
  /*
   * ⭐⭐ S179 — **THE TARGET IS A DURABLE ENEMY UNIT, AND THAT IS WHAT THIS HARNESS WAS ALWAYS
   * ABOUT.** The lone shape it used before was only ever a convenient stand-in for "something to
   * hold station off", and his rule retires it: a shape with NO connectors is worth 5 and dies to
   * the first arrow, so there is no standoff left to measure.
   *
   * ⚠ TWO OTHER FIXTURES WERE TRIED AND MEASURED FIRST, so the next session does not redo them:
   *   · a BONDED PAIR — `structurePoolFifths(1)` = 6 fifths, severed by one arrow, and the shared
   *     raze contract then takes both orphaned shapes. Gone in under a second.
   *   · a 25-CONNECTOR CHAIN (pool 750, easily durable enough) — the structure SURVIVED the full
   *     run (measured: 26 prims / 25 bonds still standing at the end) but the ARCHER vanished at
   *     t=960 with `creatures=0`, i.e. the fixture had started producing something that killed it.
   *     A fixture with side effects is worse than no fixture.
   *
   * ⛔ AND THE RACE IS CHOSEN, NOT ARBITRARY. It was `t9BossMummies` first, and the melee control
   * kept dying at t=649 with the anchor untouched: a PHARAOH LAUNCHES LOCUSTS at anything inside
   * `PHARAOH_LOCUST_TRIGGER_RANGE` (260 px), and one locust is 50 fifths against a melee goblin's
   * 7-fifth pool — so the unit that closed to contact was deleted for reasons the test does not care
   * about. VAMPIRES is the one tier-9 race whose only skill is a SELF-heal, so the anchor cannot
   * reach out and touch the thing being measured. Do not "simplify" this back to another race.
   *
   * A unit target is also what the sibling tests in this file reason about explicitly — see the
   * `GOBLIN_UNIT_ACQUIRE_RADIUS` assertion above: *"A goblin acquires a unit to NAVIGATE ... and only
   * engages inside attackRange."* The tier-9 pool (hundreds of fifths) outlasts twenty cadences.
   *
   * ⛔ AND IT IS HELD STUNNED FOR THE WHOLE RUN, WHICH IS THE POINT. A boss left to act WALKS AT
   * the unit and kills it — measured: the archer settled at 64 px instead of its ring because the
   * target was closing the distance itself, and in two runs the archer was dead before the end.
   * Neither says anything about whether the SHOOTER creeps, which is the only thing under test.
   * A stun freezes movement and attacks while leaving the creature fully TARGETABLE, so what is
   * measured is exactly the shooter's own station-keeping against a fixed point.
   */
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE',
    creatureType: 't9BossVampires',
    ownerPlayerId: asPlayerId(1),
    pos: { x: 900, y: 500 },
    targetPos: { x: 900, y: 500 },
    sourceSpawnerId: null,
  });
  const victim = [...w.creatures.values()].find((c) => c.type === 't9BossVampires')!;
  const anchorPool = victim.ehp; // pinned each tick below, so the anchor never dies
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE',
    creatureType: type,
    ownerPlayerId: asPlayerId(0),
    pos: { x: victim.pos.x - startDist, y: victim.pos.y },
    targetPos: { x: victim.pos.x, y: victim.pos.y },
    sourceSpawnerId: null,
  });
  const unit = [...w.creatures.values()].find((c) => c.type === type)!;
  const d = deps();
  const st = makeHostTickState(w);

  let firedCadences = 0;
  let lastTicks = -1;
  let minDist = Infinity;
  /*
   * ⚠ THE UNIT CAN BE SHOT DOWN BEFORE THE RUN ENDS, AND THAT IS NOT A FAILURE OF WHAT IS MEASURED.
   * A melee goblin that closes all the way is standing next to the enemy keep, and a castle shot is
   * 8 fifths against its 7-fifth pool — measured: the control unit died at t=649 of 1320. Reading
   * the FINAL frame would then throw, and asserting it survived would pin castle-gun balance into a
   * test about station-keeping. So the harness records the LAST OBSERVED distance and state. Every
   * assertion below is about where the unit settled, which is fully determined long before it dies.
   */
  let lastDist = Infinity;
  let lastState: string = 'SPAWNING';
  /*
   * ⚠ SETTLED, NOT MINIMUM. The approach is a one-time transient: the unit spends its whole run-in
   * accelerating, so it arrives with momentum and dips inside the ring before `arriveForce` brakes it
   * and pushes it back out — traced at 82 px for a bat whose ring is 120. That dip is a swoop, not a
   * creep, and asserting on it would pin a number that says nothing about whether the standoff HOLDS.
   * The defect being guarded is a monotonic slide over minutes, so the assertions read the last
   * quarter of the run, after the transient has damped out.
   */
  const settleFrom = Math.floor(ticks * 0.75);
  let settledMin = Infinity;
  for (let t = 0; t < ticks; t++) {
    /*
     * Re-stun AND re-heal every tick: an inert, immortal, STATIONARY anchor.
     * ⚠ THE HEAL IS NOT BELT-AND-BRACES: it removes every DEATH-triggered side effect at once,
     * whichever boss is used (the mummies boss, for one, brings Ra columns down around itself on its
     * death stroke).
     */
    const tgt = w.creatures.get(victim.id);
    if (tgt !== undefined) {
      tgt.stunnedUntilTick = w.tick + 600;
      tgt.ehp = anchorPool;
    }
    runHostTick(w, d, st);
    const live = w.creatures.get(unit.id);
    if (live === undefined) break;
    // A cadence "fired" each time ticksInState passes the fire tick going up.
    const cfg = getCreatureConfig(type);
    if (lastTicks < cfg.attackFireTick && live.ticksInState >= cfg.attackFireTick) firedCadences++;
    lastTicks = live.ticksInState;
    const anchor = targetAnchor(w, live) ?? victim.pos;
    const dist = Math.hypot(anchor.x - live.pos.x, anchor.y - live.pos.y);
    lastDist = dist;
    lastState = live.state;
    if (live.state === 'ATTACKING') minDist = Math.min(minDist, dist);
    if (t >= settleFrom) settledMin = Math.min(settledMin, dist);
  }
  return {
    endDist: lastDist,
    state: lastState,
    firedCadences,
    minDist,
    settledMin,
    victimHp: w.creatures.get(victim.id)?.ehp ?? 0,
  };
}

/** Twenty cadences is ~20 s of fighting — long enough for a 1.6 px/cadence creep to be obvious. */
const LONG_RUN = 20 * GOBLIN_ATTACK_CADENCE_TICKS + 120;

describe('S154 P2 (R92) — the bat rider is no longer configured as a melee unit', () => {
  it('⛔ his attackRange is NOT the melee constant — the bug, stated as an assertion', () => {
    // This is the test that fails on the pre-S154 tree: the value WAS GOBLIN_ATTACK_RANGE.
    expect(CREATURE_CONFIGS.goblinBat.attackRange).not.toBe(GOBLIN_ATTACK_RANGE);
    expect(CREATURE_CONFIGS.goblinBat.attackRange).toBe(GOBLIN_BAT_RANGE);
  });

  it('and he is no longer indistinguishable from the three melee goblins', () => {
    const melee = (['goblinMelee', 'goblinShield', 'goblinHound'] as const).map(
      (t) => CREATURE_CONFIGS[t].attackRange,
    );
    expect(new Set(melee)).toEqual(new Set([GOBLIN_ATTACK_RANGE]));
    expect(melee).not.toContain(CREATURE_CONFIGS.goblinBat.attackRange);
  });

  it('⛔ his range stays STRICTLY BELOW the unit-acquire radius, or navigation collapses', () => {
    // A goblin acquires a unit to NAVIGATE at GOBLIN_UNIT_ACQUIRE_RADIUS and only engages inside
    // attackRange. If the two are equal he satisfies unitInReach on the tick he acquires, enters
    // ATTACKING at maximum navigation distance and never closes at all.
    expect(GOBLIN_BAT_RANGE).toBeLessThan(220); // GOBLIN_UNIT_ACQUIRE_RADIUS
    expect(GOBLIN_BAT_RANGE).toBeGreaterThan(GOBLIN_ATTACK_RANGE);
  });

  it('he stops well short of contact and fights from there', () => {
    const r = closeIn('goblinBat', 320, LONG_RUN);
    expect(r.state).toBe('ATTACKING');
    // Pre-S154 he closed to ~1 px, i.e. contact. A real standoff is the whole point of the priority.
    expect(r.endDist).toBeGreaterThan(GOBLIN_ATTACK_RANGE * 2);
    // …and he does not hover OUTSIDE his own reach either, which would be a unit that never fires.
    expect(r.endDist).toBeLessThanOrEqual(GOBLIN_BAT_RANGE + 1);
  });
});

describe('S154 P2 — ⛔ THE MEASURED CREEP: a standoff fighter HOLDS its distance', () => {
  for (const type of ['goblinArcher', 'goblinBat'] as const) {
    it(`${type} does not slide into melee over twenty cadences`, () => {
      const range = CREATURE_CONFIGS[type].attackRange;
      const r = closeIn(type, range + 140, LONG_RUN);
      expect(r.state, 'still fighting at the end').toBe('ATTACKING');
      expect(r.firedCadences, 'the re-arm must not stop it attacking').toBeGreaterThan(5);
      /*
       * ⭐ THE ASSERTION THAT WOULD HAVE CAUGHT THE OLD BEHAVIOUR. Measured on the pre-fix tree the
       * archer lost ~65 px of a 220 px standoff in this many cadences, i.e. ~30 %. Holding within
       * 10 % is comfortably inside the fixed behaviour (which loses only the sub-pixel residue of
       * the single approach impulse) and comfortably outside the broken one.
       */
      // Settles ON the ring: STANDOFF_RANGE_FRACTION of the range, within a damping tolerance.
      const ring = range * STANDOFF_RANGE_FRACTION;
      expect(r.settledMin, `${type} crept inward`).toBeGreaterThan(ring * 0.8);
      expect(r.endDist, `${type} drifted out of its own reach`).toBeLessThanOrEqual(range + 1);
    });
  }

  it('and it is not vacuous — a MELEE goblin still closes all the way to contact', () => {
    // The fix is gated on `holdsRange`, so every melee unit must be untouched. If this ever starts
    // holding a standoff, the flag has leaked to configs it was explicitly kept away from.
    const r = closeIn('goblinMelee', 320, LONG_RUN);
    expect(r.endDist).toBeLessThan(GOBLIN_ATTACK_RANGE);
    expect(CREATURE_CONFIGS.goblinMelee.holdsRange).toBe(false);
  });

  it('exactly two configs hold their range, and they are the two RANGED goblins', () => {
    // Pins the blast radius of the fix. The Voltkin (attackRange 180) and the lightning drone would
    // both be caught by a naive `attackRange > melee` predicate, and their replays are pinned
    // byte-exact by save.replay.test.ts — so this is the assertion that keeps them out of it.
    const holders = Object.entries(CREATURE_CONFIGS)
      .filter(([, c]) => c.holdsRange)
      .map(([k]) => k)
      .sort();
    expect(holders).toEqual(['goblinArcher', 'goblinBat']);
    expect(CREATURE_CONFIGS.voltkin.holdsRange).toBe(false);
    expect(CREATURE_CONFIGS.lightningDrone.holdsRange).toBe(false);
  });

  it('a standoff fighter still DAMAGES what it is shooting at', () => {
    // The re-arm keeps the creature in ATTACKING permanently, so the one thing that could quietly
    // break is the strike itself — the fire dispatch is keyed on `ticksInState === attackFireTick`,
    // which the re-arm resets. Proven by damage, not by a state assertion.
    const w = make1v1();
    const victim = addPrimAt(w, 1, 900, 500);
    w.primitives.get(victim.id)!.hp = PRIMITIVE_MAX_HP;
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinArcher',
      ownerPlayerId: asPlayerId(0),
      pos: { x: victim.pos.x - 260, y: victim.pos.y },
      targetPos: { x: victim.pos.x, y: victim.pos.y },
      sourceSpawnerId: null,
    });
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < LONG_RUN; t++) runHostTick(w, d, st);
    const after = w.primitives.get(victim.id);
    expect(after === undefined || after.hp < PRIMITIVE_MAX_HP, 'the shape took damage').toBe(true);
  });
});
