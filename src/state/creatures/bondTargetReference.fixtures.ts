/**
 * SPARK — S190 P0 (C5) — THE REFERENCE BOND SCAN. TEST-ONLY. ⛔ Never imported by production code.
 *
 * ## What this is
 *
 * A VERBATIM copy of the structure-target bond scan exactly as it shipped at master 554dbd7 (live
 * deploy #2) — `findNearestBondTarget`, `spreadEnemyTarget`, `structureTargets` and the two private
 * helpers they read, `creatureOwnerColor` and `isEnemyBondWithColor` — taken from
 * `creatureAI.ts` before s190/perf replaced the hot path with a per-tick index. The ONLY edits are:
 *   · names gain a `reference` prefix;
 *   · `structureTargets` takes the live `findNearestEnemyPrimitiveFrom` as a parameter instead of
 *     importing it. That scan is NOT part of the change (it stays one live pass over primitives),
 *     and importing `creatureAI.ts` from here would be circular when a test `vi.mock`s that module
 *     and routes it through this file;
 *   · `distSq` / `bondMidpoint` are copied rather than imported, for the same reason.
 *
 * ## Why it exists
 *
 * s190/perf is a PURE performance change: outputs must be byte-identical. This file is the naive
 * scan the index is proven against — `bondTargetIndex.differential.test.ts` drives the real host
 * tick and asserts, at EVERY scan of EVERY creature, that the indexed code returns what this returns
 * against the same world at the same instant, and that a world run on this reference hashes
 * identically (`hashWorldStateFull`) to a world run on the index.
 *
 * ## ⭐ S191 C-6 — THE ONE BEHAVIOUR CHANGE SINCE, MADE HERE FIRST (as the rule below says)
 *
 * `referenceSpreadEnemyTarget` builds its victims, and scans the chosen victim's bonds, over the
 * STRICT enemy predicate (NEITHER endpoint the owner's colour) — the set the enemy-only nearest scan
 * has used since S162. It used the OR predicate, so a chewer / drone / structure-attacker could be
 * handed a MIXED bond (one endpoint its own seat's), the "my own creature destroys my own tower"
 * chain S162 closed at the nearest step. Merge owner's go: *"C-6 go (spreadEnemyTarget on the STRICT
 * predicate — enforces the owner's S162 rule)"*.
 *
 * ## ⭐⭐ S193 P3-2 (owner) — THE STRUCTURE-ATTACKER GOES TO THE NEAREST ENEMY, NO SPREAD. MADE HERE FIRST.
 *
 * > *"simple creatures should target the nearest enemy spawn right around them first."* — owner, S193
 *
 * `referenceStructureTargets` now takes `referenceNearestStrictEnemyBond` — the strict nearest scan
 * with the spread removed — so an army attacks the enemy beside it, not a hash-chosen victim (with a
 * score-leader slot) across the map. The spread itself is UNCHANGED for the chewer and the drone
 * (`referenceFindNearestBondTarget(…, true)`), which keep their own branches.
 *
 * ## ⚠ IF YOU CHANGE TARGETING *BEHAVIOUR*
 *
 * Change THIS FILE FIRST — it is the readable specification — and then make the index agree. The
 * differential test is what proves they agree. Changing only the index turns that test red, which is
 * the test doing its job; "fixing" the red by editing only this file to match the index is how a
 * behaviour change would slip in unreviewed.
 */
import type { Bond } from '../../physics/bonds.ts';
import { PLAYER_COLORS } from '../../constants.ts';
import type { BondId, PlayerId, PrimitiveId, Vec2 } from '../../types.ts';
import { mix32 } from '../rng.ts';
import type { World } from '../world.ts';
import type { Creature } from './creature.ts';

function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function bondMidpoint(bond: Bond): Vec2 {
  return {
    x: (bond.a.pos.x + bond.b.pos.x) * 0.5,
    y: (bond.a.pos.y + bond.b.pos.y) * 0.5,
  };
}

function creatureOwnerColor(world: World, creature: Creature): number {
  const owner = world.players.get(creature.ownerPlayerId);
  return owner?.color ?? PLAYER_COLORS[creature.ownerPlayerId as unknown as number];
}

function isEnemyBondWithColor(world: World, ownerColor: number, bond: Bond): boolean {
  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return false;
  return primA.placerColor !== ownerColor || primB.placerColor !== ownerColor;
}

export function referenceStructureTargets(
  world: World,
  creature: Creature,
  findNearestEnemyPrimitiveFrom: (world: World, creature: Creature) => PrimitiveId | null,
): { primitiveId: PrimitiveId | null; bondId: BondId | null } {
  const primitiveId = findNearestEnemyPrimitiveFrom(world, creature);
  // ⭐ S193 P3-2 — the NEAREST strict enemy bond, with NO FFA spread (see the file docblock).
  const bondId = referenceNearestStrictEnemyBond(world, creature);
  if (primitiveId === null) return { primitiveId: null, bondId };
  if (bondId === null) return { primitiveId, bondId: null };

  const prim = world.primitives.get(primitiveId);
  const bond = world.bonds.get(bondId);
  if (prim === undefined) return { primitiveId: null, bondId };
  if (bond === undefined) return { primitiveId, bondId: null };

  const mid = bondMidpoint(bond);
  const dPrim = distSq(creature.pos, prim.pos);
  const dBond = distSq(creature.pos, mid);
  return dBond < dPrim
    ? { primitiveId: null, bondId }
    : { primitiveId, bondId: null };
}

/**
 * ⭐ S193 P3-2 — the nearest STRICT enemy bond (neither endpoint the owner's colour), `(distSq, bondId)`,
 * and NOTHING ELSE: no spread, no score leader. This is `referenceFindNearestBondTarget(…, true)` with its
 * final spread line removed — the structure-attacker's bond since the owner's S193 ruling.
 */
export function referenceNearestStrictEnemyBond(world: World, creature: Creature): BondId | null {
  const ownerColor = creatureOwnerColor(world, creature);
  let best: BondId | null = null;
  let bestDistSq = Infinity;
  for (const [bondId, bond] of world.bonds) {
    if (!isEnemyBondWithColor(world, ownerColor, bond)) continue;
    if (world.primitives.get(bond.aId)?.placerColor === ownerColor) continue;
    if (world.primitives.get(bond.bId)?.placerColor === ownerColor) continue;
    const dSq = distSq(creature.pos, bondMidpoint(bond));
    if (dSq < bestDistSq || (dSq === bestDistSq && (best === null || (bondId as unknown as number) < (best as unknown as number)))) {
      bestDistSq = dSq;
      best = bondId;
    }
  }
  return best;
}

export function referenceFindNearestBondTarget(
  world: World,
  creature: Creature,
  enemyOnly: boolean = false,
): BondId | null {
  let bestEnemyId: BondId | null = null;
  let bestEnemyDistSq = Infinity;
  let bestOwnId: BondId | null = null;
  let bestOwnDistSq = Infinity;

  const ownerColor = creatureOwnerColor(world, creature);

  const strictlyEnemy = (bond: { aId: PrimitiveId; bId: PrimitiveId }): boolean =>
    world.primitives.get(bond.aId)?.placerColor !== ownerColor &&
    world.primitives.get(bond.bId)?.placerColor !== ownerColor;

  for (const [bondId, bond] of world.bonds) {
    const mid = bondMidpoint(bond);
    const dSq = distSq(creature.pos, mid);
    if (isEnemyBondWithColor(world, ownerColor, bond) && (!enemyOnly || strictlyEnemy(bond))) {
      if (
        dSq < bestEnemyDistSq ||
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

  if (!enemyOnly) {
    return bestEnemyId ?? bestOwnId;
  }
  if (bestEnemyId === null) return null;
  return referenceSpreadEnemyTarget(world, creature, bestEnemyId);
}

export function referenceSpreadEnemyTarget(world: World, creature: Creature, fallbackEnemyId: BondId): BondId {
  const ownerColor = creatureOwnerColor(world, creature);
  // ⭐ S191 C-6 — the S162 STRICT set: both endpoints exist and neither is the owner's colour.
  const strictlyEnemy = (bond: Bond): boolean => {
    const a = world.primitives.get(bond.aId);
    const b = world.primitives.get(bond.bId);
    return a !== undefined && b !== undefined && a.placerColor !== ownerColor && b.placerColor !== ownerColor;
  };

  const victimSet = new Set<PlayerId>();
  for (const bond of world.bonds.values()) {
    if (!strictlyEnemy(bond)) continue;
    const primA = world.primitives.get(bond.aId);
    if (primA !== undefined) victimSet.add(primA.placedBy);
  }
  if (victimSet.size <= 1) return fallbackEnemyId;

  const victims = Array.from(victimSet).sort(
    (a, b) => (a as unknown as number) - (b as unknown as number),
  );

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
  const n = victims.length;
  const slot = h % (n + 1);
  const chosen: PlayerId = slot === 0 ? leader : victims[(slot - 1) % n];

  let bestId: BondId | null = null;
  let bestDistSq = Infinity;
  for (const [bondId, bond] of world.bonds) {
    if (!strictlyEnemy(bond)) continue; // ⭐ S191 C-6
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
