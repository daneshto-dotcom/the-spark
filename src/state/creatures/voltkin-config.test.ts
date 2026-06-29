/**
 * SPARK — Per-creature-type CreatureConfig table tests (S34 P2-20).
 *
 * These tests lock the shape and value contract of `voltkin-config.ts` so
 * future refactors / Anvil additions don't silently drift the Voltkin values
 * that `save.replay.test.ts` (S33 P1-12) validates at the deterministic-sim
 * level. The accessor + table-completeness guards live here.
 */

import { describe, it, expect } from 'vitest';
import {
  CREATURE_CONFIGS,
  VOLTKIN_CONFIG,
  CHEWER_CONFIG,
  getCreatureConfig,
  type CreatureConfig,
} from './voltkin-config.ts';
import {
  VOLTKIN_LIFETIME_TICKS,
  CREATURE_SPAWN_TICKS,
  CREATURE_DESPAWNING_TICKS,
  CREATURE_FADE_TICKS,
  VOLTKIN_ATTACK_RANGE,
  VOLTKIN_ATTACK_RANGE_SQ,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
} from './creature.ts';

describe('VOLTKIN_CONFIG (per-type config record)', () => {
  it('discriminator matches voltkin type', () => {
    expect(VOLTKIN_CONFIG.type).toBe('voltkin');
  });

  // Byte-exact regression lock: deliberate gameplay changes update these literals
  // WITH a PDR + replay-determinism re-run; accidental drift is caught here.
  // S58 (#4): lifetimeTicks 480 → 1200 (2.5× longer summon, user playtest call).
  it('locks the 7 Voltkin tuning constants by literal value', () => {
    expect(VOLTKIN_CONFIG.lifetimeTicks).toBe(1200);
    expect(VOLTKIN_CONFIG.spawnTicks).toBe(60);
    expect(VOLTKIN_CONFIG.despawningTicks).toBe(60);
    expect(VOLTKIN_CONFIG.fadeTicks).toBe(30);
    expect(VOLTKIN_CONFIG.attackRange).toBe(180);
    expect(VOLTKIN_CONFIG.attackCadenceTicks).toBe(60);
    expect(VOLTKIN_CONFIG.attackFireTick).toBe(30);
  });

  it('fadeTicks ≤ despawningTicks (blueprint Q8 invariant)', () => {
    expect(VOLTKIN_CONFIG.fadeTicks).toBeLessThanOrEqual(VOLTKIN_CONFIG.despawningTicks);
  });

  // S100 P1 (TD Phase 1a) — the new TD fields on VOLTKIN_CONFIG MUST keep Voltkin
  // byte-for-byte: lifetime-bound (persistent:false), single-fire zap (chewHits:0,
  // NOT the chew loop), full top speed (hopSpeedMul:1), and the de-hardcoded
  // CREATURE_MAX_ACCEL=200 unchanged. save.replay.test.ts is the empirical guard;
  // this locks the literals so accidental drift surfaces here (R4 / R16).
  it('locks the S100 TD fields on Voltkin (persistent:false / chewHits:0 / hopSpeedMul:1 / maxAccel:200)', () => {
    expect(VOLTKIN_CONFIG.persistent).toBe(false);
    expect(VOLTKIN_CONFIG.chewHits).toBe(0);
    expect(VOLTKIN_CONFIG.hopSpeedMul).toBe(1);
    expect(VOLTKIN_CONFIG.maxAccel).toBe(200);
  });

  it('attackFireTick falls inside the attackCadenceTicks window (and > 0 so wind-up exists)', () => {
    // S34 PB-8 — tightened from `>=0` to `>0` per Phase B PRIME-AUDIT.
    // computeCreatureTint (creatureRenderer.ts) divides ticksInState by FIRE_TICK
    // inside an `ATTACKING && ticksInState < FIRE_TICK` guard. With FIRE_TICK=0
    // the guard's `< 0` condition can never hold (ticksInState is unsigned), so
    // the division branch is unreachable — runtime is safe. The invariant
    // tightens the test bar so a future Anvil config that sets FIRE_TICK=0
    // surfaces here as a deliberate gameplay-spec decision (wind-up must exist),
    // not a silent regression.
    expect(VOLTKIN_CONFIG.attackFireTick).toBeGreaterThan(0);
    expect(VOLTKIN_CONFIG.attackFireTick).toBeLessThan(VOLTKIN_CONFIG.attackCadenceTicks);
  });
});

describe('back-compat exports in creature.ts derive from VOLTKIN_CONFIG', () => {
  it('VOLTKIN_LIFETIME_TICKS === VOLTKIN_CONFIG.lifetimeTicks', () => {
    expect(VOLTKIN_LIFETIME_TICKS).toBe(VOLTKIN_CONFIG.lifetimeTicks);
  });

  it('CREATURE_SPAWN_TICKS === VOLTKIN_CONFIG.spawnTicks', () => {
    expect(CREATURE_SPAWN_TICKS).toBe(VOLTKIN_CONFIG.spawnTicks);
  });

  it('CREATURE_DESPAWNING_TICKS === VOLTKIN_CONFIG.despawningTicks', () => {
    expect(CREATURE_DESPAWNING_TICKS).toBe(VOLTKIN_CONFIG.despawningTicks);
  });

  it('CREATURE_FADE_TICKS === VOLTKIN_CONFIG.fadeTicks', () => {
    expect(CREATURE_FADE_TICKS).toBe(VOLTKIN_CONFIG.fadeTicks);
  });

  it('VOLTKIN_ATTACK_RANGE === VOLTKIN_CONFIG.attackRange', () => {
    expect(VOLTKIN_ATTACK_RANGE).toBe(VOLTKIN_CONFIG.attackRange);
  });

  it('VOLTKIN_ATTACK_RANGE_SQ === VOLTKIN_CONFIG.attackRange² (PRIME-AUDIT Δ2 derived inline)', () => {
    expect(VOLTKIN_ATTACK_RANGE_SQ).toBe(
      VOLTKIN_CONFIG.attackRange * VOLTKIN_CONFIG.attackRange,
    );
  });

  it('VOLTKIN_ATTACK_CADENCE_TICKS === VOLTKIN_CONFIG.attackCadenceTicks', () => {
    expect(VOLTKIN_ATTACK_CADENCE_TICKS).toBe(VOLTKIN_CONFIG.attackCadenceTicks);
  });

  it('VOLTKIN_ATTACK_FIRE_TICK === VOLTKIN_CONFIG.attackFireTick', () => {
    expect(VOLTKIN_ATTACK_FIRE_TICK).toBe(VOLTKIN_CONFIG.attackFireTick);
  });
});

// S100 P1 (TD Phase 1a) — CHEWER_CONFIG contract lock (TOWER_DEFENSE_DESIGN.md §2.4).
// The behavioral diffs from Voltkin are the spec; this catches accidental drift.
describe('CHEWER_CONFIG (TD swarm creature)', () => {
  it('discriminator matches chewer type', () => {
    expect(CHEWER_CONFIG.type).toBe('chewer');
  });

  it('S104 P1 — is FINITE (persistent:false + a real lifetime) so the swarm churns and the spawner keeps producing', () => {
    expect(CHEWER_CONFIG.persistent).toBe(false); // was true (sentinel-lifetime, never despawned → spawner stuck at the cap)
    expect(CHEWER_CONFIG.lifetimeTicks).toBe(3000); // 50s @ 60Hz; > seek+travel+5-chew sever (300t) so it completes severs
  });

  it('chews 5 hits, hops at ~0.6× speed, maxAccel = 200 × hopSpeedMul', () => {
    expect(CHEWER_CONFIG.chewHits).toBe(5);
    expect(CHEWER_CONFIG.hopSpeedMul).toBe(0.6);
    expect(CHEWER_CONFIG.maxAccel).toBe(120); // 200 (CREATURE_MAX_ACCEL) × 0.6
  });

  it('ATTACKING spans the full chew (attackCadenceTicks = chewHits × CHEW_INTERVAL_TICKS)', () => {
    // CHEW_INTERVAL_TICKS = 60 (constants.ts); 5 × 60 = 300 so the chewer stays in
    // ATTACKING for the whole chew instead of bouncing to SEEKING after each hit (R9).
    expect(CHEWER_CONFIG.attackCadenceTicks).toBe(300);
    expect(CHEWER_CONFIG.attackFireTick).toBe(300); // sever on the final hit
    expect(CHEWER_CONFIG.attackFireTick).toBeLessThanOrEqual(CHEWER_CONFIG.attackCadenceTicks);
  });

  it('fadeTicks ≤ despawningTicks (blueprint Q8 invariant holds for chewers too)', () => {
    expect(CHEWER_CONFIG.fadeTicks).toBeLessThanOrEqual(CHEWER_CONFIG.despawningTicks);
  });
});

describe('CREATURE_CONFIGS lookup table', () => {
  it('contains an entry per known CreatureType discriminator', () => {
    // S100 P1 — 'chewer' joined 'voltkin'. When the next type ships, this test
    // will fail at the new type's entry — that failure is the intentional
    // reminder to add the new XYZ_CONFIG to the table.
    const keys = Object.keys(CREATURE_CONFIGS).sort();
    expect(keys).toEqual(['chewer', 'lightningDrone', 'voltkin']);
  });

  it('voltkin entry is === VOLTKIN_CONFIG (reference equality, not just deep-equal)', () => {
    expect(CREATURE_CONFIGS.voltkin).toBe(VOLTKIN_CONFIG);
  });

  it('chewer entry is === CHEWER_CONFIG (reference equality)', () => {
    expect(CREATURE_CONFIGS.chewer).toBe(CHEWER_CONFIG);
  });
});

describe('getCreatureConfig accessor', () => {
  it('returns VOLTKIN_CONFIG for type=voltkin', () => {
    const cfg: CreatureConfig = getCreatureConfig('voltkin');
    expect(cfg).toBe(VOLTKIN_CONFIG);
  });

  it('returned config is readonly (compile-time check + runtime spot-check)', () => {
    const cfg = getCreatureConfig('voltkin');
    // Runtime check: the literal returned record should expose the documented
    // fields with their literal values. (TypeScript's `readonly` is erased at
    // runtime; this spot-check is just defense-in-depth on the contract.)
    expect(cfg.lifetimeTicks).toBe(1200);
    expect(cfg.type).toBe('voltkin');
  });
});
