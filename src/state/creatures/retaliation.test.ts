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
  /**
   * The same fixture, built with the two attackers inserted in either order and placed at either
   * pair of distances. `xOfLow` is where id 3 stands, `xOfHigh` where id 7 stands — both inside the
   * melee arm, so both are genuinely striking and the ONLY thing that separates them is the order.
   */
  function twoAttackers(
    lowFirst: boolean,
    xOfLow: number,
    xOfHigh: number,
  ): { w: World; victim: Creature } {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    const xs: Record<number, number> = { 3: xOfLow, 7: xOfHigh };
    for (const id of lowFirst ? [3, 7] : [7, 3]) {
      commit(addUnit(w, GOBLIN_MELEE_CONFIG, id, P1, xs[id], 0), victim);
    }
    return { w, victim };
  }

  /**
   * Every permutation of INSERTION order × STRIKE order — four runs — and the field each one leaves
   * behind. A rule that is a function of world state rather than of arrival returns the same id
   * four times; anything decided by `Map` order or by "whoever struck last" returns two.
   */
  function everyPermutation(xOfLow: number, xOfHigh: number): number[] {
    const outcomes: number[] = [];
    for (const lowFirst of [true, false]) {
      for (const strikeLowFirst of [true, false]) {
        const { w, victim } = twoAttackers(lowFirst, xOfLow, xOfHigh);
        const a = w.creatures.get(asCreatureId(3))!;
        const b = w.creatures.get(asCreatureId(7))!;
        for (const attacker of strikeLowFirst ? [a, b] : [b, a]) hit(w, victim, attacker);
        outcomes.push(victim.targetCreatureId as unknown as number);
      }
    }
    return outcomes;
  }

  it('the SAME attacker is retaliated against regardless of insertion order or strike order', () => {
    // ⛔ S155 N1: `Map` iteration is insertion order, and letting it decide this is the defect that
    // *"handed one seat every melee exchange for a whole match"*. All four permutations agree.
    expect(new Set(everyPermutation(13, 17)).size).toBe(1);
  });

  /**
   * ⛔⛔ **THE ORDER IS NEAREST-THEN-ID, AND THIS IS THE ONLY CASE THAT CAN TELL THE DIFFERENCE.**
   *
   * The first cut of `retaliation.ts` resolved by LOWEST ID OUTRIGHT and was replaced, because
   * retaliation drives NAVIGATION and `enemyStinkCloudInReach`'s own docblock says exactly what
   * that costs: *"walking to the lowest-id bag when a nearer one is at your feet would look
   * broken."* ⚠ Every other fixture in this file puts the lower id nearer as well, so all of them
   * pass under EITHER rule and none of them is evidence for the one that shipped. This one
   * separates them: id 7 stands at 10 px and id 3 at 30 px, so lowest-id answers 3 and
   * nearest-then-id answers 7.
   */
  it('the NEARER attacker wins even when it holds the HIGHER id', () => {
    const outcomes = everyPermutation(30, 10);
    expect(new Set(outcomes).size).toBe(1);
    expect(outcomes[0]).toBe(7);
  });

  it('an exact distance tie falls to the LOWER id, which is what keeps it a TOTAL order', () => {
    // Mirrored about the victim: distSq is 100 for both, so distance cannot decide and the explicit
    // id compare is the whole answer. Without it this pair would be settled by `Map` order.
    const outcomes = everyPermutation(-10, 10);
    expect(new Set(outcomes).size).toBe(1);
    expect(outcomes[0]).toBe(3);
  });

  it('a SINGLE strike already answers with the SCAN’s winner, not with the striker', () => {
    // The scan is the answer and the incoming blow is only the trigger — so one blow from the
    // FARTHER attacker still resolves to the nearer one, because both are striking.
    const { w, victim } = twoAttackers(false, 13, 17);
    hit(w, victim, w.creatures.get(asCreatureId(7))!);
    expect(victim.targetCreatureId).toBe(asCreatureId(3));
  });
});

/**
 * ⛔⛔ **AN AGGRESSOR IS A STRIKE COMMITMENT, NEVER A NAVIGATION LOCK — AND THE FIRST CUT OF THIS
 * FEATURE GOT THAT WRONG.** Found by auditing the branch, not by a red test.
 *
 * `targetCreatureId` is TWO things: the field `applyCreatureAttack`'s creature arm dispatches from,
 * and the structure-attacker's NAVIGATION lock, which `hostTick.ts` writes for anything in SEEKING
 * with an enemy inside `GOBLIN_UNIT_ACQUIRE_RADIUS` (220 px). A scan that reads only the field
 * cannot tell "hitting you" from "walking toward you", so a victim punched at 20 px by a high id
 * broke its wind-up and set off on a 250 px walk to a low id that had never touched it — the
 * owner's ruling inverted. `isStrikingCreature` demands all three: ATTACKING, the field, and the
 * attacker's own `attackRange`.
 */
describe('S183 — an aggressor is a STRIKE COMMITMENT, never a NAVIGATION LOCK', () => {
  /** The exact defect fixture: a nav-locked LOW id far away, a real striker with a HIGH id at 20 px. */
  function navLockVsStriker(): { w: World; victim: Creature; walker: Creature; striker: Creature } {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    victim.state = 'ATTACKING';
    victim.ticksInState = 12;
    victim.targetPrimitiveId = asPrimitiveId(77);
    // SEEKING, not ATTACKING: it holds the field as a nav lock and is 200 px away — inside the
    // 220 px acquire radius that writes it, and nowhere near its own 35 px arm.
    const walker = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 200, 0);
    walker.targetCreatureId = victim.id;
    const striker = addUnit(w, GOBLIN_MELEE_CONFIG, 9, P1, 20, 0);
    commit(striker, victim);
    return { w, victim, walker, striker };
  }

  it('the unit that is actually hitting wins over a lower-id unit that is only walking', () => {
    const { w, victim, striker } = navLockVsStriker();
    hit(w, victim, striker);
    expect(victim.targetCreatureId).toBe(striker.id);
    // ⭐ AND THE WIND-UP SURVIVES. The defect's second half was the state drop: the victim left
    // ATTACKING to walk 250 px to a unit that had never touched it, while the real attacker kept
    // hitting it. An in-reach aggressor never drops the commitment.
    expect(victim.state).toBe('ATTACKING');
    expect(victim.ticksInState).toBe(12);
  });

  it('a walker cannot even TRIGGER a retaliation — the gate and the scan are one predicate', () => {
    const { w, victim, walker } = navLockVsStriker();
    hit(w, victim, walker);
    expect(victim.targetCreatureId).toBeNull();
    expect(victim.state).toBe('ATTACKING');
    expect(victim.ticksInState).toBe(12);
    expect(victim.ehp).toBeLessThan(10_000); // the damage still landed; only the retarget is refused
  });

  /**
   * ⚠ THE OTHER HALF, AND IT NEEDED ITS OWN FIXTURE. A mutation run found that deleting the
   * ATTACKING test from `isStrikingCreature` left every case above GREEN, because the walker in
   * them stands 200 px out and the reach test already excludes it. The two conditions only come
   * apart when the nav lock is held CLOSE — which is the common case, not an exotic one:
   * `hostTick` writes the lock for anything inside 220 px, including a unit one tick before it
   * enters ATTACKING.
   */
  it('in reach and committed is still not enough — it has to be ATTACKING', () => {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    // SEEKING at 20 px: inside the arm, holding the nav lock, not yet swinging.
    const closeWalker = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 20, 0);
    closeWalker.targetCreatureId = victim.id;
    const striker = addUnit(w, GOBLIN_MELEE_CONFIG, 9, P1, 25, 0);
    commit(striker, victim);

    hit(w, victim, striker);

    // The walker is NEARER, so under nearest-then-id it would win if it counted at all.
    expect(victim.targetCreatureId).toBe(striker.id);
  });

  /**
   * ⚠ THE OUT-OF-REACH CANDIDATE HAS TO BE THE NEARER ONE, OR THE FIXTURE PROVES NOTHING. A
   * mutation run caught the first cut of this test: it put the out-of-reach unit FARTHER away, so
   * deleting the reach check left it green — nearest-then-id preferred the real striker for the
   * wrong reason. Reach is per-ATTACKER, so a MELEE goblin at 100 px is out of its own 35 px arm
   * while an ARCHER at 200 px is comfortably inside its 220. The nearer unit is the one that must
   * lose.
   */
  it('ATTACKING and committed is still not enough — it has to be within its OWN arm', () => {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    const outOfReach = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 100, 0); // 100 px on a 35 px arm
    commit(outOfReach, victim);
    const archer = addUnit(w, GOBLIN_ARCHER_CONFIG, 9, P1, 200, 0); // 200 px on a 220 px arm
    commit(archer, victim);

    hit(w, victim, archer);

    expect(victim.targetCreatureId).toBe(archer.id);
  });
});

/**
 * ⚠ **THE CHAINED CASE IS ORDER-SENSITIVE, AND THIS PINS IT RATHER THAN CLAIMING IT AWAY.**
 *
 * `recordCreatureRetaliation` WRITES `targetCreatureId` and the scan READS it, so a victim that
 * retaliates becomes an aggressor of its own new target inside the same tick. With TWO victims
 * struck in one tick the second scan can see the first one's fresh commitment, and the answers
 * differ by strike order. The branch's first docblock claimed *"applying the same set of claims in
 * any order yields the same field"*; that is false in general, and these are the measured numbers.
 *
 * ⛔ IT IS NOT A DESYNC. Host, worker and replay drive the batch from one `world.creatures`
 * iteration order, so all three compute the SAME answer — this is spawn-order-sensitive GAMEPLAY,
 * not a divergence. Closing it needs a per-tick claim buffer, i.e. a new transient `World` field on
 * the `pendingCreatureDeaths` pattern (`worldTypes` + the `world` factory + the `stateHashFull`
 * acknowledgement + `hostTick`'s init and clear — four sites, no wire and no protocol bump).
 * Not built: it is a scope decision for the owner, not an oversight. This test is here so the
 * limitation cannot be quietly widened, and it turns red the day somebody closes it.
 */
/**
 * ⛔ **A CORPSE-IN-WAITING IS NOT AN AGGRESSOR, AND BOTH ARMS OF THAT NEED THEIR OWN CASE.**
 *
 * S155 N1 defers creature deaths to an end-of-tick sweep so a mutual melee exchange resolves
 * simultaneously, which means a creature that took a lethal blow EARLIER IN THIS SAME BATCH is
 * still sitting in `world.creatures`. Without the guard a victim commits to something already
 * dead, drops out of its wind-up with `ticksInState = 0`, and re-picks next tick having lost a
 * cadence to a ghost. `ehp <= 0` is the immediate arm and `pendingCreatureDeaths` the deferred
 * one — only ONE of them is live at a time, which is why neither covers the other.
 *
 * ⚠ Added after a mutation run: deleting both lines left the whole file green.
 */
describe('S183 — a corpse-in-waiting cannot be retaliated against', () => {
  /** A nearer, lower-id attacker that is already dead, and a live one further out. */
  function ghostAndLive() {
    const w = setupWorld();
    const victim = addUnit(w, GOBLIN_MELEE_CONFIG, 1, P0, 0, 0);
    const ghost = addUnit(w, GOBLIN_MELEE_CONFIG, 2, P1, 10, 0);
    commit(ghost, victim);
    const live = addUnit(w, GOBLIN_MELEE_CONFIG, 9, P1, 30, 0);
    commit(live, victim);
    return { w, victim, ghost, live };
  }

  it('the IMMEDIATE arm: an attacker already on zero is skipped for a live one further away', () => {
    const { w, victim, ghost, live } = ghostAndLive();
    ghost.ehp = 0;
    hit(w, victim, live);
    expect(victim.targetCreatureId).toBe(live.id);
  });

  it('the DEFERRED arm: an attacker in `pendingCreatureDeaths` is skipped the same way', () => {
    const { w, victim, ghost, live } = ghostAndLive();
    w.pendingCreatureDeaths = new Set([ghost.id]); // still in `creatures` until the sweep
    hit(w, victim, live);
    expect(victim.targetCreatureId).toBe(live.id);
  });

  it('and a dead attacker cannot TRIGGER one either — its last committed blow redirects nobody', () => {
    const { w, victim, ghost } = ghostAndLive();
    w.pendingCreatureDeaths = new Set([ghost.id]);
    hit(w, victim, ghost);
    expect(victim.targetCreatureId).toBeNull();
    expect(victim.ehp).toBeLessThan(10_000); // the deferral exists so that blow still LANDS
  });
});

describe('S183 — the CHAINED case (two victims in one tick) is order-SENSITIVE', () => {
  /** V ← U ← X, all melee and all 20 px apart, so every pair is inside the 35 px arm. */
  function chain(): { w: World; V: Creature; U: Creature; X: Creature } {
    const w = setupWorld();
    const V = addUnit(w, GOBLIN_MELEE_CONFIG, 10, P0, 0, 0);
    const U = addUnit(w, GOBLIN_MELEE_CONFIG, 20, P1, 20, 0);
    const X = addUnit(w, GOBLIN_MELEE_CONFIG, 30, P0, 40, 0);
    V.state = 'ATTACKING';
    V.targetPrimitiveId = asPrimitiveId(77);
    commit(U, V);
    commit(X, U);
    return { w, V, U, X };
  }

  it('strike V first: V turns on U, and U then sees V as a tie-breaking aggressor of its own', () => {
    const { w, V, U, X } = chain();
    hit(w, V, U);
    hit(w, U, X);
    expect(V.targetCreatureId).toBe(asCreatureId(20));
    // Both V (now striking U at 20 px) and X (striking U at 20 px) qualify; the distances tie and
    // the LOWER id takes it — the rule applied correctly to the state it was handed.
    expect(U.targetCreatureId).toBe(asCreatureId(10));
  });

  it('strike U first: U turns on X, which retires U as V’s aggressor and V retaliates at NOBODY', () => {
    const { w, V, U, X } = chain();
    hit(w, U, X);
    hit(w, V, U);
    expect(U.targetCreatureId).toBe(asCreatureId(30));
    // U is no longer committed to V, so the splash gate refuses the trigger. Same two blows, same
    // tick, different answer — which is the whole point of pinning it.
    expect(V.targetCreatureId).toBeNull();
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
  /**
   * The measured scenario, verbatim from the guard in `retaliation.ts`: *"a Voltkin mid-zap on a
   * chewer at 100 px, shot by an archer at 210 px"*. ⚠ The Voltkin is given the CHEWER rather than
   * left in ATTACKING with an empty target — an ATTACKING creature with nothing to attack is
   * bounced to SEEKING by the FSM's own re-validation whatever retaliation does, so a fixture
   * without the chewer measures the fixture instead of the feature. It is also what the defect
   * actually costs: the chewer it was killing.
   */
  function midZap(archerX: number) {
    const w = setupWorld();
    const voltkin = addUnit(w, VOLTKIN_CONFIG, 1, P0, 0, 0);
    const chewer = addUnit(w, CHEWER_CONFIG, 5, P1, 100, 0); // inside the Voltkin's 180
    voltkin.state = 'ATTACKING';
    voltkin.ticksInState = 20;
    voltkin.targetCreatureId = chewer.id;
    const archer = addUnit(w, GOBLIN_ARCHER_CONFIG, 2, P1, archerX, 0);
    commit(archer, voltkin);
    return { w, voltkin, chewer, archer };
  }

  it('the write itself is REFUSED when the attacker is beyond the Voltkin’s own reach', () => {
    const { w, voltkin, chewer, archer } = midZap(210); // beyond the Voltkin's 180

    hit(w, voltkin, archer);

    // ⛔⛔ GATING ONLY THE STATE DROP AND LETTING THE WRITE LAND IS WORSE THAN DOING NOTHING, and
    // it was measured: `creatureLifecycle`'s S103 #8 ATTACKING re-validation finds the new target
    // outside the 180 px, NULLS it and bounces the creature out of ATTACKING anyway. One archer
    // would halve the Voltkin's output and two would starve it.
    expect(voltkin.targetCreatureId).toBe(chewer.id);
    expect(voltkin.state).toBe('ATTACKING');
    expect(voltkin.ticksInState).toBe(20);
    expect(voltkin.ehp).toBeLessThan(10_000); // and it still TOOK the hit

    // ⭐ REACHED, not merely refused: the shipped re-validation is the consumer that would have
    // done the damage, so drive it. The Voltkin is still on the chewer a tick later.
    applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: voltkin.id });
    expect(voltkin.targetCreatureId).toBe(chewer.id);
    expect(voltkin.state).toBe('ATTACKING');

    // A structure-attacker in the same situation IS given the target and dropped to SEEKING — the
    // owner-example case above proves it, and these two together are what say the distinction is
    // deliberate rather than an accident of ordering.
    expect(VOLTKIN_CONFIG.targetsStructures).toBe(false);
    expect(GOBLIN_MELEE_CONFIG.targetsStructures).toBe(true);
  });

  it('inside its reach the Voltkin DOES retaliate — the gate is about reach, not about the unit', () => {
    const { w, voltkin, archer } = midZap(150); // inside the Voltkin's 180

    hit(w, voltkin, archer);

    // It drops the chewer for the archer, keeps its wind-up, and the re-validation keeps the swap:
    // the Voltkin's own every-tick nearest-in-range opportunism is exactly what this looks like.
    expect(voltkin.targetCreatureId).toBe(archer.id);
    expect(voltkin.state).toBe('ATTACKING');
    expect(voltkin.ticksInState).toBe(20);
    applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: voltkin.id });
    expect(voltkin.targetCreatureId).toBe(archer.id);
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
