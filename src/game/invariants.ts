/**
 * SPARK — runtime invariant guards (DEV-only).
 * § 11 LOCKED — these checks pair with the type-level invariants:
 *
 *   - Structure immobility: a primitive with `bonds.size === 0` must not
 *     move tick-over-tick. The bond solver only mutates pos when bonds
 *     exist; nothing else should. We snapshot unbonded primitive positions
 *     before each tick and verify they're unchanged afterwards.
 *
 *   - Finite positions: NaN/Infinity in any pos is a hard fail (Verlet
 *     blow-up, divide-by-zero, integer overflow). Catch it the tick it
 *     happens, not five seconds later when everything has drifted.
 *
 *   - Color inheritance (Phase 1 only): ownerColor must equal placerColor.
 *     Phase 2 Steal disruption will relax this.
 *
 * All checks are gated by `import.meta.env.DEV` at call sites — zero cost
 * in production builds.
 */

import type { PrimitiveId, SparkId, Vec2 } from '../types.ts';
import type { Spark } from './spark.ts';
import type { Primitive } from './primitive.ts';

const IMMOBILITY_EPSILON = 1e-6;

export type InvariantViolation =
  | { readonly kind: 'immobility'; readonly primitiveId: PrimitiveId; readonly drift: number }
  | { readonly kind: 'nonfinite-primitive'; readonly primitiveId: PrimitiveId; readonly pos: Vec2 }
  | { readonly kind: 'nonfinite-spark'; readonly sparkId: SparkId; readonly pos: Vec2 }
  | { readonly kind: 'color-inheritance'; readonly primitiveId: PrimitiveId; readonly placer: number; readonly owner: number };

export interface InvariantSnapshot {
  /** Map of unbonded primitive id → its position at snapshot time. */
  readonly unbondedPositions: ReadonlyMap<PrimitiveId, Vec2>;
}

/** Capture pre-tick state for the immobility check. */
export function snapshotInvariants(
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
): InvariantSnapshot {
  const unbondedPositions = new Map<PrimitiveId, Vec2>();
  for (const p of primitives.values()) {
    if (p.bonds.size === 0) {
      unbondedPositions.set(p.id, { x: p.pos.x, y: p.pos.y });
    }
  }
  return { unbondedPositions };
}

/**
 * Verify post-tick that no invariant is broken. Returns an empty array on
 * success. Caller decides what to do with violations (typically log to
 * console.error in DEV).
 */
export function verifyInvariants(
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
  freeSparks: ReadonlyMap<SparkId, Spark>,
  snap: InvariantSnapshot,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // Immobility — only flag primitives that were unbonded at snapshot AND
  // are still unbonded now. A primitive that gained a bond mid-tick is
  // legitimately moved by the solver. A primitive that lost its last bond
  // mid-tick is handled by snapPrevPosForUnbonded() in dispatch (P12).
  for (const [id, prevPos] of snap.unbondedPositions) {
    const p = primitives.get(id);
    if (p === undefined) continue; // severed/deleted — fine
    if (p.bonds.size > 0) continue; // gained bond this tick — solver moved it
    const dx = p.pos.x - prevPos.x;
    const dy = p.pos.y - prevPos.y;
    if (Math.abs(dx) > IMMOBILITY_EPSILON || Math.abs(dy) > IMMOBILITY_EPSILON) {
      violations.push({
        kind: 'immobility',
        primitiveId: id,
        drift: Math.hypot(dx, dy),
      });
    }
  }

  // Finite positions — primitives.
  for (const p of primitives.values()) {
    if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y)) {
      violations.push({
        kind: 'nonfinite-primitive',
        primitiveId: p.id,
        pos: { x: p.pos.x, y: p.pos.y },
      });
    }
    // Phase 1 color-inheritance.
    if (p.ownerColor !== p.placerColor) {
      violations.push({
        kind: 'color-inheritance',
        primitiveId: p.id,
        placer: p.placerColor,
        owner: p.ownerColor,
      });
    }
  }

  // Finite positions — sparks.
  for (const s of freeSparks.values()) {
    if (!Number.isFinite(s.pos.x) || !Number.isFinite(s.pos.y)) {
      violations.push({
        kind: 'nonfinite-spark',
        sparkId: s.id,
        pos: { x: s.pos.x, y: s.pos.y },
      });
    }
  }

  return violations;
}

/**
 * After SEVER_BOND or any path that drops a primitive's last bond, call this
 * to keep the immobility invariant clean. The bond solver mutated pos but
 * never prevPos; without this snap, the next tick's immobility guard would
 * (correctly!) flag the residual drift as a violation even though it's
 * inert — caller-fault, not solver-fault. Snapping makes prevPos catch up.
 */
export function snapPrevPosForUnbonded(
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
): void {
  for (const p of primitives.values()) {
    if (p.bonds.size === 0) {
      p.prevPos.x = p.pos.x;
      p.prevPos.y = p.pos.y;
    }
  }
}
