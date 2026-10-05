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
  CASTLE_PORCH_OFFSET_Y,
  CASTLE_PORCH_PITCH_X,
  CASTLE_PORCH_SLOT_CLEAR_RADIUS,
  CASTLE_PORCH_SLOTS,
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
export type ZoneLayout = 'PITCH_2P' | 'QUADRANTS_4P' | TeamQuadLayout;

/**
 * ⭐⭐ S195 (owner R195-T2/T3/T4/T5, N2, B-29) — **THE QUADRANT BOARD WITH A SEAT → ZONE MAP.**
 *
 * `QUADRANTS_4P:<o0><o1><o2><o3>` — character `z` is the SEAT that owns zone `z` (a digit), or `-` for
 * nobody. A seat's HOME zone (its castle) is the LOWEST zone it owns; a seat may own two (the 2v1 solo:
 * *"the solo side keeps his race quadrant. Yes, plus he also gets the other empty quadrant to play on.
 * It's only fair"* — B-29).
 *
 * > *"if it's a one player, he will always be in the northwest corner. Same as player one"*; a TWO-player
 * > team always takes a whole SIDE *"because the image is generated that way"* — owner, R195-T2
 * > *"it doesn't matter where the host is in the lobby … it should be modular enough to be able to move
 * > places."* — owner, R195-T3
 *
 * ⭐ WHY THE MAP RIDES IN THE LAYOUT AND NOT IN A NEW FIELD. The seat stays the player's IDENTITY (the host
 * is seat 0 on the wire, in migration and in every intent stamp); only WHERE ON THE BOARD that seat stands
 * moves. Every zone question in the game is already asked as `f(seat, world.layout)` — the castle anchor,
 * build legality, the scorch zone, the walls, the backdrops — so carrying the map inside the one hashed,
 * wire-carried value those calls already receive re-routes every one of them with no call-site change and
 * no fourth site to forget. A plain `'QUADRANTS_4P'` is the identity map (zone z ↔ seat z), so a
 * free-for-all — and any team game whose arrangement happens to BE the identity — is byte-identical.
 *
 * ⚠ SERIALIZED + HASHED (`ly${layout}`): a new value is a protocol bump (S195 — reported to the merge owner).
 */
export type TeamQuadLayout = `QUADRANTS_4P:${string}`;

/** The geometric board under a layout — what the anchors, the walls and the art key on. */
export function baseLayout(layout: ZoneLayout): 'PITCH_2P' | 'QUADRANTS_4P' {
  return layout === 'PITCH_2P' ? 'PITCH_2P' : 'QUADRANTS_4P';
}

const TEAM_QUAD_RE = /^QUADRANTS_4P:[0-3-]{4}$/;

/** ⭐ S195 — a value a snapshot may carry as `layout` (the reader refuses anything else). */
export function isZoneLayout(v: unknown): v is ZoneLayout {
  if (v === 'PITCH_2P' || v === 'QUADRANTS_4P') return true;
  if (typeof v !== 'string' || !TEAM_QUAD_RE.test(v)) return false;
  // Every seat that owns anything owns its zones; a digit may repeat (two zones) — nothing else to check.
  return true;
}

const OWNERS_CACHE = new Map<string, readonly (number | null)[]>();
const IDENTITY_2P: readonly (number | null)[] = [0, 1];
const IDENTITY_4P: readonly (number | null)[] = [0, 1, 2, 3];

/**
 * PURE — zone → owning seat (`null` = nobody), for every zone of the board. The plain layouts are the
 * identity (zone z ↔ seat z, the pre-S195 mapping). Memoised per layout string (≤ a few dozen values).
 */
export function zoneOwners(layout: ZoneLayout): readonly (number | null)[] {
  if (layout === 'PITCH_2P') return IDENTITY_2P;
  if (layout === 'QUADRANTS_4P') return IDENTITY_4P;
  let o = OWNERS_CACHE.get(layout);
  if (o === undefined) {
    const body = layout.slice('QUADRANTS_4P:'.length);
    o = Array.from({ length: 4 }, (_, z) => {
      const ch = body[z];
      return ch === undefined || ch === '-' ? null : Number(ch);
    });
    OWNERS_CACHE.set(layout, o);
  }
  return o;
}

/** ⭐ S195 — does `seat` own `zone` on this board? (The 2v1 solo owns two.) */
export function seatOwnsZone(seat: number, zone: number, layout: ZoneLayout): boolean {
  if (!Number.isInteger(seat) || seat < 0) return false;
  const o = zoneOwners(layout);
  return zone >= 0 && zone < o.length && o[zone] === seat;
}

/** ⭐ S195 — which seat owns `zone`? `null` = nobody (the empty quadrant of a 3-seat free-for-all). */
export function seatOfZone(zone: number, layout: ZoneLayout): number | null {
  const o = zoneOwners(layout);
  return zone >= 0 && zone < o.length ? (o[zone] ?? null) : null;
}

/** ⭐ S195 — every zone `seat` owns, ascending (its home first). */
export function zonesOfSeat(seat: number, layout: ZoneLayout): number[] {
  const o = zoneOwners(layout);
  const out: number[] = [];
  for (let z = 0; z < o.length; z++) if (o[z] === seat) out.push(z);
  return out;
}

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
 *   · porch + deposit sit at anchor.y + 42 (⭐ S194 R194-16; was + 74), i.e. y=992 for the bottom keeps,
 *     just above the footer band (FOOTER_TOP_Y 996) — a shape resting there still reaches 17 px into it.
 *     Survivable because S136 P0 deleted the footer plate and its click guard, and the S149/S154 chips
 *     are pinned clear of the porches (`footerBand.test.ts`, `shapeStrip.test.ts`);
 *   · the energy gauge at x[1896,1904] clears both right-hand keeps (max x 1827) — OK.
 */
const ANCHORS: { readonly [K in 'PITCH_2P' | 'QUADRANTS_4P']: readonly Vec2[] } = {
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
  return ANCHORS[baseLayout(layout)].length;
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
  if (layout === 'PITCH_2P' || layout === 'QUADRANTS_4P') return seat;
  // ⭐ S195 — a mapped board: the seat's HOME zone is the lowest zone it owns (`null` = it owns none).
  const o = zoneOwners(layout);
  for (let z = 0; z < o.length; z++) if (o[z] === seat) return z;
  return null;
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
  const a = ANCHORS[baseLayout(layout)][zone] as Vec2;
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

/* ========================================================================== *
 *   ⭐⭐ S182 (owner) — THE CASTLE KEEP-OUT
 * ========================================================================== */

/**
 * ⭐⭐ NOBODY BUILDS ON TOP OF A CASTLE. Owner, S182, from a live two-player match:
 *
 * > *"You can place any tower over the castle. The castle doesn't read anything. Castle should have
 * > an area around it where you can't place anything. At least in the immediate vicinity."*
 *
 * ⚠ **THIS NUMBER IS MINE, NOT HIS** — he ruled the RULE, not the radius. Measured S182 from what
 * the castle actually occupies, all offsets from `castleAnchor`, which is the keep box's centre:
 *
 *   · the SPRITE — `CASTLE_SPRITE_PX` 96, anchored `x: 0.5` / `y: 1` on the box's foot at
 *     `KEEP_H / 2` = 29 — spans x ±48 and y −67…+29, so its farthest corner is
 *     `√(48² + 67²)` = **82.4**;
 *   · the PORCH — `CASTLE_PORCH_SLOTS` 4 at `CASTLE_PORCH_PITCH_X` 30 puts the outer slots at x ±45,
 *     `CASTLE_PORCH_OFFSET_Y` 74 below the anchor, each `CASTLE_PORCH_SLOT_CLEAR_RADIUS` 17 across,
 *     so its farthest point is `√(45² + 74²) + 17` = **103.6**. The porch, not the sprite, is the
 *     castle's true reach — and it is where every gathered shape lands.
 *
 * **104** (that 103.6, rounded up) **+ 17** (one `CASTLE_PORCH_SLOT_CLEAR_RADIUS` of air, the repo's
 * existing "room for one more shape" number) = **121**. Not a round number on purpose: a round one
 * would have no measurement behind it to re-check when the sprite or the porch moves.
 *
 * ⚠ **NO EXISTING CONSTANT FITTED, and each was checked rather than assumed.** `SPAWNER_RADIUS`
 * (125) is the shared quarry and means something else; `AUTO_BOND_RADIUS` (60) is bond reach and is
 * under half the castle's own extent; `TERRITORY_BASE_RADIUS` (60) belongs to the retired influence
 * bubble; `CASTLE_ATTACK_RANGE` (300) is the gun and would blank most of a `QUADRANTS_4P` quadrant.
 *
 * ⚠ A LITERAL, NOT A COMPUTATION. `Math.hypot` is not guaranteed identical across JS engines, and
 * two peers may be on different browsers — see rule 2 in this file's docblock. The arithmetic above
 * is re-derived from those constants in `zones.test.ts` instead, where a drift turns a test RED.
 *
 * ⭐⭐ S191 (owner) — **HALVED: 121 → 61.** *"you can't build … near the castle. Like it takes so
 * much space. Like the no build zone near castle is like way too ridiculous. It needs to be halved.
 * Okay, like the radius where you can't build around the castle."* His number: 121 / 2, rounded UP
 * so the keep-out never shrinks below half. Still a literal (rule 2).
 *
 * ⚠ IT IS NO LONGER THE CASTLE'S REACH, and two things the old 121 covered now sit OUTSIDE it:
 *   · the PORCH (slots 75.5–86.6 px out, all SOUTH of the keep) — see S193 below;
 *   · the top of the castle SPRITE (67 px) and its corners (82.4 px) — a shape may now be built
 *     against the drawn keep's roof and corners. A consequence of his halving, reported, not "fixed".
 * Still inside it: the keep BOX (half-diagonal ≈ 47) and the castle's unit-emit ring
 * (`RACE_UNIT_SPAWN_SPREAD` 46, `raceUnitEmit.ts`) — so units still leave the keep on clear ground.
 *
 * ⭐⭐ S193 P3-1 (owner) — **AND IT IS THE ONLY DISC. THE SAME DISTANCE ON EVERY SIDE.**
 * > *"going down to the south of it look how far i need to be to be able to build … to the right of it
 * > so horizontally i can build pretty close … it should be just as far as the horizontal … like a
 * > radius around it, like a short radius that you can't build, like immediately around it. But
 * > otherwise, you should be able to build like where the right town tower is."*
 * S191 had added a `CASTLE_PORCH_KEEP_OUT_RADIUS` (34) disc on each of the four porch slots, and the
 * porch sits at anchor.y + 74 — so the keep-out was a 61 disc with a lobe reaching **108** px SOUTH.
 * Measured S193 on the 4P board through the real `stampRefusalAt`: a laser turret needed a 73.9 px gap
 * east (the outer slot's disc caught its tall box) and **108.0** south; a single shape 61 east, **105**
 * south. Those discs are GONE from the keep-out. The porch's protection moved to the two places it is
 * actually about, both uniform: a PULL skips a slot a built shape covers (`firstFreePorchSlot`'s
 * `built` arm, `CASTLE_PORCH_KEEP_OUT_RADIUS`), and a stamp is BLOCKED over a shape resting on the
 * porch (`blueprintLegality` arm 5) — so nothing is ever minted into a tower, nor a tower onto a shape.
 */
export const CASTLE_NO_BUILD_RADIUS = 61;

/** Squared, for the same reason `QUARRY_R2` is — see rule 2 in the file docblock. No sqrt. */
const CASTLE_NO_BUILD_R2 = CASTLE_NO_BUILD_RADIUS * CASTLE_NO_BUILD_RADIUS;

/**
 * ⭐ S191 → S193 — **HOW CLOSE A BUILT SHAPE MAY STAND TO A PORCH SLOT BEFORE THE PORCH STOPS USING IT.**
 * ⚠ MINE (S191's brief default), not his: **34 = 2 × `CASTLE_PORCH_SLOT_CLEAR_RADIUS`** (17) — one 17
 * for the shape the porch puts on the slot and one for the built shape beside it.
 *
 * ⛔ S193 P3-1 — IT IS NO LONGER A BUILD KEEP-OUT. S191 refused building within it of every slot,
 * which is what made the keep-out reach 108 px south and 61 everywhere else (see
 * `CASTLE_NO_BUILD_RADIUS`). It is now read by `castleBank.firstFreePorchSlot`: a slot with a BUILT
 * shape this close is treated as occupied, so a pull never mints a shape into a tower. Building there
 * is legal; the cost lands on the builder (that slot stops receiving pulls). Lever: this one number.
 */
export const CASTLE_PORCH_KEEP_OUT_RADIUS = 2 * CASTLE_PORCH_SLOT_CLEAR_RADIUS;

/**
 * ⭐⭐ S194 R194-16 (owner) — **NOTHING IS BUILT ON THE CASTLE ENTRANCE.**
 * > *"Castle entrance is where the shapes come out. Oh yeah, you should definitely not be able to build
 * > over that. Leave that a little space."*
 *
 * A shape (or any part of a stamp's box) within this radius of ANY castle's porch slot is refused — the
 * second arm of `castleKeepOutHitsBox`, so the host reducer, the drag ghost, the stamp ghost and the bot
 * planner all read it from the one predicate (S148 P2's rule). ⚠ MINE: it is the porch's OWN occupancy
 * radius, `CASTLE_PORCH_SLOT_CLEAR_RADIUS` (17) — "a little space" is exactly the spot a pulled shape
 * would occupy, and a built shape there would be read by the pull as sitting IN the slot. Kept that
 * small on purpose: with the porch row moved to +42 (`CASTLE_PORCH_OFFSET_Y`) its discs reach only
 * 59 px south of the anchor — INSIDE the 61 px disc — so the zone stays the uniform shape he asked for in
 * S193, apart from a lobe round each OUTER slot (±45, +42) that reaches 78.5 px on the SE/SW diagonal.
 * (S191's porch discs reached 108 south; see `CASTLE_NO_BUILD_RADIUS`.)
 *
 * ⚠ The S193 trade still stands beyond it: a shape built 17–34 px from a slot is legal and makes the
 * pull skip that slot (`firstFreePorchSlot`'s `built` arm, `CASTLE_PORCH_KEEP_OUT_RADIUS`).
 */
export const CASTLE_PORCH_BUILD_CLEAR_RADIUS = CASTLE_PORCH_SLOT_CLEAR_RADIUS;
const CASTLE_PORCH_BUILD_CLEAR_R2 = CASTLE_PORCH_BUILD_CLEAR_RADIUS * CASTLE_PORCH_BUILD_CLEAR_RADIUS;

/**
 * PURE — the world position of porch slot `i` under a castle at `anchor`. THE ONE copy of the slot
 * arithmetic: `castleBank.porchSlot` (the pull landing, the occupancy tests) delegates here, so the
 * build refusal and the spot a shape actually lands on cannot drift apart. Integer-exact for the shipped
 * constants ((i − 1.5) × 30 = −45, −15, 15, 45).
 */
export function porchSlotAt(anchor: Vec2, i: number): Vec2 {
  const offset = (i - (CASTLE_PORCH_SLOTS - 1) / 2) * CASTLE_PORCH_PITCH_X;
  return { x: anchor.x + offset, y: anchor.y + CASTLE_PORCH_OFFSET_Y };
}

/** An axis-aligned box in world px. What a blueprint's footprint looks like to this file. */
export interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * ⭐ PURE — does `box` reach inside ANY castle's keep-out disc on this board?
 *
 * ⛔ **THE ONE IMPLEMENTATION OF THE KEEP-OUT, AND THE POINT TEST BELOW IS A DEGENERATE CALL INTO
 * IT.** A blueprint stamp is footprint-aware and a single-shape placement is not, so the rule is
 * asked two ways — and two ways is exactly how this repo's warnings say a rule starts disagreeing
 * with itself. One box-vs-disc core, two entry points.
 *
 * EXACT rather than conservative: the anchor is CLAMPED into the box and the squared distance to
 * that nearest point is compared. A circumradius bound would refuse a wide, flat tower laid
 * alongside a castle that it never actually reaches — the same defect `blueprintExtent` exists to
 * undo one file over.
 *
 * ⚠ EVERY zone's anchor, not just the seat's own. On the shipped boards an enemy keep is deep in
 * enemy ground and already refused by the partition, so this is belt-and-braces today; it is
 * written this way so a future adjacency (R11's 2v2) cannot open a hole nobody re-derives.
 */
export function castleKeepOutHitsBox(box: Box, layout: ZoneLayout): boolean {
  const anchors = ANCHORS[baseLayout(layout)];
  const mapped = layout !== 'PITCH_2P' && layout !== 'QUADRANTS_4P';
  for (let i = 0; i < anchors.length; i++) {
    // ⭐ S195 (audit L6) — on a MAPPED board only an anchor that HOLDS a castle (its owner's home zone) keeps
    // ground clear: the 2v1 solo's extra SW corner has no keep, so its anchor must not refuse his building.
    // The plain boards keep every anchor (byte-identical; their empty corner is nobody's ground anyway).
    if (mapped) {
      const owner = seatOfZone(i, layout);
      if (owner === null || zoneOwner(owner, layout) !== i) continue;
    }
    const a = anchors[i] as Vec2;
    // ⭐⭐ S193 P3-1 — ONE disc, the same radius on every side (see `CASTLE_NO_BUILD_RADIUS`).
    if (boxPointDistSq(box, a.x, a.y) < CASTLE_NO_BUILD_R2) return true;
    // ⭐⭐ S194 R194-16 — AND NOT ON THE ENTRANCE: a small disc on each porch slot (`<=`, the same
    // inclusive edge the porch's own occupancy test uses — a shape that would count as IN the slot).
    for (let k = 0; k < CASTLE_PORCH_SLOTS; k++) {
      const s = porchSlotAt(a, k);
      if (boxPointDistSq(box, s.x, s.y) <= CASTLE_PORCH_BUILD_CLEAR_R2) return true;
    }
  }
  return false;
}

/**
 * PURE — SQUARED distance from `box` to the point `(px, py)`; 0 when the point is inside the box.
 *
 * The one box-vs-disc primitive on the build path: `castleKeepOutHitsBox` asks it about a castle
 * anchor and `blueprintLegality` asks it about the quarry centre. Squared, and clamp-based rather
 * than sqrt-based, for rule 2 in this file's docblock.
 */
export function boxPointDistSq(box: Box, px: number, py: number): number {
  const nx = px < box.minX ? box.minX : px > box.maxX ? box.maxX : px;
  const ny = py < box.minY ? box.minY : py > box.maxY ? box.maxY : py;
  const dx = px - nx;
  const dy = py - ny;
  return dx * dx + dy * dy;
}

/** PURE — is this bare point inside a castle keep-out? The degenerate box; see the note above. */
export function isInsideCastleKeepOut(pos: Vec2, layout: ZoneLayout): boolean {
  return castleKeepOutHitsBox(
    { minX: pos.x, maxX: pos.x, minY: pos.y, maxY: pos.y },
    layout,
  );
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
 *
 * ⭐⭐ S182 — AND THE CASTLE KEEP-OUT IS THE FIRST ARM, because it is true of the point regardless
 * of whose ground it is.
 *
 * ⛔⛔ IT LANDS **HERE**, IN THE PREDICATE THE **REDUCER** READS, AND NOT ONLY IN `controls.ts`.
 * Placement is a reducer: it runs on the host, in the worker sim and in replay, and its output is
 * HASHED. A keep-out that existed only in the client pre-check would let a host and a joiner form
 * different worlds from the same intent — a hash divergence, which is this codebase's worst defect
 * class and is far worse than the cosmetic bug it would have fixed.
 */
export function canBuildAt(pos: Vec2, seat: number, layout: ZoneLayout): boolean {
  if (isInsideCastleKeepOut(pos, layout)) return false;
  const owner = zoneOwner(seat, layout);
  if (owner === null) return false;
  const zone = zoneOf(pos, layout);
  if (zone === null) return false;
  // ⭐ S195 (B-29) — ANY zone the seat owns: the 2v1 solo builds on his corner AND the empty one.
  // On the plain boards this is exactly `zone === owner` (one zone per seat, the identity).
  return zone === owner || seatOwnsZone(seat, zone, layout);
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
export const MAX_SEATS_WITH_GROUND: number = ANCHORS[baseLayout(WIDEST_LAYOUT)].length;
