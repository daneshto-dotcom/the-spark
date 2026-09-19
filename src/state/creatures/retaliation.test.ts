/**
 * SPARK — S183: **RETALIATION.** One `describe` per owner ruling, plus the determinism case the
 * whole design was shaped around.
 *
 * ⚠ EVERY BEHAVIOURAL CASE ASSERTS BOTH HALVES, per `unitFirstTargeting.test.ts`'s rule: *"a
 * one-sided assertion on a priority change is not evidence"*. "The bomber retaliates" is also
 * satisfied by a build where EVERYTHING retaliates, so the chewer case is its negative; "it does
 * not go back" is also satisfied by a build where nothing re-targets at all, so the re-pick case
 * asserts WHICH target it lands on.
 *
 * ⛔ AND THE READS GO THROUGH THE SHIPPED SELECTOR, NOT THROUGH THE FIELD ALONE. S182's lesson is
 * that *"a source-text guard proves a line EXISTS. It cannot prove the line is REACHED."* The same
 * hole exists for a state assertion: `targetCreatureId === attacker.id` proves the write happened,
 * not that the AI consumes it. So the cases that matter re-read the write through `pickNavUnit`
 * and through `applyCreatureTick` — the two shipped consumers that decide whether the unit
 * actually walks to, and keeps, its attacker.
 */

import { describe, expect, it } from 'vitest';
import {
  GOBLIN_UNIT_ACQUIRE_RADIUS,
  GOBLIN_UNIT_LEASH_RADIUS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  PRINCESS_DEF,
  PRINCESS_HP,
  SparkType,
} from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import type { Primitive } from '../../game/primitive.ts';
import { asCreatureId, asDefenderId, asPlayerId, asPrimitiveId } from '../../types.ts';
import { applyRadialDamage, damageEntity } from '../damage.ts';
import { makeDefender } from '../defenders/defender.ts';
import { CREATURE_TARGETS, DEFENDER_TARGETS, attackFifths, unitPoolFifths } from '../stats.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeCreature, type Creature, type CreatureType } from './creature.ts';
import { pickNavUnit } from './creatureAI.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import type { Controls } from '../../input/controls.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { mulberry32 } from '../rng.ts';
import { applySpawnCreature, applyCreatureTick } from './creatureLifecycle.ts';
import { NEVER_RETALIATES, creatureRetaliates } from './retaliation.ts';
import {
  CHEWER_CONFIG,
  GOBLIN_ARCHER_CONFIG,
  GOBLIN_MELEE_CONFIG,
  GOBLIN_SUICIDE_CONFIG,
  LIGHTNING_DRONE_CONFIG,
  VOLTKIN_CONFIG,
  getCreatureConfig,
  type CreatureConfig,
} from './voltkin-config.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const ACQ_SQ = GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS;
const LEASH_SQ = GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS;
/** One melee-goblin swing, off the one ladder. Never enough to fell a 2-def goblin outright. */
const SWING = attackFifths(GOBLIN_MELEE_CONFIG.atk, GOBLIN_MELEE_CONFIG.pen);

function setupWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

function addUnit(
  world: World,
  config: CreatureConfig,
  id: number,
  owner: typeof P0,
  x: number,
  y: number,
): Creature {
  const c = makeCreature(config, {
    id: asCreatureId(id),
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
    sourceSpawnerId: null,
  });
  c.state = 'SEEKING';
  // A pool deep enough that the test's swings are never lethal — retaliation is only recorded on a
  // victim that SURVIVED (the S155 deferral note in `damageEntity`), so a one-shot fixture would
  // measure nothing and look like a missing feature.
  c.ehp = 10_000;
  world.creatures.set(c.id, c);
  return c;
}

/** Wire `attacker` up as genuinely committed to `victim` — the state the strike arm dispatches from. */
function commit(attacker: Creature, victim: Creature): void {
  attacker.state = 'ATTACKING';
  attacker.targetCreatureId = victim.id;
}

function hit(world: World, victim: Creature, attacker: Creature): void {
  damageEntity(world, { kind: 'creature', id: victim.id }, SWING, 'creature', {
    kind: 'creature',
    id: attacker.id,
  });
}

describe('S183 R183-B — the pencil chewer NEVER retaliates', () => {
  it('a chewer under attack keeps its null creature target', () => {
    const w = setupWorld();
    const chewer = addUnit(w, CHEWER_CONFIG, 1, P0, 0, 0);
    const attacker = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0);
    commit(attacker, chewer);

    hit(w, chewer, attacker);

    expect(chewer.targetCreatureId).toBeNull();
    expect(chewer.ehp).toBeLessThan(10_000); // the blow DID land — this is not a no-op fixture
  });

  it('is the ONLY exception, and it is a NAMED one rather than a category', () => {
    // ⛔ The owner OVERRULED "buildings-only attackers do not retaliate" (R183-D). Pinning the set
    // at one member is what stops a future session re-deriving the category he refused.
    expect([...NEVER_RETALIATES]).toEqual(['chewer']);
    const others = (Object.keys(CREATURE_TARGETS) as CreatureType[]).filter((t) => t !== 'chewer');
    expect(others.length).toBeGreaterThan(20); // the enumeration is real, not an empty loop
    for (const type of others) expect(creatureRetaliates(type)).toBe(true);
  });
});

describe('S183 R183-D — the suicide bomber DOES retaliate', () => {
  it('turns on its attacker even though it is a buildings-first unit', () => {
    const w = setupWorld();
    const bomber = addUnit(w, GOBLIN_SUICIDE_CONFIG, 1, P0, 0, 0);
    const attacker = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0);
    commit(attacker, bomber);

    hit(w, bomber, attacker);

    expect(bomber.targetCreatureId).toBe(attacker.id);
  });

  it('shares the chewer’s buildings-first flag, which is why the category reading is wrong', () => {
    // Both are `targetsStructures`; the owner ruled them OPPOSITE ways. Any predicate over the
    // flag would have to get one of them wrong, and this line is what says so mechanically.
    expect(GOBLIN_SUICIDE_CONFIG.targetsStructures).toBe(true);
    expect(creatureRetaliates('goblinSuicide')).toBe(true);
    expect(creatureRetaliates('chewer')).toBe(false);
  });
});

describe('S183 — "targeting a building, then it is attacked" (the owner’s own example)', () => {
  it('an in-reach attacker is taken WITHOUT breaking the wind-up, and survives the FSM re-check', () => {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    victim.state = 'ATTACKING';
    victim.targetPrimitiveId = asPrimitiveId(77); // committed to a shape
    const attacker = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0); // inside the 35 px arm
    commit(attacker, victim);

    hit(w, victim, attacker);

    expect(victim.targetCreatureId).toBe(attacker.id);
    // The wind-up is NOT reset: a victim whose attacker is already in reach hits back on its own
    // fire tick. Resetting here would let a swarm hold it in a cadence it can never finish.
    expect(victim.state).toBe('ATTACKING');
    expect(victim.ticksInState).toBe(0);

    // ⭐ REACHED, not merely written: the shipped ATTACKING re-validation KEEPS an in-range target.
    applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: victim.id });
    expect(victim.targetCreatureId).toBe(attacker.id);
  });

  it('an OUT-OF-REACH attacker breaks the commitment so navigation can close', () => {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    victim.state = 'ATTACKING';
    victim.ticksInState = 12;
    victim.targetPrimitiveId = asPrimitiveId(77);
    // An ARCHER shoots from 200 px — well outside the melee victim's own 35 px arm.
    const archer = addUnit(w, GOBLIN_ARCHER_CONFIG, 2, P1, 200, 0);
    commit(archer, victim);

    hit(w, victim, archer);

    expect(victim.targetCreatureId).toBe(archer.id);
    expect(victim.state).toBe('SEEKING');
    expect(victim.targetPrimitiveId).toBeNull();
    expect(victim.targetBondId).toBeNull();

    // ⭐ AND THE SELECTOR CONSUMES IT. Without the drop to SEEKING the fan-out never re-targets and
    // the ATTACKING re-validation wipes an out-of-range creature target one tick later — the write
    // would exist and do nothing. 200 px is inside the 300 px leash, so the hold branch keeps it.
    expect(pickNavUnit(w, victim, victim.targetCreatureId, ACQ_SQ, LEASH_SQ)).toBe(archer.id);
  });
});

describe('S183 R183-A — it does NOT go back; it re-picks by its own preferences', () => {
  it('after the attacker dies the unit takes the NEAREST enemy, not the one it left', () => {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    // What it was hunting before: alive the whole time, and DELIBERATELY NOT the nearest, so
    // "returns to the previous target" and "re-picks nearest" give different answers.
    const previous = addUnit(w, GOBLIN_MELEE_CONFIG, 9, P1, 180, 0);
    victim.targetCreatureId = previous.id;
    const attacker = addUnit(w, GOBLIN_MELEE_CONFIG, 3, P1, 20, 0);
    const nearer = addUnit(w, GOBLIN_MELEE_CONFIG, 8, P1, 60, 0);
    commit(attacker, victim);

    hit(w, victim, attacker);
    expect(victim.targetCreatureId).toBe(attacker.id); // it switched

    // The attacker leaves the world. Nothing anywhere stored `previous`.
    w.creatures.delete(attacker.id);
    const repicked = pickNavUnit(w, victim, victim.targetCreatureId, ACQ_SQ, LEASH_SQ);

    expect(repicked).toBe(nearer.id);
    expect(repicked).not.toBe(previous.id);
    // Both halves: `previous` is still alive and still inside the acquire radius, so losing it is a
    // CHOICE the rule made and not an artefact of it having gone away.
    expect(w.creatures.has(previous.id)).toBe(true);
    expect((180 - 0) ** 2).toBeLessThan(ACQ_SQ);
  });
});

describe('S183 — determinism: two attackers on one tick', () => {
  /** Build the same fixture with the two attackers inserted in the given order. */
  function twoAttackers(lowFirst: boolean): { w: World; victim: Creature } {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    const ids = lowFirst ? [3, 7] : [7, 3];
    const made = new Map<number, Creature>();
    for (const id of ids) made.set(id, addUnit(w, GOBLIN_MELEE_CONFIG, id, P1, 10 + id, 0));
    for (const c of made.values()) commit(c, victim);
    return { w, victim };
  }

  it('the SAME attacker is retaliated against regardless of insertion order or strike order', () => {
    const outcomes: number[] = [];
    for (const lowFirst of [true, false]) {
      for (const strikeLowFirst of [true, false]) {
        const { w, victim } = twoAttackers(lowFirst);
        const a = w.creatures.get(asCreatureId(3))!;
        const b = w.creatures.get(asCreatureId(7))!;
        const order = strikeLowFirst ? [a, b] : [b, a];
        for (const attacker of order) hit(w, victim, attacker);
        outcomes.push(victim.targetCreatureId as unknown as number);
      }
    }
    // ⛔ S155 N1: `Map` iteration is insertion order, and letting it decide this is the defect that
    // *"handed one seat every melee exchange for a whole match"*. All four permutations agree...
    expect(new Set(outcomes).size).toBe(1);
    // ...and they agree on the LOWEST id, which is the stated total order rather than "whoever
    // struck last". A pass on the line above alone would also accept "whoever struck first".
    expect(outcomes[0]).toBe(3);
  });

  it('a SINGLE strike already answers with the lowest committed attacker, not the striker', () => {
    // The scan is the answer and the incoming blow is only the trigger — so even one blow from the
    // HIGHER id resolves to the lower one, because both are committed.
    const { w, victim } = twoAttackers(false);
    hit(w, victim, w.creatures.get(asCreatureId(7))!);
    expect(victim.targetCreatureId).toBe(asCreatureId(3));
  });
});

describe('S183 — a SPLASH cannot make you turn round', () => {
  it('an attacker that is not committed to this victim is refused (chain hop / rot aura)', () => {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    const bystanderHitter = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0);
    const someoneElse = addUnit(w, GOBLIN_MELEE_CONFIG, 3, P0, 40, 0);
    // It IS striking — just not at this victim. A Voltkin chain-lightning hop looks exactly so.
    commit(bystanderHitter, someoneElse);

    hit(w, victim, bystanderHitter);

    expect(victim.targetCreatureId).toBeNull();
    expect(victim.ehp).toBeLessThan(10_000); // the damage still landed; only the retarget is refused
  });

  it('area damage retaliates against nobody', () => {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0);
    const res = applyRadialDamage(w, 0, 0, 200, 1, SWING, 'hazard', P1);
    expect(res.creaturesHit).toBe(1);
    expect(victim.targetCreatureId).toBeNull();
  });
});

describe('S183 R183-C — HELGA retaliates, and can never be aimed at a tower', () => {
  function plantPrincess(w: World, x: number, y: number) {
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const anchor: Primitive = {
      id,
      type: SparkType.Square,
      placerColor: PLAYER_COLORS[0],
      placedBy: P0,
      createdTick: 0,
      pos: { x, y },
      prevPos: { x, y },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[0],
      lastOwnershipChange: 0,
      radius: 9,
      hp: PRIMITIVE_MAX_HP,
      origin: null,
    };
    w.primitives.set(id, anchor);
    const d = makeDefender({
      id: asDefenderId(w.nextDefenderId++),
      kind: 'princess',
      ownerPlayerId: P0,
      anchorPrimitiveId: id,
      recipeId: 'helga',
      pos: { x, y },
      registeredAtTick: 0,
    });
    w.defenders.set(d.id, d);
    return d;
  }

  it('while WALKING to one goblin she switches to the one actually hitting her', () => {
    const w = setupWorld();
    const helga = plantPrincess(w, 0, 0);
    expect(helga.ehp).toBe(unitPoolFifths(PRINCESS_HP, PRINCESS_DEF)); // she has a pool at all
    const faraway = addUnit(w, GOBLIN_MELEE_CONFIG, 9, P1, 300, 0);
    helga.state = 'WALK';
    helga.targetCreatureId = faraway.id;

    // The one at her feet, in the exact state the defender strike arm dispatches from.
    const puncher = addUnit(w, GOBLIN_MELEE_CONFIG, 4, P1, 10, 0);
    puncher.state = 'ATTACKING';
    puncher.targetCreatureId = null;

    damageEntity(w, { kind: 'defender', id: helga.id }, SWING, 'creature', {
      kind: 'creature',
      id: puncher.id,
    });

    expect(helga.targetCreatureId).toBe(puncher.id);
    // ⛔ R183-C's constraint, structurally: whatever she ends up holding resolves in
    // `world.creatures`. A tower is a `DefenderId` and a connector a `BondId` — neither is
    // representable in the one field retaliation writes, so no path can point her at a building.
    expect(w.creatures.has(helga.targetCreatureId!)).toBe(true);
    expect(DEFENDER_TARGETS.princess.has('structures')).toBe(false);
  });

  it('a TURRET takes nothing and therefore retaliates against nothing', () => {
    const w = setupWorld();
    const helga = plantPrincess(w, 0, 0);
    // Reuse the princess fixture then swap the kind's discriminator: `ehp === null` IS the tower
    // test the damage arm uses, so this is the same gate rather than a proxy for it.
    const tower = { ...helga, id: asDefenderId(w.nextDefenderId++), kind: 'turret' as const, ehp: null };
    w.defenders.set(tower.id, tower);
    const puncher = addUnit(w, GOBLIN_MELEE_CONFIG, 4, P1, 10, 0);
    puncher.state = 'ATTACKING';
    puncher.targetCreatureId = null;

    const killed = damageEntity(w, { kind: 'defender', id: tower.id }, SWING, 'creature', {
      kind: 'creature',
      id: puncher.id,
    });

    expect(killed).toBe(false);
    expect(tower.ehp).toBeNull();
    expect(tower.targetCreatureId).toBeNull();
  });

  it('a committed slap is not re-aimed mid-wind-up', () => {
    // PRINCESS_MELEE_RANGE is small while her attackRange is 380: swapping a WINDUP target would
    // let her land a slap on something she has not walked to — S177 P9's *"hitting what it has
    // not reached"*. WALK is the one state the swap is allowed in, and this pins that.
    const w = setupWorld();
    const helga = plantPrincess(w, 0, 0);
    const original = addUnit(w, GOBLIN_MELEE_CONFIG, 9, P1, 12, 0);
    helga.state = 'WINDUP';
    helga.targetCreatureId = original.id;
    const puncher = addUnit(w, GOBLIN_MELEE_CONFIG, 4, P1, 10, 0);
    puncher.state = 'ATTACKING';
    puncher.targetCreatureId = null;

    damageEntity(w, { kind: 'defender', id: helga.id }, SWING, 'creature', {
      kind: 'creature',
      id: puncher.id,
    });

    expect(helga.targetCreatureId).toBe(original.id);
  });
});

/*
 * ========================================================================================
 *   END TO END, THROUGH THE REAL HOST TICK
 * ========================================================================================
 *
 * ⛔ EVERYTHING ABOVE CALLS `damageEntity` DIRECTLY, AND THAT IS NOT PROOF THE FEATURE IS ALIVE.
 * S182: *"a source-text guard proves a line EXISTS. It cannot prove the line is REACHED."* A
 * state assertion has the same hole — it proves the write, not that the sim ever performs it or
 * keeps it. This block drives `runHostTick` and asserts the field the fan-out actually leaves
 * behind, which is the only thing the game reads.
 */
describe('S183 — a VOLTKIN is not dropped out of its wind-up', () => {
  it('takes the write but keeps ATTACKING when the attacker is out of its reach', () => {
    const w = setupWorld();
    const voltkin = addUnit(w, VOLTKIN_CONFIG, 1, P0, 0, 0);
    voltkin.state = 'ATTACKING';
    voltkin.ticksInState = 20;
    const archer = addUnit(w, GOBLIN_ARCHER_CONFIG, 2, P1, 210, 0); // beyond the Voltkin's 180
    commit(archer, voltkin);

    hit(w, voltkin, archer);

    // ⛔ The Voltkin's arm of the fan-out overwrites `targetCreatureId` every SEEKING tick, so a
    // forced drop here would be wiped, re-forced by the next blow, and reset its cadence forever.
    expect(voltkin.state).toBe('ATTACKING');
    expect(voltkin.ticksInState).toBe(20);
    // A structure-attacker in the same situation IS dropped — the case above proves it, and these
    // two together are what say the distinction is deliberate rather than an accident of ordering.
    expect(VOLTKIN_CONFIG.targetsStructures).toBe(false);
    expect(GOBLIN_MELEE_CONFIG.targetsStructures).toBe(true);
  });
});

describe('S183 — a HOMING MISSILE has nowhere to put a unit target', () => {
  it('the lightning drone keeps flying: no creature target is written onto it', () => {
    const w = setupWorld();
    const drone = addUnit(w, LIGHTNING_DRONE_CONFIG, 1, P0, 0, 0);
    const attacker = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0);
    commit(attacker, drone);

    hit(w, drone, attacker);

    // ⛔ A drone that held a creature target would enter ATTACKING, and in ATTACKING the fan-out
    // skips BOTH the bond re-selection and the Step 1.5 detonation — it would stop homing and
    // stop being able to explode. Its own config says `attackCadenceTicks` is "unused (the drone
    // explodes, it never ATTACKS)". This line is what keeps that true.
    expect(drone.targetCreatureId).toBeNull();
    expect(drone.ehp).toBeLessThan(10_000); // and it still TOOK the hit
  });

  it('the predicate selects the lightning drone and NOTHING else in the roster', () => {
    // Both halves, mechanically: if a future unit becomes `selfExplode && !targetsStructures` this
    // fails, and whoever adds it decides whether it can hold a target rather than inheriting a
    // silent carve-out. The goblin bomber must stay OUT of the set — that is R183-D.
    const missiles = (Object.keys(CREATURE_TARGETS) as CreatureType[]).filter((t) => {
      const cfg = getCreatureConfig(t);
      return cfg.selfExplode && !cfg.targetsStructures;
    });
    expect(missiles).toEqual(['lightningDrone']);
    expect(getCreatureConfig('goblinSuicide').selfExplode).toBe(true);
    expect(getCreatureConfig('goblinSuicide').targetsStructures).toBe(true);
  });
});

describe('S183 — retaliation through the real host tick', () => {
  function deps(seed = 1): HostTickDeps {
    return {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: null,
      hostSeats: new Map(),
    } as unknown as HostTickDeps;
  }

  function spawn(w: World, type: CreatureType, owner: typeof P0, x: number, y: number) {
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

  /*
   * ⚠ **THE VICTIM IS A BOSS, AND THE REASON IS A REAL PROPERTY OF THE ROSTER RATHER THAN TEST
   * CONVENIENCE.** Retaliation is recorded only on a victim that SURVIVED the blow. In this game
   * almost everything one-shots almost everything else — `damageCreature`'s own note: *"a goblin
   * one-shots: ehp is 1 × (5+2) = 7 fifths and a strike deals 2 × (5+0) = 10"* — and a measured
   * run of this exact fixture with a melee goblin in the middle ends with the goblin DEAD on the
   * archer's first shot, never having turned round. So the units this feature is visible on are
   * the ones with a pool: the six tier-9 bosses, the tier-3 units, the shield goblin and Helga.
   * Recorded here because "retaliation rarely fires in a goblin brawl" is a fact about the
   * shipped balance, not a defect, and the next session should not go looking for a bug.
   */
  it('⭐ a BOSS drops the nearer decoy and turns on the archer that actually shot it', () => {
    const w = makeWorld(0x5183);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.creatures.clear();

    const victim = spawn(w, 't9BossVampires', P0, 500, 500);
    // THE DECOY: a pencil chewer is STRUCTURES_ONLY, so it is the nearest enemy and can never be
    // the one hitting him. Absent retaliation, "nearest" is the whole rule and he holds the decoy.
    const decoy = spawn(w, 'chewer', P1, 560, 500);
    const archer = spawn(w, 'goblinArcher', P1, 500, 690);

    const d = deps();
    const st = makeHostTickState(w);
    const startEhp = victim.ehp;

    // Phase 1 — the BASELINE, measured through the real tick rather than asserted from memory:
    // out of SPAWNING, undamaged, he holds the decoy because it is nearest.
    for (let t = 0; t < 45; t++) runHostTick(w, d, st);
    expect(victim.ehp, 'nothing has hit him yet, so this is pre-retaliation behaviour').toBe(startEhp);
    expect(victim.targetCreatureId).toBe(decoy.id);

    // Phase 2 — the archer's shot lands, and he switches.
    let switched = false;
    for (let t = 0; t < 80 && !switched; t++) {
      runHostTick(w, d, st);
      switched = victim.targetCreatureId === archer.id;
    }

    expect(victim.ehp, 'the archer must actually have shot him, or this proves nothing')
      .toBeLessThan(startEhp);
    expect(switched).toBe(true);
    expect(w.creatures.has(decoy.id), 'and the decoy is still alive and still nearer — he LEFT it')
      .toBe(true);
  });
});
