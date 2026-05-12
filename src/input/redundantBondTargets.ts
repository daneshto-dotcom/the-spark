/**
 * SPARK — pure geometric pickers for multi-endpoint redundant bonds.
 *
 * S15 P1: extracted from controls.ts to satisfy § XV (controls.ts was
 * 565 LOC, 13% over soft charter — S14 PRIME-AUDIT carry-forward).
 * Zero behavior change: same code, same exports, same call site via
 * Controls.redundantBondTargetsInSameComponent thin wrapper.
 *
 * Pure, no side effects, no Pixi/DOM dependency — exported for unit
 * testability without a Pixi Application + DOM mock
 * (S10 #test-via-pure-helper-export pattern; S14 #pure-function-extraction-
 * for-class-method-testability).
 */

import type { PrimitiveId, Vec2 } from '../types.ts';

/**
 * S14 P2.1 — minimal-arc distance between two angles, in radians.
 * Output range [0, π]. Uses the standard `((a-b) + 3π) % 2π - π`
 * normalization then abs to fold negatives → smallest geometric arc.
 */
export function angularDistance(a: number, b: number): number {
  const TWO_PI = 2 * Math.PI;
  const diff = (((a - b) % TWO_PI) + 3 * Math.PI) % TWO_PI - Math.PI;
  return Math.abs(diff);
}

/**
 * S14 P2.1 — pure geometric picker for redundant bond targets. Exported
 * for unit testing without a Pixi Application + DOM mock (S10 pattern).
 *
 * Algorithm:
 *   (1) Sweep `componentIds`, look up each via `primitives`, skip `primary`,
 *       keep if distSq ≤ radius². Capture { id, distSq, angle from
 *       newPrimPos }. Break early at `maxCandidates`.
 *   (2) Sort candidates ascending by distSq (nearest first — tighter
 *       triangles are stiffer + harder to sever per bond-strain physics).
 *   (3) Greedy angular-spread: seed `selectedAngles` with the primary
 *       axis (direction newPrim → primary). For each candidate, accept
 *       iff its angle differs by ≥ (minAngleRad − angleEpsilon) from
 *       every already-selected angle. Stop at k-1 accepted.
 *
 * Returns the accepted PrimitiveIds in selection order (which is also
 * distance-ascending due to step (2)). Empty when no candidate passes.
 *
 * Pure / no side effects. Parameter struct keeps the call site readable
 * and isolates tunables from globals (so tests can vary k, radius, etc.).
 */
export function pickRedundantBondTargets(args: {
  readonly primary: { readonly id: PrimitiveId; readonly pos: Vec2 };
  readonly componentIds: ReadonlySet<PrimitiveId>;
  readonly primitives: ReadonlyMap<PrimitiveId, { readonly pos: Vec2 }>;
  readonly newPrimPos: Vec2;
  readonly radius: number;
  readonly k: number;
  readonly minAngleRad: number;
  readonly angleEpsilon: number;
  readonly maxCandidates: number;
}): PrimitiveId[] {
  if (args.k <= 1) return [];
  if (args.componentIds.size <= 1) return [];

  const r2 = args.radius * args.radius;
  type Cand = { id: PrimitiveId; distSq: number; angle: number };
  const candidates: Cand[] = [];

  for (const id of args.componentIds) {
    if (id === args.primary.id) continue;
    const p = args.primitives.get(id);
    if (p === undefined) continue;
    const dx = p.pos.x - args.newPrimPos.x;
    const dy = p.pos.y - args.newPrimPos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > r2) continue;
    candidates.push({ id, distSq, angle: Math.atan2(dy, dx) });
    if (candidates.length >= args.maxCandidates) break;
  }
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => a.distSq - b.distSq);

  const primaryAngle = Math.atan2(
    args.primary.pos.y - args.newPrimPos.y,
    args.primary.pos.x - args.newPrimPos.x,
  );
  const selectedAngles: number[] = [primaryAngle];
  const selectedIds: PrimitiveId[] = [];

  for (const c of candidates) {
    if (selectedIds.length >= args.k - 1) break;
    let ok = true;
    for (const a of selectedAngles) {
      if (angularDistance(c.angle, a) < args.minAngleRad - args.angleEpsilon) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    selectedIds.push(c.id);
    selectedAngles.push(c.angle);
  }
  return selectedIds;
}
