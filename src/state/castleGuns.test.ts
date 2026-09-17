/**
 * SPARK — S160 P4b: THE CASTLE SHOOTS BACK.
 *
 * S154 gave the castle hit points and an elimination path. This is the half that makes them matter,
 * and it closes a gap that had gone unnoticed because it fell between two documents: the races spec
 * ships *"per-race castle attack VFX"* in W1-B and lists *"the castle guns"* in §7.3, while its own
 * current-state audit put the weapon in neither the "exists" nor the "does not exist" table.
 *
 * The owner ruled the targeting rule on being shown both candidates: **nearest enemy in range**,
 * superseding `SPARK_TD_SESSION_SPECS.md:59` Q4's retaliation-only. These assertions are written
 * against that ruling, and the reversal is recorded at the constants.
 */
import { describe, expect, it } from 'vitest';

import {
  CASTLE_ATK,
  CASTLE_ATTACK_RANGE,
  CASTLE_FIRE_INTERVAL_TICKS,
  CASTLE_MAX_HP,
  CASTLE_PEN,
  FIGHT_PHASE_TICKS,
  GOBLIN_SHIELD_ATK,
  GOBLIN_SHIELD_DEF,
  phaseDurationTicks,
} from '../constants.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
import { asPlayerId, asSpawnerId } from '../types.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { castleFiresOnTick, castleGunsTick, castleShotFifths } from './castleGuns.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
import { ALL_RACES } from './races.ts';
import type { CreatureId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function fightWorld(): World {
  const w = makeWorld(0xca57);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

/**
 * Put a creature `dist` px from seat 0's castle, along +x. Owner defaults to the ENEMY (P1).
 *
 * ⛔ `sourceSpawnerId` IS A SENTINEL, NOT `null`, AND THE RACES SPEC'S B1 IS WHY. `applySpawnCreature`
 * returns the world UNCHANGED — no error, no log — for a second creature with the same
 * `(ownerPlayerId, type)` when `sourceSpawnerId === null`. The first cut of this fixture used `null`,
 * so the "picks the NEAREST of two enemies" case below would have silently had ONE creature in the
 * world and passed for the wrong reason. That is B1 biting a fixture rather than a feature, which is
 * useful evidence that the blocker is real and that it looks correct on a small board.
 */
function creatureNearSeat0(w: World, dist: number, owner = P1): CreatureId {
  const anchor = castleAnchor(0, w.layout);
  const pos = { x: anchor.x + dist, y: anchor.y };
  dispatch(w, {
    type: 'SPAWN_CREATURE',
    creatureType: 'chewer',
    ownerPlayerId: owner,
    pos,
    targetPos: pos,
    sourceSpawnerId: asSpawnerId(1),
  });
  const last = [...w.creatures.keys()].at(-1);
  if (last === undefined) throw new Error('fixture failed to spawn a creature');
  return last;
}
const enemyNearSeat0 = (w: World, dist: number): CreatureId => creatureNearSeat0(w, dist);

/** Advance to the next tick on which seat 0's castle is scheduled to fire, then run it. */
function fireOnce(w: World): void {
  for (let i = 0; i < CASTLE_FIRE_INTERVAL_TICKS * 2; i++) {
    w.tick++;
    if (castleFiresOnTick(0, w.tick)) {
      castleGunsTick(w);
      return;
    }
  }
  throw new Error('no fire slot found within two intervals — the schedule is broken');
}

describe('S160 P4b — the schedule is derived from world.tick, with no stored timer', () => {
  it('⭐ fires exactly once per interval, and is TOTAL over any seat index', () => {
    // Pure function of (seat, tick): nothing to serialize, nothing to hash, nothing to diverge.
    for (const seat of [0, 1, 2, 3, 6, 99, -1, -7, 2.7]) {
      let hits = 0;
      for (let t = 0; t < CASTLE_FIRE_INTERVAL_TICKS; t++) if (castleFiresOnTick(seat, t)) hits++;
      expect(hits, `seat ${seat} must fire exactly once per interval`).toBe(1);
    }
  });

  it('seats are PHASE-SPREAD by index, so four castles do not all fire on one tick', () => {
    // The shipped id-mod idiom. Lockstep would be a visual and scan-cost spike, not a defect, but
    // spreading is free here and it is what the project's own cadence rule asks for.
    const slots = [0, 1, 2, 3].map((seat) => {
      for (let t = 0; t < CASTLE_FIRE_INTERVAL_TICKS; t++) if (castleFiresOnTick(seat, t)) return t;
      throw new Error('unreachable');
    });
    expect(new Set(slots).size, 'four seats, four distinct slots').toBe(4);
  });

  it('⚠ the schedule is ABSOLUTE, so there is no insta-fire-on-load hazard', () => {
    // A stored `nextFireTick` has to be re-phased on restore (the Council MF5 correction for
    // defenders). This cannot: the same tick always means the same answer.
    expect(castleFiresOnTick(0, 900)).toBe(castleFiresOnTick(0, 900 + CASTLE_FIRE_INTERVAL_TICKS));
  });
});

describe('S160 P4b — targeting: NEAREST ENEMY IN RANGE (owner, superseding Q4)', () => {
  it('⭐ shoots an enemy creature standing inside range', () => {
    const w = fightWorld();
    const victim = enemyNearSeat0(w, CASTLE_ATTACK_RANGE - 50);
    const before = w.creatures.get(victim)!.ehp;
    fireOnce(w);
    const after = w.creatures.get(victim);
    // A chewer has a 5-fifth pool and a shot is 8, so it dies outright.
    expect(
      after === undefined || after.ehp < before,
      'an enemy inside range must be hit',
    ).toBe(true);
  });

  it('⛔ THE RULING: it fires WITHOUT having been attacked first — Q4 is superseded', () => {
    // Under Q4 (retaliation-only, 300-tick window) this creature has damaged nothing, so the castle
    // would never acquire it and an army could walk past to eat the towers behind. That is the
    // behaviour the owner reversed.
    const w = fightWorld();
    const victim = enemyNearSeat0(w, 100);
    expect(w.players.get(P0)!.castleHp, 'the castle is UNDAMAGED — no retaliation trigger exists').toBe(
      CASTLE_MAX_HP,
    );
    fireOnce(w);
    expect(w.creatures.has(victim), 'the passer-by is shot anyway').toBe(false);
  });

  it('does NOT shoot past its range', () => {
    const w = fightWorld();
    const victim = enemyNearSeat0(w, CASTLE_ATTACK_RANGE + 60);
    const before = w.creatures.get(victim)!.ehp;
    fireOnce(w);
    expect(w.creatures.get(victim)?.ehp, 'out of range is out of range').toBe(before);
  });

  it('⛔ spares its OWNER — the contract every weapon in this game holds', () => {
    const w = fightWorld();
    const own = creatureNearSeat0(w, 60, P0); // MINE
    fireOnce(w);
    expect(w.creatures.has(own), 'a castle never shoots its own unit').toBe(true);
  });

  it('picks the NEAREST of two enemies in range', () => {
    const w = fightWorld();
    const far = enemyNearSeat0(w, 250);
    const near = enemyNearSeat0(w, 80);
    fireOnce(w);
    expect(w.creatures.has(near), 'the near one was shot').toBe(false);
    expect(w.creatures.has(far), 'the far one was not').toBe(true);
  });
});

describe('S160 P4b — the gates that make elimination mean something', () => {
  it('⛔ a FALLEN castle does not shoot', () => {
    // Without this, elimination is cosmetic: a dead seat keeps applying pressure forever.
    const w = fightWorld();
    const victim = enemyNearSeat0(w, 100);
    w.players.get(P0)!.castleHp = 0;
    const before = w.creatures.get(victim)!.ehp;
    fireOnce(w);
    expect(w.creatures.get(victim)?.ehp, 'a dead castle is silent').toBe(before);
  });

  it('⛔ nothing fires during BUILD (S149 R5 — nothing attacks during BUILD)', () => {
    const w = fightWorld();
    const victim = enemyNearSeat0(w, 100);
    w.matchPhase = 'BUILD';
    const before = w.creatures.get(victim)!.ehp;
    for (let i = 0; i < CASTLE_FIRE_INTERVAL_TICKS * 2; i++) {
      w.tick++;
      castleGunsTick(w);
    }
    expect(w.creatures.get(victim)?.ehp, 'the weapon stands down at the FIGHT->BUILD edge').toBe(before);
  });
});

describe('S160 P4b — R94: the castle is STAT-IDENTICAL for every race, forever', () => {
  /**
   * ⛔ THE TRIPWIRE THE SPEC ASKED FOR (§3.3). Owner R94, narrowing R88: *"it won't be fair if one
   * castle is seven hundred, especially in the beginning."* Races differ in how the attack LOOKS and
   * TRAVELS, never in what it does. This is the single constraint most likely to be broken by a
   * well-meaning "just one small race bonus" edit, so it is asserted rather than trusted.
   */
  it('⭐ the damage is identical whatever race the seat is', () => {
    const seen = new Set<number>();
    for (const race of ALL_RACES) {
      const w = fightWorld();
      w.players.get(P0)!.raceId = race;
      const victim = enemyNearSeat0(w, 100);
      const before = w.creatures.get(victim)!.ehp;
      fireOnce(w);
      const after = w.creatures.get(victim);
      seen.add(after === undefined ? -1 : after.ehp - before);
    }
    expect(seen.size, `every race must deal the same damage; saw ${[...seen].join(', ')}`).toBe(1);
  });

  it('the module never reads raceId at all — the static half of the same guard', async () => {
    // Behaviour can coincide; a source read cannot. Both halves, because a future edit could key a
    // RANGE or a CADENCE off the race and still pass the damage assertion above.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./castleGuns.ts', import.meta.url), 'utf8'),
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code, 'comment-stripping must not have emptied the haystack').toContain('castleGunsTick');
    expect(code, 'no castle stat may ever be keyed off the race (R94)').not.toMatch(/raceId/);
  });
});

describe('S160 P4b — the shot sits on the shared fifths ladder', () => {
  it("the shot is exact on the ladder, not approximated — S181: x5, so 40", () => {
    /*
     * ⭐⭐ S181 (owner) — *"the damage output of the tower should be stronger. It should be like five
     * times more than it is now."* Taken ON the ladder: ATK 1 → 5 with PEN held at 3, so
     * `attackFifths(5, 3)` = 40 = exactly 5 × the shipped 8.
     *
     * ⛔ DERIVED FROM THE CONSTANTS, NOT RE-TYPED. The old assertion was the literal `8`, which is
     * why this file went red the moment the owner retuned the gun — correct behaviour for a gate,
     * but the re-pin should not need doing a third time. Writing it as `attackFifths(CASTLE_ATK,
     * CASTLE_PEN)` keeps the LADDER as the thing under test while letting him retune freely.
     */
    expect(castleShotFifths()).toBe(attackFifths(CASTLE_ATK, CASTLE_PEN));
    expect(castleShotFifths()).toBe(40);
  });

  it('⭐⭐ S181 — it now one-shots the shield goblin too, and that is the owner asking for it', () => {
    /*
     * ⛔ THIS ASSERTION WAS INVERTED BY AN OWNER DECISION, NOT BY A BUG, and the inversion is the
     * whole point of recording it here. Until S181 the gate read *"a shield goblin must survive a
     * single castle shot"* — the castle punished leakers and lost to a real push, which was the
     * shape he had asked for. Then, one turn after being shown that the shot was 8:
     *
     * > *"the damage output of the tower should be stronger. It should be like five times more."*
     *
     * At 40 fifths the shield goblin's 16-fifth pool no longer survives. So the castle no longer
     * merely punishes leakers — it beats anything that arrives in ones and twos. He chose that with
     * the number in front of him, so the gate now pins the NEW truth rather than being deleted.
     *
     * ⚠ AND THE PUSH MEASUREMENT BELOW IS WHAT KEEPS IT HONEST: a sustained push still takes a keep,
     * so the castle-kill win condition survives the buff instead of being quietly switched off.
     */
    expect(castleShotFifths()).toBeGreaterThanOrEqual(unitPoolFifths(GOBLIN_SHIELD_ATK, GOBLIN_SHIELD_DEF));
  });
});

describe('S160 P4b — ⛔ WHAT THE GUN COSTS THE CASTLE-KILL WIN CONDITION, MEASURED', () => {
  /**
   * ⛔ THE NUMBER THE OWNER HAS TO RULE ON, and it is measured through the real host tick rather
   * than argued.
   *
   * `GOBLIN_DAMAGE_VS_CASTLE`'s docblock is tuned for a castle that does NOT shoot back:
   * *"ten goblins bring it inside a couple of FIGHT phases"* (10 x 6 damage per 60 ticks = 1 HP/tick,
   * so ~1500 ticks of contact). A working gun necessarily makes that harder, and at Q3's original
   * 45-tick cadence it made it IMPOSSIBLE — the castle one-shots every melee unit in the game, so
   * the castle-kill victory quietly stopped existing while `PHASE_1_WIN_SCORE` became the only real
   * win condition, with nothing red anywhere.
   *
   * At the shipped 240-tick cadence the path survives, and this pins the price:
   *   ·  1 goblin  -> ZERO damage; shot before its first swing
   *   ·  5 goblins -> first hit at tick 61, castle holds at ~1284
   *   · 10 goblins -> castle HOLDS (~474) — the shipped tuning's figure is no longer enough
   *   · 15 goblins -> castle FALLS, ~tick 1342
   *
   * ⇒ **A sustained push needs about 15 where the tuning assumed 10.** Which of the two constants
   * should move — `CASTLE_FIRE_INTERVAL_TICKS` or `GOBLIN_DAMAGE_VS_CASTLE` — is the OWNER'S call.
   * This test exists so that whichever way they rule, the number in the documents is a measurement.
   */
  const pushOf = (n: number): { fell: boolean; hpLeft: number } => {
    const w = fightWorld();
    const enemy = castleAnchor(1, w.layout);
    for (let i = 0; i < n; i++) {
      dispatch(w, {
        type: 'SPAWN_CREATURE',
        creatureType: 'goblinMelee',
        ownerPlayerId: P0,
        pos: { x: enemy.x + i * 3, y: enemy.y },
        targetPos: { x: enemy.x, y: enemy.y },
        // ⛔ DISTINCT, or B1 collapses the whole army to one unit — silently.
        sourceSpawnerId: asSpawnerId(i + 1),
      });
    }
    const d = hostDeps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 2600; t++) {
      runHostTick(w, d, st);
      if (w.players.get(P1)!.castleHp <= 0) break;
    }
    const hpLeft = w.players.get(P1)!.castleHp;
    return { fell: hpLeft <= 0, hpLeft };
  };

  /**
   * ⭐⭐ S181 (owner) — **RE-MEASURED AGAIN, NOT RELAXED, after the keep went to 2500 and its gun x5.**
   *
   * > *"Raise tower total health to two thousand five hundred points, just like how much you need to
   * > win."* · *"And also the damage output of the tower should be stronger. It should be like five
   * > times more than it is now."*
   *
   * ⭐ THE TWO CHANGES PULL IN OPPOSITE DIRECTIONS AND THE MEASUREMENT IS THE ONLY HONEST ANSWER.
   * The pool went up 5/3, which should make a keep proportionally harder to fell — but the gun went
   * up 5x, so it now kills a shield goblin outright and thins the push that is trying to fell it.
   * Guessing "about fifteen" from the pool ratio alone would have been wrong: the real threshold
   * moved from between eight and ten to **between ten and twelve**, a factor of ~1.2 rather than the
   * 1.67 the pool suggests. That gap IS the gun buff, and it is why this fixture gets re-run rather
   * than reasoned about.
   *
   * MEASURED through the real host tick, this file's own `pushOf`, S181:
   *   ·  1 → 2500 (untouched; shot before its first swing)      ·  8 → 1264
   *   ·  2 → 2476                                                · 10 →  532  (holds, just)
   *   ·  4 → 2260                                                · 12 → FALLS
   *   ·  6 → 1876
   *
   * ⇒ **ten nearly do it, twelve bring it down.** Read it as a reading off ONE fixture — goblins
   * spawned in contact on an empty board — exactly as the S160 note warned: *"15 is the number for
   * THAT fixture and nothing more."*
   *
   * ⛔ AND THE ORDERING THIS GATE ACTUALLY PROTECTS IS UNCHANGED, which is the point of keeping it:
   * one leaker still cannot scratch a keep, and a sustained push still takes one. The castle-kill
   * victory is still reachable rather than deleted by the buff.
   */
  it('⭐ ONE leaker cannot scratch it, TEN nearly do, TWELVE bring it down', () => {
    expect(pushOf(1).hpLeft, 'a lone unit deals nothing — the gun kills it first').toBe(CASTLE_MAX_HP);
    expect(pushOf(10).fell, 'TEN still cannot quite finish it, so a push is still a commitment').toBe(false);
    expect(
      pushOf(10).hpLeft,
      'and it is CLOSE — this is the number that moves if the keep or the gun is retuned',
    ).toBeLessThan(CASTLE_MAX_HP / 2);
    expect(pushOf(12).fell, 'TWELVE takes the castle, so the win condition survives the buff').toBe(true);
  });

  it('the castle-kill path is not merely reachable but reachable INSIDE one fight', () => {
    // If it took longer than a FIGHT phase the armies would be recalled first and the win condition
    // would be unreachable in practice even though a long-enough loop can reach it.
    const w = fightWorld();
    const enemy = castleAnchor(1, w.layout);
    for (let i = 0; i < 15; i++) {
      dispatch(w, {
        type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: P0,
        pos: { x: enemy.x + i * 3, y: enemy.y }, targetPos: { x: enemy.x, y: enemy.y },
        sourceSpawnerId: asSpawnerId(i + 1),
      });
    }
    const d = hostDeps();
    const st = makeHostTickState(w);
    let fellAt = -1;
    for (let t = 0; t < FIGHT_PHASE_TICKS; t++) {
      runHostTick(w, d, st);
      if (w.players.get(P1)!.castleHp <= 0) { fellAt = t; break; }
    }
    expect(fellAt, 'the castle must fall inside a single FIGHT phase').toBeGreaterThan(0);
    expect(fellAt).toBeLessThan(FIGHT_PHASE_TICKS);
  });
});
