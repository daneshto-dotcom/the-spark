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
  makeVoltkinCreature,
  type CreatureId,
  type CreatureType,
} from './creature.ts';

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
 *   1. Auto-delete at `despawnAtTick` (Council R1 cohesion majority).
 *   2. SPAWNING/SEEKING → DESPAWNING at `despawnAtTick - 60` (blueprint Q5/Q8).
 *   3. SPAWNING → SEEKING at `ticksInState >= CREATURE_SPAWN_TICKS` (S26 P0,
 *      blueprint Q7). Tested via ticksInState rather than world.tick so the
 *      transition is invariant under host snapshot-apply (Δ4 cross-effect).
 *   4. Otherwise increment `ticksInState`.
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

  // 2. SPAWNING/SEEKING → DESPAWNING at the last-second mark (blueprint Q5/Q8).
  //    Uses world.tick (not ticksInState) so a SPAWN_CREATURE fired near end-of-
  //    life still routes directly through the despawn animation rather than
  //    skipping it via SEEKING (degenerate edge: spawn inside the last 60 ticks).
  if (
    (creature.state === 'SPAWNING' || creature.state === 'SEEKING') &&
    world.tick >= creature.despawnAtTick - CREATURE_DESPAWNING_TICKS
  ) {
    creature.state = 'DESPAWNING';
    creature.ticksInState = 0;
    return world;
  }

  // 3. Advance the in-state counter THEN check the SPAWNING → SEEKING transition
  //    (S26 P0, blueprint Q7). Increment-first ordering means "60th tick triggers"
  //    is the user-observable semantic (more intuitive than the alternative
  //    check-first ordering which transitions on the 61st call). Δ4: steering
  //    activates the SAME tick the state flips; SPAWNING was force-free so the
  //    first SEEKING substep starts from zero implicit velocity — clean kick-off.
  creature.ticksInState++;
  if (creature.state === 'SPAWNING' && creature.ticksInState >= CREATURE_SPAWN_TICKS) {
    creature.state = 'SEEKING';
    creature.ticksInState = 0;
  }
  return world;
}
