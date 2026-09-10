/**
 * SPARK — S115 P2 (G2-PROMO Phase-2): SPINDLE tangential swirl, a free-spark orbital magic-combo behavior.
 *
 * "Make the geometry matter" (S86 roadmap). The Spindle (Line↔Circle) was promoted to magic in S91
 * (silhouette + the 8× income premium) but had no MECHANIC — its "a spun spindle of stored motion" table
 * description was paint. This realizes it as a TANGENTIAL field: where a Vortex (Dot↔Spiral) sucks free
 * sparks radially INWARD, a Spindle pushes them PERPENDICULAR (around it) so they SWIRL — a distinct,
 * readable identity ("stored motion") that herds nearby free sparks into a soft orbit.
 *
 * Built as a 90°-rotated clone of applyVortexPull, with one critical addition the Council (GROK-ANALYST)
 * demanded: a CONSTANT tangential impulse would ACCUMULATE angular momentum every tick → sparks reach
 * escape velocity and fling off (a true orbit needs a centripetal force this position-based engine does
 * not model). So the impulse is BOUNDED BY A TANGENTIAL-SPEED CAP — each tick we only push a spark UP TO
 * SPINDLE_MAX_TANGENTIAL_SPEED in the swirl direction, never beyond. The swirl is therefore
 * non-accumulating BY CONSTRUCTION (provably no escape velocity; unit-tested), and the cap doubles as the
 * #1 readability/feel dial.
 *
 * DETERMINISM / 1v1-MIRROR (PRIME-AUDIT): pure function of synced state (anchors + each spark's own pos/
 * prevPos); no Math.random / Date.now, no sin/cos (plain vector ops). HOST-ONLY — stepPhysics is host/
 * solo-gated, so clients NEVER recompute the force; they mirror the resulting spark positions via
 * NetSnapshot. A spark's swirl depends ONLY on its own pos + the anchor SET, so SPARK iteration order is
 * result-irrelevant; but the per-spark FLOAT SUM over multiple anchors IS order-sensitive (IEEE-754
 * non-associativity), so anchors are sorted by bond id into a CANONICAL order before summing (the Vortex/
 * seagull lowest-id convention). A FOULED Spindle (either endpoint pooped) stops swirling until cleaned.
 * No new serialized field → PROTOCOL_VERSION held; replay byte-identical by construction.
 */

import {
  SPINDLE_MAX_TANGENTIAL_SPEED,
  SPINDLE_PULL_ACCEL,
  SPINDLE_PULL_MIN_DIST,
  SPINDLE_PULL_RADIUS,
} from '../constants.ts';
import { isSpindleCombo } from '../combos.ts';
import type { SparkId } from '../types.ts';
import type { World } from './worldTypes.ts';

const SPINDLE_PULL_RADIUS_SQ = SPINDLE_PULL_RADIUS * SPINDLE_PULL_RADIUS;

/**
 * Host-only, once per physics tick. `attractedId` (the spark the local player is AttractDragging, if any)
 * is skipped so the swirl never fights a player's drag. No-op when no live Spindle exists.
 */
export function applySpindlePull(world: World, attractedId: SparkId | null = null): void {
  // 1) Collect Spindle anchor positions (bond midpoints). Skip a bond referencing a deleted prim or a
  //    fouled structure (mirrors Vortex + scoring). Lazily allocate — the common case is "no Spindle".
  let anchors: Array<{ id: number; x: number; y: number }> | null = null;
  for (const bond of world.bonds.values()) {
    const a = world.primitives.get(bond.aId);
    if (a === undefined) continue;
    const b = world.primitives.get(bond.bId);
    if (b === undefined) continue;
    if (!isSpindleCombo(a.type, b.type)) continue;
    if (world.fouledPrimitives.has(bond.aId) || world.fouledPrimitives.has(bond.bId)) continue;
    (anchors ??= []).push({
      id: bond.id as number,
      x: (a.pos.x + b.pos.x) / 2,
      y: (a.pos.y + b.pos.y) / 2,
    });
  }
  if (anchors === null) return;
  // CANONICAL ORDER: sort by bond id so the per-spark float sum below is computed in the SAME order on
  // every host run / replay, independent of Map insertion order (Vortex/seagull determinism convention).
  anchors.sort((p, q) => p.id - q.id);

  for (const spark of world.freeSparks.values()) {
    if (spark.state.kind !== 'Free') continue; // carried/placed sparks don't swirl
    if (attractedId !== null && spark.id === attractedId) continue; // don't fight the player's drag
    /*
     * ⭐⭐ S171 (owner) — **AN ESCROWED SPARK IS PARKED ON PURPOSE. DO NOT PULL IT.**
     *
     * Owner, reporting it from play: *"I built, like, a huge structure near my castle. So ... not
     * every time I take out a shape from the castle primitive, it just flies all by itself ... it's
     * just automatically flying off very fast"* and then, exactly: *"it seems like there's MAGNETISM
     * or ANTIMAGNETISM between the shapes."*
     *
     * ⛔ HE NAMED THE MECHANISM WITHOUT KNOWING IT. Vortex (Dot+Spiral) is a radial SUCK and Spindle
     * (Line+Circle) is a tangential SHOVE — magnetism and antimagnetism. Neither loop checked
     * `escrow`, so a shape standing on the castle porch was a legal target for both.
     *
     * ⚠ AND ESCROW IS EXACTLY WHY IT WAS UNRECOVERABLE. `escrow` exempts a spark from every
     * containment rail there is — the quarry rim-snap, the 10 s TTL reap and the soft cap — because
     * a banked or hauled shape is *meant* to sit outside the zone. So the one flag that let a magic
     * field fling it was also the flag that guaranteed nothing would ever pull it back.
     *
     * MEASURED before the fix, from porch slot 0: one Spindle anchor 30 px away launched the shape
     * 530 px at 353 px/s; six Spindle bonds — an ordinary big structure — reached 567 px/s and 824
     * px, off the bottom of a 1080 px canvas. For scale, the fastest chaser in the game is the
     * hunter at 315 px/s.
     *
     * ⭐ THE LINE IS COPIED FROM `enforceSpawnerBounds` (`game/spawner.ts`), which already carries
     * this guard and states the rule: *"an ESCROWED spark has left the quarry on purpose."* A magic
     * field reaching into a player's porch is the same violation the rim-snap exemption was written
     * for. It also closes the mirror case nobody has hit yet: a Vortex stealing a gatherer's
     * in-flight haul (`escrow: 'hauled'`).
     *
     * No wire or hash cost — `escrow` is already serialized and hashed. No PROTOCOL_VERSION bump.
     */
    if (spark.escrow !== undefined) continue;
    // 2) Sum the TANGENTIAL (perpendicular) impulses from every in-range anchor, ramped by proximity.
    let px = 0;
    let py = 0;
    for (const anchor of anchors) {
      const dx = anchor.x - spark.pos.x;
      const dy = anchor.y - spark.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > SPINDLE_PULL_RADIUS_SQ) continue;
      const dist = Math.sqrt(distSq);
      if (dist < SPINDLE_PULL_MIN_DIST) continue; // inside the core — no swirl (avoid a singular spin)
      // Strength ramps 0 (edge) → SPINDLE_PULL_ACCEL (core). Tangential direction = the anchor→spark
      // vector rotated +90°: (−dy, dx)/dist gives a consistent (counter-clockwise) swirl handedness.
      const strength = SPINDLE_PULL_ACCEL * (1 - dist / SPINDLE_PULL_RADIUS);
      px += (-dy / dist) * strength;
      py += (dx / dist) * strength;
    }
    if (px === 0 && py === 0) continue;
    // Cap the summed per-tick impulse so stacked Spindles can't yank harder than one.
    let mag = Math.sqrt(px * px + py * py);
    if (mag > SPINDLE_PULL_ACCEL) {
      const s = SPINDLE_PULL_ACCEL / mag;
      px *= s;
      py *= s;
      mag = SPINDLE_PULL_ACCEL;
    }
    // 3) BOUNDED-SPEED CLAMP (Council anti-escape-velocity fix). Project the spark's current velocity
    //    (pos − prevPos) onto the swirl direction; the headroom to the cap is the most we may add.
    //    Non-accumulating by construction: the velocity component along the push never exceeds the cap,
    //    so the swirl cannot build to escape velocity no matter how many ticks the spark stays in range.
    const invMag = 1 / mag; // mag > 0 here — the zero-impulse case already `continue`d above
    const ux = px * invMag;
    const uy = py * invMag;
    const vAlong = (spark.pos.x - spark.prevPos.x) * ux + (spark.pos.y - spark.prevPos.y) * uy;
    const headroom = SPINDLE_MAX_TANGENTIAL_SPEED - vAlong;
    if (headroom <= 0) continue; // already at/over the swirl-speed cap in this direction — add nothing
    const applied = Math.min(mag, headroom);
    // Verlet velocity impulse: shifting prevPos AGAINST the push increases the toward-swirl velocity.
    spark.prevPos.x -= ux * applied;
    spark.prevPos.y -= uy * applied;
  }
}
