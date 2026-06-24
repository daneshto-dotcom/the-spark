/**
 * SPARK — S98 P3: drag-time connection PREVIEW resolution (Pixi-free, pure).
 *
 * Returns EXACTLY the bond(s) a drop at `refPos` would form, so a preview can
 * draw them before release. It calls the SAME host-authoritative pickers the
 * placement reducer uses for its authoritative resolution
 * (placeFromFree → pickHostTargetPrimitive / collectHostMergeCandidates /
 * pickRedundantBondTargets) and mirrors the placePrimitive merge-sweep dedup
 * (one nearest primitive per DISTINCT other same-colour component), so the
 * preview is the same set the release commits — verified by dragPreview.test.ts
 * against the real reducer's pickers. No Pixi/DOM dependency (vitest-testable).
 *
 * Reference position: callers pass the same `targetRefPos` onUp uses
 * (`isClient ? cursor : spark.pos`); on the host/solo path this is exact. On a
 * joiner under snapshot lag the host re-derives authoritatively, so the joiner
 * preview is best-effort (documented) — the host/solo case (the common one) is exact.
 */

import {
  AUTO_BOND_RADIUS,
  REDUNDANT_BOND_ANGLE_EPSILON,
  REDUNDANT_BOND_K,
  REDUNDANT_BOND_MAX_CANDIDATES,
  REDUNDANT_BOND_MIN_ANGLE_RAD,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import { collectHostMergeCandidates, pickHostTargetPrimitive } from '../state/placePrimitive.ts';
import { isInsideEnemyTerritory } from '../state/territory.ts';
import type { World } from '../state/worldTypes.ts';
import type { PlayerId, PrimitiveId, Vec2 } from '../types.ts';
import { pickRedundantBondTargets } from './redundantBondTargets.ts';

export interface PreviewBonds {
  /** The single primary auto-bond target (nearest same-colour ≤ AUTO_BOND_RADIUS), or null (anchor). */
  readonly primaryId: PrimitiveId | null;
  /** Up to K-1 redundancy bonds in the primary's component (angular-spread). */
  readonly redundancyIds: readonly PrimitiveId[];
  /** One nearest primitive per DISTINCT other same-colour component within MERGE_REACH_RADIUS. */
  readonly mergeIds: readonly PrimitiveId[];
}

const EMPTY: PreviewBonds = { primaryId: null, redundancyIds: [], mergeIds: [] };

function insideSpawnerZone(p: Vec2): boolean {
  const dx = p.x - SPAWNER_CENTER_X;
  const dy = p.y - SPAWNER_CENTER_Y;
  return dx * dx + dy * dy <= SPAWNER_RADIUS * SPAWNER_RADIUS;
}

/**
 * Mirror of the placePrimitive merge sweep (Phase 1): one nearest candidate per
 * DISTINCT same-colour connected component within MERGE_REACH_RADIUS, EXCLUDING
 * the primary's component (already joined by the primary bond). Component root
 * key = smallest primitiveId (stable, iteration-order-independent), exactly like
 * the reducer.
 */
function dedupeMergeByComponent(
  world: World,
  refPos: Vec2,
  playerColor: number,
  primaryId: PrimitiveId | null,
): PrimitiveId[] {
  const covered = new Set<PrimitiveId>();
  if (primaryId !== null) {
    const primary = world.primitives.get(primaryId);
    if (primary !== undefined) {
      for (const id of componentOf(primary, world.primitives, world.bonds).primitiveIds) covered.add(id);
    }
  }
  const byComp = new Map<PrimitiveId, { id: PrimitiveId; distSq: number }>();
  for (const candId of collectHostMergeCandidates(world, refPos, playerColor)) {
    if (covered.has(candId)) continue;
    const cand = world.primitives.get(candId);
    if (cand === undefined) continue;
    const comp = componentOf(cand, world.primitives, world.bonds);
    let alreadyCovered = false;
    let rootKey: PrimitiveId | null = null;
    for (const id of comp.primitiveIds) {
      if (covered.has(id)) { alreadyCovered = true; break; }
      if (rootKey === null || id < rootKey) rootKey = id;
    }
    if (alreadyCovered || rootKey === null) continue;
    const dx = cand.pos.x - refPos.x;
    const dy = cand.pos.y - refPos.y;
    const distSq = dx * dx + dy * dy;
    const existing = byComp.get(rootKey);
    if (existing === undefined || distSq < existing.distSq) byComp.set(rootKey, { id: candId, distSq });
  }
  return [...byComp.values()].map((v) => v.id);
}

/**
 * The exact bond set a drop at `refPos` would form for `playerColor`. Returns
 * EMPTY when a release gate would reject the placement: when `gateLocally` (host/
 * solo), a drop inside the spawner zone or inside enemy territory commits nothing,
 * so the preview must show nothing rather than phantom bonds. (The reach gate is
 * moot for the preview: refPos IS where the spark sits.)
 */
export function computePreviewBonds(
  world: World,
  refPos: Vec2,
  playerId: PlayerId,
  playerColor: number,
  gateLocally: boolean,
): PreviewBonds {
  if (gateLocally && (insideSpawnerZone(refPos) || isInsideEnemyTerritory(refPos, playerId, world))) {
    return EMPTY;
  }
  const primaryId = pickHostTargetPrimitive(world, refPos, playerColor);
  let redundancyIds: PrimitiveId[] = [];
  if (primaryId !== null) {
    const primary = world.primitives.get(primaryId);
    if (primary !== undefined) {
      const comp = componentOf(primary, world.primitives, world.bonds);
      if (comp.primitiveIds.size > 1) {
        redundancyIds = pickRedundantBondTargets({
          primary: { id: primary.id, pos: primary.pos },
          componentIds: comp.primitiveIds,
          primitives: world.primitives,
          newPrimPos: refPos,
          radius: AUTO_BOND_RADIUS,
          k: REDUNDANT_BOND_K,
          minAngleRad: REDUNDANT_BOND_MIN_ANGLE_RAD,
          angleEpsilon: REDUNDANT_BOND_ANGLE_EPSILON,
          maxCandidates: REDUNDANT_BOND_MAX_CANDIDATES,
        });
      }
    }
  }
  const mergeIds = dedupeMergeByComponent(world, refPos, playerColor, primaryId);
  return { primaryId, redundancyIds, mergeIds };
}
