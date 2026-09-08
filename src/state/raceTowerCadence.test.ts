/**
 * SPARK — S168 P2 / S169 — THE TIER-3 RACE TOWER EMITS, ON ITS OWN 15 s CLOCK, STARTING ON THE BELL.
 *
 * ## ⭐⭐ S169 — THREE TESTS IN THIS FILE WERE REVERSED BY THE OWNER, AND THE REVERSAL IS THE POINT
 *
 * He played the S168 build and reported: *"the tier three towers, they're not really producing.
 * Sometimes they're producing two. They're very much noncoherent … I did the Piranha, and it didn't
 * produce at all … they need to produce in… on time … The minute the fight starts, they let out
 * first spawn, and then after fifteen seconds, another one … It can be in limitless amounts."*
 *
 * Two things changed, and each killed an assertion below that had been passing:
 *   1. **The rate is now 15 s and its OWN constant** (`RACE_TOWER_EMIT_INTERVAL_TICKS`), not the
 *      castle's 30 s. S168 welded them together on the strength of his word *"similar"*; he has now
 *      given a number, so the two are decoupled and the castle's R120 30 s is untouched.
 *   2. **The first unit is FREE, on the opening tick of the FIGHT.** The old test below pinned the
 *      exact opposite — *"the first unit is NOT free — the tower waits a full window like the
 *      castle"* — and called emitting immediately "the tempting shortcut". The owner has ruled for
 *      the shortcut, so that test is inverted rather than deleted, and the old text is quoted in it.
 *
 * ## ⛔ AND THE ROOT CAUSE OF *"noncoherent"* WAS NEITHER OF THOSE — IT WAS THE PHASE OFFSET
 *
 * `hostTick`'s dormant-spawner branch re-aligned with `while (tick >= next) next += step`, which
 * keeps the deadline ahead of now (all S157 P0 asked) but PRESERVES `next mod step`. Every tower
 * therefore entered the FIGHT on an arbitrary offset in `(0, step]`, set by when in a 90 s BUILD the
 * player finished the shape. Against a 45 s fight and the old 30 s step that is 2 units, or 1, or —
 * for an offset past 45 s — **none at all, for the whole fight, with every gate green**. Two towers
 * finished at different moments fired at unrelated times. That is the *"noncoherent"*, and
 * `fires on the opening tick of the FIGHT` below is the assertion that would have caught it.
 *
 * ## ⚠ ONE CONTROL IN THIS FILE HAD TO BE RE-POINTED, BECAUSE 15 s COLLIDES WITH THE CHEWER
 *
 * `SPAWN_INTERVAL_TICKS` is 900 and `15 × PHYSICS_HZ` is 900 — the tier-3 tower's new rate is
 * NUMERICALLY IDENTICAL to the chewer's. So the old negative control (*"the chewer interval really
 * is different, else the test above is vacuous"*) can no longer distinguish the two clocks, and
 * pretending otherwise would leave a guard that reads strict and proves nothing. It is re-pointed at
 * the CASTLE's constant, which is where the live regression risk now is: the one-line revert that
 * would undo the owner's ruling is `return RACE_UNIT_EMIT_INTERVAL_TICKS`.
 *
 * ---
 *
 * ## The original S168 header follows, because the bug it documents is still the reason this exists.
 *
 * SPARK — S168 P2 — THE TIER-3 RACE TOWER EMITS, AND IT EMITS ON THE CASTLE'S CLOCK.
 *
 * ## ⛔ The bug this exists to stop
 *
 * Owner, playing the live build: *"the tier 3 tower does not produce or spawn creatures! it should
 * produce spawn at similar rate as the castle does"*.
 *
 * He was right, and the cause was not a wiring fault — `hostTick`'s race-tower arm was **explicitly
 * empty**, shipped that way in S166 as the implementation of R108 (*"THE RACE TOWER IS TIER 3 AND IT
 * IS FED, goblin-tower style"*). Everything up to that arm worked: the recipe registered, ignition
 * named all six ids, `applyRegisterSpawner` minted a real spawner and seeded `nextSpawnTick`, and
 * the poll reached it every tick — where it did nothing, forever. `nextSpawnTick` was seeded, kept
 * aligned across the phase edge, and never once read.
 *
 * So this is an **owner reversal**, not a repair, and the tests below pin the NEW ruling.
 *
 * ## ⭐ Why the RATE is asserted and not just "it emits"
 *
 * "Emits at all" is the cheap half and it would stay green with the real defect still present.
 * `spawnerIntervalTicks` feeds THREE readers — the registration seed, the BUILD-phase re-alignment,
 * and the emit — and that module's own docblock records what happened the last time one of them
 * disagreed: the drone tower ran on the CHEWER's 15 s clock in three separate places, which against
 * a 45 s fight is *"the difference between a burst weapon and a tower that appears inert"*.
 *
 * If the emit had been added to `hostTick` WITHOUT the arm in `spawnerIntervalTicks`, the tower
 * would emit on a 30 s intent against a 15 s deadline — roughly DOUBLE the castle's rate — and an
 * "it emits" assertion would pass happily. The window-count test below is the one that fails.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  RACE_TOWER_EMIT_INTERVAL_TICKS,
  RACE_UNIT_EMIT_INTERVAL_TICKS,
  SPAWN_INTERVAL_TICKS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { blueprintBill } from './blueprints.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { makeCastleBank } from './castleBank.ts';
import { runSpawnerIgnition } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { spawnerIntervalTicks } from './spawners/spawner.ts';
import { RACE_TOWER_IDS, RACE_TOWER_UNIT } from './raceTowerIds.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { makeWorld, type World } from './world.ts';
import { asPlayerId } from '../types.ts';
import type { RaceId } from './races.ts';
import './godlyRecipes/raceTower.ts';

const P0 = asPlayerId(0);
/** Seat 0's default race (`defaultRaceForSeat`), so R137's owner check passes without poking state. */
const RACE: RaceId = 'vampires';

function buildAndIgnite(): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  const bank = makeCastleBank();
  const id = RACE_TOWER_IDS[RACE];
  for (const [type, count] of blueprintBill(id)) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, {
    type: 'BUILD_BLUEPRINT',
    playerId: P0,
    blueprintId: id,
    centre: { x: 420, y: 400 },
  });
  runSpawnerIgnition(w);
  // The spawner poll and the creature fan-out only run in FIGHT.
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

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

/**
 * Run the REAL host tick for `ticks` — the S136 standing rule that a state poke is not evidence.
 *
 * ⚠ AND IT DOES **NOT** ADVANCE `w.tick` ITSELF. `runHostTick` already does, at `hostTick.ts:290`.
 * The neighbouring `goblinTowerCadence.test.ts` harness increments as well, so its loop covers TWICE
 * the wall-clock it reads as — harmless there, because its assertions are "zero" and "more than
 * zero". It is NOT harmless here: this file counts emissions per window, and the double-advance made
 * three windows look like six units and reported it as the drone-tower clock bug. Measured, not
 * guessed — a trace printed emits at 1800/3600/5400/7200/9000/10800, i.e. a perfect 1800 cadence
 * over a loop that believed it had run 5405 ticks.
 */
function run(w: World, ticks: number): void {
  const d = deps();
  const st = makeHostTickState(w);
  const until = w.tick + ticks;
  while (w.tick < until) runHostTick(w, d, st);
}

/** Only what the TOWER made. The castle emits a free `raceUnit` on its own clock; that is not us. */
function towerUnits(w: World): number {
  const unit = RACE_TOWER_UNIT[RACE];
  return [...w.creatures.values()].filter((c) => c.type === unit).length;
}

describe('S168 P2 — the tier-3 race tower produces on a cadence (owner reversal of R108)', () => {
  it('CONTROL — the ring ignites, so a zero count below would mean something', () => {
    const w = buildAndIgnite();
    const live = [...w.creatureSpawners.values()].filter(
      (s) => s.recipeId === RACE_TOWER_IDS[RACE],
    );
    expect(live).toHaveLength(1);
  });

  it('⭐ emits its OWN race unit — not a chewer, which is what the old default would have made', () => {
    const w = buildAndIgnite();
    run(w, RACE_UNIT_EMIT_INTERVAL_TICKS + 10);
    expect(towerUnits(w)).toBeGreaterThan(0);
    // The S152 A1 defect, pinned from the other side: nothing here may be a pencil chewer.
    expect([...w.creatures.values()].some((c) => c.type === 'chewer')).toBe(false);
  });

  /*
   * ⭐⭐ THE ASSERTION THAT ACTUALLY CATCHES THE THREE-READERS BUG.
   *
   * Three castle-cadence windows must yield THREE units, not six. Six is what the tower produces if
   * `spawnerIntervalTicks` still returns the chewer's `SPAWN_INTERVAL_TICKS` for a race tower while
   * the emit advances by the castle's interval — the exact drone-tower defect, one tower on.
   */
  it('⭐ three of ITS OWN windows produce three units — the rate is exact, not merely non-zero', () => {
    const w = buildAndIgnite();
    const WINDOWS = 3;
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS * WINDOWS + 5);
    expect(towerUnits(w)).toBe(WINDOWS);
  });

  /*
   * ⭐⭐ S169 — THE REGRESSION THIS FILE NOW ACTUALLY GUARDS AGAINST, and it is a different one.
   *
   * The old control here asserted `RACE_UNIT_EMIT_INTERVAL_TICKS !== SPAWN_INTERVAL_TICKS` to keep
   * "three not six" falsifiable against the CHEWER clock. That is dead: the owner's 15 s IS the
   * chewer's 900 ticks, so no assertion in this file can separate those two numbers any more, and
   * leaving the old one would be a guard that reads strict and proves nothing.
   *
   * What CAN still be pinned — and is the one-line revert that would undo his ruling — is that the
   * tower no longer shares the CASTLE's clock. `spawnerIntervalTicks` returned
   * `RACE_UNIT_EMIT_INTERVAL_TICKS` for a whole session; if it ever does again, the window test
   * above starts counting 30 s windows and this line is what says why that is wrong.
   */
  it('CONTROL — the tower is DECOUPLED from the castle, which is the ruling that can regress', () => {
    expect(RACE_TOWER_EMIT_INTERVAL_TICKS).not.toBe(RACE_UNIT_EMIT_INTERVAL_TICKS);
    // And the castle's own R120 rate is untouched by the decoupling — the other half of the ruling.
    expect(RACE_UNIT_EMIT_INTERVAL_TICKS).toBe(30 * 60);
    // Recorded, not asserted-around: the new rate coincides with the chewer's. This documents the
    // collision at the place a future reader would otherwise re-derive it and mis-trust the file.
    expect(RACE_TOWER_EMIT_INTERVAL_TICKS).toBe(SPAWN_INTERVAL_TICKS);
  });

  it('⭐ all six towers read ONE cadence definition — seed, re-alignment and emit alike', () => {
    // `spawnerIntervalTicks` is the single definition the seed (`spawnerLifecycle`), the BUILD-phase
    // re-alignment and the emit all read. S169 — pinned to the tower's OWN constant now. The owner
    // gave the number ("fifteen seconds is better because it's low level enemy"), so this is his
    // rate rather than one of my choosing, and all six races must share it.
    for (const race of Object.keys(RACE_TOWER_IDS) as RaceId[]) {
      expect(spawnerIntervalTicks(RACE_TOWER_IDS[race]), race).toBe(RACE_TOWER_EMIT_INTERVAL_TICKS);
    }
  });

  /*
   * ⭐⭐ S169 — **THIS TEST IS THE OWNER'S REVERSAL, AND ITS OLD BODY IS QUOTED SO THE FLIP IS
   * LEGIBLE RATHER THAN LOOKING LIKE A WEAKENED ASSERTION.**
   *
   * It used to read `⭐ the first unit is NOT free — the tower waits a full window like the castle`,
   * with the body: *"Seeded `nextSpawnTick = tick + interval`, so a tower built at the start of a
   * fight owes the player nothing until its first window closes. Pinned because 'emits immediately
   * on ignition' is the tempting shortcut and it would double the tower's value over a short
   * fight."*
   *
   * The owner has ruled for the shortcut, in as many words: *"The minute the fight starts, they let
   * out first spawn."* His reasoning is the one the old comment weighed and rejected — over a 45 s
   * fight a tower that owes a full window first is worth very little, which is what he was seeing.
   *
   * ⚠ THE DISTINCTION THAT SURVIVES, and it is why this is two assertions rather than one: FREE ON
   * THE BELL applies to a tower that already existed when the fight started. A tower finished
   * mid-fight still owes its first window, because nothing re-pins a spawner that never sat through
   * a dormant tick. That is not a compromise — it keeps "built early" strictly better than "built
   * late", so the opening volley cannot be farmed by building during the fight.
   */
  it('⭐ a tower that sat through BUILD fires on the OPENING TICK of the fight (owner S169)', () => {
    const w = buildAndIgnite();
    // Put it back to dormant and let it sit, the way a real tower finished during a 90 s BUILD does.
    w.matchPhase = 'BUILD';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    run(w, 600); // 10 s of dormancy — long enough that the old `while` re-alignment would have
    //             left an arbitrary offset in (0, step] instead of a deadline equal to now.
    expect(towerUnits(w)).toBe(0); // dormant means dormant: nothing emits during BUILD.

    // The bell.
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    run(w, 1);
    expect(towerUnits(w)).toBe(1);
  });

  it('⭐ and exactly ONE on that tick — the pinned deadline is due once, not a banked burst', () => {
    // The hazard the old `while` re-alignment existed to prevent: a deadline left in the PAST
    // draining one unit per tick. Pinning to `world.tick` must not reintroduce it, and cannot,
    // because the emit arm advances the deadline inside a single `if`. Measured here rather than
    // argued: run a further 14 s and the count must still be 1, then tick past 15 s for the second.
    const w = buildAndIgnite();
    w.matchPhase = 'BUILD';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    run(w, 600);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS - 5);
    expect(towerUnits(w)).toBe(1);
    run(w, 10);
    expect(towerUnits(w)).toBe(2);
  });

  it('⭐ a tower finished DURING the fight still owes its first window', () => {
    const w = buildAndIgnite(); // already FIGHT, never sat through a dormant tick
    run(w, RACE_TOWER_EMIT_INTERVAL_TICKS - 5);
    expect(towerUnits(w)).toBe(0);
  });
});
