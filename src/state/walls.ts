/**
 * SPARK — S149 P3: **THE BORDER WALLS.**
 *
 * *"A wall in that player's colour is erected on the borders he shares with other players' zones.
 * The walls come DOWN during the fight stage."*
 *
 * ## ⭐ DERIVED, NEVER STORED — the single most important decision in this file
 *
 * A wall is a pure function of `(layout, matchPhase)`, and **both of those are already hashed World
 * fields**. So the border walls cost:
 *
 *   · ZERO of the nine sites a new hashed World family costs
 *   · ZERO protocol surface
 *   · ZERO save-format surface
 *
 * …and, more importantly, **they cannot desync.** There is no wall state for a host and a joiner to
 * disagree about: both compute the same segments from the same two fields they already agree on.
 * Both external Council seats reached this independently and it is the cheapest correct model.
 *
 * ⚠ THIS IS THE *BORDER* WALL, WHICH IS NOT THE ONLY KIND OF WALL IN THE DESIGN. R17/R37/R39
 * describe **player-built** walls — raised from loose shapes, standing THROUGH the fight, blocking
 * projectiles and armies, destructible. Those are ordinary primitives and will be built as such in
 * a later session. Do not fold the two together: this file is only the phase-toggled zone divider,
 * and its entire lifecycle is "exists during BUILD, gone during FIGHT".
 *
 * ## The geometry (blueprint Q6)
 *
 * Walls run from the **quarry rim OUTWARD** along the interior zone borders. That gap is
 * deliberate and load-bearing: *"every zone has unobstructed access to its own slice of the
 * quarry"*, so a gatherer can always reach the shared resource without a door.
 *
 * ⚠ AND THAT GAP HAS A CONSEQUENCE WORTH STATING OUT LOUD: because the quarry is an open hub with
 * no wall across it, a unit could in principle route from one zone to another THROUGH the quarry
 * even while the walls are up. That is a faithful reading of the stated geometry, not an
 * implementation shortcut — the describe block "THE QUARRY IS AN OPEN HUB" in `walls.test.ts`
 * pins it explicitly rather than letting it be discovered later as a bug. If the owner wants the centre sealed, the fix is a design
 * ruling (a wall arc across the rim), not a code change here.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import type { Vec2 } from '../types.ts';
import { zoneOf, type ZoneLayout } from './zones.ts';
import type { World } from './worldTypes.ts';

/** One straight run of border wall, and the two zones it separates. */
export interface WallSegment {
  readonly a: Vec2;
  readonly b: Vec2;
  /** The zone on each side — drives the two-tone colouring (each half is its owner's). */
  readonly zoneA: number;
  readonly zoneB: number;
}

const SPLIT_X = CANVAS_WIDTH / 2; // 960
const SPLIT_Y = CANVAS_HEIGHT / 2; // 540

/**
 * ⭐ THE BORDER WALLS FOR A BOARD. Pure, allocation-light, and derived from the same two split
 * lines `zoneOf` uses — so a wall can never be drawn somewhere the partition does not actually
 * divide. Segments stop at the quarry rim (Q6).
 *
 * `PITCH_2P` — one vertical split, so two runs: above the quarry and below it.
 * `QUADRANTS_4P` — a cross, so four arms radiating from the quarry rim to the four edges.
 */
export function wallSegments(layout: ZoneLayout): readonly WallSegment[] {
  const rimTop = SPAWNER_CENTER_Y - SPAWNER_RADIUS;
  const rimBottom = SPAWNER_CENTER_Y + SPAWNER_RADIUS;
  const rimLeft = SPAWNER_CENTER_X - SPAWNER_RADIUS;
  const rimRight = SPAWNER_CENTER_X + SPAWNER_RADIUS;

  if (layout === 'PITCH_2P') {
    // Zone 0 is the left half, zone 1 the right; the vertical split divides them.
    return [
      { a: { x: SPLIT_X, y: 0 }, b: { x: SPLIT_X, y: rimTop }, zoneA: 0, zoneB: 1 },
      { a: { x: SPLIT_X, y: rimBottom }, b: { x: SPLIT_X, y: CANVAS_HEIGHT }, zoneA: 0, zoneB: 1 },
    ];
  }

  // QUADRANTS_4P, clock order: TL=0, TR=1, BR=2, BL=3.
  return [
    { a: { x: SPLIT_X, y: 0 }, b: { x: SPLIT_X, y: rimTop }, zoneA: 0, zoneB: 1 }, // north arm
    { a: { x: rimRight, y: SPLIT_Y }, b: { x: CANVAS_WIDTH, y: SPLIT_Y }, zoneA: 1, zoneB: 2 }, // east
    { a: { x: SPLIT_X, y: rimBottom }, b: { x: SPLIT_X, y: CANVAS_HEIGHT }, zoneA: 3, zoneB: 2 }, // south
    { a: { x: 0, y: SPLIT_Y }, b: { x: rimLeft, y: SPLIT_Y }, zoneA: 0, zoneB: 3 }, // west arm
  ];
}

/**
 * ⭐ ARE THE WALLS UP? Up for the whole BUILD stage, down for the whole FIGHT (R5).
 *
 * Read this rather than testing `matchPhase` inline, so "when is a wall up" has one answer that
 * the sim, the movement clamp and the renderer all share — the drift lesson P1 and P2 both paid for.
 */
export function wallsAreUp(world: World): boolean {
  return world.matchPhase === 'BUILD';
}

/**
 * ⭐ WOULD MOVING `from` → `to` CROSS A RAISED BORDER? Pure; the caller supplies the phase.
 *
 * Implemented as a ZONE CHANGE rather than a segment-intersection test, and that is deliberate:
 * the walls sit exactly on the partition's own split lines, so "crossed a wall" and "ended up in a
 * different zone" are the same statement — and deriving it from `zoneOf` means the barrier can
 * never drift away from the border it is drawn on. A segment test would be a second, independent
 * piece of geometry to keep in sync, which is precisely the class of bug S149 has spent two
 * priorities removing.
 *
 * ⚠ MOVES INVOLVING THE QUARRY ARE ALWAYS ALLOWED — `zoneOf` returns `null` there, and the walls
 * genuinely stop at its rim (Q6). See the file docblock: this makes the quarry an open hub, which
 * is a faithful consequence of the stated geometry and is pinned by a test rather than hidden.
 */
export function crossesWall(from: Vec2, to: Vec2, layout: ZoneLayout): boolean {
  const zFrom = zoneOf(from, layout);
  const zTo = zoneOf(to, layout);
  if (zFrom === null || zTo === null) return false; // into or out of the shared quarry
  return zFrom !== zTo;
}

/**
 * The movement clamp: where a unit at `from` may actually end up this step.
 *
 * Refuses the whole step rather than sliding along the wall. A slide would need a projection onto
 * the border and would let a unit skate along a wall it should simply be stopped by; refusing is
 * also what makes this trivially deterministic — there is no arithmetic to round.
 *
 * ## ⛔ THIS HAS NO SIM CONSUMER TODAY, AND THAT IS A MEASURED FINDING — NOT AN OVERSIGHT
 *
 * S149 P3 wired this into gatherer movement and **the economy test immediately caught it**:
 * `zoneEconomy.test.ts` fell from 7+ banked shapes in an opening BUILD to 5, below the bar for
 * affording a first tower. The mechanism, verified rather than guessed:
 *
 *   `enforceSpawnerBounds` rim-snaps stray sparks to EXACTLY `SPAWNER_RADIUS`, and `zoneOf` treats
 *   the quarry as STRICTLY inside (`< R²`) — so a spark resting on the rim belongs to whichever
 *   ZONE that arc faces. A seat-0 gatherer reaching for a shape on the zone-2 arc was therefore
 *   blocked from the shared resource, which is exactly what Q6 forbids: *"every zone has
 *   unobstructed access to its own slice of the quarry."*
 *
 * Following that through, the border walls turn out to have **no movement-blocking role at all**:
 *
 *   · during BUILD  — gatherers are guaranteed quarry access (Q6), and creatures are dormant
 *                     (S149 P3), so there is nothing that both moves and ought to be stopped;
 *   · during FIGHT  — the walls are down (R5).
 *
 * The sealing players actually feel comes from BUILD LEGALITY (you cannot build on enemy ground)
 * and DORMANCY (nothing fights during BUILD) — not from a barrier. The wall's job is to make that
 * rule VISIBLE, which is what the renderer does.
 *
 * ⚠ SO DO NOT RE-WIRE THIS WITHOUT SOLVING THE RIM CASE FIRST. It is retained, exported and tested
 * because it is the correct substrate for the moment a unit legitimately needs stopping at a
 * border — but wiring it as-is re-breaks the opening economy, and the test that catches it is
 * `zoneEconomy.test.ts`, not anything in `walls.test.ts`.
 */
export function clampAcrossWalls(
  from: Vec2,
  to: Vec2,
  layout: ZoneLayout,
  wallsUp: boolean,
): Vec2 {
  if (!wallsUp) return to;
  return crossesWall(from, to, layout) ? { x: from.x, y: from.y } : to;
}
