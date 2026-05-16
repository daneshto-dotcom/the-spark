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

  // Byte-exact regression lock: these literals are the same values that lived
  // as top-level constants in creature.ts pre-S34. If anyone tweaks the config,
  // it should be a deliberate gameplay change with PDR + replay-determinism
  // re-run, not an accidental drift.
  it('locks the 7 Voltkin tuning constants by literal value', () => {
    expect(VOLTKIN_CONFIG.lifetimeTicks).toBe(480);
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

describe('CREATURE_CONFIGS lookup table', () => {
  it('contains an entry per known CreatureType discriminator', () => {
    // Currently only 'voltkin'. When Anvil ships, this test will fail at
    // the new type's entry — that failure is the intentional reminder to
    // add the new XYZ_CONFIG to the table.
    const keys = Object.keys(CREATURE_CONFIGS).sort();
    expect(keys).toEqual(['voltkin']);
  });

  it('voltkin entry is === VOLTKIN_CONFIG (reference equality, not just deep-equal)', () => {
    expect(CREATURE_CONFIGS.voltkin).toBe(VOLTKIN_CONFIG);
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
    expect(cfg.lifetimeTicks).toBe(480);
    expect(cfg.type).toBe('voltkin');
  });
});
