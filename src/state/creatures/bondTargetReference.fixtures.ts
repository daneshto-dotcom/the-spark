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
  const bondId = referenceFindNearestBondTarget(world, creature, true);
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

  const victimSet = new Set<PlayerId>();
  for (const bond of world.bonds.values()) {
    if (!isEnemyBondWithColor(world, ownerColor, bond)) continue;
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
