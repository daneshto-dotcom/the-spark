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

import type { PlayerId, Vec2 } from '../../types.ts';
import type { CreatureId } from '../../types.ts';

export { asCreatureId, type CreatureId } from '../../types.ts';

/**
 * Lifetime: total ticks a creature exists in `world.creatures` after SPAWN_CREATURE.
 * 480 @ 60Hz = 8 seconds. Locked by blueprint Q5.
 */
export const VOLTKIN_LIFETIME_TICKS = 480;

/**
 * DESPAWNING-state duration: how many ticks before `despawnAtTick` the creature
 * enters DESPAWNING. 60 @ 60Hz = 1 second. Locked by blueprint Q5 + Q8.
 */
export const CREATURE_DESPAWNING_TICKS = 60;

/**
 * SPAWNING-state duration before SEEKING activates. 60 @ 60Hz = 1 second of
 * "materializing" animation window during which the creature is force-free
 * (computeSteeringAccel returns ZERO_ACCEL — Council R1 + PRIME-AUDIT Δ4).
 * Locked by blueprint Q7. S29+ Anvil / PacPredator may need a per-type config
 * table (Gemini Q2 carry-forward); deferred since only Voltkin exists in S26.
 */
export const CREATURE_SPAWN_TICKS = 60;

/**
 * Alpha-fade window inside DESPAWNING: the last N ticks of DESPAWNING tween alpha
 * 1.0 → 0.0. 30 @ 60Hz = 500 ms. Locked by blueprint Q8. Must be ≤ CREATURE_DESPAWNING_TICKS.
 */
export const CREATURE_FADE_TICKS = 30;

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
   *  so S27 AI target selection can rewrite per tick when nearest-enemy-bond shifts. */
  targetPos: Vec2;
  state: CreatureState;
  /** Ticks elapsed since entering current `state`. Resets on transition. */
  ticksInState: number;
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
    state: 'SPAWNING',
    ticksInState: 0,
    spawnedAtTick: args.spawnedAtTick,
    despawnAtTick: args.spawnedAtTick + VOLTKIN_LIFETIME_TICKS,
  };
}
