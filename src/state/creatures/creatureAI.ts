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
import type { BondId, Vec2 } from '../../types.ts';
import type { World } from '../world.ts';
import type { Creature } from './creature.ts';
import { VOLTKIN_ATTACK_RANGE_SQ } from './creature.ts';

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
  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return false;
  // S75 P3 — read the owner's LIVE colour (single source of truth), NOT the static palette, so
  // creature targeting stays coherent after a rainbow colour-shuffle remaps player.color +
  // prim.placerColor. In normal play player.color === PLAYER_COLORS[seat], so this is behaviour-
  // identical; the palette is only the fallback when the owner is somehow absent. Aligns with how
  // disruptionManager + territory already read player.color live.
  const owner = world.players.get(creature.ownerPlayerId);
  const ownerColor = owner?.color ?? PLAYER_COLORS[creature.ownerPlayerId as unknown as number];
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
export function findNearestBondTarget(world: World, creature: Creature): BondId | null {
  let bestEnemyId: BondId | null = null;
  let bestEnemyDistSq = Infinity;
  let bestOwnId: BondId | null = null;
  let bestOwnDistSq = Infinity;

  for (const [bondId, bond] of world.bonds) {
    const mid = bondMidpoint(bond);
    const dSq = distSq(creature.pos, mid);
    if (isEnemyBond(world, creature, bond)) {
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

  return bestEnemyId ?? bestOwnId;
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
