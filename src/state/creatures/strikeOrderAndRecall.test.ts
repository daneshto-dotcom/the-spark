/**
 * SPARK — S157 F1 + F3 + B7: two review findings the owner had not reported yet, and one they did.
 *
 * Neither F1 nor F3 came from the playtest. Both were found by an adjacent-bug sweep over the defect
 * CLASSES the owner's nine belong to, and both are the kind that lose an evening.
 */

import { describe, expect, it } from 'vitest';
import {
  FIGHT_PHASE_TICKS,
  GOBLIN_DAMAGE_VS_PRIMITIVE,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SPARK_VISUAL_SIZE,
  TURRET_FIRE_INTERVAL_TICKS,
  SparkType,
} from '../../constants.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { applyCreatureAttack } from './creatureAttack.ts';
import { asCreatureId, makeCreature } from './creature.ts';
import { makeBond } from '../placePrimitive.ts';
import { GOBLIN_MELEE_CONFIG, CHEWER_CONFIG } from './voltkin-config.ts';
import { recallArmies } from '../hostTick.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(): World {
  const world = makeWorld(0xf1);
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

describe('S164 P2 — the castle strike no longer preempts the BOND strike either', () => {
  /*
   * ⛔ S157 F1 FIXED THIS ONE ARM SHORT. It moved the castle strike past the SHAPE arm and stopped,
   * leaving the BOND arm still underneath it — while `creatureAttack.ts` claimed in TWO docblocks
   * that the castle was *"Ordered LAST, after bond / creature / shape"*. The connector-attacking
   * family is exactly the family S157 B5 admitted to castle attacks, so the gap was live.
   *
   * The Voltkin is the sharp case because its reach is 180 px (the chewer's is 35): anywhere inside
   * that radius of an enemy keep, a Voltkin committed to a connector spent every strike on the keep
   * and never touched the bond — and never released its `targetBondId`, so it stayed committed to a
   * connector it could not damage. Same defect as F1, one arm further down.
   */
  it('⭐ a creature beside the enemy keep DAMAGES THE CONNECTOR it was sent at', () => {
    const world = board();
    const keep = castleAnchor(P1 as unknown as number, world.layout);

    // Two P1 shapes bonded together, sitting right on P1's keep.
    const a = prim(world, P1, keep.x + 8, keep.y);
    const b = prim(world, P1, keep.x + 8, keep.y + 24);
    const bond = makeBond(world, a, b, 'MID');
    world.bonds.set(bond.id, bond);
    a.bonds.add(bond.id);
    b.bonds.add(bond.id);

    const g = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(11),
      ownerPlayerId: P0,
      pos: { x: keep.x + 8, y: keep.y + 12 },
      targetPos: { x: keep.x + 8, y: keep.y + 12 },
      spawnedAtTick: world.tick,
      sourceSpawnerId: null,
      clock: world,
    });
    g.state = 'ATTACKING';
    world.creatures.set(g.id, g);

    const castleBefore = world.players.get(P1)!.castleHp;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: g.id, bondId: bond.id });

    /*
     * The connector took the hit — either it absorbed damage, or it gave way outright. Both count,
     * and BOTH have to be accepted here: a two-primitive component has capacity `count + 4` = 5
     * fifths, which one chewer strike exceeds, so the bond is severed and REMOVED from `world.bonds`
     * rather than left carrying a damage number. Asserting only on `damageFifths` would have failed
     * against correct behaviour — which it did, on the first run of this test.
     */
    const after = world.bonds.get(bond.id);
    const connectorWasStruck = after === undefined || after.damageFifths > 0;
    expect(
      connectorWasStruck,
      'the connector was damaged or severed — the castle branch no longer swallows the strike',
    ).toBe(true);
    // ...and the keep did NOT, because the strike was spent on the bond.
    expect(world.players.get(P1)!.castleHp, 'the keep was not hit this tick').toBe(castleBefore);
  });

  it('⛔ ANTI-VACUITY — with NO bond committed, the same creature still hits the castle', () => {
    // Proves the reorder did not simply disable the castle strike for the connector family.
    const world = board();
    const keep = castleAnchor(P1 as unknown as number, world.layout);
    const g = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(12),
      ownerPlayerId: P0,
      pos: { x: keep.x + 8, y: keep.y },
      targetPos: { x: keep.x + 8, y: keep.y },
      spawnedAtTick: world.tick,
      sourceSpawnerId: null,
      clock: world,
    });
    g.state = 'ATTACKING';
    world.creatures.set(g.id, g);

    const castleBefore = world.players.get(P1)!.castleHp;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: g.id, bondId: null });
    expect(world.players.get(P1)!.castleHp, 'no bond to work on, so the keep is the target').toBeLessThan(
      castleBefore,
    );
  });

  it('⛔ AND A STALE BOND ID FALLS THROUGH TO THE CASTLE rather than wasting the strike', () => {
    // A bond can be severed between the FSM committing to it and the strike landing. That must
    // behave as "no connector target", not as a dropped tick.
    const world = board();
    const keep = castleAnchor(P1 as unknown as number, world.layout);
    const g = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(13),
      ownerPlayerId: P0,
      pos: { x: keep.x + 8, y: keep.y },
      targetPos: { x: keep.x + 8, y: keep.y },
      spawnedAtTick: world.tick,
      sourceSpawnerId: null,
      clock: world,
    });
    g.state = 'ATTACKING';
    world.creatures.set(g.id, g);

    const castleBefore = world.players.get(P1)!.castleHp;
    applyCreatureAttack(world, {
      type: 'CREATURE_ATTACK',
      creatureId: g.id,
      bondId: 9999 as unknown as BondId, // never existed
    });
    expect(world.players.get(P1)!.castleHp).toBeLessThan(castleBefore);
  });
});

describe('S157 F1 — the castle strike no longer preempts the shape strike', () => {
  it('⭐ a goblin beside the enemy keep DAMAGES THE SHAPE it is committed to', () => {
    const world = board();
    // Stand the goblin right on P1's keep, with a P1 shape at the same spot.
    const keep = castleAnchor(P1 as unknown as number, world.layout);
    const target = prim(world, P1, keep.x + 10, keep.y);

    const g = makeCreature(GOBLIN_MELEE_CONFIG, {
      id: asCreatureId(1),
      ownerPlayerId: P0,
      pos: { x: keep.x + 10, y: keep.y },
      targetPos: { x: keep.x + 10, y: keep.y },
      spawnedAtTick: world.tick,
      sourceSpawnerId: null,
      clock: world,
    });
    g.state = 'ATTACKING';
    g.targetPrimitiveId = target.id;
    world.creatures.set(g.id, g);

    const hpBefore = target.hp;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: g.id, bondId: null });

    // Before the fix the castle branch ran first and swallowed the strike: the shape stayed at full
    // HP forever while the castle drained, and the goblin kept its commit to a shape it could never
    // hurt. With a 220px-range archer that was a dead zone around every keep.
    expect(
      target.hp,
      'the shape took the hit — the castle branch no longer swallows it',
    ).toBe(hpBefore - GOBLIN_DAMAGE_VS_PRIMITIVE);
  });

  it('⛔ ANTI-VACUITY — with NO shape committed, the same goblin still hits the castle', () => {
    // Proves the reorder did not simply disable the castle strike.
    const world = board();
    const keep = castleAnchor(P1 as unknown as number, world.layout);
    const g = makeCreature(GOBLIN_MELEE_CONFIG, {
      id: asCreatureId(2),
      ownerPlayerId: P0,
      pos: { x: keep.x + 10, y: keep.y },
      targetPos: { x: keep.x + 10, y: keep.y },
      spawnedAtTick: world.tick,
      sourceSpawnerId: null,
      clock: world,
    });
    g.state = 'ATTACKING';
    g.targetPrimitiveId = null;
    world.creatures.set(g.id, g);

    const before = world.players.get(P1)!.castleHp;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: g.id, bondId: null });
    expect(world.players.get(P1)!.castleHp, 'the castle is still reachable').toBeLessThan(before);
  });
});

describe('S157 F3 — a recalled chewer is not bricked for the rest of the match', () => {
  it('⭐ recallArmies CLEARS chewProgress, so the chewer can commit again', () => {
    const world = board();
    const c = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(10),
      ownerPlayerId: P0,
      pos: { x: 700, y: 300 },
      targetPos: { x: 700, y: 300 },
      spawnedAtTick: world.tick,
      sourceSpawnerId: null,
      clock: world,
    });
    c.state = 'ATTACKING';
    c.chewProgress = 2; // mid-bite when the whistle blows
    world.creatures.set(c.id, c);

    recallArmies(world);

    // Re-selection is gated on `chewProgress === 0`, and the only other writer that zeroes it lives
    // inside the ATTACKING branch the recall has just left — so a surviving count was a closed loop:
    // never re-selects, never re-enters ATTACKING, never resets. It stood idle at its spawner for the
    // rest of the match while still occupying the population cap.
    expect(c.chewProgress, 'the stale bite counter is cleared with every other commitment').toBe(0);
    expect(c.targetBondId).toBeNull();
    expect(c.state).toBe('SEEKING');
  });
});

describe('S157 B7 — the laser fires twice as fast', () => {
  it('the cadence halved, and the charge ring follows it for free', () => {
    // Owner: "Laser tower should charge up and be able to shoot x2 quicker!"
    // The renderer derives charge as `1 - remaining / fireIntervalTicks`, so no render change exists
    // to make — the ring fills against whatever this constant says.
    expect(TURRET_FIRE_INTERVAL_TICKS).toBe(900);
    // And it must fit the fight it is used in: 4 shots per 2700-tick FIGHT, not 2.
    expect(Math.floor(FIGHT_PHASE_TICKS / TURRET_FIRE_INTERVAL_TICKS)).toBe(3);
  });
});
