/**
 * SPARK — godly cinematic-state actions (S60 P5 — extracted from world.ts
 * dispatch() to bring the reducer back toward its §XV size charter).
 *
 * The single-slot cinematic state machine: GODLY_TRIGGER activates (or queues)
 * a cinematic + marks the godly TYPE spent for the match (S97 P5 — replaced the
 * old per-player 60s cooldown); GODLY_COMPLETE clears the active slot (main.ts
 * shifts the next pending event); GODLY_ABORT tears the whole cinematic +
 * creature state down on peer-drop / explicit abort.
 *
 * PURE reducer helpers: each mutates `world` in place and returns it (CQS — no
 * re-dispatch from inside; main.ts owns the pending-queue shift). Determinism-
 * critical (replay path) — mutation order is preserved EXACTLY as the original
 * inline switch bodies. `setCooldown` lives in godlyCooldown.ts (imported here
 * directly, so there is no world.ts <-> godlyActions.ts runtime cycle; `World`
 * is a type-only import).
 */

import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';
import type { World } from './world.ts';

/**
 * S22 P3 — single-slot cinematic serialization (PRIME-AUDIT Δ2). If another
 * cinematic is active, queue. Otherwise activate + mark the godly TYPE spent for
 * the match (S97 P5 godlyFiredThisMatch — "1 of each type per match"). The
 * cinematic plays in main.ts; the creature actor spawned at handoff (main.ts
 * onCinematicHandoff) handles bond severance.
 *
 * S27 P0 — the pre-S27 26-line synchronous SEVER_BOND cascade (cause='godly')
 * was DELETED (Council R1 Q5 UNANIMOUS creature-only); GODLY_TRIGGER now sets
 * cinematic + cooldown ONLY, and the autonomous Voltkin creature pipeline
 * (SPAWN_CREATURE at cinematic end -> CREATURE_TICK FSM -> CREATURE_ATTACK
 * severs target bonds at ~1/sec) does the destruction.
 */
export function applyGodlyTrigger(world: World, event: GodlyTriggerEvent): World {
  if (world.activeCinematicPlayerId !== null) {
    world.pendingCinematics.push(event);
    return world;
  }
  const triggerer = world.players.get(event.triggererPlayerId);
  if (triggerer === undefined) return world;
  world.activeCinematicPlayerId = event.triggererPlayerId;
  world.currentCinematicEvent = event;
  world.godlyFiredThisMatch.add(event.godlyId); // S97 P5 — this type is now spent for the match
  return world;
}

/**
 * Clear the active cinematic slot. No re-dispatch from inside the reducer (CQS —
 * main.ts setTimeout shifts the next pending event and dispatches GODLY_TRIGGER
 * for it).
 */
export function applyGodlyComplete(world: World): World {
  world.activeCinematicPlayerId = null;
  world.currentCinematicEvent = null;
  return world;
}

/**
 * Tear down all cinematic + creature state. S25 P0 — cascade-clear creatures
 * (blueprint Edge Case #2): peer-drop or explicit abort must remove all live
 * actors so no zombie sprites persist. S28 P0 (PRIME-AUDIT Δ5) — clear the
 * pending creature spawn so a queued spawn cannot fire after abort (replay +
 * 1v1 peer-drop both honored).
 */
export function applyGodlyAbort(world: World): World {
  world.activeCinematicPlayerId = null;
  world.currentCinematicEvent = null;
  world.pendingCinematics.length = 0;
  world.creatures.clear();
  world.pendingCreatureSpawn = null;
  // S100 P1 (TD Phase 1a) — cascade-clear creature spawners alongside creatures so a
  // peer-drop / explicit abort leaves no spawner that would keep minting chewers +
  // accruing income in a dead session (inline clear mirrors the creatures.clear() above,
  // keeping godlyActions.ts free of a runtime teardownSpawners import).
  world.creatureSpawners.clear();
  world.nextSpawnerId = 0;
  return world;
}
