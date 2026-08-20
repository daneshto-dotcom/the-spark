/**
 * SPARK — S149 P3: the border walls.
 *
 * *"there are no walls it seems or player zones, players can build wherever"* — owner playtest.
 *
 * P1 made the partition mechanically real; this pins the walls that make it VISIBLE and physical:
 * up through BUILD, down for the FIGHT (R5), running from the quarry rim outward (Q6), and
 * derived entirely from `(layout, matchPhase)` so they carry no state that could desync.
 */

import { describe, expect, it } from 'vitest';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PHASE_DURATION_TICKS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { tintForZone } from '../render/wallRenderer.ts';
import { asPlayerId } from '../types.ts';
import { clampAcrossWalls, crossesWall, wallSegments, wallsAreUp } from './walls.ts';
import { makeWorld, type World } from './world.ts';
import { zoneCount, zoneOf, type ZoneLayout } from './zones.ts';
import { enemyZonePoint, ownZonePoint, QUARRY_POINT } from './zones.fixtures.ts';

const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];

function worldOn(layout: ZoneLayout): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.layout = layout;
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = PHASE_DURATION_TICKS;
  return w;
}

describe('S149 P3 — the walls exist during BUILD and are gone during FIGHT (R5)', () => {
  it('wallsAreUp follows the phase, and nothing else', () => {
    const w = worldOn('PITCH_2P');
    expect(wallsAreUp(w)).toBe(true);
    w.matchPhase = 'FIGHT';
    expect(wallsAreUp(w)).toBe(false);
  });

  it('carries NO state of its own — the segments depend only on the layout', () => {
    // The whole reason walls cannot desync: two calls on two different worlds that merely agree
    // about `layout` produce identical geometry. There is nothing for a host and joiner to
    // disagree about, because there is nothing stored.
    for (const layout of LAYOUTS) {
      expect(wallSegments(layout)).toEqual(wallSegments(layout));
    }
  });
});

describe('S149 P3 — the geometry sits on the real borders and stops at the quarry rim (Q6)', () => {
  it('PITCH_2P has two runs — above and below the quarry', () => {
    const segs = wallSegments('PITCH_2P');
    expect(segs).toHaveLength(2);
    for (const s of segs) {
      expect(s.a.x).toBe(CANVAS_WIDTH / 2); // exactly on the split
      expect(s.b.x).toBe(CANVAS_WIDTH / 2);
      expect(s.zoneA).toBe(0);
      expect(s.zoneB).toBe(1);
    }
  });

  it('QUADRANTS_4P has four arms radiating from the rim to the four edges', () => {
    expect(wallSegments('QUADRANTS_4P')).toHaveLength(4);
  });

  for (const layout of LAYOUTS) {
    it(`${layout} — no segment reaches inside the quarry`, () => {
      // The gap is the design (Q6): every zone must reach its own slice of the shared resource
      // without needing a door.
      for (const s of wallSegments(layout)) {
        for (const p of [s.a, s.b]) {
          const d = Math.hypot(p.x - SPAWNER_CENTER_X, p.y - SPAWNER_CENTER_Y);
          expect(d).toBeGreaterThanOrEqual(SPAWNER_RADIUS - 0.001);
        }
      }
    });

    it(`${layout} — every segment stays on the board`, () => {
      for (const s of wallSegments(layout)) {
        for (const p of [s.a, s.b]) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(CANVAS_WIDTH);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(CANVAS_HEIGHT);
        }
      }
    });

    it(`${layout} — every segment separates two DIFFERENT, real zones`, () => {
      for (const s of wallSegments(layout)) {
        expect(s.zoneA).not.toBe(s.zoneB);
        for (const z of [s.zoneA, s.zoneB]) {
          expect(z).toBeGreaterThanOrEqual(0);
          expect(z).toBeLessThan(zoneCount(layout));
        }
      }
    });
  }
});

describe('S149 P3 — the walls block movement between zones while they are up', () => {
  for (const layout of LAYOUTS) {
    for (let s = 0; s < zoneCount(layout); s++) {
      const seat = asPlayerId(s);

      it(`${layout} seat ${s} — a step into another zone is refused`, () => {
        const from = ownZonePoint(seat, layout);
        const to = enemyZonePoint(seat, layout);
        expect(crossesWall(from, to, layout)).toBe(true);
        expect(clampAcrossWalls(from, to, layout, true)).toEqual(from); // held at the wall
      });

      it(`${layout} seat ${s} — a step WITHIN its own zone is allowed`, () => {
        const from = ownZonePoint(seat, layout);
        const to = { x: from.x + 20, y: from.y + 20 };
        expect(crossesWall(from, to, layout)).toBe(false);
        expect(clampAcrossWalls(from, to, layout, true)).toEqual(to);
      });
    }

    it(`${layout} — once the walls DROP, the same crossing is allowed (they are down in FIGHT)`, () => {
      const from = ownZonePoint(asPlayerId(0), layout);
      const to = enemyZonePoint(asPlayerId(0), layout);
      // The predicate still reports a crossing — geometry has not changed…
      expect(crossesWall(from, to, layout)).toBe(true);
      // …but with the walls down the clamp lets it through. This is what makes the FIGHT a fight.
      expect(clampAcrossWalls(from, to, layout, false)).toEqual(to);
    });
  }
});

describe('S149 P3 — ⚠ THE QUARRY IS AN OPEN HUB, and that is recorded rather than hidden', () => {
  // Walls run from the RIM outward (Q6), so there is no wall across the quarry itself. Two honest
  // consequences follow, and both are pinned here so neither is discovered later as a "bug".
  for (const layout of LAYOUTS) {
    it(`${layout} — a gatherer can always reach the shared quarry from its own ground`, () => {
      // This is the INTENDED consequence, and the reason for the gap.
      const from = ownZonePoint(asPlayerId(0), layout);
      expect(crossesWall(from, QUARRY_POINT, layout)).toBe(false);
      expect(clampAcrossWalls(from, QUARRY_POINT, layout, true)).toEqual(QUARRY_POINT);
    });

    it(`${layout} — a unit could ROUTE BETWEEN ZONES through the quarry while the walls are up`, () => {
      // ⚠ THE UNINTENDED-LOOKING CONSEQUENCE OF THE SAME RULE. Zone → quarry is legal, and
      // quarry → other zone is legal, so a two-step path crosses the border without ever
      // crossing a wall. This is a faithful reading of the stated geometry, NOT a shortcut:
      // sealing the centre would need a wall arc across the rim, which is a DESIGN RULING the
      // owner has not made. Pinned so it is a known property with a test naming it, rather than
      // something a future playtest reports as a hole in the walls.
      const a = ownZonePoint(asPlayerId(0), layout);
      const b = enemyZonePoint(asPlayerId(0), layout);
      expect(crossesWall(a, QUARRY_POINT, layout)).toBe(false);
      expect(crossesWall(QUARRY_POINT, b, layout)).toBe(false);
      // …whereas the direct route is blocked, which is what makes this a detour and not a door.
      expect(crossesWall(a, b, layout)).toBe(true);
    });
  }
});

describe('S149 P3 — the walls are drawn in their owners\' colours', () => {
  it('an owned zone takes that player\'s live colour', () => {
    const w = worldOn('PITCH_2P');
    const me = w.players.get(asPlayerId(0));
    expect(me).toBeDefined();
    expect(tintForZone(w, 0)).toBe(me!.color);
  });

  it('an UNOWNED zone falls back to neutral, which is a real case (R2: 3 players, 4 quadrants)', () => {
    const w = worldOn('QUADRANTS_4P');
    // Seat 3 is unseated in a solo world, so its border is drawn neutral rather than crashing or
    // borrowing someone else's colour.
    const tint = tintForZone(w, 3);
    expect(typeof tint).toBe('number');
    expect(tint).not.toBe(w.players.get(asPlayerId(0))?.color);
  });
});

describe('S149 P3 — the walls agree with the partition they are drawn on', () => {
  for (const layout of LAYOUTS) {
    it(`${layout} — points either side of a segment really are in the segment's two zones`, () => {
      // The barrier is derived from `zoneOf`, so it can never drift from the border it is drawn
      // on. This asserts that identity directly, at a sample either side of every segment.
      for (const s of wallSegments(layout)) {
        const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
        const dx = s.b.x - s.a.x;
        const dy = s.b.y - s.a.y;
        const len = Math.hypot(dx, dy);
        const nx = (-dy / len) * 12;
        const ny = (dx / len) * 12;

        const sideA = zoneOf({ x: mid.x + nx, y: mid.y + ny }, layout);
        const sideB = zoneOf({ x: mid.x - nx, y: mid.y - ny }, layout);
        expect(new Set([sideA, sideB])).toEqual(new Set([s.zoneA, s.zoneB]));
      }
    });
  }
});
