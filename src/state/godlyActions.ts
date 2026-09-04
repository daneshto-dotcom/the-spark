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
 * inline switch bodies. `World` is a type-only import, so there is no
 * world.ts <-> godlyActions.ts runtime cycle.
 *
 * ⛔ S163 P5 — this used to say `setCooldown` was "imported here directly". It never was:
 * the file's only imports are two TYPE-only ones. The whole godlyCooldown module had zero
 * production importers and was deleted — superseded by `godlyFiredThisMatch` in S97 P5.
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
 * cinematic + the per-match TYPE record ONLY (S163 P5: it never set a cooldown —
 * `setCooldown` had no callers), and the autonomous Voltkin creature pipeline
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
  /*
   * S97 P5 — records that this type has fired this match.
   *
   * ⭐ S157 B4 — IT NO LONGER BLOCKS THE SUMMON (see `findGodlyMatch`); it is now purely a record.
   *
   * ⭐ S158 P5 — THE OTHER HALF, AND IT DID NOT NEED THE REWRITE S157 EXPECTED.
   *
   * The deferral note here read: doing it properly means separating the cinematic's TIMING (which
   * the sim owns, in both direct and worker mode, and against which `pendingCreatureSpawn` is
   * scheduled) from its VISUALS, because the cutscene overlay's own `onComplete` is the SOLE driver
   * of `GODLY_COMPLETE` and of queue advancement — so simply not playing the overlay for a repeat
   * would latch `activeCinematicPlayerId` forever and queue every later Voltkin behind it.
   *
   * That analysis of the HAZARD is exactly right, and it is what the fix is built around. What it
   * over-estimated is the CURE. The timing does not have to move to the sim to be separated from the
   * visuals — it only has to keep running while the visuals do not. A repeat now takes a SILENT path
   * through the same overlay: the same total duration, the same `onComplete`, the same queue
   * advance, the same `pendingCreatureSpawn` tick — with no video, no voice and no vignette. Nothing
   * can latch, because nothing about the completion path changed.
   *
   * ⚠ THE ONE VISIBLE CONSEQUENCE, FLAGGED RATHER THAN TUNED AWAY: on a repeat there is now a quiet
   * ~4.8 s between building the tower and the Voltkin appearing, where the cutscene used to cover
   * that wait. It reads as a summoning delay. Shortening it for repeats would mean moving
   * `pendingCreatureSpawn`'s schedule, which the replay guards pin — so it is left for the owner to
   * rule on after they have felt it.
   */
  /*
   * ⭐ S158 P5 (CF-S157-d) — CAPTURED BEFORE THE ADD, WHICH IS THE ONLY MOMENT IT IS KNOWABLE.
   *
   * Owner: *"voltkin cinematic SHOULD be once per game for the first person to have built him. but
   * the voltkin spawn himself should be generated every time someone builds his tower."* S157 B4
   * shipped the spawn half. This is the cinematic half.
   *
   * One line after this the id is recorded, and from then on nothing can tell a first showing from a
   * repeat — which is exactly why the renderer cannot re-derive it and why this is a field.
   */
  world.cinematicIsFirstShowing = !world.godlyFiredThisMatch.has(event.godlyId);
  world.godlyFiredThisMatch.add(event.godlyId);
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
  world.cinematicIsFirstShowing = false; // S158 P5 — travels with currentCinematicEvent, always
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
  world.cinematicIsFirstShowing = false; // S158 P5
  world.pendingCinematics.length = 0;
  world.creatures.clear();
  world.pendingCreatureSpawn = null;
  // S100 P1 (TD Phase 1a) — cascade-clear creature spawners alongside creatures so a
  // peer-drop / explicit abort leaves no spawner that would keep minting chewers +
  // accruing income in a dead session (inline clear mirrors the creatures.clear() above,
  // keeping godlyActions.ts free of a runtime teardownSpawners import).
  world.creatureSpawners.clear();
  world.nextSpawnerId = 0;
  // S103 P2 — cascade-clear defenders alongside creatures/spawners on peer-drop / abort (inline,
  // keeping godlyActions.ts free of a runtime teardownDefenders import — mirrors the lines above).
  world.defenders.clear();
  world.nextDefenderId = 0;
  // V6-1.1 — cascade-clear gatherers alongside creatures/spawners/defenders on abort (inline,
  // keeping godlyActions.ts free of a runtime teardownGatherers import — mirrors the lines above).
  world.gatherers.clear();
  world.nextGathererId = 0;
  // S136 P1 — and the castle banks, on the same inline rationale as the line above.
  world.castleBanks.clear();
  world.gathererOrders.clear(); // S141 P2 — the order queues tear down with the gatherer economy
  // S158 P6 — and the landed stink bags, on the same inline rationale as every line above: a cloud
  // outliving the tower that threw it would keep damaging a board nobody is playing on any more.
  world.stinkClouds.clear();
  world.nextStinkCloudId = 0;
  /*
   * ⭐ S158 P4 (CF-S157-f) — THE ONE THING THE TEARDOWN FORGOT.
   *
   * Every other collection above is cleared here; `godlyFiredThisMatch` was not. `applyGodlyTrigger`
   * adds to it at cinematic START, so a peer dropping DURING a cutscene left the record standing
   * with nothing to match it — the cinematic it recorded never finished, and the creature it would
   * have spawned was cleared two lines up.
   *
   * ⚠ THE CARRY-FORWARD OVERSTATED THIS, AND THE CORRECTION MATTERS. It was written as *“an aborted
   * cinematic permanently burns that godly for all players”*, which was true under S97 semantics and
   * STOPPED being true at S157 B4: `findGodlyMatch` no longer consults the set, and it now has zero
   * production readers. So this is LATENT, not a live defect — measured, not assumed.
   *
   * It is fixed here anyway, and first, because S158 P5 makes the set load-bearing again: the
   * once-per-match CINEMATIC reads exactly this record. Landing P5 on top of a teardown that leaks
   * would resurrect the bug as a real one, in a path where it is much harder to see.
   */
  world.godlyFiredThisMatch.clear();
  return world;
}
