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
 *   3. (S169 — TICK_ENERGY was removed with the energy mechanic; see archive/energy/RESTORE.md)
 *   4. computeTerritorialInfluence (S49 Sym F, per-tick not per-substep)
 *   5. PHYSICS_SUBSTEPS × [controls per-substep + verletStepAll + solveBonds +
 *      enforceSpawnerBounds]
 *   6. world.tick++
 *
 * ⛔ S146 P1 — THERE IS NO SPARK↔SPARK COLLISION PASS ANY MORE, BY OWNER RULING.
 *
 * `resolveCollisions` used to run here, 8 iterations per substep, pushing overlapping FREE sparks
 * apart along their separation vector. The owner played it and reported it as a defect, verbatim:
 * *"the primitives push each other off like an antimagnet which becomes a mess after there are too
 * many of them in spawn zone or outside... when you click to drag one it pushes the other out of the
 * way... now that we have gatherers there is no use for that anymore."*
 *
 * They are right about the mechanism AND about the obsolescence. `resolvePair` applied a symmetric
 * positional correction of `(minDist - dist) * 0.5`, and because Verlet reconstructs velocity from
 * the position delta on the next substep, a positional shove IS an impulse — so dragging one spark
 * through a cluster flung the rest. The feature it existed for (shoulder your way into a pile to
 * grab the shape you want) was made redundant by the gatherers, which now do all the harvesting:
 * `pickSpark` (controls.ts) already refuses to pick anything inside the spawn zone.
 *
 * ⚠ AN EXACT PILE IS STILL FULLY PLAYABLE — checked on disk, not assumed. `pickSpark` is a LINEAR
 * nearest-to-cursor scan over `freeSparks` that never consulted the spatial grid, and it skips any
 * spark whose `state.kind !== 'Free'`. So a perfectly-overlapping stack peels ONE PER CLICK rather
 * than becoming unpickable. Both external Council seats predicted the opposite (Grok: "65-80% of
 * visible sparks unpickable"; Gemini: "the top spark permanently shields the bottom ones") and both
 * were wrong about this codebase.
 *
 * The `SpatialGrid` went with it: `insertAll`/`forEachNearbyPair` had no consumer outside
 * `resolveCollisions` (`vortex.ts` explicitly declines to use it), so the grid was dead the moment
 * this call went. Nothing else broadphases. Do not reintroduce one without a second consumer.
 */

import {
  BOMB_MAX_ACTIVE,
  HAZARD_SPAWN_ENABLED,
  freeSparkSoftCapForWave,
  FREE_SPARK_TTL_TICKS,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  POTATO_MAX_ACTIVE,
  RAINBOW_MAX_ACTIVE,
  SEAGULL_MAX_ACTIVE,
  waveSpawnMultiplier,
} from '../constants.ts';
import { Spawner, enforceSpawnerBounds, type BombSpawnRequest, type PotatoSpawnRequest, type RainbowSpawnRequest, type SeagullSpawnRequest } from '../game/spawner.ts';
import type { Spark } from '../game/spark.ts';
import type { ControlsLike } from '../input/controlsCore.ts';
import { solveBonds, type Bond } from './bonds.ts';
import {
  computeSteeringAccel,
  creatureDamping,
  creatureVerletStep,
} from './creatureVerlet.ts';
import { verletStepAll } from './verlet.ts';
import { tickCruiserChase } from '../state/gameMode.ts';
import { computeTerritorialInfluence } from '../state/territory.ts';
import { applyAnchorStabilize } from '../state/anchorStabilize.ts';
import { applyKeystoneAnchor } from '../state/keystoneAnchor.ts';
// ⛔ S178 (owner ruling) — `applyVortexPull` / `applySpindlePull` are NO LONGER IMPORTED. Both
// modules are kept and still tested; they are simply not wired into the loop. See the ruling block
// in `stepPhysics` below for why, and for the creature-drag idea he left the door open for.
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
  controls: ControlsLike,
): void {
  // SPAWN — dispatched as actions for the audit log seam (§ 10.2).
  const spawned: Spark[] = [];
  const bombSpawns: BombSpawnRequest[] = [];
  const potatoSpawns: PotatoSpawnRequest[] = [];
  const rainbowSpawns: RainbowSpawnRequest[] = [];
  const seagullSpawns: SeagullSpawnRequest[] = [];
  // ⭐ S157 B8 (owner) — waves make the quarry faster. See `waveSpawnMultiplier`; the multiplier
  // scales the resulting INTERVAL, never the rng, so the seeded stream is untouched.
  spawner.tick(
    PHYSICS_DT, world.tick, spawned, bombSpawns, potatoSpawns, rainbowSpawns, seagullSpawns,
    waveSpawnMultiplier(world.waveNumber),
  );
  // ⭐ S149 P2 / CF-S148-a (R22) — THE QUARRY PRODUCES DURING BUILD ONLY.
  //
  // *"The spawner produces during BUILD only."* Found violated on disk by the S148 vision-gap
  // audit: no spawner anywhere read `matchPhase`, so the quarry kept minting shapes all through the
  // FIGHT — free economy at the exact moment the design says gathering has stopped and every
  // gatherer is locked inside its castle.
  //
  // ⛔ GATE THE DISPATCH, NOT `spawner.tick`. This is the file's own established pattern (see the
  // bomb/potato/rainbow/seagull gates immediately below: *"the spawner already redrew its
  // countdown, so a capped fire is a clean skip"*). It is not stylistic — `spawner.tick` draws from
  // a seeded RNG stream and mints ids from a monotonic allocator. Skipping the CALL would advance
  // that stream differently on a host than on the `?worker=1` mirror the moment their phases
  // disagreed for even one tick, and the differential hash would diverge. Skipping only the
  // dispatch consumes identical randomness on both sims and merely discards the result.
  if (world.matchPhase === 'BUILD') {
    for (const s of spawned) dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  }
  // S71 P1 — bomb cadence: dispatch SPAWN_BOMB per request, gated on BOMB_MAX_ACTIVE
  // (the spawner already redrew its countdown, so a capped fire is a clean skip).
  for (const req of bombSpawns) {
    if (HAZARD_SPAWN_ENABLED && world.bombs.size < BOMB_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_BOMB', pos: req.pos });
    }
  }
  // S72 P3 — potato cadence: dispatch SPAWN_POTATO per request, gated on POTATO_MAX_ACTIVE
  // (same skip-and-redraw posture as the bomb).
  for (const req of potatoSpawns) {
    if (HAZARD_SPAWN_ENABLED && world.potatoes.size < POTATO_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_POTATO', pos: req.pos });
    }
  }
  // S75 P3 — rainbow cadence: dispatch SPAWN_RAINBOW per request, gated on RAINBOW_MAX_ACTIVE
  // (same skip-and-redraw posture as bomb/potato).
  for (const req of rainbowSpawns) {
    if (HAZARD_SPAWN_ENABLED && world.rainbows.size < RAINBOW_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_RAINBOW', pos: req.pos });
    }
  }
  // S77 P3 — seagull cadence: dispatch SPAWN_SEAGULL per request, gated on SEAGULL_MAX_ACTIVE
  // (same skip-and-redraw posture as the other hazards).
  for (const req of seagullSpawns) {
    if (HAZARD_SPAWN_ENABLED && world.seagulls.size < SEAGULL_MAX_ACTIVE) {
      dispatch(world, { type: 'SPAWN_SEAGULL', pos: req.pos, vx: req.vx });
    }
  }

  // S109 P1 — TTL reap runs BEFORE the count-cap so a 10s-old Free spark always despawns
  // regardless of how many are live (the cap only fires past FREE_SPARK_SOFT_CAP).
  reapExpiredFreeSparks(world);
  enforceFreeSparkCap(world);

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

  // S115 P1 (G2-PROMO Phase-2) — ANCHOR planted-joint: floor each live Anchor (Dot→Square) bond's
  // territorial stiffnessMultiplier so an anchored structure stays rigid in enemy territory (where
  // normal bonds sag to ~0.06 effective). MUST run AFTER computeTerritorialInfluence (which sets the
  // multiplier each tick) and BEFORE the substep solveBonds loop (so all 8 substeps see the floored
  // value). Host-only; no-op with no live Anchor / outside enemy territory. Pure synced-state fn.
  applyAnchorStabilize(world);

  // S118 P2 (B3) — KEYSTONE ANCHOR symbiotic chaining: an un-fouled Anchor confers PART of its
  // territorial rigidity to MAGIC bonds directly bonded to its endpoint primitives (partial floor,
  // below the anchor's own). MUST run AFTER applyAnchorStabilize (so the anchors' own floors are set
  // first and a magic-neighbor-that-is-also-an-Anchor keeps its higher 0.7) and BEFORE the substep
  // loop (so all 8 substeps see the conferred value). Host-only; per-bond idempotent constant-floor
  // max → iteration-order-irrelevant; ephemeral stiffnessMultiplier → replay-byte-identical. No-op with
  // no live Anchor / no anchored magic neighbor sagging in enemy territory.
  applyKeystoneAnchor(world);

  /*
   * ⛔⛔⛔ S178 (OWNER RULING) — **NOTHING PULLS FREE SPARKS. THE VORTEX AND THE SPINDLE ARE
   * UNWIRED FROM THE LOOP, AND THIS IS THE LINE THAT DOES IT.**
   *
   * Owner, S178, on seeing it in a match: *"How is that a mechanic? When did we ever say that it
   * should be a mechanic? Dot-spiral combo will pull free sparks. That's ridiculous. [Did] we ever
   * say that? … for now, it should definitely not affect free shapes, free primitives."*
   *
   * ⛔ AND HE IS RIGHT THAT HE NEVER SAID IT. The only authority this mechanic ever had was a
   * FLAVOUR STRING in a table — `combos.ts` *"Pulls nearby free sparks toward it (anchor pull)"* —
   * which S89 P6 elected to "realize" under a self-set *"Make the geometry matter"* roadmap item
   * (see `state/vortex.ts`'s own header). There is no owner quote anywhere near it, in a file that
   * is otherwise dense with them. It was self-authorised from a description of itself, and the
   * Spindle (S115 P2) was then built by analogy to it.
   *
   * ⛔ WHAT HE ACTUALLY CAUGHT, and it is worse than flavour. `enforceSpawnerBounds` confines every
   * non-escrowed Free spark to the 125 px quarry disc, and `applyVortexPull` had no quarry guard —
   * so a Vortex built within `VORTEX_PULL_RADIUS` of the disc rakes the ENTIRE SHARED SPAWN POOL
   * into one arc beside its owner's base, and his gatherers collect from a heap. His brother found
   * it in a live match and used it: *"that's like a cheat code he found … We definitely have to
   * fucking get rid of that."*
   *
   * ⚠ THE MODULES AND THEIR TESTS ARE KEPT, DELIBERATELY. Nothing is deleted: `state/vortex.ts` and
   * `state/spindle.ts` still compile, still pass their unit tests, and are one line from being
   * re-armed. He left the door open — *"it could be a cool mechanic to pull in CREATURES … tag on
   * them so if they're running against it, it will pull them closer, make them slower; if they run
   * [with] it, it'll make him faster. We can discuss it"* — and that is a different victim, not a
   * different radius. When that is specified, it is re-wired here against creatures.
   *
   * ⚠ THE SPINDLE IS MY READING OF HIS RULING, NOT HIS WORDS. He named the Dot→Spiral Vortex; the
   * Spindle is the same class of thing (Line↔Circle) doing the same thing tangentially to the same
   * victims, so leaving it armed would answer the letter of *"should not affect free primitives"*
   * and none of its point. Flagged for him in the S178 PDR's open questions.
   */

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
    // enforceSpawnerBounds (which operates on sparkArr only).
    // Steering force returns ZERO_ACCEL during SPAWNING / DESPAWNING (Δ4), so
    // creatures appear stationary during the 1s spawn animation + 1s despawn
    // fade. Caller stepPhysics() is host-only-gated at call site. Empty
    // world.creatures Map iterates zero times — negligible overhead.
    for (const c of world.creatures.values()) {
      // S109 P2 — thread world.tick so a poop-slowed creature crawls until its poopyUntilTick.
      /*
       * ⭐⭐ S175 P10 (owner) — the fourth argument is the BRAKE. A creature that has stopped
       * steering does not stop moving: `ZERO_ACCEL` means coast, and at the global damping a slide
       * takes ~3.1 s to bleed off, which is the ice-skating he reported. `creatureDamping` returns
       * the unchanged global value for every case where coasting is the FEATURE (stunned knockback,
       * spawning, despawning, a standoff fighter holding its ring) and the brake only for a melee
       * unit mid-swing.
       */
      creatureVerletStep(
        c, SUBSTEP_DT, computeSteeringAccel(c, world.tick), creatureDamping(c, world.tick),
      );
    }
    enforceSpawnerBounds(sparkArr, undefined, attractedId);
  }
  world.tick++;
}

export function freeSparkArray(map: ReadonlyMap<SparkId, Spark>): Spark[] {
  return Array.from(map.values());
}

/**
 * S109 P1 — despawn any Free spark that has lingered un-claimed for FREE_SPARK_TTL_TICKS
 * (10s). Keeps the spawn zone from piling into chaos (owner playtest #6). Only Free sparks
 * expire — Carried/Bonded are skipped here AND applyDespawnSpark no-ops on non-Free, so a
 * carry/bond can never be yanked mid-flight. Candidates are collected before dispatching so
 * the freeSparks map isn't mutated mid-iteration. Deterministic: pure tick math, host-
 * authoritative, no wall-clock / RNG → replay-safe. NO velocity clamp (owner tactic — see
 * FREE_SPARK_TTL_TICKS comment).
 */
export function reapExpiredFreeSparks(world: Parameters<typeof dispatch>[0]): void {
  const expired: SparkId[] = [];
  for (const s of world.freeSparks.values()) {
    // V6-1.2 — an ESCROWED spark (a gatherer is hauling it, or it is banked at a keep) never
    // expires. Without this the 10 s TTL deletes the shape mid-carry and the whole haul loop
    // silently fails; a banked stockpile would evaporate while the player is mid-build.
    if (
      s.state.kind === 'Free' &&
      s.escrow === undefined &&
      world.tick - s.createdTick >= FREE_SPARK_TTL_TICKS
    ) {
      expired.push(s.id);
    }
  }
  for (const id of expired) {
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: id });
  }
}

function enforceFreeSparkCap(world: Parameters<typeof dispatch>[0]): void {
  // V6-1.2 — escrowed sparks are neither counted nor evictable: they are a player's in-flight haul
  // and banked stockpile, not spawn-zone clutter, so the cap must not treat them as "oldest Free".
  let freeCount = 0;
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free' && s.escrow === undefined) freeCount++;
  }
  // ⭐ S186 — THE CEILING IS NOW A FUNCTION OF THE WAVE. `freeSparkSoftCapForWave` keeps this a
  // SAFETY VALVE (its own docblock's word) instead of letting the fixed 24 become the throttle the
  // S186 spawn step-up would otherwise run straight into. `world.waveNumber` is hashed and synced,
  // so the host and the ?worker=1 mirror evict identically.
  const cap = freeSparkSoftCapForWave(world.waveNumber);
  if (freeCount <= cap) return;

  const candidates: Spark[] = [];
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free' && s.escrow === undefined) candidates.push(s);
  }
  /*
   * ⛔ TOTAL ORDER, AND S186 IS WHAT MADE IT LOAD-BEARING. This was `a.createdTick - b.createdTick`
   * alone, which returns 0 for two sparks minted on the SAME tick — and `spawner.tick` mints in a
   * `while` loop, so a single tick can emit several. The tie then fell through to `Array.prototype.sort`'s
   * stability, i.e. to `world.freeSparks` Map INSERTION ORDER, which is exactly the class of bug the
   * project rule names (*"letting Map iteration decide anything is how S155 handed one seat every melee
   * exchange for a whole match"*).
   *
   * ⚠ It was latent before and is REACHABLE NOW: at the band-5 faucet the mean inter-arrival is under
   * two ticks, so same-tick births go from vanishing to routine. The explicit id compare makes the
   * eviction set identical on every sim regardless of insertion history.
   */
  candidates.sort((a, b) => a.createdTick - b.createdTick || (a.id as number) - (b.id as number));

  const excess = freeCount - cap;
  for (let i = 0; i < excess; i++) {
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: candidates[i].id });
  }
}
