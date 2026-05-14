/**
 * SPARK — creature lifecycle reducers (S25 P0 scaffold; S26 P0 wires SPAWNING →
 * SEEKING transition + threads targetPos through SPAWN_CREATURE payload).
 *
 * Mirrors the `sparkLifecycle.ts` shape (S20 P1): pure case-body helpers consumed
 * by `world.ts` dispatch. Three actions:
 *   - SPAWN_CREATURE  — append a Voltkin creature to `world.creatures` at the
 *                       cinematic handoff moment (T+cinematicMs in cutsceneOverlay).
 *                       Enforces blueprint Q10 max-1-per-player invariant (silent no-op).
 *                       S26 P0 — action carries `targetPos: Vec2` computed by the
 *                       caller (`onCinematicHandoff` → `computeStubTargetPos`)
 *                       per Council Q1 unanimous (host-pure reducer; deterministic
 *                       payload; client mirror eventually receives via NetSnapshot v2
 *                       in S28).
 *   - DESPAWN_CREATURE — remove a creature by id. Idempotent for missing ids
 *                       (matches `applyDespawnSpark` semantic).
 *   - CREATURE_TICK   — advance the creature one frame: increment `ticksInState`,
 *                       transition SPAWNING → SEEKING at `ticksInState >= CREATURE_SPAWN_TICKS`
 *                       (S26 P0, blueprint Q7), transition SPAWNING/SEEKING →
 *                       DESPAWNING at `despawnAtTick - 60`, AUTO-DELETE at
 *                       `despawnAtTick` (blueprint Q5 lifecycle).
 *
 * Auto-delete-in-tick: Council R1 majority resolution from S25 (cohesion).
 * Defense-in-depth `has()` guards in all 3 reducers — main.ts CREATURE_TICK fan-out
 * iterates an Array.from snapshot of `world.creatures.keys()`, but any in-tick
 * auto-delete could stale subsequent ids in the same fan-out. Each reducer returns
 * early if the id is no longer in the map.
 */

import type { World } from '../world.ts';
import type { PlayerId, Vec2 } from '../../types.ts';
import {
  asCreatureId,
  CREATURE_DESPAWNING_TICKS,
  CREATURE_SPAWN_TICKS,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
  makeVoltkinCreature,
  type CreatureId,
  type CreatureType,
} from './creature.ts';
import { isWithinAttackRange } from './creatureAI.ts';

/** Action shapes — exported so `world.ts` can compose `GameAction`. */
export interface SpawnCreatureAction {
  readonly type: 'SPAWN_CREATURE';
  readonly creatureType: CreatureType;
  readonly ownerPlayerId: PlayerId;
  readonly pos: Vec2;
  /** S26 P0 — destination for SEEKING-state steering. Caller-computed
   *  (host-only, deterministic) per Council Q1 unanimous + Δ5. */
  readonly targetPos: Vec2;
}

export interface DespawnCreatureAction {
  readonly type: 'DESPAWN_CREATURE';
  readonly creatureId: CreatureId;
}

export interface CreatureTickAction {
  readonly type: 'CREATURE_TICK';
  readonly creatureId: CreatureId;
}

/**
 * Spawn a creature at `action.pos` owned by `action.ownerPlayerId`. Enforces
 * blueprint Q10 max-1-per-player invariant: if the owner already has a live
 * creature, the spawn is a silent no-op (defense-in-depth — main.ts wall-clock
 * setTimeout could fire twice on a cinematic-skip-then-replay edge case;
 * blueprint also explicitly permits this guard).
 */
export function applySpawnCreature(world: World, action: SpawnCreatureAction): World {
  // Max-1-per-player invariant (blueprint Q10).
  for (const c of world.creatures.values()) {
    if (c.ownerPlayerId === action.ownerPlayerId) return world;
  }
  const id = asCreatureId(world.nextCreatureId++);
  const creature = makeVoltkinCreature({
    id,
    ownerPlayerId: action.ownerPlayerId,
    pos: action.pos,
    targetPos: action.targetPos,
    spawnedAtTick: world.tick,
  });
  world.creatures.set(id, creature);
  return world;
}

/**
 * Remove a creature by id. No-op if the id is not in the map (idempotent —
 * matches `applyDespawnSpark` semantic for missing entities).
 */
export function applyDespawnCreature(world: World, action: DespawnCreatureAction): World {
  if (!world.creatures.has(action.creatureId)) return world;
  world.creatures.delete(action.creatureId);
  return world;
}

/**
 * Advance one frame for the given creature. Order of operations matters — checks
 * are evaluated top-down so the most-terminal state wins on a tick that satisfies
 * multiple boundaries:
 *
 *   1. Auto-delete at `despawnAtTick` (Council R1 S25 cohesion majority).
 *   2. ANY-state → DESPAWNING at `despawnAtTick - 60` (blueprint Q5/Q8). S27 P0
 *      extends this to include ATTACKING so a long wind-up doesn't escape the
 *      despawn boundary. The last-second mark is invariant.
 *   3. Advance `ticksInState`.
 *   4. SPAWNING → SEEKING at `ticksInState >= CREATURE_SPAWN_TICKS` (S26 P0,
 *      blueprint Q7). Increment-first ordering means "60th tick triggers".
 *   5. S27 P0: SEEKING → ATTACKING when `targetBondId` is set AND the bond is
 *      within attack range. `targetBondId` is refreshed by main.ts post-tick
 *      fan-out (Council R1 Q3 UNANIMOUS A) BEFORE the next CREATURE_TICK so
 *      this transition sees fresh AI input.
 *   6. S27 P0: ATTACKING → SEEKING via two conditions (Δ4 + blueprint Q9):
 *        a. Cadence elapsed (ticksInState >= VOLTKIN_ATTACK_CADENCE_TICKS): full
 *           60-tick attack cycle complete, drop back to SEEKING + clear target
 *           so next tick re-selects fresh.
 *        b. Target invalidated DURING wind-up (Δ4): bond severed by another
 *           actor between target selection and FIRE_TICK. Aborts the wind-up
 *           early so the creature stays responsive. Only fires if
 *           ticksInState < VOLTKIN_ATTACK_FIRE_TICK — after FIRE_TICK we honor
 *           the recovery half regardless (blueprint Q9 1/sec rhythm preservation;
 *           bond will naturally be gone post-attack and re-seek next tick).
 *
 * Defense-in-depth: returns early if the id is no longer in the map (main.ts
 * fan-out snapshot may include stale ids after a prior tick auto-deleted).
 */
export function applyCreatureTick(world: World, action: CreatureTickAction): World {
  const creature = world.creatures.get(action.creatureId);
  if (creature === undefined) return world;

  // 1. Auto-delete at end-of-life.
  if (world.tick >= creature.despawnAtTick) {
    world.creatures.delete(action.creatureId);
    return world;
  }

  // 2. ANY-non-DESPAWNING → DESPAWNING at the last-second mark (blueprint Q5/Q8).
  //    S27 P0: extended to include ATTACKING so a creature in the middle of an
  //    attack cycle still routes through the despawn animation rather than
  //    fighting past its own end-of-life. Uses world.tick (not ticksInState).
  if (
    creature.state !== 'DESPAWNING' &&
    world.tick >= creature.despawnAtTick - CREATURE_DESPAWNING_TICKS
  ) {
    creature.state = 'DESPAWNING';
    creature.ticksInState = 0;
    creature.targetBondId = null;
    return world;
  }

  // 3. Advance the in-state counter THEN check FSM transitions.
  creature.ticksInState++;

  // 4. SPAWNING → SEEKING at the spawn window boundary (S26 P0, blueprint Q7).
  //    Cleanup: targetBondId stays null on entry to SEEKING; main.ts will populate
  //    it on the NEXT tick's pre-CREATURE_TICK re-selection step.
  if (creature.state === 'SPAWNING' && creature.ticksInState >= CREATURE_SPAWN_TICKS) {
    creature.state = 'SEEKING';
    creature.ticksInState = 0;
    return world;
  }

  // 5. S27 P0: SEEKING → ATTACKING when target is set and in range.
  //    targetBondId is set by main.ts BEFORE this CREATURE_TICK call (every-tick
  //    re-selection per Council R1 Q3 UNANIMOUS A). isWithinAttackRange does a
  //    squared-distance compare against VOLTKIN_ATTACK_RANGE_SQ; returns false
  //    if the bond is missing (defense-in-depth race-condition guard).
  if (
    creature.state === 'SEEKING' &&
    creature.targetBondId !== null &&
    isWithinAttackRange(world, creature, creature.targetBondId)
  ) {
    creature.state = 'ATTACKING';
    creature.ticksInState = 0;
    return world;
  }

  // 6. S27 P0: ATTACKING → SEEKING. Two exit conditions:
  //    (a) cadence elapsed: full 60-tick attack cycle complete (blueprint Q9
  //        1 attack per second rhythm — preserves the "ranged lightning canon"
  //        feel even if the bond gets severed post-zap).
  //    (b) Δ4 wind-up abort: bond invalidated AT OR BEFORE FIRE_TICK (ticks 0-30) →
  //        no point continuing the wind-up animation toward a missing target.
  //        Keeps the creature responsive; new target selected next physics tick.
  //        CHECK Triumvirate Gemini G3 ACCEPTED: `<= FIRE_TICK` (not `<`) closes
  //        the boundary edge case where ticksInState increments to 30 the same
  //        tick the bond vanishes — without `<=` the FIRE_TICK fire dispatch
  //        would no-op in applyCreatureAttack (benign but visually missing the
  //        ARC_FLASH on a doomed attack); with `<=` we abort cleanly into SEEKING
  //        and pick a fresh target next tick.
  if (creature.state === 'ATTACKING') {
    const cadenceElapsed = creature.ticksInState >= VOLTKIN_ATTACK_CADENCE_TICKS;
    const targetGoneEarly =
      creature.ticksInState <= VOLTKIN_ATTACK_FIRE_TICK &&
      (creature.targetBondId === null || !world.bonds.has(creature.targetBondId));
    if (cadenceElapsed || targetGoneEarly) {
      creature.state = 'SEEKING';
      creature.ticksInState = 0;
      creature.targetBondId = null;
    }
  }

  return world;
}
