/**
 * SPARK — S115 P1 (G2-PROMO Phase-2): ANCHOR "planted joint", a territorial-rigidity magic-combo behavior.
 *
 * "Make the geometry matter" (S86 roadmap). The Anchor (Dot→Square) was promoted to magic in S91
 * (distinct silhouette + the 8× income premium) but had NO mechanic — its table description, "a grounded,
 * anchored joint", was paint. This realizes it against the ACTUAL engine.
 *
 * WHY THIS MECHANISM (not a velocity damp): placed primitives are NOT free-integrated — verletStepAll
 * steps only world.freeSparks; resolveCollisions is spark-only; a placed structure is held purely by the
 * solveBonds distance constraints. So a structure has no free momentum to damp, and hazards ERASE prims
 * (applyRadialClear) or SEVER bonds rather than shove them. The one real source of structural instability
 * is the S49 territorial engulf-warp: computeTerritorialInfluence (territory.ts) resets every bond's
 * stiffnessMultiplier to 1.0 then degrades enemy bonds inside hostile territory to TERRITORY_ENGULF_-
 * STIFFNESS (0.3), which drives a LOW-tier bond's EFFECTIVE stiffness to ~0.06 — the roadmap's
 * acknowledged "structures feel floppy in enemy territory" weakness.
 *
 * applyAnchorStabilize runs ONCE per physics tick AFTER that pass and BEFORE the substep solveBonds loop,
 * flooring each live, un-fouled Anchor bond's multiplier back up to ANCHOR_STIFFNESS_FLOOR. An anchored
 * structure therefore stays rigid/planted in contested ground where a normal structure sags — a distinct
 * "anchor" identity (vs Diamond/Lattice's sever-cost resist, vs Vortex/Spindle's free-spark forces). In
 * solo / outside enemy territory the multiplier is already 1.0, so the floor is a no-op (Anchor's benefit
 * surfaces exactly where "planted" matters: networked/bots contested territory).
 *
 * DETERMINISM / 1v1-MIRROR (PRIME-AUDIT): pure function of synced state (each bond's endpoint combo type
 * + the fouled set); no Math.random / Date.now. HOST-ONLY — runs inside stepPhysics (host/solo-gated), so
 * clients never recompute it; they mirror the resulting primitive positions via NetSnapshot. The floor is
 * a per-bond idempotent max() depending ONLY on that bond, so bond iteration order is result-IRRELEVANT
 * (no cross-bond accumulation — stronger than the Vortex per-spark float sum, which needed a canonical
 * sort). stiffnessMultiplier is an ephemeral per-tick derived quantity (NOT serialized — save.ts skips
 * it), so this adds ZERO wire/save bytes and replay stays byte-identical by construction. A FOULED Anchor
 * (either endpoint pooped) stops resisting until cleaned, consistent with scoring zeroing a fouled
 * structure + the Vortex fouled-skip.
 */

import { ANCHOR_STIFFNESS_FLOOR } from '../constants.ts';
import { isAnchorCombo } from '../combos.ts';
import type { World } from './worldTypes.ts';

/**
 * Host-only, once per physics tick — AFTER computeTerritorialInfluence (which sets the multiplier) and
 * BEFORE the substep solveBonds loop (so all 8 substeps see the floored value). No-op when no live Anchor
 * exists or when no Anchor is inside enemy territory (its multiplier already ≥ the floor).
 */
export function applyAnchorStabilize(world: World): void {
  for (const bond of world.bonds.values()) {
    const a = world.primitives.get(bond.aId);
    if (a === undefined) continue;
    const b = world.primitives.get(bond.bId);
    if (b === undefined) continue;
    if (!isAnchorCombo(a.type, b.type)) continue;
    // A poop-fouled structure stops generating income (scoring) AND stops its behaviors (Vortex) — an
    // Anchor likewise stops planting until cleaned.
    if (world.fouledPrimitives.has(bond.aId) || world.fouledPrimitives.has(bond.bId)) continue;
    // Floor, never lower: an Anchor outside enemy territory keeps its nominal 1.0; only a sagged
    // (territorially-degraded) Anchor bond is lifted back toward rigidity.
    if ((bond.stiffnessMultiplier ?? 1.0) < ANCHOR_STIFFNESS_FLOOR) {
      bond.stiffnessMultiplier = ANCHOR_STIFFNESS_FLOOR;
    }
  }
}
