/**
 * SPARK — S157 B8: WAVES.
 *
 * Owner: *"each build-fight turn should be considered as WAVE and there should be a place on the top
 * near the timer counting how many waves has it been. Also every wave the spawned primitives/shapes
 * should spawn faster and faster (0.2 each wave). so wave 1 is normal. wave 2 is 1.2. wave 3 is 1.4x
 * faster. wave 4 is 1.6 times faster etc..."*
 *
 * And on capping it: *"dont cap because people build more and more gatherers so it should scale in
 * the way i have described."*
 */

import { describe, expect, it } from 'vitest';
import {
  FIGHT_PHASE_TICKS,
  PHASE_DURATION_TICKS,
  PLAYER_COLORS,
  waveSpawnMultiplier,
} from '../constants.ts';
import { formatPhaseBanner } from '../render/ui.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { snapshot, restore } from './save.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import type { Controls } from '../input/controls.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function board(): World {
  const world = makeWorld(0xb8);
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
  return world;
}

describe('S157 B8 — the multiplier is exactly what the owner described', () => {
  it('wave 1 is normal, and each wave adds 0.2', () => {
    expect(waveSpawnMultiplier(1)).toBeCloseTo(1.0);
    expect(waveSpawnMultiplier(2)).toBeCloseTo(1.2);
    expect(waveSpawnMultiplier(3)).toBeCloseTo(1.4);
    expect(waveSpawnMultiplier(4)).toBeCloseTo(1.6);
  });

  it('⭐ it is UNCAPPED, on the owner ruling', () => {
    // "dont cap because people build more and more gatherers so it should scale in the way i have
    // described." I had proposed a 4x ceiling; the owner overruled it with an economy argument —
    // hauling capacity grows with the wave count too, so the shapes get consumed.
    expect(waveSpawnMultiplier(20)).toBeCloseTo(4.8);
    expect(waveSpawnMultiplier(50)).toBeCloseTo(10.8);
  });
});

describe('S157 B8 — the counter', () => {
  it('a match opens on wave 1', () => {
    expect(board().waveNumber).toBe(1);
  });

  it('⭐ one BUILD+FIGHT turn advances exactly one wave', () => {
    const world = board();
    const d = deps();
    const st = makeHostTickState(world);
    // Drive past the opening BUILD and its FIGHT, landing in the next BUILD.
    for (let t = 0; t < PHASE_DURATION_TICKS + FIGHT_PHASE_TICKS + 2; t++) runHostTick(world, d, st);
    expect(world.matchPhase, 'the fixture really completed a turn').toBe('BUILD');
    expect(world.waveNumber).toBe(2);
  });

  it('the HUD shows it beside the clock, and omitting it keeps the old string', () => {
    // Rendered into the existing banner rather than as a new surface — it is "near the timer" by
    // construction and inherits the banner's placement and safe-area handling.
    expect(formatPhaseBanner('BUILD', 5400, 3)).toBe('WAVE 3   BUILD  1:30');
    expect(formatPhaseBanner('BUILD', 5400)).toBe('BUILD  1:30');
  });
});

describe('S157 B8 — it is synced, because it drives the spawn rate', () => {
  it('⭐ the wave changes the state hash — a divergence here is a real desync', () => {
    const world = board();
    const before = hashWorldStateFull(world);
    world.waveNumber = 7;
    expect(
      hashWorldStateFull(world),
      'if this were unhashed, a host and a ?worker=1 mirror could silently disagree on how many shapes exist',
    ).not.toBe(before);
  });

  it('survives a save round-trip', () => {
    const world = board();
    world.waveNumber = 5;
    const w2 = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(world))), w2);
    expect(w2.waveNumber).toBe(5);
  });

  it('a pre-S157 save (no field) restores to wave 1 rather than NaN', () => {
    const world = board();
    const snap = JSON.parse(JSON.stringify(snapshot(world))) as Record<string, unknown>;
    delete snap.waveNumber;
    const w2 = makeWorld(1);
    restore(snap as never, w2);
    expect(w2.waveNumber).toBe(1);
  });
});
