/**
 * SPARK — creature lifecycle reducers (S25 P0, Voltkin Phase 2A scaffold).
 *
 * Mirrors the `sparkLifecycle.ts` shape (S20 P1): pure case-body helpers consumed
 * by `world.ts` dispatch. Three actions:
 *   - SPAWN_CREATURE  — append a Voltkin creature to `world.creatures` at the
 *                       cinematic handoff moment (T+cinematicMs in cutsceneOverlay).
 *                       Enforces blueprint Q10 max-1-per-player invariant (silent no-op).
 *   - DESPAWN_CREATURE — remove a creature by id. Idempotent for missing ids
 *                       (matches `applyDespawnSpark` semantic). Exposed for
 *                       GODLY_ABORT cascade clarity + future S26+ external triggers.
 *   - CREATURE_TICK   — advance the creature one frame: increment `ticksInState`,
 *                       transition SPAWNING→DESPAWNING at `despawnAtTick - 60`,
 *                       AUTO-DELETE at `despawnAtTick` (blueprint Q5 lifecycle).
 *
 * Auto-delete-in-tick is the Council R1 majority resolution (2-of-3 Claude + Gemini):
 * entity-self-lifecycle is the established pattern for ephemeral runtime entities
 * (animation tracks, particle systems). The CREATURE_TICK action IS the observable
 * trigger; the deletion is the meaningful work, not a hidden side-effect. Grok R1
 * dissented (preferred explicit DESPAWN dispatch); auto-delete defended on cohesion
 * grounds + recorded in Battle Ledger.
 *
 * Defense-in-depth `has()` guards in all 3 reducers (Council CH2 + CH5 unanimous):
 * the main.ts CREATURE_TICK fan-out iterates a snapshot of `world.creatures.keys()`,
 * but any in-tick auto-delete can stale subsequent ids in the same fan-out. Each
 * reducer returns early if the id is no longer in the map.
 */

import type { World } from '../world.ts';
import type { PlayerId, Vec2 } from '../../types.ts';
import {
  asCreatureId,
  CREATURE_DESPAWNING_TICKS,
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
 * Advance one frame for the given creature. Auto-deletes at `despawnAtTick`,
 * transitions SPAWNING→DESPAWNING at `despawnAtTick - CREATURE_DESPAWNING_TICKS`,
 * otherwise increments `ticksInState`. Defense-in-depth: returns early if the
 * id is no longer in the map (main.ts fan-out snapshot may include stale ids
 * after a prior tick auto-deleted).
 */
export function applyCreatureTick(world: World, action: CreatureTickAction): World {
  const creature = world.creatures.get(action.creatureId);
  if (creature === undefined) return world;

  // Auto-delete at end-of-life (cohesion > observability — Council CH5 majority).
  if (world.tick >= creature.despawnAtTick) {
    world.creatures.delete(action.creatureId);
    return world;
  }

  // SPAWNING → DESPAWNING transition at the last-second mark (blueprint Q5).
  if (
    creature.state === 'SPAWNING' &&
    world.tick >= creature.despawnAtTick - CREATURE_DESPAWNING_TICKS
  ) {
    creature.state = 'DESPAWNING';
    creature.ticksInState = 0;
    return world;
  }

  creature.ticksInState++;
  return world;
}
