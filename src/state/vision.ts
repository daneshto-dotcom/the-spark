/**
 * SPARK — fog-of-war vision math (S57 P1). Blueprint § III.4 / § X.4 / § IX.5.
 *
 * PURE computation of the LOCAL player's circular vision sources for the
 * client-side fog mask. No Pixi, no rendering — fogRenderer.ts consumes
 * computeVisionSources() to punch soft cutouts in an opaque dark overlay.
 *
 * Vision = union of:
 *   - personal radius (R_PERSONAL) at the local player's LIVE cursor
 *     (Council R1: live cursor, NOT the 10Hz-throttled avatarPos, so the
 *      reveal tracks the hand with zero lag)
 *   - one beacon (R_BEACON) per primitive the local player OWNS (placedBy)
 *     -> a bigger / more-complex structure has more primitives -> more
 *        overlapping beacons -> reveals a larger area (emergent, § X.4)
 *   - one beacon (R_CREATURE_VISION) per creature the local player OWNS
 *     (S58 #3) -> you can WATCH your Voltkin march into enemy territory and
 *      fight, instead of it vanishing into the fog the moment it leaves your
 *      structures. The creature roams, so its reveal travels with it.
 *   - the spawner zone, always visible to all players (§ IX.5)
 *
 * Enemy primitives AND enemy creatures contribute NOTHING -> their builds and
 * raiders stay concealed until the local player cruises over them or they enter
 * an own beacon (e.g. an enemy creature attacking your base shows up because it
 * walks into your structure beacons). This is the whole point: two-layer
 * information asymmetry (no leaderboard + fogged board).
 */

import {
  R_BEACON,
  R_CREATURE_VISION,
  R_PERSONAL,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import type { Vec2 } from '../types.ts';
import type { World } from './world.ts';
// S62 — sourced from gameMode (light leaf graph) to keep vision a pure
// render-input leaf rather than pulling world.ts's full runtime graph.
import { isNetworked } from './gameMode.ts';

export interface VisionSource {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * The circular vision sources for the LOCAL player (world.localPlayerId),
 * given their live cursor position. Returned order is
 * [spawner, personal, ...own-beacons] but callers MUST treat it as an
 * unordered union (the renderer draws all of them additively).
 *
 * Symmetric: from player 1's perspective (localPlayerId === 1), player 1's
 * primitives are the beacons and player 0's are excluded, and vice-versa.
 */
export function computeVisionSources(world: World, localCursor: Vec2): VisionSource[] {
  const sources: VisionSource[] = [
    { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y, radius: SPAWNER_RADIUS },
    { x: localCursor.x, y: localCursor.y, radius: R_PERSONAL },
  ];
  const me = world.localPlayerId;
  for (const prim of world.primitives.values()) {
    if (prim.placedBy !== me) continue;
    sources.push({ x: prim.pos.x, y: prim.pos.y, radius: R_BEACON });
  }
  // S58 (#3) — own creatures (e.g. Voltkin) reveal the fog around them so the
  // player can watch the fight. Enemy creatures are excluded (concealment).
  for (const creature of world.creatures.values()) {
    if (creature.ownerPlayerId !== me) continue;
    sources.push({ x: creature.pos.x, y: creature.pos.y, radius: R_CREATURE_VISION });
  }
  return sources;
}

/**
 * Whether (x, y) falls inside ANY vision source (radius boundary inclusive).
 * Makes the concealment property directly testable and is reusable for future
 * gameplay gating (e.g. raid-targeting requires the target to be visible,
 * § VIII.3).
 */
export function isPointVisible(
  sources: readonly VisionSource[],
  x: number,
  y: number,
): boolean {
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy <= s.radius * s.radius) return true;
  }
  return false;
}

/**
 * Fog renders only during networked 1v1 active play. Solo has no opponent to
 * hide from (Blueprint Phase 1 excludes fog from single-player); TITLE / LOBBY
 * show the board pre-match; WIN / POSTGAME lift the fog for the reveal.
 */
export function fogActive(world: World): boolean {
  return isNetworked(world) && world.gameState === 'PLAYING';
}

/**
 * Target fog opacity in [0, 1] by phase. 1v1 PLAYING -> 1 (full fog);
 * everything else -> 0. On WIN the target drops to 0 and the renderer tweens
 * the overlay alpha down -> the fog LIFTS and every structure is revealed
 * (§ III.7 victory reveal). The renderer owns the actual alpha; this is its
 * target.
 */
export function fogTargetAlpha(world: World): number {
  return fogActive(world) ? 1 : 0;
}

/**
 * Pure tween step for the fog overlay alpha. Snap ON instantly when the target
 * rises (match start — no free first-second peek at the enemy board); fade OFF
 * gradually when the target falls (the win lift), clamped so it never
 * undershoots the target. `fadeStep` is the maximum decrease permitted this
 * frame (derived from elapsed time / fade duration by the caller).
 */
export function stepFogAlpha(current: number, target: number, fadeStep: number): number {
  if (target >= current) return target;
  return Math.max(target, current - fadeStep);
}
