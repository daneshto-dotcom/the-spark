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
import type { PlayerId, PrimitiveId } from '../../types.ts';

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
 * ⚠ READ-ONLY, and no isolation test of its own (it is the walk, like the renderer's). The wave
 * census filters it through `isIsolatedVoltkinChain` below, so it counts what would IGNITE.
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

/**
 * ⛔⛔ S192 audit M1 — THE S48 P4 ISOLATION TEST, ONE COPY, SHARED BY IGNITION AND THE WAVE CENSUS.
 *
 * Owner, S48: *"strict 4 squares followed by 4 triangles — if you accidentally connect anything else
 * to the structure it shouldn't go off"*. Moved VERBATIM out of `voltkinPredicate` (S48 P4, Sym G):
 * every chain member must have exactly its in-chain degree (1 at the two ends, 2 in the middle) and
 * every bond it has must land on another member. That rejects an extra shape welded on, a
 * triangulated or loop-closed chain, and a blob with two 8-paths through it.
 *
 * ⭐ MERGE-OWNER DECISION (S192 audit): **A TV RE-SUMMONS IFF IT WOULD IGNITE NOW.** Before this, the
 * census had no isolation test, so a chain that could never ignite summoned every wave and one
 * 12-shape blob counted as two TVs. ⚠ THE CONSEQUENCE, STATED: a TV with an extra shape welded on
 * stops re-summoning, exactly as it would not ignite. (Helga's R190-J revival does survive a weld —
 * the TV deliberately does not, because the TV's recipe is the strict S48 one.)
 */
export function isIsolatedVoltkinChain(world: World, chain: ReadonlyArray<PrimitiveId>): boolean {
  const chainSet = new Set(chain);
  for (let i = 0; i < chain.length; i++) {
    const id = chain[i]!;
    const p = world.primitives.get(id);
    if (p === undefined) return false;
    const expectedDegree = (i === 0 || i === chain.length - 1) ? 1 : 2;
    if (p.bonds.size !== expectedDegree) return false;
    for (const bondId of p.bonds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) continue;
      if (!chainSet.has(otherEndpoint(bond, id))) return false;
    }
  }
  return true;
}

/**
 * ⭐ S192 audit L1 — THE ONE OWNER RULE, for ignition AND the wave census. The player whose colour is
 * on the most members, LOWEST seat id on a tie. With NO member matching any player's colour (the
 * S23 P3 colour-drift case), the lowest-id player. Null only when there are no players.
 *
 * ⚠ THIS CHANGED IGNITION ON A TIE: the predicate used to give a 4/4 TV to whichever colour came
 * first in the chain's walk order (`Map` insertion); it now goes to the lower seat, the same seat
 * the census binds it to, so an ignition Voltkin always holds its own TV at the next edge.
 */
export function voltkinTvOwner(world: World, members: ReadonlyArray<PrimitiveId>): PlayerId | null {
  const players = [...world.players.values()].sort((a, b) => Number(a.id) - Number(b.id));
  if (players.length === 0) return null;
  let best: PlayerId | null = null;
  let bestCount = 0;
  for (const p of players) {
    let n = 0;
    for (const id of members) {
      if (world.primitives.get(id)?.placerColor === p.color) n += 1;
    }
    if (n > bestCount) {
      best = p.id;
      bestCount = n;
    }
  }
  return best ?? players[0]!.id;
}
