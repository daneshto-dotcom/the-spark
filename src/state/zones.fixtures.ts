/**
 * SPARK — CANONICAL IN-ZONE TEST POINTS (S149 P1).
 *
 * ## Why this file exists
 *
 * S149 P1 swapped build legality from `isInsideEnemyTerritory` (a complexity-derived influence
 * bubble that returned FALSE — i.e. "allowed" — for any enemy who had built nothing nearby) to
 * `zones.canBuildAt` (the real partition). That is the fix for the owner's playtest report
 * *"players can build wherever"*, and it correctly broke **17 tests across 8 files**: those tests
 * place at coordinates that were legal under the bubble and are enemy ground under the partition.
 *
 * Almost none of them are ABOUT territory. `session7` tests the release-REACH gate; `session15`
 * tests simultaneous 1v1 dispatch; `botBrain` tests goal arbitration. The coordinates were
 * incidental — chosen only to be outside the quarry — so the correct repair is to re-site them
 * into the placing seat's own ground, leaving every assertion intact.
 *
 * ⚠ THE POINT OF PUTTING THEM HERE RATHER THAN EDITING 17 LITERALS: the next change to the
 * partition (team modes, R11's 2v2 adjacency, a new board) touches ONE file instead of eight.
 * Hardcoded literals scattered across eight test files are a second source of truth for the board
 * geometry, and this repo has been bitten repeatedly by exactly that shape of duplication.
 *
 * ## Derived, never hardcoded
 *
 * Every point below is COMPUTED from `zoneCastleAnchor` + the board centre. A hardcoded table
 * would be a second source of truth for the partition and could silently rot the moment an anchor
 * moves — which is the class of drift `zoneCastleAnchor` was itself created to end. The
 * derivation's own guarantees (in zone, clear of the quarry, clear of the canvas edge) are not
 * asserted here but in `zones.test.ts`, so they are proven by the same suite that proves the
 * partition.
 *
 * ## Not shipped
 *
 * Imported only by `*.test.ts`. No production module imports it, so Rollup tree-shakes it out of
 * the app bundle entirely. Verified the S132 way — by the entry-chunk size, not by trusting the
 * bundler.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { Vec2 } from '../types.ts';
import { zoneCastleAnchor, zoneCount, type ZoneLayout } from './zones.ts';

/** The board centre — also the quarry centre, which is why every point below moves AWAY from it. */
const CENTRE: Vec2 = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };

/**
 * ⭐ A CANONICAL BUILDABLE POINT INSIDE `seat`'s OWN ZONE.
 *
 * The midpoint of (castle anchor → board centre). Correct by construction: the midpoint of a
 * segment from a point strictly inside a zone to the centre cannot cross either split line, so it
 * stays in the anchor's zone. It sits at HALF the anchor's distance from the centre, which on both
 * shipped boards is ~420–463 px — comfortably outside the 125 px quarry — and comfortably inside
 * the canvas, since it is strictly between two on-board points.
 *
 * It is also deliberately NOT the anchor itself: the anchor is where the keep box is drawn, so
 * building there would collide with the castle rather than test what the caller meant to test.
 */
export function ownZonePoint(seat: number, layout: ZoneLayout): Vec2 {
  const a = zoneCastleAnchor(seat, layout);
  return { x: (a.x + CENTRE.x) / 2, y: (a.y + CENTRE.y) / 2 };
}

/**
 * A buildable point inside `seat`'s own zone, offset by `(dx, dy)` — for tests that need two or
 * more placements within `AUTO_BOND_RADIUS` of each other.
 *
 * ⚠ The caller owns the offset's legality. Keep it small (tens of px, which is all the bond radius
 * ever needs): a large offset can push the point across a split line or into the quarry, and this
 * helper deliberately does NOT clamp, because a silently-moved point would make a test pass while
 * asserting something other than what it says.
 */
export function nearOwnZonePoint(seat: number, layout: ZoneLayout, dx: number, dy: number): Vec2 {
  const p = ownZonePoint(seat, layout);
  return { x: p.x + dx, y: p.y + dy };
}

/**
 * A point inside SOMEBODY ELSE's zone — for the tests that assert a refusal.
 *
 * The next zone round-robin, so it is always a real zone that exists on this board and never
 * `seat`'s own. This is the positive control for the partition: a test using it should be REFUSED.
 */
export function enemyZonePoint(seat: number, layout: ZoneLayout): Vec2 {
  return ownZonePoint((seat + 1) % zoneCount(layout), layout);
}

/**
 * Dead centre of the shared quarry — owned by NOBODY on every board (`zoneOf` returns `null`), so
 * `canBuildAt` refuses it for every seat. The other positive control.
 */
export const QUARRY_POINT: Vec2 = { x: CENTRE.x, y: CENTRE.y };
