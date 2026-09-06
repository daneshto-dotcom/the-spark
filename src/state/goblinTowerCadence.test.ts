/**
 * SPARK — S152 A1 — THE GOBLIN TOWER EMITS NOTHING ON A CADENCE.
 *
 * ## ⛔ THE BUG THIS EXISTS TO STOP, AND WHY NOTHING CAUGHT IT
 *
 * Owner, on playtesting the live build: *"goblin tower is passively generating pencil chewers. i
 * think you have made this tower also have same specs as pentagram... WRONG."* — and that diagnosis
 * was exactly right.
 *
 * `hostTick`'s spawner poll branched the emit as `if (recipeId === 'lightningHub') {…drones…} else
 * {…spawn chewer…}`. That `else` IS the pentagram behaviour, written as a DEFAULT — so it caught
 * every recipeId that was not the lightning hub. S152 P2 made the goblin tower register a spawner
 * for the first time in its life, and it fell straight into the chewer arm.
 *
 * ⚠ THE DEFAULT IS THE DEFECT, NOT THE GOBLIN TOWER. Any future producing recipe would have
 * inherited chewers the same silent way, which is why the fix is an explicit per-recipe branch and
 * why this test asserts the PROPERTY ("a feed-only tower emits nothing") rather than poking at the
 * one recipe that happened to expose it.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SPAWN_INTERVAL_TICKS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { blueprintBill } from './blueprints.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { makeCastleBank } from './castleBank.ts';
import { runSpawnerIgnition } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { makeWorld, type World } from './world.ts';
import { asPlayerId } from '../types.ts';
import './godlyRecipes/goblinTower.ts';
import './godlyRecipes/pentagram.ts';

const P0 = asPlayerId(0);

function buildAndIgnite(id: 'goblinTower' | 'pentagram'): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill(id)) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: { x: 420, y: 400 } });
  runSpawnerIgnition(w);
  // Creatures only tick in FIGHT, and so does the spawner poll — put the match there.
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 100_000;
  return w;
}

// The REAL host tick, not a state poke — the S136 standing lesson is that a state assertion is not
// evidence. Fixture copied from `creatures/goblin.test.ts` so the harness stays one shape.
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

/** Advance well past several emit slots, so a cadence that fires at all cannot hide. */
function runPastSeveralCadences(w: World): void {
  const d = deps();
  const st = makeHostTickState(w);
  for (let i = 0; i < SPAWN_INTERVAL_TICKS * 3 + 10; i++) {
    w.tick++;
    runHostTick(w, d, st);
  }
}

describe('S152 A1 — a FEED-ONLY tower has no passive cadence', () => {
  it('⛔ a goblin tower emits NOTHING over three full cadence windows', () => {
    const w = buildAndIgnite('goblinTower');
    // Guard the premise: if it never ignited, "no creatures" would pass for the wrong reason and
    // this test would be permanently green decoration.
    const live = [...w.creatureSpawners.values()].filter((s) => s.recipeId === 'goblinTower');
    expect(live).toHaveLength(1);

    runPastSeveralCadences(w);
    /*
     * ⛔ S165 W1-C — COUNT WHAT THE TOWER EMITS, NOT EVERY CREATURE ALIVE.
     *
     * This read `w.creatures.size` as a proxy for "the goblin tower emitted nothing", which held
     * only while the spawner poll was the only thing that could mint a creature. R120 now has every
     * castle producing a free `raceUnit` on a ~30 s cadence in BOTH phases, and
     * `runPastSeveralCadences` runs long enough to cross it — so a whole-map count reds this test
     * for a reason that has nothing to do with the goblin tower.
     *
     * ⚠ Narrowed to the family under test rather than widened to a tolerance: the claim is that
     * a FEED-ONLY tower has no PASSIVE cadence, and it is still asserted exactly.
     */
    expect([...w.creatures.values()].filter((c) => c.type !== 'raceUnit')).toEqual([]);
  });

  it('⭐ and the PENTAGRAM still does — the fix must not have muted the default recipe', () => {
    // The other half of the assertion. Silencing every spawner would also make the test above pass,
    // so the recipe that is SUPPOSED to emit chewers is checked in the same breath.
    const w = buildAndIgnite('pentagram');
    const live = [...w.creatureSpawners.values()].filter((s) => s.recipeId === 'pentagram');
    expect(live).toHaveLength(1);

    runPastSeveralCadences(w);
    // Same narrowing as above, and the `every` check keeps its teeth: of the creatures the SPAWNER
    // produced, all must be chewers. Race units are excluded because the castle, not the pentagram,
    // makes them.
    const spawned = [...w.creatures.values()].filter((c) => c.type !== 'raceUnit');
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned.every((c) => c.type === 'chewer')).toBe(true);
  });
});
