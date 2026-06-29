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
import type { PlayerId, SpawnerId, Vec2 } from '../../types.ts';
import {
  asCreatureId,
  CREATURE_DESPAWNING_TICKS,
  makeCreature,
  makeVoltkinCreature,
  type CreatureId,
  type CreatureType,
} from './creature.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from './voltkin-config.ts';
import { distSq, isWithinAttackRange } from './creatureAI.ts';
import {
  CHEW_INTERVAL_TICKS,
  CHEWER_MAX_GLOBAL,
  CHEWER_MAX_PER_SPAWNER,
  CHEWER_MAX_PER_VICTIM,
} from '../../constants.ts';
// S113 Batch C — a lightning-drone spawn uses its OWN cap (runtime-only call; the
// creatureLifecycle<->droneLifecycle<->world cycle is the same runtime-safe shape as creatureAttack).
import { underDroneCaps } from '../droneLifecycle.ts';

/** Action shapes — exported so `world.ts` can compose `GameAction`. */
export interface SpawnCreatureAction {
  readonly type: 'SPAWN_CREATURE';
  readonly creatureType: CreatureType;
  readonly ownerPlayerId: PlayerId;
  readonly pos: Vec2;
  /** S26 P0 — destination for SEEKING-state steering. Caller-computed
   *  (host-only, deterministic) per Council Q1 unanimous + Δ5. */
  readonly targetPos: Vec2;
  /**
   * S100 P1 (TD Phase 1a) — provenance discriminant for the population-split cap
   * (TOWER_DEFENSE_DESIGN.md §2.4, R10). `null`/absent → a Voltkin spawn (the
   * legacy max-1-per-owner counting ONLY the `sourceSpawnerId==null` population);
   * a `SpawnerId` → a chewer spawn (the per-spawner / global / per-victim chewer
   * caps, counting ONLY the non-null population). The two populations are counted
   * INDEPENDENTLY so a chewer swarm never blocks a Voltkin summon (or vice-versa).
   * The spawned `Creature.sourceSpawnerId` is set from this field.
   */
  readonly sourceSpawnerId?: SpawnerId | null;
  /**
   * S100 P1 (TD Phase 1a) — the enemy player this chewer is being aimed at, used
   * for the per-victim cap (`CHEWER_MAX_PER_VICTIM`). Supplied by the spawner poll
   * (the layer that runs the FFA target-spread). A chewer spawns in SPAWNING with
   * no committed `targetBondId` yet, so the victim count is keyed on this hint:
   * a chewer "targets" `victimPlayerId` for the purpose of the cap from the moment
   * it spawns. Absent → the per-victim guard is skipped (Voltkin spawns, or a
   * chewer spawn that hasn't picked a victim). Chewer-only.
   */
  readonly victimPlayerId?: PlayerId;
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
  const sourceSpawnerId = action.sourceSpawnerId ?? null;

  if (sourceSpawnerId === null) {
    // ── Voltkin (lifetime-bound) population ───────────────────────────────────
    // Legacy max-1-per-owner invariant (blueprint Q10), now SPLIT BY POPULATION
    // (S100 P1, R10): count ONLY the `sourceSpawnerId == null` creatures so a live
    // chewer swarm (non-null population) can never block a Voltkin summon. Voltkin
    // path is otherwise byte-identical (same makeVoltkinCreature, same id mint).
    for (const c of world.creatures.values()) {
      if (c.sourceSpawnerId === null && c.ownerPlayerId === action.ownerPlayerId) return world;
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

  // S113 Batch C — a lightning-DRONE is spawner-emitted (sourceSpawnerId !== null) but uses its OWN
  // independent population cap (underDroneCaps), NOT the chewer caps (owner decision #7 — a drone
  // swarm never blocks a chewer summon or vice-versa). The main.ts emit poll already gated it; this
  // is the authoritative defense-in-depth re-check (mirrors the chewer path below).
  if (action.creatureType === 'lightningDrone') {
    if (!underDroneCaps(world, sourceSpawnerId)) return world;
    const droneId = asCreatureId(world.nextCreatureId++);
    world.creatures.set(
      droneId,
      makeCreature(getCreatureConfig(action.creatureType), {
        id: droneId,
        ownerPlayerId: action.ownerPlayerId,
        pos: action.pos,
        targetPos: action.targetPos,
        spawnedAtTick: world.tick,
        sourceSpawnerId,
      }),
    );
    return world;
  }

  // ── Chewer (persistent, spawner-emitted) population ───────────────────────────
  // Split caps (S100 P1, R10/R13), counting ONLY the non-null population so the two
  // hazard classes never interfere. No-op (silent) if ANY cap is already saturated:
  //   • per-spawner: chewers already emitted by THIS spawner ≥ CHEWER_MAX_PER_SPAWNER
  //   • global:      ALL live chewers ≥ CHEWER_MAX_GLOBAL (perf/wire ceiling)
  //   • per-victim:  chewers already targeting the chosen victim ≥ CHEWER_MAX_PER_VICTIM
  //                  (only checked when the spawner poll supplied `victimPlayerId`)
  if (!underChewerCaps(world, sourceSpawnerId, action.victimPlayerId)) return world;

  const id = asCreatureId(world.nextCreatureId++);
  const creature = makeCreature(getCreatureConfig(action.creatureType), {
    id,
    ownerPlayerId: action.ownerPlayerId,
    pos: action.pos,
    targetPos: action.targetPos,
    spawnedAtTick: world.tick,
    sourceSpawnerId,
  });
  world.creatures.set(id, creature);
  return world;
}

/**
 * S100 P1 (TD Phase 1a) — chewer cap gate (TOWER_DEFENSE_DESIGN.md §2.4 R10/R13).
 * Pure read; the spawner poll (a later layer) calls this BEFORE dispatching a
 * chewer SPAWN_CREATURE (so it can also avoid emitting the dev VFX), and
 * `applySpawnCreature` re-checks it as the authoritative guard. Counts ONLY the
 * non-null `sourceSpawnerId` population (the chewer swarm) so a Voltkin summon
 * never affects the count and vice-versa.
 *
 * The per-victim term attributes each live chewer to the player who OWNS its
 * current `targetBondId` (via the bond's endpoint `placedBy`), so a single swarm
 * can't fully strip one player. A chewer with no committed target yet is not
 * counted against any victim. `victimPlayerId === undefined` skips the per-victim
 * term entirely.
 */
export function underChewerCaps(
  world: World,
  sourceSpawnerId: SpawnerId,
  victimPlayerId?: PlayerId,
): boolean {
  let global = 0;
  let perSpawner = 0;
  let perVictim = 0;
  for (const c of world.creatures.values()) {
    // S113 Batch C — count ONLY chewers (was `sourceSpawnerId === null` to skip Voltkin; now also
    // excludes lightning-drones, which are spawner-emitted too but have their OWN underDroneCaps).
    if (c.type !== 'chewer') continue;
    global++;
    if (c.sourceSpawnerId === sourceSpawnerId) perSpawner++;
    if (victimPlayerId !== undefined && c.targetBondId !== null) {
      if (chewerVictimPlayerId(world, c.targetBondId) === victimPlayerId) perVictim++;
    }
  }
  if (global >= CHEWER_MAX_GLOBAL) return false;
  if (perSpawner >= CHEWER_MAX_PER_SPAWNER) return false;
  if (victimPlayerId !== undefined && perVictim >= CHEWER_MAX_PER_VICTIM) return false;
  return true;
}

/**
 * S100 P1 — the player a chewer's committed bond belongs to, for the per-victim
 * cap. A bond is attributed to the `placedBy` of its first endpoint primitive
 * (deterministic; lowest-numbered endpoint by the `aId`/`bId` shape). Returns
 * `null` for a missing bond or missing endpoint (degenerate — not counted).
 */
function chewerVictimPlayerId(world: World, bondId: import('../../types.ts').BondId): PlayerId | null {
  const bond = world.bonds.get(bondId);
  if (bond === undefined) return null;
  const primA = world.primitives.get(bond.aId);
  if (primA === undefined) return null;
  return primA.placedBy;
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
 * S102 #1 (unified HP model) — deal `amount` single-target damage to a creature; if its
 * hp drops to ≤ 0 the creature despawns (removed from world.creatures). The SINGLE
 * creature-death path: a player RAID (RAID_CREATURE), a Voltkin zap on a chewer (P3+), and
 * next session the laser beam + HELGA slap all route through here, so "chewer dies in 1 hit /
 * Voltkin in 2" is one coherent rule (per-target hp, not a per-attacker table). AoE (potato)
 * keeps its own guaranteed-despawn loop — it obliterates regardless of hp.
 *
 * Host-only mutation (callers are host-authoritative reducers); tick-deterministic; pushes NO
 * effect — the green-goo splat + fly-splat SFX are driven RENDER-SIDE by the chewer renderer
 * detecting a chewer that vanished from the synced snapshot (reliable on host AND the 1v1
 * client, and it fires for EVERY chewer death — raid, potato, future laser — not just this one
 * path). Returns true if the creature died (caller may award a reward, etc.).
 */
export function damageCreature(world: World, creatureId: CreatureId, amount: number): boolean {
  const c = world.creatures.get(creatureId);
  if (c === undefined) return false;
  c.hp -= amount;
  if (c.hp <= 0) {
    world.creatures.delete(creatureId);
    return true;
  }
  return false;
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

  // S100 P1 (TD Phase 1a) — read all timing/behavior from this creature's config
  // instead of the module-level VOLTKIN_ATTACK_* constants (R16 de-hardcode). For
  // Voltkin the config values are the same literals (60/30/15/false/0), so its path
  // is byte-identical; for a chewer they diverge (persistent + chew loop below).
  const config = CREATURE_CONFIGS[creature.type];

  // 1. Auto-delete at end-of-life. S100 P1 (R4): gated behind `!config.persistent`
  //    so a persistent chewer NEVER auto-despawns (it lives until spawner teardown
  //    or a potato blast). The Voltkin (`persistent:false`) body is verbatim.
  if (!config.persistent) {
    if (world.tick >= creature.despawnAtTick) {
      world.creatures.delete(action.creatureId);
      return world;
    }
  }

  // 2. ANY-non-DESPAWNING → DESPAWNING at the last-second mark (blueprint Q5/Q8).
  //    S27 P0: extended to include ATTACKING so a creature in the middle of an
  //    attack cycle still routes through the despawn animation rather than
  //    fighting past its own end-of-life. Uses world.tick (not ticksInState).
  //    S100 P1 (R4): gated behind `!config.persistent` so a chewer never enters the
  //    forced end-of-life DESPAWNING. The Voltkin body is verbatim inside the gate.
  // S113 Batch C — a selfExplode DRONE is excluded from the forced fade-out: it never enters the
  // DESPAWNING window. Its end-of-life is the main.ts fan-out explode-on-fuse (at despawnAtTick-1),
  // with step 1's auto-delete at despawnAtTick as a silent fallback if that is ever missed.
  if (!config.persistent && !config.selfExplode) {
    if (
      creature.state !== 'DESPAWNING' &&
      world.tick >= creature.despawnAtTick - CREATURE_DESPAWNING_TICKS
    ) {
      creature.state = 'DESPAWNING';
      creature.ticksInState = 0;
      creature.targetBondId = null;
      creature.targetCreatureId = null; // S103 #8 — clear the opportunistic creature target too
      return world;
    }
  }

  // 3. Advance the in-state counter THEN check FSM transitions.
  creature.ticksInState++;

  // S37 P7 — emit CREATURE_CHARGE audio cue at the lion-form charge-engage
  // tick. Pure audio cue (renderer ignores this effect kind); audioManager
  // drains it on the next render frame and fires the procedural 250 ms
  // rising-tone SFX climaxing at FIRE_TICK. Replay-safe (push happens
  // in-reducer; `save.replay.test.ts` byte-equivalence preserved by tick-
  // deterministic increment). Wire-mirrored via SerializedEffect so 1v1
  // joiner gets the same CHARGE in their `world.effects` on next snapshot
  // apply (Council R1 D1 + Δ6 drain-parity).
  //
  // Guard: emit only when state was ATTACKING coming into this tick AND the
  // post-increment value equals the engage tick. If the FSM transitions out
  // of ATTACKING in step 6 below (cadence elapsed / target gone early), that
  // edit happens AFTER this push — the effect stays in the queue and drains
  // normally. (The post-FSM ATTACKING→SEEKING path resets ticksInState to 0,
  // so a freshly-entered SEEKING state cannot retro-trigger this branch.)
  //
  //  S100 P1 — read the engage tick from config (was the VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK
  //  module const). The CREATURE_CHARGE lion-form audio cue is a Voltkin-only flourish
  //  (the chewer uses the CHEW_BITE effect instead), so it is gated to the non-chew
  //  (single-fire) path. For Voltkin `config.chewHits === 0`, so this is byte-identical.
  if (
    config.chewHits === 0 &&
    creature.state === 'ATTACKING' &&
    creature.ticksInState === config.attackChargeEngageTick
  ) {
    world.effects.push({
      kind: 'CREATURE_CHARGE',
      tick: world.tick,
      pos: { x: creature.pos.x, y: creature.pos.y },
    });
  }

  // 4. SPAWNING → SEEKING at the spawn window boundary (S26 P0, blueprint Q7).
  //    Cleanup: targetBondId stays null on entry to SEEKING; main.ts will populate
  //    it on the NEXT tick's pre-CREATURE_TICK re-selection step.
  //    S100 P1 — read the spawn window from config (was CREATURE_SPAWN_TICKS, the
  //    Voltkin-derived module const). Byte-identical for Voltkin (config.spawnTicks
  //    === CREATURE_SPAWN_TICKS === 60); a chewer materializes faster (30).
  if (creature.state === 'SPAWNING' && creature.ticksInState >= config.spawnTicks) {
    creature.state = 'SEEKING';
    creature.ticksInState = 0;
    return world;
  }

  // 5. S27 P0: SEEKING → ATTACKING when target is set and in range.
  //    targetBondId is set by main.ts BEFORE this CREATURE_TICK call (every-tick
  //    re-selection per Council R1 Q3 UNANIMOUS A). isWithinAttackRange does a
  //    squared-distance compare against VOLTKIN_ATTACK_RANGE_SQ; returns false
  //    if the bond is missing (defense-in-depth race-condition guard).
  //    S103 #8 — a Voltkin also enters ATTACKING when an enemy CREATURE is in range
  //    (`targetCreatureId`), even if no bond is — so it can zap a chewer that wandered up to
  //    it while it has no structure in reach (Council MF3: opportunistic, never navigated to).
  //    `targetCreatureId` is set by the main.ts fan-out via `findNearestEnemyCreature`, which
  //    is range-gated to this creature's attackRange. Chewers never set it → byte-identical.
  if (
    creature.state === 'SEEKING' &&
    ((creature.targetBondId !== null && isWithinAttackRange(world, creature, creature.targetBondId)) ||
      creature.targetCreatureId !== null)
  ) {
    creature.state = 'ATTACKING';
    creature.ticksInState = 0;
    return world;
  }

  // 6. ATTACKING — two distinct behaviors keyed on `config.chewHits`:
  //
  //  6a. CHEWER (chewHits > 0) — the incremental chew loop (S100 P1, R9). The
  //      chewer COMMITS to one bond and stays in ATTACKING for the full
  //      `chewHits × CHEW_INTERVAL_TICKS` rather than Voltkin's single-fire bounce.
  //      Once per CHEW_INTERVAL_TICKS it lands a chew: `chewProgress++`. On every
  //      NON-final chew it emits a host-local CHEW_BITE effect (Layer 7 renders it);
  //      the actual severance (CREATURE_ATTACK → SEVER_BOND) is dispatched by the
  //      main.ts post-tick fan-out on the FINAL chew (at `ticksInState ===
  //      config.attackFireTick`, which for the chewer === chewHits×interval). While
  //      `chewProgress > 0` the chewer does NOT re-seek (main.ts skips re-selection
  //      for `sourceSpawnerId != null && chewProgress > 0`) — it is glued to the bond.
  //      `chewProgress` resets to 0 (and the creature drops back to SEEKING) ONLY when
  //      the committed bond has vanished — bite-through complete, or another actor
  //      severed it. No `despawnAtTick`/cadence bounce: persistent + commit-to-bond.
  if (config.chewHits > 0) {
    if (creature.state === 'ATTACKING') {
      // Bond gone (severed by the final chew elsewhere, by another actor, or
      // physics) → release the commit and re-seek next tick.
      if (creature.targetBondId === null || !world.bonds.has(creature.targetBondId)) {
        creature.chewProgress = 0;
        creature.state = 'SEEKING';
        creature.ticksInState = 0;
        creature.targetBondId = null;
        return world;
      }
      // Land a chew once per CHEW_INTERVAL_TICKS. `ticksInState` was just
      // incremented (step 3), so the k-th bite lands when ticksInState reaches
      // k × CHEW_INTERVAL_TICKS. Increment-first ordering mirrors the rest of the
      // FSM ("the 60th tick triggers"). The final bite (chewProgress reaching
      // chewHits) does NOT emit CHEW_BITE — main.ts fires the real CREATURE_ATTACK
      // (→ SEVER_BOND) on that tick, and the bond-gone branch above releases the
      // commit next tick.
      if (
        creature.chewProgress < config.chewHits &&
        creature.ticksInState === CHEW_INTERVAL_TICKS * (creature.chewProgress + 1)
      ) {
        creature.chewProgress++;
        if (creature.chewProgress < config.chewHits) {
          // Non-final chew: graphite-dust bite at the bond midpoint. Host-local
          // (NOT wire-mirrored, like BOND_COMMIT/SEVER_ERASE) so it adds no
          // protocol surface — Layer 7 renders it.
          const bond = world.bonds.get(creature.targetBondId);
          if (bond !== undefined) {
            const aPos = bond.a.pos;
            const bPos = bond.b.pos;
            world.effects.push({
              kind: 'CHEW_BITE',
              tick: world.tick,
              pos: { x: (aPos.x + bPos.x) * 0.5, y: (aPos.y + bPos.y) * 0.5 },
              creatureId: creature.id,
            });
          }
        }
      }
    }
    return world;
  }

  // 6b. VOLTKIN (chewHits === 0) — the original ATTACKING → SEEKING bounce,
  //     byte-for-byte. Two exit conditions (Δ4 + blueprint Q9):
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
  //    S100 P1 — cadence/fire ticks now read from config (was VOLTKIN_ATTACK_*
  //    module consts); identical literals for Voltkin (60/30) so byte-identical.
  if (creature.state === 'ATTACKING') {
    // S103 #8 (Council CHECK, Grok) — re-validate the opportunistic creature target EACH ATTACKING
    // tick. main.ts only sets it during SEEKING, so without this a creature that dies / leaves range
    // / stops being an enemy mid-windup would still be "creature-first" at fire time → the zap no-ops
    // on a gone victim AND the still-valid bond goes unsevered (a wasted cycle). Clearing it here lets
    // the attack-fire fall back to the bond. Pure read (distSq) — no RNG; deterministic.
    if (creature.targetCreatureId !== null) {
      const victim = world.creatures.get(creature.targetCreatureId);
      const range = config.attackRange;
      const stillValid =
        victim !== undefined &&
        victim.ownerPlayerId !== creature.ownerPlayerId &&
        distSq(creature.pos, victim.pos) <= range * range;
      if (!stillValid) creature.targetCreatureId = null;
    }
    const cadenceElapsed = creature.ticksInState >= config.attackCadenceTicks;
    // S103 #8 — the wind-up only aborts early when BOTH possible targets are invalid. A Voltkin
    // that entered ATTACKING for a creature-only target (no bond in range) must NOT bounce out
    // before its FIRE_TICK. When no enemy creatures exist `targetCreatureId` is null →
    // `creatureValid` is always false → this reduces to the original bond-only condition (MF4).
    const bondValid = creature.targetBondId !== null && world.bonds.has(creature.targetBondId);
    const creatureValid =
      creature.targetCreatureId !== null && world.creatures.has(creature.targetCreatureId);
    const targetGoneEarly =
      creature.ticksInState <= config.attackFireTick && !bondValid && !creatureValid;
    if (cadenceElapsed || targetGoneEarly) {
      creature.state = 'SEEKING';
      creature.ticksInState = 0;
      creature.targetBondId = null;
      creature.targetCreatureId = null; // S103 #8 — release the opportunistic creature target
    }
  }

  return world;
}
