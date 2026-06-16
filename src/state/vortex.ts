/**
 * SPARK — S89 P6 (G1b): Vortex anchor-pull, the FIRST mechanical magic-combo behavior.
 *
 * "Make the geometry matter" (S86 roadmap). A Vortex (Dot→Spiral) realizes its own table
 * description — "Pulls nearby free sparks toward it (anchor pull)" — which had never been built.
 * Each physics tick the host adds a capped attraction to every FREE spark within VORTEX_PULL_RADIUS
 * of a live Vortex bond's anchor (the midpoint of its two prims).
 *
 * DETERMINISM / 1v1-MIRROR (PRIME-AUDIT A3 + CHECK GROK-ANALYST): pure function of synced state
 * (bond + prim + spark positions); no Math.random / Date.now. HOST-ONLY — stepPhysics is host/solo-
 * gated, so clients NEVER recompute the force (double-application would desync); they mirror the
 * resulting spark positions via the existing NetSnapshot. A spark's pull depends ONLY on its own
 * pos + the anchor SET (not on other sparks), so SPARK iteration order is result-irrelevant. But
 * the per-spark FLOAT SUM over multiple anchors IS order-sensitive (IEEE-754 addition is not
 * associative), so anchors are sorted by bond id into a CANONICAL order before summing — the sum
 * is then reproducible regardless of Map insertion order (the seagull lowest-id determinism
 * convention; closes the CHECK finding that relying on Map order was a latent replay hazard).
 *
 * The pull is a Verlet velocity impulse: velocity = pos − prevPos, so shifting prevPos AGAINST the
 * pull direction increases the toward-anchor velocity. Applied ONCE per tick (like tickCruiserChase);
 * the substep loop's verletStepAll then carries + damps it. A FOULED Vortex (either endpoint pooped)
 * stops pulling until cleaned — consistent with scoring zeroing a fouled structure.
 */

import { VORTEX_PULL_ACCEL, VORTEX_PULL_MIN_DIST, VORTEX_PULL_RADIUS } from '../constants.ts';
import { isVortexCombo } from '../combos.ts';
import type { SparkId } from '../types.ts';
import type { World } from './worldTypes.ts';

const VORTEX_PULL_RADIUS_SQ = VORTEX_PULL_RADIUS * VORTEX_PULL_RADIUS;

/**
 * Host-only, once per physics tick. `attractedId` (the spark the local player is AttractDragging,
 * if any) is skipped so the pull never fights a player's drag. No-op when no live Vortex exists.
 */
export function applyVortexPull(world: World, attractedId: SparkId | null = null): void {
  // 1) Collect Vortex anchor positions. Skip a bond referencing a deleted prim or a fouled
  //    structure (mirrors the scoring skips). Lazily allocate — the overwhelmingly common case
  //    is "no Vortex on the board", which then returns without touching the spark loop.
  let anchors: Array<{ id: number; x: number; y: number }> | null = null;
  for (const bond of world.bonds.values()) {
    const a = world.primitives.get(bond.aId);
    if (a === undefined) continue;
    const b = world.primitives.get(bond.bId);
    if (b === undefined) continue;
    if (!isVortexCombo(a.type, b.type)) continue;
    if (world.fouledPrimitives.has(bond.aId) || world.fouledPrimitives.has(bond.bId)) continue;
    (anchors ??= []).push({
      id: bond.id as number,
      x: (a.pos.x + b.pos.x) / 2,
      y: (a.pos.y + b.pos.y) / 2,
    });
  }
  if (anchors === null) return;
  // CANONICAL ORDER (CHECK GROK-ANALYST): sort by bond id so the per-spark float sum below is
  // computed in the SAME order on every host run / replay, independent of Map insertion order.
  anchors.sort((p, q) => p.id - q.id);

  // 2) For each FREE spark, sum the in-range anchor pulls (ramped by proximity), cap the per-tick
  //    total, and inject it as a Verlet velocity impulse via prevPos.
  // NOTE (final-audit fidelity): the PDR said "spatial-grid-bounded", but a plain O(freeSparks ×
  // anchors) scan is already tightly bounded and NOT worth a grid query here — free sparks are
  // hard-capped at FREE_SPARK_SOFT_CAP (enforceFreeSparkCap every tick) and live Vortex anchors
  // are a handful, so this is ~O(50 × few) per tick. A SpatialGrid lookup would add overhead +
  // its own determinism surface for no measurable win. Justified deviation; revisit only if the
  // free-spark cap is ever raised by an order of magnitude.
  for (const spark of world.freeSparks.values()) {
    if (spark.state.kind !== 'Free') continue; // carried/placed sparks are not free to pull
    if (attractedId !== null && spark.id === attractedId) continue; // don't fight the player's drag
    let px = 0;
    let py = 0;
    for (const anchor of anchors) {
      const dx = anchor.x - spark.pos.x;
      const dy = anchor.y - spark.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > VORTEX_PULL_RADIUS_SQ) continue;
      const dist = Math.sqrt(distSq);
      if (dist < VORTEX_PULL_MIN_DIST) continue; // inside the core — no singular yank/jitter
      // Strength ramps 0 (at the radius edge) → VORTEX_PULL_ACCEL (at the core).
      const strength = VORTEX_PULL_ACCEL * (1 - dist / VORTEX_PULL_RADIUS);
      px += (dx / dist) * strength;
      py += (dy / dist) * strength;
    }
    if (px === 0 && py === 0) continue;
    // Cap the summed per-tick pull so stacked Vortexes can't yank a spark.
    const mag = Math.sqrt(px * px + py * py);
    if (mag > VORTEX_PULL_ACCEL) {
      const s = VORTEX_PULL_ACCEL / mag;
      px *= s;
      py *= s;
    }
    spark.prevPos.x -= px;
    spark.prevPos.y -= py;
  }
}
