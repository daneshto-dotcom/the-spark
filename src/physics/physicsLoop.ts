/**
 * SPARK — fixed-step physics tick orchestration.
 *
 * Extracted from main.ts in S50 P2 (Council Standard-tier refactor, Battle
 * Ledger C2 ADOPT 4 extractions). main.ts pre-S50 was 1221 LOC; the physics
 * tick (stepPhysics + helpers) was the largest module-level cluster, all
 * already at module scope — mechanical extraction with zero behavior change.
 *
 * Frame-loop position (§ 10.6):
 *   accumulate dt → call stepPhysics once per PHYSICS_DT tick (host or solo
 *   only) → caller increments world.tick if client (no physics on client).
 *
 * Per stepPhysics call (one Verlet tick at 60 Hz):
 *   1. Spawner tick → SPAWN_SPARK dispatches
 *   2. enforceFreeSparkCap → DESPAWN_SPARK over soft cap
 *   3. TICK_ENERGY for each player
 *   4. computeTerritorialInfluence (S49 Sym F, per-tick not per-substep)
 *   5. PHYSICS_SUBSTEPS × [controls per-substep + verletStepAll + solveBonds +
 *      enforceSpawnerBounds + resolveCollisions]
 *   6. world.tick++
 */

import {
  BOMB_MAX_ACTIVE,
  FREE_SPARK_SOFT_CAP,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  POTATO_MAX_ACTIVE,
  RAINBOW_MAX_ACTIVE,
  SEAGULL_MAX_ACTIVE,
} from '../constants.ts';
import { Spawner, enforceSpawnerBounds, type BombSpawnRequest, type PotatoSpawnRequest, type RainbowSpawnRequest, type SeagullSpawnRequest } from '../game/spawner.ts';
import type { Spark } from '../game/spark.ts';
import type { Controls } from '../input/controls.ts';
import { solveBonds, type Bond } from './bonds.ts';
import { resolveCollisions } from './collision.ts';
import {
  computeSteeringAccel,
  creatureVerletStep,
} from './creatureVerlet.ts';
import type { SpatialGrid } from './spatial.ts';
import { verletStepAll } from './verlet.ts';
import { tickCruiserChase } from '../state/gameMode.ts';
import { computeTerritorialInfluence } from '../state/territory.ts';
import { applyVortexPull } from '../state/vortex.ts';
import { dispatch } from '../state/world.ts';
import { asPlayerId, type SparkId } from '../types.ts';

export const PHYSICS_DT = 1 / PHYSICS_HZ;
const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;

/**
 * One fixed-step physics tick. Caller-gated to host or solo paths only
 * (clients receive snapshot-driven state — see main.ts isClient gate).
 */
export function stepPhysics(
  world: Parameters<typeof dispatch>[0],
  spawner: Spawner,
  grid: SpatialGrid,
  controls: Controls,
): void {
  // SPAWN — dispatched as actions for the audit log seam (§ 10.2).
  const spawned: Spark[] = [];
  const bombSpawns: BombSpawnRequest[] = [];
  const potatoSpawns: PotatoSpawnRequest[] = [];
  const rainbowSpawns: RainbowSpawnRequest[] = [];
  const seagullSpawns: SeagullSpawnRequest[] = [];
  spawner.tick(PHYSICS_DT, world.tick, spawned, bombSpawns, potatoSpawns, rainbowSpawns, seagullSpawns);
  for (const s of spawned) dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  // S71 P1 — bomb cadence: dispatch SPAWN_BOMB per request, gated on BOMB_MAX_ACTIVE
  // (the spawner already redrew its countdown, so a capped fire is a clean skip).
  for (const req of bombSpawns) {
    if (world.bombs.size < BOMB_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_BOMB', pos: req.pos });
    }
  }
  // S72 P3 — potato cadence: dispatch SPAWN_POTATO per request, gated on POTATO_MAX_ACTIVE
  // (same skip-and-redraw posture as the bomb).
  for (const req of potatoSpawns) {
    if (world.potatoes.size < POTATO_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_POTATO', pos: req.pos });
    }
  }
  // S75 P3 — rainbow cadence: dispatch SPAWN_RAINBOW per request, gated on RAINBOW_MAX_ACTIVE
  // (same skip-and-redraw posture as bomb/potato).
  for (const req of rainbowSpawns) {
    if (world.rainbows.size < RAINBOW_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_RAINBOW', pos: req.pos });
    }
  }
  // S77 P3 — seagull cadence: dispatch SPAWN_SEAGULL per request, gated on SEAGULL_MAX_ACTIVE
  // (same skip-and-redraw posture as the other hazards).
  for (const req of seagullSpawns) {
    if (world.seagulls.size < SEAGULL_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_SEAGULL', pos: req.pos, vx: req.vx });
    }
  }

  enforceFreeSparkCap(world);

  for (const player of world.players.values()) {
    dispatch(world, { type: 'TICK_ENERGY', playerId: player.id, deltaSec: PHYSICS_DT });
  }

  // S82 P1 — slowed-cruiser cursor-chase (cruiser-poopy-slow movement model). Runs once
  // per tick BEFORE the substep loop so this tick's gameplay (pickup reach, poop-vs-avatar,
  // splat-clean sweeps) all see the post-chase avatarPos. No-op unless some player has an
  // active poopedCursorTarget (the overwhelmingly common case iterates ≤6 players).
  tickCruiserChase(world);

  const sparkArr = freeSparkArray(world.freeSparks);
  let bondArr: Bond[] = Array.from(world.bonds.values());

  const attractedId = controls.state.kind === 'AttractDrag' ? controls.state.sparkId : null;

  // S49 P1 (Sym F) — territorial influence pass. Called ONCE per tick
  // (not per substep) so the stiffnessMultiplier is set from current
  // primitive positions before the substep integration loop runs. Phase 1
  // resets all multipliers to 1.0; Phase 2 degrades enemy bonds inside
  // territorial radii. All 8 substep solveBonds calls then see the same
  // multipliers — correct because no bond creation happens inside the
  // substep loop (only severance, which removes bonds from bondArr on
  // the next substep iteration).
  computeTerritorialInfluence(world);

  // S89 P6 (G1b) — Vortex anchor-pull: a Dot→Spiral magic combo pulls nearby FREE sparks toward
  // it. Once per tick (like tickCruiserChase, BEFORE the substeps), host-only; the substep Verlet
  // then carries + damps the injected velocity. No-op when no live Vortex exists. Skips the
  // currently AttractDragged spark so the pull never fights the player's drag.
  applyVortexPull(world, attractedId);

  for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
    controls.applyPerSubstep();
    verletStepAll(sparkArr, SUBSTEP_DT);
    if (bondArr.length > 0) {
      const broken = solveBonds(bondArr);
      if (broken.length > 0) {
        for (const bondId of broken) {
          if (world.bonds.has(bondId)) {
            // S17 P1 — physics-cause overstretch sever bypasses Phase-2
            // §VIII.3 charge gate (this is the constraint solver firing,
            // not a player disruption action). playerId is informational
            // (the dispatch case ignores it for cause='physics').
            // S42 — was `world.currentPlayerId` (turn-based artifact);
            // hardcoded asPlayerId(0) since field is removed and playerId
            // is unused on this dispatch path.
            dispatch(world, {
              type: 'SEVER_BOND',
              bondId,
              playerId: asPlayerId(0),
              cause: 'physics',
            });
          }
        }
        bondArr = Array.from(world.bonds.values());
      }
    }
    // S26 P0 — Voltkin Phase 2B: integrate creatures via Verlet per substep AFTER
    // bond solver (so the constraint solver never sees creatures — phase-through
    // by construction; creatures are NOT in sparkArr or bondArr) and BEFORE
    // enforceSpawnerBounds + resolveCollisions (which operate on sparkArr only).
    // Steering force returns ZERO_ACCEL during SPAWNING / DESPAWNING (Δ4), so
    // creatures appear stationary during the 1s spawn animation + 1s despawn
    // fade. Caller stepPhysics() is host-only-gated at call site. Empty
    // world.creatures Map iterates zero times — negligible overhead.
    for (const c of world.creatures.values()) {
      creatureVerletStep(c, SUBSTEP_DT, computeSteeringAccel(c));
    }
    enforceSpawnerBounds(sparkArr, undefined, attractedId);
    resolveCollisions(sparkArr, grid);
  }
  world.tick++;
}

export function freeSparkArray(map: ReadonlyMap<SparkId, Spark>): Spark[] {
  return Array.from(map.values());
}

function enforceFreeSparkCap(world: Parameters<typeof dispatch>[0]): void {
  let freeCount = 0;
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free') freeCount++;
  }
  if (freeCount <= FREE_SPARK_SOFT_CAP) return;

  const candidates: Spark[] = [];
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free') candidates.push(s);
  }
  candidates.sort((a, b) => a.createdTick - b.createdTick);

  const excess = freeCount - FREE_SPARK_SOFT_CAP;
  for (let i = 0; i < excess; i++) {
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: candidates[i].id });
  }
}
