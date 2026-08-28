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
import { distSq, enemyCastleInReach, engageRange, isWithinAttackRange } from './creatureAI.ts';
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
    // ⚠⚠ S139 P2 — TWO MEASURED BUGS FIXED HERE. Both were silent and neither was type-checkable.
    //
    // (1) THE GATE WAS TYPE-BLIND. It read `c.sourceSpawnerId === null && c.ownerPlayerId === owner`
    //     and returned early — i.e. ONE null-spawner creature per player, of ANY type. The owner's
    //     "each player starts with one goblin of every kind" means several null-spawner creatures per
    //     player, so under the old gate the FIRST free goblin would make every later free-unit spawn
    //     a silent no-op AND would permanently block that player's Voltkin summon for the whole
    //     match. Now scoped per (owner, type), which preserves the original blueprint-Q10 invariant
    //     ("max 1 Voltkin per owner") exactly while letting distinct free units coexist.
    //
    // (2) THE FACTORY IGNORED `action.creatureType`. `makeVoltkinCreature` was called
    //     UNCONDITIONALLY on this branch, so `SPAWN_CREATURE{creatureType:'goblinMelee'}` with no
    //     spawner would have spawned a VOLTKIN. tsc cannot catch that — the field is simply never
    //     read — and no existing test covered it because 'voltkin' was the only value ever passed.
    //
    // The Voltkin path is deliberately left calling `makeVoltkinCreature` verbatim rather than
    // routed through the generic factory, so its construction stays byte-identical and the replay
    // guards (save.replay.test.ts) cannot shift.
    for (const c of world.creatures.values()) {
      if (
        c.sourceSpawnerId === null &&
        c.ownerPlayerId === action.ownerPlayerId &&
        c.type === action.creatureType
      ) {
        return world;
      }
    }
    const id = asCreatureId(world.nextCreatureId++);
    const creature =
      action.creatureType === 'voltkin'
        ? makeVoltkinCreature({
            id,
            ownerPlayerId: action.ownerPlayerId,
            pos: action.pos,
            targetPos: action.targetPos,
            spawnedAtTick: world.tick,
        // S155 P3 — the live match clock; only a `lifetimeClock: 'fight'` creature reads it.
        clock: world,
          })
        : makeCreature(getCreatureConfig(action.creatureType), {
            id,
            ownerPlayerId: action.ownerPlayerId,
            pos: action.pos,
            targetPos: action.targetPos,
            spawnedAtTick: world.tick,
        // S155 P3 — the live match clock; only a `lifetimeClock: 'fight'` creature reads it.
        clock: world,
            sourceSpawnerId: null,
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
        // S155 P3 — the live match clock; only a `lifetimeClock: 'fight'` creature reads it.
        clock: world,
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
        // S155 P3 — the live match clock; only a `lifetimeClock: 'fight'` creature reads it.
        clock: world,
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
export function damageCreature(world: World, creatureId: CreatureId, amountFifths: number): boolean {
  const c = world.creatures.get(creatureId);
  if (c === undefined) return false;
  // S151 P2 — both sides are in FIFTHS: `ehp` is `hp × (5 + def)` and the amount is
  // `atk × (5 + pen)`. Same subtraction that has always been here, on one shared scale.
  c.ehp -= amountFifths;
  if (c.ehp <= 0) {
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
    !config.chewsConnectors &&
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
  // S139 P2 — a STRUCTURE-ATTACKER (goblin) engages when its committed enemy SHAPE is within
  // `attackRange`. `isWithinAttackRange` is bond-specific (it measures to a bond midpoint), so the
  // shape test is written inline against the same squared-distance discipline. Ordered LAST in the
  // condition so every shipped type short-circuits before evaluating it.
  const structureInReach =
    config.targetsStructures &&
    creature.targetPrimitiveId !== null &&
    (() => {
      const prim = world.primitives.get(creature.targetPrimitiveId);
      if (prim === undefined) return false;
      // ⭐ S154 P2 — a STANDOFF fighter engages slightly INSIDE its reach, so `arriveForce` has
      // already braked it by the time ATTACKING switches its steering off. See `engageRange`.
      const reach = engageRange(config);
      return distSq(creature.pos, prim.pos) <= reach * reach;
    })();

  // ⛔ S153 P1 — THE RANGE TEST MOVED INTO THE PREDICATE, AND IT HAD TO.
  //
  // This arm used to read a bare `creature.targetCreatureId !== null`, and the comment above
  // explains why that was safe: the field was *only ever* written by `findNearestEnemyCreature`,
  // which range-gates to this creature's own `attackRange`. The range check therefore lived in the
  // CALLER, as a convention.
  //
  // Owner R83 breaks that convention on purpose. A goblin now acquires a unit at
  // GOBLIN_UNIT_ACQUIRE_RADIUS (220 px) so it can NAVIGATE toward it, which is an order of
  // magnitude beyond any attackRange. Left as-is, this arm would have fired the instant a goblin
  // noticed an enemy 220 px away: enter ATTACKING → step 6b re-validates against attackRange and
  // clears the target → the wind-up aborts → back to SEEKING → re-acquire → repeat, every single
  // tick. A goblin that never walks and never swings, and NOTHING would have gone red for it —
  // the FSM is self-consistent, the determinism gates are self-comparing, and no test asserts
  // "a goblin with a distant enemy keeps walking".
  //
  // So the invariant is restored where it cannot be broken by a caller again. For every shipped
  // type this is BYTE-IDENTICAL: Voltkin/defenders still select within `attackRange`, so a target
  // that was non-null was already in range and `unitInReach` is true exactly when the old test was.
  const unitInReach =
    creature.targetCreatureId !== null &&
    (() => {
      const victim = world.creatures.get(creature.targetCreatureId);
      if (victim === undefined) return false;
      const reach = engageRange(config); // S154 P2 — see the note on the structure arm above
      return distSq(creature.pos, victim.pos) <= reach * reach;
    })();

  /*
   * ⭐ S154 AMENDMENT C (owner A4 / R89) — AND A CASTLE IN REACH IS A REASON TO ENGAGE.
   *
   * Without this arm the strike added in `creatureAttack` is unreachable: a goblin that has walked to
   * the enemy keep has no bond, no unit and no shape in range, so it never leaves SEEKING and the fire
   * tick never comes. That is the "static-parses but never fires" shape S139 P2 records one screen
   * up, and it would have shipped as "the castle takes no damage" — the owner's exact report.
   *
   * Derived from position like the strike itself, so it costs no creature field.
   */
  const castleInReach = enemyCastleInReach(world, creature, engageRange(config)) !== null;

  if (
    creature.state === 'SEEKING' &&
    ((creature.targetBondId !== null && isWithinAttackRange(world, creature, creature.targetBondId)) ||
      unitInReach ||
      structureInReach ||
      castleInReach)
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
  if (config.chewsConnectors) {
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
      // ⭐ S151 P2 (R76) — THE BITE COUNT IS NO LONGER BOUNDED BY THE ATTACKER. It used to stop at
      // `config.chewHits` (5) because that WAS the connector's durability. Now the chewer keeps
      // gnawing on its cadence and the CONNECTOR decides when it gives way — so a loose pair falls
      // fast and a dense structure takes real work. The loop ends via the bond-gone branch above.
      if (creature.ticksInState === CHEW_INTERVAL_TICKS * (creature.chewProgress + 1)) {
        creature.chewProgress++;
        {
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
    // ⭐ S139 P2 — THE THIRD ARM, and the whole reason a real-physics test was mandatory.
    //
    // This is the same amendment S103 #8 made one line above for creature targets, applied to shapes.
    // Without it a goblin was provably broken in a way NO state assertion would reveal: it reached
    // ATTACKING correctly, but `bondValid` and `creatureValid` are both false for a structure
    // attacker, so `targetGoneEarly` was TRUE on every tick from 0..attackFireTick and it bounced
    // straight back to SEEKING before its strike could ever land. Traced live: the unit entered
    // ATTACKING at tick 112 and `ticksInState` was still being reset to 0 at tick 320, with the
    // target shape at full hp the whole time. It closed distance, played the approach, and did
    // literally nothing — the exact "static-parses but never fires" shape as P1's dead dispatcher.
    const primitiveValid =
      creature.targetPrimitiveId !== null && world.primitives.has(creature.targetPrimitiveId);
    /*
     * ⭐ S154 AMENDMENT C — A FOURTH ARM, and the third time this exact trap has been paid for.
     *
     * S103 #8 added `creatureValid`. S139 P2 added `primitiveValid` and wrote down why, in words that
     * describe what the first cut of the CASTLE strike did precisely: *"it reached ATTACKING
     * correctly, but `bondValid` and `creatureValid` are both false for a structure attacker, so
     * `targetGoneEarly` was TRUE on every tick from 0..attackFireTick and it bounced straight back to
     * SEEKING before its strike could ever land."*
     *
     * A goblin hitting a castle has NO bond, NO creature and NO primitive target — the castle is
     * derived from position, deliberately, to avoid a new hashed field. So all three arms were false
     * and it bounced out of ATTACKING on tick 0, forever. TRACED: state alternating ATTACKING/SEEKING
     * with `ticksInState` pinned at 0 across 120 ticks and the castle at full health the whole time.
     *
     * ⚠ THE LESSON, since this is now three for three: adding a new THING TO ATTACK means touching
     * FOUR sites, not one — the engage predicate, the abort predicate HERE, the host-tick fire gate,
     * and the strike. Miss any one and the unit plays a full attack animation that does nothing, with
     * every test green.
     */
    const castleValid = enemyCastleInReach(world, creature, engageRange(config)) !== null;
    const targetGoneEarly =
      creature.ticksInState <= config.attackFireTick &&
      !bondValid &&
      !creatureValid &&
      !primitiveValid &&
      !castleValid;
    /*
     * ⭐ S154 P2 — WHY THERE IS NO "RE-ARM IN PLACE" HERE, THOUGH I BUILT ONE FIRST AND IT MEASURED
     * WORSE.
     *
     * The bounce below looks like the cause of the ranged-standoff creep: on the one SEEKING tick it
     * grants, `computeSteeringAccel` hands out a full `arriveForce` impulse, and `VELOCITY_DAMPING`
     * (0.998 per SUBSTEP) bleeds that off slowly. So the first fix kept a `holdsRange` creature in
     * ATTACKING across cadences, re-arming `ticksInState` instead of leaving the state.
     *
     * A trace of the real host tick showed that made it WORSE — the bat rider ended up 53 px from a
     * shape he is meant to harpoon from 150, against 70 px without the change. The reason is the
     * other half of Δ4: **ZERO_ACCEL means COAST, NOT STOP.** A creature that enters ATTACKING still
     * carrying velocity keeps gliding, and holding it in ATTACKING forever removes the ONLY thing
     * that could ever pull it back out. The bounce is not the bug — with the destination moved onto
     * the standoff ring (`standoffTargetPos`), the bounce is the CORRECTION: each cadence buys one
     * tick of steering toward the ring, which points OUTWARD whenever the unit has drifted inside
     * it. The creep was never the impulse; it was that the impulse aimed at the victim.
     *
     * Recorded because the wrong fix is the intuitive one, and because it was a mechanism I had
     * already reasoned about correctly one paragraph earlier and still got backwards in practice.
     */
    if (cadenceElapsed || targetGoneEarly) {
      creature.state = 'SEEKING';
      creature.ticksInState = 0;
      creature.targetBondId = null;
      creature.targetCreatureId = null; // S103 #8 — release the opportunistic creature target
      // S139 P2 — release the shape commit too. Symmetry matters here: the hostTick structure branch
      // re-selects every SEEKING tick anyway, and leaving a stale id on a creature that has bounced
      // out would keep `primitiveValid` true against a shape it is no longer approaching.
      creature.targetPrimitiveId = null;
    }
  }

  return world;
}
