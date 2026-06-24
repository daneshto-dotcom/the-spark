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
  /* S58 (#4): Voltkin = 1200 (20 s @ 60 Hz) — 2.5× the original 480/8 s. */
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
  /**
   * S37 P7 — wind-up tick at which the lion-form `charge` sprite engages and
   * the procedural Web Audio CHARGE SFX fires (250 ms rising tone climaxing
   * at attackFireTick). Promoted from voltkinFrames.ATTACKING_CHARGE_ENGAGE_TICK
   * so both the render-layer sprite schedule and the state-layer
   * applyCreatureTick emit site share a single source of truth (DRY —
   * Council R1 D1 + PRIME-AUDIT Δ3 fallback documented). Voltkin = 15
   * (halfway through the 30-tick wind-up).
   */
  readonly attackChargeEngageTick: number;
  /**
   * S100 P1 (TD Phase 1a) — when `false` the creature is lifetime-bound
   * (`despawnAtTick = spawnedAtTick + lifetimeTicks` auto-deletes it, and the
   * end-of-life forced-DESPAWNING step runs) — the original Voltkin behavior,
   * preserved byte-for-byte. When `true` (chewer) the FSM auto-delete + forced-
   * DESPAWNING steps are skipped (wrapped in `if (!config.persistent)`), so the
   * creature persists until an external removal (spawner teardown / potato
   * blast). Voltkin = `false`. See TOWER_DEFENSE_DESIGN.md §2.4 (R4).
   */
  readonly persistent: boolean;
  /**
   * S100 P1 (TD Phase 1a) — number of incremental chew hits a chewer lands on a
   * single committed bond before that bond severs. The chewer stays in ATTACKING
   * for the full `chewHits × CHEW_INTERVAL_TICKS`, incrementing `Creature.chewProgress`
   * once per `CHEW_INTERVAL_TICKS` and dispatching the actual `CREATURE_ATTACK`
   * (→ `SEVER_BOND`) only on the final hit. `0` for non-chewing creatures
   * (Voltkin uses its single-fire `attackFireTick` zap, not the chew loop).
   * Chewer = `CHEW_HITS` (5). See TOWER_DEFENSE_DESIGN.md §2.4 (R9).
   */
  readonly chewHits: number;
  /**
   * S100 P1 (TD Phase 1a) — multiplier on `CREATURE_MAX_ACCEL` (= this config's
   * `maxAccel`) for locomotion speed. Voltkin = `1` (unchanged top speed ~208
   * px/s). Chewer = `~0.6` (slower, readable, counterable hop). Threaded into
   * `creatureVerlet.computeSteeringAccel` by a later layer (today that module
   * reads the module-const `CREATURE_MAX_ACCEL` directly). See §3.4 (R16).
   */
  readonly hopSpeedMul: number;
  /**
   * S100 P1 (TD Phase 1a) — per-substep peak steering acceleration (px/s²),
   * de-hardcoded from the `CREATURE_MAX_ACCEL` module constant in
   * `src/physics/creatureVerlet.ts` (current value 200). Voltkin = `200`
   * (unchanged — byte-identical Voltkin locomotion is the guard). Chewer is
   * scaled by `hopSpeedMul`. A later layer threads this per-config value
   * through `computeSteeringAccel` to replace the bare module constant. See §3.4 (R16).
   */
  readonly maxAccel: number;
}

/**
 * Voltkin — lightning godly (S22 P3 originator, S25–S28 implementation chain).
 * S58 (#4): 20s lifetime (was 8s — 2.5× for a longer, more powerful/epic
 * summon per user playtest call), 180px ranged arc, 60-tick attack cycle
 * firing at mid-tick → ~18 full attack cycles over the active window.
 */
export const VOLTKIN_CONFIG: CreatureConfig = {
  type: 'voltkin',
  lifetimeTicks: 1200,
  spawnTicks: 60,
  despawningTicks: 60,
  fadeTicks: 30,
  attackRange: 180,
  attackCadenceTicks: 60,
  attackFireTick: 30,
  attackChargeEngageTick: 15,
  // S100 P1 (TD Phase 1a) — Voltkin keeps its original behavior byte-for-byte:
  // lifetime-bound (persistent:false), single-fire zap (chewHits:0, NOT the chew
  // loop), full top speed (hopSpeedMul:1), and the literal CREATURE_MAX_ACCEL=200
  // de-hardcoded from creatureVerlet.ts unchanged. These are the byte-identical
  // Voltkin regression guards (save.replay.test.ts / creatureLifecycle.test.ts).
  persistent: false,
  chewHits: 0,
  hopSpeedMul: 1,
  maxAccel: 200,
};

/**
 * Chewer — tower-defense swarm creature (S100 P1, TD Phase 1a). A persistent,
 * slow-hopping, pencil-drawn creature emitted every `SPAWN_INTERVAL_TICKS` by a
 * live spawner-structure. Generalizes the Voltkin substrate (same FSM / Verlet /
 * SEVER_BOND choke point) with three behavioral diffs encoded here:
 *
 *   - `persistent: true` — no lifetime auto-delete; lives until the spawner is
 *     destroyed (re-validation teardown) or a potato blast despawns it. The
 *     FSM gates its end-of-life steps behind `if (!config.persistent)`, so the
 *     Voltkin (`persistent:false`) path stays textually unchanged (R4).
 *   - `chewHits: 5` (= constants.ts `CHEW_HITS`) — instead of Voltkin's single
 *     mid-cycle zap, a chewer commits to ONE bond and lands 5 incremental chews
 *     (one per `CHEW_INTERVAL_TICKS` = 60), severing only on the final hit (R9).
 *     `attackCadenceTicks` therefore spans the whole chew (5 × 60 = 300) and
 *     `attackFireTick` is the final hit (300) so the FSM stays in ATTACKING for
 *     the full chew rather than bouncing to SEEKING after each hit.
 *   - `hopSpeedMul: 0.6` / `maxAccel: 120` — ~60% of Voltkin's top speed:
 *     a readable, counterable hop. `maxAccel = 200 × 0.6` (the de-hardcoded
 *     CREATURE_MAX_ACCEL scaled by hopSpeedMul).
 *
 * `lifetimeTicks` is a large sentinel (defense-in-depth only — the `persistent`
 * gate is the sole despawn mechanism; the chewer never reaches this tick in
 * normal play). `attackRange` is a touch shorter than Voltkin's 180 (chewers
 * engage at melee-ish chew range, not a ranged arc).
 *
 * NOTE for downstream layers: the FSM chew loop, the split caps, the enemy-only
 * targeting, the spawner poll, and threading `hopSpeedMul`/`maxAccel` through
 * `computeSteeringAccel` all live in later layers. This entry only declares the
 * config; adding it here forces the CREATURE_CONFIGS exhaustiveness below.
 */
export const CHEWER_CONFIG: CreatureConfig = {
  type: 'chewer',
  lifetimeTicks: 1_000_000_000, // sentinel — persistent:true is the real despawn gate
  spawnTicks: 30, // 0.5 s materialize (faster than Voltkin's 1 s — it's a swarm unit)
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: 120, // shorter than Voltkin's 180 — melee-ish chew engage range
  attackCadenceTicks: 300, // chewHits × CHEW_INTERVAL_TICKS (5 × 60) — full chew span
  attackFireTick: 300, // sever on the final (5th) chew hit
  attackChargeEngageTick: 60, // first chew bite lands one CHEW_INTERVAL_TICKS in
  persistent: true,
  chewHits: 5, // = constants.ts CHEW_HITS
  hopSpeedMul: 0.6,
  maxAccel: 120, // 200 (CREATURE_MAX_ACCEL) × hopSpeedMul 0.6
};

/**
 * Canonical lookup table. ONE entry per CreatureType discriminant value.
 * `Readonly<Record<...>>` enforces compile-time exhaustiveness for new
 * creature types.
 */
export const CREATURE_CONFIGS: Readonly<Record<CreatureType, CreatureConfig>> = {
  voltkin: VOLTKIN_CONFIG,
  chewer: CHEWER_CONFIG,
};

/**
 * Type-safe accessor — equivalent to `CREATURE_CONFIGS[type]` but the
 * function form is the public API surface so future indirection (cached
 * derived values, debug overlay, etc.) doesn't require a call-site sweep.
 */
export function getCreatureConfig(type: CreatureType): CreatureConfig {
  return CREATURE_CONFIGS[type];
}
