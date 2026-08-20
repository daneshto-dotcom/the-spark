import { describe, expect, it } from 'vitest';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_TOP_Y,
  GATHERER_DEPOSIT_OFFSET_Y,
  KEEP_H,
  KEEP_W,
  MAX_PLAYERS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import {
  canBuildAt,
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
    // band is drawable and clickable. If a footer control is ever revived, these anchors move up.
    for (const seat of [2, 3]) {
      const a = zoneCastleAnchor(seat, 'QUADRANTS_4P');
      const depositY = a.y + GATHERER_DEPOSIT_OFFSET_Y;
      expect(depositY).toBeGreaterThan(FOOTER_TOP_Y);
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
