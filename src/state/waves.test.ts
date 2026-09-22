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
  WAVE_SPAWN_BANDS,
  WAVE_SPAWN_RATE_STEP,
  waveSpawnBandFactor,
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
  it('wave 1 is normal, and each wave adds 0.2 — S186 LAYERED ON TOP, IT DID NOT REPLACE THIS', () => {
    // ⛔ His S157 ruling still governs band 1 EXACTLY. S186 multiplies the whole thing by a BAND
    // FACTOR which is 1 for waves 1-5, so every number he dictated here is byte-unchanged. A session
    // that finds this suite green has proof the older ruling survived the newer one.
    expect(waveSpawnMultiplier(1)).toBeCloseTo(1.0);
    expect(waveSpawnMultiplier(2)).toBeCloseTo(1.2);
    expect(waveSpawnMultiplier(3)).toBeCloseTo(1.4);
    expect(waveSpawnMultiplier(4)).toBeCloseTo(1.6);
    expect(waveSpawnMultiplier(5)).toBeCloseTo(1.8);
    expect(waveSpawnBandFactor(5), 'band 1 must be the identity, or S157 is silently retuned').toBe(1);
  });

  it('⭐ it is UNCAPPED, on the owner ruling — RE-PINNED S186, AND THE INVARIANT GOT STRONGER', () => {
    /*
     * "dont cap because people build more and more gatherers so it should scale in the way i have
     * described." I had proposed a 4x ceiling; the owner overruled it with an economy argument —
     * hauling capacity grows with the wave count too, so the shapes get consumed.
     *
     * ⚠ S186 MOVED THESE TWO LITERALS BY DESIGN, so they are RE-PINNED rather than relaxed — and
     * derived from the shipped constants, so the next retune cannot half-land. The band factor
     * PLATEAUS past wave 25 but the linear term does not, which is what keeps his ruling true
     * FOREVER rather than merely true up to 25. That is now asserted as the unbounded property
     * itself, which is a stronger guard than the two sample points ever were.
     */
    const top = WAVE_SPAWN_BANDS[WAVE_SPAWN_BANDS.length - 1]!.factor;
    expect(waveSpawnMultiplier(20)).toBeCloseTo((1 + WAVE_SPAWN_RATE_STEP * 19) * waveSpawnBandFactor(20));
    expect(waveSpawnMultiplier(50)).toBeCloseTo((1 + WAVE_SPAWN_RATE_STEP * 49) * top);

    // ⛔ THE RULING ITSELF: strictly increasing, with no ceiling, at every wave out to 500.
    for (let w = 1; w < 500; w++) {
      expect(waveSpawnMultiplier(w + 1), `wave ${w + 1} must be faster than wave ${w}`)
        .toBeGreaterThan(waveSpawnMultiplier(w));
    }
    expect(waveSpawnMultiplier(500)).toBeGreaterThan(waveSpawnMultiplier(100));
  });

  it('⭐⭐ S186 — the step-up lands on HIS four boundaries, and each one is bigger than the last', () => {
    /*
     * Owner, S186: "significantly faster: after wave 5, then after wave 10 even more, even faster
     * after 15, even faster after 20."
     *
     * ⚠ THE FACTORS ARE MINE, NOT HIS — he gave the shape, not the numbers, and they are sized off
     * the measured crossover in `spawnEconomy.measure.test.ts`. What IS his is that a step exists at
     * each of these four waves and that each step is larger in absolute shapes/s than the one before.
     */
    expect(WAVE_SPAWN_BANDS.map((b) => b.lastWave)).toEqual([5, 10, 15, 20, 25]);

    const boundaries = [5, 10, 15, 20];
    const jumps = boundaries.map((w) => waveSpawnMultiplier(w + 1) - waveSpawnMultiplier(w));
    for (const [i, w] of boundaries.entries()) {
      expect(jumps[i], `crossing into wave ${w + 1} must be a real step, not a rounding error`)
        .toBeGreaterThan(waveSpawnMultiplier(w) * 0.2);
    }
    for (let i = 1; i < jumps.length; i++) {
      expect(jumps[i], `the wave-${boundaries[i]! + 1} step must exceed the wave-${boundaries[i - 1]! + 1} step`)
        .toBeGreaterThan(jumps[i - 1]!);
    }
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
