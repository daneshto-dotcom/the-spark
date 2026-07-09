/**
 * SPARK — S119 P1: runHostTick replay-determinism (HARD GATE).
 *
 * The S107 P2 gate locks stepPhysics (the Verlet/bond/collision core). This
 * gate locks the ENTIRE host per-tick body — stepPhysics PLUS scoring,
 * gameState, the hazard/creature/tower polls, bots and the DROP-BENCH sweep —
 * i.e. exactly the unit that will one day run inside a Web Worker
 * (WORKER_SIM_FOUNDATION.md phase a). Two same-seed 1000-tick runs (WITH
 * seeded bots actively building/acting) must be byte-identical.
 *
 * Companion: hostTick.differential.test.ts proves the extraction did not
 * drift from the pre-S119 inline main.ts code; THIS gate proves the unit is
 * deterministic going forward (the phase-d worker cross-check relies on it).
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { BotManager } from '../bots/botManager.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { SpatialGrid } from '../physics/spatial.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { snapshot } from './save.ts';
import { hashWorldState } from './stateHash.ts';
import { dispatch, makeWorld, type World } from './world.ts';

// controls is only read for state.kind + applyPerSubstep() (S107 P2 finding) —
// a no-op Idle stub fully drives the host physics path.
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function determinismJson(world: World): string {
  const snap = snapshot(world);
  const { savedAt: _ignore, ...rest } = snap;
  void _ignore;
  return JSON.stringify(rest);
}

interface HostRig {
  world: World;
  deps: HostTickDeps;
  state: HostTickState;
}

/**
 * A VS-BOTS match (the richest single-machine host path): human seat 0 +
 * 2 seeded bots that genuinely think/build via dispatch each tick, so the
 * polls (creatures, spawner income, hunter at 75%, bench gates) see real
 * evolving state — not a static field.
 */
function buildBotsRig(seed: number): HostRig {
  const world = makeWorld(seed);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: 3 }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat] }));
  dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats: [1, 2] });
  const deps: HostTickDeps = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
    grid: new SpatialGrid(32),
    controls: stubControls,
    botManager: new BotManager(['MID', 'HARD'], seed),
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  };
  return { world, deps, state: makeHostTickState(world) };
}

function runTicks(rig: HostRig, iters: number): void {
  for (let t = 0; t < iters; t++) runHostTick(rig.world, rig.deps, rig.state);
}

describe('Replay determinism — S119 P1 runHostTick full host body (HARD GATE)', () => {
  const ITERS = 1000;

  it('two same-seed 1000-tick bot runs are byte-identical (snapshot AND state hash)', () => {
    const SEED = 0x51191a;
    const a = buildBotsRig(SEED);
    runTicks(a, ITERS);
    const b = buildBotsRig(SEED);
    runTicks(b, ITERS);
    expect(determinismJson(a.world)).toBe(determinismJson(b.world));
    expect(hashWorldState(a.world)).toBe(hashWorldState(b.world));
  });

  it('different seeds diverge (canary — the gate has real signal)', () => {
    const a = buildBotsRig(0x51191a);
    runTicks(a, ITERS);
    const b = buildBotsRig(0x0ddba11);
    runTicks(b, ITERS);
    // Different spawner + bot RNG streams → different builds → divergent state.
    expect(hashWorldState(a.world)).not.toBe(hashWorldState(b.world));
  });

  it('actually advances the full host body (tick, live-match state, evolution)', () => {
    const rig = buildBotsRig(0x51191a);
    const initialHash = hashWorldState(rig.world);
    runTicks(rig, ITERS);
    // Exactly one tick per call (stepPhysics increments when PLAYING; the
    // non-PLAYING branch increments manually — either way, once).
    expect(rig.world.tick).toBe(ITERS);
    expect(rig.world.players.size).toBe(3);
    // The run stayed in (or legitimately completed) a live match — a WIN by a
    // fast bot pair parks the world in WIN/POSTGAME, which still exercises the
    // non-PLAYING tick++ path. (No freeSparks assert: bots consume sparks and
    // the S109 TTL reaps stragglers — an empty pool late-game is legal.)
    expect(['PLAYING', 'WIN', 'POSTGAME']).toContain(rig.world.gameState);
    expect(hashWorldState(rig.world)).not.toBe(initialHash); // state actually evolved
  });
});
