/**
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
import { PLAYER_COLORS, RACE_UNIT_EMIT_INTERVAL_TICKS, SPAWN_INTERVAL_TICKS } from '../constants.ts';
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
  it('⭐ three castle windows produce three units — not the chewer clock, which would give six', () => {
    const w = buildAndIgnite();
    const WINDOWS = 3;
    run(w, RACE_UNIT_EMIT_INTERVAL_TICKS * WINDOWS + 5);
    expect(towerUnits(w)).toBe(WINDOWS);
  });

  it('CONTROL — the chewer interval really is different, else the test above is vacuous', () => {
    // If these two ever became equal, "three not six" would be unfalsifiable and the guard above
    // would silently stop guarding. This is the negative control for the negative control.
    expect(RACE_UNIT_EMIT_INTERVAL_TICKS).not.toBe(SPAWN_INTERVAL_TICKS);
  });

  it('⭐ all six towers read ONE cadence definition — seed, re-alignment and emit alike', () => {
    // `spawnerIntervalTicks` is the single definition the seed (`spawnerLifecycle`), the BUILD-phase
    // re-alignment and the emit all read. Pinned to the CASTLE's constant, which is what the owner
    // asked for ("similar rate as the castle") rather than a number of my own choosing.
    for (const race of Object.keys(RACE_TOWER_IDS) as RaceId[]) {
      expect(spawnerIntervalTicks(RACE_TOWER_IDS[race]), race).toBe(RACE_UNIT_EMIT_INTERVAL_TICKS);
    }
  });

  it('⭐ the first unit is NOT free — the tower waits a full window like the castle', () => {
    // Seeded `nextSpawnTick = tick + interval`, so a tower built at the start of a fight owes the
    // player nothing until its first window closes. Pinned because "emits immediately on ignition"
    // is the tempting shortcut and it would double the tower's value over a short fight.
    const w = buildAndIgnite();
    run(w, RACE_UNIT_EMIT_INTERVAL_TICKS - 5);
    expect(towerUnits(w)).toBe(0);
  });
});
