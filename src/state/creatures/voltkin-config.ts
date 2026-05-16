/**
 * SPARK — Per-creature-type config table (S34 P2-20).
 *
 * **Audit lineage:** Gemini Council Q2 carry-forward across S26+S27+S28
 * (deferred while only Voltkin existed); S30 audit P2-20; S34 P2 batch shipped.
 *
 * **Purpose:** consolidate the 7 hardcoded per-creature constants that
 * previously lived as top-level exports in `creature.ts` into a single
 * canonical config record. Prerequisite for Anvil (S35+) — adding a second
 * creature type becomes `+1 CreatureConfig` entry + `+1 attack handler
 * dispatch` instead of `+N file edits per constant`.
 *
 * **Back-compat:** `creature.ts` continues to export the original constant
 * names (`VOLTKIN_LIFETIME_TICKS`, `VOLTKIN_ATTACK_RANGE_SQ`, etc.), with
 * the literal values now derived from `VOLTKIN_CONFIG` here. No call-site
 * needed updating — 8 importing files (5 prod + 3 test) compile unchanged.
 *
 * **PRIME-AUDIT Δ2 (S34 Council R1):** `attackRangeSq` is **NOT** a config
 * field. The pre-squared value is a sqrt-avoidance derivative; exposing it
 * in CreatureConfig would invite drift between the two. Consumers compute
 * `attackRange * attackRange` inline (or via the existing
 * `VOLTKIN_ATTACK_RANGE_SQ` back-compat re-export in creature.ts).
 *
 * **What's NOT in CreatureConfig (deliberate):**
 *   - Visual effect constants (`ARC_HALO_WIDTH`, `ARC_JITTER_AMP_PX`,
 *     `ARC_FLASH_DURATION_TICKS`) — describe the EFFECT, not the creature.
 *     Anvil might also use ARC_FLASH (cleave-style sparks). Stays in
 *     `src/render/effects/arcFlash.ts` + `lifetime.ts`.
 *   - Screen-shake constants — describe the shake effect, not the creature.
 *     Stays in `src/render/screenShake.ts`.
 *   - Cinematic-timing constants (`cinematicMs`, `FADE_MS`,
 *     `sustainedEffectMs`) — describe the cutscene overlay, not the creature
 *     spec. Stays in `src/render/cutsceneOverlay.ts`.
 *
 * **Empirical guard for byte-exact preservation:**
 * `src/state/save.replay.test.ts` (S33 P1-12 replay-determinism baseline)
 * runs two identically-seeded worlds through identical dispatch sequences
 * and asserts `JSON.stringify(snapshot(w1)) === JSON.stringify(snapshot(w2))`.
 * If this refactor changed any computed value, that test fails. Must stay
 * green post-refactor.
 */

import type { CreatureType } from './creature.ts';

/**
 * Per-creature-type config record. One entry per `CreatureType` discriminant
 * value. All fields are numeric tick counts or distances.
 *
 * Adding a new creature type:
 *  1. Add the new discriminant value to `CreatureType` union in `creature.ts`.
 *  2. Add a new `XYZ_CONFIG` constant below following the `VOLTKIN_CONFIG` shape.
 *  3. Add the new entry to `CREATURE_CONFIGS` Record.
 *  4. Add a new attack-handler branch in `creatureAttack.ts` (or a `kind` field
 *     here if attack handlers diverge enough to need per-type dispatch).
 *  5. Verify `save.replay.test.ts` stays green.
 */
export interface CreatureConfig {
  /** Discriminator — matches the `Creature.type` field. */
  readonly type: CreatureType;
  /**
   * Total lifetime in ticks. `despawnAtTick = spawnedAtTick + lifetimeTicks`.
   * Blueprint Q5; Voltkin = 480 (8 s @ 60 Hz).
   */
  readonly lifetimeTicks: number;
  /**
   * Duration in ticks of the SPAWNING state before SEEKING activates.
   * During SPAWNING the creature is force-free (`computeSteeringAccel`
   * returns `ZERO_ACCEL`). Blueprint Q7; Voltkin = 60 (1 s).
   */
  readonly spawnTicks: number;
  /**
   * Duration in ticks of the DESPAWNING state at end-of-life. Blueprint
   * Q5 + Q8; Voltkin = 60 (1 s).
   */
  readonly despawningTicks: number;
  /**
   * Tail window inside `despawningTicks` during which sprite alpha tweens
   * 1.0 → 0.0. MUST be ≤ `despawningTicks`. Blueprint Q8; Voltkin = 30 (~500 ms).
   */
  readonly fadeTicks: number;
  /**
   * Max distance (px) from creature pos to target-bond midpoint for
   * SEEKING → ATTACKING transition. Blueprint Q9; Voltkin = 180
   * (~3× prim radius — ranged lightning arc).
   *
   * Squared comparisons (`distSq <= attackRange * attackRange`) are
   * preferred in hot paths; do NOT add `attackRangeSq` here (PRIME-AUDIT Δ2).
   */
  readonly attackRange: number;
  /**
   * Total tick-cycle duration of one attack (wind-up + fire + recovery).
   * Voltkin = 60 (1 s); ~6 full attack cycles per 8s active window.
   */
  readonly attackCadenceTicks: number;
  /**
   * Mid-cycle tick at which the ATTACK action dispatches (sever bond +
   * ARC_FLASH emit). Council R1 Q2 COMPROMISE between tick-0 wind-up and
   * tick-end recovery; Voltkin = 30 (middle of cadence).
   */
  readonly attackFireTick: number;
}

/**
 * Voltkin — lightning godly (S22 P3 originator, S25–S28 implementation chain).
 * 8s lifetime, 180px ranged arc, 60-tick attack cycle firing at mid-tick.
 */
export const VOLTKIN_CONFIG: CreatureConfig = {
  type: 'voltkin',
  lifetimeTicks: 480,
  spawnTicks: 60,
  despawningTicks: 60,
  fadeTicks: 30,
  attackRange: 180,
  attackCadenceTicks: 60,
  attackFireTick: 30,
};

/**
 * Canonical lookup table. ONE entry per CreatureType discriminant value.
 * `Readonly<Record<...>>` enforces compile-time exhaustiveness for new
 * creature types.
 */
export const CREATURE_CONFIGS: Readonly<Record<CreatureType, CreatureConfig>> = {
  voltkin: VOLTKIN_CONFIG,
};

/**
 * Type-safe accessor — equivalent to `CREATURE_CONFIGS[type]` but the
 * function form is the public API surface so future indirection (cached
 * derived values, debug overlay, etc.) doesn't require a call-site sweep.
 */
export function getCreatureConfig(type: CreatureType): CreatureConfig {
  return CREATURE_CONFIGS[type];
}
