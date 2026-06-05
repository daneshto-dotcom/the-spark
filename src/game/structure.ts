/**
 * SPARK — connected-component bookkeeping for placed primitives.
 * Session 2: minimal — bond list + adjacency on each Primitive.
 * Session 3: BFS sever (§ VIII.4) lives here too.
 *
 * A "Structure" is the connected component a primitive belongs to. We
 * compute it on demand via BFS over Primitive.bonds — no persistent
 * Structure object until we need one for area-claim caching (Session 4).
 */

import type { Bond } from '../physics/bonds.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import type { Primitive } from './primitive.ts';

export interface Structure {
  readonly primitiveIds: ReadonlySet<PrimitiveId>;
  readonly bondIds: ReadonlySet<BondId>;
}

/** BFS over bond adjacency starting from `seed`. */
export function componentOf(
  seed: Primitive,
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
  bonds: ReadonlyMap<BondId, Bond>,
): Structure {
  const seenPrim = new Set<PrimitiveId>([seed.id]);
  const seenBond = new Set<BondId>();
  const queue: Primitive[] = [seed];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const bondId of cur.bonds) {
      if (seenBond.has(bondId)) continue;
      const bond = bonds.get(bondId);
      if (bond === undefined) continue;
      seenBond.add(bondId);
      // Bond.a / Bond.b are PhysicsBody; we treat them as Primitives via
      // the PrimitiveId fields stored as a/b proxy. See world.makeBond.
      const otherId = bond.aId === cur.id ? bond.bId : bond.aId;
      if (seenPrim.has(otherId)) continue;
      const other = primitives.get(otherId);
      if (other === undefined) continue;
      seenPrim.add(otherId);
      queue.push(other);
    }
  }
  return { primitiveIds: seenPrim, bondIds: seenBond };
}

/**
 * S10 P2: BFS from `seed` returning per-primitive and per-bond hop
 * distances from the seed. Used by STRUCTURE_GROW to time the outward
 * pulse: each primitive flashes at `hop * HOP_TICKS`; each bond at
 * `max(a-hop, b-hop) * HOP_TICKS` so the highlight reaches the bond once
 * both endpoints have lit. Hop 0 = seed; only primitives reachable
 * through bonds are included (single-anchor placements yield {seed: 0}
 * and an empty bond map).
 */
export function bfsHopMap(
  seed: Primitive,
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
  bonds: ReadonlyMap<BondId, Bond>,
): {
  hopByPrimId: Map<PrimitiveId, number>;
  hopByBondId: Map<BondId, number>;
  maxHop: number;
} {
  const hopByPrimId = new Map<PrimitiveId, number>([[seed.id, 0]]);
  const hopByBondId = new Map<BondId, number>();
  const queue: Primitive[] = [seed];
  let maxHop = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curHop = hopByPrimId.get(cur.id)!;
    for (const bondId of cur.bonds) {
      const bond = bonds.get(bondId);
      if (bond === undefined) continue;
      const otherId = bond.aId === cur.id ? bond.bId : bond.aId;
      const other = primitives.get(otherId);
      if (other === undefined) continue;
      if (!hopByPrimId.has(otherId)) {
        const nextHop = curHop + 1;
        hopByPrimId.set(otherId, nextHop);
        if (nextHop > maxHop) maxHop = nextHop;
        queue.push(other);
      }
      const otherHop = hopByPrimId.get(otherId)!;
      const bondHop = Math.max(curHop, otherHop);
      const prev = hopByBondId.get(bondId);
      if (prev === undefined || prev < bondHop) {
        hopByBondId.set(bondId, bondHop);
      }
    }
  }
  return { hopByPrimId, hopByBondId, maxHop };
}

/**
 * § VIII.4 LOCKED — sever rule.
 * Cut `bond`, BFS each side excluding the cut bond. If both sides remain
 * connected (the bond was on a cycle), keep everything. Otherwise the
 * smaller side erases. Tie on size → side with the greater max(createdTick)
 * loses (the newer construction is the one that gets cut away).
 *
 * Returns the primitive IDs to keep and to delete, plus the bond IDs that
 * belonged to the deleted side (caller cleans those up too).
 */
export function severSplit(
  bond: Bond,
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
  bonds: ReadonlyMap<BondId, Bond>,
): { keep: ReadonlySet<PrimitiveId>; del: ReadonlySet<PrimitiveId>; delBonds: ReadonlySet<BondId> } {
  const a = primitives.get(bond.aId);
  const b = primitives.get(bond.bId);
  if (a === undefined || b === undefined) {
    return { keep: new Set(), del: new Set(), delBonds: new Set() };
  }

  const sideA = bfsExcluding(a, bond.id, primitives, bonds);
  // If sideA reached b, the cut was on a cycle — both sides are still
  // connected; nothing to delete.
  if (sideA.primIds.has(b.id)) {
    return { keep: sideA.primIds, del: new Set(), delBonds: new Set() };
  }
  const sideB = bfsExcluding(b, bond.id, primitives, bonds);

  // Single-primitive limb always loses — naturally the smaller side.
  let smaller = sideA, larger = sideB;
  if (sideB.primIds.size < sideA.primIds.size) {
    smaller = sideB; larger = sideA;
  } else if (sideA.primIds.size === sideB.primIds.size) {
    const aMax = maxTick(sideA.primIds, primitives);
    const bMax = maxTick(sideB.primIds, primitives);
    if (aMax > bMax) { smaller = sideA; larger = sideB; }
    else { smaller = sideB; larger = sideA; }
  }
  return { keep: larger.primIds, del: smaller.primIds, delBonds: smaller.bondIds };
}

function bfsExcluding(
  seed: Primitive,
  excludeBondId: BondId,
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
  bonds: ReadonlyMap<BondId, Bond>,
): { primIds: Set<PrimitiveId>; bondIds: Set<BondId> } {
  const primIds = new Set<PrimitiveId>([seed.id]);
  const bondIds = new Set<BondId>();
  const queue: Primitive[] = [seed];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const bondId of cur.bonds) {
      if (bondId === excludeBondId) continue;
      if (bondIds.has(bondId)) continue;
      const bond = bonds.get(bondId);
      if (bond === undefined) continue;
      bondIds.add(bondId);
      const otherId = bond.aId === cur.id ? bond.bId : bond.aId;
      if (primIds.has(otherId)) continue;
      const other = primitives.get(otherId);
      if (other === undefined) continue;
      primIds.add(otherId);
      queue.push(other);
    }
  }
  return { primIds, bondIds };
}

function maxTick(
  primIds: ReadonlySet<PrimitiveId>,
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
): number {
  let m = -Infinity;
  for (const id of primIds) {
    const p = primitives.get(id);
    if (p !== undefined && p.createdTick > m) m = p.createdTick;
  }
  return m;
}
