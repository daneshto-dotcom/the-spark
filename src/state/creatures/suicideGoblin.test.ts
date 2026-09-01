/**
 * SPARK — S158 P3 (CF-S157-e): **the terrorist goblin was flying the lightning drone's mission.**
 *
 * `GOBLIN_SUICIDE_CONFIG` sets BOTH `selfExplode: true` and `targetsStructures: true`, and the host
 * tick tested `selfExplode` first — so the suicide goblin took the drone's branch end to end. It
 * navigated to enemy CONNECTORS instead of shapes, detonated through `applyDroneExplode`, which
 * severs bonds and never reads atk/pen, and used the drone's 110 px radius instead of its own 70 px.
 *
 * ⛔ THE PART THAT MATTERS: its 4 ATK / 0 PEN applied to **nothing at all**. Not a tuning problem —
 * a whole unit whose only stats were unreachable, in a game where every other unit's stats are the
 * owner's own dictated numbers.
 *
 * Every test below fails against the pre-fix code, and the last one is the control that keeps the
 * fix honest: the lightning drone must be COMPLETELY unaffected, because the change narrows the
 * drone's branch rather than reordering it.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { applySpawnCreature } from './creatureLifecycle.ts';
import { applySuicideBlast } from './suicideBlast.ts';
import { asPlayerId, asPrimitiveId, type BondId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Controls } from '../../input/controls.ts';
import type { Creature } from './creature.ts';
import {
  DRONE_EXPLODE_RADIUS,
  GOBLIN_DAMAGE_VS_PRIMITIVE,
  GOBLIN_SUICIDE_ATK,
  GOBLIN_SUICIDE_BLAST_RADIUS,
  GOBLIN_SUICIDE_PEN,
  PRIMITIVE_MAX_HP,
  SparkType,
} from '../../constants.ts';
import { attackFifths } from '../stats.ts';

/**
 * The blast's unit damage, derived from the OWNER'S OWN NUMBERS through the shared ladder rather
 * than pasted as a literal. R77: *"only one attack that deals 4atk and 0 pierce in an area of
 * effect"* — so if the ladder or the stats move, this test moves with them instead of going red for
 * a reason that is not a bug.
 */
const SUICIDE_BLAST_FIFTHS = attackFifths(GOBLIN_SUICIDE_ATK, GOBLIN_SUICIDE_PEN);

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

/** A 1v1 world pinned to FIGHT — creatures are dormant outside it (S149 P3). */
function make1v1(): World {
  const w = makeWorld(0x5158);
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
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  world.primitives.set(id, prim);
  return prim;
}

/** A bond between two fresh shapes owned by `seat`, centred on (x, y). */
function addBondAt(world: World, seat: 0 | 1, x: number, y: number): BondId {
  const a = addPrimAt(world, seat, x - 10, y);
  const b = addPrimAt(world, seat, x + 10, y);
  const id = world.nextBondId++ as unknown as BondId;
  const bond: Bond = {
    id,
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 20,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
  world.bonds.set(id, bond);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

function spawn(world: World, type: Creature['type'], seat: 0 | 1, x: number, y: number): Creature {
  applySpawnCreature(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type,
    ownerPlayerId: asPlayerId(seat),
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: null,
  });
  const live = [...world.creatures.values()].filter((c) => c.type === type);
  return live[live.length - 1]!;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('S158 P3 — the terrorist goblin NAVIGATES like a goblin, not like a drone', () => {
  it('⭐ commits to an enemy SHAPE and never to a connector (was: the drone branch, bonds only)', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    addPrimAt(w, 1, 900, 500); // a shape, far enough that it is still SEEKING after a few ticks
    addBondAt(w, 1, 905, 520); // and a connector right beside it — the drone's preferred target

    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 40; t++) runHostTick(w, d, st); // past SPAWNING (30), still travelling

    const live = w.creatures.get(bomber.id);
    expect(live, 'the bomber should still be alive and travelling').toBeDefined();
    // BEFORE THE FIX: targetBondId was the connector and targetPrimitiveId stayed null.
    expect(live!.targetPrimitiveId, 'it must commit to a SHAPE').not.toBeNull();
    expect(live!.targetBondId, 'a structure-attacker never commits to a connector').toBeNull();
  });

  it('⭐ arrives and DETONATES, and the enemy shape actually loses hp (was: zero damage, ever)', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    const victim = addPrimAt(w, 1, 620, 500);

    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 400; t++) runHostTick(w, d, st);

    expect(w.creatures.get(bomber.id), 'a suicide unit does not survive its own blast').toBeUndefined();
    const after = w.primitives.get(victim.id);
    // The assertion the old code could never satisfy: applyDroneExplode severs bonds and reads no
    // stats, so this shape came through a detonation at point-blank range completely untouched.
    if (after !== undefined) expect(after.hp).toBeLessThan(PRIMITIVE_MAX_HP);
  });
});

describe('S158 P3 — the blast itself: stats that finally apply to something', () => {
  it('⭐ damages every enemy shape in radius by exactly one goblin strike', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    const near = addPrimAt(w, 1, 520, 500); // 20 px  — inside 70
    const alsoNear = addPrimAt(w, 1, 500, 560); // 60 px — inside 70
    applySuicideBlast(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id });

    for (const p of [near, alsoNear]) {
      expect(w.primitives.get(p.id)!.hp).toBe(PRIMITIVE_MAX_HP - GOBLIN_DAMAGE_VS_PRIMITIVE);
    }
  });

  it('⭐ uses ITS OWN 70 px radius, not the drone\'s 110 — the owner ruled the drone bigger', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    const inside = addPrimAt(w, 1, 500 + GOBLIN_SUICIDE_BLAST_RADIUS - 5, 500);
    const between = addPrimAt(w, 1, 500 + GOBLIN_SUICIDE_BLAST_RADIUS + 20, 500);
    // CONTROL — `between` sits inside the DRONE's radius and outside the goblin's, so it is exactly
    // the shape that separates the two behaviours. Under the old code it would have been hit.
    expect(GOBLIN_SUICIDE_BLAST_RADIUS + 20).toBeLessThan(DRONE_EXPLODE_RADIUS);

    applySuicideBlast(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id });
    expect(w.primitives.get(inside.id)!.hp).toBeLessThan(PRIMITIVE_MAX_HP);
    expect(w.primitives.get(between.id)!.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('⭐ damages enemy UNITS in radius — the half that dealt nothing at all', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    // A Voltkin, not a goblin: its pool is 8 hp × 5 = 40 fifths, so the blast DAMAGES rather than
    // kills and the assertion can read a number instead of an absence. A 2-hp goblin dies outright,
    // which is a weaker (though still passing) form of the same evidence.
    const enemy = spawn(w, 'voltkin', 1, 520, 500);
    const ehpBefore = enemy.ehp;
    expect(ehpBefore, 'the fixture must start with a pool big enough to survive one blast')
      .toBeGreaterThan(SUICIDE_BLAST_FIFTHS);
    applySuicideBlast(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id });

    const after = w.creatures.get(enemy.id);
    expect(after, 'it should survive, so we measure damage rather than absence').toBeDefined();
    // `ehp` is REMAINING EFFECTIVE HIT POINTS IN FIFTHS (S151 P2). This is the assertion the old
    // code could not satisfy at all: `applyDroneExplode` touches `world.bonds` and nothing else, so
    // no creature anywhere ever lost a point to a terrorist goblin.
    expect(after!.ehp).toBe(ehpBefore - SUICIDE_BLAST_FIFTHS);
  });

  it('never harms its OWN side — shapes or units', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    const friendlyShape = addPrimAt(w, 0, 510, 500);
    const friendlyUnit = spawn(w, 'goblinMelee', 0, 515, 500);
    applySuicideBlast(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id });

    expect(w.primitives.get(friendlyShape.id)!.hp).toBe(PRIMITIVE_MAX_HP);
    expect(w.creatures.get(friendlyUnit.id)!.ehp).toBe(friendlyUnit.ehp);
  });

  it('emits ONE BOMB_EXPLODE carrying the goblin\'s radius, and removes the bomber', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    w.effects.length = 0;
    applySuicideBlast(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id });

    const bursts = w.effects.filter((e) => e.kind === 'BOMB_EXPLODE');
    expect(bursts).toHaveLength(1);
    expect((bursts[0] as { radius: number }).radius).toBe(GOBLIN_SUICIDE_BLAST_RADIUS);
    expect(w.creatures.has(bomber.id)).toBe(false);
  });

  it('is idempotent on a bomber that is already gone (the stale fan-out defence)', () => {
    const w = make1v1();
    const bomber = spawn(w, 'goblinSuicide', 0, 500, 500);
    const victim = addPrimAt(w, 1, 520, 500);
    applySuicideBlast(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id });
    const hpAfterOne = w.primitives.get(victim.id)!.hp;
    applySuicideBlast(w, { type: 'SUICIDE_BLAST', creatureId: bomber.id }); // second dispatch
    expect(w.primitives.get(victim.id)!.hp).toBe(hpAfterOne); // no double-hit
  });
});

describe('S158 P3 — CONTROL: the lightning drone is untouched', () => {
  it('⭐ a drone still commits to a CONNECTOR and still severs it — the branch only NARROWED', () => {
    const w = make1v1();
    spawn(w, 'lightningDrone', 0, 500, 500);
    const bondId = addBondAt(w, 1, 560, 500);

    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 400; t++) runHostTick(w, d, st);

    // The drone's identity: it goes for connectors and takes them out. If the fix had REORDERED the
    // branches instead of narrowing the first one, this is what would have broken.
    expect(w.bonds.has(bondId), 'the drone should have severed the connector').toBe(false);
  });

  it('a drone never acquires a primitive commit (targetsStructures is false for it)', () => {
    const w = make1v1();
    const drone = spawn(w, 'lightningDrone', 0, 500, 500);
    addPrimAt(w, 1, 900, 500);
    addBondAt(w, 1, 905, 520);

    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 40; t++) runHostTick(w, d, st);

    const live = w.creatures.get(drone.id);
    expect(live).toBeDefined();
    expect(live!.targetPrimitiveId).toBeNull();
    expect(live!.targetBondId, 'a drone homes on connectors').not.toBeNull();
  });
});

describe('S158 P3 — determinism (the host/mirror obligation for any new dispatch)', () => {
  it('two identical runs with a suicide goblin agree on hashWorldStateFull every tick', () => {
    const build = (): World => {
      const w = make1v1();
      spawn(w, 'goblinSuicide', 0, 500, 500);
      addPrimAt(w, 1, 620, 500);
      addPrimAt(w, 1, 640, 540);
      addBondAt(w, 1, 700, 500);
      return w;
    };
    const a = build();
    const b = build();
    const da = deps(11);
    const db = deps(11);
    const sa = makeHostTickState(a);
    const sb = makeHostTickState(b);
    for (let t = 0; t < 200; t++) {
      runHostTick(a, da, sa);
      runHostTick(b, db, sb);
      expect(hashWorldStateFull(a), `divergence at tick ${t}`).toBe(hashWorldStateFull(b));
    }
  });
});
