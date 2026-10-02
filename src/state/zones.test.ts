import { describe, expect, it } from 'vitest';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CASTLE_PORCH_OFFSET_Y,
  CASTLE_PORCH_PITCH_X,
  CASTLE_PORCH_SLOTS,
  CASTLE_PORCH_SLOT_CLEAR_RADIUS,
  FOOTER_TOP_Y,
  GATHERER_DEPOSIT_OFFSET_Y,
  KEEP_H,
  KEEP_W,
  MAX_PLAYERS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { CASTLE_SPRITE_PX } from '../render/castleFrames.ts';
import { porchSlot } from './castleBank.ts';
import {
  CASTLE_NO_BUILD_RADIUS,
  CASTLE_PORCH_BUILD_CLEAR_RADIUS,
  CASTLE_PORCH_KEEP_OUT_RADIUS,
  canBuildAt,
  isInsideCastleKeepOut,
  layoutForSeatCount,
  MAX_SEATS_WITH_GROUND,
  zoneCastleAnchor,
  zoneCount,
  zoneOf,
  zoneOwner,
  type ZoneLayout,
} from './zones.ts';
import {
  enemyZonePoint,
  nearOwnZonePoint,
  ownZonePoint,
  QUARRY_POINT,
} from './zones.fixtures.ts';

const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];
const SPLIT_X = CANVAS_WIDTH / 2; // 960
const SPLIT_Y = CANVAS_HEIGHT / 2; // 540

describe('S148 P1 — zoneOf is TOTAL', () => {
  /**
   * The partition's whole job is to have no seam. A pixel that belongs to two zones lets a player
   * build somewhere the host and the drag ghost disagree about; a pixel that belongs to none is an
   * unbuildable hole in someone's own ground. `zoneOf` returns exactly one answer, so this sweeps
   * the board and asserts every answer is IN RANGE (or the shared quarry).
   */
  it.each(LAYOUTS)('%s — every pixel on a 10px sweep answers, in range or the quarry', (layout) => {
    const n = zoneCount(layout);
    let quarry = 0;
    let owned = 0;
    for (let x = 0; x <= CANVAS_WIDTH; x += 10) {
      for (let y = 0; y <= CANVAS_HEIGHT; y += 10) {
        const z = zoneOf({ x, y }, layout);
        if (z === null) {
          quarry++;
          continue;
        }
        expect(Number.isInteger(z)).toBe(true);
        expect(z).toBeGreaterThanOrEqual(0);
        expect(z).toBeLessThan(n);
        owned++;
      }
    }
    // Anti-vacuity: the sweep must actually have covered both kinds of ground, or the assertions
    // above would pass on an empty board. (The S147 lesson — every negative needs a positive control.)
    expect(quarry).toBeGreaterThan(0);
    expect(owned).toBeGreaterThan(1000);
  });

  it.each(LAYOUTS)('%s — every zone index is actually reachable', (layout) => {
    const seen = new Set<number>();
    for (let x = 0; x <= CANVAS_WIDTH; x += 10) {
      for (let y = 0; y <= CANVAS_HEIGHT; y += 10) {
        const z = zoneOf({ x, y }, layout);
        if (z !== null) seen.add(z);
      }
    }
    expect([...seen].sort()).toEqual(Array.from({ length: zoneCount(layout) }, (_, i) => i));
  });
});

describe('S148 P1 — the borders, stated once and held', () => {
  // The convention: a point exactly ON a split belongs to the HIGHER-indexed side; a point exactly
  // on the quarry rim belongs to a zone, not the quarry. These pin that convention so a later
  // refactor cannot flip it silently — a flip would move every border by one pixel.
  it('PITCH_2P — the vertical split at x=960', () => {
    const y = 100; // clear of the quarry
    expect(zoneOf({ x: SPLIT_X - 1, y }, 'PITCH_2P')).toBe(0);
    expect(zoneOf({ x: SPLIT_X, y }, 'PITCH_2P')).toBe(1);
  });

  it('QUADRANTS_4P — the cross split, in clock order (R2)', () => {
    const off = 400; // far enough from centre to clear the quarry on both axes
    expect(zoneOf({ x: SPLIT_X - off, y: SPLIT_Y - off }, 'QUADRANTS_4P')).toBe(0); // top-left
    expect(zoneOf({ x: SPLIT_X + off, y: SPLIT_Y - off }, 'QUADRANTS_4P')).toBe(1); // top-right
    expect(zoneOf({ x: SPLIT_X + off, y: SPLIT_Y + off }, 'QUADRANTS_4P')).toBe(2); // bottom-right
    expect(zoneOf({ x: SPLIT_X - off, y: SPLIT_Y + off }, 'QUADRANTS_4P')).toBe(3); // bottom-left
  });

  it.each(LAYOUTS)('%s — dead centre is the QUARRY, and belongs to nobody', (layout) => {
    expect(zoneOf({ x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, layout)).toBeNull();
  });

  it.each(LAYOUTS)('%s — the quarry rim is a zone; one pixel inside it is not', (layout) => {
    // Strictly inside -> quarry. On the rim -> a zone.
    expect(zoneOf({ x: SPAWNER_CENTER_X + SPAWNER_RADIUS - 1, y: SPAWNER_CENTER_Y }, layout)).toBeNull();
    expect(zoneOf({ x: SPAWNER_CENTER_X + SPAWNER_RADIUS, y: SPAWNER_CENTER_Y }, layout)).not.toBeNull();
  });
});

describe('S148 P1 — seats, zones and anchors line up', () => {
  it.each(LAYOUTS)('%s — every seat owns a DISTINCT zone', (layout) => {
    const owned = new Set<number>();
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      const z = zoneOwner(seat, layout);
      expect(z).not.toBeNull();
      owned.add(z as number);
    }
    expect(owned.size).toBe(zoneCount(layout));
  });

  it.each(LAYOUTS)('%s — a seat with no ground owns NO zone and can build NOWHERE', (layout) => {
    // Fails CLOSED. A modulo would make this seat a silent co-owner of zone 0 — see zones.ts.
    const orphan = zoneCount(layout);
    expect(zoneOwner(orphan, layout)).toBeNull();
    expect(canBuildAt({ x: 200, y: 200 }, orphan, layout)).toBe(false);
    expect(zoneOwner(-1, layout)).toBeNull();
  });

  it.each(LAYOUTS)('%s — each castle anchor sits INSIDE its own zone', (layout) => {
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      const a = zoneCastleAnchor(seat, layout);
      expect(zoneOf(a, layout)).toBe(zoneOwner(seat, layout));
    }
  });

  it.each(LAYOUTS)('%s — anchors are fresh objects, never a shared reference', (layout) => {
    const a = zoneCastleAnchor(0, layout);
    const b = zoneCastleAnchor(0, layout);
    expect(a).not.toBe(b);
    a.x = -9999;
    expect(zoneCastleAnchor(0, layout).x).not.toBe(-9999);
  });

  it('MAX_PLAYERS never exceeds the widest board — a seated player always has ground', () => {
    // Cannot be expressed in the type system (array .length is `number`), so it is asserted here.
    // R41 moved MAX_PLAYERS 6 -> 4 once already; this is the tripwire if it moves again.
    expect(MAX_PLAYERS).toBeLessThanOrEqual(MAX_SEATS_WITH_GROUND);
  });

  it('R2 — no 3-player map: three seats play the quadrant board with one quadrant empty', () => {
    expect(layoutForSeatCount(1)).toBe('PITCH_2P');
    expect(layoutForSeatCount(2)).toBe('PITCH_2P');
    expect(layoutForSeatCount(3)).toBe('QUADRANTS_4P');
    expect(layoutForSeatCount(4)).toBe('QUADRANTS_4P');
  });
});

describe('S148 P1 — canBuildAt: one pixel decides it', () => {
  it('PITCH_2P — one pixel inside your zone is legal, one pixel across the border is not', () => {
    const y = 100;
    expect(canBuildAt({ x: SPLIT_X - 1, y }, 0, 'PITCH_2P')).toBe(true);
    expect(canBuildAt({ x: SPLIT_X, y }, 0, 'PITCH_2P')).toBe(false);
    expect(canBuildAt({ x: SPLIT_X, y }, 1, 'PITCH_2P')).toBe(true);
    expect(canBuildAt({ x: SPLIT_X - 1, y }, 1, 'PITCH_2P')).toBe(false);
  });

  it('QUADRANTS_4P — the corner where all four zones meet resolves for exactly one seat', () => {
    // Far enough out on the diagonal to clear the quarry, then one pixel either side of both splits.
    const d = 400;
    const pts: Array<[number, number, number]> = [
      [SPLIT_X - d, SPLIT_Y - d, 0],
      [SPLIT_X + d, SPLIT_Y - d, 1],
      [SPLIT_X + d, SPLIT_Y + d, 2],
      [SPLIT_X - d, SPLIT_Y + d, 3],
    ];
    for (const [x, y, ownerSeat] of pts) {
      for (let seat = 0; seat < 4; seat++) {
        expect(canBuildAt({ x, y }, seat, 'QUADRANTS_4P')).toBe(seat === ownerSeat);
      }
    }
  });

  it.each(LAYOUTS)('%s — NOBODY may build in the shared quarry (blueprint Q6)', (layout) => {
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      expect(canBuildAt({ x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, seat, layout)).toBe(false);
    }
  });
});

/**
 * S148 A.0 delta D5 — THE HUD GEOMETRY THE ANCHOR CHECK MISSED.
 *
 * "The keep boxes fit inside 1920x1080" was the only clearance ever verified. Three dependent
 * geometries were not, and one of them clears by a SINGLE PIXEL. These assertions exist so that
 * neither side of that pixel can move without a red test.
 */
describe('S148 P1 — the anchors clear the HUD, and one of them barely', () => {
  // Mirrors of ui.ts's private layout constants. Duplicated deliberately, with this test as the
  // canary: if ui.ts moves the bar, this fails and names the collision (the nplayerSeating.test.ts
  // precedent — a duplicated constant is safe only when something fails on drift).
  const PROGRESS_X = 12;
  const PROGRESS_WIDTH = 80;
  const PROGRESS_Y_TOP = FOOTER_TOP_Y - 76;
  const PROGRESS_Y_BOTTOM = FOOTER_TOP_Y - 36;

  it.each(LAYOUTS)('%s — every keep BOX is fully inside the canvas', (layout) => {
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      const a = zoneCastleAnchor(seat, layout);
      expect(a.x - KEEP_W / 2).toBeGreaterThanOrEqual(0);
      expect(a.x + KEEP_W / 2).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(a.y - KEEP_H / 2).toBeGreaterThanOrEqual(0);
      expect(a.y + KEEP_H / 2).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });

  it('QUADRANTS_4P — the bottom-left keep clears the score progress bar (by 1px, measured)', () => {
    const a = zoneCastleAnchor(3, 'QUADRANTS_4P'); // bottom-left
    const keepLeft = a.x - KEEP_W / 2;
    const keepTop = a.y - KEEP_H / 2;
    const keepBottom = a.y + KEEP_H / 2;

    // They DO overlap vertically — the whole clearance is horizontal.
    expect(keepTop).toBeLessThan(PROGRESS_Y_BOTTOM);
    expect(keepBottom).toBeGreaterThan(PROGRESS_Y_TOP);

    // ...and horizontally they miss. This is the entire margin: 93 vs 92.
    const barRight = PROGRESS_X + PROGRESS_WIDTH;
    expect(keepLeft).toBeGreaterThan(barRight);
    expect(keepLeft - barRight).toBe(1);
  });

  it('QUADRANTS_4P — the bottom keeps deposit below the footer line, which is only safe while the footer is empty', () => {
    // S136 P0 deleted the footer plate AND its click guard, so a deposit/porch point inside the
    // band is drawable and clickable.
    //
    // ⭐ S149 P4 — A FOOTER CONTROL HAS NOW BEEN REVIVED (R36), AND THESE ANCHORS DID NOT MOVE.
    // The prose here used to end "If a footer control is ever revived, these anchors move up." That
    // turned out to be one solution rather than the requirement: the actual invariant is that no
    // CHIP may overlap a porch, and the band satisfies it by keeping its chips CENTRED (x ≈ 700 →
    // 1220) instead of by relocating two shipped castle anchors and every gatherer spawn, deposit
    // and hit-test derived from them. The clearance is now an ASSERTION rather than a warning —
    // see "THE CHIPS CLEAR THE CASTLE PORCHES" in `render/footerBand.test.ts`, which also pins that
    // the collision is real so the check cannot quietly become vacuous.
    for (const seat of [2, 3]) {
      const a = zoneCastleAnchor(seat, 'QUADRANTS_4P');
      const depositY = a.y + GATHERER_DEPOSIT_OFFSET_Y;
      // ⭐ S194 R194-16 — the porch row moved 74 → 42 (right under the castle): the point is now just
      // ABOVE the footer line, but a shape resting there still reaches into the band (its slot disc).
      expect(depositY).toBeLessThan(FOOTER_TOP_Y);
      expect(depositY + CASTLE_PORCH_SLOT_CLEAR_RADIUS).toBeGreaterThan(FOOTER_TOP_Y);
      expect(depositY).toBeLessThan(CANVAS_HEIGHT); // still on the board
    }
  });
});

/**
 * S149 P1 — THE FIXTURES THAT REPAIR THE 17 BROKEN TESTS ARE THEMSELVES PROVEN HERE.
 *
 * `zones.fixtures.ts` exists so eight test files stop hardcoding board coordinates. That only
 * helps if the fixtures are actually legal — a fixture that quietly sat in the quarry would turn
 * 17 honest failures into 17 tests passing for the wrong reason, which is strictly worse than the
 * failures. So every guarantee the fixture docblock claims is asserted below, on every board, for
 * every seat.
 */
describe('S149 P1 — zone fixtures are legal on every board, for every seat', () => {
  for (const layout of LAYOUTS) {
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      it(`${layout} seat ${seat} — ownZonePoint is buildable by its own seat`, () => {
        expect(canBuildAt(ownZonePoint(seat, layout), seat, layout)).toBe(true);
      });

      it(`${layout} seat ${seat} — ownZonePoint sits in the seat's OWN zone, not merely a legal one`, () => {
        expect(zoneOf(ownZonePoint(seat, layout), layout)).toBe(zoneOwner(seat, layout));
      });

      it(`${layout} seat ${seat} — ownZonePoint clears the quarry with real margin`, () => {
        const p = ownZonePoint(seat, layout);
        const dx = p.x - SPAWNER_CENTER_X;
        const dy = p.y - SPAWNER_CENTER_Y;
        // Not just outside — outside by more than the radius again, so a test that nudges a
        // fixture by a bond radius cannot silently fall in.
        expect(Math.hypot(dx, dy)).toBeGreaterThan(SPAWNER_RADIUS * 2);
      });

      it(`${layout} seat ${seat} — ownZonePoint is on the board`, () => {
        const p = ownZonePoint(seat, layout);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(CANVAS_WIDTH);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(CANVAS_HEIGHT);
      });

      it(`${layout} seat ${seat} — ownZonePoint is NOT the castle anchor (it would collide with the keep)`, () => {
        const p = ownZonePoint(seat, layout);
        const a = zoneCastleAnchor(seat, layout);
        expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeGreaterThan(KEEP_W);
      });

      it(`${layout} seat ${seat} — enemyZonePoint is REFUSED to this seat (the positive control)`, () => {
        expect(canBuildAt(enemyZonePoint(seat, layout), seat, layout)).toBe(false);
      });

      it(`${layout} seat ${seat} — the quarry is refused (the other positive control)`, () => {
        expect(canBuildAt(QUARRY_POINT, seat, layout)).toBe(false);
      });

      it(`${layout} seat ${seat} — a bond-radius nudge in any direction stays legal`, () => {
        // The reason `nearOwnZonePoint` is safe for the auto-bond tests that need two points
        // close together. 60 px is comfortably above AUTO_BOND_RADIUS' working range.
        for (const [dx, dy] of [[60, 0], [-60, 0], [0, 60], [0, -60]] as const) {
          expect(canBuildAt(nearOwnZonePoint(seat, layout, dx, dy), seat, layout)).toBe(true);
        }
      });
    }
  }

  it('enemyZonePoint never coincides with ownZonePoint on any board', () => {
    for (const layout of LAYOUTS) {
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const own = ownZonePoint(seat, layout);
        const foe = enemyZonePoint(seat, layout);
        expect(own.x === foe.x && own.y === foe.y).toBe(false);
      }
    }
  });
});

/* ========================================================================== *
 *   ⭐⭐ S182 (owner) — THE CASTLE KEEP-OUT
 * ========================================================================== */

/**
 * > *"You can place any tower over the castle. The castle doesn't read anything. Castle should have
 * > an area around it where you can't place anything. At least in the immediate vicinity."*
 *
 * ⛔ `CASTLE_NO_BUILD_RADIUS` IS A LITERAL IN `zones.ts` BY DESIGN — `Math.hypot` is not guaranteed
 * identical across JS engines and two peers may be on different browsers, which is rule 2 of that
 * file's docblock. The arithmetic behind the literal therefore lives HERE, re-derived from the
 * shipped constants, so a sprite resize or a porch retune turns this RED instead of silently
 * shrinking the keep-out under the castle it is supposed to protect.
 */
describe('S182 → S191 — CASTLE_NO_BUILD_RADIUS: HIS halving, and what it no longer covers', () => {
  /** The outermost porch slot's offset from the anchor: slots fan symmetrically about the gate. */
  const outerPorchDx = ((CASTLE_PORCH_SLOTS - 1) / 2) * CASTLE_PORCH_PITCH_X;
  /** S182's measured radius: the porch reach (104, rounded up) + one slot clearance of air. */
  /** ⭐ S194 — S182 measured against the porch row of ITS day (74); R194-16 moved the row to 42. */
  const S182_PORCH_OFFSET_Y = 74;
  const S182_RADIUS = Math.ceil(Math.hypot(outerPorchDx, S182_PORCH_OFFSET_Y) + CASTLE_PORCH_SLOT_CLEAR_RADIUS)
    + CASTLE_PORCH_SLOT_CLEAR_RADIUS;

  it('⭐⭐ S191 — it is the S182 radius HALVED, rounded up ("It needs to be halved")', () => {
    expect(S182_RADIUS).toBe(121); // anti-vacuity: the derivation still reproduces S182's number
    expect(CASTLE_NO_BUILD_RADIUS).toBe(Math.ceil(S182_RADIUS / 2));
  });

  it('⭐⭐ S193 P3-1 → S194 R194-16 re-pin — the 61 disc on every side, PLUS a small disc on each porch slot', () => {
    // Was "S191 re-pin — each slot carries its own clear disc". Those discs sat at anchor.y + 74 and made
    // the keep-out reach 108 px SOUTH against 61 everywhere else — the owner's S193 report. Now: 32
    // directions, every seat, every board, 1 px either side of the radius — the same verdict.
    // ⭐ S194 R194-16 (owner: *"you should definitely not be able to build over that. Leave that a little
    // space"*) — each porch slot carries a CASTLE_PORCH_BUILD_CLEAR_RADIUS (17) disc again, but the row now
    // sits at +42, so those discs add only a small lobe to the 61 disc. Exactly the union, nothing more:
    const inPorchDisc = (p: { x: number; y: number }, seat: number, layout: ZoneLayout): boolean => {
      for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
        const sl = porchSlot(seat, i, layout);
        if ((p.x - sl.x) ** 2 + (p.y - sl.y) ** 2 <= CASTLE_PORCH_BUILD_CLEAR_RADIUS ** 2) return true;
      }
      return false;
    };
    let lobed = 0;
    let total = 0;
    for (const layout of LAYOUTS) {
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = zoneCastleAnchor(seat, layout);
        for (let k = 0; k < 32; k++) {
          const th = (k / 32) * 2 * Math.PI;
          const at = (d: number) => ({ x: a.x + Math.cos(th) * d, y: a.y + Math.sin(th) * d });
          expect(isInsideCastleKeepOut(at(CASTLE_NO_BUILD_RADIUS - 1), layout), `${layout} ${seat} dir ${k}`).toBe(true);
          const out = at(CASTLE_NO_BUILD_RADIUS + 1);
          const expected = inPorchDisc(out, seat, layout);
          total++;
          if (expected) lobed++;
          expect(isInsideCastleKeepOut(out, layout), `${layout} ${seat} dir ${k}`).toBe(expected);
        }
        for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
          expect(isInsideCastleKeepOut(porchSlot(seat, i, layout), layout), `${layout} seat ${seat} slot ${i}`).toBe(true);
        }
      }
    }
    // anti-vacuity both ways, MEASURED: at 62 px the porch lobe catches exactly 6 of the 32 directions per
    // castle (three round each OUTER slot, SE and SW, ~34°–56° off the horizontal) — the other 26 are the S193 uniform disc.
    expect(lobed).toBeGreaterThan(0);
    expect(lobed / total).toBe(6 / 32);
    // The number survives, with a new job: how close a BUILT shape may stand before a pull skips that slot.
    expect(CASTLE_PORCH_KEEP_OUT_RADIUS).toBe(2 * CASTLE_PORCH_SLOT_CLEAR_RADIUS);
  });

  it('⚠ S191 — the castle SPRITE\'s roof and corners are now OUTSIDE the disc (a consequence, reported)', () => {
    // Was "it covers the castle SPRITE, corner included". Pinned so the consequence of his halving
    // stays visible rather than silently becoming a "bug" someone fixes by re-growing the radius.
    const halfW = CASTLE_SPRITE_PX / 2;
    const up = CASTLE_SPRITE_PX - KEEP_H / 2;
    expect(Math.hypot(halfW, up)).toBeGreaterThan(CASTLE_NO_BUILD_RADIUS);
    expect(up).toBeGreaterThan(CASTLE_NO_BUILD_RADIUS);
  });

  it('the keep BOX is still inside it, on both boards', () => {
    for (const layout of LAYOUTS) {
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = zoneCastleAnchor(seat, layout);
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const corner = { x: a.x + (sx * KEEP_W) / 2, y: a.y + (sy * KEEP_H) / 2 };
          expect(isInsideCastleKeepOut(corner, layout)).toBe(true);
        }
      }
    }
  });
});

describe('S182 — canBuildAt asks the keep-out FIRST, and it is total', () => {
  it.each(LAYOUTS)('%s — no seat may build on ANY castle, its own included', (layout) => {
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      for (let other = 0; other < zoneCount(layout); other++) {
        expect(canBuildAt(zoneCastleAnchor(other, layout), seat, layout)).toBe(false);
      }
    }
  });

  it.each(LAYOUTS)('%s — the boundary decides it, one pixel either side', (layout) => {
    for (let seat = 0; seat < zoneCount(layout); seat++) {
      const a = zoneCastleAnchor(seat, layout);
      // Along the axis pointing INTO the board horizontally (S193: every direction is the same disc —
      // see the uniformity test above). Both boards' anchors are insets from the edge.
      const dir = a.x < CANVAS_WIDTH / 2 ? 1 : -1;
      const at = (d: number) => ({ x: a.x + dir * d, y: a.y });
      expect(isInsideCastleKeepOut(at(CASTLE_NO_BUILD_RADIUS - 1), layout)).toBe(true);
      expect(isInsideCastleKeepOut(at(CASTLE_NO_BUILD_RADIUS), layout)).toBe(false);
      expect(canBuildAt(at(CASTLE_NO_BUILD_RADIUS - 1), seat, layout)).toBe(false);
      expect(canBuildAt(at(CASTLE_NO_BUILD_RADIUS), seat, layout)).toBe(true);
    }
  });

  it.each(LAYOUTS)('%s — ⚠ ANTI-VACUITY: it refuses a keep-out sliver, not the board', (layout) => {
    // A 20 px sweep. The keep-out must account for a SMALL, bounded share of each seat's ground —
    // if it ever swallowed the zone this would catch it, and if it stopped refusing anything at all
    // the count would drop to zero.
    let refusedForCastle = 0;
    let allowed = 0;
    for (let x = 20; x < CANVAS_WIDTH; x += 20) {
      for (let y = 20; y < CANVAS_HEIGHT; y += 20) {
        const p = { x, y };
        if (isInsideCastleKeepOut(p, layout)) refusedForCastle++;
        else if (canBuildAt(p, 0, layout)) allowed++;
      }
    }
    expect(refusedForCastle).toBeGreaterThan(20);
    // S182: ~π·121² px² per anchor ÷ 400 px² per sample ≈ 115 each. S191: π·61² + the porch discs ≈ 50 each. S193: π·61² alone ≈ 29 each.
    expect(refusedForCastle).toBeLessThan(150 * zoneCount(layout));
    expect(allowed).toBeGreaterThan(500);
  });
});

/* ========================================================================== *
 *   ⭐⭐ S194 R194-16 (owner) — THE CASTLE ENTRANCE: CLOSER, AND NOT BUILT ON
 * ========================================================================== */
describe('⭐⭐ S194 R194-16 — the porch build-clearance, and how far the zone reaches', () => {
  /** Farthest refused distance along `th` (radians, 0 = east, π/2 = SOUTH on screen), 0.25 px steps. */
  const reach = (layout: ZoneLayout, seat: number, th: number): number => {
    const a = zoneCastleAnchor(seat, layout);
    let last = 0;
    for (let d = 0; d <= 200; d += 0.25) {
      if (isInsideCastleKeepOut({ x: a.x + Math.cos(th) * d, y: a.y + Math.sin(th) * d }, layout)) last = d;
    }
    return last;
  };

  it("arithmetic: the clearance is the porch's own occupancy radius, and the outer lobe is |(45,42)| + 17", () => {
    expect(CASTLE_PORCH_BUILD_CLEAR_RADIUS).toBe(CASTLE_PORCH_SLOT_CLEAR_RADIUS);
    const outerDx = ((CASTLE_PORCH_SLOTS - 1) / 2) * CASTLE_PORCH_PITCH_X;
    expect(outerDx).toBe(45);
    expect(CASTLE_PORCH_OFFSET_Y).toBe(42);
    // the farthest refused point: 61.55 + 17 = 78.55, on the SE/SW diagonal through the outer slot
    expect(Math.hypot(outerDx, CASTLE_PORCH_OFFSET_Y) + CASTLE_PORCH_BUILD_CLEAR_RADIUS).toBeCloseTo(78.55, 2);
    // the row's own southern reach, 42 + 17 = 59, is INSIDE the 61 disc
    expect(CASTLE_PORCH_OFFSET_Y + CASTLE_PORCH_BUILD_CLEAR_RADIUS).toBeLessThan(CASTLE_NO_BUILD_RADIUS);
  });

  it('REACH (measured): south = east = 61 (the S193 disc kept); the only bulge is the outer-slot lobe, ≤ 78.6', () => {
    for (const layout of LAYOUTS) {
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const east = reach(layout, seat, 0);
        expect(east).toBeLessThan(CASTLE_NO_BUILD_RADIUS);
        expect(east).toBeGreaterThanOrEqual(CASTLE_NO_BUILD_RADIUS - 0.25);
        expect(reach(layout, seat, Math.PI / 2)).toBe(east); // south == east: no southern stretch
        let max = 0;
        for (let k = 0; k < 360; k++) max = Math.max(max, reach(layout, seat, (k / 360) * 2 * Math.PI));
        expect(max).toBeGreaterThan(75);
        expect(max).toBeLessThanOrEqual(78.6);
      }
    }
  });

  it('a point ON a slot, and 16 px below it, is refused; 18 px below it is legal again (negative)', () => {
    for (const layout of LAYOUTS) {
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
          const sl = porchSlot(seat, i, layout);
          expect(isInsideCastleKeepOut(sl, layout)).toBe(true);
          expect(isInsideCastleKeepOut({ x: sl.x, y: sl.y + 16 }, layout)).toBe(true);
          expect(isInsideCastleKeepOut({ x: sl.x, y: sl.y + 18 }, layout)).toBe(false);
        }
      }
    }
  });
});
