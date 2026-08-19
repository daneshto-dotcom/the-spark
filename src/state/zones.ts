/**
 * SPARK — S148 P1: THE ZONE PARTITION. Pure, leaf module, no world read, no Pixi.
 *
 * This replaces the polar keep RING with a real partition of the board. It is the geometric
 * foundation the tower-defence pivot rests on: build legality (S148 P2), the border walls
 * (S148 P3) and castle placement all derive from the same answer to "whose ground is this?".
 *
 * ⭐ THE ZONE IS PRIMARY AND THE CASTLE DERIVES FROM IT — not the other way round. The owner
 * corrected exactly this reading twice in S146: a keep ring that happens to sit near the corners
 * is NOT a zone system. `zoneCastleAnchor` is a lookup INTO the partition, so a castle can never
 * drift out of the ground it defends.
 *
 * ⚠ HASHED GEOMETRY. `zoneCastleAnchor` feeds `castleAnchor`, and a gatherer's spawn position is
 * hashed host-authoritative state that host migration rebuilds from a mirror. Host, worker and a
 * promoted successor must therefore agree BIT-FOR-BIT. That imposes three rules on this file:
 *
 *   1. **Every number here is a literal or derived from a frozen constant.** No live roster size
 *      ever reaches this math — a seat-count-dependent anchor would move every keep (and diverge
 *      the hash) the moment a player joins or drops. This is the S135 lesson, kept.
 *   2. **No `Math.sqrt`.** The quarry test compares SQUARED distances. sqrt is not the determinism
 *      risk people assume (IEEE-754 sqrt is correctly rounded and portable), but the squared form
 *      is both faster and one fewer thing to argue about on a hot path.
 *   3. **Positions are NOT integerised.** They arrive as floats that are already bit-identical on
 *      both peers; rounding them here would be a gratuitous second source of truth.
 *
 * ⚠ TOTALITY IS THE POINT. `zoneOf` answers for EVERY pixel of the board: a zone index, or `null`
 * for the shared quarry. The inequalities below are deliberately asymmetric (`<` on one side,
 * implicit `>=` on the other) so that no pixel is claimed by two zones and none is claimed by none.
 * A partition with a seam is a partition where a player can build on a border pixel that the host
 * and the drag ghost disagree about.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import type { Vec2 } from '../types.ts';

/**
 * The two boards. `PITCH_2P` is the 1v1 football pitch — one vertical split, castles in the
 * goalmouths. `QUADRANTS_4P` is the 4-player board — a cross split, castles in the outer corners.
 *
 * R2: **there is no 3-player map.** Three players use `QUADRANTS_4P` with one quadrant simply
 * empty, which is why `layoutForSeatCount` has no third arm.
 *
 * ⚠ SERIALIZED. This union rides the wire as `World.layout` and is hashed, so ADDING an arm is a
 * protocol bump — a stale peer cannot parse a literal it has never heard of. Same class of change
 * as the `'WALK'` DefenderState literal that forced 12->13.
 */
export type ZoneLayout = 'PITCH_2P' | 'QUADRANTS_4P';

/** The dividing lines. Dead centre of the board, so both boards share one crosshair. */
const SPLIT_X = CANVAS_WIDTH / 2; // 960
const SPLIT_Y = CANVAS_HEIGHT / 2; // 540

/** Squared quarry radius — see rule 2 in the file docblock. */
const QUARRY_R2 = SPAWNER_RADIUS * SPAWNER_RADIUS;

/**
 * ⭐ CASTLE ANCHORS, IN ZONE ORDER. Index i is the anchor for zone i — that identity is what makes
 * `zoneCastleAnchor` a lookup rather than a second geometric derivation that could drift.
 *
 * `QUADRANTS_4P` is in CLOCK ORDER per R2: zone 0 = 9-12 o'clock (top-left), 1 = 12-3 (top-right),
 * 2 = 3-6 (bottom-right), 3 = 6-9 (bottom-left).
 *
 * ⚠ THESE SIX POINTS WERE VERIFIED AGAINST FOUR PIECES OF HUD GEOMETRY, NOT JUST THE CANVAS.
 * The keep BOX fitting inside 1920x1080 is the easy half and was the only half previously checked.
 * Measured this session (S148 A.0 delta D5):
 *   · all six keep boxes (KEEP_W 74 x KEEP_H 58) are inside the canvas — OK;
 *   · the score progress bar occupies x[12,92] y[920,960] and the bottom-left keep box is
 *     x[93,167] y[921,979] — they clear each other BY ONE PIXEL. That is luck, not design, so
 *     `zones.test.ts` pins the gap explicitly and will fail if either side moves;
 *   · porch + deposit sit at anchor.y + 74, i.e. y=1024 for the bottom keeps, inside the footer
 *     band (FOOTER_TOP_Y 996). Survivable ONLY because S136 P0 deleted the footer plate and its
 *     click guard — reviving a footer control means moving these anchors up;
 *   · the energy gauge at x[1896,1904] clears both right-hand keeps (max x 1827) — OK.
 */
const ANCHORS: { readonly [K in ZoneLayout]: readonly Vec2[] } = {
  // Goalmouths — inset from the touchline by roughly one keep width.
  PITCH_2P: [
    { x: 120, y: 540 },
    { x: 1800, y: 540 },
  ],
  // Outer corners, inset ~130 px so the whole keep box clears the edge with room for its porch.
  QUADRANTS_4P: [
    { x: 130, y: 130 },
    { x: 1790, y: 130 },
    { x: 1790, y: 950 },
    { x: 130, y: 950 },
  ],
} as const;

/**
 * How many zones this layout partitions the board into.
 *
 * Derived from `ANCHORS` rather than written twice: the anchor table and the zone count are the
 * same fact, and a layout whose count disagreed with its anchor list would hand out an
 * `undefined` anchor at runtime with no compile error.
 */
export function zoneCount(layout: ZoneLayout): number {
  return ANCHORS[layout].length;
}

/**
 * ⭐ WHICH ZONE CONTAINS `pos`? Returns the zone index, or `null` for the shared quarry.
 *
 * THE QUARRY IS EVALUATED FIRST AND BELONGS TO NOBODY (blueprint Q6). It sits dead centre on both
 * boards, straddling every border, so if it were partitioned the four owners would each own a
 * wedge of the one resource everybody must share — and build legality would let a player fence off
 * a quarter of the spawn zone on turn one.
 *
 * BORDER CONVENTION, stated once and applied everywhere: a point exactly ON a split line belongs
 * to the HIGHER-indexed side (`x < SPLIT_X` is left, so `x === SPLIT_X` is right). A point exactly
 * on the quarry RIM belongs to a zone, not the quarry (`< QUARRY_R2`, strictly inside). Both are
 * arbitrary; what matters is that one rule is used by the host, the client preview and the bots,
 * which is exactly what `canBuildAt` guarantees by having a single implementation.
 */
export function zoneOf(pos: Vec2, layout: ZoneLayout): number | null {
  // The quarry first — see the docblock. Squared distance, no sqrt.
  const qdx = pos.x - SPAWNER_CENTER_X;
  const qdy = pos.y - SPAWNER_CENTER_Y;
  if (qdx * qdx + qdy * qdy < QUARRY_R2) return null;

  if (layout === 'PITCH_2P') {
    return pos.x < SPLIT_X ? 0 : 1;
  }
  // QUADRANTS_4P, clock order: TL=0, TR=1, BR=2, BL=3.
  const left = pos.x < SPLIT_X;
  const top = pos.y < SPLIT_Y;
  if (top) return left ? 0 : 1;
  return left ? 3 : 2;
}

/**
 * ⭐ WHICH ZONE DOES `seat` OWN? `null` means this seat owns no ground on this board.
 *
 * ⚠ THE `null` ARM IS NOT DEAD CODE AND MUST NOT BE "SIMPLIFIED" INTO A MODULO. Returning
 * `seat % zoneCount` would be total and tidy and WRONG: on `PITCH_2P` it would make seat 2 a
 * co-owner of seat 0's ground, so two players could legally build in the same zone and the game
 * would silently have no borders. Failing closed (nobody may build anywhere) is the only safe
 * answer to "this seat has no zone" — and `layoutForSeatCount` makes the case unreachable in
 * practice anyway, which `zones.test.ts` pins against `MAX_PLAYERS`.
 *
 * The mapping is the IDENTITY — seat i owns zone i. It is a function rather than a bare identity
 * so that team modes (R11: 2v2 on the quadrant board) have exactly one place to change.
 */
export function zoneOwner(seat: number, layout: ZoneLayout): number | null {
  if (!Number.isInteger(seat) || seat < 0 || seat >= zoneCount(layout)) return null;
  return seat;
}

/**
 * ⭐ WHERE `seat`'s CASTLE STANDS. The single source of truth for both the drawn keep box and a
 * bought gatherer's spawn position, exactly as the old polar `castleAnchor` was.
 *
 * ⚠ TOTAL BY CONSTRUCTION, AND DELIBERATELY ASYMMETRIC WITH `zoneOwner`. Geometry must always
 * yield a drawable on-board point — 13 consumers spanning sim AND render dereference `.x`/`.y`
 * unconditionally, and handing them `null` would mean 13 new null-checks in hot paths for a case
 * that cannot happen. Legality, by contrast, must fail CLOSED. So a seat with no zone still gets
 * a deterministic anchor (zone 0's) while `zoneOwner` refuses it any ground — it can be drawn,
 * and it can build nowhere.
 *
 * Returns a FRESH object every call. The table is module-level and shared; handing out a
 * reference would let any one of the 13 consumers mutate every other one's anchor.
 */
export function zoneCastleAnchor(seat: number, layout: ZoneLayout): Vec2 {
  const zone = zoneOwner(seat, layout) ?? 0;
  const a = ANCHORS[layout][zone] as Vec2;
  return { x: a.x, y: a.y };
}

/**
 * Which board a match of `seatCount` players is played on, decided ONCE at match start.
 *
 * R2 — **no 3-player map**: three players use the quadrant board with one quadrant empty. So the
 * only threshold is 2-or-fewer vs 3-or-more, and there is no third arm to get wrong.
 *
 * ⚠ Solo (seatCount 1) gets `PITCH_2P`. A single player on the quadrant board would sit in a
 * corner of a cross-split board with three empty quadrants and a border they can never cross,
 * which reads as a bug rather than a design.
 */
export function layoutForSeatCount(seatCount: number): ZoneLayout {
  return seatCount <= 2 ? 'PITCH_2P' : 'QUADRANTS_4P';
}

/**
 * ⭐ THE ONE BUILD-LEGALITY RULE (S148 P2 wires this into all SIX gates).
 *
 * Kept HERE, next to the partition it reads, so the host refusal, the client drag ghost and the
 * bot planner cannot drift apart. That drift is not hypothetical: before this existed there were
 * six independent calls to `isInsideEnemyTerritory`, and wiring only the three host refusals would
 * have left the drag ghost showing "legal" exactly where the host refuses — which a player reads
 * as a desync bug, not as a rule.
 *
 * Fails CLOSED on every ambiguity: the shared quarry (`zoneOf` null) and a seat with no ground
 * (`zoneOwner` null) are both unbuildable.
 */
export function canBuildAt(pos: Vec2, seat: number, layout: ZoneLayout): boolean {
  const owner = zoneOwner(seat, layout);
  if (owner === null) return false;
  const zone = zoneOf(pos, layout);
  if (zone === null) return false;
  return zone === owner;
}

/**
 * S148 — the widest board, and how many seats it can give ground to.
 *
 * `MAX_PLAYERS` must never exceed `MAX_SEATS_WITH_GROUND`, or a legally seated player would own no
 * zone and be unable to build anywhere. That cannot be expressed in the type system (an array
 * `.length` is `number`, not a literal), so `zones.test.ts` asserts it instead. These are exported
 * rather than inlined so the relationship is greppable from both ends.
 */
export const WIDEST_LAYOUT: ZoneLayout = 'QUADRANTS_4P';
export const MAX_SEATS_WITH_GROUND: number = ANCHORS[WIDEST_LAYOUT].length;
