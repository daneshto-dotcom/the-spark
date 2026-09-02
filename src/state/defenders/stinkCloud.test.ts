/**
 * SPARK — S158 P6 (CF-S157-b): the landed stink bag.
 *
 * Two things are pinned here, and the second one is the more valuable:
 *
 * 1. **The cloud itself** — a thrown bag leaves a hazard behind, it stinks on the shared DoT beat,
 *    it spares its owner, and it expires. The art for this shipped in S157 and nothing drew it.
 *    ⚠ Its rate is the owner's 0.2 atk/sec since S158 A1 — see the block at the bottom of this file.
 *
 * 2. ⛔ **THE BLIND LOB, WHICH HAD NEVER ONCE FIRED.** S157 B9 implemented the owner's untargeted
 *    throw (*"he should not target any enemies but shoot our at random areas in a radius"*) by
 *    arming WINDUP with a null target — and the WINDUP branch's `targetValid` guard returns false on
 *    a null target by its first line, so every blind lob aborted one tick after arming. The tower
 *    still threw nothing unless an enemy walked within 260 px, which is the exact behaviour B9 was
 *    written to end. The fix shipped, its comment shipped, and the path between them did not.
 *
 *    It was found by the worker-differential's anti-vacuity seeding assertion, not by a test of the
 *    feature: asserting `stinkClouds` SEEDED reported the family empty across 300 frames, and the
 *    reason was that no bag is ever thrown. The test below is the direct carrier it never had.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { applyRadialDamage, damageEntity } from '../damage.ts';
import { applySpawnCreature } from '../creatures/creatureLifecycle.ts';
import {
  makeStinkCloud,
  stinkCloudExpiryTick,
  stinkCloudProgress,
  stinkCloudTick,
  sweepExpiredStinkClouds,
} from './stinkCloud.ts';
import { asPlayerId, asPrimitiveId, asStinkCloudId } from '../../types.ts';
import { enemyStinkCloudInReach } from '../creatures/creatureAI.ts';
import { attackFifths, unitPoolFifths } from '../stats.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import {
  PHYSICS_HZ,
  STINK_AURA_CADENCE_TICKS,
  STINK_AURA_UNIT_FIFTHS,
  PRIMITIVE_MAX_HP,
  SparkType,
  STINK_AURA_DAMAGE,
  STINK_BAG_ATK,
  STINK_BAG_DEF,
  STINK_BAG_HP,
  STINK_BAG_PEN,
  STINK_BAG_RADIUS,
  STINK_CLOUD_LIFETIME_TICKS,
} from '../../constants.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
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
  const w = makeWorld(0x6158);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.creatures.clear();
  return w;
}

function addPrimAt(world: World, seat: 0 | 1, x: number, y: number): Primitive {
  const player = world.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(world.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square,
    placerColor: player.color, placedBy: player.id, createdTick: world.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  world.primitives.set(id, prim);
  return prim;
}

/** A cloud at (500,500) owned by `owner`, landing on the tick the world is currently at. */
function landCloud(w: World, owner = P0, idNum = 0) {
  const id = asStinkCloudId(idNum);
  const c = makeStinkCloud({
    id, pos: { x: 500, y: 500 }, ownerPlayerId: owner,
    landedAtTick: w.tick, radius: STINK_BAG_RADIUS,
  });
  w.stinkClouds.set(id, c);
  return c;
}


/** A Voltkin (pool 64 fifths) so an aura beat DAMAGES rather than kills — measurable, not absent. */
function plantVoltkinAt(w: World, x: number, y: number) {
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: P1,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: null,
  });
  return [...w.creatures.values()].at(-1)!;
}
describe('S158 P6 — a landed bag stinks, on the shared beat', () => {
  it('⭐ damages an ENEMY shape inside the radius on its cadence tick', () => {
    const w = make1v1();
    const victim = addPrimAt(w, 1, 520, 500); // 20 px from the cloud centre
    const c = landCloud(w);
    w.tick = (c.id as unknown as number) % STINK_AURA_CADENCE_TICKS; // land exactly on this cloud's phase
    expect(stinkCloudTick(w, c, applyRadialDamage), 'this must be a cadence tick').toBe(true);
    expect(w.primitives.get(victim.id)!.hp).toBe(PRIMITIVE_MAX_HP - STINK_AURA_DAMAGE);
  });

  it('does NOTHING on an off-cadence tick — the beat is the point, not a per-tick drip', () => {
    const w = make1v1();
    const victim = addPrimAt(w, 1, 520, 500);
    const c = landCloud(w);
    w.tick = ((c.id as unknown as number) % STINK_AURA_CADENCE_TICKS) + 1;
    expect(stinkCloudTick(w, c, applyRadialDamage)).toBe(false);
    expect(w.primitives.get(victim.id)!.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('spares its OWNER — the contract every area hazard in this game holds', () => {
    const w = make1v1();
    const mine = addPrimAt(w, 0, 520, 500);
    const c = landCloud(w, P0);
    w.tick = (c.id as unknown as number) % STINK_AURA_CADENCE_TICKS;
    stinkCloudTick(w, c, applyRadialDamage);
    expect(w.primitives.get(mine.id)!.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('reaches only its OWN radius, which it carries rather than re-reading the constant', () => {
    const w = make1v1();
    const inside = addPrimAt(w, 1, 500 + STINK_BAG_RADIUS - 5, 500);
    const outside = addPrimAt(w, 1, 500 + STINK_BAG_RADIUS + 5, 500);
    const c = landCloud(w);
    w.tick = (c.id as unknown as number) % STINK_AURA_CADENCE_TICKS;
    stinkCloudTick(w, c, applyRadialDamage);
    expect(w.primitives.get(inside.id)!.hp).toBeLessThan(PRIMITIVE_MAX_HP);
    expect(w.primitives.get(outside.id)!.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('phase-spreads by id, so two clouds landing together do not pulse on one tick', () => {
    // The property that keeps a barrage from spiking a frame. Ids 0 and 1 have different phases.
    const w = make1v1();
    const a = makeStinkCloud({ id: asStinkCloudId(0), pos: { x: 0, y: 0 }, ownerPlayerId: P0, landedAtTick: 0, radius: 90 });
    const b = makeStinkCloud({ id: asStinkCloudId(1), pos: { x: 0, y: 0 }, ownerPlayerId: P0, landedAtTick: 0, radius: 90 });
    w.tick = 0;
    expect(stinkCloudTick(w, a, applyRadialDamage)).toBe(true);
    expect(stinkCloudTick(w, b, applyRadialDamage)).toBe(false);
  });

  it('expires after exactly STINK_CLOUD_LIFETIME_TICKS, and the sweep removes it', () => {
    const w = make1v1();
    const c = landCloud(w);
    expect(stinkCloudExpiryTick(c)).toBe(c.landedAtTick + STINK_CLOUD_LIFETIME_TICKS);
    w.tick = stinkCloudExpiryTick(c) - 1;
    sweepExpiredStinkClouds(w);
    expect(w.stinkClouds.size, 'one tick short — still stinking').toBe(1);
    w.tick = stinkCloudExpiryTick(c);
    sweepExpiredStinkClouds(w);
    expect(w.stinkClouds.size).toBe(0);
  });

  it('progress runs 0 → 1 and CLAMPS at both ends (the renderer divides by it)', () => {
    const c = makeStinkCloud({ id: asStinkCloudId(0), pos: { x: 0, y: 0 }, ownerPlayerId: P0, landedAtTick: 100, radius: 90 });
    expect(stinkCloudProgress(c, 50)).toBe(0); // before it landed (a rewound replay)
    expect(stinkCloudProgress(c, 100)).toBe(0);
    expect(stinkCloudProgress(c, 100 + STINK_CLOUD_LIFETIME_TICKS / 2)).toBeCloseTo(0.5);
    expect(stinkCloudProgress(c, 100 + STINK_CLOUD_LIFETIME_TICKS)).toBe(1);
    expect(stinkCloudProgress(c, 10_000)).toBe(1);
  });
});

describe('S158 P6 — ⛔ THE BLIND LOB, which had never once fired', () => {
  /**
   * Builds a real stink tower through the real reducer, exactly as the worker-differential harness
   * does: the geometry has to be genuinely on the board or the host re-validation poll tears the
   * defender down within a tick.
   */
  function worldWithStinkTower(): World {
    const w = make1v1();
    const player = w.players.get(P0)!;
    const mk = (type: SparkType, x: number, y: number): Primitive => {
      const id = asPrimitiveId(w.nextPrimitiveId++);
      const prim: Primitive = {
        id, type, placerColor: player.color, placedBy: P0, createdTick: w.tick,
        pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
        lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
      };
      w.primitives.set(id, prim);
      return prim;
    };
    // 1 Square hub + 3 Circle leaves — the shipped stinkTower recipe.
    const hub = mk(SparkType.Square, 760, 300);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const leaf = mk(SparkType.Circle, 760 + Math.cos(ang) * 40, 300 + Math.sin(ang) * 40);
      const bondId = w.nextBondId++ as unknown as never;
      w.bonds.set(bondId, {
        id: bondId, aId: hub.id, bId: leaf.id, a: hub, b: leaf,
        restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
      } as never);
      hub.bonds.add(bondId);
      leaf.bonds.add(bondId);
    }
    dispatch(w, {
      type: 'REGISTER_DEFENDER', defenderKind: 'stinkTower', ownerPlayerId: P0,
      anchorPrimitiveId: hub.id, recipeId: 'stinkTower', pos: { x: 760, y: 300 },
    });
    return w;
  }

  it('⭐ a tower with NO enemy in range still throws — and the bag stays on the ground', () => {
    const w = worldWithStinkTower();
    expect(w.defenders.size, 'the tower must survive re-validation, or this proves nothing').toBe(1);
    const before = [...w.defenders.values()][0]!.bagsRemaining;

    const d = deps();
    const st = makeHostTickState(w);
    // Long enough for the first cadence (STINK_THROW_INTERVAL_TICKS 240) plus its wind-up.
    for (let t = 0; t < 320; t++) runHostTick(w, d, st);

    // BEFORE THE FIX both of these were 0/unchanged: WINDUP armed with a null target and the
    // `targetValid` guard aborted it one tick later, every single time, forever.
    expect([...w.defenders.values()][0]!.bagsRemaining, 'a bag must actually have been spent').toBeLessThan(before);
    expect(w.stinkClouds.size, 'and it must have left a cloud behind').toBeGreaterThan(0);
  });

  it('the cloud outlives its TOWER — a hazard, not an aura', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 320; t++) runHostTick(w, d, st);
    expect(w.stinkClouds.size).toBeGreaterThan(0);

    // Raze the tower outright. The ground it fouled must stay foul — which is why the cloud loop
    // lives beside the defender fan-out rather than inside it.
    w.defenders.clear();
    runHostTick(w, d, st);
    expect(w.stinkClouds.size).toBeGreaterThan(0);
  });

  it('CONTROL — clouds are swept, so they cannot accumulate for the whole match', () => {
    const w = worldWithStinkTower();
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 900; t++) runHostTick(w, d, st);
    // A lifetime is exactly one throw interval, so the population self-limits at one or two rather
    // than growing with every bag. If the sweep were dropped this would climb with the bag count.
    expect(w.stinkClouds.size).toBeLessThanOrEqual(2);
  });

  it('⭐ is DETERMINISTIC: two identical runs agree on hashWorldStateFull every tick', () => {
    const a = worldWithStinkTower();
    const b = worldWithStinkTower();
    const da = deps(21);
    const db = deps(21);
    const sa = makeHostTickState(a);
    const sb = makeHostTickState(b);
    for (let t = 0; t < 320; t++) {
      runHostTick(a, da, sa);
      runHostTick(b, db, sb);
      expect(hashWorldStateFull(a), `divergence at tick ${t}`).toBe(hashWorldStateFull(b));
    }
    expect(a.stinkClouds.size, 'and the run must actually have produced clouds').toBeGreaterThan(0);
  });
});

describe('S158 P6 — teardown', () => {
  it('clouds clear on GODLY_ABORT alongside every other entity family', () => {
    const w = make1v1();
    landCloud(w);
    expect(w.stinkClouds.size).toBe(1);
    dispatch(w, { type: 'GODLY_ABORT' });
    expect(w.stinkClouds.size).toBe(0);
    expect(w.nextStinkCloudId).toBe(0);
  });

  it('and on RETURN_TO_TITLE — no cloud survives into the next match', () => {
    const w = make1v1();
    landCloud(w);
    dispatch(w, { type: 'RETURN_TO_TITLE' });
    expect(w.stinkClouds.size).toBe(0);
  });

  it('CONTROL — P1 is not spared by a P0 cloud (the spare is OWNER-scoped, not global)', () => {
    const w = make1v1();
    const theirs = addPrimAt(w, 1, 505, 500);
    const c = landCloud(w, P1); // owned by the OTHER seat this time
    w.tick = (c.id as unknown as number) % STINK_AURA_CADENCE_TICKS;
    stinkCloudTick(w, c, applyRadialDamage);
    expect(w.primitives.get(theirs.id)!.hp, 'P1 owns this shape and owns the cloud').toBe(PRIMITIVE_MAX_HP);
  });
});

describe('S158 A1 — the aura is the OWNER\u2019S 0.2 atk/sec, and the shipped rate was 12\u00d7 it', () => {
  /**
   * Owner, reviewing the batch: *"ive already defined how the towers aura should be when we first
   * spoke about their aura and everything (i gave you the stats of the aura and everything)."*
   *
   * They had. `.claude/plans-archive/2026-08-22_PDR_S151_BATCH_COMPLETED.md`, in the list of R77
   * mechanics deferred for later implementation: *"the stink tree's **0.2 atk/sec** aura model"*.
   *
   * ⛔ THE SHIPPED RATE WAS 2.4 atk/sec. `stinkAuraTick` fired on the shared 0.5 s DoT beat for
   * `attackFifths(1,1)` = 6 fifths = 1.2 atk, twice a second. S158 P6 then handed the same numbers to
   * the landed bag ARGUING they were already owner-ruled. They were not. This test is the carrier
   * that argument should have had.
   */
  it('\u2b50 one fifth per second \u2014 0.2 atk/sec exactly, in the units the ladder uses', () => {
    // 1 fifth = 0.2 atk by construction (FIFTHS = 5), so this pins the owner's number itself rather
    // than a constant that happens to equal it today.
    expect(STINK_AURA_UNIT_FIFTHS / 5).toBeCloseTo(0.2);
    expect(STINK_AURA_CADENCE_TICKS).toBe(PHYSICS_HZ); // ...per SECOND
  });

  it('\u2b50 the rate is INTEGRAL, which is why the beat is a second and not the shared half-second', () => {
    // `damageEntity` throws on a fractional amount by design. Half a fifth per half-second is the
    // same rate and is not expressible, so the cadence had to move rather than the number.
    expect(Number.isInteger(STINK_AURA_UNIT_FIFTHS)).toBe(true);
    expect(STINK_AURA_UNIT_FIFTHS).toBeGreaterThan(0);
  });

  it('\u2b50 a landed bag applies exactly that, once a second \u2014 not the old 6 fifths twice a second', () => {
    const w = make1v1();
    const enemy = plantVoltkinAt(w, 500, 500);
    const c = landCloud(w);
    const before = enemy.ehp;
    // Sweep two full seconds and count what actually lands.
    let applications = 0;
    for (let t = 0; t < 2 * PHYSICS_HZ; t++) {
      w.tick = t;
      if (stinkCloudTick(w, c, applyRadialDamage)) applications++;
    }
    expect(applications, 'twice in two seconds, not four times').toBe(2);
    expect(
      before - w.creatures.get(enemy.id)!.ehp,
      'and two seconds of standing in it costs 2 fifths, not 24',
    ).toBe(2 * STINK_AURA_UNIT_FIFTHS);
  });

  it('\u26d4 CONTROL \u2014 the old rate would have been 12\u00d7 this, so the fix is not cosmetic', () => {
    const OLD_FIFTHS_PER_SECOND = 6 * 2; // attackFifths(1,1) on the 0.5 s DoT beat
    const nowPerSecond = STINK_AURA_UNIT_FIFTHS * (PHYSICS_HZ / STINK_AURA_CADENCE_TICKS);
    expect(OLD_FIFTHS_PER_SECOND / nowPerSecond).toBe(12);
  });
});

describe('S158 A2 (owner R77) — a landed bag is DESTRUCTIBLE and BURSTS when killed', () => {
  /**
   * R77's deferred-mechanics list, verbatim: *"destructible stink bags as entities with aggro and
   * on-destroy damage"*, and `STINK_BAG_ATK`'s own comment carries the owner's other half — a bag
   * deals *"1atk 1pierce when destroyed"*. S158 P6 shipped the entity and left it PASSIVE; these are
   * the two properties that were missing.
   */
  it('⭐ a fresh bag carries a real pool off the shared ladder', () => {
    const w = make1v1();
    expect(landCloud(w).ehp).toBe(unitPoolFifths(STINK_BAG_HP, STINK_BAG_DEF));
  });

  it('⭐ damage subtracts, and the kill is reported only on the blow that lands it', () => {
    const w = make1v1();
    const c = landCloud(w);
    const pool = c.ehp;
    expect(damageEntity(w, { kind: 'stinkCloud', id: c.id }, pool - 1, 'creature')).toBe(false);
    expect(w.stinkClouds.get(c.id)!.ehp).toBe(1);
    expect(damageEntity(w, { kind: 'stinkCloud', id: c.id }, 1, 'creature')).toBe(true);
    expect(w.stinkClouds.has(c.id), 'and the arm REMOVES it — the contract in full').toBe(false);
  });

  it('⭐ BURSTS when destroyed, for the owner’s 1 atk / 1 pierce', () => {
    const w = make1v1();
    const victim = plantVoltkinAt(w, 520, 500); // inside the 90 px bag radius
    const c = landCloud(w); // owned by P0; the Voltkin is P1's
    const before = victim.ehp;
    damageEntity(w, { kind: 'stinkCloud', id: c.id }, c.ehp, 'creature');
    expect(
      w.creatures.get(victim.id)!.ehp,
      'the unit standing in it eats the burst',
    ).toBe(before - attackFifths(STINK_BAG_ATK, STINK_BAG_PEN));
  });

  it('⭐ the burst spares the BAG’S OWNER, not the killer — you cannot safely clear your own', () => {
    const w = make1v1();
    // A P0 unit standing on a P0 bag: popping it must not hurt P0.
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: P0,
      pos: { x: 520, y: 500 }, targetPos: { x: 520, y: 500 }, sourceSpawnerId: null,
    });
    const mine = [...w.creatures.values()].at(-1)!;
    const before = mine.ehp;
    const c = landCloud(w, P0);
    damageEntity(w, { kind: 'stinkCloud', id: c.id }, c.ehp, 'creature');
    expect(w.creatures.get(mine.id)!.ehp).toBe(before);
  });

  it('emits ONE visible burst at the bag’s own radius', () => {
    const w = make1v1();
    const c = landCloud(w);
    w.effects.length = 0;
    damageEntity(w, { kind: 'stinkCloud', id: c.id }, c.ehp, 'creature');
    const bursts = w.effects.filter((e) => e.kind === 'BOMB_EXPLODE');
    expect(bursts).toHaveLength(1);
    expect((bursts[0] as { radius: number }).radius).toBe(STINK_BAG_RADIUS);
  });

  it('is idempotent on a bag already gone', () => {
    const w = make1v1();
    const c = landCloud(w);
    damageEntity(w, { kind: 'stinkCloud', id: c.id }, c.ehp, 'creature');
    expect(damageEntity(w, { kind: 'stinkCloud', id: c.id }, 999, 'creature')).toBe(false);
  });

  it('⭐ a UNIT finds an enemy bag in reach — and never its own side’s', () => {
    const w = make1v1();
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P1,
      pos: { x: 510, y: 500 }, targetPos: { x: 510, y: 500 }, sourceSpawnerId: null,
    });
    const g = [...w.creatures.values()].at(-1)!;
    const theirs = landCloud(w, P0); // P0's bag, so P1's goblin may hit it
    expect(enemyStinkCloudInReach(w, g, 60)).toBe(theirs.id);
    w.stinkClouds.clear();
    landCloud(w, P1); // its OWN side's bag
    expect(enemyStinkCloudInReach(w, g, 60)).toBeNull();
  });

  it('reach is measured to the BAG, not to the edge of its smell', () => {
    // Otherwise an archer pops bags from outside the thing that makes them dangerous, which removes
    // the trade the owner asked for.
    const w = make1v1();
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P1,
      pos: { x: 500 + STINK_BAG_RADIUS - 5, y: 500 }, targetPos: { x: 0, y: 0 }, sourceSpawnerId: null,
    });
    const g = [...w.creatures.values()].at(-1)!;
    landCloud(w, P0);
    expect(enemyStinkCloudInReach(w, g, 35), 'inside the cloud, but not at the bag').toBeNull();
  });

  it('⭐ END TO END — a goblin standing on an enemy bag pops it through the real host tick', () => {
    const w = make1v1();
    const c = landCloud(w, P0); // P0's bag
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P1,
      pos: { x: 505, y: 500 }, targetPos: { x: 505, y: 500 }, sourceSpawnerId: null,
    });
    const d = deps();
    const st = makeHostTickState(w);
    /*
     * ⛔ THE WINDOW IS SHORTER THAN THE BAG'S OWN LIFETIME, AND THE FIRST VERSION WAS NOT.
     *
     * It ran 400 ticks against a 240-tick lifetime, so the bag vanished on its own timer and the
     * assertion passed whatever the goblin did — a mutation test proved it by deleting the strike
     * arm entirely and staying green. Stopping well short of expiry means only a KILL can end it.
     */
    const beforeExpiry = STINK_CLOUD_LIFETIME_TICKS - 40;
    let gone = false;
    for (let t = 0; t < beforeExpiry && !gone; t++) {
      runHostTick(w, d, st);
      gone = !w.stinkClouds.has(c.id);
    }
    // BEFORE A2 the bag was passive: no pool, no strike clause, nothing to hit. A unit could stand
    // in it until it expired on its own timer.
    expect(gone, 'a unit must be able to clear the ground it needs to walk over').toBe(true);
    expect(w.tick, 'and it must be a KILL, not the bag timing out').toBeLessThan(STINK_CLOUD_LIFETIME_TICKS);
  });
});
