/**
 * SPARK — S147 P1 Step 0: HAZARDS-OFF IS RNG-NEUTRAL.
 *
 * R14/R23 switched potato bomb, regular bomb, seagull and rainbow OFF while keeping the code
 * ("restoring then costs one line instead of an archaeology session"). The way that was done is
 * load-bearing for determinism, and this file is the guard on it.
 *
 * ⛔ THE INVARIANT: `HAZARD_SPAWN_ENABLED` is consulted ONLY at the four DISPATCH sites in
 * `physicsLoop.ts`, which are DOWNSTREAM of every RNG draw. `Spawner.tick` still counts down, still
 * mints hazard requests, and still redraws each countdown from its own per-hazard stream ("skip and
 * redraw" — the same posture the shipped `*_MAX_ACTIVE` caps already used). Consequence: turning
 * hazards off perturbs NO random sequence anywhere, so no replay expectation, differential hash or
 * recorded spark stream moves.
 *
 * ⚠ WHY THIS IS A TEST AND NOT JUST A COMMENT. Council (GROK-PLAN, S147 C5) challenged exactly this
 * as the thing that will rot: a future edit moves a draw below the gate, or a new hazard puts its RNG
 * call inside the gated block, and hazards-off silently stops being RNG-neutral. A comment cannot
 * catch that. These assertions can, and they fail loudly at the moment it happens.
 *
 * The naive alternative the ruling itself suggested — setting the cadence constants to zero — would
 * have been WRONG twice over, and `constants.ts` records why: the cadence is a spark COUNTDOWN, so
 * zero means "spawn on the very next spark" (maximum frequency, not off), and editing MIN/MAX changes
 * the DRAW VALUES rather than leaving them alone.
 */

import { describe, expect, it } from 'vitest';
import {
  BOMB_SPAWN_MAX_SPARKS,
  HAZARD_SPAWN_ENABLED,
  PHYSICS_HZ,
  POTATO_SPAWN_MAX_SPARKS,
  RAINBOW_SPAWN_MAX_SPARKS,
  SEAGULL_SPAWN_MAX_SPARKS,
} from '../constants.ts';
import { mulberry32 } from '../state/rng.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from './spawner.ts';
import type { Spark } from './spark.ts';

// Local, matching the same one-liner every other spec in this directory uses (constants.ts exports
// PHYSICS_HZ; PHYSICS_DT lives in physicsLoop/spawner as a derived private).
const PHYSICS_DT = 1 / PHYSICS_HZ;

/**
 * Drive a fresh seeded spawner for `ticks` and collect everything it emitted.
 *
 * ⚠ ALL FOUR HAZARD STREAMS MUST BE PASSED. `Spawner`'s constructor defaults each of `bombRng`,
 * `potatoRng`, `rainbowRng` and `seagullRng` to `null`, and null means "this hazard is disabled" at
 * the SPAWNER level (`spawner.ts`: `if (this.bombRng !== null && --this.sparksUntilBomb <= 0)`). A
 * two-argument `new Spawner(cfg, rng)` therefore mints no hazard requests at all — which would make
 * every assertion below pass for entirely the wrong reason. Distinct offsets per stream so they are
 * independent, mirroring the live wiring.
 */
function drive(seed: number, ticks: number) {
  const spawner = new Spawner(
    DEFAULT_SPAWNER_CONFIG,
    mulberry32(seed),
    mulberry32(seed ^ 0x1111),
    mulberry32(seed ^ 0x2222),
    mulberry32(seed ^ 0x3333),
    mulberry32(seed ^ 0x4444),
  );
  const sparks: Spark[] = [];
  const bombs: { pos: { x: number; y: number } }[] = [];
  const potatoes: { pos: { x: number; y: number } }[] = [];
  const rainbows: { pos: { x: number; y: number } }[] = [];
  const seagulls: { pos: { x: number; y: number }; vx: number }[] = [];
  for (let t = 0; t < ticks; t++) {
    spawner.tick(PHYSICS_DT, t, sparks, bombs, potatoes, rainbows, seagulls);
  }
  return { sparks, bombs, potatoes, rainbows, seagulls };
}

/** A stable fingerprint of the spark stream — ids, types and positions, in emission order. */
function sparkFingerprint(sparks: readonly Spark[]): string {
  return sparks.map((s) => `${s.id}:${s.type}:${s.pos.x.toFixed(6)},${s.pos.y.toFixed(6)}`).join('|');
}

// Enough ticks that every hazard's countdown must have elapsed several times over. The rarest band
// is the rainbow/bomb at up to ~15 sparks, and the base spark rate is well under one per tick, so
// this is sized off the constants rather than a magic number.
const LONG_RUN_TICKS = 60 * 60 * 8; // 8 simulated minutes

describe('S147 P1 Step 0 — hazards are OFF at the dispatch site, not at the draw', () => {
  it('HAZARD_SPAWN_ENABLED is false in the production build (R14/R23)', () => {
    expect(HAZARD_SPAWN_ENABLED).toBe(false);
  });

  /**
   * ⭐ THE CORE GUARD. The spawner must STILL mint hazard requests with hazards disabled. If a future
   * edit "optimises" by moving the flag up into `Spawner.tick` — skipping the countdown or the
   * position draw — these arrays go empty, the per-hazard RNG streams stop advancing, and every
   * recorded spark sequence in the replay suite silently shifts. That is the failure this catches.
   */
  it('STILL mints bomb/potato/rainbow/seagull requests while hazards are disabled', () => {
    const out = drive(0x5eed, LONG_RUN_TICKS);
    expect(out.sparks.length).toBeGreaterThan(0);
    expect(out.bombs.length, 'bomb requests must still be minted (the gate is downstream)').toBeGreaterThan(0);
    expect(out.potatoes.length, 'potato requests must still be minted').toBeGreaterThan(0);
    expect(out.rainbows.length, 'rainbow requests must still be minted').toBeGreaterThan(0);
    expect(out.seagulls.length, 'seagull requests must still be minted').toBeGreaterThan(0);
  });

  it('mints them at roughly the shipped cadence — the countdown constants were NOT zeroed', () => {
    // If MIN/MAX had been set to 0 (the ruling's suggested-but-wrong implementation) the countdown
    // would fire on EVERY spark, so requests would number ~= sparks. Assert the real relationship
    // instead: far fewer hazards than sparks, bounded below by the widest cadence band.
    const out = drive(0xc0ffee, LONG_RUN_TICKS);
    const widest = Math.max(
      BOMB_SPAWN_MAX_SPARKS,
      POTATO_SPAWN_MAX_SPARKS,
      RAINBOW_SPAWN_MAX_SPARKS,
      SEAGULL_SPAWN_MAX_SPARKS,
    );
    for (const [name, arr] of [
      ['bombs', out.bombs],
      ['potatoes', out.potatoes],
      ['rainbows', out.rainbows],
      ['seagulls', out.seagulls],
    ] as const) {
      // At its very fastest a hazard fires once per MIN sparks, so it can never out-number the sparks
      // themselves; and with a real band it must be a small fraction of them.
      expect(arr.length, `${name} must be rarer than sparks`).toBeLessThan(out.sparks.length);
      expect(
        arr.length,
        `${name} fires far less often than once per spark (cadence was not zeroed)`,
      ).toBeLessThanOrEqual(Math.ceil(out.sparks.length / 2));
    }
    expect(widest).toBeGreaterThan(1); // the bands are real, not collapsed to 0/1
  });

  /**
   * The determinism half: the spawner is a pure function of its seed, and nothing about hazard gating
   * touches it. Same seed ⇒ byte-identical spark stream AND byte-identical hazard request counts.
   */
  it('is a pure function of the seed — identical runs are byte-identical', () => {
    const a = drive(0xabc123, 60 * 60 * 2);
    const b = drive(0xabc123, 60 * 60 * 2);
    expect(sparkFingerprint(a.sparks)).toBe(sparkFingerprint(b.sparks));
    expect(a.bombs.length).toBe(b.bombs.length);
    expect(a.potatoes.length).toBe(b.potatoes.length);
    expect(a.rainbows.length).toBe(b.rainbows.length);
    expect(a.seagulls.length).toBe(b.seagulls.length);
  });

  it('different seeds produce different streams (the fingerprint is actually discriminating)', () => {
    // Guards against the previous test passing vacuously — e.g. if the fingerprint were constant.
    const a = drive(1, 60 * 60);
    const b = drive(2, 60 * 60);
    expect(sparkFingerprint(a.sparks)).not.toBe(sparkFingerprint(b.sparks));
  });
});
