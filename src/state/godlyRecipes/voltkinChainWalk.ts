/**
 * SPARK — S192 T16: the Voltkin chain WALK, as a side-effect-free leaf.
 *
 * ⛔ THIS FILE CALLS NO `registerRecipe` AND MUST NEVER IMPORT ONE THAT DOES. It exists so the sim's
 * per-wave TV census (`state/voltkinTv.ts`, run from `hostTick`'s FIGHT→BUILD edge) can share the ONE
 * DFS that `godlyRecipes/voltkin.ts` uses for the matcher and the renderer, without hostTick pulling
 * the recipe registry in as an import side effect (the S166 hot-path rule, stated at hostTick's
 * `raceTowerIds.ts` import). The code below moved VERBATIM out of `voltkin.ts`; the only addition is
 * the `canonical` flag, which defaults off so every pre-existing caller walks exactly as before.
 */

import { SparkType } from '../../constants.ts';
import type { World } from '../world.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { PrimitiveId } from '../../types.ts';

export const EXPECTED_CHAIN: ReadonlyArray<SparkType> = [
  SparkType.Square,
  SparkType.Square,
  SparkType.Square,
  SparkType.Square,
  SparkType.Triangle,
  SparkType.Triangle,
  SparkType.Triangle,
  SparkType.Triangle,
];

export function otherEndpoint(bond: Bond, id: PrimitiveId): PrimitiveId {
  return bond.aId === id ? bond.bId : bond.aId;
}

/**
 * The shared DFS. Extracted in S175 P4a so `findVoltkinChain` and `findAllVoltkinChains` cannot
 * drift apart — this codebase's recurring defect is two copies of one rule, and a renderer that
 * disagreed with the matcher about what a Voltkin chain IS would draw a TV over shapes that never
 * fire, or leave a fired chain bare.
 *
 * ⭐ S192 T16 — `canonical` walks each primitive's bonds in ascending bond id instead of `Set`
 * insertion order. Only the sim-side census asks for it; the matcher and the renderer keep the
 * insertion-order walk they have always had, byte-identical.
 */
export function walkChain(
  world: World,
  currentId: PrimitiveId,
  nextDepth: number,
  visited: Set<PrimitiveId>,
  path: PrimitiveId[],
  canonical = false,
): PrimitiveId[] | null {
  if (nextDepth === EXPECTED_CHAIN.length) return [...path];
  const current = world.primitives.get(currentId);
  if (current === undefined) return null;
  const expected = EXPECTED_CHAIN[nextDepth];
  const bondIds = canonical
    ? [...current.bonds].sort((a, b) => Number(a) - Number(b))
    : current.bonds;
  for (const bondId of bondIds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    const otherId = otherEndpoint(bond, currentId);
    if (visited.has(otherId)) continue;
    const other = world.primitives.get(otherId);
    if (other === undefined) continue;
    if (other.type !== expected) continue;
    visited.add(otherId);
    path.push(otherId);
    const result = walkChain(world, otherId, nextDepth + 1, visited, path, canonical);
    if (result !== null) return result;
    visited.delete(otherId);
    path.pop();
  }
  return null;
}

/**
 * ⭐⭐ S192 T16 — EVERY standing Voltkin chain, in a TOTAL ORDER the sim may act on.
 *
 * `findAllVoltkinChains` (`voltkin.ts`) is the renderer's: it walks `world.primitives` and each
 * primitive's `bonds` in `Map`/`Set` insertion order, which a save round-trip (the worker INIT, a
 * successor's restore) is not guaranteed to preserve. On an exotic lattice with two valid 8-paths
 * from one start, that order picks WHICH eight primitives come back — harmless for a sprite, a
 * divergence for a rule that mints creatures. This is the same DFS with the start ids and every
 * bond list sorted ascending, de-duplicated by member set exactly as the renderer's is, and returned
 * sorted by that member set (ascending ids, compared element by element).
 *
 * ⚠ READ-ONLY, and NO isolation test, like the renderer's: what is DRAWN as a TV is what is counted.
 */
export function findAllVoltkinChainsCanonical(world: World): ReadonlyArray<ReadonlyArray<PrimitiveId>> {
  const starts: PrimitiveId[] = [];
  for (const prim of world.primitives.values()) {
    if (prim.type === EXPECTED_CHAIN[0]) starts.push(prim.id);
  }
  starts.sort((a, b) => Number(a) - Number(b));
  const found: Array<{ key: number[]; path: PrimitiveId[] }> = [];
  const seen = new Set<string>();
  for (const startId of starts) {
    const visited = new Set<PrimitiveId>([startId]);
    const result = walkChain(world, startId, 1, visited, [startId], true);
    if (result === null) continue;
    const key = result.map(Number).sort((a, b) => a - b);
    const keyStr = key.join(',');
    if (seen.has(keyStr)) continue;
    seen.add(keyStr);
    found.push({ key, path: result });
  }
  found.sort((x, y) => {
    for (let i = 0; i < x.key.length; i++) {
      if (x.key[i] !== y.key[i]) return x.key[i]! - y.key[i]!;
    }
    return 0;
  });
  return found.map((f) => f.path);
}
