/**
 * SPARK — creature AI module (S27 P0). Pure functional helpers for target
 * selection. No mutation; no dispatch. Consumed by `applyCreatureTick`
 * (creatureLifecycle.ts) and the main.ts post-CREATURE_TICK fan-out which
 * re-selects targets every CREATURE_TICK during SEEKING (Council R1 Q3
 * UNANIMOUS A — every-tick re-selection, ~80 prims × 60Hz = 4800 distance
 * checks/s, negligible per blueprint § Performance Budget).
 *
 * Target priority (blueprint Q9 + Q12 LOCKED solo):
 *   1. Nearest ENEMY bond (either endpoint's `placerColor` ≠ creature owner's
 *      player color) — wins if at least one enemy bond exists.
 *   2. Nearest OWN bond (both endpoints' `placerColor` === creature owner's
 *      player color) — fallback when no enemy bonds exist. Q12 LOCKED for
 *      solo mode: "consequence of summoning a godly tax" — encourages
 *      cooldown awareness.
 *   3. `null` when world.bonds is empty — creature stays SEEKING the stub
 *      targetPos until DESPAWNING (no infinite loop, lifecycle still gates).
 *
 * Distance metric: squared distance from creature.pos to bond MIDPOINT (mean
 * of bond.a.pos + bond.b.pos). Pre-squared compare against VOLTKIN_ATTACK_RANGE_SQ
 * avoids sqrt. Tie-break: lowest BondId (deterministic — matters for replay +
 * 1v1 host-determinism per S26 PRIME-AUDIT Δ5 lessons).
 *
 * PRIME-AUDIT Δ2: enemy/own fallback exercised by creatureAI.test.ts covering
 * both 1v1 mode (mixed enemy + own bonds) and solo (own-bonds only).
 *
 * PRIME-AUDIT Δ3: multi-creature target conflict (blueprint Q10 known
 * limitation) — `findNearestBondTarget` is stateless, so two creatures
 * simultaneously in SEEKING with the same nearest enemy bond will BOTH
 * select that bondId. First CREATURE_ATTACK severs; second no-ops on
 * recheck (per applyCreatureAttack defense-in-depth). Acceptable v1 limit.
 */

import type { Bond } from '../../physics/bonds.ts';
import { ARMY_RETREAT_LEAD_TICKS, PLAYER_COLORS } from '../../constants.ts';
import type { StinkCloudId, DefenderId, BondId, CreatureId, PlayerId, PrimitiveId, Vec2 } from '../../types.ts';
import { mix32 } from '../rng.ts';
import type { World } from '../world.ts';
import type { Creature } from './creature.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { getCreatureConfig } from './voltkin-config.ts';

/**
 * S100 P1 (TD Phase 1a) — avalanche-mix two uint32s into one (murmur3-finalizer shape). Used by the
 * chewer FFA target-spread to deterministically bias a chewer toward a particular enemy player keyed
 * on (creatureId, sourceSpawnerId).
 *
 * ⚠ S141 P1 — THE BODY MOVED TO `state/rng.ts` AND THIS IS NOW A RE-EXPORT. It used to be a private
 * copy, byte-identical to a second private copy in `seagulls/seagullLifecycle.ts`, and this
 * docblock cited that sibling as "seagullLifecycle.ts:67" — a line number that had already drifted
 * to :68. Two hand-maintained copies of a hash whose only guarantee of agreement was a stale comment
 * is a silent-desync waiting to happen, so both now delegate to the one exported definition. The
 * math is unchanged, so every existing byte sequence is preserved (§3.2 rule 3).
 */
// (imported at the top of the file — see the `mix32` entry in the import block)

/**
 * Squared distance between two Vec2 points. Avoids sqrt for hot-path compare.
 */
export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Midpoint of a bond — mean of its two endpoint primitive positions. The
 * primitives are accessed via the bond's `a` / `b` PhysicsBody refs (live
 * Verlet bodies — same object identity as `world.primitives.get(aId/bId)`).
 * Returns a NEW Vec2 (caller owns the value).
 */
export function bondMidpoint(bond: Bond): Vec2 {
  return {
    x: (bond.a.pos.x + bond.b.pos.x) * 0.5,
    y: (bond.a.pos.y + bond.b.pos.y) * 0.5,
  };
}

/**
 * Pure check: is this bond "enemy" for the given creature? A bond is enemy if
 * EITHER endpoint primitive's `placerColor` differs from the creature owner's
 * player color (mirrors disruptionManager.ts `canSeverBond` hostile definition
 * at line 69: `isHostile = primA.placerColor !== player.color || primB.placerColor !== player.color`).
 *
 * Returns `false` (own/friendly) when both endpoints share the owner color,
 * OR when either endpoint primitive is missing from the world (treat
 * degenerate bonds as non-enemy so the AI doesn't target zombie state).
 */
export function isEnemyBond(world: World, creature: Creature, bond: Bond): boolean {
  // S75 P3 — read the owner's LIVE colour (single source of truth), NOT the static palette, so
  // creature targeting stays coherent after a rainbow colour-shuffle remaps player.color +
  // prim.placerColor. In normal play player.color === PLAYER_COLORS[seat], so this is behaviour-
  // identical; the palette is only the fallback when the owner is somehow absent. Aligns with how
  // disruptionManager + territory already read player.color live.
  //
  // S100 P1 (TD Phase 1a, Layer 4, §3.4 R7) — the owner/ownerColor resolve is HOISTED into
  // `creatureOwnerColor` so the per-bond callers (findNearestBondTarget / spreadEnemyTarget)
  // can compute it ONCE per creature instead of once per bond. This public single-bond form is
  // behaviour-identical (it just resolves the colour then delegates), so existing call sites +
  // tests stay byte-for-byte.
  return isEnemyBondWithColor(world, creatureOwnerColor(world, creature), bond);
}

/**
 * S100 P1 (TD Phase 1a, Layer 4) — the owner's live colour, hoisted from `isEnemyBond` so the
 * per-bond loops resolve it ONCE per creature (§3.4 R7 perf mitigation). Live `player.color`
 * (post-rainbow-shuffle coherent), palette fallback when the owner is absent.
 */
function creatureOwnerColor(world: World, creature: Creature): number {
  const owner = world.players.get(creature.ownerPlayerId);
  return owner?.color ?? PLAYER_COLORS[creature.ownerPlayerId as unknown as number];
}

/**
 * S100 P1 (TD Phase 1a, Layer 4) — inner per-bond enemy test against a PRE-RESOLVED owner
 * colour. Identical predicate to `isEnemyBond` (either endpoint's placerColor ≠ ownerColor;
 * degenerate/missing-endpoint bonds are non-enemy), but without re-resolving the owner per
 * bond. Used by the hot target-scan loops below.
 */
function isEnemyBondWithColor(world: World, ownerColor: number, bond: Bond): boolean {
  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return false;
  return primA.placerColor !== ownerColor || primB.placerColor !== ownerColor;
}

/**
 * S139 P2 — find the nearest enemy PRIMITIVE for a structure-targeting creature (the goblin).
 *
 * ## Why this is a new sibling rather than a generalisation of the bond scan
 *
 * The owner ruled that goblins target "the nearest enemy primitive with hp". `findNearestBondTarget`
 * cannot be widened to serve that: it is `BondId`-returning and iterates `world.bonds`, and its
 * locomotion/selection output is a REPLAY-EQUIVALENCE GUARD for Voltkin (creatureAI.test.ts,
 * hostTick.differential.test.ts and save.replay.test.ts all pin byte-identical Voltkin behaviour).
 * Refactoring it into a generic scan would perturb that guarded path for zero benefit, so this is a
 * deliberate ~30-line sibling. Same shape, same disciplines:
 *
 * - Owner colour resolved ONCE (`creatureOwnerColor`), then a pure colour compare per primitive —
 *   the §3.4 R7 perf mitigation, not re-resolved in the hot loop.
 * - `placerColor` is the enemy discriminant, matching `isEnemyBondWithColor` exactly. NOT
 *   `ownerColor`: a territory-captured primitive keeps its original allegiance for targeting, which
 *   is the shipped semantics for bonds and must not silently differ for primitives.
 * - Tie-break on the lower `PrimitiveId`, so selection is deterministic across peers regardless of
 *   Map insertion order.
 * - **ENEMY-ONLY, with no own-target fallback.** This is the R8 lesson applied one family over: the
 *   Voltkin's `bestEnemyId ?? bestOwnId` fallback is a *Voltkin feature*, and inheriting it here
 *   would have goblins demolish their own player's shapes the moment no enemy shape existed. With
 *   no enemy primitive this returns null and the goblin idles harmlessly.
 * - `hp > 0` is required, per the owner's phrasing. Belt-and-braces: `damageEntity` already razes a
 *   primitive at hp ≤ 0 so a live zero-hp primitive should not exist, but asserting it here means a
 *   goblin can never commit to a corpse mid-raze.
 *
 * Pure. Does not mutate world or creature.
 */
export function findNearestEnemyPrimitiveFrom(
  world: World,
  creature: Creature,
): PrimitiveId | null {
  let bestId: PrimitiveId | null = null;
  let bestDistSq = Infinity;
  const ownerColor = creatureOwnerColor(world, creature);

  for (const [primId, prim] of world.primitives) {
    if (prim.placerColor === ownerColor) continue; // never your own builder's shapes
    if (prim.hp <= 0) continue;
    const dSq = distSq(creature.pos, prim.pos);
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (primId as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = primId;
    }
  }
  return bestId;
}

/**
 * Find the nearest targetable bond for the creature. Returns the BondId of
 * the nearest enemy bond (priority 1), falling back to the nearest own bond
 * (priority 2) when no enemy bonds exist. Returns `null` when world.bonds is
 * empty.
 *
 * Distance metric: squared distance from `creature.pos` to bond MIDPOINT.
 * Tie-break: lowest BondId numerically (deterministic, replay-safe).
 *
 * Range gate is NOT applied here — caller decides if the resulting target is
 * close enough to enter ATTACKING (via `isWithinAttackRange` below) or should
 * be steered toward (SEEKING continues, targetPos = bondMidpoint).
 *
 * Pure function. Does not mutate world or creature. Called every CREATURE_TICK
 * during SEEKING (host-only) per Council R1 Q3 UNANIMOUS A.
 */
export function findNearestBondTarget(
  world: World,
  creature: Creature,
  enemyOnly: boolean = false,
): BondId | null {
  let bestEnemyId: BondId | null = null;
  let bestEnemyDistSq = Infinity;
  let bestOwnId: BondId | null = null;
  let bestOwnDistSq = Infinity;

  // S100 P1 (TD Phase 1a, Layer 4, §3.4 R7) — resolve the owner colour ONCE, then the
  // per-bond test below is a pure colour compare (no Map.get per bond for the owner).
  const ownerColor = creatureOwnerColor(world, creature);

  /**
   * ⛔ S162 POST-AUDIT — **`isEnemyBondWithColor` IS AN OR, SO A *MIXED* BOND READS AS ENEMY.**
   *
   * S161 fixed exactly this for the drone's SEVER loop, after the owner watched *"my own creature
   * destroy my own tower"*: cutting a connector with one endpoint of your own colour drops your hub
   * star's degree, breaks the recipe, and fires `STRUCTURE_SELFDESTRUCT`. But the fix was applied at
   * the drone's sever and NOT here, so the identical chain stayed reachable through the CHEWER — it
   * could still SELECT a mixed bond, walk to it, and chew it through.
   *
   * Tightening the `enemyOnly` branch closes the chewer AND the drone's target selection at one
   * point, and is an exact AND-tightening of the same predicate rather than a second, disagreeing one.
   *
   * ⭐ VOLTKIN IS DELIBERATELY UNTOUCHED. It passes `enemyOnly: false`, and its ability to cut its
   * own bonds is a documented feature (see the fallback note below), not an oversight.
   */
  const strictlyEnemy = (bond: { aId: PrimitiveId; bId: PrimitiveId }): boolean =>
    world.primitives.get(bond.aId)?.placerColor !== ownerColor &&
    world.primitives.get(bond.bId)?.placerColor !== ownerColor;

  for (const [bondId, bond] of world.bonds) {
    const mid = bondMidpoint(bond);
    const dSq = distSq(creature.pos, mid);
    if (isEnemyBondWithColor(world, ownerColor, bond) && (!enemyOnly || strictlyEnemy(bond))) {
      if (
        dSq < bestEnemyDistSq ||
        // Tie-break: lower BondId wins (deterministic). Map iteration order in
        // V8 is insertion order, so this guarantees consistent selection across
        // multiple equally-close enemies regardless of insertion sequence.
        (dSq === bestEnemyDistSq && (bestEnemyId === null || (bondId as unknown as number) < (bestEnemyId as unknown as number)))
      ) {
        bestEnemyDistSq = dSq;
        bestEnemyId = bondId;
      }
    } else {
      if (
        dSq < bestOwnDistSq ||
        (dSq === bestOwnDistSq && (bestOwnId === null || (bondId as unknown as number) < (bestOwnId as unknown as number)))
      ) {
        bestOwnDistSq = dSq;
        bestOwnId = bondId;
      }
    }
  }

  // S100 P1 (TD Phase 1a) — chewers pass `enemyOnly: true` so they NEVER fall back
  // to the own-bond target (R8: that fallback is a Voltkin feature — without this a
  // chewer with no enemy in range would eat its own spawner). With no enemy bond the
  // chewer returns null and idles/SEEKs harmlessly. The Voltkin default
  // (`enemyOnly: false`) is byte-for-byte unchanged: `bestEnemyId ?? bestOwnId`.
  if (!enemyOnly) {
    return bestEnemyId ?? bestOwnId;
  }
  if (bestEnemyId === null) return null;

  // FFA target-spread (R-design §4.3): with multiple enemy PLAYERS present, bias
  // this chewer toward a particular victim (and toward the score leader) so a swarm
  // fans out across rivals instead of focus-firing the single geometrically-nearest
  // connector (which enables kingmaking). Deterministic — keyed on a stateless
  // mix32 hash of (creatureId, sourceSpawnerId); NO RNG stream, NO wall-clock.
  return spreadEnemyTarget(world, creature, bestEnemyId);
}

/**
 * S100 P1 — FFA target-spread for chewers. `fallbackEnemyId` is the overall-nearest
 * enemy bond (already computed); this picks a preferred victim player deterministically
 * and returns that player's nearest enemy bond, falling back to `fallbackEnemyId` when
 * there is only one enemy player (or the chosen victim somehow has no bond).
 *
 * Determinism: `mix32(creatureId, sourceSpawnerId)` picks among the distinct enemy
 * players (sorted ascending for stable indexing), with the score leader given one extra
 * weighted slot so the swarm leans toward the player in front (reinforces the hunter's
 * catch-up dynamic). Pure read; no mutation, no RNG, no wall-clock.
 */
function spreadEnemyTarget(world: World, creature: Creature, fallbackEnemyId: BondId): BondId {
  // S100 P1 (TD Phase 1a, Layer 4, §3.4 R7) — owner colour resolved once for both scans below.
  const ownerColor = creatureOwnerColor(world, creature);

  // Distinct enemy players that own at least one enemy bond, sorted ascending.
  const victimSet = new Set<PlayerId>();
  for (const bond of world.bonds.values()) {
    if (!isEnemyBondWithColor(world, ownerColor, bond)) continue;
    const primA = world.primitives.get(bond.aId);
    if (primA !== undefined) victimSet.add(primA.placedBy);
  }
  if (victimSet.size <= 1) return fallbackEnemyId; // only one victim → no spread

  const victims = Array.from(victimSet).sort(
    (a, b) => (a as unknown as number) - (b as unknown as number),
  );

  // Score leader among the candidate victims (highest scoreByPlayer; lowest-id
  // tie-break). Given one extra weighted slot below.
  let leader: PlayerId = victims[0];
  let leaderScore = -Infinity;
  for (const v of victims) {
    const s = world.scoreByPlayer.get(v) ?? 0;
    if (s > leaderScore) {
      leaderScore = s;
      leader = v;
    }
  }

  const h = mix32(creature.id as unknown as number, (creature.sourceSpawnerId ?? 0) as unknown as number);
  // N players + 1 leader-bonus slot. Slot 0 → leader; slots 1..N → uniform spread.
  const n = victims.length;
  const slot = h % (n + 1);
  const chosen: PlayerId = slot === 0 ? leader : victims[(slot - 1) % n];

  // Nearest enemy bond owned by the chosen victim (lowest-BondId tie-break).
  let bestId: BondId | null = null;
  let bestDistSq = Infinity;
  for (const [bondId, bond] of world.bonds) {
    if (!isEnemyBondWithColor(world, ownerColor, bond)) continue;
    const primA = world.primitives.get(bond.aId);
    if (primA === undefined || primA.placedBy !== chosen) continue;
    const dSq = distSq(creature.pos, bondMidpoint(bond));
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (bondId as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = bondId;
    }
  }
  return bestId ?? fallbackEnemyId;
}

/**
 * Pure check: is the given bond's midpoint within this creature's PER-TYPE attack
 * range of its current position? Squared compare; no sqrt. Caller fetches the bond
 * from world.bonds (returns false if bond is missing — defense-in-depth for race
 * conditions where the bond severs between target-selection and range-check within
 * the same physics tick).
 *
 * S102 #3 — reads `getCreatureConfig(creature.type).attackRange` instead of the
 * hardcoded `VOLTKIN_ATTACK_RANGE_SQ`. Before this, a chewer engaged at Voltkin's
 * 180 px (it "stood near the structure and chewed from afar"); now it uses the
 * chewer's 35 px so it walks right up to the connector before chewing. Voltkin's
 * config.attackRange is still 180, so its engage distance is byte-identical.
 */
export function isWithinAttackRange(world: World, creature: Creature, bondId: BondId): boolean {
  const bond = world.bonds.get(bondId);
  if (bond === undefined) return false;
  const range = getCreatureConfig(creature.type).attackRange;
  return distSq(creature.pos, bondMidpoint(bond)) <= range * range;
}

/**
 * S103 #8 — the GENERIC nearest-enemy-creature scan, the inverse of `findNearestBondTarget`
 * for the creature population. Returns the `CreatureId` of the nearest LIVE creature owned by
 * a DIFFERENT player than `ownerPlayerId`, within `maxRangeSq` (squared px) of `fromPos`, or
 * `null` if none. This is the ONE shared helper (Council MF7) used by:
 *   - Voltkin (#8) — opportunistic zap of a chewer that wanders within its attackRange;
 *   - the laser turret (P3) + HELGA (P4) — both `Defender`s pick their slap/beam victim with it.
 * That is why it takes a bare `(pos, ownerPlayerId, range)` rather than a `Creature` — a defender
 * is not a creature but targets the same population from the same rule.
 *
 * Determinism (replay + 1v1 host-authority): pure read, no `Math.random` / wall-clock; squared
 * distances (no sqrt); **lowest-`CreatureId` tie-break** on equal distance (V8 Map iteration is
 * insertion order, so the explicit id compare guarantees a stable pick regardless of insert order).
 * `excludeId` lets a creature-caller skip itself (a defender passes `undefined`).
 */
export function findNearestEnemyCreatureFrom(
  world: World,
  fromPos: Vec2,
  ownerPlayerId: PlayerId,
  maxRangeSq: number = Infinity,
  excludeId?: CreatureId,
): CreatureId | null {
  let bestId: CreatureId | null = null;
  let bestDistSq = Infinity;
  for (const [id, c] of world.creatures) {
    if (id === excludeId) continue;
    if (c.ownerPlayerId === ownerPlayerId) continue; // enemy-only
    const dSq = distSq(fromPos, c.pos);
    if (dSq > maxRangeSq) continue; // range gate
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (id as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * S103 #8 — convenience wrapper for a CREATURE attacker (the Voltkin path). Scans for the
 * nearest enemy creature within this creature's PER-TYPE `attackRange` of its own position,
 * excluding itself. Voltkin uses this for the OPPORTUNISTIC in-range zap (Council MF3): it
 * pursues enemy BONDS for navigation and only zaps a creature that is already within its
 * attack range — it never paths toward a distant creature. When no enemy creatures exist this
 * returns `null` and the Voltkin path is byte-identical to pre-S103 (MF4 determinism guard).
 */
export function findNearestEnemyCreature(world: World, creature: Creature): CreatureId | null {
  const range = getCreatureConfig(creature.type).attackRange;
  return findNearestEnemyCreatureFrom(
    world,
    creature.pos,
    creature.ownerPlayerId,
    range * range,
    creature.id,
  );
}


/* ========================================================================== *
 *   S153 P1 — owner R82/R83: unit-first navigation, arrival spread, castle march
 * ========================================================================== */

/**
 * R83 — pick the enemy UNIT a structure-attacker should navigate toward, with hysteresis.
 *
 * ⭐ THE HYSTERESIS NEEDS NO NEW FIELD, AND THAT IS THE WHOLE REASON THIS SHAPE WAS CHOSEN.
 * `held` is the value `creature.targetCreatureId` still carries from LAST tick — the field is
 * already declared, already serialized, already hashed and already cleared on every FSM
 * transition. Enumerating the chain for a genuinely new creature field first (the
 * `targetPrimitiveId` precedent) measured FOURTEEN files and ~45 sites, plus a hashed-state
 * question. Reusing the field that already persists costs zero of that.
 *
 * Returns the unit to chase, or `null` to fall through to the structure target.
 */
export function pickNavUnit(
  world: World,
  creature: Creature,
  held: CreatureId | null,
  acquireRadiusSq: number,
  leashRadiusSq: number,
): CreatureId | null {
  // Hold an existing lock while the quarry stays inside the (wider) leash. This is the branch
  // that kills the 60 Hz pirouette — see GOBLIN_UNIT_LEASH_RADIUS for why the radii differ.
  if (held !== null) {
    const quarry = world.creatures.get(held);
    if (
      quarry !== undefined &&
      quarry.ownerPlayerId !== creature.ownerPlayerId &&
      distSq(creature.pos, quarry.pos) <= leashRadiusSq
    ) {
      return held;
    }
  }
  // No lock, or the quarry died / broke the leash → re-acquire inside the tighter radius.
  return findNearestEnemyCreatureFrom(
    world,
    creature.pos,
    creature.ownerPlayerId,
    acquireRadiusSq,
    creature.id,
  );
}

/**
 * R82 — a per-creature point on a small ring around `target`, so N goblins converging on one
 * shape form a rough arc instead of a single pile.
 *
 * Deterministic by CONSTRUCTION: a pure function of the creature id and nothing else. No draw, no
 * tick, no wall-clock — so it cannot move the RNG stream and cannot diverge between the host and
 * the worker sim. The golden angle keeps successive ids well separated rather than clustering the
 * way `id % k` buckets would.
 */
export function spreadTargetPos(target: Vec2, creatureId: CreatureId, radius: number): Vec2 {
  const GOLDEN_ANGLE = 2.399963229728653; // π(3 − √5)
  const angle = ((creatureId as unknown as number) + 1) * GOLDEN_ANGLE;
  return { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius };
}

/**
 * ⭐ S154 P2 — WHERE A STANDOFF FIGHTER ACTUALLY WANTS TO STAND: on a ring around its victim, not
 * on top of it.
 *
 * ## The bug this closes, and why the obvious fix was not enough
 *
 * A ranged creature was steered straight AT its victim and relied on the FSM to stop it: entering
 * ATTACKING makes `computeSteeringAccel` return `ZERO_ACCEL`. The first fix attempt kept it in
 * ATTACKING across cadences so it never got another acceleration impulse — correct, and still not
 * enough, because **ZERO_ACCEL means COAST, NOT STOP**. `VELOCITY_DAMPING` is 0.998 per substep
 * (≈0.984 per tick), so a unit that spent its whole approach accelerating arrives carrying ~2.8
 * px/tick and glides `v / (1 − 0.984) ≈ 175 px` further before that bleeds away — further than the
 * entire standoff it was supposed to hold. Measured with the real host tick: the bat rider still
 * ended up 18 px from a shape he is meant to harpoon from 150.
 *
 * So the destination itself has to be the ring. `arriveForce` already ramps its force down linearly
 * inside `CREATURE_ARRIVE_RADIUS`, which means a creature aimed at the ring DECELERATES into it and
 * arrives slow — no coast to absorb. That is existing, tested machinery doing the braking, rather
 * than a new velocity clamp bolted onto the physics.
 *
 * ## Why 0.85 of the range and not 1.0
 *
 * The ring has to sit INSIDE `attackRange`, or the creature parks exactly on the boundary where the
 * engage predicate is `<=` and jitters in and out of ATTACKING as the solver nudges it. 0.85 leaves
 * a comfortable band that is still unmistakably a standoff (128 px of the bat's 150, 187 of the
 * archer's 220).
 *
 * PURE: a function of two positions and one constant. No rng, no wall-clock, no world mutation.
 */
export function standoffTargetPos(
  from: Vec2,
  target: Vec2,
  attackRange: number,
  creatureId: CreatureId,
): Vec2 {
  const dx = from.x - target.x;
  const dy = from.y - target.y;
  const ring = attackRange * STANDOFF_RANGE_FRACTION;
  const d = Math.hypot(dx, dy);
  // Degenerate: sitting exactly on the target. Any direction is as good as another, and a FIXED one
  // keeps this deterministic — picking by rng here would desync a replay.
  const base = d < 1e-6 ? 0 : Math.atan2(dy, dx);
  /*
   * ⚠ THE SQUAD SPREAD IS AN ANGLE HERE, NOT AN OFFSET, and that is the whole reason this function
   * takes an id. The goblin branch normally scatters a squad with `spreadTargetPos`, which
   * TRANSLATES the destination by up to GOBLIN_SPREAD_RADIUS (26 px) in a golden-angle direction.
   * Applied to a standoff ring that is only `attackRange × 0.15` inside the engage distance, a
   * translation pointing straight at the victim eats the entire margin and puts the unit back inside
   * the melee band. Rotating ALONG the ring spreads the squad into a firing arc while keeping every
   * member exactly `ring` px from the victim — which is what a line of archers should look like
   * anyway.
   */
  const GOLDEN_ANGLE = 2.399963229728653; // π(3 − √5) — the same idiom as `spreadTargetPos`
  const arc = Math.cos(((creatureId as unknown as number) + 1) * GOLDEN_ANGLE) * STANDOFF_ARC_RAD;
  const angle = base + arc;
  return { x: target.x + Math.cos(angle) * ring, y: target.y + Math.sin(angle) * ring };
}

/**
 * ⭐ S154 AMENDMENT C (owner A4 / R89) — the ENEMY CASTLE this creature is standing close enough to
 * hit, or null.
 *
 * ⛔ ONE DEFINITION, THREE CALLERS, and that is the whole point of extracting it. The castle strike
 * needs the same question answered in three places — the FSM (may I enter ATTACKING?), the host-tick
 * fire gate (is there anything to dispatch?) and the strike itself (what do I hit?) — and S139 P2
 * left a comment one screen away recording what happens when they disagree: a goblin *"would enter
 * ATTACKING, run its whole cadence and never actually hit anything"*. That is exactly what the first
 * cut of this feature did, because the fire gate required a target ID and a castle attacker has none.
 *
 * Derived from POSITION, so it costs no new creature field: `targetCastleSeat` would be new hashed,
 * serialized state needing two edits in `stateHashFull`, where position is already both.
 *
 * PURE. Lowest seat wins ties, so two peers cannot pick different castles.
 */
export function enemyCastleInReach(world: World, creature: Creature, reach: number): PlayerId | null {
  /*
   * ⭐ S157 B5 (owner) — EVERY OFFENSIVE UNIT CAN HIT A CASTLE, not just the shape-attackers.
   *
   * Owner: *"pencil chewers should also target castle (also voltkin and drones and every creature
   * that is offensive to towers (not helga)), instead after all enemy structures are destroyed
   * pencil chewers just stand there idle...."*
   *
   * This one line was half the bug. `targetsStructures` means "attacks SHAPES" — it is false for the
   * chewer, the Voltkin and the drone, all of which attack CONNECTORS instead. Gating the castle on
   * it meant a chewer standing ON the enemy keep could never enter ATTACKING against it, because
   * this function is the sole authority behind all three castle sites (the engage predicate, the
   * abort predicate and the strike). Proven before the fix: `castleInReach — chewer=null
   * voltkin=null drone=null goblin=1`.
   *
   * ⚠ "not helga" needs no clause here: Helga is a DEFENDER, not a creature, and never reaches this
   * function at all.
   */
  let best: PlayerId | null = null;
  for (const seat of world.players.keys()) {
    if (seat === creature.ownerPlayerId) continue;
    const victim = world.players.get(seat);
    if (victim === undefined || victim.castleHp <= 0) continue;
    const a = castleAnchor(seat as unknown as number, world.layout);
    if (distSq(creature.pos, { x: a.x, y: a.y }) > reach * reach) continue;
    if (best === null || (seat as unknown as number) < (best as unknown as number)) best = seat;
  }
  return best;
}

/**
 * ⭐ S158 P7 (CF-S157-c) — **A KILLABLE ENEMY DEFENDER IN REACH — i.e. HELGA.**
 *
 * Owner: she should hold the field *"until she is destroyed herself"*. Something has to be able to
 * destroy her, and the units already walking past her are the obvious candidates.
 *
 * ⚠ `ehp !== null` IS THE WHOLE FILTER, AND IT IS NOT A PROXY — it is the same discriminator the
 * damage arm uses. A tower has `null`, so a goblin can never enter ATTACKING against a turret it
 * cannot hurt, and R75's tower ruling stays untouched. Towers die by recipe-break, as always.
 *
 * Deterministic: LOWEST DEFENDER ID wins ties, mirroring `enemyCastleInReach`'s lowest-seat rule.
 * Nearest-first would be more natural to a player and is deliberately NOT used — a distance
 * comparison between two defenders at equal range would be settled by float noise, and float noise
 * is how a host and its mirror stop agreeing.
 *
 * PURE: reads world, mutates nothing.
 */
export function killableDefenderInReach(
  world: World,
  creature: Creature,
  reach: number,
): DefenderId | null {
  let best: DefenderId | null = null;
  for (const d of world.defenders.values()) {
    if (d.ownerPlayerId === creature.ownerPlayerId) continue; // enemy-only, like every other target
    if (d.ehp === null) continue; // a TOWER — nothing to subtract from, so nothing to attack
    if (distSq(creature.pos, d.pos) > reach * reach) continue;
    if (best === null || (d.id as unknown as number) < (best as unknown as number)) best = d.id;
  }
  return best;
}

/**
 * ⭐ S158 A2 (owner R77) — **AN ENEMY STINK BAG IN REACH.**
 *
 * *"destructible stink bags as entities with aggro and on-destroy damage"*. A bag on the ground is
 * now something a unit can deal with rather than only something it dies in, and this is how a unit
 * finds one it is already standing at.
 *
 * ⚠ REACH IS MEASURED TO THE BAG, NOT TO ITS CLOUD EDGE. A unit inside the smell but out of arm's
 * length has not reached the bag; making the whole radius targetable would let an archer pop bags
 * from outside the thing that makes them dangerous, which removes the trade the owner asked for.
 *
 * Deterministic: LOWEST id wins, mirroring `killableDefenderInReach`.
 *
 * ⚠ S159 P1 — LOWEST ID WINS OUTRIGHT HERE, NOT MERELY ON A TIE, and the previous wording of this
 * line said "wins ties" as though a distance compare ran first. None does: every bag that passes
 * the reach gate is equally hittable from where the unit already stands, so *which* one it swings at
 * is a free choice and the cheapest deterministic answer is the right one. That is exactly why
 * NAVIGATION cannot reuse this function — walking to the lowest-id bag when a nearer one is at your
 * feet would look broken — and why `nearestEnemyStinkCloudWithin` below exists beside it.
 */
export function enemyStinkCloudInReach(
  world: World,
  creature: Creature,
  reach: number,
): StinkCloudId | null {
  let best: StinkCloudId | null = null;
  for (const c of world.stinkClouds.values()) {
    if (c.ownerPlayerId === creature.ownerPlayerId) continue; // enemy-only, like every other target
    if (distSq(creature.pos, c.pos) > reach * reach) continue;
    if (best === null || (c.id as unknown as number) < (best as unknown as number)) best = c.id;
  }
  return best;
}

/**
 * ⭐ S159 P1 (owner R77) — **THE BAG A UNIT SHOULD WALK TO**, i.e. the AGGRO half of
 * *"destructible stink bags as entities with aggro and on-destroy damage"*.
 *
 * NEAREST enemy bag within `radius`, lowest id on a true tie. The difference from
 * `enemyStinkCloudInReach` above is the whole reason both exist: that one answers *"what can I hit
 * from here"*, where any candidate is as good as another, so it takes the cheapest deterministic
 * pick. This one answers *"where do I go"*, where the nearest is the only answer that does not look
 * broken on screen.
 *
 * ⛔ WHY THIS IS A DERIVED SCAN AND NOT A COMMITTED `Creature` FIELD. The obvious build — the one
 * this was carried forward as — is a taunt that writes a new `targetStinkCloudId`, mirroring the
 * depleted tower's taunt (`stinkTower.ts` `stinkAggroTargets`). That tower taunt needs a field
 * because it writes `targetPrimitiveId` and a tower HAS an anchor primitive to point at; a bag is
 * not a primitive, so the shape of the carried-forward plan was a NEW serialized, hashed field on
 * every creature in the game, plus its four wiring sites and a protocol bump.
 *
 * It buys nothing. `Creature.targetPrimitiveId`'s own docblock records the test for when a committed
 * target must be STORED: when several sites must agree on it *within one tick*. For a bag they need
 * not — engagement and the strike both re-derive from position (`creatureLifecycle`'s sixth clause
 * and `creatureAttack`'s bag arm, both shipped in S158 A2 and both taking a reach, not an id), and
 * navigation asks a different question at a different radius. And `GOBLIN_UNIT_LEASH_RADIUS`'s
 * docblock records the test for when a committed target needs HYSTERESIS: when the target MOVES. A
 * bag does not move, and a unit walking toward the nearest bag only makes that bag nearer, so this
 * scan cannot CYCLE — the failure the leash exists to prevent, where a target is picked up and
 * dropped at 60 Hz and the unit pirouettes instead of walking.
 *
 * ⚠ S159 CHECK (GROK-ANALYST) was right that the stronger claim would be false: a moving unit CAN
 * hand off from one bag to another when its path crosses the line equidistant between them. That is
 * not oscillation, it is switching to a genuinely nearer target and then closing on it, and the
 * exact-tie case is settled by the id compare rather than by float noise. `stinkBagAggro.test.ts`
 * pins the tie and asserts the pick is STABLE across the following ticks. Same conclusion the castle march (`enemyCastleMarchPos`) and the castle /
 * princess engagement clauses reached, in their own words: *"derived from position like the strike
 * itself, so it costs no creature field."*
 *
 * Determinism: pure read, no RNG, no wall clock, squared distances (no sqrt), explicit id compare on
 * an exact tie so V8 Map insertion order can never decide it.
 */
export function nearestEnemyStinkCloudWithin(
  world: World,
  creature: Creature,
  radius: number,
): StinkCloudId | null {
  let bestId: StinkCloudId | null = null;
  let bestDistSq = Infinity;
  const r2 = radius * radius;
  for (const c of world.stinkClouds.values()) {
    if (c.ownerPlayerId === creature.ownerPlayerId) continue; // enemy-only, like every other target
    const dSq = distSq(creature.pos, c.pos);
    if (dSq > r2) continue;
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (c.id as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = c.id;
    }
  }
  return bestId;
}

/**
 * ⭐ S154 P4 (owner A3) — WHERE THIS CREATURE'S HOME IS, for the end-of-FIGHT retreat.
 *
 * Two answers, in preference order:
 *   1. **its own tower**, when the creature came out of one — a tower-fed goblin carries
 *      `sourceSpawnerId`, and the spawner names the primitive it is anchored to. This is the one the
 *      owner asked for by name (*"stay near their tower"*);
 *   2. **its own castle**, otherwise. The starter goblins each seat is granted have no spawner, so
 *      without this fallback they would have no home to run to and would keep marching.
 *
 * Returns null only when neither exists, in which case the caller leaves the creature alone rather
 * than steering it at (0,0).
 *
 * PURE: reads world, mutates nothing. No rng, no wall-clock.
 */
export function ownHomePos(world: World, creature: Creature): Vec2 | null {
  if (creature.sourceSpawnerId !== null) {
    const spawner = world.creatureSpawners.get(creature.sourceSpawnerId);
    if (spawner !== undefined) {
      const anchor = world.primitives.get(spawner.anchorPrimitiveId);
      if (anchor !== undefined) return { x: anchor.pos.x, y: anchor.pos.y };
    }
  }
  const seat = creature.ownerPlayerId as unknown as number;
  if (!world.players.has(creature.ownerPlayerId)) return null;
  const a = castleAnchor(seat, world.layout);
  return { x: a.x, y: a.y };
}

/**
 * ⭐ S154 P4 — is the army in its run-home window? True for the last `ARMY_RETREAT_LEAD_TICKS` of a
 * FIGHT. A WINDOW evaluated every tick, never an edge — the `tickGathererShelter` precedent, which
 * documents why: a NONET freeze can skip a whole phase, and an edge test misses it.
 */
export function isRetreatWindow(world: World): boolean {
  return (
    world.matchPhase === 'FIGHT' &&
    world.phaseEndsAtTick - world.tick <= ARMY_RETREAT_LEAD_TICKS
  );
}

/**
 * How far inside `attackRange` a standoff fighter parks (see `standoffTargetPos`), and how far
 * inside it ENGAGES.
 *
 * ⛔ THE TWO NUMBERS MUST DIFFER, AND THE ENGAGE ONE MUST BE THE LARGER. `computeSteeringAccel`
 * returns ZERO_ACCEL the moment a creature enters ATTACKING — no force at all, which means no
 * BRAKING either. So if the FSM engaged at the full `attackRange` the unit would lose its steering
 * while still closing at terminal velocity and coast straight through the ring: measured at 18 px
 * from a shape the bat rider is supposed to harpoon from 150. Engaging just INSIDE the approach,
 * slightly outside the ring, means `arriveForce`'s linear ramp-down has already slowed it to a crawl
 * by the time the steering is switched off, so the residual coast is a few px rather than ~175.
 */
export const STANDOFF_RANGE_FRACTION = 0.8;
/** Where a standoff fighter starts shooting, as a fraction of `attackRange`. See above. */
export const STANDOFF_ENGAGE_FRACTION = 0.9;
/** Half-width of the firing arc a squad spreads across, in radians (~14°). */
export const STANDOFF_ARC_RAD = 0.25;

/**
 * PURE — the distance at which `creature` engages, which is its full `attackRange` unless it is a
 * standoff fighter. One definition, consumed by the FSM's three engage predicates and by the strike
 * re-check, so "how close do I have to be" cannot fork between deciding to shoot and shooting.
 */
export function engageRange(config: { attackRange: number; holdsRange: boolean }): number {
  return config.holdsRange ? config.attackRange * STANDOFF_ENGAGE_FRACTION : config.attackRange;
}

/**
 * R85 (the shipped half) — where a structure-attacker walks when the enemy has NO shapes left.
 *
 * ⛔ A0 F6: there is NO castle entity and no castle HP. `castleBanks` is an inventory Map, and the
 * match is still won on VICTORY POINTS. So this deliberately returns a POSITION and nothing else —
 * goblins march on the enemy keep and mill there menacingly instead of freezing mid-field, which is
 * the half of the owner's point 7 that costs nothing. Making the castle DAMAGEABLE forces a
 * decision about whether the game is still won on points at all, which is the owner's call and its
 * own session (owner ruling D2).
 *
 * Returns `null` in the one case that has no answer: no live enemy seat.
 */
export function enemyCastleMarchPos(world: World, creature: Creature): Vec2 | null {
  let best: Vec2 | null = null;
  let bestDistSq = Infinity;
  let bestSeat = Infinity;
  for (const seat of world.players.keys()) {
    if (seat === creature.ownerPlayerId) continue;
    const anchor = castleAnchor(seat as unknown as number, world.layout);
    const d = distSq(creature.pos, anchor);
    const seatN = seat as unknown as number;
    // Lowest-seat tie-break, matching the lowest-id convention every other selector here uses.
    if (d < bestDistSq || (d === bestDistSq && seatN < bestSeat)) {
      bestDistSq = d;
      bestSeat = seatN;
      best = anchor;
    }
  }
  return best;
}
