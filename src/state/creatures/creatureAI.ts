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
import { PLAYER_COLORS } from '../../constants.ts';
import type { BondId, PlayerId, Vec2 } from '../../types.ts';
import type { World } from '../world.ts';
import type { Creature } from './creature.ts';
import { VOLTKIN_ATTACK_RANGE_SQ } from './creature.ts';

/**
 * S100 P1 (TD Phase 1a) — avalanche-mix two uint32s into one (murmur3-finalizer
 * shape; identical to the seagull `mix32` idiom at seagullLifecycle.ts:67). Pure +
 * branchless; consumes NO RNG stream and reads NO wall-clock, so the existing
 * spark/bomb/potato/rainbow/seagull byte sequences stay byte-identical (§3.2 rule 3).
 * Used by the chewer FFA target-spread to deterministically bias a chewer toward a
 * particular enemy player keyed on (creatureId, sourceSpawnerId).
 */
function mix32(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b9) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

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

  for (const [bondId, bond] of world.bonds) {
    const mid = bondMidpoint(bond);
    const dSq = distSq(creature.pos, mid);
    if (isEnemyBondWithColor(world, ownerColor, bond)) {
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
 * Pure check: is the given bond's midpoint within VOLTKIN_ATTACK_RANGE of the
 * creature's current position? Squared compare; no sqrt. Caller fetches the
 * bond from world.bonds (returns false if bond is missing — defense-in-depth
 * for race conditions where the bond severs between target-selection and
 * range-check within the same physics tick).
 */
export function isWithinAttackRange(world: World, creature: Creature, bondId: BondId): boolean {
  const bond = world.bonds.get(bondId);
  if (bond === undefined) return false;
  return distSq(creature.pos, bondMidpoint(bond)) <= VOLTKIN_ATTACK_RANGE_SQ;
}
