/**
 * SPARK — creature entity type surface (S25 P0 scaffold; S26 P0 adds targetPos +
 * CREATURE_SPAWN_TICKS for Phase 2B physics + locomotion).
 *
 * Per S24 Council-approved Voltkin Phase 2 blueprint (`.claude/plans/voltkin_phase2_blueprint_v1.md`):
 *   - Q1 Verlet body in NEW `world.creatures: Map<CreatureId, Creature>` (NOT bond solver list).
 *   - Q2 Hand-rolled FSM with 4 states. S25 used SPAWNING + DESPAWNING; S26 P0 wires the
 *     SPAWNING → SEEKING transition at `ticksInState >= CREATURE_SPAWN_TICKS`. ATTACKING
 *     remains reserved for S27. Full union landed in S25.
 *   - Q5 Time-only lifecycle: `despawnAtTick = spawnedAtTick + 480` (8s @ 60Hz).
 *   - Q7 SPAWNING animation window: 60 ticks (1s) before SEEKING activates.
 *   - Q8 DESPAWNING state lasts 60 ticks (1s); the last 30 ticks (~500ms) are the alpha fade.
 *
 * S26 P0 — Council R1 + PRIME-AUDIT Δ5: each creature carries a `targetPos: Vec2`
 * computed deterministically by `computeStubTargetPos(spawnedAtTick, ownerPlayerId)`
 * in `src/physics/creatureVerlet.ts` and passed via the SPAWN_CREATURE action payload
 * (Council Q1 unanimous: caller computes). S27 mutates this field per AI target
 * selection (nearest enemy bond / fallback own).
 */

import type { BondId, PlayerId, Vec2 } from '../../types.ts';
import type { CreatureId } from '../../types.ts';
import { VOLTKIN_CONFIG } from './voltkin-config.ts';

export { asCreatureId, type CreatureId } from '../../types.ts';

/**
 * S34 P2-20 — per-type constants moved to `voltkin-config.ts` (Gemini Q2
 * carry-forward from S26+S27+S28, deferred until Anvil prereq). All exports
 * below are now derived from `VOLTKIN_CONFIG.*` to preserve the existing
 * call-site API (8 importing files unchanged). Future creatures consume the
 * same surface via `CREATURE_CONFIGS[type].*` or `getCreatureConfig(type).*`.
 *
 * **Byte-exact preservation:** literal values were 480 / 60 / 60 / 30 / 180 /
 * 60 / 30; VOLTKIN_CONFIG is constructed with those same literals; therefore
 * `VOLTKIN_CONFIG.lifetimeTicks === 480` etc. by construction. The S33 P1-12
 * replay-determinism test (`save.replay.test.ts`) is the empirical guard.
 */

/**
 * Lifetime: total ticks a creature exists in `world.creatures` after SPAWN_CREATURE.
 * 480 @ 60Hz = 8 seconds. Locked by blueprint Q5; sourced from VOLTKIN_CONFIG.
 */
export const VOLTKIN_LIFETIME_TICKS = VOLTKIN_CONFIG.lifetimeTicks;

/**
 * DESPAWNING-state duration: how many ticks before `despawnAtTick` the creature
 * enters DESPAWNING. 60 @ 60Hz = 1 second. Locked by blueprint Q5 + Q8.
 *
 * Note: this constant CURRENTLY equals `VOLTKIN_CONFIG.despawningTicks` because
 * only Voltkin exists. If S35+ Anvil ships with a different despawn duration,
 * callers should switch to `getCreatureConfig(creature.type).despawningTicks`.
 */
export const CREATURE_DESPAWNING_TICKS = VOLTKIN_CONFIG.despawningTicks;

/**
 * SPAWNING-state duration before SEEKING activates. 60 @ 60Hz = 1 second of
 * "materializing" animation window during which the creature is force-free
 * (computeSteeringAccel returns ZERO_ACCEL — Council R1 + PRIME-AUDIT Δ4).
 * Locked by blueprint Q7. S35+ Anvil may need a different SPAWN_TICKS — at
 * that point callers should switch to per-type `getCreatureConfig(...).spawnTicks`.
 */
export const CREATURE_SPAWN_TICKS = VOLTKIN_CONFIG.spawnTicks;

/**
 * Alpha-fade window inside DESPAWNING: the last N ticks of DESPAWNING tween alpha
 * 1.0 → 0.0. 30 @ 60Hz = 500 ms. Locked by blueprint Q8. Must be ≤ CREATURE_DESPAWNING_TICKS.
 */
export const CREATURE_FADE_TICKS = VOLTKIN_CONFIG.fadeTicks;

/**
 * S27 P0 — attack range for SEEKING → ATTACKING transition. When the creature's
 * `targetBondId` resolves to a bond whose midpoint is within this distance of
 * `creature.pos`, the FSM transitions SEEKING → ATTACKING. Locked by blueprint
 * Q9 (180 px ≈ 3× prim radius — "ranged lightning arc", not melee touch). Squared
 * comparisons in the AI module avoid sqrt — see VOLTKIN_ATTACK_RANGE_SQ.
 */
export const VOLTKIN_ATTACK_RANGE = VOLTKIN_CONFIG.attackRange;

/**
 * S27 P0 — pre-squared attack range for distSq comparisons. Avoids sqrt in the
 * hot AI path (called once per CREATURE_TICK during SEEKING per Council R1 Q3
 * UNANIMOUS A — every-tick re-selection, ~80 prims × 60Hz = 4800 checks/s).
 *
 * PRIME-AUDIT Δ2 (S34 P2-20): NOT a field on CreatureConfig — derived here
 * to prevent drift between attackRange and attackRangeSq.
 */
export const VOLTKIN_ATTACK_RANGE_SQ = VOLTKIN_CONFIG.attackRange * VOLTKIN_CONFIG.attackRange;

/**
 * S27 P0 — total duration of the ATTACKING state in ticks. The creature stays
 * in ATTACKING for this many ticks then transitions back to SEEKING (Council
 * R1 Q5 UNANIMOUS creature-only ⇒ ~18 attacks at 1/sec cadence over the 18s
 * active window (S58 #4 — 2.5× lifetime) — `(VOLTKIN_LIFETIME_TICKS - CREATURE_DESPAWNING_TICKS - CREATURE_SPAWN_TICKS) / VOLTKIN_ATTACK_CADENCE_TICKS = (1200-60-60)/60 = 18`
 * full attack cycles). 60 @ 60Hz = 1 second.
 */
export const VOLTKIN_ATTACK_CADENCE_TICKS = VOLTKIN_CONFIG.attackCadenceTicks;

/**
 * S27 P0 — Council R1 Q2 COMPROMISE (Grok-A tick-0 vs Gemini-B tick-30) → middle
 * (tick 30). The CREATURE_ATTACK action dispatches when ATTACKING.ticksInState ===
 * VOLTKIN_ATTACK_FIRE_TICK (in main.ts post-CREATURE_TICK fan-out). Ticks 0-29 are
 * wind-up (S28 will animate); tick 30 fires the zap (severs target bond + emits
 * ARC_FLASH); ticks 31-59 are recovery (S28 will animate); tick 60 transitions
 * back to SEEKING. Exposed as a constant so S28 animation retuning is single-LOC.
 * Δ4 (PRIME-AUDIT): if `targetBondId` is invalid at tick FIRE_TICK, transition
 * straight back to SEEKING instead of going through the recovery half.
 */
export const VOLTKIN_ATTACK_FIRE_TICK = VOLTKIN_CONFIG.attackFireTick;

/**
 * S37 P7 — wind-up tick at which the lion-form `charge` sprite engages AND
 * the procedural Web Audio CHARGE SFX fires (`applyCreatureTick` emits
 * `CREATURE_CHARGE` GameEffect at this tick boundary). Shared by:
 *  - `voltkinFrames.currentFrameKey` — sprite swap chibi→lion
 *  - `voltkinFrames.flashIntensity` — 2-tick transformation flash
 *  - `applyCreatureTick` — CREATURE_CHARGE emit + audioManager drain → SFX
 * Promoted from a render-local constant to voltkin-config so all three
 * call-sites read the same source (Council R1 D1 DRY fix).
 */
export const VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK = VOLTKIN_CONFIG.attackChargeEngageTick;

/**
 * S28 P0 — convert wall-clock cinematic duration (ms) to a tick count for the
 * tick-deterministic pending-spawn schedule (replaces S25's wall-clock setTimeout
 * in cutsceneOverlay.ts:152 — Council Q2 UNANIMOUS A single-slot pending). Uses
 * `Math.round` (PRIME-AUDIT Δ4) for closest-fit at non-multiple-of-60 cinematic
 * durations: 4000→240, 4017→241, 4008→240. PHYSICS_DT is fixed 1/60s so 60 ticks
 * per second. Pure function; trivially unit-testable.
 */
export function cinematicMsToTicks(ms: number): number {
  return Math.round(ms / 1000 * 60);
}

/**
 * S25 v1 creature type. S29+ will add `'anvil'` and `'pacPredator'`. The type discriminates
 * spritesheet, FSM transition table, attack range, etc. (see blueprint § "Creature type config").
 */
export type CreatureType = 'voltkin';

/**
 * Full 4-state FSM per blueprint Q2. S25 only USES SPAWNING + DESPAWNING; SEEKING + ATTACKING
 * are reserved-but-unused (TypeScript erases unused members; full union from start saves S26
 * type churn — Council R1 unanimous).
 */
export type CreatureState = 'SPAWNING' | 'SEEKING' | 'ATTACKING' | 'DESPAWNING';

/**
 * Authoritative creature record. `pos / prevPos` shape mirrors Verlet bodies for free
 * implicit-velocity in `creatureVerlet.ts` substep integration. `state + ticksInState`
 * drives FSM transitions and renderer animation-frame selection (S28). `targetPos` is
 * the destination point in canvas space the creature steers toward during SEEKING
 * (S26 stub via `computeStubTargetPos`; S27 will overwrite with AI-selected enemy bond
 * midpoints per blueprint Q9). `targetBondId` for the per-attack target is reserved
 * for S27 (additive field, default null when introduced).
 */
export interface Creature {
  readonly id: CreatureId;
  readonly type: CreatureType;
  readonly ownerPlayerId: PlayerId;
  pos: Vec2;
  prevPos: Vec2;
  /** S26 P0 — destination point in canvas space for SEEKING-state steering. Mutable
   *  so S27 AI target selection rewrites per tick from nearest-bond midpoint
   *  (Council R1 Q3 UNANIMOUS A — every-tick re-selection during SEEKING). */
  targetPos: Vec2;
  /**
   * S27 P0 — bond targeted by the AI for the next ATTACKING cycle. Mutable; set
   * by `findNearestBondTarget` in `src/state/creatures/creatureAI.ts` during
   * SEEKING fan-out (main.ts post-CREATURE_TICK loop). `null` when no targetable
   * bond exists OR creature is in SPAWNING/DESPAWNING (no AI). Cleared on
   * SEEKING ↔ ATTACKING transitions so the next state-entry re-selects fresh.
   * NOT serialized in S27 — host-authoritative until S28 NetSnapshot v2.
   * NetSnapshot v2 (S28) MAY include `targetBondId` so client renderer can draw
   * a "lock-on" indicator; for S27 client.world.creatures stays empty so the
   * field is host-only.
   */
  targetBondId: BondId | null;
  state: CreatureState;
  /** Ticks elapsed since entering current `state`. Resets on transition. */
  ticksInState: number;
  /**
   * S36 P3 — count of bonds this creature has successfully severed during
   * its lifetime. Increments in `applyCreatureAttack` AFTER the
   * `!world.bonds.has(action.bondId)` post-dispatch confirmation (true
   * success path; defense-in-depth guards against a hypothetical future
   * canSeverBond policy that rejects 'creature' severance). Drives the
   * DESPAWNING victory/hurt frame branch in `voltkinFrames.currentFrameKey`:
   * killCount > 0 → victory (chibi, triumphant); killCount === 0 → hurt
   * (chibi, dazed — creature never connected). Tick-deterministic
   * increment (dispatched from CREATURE_ATTACK in main.ts fan-out) so
   * `save.replay.test.ts` byte-equivalence stays green. Mutable. Serialized
   * additively in `save.ts` (pre-S36 saves rehydrate as 0).
   */
  killCount: number;
  /** Tick at which SPAWN_CREATURE was applied. Determines despawnAtTick. */
  readonly spawnedAtTick: number;
  /** Tick at which the creature is auto-removed from `world.creatures`. */
  readonly despawnAtTick: number;
}

/**
 * Factory for a freshly-spawned Voltkin creature in SPAWNING state. `prevPos` snaps to
 * `pos` so the first Verlet substep sees zero initial implicit velocity. `despawnAtTick`
 * is fixed at construction — the lifecycle is deterministic from this point. `targetPos`
 * is supplied by the caller (Council Q1: `onCinematicHandoff` computes via
 * `computeStubTargetPos` and passes via SPAWN_CREATURE payload).
 */
export function makeVoltkinCreature(args: {
  id: CreatureId;
  ownerPlayerId: PlayerId;
  pos: Vec2;
  targetPos: Vec2;
  spawnedAtTick: number;
}): Creature {
  return {
    id: args.id,
    type: 'voltkin',
    ownerPlayerId: args.ownerPlayerId,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x, y: args.pos.y },
    targetPos: { x: args.targetPos.x, y: args.targetPos.y },
    targetBondId: null,
    state: 'SPAWNING',
    ticksInState: 0,
    killCount: 0,
    spawnedAtTick: args.spawnedAtTick,
    despawnAtTick: args.spawnedAtTick + VOLTKIN_LIFETIME_TICKS,
  };
}
