/**
 * SPARK — creature entity type surface (S25 P0, Voltkin Phase 2A scaffold).
 *
 * Per S24 Council-approved Voltkin Phase 2 blueprint (`.claude/plans/voltkin_phase2_blueprint_v1.md`):
 *   - Q1 Verlet body in NEW `world.creatures: Map<CreatureId, Creature>` (NOT bond solver list).
 *   - Q2 Hand-rolled FSM with 4 states. S25 only uses SPAWNING + DESPAWNING; SEEKING/ATTACKING
 *     are reserved (typed-but-unused) for S26 + S27. Full union landed in S25 per S25 Council
 *     R1 (Grok + Gemini majority) to avoid S26 type churn — TypeScript erases unused members.
 *   - Q5 Time-only lifecycle: `despawnAtTick = spawnedAtTick + 480` (8s @ 60Hz).
 *   - Q8 DESPAWNING state lasts 60 ticks (1s); the last 30 ticks (~500ms) are the alpha fade.
 *
 * The `prevPos` field is reserved for S26 Verlet integration. In S25 it shadows `pos` —
 * implicit velocity is zero, the creature does not move. S26 will start mutating prevPos
 * in `creatureVerlet.ts` substep integration.
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
 * implicit-velocity once S26 wires physics. `state + ticksInState` drives FSM transitions
 * (S26+) and renderer animation-frame selection (S28). `targetBondId` is reserved for S27
 * attack target tracking but is intentionally absent from this interface in S25 (no AI,
 * no attack); will be added additively in S27 with a default value.
 */
export interface Creature {
  readonly id: CreatureId;
  readonly type: CreatureType;
  readonly ownerPlayerId: PlayerId;
  pos: Vec2;
  prevPos: Vec2;
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
 * `pos` so S26 Verlet integration sees zero initial implicit velocity. `despawnAtTick`
 * is fixed at construction — the lifecycle is deterministic from this point.
 */
export function makeVoltkinCreature(args: {
  id: CreatureId;
  ownerPlayerId: PlayerId;
  pos: Vec2;
  spawnedAtTick: number;
}): Creature {
  return {
    id: args.id,
    type: 'voltkin',
    ownerPlayerId: args.ownerPlayerId,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x, y: args.pos.y },
    state: 'SPAWNING',
    ticksInState: 0,
    spawnedAtTick: args.spawnedAtTick,
    despawnAtTick: args.spawnedAtTick + VOLTKIN_LIFETIME_TICKS,
  };
}
