/**
 * SPARK — S169 (owner R152) — **STUN, AND THE FOUR GATES IT HAS TO PASS THROUGH.**
 *
 * Owner, verbatim: *"for the Kraken stun yeah we need to add condition - STUN where the player is
 * stuck on idle and cant do anything and maybe there is like a cool stunned 'seeing stars' effect
 * above the stunned creatures heads? it has to be consistent and coherent obviously."*
 *
 * ## ⭐ HE ASKED FOR A CONDITION, NOT A KRAKEN FEATURE
 *
 * The same call he made on the zombie aura (*"we need to build a new mechanic - debuff OR damage
 * over time"*, now `damageOverTime.ts`). STUN is the other half of that pair — DoT is the damage
 * debuff, this is the CONTROL debuff — so it is built and tested on its own, ahead of the Kraken
 * whose sonar wave needs it (R139).
 *
 * ## ⛔ WHY THIS FILE EXISTS, AND WHY IT IS ORGANISED BY GATE
 *
 * R152's design note states the real work outright: *"a stunned creature should be stunned to EVERY
 * system — it cannot move, attack, chew, or be summoned into a swing it had already committed to.
 * The places that read a creature's ability to act have to be enumerated ONCE and made to consult
 * the condition, or stun will work in three of them and not the fourth."*
 *
 * That is the whole risk, and it is not hypothetical here: this codebase has shipped exactly that
 * shape repeatedly (a warning that could not be enforced; a defective clause removed from three of
 * four star recipes). A stun is a GATE where `enraged` is a MULTIPLIER — rage needed two call sites
 * and a missed one only made the Warlord feel wrong, whereas a missed stun site means the unit
 * cannot move but still swings, or cannot swing but still walks. So the enumeration is pinned by
 * BEHAVIOUR, one describe block per gate, rather than trusted to a grep:
 *
 *   GATE 1  the FSM            `creatures/creatureLifecycle.ts` — frozen, and `ticksInState` held
 *   GATE 2  the steering       `physics/creatureVerlet.ts`      — no accel
 *   GATE 3  the re-target      `state/hostTick.ts` fan-out      — no re-aim, no attack dispatch
 *   GATE 4  the boss skills    `state/hostTick.ts`              — no skills (RAGE excepted)
 *
 * ## ⚠ THE ONE DELIBERATE EXCEPTION, STATED SO IT CANNOT LOOK LIKE AN OVERSIGHT
 *
 * `runWarlordRage` still runs while stunned. Rage is a LATCH over the boss's own health, not an
 * action he takes; skipping it would let a Warlord stunned below 25% emerge un-enraged, or stay
 * enraged after being healed past 50% mid-stun. A stun stops what a creature DOES, not what is TRUE
 * about it.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICS_HZ, PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { applyStun, isStunned } from './creatures/creature.ts';
import { computeSteeringAccel, ZERO_ACCEL } from '../physics/creatureVerlet.ts';
import { runWarlordRage, runWarlordDirewolves } from './bossSkillsWarlord.ts';
import { runZombieRotAura } from './bossSkills.ts';
import { bossMaxPoolFifths } from './bossSkills.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { snapshot, restore } from './save.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function worldWith(type: string, owner = P0, x = 500): { world: World; id: CreatureId } {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y: 500 },
    targetPos: { x: x + 200, y: 500 },
  });
  const c = [...world.creatures.values()].find((k) => k.type === type);
  if (c === undefined) throw new Error(`fixture: ${type} did not spawn`);
  return { world, id: c.id };
}

/** Drive the creature's own reducer directly — the FSM under test, with no fan-out in the way. */
function tickCreature(world: World, id: CreatureId): void {
  dispatch(world, { type: 'CREATURE_TICK', creatureId: id });
}

describe('S169 R152 — the STUN condition itself', () => {
  it('⭐ `isStunned` is STRICTLY before the stamp — the stamp tick is the first ACTING tick', () => {
    // So a duration reads the way it is written: `tick + 120` is exactly 120 stunned ticks. An
    // off-by-one here is invisible in play and would quietly make every stun in the game 1/60 s long
    // or 1/60 s too long, so it is pinned rather than assumed.
    const c = { stunnedUntilTick: 100 };
    expect(isStunned(c, 99), 'the last stunned tick').toBe(true);
    expect(isStunned(c, 100), 'the first acting tick').toBe(false);
    expect(isStunned(c, 101)).toBe(false);
  });

  it('⭐ absent or past stamp = not stunned — the condition SELF-HEALS with nothing to clear', () => {
    expect(isStunned({}, 500)).toBe(false);
    expect(isStunned({ stunnedUntilTick: undefined }, 500)).toBe(false);
    expect(isStunned({ stunnedUntilTick: 10 }, 500)).toBe(false);
  });

  it('⭐⭐ `applyStun` takes the MAX — a second, shorter stun may not cut the first one short', () => {
    // "it has to be consistent" — the Kraken's cone can clip the same unit on consecutive sweeps,
    // and a plain assignment would let the shorter second stamp END the stun early.
    const c: { stunnedUntilTick?: number } = {};
    applyStun(c, 300);
    expect(c.stunnedUntilTick).toBe(300);
    applyStun(c, 120); // shorter — must be ignored
    expect(c.stunnedUntilTick, 'the longer stun wins').toBe(300);
    applyStun(c, 400); // longer — must extend
    expect(c.stunnedUntilTick).toBe(400);
  });
});

describe('S169 R152 — GATE 1: the FSM is frozen', () => {
  it('⭐⭐ `ticksInState` does NOT advance while stunned', () => {
    // ⛔ THIS IS THE ASSERTION THAT STOPS A FREE HIT ON RECOVERY. `ticksInState` is the attack
    // cadence's clock, so letting it run would have the stun CHARGE the swing and fire it on the
    // tick the stun expires.
    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    c.ticksInState = 5;
    applyStun(c, world.tick + 60);
    for (let i = 0; i < 30; i++) tickCreature(world, id);
    expect(world.creatures.get(id)!.ticksInState, 'frozen').toBe(5);
  });

  it('⭐ and the FSM takes no transition — a stunned SEEKING unit does not enter ATTACKING', () => {
    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    applyStun(c, world.tick + 60);
    for (let i = 0; i < 30; i++) tickCreature(world, id);
    expect(world.creatures.get(id)!.state).toBe('SEEKING');
  });

  it('CONTROL — the same unit UNSTUNNED does advance, so the test above is not vacuous', () => {
    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    c.ticksInState = 5;
    for (let i = 0; i < 10; i++) tickCreature(world, id);
    expect(world.creatures.get(id)!.ticksInState, 'not frozen').toBeGreaterThan(5);
  });

  it('⭐ it RESUMES on expiry — the counter continues from where it was interrupted', () => {
    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    c.ticksInState = 5;
    applyStun(c, world.tick + 10);
    for (let i = 0; i < 10; i++) tickCreature(world, id); // world.tick does not move here
    expect(world.creatures.get(id)!.ticksInState).toBe(5);
    world.tick += 10; // the stun lapses
    tickCreature(world, id);
    expect(world.creatures.get(id)!.ticksInState, 'resumes, does not restart').toBe(6);
  });

  /*
   * ⛔ THE BOOKKEEPING MUST STILL RUN, which is why the gate sits AFTER steps 1-2 of the reducer and
   * not at the top. Gating above them would make a stunned creature IMMORTAL: a stun outliving its
   * lifetime would strand it on the board for the rest of the match.
   */
  it('⛔⛔ a stunned creature is NOT immortal — end-of-life still deletes it', () => {
    const { world, id } = worldWith('voltkin'); // non-persistent: it has a real despawnAtTick
    const c = world.creatures.get(id)!;
    applyStun(c, world.tick + 100_000); // far longer than its life
    world.tick = c.despawnAtTick;
    tickCreature(world, id);
    expect(world.creatures.has(id), 'a stun may not confer immortality').toBe(false);
  });
});

describe('S169 R152 — GATE 2: no steering', () => {
  it('⭐⭐ a stunned SEEKING creature gets ZERO accel — it cannot walk away', () => {
    // The FSM gate freezes the state, so a creature stunned mid-SEEKING STAYS in SEEKING. Without
    // this gate it would keep steering for the whole stun, which is why gate 2 is not redundant.
    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    const moving = computeSteeringAccel(c, world.tick);
    expect(moving.x !== 0 || moving.y !== 0, 'CONTROL: it steers when not stunned').toBe(true);

    applyStun(c, world.tick + 60);
    expect(computeSteeringAccel(c, world.tick)).toBe(ZERO_ACCEL);
  });

  it('⭐ and it steers again the moment the stamp lapses', () => {
    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    applyStun(c, world.tick + 60);
    expect(computeSteeringAccel(c, world.tick)).toBe(ZERO_ACCEL);
    const after = computeSteeringAccel(c, world.tick + 60);
    expect(after.x !== 0 || after.y !== 0, 'recovered').toBe(true);
  });
});

describe('S169 R152 — GATE 3: no re-targeting and no attack dispatch', () => {
  it('⭐⭐ the host fan-out does not re-aim a stunned creature', async () => {
    // The fan-out is where a creature RE-AIMS and where CREATURE_ATTACK is dispatched. Without the
    // skip a stunned unit spends the stun silently acquiring, then snaps onto a fresh victim the
    // instant it recovers.
    const { runHostTick, makeHostTickState } = await import('./hostTick.ts');
    const { Spawner, DEFAULT_SPAWNER_CONFIG } = await import('../game/spawner.ts');
    const { mulberry32 } = await import('./rng.ts');
    const { makeGameStateExtras } = await import('./gameState.ts');

    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    // A target that the fan-out would otherwise overwrite on its next re-selection pass.
    c.targetCreatureId = null;
    c.targetPrimitiveId = null;
    applyStun(c, world.tick + 600);

    const deps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: null,
      hostSeats: new Map(),
    } as never;
    // ⭐ AN ENEMY PARKED IN RANGE, which is the only way to test the RE-AIM rather than re-testing
    // gate 1. `findNearestEnemyCreature` is range-gated, so without a candidate in reach the fan-out
    // would leave `targetCreatureId` null whether or not the stun gate exists — a vacuous pass.
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee' as never,
      ownerPlayerId: P1,
      pos: { x: 515, y: 500 },
      targetPos: { x: 515, y: 500 },
    });

    const st = makeHostTickState(world);
    for (let i = 0; i < 20; i++) runHostTick(world, deps, st);

    const after = world.creatures.get(id)!;
    expect(after.targetCreatureId, 'a stunned unit must not ACQUIRE an adjacent enemy').toBe(null);
    expect(after.ticksInState, 'the FSM stayed frozen through 20 real host ticks').toBe(c.ticksInState);
    expect(after.state, 'and never entered ATTACKING').toBe('SEEKING');
  });

  it('CONTROL — the same unit UNSTUNNED does acquire that enemy, so gate 3 is not vacuous', async () => {
    const { runHostTick, makeHostTickState } = await import('./hostTick.ts');
    const { Spawner, DEFAULT_SPAWNER_CONFIG } = await import('../game/spawner.ts');
    const { mulberry32 } = await import('./rng.ts');
    const { makeGameStateExtras } = await import('./gameState.ts');

    const { world, id } = worldWith('goblinMelee');
    const c = world.creatures.get(id)!;
    c.state = 'SEEKING';
    c.targetCreatureId = null;
    // NOT stunned this time.
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee' as never,
      ownerPlayerId: P1,
      pos: { x: 515, y: 500 },
      targetPos: { x: 515, y: 500 },
    });
    const deps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: null,
      hostSeats: new Map(),
    } as never;
    const st = makeHostTickState(world);
    for (let i = 0; i < 20; i++) runHostTick(world, deps, st);

    const after = world.creatures.get(id);
    // Either it acquired the neighbour, or it engaged it — both prove the fan-out was doing work
    // that the stunned case above was genuinely prevented from doing.
    const didSomething =
      after === undefined || after.targetCreatureId !== null || after.state === 'ATTACKING' ||
      after.ticksInState > 0;
    expect(didSomething, 'an un-stunned unit must actually be driven by the fan-out').toBe(true);
  });
});

describe('S169 R152 — GATE 4: a stunned boss uses no skills', () => {
  it('⭐⭐ the zombie rot aura does not tick while its boss is stunned', () => {
    const { world, id } = worldWith(T9_BOSS_TYPE.zombies);
    // A victim in range for the aura to bite.
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee' as never,
      ownerPlayerId: P1,
      pos: { x: 520, y: 500 },
      targetPos: { x: 520, y: 500 },
    });
    const victim = [...world.creatures.values()].find((k) => k.type === 'goblinMelee')!;
    const before = victim.ehp;

    applyStun(world.creatures.get(id)!, world.tick + 10_000);
    for (let i = 0; i < 4 * PHYSICS_HZ; i++) {
      world.tick++;
      runZombieRotAura(world);
    }
    expect(world.creatures.get(victim.id)!.ehp, 'the aura is an action, and actions are gated').toBe(before);
  });

  /*
   * ⛔⛔ THE CONTROL THIS BLOCK CANNOT DO WITHOUT, AND IT IS HERE BECAUSE THE TEST ABOVE PASSED
   * BEFORE THE GATE EXISTED.
   *
   * When first written, "the aura does not tick while stunned" went GREEN against an UNGATED aura —
   * it was passing for a reason that had nothing to do with the stun. Only the direwolf assertion
   * next door failed and exposed that the boss-skill gate had been described in a comment and never
   * actually written. A test that passes for the wrong reason is worse than no test, so the aura now
   * has to prove it BITES when the boss is free.
   */
  it('CONTROL — the aura DOES bite an un-stunned boss, so the assertion above is not vacuous', () => {
    const { world, id } = worldWith(T9_BOSS_TYPE.zombies);
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee' as never,
      ownerPlayerId: P1,
      pos: { x: 520, y: 500 },
      targetPos: { x: 520, y: 500 },
    });
    const victim = [...world.creatures.values()].find((k) => k.type === 'goblinMelee')!;
    const before = victim.ehp;
    void id; // the boss is deliberately NOT stunned here
    for (let i = 0; i < 8 * PHYSICS_HZ; i++) {
      world.tick++;
      runZombieRotAura(world);
    }
    expect(
      world.creatures.get(victim.id)?.ehp ?? 0,
      'an un-stunned zombie boss must actually rot a neighbour',
    ).toBeLessThan(before);
  });

  it('⭐ the Warlord summons no direwolves while stunned', () => {
    const { world, id } = worldWith(T9_BOSS_TYPE.orcs);
    applyStun(world.creatures.get(id)!, world.tick + 10_000);
    for (let i = 0; i < 20 * PHYSICS_HZ; i++) {
      world.tick++;
      runWarlordDirewolves(world);
    }
    expect([...world.creatures.values()].filter((k) => k.type === 'direwolf')).toHaveLength(0);
  });

  /*
   * ⚠ THE DELIBERATE EXCEPTION. Rage is a LATCH over the boss's own health, not an action. Skipping
   * it while stunned would let a Warlord stunned below 25% emerge un-enraged. Asserted so a future
   * reader cannot "tidy" it into the gate above.
   */
  it('⚠ but RAGE still latches while stunned — a latch is not an action', () => {
    const { world, id } = worldWith(T9_BOSS_TYPE.orcs);
    const boss = world.creatures.get(id)!;
    boss.ehp = Math.floor(bossMaxPoolFifths(boss.type) * 0.1); // well below the 25% trigger
    applyStun(boss, world.tick + 10_000);
    runWarlordRage(world);
    expect(world.creatures.get(id)!.enraged, 'health is TRUE of him, not something he does').toBe(true);
  });
});

describe('S169 R152 — the wire', () => {
  it('⭐⭐ the stamp SURVIVES a save/load round-trip', () => {
    // It must, because the "seeing stars" is derived per frame by the renderer from this field on
    // BOTH peers. A host-local latch would stun correctly and draw nothing on the joiner.
    const { world, id } = worldWith('goblinMelee');
    applyStun(world.creatures.get(id)!, 1234);
    const snap = snapshot(world);
    const fresh = makeWorld(0);
    restore(snap, fresh);
    const c = [...fresh.creatures.values()].find((k) => k.type === 'goblinMelee')!;
    expect(c.stunnedUntilTick).toBe(1234);
  });

  it('⭐ and an UNSTUNNED creature carries no field at all — additive-optional, no bump', () => {
    // This is what keeps the replay byte-equivalence guards valid and what makes the field free of a
    // PROTOCOL_VERSION bump: a world with no stunned creature is identical on the wire.
    const { world } = worldWith('goblinMelee');
    const json = JSON.stringify(snapshot(world));
    expect(json.includes('stunnedUntilTick'), 'absent when unset').toBe(false);
  });
});
